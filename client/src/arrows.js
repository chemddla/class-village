// 날아가는 화살: 활을 놓는 순간(bowRelease 의 타격 시점) 쏜 사람 손에 든 활에서 바라보는 쪽으로 날아간다.
// 내 화살이든 다른 학생의 화살이든 모두 각자 화면에서 똑같이 날려 보고, 맞았는지는 main.js 가 정한다 (hit 콜백).
import * as THREE from 'three';
import { makeArrow, ARROW_LEN, WAND_TOP } from './villager/equipment.js';
import { syncToon } from './villager/toon.js';
import { curveDrop } from './materials.js';
import { ARROW, BOLT, WORLD, inField, isBlocked } from '../../shared/world.js';

const SCALE = 1.7; // 캐릭터 크기 배율 (character.js 와 같게)
const OUTLINE_SCALE = 0.65;
const GRAVITY = 1.2; // 아주 살짝만 떨어진다 (m/초²): 사거리(20m) 끝까지 거의 땅과 나란히 날아간다
// 시위를 덜 당겨 쏜 화살 (power: 당긴 정도 0~1, 끝까지 당기면 1)
//  느리게 나가고 빨리 떨어져 사거리 안에서 땅에 꽂힌다: 거의 안 당기면 3m 쯤, 반쯤 당기면 6m 쯤, 80% 당기면 13m 쯤
//  쏘는 방향도 덜 당길수록 좌우·위아래로 흔들린다 (끝까지 당기면 겨눈 곳 그대로)
const WEAK = {
  speed: 0.4, // 거의 안 당겼을 때 속도 비율 (끝까지 당기면 1)
  gravity: 9, // 덜 당긴 만큼 더 세게 떨어진다 (m/초², power 0 일 때 더하는 값)
  yaw: 0.2, // 좌우로 흔들리는 최대 각 (라디안, 약 11°)
  pitch: 0.06, // 위아래로 흔들리는 최대 각
};
const STEP = 0.12; // 한 번에 검사하는 거리 (m): 빠른 화살이 작은 몬스터를 건너뛰지 않게
const STUCK_TIME = 3; // 땅·나무에 박힌 채 남아 있는 시간 (초)
// 조준 길잡이 선: 선 굵기(m)·꺾는 간격(m)·활 앞 빈 거리(m)·흐린 정도·최대 마디 수
const GUIDE = { width: 0.025, gap: 0.25, skip: 0.8, opacity: 0.5, max: 100, hitColor: [1, 0.15, 0.1] }; // hitColor: 몬스터에 닿을 때 (빨강)
const MAX = 40; // 한꺼번에 있을 수 있는 화살 수 (넘으면 오래된 것부터 치운다)

const v = new THREE.Vector3();
// 마법 에너지 볼 (시안 bolt.html ④ 에서 도는 빛을 뺀 것): 하얀 심 + 흐린 파란 겉껍질
// 조명 없이도 밝고, 모든 볼이 모양·재질을 나눠 쓴다. +Z 가 날아가는 쪽 (place 가 lookAt 으로 돌린다)
const BOLT_PARTS = [
  [new THREE.SphereGeometry(0.08, 12, 8), new THREE.MeshBasicMaterial({ color: '#f4fdff' })],
  [new THREE.SphereGeometry(0.13, 12, 8), new THREE.MeshBasicMaterial({ color: '#7dd6ff', transparent: true, opacity: 0.5, depthWrite: false })],
];
export function makeBolt() {
  const g = new THREE.Group();
  for (const [geo, m] of BOLT_PARTS) g.add(new THREE.Mesh(geo, m));
  return g;
}

// 볼이 터질 때 (맞았을 때·막혔을 때·사거리 끝): 하얀 번쩍임이 부풀며 사라지고, 파란 껍질이 조금 퍼지며 옅어지고,
// 작은 빛 조각들이 사방으로 튀며 작아진다. update(dt) 가 false 를 돌려주면 끝 (scene 에서 빼는 것은 부른 쪽)
const BURST_TIME = 0.3;
const BURST_R = 0.45; // 껍질이 퍼지는 반지름 (보이는 크기만. 맞는 범위는 BOLT.splash)
const SPARK_GEO = new THREE.SphereGeometry(0.03, 6, 4);
const SPARK_MAT = new THREE.MeshBasicMaterial({ color: '#d8f5ff' });
export function makeBurst(at, size = 1) {
  const g = new THREE.Group();
  g.position.copy(at);
  g.scale.setScalar(size); // 다 모아 쏜 큰 볼은 크게 터진다
  const flash = new THREE.Mesh(BOLT_PARTS[0][0], BOLT_PARTS[0][1].clone()); // 흐려지게 하려고 재질은 터질 때마다 따로
  flash.material.transparent = true;
  const shell = new THREE.Mesh(BOLT_PARTS[1][0], BOLT_PARTS[1][1].clone());
  g.add(flash, shell);
  const sparks = [];
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Mesh(SPARK_GEO, SPARK_MAT);
    s.userData.v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(1 + Math.random() * 0.8);
    g.add(s);
    sparks.push(s);
  }
  let t = 0;
  return {
    obj: g,
    update(dt) {
      t += dt;
      const k = Math.min(1, t / BURST_TIME);
      const out = 1 - (1 - k) ** 3; // 처음에 빠르게 퍼지고 끝에서 느려진다
      flash.scale.setScalar(1 + out * 0.8);
      flash.material.opacity = 1 - Math.min(1, k * 1.6);
      shell.scale.setScalar(1 + out * (BURST_R / 0.13 - 1)); // 껍질 반지름 0.13 → BURST_R
      shell.material.opacity = 0.6 * (1 - k);
      for (const s of sparks) {
        s.position.addScaledVector(s.userData.v, dt);
        s.userData.v.multiplyScalar(1 - 4 * dt); // 공기에 막혀 느려진다
        s.scale.setScalar(1 - k);
      }
      if (k < 1) return true;
      flash.material.dispose();
      shell.material.dispose();
      return false;
    },
  };
}

// 화살이 날아가다 막히는 곳: 마을은 나무·바위·건물 둘레(강·바다 위는 지나간다), 들판은 들판 벽
const blocked = (x, z) => (inField(x, z) ? isBlocked(x, z, 0) : WORLD.colliders.some((c) => Math.hypot(x - c.x, z - c.z) < c.r));

// hit(화살, 쏜 캐릭터, 내 화살인지) → 맞았으면 true (화살은 사라진다)
// onBurst(볼, 터진 자리): 볼이 터질 때 (둘레의 대상을 맞히는 것은 main.js)
export function createArrows(scene, hit, onBurst) {
  const list = [];
  const bursts = [];

  function remove(a, pop = true) {
    scene.remove(a.mesh);
    if (a.bolt && pop) { // 볼은 사라지는 자리(화면에 그린 자리)에서 펑
      const at = a.tip ?? a.mesh.position;
      const b = makeBurst(at, a.size);
      scene.add(b.obj);
      bursts.push(b);
      onBurst?.(a, at);
    }
    if (!a.bolt) a.mesh.traverse((x) => x.geometry?.dispose()); // 재질은 두어 셰이더를 다시 컴파일하지 않게 (equipment.js attachEquipment 참고)
    list.splice(list.indexOf(a), 1);
  }

  // 화면에 놓기: 평평한 땅 기준 자리를 둥근 지평선만큼 내리고, 조금 앞의 (내린) 자리를 바라보게 해 땅의 굽이를 따라 눕힌다
  const ahead = new THREE.Vector3();
  // 볼이 지금 있는 자리: 몸 가운데 줄 위의 자리(a.pos)에, 지팡이 끝에서 벌어진 만큼(a.off)을 BOLT_MERGE 초 동안 부드럽게 줄여 더한다
  // (지팡이 끝에서 출발해 날아가며 자연스럽게 정면 줄로 모인다)
  const BOLT_MERGE = 0.3;
  const boltAt = (a, out) => {
    out.copy(a.pos);
    if (a.off) out.addScaledVector(a.off, 1 - THREE.MathUtils.smoothstep(a.age, 0, BOLT_MERGE));
    return out;
  };
  const here = new THREE.Vector3();
  function place(a) {
    const p = a.bolt ? boltAt(a, here) : a.pos;
    a.mesh.position.copy(p).setY(p.y - curveDrop(p.x, p.z));
    if (a.stuck < 0) a.look = a.vel.clone().normalize();
    ahead.copy(p).addScaledVector(a.look, 0.3);
    ahead.y -= curveDrop(ahead.x, ahead.z);
    a.mesh.lookAt(ahead);
  }

  // 조준 길잡이: 활을 당기는 동안 지금 놓으면 화살이 날아갈 길을 희미하고 가느다란 선으로 보여 준다
  // (덜 당겨 생기는 좌우·위아래 흔들림은 빼고 가운데 길만. 땅·나무·맞을 수 있는 대상에 닿거나 사거리 끝에서 멈춘다)
  // touches(x, y, z): 화살촉이 그 자리(화면에 그린 높이)에 오면 무엇에 맞는지 ('monster'·'person'·null, 맞히지는 않고 묻기만)
  // 몬스터에 닿으면 선 전체가 빨갛게 바뀐다 (지금 놓으면 맞는다는 표시)
  // 선은 땅과 나란히 누운 얇은 띠: 마디마다 날아가는 방향의 옆으로 반 굵기씩 두 점을 놓아 잇는다. 끝으로 갈수록 옅어진다
  const gGeo = new THREE.BufferGeometry();
  const gVerts = new Float32Array((GUIDE.max + 1) * 2 * 3);
  const gCols = new Float32Array((GUIDE.max + 1) * 2 * 4).fill(1);
  const gIdx = [];
  for (let i = 0; i < GUIDE.max; i++) { const a = i * 2; gIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  gGeo.setIndex(gIdx);
  gGeo.setAttribute('position', new THREE.BufferAttribute(gVerts, 3).setUsage(THREE.DynamicDrawUsage));
  gGeo.setAttribute('color', new THREE.BufferAttribute(gCols, 4).setUsage(THREE.DynamicDrawUsage));
  const guide = new THREE.Mesh(gGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: GUIDE.opacity, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true }));
  guide.frustumCulled = false;
  guide.renderOrder = 1;
  guide.visible = false;
  scene.add(guide);
  const gPos = new THREE.Vector3();
  const gVel = new THREE.Vector3();
  const gTip = new THREE.Vector3();
  const pts = []; // 이번 길의 마디 자리 [x, y, z] (화면에 그릴 높이)
  function aimGuide(char, power, touches) {
    if (!char) { guide.visible = false; return; }
    const weak = 1 - Math.min(1, Math.max(0, power));
    const rot = char.targetRot;
    gVel.set(Math.sin(rot), 0, Math.cos(rot));
    const at = char.villager.rig.leftSocket.getWorldPosition(gPos);
    at.y += curveDrop(at.x, at.z);
    gPos.addScaledVector(gVel, -0.15); // shoot 과 같은 출발 자리 (꼬리)
    gVel.multiplyScalar(ARROW.speed * (1 - (1 - WEAK.speed) * weak));
    const gravity = GRAVITY + WEAK.gravity * weak ** 1.5;
    const dt = 1 / 120;
    let flown = 0;
    let next = GUIDE.skip; // 활 바로 앞은 비워 두고 여기서부터 선을 긋는다
    pts.length = 0;
    let target = null;
    while (pts.length <= GUIDE.max) {
      gVel.y -= gravity * dt;
      const step = gVel.length() * dt;
      gPos.addScaledVector(gVel, dt);
      flown += step;
      gTip.copy(gVel).normalize().multiplyScalar(ARROW_LEN * SCALE).add(gPos);
      const drawY = Math.max(0.03, gTip.y) - curveDrop(gTip.x, gTip.z);
      target = touches?.(gTip.x, drawY, gTip.z) ?? null;
      const end = gTip.y <= 0.01 || blocked(gTip.x, gTip.z) || flown > ARROW.range || !!target;
      if (flown >= next || end) {
        pts.push([gTip.x, drawY, gTip.z]);
        next += GUIDE.gap;
      }
      if (end) break;
    }
    const n = pts.length;
    if (n < 2) { guide.visible = false; return; }
    const [r, g, b] = target === 'monster' ? GUIDE.hitColor : [1, 1, 1];
    const half = GUIDE.width / 2;
    // 날아가는 쪽의 옆 방향 (땅과 나란히): 곧게 쏘면 거의 그대로라 한 번만 구한다
    const sx = Math.cos(rot) * half;
    const sz = -Math.sin(rot) * half;
    for (let i = 0; i < n; i++) {
      const [x, y, z] = pts[i];
      gVerts.set([x + sx, y, z + sz, x - sx, y, z - sz], i * 6);
      const a = i === 0 ? 0 : 1 - 0.7 * (i / (n - 1)); // 시작은 스며 나오듯, 끝으로 갈수록 옅게
      gCols.set([r, g, b, a, r, g, b, a], i * 8);
    }
    gGeo.setDrawRange(0, (n - 1) * 6);
    gGeo.attributes.position.needsUpdate = true;
    gGeo.attributes.color.needsUpdate = true;
    guide.visible = true;
  }

  return {
    aimGuide,
    // char: 쏜 캐릭터 (Character), mine: 내 캐릭터가 쐈는지, pitch: 아래로 기울여 쏘는 각 (점프 공격)
    // bolt: 화살 대신 지팡이 끝에서 마법 에너지 볼 (떨어지지 않고 곧게 날아가며, 막히면 꽂히지 않고 사라진다)
    // power: 화살 시위를 당긴 정도 0~1 (WEAK 참고), 볼은 크기 배수 (다 모아 쏘면 BOLT.big: 터지는 둘레도 그만큼)
    shoot(char, mine, pitch = 0, bolt = false, power = 1) {
      const mesh = bolt ? makeBolt() : makeArrow();
      if (bolt) mesh.scale.setScalar(power);
      if (!bolt) {
        mesh.scale.setScalar(SCALE);
        syncToon(mesh, true, OUTLINE_SCALE);
      }
      const weak = bolt ? 0 : 1 - Math.min(1, Math.max(0, power));
      const rot = char.targetRot + (Math.random() * 2 - 1) * WEAK.yaw * weak;
      pitch += (Math.random() * 2 - 1) * WEAK.pitch * weak;
      const dir = new THREE.Vector3(Math.sin(rot) * Math.cos(pitch), -Math.sin(pitch), Math.cos(rot) * Math.cos(pitch));
      // 활 손잡이 자리에서 출발 (화살 꼬리가 원점이므로 반 길이만큼 뒤에서)
      const socket = char.villager.rig[bolt ? 'rightSocket' : 'leftSocket'];
      let tipMesh = null; // 볼은 손에 든 완드 끝마개 자리에서 (equipment.js staff 의 userData.staff.crystal)
      if (bolt) socket.traverse((o) => { tipMesh ??= o.userData.staff?.crystal ?? null; });
      const at = (tipMesh ?? socket).getWorldPosition(new THREE.Vector3());
      // 활 손잡이는 조준선 위에 있다 (equipment.js bowDraw): 메긴 화살 자리 그대로 꼬리가 손잡이 조금 뒤에서 출발
      // 둥근 지평선: 땅과 캐릭터는 화면 가운데에서 멀수록 아래로 내려 그린다(curveDrop). 화살은 '평평한 땅 기준 높이'로 날리고
      // 그릴 때만 그 자리만큼 내린다 → 곧게 쏘아도 땅에서 떠오르지 않고 땅을 따라 날아간다
      const pos = at.clone().addScaledVector(dir, bolt ? (tipMesh ? 0 : WAND_TOP * SCALE) : -0.15); // 완드를 못 찾으면 손에서 완드 길이만큼 앞
      let off = null;
      if (bolt) { // 볼이 날아가는 길은 몸 가운데 줄(정면). 출발은 지팡이 끝이고, 벌어진 만큼(off)은 날아가며 줄어든다 (boltAt)
        const cx = char.x, cz = char.z;
        const ahead = Math.max(0.2, (pos.x - cx) * dir.x + (pos.z - cz) * dir.z);
        off = new THREE.Vector3(pos.x - (cx + dir.x * ahead), 0, pos.z - (cz + dir.z * ahead));
        pos.x -= off.x;
        pos.z -= off.z;
      }
      pos.y += curveDrop(at.x, at.z);
      const a = { mesh, pos, vel: dir.clone().multiplyScalar(bolt ? BOLT.speed : ARROW.speed * (1 - (1 - WEAK.speed) * weak)), dir: dir.clone().setY(0).normalize(), from: char, mine, flown: 0, stuck: -1, bolt, size: bolt ? power : 1, off, age: 0,
        gravity: GRAVITY + WEAK.gravity * weak ** 1.5 }; // 거의 다 당겼으면 조금만 더 떨어진다
      place(a);
      scene.add(mesh);
      list.push(a);
      if (list.length > MAX) remove(list[0], false); // 너무 많아 치우는 것은 조용히
      return a;
    },
    update(dt) {
      for (const b of [...bursts]) if (!b.update(dt)) { scene.remove(b.obj); bursts.splice(bursts.indexOf(b), 1); }
      for (const a of [...list]) {
        if (a.stuck >= 0) {
          a.stuck += dt;
          if (a.stuck > STUCK_TIME) remove(a);
          else place(a); // 화면이 움직이면 땅이 내려가는 정도도 바뀌므로 꽂힌 화살도 매번 다시 놓는다
          continue;
        }
        if (!a.bolt) a.vel.y -= a.gravity * dt;
        const move = a.vel.length() * dt;
        const n = Math.max(1, Math.ceil(move / STEP));
        let done = false;
        for (let i = 0; i < n && !done; i++) {
          a.pos.addScaledVector(a.vel, dt / n);
          a.age += dt / n;
          a.flown += move / n;
          // 화살촉 자리로 맞았는지 본다
          const tip = a.bolt ? boltAt(a, v) : v.copy(a.vel).normalize().multiplyScalar(ARROW_LEN * SCALE).add(a.pos);
          a.tip = tip.clone().setY(tip.y - curveDrop(tip.x, tip.z)); // 맞았는지는 화면에 그린 자리로 (캐릭터도 내려 그림)
          if (hit(a, a.from, a.mine)) { remove(a); done = true; break; }
          if (a.bolt && (tip.y <= 0.01 || blocked(tip.x, tip.z) || a.flown > BOLT.range)) { remove(a); done = true; } // 볼은 펑 사라진다
          else if (tip.y <= 0.01 || blocked(tip.x, tip.z)) { // 평평한 땅 기준이라 땅 높이는 0
            // 땅·나무에 꽂혀 잠시 남는다 (촉이 조금 박히게)
            a.pos.addScaledVector(a.vel.clone().normalize(), 0.08);
            a.stuck = 0;
            done = true;
          } else if (a.flown > ARROW.range) { remove(a); done = true; } // 멀리 가면 사라진다
        }
        if (list.includes(a)) place(a);
      }
    },
  };
}
