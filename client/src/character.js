// 마을 캐릭터: 쇼룸과 같은 주민 모델(createVillager)을 마을 이동·애니메이션에 연결한다
import * as THREE from 'three';
import { ANIM, COLORS } from '../../shared/world.js';
import { blobGeometry, curveDrop } from './materials.js';
import { makeLabel } from './label.js';
import { createVillager, PRESETS } from './villager/villager.js';

// 주민 모델은 키 약 1.0 → 예전 캐릭터(약 1.7)와 같은 크기로
const SCALE = 1.7;
const LABEL_Y = 2.0;
const HAIR_COLORS = ['#3a2a22', '#a65a2e', '#e4b660', '#6b4a32', '#2f2622', '#d9604a', '#5a3d2b', '#c99a5b'];
const LOOKS = [
  { base: 'boy', hair: 'side' },
  { base: 'girl', hair: 'bob' },
  { base: 'boy', hair: 'short' },
  { base: 'girl', hair: 'pony' },
];
// 서버에는 색 번호만 있으므로, 색 번호로 상의 색·머리 모양·머리색을 정한다 (누가 봐도 같은 모습)
function lookFor(colorIndex) {
  const i = colorIndex % COLORS.length;
  const look = LOOKS[i % LOOKS.length];
  return {
    ...PRESETS[look.base],
    hair: look.hair,
    hairColor: HAIR_COLORS[i % HAIR_COLORS.length],
    top: `#${COLORS[i].toString(16).padStart(6, '0')}`,
    crown: false,
    backpack: false,
  };
}

// 발밑 그림자: 몸 전체를 둥근 지평선만큼 내리므로, 셰이더로 한 번 더 내리지 않는 재질을 쓴다
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x2a3b1a, transparent: true, opacity: 0.18, depthWrite: false });

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

const ACTION = { [ANIM.IDLE]: 'idle', [ANIM.WALK]: 'walk', [ANIM.RUN]: 'run', [ANIM.WAVE]: 'wave' };

export class Character {
  constructor(name, colorIndex) {
    this.root = new THREE.Group();
    // 여러 명이 함께 보이므로 표정 텍스처는 1/4 해상도, 머리 곡면도 가볍게
    this.villager = createVillager(lookFor(colorIndex), { texScale: 0.25, hairSegs: 240 });
    this.villager.root.scale.setScalar(SCALE);
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
    this.waveTime = 0;
    this.targetRot = 0;
  }

  get x() { return this.root.position.x; }
  get z() { return this.root.position.z; }

  setPose(x, z, rot) {
    this.root.position.x = x;
    this.root.position.z = z;
    this.targetRot = rot;
  }

  wave() { this.waveTime = 1.6; }

  // 동작 바꾸기 (인사로 바뀌는 순간 한 번 손을 흔든다)
  setAnim(a) {
    if (a === ANIM.WAVE && this.anim !== ANIM.WAVE) this.wave();
    this.anim = a;
  }

  update(dt) {
    this.time += dt;
    this.root.rotation.y = lerpAngle(this.root.rotation.y, this.targetRot, Math.min(1, dt * 14));

    if (this.waveTime > 0) this.waveTime -= dt;
    const moving = this.anim === ANIM.WALK || this.anim === ANIM.RUN;
    const action = !moving && this.waveTime > 0 ? 'wave' : ACTION[this.anim] ?? 'idle';
    if (this.villager.state.action !== action) this.villager.setAction(action);
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
