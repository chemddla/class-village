// 손에 쥐는 도구·무기 (로우폴리). 손 관절 아래 rightSocket / leftSocket 에 붙는다.
// 도구 공간: 쥐는 곳이 원점, 손잡이→머리 방향이 +Y. grip()으로 감싸면 +Y가 손의 +Z(팔을 내렸을 때 앞쪽)가 된다.
// 날(도끼·검)은 휘두르는 방향인 도구 +Z 쪽을 향한다.
import * as THREE from 'three';
import { resolveArmCollision } from './collision.js';

const PI = Math.PI;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// 도구 기본 재질: 매끈한 플라스틱·칠 광택 (나무는 따로 거칠게)
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.3, ...o });
const WOOD = () => mat('#a8743f', { roughness: 0.8 });
const DARK_WOOD = () => mat('#6e4526', { roughness: 0.8 });
const METAL = () => mat('#dfe5ec', { roughness: 0.3, metalness: 0.35 });
const LEATHER = () => mat('#5a3a2a', { roughness: 0.35 });

function part(geo, material, parent, name, [x, y, z] = [0, 0, 0]) {
  const m = new THREE.Mesh(geo, material);
  m.name = name;
  m.castShadow = true;
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function grip(tool) {
  const g = new THREE.Group();
  g.rotation.x = PI / 2;
  g.add(tool);
  return g;
}

function line(points, color = '#f4f1ea') {
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const l = new THREE.Line(geo, new THREE.LineBasicMaterial({ color }));
  l.frustumCulled = false;
  return l;
}
function setLine(l, points) {
  const p = l.geometry.attributes.position;
  points.forEach((v, i) => p.setXYZ(i, v.x, v.y, v.z));
  p.needsUpdate = true;
}

// ── 생활 도구 ──
function axe() {
  const g = new THREE.Group();
  g.name = '도끼';
  part(new THREE.CylinderGeometry(0.011, 0.013, 0.38, 8), WOOD(), g, '도끼자루', [0, 0.09, 0]);
  const head = mat('#8d939c', { roughness: 0.4, metalness: 0.4 });
  part(new THREE.BoxGeometry(0.02, 0.05, 0.05), head, g, '도끼머리', [0, 0.25, 0.02]);
  // 날: 끝으로 갈수록 넓어지는 쐐기 + 밝게 간 날끝
  const s = new THREE.Shape();
  s.moveTo(0, -0.024);
  s.lineTo(0.05, -0.046);
  s.quadraticCurveTo(0.062, 0, 0.05, 0.046);
  s.lineTo(0, 0.024);
  s.closePath();
  const blade = new THREE.ExtrudeGeometry(s, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1 });
  blade.translate(0, 0, -0.005).rotateY(-PI / 2);
  part(blade, head, g, '도끼날', [0, 0.25, 0.035]);
  part(new THREE.BoxGeometry(0.013, 0.086, 0.007).rotateX(0), METAL(), g, '날끝', [0, 0.25, 0.092]);
  part(new THREE.BoxGeometry(0.024, 0.04, 0.02), head, g, '도끼등', [0, 0.25, -0.014]);
  return grip(g);
}

function fishingRod() {
  const g = new THREE.Group();
  g.name = '낚싯대';
  part(new THREE.CylinderGeometry(0.0035, 0.008, 0.55, 8), DARK_WOOD(), g, '낚싯대', [0, 0.215, 0]);
  part(new THREE.CylinderGeometry(0.012, 0.012, 0.13, 10), mat('#d8b07a', { roughness: 0.95 }), g, '손잡이', [0, -0.03, 0]);
  const reel = part(new THREE.CylinderGeometry(0.018, 0.018, 0.014, 14).rotateZ(PI / 2), mat('#3d6fc4', { roughness: 0.4 }), g, '릴', [0.022, 0.06, 0]);
  reel.castShadow = false;
  const tip = new THREE.Object3D();
  tip.position.set(0, 0.49, 0);
  g.add(tip);
  // 찌: 위는 빨강, 아래는 흰색
  const bobber = new THREE.Group();
  bobber.name = '찌';
  part(new THREE.SphereGeometry(0.016, 14, 8, 0, PI * 2, 0, PI / 2), mat('#e2574c', { roughness: 0.4 }), bobber, '찌위');
  part(new THREE.SphereGeometry(0.016, 14, 8, 0, PI * 2, PI / 2, PI / 2), mat('#fffaf0', { roughness: 0.4 }), bobber, '찌아래');
  g.add(bobber);
  const l = line([V(), V()]);
  g.add(l);
  g.userData.rod = { tip, bobber, line: l, bobW: null };
  return grip(g);
}

function bugNet() {
  const g = new THREE.Group();
  g.name = '잠자리채';
  part(new THREE.CylinderGeometry(0.008, 0.01, 0.48, 8), mat('#e7c39b', { roughness: 0.8 }), g, '채자루', [0, 0.2, 0]);
  const hoopY = 0.44 + 0.075;
  part(new THREE.TorusGeometry(0.075, 0.005, 6, 28), mat('#3b8f5a', { roughness: 0.5 }), g, '테', [0, hoopY, 0]);
  // 그물 주머니: 반투명 원뿔 + 그물코 선
  const bag = new THREE.ConeGeometry(0.073, 0.13, 14, 3, true).rotateX(PI / 2);
  part(bag, new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
    g, '그물', [0, hoopY, -0.065]).castShadow = false;
  part(bag, new THREE.MeshBasicMaterial({ color: '#e8f3f6', wireframe: true }), g, '그물코', [0, hoopY, -0.065]).castShadow = false;
  return grip(g);
}

// ── 사냥 무기 ──
function club() {
  const g = new THREE.Group();
  g.name = '나무몽둥이';
  part(new THREE.CylinderGeometry(0.012, 0.013, 0.16, 8), DARK_WOOD(), g, '몽둥이자루', [0, 0, 0]);
  // 끝으로 갈수록 굵어지는 머리 + 둥근 끝
  part(new THREE.CylinderGeometry(0.03, 0.016, 0.2, 9), WOOD(), g, '몽둥이머리', [0, 0.18, 0]);
  part(new THREE.SphereGeometry(0.03, 9, 6, 0, PI * 2, 0, PI / 2), WOOD(), g, '몽둥이끝', [0, 0.28, 0]);
  return grip(g);
}
function sword() {
  const g = new THREE.Group();
  g.name = '한손검';
  part(new THREE.CylinderGeometry(0.011, 0.011, 0.075, 8), LEATHER(), g, '검손잡이');
  part(new THREE.SphereGeometry(0.016, 10, 8), mat('#e7b74a', { roughness: 0.35, metalness: 0.5 }), g, '검자루끝', [0, -0.048, 0]);
  part(new THREE.BoxGeometry(0.022, 0.018, 0.1), mat('#e7b74a', { roughness: 0.35, metalness: 0.5 }), g, '코등이', [0, 0.045, 0]);
  // 칼날: 납작한 윤곽을 살짝 두께 있게 뽑아내고, 날이 휘두르는 방향(±Z)을 향하도록 세움
  const s = new THREE.Shape();
  s.moveTo(-0.018, 0.05);
  s.lineTo(-0.018, 0.27);
  s.lineTo(0, 0.31);
  s.lineTo(0.018, 0.27);
  s.lineTo(0.018, 0.05);
  s.closePath();
  const blade = new THREE.ExtrudeGeometry(s, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1 });
  blade.translate(0, 0, -0.002).rotateY(PI / 2);
  part(blade, METAL(), g, '칼날');
  return grip(g);
}

function shield() {
  // 왼쪽 아래팔 바깥에 차는 둥근 방패 (면이 손의 +X = 바깥쪽을 향함)
  const g = new THREE.Group();
  g.name = '방패';
  g.position.set(0.042, 0.02, 0);
  const toX = (geo) => geo.rotateZ(-PI / 2);
  part(toX(new THREE.CylinderGeometry(0.088, 0.088, 0.014, 28)), WOOD(), g, '방패판');
  part(new THREE.TorusGeometry(0.088, 0.008, 8, 36).rotateY(PI / 2), mat('#c9c3b5', { roughness: 0.35, metalness: 0.4 }), g, '방패테');
  part(new THREE.TorusGeometry(0.048, 0.006, 8, 30).rotateY(PI / 2), mat('#e2574c', { roughness: 0.5 }), g, '문양', [0.008, 0, 0]);
  part(toX(new THREE.SphereGeometry(0.022, 14, 8, 0, PI * 2, 0, PI / 2)), mat('#e7b74a', { roughness: 0.35, metalness: 0.5 }), g, '방패징', [0.007, 0, 0]);
  return g;
}

function bow() {
  const g = new THREE.Group();
  g.name = '활';
  const top = V(0, 0.25, -0.075);
  const bottom = V(0, -0.25, -0.075);
  const curve = new THREE.QuadraticBezierCurve3(top, V(0, 0, 0.06), bottom);
  part(new THREE.TubeGeometry(curve, 24, 0.0075, 6), WOOD(), g, '활대');
  part(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 8), LEATHER(), g, '줌통');
  const rest = V(0, 0, -0.075);
  const str = line([top, rest.clone(), bottom], '#fffaf0');
  g.add(str);
  // 화살: +Z 방향으로 뻗음 (꼬리가 원점)
  const arrow = new THREE.Group();
  arrow.name = '화살';
  part(new THREE.CylinderGeometry(0.0035, 0.0035, 0.3, 6).rotateX(PI / 2), mat('#e7c39b'), arrow, '화살대', [0, 0, 0.15]);
  part(new THREE.ConeGeometry(0.009, 0.03, 6).rotateX(PI / 2), METAL(), arrow, '화살촉', [0, 0, 0.315]);
  for (const r of [0, PI / 2]) {
    const f = part(new THREE.PlaneGeometry(0.022, 0.045).rotateX(PI / 2), new THREE.MeshStandardMaterial({ color: '#f28aa0', side: THREE.DoubleSide }),
      arrow, '깃', [0, 0, 0.025]);
    f.rotation.z = r;
  }
  arrow.visible = false;
  g.add(arrow);
  g.userData.bow = { top, bottom, rest, string: str, arrow, nock: rest.clone() };
  return grip(g);
}

function staff() {
  const g = new THREE.Group();
  g.name = '마법지팡이';
  part(new THREE.CylinderGeometry(0.009, 0.012, 0.5, 8), DARK_WOOD(), g, '지팡이대', [0, 0.11, 0]);
  const gold = mat('#e7b74a', { roughness: 0.35, metalness: 0.5 });
  part(new THREE.TorusGeometry(0.013, 0.004, 6, 16).rotateX(PI / 2), gold, g, '고리', [0, 0.34, 0]);
  // 수정을 감싸는 갈퀴 세 개
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI * 2;
    const c = part(new THREE.ConeGeometry(0.006, 0.06, 5), gold, g, '갈퀴', [Math.cos(a) * 0.02, 0.38, Math.sin(a) * 0.02]);
    c.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
  }
  const crystal = part(new THREE.OctahedronGeometry(0.035, 0).scale(1, 1.4, 1), new THREE.MeshStandardMaterial({
    color: '#a8ecff', emissive: '#4fc3ff', emissiveIntensity: 0.5, roughness: 0.15, flatShading: true,
  }), g, '수정', [0, 0.43, 0]);
  const light = new THREE.PointLight('#7fd8ff', 0, 0.6);
  light.position.copy(crystal.position);
  g.add(light);
  g.userData.staff = { crystal, light };
  return grip(g);
}

// 장비 목록: right / left 는 각 손 소켓에 붙일 모델을 만드는 함수
// carry: 대기·걷기처럼 도구를 쓰지 않는 동안 손목을 세워 도구를 비스듬히 드는 각도 [오른손, 왼손]
// twoHand: 두 손 액션(fx.twoHand)에서 왼손이 잡을 자루 위치 (도구 공간 y, 오른손 = 0)
export const EQUIPMENT = {
  none: { label: '맨손' },
  axe: { label: '도끼', right: axe, carry: [-0.9, 0], twoHand: -0.07 },
  club: { label: '나무 몽둥이', right: club, carry: [-0.9, 0], twoHand: -0.07 },
  rod: { label: '낚싯대', right: fishingRod, carry: [-0.7, 0], twoHand: -0.07 },
  net: { label: '잠자리채', right: bugNet, carry: [-1.0, 0] },
  swordShield: { label: '검 + 방패', right: sword, left: shield, carry: [-0.5, 0] },
  bow: { label: '활 + 화살', left: bow, carry: [0, -1.2] },
  staff: { label: '마법 지팡이', right: staff, carry: [-1.35, 0] },
};
const CARRY_ACTIONS = new Set(['idle', 'walk', 'run', 'jump', 'flip', 'wave', 'cheer']);

// 소켓을 비우고 새 장비를 쥐어 준다
export function attachEquipment(rig, id) {
  const e = EQUIPMENT[id] ?? EQUIPMENT.none;
  for (const [sock, make] of [[rig.rightSocket, e.right], [rig.leftSocket, e.left]]) {
    for (const c of [...sock.children]) {
      sock.remove(c);
      c.traverse((x) => { if (x.geometry) x.geometry.dispose(); if (x.material) x.material.dispose(); });
    }
    if (make) sock.add(make());
  }
}

// ── 두 손 쥐기 IK ──
// 애니메이션이 정한 도구 방향은 그대로 두고, 두 손 사이가 몸 한가운데 오도록 도구를 옆으로 옮긴 뒤
// 두 팔을 IK로 뻗어 오른손은 원래 쥔 곳, 왼손은 자루의 y 지점을 같은 방향으로 감싸 쥔다 (w = 0→1 섞는 비율).
// 팔꿈치는 몸통 기준 바깥·아래·뒤(pole) 쪽으로 굽는다. 관절의 굽힘축은 로컬 x, 팔은 로컬 -y로 뻗는다.
const POLE = { R: V(-0.7, -1, -0.3).normalize(), L: V(0.7, -1, -0.3).normalize() };
const qA = new THREE.Quaternion();
const qB = new THREE.Quaternion();
const m4 = new THREE.Matrix4();
function blendWorld(o, worldQ, w) {
  o.parent.getWorldQuaternion(qB).invert().multiply(worldQ);
  o.quaternion.slerp(qB, w);
  o.updateMatrixWorld(true);
}
function aimJoint(o, X, Y, Z, w) {
  blendWorld(o, qA.setFromRotationMatrix(m4.makeBasis(X, Y, Z)), w);
}
// 손(소켓)을 grip 위치·handQ 방향에 오도록 어깨·팔꿈치·손을 돌린다
function armIK(rig, s, grip, handQ, w) {
  const sh = rig[`shoulder${s}`], el = rig[`elbow${s}`], hand = rig[`hand${s}`];
  const sock = s === 'R' ? rig.rightSocket : rig.leftSocket;
  const S = sh.getWorldPosition(V());
  const E0 = el.getWorldPosition(V());
  const a = S.distanceTo(E0);
  const b = E0.distanceTo(hand.getWorldPosition(V()));
  // 손목 목표 = 쥘 곳에서 손 안의 소켓 오프셋만큼 되돌린 자리
  const ST = sock.position.clone().multiply(hand.getWorldScale(V())).applyQuaternion(handQ).negate().add(grip).sub(S);
  const d = THREE.MathUtils.clamp(ST.length(), Math.abs(a - b) + 1e-4, a + b - 1e-4);
  ST.normalize();
  const perp = POLE[s].clone().applyQuaternion(sh.parent.getWorldQuaternion(qA));
  perp.addScaledVector(ST, -perp.dot(ST)).normalize();
  const cosA = (a * a + d * d - b * b) / (2 * a * d);
  const sinA = Math.sqrt(1 - cosA * cosA);
  const u1 = ST.clone().multiplyScalar(cosA).addScaledVector(perp, sinA); // 어깨→팔꿈치
  const u2 = S.clone().addScaledVector(ST, d).sub(S.clone().addScaledVector(u1, a)).normalize(); // 팔꿈치→손목
  const Y1 = u1.negate();
  const Z1 = ST.multiplyScalar(sinA).addScaledVector(perp, -cosA); // 윗팔에 수직, 굽는 쪽
  const X = V().crossVectors(Y1, Z1);
  aimJoint(sh, X, Y1, Z1, w);
  const Y2 = u2.negate();
  aimJoint(el, X, Y2, V().crossVectors(X, Y2), w);
  blendWorld(hand, handQ, w);
}
function twoHandGrip(rig, y, w) {
  const torso = rig.shoulderL.parent;
  const sock = rig.rightSocket;
  const handQ = sock.getWorldQuaternion(new THREE.Quaternion()).multiply(qA.copy(sock.quaternion).invert());
  const gR = sock.getWorldPosition(V());
  const scale = rig.shoulderL.getWorldScale(V()).x;
  const T = torso.getWorldPosition(V());
  const reach = 0.196 * scale;
  const SR = rig.shoulderR.getWorldPosition(V()), SL = rig.shoulderL.getWorldPosition(V());
  // 왼손이 자루의 gy 지점을 쥘 때: 두 손 사이가 몸 한가운데 오게 옆으로 옮기고,
  // 팔이 안 닿으면 가슴 앞(겉면보다 바깥)으로 조금씩 당긴다 (팔 길이 0.218의 90%까지)
  // (애니메이션 자세의 소켓 기준: 아래에서 후보를 시험하며 오른팔이 움직여도 같은 자리가 나오게)
  const sockM = sock.matrixWorld.clone();
  const place = (gy) => {
    const gL = V(0, 0, gy).applyMatrix4(sockM);
    const mid = torso.worldToLocal(gR.clone().add(gL).multiplyScalar(0.5));
    const base = torso.localToWorld(V(-mid.x, 0, 0)).sub(T);
    const pull = torso.localToWorld(V(0, rig.shoulderL.position.y - 0.04, 0.13)).sub(torso.localToWorld(mid.setX(0)));
    const shift = base.clone();
    for (let i = 0; i <= 10; i++) {
      shift.copy(base).addScaledVector(pull, i / 10);
      if (SR.distanceTo(gR.clone().add(shift)) <= reach && SL.distanceTo(gL.clone().add(shift)) <= reach) break;
    }
    return { gL, shift };
  };
  const joints = ARM_JOINTS.map((k) => rig[k]);
  const saved = joints.map((j) => j.quaternion.clone());
  // 도구를 shift(세계)만큼 옮긴 자리를 두 손으로 쥐어 보고, 몸에 박힌 깊이(두 팔 합)를 돌려준다.
  // 도구는 오른손에 붙어 있으므로 왼손은 오른손이 실제로 간 곳의 자루를 쥔다 (오른손이 덜 닿아도 도구에서 안 떨어짐)
  const grip = (gy, gL, shift) => {
    joints.forEach((j, k) => j.quaternion.copy(saved[k]));
    torso.updateMatrixWorld(true);
    armIK(rig, 'R', gR.clone().add(shift), handQ, w);
    armIK(rig, 'L', sock.localToWorld(V(0, 0, gy)).lerp(gL.clone().add(shift), 1 - w), handQ, w);
    return rig.colliders ? resolveArmCollision(rig).reduce((a, b) => a + b, 0) : 0;
  };
  // 손·팔이 가슴·배·머리에 박히지 않는 자리를 후보 중에서 고른다. 팔이 짧아 가슴 한가운데 앞을 쥐면
  // 쭉 편 팔이 가슴을 가로지르므로, 앞으로 내밀기(0~12cm)뿐 아니라 좌우로 비키기·조금 위로 들기도 본다.
  // 왼손은 오른손 아래(자루 끝 쪽) 또는 위(도구 머리 쪽, 내려찍을 때 자루 끝이 배를 향하면)를 쥔다.
  // 덜 박힌 자리 → 덜 옮긴 자리 → 원래 손 순서를 우선한다. 안 박히는 자리를 찾으면 그 줄은 더 보지 않는다.
  let pick = { gy: y, off: V(), cost: Infinity };
  if (rig.colliders) {
    search: for (const gy of [y, -y]) {
      const { gL, shift } = place(gy);
      for (const side of [0, 0.035, -0.035]) {
        for (const up of [0, 0.03]) {
          for (let k = 0; k <= 4; k++) {
            const off = V(side, up, 0.03 * k);
            const d = grip(gy, gL, torso.localToWorld(off.clone()).sub(T).add(shift)) / scale;
            const cost = Math.max(0, d - 0.002) + 0.004 * k + Math.abs(side) * 0.1 + up * 0.1 + (gy === y ? 0 : 0.006);
            if (cost < pick.cost) pick = { gy, off, cost };
            if (pick.cost < 1e-9) break search; // 원래 자리 그대로 안 박힘
            if (d < 0.002) break; // 더 앞으로 낼 필요 없음
          }
        }
      }
    }
  }
  // 프레임마다 고른 자리가 바뀌어도 튀지 않게 부드럽게 따라간다
  const st = (rig.twoHandPick ??= { gy: pick.gy, off: pick.off.clone() });
  st.gy += (pick.gy - st.gy) * 0.6;
  st.off.lerp(pick.off, 0.6);
  const { gL, shift } = place(st.gy);
  grip(st.gy, gL, torso.localToWorld(st.off.clone()).sub(T).add(shift));
}
const ARM_JOINTS = ['shoulderR', 'elbowR', 'handR', 'shoulderL', 'elbowL', 'handL'];

// 매 프레임: 낚싯줄·찌, 활시위·화살, 지팡이 빛 (fx는 액션이 내놓은 연출 값)
const v1 = V();
const v2 = V();
export function updateEquipment(rig, root, fx, t, dt, { equipment, action }) {
  // 들고 다니는 자세: 소켓 자체를 부드럽게 기울임 (액션 관절값과 따로 움직임)
  const carry = CARRY_ACTIONS.has(action) ? EQUIPMENT[equipment]?.carry ?? [0, 0] : [0, 0];
  const k = 1 - Math.exp(-10 * dt);
  rig.rightSocket.rotation.x += (carry[0] - rig.rightSocket.rotation.x) * k;
  rig.leftSocket.rotation.x += (carry[1] - rig.leftSocket.rotation.x) * k;
  root.updateMatrixWorld(true);
  const grip = EQUIPMENT[equipment]?.twoHand;
  rig.twoHandW = (rig.twoHandW ?? 0) + ((fx.twoHand && grip != null ? 1 : 0) - (rig.twoHandW ?? 0)) * k;
  if (grip != null && rig.twoHandW > 0.001) twoHandGrip(rig, grip, rig.twoHandW);
  for (const sock of [rig.rightSocket, rig.leftSocket]) {
    sock.traverse((o) => {
      const { rod, bow: b, staff: st } = o.userData;
      if (rod) {
        // 찌: 평소엔 낚싯대 끝에 매달리고, 던지면 캐릭터 앞 바닥(물)에 떠서 까딱임
        const tipW = rod.tip.getWorldPosition(v1);
        const goal = fx.bobber === 'water'
          ? root.localToWorld(v2.set(0.05, 0.016 + Math.sin(t * 3) * 0.005, 0.95))
          : v2.copy(tipW).add(V(0, -0.13, 0));
        if (!rod.bobW) rod.bobW = goal.clone();
        rod.bobW.lerp(goal, 1 - Math.exp(-7 * dt));
        rod.bobber.position.copy(o.worldToLocal(rod.bobW.clone()));
        setLine(rod.line, [rod.tip.position, rod.bobber.position]);
      }
      if (b) {
        // 시위: 당기는 동안 오른손을 따라가고, 놓으면 빠르게 제자리로 튕김
        const goal = fx.nock ? o.worldToLocal(rig.rightSocket.getWorldPosition(v1)) : b.rest;
        b.nock.lerp(goal, 1 - Math.exp(-(fx.nock ? 30 : 45) * dt));
        setLine(b.string, [b.top, b.nock, b.bottom]);
        b.arrow.visible = !!fx.arrow;
        if (fx.arrow) {
          b.arrow.position.copy(b.nock);
          b.arrow.lookAt(o.localToWorld(v2.set(0, 0, 0)));
        }
      }
      if (st) {
        const glow = fx.glow ?? 0;
        st.crystal.material.emissiveIntensity = 0.5 + glow * 2.2;
        st.light.intensity = glow * 0.08; // 얼굴 가까이 오므로 아주 약하게
        st.crystal.rotation.y = t * 1.5;
      }
    });
  }
}
