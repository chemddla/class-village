// 손에 쥐는 도구·무기 (로우폴리). 손 관절 아래 rightSocket / leftSocket 에 붙는다.
// 도구 공간: 쥐는 곳이 원점, 손잡이→머리 방향이 +Y. grip()으로 감싸면 +Y가 손의 +Z(팔을 내렸을 때 앞쪽)가 된다.
// 날(도끼·검)은 휘두르는 방향인 도구 +Z 쪽을 향한다.
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { pointHit, forearmHit } from './collision.js';

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

// ── 목검 ──
// 납작한 윤곽(x = 날 폭 방향, y = 길이)을 두께 있게 뽑아 날이 ±Z를 향하게 세운다.
// 각진 모서리는 꼭짓점마다 면 방향이 갈라져 있어 외곽선 껍질을 밀어내면 면끼리 벌어져 선이 떠 보인다:
// 외곽선에는 같은 자리 꼭짓점을 합쳐 면 방향을 고르게 이은 모양을 따로 쓴다
function flatBlade(shape, depth, bevel = 0.003) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 12 });
  return geo.translate(0, 0, -depth / 2).rotateY(PI / 2);
}
function smoothOutline(mesh) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', mesh.geometry.getAttribute('position').clone());
  const merged = mergeVertices(g, 1e-5);
  merged.computeVertexNormals();
  g.dispose();
  mesh.userData.outlineGeometry = merged;
  return mesh;
}
const OAK = () => mat('#b98349', { roughness: 0.7 });

// 휜 목검: 길고 가늘게 살짝 휘어진 날 + 동그란 판 코등이 + 끈 감은 손잡이
function woodSword() {
  const g = new THREE.Group();
  g.name = '목검';
  part(new THREE.CylinderGeometry(0.012, 0.013, 0.09, 8), DARK_WOOD(), g, '목검손잡이', [0, -0.005, 0]);
  for (let i = 0; i < 4; i++) {
    const r = part(new THREE.TorusGeometry(0.0128, 0.0028, 5, 12).rotateX(PI / 2), mat('#2f3b5c', { roughness: 0.6 }), g, '손잡이끈', [0, -0.04 + i * 0.022, 0]);
    r.rotation.z = (i % 2 ? 0.25 : -0.25);
  }
  part(new THREE.CylinderGeometry(0.028, 0.028, 0.007, 16), DARK_WOOD(), g, '판코등이', [0, 0.045, 0]);
  // 날: 뿌리 폭 0.019 → 끝으로 갈수록 살짝 좁아지며 등 쪽(-x)으로 휜다
  const s = new THREE.Shape();
  s.moveTo(-0.0095, 0.048);
  s.quadraticCurveTo(-0.011, 0.27, -0.03, 0.43);
  s.quadraticCurveTo(-0.016, 0.44, -0.005, 0.425);
  s.quadraticCurveTo(0.004, 0.27, 0.0095, 0.048);
  s.closePath();
  smoothOutline(part(flatBlade(s, 0.008, 0.0025), OAK(), g, '목검날'));
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
  club: { label: '나무 몽둥이', right: club, carry: [-0.9, 0], twoHand: -0.056 }, // 두 주먹이 맞닿는 간격
  rod: { label: '낚싯대', right: fishingRod, carry: [-0.7, 0], twoHand: -0.07 },
  net: { label: '잠자리채', right: bugNet, carry: [-1.0, 0] },
  swordShield: { label: '검 + 방패', right: sword, left: shield, carry: [-0.5, 0] },
  woodSword: { label: '목검', right: woodSword, carry: [-0.5, 0] },
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
// 두 손으로 자루를 쥘 때는 팔꿈치를 옆으로 벌린다: 두 팔이 양옆에서 자루로 모여야 한 손이 반대편 팔을 뚫고 지나가지 않고,
// 아래팔이 자루와 나란해지지 않아 손목도 꺾이지 않는다
// 왼팔은 팔꿈치를 위로 치켜들지 않는다: 윗팔(어깨)을 아래로 내려 팔꿈치가 어깨보다 낮게, 몸 옆 아래에서 굽는다
// (아래로만 굽히면 팔꿈치가 옆구리에 박혀 다시 밀려나면서 손목이 틀어지므로, 아래이면서 바깥쪽으로 둔다)
// 두 팔 모두 팔꿈치를 손목보다 낮게 둔다: 팔꿈치가 높으면 아래팔이 손으로 내려꽂혀 손목이 위로(손등 쪽으로) 젖혀 보인다
// 왼팔(자루 끝을 쥔 팔)은 팔꿈치를 옆으로 벌리지 않고 가슴 앞 아래로 떨어뜨린다: 윗팔은 어깨에서 아래로 내려가고
// 아래팔이 거기서 손으로 올라가는 V자 모양. 팔을 수평으로 가로지르면 손목만 위로 꺾여 자루를 쥐게 된다
const GRIP_POLE = { R: V(-1, 0, 0.2).normalize(), L: V(0.12, -1, 0.2).normalize() };
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
// natural: 팔꿈치를 '손이 팔 쪽으로 뻗은 방향' 위에 놓는다 → 아래팔이 손과 한 줄이 되어 손목이 꺾이지 않는다.
// (손목을 돌려 맞추는 대신 어깨·팔꿈치 각도로 맞추는 것. 그 방향을 못 잡으면 pole 쪽으로 굽힌다)
function armIK(rig, s, grip, handQ, w, pole = POLE[s], natural = false) {
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
  const perp = pole.clone().applyQuaternion(sh.parent.getWorldQuaternion(qA));
  perp.addScaledVector(ST, -perp.dot(ST)).normalize();
  if (natural) {
    // 손목에서 손의 +Y(팔 쪽) 방향으로 아래팔 길이만큼 간 곳이 팔꿈치가 있으면 가장 좋은 자리
    const want = V(0, 1, 0).applyQuaternion(handQ).multiplyScalar(b).addScaledVector(ST, d);
    want.addScaledVector(ST, -want.dot(ST));
    // 몸 바깥쪽(pole)과 섞어, 팔꿈치가 몸 안쪽으로 접히는 자세는 피한다
    if (want.lengthSq() > 1e-6) perp.multiplyScalar(0.35).addScaledVector(want.normalize(), 1).normalize();
    // 팔꿈치를 위로 치켜들지는 않는다: 굽는 방향에서 위쪽 성분은 버린다 (어깨~손목을 잇는 선보다 위로 올라가지 않게)
    const upW = V(0, 1, 0).applyQuaternion(sh.parent.getWorldQuaternion(qA));
    const lift = perp.dot(upW);
    if (lift > 0) {
      perp.addScaledVector(upW, -lift * 1.15);
      perp.addScaledVector(ST, -perp.dot(ST));
      if (perp.lengthSq() < 1e-4) perp.copy(pole).applyQuaternion(sh.parent.getWorldQuaternion(qA)).addScaledVector(ST, -perp.dot(ST));
      perp.normalize();
    }
  }
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
// 도구 위의 검사 점(소켓 공간, 굵기 포함): 부품마다 가장 긴 축을 따라 5점. 도구를 처음 볼 때 한 번 잰다
function toolProbes(sock) {
  const tool = sock.children[0];
  if (!tool) return [];
  if (tool.userData.probes) return tool.userData.probes;
  sock.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(sock.matrixWorld).invert();
  const sc = sock.getWorldScale(V()).x;
  const out = [];
  tool.traverse((m) => {
    if (!m.isMesh || m.userData.isOutline || m.parent?.name === '찌') return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    const b = m.geometry.boundingBox;
    const size = b.getSize(V());
    const c = b.getCenter(V());
    const ax = size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z';
    const [o1, o2] = ['x', 'y', 'z'].filter((a) => a !== ax);
    const rad = (Math.min(size[o1], size[o2]) / 2) * (m.getWorldScale(V()).x / sc);
    for (let n = 0; n <= 4; n++) {
      const p = c.clone();
      p[ax] = b.min[ax] + (size[ax] * n) / 4;
      out.push({ p: p.applyMatrix4(m.matrixWorld).applyMatrix4(inv), rad });
    }
  });
  return (tool.userData.probes = out);
}

// 도구를 몸 밖으로 (P = 쥔 곳, Q = 방향, fwd = 몸통이 바라보는 쪽):
//  - 손 가까운 점(주먹·자루 끝)이 박혔으면 도구째 '앞으로' 빼낸다. 가장 가까운 바깥쪽으로 밀면 몸 중심선 뒤에 있던 손은
//    등 뒤로 밀려나, 프레임에 따라 손이 몸 앞뒤를 오가며 튄다. 앞으로만 빼면 자세가 조금 바뀔 때 결과도 조금만 바뀐다.
//  - 손에서 먼 점(날·낚싯대 끝)이 박혔으면 쥔 곳을 축으로 도구를 돌려 뺀다.
const TOOL_MARGIN = 0.014; // 몸 부피는 옷 겉면보다 안쪽이라, 도구는 그만큼 더 띄운다
// 쥔 곳에서 이 거리 안이면 '손 가까운 점'(주먹과 그 바로 옆 자루). 이보다 먼 자루·머리 부분이 박히면 도구를 돌려 뺀다.
// (넓게 잡으면 머리 옆을 지나는 자루 때문에 두 손이 통째로 앞으로 밀려나 팔이 일자로 뻗는다)
const NEAR = 0.07;
// 손보다 뒤쪽(자루 끝, 소켓 -Z)은 멀어도 '손 가까운 점'으로 친다: 도구를 앞으로 뻗으면 자루 끝이 가슴 쪽을 향하는데,
// 이걸 돌려서 빼면 도구 머리가 아래로 처져 지팡이를 짚은 꼴이 된다. 자루 끝은 도구째 앞으로 밀어 뺀다
const isFar = (s) => !s.hand && s.p.z > 0 && s.p.length() > NEAR;
const hitT = { depth: 0, n: V() };
const rT = V(), pT = V(), bn = V();
const qT = new THREE.Quaternion();
function clearTool(colliders, probes, P, Q, scale, fwd, right) {
  // 1) 먼 점: 쥔 곳을 축으로 도구 끝을 '위→앞'으로 넘기며 처음 빠져나오는 각을 찾는다 (늘 같은 쪽으로 돌려야 튀지 않는다).
  //    머리가 커서 도끼·낚싯대를 어깨 너머로 젖히면 머리 속을 지나가므로, 젖힐 수 있는 데까지만 젖힌 자세가 된다
  const Q0 = qT.copy(Q);
  const blocked = (ang) => {
    Q.copy(Q0).premultiply(qR.setFromAxisAngle(right, ang));
    for (const s of probes) {
      if (!isFar(s)) continue;
      rT.copy(s.p).multiplyScalar(scale).applyQuaternion(Q);
      if (pointHit(colliders, pT.copy(P).add(rT), (s.rad + TOOL_MARGIN) * scale, hitT) > 0.0005 * scale) return true;
    }
    return false;
  };
  if (blocked(0)) {
    let lo = 0, hi = 0;
    for (let a = 0.12; a <= 2.8; a += 0.12) {
      if (!blocked(a)) { hi = a; break; }
      lo = a;
    }
    if (hi) {
      for (let n = 0; n < 6; n++) {
        const mid = (lo + hi) / 2;
        if (blocked(mid)) lo = mid; else hi = mid;
      }
    }
    Q.copy(Q0).premultiply(qR.setFromAxisAngle(right, hi));
  } else Q.copy(Q0);
  // 2) 손 가까운 점: 도구째 앞으로
  let shift = 0;
  for (const s of probes) {
    if (isFar(s)) continue;
    rT.copy(s.p).multiplyScalar(scale).applyQuaternion(Q).add(P);
    const rad = (s.rad + (s.hand ? 0 : TOOL_MARGIN)) * scale;
    if (pointHit(colliders, pT.copy(rT).addScaledVector(fwd, shift), rad, hitT) <= 0) continue;
    let lo = shift, hi = shift + 0.3 * scale;
    for (let n = 0; n < 9; n++) {
      const mid = (lo + hi) / 2;
      if (pointHit(colliders, pT.copy(rT).addScaledVector(fwd, mid), rad, hitT) > 0) lo = mid; else hi = mid;
    }
    shift = hi;
  }
  P.addScaledVector(fwd, shift);
}
const qR = new THREE.Quaternion();

const ARM_JOINTS = ['shoulderR', 'elbowR', 'handR', 'shoulderL', 'elbowL', 'handL'];
// 자루를 쥔 손의 방향: 도구 축(손의 +Z)은 그대로 두고, 손이 뻗은 쪽(손의 -Y)이 팔이 오는 방향과 가장 가깝도록
// 자루 둘레로 손을 돌린다 → 손목이 덜 꺾이고 주먹이 자루를 자연스럽게 감싼다
// side: 그 팔이 몸 바깥에서 안쪽으로 들어오는 방향. 어깨에서 곧장 오는 방향보다 이쪽을 더 따르게 해,
// 손이 자루 뒤(반대편 팔이 있는 자리)가 아니라 자기 쪽 옆에서 자루를 감싸게 한다
function gripQuat(axis, from, to, up, side) {
  const y = to.clone().sub(from).normalize().multiplyScalar(0.45).addScaledVector(side, 0.9);
  y.addScaledVector(axis, -y.dot(axis));
  if (y.lengthSq() < 1e-4) y.copy(up).addScaledVector(axis, -up.dot(axis));
  y.normalize().negate();
  return new THREE.Quaternion().setFromRotationMatrix(m4.makeBasis(V().crossVectors(y, axis), y, axis));
}

// 손목 펴기: 손이 뻗은 쪽(손의 -Y)과 아래팔 방향 f 사이가 max 보다 크게 꺾였으면, 넘친 만큼 손을 팔 쪽으로 되돌린다.
// 자루가 팔과 거의 나란할 때(내리친 직후 등) 주먹을 자루에 딱 맞추면 손목이 직각으로 꺾이므로,
// 주먹이 자루를 비스듬히 쥐는 것으로 나눠 갖는다 (도구 방향은 그대로: 오른손은 소켓을 반대로 돌려 맞춘다)
// 손목은 거의 꺾지 않는다: 주먹이 아래팔과 한 줄로 이어지고(위로도 아래로도 꺾이지 않음), 도구가 그 주먹을 비스듬히 지나간다.
// 손목을 꺾어 주먹을 자루에 직각으로 맞추면, 팔을 앞으로 뻗었을 때 손목이 봉긋 솟고 손이 자루를 위에서 누르는 꼴이 된다
const WRIST_MAX = 0.1;
function easeWrist(q, f, max = WRIST_MAX) {
  const down = V(0, -1, 0).applyQuaternion(q);
  const ang = down.angleTo(f);
  if (ang <= max) return q;
  const n = V().crossVectors(down, f);
  if (n.lengthSq() < 1e-8) return q;
  return q.premultiply(qR.setFromAxisAngle(n.normalize(), ang - max));
}

// dt: 밀어낸 정도를 프레임 사이에 부드럽게 잇는 데 쓴다
// aim: 액션이 직접 정한 쥘 자리와 도구 방향 { pos, dir } (몸통 기준). 없으면 오른팔 애니메이션이 정한 자세를 쓴다
function twoHandGrip(rig, y, w, dt, aim) {
  const torso = rig.shoulderL.parent;
  const sock = rig.rightSocket;
  const scale = rig.shoulderL.getWorldScale(V()).x;
  const T = torso.getWorldPosition(V());
  const torsoQ = torso.getWorldQuaternion(new THREE.Quaternion());
  // 애니메이션이 정한 도구 자세
  const Q0 = sock.getWorldQuaternion(new THREE.Quaternion());
  const P = sock.getWorldPosition(V());
  const P0 = P.clone();
  const L0 = rig.leftSocket.getWorldPosition(V());
  const handL0 = rig.handL.getWorldQuaternion(new THREE.Quaternion());
  const Q = Q0.clone();
  const grip2 = () => V(0, 0, y * scale).applyQuaternion(Q).add(P); // 왼손이 쥘 자리
  const SR = rig.shoulderR.getWorldPosition(V()), SL = rig.shoulderL.getWorldPosition(V());
  const up = V(0, 1, 0).applyQuaternion(torsoQ);
  // 각 팔이 자루로 들어오는 방향: 오른팔은 오른쪽에서 안쪽으로, 왼팔은 왼쪽 아래에서 안쪽 위로 (팔꿈치가 아래에 있으므로)
  const inward = { R: V(1, 0, 0).applyQuaternion(torsoQ), L: V(-1, 0.35, 0).normalize().applyQuaternion(torsoQ) };
  if (aim) {
    // 1') 액션이 정한 자리·방향 그대로 (몸통을 틀면 함께 돈다). 오른손도 팔이 오는 쪽에 맞춰 자루를 감싼다
    P.copy(torso.localToWorld(V(...aim.pos)));
    Q.copy(gripQuat(V(...aim.dir).normalize().applyQuaternion(torsoQ), SR, P, up, inward.R)).multiply(sock.quaternion);
  } else {
    // 1) 두 손 사이가 몸 한가운데 오도록 옆으로 옮긴다
    const mid = torso.worldToLocal(P.clone().add(grip2()).multiplyScalar(0.5));
    P.add(torso.localToWorld(V(-mid.x + 0.035, 0, 0)).sub(T)); // 한가운데보다 살짝 왼쪽: 도구를 쥔 오른팔이 가슴을 덜 가로지른다
  }
  // 2) 팔이 안 닿으면 가슴 앞으로 당긴다 (닿는 데까지만: 이분법으로 찾아 조금씩 변한다)
  const reach = 0.196 * scale;
  const far = (p0) => Math.max(SR.distanceTo(p0), SL.distanceTo(V(0, 0, y * scale).applyQuaternion(Q).add(p0))) - reach;
  if (far(P) > 0) {
    const chest = torso.localToWorld(V(0, rig.shoulderL.position.y - 0.04, 0.13));
    const pull = chest.sub(P.clone().add(grip2()).multiplyScalar(0.5));
    let lo = 0, hi = 1;
    for (let n = 0; n < 10; n++) {
      const f = (lo + hi) / 2;
      if (far(P.clone().addScaledVector(pull, f)) > 0) lo = f; else hi = f;
    }
    P.addScaledVector(pull, hi);
  }
  // 3) 도구와 두 주먹이 몸·머리에 박히면 밀어낸다. 밀어낸 양(몸통 기준)은 부드럽게 따라가게 해 프레임 사이에 튀지 않는다
  if (rig.colliders) {
    const tool = sock.children[0];
    const probes = (tool.userData.probes2 ??= [...toolProbes(sock).filter((q) => q.p.z > y - 0.005), { p: V(), rad: 0.03, hand: true }, { p: V(0, 0, y), rad: 0.03, hand: true }]);
    const P1 = P.clone();
    const Q1 = Q.clone();
    const fwd = V(0, 0, 1).applyQuaternion(torsoQ);
    clearTool(rig.toolColliders ?? rig.colliders, probes, P1, Q1, scale, fwd, V(1, 0, 0).applyQuaternion(torsoQ));
    // 도구는 안 박혀도 그 자리를 쥐려고 뻗은 아래팔이 가슴·배를 가로지를 수 있다: 쥐어 보고 박힌 만큼 도구를 더 민다
    const joints = ARM_JOINTS.map((k) => rig[k]);
    const saved = joints.map((j) => j.quaternion.clone());
    for (let it = 0; it < 6; it++) {
      const hq = Q1.clone().multiply(qA.copy(sock.quaternion).invert());
      armIK(rig, 'R', P1, hq, 1);
      armIK(rig, 'L', sock.localToWorld(V(0, 0, y)), hq, 1);
      const d = forearmHit(rig, bn);
      joints.forEach((j, n) => j.quaternion.copy(saved[n]));
      torso.updateMatrixWorld(true);
      if (d < 0.001 * scale) break;
      P1.addScaledVector(fwd, d * 1.05);
    }
    const inv = torsoQ.clone().invert();
    const dp = P1.sub(P).applyQuaternion(inv).divideScalar(scale);
    const dq = inv.clone().multiply(Q1.multiply(Q.clone().invert())).multiply(torsoQ);
    const st = (rig.toolFix ??= { dp: dp.clone(), dq: dq.clone() });
    // 더 밀어내야 할 때는 바로(박힌 채로 한두 장 지나가지 않게), 덜 밀어도 될 때는 천천히 돌아온다
    const more = dp.lengthSq() > st.dp.lengthSq() || Math.abs(dq.w) < Math.abs(st.dq.w);
    // (돌려 놓은 각은 빨리 푼다: 젖힐 때 머리를 피하느라 돌린 각이 타격 순간까지 남으면 몽둥이 끝이 아래로 끌려 처진다)
    const a = 1 - Math.exp(-(more ? 90 : 45) * dt);
    const aq = 1 - Math.exp(-(more ? 90 : 70) * dt);
    st.dp.lerp(dp, a);
    st.dq.slerp(dq, aq);
    P.add(st.dp.clone().multiplyScalar(scale).applyQuaternion(torsoQ));
    Q.premultiply(torsoQ.clone().multiply(st.dq).multiply(inv));
  }
  // 4) 두 팔을 뻗어 쥔다. 도구는 오른손에 붙어 있으므로 왼손은 오른손이 실제로 간 곳의 자루를 쥔다
  // 쥐는 중·놓는 중(w < 1)에는 관절 각도를 섞지 않고 '손이 갈 자리'를 섞는다: 애니메이션만의 손 자리 → 쥘 자리.
  // (각도를 섞으면 두 자세가 많이 다를 때 중간에서 팔이 휙 뒤집히며 손이 튄다)
  const wq = Math.min(1, w * 5); // 팔꿈치 방향만 처음에 잠깐 섞어 준다
  const Qw = Q0.clone().slerp(Q, w);
  // 쥐러 가는 길·놓고 돌아오는 길은 몸 앞으로 둥글게 돌아간다: 옆구리 옆의 손과 가슴 앞의 쥘 자리를 곧장 이으면 손이 배를 뚫고 지나간다
  const arc = V(0, 0, 1).applyQuaternion(torsoQ).multiplyScalar(0.07 * scale * Math.sin(Math.PI * w));
  const Pw = P0.lerp(P, w).add(arc);
  // 손목 펴기: 일단 쥐어 보고, 실제 아래팔(팔꿈치→손목) 방향에 견줘 손목이 한계보다 꺾였으면 주먹을 팔 쪽으로 되돌려 다시 쥔다.
  // 쥐기가 풀려 갈수록(w → 0) 한계를 풀어, 애니메이션 자세로 넘어갈 때 손이 튀지 않게 한다
  const limit = WRIST_MAX + (1 - w) * 0.4;
  const hold = (s, target, hq) => {
    armIK(rig, s, target, hq, wq, GRIP_POLE[s]);
    // 주먹을 되돌리면 손목 자리가 조금 옮겨져 아래팔 방향도 달라지므로 몇 번 되풀이해 맞춘다
    for (let n = 0; n < 3; n++) {
      const f = rig[`hand${s}`].getWorldPosition(V()).sub(rig[`elbow${s}`].getWorldPosition(V())).normalize();
      const w0 = hq.w, x0 = hq.x;
      easeWrist(hq, f, limit);
      if (hq.w === w0 && hq.x === x0) break;
      armIK(rig, s, target, hq, 1, GRIP_POLE[s]);
    }
    return hq;
  };
  // 오른손: 주먹을 되돌린 만큼 소켓을 반대로 돌려 도구 방향은 지킨다
  const handQ = hold('R', Pw, Qw.clone().multiply(qA.copy(sock.quaternion).invert()));
  sock.quaternion.copy(handQ).invert().multiply(Qw);
  sock.updateMatrixWorld(true);
  // 왼손은 오른손 방향을 그대로 베끼지 않고, 왼팔이 오는 쪽에 맞춰 자루를 감싼다
  const gL = sock.localToWorld(V(0, 0, y));
  hold('L', L0.lerp(gL, w).addScaledVector(arc, 1 - w), handL0.slerp(gripQuat(V(0, 0, 1).applyQuaternion(sock.getWorldQuaternion(qA)), SL, gL, up, inward.L), w));
}

// ── 한 손 쥐기: 한손검처럼 오른손 하나로 휘두르는 동작 ──
// aim: { pos, dir } 오른손이 쥘 자리와 칼이 뻗는 방향 (몸통 기준). 왼손은 건드리지 않는다 (동작이 관절 값으로 정한다)
// w: 0 → 1 로 애니메이션 자세에서 쥘 자리로 섞는 비율. 손 자리를 섞어야 두 자세가 많이 달라도 팔이 휙 뒤집히지 않는다
function oneHandGrip(rig, w, aim) {
  const torso = rig.shoulderR.parent;
  const sock = rig.rightSocket;
  const torsoQ = torso.getWorldQuaternion(new THREE.Quaternion());
  const SR = rig.shoulderR.getWorldPosition(V());
  const P = torso.localToWorld(V(...aim.pos));
  const up = V(0, 1, 0).applyQuaternion(torsoQ);
  const want = gripQuat(V(...aim.dir).normalize().applyQuaternion(torsoQ), SR, P, up, V(1, 0, 0).applyQuaternion(torsoQ));
  const P0 = sock.getWorldPosition(V());
  const Q0 = rig.handR.getWorldQuaternion(new THREE.Quaternion());
  const Qs = sock.getWorldQuaternion(new THREE.Quaternion()); // 애니메이션 자세의 칼 방향
  const Pw = P0.lerp(P, w);
  const hq = Q0.clone().slerp(want, w);
  const wq = Math.min(1, w * 5);
  armIK(rig, 'R', Pw, hq, wq, POLE.R, true);
  // 손목 펴기: 아래팔과 주먹이 한 줄이 되도록 주먹을 돌리고, 돌린 만큼 소켓을 반대로 돌려 칼 방향은 그대로 둔다
  const limit = WRIST_MAX + 0.35 + (1 - w) * 0.4; // 한손검은 손목을 조금 꺾어 쥐는 게 자연스럽다
  for (let n = 0; n < 3; n++) {
    const f = rig.handR.getWorldPosition(V()).sub(rig.elbowR.getWorldPosition(V())).normalize();
    const w0 = hq.w, x0 = hq.x;
    easeWrist(hq, f, limit);
    if (hq.w === w0 && hq.x === x0) break;
    armIK(rig, 'R', Pw, hq, 1, POLE.R, true);
  }
  // 소켓 월드 회전의 +Z(칼 축)가 dir 을 향하게: 쥔 주먹(want)과 같은 회전
  sock.quaternion.copy(hq).invert().multiply(Qs.slerp(want, w));
  sock.updateMatrixWorld(true);
}

// 몸 충돌 보정(collision.js)이 팔꿈치를 비튼 뒤에 한 번 더 손목을 편다: 팔꿈치만 옮겨지면 손은 그대로라 손목이 다시 꺾인다.
// 오른손은 돌린 만큼 소켓을 반대로 돌려 도구 방향을 지킨다
export function straightenWrists(rig) {
  const w = rig.twoHandW ?? 0;
  if (w < 0.001) return;
  const limit = WRIST_MAX + (1 - w) * 0.4;
  for (const s of ['R', 'L']) {
    const hand = rig[`hand${s}`];
    const f = hand.getWorldPosition(V()).sub(rig[`elbow${s}`].getWorldPosition(V())).normalize();
    const q = hand.getWorldQuaternion(new THREE.Quaternion());
    const w0 = q.w, x0 = q.x;
    easeWrist(q, f, limit);
    if (q.w === w0 && q.x === x0) continue;
    const sock = s === 'R' ? rig.rightSocket : null;
    const toolQ = sock?.getWorldQuaternion(new THREE.Quaternion());
    blendWorld(hand, q, 1);
    if (sock) { sock.quaternion.copy(q.invert().multiply(toolQ)); sock.updateMatrixWorld(true); }
  }
}

// 매 프레임: 낚싯줄·찌, 활시위·화살, 지팡이 빛 (fx는 액션이 내놓은 연출 값)
const v1 = V();
const v2 = V();
export function updateEquipment(rig, root, fx, t, dt, { equipment, action }) {
  // 들고 다니는 자세: 소켓 자체를 부드럽게 기울임 (액션 관절값과 따로 움직임)
  // 두 손으로 쥔 손이 다 풀린 뒤에 손목을 세운다 (풀리는 도중에 세우면 도구가 휙 돌아 손이 튄다)
  const carry = (CARRY_ACTIONS.has(action) || fx.carry) && !((rig.twoHandW ?? 0) > 0.4) ? EQUIPMENT[equipment]?.carry ?? [0, 0] : [0, 0];
  const k = 1 - Math.exp(-10 * dt);
  // (소켓 회전은 매 프레임 '든 각도'에서 새로 시작한다: 두 손 쥐기가 손목을 펴 주느라 소켓을 더 돌려 놓기 때문)
  const cx = (rig.carryX ??= [0, 0]);
  cx[0] += (carry[0] - cx[0]) * k;
  cx[1] += (carry[1] - cx[1]) * k;
  rig.rightSocket.rotation.set(cx[0], 0, 0);
  rig.leftSocket.rotation.set(cx[1], 0, 0);
  root.updateMatrixWorld(true);
  const grip = EQUIPMENT[equipment]?.twoHand;
  // 쥘 때는 빠르게(0.15초쯤), 놓을 때는 느긋하게
  const want = fx.twoHand && grip != null ? 1 : 0;
  if (want) rig.twoHandW = rig.twoHandW1 = (rig.twoHandW ?? 0) + (1 - (rig.twoHandW ?? 0)) * (1 - Math.exp(-22 * dt));
  else {
    // 놓을 때는 두 번 걸러 S자로 풀린다: 한 번만 거르면 놓는 첫 순간에 가장 빨리 움직여 툭 끊기는 느낌이 난다
    const kr = 1 - Math.exp(-16 * dt);
    rig.twoHandW1 = (rig.twoHandW1 ?? 0) * (1 - kr);
    rig.twoHandW = (rig.twoHandW ?? 0) + (rig.twoHandW1 - (rig.twoHandW ?? 0)) * kr;
  }
  // 놓는 동안에도 마지막으로 쥐던 자리를 기준으로 삼는다: 놓는 순간 기준이 오른팔 애니메이션 자세로 바뀌면 도구가 한 장 만에 휙 돈다
  if (fx.grip) rig.lastAim = fx.grip;
  else if (fx.twoHand) rig.lastAim = null; // 자리를 직접 정하지 않는 다른 두 손 동작이 시작되면 잊는다
  if (grip != null && rig.twoHandW > 0.001) twoHandGrip(rig, grip, rig.twoHandW, dt, rig.lastAim ?? null);
  else { rig.toolFix = null; rig.lastAim = null; } // 두 손 쥐기가 끝나면 밀어낸 기록을 지운다
  // 한 손 쥐기 (한손검): 쥘 때는 빠르게, 놓을 때는 조금 느긋하게. 놓는 동안에는 마지막 자리를 기준으로 삼는다
  if (fx.oneHand) rig.oneAim = fx.oneHand;
  const w1 = fx.oneHand ? 1 : 0;
  rig.oneHandW = (rig.oneHandW ?? 0) + (w1 - (rig.oneHandW ?? 0)) * (1 - Math.exp(-(w1 ? 40 : 14) * dt));
  if (rig.oneAim && rig.oneHandW > 0.001) oneHandGrip(rig, rig.oneHandW, rig.oneAim);
  else rig.oneAim = null;
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
