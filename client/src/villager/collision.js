// 팔이 몸통·바지·머리 안으로 파고들지 않게 매 프레임 자세를 바로잡는다.
// 액션 함수는 관절 각도만 정하므로, 몸이 기울거나 팔을 크게 휘두르면 팔꿈치·손이 옷 속으로 들어갈 수 있다.
// 그래서 애니메이션·두 손 쥐기 IK가 끝난 뒤, 팔 위 몇 개의 점을 몸 부피와 비교해 바깥으로 밀어낸다.
//  - 팔꿈치만 들어가면: 어깨~손목을 잇는 축으로 팔을 비틀어(팔꿈치를 바깥으로) 손 위치·방향은 그대로 둔다.
//  - 아래팔·손이 들어가면: 어깨를 돌려 팔 전체를 몸 밖으로 민다 (두 손으로 도구를 쥘 때는 손을 놓치지 않게 생략).
// 다음 프레임에 애니메이터가 팔 관절의 모든 축을 다시 쓰므로 보정이 쌓이지 않는다.
import * as THREE from 'three';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// 팔 위의 검사 점: 어느 관절 공간의 어디, 굵기(반지름), 종류
const SAMPLES = [
  { joint: 'elbow', at: [0, 0, 0], r: 0.018, kind: 'elbow' },
  { joint: 'elbow', at: [0, -0.04, 0], r: 0.02, kind: 'elbow' },
  { joint: 'hand', at: [0, 0, 0], r: 0.02, kind: 'fore' },
  { joint: 'hand', at: [0, -0.045, 0], r: 0.03, kind: 'hand' },
];

const ITER = 8; // 한 번 밀어낸 뒤 다른 점이 새로 박힐 수 있어 몇 번 되풀이
const MAX_STEP = 0.35; // 한 번에 돌리는 최대 각도 (튀지 않게)

// 회전체 몸 부피(lathe): prof는 위→아래 [반지름, 높이], zs는 앞뒤 납작한 비율. 안쪽이면 +깊이와 바깥 방향을 돌려준다
function latheDepth(c, p, nOut) {
  const { prof, zs } = c;
  if (p.y > prof[0][1] || p.y < prof[prof.length - 1][1]) return -1;
  let r = prof[0][0];
  for (let i = 1; i < prof.length; i++) {
    const [r1, y1] = prof[i];
    if (p.y >= y1) {
      const [r0, y0] = prof[i - 1];
      r = r0 + ((r1 - r0) * (p.y - y0)) / (y1 - y0 || 1);
      break;
    }
  }
  const q = Math.hypot(p.x, p.z / zs); // 타원 단면에서 몇 번째 둘레에 있는가
  const d = Math.hypot(p.x, p.z);
  if (q < 1e-6) { nOut.set(1, 0, 0); return r; }
  nOut.set(p.x, 0, p.z / (zs * zs)).normalize();
  return d * (r / q - 1);
}

// 타원체 몸 부피(머리): ell = [x, y, z] 반지름
function ellDepth(c, p, nOut) {
  const [a, b, e] = c.ell;
  const k = Math.hypot(p.x / a, p.y / b, p.z / e);
  if (k < 1e-6) { nOut.set(0, 1, 0); return a; }
  nOut.set(p.x / (a * a), p.y / (b * b), p.z / (e * e)).normalize();
  return p.length() * (1 / k - 1);
}

const pl = V();
const nl = V();
const pw = V();
const sc = V();
// 세계 좌표 점 p(반지름 rad)가 가장 깊이 박힌 몸 부피를 찾아 { depth, n(세계 방향) } 로
function deepest(colliders, p, rad, out) {
  out.depth = 0;
  for (const c of colliders) {
    c.joint.worldToLocal(pl.copy(p));
    const s = c.joint.getWorldScale(sc).x;
    const inside = (c.ell ? ellDepth(c, pl, nl) : latheDepth(c, pl, nl)) + rad / s;
    const depth = inside * s;
    if (depth > out.depth) {
      out.depth = depth;
      out.n.copy(nl).transformDirection(c.joint.matrixWorld);
    }
  }
  return out;
}

// 두 손(손목·주먹)이 몸에 가장 깊이 박힌 깊이와 그 바깥 방향(세계)을 nOut에
export function handPenetration(rig, nOut) {
  let worst = 0;
  for (const s of ['R', 'L']) {
    for (const smp of SAMPLES) {
      if (smp.joint !== 'hand') continue;
      const j = rig[`hand${s}`];
      j.localToWorld(pw.set(...smp.at));
      deepest(rig.colliders, pw, smp.r * j.getWorldScale(E).x, hit);
      if (hit.depth > worst) { worst = hit.depth; nOut.copy(hit.n); }
    }
  }
  return worst;
}

// 세계 좌표 점 p(반지름 rad)가 몸에 박힌 깊이 (안 박혔으면 0)
const tmpHit = { depth: 0, n: V() };
export function pointDepth(colliders, p, rad) {
  return colliders?.length ? deepest(colliders, p, rad, tmpHit).depth : 0;
}

// 세계 좌표 점 p(반지름 rad)가 박힌 깊이를 돌려주고, out.n 에 바깥 방향(세계)을 담는다 (도구 밀어내기용)
export function pointHit(colliders, p, rad, out) {
  return deepest(colliders, p, rad, out).depth;
}

// 두 팔(팔꿈치·아래팔·손) 가운데 가장 깊이 박힌 깊이를 돌려주고 nOut 에 바깥 방향(세계)을 담는다
export function forearmHit(rig, nOut) {
  let worst = 0;
  for (const s of ['R', 'L']) {
    for (const smp of SAMPLES) {
      const j = rig[`${smp.joint}${s}`];
      j.localToWorld(pw.set(...smp.at));
      deepest(rig.colliders, pw, smp.r * j.getWorldScale(E).x, hit);
      if (hit.depth > worst) { worst = hit.depth; nOut.copy(hit.n); }
    }
  }
  return worst;
}

// 오브젝트 o를 세계 기준 회전 q만큼 더 돌린다 (부모 좌표로 바꿔 곱함)
const qp = new THREE.Quaternion();
const qt = new THREE.Quaternion();
function rotateWorld(o, q) {
  o.parent.getWorldQuaternion(qp);
  qt.copy(qp).invert().multiply(q).multiply(qp);
  o.quaternion.premultiply(qt);
  o.updateMatrixWorld(true);
}

const hit = { depth: 0, n: V() };
const best = { depth: 0, n: V(), p: V(), kind: '' };
const S = V();
const W = V();
const E = V();
const axis = V();
const arm = V();
const qr = new THREE.Quaternion();
const handQ = new THREE.Quaternion();

// 팔 위 검사 점 중 가장 깊이 박힌 것을 best에 (only가 있으면 그 종류만)
function measure(el, hand, colliders, only) {
  best.depth = 0;
  for (const smp of SAMPLES) {
    if (only && smp.kind !== only) continue;
    const j = smp.joint === 'elbow' ? el : hand;
    j.localToWorld(pw.set(...smp.at));
    deepest(colliders, pw, smp.r * j.getWorldScale(E).x, hit);
    if (hit.depth > best.depth + 1e-5) {
      best.depth = hit.depth;
      best.n.copy(hit.n);
      best.p.copy(pw);
      best.kind = smp.kind;
    }
  }
  return best.depth;
}

// 비틀어 볼 각도: 작은 각부터 좌우 번갈아 (가장 덜 비튼 자세를 고르도록)
const TWISTS = [];
for (let k = 1; k <= 12; k++) TWISTS.push((k * Math.PI) / 12, (-k * Math.PI) / 12);
const TWIST_MIN = 0.012; // 팔꿈치가 어깨~손목 축에서 이보다 가까우면 비틀지 않는다 (월드 거리)
const shQ = new THREE.Quaternion();
const shQ0 = new THREE.Quaternion();
const shQ1 = new THREE.Quaternion();
const hdQ = new THREE.Quaternion();

// 팔꿈치 비틀기: 어깨~손목 축으로 팔을 돌려 팔꿈치가 몸 밖으로 나오는 가장 작은 각을 찾는다.
// 손목은 축 위라 제자리, 손 방향은 원래대로 되돌린다 (쥔 도구가 흔들리지 않게)
// prev: 앞 장면에 비튼 각. 매 장면 새로 찾은 각으로 곧장 가면 팔꿈치가 몸에 닿는 순간·떨어지는 순간 팔이 한 장면 만에 휙 돌므로,
// 앞 장면 각에서 한 번에 MAX_STEP 까지만 따라간다. 돌려주는 값은 이번에 비튼 각
// shortcut: 장면당 한계라 프레임이 높을수록 빨리 따라간다, 문제 되면 dt를 받아 초당 한계로
function twistElbow(sh, el, hand, colliders, prev = 0) {
  sh.getWorldPosition(S);
  hand.getWorldPosition(W);
  axis.subVectors(W, S);
  if (axis.lengthSq() < 1e-8) return 0;
  axis.normalize();
  // 팔을 거의 다 펴 팔꿈치가 축 가까이 있으면 비틀어도 팔꿈치는 거의 제자리이고 팔만 휙 돈다 (한손검 1타 타격·놓을 때).
  // 축에 가까울수록 비트는 각을 줄이고(딱 끊으면 그 경계에서 튄다), 남은 것은 2) 어깨째 밀기에 맡긴다
  el.getWorldPosition(E).sub(S);
  const keep = THREE.MathUtils.smoothstep(E.addScaledVector(axis, -E.dot(axis)).length(), TWIST_MIN, TWIST_MIN * 2);
  shQ.copy(sh.quaternion);
  hdQ.copy(hand.quaternion);
  hand.getWorldQuaternion(handQ);
  const apply = (ang) => {
    sh.quaternion.copy(shQ);
    sh.updateMatrixWorld(true);
    rotateWorld(sh, qr.setFromAxisAngle(axis, ang));
    el.getWorldQuaternion(qp);
    hand.quaternion.copy(qp.invert().multiply(handQ));
    hand.updateMatrixWorld(true);
  };
  let bestAng = 0;
  let bestDepth = measure(el, hand, colliders, 'elbow');
  for (const ang of keep > 0 && bestDepth > 1e-4 ? TWISTS : []) {
    apply(ang);
    const d = measure(el, hand, colliders, 'elbow');
    if (d < bestDepth - 1e-5) { bestDepth = d; bestAng = ang; }
    if (d < 1e-4) {
      // 15도 단위로 찾은 각을 그대로 쓰면 자세가 조금 바뀔 때 팔꿈치가 15도씩 툭툭 튄다:
      // 바로 앞 각(아직 박힘)과 이 각(빠져나옴) 사이를 좁혀 '딱 빠져나오는' 각을 쓴다
      let lo = ang - Math.sign(ang) * (Math.PI / 12);
      let hi = ang;
      for (let n = 0; n < 5; n++) {
        const mid = (lo + hi) / 2;
        apply(mid);
        if (measure(el, hand, colliders, 'elbow') < 1e-4) hi = mid; else lo = mid;
      }
      bestAng = hi;
      break;
    }
  }
  const ang = prev + THREE.MathUtils.clamp(bestAng * keep - prev, -MAX_STEP, MAX_STEP);
  if (ang === 0) {
    sh.quaternion.copy(shQ);
    hand.quaternion.copy(hdQ);
    sh.updateMatrixWorld(true);
  } else apply(ang);
  return ang;
}

// 한 쪽 팔(s = 'R'|'L')을 몸 밖으로. 반환값: 마지막에 남은 최대 깊이(점검용)
// hold 0→1: 두 손 쥐기에 손이 묶인 정도. 1이면 손 자리는 그대로(팔꿈치만 비틂), 0이면 팔째 밀어낸다.
// 그 사이는 밀어낸 자세를 그만큼만 섞어, 쥐는 중·놓는 중에 보정이 켜졌다 꺼지며 손이 튀지 않게 한다
function resolveArm(rig, s, colliders, hold) {
  const sh = rig[`shoulder${s}`];
  const el = rig[`elbow${s}`];
  const hand = rig[`hand${s}`];
  // 1) 팔꿈치가 박혔으면 먼저 비틀어 본다 (손 자리 유지). 안 박혔으면 앞 장면에 비튼 각을 서서히 푼다
  (rig.twist ??= {})[s] = twistElbow(sh, el, hand, colliders, rig.twist[s] ?? 0);
  // 2) 그래도 남으면 어깨째 몸 밖으로 민다. 두 손 쥐기 중에는 도구를 놓치지 않게 손 자리를 그대로 둠
  if (hold >= 1) return measure(el, hand, colliders);
  shQ0.copy(sh.quaternion);
  for (let it = 0; it < ITER; it++) {
    if (measure(el, hand, colliders) < 1e-4) break;
    // 박힌 점이 바깥 방향으로 움직이도록 (어깨→점) × 바깥 축으로 어깨를 돌린다
    sh.getWorldPosition(S);
    arm.subVectors(best.p, S);
    axis.crossVectors(arm, best.n);
    const lever = axis.length(); // 1 라디안 돌 때 바깥으로 나가는 거리
    if (lever < 1e-4) break;
    axis.divideScalar(lever);
    rotateWorld(sh, qr.setFromAxisAngle(axis, Math.min(MAX_STEP, (best.depth * 1.05) / lever)));
  }
  if (hold > 0) {
    sh.quaternion.copy(shQ1.copy(sh.quaternion)).copy(shQ0).slerp(shQ1, 1 - hold);
    sh.updateMatrixWorld(true);
  }
  return measure(el, hand, colliders);
}

// rig.colliders 가 있으면 두 팔을 몸 밖으로 바로잡는다. 행렬은 이미 갱신된 상태여야 한다.
export function resolveArmCollision(rig) {
  const colliders = rig.colliders;
  if (!colliders?.length) return [0, 0];
  const hold = THREE.MathUtils.smoothstep(rig.twoHandW ?? 0, 0.15, 0.85);
  return ['R', 'L'].map((s) => resolveArm(rig, s, colliders, hold));
}

// 점검용: 보정 없이 지금 자세에서 팔이 가장 깊이 박힌 깊이
export function armPenetration(rig) {
  let worst = 0;
  for (const s of ['R', 'L']) {
    for (const smp of SAMPLES) {
      const j = rig[`${smp.joint}${s}`];
      j.localToWorld(pw.set(...smp.at));
      worst = Math.max(worst, deepest(rig.colliders, pw, smp.r * j.getWorldScale(E).x, hit).depth);
    }
  }
  return worst;
}
