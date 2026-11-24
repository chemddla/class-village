// 마을 캐릭터: 쇼룸과 같은 주민 모델(createVillager)을 마을 이동·애니메이션에 연결한다
import * as THREE from 'three';
import { ANIM, COLORS, TOOLS, WORLD } from '../../shared/world.js';
import { blobGeometry, curveDrop } from './materials.js';
import { makeLabel } from './label.js';
import { createVillager, PRESETS } from './villager/villager.js';
import { ACTIONS, SHAKE, BOBBER } from './villager/actions.js';
import { syncToon } from './villager/toon.js';
import { FX } from './fx.js';

const wrapAngle = (d) => Math.atan2(Math.sin(d), Math.cos(d));
const RUN_SPEED_REF = 5.6;
// 스쿼시 & 스트레치 스프링: 감쇠를 크게 잡아 한 번 살짝 넘쳤다가 바로 자리 잡음 (뽀잉뽀잉 여러 번 튀지 않게)
const SQ_K = 260;
const SQ_C = 24;
const vA = new THREE.Vector3();
const vB = new THREE.Vector3();

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
// 땅에 바짝 붙인다: 높이 띄우면 그림자가 신발 밑창을 덮어 발이 땅에 묻힌 것처럼 보인다 (겹침 깜빡임은 polygonOffset으로)
const shadowMat = new THREE.MeshBasicMaterial({
  color: 0x2a3b1a, transparent: true, opacity: 0.24, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
});

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

const BASE = { [ANIM.IDLE]: 'idle', [ANIM.WALK]: 'walk', [ANIM.RUN]: 'run' };
// 잠깐 하는 동작: 번호 → 주민 액션 이름. 길이는 일회성은 액션 길이, 반복형은 정해 둔 시간
const ACTS = {
  [ANIM.WAVE]: 'wave', [ANIM.JUMP]: 'jump', [ANIM.FLIP]: 'flip', [ANIM.CHEER]: 'cheer', [ANIM.SURPRISE]: 'hit', [ANIM.FAINT]: 'faint',
  [ANIM.GATHER]: 'gather', [ANIM.CHOP]: 'chop', [ANIM.FISH]: 'fish', [ANIM.SMASH]: 'clubSmash', [ANIM.SMASH2]: 'clubSmash2', [ANIM.SMASH3]: 'clubSmash3', [ANIM.SMASH4]: 'clubSmash4',
  [ANIM.CHOP2]: 'chopAgain', [ANIM.CHOP3]: 'chopAgain2', [ANIM.SMASH_AIR]: 'clubAir', [ANIM.SMASH_SLAM]: 'clubSlam', [ANIM.SMASH_DASH]: 'clubDash',
  [ANIM.TREE_SHAKE]: 'treeShake', [ANIM.POCKET]: 'pocket',
  [ANIM.NET_SWING]: 'netSwing', [ANIM.NET_HIGH]: 'netHigh', [ANIM.NET_LOW]: 'netLow', [ANIM.FISH_CAST]: 'fishCast', [ANIM.FISH_WAIT]: 'fishWait', [ANIM.FISH_CATCH]: 'fishCatch', [ANIM.SLASH1]: 'swordSlash1', [ANIM.SLASH2]: 'swordSlash2', [ANIM.SLASH3]: 'swordSlash3', [ANIM.SLASH4]: 'swordSlash4',
  [ANIM.SLASH_AIR]: 'swordAir', [ANIM.SLASH_SLAM]: 'swordSlam', [ANIM.SLASH_DASH]: 'swordDash', [ANIM.ROLL]: 'roll',
  [ANIM.BOW_AIM]: 'bowAim', [ANIM.BOW_SHOT]: 'bowRelease', [ANIM.BOW_AIR]: 'bowAir', [ANIM.BOW_SLAM]: 'bowSlam', [ANIM.BOW_BACK]: 'bowBack',
};
// 앞 동작을 이어받는 동작: 뛰어오른 도중의 공중 공격은 점프가 흐른 만큼 지난 자리에서 시작해 높이가 끊기지 않는다
const CONTINUES = { [ANIM.SMASH_AIR]: ANIM.JUMP, [ANIM.SMASH_SLAM]: ANIM.FLIP, [ANIM.SLASH_AIR]: ANIM.JUMP, [ANIM.SLASH_SLAM]: ANIM.FLIP,
  [ANIM.BOW_AIR]: ANIM.JUMP, [ANIM.BOW_SLAM]: ANIM.FLIP };
// 반복형은 정해 둔 시간, 쓰러지기는 누운 채 잠시 있다가 일어남
// 입질 기다리기는 낚시가 끝날 때까지 (main.js 가 다시 이어 줌), 활 조준은 공격키를 뗄 때까지 (main.js 가 끝낸다)
const LOOP_TIME = { wave: 1.6, cheer: 1.6, faint: 3.5, fishWait: 60, bowAim: 60 };
// 뛰어오른 뒤 발이 땅에 닿는 시각(초): 액션의 높이 곡선이 0이 되는 때 (jump: 진행도 0.78, flip: 0.74)
export const BOW_SLAM_LAND = 0.85; // 활 더블 점프 공격은 쏠 틈을 두려고 조금 더 떠 있다가 내려앉는다
export const LAND = { jump: 0.78 * ACTIONS.jump.duration + 0.015, flip: 0.74 * ACTIONS.flip.duration };
// 과일나무 흔들기: 두 팔을 앞으로 뻗었을 때 손끝이 몸 가운데에서 나가는 거리(m, 게임 크기)와
// 줄기 가운데 높이의 반지름(나무 크기 1일 때). 손끝이 줄기 표면에서 이만큼(m) 앞에 멈추게 한다
const HAND_REACH = 0.2 * SCALE;
const TRUNK_R = 0.205;
const SHAKE_GAP = 0.02;
// 가장 가까운 과일나무 줄기 표면까지 손이 닿도록 내딛을 거리 (주민 몸 크기 단위)
function shakeStep(x, z) {
  let gap = Infinity;
  for (const i of WORLD.fruitTrees) {
    const t = WORLD.trees[i];
    gap = Math.min(gap, Math.hypot(t.x - x, t.z - z) - TRUNK_R * t.s);
  }
  return Math.max(0, (gap - HAND_REACH - SHAKE_GAP) / SCALE);
}

export const actTime = (a) => LOOP_TIME[ACTS[a]] ?? ACTIONS[ACTS[a]]?.duration ?? 0;

export class Character {
  constructor(name, colorIndex, look = {}) {
    this.root = new THREE.Group();
    this.colorIndex = colorIndex;
    // 여러 명이 함께 보이므로 표정 텍스처는 1/4 해상도, 머리·몸 곡면도 가볍게 (hairSegs 는 segScale 이 한 번 더 줄인다)
    this.villager = createVillager(lookFor(colorIndex, look), { texScale: 0.25, hairSegs: 320, segScale: 0.5 });
    this.villager.root.scale.setScalar(SCALE);
    // 마을 그림체에 맞춘 툰 명암 + 쇼룸보다 35% 얇은 외곽선 (멀리서 내려다봐도 뭉개지지 않게)
    syncToon(this.villager.root, true, OUTLINE_SCALE);
    // 도구를 바꿔 쥐면 새로 생긴 도구에도 툰 명암·외곽선을 입힌다 (몸은 처음 한 번이면 되지만 도구는 쥘 때마다 새로 만들어진다)
    this.villager.onChange = () => syncToon(this.villager.root, true, OUTLINE_SCALE);
    // body: 주민 모델을 한 겹 감싸 탄성(늘어남·눌림)·기울기·흔들림을 애니메이션과 따로 얹는다 (발바닥이 축)
    this.body = new THREE.Group();
    this.body.add(this.villager.root);
    this.root.add(this.body);
    this.sq = new THREE.Vector3(1, 1, 1);
    this.sqV = new THREE.Vector3();
    this.speed = 0;
    this.prev = null; // [x, z, 방향]
    this.actSec = 0; // 지금 동작을 시작한 뒤 흐른 초
    this.marks = {}; // 이번 동작에서 이미 한 연출 (도약·착지)
    this.stepT = 0;
    this.stepSide = 0;
    this.shakeT = 0;
    this.trails = {};
    this.netPath = [];

    const shadow = new THREE.Mesh(blobGeometry, shadowMat);
    shadow.position.y = 0.004;
    this.shadow = shadow;
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

  // 화살통에 든 화살 개수 (등의 화살통에 그만큼 보인다)
  setArrows(n) { this.villager.state.arrows = n; }

  // 동작 바꾸기 (잠깐 하는 동작으로 바뀌는 순간 한 번 재생)
  setAnim(a) {
    if (a !== this.anim && ACTS[a]) {
      const from = CONTINUES[a];
      this.startAt = from !== undefined && this.anim === from && this.actLeft > 0 ? actTime(from) - this.actLeft : 0;
      this.actLeft = actTime(a) - this.startAt;
      if (a === ANIM.TREE_SHAKE) this.shakeStep = shakeStep(this.x, this.z);
    }
    this.anim = a;
  }

  update(dt) {
    this.time += dt;
    this.root.rotation.y = lerpAngle(this.root.rotation.y, this.targetRot, Math.min(1, dt * 14));

    if (this.actLeft > 0) this.actLeft -= dt;
    const want = ACTS[this.anim] && this.actLeft > 0 ? ACTS[this.anim] : BASE[this.anim] ?? 'idle';
    if (want !== this.current) {
      this.current = want;
      const at = ACTS[this.anim] === want ? this.startAt ?? 0 : 0;
      this.actSec = at;
      this.marks = at > 0 ? { up: 1 } : {}; // 이어받은 동작은 도약 연출을 다시 하지 않는다
      this.startAt = 0;
      this.villager.setAction(want, (name, n) => Character.onHit?.(this, name, n), undefined, at);
      // 동작이 끝나면 원래 들고 있던 도구로 돌아간다
      if (!ACTIONS[want]?.equip && this.villager.state.equipment !== TOOLS[this.tool]) this.villager.equip(TOOLS[this.tool]);
    }
    SHAKE.step = this.shakeStep ?? 0; // 캐릭터마다 나무까지 거리가 달라서 그릴 때마다 자기 값으로
    BOBBER.dip = this.bobberDip ?? 0;
    this.villager.update(this.time, dt);
    // 발밑에 딱 맞는 크기로, 뛰어오르면 작아져 높이가 읽힌다
    this.shadow.scale.setScalar(0.8 / (1 + this.villager.root.position.y * 0.9));

    // 둥근 지평선: 캐릭터 전체를 땅과 같은 만큼 내린다 (주민 재질에는 휘는 셰이더가 없음)
    this.root.position.y = -curveDrop(this.root.position.x, this.root.position.z);
    this.actSec += dt;
    this.juice(dt);
  }

  // 늘어남·눌림: 정한 비율로 확 바꾼 뒤 스프링으로 통통 튀며 1로 돌아간다
  squash(x, y, z) {
    this.sq.set(x, y, z);
    this.sqV.set(0, 0, 0);
  }

  // 맞았을 때 몸이 부르르
  shake() { this.shakeT = 0.35; }

  // 발밑 땅 높이 (둥근 지평선으로 내려간 만큼)
  get groundY() { return this.root.position.y; }

  trail(key, opts) {
    if (!this.trails[key]) this.trails[key] = FX.trail(opts);
    return this.trails[key];
  }

  footPuff(n, power = 1, ring = false) {
    const r = this.root.rotation.y;
    FX.burst('dust', n, this.x - Math.sin(r) * 0.15, this.groundY + 0.06, this.z - Math.cos(r) * 0.15, {
      floor: this.groundY, ring, power, dir: [-Math.sin(r), -Math.cos(r)], spread: ring ? Math.PI : 0.9,
    });
  }

  // ── 손맛 연출 (매 장면) ──
  juice(dt) {
    const rig = this.villager.rig;
    // 실제로 움직인 빠르기·도는 빠르기 (다른 학생도 똑같이 계산되도록 위치 변화로 잰다)
    let turn = 0;
    if (this.prev && dt > 0) {
      const d = Math.hypot(this.x - this.prev[0], this.z - this.prev[1]) / dt;
      this.speed += (Math.min(d, 9) - this.speed) * Math.min(1, dt * 10);
      turn = wrapAngle(this.root.rotation.y - this.prev[2]) / dt;
    }
    this.prev = [this.x, this.z, this.root.rotation.y];
    const run = Math.min(1, this.speed / RUN_SPEED_REF);

    // 점프: 도약하는 순간 쭉 늘어나고, 착지하는 순간 납작 → 탄성 복원 + 발밑 먼지
    const cur = this.current;
    const M = this.marks;
    if (cur === 'jump' || cur === 'clubAir' || cur === 'swordAir' || cur === 'bowAir') {
      if (!M.up && this.actSec >= 0.07) { M.up = 1; this.squash(0.88, 1.15, 0.88); this.footPuff(5, 0.7); }
      // 발이 땅에 닿는 순간(진행도 0.78 = 0.74초)에 맞춘다: 더 이르면 아직 공중에서 납작해지고 먼지가 난다
      if (!M.down && this.actSec >= LAND.jump) { M.down = 1; this.footPuff(10, 1, true); } // 착지는 먼지만 (몸을 납작하게 튕기면 머리가 출렁인다)
    } else if (cur === 'flip' || cur === 'clubSlam' || cur === 'swordSlam' || cur === 'bowSlam') {
      if (!M.up) { M.up = 1; this.squash(0.86, 1.18, 0.86); FX.burst('dust', 8, this.x, this.groundY + 0.6, this.z, { ring: true, floor: this.groundY, power: 0.8 }); }
      if (!M.down && this.actSec >= (cur === 'bowSlam' ? BOW_SLAM_LAND : LAND.flip)) { M.down = 1; this.footPuff(12, 1.2, true); }
      // 공중제비 잔상: 머리~골반을 잇는 띠가 몸이 돈 자리를 따라 남는다
      if (cur === 'flip' && this.actSec < 0.55) {
        rig.head.getWorldPosition(vB);
        rig.pelvis.getWorldPosition(vA);
        this.trail('flip', { life: 0.16, color: 0xffffff, alpha: 0.55 }).push(this.time, vA, vB);
      }
    }

    // 활 달리기 공격: 뒤돌아 미끄러지는 동안 발밑에서 먼지가 인다
    if (cur === 'bowBack' && this.actSec < 0.55) {
      this.stepT -= dt;
      if (this.stepT <= 0) { this.stepT = 0.07; this.footPuff(2, 0.8); }
    }

    // 달리기: 발이 땅을 찰 때마다 뒤로 먼지 퐁퐁
    if (cur === 'run' && this.speed > 2.2) {
      this.stepT -= dt;
      if (this.stepT <= 0) {
        this.stepT = 0.17;
        this.stepSide ^= 1;
        (this.stepSide ? rig.footR : rig.footL).getWorldPosition(vA);
        const r = this.root.rotation.y;
        FX.burst('dust', 2, vA.x, this.groundY + 0.05, vA.z, { floor: this.groundY, power: 0.6, dir: [-Math.sin(r), -Math.cos(r)], spread: 0.6 });
      }
    } else this.stepT = 0;

    // 회피 구르기: 박차는 순간·일어서는 순간 먼지, 구르는 동안 몸이 돈 자리에 잔상
    if (cur === 'roll') {
      if (!M.up) { M.up = 1; this.footPuff(6, 0.8); }
      if (!M.down && this.actSec >= 0.4) { M.down = 1; this.footPuff(8, 0.9, true); }
      if (this.actSec < 0.42) {
        rig.head.getWorldPosition(vB);
        rig.pelvis.getWorldPosition(vA);
        this.trail('roll', { life: 0.16, color: 0xffffff, alpha: 0.45 }).push(this.time, vA, vB);
      }
    }

    // 휘두르기 궤적: 액션에 trail: [시작, 끝] 이 있으면 그 구간 동안 도구 끝을 따라 부채꼴
    const def = ACTIONS[cur];
    const u = this.villager.progress;
    if (((def?.trail && u >= def.trail[0] && u <= def.trail[1]) || this.villager.trailOn) && toolEnds(rig, vA, vB)) {
      this.trail('swing', { life: 0.15, color: 0xfffbe8, alpha: 0.95 }).push(this.time, vA, vB);
      if (cur?.startsWith('net')) this.netPath.push(vB.toArray()); // 잠자리채: 그물 테(채 끝)가 지나간 길
    }
    if (cur?.startsWith('net') && def?.trail && u < def.trail[0]) this.netPath = [];
    for (const k in this.trails) this.trails[k].update(this.time);

    // 상체 기울기: 달릴수록 앞으로 숙이고, 도는 쪽으로 몸을 눕힘 (공중제비 도약 때는 앞으로 확)
    let leanX = run * 0.16 + (cur === 'flip' ? 0.2 * (1 - Math.min(1, this.actSec / 0.5)) : 0);
    if (ACTS[this.anim] && cur !== 'jump' && cur !== 'flip' && cur !== 'clubDash' && cur !== 'swordDash') leanX = 0; // 생활·공격 동작 중에는 똑바로
    const leanZ = THREE.MathUtils.clamp(-turn * 0.035, -0.22, 0.22) * run;
    const a = 1 - Math.exp(-dt * 10);
    this.body.rotation.x += (leanX - this.body.rotation.x) * a;
    this.body.rotation.z += (leanZ - this.body.rotation.z) * a;

    // 스프링
    this.sqV.addScaledVector(vA.set(1, 1, 1).sub(this.sq), SQ_K * dt).multiplyScalar(Math.exp(-SQ_C * dt));
    this.sq.addScaledVector(this.sqV, dt);
    this.body.scale.copy(this.sq);

    // 맞은 몸 흔들림
    if (this.shakeT > 0) {
      this.shakeT = Math.max(0, this.shakeT - dt);
      const k = this.shakeT / 0.35;
      this.body.position.set(Math.sin(this.time * 80) * 0.06 * k, 0, Math.cos(this.time * 67) * 0.03 * k);
    } else this.body.position.set(0, 0, 0);
  }

  dispose() {
    for (const k in this.trails) this.trails[k].dispose();
    this.villager.dispose();
    this.label.material.map.dispose();
    this.label.material.dispose();
    this.root.removeFromParent();
  }
}

// 오른손 도구의 손잡이 쪽(a)과 머리 끝(b)의 세계 좌표. 도구가 없으면 false
// 끝점은 도구를 처음 볼 때 한 번 재서 기억해 둔다 (소켓 기준 가장 먼 부품까지)
const inv = new THREE.Matrix4();
function toolEnds(rig, a, b) {
  const tool = rig.rightSocket?.children[0];
  if (!tool) return false;
  const sock = rig.rightSocket;
  if (!tool.userData.tipLocal) {
    sock.updateWorldMatrix(true, true);
    inv.copy(sock.matrixWorld).invert();
    let best = null;
    let bestD = 0;
    tool.traverse((m) => {
      if (!m.isMesh || m.userData.isOutline) return;
      m.geometry.computeBoundingSphere();
      const bs = m.geometry.boundingSphere;
      const p = bs.center.clone().applyMatrix4(m.matrixWorld).applyMatrix4(inv);
      const d = p.length();
      if (d > bestD) { bestD = d; best = p.multiplyScalar((d + bs.radius * m.getWorldScale(vA).x / sock.getWorldScale(vB).x) / d); }
    });
    if (!best) return false;
    tool.userData.tipLocal = best;
    tool.userData.baseLocal = best.clone().multiplyScalar(0.15);
  }
  sock.updateWorldMatrix(true, false);
  a.copy(tool.userData.baseLocal).applyMatrix4(sock.matrixWorld);
  b.copy(tool.userData.tipLocal).applyMatrix4(sock.matrixWorld);
  return true;
}
