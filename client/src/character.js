// 마을 캐릭터: 쇼룸과 같은 주민 모델(createVillager)을 마을 이동·애니메이션에 연결한다
import * as THREE from 'three';
import { ANIM, COLORS, TOOLS } from '../../shared/world.js';
import { blobGeometry, curveDrop } from './materials.js';
import { makeLabel } from './label.js';
import { createVillager, PRESETS } from './villager/villager.js';
import { ACTIONS } from './villager/actions.js';
import { syncToon } from './villager/toon.js';

// 주민 모델은 키 약 1.0 → 예전 캐릭터(약 1.7)와 같은 크기로
const SCALE = 1.7;
const OUTLINE_SCALE = 0.65;
const LABEL_Y = 2.0;
export const HAIR_COLORS = ['#3a2a22', '#a65a2e', '#e4b660', '#6b4a32', '#2f2622', '#d9604a', '#5a3d2b', '#c99a5b'];
const LOOKS = [
  { base: 'boy', hair: 'side' },
  { base: 'girl', hair: 'bob' },
  { base: 'boy', hair: 'short' },
  { base: 'girl', hair: 'pony' },
];
// 서버에는 색 번호만 있으므로, 색 번호로 기본 모습을 정하고 꾸민 값(look)이 있으면 덮어쓴다 (누가 봐도 같은 모습)
export function lookFor(colorIndex, look = {}) {
  const i = colorIndex % COLORS.length;
  const def = LOOKS[i % LOOKS.length];
  const { base = def.base, ...rest } = look;
  return {
    ...PRESETS[base],
    hair: def.hair,
    hairColor: HAIR_COLORS[i % HAIR_COLORS.length],
    top: `#${COLORS[i].toString(16).padStart(6, '0')}`,
    crown: false,
    backpack: false,
    ...rest,
  };
}

// 발밑 그림자: 몸 전체를 둥근 지평선만큼 내리므로, 셰이더로 한 번 더 내리지 않는 재질을 쓴다
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x2a3b1a, transparent: true, opacity: 0.18, depthWrite: false });

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

const BASE = { [ANIM.IDLE]: 'idle', [ANIM.WALK]: 'walk', [ANIM.RUN]: 'run' };
// 잠깐 하는 동작: 번호 → 주민 액션 이름. 길이는 일회성은 액션 길이, 반복형은 정해 둔 시간
const ACTS = {
  [ANIM.WAVE]: 'wave', [ANIM.JUMP]: 'jump', [ANIM.CHEER]: 'cheer', [ANIM.SURPRISE]: 'hit', [ANIM.FAINT]: 'faint',
  [ANIM.GATHER]: 'gather', [ANIM.CHOP]: 'chop', [ANIM.FISH]: 'fish',
};
// 반복형은 정해 둔 시간, 쓰러지기는 누운 채 잠시 있다가 일어남
const LOOP_TIME = { wave: 1.6, jump: 1.4, cheer: 1.6, faint: 3.5 };
export const actTime = (a) => LOOP_TIME[ACTS[a]] ?? ACTIONS[ACTS[a]]?.duration ?? 0;

export class Character {
  constructor(name, colorIndex, look = {}) {
    this.root = new THREE.Group();
    this.colorIndex = colorIndex;
    // 여러 명이 함께 보이므로 표정 텍스처는 1/4 해상도, 머리 곡면도 가볍게
    this.villager = createVillager(lookFor(colorIndex, look), { texScale: 0.25, hairSegs: 240 });
    this.villager.root.scale.setScalar(SCALE);
    // 마을 그림체에 맞춘 툰 명암 + 쇼룸보다 35% 얇은 외곽선 (멀리서 내려다봐도 뭉개지지 않게)
    syncToon(this.villager.root, true, OUTLINE_SCALE);
    this.root.add(this.villager.root);

    const shadow = new THREE.Mesh(blobGeometry, shadowMat);
    shadow.position.y = 0.02;
    shadow.renderOrder = 1;
    this.root.add(shadow);

    this.label = makeLabel(name);
    this.label.position.y = LABEL_Y;
    this.root.add(this.label);

    this.anim = ANIM.IDLE;
    this.time = Math.random() * 10;
    this.actLeft = 0;
    this.current = 'idle';
    this.tool = 0;
    this.targetRot = 0;
  }

  get x() { return this.root.position.x; }
  get z() { return this.root.position.z; }

  setPose(x, z, rot) {
    this.root.position.x = x;
    this.root.position.z = z;
    this.targetRot = rot;
  }

  setLook(look) {
    this.villager.set(lookFor(this.colorIndex, look));
    syncToon(this.villager.root, true, OUTLINE_SCALE); // 다시 만든 몸에도 툰·외곽선
  }

  // 손에 든 도구 (평소에도 들고 다님)
  setTool(t) {
    if (t === this.tool || !TOOLS[t]) return;
    this.tool = t;
    if (!ACTS[this.anim] || this.actLeft <= 0) this.villager.equip(TOOLS[t]);
  }

  // 동작 바꾸기 (잠깐 하는 동작으로 바뀌는 순간 한 번 재생)
  setAnim(a) {
    if (a !== this.anim && ACTS[a]) this.actLeft = actTime(a);
    this.anim = a;
  }

  update(dt) {
    this.time += dt;
    this.root.rotation.y = lerpAngle(this.root.rotation.y, this.targetRot, Math.min(1, dt * 14));

    if (this.actLeft > 0) this.actLeft -= dt;
    const want = ACTS[this.anim] && this.actLeft > 0 ? ACTS[this.anim] : BASE[this.anim] ?? 'idle';
    if (want !== this.current) {
      this.current = want;
      this.villager.setAction(want);
      // 동작이 끝나면 원래 들고 있던 도구로 돌아간다
      if (!ACTIONS[want]?.equip && this.villager.state.equipment !== TOOLS[this.tool]) this.villager.equip(TOOLS[this.tool]);
    }
    this.villager.update(this.time, dt);

    // 둥근 지평선: 캐릭터 전체를 땅과 같은 만큼 내린다 (주민 재질에는 휘는 셰이더가 없음)
    this.root.position.y = -curveDrop(this.root.position.x, this.root.position.z);
  }

  dispose() {
    this.villager.dispose();
    this.label.material.map.dispose();
    this.label.material.dispose();
    this.root.removeFromParent();
  }
}
