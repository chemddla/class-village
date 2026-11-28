// 짹짹이: 참새 몬스터 (하찮은 쪼렙). 동글동글 작은 몸으로 콩콩 뛰어다니며 짹짹, 맞으면 깃털이 펑
// 구구·깍깍이와 같은 makePigeon 뼈대에 참새 무늬·체형만 바꿔 입힌다 (게임에 넣을 때 같은 방식으로 쓸 수 있게)
// 몸(makeJjaek)과 동작(JJAEK_MOTIONS)은 몬스터 시안 화면(monsters.html?set=jjaek)과 함께 쓴다
import * as THREE from 'three';
import { canvasTexture } from '../villager/textures.js';
import { bump } from './haaknyang.js';
import { angerMark, angerPulse } from './anger.js';
import { makePigeon, STAND_Y, gease, gseg, poseSmoother, foldShellGeo } from './gugu.js';
import { syncToon } from '../villager/toon.js';

const PI = Math.PI;
const mat = (color, rough = 0.6) => new THREE.MeshStandardMaterial({ color, roughness: rough });
function mesh(geo, m, parent, name = '부품') {
  const o = new THREE.Mesh(geo, m);
  o.name = name;
  o.castShadow = true;
  parent.add(o);
  return o;
}
const ball = (r, n = 16) => new THREE.SphereGeometry(r, n, Math.round(n * 0.75));

// 참새 색
const C = {
  belly: '#e4ddd0', // 배: 흰빛 도는 회갈색
  back: '#9b6a42', // 등: 갈색
  streak: '#3b2618', // 등 줄무늬: 짙은 밤색
  buff: '#d1ab7c', // 깃 가장자리: 옅은 황갈색
  crown: '#8a4024', // 정수리·뒷목: 적갈색
  cheek: '#f4f0e8', // 흰 뺨
  black: '#1f1a17', // 뺨 점·턱밑·눈선
};

// ── 참새 몸 ──
// 몸 그림: 가로는 몸 둘레(양 끝 0·1 이 배·얼굴 쪽, 가운데 0.5 가 등·뒤통수), 세로는 꽁지(아래) → 정수리(위)
// 눈 높이는 v 0.73 쯤, 몸통은 v 0.3 쯤
// 머리 둘레: 0·1 이 얼굴(부리) 쪽, 0.25·0.75 가 눈 있는 옆, 0.5 가 뒤통수
const bodyTex = () => canvasTexture('sparrowBody7', 128, 256, (g, w, h) => {
  const Y = (v) => (1 - v) * h;
  const blob = (x, v, rx, rv, col) => { g.fillStyle = col; g.beginPath(); g.ellipse(w * x, Y(v), w * rx, h * rv, 0, 0, PI * 2); g.fill(); };
  const both = (x, v, rx, rv, col) => { blob(x, v, rx, rv, col); blob(1 - x, v, rx, rv, col); }; // 양옆 똑같이
  g.fillStyle = C.belly;
  g.fillRect(0, 0, w, h);
  g.filter = 'blur(4px)';
  g.fillStyle = '#d8c4a6'; // 옆구리: 옅은 황갈색이 배 쪽으로 번짐
  g.fillRect(w * 0.12, Y(0.55), w * 0.76, Y(0.05) - Y(0.55));
  g.fillStyle = C.back; // 등: 꽁지 밑동부터 뒷목까지 (뒤통수 모자와 끊기지 않게 이어짐)
  g.fillRect(w * 0.27, Y(0.7), w * 0.46, Y(0.03) - Y(0.7));
  g.filter = 'blur(2px)';
  // 둘레 전체를 칠하는 띠는 그림 밖까지 넓게 칠함 (흐리기가 양 끝을 옅게 만들면 얼굴 가운데에 이음선이 생김)
  g.fillStyle = C.cheek; // 흰 목테: 목 앞·옆만 (뒷목은 갈색 모자가 등으로 이어지게 비움)
  g.fillRect(-w * 0.2, Y(0.635), w * 0.47, Y(0.565) - Y(0.635));
  g.fillRect(w * 0.73, Y(0.635), w * 0.47, Y(0.565) - Y(0.635));
  both(0.19, 0.69, 0.15, 0.06, C.cheek); // 흰 뺨: 눈 아래 띠 (부리 쪽에서 뒤로)
  // 갈색 모자 (옆에서 볼 때): 정수리·이마를 덮고 눈 높이까지 내려오며, 뒤통수에서 뒷목을 지나 등 갈색으로 스르르 이어짐
  g.fillStyle = C.crown;
  g.fillRect(-w * 0.2, Y(1.05), w * 1.4, Y(0.748) - Y(1.05));
  // 뒷목: 적갈색 → 등 갈색. 경계를 둥글고 흐리게 (곧은 세로 경계면 옆에서 볼 때 눈 뒤 흰 부분이 네모로 잘려 보임)
  g.filter = 'blur(5px)';
  const nape = g.createLinearGradient(0, Y(0.8), 0, Y(0.6));
  nape.addColorStop(0, C.crown);
  nape.addColorStop(1, C.back);
  g.fillStyle = nape;
  g.beginPath(); g.ellipse(w * 0.5, Y(0.7), w * 0.27, h * 0.13, 0, 0, PI * 2); g.fill();
  g.filter = 'blur(2px)';
  both(0.17, 0.695, 0.13, 0.05, C.cheek); // 흰 뺨을 한 번 더 또렷하게 (뒷목 갈색이 번져 덮지 않게)
  g.filter = 'blur(0.8px)';
  for (const x of [0, w]) { // 검은 턱받이: 부리 바로 밑에서 목으로 세로로 내려오는 방패 모양 (사진처럼)
    g.fillStyle = C.black;
    g.beginPath(); g.ellipse(x, Y(0.655), w * 0.05, h * 0.055, 0, 0, PI * 2); g.fill();
  }
  // 눈가면·눈선·뺨 점은 머리 겉면에 직접 그림 (paintEyes)
  g.filter = 'none';
  g.lineCap = 'round';
  for (let i = 0; i < 5; i++) { // 등 줄무늬: 짙은 줄과 옅은 줄을 번갈아
    const x = w * (0.36 + i * 0.07);
    g.strokeStyle = i % 2 ? C.buff : C.streak;
    g.lineWidth = i % 2 ? 3 : 5;
    g.beginPath(); g.moveTo(x, Y(0.52)); g.quadraticCurveTo(x + (i - 2) * 3, Y(0.35), x + (i - 2) * 5, Y(0.15)); g.stroke();
  }
});
// 날개 그림: 왼쪽이 뿌리, 위가 앞 가장자리, 아래가 뒤 가장자리
const armTex = () => canvasTexture('sparrowArm', 128, 64, (g, w, h) => {
  g.fillStyle = '#8c5631';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#6e4226';
  g.fillRect(0, 0, w, h * 0.3); // 앞 덮깃은 조금 짙게
  g.fillStyle = '#f1ebe0'; // 흰 날개띠 두 줄
  g.fillRect(0, h * 0.3, w, h * 0.06);
  g.fillRect(0, h * 0.52, w, h * 0.05);
  for (let i = 0; i < 8; i++) { // 뒤쪽 깃: 짙은 가운데에 옅은 가장자리
    const x = w * (0.04 + i * 0.12);
    g.fillStyle = C.buff;
    g.beginPath(); g.ellipse(x + w * 0.05, h * 0.82, w * 0.06, h * 0.22, 0, 0, PI * 2); g.fill();
    g.fillStyle = C.streak;
    g.beginPath(); g.ellipse(x + w * 0.05, h * 0.8, w * 0.035, h * 0.18, 0, 0, PI * 2); g.fill();
  }
});
const handTex = () => canvasTexture('sparrowHand', 128, 64, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, w, 0);
  gr.addColorStop(0.2, '#7a4d2e');
  gr.addColorStop(0.75, '#3a281b');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = C.buff;
  g.lineWidth = 2;
  for (let i = 0; i < 7; i++) { // 날개깃 가장자리가 옅게
    g.beginPath(); g.moveTo(w * 0.05, h * 0.35); g.quadraticCurveTo(w * (0.25 + i * 0.08), h * 0.5, w * (0.18 + i * 0.13), h * (1 - i * 0.07)); g.stroke();
  }
});

// 접은 날개 그림: 가로는 어깨(0) → 날개 끝(1), 세로는 위가 날개 윗가장자리(등 쪽)
// 사진 속 참새 날개: 어깨는 적갈색 덮깃, 그 뒤로 흰 날개띠 한 줄, 윗부분은 검은 가운데·황갈색 가장자리의 긴 깃이 뒤로 겹쳐 늘어서고,
// 아랫부분·끝은 회갈색 첫째날개깃에 옅은 가장자리 결
const foldTex = () => canvasTexture('sparrowFold3', 256, 128, (g, w, h) => {
  g.fillStyle = '#93613c';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#6f5444'; // 아래·끝: 첫째날개깃 회갈색
  g.fillRect(0, h * 0.62, w, h * 0.38);
  g.fillRect(w * 0.72, 0, w * 0.28, h);
  g.filter = 'blur(4px)';
  g.fillStyle = '#8a4426'; // 어깨 덮깃: 적갈색
  g.beginPath(); g.ellipse(w * 0.08, h * 0.4, w * 0.16, h * 0.55, 0, 0, PI * 2); g.fill();
  g.filter = 'none';
  // 긴 깃 (셋째날개깃·덮깃): 뒤로 가늘고 길게, 앞 깃이 뒤 깃을 덮도록 뒤에서부터 그림
  for (let i = 6; i >= 0; i--) {
    const x = w * (0.34 + i * 0.065), y = h * (0.1 + (i % 3) * 0.12);
    g.fillStyle = C.buff;
    g.beginPath(); g.ellipse(x, y, w * 0.15, h * 0.085, 0.1, 0, PI * 2); g.fill();
    g.fillStyle = '#2b1c13';
    g.beginPath(); g.ellipse(x - w * 0.015, y, w * 0.12, h * 0.04, 0.1, 0, PI * 2); g.fill();
  }
  g.strokeStyle = '#f2ece2'; // 흰 날개띠: 덮깃 밑을 따라 앞에서 뒤로 가로지르는 한 줄
  g.lineCap = 'round';
  g.lineWidth = h * 0.06;
  g.beginPath(); g.moveTo(w * 0.1, h * 0.5); g.quadraticCurveTo(w * 0.25, h * 0.47, w * 0.4, h * 0.52); g.stroke();
  g.strokeStyle = 'rgba(214,186,150,0.75)'; // 첫째날개깃 가장자리 결: 뒤로 길게
  g.lineWidth = 2;
  for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(w * (0.3 + i * 0.04), h * (0.68 + i * 0.06)); g.lineTo(w, h * (0.5 + i * 0.1)); g.stroke(); }
  // 앞(어깨) 가장자리는 밑의 몸 색으로 스르르: 날개 앞 모서리가 짙은 네모처럼 도드라져 뒷목에 홈이 팬 듯 보이지 않게
  const edge = (y0, y1, col) => {
    const gr = g.createLinearGradient(0, 0, w * 0.16, 0);
    gr.addColorStop(0, col);
    gr.addColorStop(0.45, col);
    gr.addColorStop(1, `${col}00`);
    g.fillStyle = gr;
    g.fillRect(0, h * y0, w * 0.16, h * (y1 - y0));
  };
  edge(0, 0.55, C.back); // 위: 등 갈색
  edge(0.55, 1, '#d8c4a6'); // 아래: 옆구리 황갈색
});
// 둥근 두상: 비둘기 머리는 정수리가 고깔처럼 뾰족해서, 머리 뼈에 붙은 정점들을 머리 가운데 둘레의 타원체 쪽으로 끌어당긴다
// (사진 속 참새처럼 넓고 둥근 돔. 머리에 붙은 정도(skinWeight)만큼만 움직여 목·몸과의 이음은 그대로)
const HEAD_R = [0.0172, 0.0168, 0.0172]; // 타원체 반지름 (옆·위아래·앞뒤, 머리 크기 적용 전)
// 머리에서 등까지 매끈하게 잇기: 머리 뼈를 목보다 크게 키워, 목에서 머리로 넘어가는 몇 개 고리 사이에서 굵기가 확 바뀜
// → 뒷목에 턱·홈·혹이 생기고 외곽선이 그 꺾임을 드러냄 (옆 윤곽만 고치면 다른 각도에서 능선·혹이 보임)
// 그래서 어깨 쪽 고리(rA)와 머리 밑 고리(rB) 사이 고리들을 버리고, 두 고리를 매끈한 곡선(에르미트: 양 끝의 기울기까지 이어짐)으로 새로 잇는다
// 단면의 모든 점(위·옆·아래)이 각각 매끈한 곡선을 따라 굵어지므로 어느 방향에서 봐도 움푹 들어가거나 튀어나온 곳이 없음
// 머리·목 뼈를 키운 '눈에 보이는 모양'에서 계산하고, 옮긴 자리를 뼈 키우기 전 좌표로 되돌려 넣는다
// rA·rB: 몸통 고리 번호 (61개 중, 꼬리 0 → 정수리 60). 그 사이가 새로 이어짐
export const NAPE = { rA: 25, rB: 43 };
function fillNape(P) {
  const N = NAPE, skin = P.g.getObjectByName('몸'), pos = skin.geometry.attributes.position, RING_N = 29;
  P.g.updateMatrixWorld(true);
  skin.skeleton.update();
  // 정점마다 '뼈 적용' 변환 행렬 (가중치가 정점마다 고정이라 위치에 대해 일차 변환)
  const o = new THREE.Vector3(), ex = new THREE.Vector3(), ey = new THREE.Vector3(), ez = new THREE.Vector3();
  const posed = [], mats = [];
  for (let i = 0; i < pos.count; i++) {
    const T = (x, y, z, out) => skin.applyBoneTransform(i, out.set(x, y, z));
    T(0, 0, 0, o); T(1, 0, 0, ex).sub(o); T(0, 1, 0, ey).sub(o); T(0, 0, 1, ez).sub(o);
    const M = new THREE.Matrix4().makeBasis(ex, ey, ez).setPosition(o);
    mats.push(M);
    posed.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(M));
  }
  const P_ = (r, j) => posed[r * RING_N + j];
  const span = N.rB - N.rA;
  const inv = new THREE.Matrix4(), p = new THREE.Vector3(), mA = new THREE.Vector3(), mB = new THREE.Vector3();
  for (let j = 0; j < RING_N; j++) {
    // 양 끝의 기울기: 이웃 고리와의 차이 × 구간 길이 (끝에서 바깥 고리와 매끈하게 이어지게)
    mA.subVectors(P_(N.rA, j), P_(N.rA - 1, j)).multiplyScalar(span);
    mB.subVectors(P_(N.rB + 1, j), P_(N.rB, j)).multiplyScalar(span);
    for (let r = N.rA + 1; r < N.rB; r++) {
      const t = (r - N.rA) / span, t2 = t * t, t3 = t2 * t;
      p.copy(P_(N.rA, j)).multiplyScalar(2 * t3 - 3 * t2 + 1)
        .addScaledVector(mA, t3 - 2 * t2 + t)
        .addScaledVector(P_(N.rB, j), -2 * t3 + 3 * t2)
        .addScaledVector(mB, t3 - t2);
      const i = r * RING_N + j;
      o.copy(p).applyMatrix4(inv.copy(mats[i]).invert()); // 뼈 적용 전 자리로 되돌림
      pos.setXYZ(i, o.x, o.y, o.z);
    }
  }
  pos.needsUpdate = true;
  skin.geometry.computeVertexNormals();
}
function roundHead(P) {
  const skin = P.g.getObjectByName('몸');
  const geo = skin.geometry, pos = geo.attributes.position, sw = geo.attributes.skinWeight;
  const c = P.head.position, v = new THREE.Vector3(), d = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const k = sw.getZ(i); // 머리 뼈 몫
    if (k <= 0) continue;
    v.fromBufferAttribute(pos, i);
    d.subVectors(v, c);
    const len = d.length();
    if (len < 1e-6) continue;
    d.divideScalar(len);
    const r = 1 / Math.sqrt((d.x / HEAD_R[0]) ** 2 + (d.y / HEAD_R[1]) ** 2 + (d.z / HEAD_R[2]) ** 2); // 그 방향의 타원체 반지름
    const below = THREE.MathUtils.clamp(-d.y * 1.6, 0, 1); // 아래(목 쪽)는 덜 움직여 목과 매끈하게
    v.copy(c).addScaledVector(d, THREE.MathUtils.lerp(len, r, k * 0.9 * (1 - below)));
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  // 정수리 끝 고리는 아주 작은 구멍으로 열려 있어 흰 점처럼 비침 → 고리를 한 점으로 모아 막음
  const RING_N = 29, last = pos.count - RING_N, mid = new THREE.Vector3();
  for (let j = 0; j < RING_N; j++) mid.add(v.fromBufferAttribute(pos, last + j));
  mid.divideScalar(RING_N);
  for (let j = 0; j < RING_N; j++) pos.setXYZ(last + j, mid.x, mid.y, mid.z);
  pos.needsUpdate = true;
}
// 몸 그늘 다듬기 (모양을 다 바꾼 뒤 마지막에)
function fixNormals(P) {
  const skin = P.g.getObjectByName('몸'), geo = skin.geometry, pos = geo.attributes.position, sw = geo.attributes.skinWeight;
  const c = P.head.position, d = new THREE.Vector3();
  geo.computeVertexNormals();
  // 몸 둘레가 만나는 이음매(배·얼굴 가운데)는 같은 자리에 정점이 둘이라 그늘 방향이 갈려 세로 줄이 보임 → 둘의 방향을 평균
  const nrm = geo.attributes.normal, RING = 29, n = new THREE.Vector3(), m = new THREE.Vector3();
  for (let a = 0; a + RING - 1 < nrm.count; a += RING) {
    const b = a + RING - 1;
    n.fromBufferAttribute(nrm, a).add(m.fromBufferAttribute(nrm, b)).normalize();
    nrm.setXYZ(a, n.x, n.y, n.z);
    nrm.setXYZ(b, n.x, n.y, n.z);
  }
  // 정수리 꼭짓점은 정점이 한 점에 모여 그늘이 깨짐(흰 점) → 머리는 가운데에서 바깥으로 향하는 둥근 그늘로
  for (let i = 0; i < pos.count; i++) {
    const k = sw.getZ(i) ** 2;
    if (k <= 0) continue;
    d.fromBufferAttribute(pos, i).sub(c).normalize();
    if (d.y < -0.3) continue;
    n.fromBufferAttribute(nrm, i).lerp(d, k).normalize();
    nrm.setXYZ(i, n.x, n.y, n.z);
  }
  nrm.needsUpdate = true;
  geo.computeBoundingSphere();
}

// 머리에 그린 눈: 비둘기 눈 자리에서 머리 가운데로부터 겉면까지 빛을 쏴 눈 가운데를 찾고,
// 그 둘레의 동그라미 점들도 하나씩 겉면에 투영해 살짝(겹칠 만큼만) 띄운다. 까만 눈 + 반짝 점
// 돌려주는 값: 눈 가운데에 놓인 묶음 둘 (깜빡일 때 위아래로 납작하게)
const EYE_GEO = new Map();
function paintEyes(P, skin, shapeKey) {
  P.g.updateMatrixWorld(true);
  skin.skeleton.update(); // 넓힌 머리·목 뼈가 빛 검사에 들어가게
  const side0 = skin.material.side;
  skin.material.side = THREE.DoubleSide;
  const ray = new THREE.Raycaster();
  const hc = P.head.getWorldPosition(new THREE.Vector3());
  const toHead = P.head.matrixWorld.clone().invert();
  const onSkin = (p, lift) => { // 머리 가운데 → p 방향으로 겉면을 찾아 lift 만큼 띄움 (머리 자리 좌표로)
    const d = p.clone().sub(hc).normalize();
    ray.set(hc, d);
    const h = ray.intersectObject(skin, false)[0]; // 머리 안에서 쏘았으니 처음 닿는 곳이 머리 겉면
    return (h ? h.point : p).clone().addScaledVector(d, lift).applyMatrix4(toHead);
  };
  const out = [-1, 1].map((s) => {
    // 눈 자리: 사진처럼 머리 옆 가운데보다 앞쪽(부리 쪽), 부리와 비슷한 높이 (머리 자리 좌표, 머리 크기 적용 전)
    const ew = P.head.localToWorld(new THREE.Vector3(s * 0.012, 0.0015, 0.0105));
    const cW = onSkin(ew, 0).applyMatrix4(P.head.matrixWorld); // 눈 가운데 (월드)
    const n = cW.clone().sub(hc).normalize();
    const u = new THREE.Vector3(0, 1, 0).cross(n).normalize(); // 겉면 위 가로 (-s 쪽이 부리 쪽)
    const v = n.clone().cross(u).normalize(); // 겉면 위 세로 (위쪽)
    const c = onSkin(cW, 0);
    const grp = new THREE.Group(); // 눈 (깜빡일 때 납작해짐)
    grp.position.copy(c);
    P.head.add(grp);
    const face = new THREE.Group(); // 눈가면·뺨 점 (깜빡여도 그대로)
    face.position.copy(c);
    P.head.add(face);
    // 타원 (rx 가로·ry 세로, 가운데 dx·dy, 기울기 rot) 을 겉면에 투영해 lift 만큼 띄워 그림
    const disc = (rx, ry, dx, dy, lift, color, parent = grp, rot = 0) => {
      const key = `${shapeKey}:${s}:${rx}:${ry}:${dx}:${dy}:${lift}:${rot}`;
      let geo = EYE_GEO.get(key);
      if (!geo) {
        const pos = [], idx = [], N = 24, RINGS = 4;
        const at = (x, y) => onSkin(cW.clone().addScaledVector(u, x).addScaledVector(v, y), lift).sub(c);
        pos.push(...at(dx, dy).toArray());
        const cr = Math.cos(rot), sr = Math.sin(rot);
        for (let k = 1; k <= RINGS; k++) for (let j = 0; j < N; j++) {
          const a = (j / N) * PI * 2, x = (Math.cos(a) * rx * k) / RINGS, y = (Math.sin(a) * ry * k) / RINGS;
          pos.push(...at(dx + x * cr - y * sr, dy + x * sr + y * cr).toArray());
        }
        for (let j = 0; j < N; j++) idx.push(0, 1 + j, 1 + ((j + 1) % N));
        for (let k = 1; k < RINGS; k++) for (let j = 0; j < N; j++) {
          const a = 1 + (k - 1) * N + j, b = 1 + (k - 1) * N + ((j + 1) % N);
          idx.push(a, a + N, b, b, a + N, b + N);
        }
        geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setIndex(idx);
        geo.computeVertexNormals();
        EYE_GEO.set(key, geo);
      }
      const m = mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: parent === grp ? 0.35 : 0.8, side: THREE.DoubleSide }), parent, '눈');
      m.castShadow = false;
      m.userData.noOutline = true;
      return m;
    };
    const F = -s; // u 에 곱하면 부리 쪽
    // 검은 눈가면: 눈 둘레에서 부리 밑동까지 (사진처럼 눈과 부리가 검은 띠로 이어짐)
    disc(0.0038, 0.003, 0, 0, 0.0001, C.black, face);
    disc(0.0078, 0.0021, F * 0.0068, -0.001, 0.00012, C.black, face, F * -0.1); // 눈선: 부리 밑동까지 끊김 없이
    // 뺨의 검은 점: 흰 뺨 가운데, 눈 뒤 아래
    disc(0.0032, 0.0028, -F * 0.0062, -0.0072, 0.0001, C.black, face);
    disc(0.0022, 0.0022, 0, 0, 0.00025, '#3a2216'); // 눈: 작고 짙은 밤색 (검은 눈가면에 묻힌 듯)
    disc(0.0007, 0.0007, F * 0.0007, 0.0008, 0.0005, '#ffffff'); // 반짝 점 (위쪽 앞)
    return grp;
  });
  skin.material.side = side0;
  return out;
}

// 기본 체형: 사진 속 참새처럼 통통하되 앞뒤로 조금 길고, 머리가 크다. size: 비둘기에 견준 전체 크기
export const JJ_BODY = { fat: 1.05, len: 0.8, neckH: 0.72, wing: 0.85, size: 0.42 };
// 접은 날개 자리 (jFold): x 몸 옆면에서 더 나간 만큼 · y 어깨 높이 · z 어깨 앞뒤 · lean 안쪽 기울기 · pitch 끝 내림 · yaw 끝 모음
export const JJ_FOLD = { x: 0.0015, y: 0.0063, z: 0.0033, lean: -0.32, pitch: 0, yaw: 0.2 };
export function makeJjaek(look = {}) {
  const { size, fold, tailW = 0.8, tailL = 1.55, tailT = 0.6, head = [1.55, 1.38, 1.4], neckW = [1.5, 1.2, 1.35], ...shape } = { ...JJ_BODY, ...look };
  const P = makePigeon({ foldShell: false, softFlap: false, grey: C.belly, wingC: '#8c5631', tipC: '#3a281b', neck: C.belly, neck2: C.belly, eye: 'dot',
    tailC: ['#8a6242', '#5e412b'], legC: '#b88a6c', ...shape });
  // 등선 맞추기(backLine)는 쓰지 않음: 둥근 두상(roundHead)과 굵은 목으로 등이 뒤통수까지 저절로 둥글게 이어지는데,
  // 등선을 주면 그 구간이 끝나는 뒷목에서 몸이 원래 모양으로 급히 돌아가 턱이 튀어나옴
  P.g.getObjectByName('몸').material.map = bodyTex();
  roundHead(P);
  P.wings.forEach(([arm, , hand]) => {
    arm.children.forEach((m) => { if (m.isMesh) m.material = new THREE.MeshStandardMaterial({ roughness: 0.85, map: armTex() }); });
    hand.children.forEach((m) => { if (m.isMesh) m.material = new THREE.MeshStandardMaterial({ roughness: 0.85, map: handTex() }); });
  });
  P.g.getObjectByName('코').visible = false; // 비둘기 부리 위 흰 혹은 없음
  // 부리: 짧고 뭉툭한 씨앗 까는 부리 + 짹짹 벌리는 아랫부리
  // 사진처럼 짧고 두툼한 원뿔, 눈높이 가까이. 부리 밑동 양쪽 끝은 노랗다
  const BEAK = mat('#3a3533', 0.4);
  P.beak.geometry = new THREE.ConeGeometry(0.0046, 0.0082, 14).rotateX(PI / 2).translate(0, 0.0002, 0.0192);
  P.beak.material = BEAK;
  P.jaw = new THREE.Group();
  P.jaw.position.set(0, -0.0028, 0.0158);
  P.head.add(P.jaw);
  mesh(new THREE.ConeGeometry(0.0034, 0.0068, 12).rotateX(PI / 2).translate(0, 0, 0.0034), BEAK, P.jaw, '부리');
  [-1, 1].forEach((s) => { // 부리 밑동 노란 끝
    const y = mesh(ball(0.0011, 10).scale(1, 0.7, 1), mat('#e2bb46', 0.5), P.head, '부리');
    y.position.set(s * 0.0036, -0.0017, 0.0158);
  });
  // 눈: 튀어나온 구슬 대신 머리에 그린 것처럼. 눈 모양 점들을 실제 머리 겉면에 하나씩 투영해 겉면에 딱 붙인다
  // (둥근 조각을 얹으면 머리 곡면과 달라 한쪽은 묻히고 한쪽은 떠서 귀처럼 보임)
  // 크기(머리·목·몸)를 먼저 정해 둔다: 눈과 접은 날개는 정해진 몸 겉면을 재서 만들기 때문 (나중에 목을 넓히면 날개가 몸에 묻힘)
  P.slim = () => { // reset 이 되돌리니 매번 다시
    P.body.scale.setScalar(size);
    P.head.scale.set(...(Array.isArray(head) ? head : [head, head, head])); // 머리는 사진처럼 크고 옆으로 넓게
    P.neck.scale.set(...neckW); // 목을 옆으로 굵게: 사진처럼 목 없이 머리가 몸에 그대로 이어짐
  };
  P.slim();
  fillNape(P); // 머리·목 크기를 정한 뒤, 눈에 보이는 모양에서 뒷목을 메움
  fixNormals(P);
  const geoKey = JSON.stringify([shape.fat, shape.len, shape.neckH, head, neckW, NAPE]); // 같은 체형이면 눈·날개 모양을 한 번만 만듦
  P.eyes.forEach((e) => (e.visible = false)); // 비둘기 눈 구슬은 숨김
  P.paintEyes = paintEyes(P, P.g.getObjectByName('몸'), geoKey);
  P.blink = (k) => P.paintEyes.forEach((g) => (g.scale.y = 1 - k * 0.9));
  P.mark = angerMark();
  P.mark.position.set(0.012, 0.028, -0.004);
  P.head.add(P.mark);
  P.angry = (t, on = 1) => { P.mark.visible = on > 0; P.mark.scale.setScalar(0.02 * angerPulse(on ? t % 10 : -1, t)); };
  P.shape = { fat: shape.fat, len: shape.len, wing: shape.wing };
  P.fold = { ...JJ_FOLD, ...fold };
  // 접은 날개 껍질 (선 자세에서 펴는 날개판 대신 보임)
  const skin = P.g.getObjectByName('몸');
  const FM = new THREE.MeshStandardMaterial({ roughness: 0.8, map: foldTex(), side: THREE.DoubleSide });
  P.shells = [-1, 1].map((s) => mesh(foldShellGeo(skin, s, geoKey), FM, P.body, '접은날개'));
  P.shells.forEach((m) => {
    m.visible = false;
    m.userData.noOutline = true; // 몸에 붙은 껍질이라 가장자리에 외곽선을 그리면 어깨·뒷목에 홈이 팬 듯한 선이 생김 (바깥 윤곽은 몸이 그림)
  });
  // 꽁지: 사진처럼 몸 뒤로 길게 뻗음
  P.tail.children.forEach((m) => { if (m.isMesh) m.scale.set(tailW, tailT, tailL); }); // tailT: 꽁지깃 두께 배율 (얇은 깃처럼)
  return P;
}
// 매 프레임 처음 자세로 되돌린 뒤 동작을 얹는다
export const jReset = (P, t) => { P.reset(); P.slim(); P.blink(0); P.shells.forEach((m) => (m.visible = false)); P.wings.forEach(([w]) => (w.visible = true)); P.angry(t, 0); P.jaw.rotation.x = 0; };
// 땅에 선 자세: 날개 접고 가슴 내밀어 동그랗게, 꽁지는 살짝 들고
// 날개 접기 (k: 0 그대로 ~ 1 접음): 깍깍이처럼 날개판을 세워 옆구리에 착 붙인다.
// 날개 끝은 뒤로 꽁지 위까지, 앞 가장자리(짙은 덮깃·흰 날개띠)는 위로, 깃 끝 줄무늬는 아래로
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const FOLD_Q = {}, ID_Q = new THREE.Quaternion(), foldAt = new THREE.Vector3();
[-1, 1].forEach((s) => (FOLD_Q[s] = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(V3(0, 0, -s), V3(-s, 0, 0), V3(0, 1, 0)))));
// 반 넘게 접히면 날개판은 숨기고 몸에 붙은 접은 날개 껍질을 보임
export const jFold = (P, k) => {
  const shut = k > 0.5;
  P.shells.forEach((m) => (m.visible = shut));
  P.wings.forEach(([w]) => (w.visible = !shut));
  jFoldPlates(P, k);
};
const jFoldPlates = (P, k) => P.wings.forEach(([w, s, h]) => {
  const { fat } = P.shape, F = P.fold;
  w.quaternion.slerp(FOLD_Q[s], k);
  w.position.lerp(foldAt.set(s * (0.034 * fat + F.x), F.y, F.z), k); // 어깨 자리: 옆(x)·높이(y)·앞뒤(z)
  w.rotateX(F.lean * k); // 음수: 윗가장자리를 몸 쪽으로 기울여 둥근 옆구리에 붙임 (이 축은 양쪽 날개 모두 + 가 바깥이라 s 를 곱하지 않음)
  w.rotateY(s * F.pitch * k); // 날개 끝을 아래로(+) 내림: 어깨에서 꽁지 쪽으로 비스듬히
  w.rotateZ(s * F.yaw * k); // 날개 끝은 안쪽으로 모아 꽁지 위에 얹음
  h.quaternion.slerp(ID_Q, k);
});
// 땅에 선 자세: 날개 접고 몸은 거의 수평, 꽁지는 몸에서 곧게 뻗음 (사진 속 참새처럼)
export const jStand = (P, fold = 1) => { jFold(P, fold); P.fly.position.y = STAND_Y; P.body.rotation.x = -0.14; P.feet.forEach((f) => (f.rotation.x = 0)); P.tail.rotation.x = -0.08; }; // 가슴을 살짝 들고 꽁지는 조금 처짐
// 끝에서 속도가 0으로 줄어드는 혹·맥박 (bump·max(0,sin) 은 시작·끝에서 속도가 뚝 끊겨 한 프레임에 툭 멈춤)
const sbump = (c, a, b) => bump(c, a, b) ** 2;
const pulse = (x) => Math.max(0, Math.sin(x)) ** 2;
const chirp = (P, c, rate = 0.22) => { const k = bump(c % rate, 0, rate * 0.8); P.jaw.rotation.x = k * 0.6; P.head.rotation.x -= k * 0.25; return k; };
const jBlink = (P, t) => P.blink(bump(t % 2.6, 2.45, 2.6));

// 깃털 몇 장: 갈색·흰색이 섞여 펑, 살랑살랑 내려앉으며 사라짐
const FEATHER = ball(1, 10).scale(0.0022, 0.0004, 0.006);
export const jPuff = (P, n = 6) => {
  const fs = [];
  for (let i = 0; i < n; i++) {
    const f = mesh(FEATHER, mat(i % 3 === 0 ? C.cheek : i % 3 === 1 ? C.back : C.buff, 0.85), P.g, '깃털');
    f.userData.noOutline = true;
    f.visible = false;
    fs.push(f);
  }
  return (u, at) => fs.forEach((f, i) => {
    f.visible = u > 0 && u < 1.6;
    if (!f.visible) return;
    const a = (i / n) * PI * 2 + 0.3;
    const out = 1 - Math.exp(-u * 7);
    const sway = Math.sin(u * 6 + i * 1.7) * Math.min(1, u * 2);
    f.position.set(at.x + Math.cos(a) * 0.035 * out + sway * 0.005, Math.max(0.002, at.y + 0.02 * out - Math.max(0, u - 0.25) * 0.03), at.z + Math.sin(a) * 0.035 * out);
    f.rotation.set(0.5 + sway * 0.5, a + u * 1.5, sway * 0.7);
    f.scale.setScalar(1 - gease(gseg(u, 1.1, 1.6)));
  });
};

// 동작 목록: { name, desc, update(P, t, X), extra(P) → X }. 매 프레임 jReset 한 뒤 update 를 부름
export const JJAEK_MOTIONS = [];
const jmotion = (name, desc, update, extra) => JJAEK_MOTIONS.push({ name, desc, update, extra });

jmotion('서 있기', '모양 보기용: 가만히 선 옆모습 (체형·날개 자리 확인)', (P) => { jStand(P); P.plant(0); });

jmotion('대기', '동그랗게 서서 꽁지 까딱까딱, 고개 갸웃갸웃, 가끔 몸 부풀리기', (P, t) => {
  const c = t % 4;
  jStand(P);
  P.tail.rotation.x += pulse(t * 9) * 0.35 * (c < 1.5 ? 1 : 0.2); // 참새답게 꽁지를 쉴 새 없이 까딱
  const tilt = Math.sign(Math.sin(t * 1.3)); // 고개를 휙휙 갸웃
  P.head.rotation.z = tilt * 0.3;
  P.head.rotation.y = tilt * 0.35;
  const fluff = sbump(c, 2.6, 3.6); // 깃 부풀려 동글
  P.body.scale.multiplyScalar(1 + fluff * 0.1);
  P.wings.forEach(([w, s]) => (w.rotation.z += s * fluff * 0.12));
  P.plant(0);
  jBlink(P, t);
});

jmotion('콩콩 뛰기', '두 발 모아 콩콩콩, 서서 두리번, 돌아서 다시', (P, t) => {
  const c = t % 3;
  const d = Math.floor(t / 3) % 2 ? -1 : 1; // 갔다가 돌아옴
  jStand(P);
  P.fly.rotation.y = (d > 0 ? 0 : PI) + gease(gseg(c, 2.6, 3)) * PI;
  let hop = 0;
  if (c < 1.8) {
    const ph = (c * 3.3) % 1; // 빠르게 콩콩
    hop = Math.sin(ph * PI);
    P.fly.position.z = d * ((c / 1.8) * 0.06 - 0.03);
    P.feet.forEach((f) => (f.rotation.x = hop * 0.8));
    P.tail.rotation.x += sbump(ph, 0.7, 1) * 0.4;
    P.body.rotation.x -= hop * 0.12;
  } else {
    P.fly.position.z = d * 0.03;
    P.head.rotation.y = Math.sign(Math.sin(c * 7)) * 0.5 * (1 - gseg(c, 2.4, 2.6));
  }
  P.plant(0);
  P.fly.position.y += hop * 0.018;
  jBlink(P, t);
});

jmotion('모이 콕콕', '콕콕콕 빠르게 쪼고 고개 들어 오물오물, 두리번', (P, t) => {
  const c = t % 3;
  jStand(P);
  const peck = c < 1.4 ? pulse(c * PI * 5) * (1 - gease(gseg(c, 1.2, 1.4))) : 0;
  P.body.rotation.x += peck * 0.55; // 너무 숙이면 물구나무서듯 보임: 몸은 덜, 고개를 더
  P.head.rotation.x = peck * 0.65;
  P.tail.rotation.x += peck * 0.3;
  if (c > 1.5 && c < 2.2) P.jaw.rotation.x = Math.abs(Math.sin(c * 30)) * 0.2; // 오물오물
  P.head.rotation.y = sbump(c, 2.2, 2.9) * 0.6;
  P.plant(0);
  jBlink(P, t);
});

jmotion('짹짹', '가슴 펴고 짹짹짹! 짹마다 몸이 들썩, 꽁지도 까딱', (P, t) => {
  const c = t % 2.6;
  jStand(P);
  P.body.rotation.x -= 0.15; // 가슴 쭉
  if (c > 0.4 && c < 1.8) {
    const k = chirp(P, c - 0.4);
    P.body.position.y += k * 0.002;
    P.tail.rotation.x += k * 0.3;
    P.wings.forEach(([w, s]) => (w.rotation.z += s * k * 0.1));
  }
  P.head.rotation.y = c > 1.9 ? 0.4 : 0;
  P.plant(0);
  jBlink(P, t);
});

jmotion('포르르 날기', '포르르르 빠른 날갯짓, 물결치듯 오르내리며 날기', (P, t) => {
  const c = t % 1.2;
  const shut = sbump(c, 0.75, 1.15); // 참새도 잠깐 날개 접고 쑥
  P.flap(t, 32, 1.0 * (1 - shut), 0.15);
  P.sweep(shut * 0.9);
  P.fly.position.y = 0.13 + (c < 0.75 ? c / 0.75 : 1 - (c - 0.75) / 0.45) * 0.015;
  P.body.rotation.x = 0.1;
  P.feet.forEach((f) => (f.rotation.x = 1.3));
  P.head.rotation.x = -0.1;
});

jmotion('공격 (콕!)', '잔뜩 화나서 폴짝 뛰어 날개 파닥, 콕! (하나도 안 아파 보임)', (P, t) => {
  const c = t % 1.8;
  const crouch = sbump(c, 0, 0.4);
  const jump = sbump(c, 0.3, 0.85); // 뛰어오르고 내려앉는 끝에서 속도가 0
  const open = gease(gseg(c, 0.3, 0.45)) * (1 - gease(gseg(c, 0.8, 0.95)));
  const peck = sbump(c, 0.48, 0.7);
  P.flap(t, 30, 0.9, 0.3); // 펼친 날갯짓에서 접은 자세로 섞음
  jStand(P, 1 - open);
  P.fly.position.z = jump * 0.025;
  P.body.rotation.x += crouch * 0.25 + peck * 0.5;
  P.head.rotation.x = -crouch * 0.3 + peck * 0.5;
  P.head.position.z += peck * 0.008;
  P.tail.rotation.x += crouch * 0.3;
  P.feet.forEach((f) => (f.rotation.x = jump * 0.6));
  P.jaw.rotation.x = bump(c, 0.05, 0.3) * 0.6; // 덤비기 전에 짹!
  P.plant(0);
  P.fly.position.y += jump * 0.035 - crouch * 0.004;
  P.angry(t, 1);
});

jmotion('맞음', '짹! 비명, 깃털 펑, 뒤로 콩 튕겨 동그랗게 부풀었다 돌아옴', (P, t, X) => {
  const c = t % 1.4;
  const k = gease(gseg(c, 0.03, 0.25)) * Math.exp(-Math.max(0, c - 0.25) * 4.5); // 0.2초에 걸쳐 차올라 튕김 (확 켜지면 툭 튐)
  jStand(P);
  P.fly.position.z = -k * 0.022; // 작은 몸에 맞게 뒤로 조금만
  P.body.rotation.x -= k * 0.6;
  P.body.rotation.z = Math.sin(c * 30) * k * 0.25;
  P.body.scale.multiplyScalar(1 + k * 0.15); // 놀라서 깃 부풀림
  P.wings.forEach(([w, s], i) => (w.rotation.z += s * Math.abs(Math.sin(t * 34 + i * 2)) * k * 0.8));
  P.tail.rotation.x += k * 0.5;
  P.jaw.rotation.x = k * 0.7;
  P.blink(c > 0.1 && c < 0.6 ? 1 : 0);
  P.plant(0);
  P.fly.position.y += k * 0.012;
  X.puff(c - 0.1, new THREE.Vector3(0, 0.04, P.fly.position.z));
}, (P) => ({ puff: jPuff(P) }));

jmotion('쓰러짐', '비틀비틀하다 옆으로 픽, 발만 파르르, 스르르 사라짐', (P, t, X) => {
  const c = t % 3.6;
  jStand(P);
  const wob = 1 - gseg(c, 0.5, 0.8);
  P.body.rotation.z = Math.sin(c * 12) * 0.25 * wob;
  const lie = gease(gseg(c, 0.7, 1.0));
  P.body.rotation.z += lie * PI / 2;
  P.body.rotation.x = THREE.MathUtils.lerp(P.body.rotation.x, 0, lie);
  P.wings.forEach(([w, s]) => { if (s > 0) w.rotation.z += 0.5 * lie; }); // 위쪽 날개는 힘없이 벌어짐
  P.feet.forEach((f, i) => (f.rotation.x = lie * (0.3 + Math.sin(t * 24 + i) * 0.35 * Math.max(0, 1 - (c - 1.1) * 1.3))));
  P.blink(gseg(c, 0.4, 0.9));
  if (lie < 1) P.plant(0, 1 - lie);
  P.fly.position.y = THREE.MathUtils.lerp(P.fly.position.y, 0.03, lie);
  X.puff(c - 0.9, new THREE.Vector3(0, 0.02, 0));
  P.fly.scale.setScalar(Math.max(0.0001, gease(gseg(c, 0, 0.2)) * (1 - gease(gseg(c, 2.9, 3.4)))));
}, (P) => ({ puff: jPuff(P, 4) }));

// ── 게임용 짹짹이: 구구(createGugu)와 같은 모양 ──
// play(동작) · update(dt) · setAir(나들이 높이·자세) · setMood · state · time. 자리·방향은 게임이 root 로 정함
// 동작은 위 시안 동작(JJAEK_MOTIONS)을 그대로 쓰되, 자리를 옮기는 동작(콩콩 뛰기·날기)은 제자리 동작으로 바꿈
export const JJAEK_STATES = {
  idle: { label: '대기 (꽁지 까딱, 고개 갸웃)', loop: true },
  walk: { label: '콩콩 뛰기', loop: true },
  peck: { label: '모이 콕콕 (특기)', dur: 2.0 },
  fly: { label: '포르르 날아올랐다 내려앉기', dur: 2.4 },
  notice: { label: '발견! (화들짝 짹)', dur: 1.2 },
  angry: { label: '화남! (깃 부풀리고 짹짹)', dur: 1.4 },
  attack: { label: '공격 (폴짝 콕!)', dur: 1.4 },
  hit: { label: '맞음 (깃털 펑)', dur: 1.0 },
  die: { label: '쓰러짐', dur: 3.4 },
  spawn: { label: '등장 (포르르 내려앉음)', dur: 1.2 },
  air: { label: '날기 (나들이)', loop: true },
  perch: { label: '앉아 쉬기 (나무·머리 위)', loop: true },
};
const J_STRIKE = 0.59; // 시안 '공격 (콕!)' 에서 부리가 닿는 순간 (초) → 게임의 닿는 순간 0.47초에 맞춰 빨리 돌림
const J_FOOT = new Set(['발', '발가락', '발톱']);

const jwLerp0 = THREE.MathUtils.lerp;
export function createJjaek({ onDone = null, outlineScale = 1 } = {}) {
  const P = makeJjaek();
  const root = P.g; // 첫 자식(fly)이 몸 전체: 그림자가 이 크기·높이를 따라감
  root.name = '짹짹이';
  const M = Object.fromEntries(JJAEK_MOTIONS.map((m) => [m.name, m]));
  const X = { 맞음: M['맞음'].extra(P), 쓰러짐: M['쓰러짐'].extra(P) };
  const feathers = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (!o.userData.noOutline) o.userData.outlineWidth = J_FOOT.has(o.name) ? 0.0012 : 0.002; // 부품 크기와 상관없이 같은 두께
    if (o.name === '깃털') feathers.push(o);
  });
  const smooth = poseSmoother([root]); // 동작이 바뀌어도 자세가 툭 튀지 않게
  const run = (name, c) => M[name].update(P, c, X[name] ?? {});

  let state = 'idle', u = 0, t = 0;
  let lift = 0, move = 0, brake = 0, shake = 0, down = 0; // 나들이 자세 (구구와 같음)
  // 동작이 바뀌면 바로 전 자세에서 XF 초 동안 스르르 넘어감 (깍깍이와 같은 방식): 새 동작 첫 자세로 한 프레임 만에 바뀌면 툭 튐
  const parts = [];
  root.traverse((o) => { if (o !== root && !o.isMesh) parts.push(o); }); // 움직이는 묶음·뼈 (메시는 제 묶음을 따라감)
  let snap = null, snapT = 0, XF = 0.18;
  const q = new THREE.Quaternion();
  function play(name) {
    if (!JJAEK_STATES[name] && name !== 'gone') return;
    snap = name === 'gone' ? null : parts.map((o) => [o.position.clone(), o.quaternion.clone(), o.scale.clone(), o.visible]);
    snapT = 0;
    XF = state === 'air' || name === 'air' ? 0.3 : 0.18; // 날다 앉을 땐 키 차이가 커서 더 천천히
    state = name;
    u = 0;
  }
  // 땅에 섰을 때의 몸 높이 (날아오를 때 이 높이에서 출발해야 이륙 순간 툭 튀지 않음)
  const groundY = () => { jReset(P, t); jStand(P); P.plant(0); const y = P.fly.position.y; jReset(P, t); return y; };

  function update(dt) {
    t += dt;
    u += dt;
    jReset(P, t);
    feathers.forEach((f) => (f.visible = false)); // 맞음·쓰러짐 깃털이 다음 동작에 남지 않게
    if (state === 'idle') run('대기', t);
    else if (state === 'walk') { // 두 발 모아 제자리 콩콩 (앞으로 가는 건 게임이 정함)
      jStand(P);
      const ph = (t * 3.3) % 1, hop = Math.sin(ph * PI);
      P.feet.forEach((f) => (f.rotation.x = hop * 0.8));
      P.tail.rotation.x += sbump(ph, 0.7, 1) * 0.4;
      P.body.rotation.x -= hop * 0.12;
      P.plant(0);
      P.fly.position.y += hop * 0.018;
    } else if (state === 'peck') run('모이 콕콕', Math.min(u, 1.95));
    else if (state === 'fly') { // 짝! 포르르 떠올라 파닥이다 발 내밀고 내려앉음 (제자리)
      const up = gease(gseg(u, 0.1, 0.6)), land = gease(gseg(u, 1.7, 2.3));
      const air = up * (1 - land);
      const open = gease(gseg(u, 0, 0.12)) * (1 - gease(gseg(u, 2.2, 2.38))); // 날개를 스르르 폈다 접음
      if (open < 0.01) { jStand(P); P.plant(0); }
      else {
        const gy = groundY(); // 땅에 선 높이에서 출발·도착
        const br = sbump(u, 1.6, 2.3);
        P.flap(t, 32 + br * 8, open, (0.15 + br * 0.1) * open);
        P.fly.position.y = gy + air * 0.09 + Math.sin(t * 25) * 0.003 * air;
        P.body.rotation.x = jwLerp0(-0.14, 0.1 - br * 0.5, open);
        P.feet.forEach((f) => (f.rotation.x = jwLerp0(0, br > 0.1 ? 1.3 - br * 1.6 : 1.3, gease(gseg(u, 0.1, 0.35)) * (1 - gease(gseg(u, 2.1, 2.3))))));
      }
    } else if (state === 'notice') { // 화들짝: 폴짝 뛰며 깃 부풀리고 짹! 하고 빤히
      jStand(P);
      const jump = sbump(u, 0.02, 0.4), k = gease(gseg(u, 0.1, 0.3)) * (1 - gease(gseg(u, 0.9, 1.2)));
      P.body.scale.multiplyScalar(1 + k * 0.12);
      P.head.rotation.x -= k * 0.25;
      P.head.rotation.y = k * 0.6;
      P.jaw.rotation.x = bump(u, 0.05, 0.35) * 0.6;
      P.tail.rotation.x += k * 0.5;
      P.plant(0);
      P.fly.position.y += jump * 0.02;
    } else if (state === 'angry') { // 깃 잔뜩 부풀리고 짹짹짹, 화남 표시
      jStand(P);
      const k = gease(gseg(u, 0.05, 0.3)) * (1 - gease(gseg(u, 1.1, 1.4)));
      P.body.scale.multiplyScalar(1 + k * 0.15 + Math.sin(t * 40) * 0.01 * k);
      P.wings.forEach(([w, s]) => (w.rotation.z += s * k * 0.2));
      P.tail.rotation.x += k * 0.6;
      if (k > 0.3) P.jaw.rotation.x = bump(u % 0.2, 0, 0.16) * 0.6;
      P.angry(t, k > 0.1 ? 1 : 0);
      P.plant(0);
    } else if (state === 'attack') run('공격 (콕!)', Math.min(u * (J_STRIKE / 0.47), 1.79));
    else if (state === 'hit') run('맞음', Math.min(u * 1.3, 1.39));
    else if (state === 'die') run('쓰러짐', 0.2 + Math.min(u, 3.2)); // 시안은 처음 0.2초 동안 커지며 나타나니 그 뒤부터
    else if (state === 'spawn') { // 위에서 포르르 내려와 사뿐
      const k = gease(gseg(u, 0, 0.9));
      if (u < 0.9) {
        P.flap(t, 32, 1.0, 0.2);
        P.fly.position.y = STAND_Y + (1 - k) * 0.12;
        P.body.rotation.x = -0.4 * k;
        P.feet.forEach((f) => (f.rotation.x = 1.3 - k * 1.5));
        P.fly.scale.setScalar(gease(gseg(u, 0, 0.25)));
      } else { jStand(P); P.plant(0); }
    } else if (state === 'air') { // 짝! 떠올라 포르르 (높이·자세는 게임이 setAir 로)
      const clap = bump(u, 0, 0.2);
      P.flap(t, 32 + brake * 8, 1.0, 0.15 + brake * 0.1);
      P.fly.position.y = STAND_Y + lift + clap * 0.01 + Math.sin(t * 25) * 0.003 * (1 - brake);
      P.body.rotation.x = 0.15 * move - brake * 0.5;
      P.feet.forEach((f) => (f.rotation.x = u < 0.2 ? -0.2 : 1.3 - brake * 1.6));
      P.head.rotation.x = 0.4 * down;
      P.head.rotation.y = -0.5 * down;
    } else if (state === 'perch') { // 앉아 꽁지 까딱, 자리가 들썩이면 날개로 버팀
      jStand(P);
      P.fly.position.y = STAND_Y + lift;
      P.tail.rotation.x += pulse(t * 9) * 0.35 * (1 - shake);
      P.head.rotation.y = Math.sign(Math.sin(t * 1.3)) * 0.35 * (1 - shake);
      if (shake > 0) {
        P.shells.forEach((m) => (m.visible = false));
        P.wings.forEach(([w]) => (w.visible = true));
        P.flap(t, 28, 0.5 * shake, 0.3);
        P.body.rotation.z = Math.sin(t * 16) * 0.18 * shake;
      } else P.head.rotation.x = 0.4 * down;
      P.plant(lift);
    } else if (state === 'gone') P.fly.scale.setScalar(0.0001);
    if (['idle', 'walk', 'peck', 'perch'].includes(state)) P.blink(bump(t % 2.6, 2.45, 2.6));
    smooth(t);
    if (snap) { // 다듬기(smooth) 뒤에 섞어야 다듬기가 옛 움직임을 이어 붙이지 않음
      snapT += dt;
      const k = gease(Math.min(1, snapT / XF));
      parts.forEach((o, i) => {
        const [p0, q0, s0] = snap[i];
        o.position.lerpVectors(p0, o.position, k);
        o.quaternion.copy(q.slerpQuaternions(q0, o.quaternion, k));
        o.scale.lerpVectors(s0, o.scale, k);
      });
      if (k >= 1) snap = null;
    }
    P.keepAbove(0);

    const S = JJAEK_STATES[state];
    if (S && !S.loop && u >= S.dur) {
      const ended = state;
      play(ended === 'die' ? 'gone' : 'idle');
      onDone?.(ended);
    }
    syncToon(root, true, outlineScale);
  }

  return {
    root,
    play,
    update,
    setMood() {}, // 중립형이라 화난 채로 다니지 않음
    setAir(h, mv = 0, br = 0, sh = 0, dn = 0) { lift = h; move = mv; brake = br; shake = sh; down = dn; },
    get state() { return state; },
    get time() { return u; },
  };
}
