// 쪼렙 몬스터 시안 화면: 마을과 같은 툰 그림체로 하찮고 귀여운 몬스터 여러 마리를 나란히 세워 본다
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createVillager, PRESETS } from './villager/villager.js';
import { canvasTexture } from './villager/textures.js';
import { syncToon } from './villager/toon.js';
import { angerMark, angerPulse } from './monsters/anger.js';
import { createNalgaekong } from './monsters/nalgaekong.js';
import { roundCanopy, trunkGeometry, canopyPerches } from './village.js';
import { eraserChunk, eraserSleeve } from './monsters/banjjok.js';
import { PINK, csm, bump, hBlink, catEars, catFace, catTail, makeHaak, HAAK_MOTIONS, HAAK_EYES } from './monsters/haaknyang.js';
import { makePigeon, GUGU_MOTIONS, STAND_Y, foldWings, waddle, gBlink, gease, gseg, poseSmoother } from './monsters/gugu.js';
import { makeMagpie, caw, makeKkakkak, KKAK_MOTIONS, kReset, kPhase, kStand, kPuff, createKkakkak, KKAK_STATES } from './monsters/kkakkak.js';

const PI = Math.PI;
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = canvasTexture('monsterBg', 4, 512, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#bfe3f7');
  gr.addColorStop(0.65, '#e6f4fb');
  gr.addColorStop(1, '#fdf3e2');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
});

const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
camera.position.set(0, 0.55, 3.6);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.28, 0);
controls.enableDamping = true;
controls.minDistance = 0.5;
controls.maxDistance = 6;
controls.maxPolarAngle = PI * 0.52;

scene.add(new THREE.HemisphereLight(0xdbeeff, 0xffe8d6, 0.85));
const key = new THREE.DirectionalLight(0xfff1e0, 1.9);
key.position.set(-1.6, 2.6, 2.2);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -2, right: 2, top: 1.5, bottom: -1 });
key.shadow.radius = 5;
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.01;
scene.add(key);
const fill = new THREE.DirectionalLight(0xffd2b0, 0.6);
fill.position.set(2.2, 0.9, 1.6);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xf4f8ff, 1.5);
rim.position.set(0.6, 1.8, -2.4);
scene.add(rim);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(4, 64).rotateX(-PI / 2),
  new THREE.MeshStandardMaterial({
    roughness: 1,
    map: canvasTexture('monsterGround', 512, 512, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      gr.addColorStop(0, '#a9dc86');
      gr.addColorStop(0.75, '#9fd57d');
      gr.addColorStop(1, '#e6f4fb');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    }),
  }),
);
ground.receiveShadow = true;
scene.add(ground);

// ── 부품 도우미 ──
const mat = (color, rough = 0.6) => new THREE.MeshStandardMaterial({ color, roughness: rough });
const BLACK = mat('#2b1d14', 0.3);
const WHITE = mat('#ffffff', 0.3);
const BLUSH = mat('#ff9fae', 0.8);

function mesh(geo, m, parent, name = '부품') {
  const o = new THREE.Mesh(geo, m);
  o.name = name;
  o.castShadow = true;
  parent.add(o);
  return o;
}
const ball = (r, n = 32) => new THREE.SphereGeometry(r, n, Math.round(n * 0.75));

// 점 눈(+반짝이) 두 개를 얼굴 앞쪽에 붙인다. 외곽선은 두르지 않는다
function dotEyes(parent, { x, y, z, r = 0.012, big = false }) {
  for (const s of [-1, 1]) {
    if (big) {
      const w = mesh(ball(r * 1.9), WHITE, parent, '눈');
      w.position.set(s * x, y, z);
      w.scale.z = 0.6;
      const p = mesh(ball(r * 0.8), BLACK, parent, '눈');
      p.position.set(s * x + s * r * 0.5, y - r * 0.4, z + r * 1.05); // 초점 없이 바깥으로 살짝 벌어진 멍한 눈
    } else {
      const e = mesh(ball(r), BLACK, parent, '눈');
      e.position.set(s * x, y, z);
      e.scale.set(1, 1.25, 0.6);
      const hl = mesh(ball(r * 0.35, 12), WHITE, parent, '눈');
      hl.position.set(s * x + r * 0.35, y + r * 0.45, z + r * 0.55);
    }
  }
}
function blush(parent, { x, y, z, r = 0.012 }) {
  for (const s of [-1, 1]) {
    const b = mesh(ball(r, 16), BLUSH, parent, '눈');
    b.position.set(s * x, y, z);
    b.scale.set(1.4, 0.7, 0.3);
  }
}
// 작은 입: 얇은 반원 고리
function smallMouth(parent, { y, z, r = 0.008, frown = false }) {
  const m = mesh(new THREE.TorusGeometry(r, r * 0.28, 8, 16, PI), BLACK, parent, '눈');
  m.position.set(0, y, z);
  m.rotation.z = frown ? 0 : PI;
  return m;
}

// ── 몬스터들 ──
const monsters = [];

// 1. 말랑콩: 슬라임. 통통 튀려다 늘 바닥에 철퍼덕
monsters.push(() => {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const a = t * PI;
    const r = Math.sin(a) * 0.1 * (1 + 0.25 * (1 - t)); // 아래가 퍼진 물방울 모양
    pts.push(new THREE.Vector2(Math.max(r, 0.0001), -Math.cos(a) * 0.055 + 0.055));
  }
  pts[0].set(0.0001, 0);
  const goo = new THREE.MeshStandardMaterial({ color: '#8fe0b0', roughness: 0.25 });
  mesh(new THREE.LatheGeometry(pts, 40), goo, body, '몸');
  dotEyes(body, { x: 0.03, y: 0.06, z: 0.1, r: 0.011 });
  blush(body, { x: 0.06, y: 0.045, z: 0.092, r: 0.01 });
  smallMouth(body, { y: 0.043, z: 0.107, r: 0.006 });
  const drop = mesh(ball(0.012, 16), mat('#bfe8ff', 0.2), body, '땀');
  drop.position.set(0.075, 0.095, 0.03);
  drop.scale.set(0.8, 1.3, 0.8);
  return {
    g, name: '말랑콩', desc: '튀어 오르려다 늘 실패하는 슬라임',
    update(t) {
      const p = (t * 1.6) % 1;
      const hop = Math.max(0, Math.sin(p * PI * 2)) * 0.02; // 고작 2cm 뜀
      const sq = 1 + Math.sin(p * PI * 2 + PI / 2) * 0.12;
      body.position.y = hop;
      body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
      drop.position.y = 0.095 + Math.sin(t * 5) * 0.004;
    },
  };
});

// 2. 먼지톨: 교실 구석 먼지뭉치. 눈이 멍하고 가끔 재채기로 털이 날림
monsters.push(() => {
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.085;
  g.add(body);
  const fluff = mat('#a7a3a8', 1);
  mesh(ball(0.07), fluff, body, '몸');
  const rnd = (i) => (Math.sin(i * 127.1) * 43758.5453) % 1;
  const tufts = [];
  for (let i = 0; i < 34; i++) {
    const u = Math.abs(rnd(i)), v = Math.abs(rnd(i + 50));
    const th = Math.acos(1 - 2 * u), ph = v * PI * 2;
    const d = new THREE.Vector3(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph));
    if (d.z > 0.55 && d.y > -0.4 && d.y < 0.5) continue; // 얼굴 자리는 비워 둠
    const t = mesh(ball(0.02 + Math.abs(rnd(i + 99)) * 0.018, 12), fluff, body, '털');
    t.position.copy(d.multiplyScalar(0.066));
    tufts.push(t);
  }
  dotEyes(body, { x: 0.024, y: 0.008, z: 0.064, r: 0.009, big: true });
  smallMouth(body, { y: -0.02, z: 0.069, r: 0.005, frown: true });
  for (const s of [-1, 1]) { // 이쑤시개 같은 다리
    const leg = mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.03, 8), BLACK, g, '다리');
    leg.position.set(s * 0.025, 0.015, 0);
    const foot = mesh(ball(0.009, 12), BLACK, g, '발');
    foot.position.set(s * 0.025, 0.004, 0.006);
    foot.scale.set(1, 0.6, 1.5);
  }
  return {
    g, name: '먼지톨', desc: '교실 구석 먼지뭉치, 재채기하면 털이 빠짐',
    update(t) {
      const c = t % 3.2;
      const sneeze = c > 2.6 ? Math.sin((c - 2.6) / 0.6 * PI) : 0;
      body.rotation.z = Math.sin(t * 2.2) * 0.12 * (1 - sneeze);
      body.rotation.x = -sneeze * 0.35;
      body.scale.setScalar(1 + sneeze * 0.12);
      tufts.forEach((tf, i) => tf.scale.setScalar(1 + Math.sin(t * 3 + i) * 0.06 + sneeze * 0.25));
    },
  };
});

// 3. 꼬마송이: 갓이 너무 커서 자꾸 앞으로 고꾸라질 뻔하는 버섯
monsters.push(() => {
  const g = new THREE.Group();
  const pivot = new THREE.Group();
  g.add(pivot);
  const stemPts = [[0.03, 0], [0.036, 0.01], [0.037, 0.04], [0.032, 0.07], [0.0001, 0.075]].map(([r, y]) => new THREE.Vector2(r, y));
  mesh(new THREE.LatheGeometry(stemPts, 32), mat('#fbeed6', 0.8), pivot, '몸');
  dotEyes(pivot, { x: 0.014, y: 0.038, z: 0.034, r: 0.007 });
  blush(pivot, { x: 0.026, y: 0.028, z: 0.03, r: 0.007 });
  smallMouth(pivot, { y: 0.027, z: 0.0365, r: 0.004 });
  const cap = new THREE.Group();
  cap.position.y = 0.068;
  pivot.add(cap);
  const capGeo = new THREE.SphereGeometry(0.09, 40, 24, 0, PI * 2, 0, PI * 0.5).scale(1, 0.72, 1);
  mesh(capGeo, mat('#ef6a5a', 0.55), cap, '갓');
  mesh(new THREE.CircleGeometry(0.09, 40).rotateX(PI / 2), mat('#f6d9bd', 0.9), cap, '갓밑').userData.noOutline = true;
  for (let i = 0; i < 7; i++) {
    const a = i * 2.4, el = i === 0 ? PI / 2 : 0.55 + (i % 3) * 0.28;
    const d = new THREE.Vector3(Math.cos(a) * Math.cos(el), Math.sin(el) * 0.72, Math.sin(a) * Math.cos(el));
    const s = mesh(ball(0.014, 12), WHITE, cap, '점');
    s.position.copy(d.multiplyScalar(0.09));
    s.scale.set(1, 0.55, 1);
    s.lookAt(s.position.clone().multiplyScalar(2).add(cap.getWorldPosition(new THREE.Vector3())));
  }
  return {
    g, name: '꼬마송이', desc: '갓이 너무 무거워서 맨날 휘청',
    update(t) {
      const c = t % 2.4;
      const fall = c < 1.5 ? Math.pow(c / 1.5, 2.2) : Math.max(0, 1 - (c - 1.5) / 0.25);
      pivot.rotation.x = fall * 0.42 - (c > 1.5 && c < 1.9 ? Math.sin((c - 1.5) / 0.4 * PI) * 0.12 : 0);
      cap.rotation.z = Math.sin(t * 3) * 0.04;
    },
  };
});

// 4. 싹감자: 머리에 싹이 난 감자. 짧은 팔로 만세를 하지만 팔이 안 보일 만큼 짧음
monsters.push(() => {
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.07;
  g.add(body);
  const geo = ball(0.07, 40).scale(1, 1.12, 0.92);
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 1 + 0.06 * Math.sin(v.x * 60 + 1) * Math.sin(v.y * 47) + 0.04 * Math.sin(v.z * 70 + v.y * 30);
    p.setXYZ(i, v.x * k, v.y * k, v.z * k);
  }
  geo.computeVertexNormals();
  mesh(geo, mat('#c99a5e', 0.9), body, '몸');
  for (const [x, y, z] of [[-0.04, 0.035, 0.045], [0.045, -0.03, 0.045], [-0.02, -0.05, 0.05]]) {
    const d = mesh(ball(0.006, 10), mat('#8d6538', 1), body, '눈'); // 감자 눈(움푹 점)
    d.position.set(x, y, z);
  }
  dotEyes(body, { x: 0.02, y: 0.012, z: 0.062, r: 0.008 });
  blush(body, { x: 0.038, y: -0.004, z: 0.057, r: 0.008 });
  smallMouth(body, { y: -0.005, z: 0.066, r: 0.005 });
  const sprout = new THREE.Group();
  sprout.position.y = 0.075;
  body.add(sprout);
  const green = mat('#7ccf5b', 0.6);
  mesh(new THREE.CylinderGeometry(0.003, 0.004, 0.03, 8).translate(0, 0.015, 0), green, sprout, '싹줄기');
  const leaves = [];
  for (const s of [-1, 1]) {
    const lf = mesh(ball(0.014, 16).scale(1.6, 0.35, 0.9).translate(s * 0.02, 0, 0), green, sprout, '잎');
    lf.position.y = 0.03;
    leaves.push(lf);
  }
  const arms = [];
  for (const s of [-1, 1]) {
    const a = mesh(ball(0.011, 12).scale(1, 1.4, 1).translate(0, 0.01, 0), mat('#c99a5e', 0.9), body, '팔');
    a.position.set(s * 0.068, -0.01, 0.005);
    arms.push([a, s]);
  }
  return {
    g, name: '싹감자', desc: '팔이 너무 짧아 만세도 티가 안 남',
    update(t) {
      sprout.rotation.z = Math.sin(t * 4) * 0.25;
      leaves.forEach((l, i) => (l.rotation.z = Math.sin(t * 4 + i * PI) * 0.15));
      const cheer = (Math.sin(t * 2.5) + 1) / 2;
      arms.forEach(([a, s]) => (a.rotation.z = -s * (0.2 + cheer * 1.2)));
      body.position.y = 0.07 + Math.abs(Math.sin(t * 2.5)) * 0.006;
    },
  };
});

// 5. 지우개벌레: 지우개 가루가 뭉쳐 생긴 애벌레. 자벌레처럼 꼬물꼬물 기어감
monsters.push(() => {
  const g = new THREE.Group();
  const colors = ['#ffb3c1', '#ffc4cf', '#ffb3c1', '#ffc4cf'];
  const segs = [];
  for (let i = 0; i < 4; i++) {
    const r = 0.03 - i * 0.003;
    const s = mesh(new RoundedBoxGeometry(r * 2, r * 1.7, r * 1.9, 3, r * 0.6), mat(colors[i], 0.95), g, '마디');
    segs.push([s, r]);
  }
  const head = segs[0][0];
  dotEyes(head, { x: 0.012, y: 0.006, z: 0.0285, r: 0.006 });
  blush(head, { x: 0.022, y: -0.005, z: 0.026, r: 0.006 });
  smallMouth(head, { y: -0.006, z: 0.029, r: 0.0035 });
  for (const s of [-1, 1]) {
    const an = mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 0.02, 6).translate(0, 0.01, 0), BLACK, head, '더듬이');
    an.position.set(s * 0.01, 0.022, 0);
    an.rotation.z = -s * 0.35;
    const tip = mesh(ball(0.004, 10), BLACK, an, '눈');
    tip.position.y = 0.021;
  }
  g.rotation.y = 0.9; // 옆모습이 보이게 비스듬히
  return {
    g, name: '지우개벌레', desc: '지우개 가루가 뭉쳐 생김, 엄청 느림',
    update(t) {
      const w = t * 3;
      segs.forEach(([s, r], i) => {
        const hump = Math.max(0, Math.sin(w - i * 0.9)) * 0.018;
        s.position.set(0, r * 0.85 + hump, 0.045 - i * 0.046 + Math.sin(w - i * 0.9) * 0.004);
        s.rotation.x = Math.cos(w - i * 0.9) * 0.18;
      });
    },
  };
});

// 6. 날개콩: 노란 솜뭉치 새. 날개를 열심히 파닥이지만 1cm밖에 못 뜸
monsters.push(() => {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const yellow = mat('#ffe07a', 0.85);
  mesh(ball(0.065, 40).scale(1, 0.95, 1).translate(0, 0.062, 0), yellow, body, '몸');
  const tuft = mesh(ball(0.012, 12).scale(0.6, 1.4, 0.6), yellow, body, '머리털');
  tuft.position.set(0, 0.128, 0.005);
  tuft.rotation.z = 0.3;
  dotEyes(body, { x: 0.022, y: 0.075, z: 0.058, r: 0.008 });
  blush(body, { x: 0.042, y: 0.058, z: 0.05, r: 0.009 });
  const beak = mesh(new THREE.ConeGeometry(0.009, 0.014, 12).rotateX(PI / 2), mat('#ff9d3c', 0.6), body, '부리');
  beak.position.set(0, 0.062, 0.066);
  const wings = [];
  for (const s of [-1, 1]) {
    const piv = new THREE.Group();
    piv.position.set(s * 0.06, 0.07, 0);
    body.add(piv);
    const w = mesh(ball(0.02, 16).scale(0.5, 1, 0.8).translate(s * 0.008, -0.016, 0), yellow, piv, '날개');
    wings.push([piv, s, w]);
  }
  for (const s of [-1, 1]) {
    const f = mesh(ball(0.008, 10).scale(1.3, 0.5, 1.6), mat('#ff9d3c', 0.6), g, '발');
    f.position.set(s * 0.02, 0.004, 0.012);
  }
  return {
    g, name: '날개콩', desc: '열심히 파닥여도 1cm밖에 못 뜸',
    update(t) {
      const c = t % 2.6;
      const fly = c < 1.6 ? Math.sin((c / 1.6) * PI) : 0;
      body.position.y = fly * 0.012;
      const flap = c < 1.6 ? Math.sin(t * 40) : Math.sin(t * 3) * 0.2;
      wings.forEach(([p, s]) => (p.rotation.z = s * (0.3 + flap * 0.7)));
      body.rotation.z = c > 1.6 ? Math.sin((c - 1.6) * 12) * 0.06 * (2.6 - c) : 0;
    },
  };
});

// ── 필기도구 몬스터 (monsters.html?set=stationery) ──
const stationery = [];

// 1. 몽당연필: 너무 깎여서 엄지만 해진 연필. 지우개 쪽으로 서서 뒤뚱뒤뚱, 가끔 깎이는 꿈에 뱅글
stationery.push(() => {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  // 육각 기둥: 평평한 면이 앞을 보도록 30도 돌림
  const part = (r1, r2, h, y, m, name, n = 6) =>
    mesh(new THREE.CylinderGeometry(r1, r2, h, n).rotateY(n === 6 ? PI / 6 : 0).translate(0, y + h / 2, 0), m, body, name);
  part(0.036, 0.036, 0.02, 0, mat('#ff9fb0', 0.95), '지우개', 24);
  part(0.04, 0.04, 0.014, 0.02, mat('#c9ccd3', 0.35), '쇠테', 24);
  part(0.04, 0.04, 0.06, 0.034, mat('#ffd23f', 0.6), '몸');
  part(0.008, 0.04, 0.035, 0.094, mat('#f3d2a2', 0.9), '나무');
  part(0.003, 0.008, 0.007, 0.129, mat('#4a4a52', 0.5), '심', 12); // 뭉툭하게 닳은 심
  dotEyes(body, { x: 0.013, y: 0.07, z: 0.035, r: 0.007 });
  blush(body, { x: 0.021, y: 0.058, z: 0.033, r: 0.006 });
  smallMouth(body, { y: 0.057, z: 0.036, r: 0.004 });
  return {
    g, name: '몽당연필', desc: '너무 깎여서 키가 엄지만 함',
    update(t) {
      const c = t % 3.2;
      if (c < 2.2) {
        body.position.y = Math.abs(Math.sin(t * 6)) * 0.006;
        body.rotation.set(0, 0, Math.sin(t * 6) * 0.12);
      } else {
        const k = (c - 2.2) / 1; // 연필깎이에 들어간 듯 한 바퀴 뱅글
        body.position.y = 0;
        body.rotation.set(0, k * k * (3 - 2 * k) * PI * 2, Math.sin(k * PI * 3) * 0.08);
      }
    },
  };
});

// 2. 닳은지우개: 열심히 문지르는데 닳는 건 자기 자신. 문지를수록 지우개 가루가 쌓임
stationery.push(() => {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  mesh(new RoundedBoxGeometry(0.11, 0.055, 0.065, 3, 0.012).translate(0, 0.0275, 0), mat('#f4f1ea', 0.95), body, '몸');
  mesh(new RoundedBoxGeometry(0.06, 0.059, 0.069, 3, 0.006).translate(0.028, 0.0295, 0), mat('#3d8fe0', 0.7), body, '종이');
  const face = new THREE.Group();
  face.position.x = -0.03; // 종이 띠 밖으로 나온 하얀 쪽에 얼굴
  body.add(face);
  dotEyes(face, { x: 0.01, y: 0.033, z: 0.033, r: 0.006 });
  blush(face, { x: 0.018, y: 0.022, z: 0.032, r: 0.005 });
  smallMouth(face, { y: 0.021, z: 0.0335, r: 0.0035 });
  const crumbs = [];
  for (let i = 0; i < 5; i++) {
    const cr = mesh(ball(0.006 + (i % 2) * 0.003, 10).scale(1.6, 0.7, 1), mat('#d9cfc4', 1), g, '가루');
    cr.position.set(-0.075 - i * 0.008, 0.003, 0.02 - i * 0.011);
    crumbs.push(cr);
  }
  return {
    g, name: '닳은지우개', desc: '문지를수록 자기만 닳음',
    update(t) {
      const rub = Math.sin(t * 7);
      body.position.x = rub * 0.015;
      body.rotation.y = rub * 0.05;
      const pile = (t % 5) / 5; // 가루가 점점 쌓였다가 (누가 치워서) 사라짐
      crumbs.forEach((cr, i) => cr.scale.setScalar(Math.max(0.001, Math.min(1, pile * 5 - i))));
    },
  };
});

// 3. 똑딱볼펜: 할 줄 아는 건 똑딱뿐. 똑! 할 때마다 볼펜심이 나와 키가 살짝 커짐
stationery.push(() => {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const NAVY = mat('#2f4a7a', 0.7);
  const SILVER = mat('#c9ccd3', 0.35);
  const cyl = (r1, r2, h, y, m, name) => mesh(new THREE.CylinderGeometry(r1, r2, h, 24).translate(0, y + h / 2, 0), m, body, name);
  mesh(new THREE.ConeGeometry(0.012, 0.022, 16).rotateX(PI).translate(0, 0.011, 0), SILVER, body, '촉');
  cyl(0.016, 0.02, 0.03, 0.02, NAVY, '손잡이');
  cyl(0.02, 0.02, 0.075, 0.05, mat('#7cc3f0', 0.4), '몸');
  cyl(0.021, 0.021, 0.012, 0.125, NAVY, '머리');
  const knob = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.02, 16).translate(0, 0.01, 0), NAVY, body, '똑딱이');
  knob.position.y = 0.133;
  mesh(new RoundedBoxGeometry(0.008, 0.06, 0.006, 2, 0.002).translate(0, 0.1, -0.023), SILVER, body, '클립');
  const nib = mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.007, 8).translate(0, -0.0035, 0), mat('#3a3a40', 0.4), body, '볼펜심');
  nib.position.y = 0.002;
  dotEyes(body, { x: 0.008, y: 0.095, z: 0.019, r: 0.006 });
  blush(body, { x: 0.015, y: 0.084, z: 0.013, r: 0.005 });
  smallMouth(body, { y: 0.083, z: 0.0205, r: 0.0035 });
  return {
    g, name: '똑딱볼펜', desc: '할 줄 아는 건 똑딱뿐',
    update(t) {
      const n = Math.floor(t / 0.7), into = t % 0.7;
      const k = Math.min(1, into / 0.08);
      const out = n % 2 ? k : 1 - k; // 누를 때마다 심이 나왔다 들어갔다
      knob.position.y = 0.133 - (into < 0.12 ? Math.sin((into / 0.12) * PI) * 0.008 : 0);
      nib.scale.y = Math.max(0.001, out);
      body.position.y = out * 0.005;
      body.rotation.z = Math.sin(t * 2.3) * 0.08; // 뾰족한 촉으로 서 있느라 늘 휘청
      body.rotation.x = Math.sin(t * 1.7) * 0.05;
    },
  };
});

// 4. 마른풀: 뚜껑을 잃어버려서 다 말라 버린 딱풀. 열심히 돌려 올려도 부서져 내려감
stationery.push(() => {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const ORANGE = mat('#ff8a3d', 0.6);
  const cyl = (r, h, y, m, name) => mesh(new THREE.CylinderGeometry(r, r, h, 32).translate(0, y + h / 2, 0), m, body, name);
  const dial = cyl(0.033, 0.012, 0, ORANGE, '돌리개');
  cyl(0.035, 0.085, 0.012, mat('#fbfbf7', 0.5), '몸');
  cyl(0.0356, 0.034, 0.016, ORANGE, '상표');
  const glue = mesh(new THREE.CylinderGeometry(0.026, 0.027, 0.03, 24).translate(0, 0.095, 0), mat('#efe4b0', 1), body, '풀');
  dotEyes(body, { x: 0.012, y: 0.074, z: 0.034, r: 0.007 });
  smallMouth(body, { y: 0.061, z: 0.0355, r: 0.005, frown: true });
  const cap = mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.04, 32).rotateZ(PI / 2), ORANGE, g, '뚜껑'); // 저 멀리 굴러간 뚜껑
  cap.position.set(0.085, 0.037, -0.04);
  cap.rotation.y = 0.6;
  return {
    g, name: '마른풀', desc: '뚜껑 잃어버려서 다 말라 버림',
    update(t) {
      const c = t % 3;
      const up = c < 1.6 ? c / 1.6 : Math.max(0, 1 - (c - 1.6) / 0.15); // 천천히 올라왔다 툭 꺼짐
      glue.position.y = up * 0.02;
      dial.rotation.y = c < 1.6 ? c * 6 : 0;
      body.rotation.z = c > 1.6 && c < 2.2 ? Math.sin((c - 1.6) * 30) * 0.05 * (2.2 - c) : 0;
    },
  };
});

// 5. 포스트잇: 붙었다 하면 금방 떨어짐. 윗부분이 슬슬 말리다가 뒤로 벌러덩
stationery.push(() => {
  const g = new THREE.Group();
  const H = 0.1;
  const geo = new THREE.BoxGeometry(0.1, H, 0.005, 1, 16, 1).translate(0, H / 2, 0);
  const base = geo.attributes.position.array.slice();
  const note = mesh(geo, mat('#fff27a', 0.8), g, '몸');
  note.userData.outlineWidth = 0.002; // 얇은 종이라 외곽선도 얇게
  note.frustumCulled = false; // 매 프레임 모양이 바뀜
  const face = new THREE.Group();
  face.position.y = 0.05;
  g.add(face);
  dotEyes(face, { x: 0.018, y: 0.004, z: 0, r: 0.008 });
  blush(face, { x: 0.032, y: -0.008, z: -0.001, r: 0.007 });
  const mouth = smallMouth(face, { y: -0.012, z: 0.001, r: 0.005 });
  const curlZ = (u, curl) => -curl * u * u * 0.06; // 높이 u(0~1)에서 뒤로 말린 정도
  return {
    g, name: '포스트잇', desc: '붙었다 하면 금방 떨어짐',
    update(t) {
      const c = t % 4;
      const sm = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
      const curl = c < 3.5 ? sm((c - 1.6) / 1) : 1 - sm((c - 3.5) / 0.3);
      const fall = c < 3.5 ? sm((c - 2.6) / 0.4) : 1 - sm((c - 3.5) / 0.3);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const y0 = base[i * 3 + 1], u = y0 / H;
        p.setY(i, y0 - curl * u ** 4 * 0.02);
        p.setZ(i, base[i * 3 + 2] + curlZ(u, curl) + Math.sin(t * 8 + u * 4) * 0.003 * u * (1 - fall));
      }
      p.needsUpdate = true;
      geo.computeVertexNormals();
      face.position.z = 0.003 + curlZ(0.5, curl);
      mouth.rotation.z = fall > 0.3 ? 0 : PI; // 넘어질 땐 시무룩
      g.rotation.x = -fall * 1.45;
    },
  };
});

// 6. 연필밥: 연필 깎다 나온 부스러기. 할 줄 아는 건 데굴데굴 구르기뿐이라 늘 어지러움
stationery.push(() => {
  const g = new THREE.Group();
  const R = 0.06;
  const roll = new THREE.Group();
  roll.position.y = R;
  g.add(roll);
  const spin = new THREE.Group();
  roll.add(spin);
  const disc = new THREE.Group();
  disc.rotation.x = PI / 2; // 깔때기 모양이 앞을 보게 세움
  spin.add(disc);
  // 깔때기처럼 바깥이 앞으로 솟은 얇은 고리를 돌려 만들고, 가장자리만 주름지게
  const frill = (r0, r1, color, name) => {
    const y = (r, d) => r * 0.35 + d;
    const pts = [[r0, -0.003], [r1, -0.003], [r1, 0.003], [r0, 0.003], [r0, -0.003]].map(([r, d]) => new THREE.Vector2(r, y(r, d)));
    const geo = new THREE.LatheGeometry(pts, 64);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const f = Math.max(0, (Math.hypot(x, z) - 0.025) / 0.035);
      p.setY(i, p.getY(i) + Math.sin(Math.atan2(z, x) * 7) * 0.009 * f);
    }
    geo.computeVertexNormals();
    mesh(geo, mat(color, 0.9), disc, name);
  };
  frill(0.0005, 0.05, '#e9c48f', '나무');
  frill(0.05, R, '#e8504a', '색칠');
  dotEyes(spin, { x: 0.012, y: 0.006, z: 0.01, r: 0.006, big: true });
  smallMouth(spin, { y: -0.01, z: 0.008, r: 0.004, frown: true });
  return {
    g, name: '연필밥', desc: '구를 줄만 알아서 늘 어지러움',
    update(t) {
      const x = Math.sin(t * 1.3) * 0.06;
      roll.position.x = x;
      spin.rotation.z = -x / R; // 미끄러지지 않고 굴러감
      roll.rotation.y = Math.sin(t * 0.9) * 0.3;
    },
  };
});

// ── 들판 몬스터 (monsters.html?set=field) ──
const field = [];

// 1. 깍지모자: 도토리. 깍지가 너무 커서 자꾸 눈까지 흘러내림, 짧은 팔로 밀어 올림
field.push(() => {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24, a = t * PI;
    pts.push(new THREE.Vector2(Math.max(Math.sin(a) * 0.058 * (0.62 + 0.38 * t), 0.0001), (1 - Math.cos(a)) / 2 * 0.12));
  }
  const brown = mat('#c98a4b', 0.7);
  mesh(new THREE.LatheGeometry(pts, 40), brown, body, '몸');
  dotEyes(body, { x: 0.019, y: 0.064, z: 0.054, r: 0.008 });
  blush(body, { x: 0.036, y: 0.05, z: 0.047, r: 0.008 });
  smallMouth(body, { y: 0.049, z: 0.057, r: 0.005 });
  const cap = new THREE.Group();
  body.add(cap);
  const capMat = new THREE.MeshStandardMaterial({ color: '#7a5230', roughness: 1, side: THREE.DoubleSide });
  const capGeo = new THREE.SphereGeometry(0.07, 40, 20, 0, PI * 2, 0, PI * 0.5).scale(1, 0.62, 1);
  const cp = capGeo.attributes.position;
  for (let i = 0; i < cp.count; i++) { // 깍지 비늘 오돌토돌
    const x = cp.getX(i), y = cp.getY(i), z = cp.getZ(i);
    const k = 1 + 0.035 * Math.sin(Math.atan2(z, x) * 14) * Math.sin(y * 260);
    cp.setXYZ(i, x * k, y, z * k);
  }
  capGeo.computeVertexNormals();
  mesh(capGeo, capMat, cap, '깍지');
  mesh(new THREE.TorusGeometry(0.069, 0.006, 8, 40).rotateX(PI / 2), capMat, cap, '깍지');
  mesh(new THREE.CylinderGeometry(0.004, 0.006, 0.022, 8).translate(0, 0.052, 0), mat('#5e3d22', 1), cap, '꼭지');
  const arms = [];
  for (const s of [-1, 1]) {
    const a = mesh(ball(0.01, 12).scale(1, 1.6, 1).translate(0, 0.012, 0), brown, body, '팔');
    a.position.set(s * 0.055, 0.045, 0.005);
    arms.push([a, s]);
  }
  return {
    g, name: '깍지모자', desc: '모자가 커서 자꾸 눈을 가림',
    update(t) {
      const c = t % 3;
      // 0~1.8초 동안 슬금슬금 흘러내리다가, 팔로 쑥 밀어 올림
      const slip = c < 1.8 ? Math.pow(c / 1.8, 1.6) : Math.max(0, 1 - (c - 1.8) / 0.25);
      const push = c > 1.6 && c < 2.3 ? Math.sin((c - 1.6) / 0.7 * PI) : 0;
      cap.position.y = 0.086 - slip * 0.036;
      cap.rotation.z = slip * 0.12;
      cap.rotation.x = slip * 0.1;
      arms.forEach(([a, s]) => (a.rotation.z = -s * (0.25 + push * 2.2)));
      body.rotation.z = Math.sin(t * 2) * 0.05 + slip * 0.04;
    },
  };
});

// 2. 쭈뼛솔: 솔방울. 겁먹으면 비늘을 쭈뼛 세우는데 하나도 안 무서움
field.push(() => {
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.072;
  g.add(body);
  const pine = mat('#9a6a3c', 0.85);
  const A = 0.045, B = 0.058;
  mesh(ball(1, 32).scale(A, B, A), pine, body, '몸');
  const scales = [];
  const scaleGeo = ball(0.017, 14).scale(1, 0.4, 1.25).translate(0, 0, 0.012);
  const scaleMat = mat('#b07a45', 0.85);
  for (let row = 0; row < 7; row++) {
    const y = -0.05 + row * 0.0165;
    const rr = A * Math.sqrt(Math.max(0.05, 1 - (y / B) ** 2));
    const n = Math.max(4, Math.round(rr / 0.0055));
    for (let j = 0; j < n; j++) {
      const phi = (j + (row % 2) * 0.5) / n * PI * 2;
      const wrapped = Math.atan2(Math.sin(phi), Math.cos(phi));
      if (Math.abs(wrapped) < 0.75 && y > -0.03 && y < 0.03) continue; // 얼굴 자리
      const piv = new THREE.Group();
      piv.position.set(Math.sin(phi) * rr, y, Math.cos(phi) * rr);
      piv.rotation.y = phi;
      const tilt = new THREE.Group();
      piv.add(tilt);
      body.add(piv);
      mesh(scaleGeo, scaleMat, tilt, '비늘');
      scales.push([tilt, row * 0.3 + j * 0.07]);
    }
  }
  dotEyes(body, { x: 0.015, y: 0.006, z: 0.043, r: 0.007 });
  blush(body, { x: 0.028, y: -0.006, z: 0.036, r: 0.007 });
  const mouth = smallMouth(body, { y: -0.01, z: 0.045, r: 0.0045, frown: true });
  for (const s of [-1, 1]) {
    const f = mesh(ball(0.009, 10).scale(1, 0.6, 1.5), BLACK, g, '발');
    f.position.set(s * 0.018, 0.005, 0.008);
  }
  return {
    g, name: '쭈뼛솔', desc: '겁먹으면 비늘을 세우는데 안 무서움',
    update(t) {
      const c = t % 3.2;
      const puff = c > 1.8 ? Math.sin(Math.min(1, (c - 1.8) / 1.2) * PI) : 0;
      scales.forEach(([s, ph]) => (s.rotation.x = 0.95 - puff * 0.85 + Math.sin(t * 3 + ph) * 0.04));
      body.rotation.z = Math.sin(t * 34) * 0.04 * puff + Math.sin(t * 1.8) * 0.04;
      body.position.y = 0.072 + puff * 0.006;
      mouth.scale.setScalar(1 + puff * 0.6);
    },
  };
});

// 3. 홀씨동이: 민들레. 바람이 살짝만 불어도 홀씨가 다 날아가 대머리가 됨
field.push(() => {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const leaf = mat('#7ccf5b', 0.7);
  mesh(ball(0.042, 32).scale(1, 0.9, 1).translate(0, 0.038, 0), leaf, body, '몸');
  for (let i = 0; i < 5; i++) { // 발밑 톱니 잎
    const a = i / 5 * PI * 2 + 0.3;
    const l = mesh(ball(0.02, 12).scale(0.55, 0.18, 1.5).translate(0, 0, 0.03), mat('#5fb546', 0.8), g, '잎');
    l.position.y = 0.004;
    l.rotation.y = a;
  }
  dotEyes(body, { x: 0.015, y: 0.042, z: 0.036, r: 0.007 });
  blush(body, { x: 0.028, y: 0.032, z: 0.031, r: 0.007 });
  smallMouth(body, { y: 0.03, z: 0.0385, r: 0.004 });
  const stem = mesh(new THREE.CylinderGeometry(0.0035, 0.0045, 0.05, 8).translate(0, 0.025, 0), leaf, body, '줄기');
  stem.position.y = 0.072;
  const head = new THREE.Group();
  head.position.y = 0.125;
  body.add(head);
  mesh(ball(0.009, 14), mat('#c9b98a', 1), head, '씨방');
  const fluff = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 });
  const stalkMat = new THREE.MeshStandardMaterial({ color: '#efe9dc', roughness: 1 });
  const seeds = [];
  const N = 30;
  for (let i = 0; i < N; i++) { // 골고루 퍼진 방향 (피보나치 구)
    const y = 1 - (i + 0.5) / N * 2, r = Math.sqrt(1 - y * y), ph = i * 2.39996;
    const d = new THREE.Vector3(Math.cos(ph) * r, y, Math.sin(ph) * r);
    const s = new THREE.Group();
    s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    head.add(s);
    const stalk = mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.03, 5).translate(0, 0.015, 0), stalkMat, s, '홀씨');
    stalk.userData.noOutline = true;
    mesh(ball(0.008, 10).scale(1, 0.55, 1).translate(0, 0.031, 0), fluff, s, '홀씨');
    seeds.push({ s, d, order: (i * 7) % N });
  }
  return {
    g, name: '홀씨동이', desc: '바람 한 번에 대머리가 됨',
    update(t) {
      const c = t % 6;
      body.rotation.z = Math.sin(t * 1.5) * 0.06;
      head.rotation.z = Math.sin(t * 1.5 - 0.6) * 0.1;
      for (const { s, d, order } of seeds) {
        const t0 = 0.6 + order * 0.11; // 하나씩 차례로 날아감
        if (c > 5) { // 다시 자라남
          s.position.set(0, 0, 0);
          s.scale.setScalar((c - 5) / 1);
        } else if (c > t0) {
          const k = c - t0;
          s.position.set(d.x * 0.02 + k * 0.05, d.y * 0.02 + k * 0.07 + Math.sin(k * 6) * 0.004, d.z * 0.02);
          s.scale.setScalar(Math.max(0.001, 1 - k * 0.7));
        } else {
          s.position.set(0, 0, 0);
          s.scale.setScalar(1);
        }
      }
    },
  };
});

// 4. 뚜껑집: 집을 잃어버려서 병뚜껑을 메고 다니는 달팽이
field.push(() => {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const skin = mat('#d9e8a6', 0.45);
  const foot = mesh(new THREE.CapsuleGeometry(0.02, 0.09, 6, 16).rotateX(PI / 2).scale(1.1, 0.75, 1), skin, body, '몸');
  foot.position.set(0, 0.015, 0);
  const head = new THREE.Group();
  head.position.set(0, 0.035, 0.06);
  body.add(head);
  mesh(ball(0.025, 24).scale(1, 1.1, 1), skin, head, '머리');
  blush(head, { x: 0.017, y: -0.004, z: 0.019, r: 0.006 });
  smallMouth(head, { y: -0.006, z: 0.0245, r: 0.004 });
  const stalks = [];
  for (const s of [-1, 1]) {
    const st = new THREE.Group();
    st.position.set(s * 0.01, 0.018, 0.004);
    head.add(st);
    mesh(new THREE.CylinderGeometry(0.003, 0.004, 0.03, 8).translate(0, 0.015, 0), skin, st, '더듬이');
    const e = mesh(ball(0.0075, 14), BLACK, st, '눈');
    e.position.y = 0.032;
    const hl = mesh(ball(0.0025, 8), WHITE, st, '눈');
    hl.position.set(0.002, 0.035, 0.005);
    stalks.push([st, s]);
  }
  // 병뚜껑: 옆으로 세운 빨간 톱니 원통
  const capGeo = new THREE.CylinderGeometry(0.042, 0.042, 0.022, 84, 1, false);
  const cp = capGeo.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const x = cp.getX(i), z = cp.getZ(i), r = Math.hypot(x, z);
    if (r < 0.04) continue;
    const k = 1 + 0.05 * Math.sign(Math.sin(Math.atan2(z, x) * 21));
    cp.setX(i, x * k);
    cp.setZ(i, z * k);
  }
  capGeo.computeVertexNormals();
  const shell = new THREE.Group();
  shell.position.set(0, 0.062, -0.012);
  body.add(shell);
  const capMesh = mesh(capGeo, mat('#e8504a', 0.35), shell, '뚜껑');
  capMesh.rotation.z = PI / 2;
  const liner = mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.002, 40), mat('#f3efe6', 0.8), shell, '뚜껑안');
  liner.rotation.z = PI / 2;
  liner.position.x = 0.011;
  g.rotation.y = 0.9;
  return {
    g, name: '뚜껑집', desc: '집 잃고 병뚜껑을 메고 다님',
    update(t) {
      const w = t * 2.2;
      foot.scale.z = 1 + Math.sin(w) * 0.07;
      head.position.z = 0.06 + Math.sin(w) * 0.006;
      shell.rotation.z = Math.sin(w) * 0.06;
      shell.position.y = 0.062 + Math.abs(Math.sin(w)) * 0.003;
      const c = t % 4;
      const droop = c > 2.8 ? Math.sin((c - 2.8) / 1.2 * PI) : 0; // 가끔 더듬이가 축 처짐
      stalks.forEach(([st, s], i) => {
        st.rotation.z = -s * 0.3 + Math.sin(t * 3 + i * 1.7) * 0.15;
        st.rotation.x = 0.2 + droop * 1.1;
      });
    },
  };
});

// 5. 멍돌: 들판 조약돌. 하는 일이라곤 눈 깜빡이기, 아주 가끔 한 뼘 콩 뛰기
field.push(() => {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const geo = ball(0.06, 40).scale(1.18, 0.68, 1);
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 1 + 0.035 * Math.sin(v.x * 40 + 2) * Math.sin(v.z * 33) + 0.02 * Math.sin(v.y * 60);
    p.setXYZ(i, v.x * k, v.y * k, v.z * k);
  }
  geo.computeVertexNormals();
  const rock = mesh(geo, mat('#b9b3ab', 0.95), body, '몸');
  rock.position.y = 0.04;
  const moss = mesh(ball(0.016, 12).scale(1.4, 0.5, 1), mat('#88c46a', 1), body, '이끼');
  moss.position.set(-0.025, 0.08, -0.01);
  const eyes = [];
  for (const s of [-1, 1]) {
    const e = mesh(ball(0.007, 14).scale(1, 1.3, 0.5), BLACK, body, '눈');
    e.position.set(s * 0.02, 0.05, 0.058);
    eyes.push(e);
  }
  const mouth = mesh(new THREE.CapsuleGeometry(0.0018, 0.01, 4, 8).rotateZ(PI / 2), BLACK, body, '눈');
  mouth.position.set(0, 0.036, 0.06);
  return {
    g, name: '멍돌', desc: '하는 일이라곤 눈 깜빡이기',
    update(t) {
      const c = t % 2.5;
      const blink = c > 2.3 ? 0.1 : 1;
      eyes.forEach((e) => (e.scale.y = blink));
      const h = t % 7.5;
      const hop = h > 6.8 && h < 7.2 ? Math.sin((h - 6.8) / 0.4 * PI) : 0;
      body.position.y = hop * 0.012;
      body.scale.set(1 + (h > 7.2 ? Math.sin((h - 7.2) / 0.3 * PI) * 0.06 : 0), 1 - (h > 7.2 ? Math.sin((h - 7.2) / 0.3 * PI) * 0.06 : 0), 1);
    },
  };
});

// 6. 점하나: 점이 하나뿐인 쪼렙 무당벌레. 날개를 열심히 펴 보지만 못 날아오름
field.push(() => {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const under = mesh(ball(0.048, 24).scale(1, 0.55, 1.15), mat('#3a2a22', 0.6), body, '배');
  under.position.y = 0.024;
  const red = new THREE.MeshStandardMaterial({ color: '#e8453c', roughness: 0.3, side: THREE.DoubleSide });
  const shells = [];
  const wingMat = new THREE.MeshStandardMaterial({ color: '#e8f4ff', roughness: 0.3, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
  for (const s of [-1, 1]) {
    const piv = new THREE.Group();
    piv.position.set(0, 0.02, 0.01);
    body.add(piv);
    const geo = new THREE.SphereGeometry(0.055, 24, 14, s < 0 ? -PI / 2 : PI / 2, PI, 0, PI / 2).scale(1, 0.78, 1.15);
    const half = mesh(geo, red, piv, '등딱지');
    half.position.z = -0.01;
    const wing = mesh(ball(0.03, 14).scale(0.7, 0.08, 1.4), wingMat, body, '속날개');
    wing.position.set(s * 0.02, 0.05, -0.02);
    wing.visible = false;
    shells.push([piv, s, wing]);
  }
  // 점 하나 (오른쪽 등딱지에만)
  const spot = mesh(ball(0.014, 16).scale(1, 1, 0.25), BLACK, shells[1][0], '점');
  const n = new THREE.Vector3(0.55, 0.75, 0.2).normalize();
  spot.position.set(n.x * 0.055, n.y * 0.055 * 0.78, n.z * 0.055 * 1.15 - 0.01);
  spot.lookAt(spot.position.clone().add(new THREE.Vector3(n.x / 1, n.y / 0.6, n.z / 1.3)).add(new THREE.Vector3(0, 0.03, 0.01)));
  const head = new THREE.Group();
  head.position.set(0, 0.03, 0.065);
  body.add(head);
  mesh(ball(0.026, 24).scale(1.1, 0.9, 0.9), mat('#2b1d14', 0.4), head, '머리');
  dotEyes(head, { x: 0.011, y: 0.006, z: 0.02, r: 0.0055, big: true });
  blush(head, { x: 0.02, y: -0.006, z: 0.016, r: 0.005 });
  for (const s of [-1, 1]) {
    const an = mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.022, 6).translate(0, 0.011, 0), BLACK, head, '더듬이');
    an.position.set(s * 0.008, 0.018, 0.008);
    an.rotation.set(0.5, 0, -s * 0.4);
    const tip = mesh(ball(0.0035, 8), BLACK, an, '눈');
    tip.position.y = 0.022;
  }
  return {
    g, name: '점하나', desc: '점이 하나뿐, 날개 펴도 못 날아',
    update(t) {
      const c = t % 3.6;
      const open = c > 1 && c < 2.6 ? Math.min(1, (c - 1) / 0.25, (2.6 - c) / 0.25) : 0;
      shells.forEach(([piv, s, wing]) => {
        piv.rotation.z = s * open * 0.9;
        piv.rotation.x = -open * 0.35;
        wing.visible = open > 0.3;
        wing.rotation.z = s * (0.3 + Math.sin(t * 45) * 0.5) * open;
      });
      body.position.y = open * (0.004 + Math.abs(Math.sin(t * 22)) * 0.003);
      body.rotation.x = -open * 0.12;
      head.rotation.y = open ? 0 : Math.sin(t * 2) * 0.25;
    },
  };
});

// ── 학용품 몬스터 (monsters.html?set=school) ──
const school = [];

// 1. 띠용자: 플라스틱 자. 똑바로 서 있질 못하고 누가 튕긴 것처럼 띠용띠용 휘청
school.push(() => {
  const g = new THREE.Group();
  const plastic = mat('#8fd3ef', 0.35);
  const tickMat = mat('#2b5a75', 0.6);
  const SEG = 6, H = 0.022, W = 0.036, D = 0.006;
  const joints = [];
  let parent = g;
  for (let i = 0; i < SEG; i++) {
    const j = new THREE.Group();
    j.position.y = i === 0 ? 0.006 : H;
    parent.add(j);
    mesh(new THREE.BoxGeometry(W, H + 0.002, D).translate(0, H / 2, 0), plastic, j, '몸');
    for (let k = 0; k < 3; k++) { // 눈금
      const len = k === 0 ? 0.012 : 0.006;
      const tk = mesh(new THREE.BoxGeometry(len, 0.0012, 0.001), tickMat, j, '눈금');
      tk.position.set(-W / 2 + len / 2 + 0.002, 0.003 + k * (H / 3), D / 2 + 0.0004);
      tk.userData.noOutline = true;
    }
    joints.push(j);
    parent = j;
  }
  const face = joints[3];
  dotEyes(face, { x: 0.008, y: 0.014, z: D / 2 + 0.001, r: 0.0055 });
  blush(face, { x: 0.013, y: 0.006, z: D / 2 + 0.0005, r: 0.005 });
  smallMouth(face, { y: 0.006, z: D / 2 + 0.001, r: 0.0035 });
  for (const s of [-1, 1]) {
    const f = mesh(ball(0.008, 10).scale(1, 0.6, 1.4), BLACK, g, '발');
    f.position.set(s * 0.011, 0.004, 0.004);
  }
  return {
    g, name: '띠용자', desc: '똑바로 서 본 적이 없음',
    update(t) {
      const c = t % 2.4;
      const boing = Math.exp(-c * 2.4) * Math.cos(c * 15) * 0.22;
      joints.forEach((j, i) => (j.rotation.z = i === 0 ? boing * 0.3 : 0.03 + boing));
    },
  };
});

// 2. 줄줄크레파스: 종이옷이 자꾸 발목까지 줄줄 흘러내려서 부끄러움
school.push(() => {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const crayon = mat('#5b8ff0', 0.55);
  mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.074, 28).translate(0, 0.037, 0), crayon, body, '몸');
  mesh(new THREE.CylinderGeometry(0.008, 0.022, 0.02, 28).translate(0, 0.084, 0), crayon, body, '몸');
  dotEyes(body, { x: 0.009, y: 0.062, z: 0.021, r: 0.0065 });
  blush(body, { x: 0.016, y: 0.054, z: 0.017, r: 0.006 });
  smallMouth(body, { y: 0.054, z: 0.0222, r: 0.0035 });
  const wrapper = new THREE.Group();
  g.add(wrapper);
  const paper = new THREE.MeshStandardMaterial({ color: '#fff4dc', roughness: 0.95, side: THREE.DoubleSide });
  mesh(new THREE.CylinderGeometry(0.0238, 0.0238, 0.038, 28, 1, true).translate(0, 0.019, 0), paper, wrapper, '종이옷');
  for (const y of [0.006, 0.032]) {
    const st = mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.0035, 28, 1, true).translate(0, y, 0), mat('#3d6ccc', 0.8), wrapper, '줄무늬');
    st.userData.noOutline = true;
  }
  return {
    g, name: '줄줄크레파스', desc: '종이옷이 자꾸 흘러내림',
    update(t) {
      const c = t % 3;
      const slide = c < 2 ? Math.pow(c / 2, 2) : Math.max(0, 1 - (c - 2) / 0.2);
      wrapper.position.y = 0.008 * (1 - slide);
      wrapper.scale.set(1 + slide * 0.12, 1 - slide * 0.5, 1 + slide * 0.12); // 발목에 쭈글쭈글 모임
      body.rotation.z = Math.sin(t * 10) * 0.05 * slide;
      body.position.y = c > 2 && c < 2.3 ? Math.sin((c - 2) / 0.3 * PI) * 0.008 : 0;
    },
  };
});

// 3. 더듬클립: 한쪽 끝이 펴져서 더듬이처럼 됨. 뭘 집지도 못하고 통통 튐
school.push(() => {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const metal = mat('#ff7fa8', 0.4); // 분홍 코팅 클립
  const P = [[-0.006, 0.045], [-0.006, 0.095], [0.003, 0.106], [0.012, 0.095], [0.012, 0.02], [-0.003, 0.006], [-0.018, 0.02],
    [-0.018, 0.112], [-0.001, 0.127], [0.016, 0.112], [0.016, 0.075]];
  const curve = new THREE.CatmullRomCurve3(P.map(([x, y]) => new THREE.Vector3(x, y, 0)), false, 'centripetal');
  mesh(new THREE.TubeGeometry(curve, 200, 0.0028, 8), metal, body, '몸').userData.noOutline = true; // 가는 철사라 외곽선이 덮으면 시커멓게 보임
  const ant = new THREE.Group(); // 펴진 끝
  ant.position.set(-0.006, 0.045, 0);
  body.add(ant);
  mesh(new THREE.CylinderGeometry(0.0028, 0.0028, 0.05, 8).translate(0, -0.025, 0), metal, ant, '더듬이').userData.noOutline = true;
  ant.rotation.z = -2.3;
  dotEyes(body, { x: 0.009, y: 0.07, z: 0.005, r: 0.0055, big: true });
  smallMouth(body, { y: 0.055, z: 0.004, r: 0.004 });
  return {
    g, name: '더듬클립', desc: '한쪽이 펴져서 더듬이가 됨',
    update(t) {
      const p = (t * 1.4) % 1;
      const hop = Math.max(0, Math.sin(p * PI * 2));
      body.position.y = hop * 0.014;
      body.scale.set(1 + (1 - hop) * 0.04, 1 - (1 - hop) * 0.06 + hop * 0.04, 1);
      ant.rotation.z = -2.3 + Math.sin(t * 9) * 0.25;
      body.rotation.y = Math.sin(t * 0.8) * 0.4;
    },
  };
});

// 4. 마지막물감: 다 짜서 홀쭉해진 물감. 끝을 돌돌 말고 힘껏 짜야 겨우 한 방울
school.push(() => {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const paint = mat('#ffcf3f', 0.45);
  const geo = new THREE.CylinderGeometry(0.026, 0.026, 0.08, 32, 16).translate(0, 0.06, 0);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const f = THREE.MathUtils.clamp((p.getY(i) - 0.02) / 0.08, 0, 1);
    p.setZ(i, p.getZ(i) * (1 - 0.85 * Math.pow(1 - f, 1.5))); // 아래로 갈수록 납작
    p.setX(i, p.getX(i) * (1 + 0.2 * (1 - f)));
  }
  geo.computeVertexNormals();
  mesh(geo, paint, body, '몸');
  const roll = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.066, 20).rotateZ(PI / 2), paint, body, '말린끝');
  roll.position.y = 0.014;
  mesh(new THREE.CylinderGeometry(0.012, 0.026, 0.012, 32).translate(0, 0.106, 0), paint, body, '어깨');
  const cap = mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.014, 18).translate(0, 0.119, 0), mat('#f5f5f5', 0.5), body, '뚜껑');
  cap.userData.noOutline = false;
  dotEyes(body, { x: 0.01, y: 0.07, z: 0.024, r: 0.0065 });
  blush(body, { x: 0.019, y: 0.062, z: 0.021, r: 0.006 });
  const mouth = smallMouth(body, { y: 0.06, z: 0.0245, r: 0.004, frown: true });
  const drop = mesh(ball(0.009, 16).scale(1, 0.8, 1), paint, g, '방울');
  return {
    g, name: '마지막물감', desc: '힘껏 짜야 겨우 한 방울',
    update(t) {
      const c = t % 2.8;
      const sq = c > 1.1 && c < 1.7 ? Math.sin((c - 1.1) / 0.6 * PI) : 0;
      body.scale.set(1 + sq * 0.1, 1 - sq * 0.12, 1 + sq * 0.1);
      roll.rotation.x = sq * 0.6;
      mouth.scale.setScalar(1 + sq * 0.8);
      if (c > 1.4 && c < 2.6) { // 퐁! 하고 나와서 뚜껑 위에 얹힘
        const k = c - 1.4;
        const top = 0.126 * (1 - sq * 0.12);
        drop.position.set(0, top + 0.006 + Math.max(0, Math.sin(Math.min(k / 0.35, 1) * PI)) * 0.02, 0);
        drop.scale.setScalar(Math.min(1, k / 0.1) * (k > 1 ? 1 - (k - 1) / 0.2 : 1));
        drop.visible = true;
      } else drop.visible = false;
    },
  };
});

// 5. 헛철컥: 스테이플러. 철컥철컥 열심히 찍는데 심이 하나도 없음
school.push(() => {
  const g = new THREE.Group();
  const base = mesh(new RoundedBoxGeometry(0.042, 0.014, 0.13, 3, 0.006), mat('#3a3a42', 0.5), g, '바닥');
  base.position.y = 0.007;
  const plate = mesh(new THREE.BoxGeometry(0.026, 0.002, 0.03), mat('#d8dde3', 0.3), g, '받침');
  plate.position.set(0, 0.0145, 0.045);
  const tongue = mesh(ball(0.01, 14).scale(1.2, 0.35, 1.2), BLUSH, g, '혀');
  tongue.position.set(0, 0.016, 0.03);
  const arm = new THREE.Group();
  arm.position.set(0, 0.018, -0.056);
  g.add(arm);
  const red = mat('#e8504a', 0.4);
  mesh(new RoundedBoxGeometry(0.036, 0.026, 0.126, 3, 0.009).translate(0, 0.013, 0.061), red, arm, '몸');
  dotEyes(arm, { x: 0.009, y: 0.015, z: 0.124, r: 0.0055 });
  blush(arm, { x: 0.014, y: 0.007, z: 0.122, r: 0.0045 });
  g.rotation.y = 0.35;
  return {
    g, name: '헛철컥', desc: '철컥철컥 해도 심이 없음',
    update(t) {
      const c = t % 3;
      const open = c < 1.5 ? Math.abs(Math.sin(c / 1.5 * PI * 3)) * 0.5 : 0.08 + Math.sin(t * 2) * 0.03;
      arm.rotation.x = -open;
      g.position.y = c < 1.5 ? Math.max(0, -Math.cos(c / 1.5 * PI * 6)) * 0.004 : 0;
      g.rotation.z = c > 1.5 ? -0.05 : 0; // 아무것도 안 나와서 시무룩
    },
  };
});

// 6. 뱅글컴퍼스: 바늘을 꽂고 한 바퀴 돌고 나면 어지러워서 한참 휘청
school.push(() => {
  const g = new THREE.Group();
  const R = 0.03; // 바늘에서 연필까지 반 거리
  const spin = new THREE.Group();
  spin.position.x = -R;
  g.add(spin);
  const body = new THREE.Group();
  body.position.x = R;
  spin.add(body);
  const metal = mat('#cdd6e0', 0.3);
  const head = mesh(ball(0.022, 24).translate(0, 0.104, 0), mat('#6aa8e8', 0.5), body, '머리');
  head.name = '머리';
  mesh(new THREE.CylinderGeometry(0.004, 0.005, 0.02, 10).translate(0, 0.134, 0), mat('#6aa8e8', 0.5), body, '손잡이');
  dotEyes(body, { x: 0.008, y: 0.106, z: 0.02, r: 0.0055, big: true });
  smallMouth(body, { y: 0.095, z: 0.0205, r: 0.0035, frown: true });
  const legs = [];
  for (const s of [-1, 1]) {
    const piv = new THREE.Group();
    piv.position.y = 0.098;
    body.add(piv);
    piv.rotation.z = s * Math.asin(R / 0.094);
    mesh(new THREE.CylinderGeometry(0.0035, 0.004, 0.08, 10).translate(0, -0.04, 0), metal, piv, '다리');
    if (s < 0) { // 바늘 다리
      mesh(new THREE.ConeGeometry(0.0025, 0.014, 8).rotateX(PI).translate(0, -0.087, 0), mat('#8e98a3', 0.3), piv, '바늘');
    } else { // 연필 다리
      mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.02, 6).translate(0, -0.078, 0), mat('#ffcf3f', 0.6), piv, '연필');
      mesh(new THREE.ConeGeometry(0.005, 0.008, 6).rotateX(PI).translate(0, -0.092, 0), mat('#2b1d14', 0.5), piv, '연필');
    }
    legs.push(piv);
  }
  const ring = mesh(new THREE.TorusGeometry(2 * R, 0.0012, 4, 72).rotateX(PI / 2), mat('#7a7a80', 0.8), g, '동그라미');
  ring.position.set(-R, 0.0015, 0);
  ring.userData.noOutline = true;
  return {
    g, name: '뱅글컴퍼스', desc: '한 바퀴 돌면 어지러워 휘청',
    update(t) {
      const c = t % 5;
      const k = Math.min(1, c / 2);
      spin.rotation.y = k * k * (3 - 2 * k) * PI * 4; // 두 바퀴 뱅글
      const dizzy = c > 2 ? Math.exp(-(c - 2) * 1.2) : 0;
      body.rotation.z = Math.sin(t * 7) * 0.12 * dizzy;
      body.rotation.x = Math.cos(t * 7) * 0.08 * dizzy;
    },
  };
});

// ── 지우개 조각 몬스터 (monsters.html?set=eraser) ──
const eraser = [];

const RUBBER = (c) => mat(c, 0.95);

// 1. 귀퉁이: 지우개 모서리가 똑 떨어져 나온 조각. 모서리로 서 보려다 매번 콩 넘어짐
eraser.push(() => {
  const g = new THREE.Group();
  const W = 0.062, H = 0.046, D = 0.046;
  const body = new THREE.Group();
  body.position.x = -W / 2;
  g.add(body);
  const m = mesh(eraserChunk(W, H, D, { broken: ['+x', '-z'], seed: 1 }), RUBBER('#f4f1ea'), body, '몸');
  m.position.set(W / 2, H / 2, 0);
  dotEyes(m, { x: 0.011, y: 0.004, z: D / 2, r: 0.0065 });
  blush(m, { x: 0.02, y: -0.006, z: D / 2 - 0.001, r: 0.006 });
  const mouth = smallMouth(m, { y: -0.006, z: D / 2 + 0.001, r: 0.004 });
  return {
    g, name: '귀퉁이', desc: '모서리로 서 보려다 맨날 넘어짐',
    update(t) {
      const c = t % 3;
      let a;
      if (c < 1.4) { const k = c / 1.4; a = k * k * (3 - 2 * k) * 1.25; }
      else if (c < 1.8) a = 1.25 + Math.sin((c - 1.4) * 30) * 0.05;
      else if (c < 2.1) a = 1.25 * (1 - ((c - 1.8) / 0.3) ** 2);
      else a = Math.abs(Math.sin((c - 2.1) * 16)) * 0.14 * Math.exp(-(c - 2.1) * 5);
      body.rotation.z = a;
      mouth.rotation.z = c > 1.8 && c < 2.6 ? 0 : PI; // 넘어지면 입이 삐죽
    },
  };
});

// 2. 반쪽이: 반으로 부러진 지우개. 나머지 반쪽을 찾아 두리번두리번
eraser.push(() => {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const W = 0.072, H = 0.04, D = 0.038;
  const m = mesh(eraserChunk(W, H, D, { broken: ['+x'], seed: 2, amp: 0.0045, r: 0.009, soft: true }), RUBBER('#f6f3ec'), body, '몸');
  m.position.y = H / 2;
  eraserSleeve(body, W, H, D, 0.009); // 종이 옷은 왼쪽 절반만 남음
  dotEyes(body, { x: 0.0075, y: H * 0.55, z: D / 2, r: 0.0042 }); // 반쪽이는 작은 점눈
  body.children.slice(-4).forEach((e) => (e.position.x += 0.017)); // 눈은 맨살 쪽으로
  smallMouth(body, { y: H * 0.32, z: D / 2 + 0.001, r: 0.0035, frown: true }).position.x = 0.017;
  return {
    g, name: '반쪽이', desc: '나머지 반쪽을 찾아 두리번',
    update(t) {
      const c = t % 4;
      // 왼쪽 보고 멈칫, 오른쪽 보고 멈칫, 한숨
      const look = c < 1 ? 0.7 * Math.sin(c / 1 * PI / 2) : c < 2 ? 0.7 : c < 2.6 ? 0.7 - 1.4 * ((c - 2) / 0.6) : c < 3.4 ? -0.7 : -0.7 * (1 - (c - 3.4) / 0.6);
      body.rotation.y = look;
      body.position.y = Math.abs(Math.sin(t * 5)) * 0.003;
      body.rotation.z = c > 3.4 ? Math.sin((c - 3.4) / 0.6 * PI) * 0.08 : 0;
    },
  };
});

// 3. 꼬질이: 연필 가루가 잔뜩 묻은 조각. 뒹굴수록 더 꼬질꼬질
eraser.push(() => {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const W = 0.06, H = 0.042, D = 0.044;
  const dirty = canvasTexture('dirtyEraser', 128, 128, (c, w, h) => {
    c.fillStyle = '#ece6da';
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 16; i++) {
      const x = ((i * 37) % 128), y = ((i * 71 + 19) % 128), r = 8 + (i * 13) % 18;
      const gr = c.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(70,70,82,0.55)');
      gr.addColorStop(1, 'rgba(70,70,82,0)');
      c.fillStyle = gr;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });
  const m = mesh(eraserChunk(W, H, D, { broken: ['-x', '+y'], seed: 3 }), new THREE.MeshStandardMaterial({ map: dirty, roughness: 0.95 }), body, '몸');
  m.position.y = H / 2;
  dotEyes(body, { x: 0.011, y: 0.024, z: D / 2, r: 0.0065, big: true });
  smallMouth(body, { y: 0.012, z: D / 2 + 0.001, r: 0.004, frown: true });
  const crumbs = [];
  for (let i = 0; i < 5; i++) { // 흘린 연필 가루
    const cr = mesh(ball(0.0035 + (i % 3) * 0.0012, 8), mat('#4a4a55', 0.8), g, '가루');
    cr.position.set(Math.cos(i * 1.9) * 0.05, 0.002, Math.sin(i * 1.9) * 0.04 + 0.01);
    crumbs.push(cr);
  }
  return {
    g, name: '꼬질이', desc: '연필 가루 묻어 꼬질, 닦을수록 번짐',
    update(t) {
      const roll = Math.sin(t * 2.4);
      body.rotation.z = roll * 0.22;
      body.position.x = roll * 0.008;
      body.position.y = Math.abs(roll) * 0.006; // 모서리로 굴러서 살짝 들림
      crumbs.forEach((cr, i) => (cr.position.y = 0.002 + Math.max(0, Math.sin(t * 4.8 + i)) * 0.004));
    },
  };
});

// 4. 가루삼형제: 지우개 가루 셋. 셋이 합쳐도 지우개 귀퉁이만 함, 쫄쫄 줄지어 따라감
eraser.push(() => {
  const g = new THREE.Group();
  const kids = [];
  [[0.03, '#f4f1ea'], [0.023, '#ffc4cf'], [0.017, '#f4f1ea']].forEach(([s, col], i) => {
    const b = new THREE.Group();
    g.add(b);
    const m = mesh(eraserChunk(s, s * 0.85, s, { broken: ['+x', '-x', '+y'], seed: 4 + i, r: s * 0.18, amp: s * 0.08 }), RUBBER(col), b, '몸');
    m.position.y = s * 0.425;
    dotEyes(b, { x: s * 0.2, y: s * 0.5, z: s / 2, r: s * 0.13 });
    blush(b, { x: s * 0.35, y: s * 0.34, z: s / 2 - 0.001, r: s * 0.11 });
    kids.push([b, s, i]);
  });
  return {
    g, name: '가루삼형제', desc: '셋이 합쳐도 지우개 한 귀퉁이',
    update(t) {
      kids.forEach(([b, s, i]) => {
        const ph = t * 6 - i * 1.3;
        const x = 0.045 - i * 0.04 + Math.sin(t * 0.9 - i * 0.6) * 0.015;
        b.position.set(x, Math.max(0, Math.sin(ph)) * 0.012, Math.cos(t * 0.9 - i * 0.6) * 0.006);
        b.rotation.z = Math.sin(ph) * 0.12;
        const sq = Math.max(0, -Math.sin(ph));
        b.scale.set(1 + sq * 0.1, 1 - sq * 0.15, 1 + sq * 0.1);
      });
    },
  };
});

// 5. 콕콕이: 샤프로 콕콕 찔려서 샤프심이 박힌 분홍 조각. 늘 겁먹고 바들바들
eraser.push(() => {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const W = 0.056, H = 0.044, D = 0.046;
  const m = mesh(eraserChunk(W, H, D, { broken: ['-x'], seed: 7 }), RUBBER('#ffb3c1'), body, '몸');
  m.position.y = H / 2;
  const leadMat = mat('#3a3a42', 0.4);
  const leads = [];
  [[-0.012, -0.008, 0.034, 0.35, -0.3], [0.006, 0.006, 0.042, -0.15, 0.25], [0.017, -0.012, 0.028, -0.45, -0.2]].forEach(([x, z, len, rz, rx]) => {
    const piv = new THREE.Group();
    piv.position.set(x, H - 0.004, z);
    piv.rotation.set(rx, 0, rz);
    body.add(piv);
    mesh(new THREE.CylinderGeometry(0.0014, 0.0014, len, 6).translate(0, len / 2, 0), leadMat, piv, '샤프심');
    leads.push([piv, rz, rx]);
  });
  for (const [x, z] of [[-0.004, 0.012], [0.012, 0.014], [-0.018, 0.008]]) { // 찔린 구멍
    const hole = mesh(new THREE.CircleGeometry(0.0022, 10).rotateX(-PI / 2), leadMat, body, '구멍');
    hole.position.set(x, H + 0.0003, z);
    hole.userData.noOutline = true;
  }
  dotEyes(body, { x: 0.011, y: 0.024, z: D / 2, r: 0.006, big: true });
  smallMouth(body, { y: 0.012, z: D / 2 + 0.001, r: 0.0035, frown: true });
  const tear = mesh(ball(0.004, 12).scale(0.8, 1.3, 0.8), mat('#bfe8ff', 0.2), body, '눈물');
  return {
    g, name: '콕콕이', desc: '샤프에 찔려서 심이 박힘',
    update(t) {
      body.position.x = Math.sin(t * 45) * 0.0012; // 바들바들
      const c = t % 2.8;
      const flinch = c > 2.2 ? Math.sin((c - 2.2) / 0.6 * PI) : 0; // 또 찔릴까 봐 움찔
      body.scale.set(1 + flinch * 0.06, 1 - flinch * 0.12, 1 + flinch * 0.06);
      leads.forEach(([p, rz, rx], i) => {
        p.rotation.z = rz + Math.sin(t * 9 + i * 2) * 0.08 + flinch * 0.15 * Math.sign(rz);
        p.rotation.x = rx + Math.cos(t * 8 + i) * 0.05;
      });
      const k = (t * 0.7) % 1; // 눈물 주르륵
      tear.position.set(0.019, 0.022 - k * 0.014, D / 2 + 0.001);
      tear.scale.setScalar(k < 0.85 ? 1 : (1 - k) / 0.15);
    },
  };
});

// 6. 딸기향조각: 딸기 모양 향기 지우개가 부서진 반쪽. 향기만 아직 폴폴
eraser.push(() => {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const pts = [];
  for (let i = 0; i <= 28; i++) {
    const t = i / 28, a = t * PI;
    pts.push(new THREE.Vector2(Math.max(Math.sin(a) * 0.044 * (0.5 + 0.5 * t), 0.0001), (1 - Math.cos(a)) / 2 * 0.078));
  }
  const geo = new THREE.LatheGeometry(pts, 56);
  const p = geo.attributes.position;
  const CUT = 0.012;
  for (let i = 0; i < p.count; i++) if (p.getX(i) > CUT) p.setX(i, CUT); // 오른쪽을 잘라 냄
  geo.computeVertexNormals();
  mesh(geo, mat('#ff5a6e', 0.85), body, '몸');
  // 부서진 단면: 잘린 자리의 윤곽을 따라 만든 연분홍 판, 울퉁불퉁하게
  const side = [];
  for (const q of pts) if (q.x > CUT) side.push([Math.sqrt(q.x * q.x - CUT * CUT), q.y]);
  const shape = new THREE.Shape();
  side.forEach(([z, y], i) => (i ? shape.lineTo(z, y) : shape.moveTo(z, y)));
  for (let i = side.length - 1; i >= 0; i--) shape.lineTo(-side[i][0], side[i][1]);
  const cutGeo = new THREE.ShapeGeometry(shape, 8);
  cutGeo.rotateY(PI / 2); // 판이 +x 쪽을 바라보게 (모양의 x → 월드 -z)
  const cp = cutGeo.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const y = cp.getY(i), z = cp.getZ(i);
    cp.setX(i, CUT + 0.0006 + (Math.sin(y * 420) * Math.sin(z * 380) * 0.6 + Math.sin(y * 900 + z * 700) * 0.4) * 0.002);
  }
  cutGeo.computeVertexNormals();
  mesh(cutGeo, new THREE.MeshStandardMaterial({ color: '#ffd9de', roughness: 0.95, side: THREE.DoubleSide }), body, '단면');
  const seedMat = mat('#ffe27a', 0.6);
  for (let i = 0; i < 14; i++) { // 딸기씨 (부서진 쪽은 빼고)
    const t = 0.25 + (i % 5) * 0.13, ph = PI * 0.55 + i * 0.55;
    if (Math.sin(ph) * 0.044 > CUT - 0.006) continue;
    const a = t * PI, r = Math.sin(a) * 0.044 * (0.5 + 0.5 * t);
    if (Math.abs(Math.sin(ph)) < 0.45 && Math.cos(ph) > 0 && t > 0.4 && t < 0.75) continue; // 얼굴 자리
    const s = mesh(ball(0.0028, 8).scale(1, 1.5, 0.5), seedMat, body, '씨');
    s.position.set(Math.sin(ph) * r * 1.01, (1 - Math.cos(a)) / 2 * 0.078, Math.cos(ph) * r * 1.01);
    s.lookAt(s.position.clone().multiplyScalar(2).setY(s.position.y));
    s.userData.noOutline = true;
  }
  const green = mat('#6cc45a', 0.7);
  for (let i = 0; i < 5; i++) {
    const lf = mesh(ball(0.012, 12).scale(0.6, 0.2, 1.4).translate(0, 0, 0.012), green, body, '꼭지잎');
    lf.position.y = 0.077;
    lf.rotation.set(-0.25, i / 5 * PI * 2 + 0.6, 0);
  }
  mesh(new THREE.CylinderGeometry(0.002, 0.0025, 0.012, 8).translate(0, 0.083, 0), green, body, '꼭지');
  dotEyes(body, { x: 0.011, y: 0.044, z: 0.04, r: 0.0065 });
  blush(body, { x: 0.021, y: 0.036, z: 0.035, r: 0.0055 });
  smallMouth(body, { y: 0.035, z: 0.0415, r: 0.004 });
  const hs = new THREE.Shape(), s = 0.006;
  hs.moveTo(0, -s);
  hs.bezierCurveTo(s * 1.7, -s * 0.1, s * 1.1, s * 1.4, 0, s * 0.55);
  hs.bezierCurveTo(-s * 1.1, s * 1.4, -s * 1.7, -s * 0.1, 0, -s);
  const heartGeo = new THREE.ExtrudeGeometry(hs, { depth: 0.002, bevelEnabled: false });
  const hearts = [0, 1, 2].map(() => {
    const h = mesh(heartGeo, mat('#ff8fb1', 0.6), g, '향기');
    h.userData.noOutline = true;
    return h;
  });
  g.rotation.y = -0.55; // 부서진 단면이 보이게
  return {
    g, name: '딸기향조각', desc: '향기는 남았는데 반쪽뿐',
    update(t) {
      body.rotation.z = Math.sin(t * 1.6) * 0.06;
      body.position.y = Math.abs(Math.sin(t * 3.2)) * 0.003;
      hearts.forEach((h, i) => {
        const k = (t * 0.45 + i / 3) % 1;
        h.position.set(-0.01 + Math.sin(k * 7 + i * 2) * 0.012, 0.09 + k * 0.06, 0);
        h.rotation.y = 0.55 + Math.sin(k * 5) * 0.4;
        h.scale.setScalar(Math.sin(k * PI) * 1.1);
      });
    },
  };
});

// ── 반쪽이 모션 시안 (monsters.html?set=banjjok): 같은 반쪽이로 게임에 쓸 동작을 하나씩 반복 ──
const banjjok = [];
const seg = (u, a, b) => THREE.MathUtils.clamp((u - a) / (b - a), 0, 1);
const ease = (x) => x * x * (3 - 2 * x);

// g(자리) > move(이동·점프) > body(바닥 가운데 기준 기울기·찌부) > 지우개
// 반쪽이 눈 모양들: e 는 얼굴 표면에 놓인 눈 하나의 자리(깜빡일 때 e 를 위아래로 납작하게), s 는 -1 왼눈 / 1 오른눈
const GRAY = mat('#9a948c', 0.9);
const EYE_STYLES = {
  dot: { name: '점눈', desc: '작은 까만 점 + 반짝', gap: 0.0075, build(e) {
    mesh(ball(0.0042, 14).scale(1, 1.25, 0.6), BLACK, e, '눈');
    mesh(ball(0.0015, 8), WHITE, e, '눈').position.set(0.0014, 0.0019, 0.0025);
  } },
  sparkle: { name: '반짝 큰 눈', desc: '크고 촉촉, 반짝이 두 개', gap: 0.0105, build(e) {
    mesh(ball(0.0085, 18).scale(1, 1.2, 0.5), BLACK, e, '눈');
    mesh(ball(0.0029, 10), WHITE, e, '눈').position.set(0.0027, 0.0038, 0.0042);
    mesh(ball(0.0014, 8), WHITE, e, '눈').position.set(-0.0028, -0.0036, 0.0038);
  } },
  blank: { name: '멍한 눈', desc: '흰자에 눈동자가 바깥으로 쏠림', gap: 0.0095, build(e, s) {
    mesh(ball(0.0075, 18).scale(1, 1.1, 0.4), WHITE, e, '눈');
    mesh(ball(0.003, 10).scale(1, 1, 0.5), BLACK, e, '눈').position.set(s * 0.0025, -0.0015, 0.003);
  } },
  happy: { name: '웃는 반달눈', desc: '^ ^ 늘 기분 좋아 보임', gap: 0.0085, build(e) {
    const arc = mesh(new THREE.TorusGeometry(0.0045, 0.0013, 8, 16, PI), BLACK, e, '눈');
    arc.position.set(0, -0.0015, 0.0005);
  } },
  sleepy: { name: '졸린 눈', desc: '눈꺼풀이 반쯤 내려옴', gap: 0.0085, build(e) {
    mesh(new THREE.SphereGeometry(0.0065, 16, 8, 0, PI * 2, PI / 2, PI / 2).scale(1, 1, 0.5), BLACK, e, '눈');
    mesh(new THREE.CapsuleGeometry(0.0011, 0.014, 4, 8).rotateZ(PI / 2), BLACK, e, '눈').position.z = 0.0005;
  } },
  odd: { name: '짝짝이 눈', desc: '반쪽이라 눈도 짝짝이', gap: 0.009, build(e, s) {
    const r = s < 0 ? 0.0075 : 0.0038;
    mesh(ball(r, 16).scale(1, 1.2, 0.55), BLACK, e, '눈');
    mesh(ball(r * 0.35, 8), WHITE, e, '눈').position.set(r * 0.35, r * 0.45, r * 0.55);
    if (s > 0) e.position.y -= 0.002;
  } },
  erased: { name: '반쯤 지워진 눈', desc: '오른눈이 지우개에 반 지워짐', gap: 0.0085, build(e, s) {
    if (s < 0) {
      mesh(ball(0.006, 14).scale(1, 1.25, 0.6), BLACK, e, '눈');
      mesh(ball(0.0021, 8), WHITE, e, '눈').position.set(0.002, 0.0027, 0.0035);
      return;
    }
    mesh(new THREE.SphereGeometry(0.006, 14, 10, -PI / 2, PI).scale(1, 1.25, 0.6), BLACK, e, '눈'); // 왼쪽 반만 남음
    const smudge = mesh(ball(0.0055, 12).scale(1.1, 1.3, 0.15), GRAY, e, '눈'); // 지운 자국
    smudge.position.set(0.0035, 0, -0.0004);
    smudge.userData.noOutline = true;
  } },
  sad: { name: '시무룩 눈썹', desc: '세로 콩눈 + 처진 눈썹', gap: 0.0085, build(e, s) {
    mesh(ball(0.0045, 14).scale(1, 1.55, 0.6), BLACK, e, '눈');
    mesh(ball(0.0016, 8), WHITE, e, '눈').position.set(0.0014, 0.003, 0.0026);
    const brow = mesh(new THREE.CapsuleGeometry(0.0011, 0.007, 4, 8).rotateZ(PI / 2), BLACK, e, '눈썹');
    brow.position.set(0, 0.0115, 0.0003);
    brow.rotation.z = -s * 0.38; // 안쪽 끝이 올라간 걱정 눈썹
  } },
};

function makeBanjjok(color = '#f6f3ec', { sleeve = true, broken = '+x', seed = 2, eyes: eyeStyle = 'dot' } = {}) {
  const W = 0.072, H = 0.04, D = 0.038;
  const g = new THREE.Group();
  const move = new THREE.Group();
  g.add(move);
  const body = new THREE.Group();
  move.add(body);
  const m = mesh(eraserChunk(W, H, D, { broken: [broken], seed, amp: 0.0045, r: 0.009, soft: true }), RUBBER(color), body, '몸');
  m.position.y = H / 2;
  let faceX = 0;
  if (sleeve) {
    eraserSleeve(body, W, H, D, 0.009);
    faceX = 0.017; // 얼굴은 맨살 쪽
  }
  const eyes = [];
  const ES = EYE_STYLES[eyeStyle];
  for (const s of [-1, 1]) {
    const e = new THREE.Group();
    e.position.set(faceX + s * ES.gap, H * 0.55, D / 2);
    body.add(e);
    ES.build(e, s);
    eyes.push(e);
  }
  const mouth = smallMouth(body, { y: H * 0.3, z: D / 2 + 0.001, r: 0.0035, frown: true });
  mouth.position.x = faceX;
  return {
    g, move, body, eyes, mouth, W, H, D,
    liftZ: (a) => (W / 2) * Math.abs(Math.sin(a)), // 옆으로 기울 때 모서리가 땅에 안 박히게
    liftX: (a) => (D / 2) * Math.abs(Math.sin(a)), // 앞뒤로 기울 때
    eye(sx, sy) { eyes.forEach((e) => e.scale.set(sx, sy, 1)); },
    reset() {
      move.position.set(0, 0, 0);
      move.rotation.set(0, 0, 0);
      body.rotation.set(0, 0, 0);
      body.scale.set(1, 1, 1);
      this.eye(1, 1);
      mouth.rotation.z = 0;
      mouth.scale.setScalar(1);
    },
  };
}
function motion(name, desc, period, fn, extra) {
  banjjok.push(() => {
    const B = makeBanjjok();
    extra?.(B);
    return { g: B.g, name, desc, update(t) { B.reset(); fn(t % period, B, t); } };
  });
}
const blinkAt = (B, t) => { if (t % 2.7 > 2.58) B.eye(1, 0.15); };

// 1. 대기: 왼쪽 오른쪽 두리번, 반쪽이 없으면 한숨
motion('대기', '두리번두리번, 없으면 한숨', 4, (c, B, t) => {
  B.body.rotation.y = c < 1 ? 0.7 * Math.sin(c * PI / 2) : c < 2 ? 0.7 : c < 2.6 ? 0.7 - 1.4 * ((c - 2) / 0.6) : c < 3.4 ? -0.7 : -0.7 * (1 - (c - 3.4) / 0.6);
  B.move.position.y = Math.abs(Math.sin(t * 5)) * 0.002;
  if (c > 3.4) {
    const k = Math.sin((c - 3.4) / 0.6 * PI);
    B.body.rotation.z = k * 0.08;
    B.move.position.y += B.liftZ(k * 0.08);
    B.eye(1, 1 - 0.6 * k);
  } else blinkAt(B, t);
});

// 2. 걷기: 부러진 쪽이 무거워서 늘 그쪽으로 기운 채 뒤뚱뒤뚱
motion('걷기', '단면 쪽이 무거워 기우뚱 뒤뚱', 2 * PI / 0.7, (c, B, t) => {
  const ph = (t * 2.5) % 1;
  const side = Math.floor(t * 2.5) % 2 ? 1 : -1;
  const hop = Math.sin(ph * PI);
  const tilt = side * 0.14 * hop - 0.07;
  B.body.rotation.z = tilt;
  B.body.scale.set(1 + (1 - hop) * 0.05, 1 - (1 - hop) * 0.07, 1);
  B.move.position.set(Math.sin(t * 0.7) * 0.035, hop * 0.01 + B.liftZ(tilt), 0);
  B.body.rotation.y = Math.cos(t * 0.7) * 0.55; // 가는 쪽을 봄
  blinkAt(B, t);
});

// 3. 발견: 깜짝 폴짝! 혹시 내 반쪽? 하고 앞으로 쭉 기울여 기대
motion('발견', '깜짝! 혹시 내 반쪽?', 2.8, (c, B, t) => {
  const crouch = Math.sin(seg(c, 0.05, 0.3) * PI);
  const jump = Math.sin(seg(c, 0.3, 0.7) * PI);
  const land = Math.sin(seg(c, 0.7, 0.85) * PI);
  B.body.scale.set(1 + (crouch + land) * 0.08, 1 - (crouch + land) * 0.14, 1);
  const lean = ease(seg(c, 0.85, 1.1)) * (1 - ease(seg(c, 2.0, 2.3)));
  const rx = lean * (0.2 + Math.sin(t * 28) * 0.025);
  B.body.rotation.x = rx;
  B.move.position.y = jump * 0.026 + B.liftX(rx);
  const wide = c > 0.3 && c < 2.2;
  if (wide) { B.eye(1.5, 1.6); B.mouth.rotation.z = PI; B.mouth.scale.setScalar(1.3); } else blinkAt(B, t);
  B.bang.visible = wide;
  B.bang.scale.setScalar(ease(seg(c, 0.3, 0.45)) * (1 + Math.sin(seg(c, 0.45, 0.7) * PI) * 0.25));
}, (B) => {
  const bang = new THREE.Group();
  bang.position.set(0.017, B.H + 0.03, 0);
  const orange = mat('#ff9d3c', 0.5);
  mesh(new THREE.CapsuleGeometry(0.0042, 0.014, 4, 10), orange, bang, '느낌표').position.y = 0.014;
  mesh(ball(0.0045, 10), orange, bang, '느낌표').position.y = -0.003;
  B.move.add(bang);
  B.bang = bang;
});

// 4. 공격 ①: 뒤로 젖혀 힘 모았다가 몸통으로 쿵! 박고 어질
motion('공격 ① 몸통박치기', '젖혔다가 쿵! 박고 어질어질', 2.8, (c, B, t) => {
  const wind = ease(seg(c, 0, 0.6)), lunge = ease(seg(c, 0.6, 0.75)), recover = ease(seg(c, 1.0, 1.4)), back = ease(seg(c, 1.4, 2.1));
  let rx = -0.35 * wind;
  if (c >= 0.6) rx = -0.35 + 0.95 * lunge;
  if (c >= 1.0) rx = 0.6 * (1 - recover);
  const z = c < 0.6 ? -0.012 * wind : c < 1.4 ? -0.012 + 0.065 * lunge : 0.053 * (1 - back);
  B.body.rotation.x = rx;
  B.body.scale.set(1 + wind * (1 - lunge) * 0.06, 1 - wind * (1 - lunge) * 0.1, 1);
  B.move.position.set(0, B.liftX(rx), z);
  const dizzy = c > 0.8 ? 1 - seg(c, 0.8, 1.8) : 0;
  B.body.rotation.y = Math.sin(t * 13) * 0.18 * dizzy;
  if (c < 0.6) B.eye(1.1, 0.35); // 끙차
  else if (c < 0.8) B.eye(1.4, 1.4);
  else if (dizzy > 0) B.eye(1, 0.6 + 0.4 * Math.sin(t * 13));
  B.stars.forEach((s, i) => {
    const k = seg(c, 0.75, 1.3);
    const a = i / B.stars.length * PI * 2 + 0.4;
    s.visible = k > 0 && k < 1;
    s.position.set(0.017 + Math.cos(a) * k * 0.035, B.H * 0.6 + Math.sin(a) * k * 0.03, B.D / 2 + 0.065);
    s.scale.setScalar(Math.sin(k * PI));
    s.rotation.z = k * 4;
  });
}, (B) => {
  const yel = mat('#ffd34d', 0.5);
  B.stars = [0, 1, 2, 3, 4].map(() => {
    const s = mesh(new THREE.OctahedronGeometry(0.006, 0).scale(1, 1, 0.4), yel, B.g, '별');
    s.userData.noOutline = true;
    return s;
  });
});

// 5. 공격 ②: 앞으로 엎드려 박박 문질러 지우기, 가루가 폴폴
motion('공격 ② 박박 문지르기', '엎드려 박박 지우면 가루 폴폴', 2.8, (c, B, t) => {
  const lean = ease(seg(c, 0, 0.3)) * (1 - ease(seg(c, 1.7, 2.0)));
  const rx = 0.45 * lean;
  const rubbing = c > 0.3 && c < 1.7;
  const rub = rubbing ? Math.sin((c - 0.3) * PI * 2 * 6) : 0;
  B.body.rotation.x = rx;
  B.body.rotation.z = rub * 0.07;
  B.move.position.set(rub * 0.016, B.liftX(rx) + B.liftZ(rub * 0.07), 0.012 * lean);
  if (rubbing) B.eye(1.1, 0.3);
  else if (c > 2.0 && c < 2.6) { // 뿌듯
    B.move.position.y += Math.sin(seg(c, 2.0, 2.35) * PI) * 0.008;
    B.mouth.rotation.z = PI;
    B.eye(1, 0.4);
  } else blinkAt(B, t);
  // 가루가 하나씩 밀려 나와 살짝 튀었다가 바닥에 내려앉아 쌓이고, 끝나면 사라짐
  B.crumbs.forEach((cr, i) => {
    const t0 = 0.32 + i * 0.11;
    const k = seg(c, t0, t0 + 0.35);
    const fade = 1 - seg(c, 2.3, 2.7);
    cr.visible = c > t0 && fade > 0;
    const s = i % 2 ? 1 : -1;
    const x1 = s * (0.022 + (i % 4) * 0.009), z1 = B.D / 2 + 0.012 + (i % 3) * 0.011;
    cr.position.set(x1 * k, 0.0015 + Math.sin(k * PI) * 0.012, B.D / 2 * (1 - k) + z1 * k);
    cr.rotation.set(k * 3 * s, i * 1.3 + k * 2, k * 4);
    if (k >= 1) cr.rotation.set(0, i * 1.3, 0); // 바닥에 납작 누움
    cr.scale.setScalar(fade);
  });
}, (B) => {
  // 지우개 가루: 문지를 때 밀려 나오는 가늘고 꼬불꼬불 말린 실 모양
  const rm = RUBBER('#d6cebf');
  B.crumbs = Array.from({ length: 12 }, (_, i) => {
    const len = 0.009 + (i % 4) * 0.003, curl = 1.2 + (i % 3) * 0.9;
    const pts = [];
    for (let j = 0; j <= 10; j++) {
      const u = j / 10;
      pts.push(new THREE.Vector3(u * len - len / 2, Math.sin(u * curl * PI) * 0.0018, Math.cos(u * curl * PI) * 0.0012));
    }
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.0014 - (i % 2) * 0.0003, 5);
    const cr = mesh(tube, rm, B.g, '가루');
    cr.userData.noOutline = true; // 가는 실이라 외곽선을 두르면 시커메짐
    return cr;
  });
});

// 6. 맞음: 찌그러지며 뒤로 밀리고, 부러진 쪽에서 조각이 톡 떨어짐
motion('맞음', '찌그러지고 조각이 톡 떨어짐', 2.4, (c, B, t) => {
  const hit = ease(seg(c, 0.12, 0.2)) * (1 - ease(seg(c, 0.35, 1.1)));
  const rx = -0.3 * hit;
  B.body.rotation.x = rx;
  B.body.scale.set(1 + 0.2 * hit, 1 - 0.3 * hit, 1 + 0.1 * hit);
  B.move.position.set(Math.sin(t * 50) * 0.003 * hit, B.liftX(rx), -0.035 * hit);
  if (hit > 0.05) { B.eye(1.3, 0.12); B.mouth.scale.setScalar(1.4); } else blinkAt(B, t);
  const k = seg(c, 0.18, 0.75);
  const fade = 1 - seg(c, 1.8, 2.2);
  B.chip.visible = c > 0.18 && fade > 0;
  B.chip.position.set(B.W / 2 + 0.004 + k * 0.05, (B.H * 0.6) * (1 - k) + 0.006 * k + Math.sin(k * PI) * 0.03, 0.004);
  B.chip.rotation.set(k * 5, 0, -k * 7);
  B.chip.scale.setScalar(fade);
}, (B) => {
  B.chip = mesh(eraserChunk(0.012, 0.011, 0.012, { broken: ['+x', '-x', '+y'], seed: 11, r: 0.002, amp: 0.001 }), RUBBER('#f6f3ec'), B.g, '조각');
});

// 7. 쓰러짐: 부들부들 → 폴짝 → 단면 쪽으로 쿵 → 눈 꼭 감고 → 펑 사라졌다 다시 등장
motion('쓰러짐', '단면 쪽으로 쿵, 펑 사라짐', 4.2, (c, B, t) => {
  if (c < 0.4) { B.move.position.x = Math.sin(t * 60) * 0.003; B.eye(1.4, 1.4); }
  const hop = Math.sin(seg(c, 0.4, 0.75) * PI) * 0.02;
  const a = -PI / 2 * ease(seg(c, 0.55, 0.95)) + Math.sin(seg(c, 0.95, 1.2) * PI) * 0.12;
  B.body.rotation.z = a;
  B.move.position.y = hop + B.liftZ(a);
  if (c > 0.95) { B.eye(1.2, 0.12); B.mouth.scale.setScalar(1.3); }
  const gone = ease(seg(c, 2.2, 2.55));
  const back = ease(seg(c, 3.5, 3.9));
  if (c >= 3.5) { B.body.rotation.z = 0; B.move.position.y = 0; B.eye(1, 1); B.mouth.scale.setScalar(1); }
  B.body.scale.setScalar(c < 3.5 ? 1 - gone : back);
  if (c >= 3.5) B.body.scale.set(back, back * (1 + Math.sin(back * PI) * 0.2), back);
  B.puffs.forEach((p, i) => {
    const k = seg(c, 2.2, 2.9);
    const ang = i / B.puffs.length * PI * 2;
    p.visible = k > 0 && k < 1;
    p.position.set(Math.cos(ang) * (0.01 + k * 0.04), 0.012 + k * 0.012 + Math.sin(ang) * 0.004, Math.sin(ang) * (0.01 + k * 0.04));
    p.scale.setScalar(Math.sin(k * PI) * 1.2);
  });
}, (B) => {
  const wm = mat('#ffffff', 0.9);
  B.puffs = Array.from({ length: 7 }, () => mesh(ball(0.011, 12), wm, B.g, '연기'));
});

// 8. 특기: 다른 반쪽이 와서 맞대 보지만 색도 모양도 안 맞음 → 상대는 떠나고 시무룩
motion('특기 짝 맞추기', '맞대 봤는데 안 맞아서 시무룩', 5.4, (c, B, t) => {
  const P = B.partner;
  const inK = ease(seg(c, 0, 1.0));
  const outK = ease(seg(c, 2.7, 3.7));
  let px = 0.17 - (0.17 - 0.074) * inK;
  const bounce = Math.sin(seg(c, 1.9, 2.25) * PI);
  px += bounce * 0.02 + outK * 0.12;
  P.reset();
  P.move.position.set(px, Math.abs(Math.sin(c * 9)) * 0.006 * (c < 1 || (c > 2.7 && c < 3.7) ? 1 : 0), 0);
  P.g.scale.setScalar(1 - seg(c, 3.4, 3.7));
  P.g.visible = c < 3.7;
  B.body.rotation.y = c < 2.7 ? 0.5 * ease(seg(c, 0.2, 0.6)) : 0.5 * (1 - ease(seg(c, 2.7, 3.2)));
  P.body.rotation.y = -0.4;
  const happy = c > 1.0 && c < 1.9;
  if (happy) {
    const j = Math.abs(Math.sin((c - 1.0) * PI * 2.2)) * 0.012;
    B.move.position.y = j; P.move.position.y = j;
    B.eye(1.4, 1.5); P.eye(1.4, 1.5);
    B.mouth.rotation.z = PI; P.mouth.rotation.z = PI;
  }
  if (c > 1.6 && c < 1.9) { // 꾹 맞대기
    const sq = Math.sin(seg(c, 1.6, 1.9) * PI);
    B.body.scale.set(1 - sq * 0.06, 1 + sq * 0.04, 1);
    P.body.scale.set(1 - sq * 0.06, 1 + sq * 0.04, 1);
  }
  if (c > 1.9 && c < 2.7) { // 띠용 튕겨 나가고, 상대가 도리도리
    B.move.position.x = -bounce * 0.01;
    B.body.rotation.z = Math.sin((c - 1.9) * 20) * 0.08 * (1 - seg(c, 1.9, 2.5));
    B.move.position.y = B.liftZ(B.body.rotation.z);
    P.body.rotation.y = -0.4 + Math.sin((c - 2.2) * 18) * 0.35 * (c > 2.2 ? 1 : 0);
    B.eye(1.2, 1.2);
  }
  if (c > 3.2) { // 시무룩
    const k = ease(seg(c, 3.2, 3.6)) * (1 - ease(seg(c, 5.0, 5.4)));
    B.body.rotation.z = 0.1 * k;
    B.move.position.y = B.liftZ(0.1 * k);
    B.eye(1, 1 - 0.55 * k);
  } else if (!happy && c < 1.0) blinkAt(B, t);
}, (B) => {
  B.partner = makeBanjjok('#ffc4cf', { sleeve: false, broken: '-x', seed: 9 });
  B.g.add(B.partner.g);
});

// ── 반쪽이 눈 시안 (monsters.html?set=banjjokEyes): 같은 몸에 눈만 바꿔 끼워 비교 ──
const banjjokEyes = Object.entries(EYE_STYLES).map(([key, st]) => () => {
  const B = makeBanjjok(undefined, { eyes: key });
  return {
    g: B.g, name: st.name, desc: st.desc,
    update(t) {
      B.reset();
      B.body.rotation.y = Math.sin(t * 0.8 + key.length) * 0.3;
      B.move.position.y = Math.abs(Math.sin(t * 2.5)) * 0.003;
      blinkAt(B, t + key.length * 0.3);
    },
  };
});

// ── 고양이 몬스터 (monsters.html?set=cat): 몬스터인데 하나같이 하찮은 고양이들 ──
const cat = [];

// 앉은 고양이 기본 몸: 동그란 몸 + 머리 + 앞발 + 꼬리
function sitCat(color, { belly = null, sleepy = false, tailColor = color } = {}) {
  const g = new THREE.Group();
  const inner = new THREE.Group();
  g.add(inner);
  const fur = mat(color, 0.8);
  mesh(ball(0.045).scale(1, 1.1, 0.95).translate(0, 0.048, 0), fur, inner, '몸');
  if (belly) mesh(ball(0.028).scale(1, 1.25, 0.5).translate(0, 0.046, 0.031), mat(belly, 0.8), inner, '배');
  const head = new THREE.Group();
  head.position.set(0, 0.1, 0.012);
  inner.add(head);
  mesh(ball(0.038).scale(1.1, 0.95, 1), fur, head, '머리');
  const ears = catEars(head, color, { x: 0.024, y: 0.025 });
  const face = catFace(head, { R: 0.038, sx: 1.1, sleepy });
  const paws = [-1, 1].map((s) => {
    const pw = new THREE.Group();
    pw.position.set(s * 0.017, 0.009, 0.034);
    inner.add(pw);
    mesh(ball(0.011, 16).scale(1, 0.8, 1.4), mat(belly ?? color, 0.8), pw, '발');
    return pw;
  });
  const tail = catTail(inner, tailColor, [[0.03, 0.012, -0.03], [0.055, 0.008, 0], [0.05, 0.007, 0.03], [0.03, 0.007, 0.045]]);
  return { g, inner, head, ears, face, paws, tail };
}

// 1. 식빵냥: 식빵 자세로 굳어서 못 일어남
cat.push(() => {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const C = '#f4b26b';
  mesh(new RoundedBoxGeometry(0.12, 0.07, 0.1, 4, 0.03).translate(0, 0.035, 0), mat(C, 0.8), body, '몸');
  for (const x of [-0.028, 0, 0.028]) { // 등 줄무늬
    mesh(new RoundedBoxGeometry(0.011, 0.006, 0.06, 2, 0.003).translate(x, 0.0695, -0.012), mat('#d9853c', 0.85), body, '무늬');
  }
  const ears = catEars(body, C, { x: 0.03, y: 0.064, z: 0.022, h: 0.026, r: 0.015, tilt: 0.3 });
  const face = catFace(body, { front: 0.05, x: 0.017, y: 0.044, r: 0.0065 });
  for (const s of [-1, 1]) mesh(ball(0.01, 14).scale(1, 0.7, 1), mat('#fde7c8', 0.8), body, '발').position.set(s * 0.016, 0.005, 0.05);
  catTail(body, C, [[0.058, 0.008, -0.03], [0.07, 0.008, 0.01], [0.056, 0.008, 0.045], [0.03, 0.008, 0.056]]);
  return {
    g, name: '식빵냥', desc: '식빵 자세로 굳어서 못 일어남',
    update(t) {
      const c = t % 4;
      const tryUp = bump(c, 2.2, 3.1); // 일어나려고 낑낑…하다 포기
      body.position.y = tryUp * 0.006 + Math.sin(t * 40) * 0.0008 * tryUp;
      body.rotation.x = -tryUp * 0.06;
      body.scale.y = 1 + Math.sin(t * 2) * 0.015 - bump(c, 3.1, 3.35) * 0.08; // 숨쉬기, 포기하고 철퍼덕
      ears.forEach(([e, s]) => (e.rotation.z = -s * (0.3 + tryUp * 0.5)));
      face.blink(bump(c, 3.6, 3.8));
    },
  };
});

// 2. 하악냥: 하악질하는데 너무 작아서 하나도 안 무서움
cat.push(() => {
  const g = new THREE.Group();
  const inner = new THREE.Group();
  g.add(inner);
  const C = '#cfc8c0';
  const fur = mat(C, 0.85);
  const body = mesh(ball(0.028).scale(1, 0.85, 1.3).translate(0, 0, 0), fur, inner, '몸');
  body.position.y = 0.032;
  const legs = [];
  for (const [x, z] of [[-0.014, 0.022], [0.014, 0.022], [-0.014, -0.022], [0.014, -0.022]]) {
    const l = mesh(new THREE.CylinderGeometry(0.006, 0.007, 0.022, 10).translate(0, 0.011, 0), fur, inner, '다리');
    l.position.set(x, 0, z);
    legs.push(l);
  }
  const head = new THREE.Group();
  head.position.set(0, 0.058, 0.03);
  inner.add(head);
  mesh(ball(0.03).scale(1.1, 0.95, 1), fur, head, '머리');
  const ears = catEars(head, C, { x: 0.019, y: 0.02, h: 0.024, r: 0.013 });
  const face = catFace(head, { R: 0.03, sx: 1.1, x: 0.012, y: 0.004, r: 0.0058 });
  const roar = mesh(ball(0.007, 14).scale(1, 1, 0.4), mat('#b8384f', 0.6), face.mouth, '입');
  roar.position.set(0, -0.004, 0.001);
  const tail = catTail(inner, C, [[0, 0.035, -0.035], [0, 0.05, -0.045], [0.004, 0.07, -0.045], [0.01, 0.08, -0.04]], 0.005);
  return {
    g, name: '하악냥', desc: '하악질하는데 소리가 "냐…"',
    update(t) {
      const c = t % 3;
      const h = bump(c, 1.3, 2.6);
      const k = Math.min(1, h * 1.6);
      body.scale.y = 1 + k * 0.35; // 등 둥글게 세우고 털 부풀리기
      body.position.y = 0.032 + k * 0.008;
      inner.scale.setScalar(1 + k * 0.1);
      inner.position.x = Math.sin(t * 70) * 0.0012 * k; // 바들바들
      inner.position.z = -k * 0.008;
      tail.scale.set(1 + k * 0.6, 1 + k * 0.2, 1 + k * 0.6);
      legs.forEach((l) => (l.scale.y = 1 + k * 0.4));
      roar.scale.set(1, Math.max(0.01, k), 1);
      face.mouth.scale.setScalar(1 + k * 0.3);
      ears.forEach(([e, s]) => (e.rotation.z = -s * (0.35 + k * 0.9)));
      head.rotation.x = -k * 0.15;
      face.blink(bump(c, 2.75, 2.9));
    },
  };
});

// 3. 녹은냥: 너무 편해서 녹아 버림, 일어나려다 다시 녹음
cat.push(() => {
  const g = new THREE.Group();
  const C = '#a9a4a0';
  const fur = mat(C, 0.7);
  const puddle = mesh(ball(1, 40), fur, g, '몸');
  puddle.position.y = 0.006;
  const head = new THREE.Group();
  g.add(head);
  mesh(ball(0.034), fur, head, '머리');
  const ears = catEars(head, C, { x: 0.02, y: 0.022, h: 0.026, r: 0.014, tilt: 0.55 });
  const face = catFace(head, { R: 0.034, x: 0.013, y: 0.002, r: 0.006, sleepy: true });
  catTail(g, C, [[0.05, 0.005, -0.04], [0.08, 0.005, -0.05], [0.1, 0.005, -0.03], [0.105, 0.006, -0.005]], 0.006);
  return {
    g, name: '녹은냥', desc: '편해서 녹음, 일어나려다 또 녹음',
    update(t) {
      const c = t % 4.5;
      const up = bump(c, 2.3, 3.6) ** 0.7;
      const wob = Math.sin(t * 2.2) * 0.004;
      puddle.scale.set(0.09 - up * 0.035 + wob, 0.02 + up * 0.035, 0.08 - up * 0.03 - wob);
      head.position.set(0, 0.032 + up * 0.032, 0.022 - up * 0.01);
      head.scale.set(1 + (1 - up) * 0.15, 0.72 + up * 0.28, 1);
      ears.forEach(([e, s]) => (e.rotation.z = -s * (0.55 - up * 0.25)));
      face.sleep(up < 0.5);
    },
  };
});

// 4. 빙글냥: 자기 꼬리 쫓다가 어지러워 벌러덩
cat.push(() => {
  const g = new THREE.Group();
  const spin = new THREE.Group();
  g.add(spin);
  const fall = new THREE.Group();
  spin.add(fall);
  const C = '#fbf3e6', O = '#f4a259';
  const fur = mat(C, 0.8);
  mesh(ball(0.038).scale(1, 0.85, 1.3).translate(0, 0.04, 0), fur, fall, '몸');
  mesh(ball(0.02).scale(1.3, 0.5, 1.2).translate(0.012, 0.07, -0.01), mat(O, 0.8), fall, '무늬');
  for (const [x, z] of [[-0.016, 0.03], [0.016, 0.03], [-0.016, -0.03], [0.016, -0.03]]) {
    mesh(ball(0.01, 12).scale(1, 0.8, 1.2), fur, fall, '발').position.set(x, 0.007, z);
  }
  const head = new THREE.Group();
  head.position.set(0, 0.07, 0.04);
  fall.add(head);
  mesh(ball(0.033).scale(1.1, 0.95, 1), fur, head, '머리');
  catEars(head, O, { x: 0.021, y: 0.021, h: 0.025, r: 0.014 });
  const face = catFace(head, { R: 0.033, sx: 1.1, x: 0.013, y: 0.003, r: 0.006 });
  const tail = catTail(fall, O, [[0, 0.045, -0.048], [0.02, 0.05, -0.065], [0.045, 0.055, -0.06], [0.055, 0.06, -0.035]], 0.0065);
  return {
    g, name: '빙글냥', desc: '꼬리 쫓다 어지러워서 벌러덩',
    update(t) {
      const c = t % 4.2;
      const r = Math.min(1, c / 2.2);
      spin.rotation.y = -(r * r) * PI * 2 * 3; // 점점 빨라지며 세 바퀴
      tail.rotation.y = Math.sin(t * 9) * 0.25;
      const down = csm(c, 2.2, 2.45) * (1 - csm(c, 3.7, 4.0));
      fall.rotation.z = down * 1.25 + Math.sin(t * 7) * 0.06 * down; // 옆으로 벌러덩, 휘청휘청
      fall.position.x = -down * 0.03;
      head.rotation.z = Math.sin(t * 5) * 0.25 * down; // 머리 빙빙
      face.sleep(down > 0.5);
    },
  };
});

// 5. 상자냥: 작은 상자에 꼈는데 상자째 콩콩 뜀
cat.push(() => {
  const g = new THREE.Group();
  const hop = new THREE.Group();
  g.add(hop);
  const box = mat('#c9a06a', 0.95);
  const W = 0.09, H = 0.06, D = 0.08, T = 0.004;
  const wall = (w, h, d, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), box, hop, '상자').position.set(x, y, z);
  wall(W, H, T, 0, H / 2, D / 2);
  wall(W, H, T, 0, H / 2, -D / 2);
  wall(T, H, D, W / 2, H / 2, 0);
  wall(T, H, D, -W / 2, H / 2, 0);
  wall(W, T, D, 0, T / 2, 0);
  mesh(new THREE.BoxGeometry(0.03, 0.012, 0.001), mat('#a37945', 1), hop, '눈').position.set(0, 0.03, D / 2 + T / 2 + 0.0005); // 테이프
  const flaps = [];
  for (const [w, d, x, z, ax, sgn] of [[W, 0.03, 0, D / 2, 'x', 1], [W, 0.03, 0, -D / 2, 'x', -1], [0.03, D, W / 2, 0, 'z', -1], [0.03, D, -W / 2, 0, 'z', 1]]) {
    const piv = new THREE.Group();
    piv.position.set(x, H, z);
    hop.add(piv);
    const f = mesh(new THREE.BoxGeometry(ax === 'x' ? w : 0.03, T, ax === 'x' ? 0.03 : d), box, piv, '상자');
    if (ax === 'x') f.position.z = sgn * 0.015; else f.position.x = -sgn * 0.015;
    flaps.push([piv, ax, sgn]);
  }
  const C = '#3f3a39';
  const head = new THREE.Group();
  head.position.set(0, 0.066, 0.004);
  hop.add(head);
  mesh(ball(0.043).scale(1, 0.82, 0.95), mat(C, 0.8), head, '머리');
  const ears = catEars(head, C, { x: 0.026, y: 0.024, h: 0.026, r: 0.015 });
  // 까만 고양이라 눈은 노랗게
  const face = catFace(head, { R: 0.04, x: 0.016, y: 0.004, r: 0.0075 });
  face.eyes.forEach((e) => { e.children[0].material = mat('#ffd84a', 0.3); e.children[0].scale.set(1, 1.25, 0.6); });
  for (const e of face.eyes) {
    const pu = mesh(ball(0.0035, 10).scale(0.6, 1.6, 0.6), BLACK, e, '눈');
    pu.position.z = 0.004;
  }
  for (const s of [-1, 1]) mesh(ball(0.01, 14).scale(1, 0.75, 1.3), mat(C, 0.8), hop, '발').position.set(s * 0.018, 0.062, 0.042);
  return {
    g, name: '상자냥', desc: '상자에 꼈는데 상자째 콩콩',
    update(t) {
      const c = t % 1.4;
      const j = bump(c, 0.35, 0.85);
      const land = bump(c, 0.85, 1.05);
      hop.position.y = j * 0.03;
      hop.scale.set(1 + land * 0.08, 1 - land * 0.12 + j * 0.05, 1 + land * 0.08);
      head.position.y = 0.066 + land * 0.008 - j * 0.004;
      flaps.forEach(([p, ax, s]) => (p.rotation[ax] = s * (ax === 'x' ? 1 : 1) * (0.9 + j * 0.5 - land * 0.3)));
      ears.forEach(([e, s]) => (e.rotation.z = -s * (0.35 + land * 0.4)));
      face.blink(bump(t % 3.1, 2.9, 3.05));
    },
  };
});

// 6. 꾸벅냥: 싸우다가도 졸아서 코풍선
cat.push(() => {
  const C = sitCat('#b7aca2', { belly: '#ece6df', sleepy: true });
  const bubble = mesh(ball(1, 24), new THREE.MeshStandardMaterial({ color: '#bfe6ff', roughness: 0.1, transparent: true, opacity: 0.55 }), C.head, '코풍선');
  bubble.position.set(0.006, -0.004, 0.044);
  for (const x of [-0.012, 0.012]) mesh(new RoundedBoxGeometry(0.006, 0.003, 0.03, 2, 0.0015).translate(x, 0.034, -0.008), mat('#8f8378', 0.85), C.head, '무늬');
  return {
    g: C.g, name: '꾸벅냥', desc: '싸우다가도 졸아서 코풍선',
    update(t) {
      const c = t % 4.5;
      const nod = c < 3.2 ? csm(c, 0, 3.2) : 0;
      const jolt = bump(c, 3.2, 3.6);
      C.head.rotation.x = nod * 0.55 - jolt * 0.2;
      C.head.rotation.z = nod * 0.15;
      C.inner.rotation.x = nod * 0.08;
      C.face.sleep(!(c > 3.2 && c < 3.9));
      const b = c < 3.2 ? 0.004 + 0.016 * nod + Math.sin(t * 3) * 0.002 : 0;
      bubble.scale.setScalar(Math.max(0.0001, b));
      bubble.position.x = 0.006 + b * 0.6;
      C.ears.forEach(([e, s]) => (e.rotation.z = -s * (0.35 + nod * 0.25 - jolt * 0.2)));
    },
  };
});

// 7. 털뭉치냥: 털이 너무 많아서 재채기하면 굴러감
cat.push(() => {
  const g = new THREE.Group();
  const roll = new THREE.Group();
  g.add(roll);
  const C = '#f6f1ea';
  const fur = mat(C, 1);
  const core = new THREE.Group();
  core.position.y = 0.05;
  roll.add(core);
  mesh(ball(0.048), fur, core, '몸');
  const tufts = [];
  const N = 60;
  for (let i = 0; i < N; i++) {
    const y = 1 - ((i + 0.5) / N) * 2, rr = Math.sqrt(1 - y * y), ph = i * 2.39996;
    const d = new THREE.Vector3(Math.cos(ph) * rr, y, Math.sin(ph) * rr);
    if (d.z > 0.55 && Math.abs(d.y) < 0.55 && Math.abs(d.x) < 0.6) continue; // 얼굴 자리
    if (d.y < -0.7) continue;
    const m = mesh(ball(0.016, 12), fur, core, '털');
    m.position.copy(d).multiplyScalar(0.046);
    tufts.push([m, d, Math.random() * 6]);
  }
  const ears = catEars(core, C, { x: 0.024, y: 0.042, h: 0.02, r: 0.011, tilt: 0.4 });
  const face = catFace(core, { R: 0.048, x: 0.012, y: 0.004, r: 0.0055 });
  for (const s of [-1, 1]) mesh(ball(0.008, 12).scale(1, 0.7, 1.2), PINK, roll, '발').position.set(s * 0.018, 0.004, 0.03);
  return {
    g, name: '털뭉치냥', desc: '털이 많아 재채기하면 굴러감',
    update(t) {
      const c = t % 3.4;
      const inhale = csm(c, 1.6, 2.3) * (1 - csm(c, 2.3, 2.35));
      const ach = c > 2.3 ? 1 - csm(c, 2.3, 3.3) : 0; // 에취! 하고 뒤로 데굴
      roll.rotation.x = -ach * 1.6 * (c < 2.6 ? csm(c, 2.3, 2.6) : 1) + inhale * 0.25;
      roll.position.z = -ach * 0.05 * (c < 2.6 ? csm(c, 2.3, 2.6) : 1);
      roll.position.y = 0;
      core.scale.setScalar(1 + inhale * 0.08);
      tufts.forEach(([m, d, ph]) => {
        const out = 0.046 + ach * 0.012 * (c < 2.6 ? csm(c, 2.3, 2.45) : 1) + Math.sin(t * 3 + ph) * 0.0015;
        m.position.copy(d).multiplyScalar(out);
      });
      face.mouth.scale.setScalar(1 + bump(c, 2.25, 2.6) * 0.8);
      face.blink(Math.max(inhale * 0.8, bump(c, 2.3, 2.9)));
      ears.forEach(([e, s]) => (e.rotation.z = -s * (0.4 + ach * 0.5)));
    },
  };
});

// 8. 꾹꾹냥: 공격 대신 땅에 꾹꾹이만 함
cat.push(() => {
  const C = sitCat('#f4b26b', { belly: '#fde7c8', sleepy: true });
  for (const x of [-0.013, 0, 0.013]) mesh(new RoundedBoxGeometry(0.006, 0.003, 0.03, 2, 0.0015).translate(x, 0.034, -0.008), mat('#d9853c', 0.85), C.head, '무늬');
  const hearts = [];
  const heartGeo = (() => {
    const s = new THREE.Shape();
    s.moveTo(0, -0.6);
    s.bezierCurveTo(-0.2, -0.35, -1, 0, -0.6, 0.55);
    s.bezierCurveTo(-0.35, 0.85, 0, 0.6, 0, 0.35);
    s.bezierCurveTo(0, 0.6, 0.35, 0.85, 0.6, 0.55);
    s.bezierCurveTo(1, 0, 0.2, -0.35, 0, -0.6);
    return new THREE.ExtrudeGeometry(s, { depth: 0.25, bevelEnabled: false }).center();
  })();
  for (let i = 0; i < 3; i++) {
    const h = mesh(heartGeo, mat('#ff7fa3', 0.6), C.g, '하트');
    hearts.push([h, i]);
  }
  return {
    g: C.g, name: '꾹꾹냥', desc: '공격 대신 꾹꾹이만 함',
    update(t) {
      const k = t * 5;
      C.paws.forEach((p, i) => {
        const press = Math.max(0, Math.sin(k + i * PI));
        p.position.y = 0.009 + (1 - press) * 0.012;
        p.position.z = 0.034 + (1 - press) * 0.004;
        p.scale.set(1 + press * 0.15, 1 - press * 0.25, 1);
      });
      C.inner.rotation.z = Math.sin(k) * 0.05;
      C.inner.position.x = Math.sin(t * 60) * 0.0005; // 골골골
      C.head.rotation.z = -Math.sin(k) * 0.08;
      C.tail.rotation.y = Math.sin(t * 1.5) * 0.2;
      hearts.forEach(([h, i]) => {
        const r = ((t * 0.5 + i / 3) % 1);
        h.position.set(Math.sin(r * 8 + i) * 0.015 + (i - 1) * 0.02, 0.13 + r * 0.08, 0.02);
        h.scale.setScalar(0.012 * Math.sin(r * PI));
      });
    },
  };
});

// ── 하악냥 모션 시안 (monsters.html?set=haak): 게임과 같은 하악냥(monsters/haaknyang.js)으로 동작을 하나씩 반복 ──
const haak = HAAK_MOTIONS.map((m) => () => {
  const H = makeHaak();
  m.extra?.(H);
  return { g: H.g, name: m.name, desc: m.desc, update(t) { H.reset(); m.fn(t % m.period, H, t); H.ground(); H.whiskers(t); } };
});

// ── 하악냥 눈 시안 (monsters.html?set=haakEyes): 같은 하악냥에 눈만 바꿔 끼우고, 가끔 하악질 ──
const haakEyes = Object.entries(HAAK_EYES).map(([key, st], i) => () => {
  const H = makeHaak({ eye: st.build });
  return {
    g: H.g, name: st.name, desc: st.desc,
    update(t) {
      H.reset();
      const c = (t + i * 0.35) % 4;
      const k = Math.pow(bump(c, 2.2, 3.6), 0.5); // 가끔 하악
      H.fluff(k);
      H.hiss(k);
      H.body.position.x = Math.sin(t * 70) * 0.0008 * k;
      H.head.rotation.y = Math.sin(t * 0.8 + i) * 0.3 * (1 - k);
      H.tail.rotation.z = Math.sin(t * 2 + i) * 0.4;
      if (k < 0.05) hBlink(H, t + i * 0.3);
      H.ground();
      H.whiskers(t);
    },
  };
});

// ── 비둘기 몬스터 (monsters.html?set=pigeon): 날아다니는데 하나같이 하찮은 비둘기들 ──
const pigeon = [];

const tmpV = new THREE.Vector3();


// 1. 구구: 엄청 열심히 파닥이는데 제자리
pigeon.push(() => {
  const P = makePigeon();
  return {
    g: P.g, name: '구구', desc: '죽어라 파닥이는데 제자리',
    update(t) {
      const a = P.flap(t, 22, 1.0);
      P.fly.position.y = 0.13 + a * 0.004;
      P.body.rotation.x = -0.15;
      P.head.rotation.x = 0.15 + Math.sin(t * 3) * 0.05;
      P.feet.forEach((f, i) => (f.rotation.x = 0.5 + Math.sin(t * 22 + i) * 0.3));
      P.blink(bump(t % 3, 2.6, 2.8));
    },
  };
});

// 2. 까딱이: 날면서도 고개를 앞뒤로 까딱까딱
pigeon.push(() => {
  const P = makePigeon({ grey: '#b7bcc6', neck: '#8b6fb0' });
  return {
    g: P.g, name: '까딱이', desc: '날면서도 고개 까딱은 못 참음',
    update(t) {
      P.flap(t, 12, 0.8);
      const k = (t * 2.4) % 1;
      P.head.position.z = 0.04 + (k < 0.25 ? k / 0.25 : 1 - (k - 0.25) / 0.75) * 0.016;
      P.body.position.z = Math.sin(t * 2.4 * PI * 2) * 0.003;
      P.fly.position.y = 0.13 + Math.sin(t * 2) * 0.008;
      P.blink(bump(t % 4, 3.5, 3.7));
    },
  };
});

// 3. 통통이: 너무 뚱뚱해서 날개가 손톱만 함. 가끔 툭 떨어졌다 낑낑 올라감
pigeon.push(() => {
  const P = makePigeon({ grey: '#9aa2b0', fat: 1.35, wing: 0.55 });
  return {
    g: P.g, name: '통통이', desc: '날개보다 몸이 세 배',
    update(t) {
      const drop = bump(t % 4, 2.5, 3.6);
      P.flap(t, 34, 1.1, 0.4);
      P.fly.position.y = 0.11 - Math.pow(drop, 0.6) * 0.07 + Math.sin(t * 34) * 0.002;
      P.body.rotation.x = -0.3 + drop * 0.35;
      P.body.position.x = Math.sin(t * 50) * 0.001; // 힘들어서 덜덜
      P.blink(drop > 0.3 ? 1 : 0); // 떨어질 땐 눈 질끈
    },
  };
});

// 4. 꾸벅이: 날다가 졸아서 뚝 떨어지고 깜짝 깨서 다시 올라감
pigeon.push(() => {
  const P = makePigeon({ grey: '#c1c4cb', wingC: '#a3a8b3', neck: '#7aa6a0' });
  return {
    g: P.g, name: '꾸벅이', desc: '날면서 졸다가 추락',
    update(t) {
      const c = t % 5;
      const doze = c < 3.2 ? THREE.MathUtils.clamp((c - 1) / 1.5, 0, 1) : 0; // 점점 졸림
      const wake = bump(c, 3.2, 4.2); // 화들짝
      const fall = c > 2.5 && c < 3.2 ? (c - 2.5) / 0.7 : c >= 3.2 ? Math.max(0, 1 - (c - 3.2) / 1.5) : 0;
      P.flap(t, 12 - doze * 9 + wake * 16, 0.9 - doze * 0.6, 0.2 + doze * 0.5);
      P.fly.position.y = 0.13 - fall * fall * 0.08;
      P.head.rotation.x = doze * 0.7 - wake * 0.3;
      P.body.rotation.x = doze * 0.25;
      P.eyes.forEach((e) => e.scale.setScalar(1 + wake * 0.6)); // 깜짝 눈 커짐
      P.blink(doze);
    },
  };
});

// 5. 빵둘기: 빵 부스러기 물고 자랑하며 빙빙
pigeon.push(() => {
  const P = makePigeon({ grey: '#a6a7b3' });
  const bread = mesh(new RoundedBoxGeometry(0.018, 0.01, 0.012, 2, 0.004), mat('#e8b86a', 0.9), P.head, '빵');
  bread.position.set(0.006, -0.006, 0.034);
  bread.rotation.z = 0.3;
  return {
    g: P.g, name: '빵둘기', desc: '빵 부스러기 하나로 세상 다 가짐',
    update(t) {
      P.flap(t, 10, 0.7);
      P.fly.rotation.y = t * 1.2;
      P.fly.position.set(Math.sin(t * 1.2) * 0.03, 0.14 + Math.sin(t * 2.4) * 0.01, Math.cos(t * 1.2) * 0.03);
      P.body.rotation.z = -0.3; // 기울여 선회
      P.head.rotation.z = 0.25 + Math.sin(t * 4) * 0.1; // 우쭐
      P.blink(0.55); // 거만한 반쯤 뜬 눈
    },
  };
});

// 6. 뱅글이: 한쪽 날개만 파닥여서 제자리에서 뱅글뱅글
pigeon.push(() => {
  const P = makePigeon({ grey: '#b0a8a2', wingC: '#978e88', neck: '#9b7aa8' });
  return {
    g: P.g, name: '뱅글이', desc: '한쪽 날개만 써서 계속 돎',
    update(t) {
      P.wings[1][0].rotation.z = Math.sin(t * 18) * 1.0 + 0.3; // 오른쪽만 열심
      P.wings[0][0].rotation.z = 0.1; // 왼쪽은 접어 둠
      P.body.rotation.y = t * 3;
      P.body.rotation.z = 0.35;
      P.fly.position.y = 0.12 + Math.sin(t * 18) * 0.003;
      P.head.rotation.z = -0.35; // 어지러워 고개 갸웃
      P.eyes.forEach((e, i) => (e.rotation.z = t * 8 * (i ? 1 : -1))); // 눈 핑글
    },
  };
});

// 7. 털빠짐이: 파닥일 때마다 깃털이 빠져서 떨어짐
pigeon.push(() => {
  const P = makePigeon({ grey: '#9fa6b4', wingC: '#8a91a0' });
  const fs = [];
  for (let i = 0; i < 5; i++) fs.push(mesh(ball(0.008, 10).scale(0.45, 0.12, 1.2), mat('#c9ced8', 0.9), P.g, '깃털'));
  return {
    g: P.g, name: '털빠짐이', desc: '날 때마다 깃털이 숭숭 빠짐',
    update(t) {
      P.flap(t, 15, 0.9);
      P.fly.position.y = 0.13 + Math.sin(t * 1.7) * 0.006;
      P.head.rotation.x = 0.2; // 시무룩
      fs.forEach((f, i) => {
        const r = (t * 0.35 + i / fs.length) % 1;
        const side = i % 2 ? 1 : -1;
        f.position.set(side * (0.06 + Math.sin(r * 9 + i) * 0.015), 0.14 - r * 0.14, Math.cos(r * 7 + i) * 0.02);
        f.rotation.set(Math.sin(r * 6 + i) * 0.6, r * 4, Math.sin(r * 8) * 0.8);
        f.visible = r < 0.97;
      });
      P.blink(bump(t % 3.5, 3, 3.2));
    },
  };
});

// 8. 뒷걸음이: 앞으로 가려는데 자꾸 뒤로 날아감
pigeon.push(() => {
  const P = makePigeon({ grey: '#ece9e4', wingC: '#d7d2cb', neck: '#cfc8bf', eye: 'dot' }); // 흰 비둘기인데 하찮음
  return {
    g: P.g, name: '뒷걸음이', desc: '흰 비둘기인데 후진만 됨',
    update(t) {
      const c = t % 3;
      P.flap(t, 16, 0.9, -0.1);
      P.fly.position.z = 0.03 - (c / 3) * 0.08; // 슬금슬금 뒤로, 그리고 다시 처음
      P.body.rotation.x = 0.35; // 몸이 뒤로 젖혀짐
      P.head.rotation.x = -0.25; // 당황해서 앞을 봄
      P.tail.rotation.x = -0.3;
      P.blink(bump(c, 1.5, 1.7));
    },
  };
});

// ── 까치 몬스터 (monsters.html?set=magpie): 비둘기처럼 날아다니는 공격형. 검은 몸에 흰 배·흰 어깨, 긴 꽁지 ──
// 구구와 같은 makePigeon 뼈대에 색·부리·꽁지만 까치로 바꿔 끼운다 (게임에 넣을 때 구구 동작·keepAbove 를 그대로 쓸 수 있게)
const magpie = [];
// 몸(makeMagpie)은 monsters/kkakkak.js 에 (게임과 함께 씀)

// 1. 깍깍이: 위에서 맴돌다 날개 접고 급강하해 콕콕 쪼고 다시 올라감
magpie.push(() => {
  const P = makeMagpie();
  return {
    g: P.g, name: '내리꽂이', desc: '머리 위에서 내리꽂아 쪼기',
    update(t) {
      const c = t % 3.2;
      const dive = gease(gseg(c, 1.1, 1.5)), up = gease(gseg(c, 2.2, 3.2));
      const k = dive * (1 - up);
      P.flap(t, 11 + up * 14, 0.9 * (1 - k) + 0.1, 0.2);
      P.sweep(k);
      P.fly.position.set(0, 0.2 - k * 0.15, -0.03 + k * 0.07);
      P.body.rotation.x = 0.6 * dive * (1 - gseg(c, 1.5, 1.7)) - 0.25 * up;
      const peck = c > 1.5 && c < 2.2 ? Math.max(0, Math.sin((c - 1.5) * 28)) : 0;
      P.head.rotation.x = 0.3 * k + peck * 0.5;
      P.head.position.z = 0.042 + peck * 0.008;
      P.jaw.rotation.x = c < 1 ? bump(c, 0.2, 0.5) * 0.5 : 0;
      P.angry(t, k > 0.1 ? 1 : 0);
    },
  };
});

// 2. 반짝도둑: 금화를 발에 꼭 쥐고 지그재그로 약 올리며 날아다님
magpie.push(() => {
  const P = makeMagpie({ sheen: '#2a7a6a' });
  const coin = mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.003, 20).rotateX(PI / 2), new THREE.MeshStandardMaterial({ color: '#ffd24a', metalness: 0.7, roughness: 0.25 }), P.body, '금화');
  coin.position.set(0, -0.034, 0.002);
  return {
    g: P.g, name: '반짝도둑', desc: '반짝이는 건 다 내 거',
    update(t) {
      P.flap(t, 15, 0.85);
      P.fly.position.set(Math.sin(t * 2.2) * 0.05, 0.15 + Math.abs(Math.sin(t * 4.4)) * 0.015, 0);
      P.body.rotation.z = -Math.cos(t * 2.2) * 0.35;
      P.feet.forEach((f) => (f.rotation.x = 0.4)); // 금화 쥐느라 발을 앞으로
      coin.rotation.y = Math.sin(t * 3) * 0.4;
      P.head.rotation.y = Math.sin(t * 1.1) * 0.6; // 놀리듯 두리번
      P.head.rotation.x = 0;
      caw(P, t, 2.2);
      P.blink(0.45); // 얄미운 반쯤 뜬 눈
      P.angry(t, 0);
    },
  };
});

// 3. 텃세대장: 자기 구역 위를 빙빙 돌며 쉬지 않고 깍! 깍! 경고
magpie.push(() => {
  const P = makeMagpie();
  return {
    g: P.g, name: '텃세대장', desc: '여긴 내 구역이다 깍깍',
    update(t) {
      P.flap(t, 12, 0.8);
      P.fly.rotation.y = -t * 1.4;
      P.fly.position.set(-Math.sin(t * 1.4) * 0.04, 0.17 + Math.sin(t * 2.8) * 0.01, -Math.cos(t * 1.4) * 0.04);
      P.body.rotation.z = 0.35;
      P.head.rotation.z = -0.2;
      P.head.rotation.x = 0;
      caw(P, t, 0.7);
      P.angry(t, 1);
    },
  };
});

// 4. 꽁지칼: 칼처럼 긴 꽁지로 제자리 회전 베기
magpie.push(() => {
  const P = makeMagpie({ tail: 3.4, sheen: '#2d4f9a' });
  return {
    g: P.g, name: '꽁지칼', desc: '꽁지 한 바퀴 휘둘러 베기',
    update(t) {
      const c = t % 2.6;
      const spin = gease(gseg(c, 1.4, 1.9));
      P.flap(t, 14 + spin * 10, 0.85);
      P.fly.position.y = 0.13 + Math.sin(t * 2) * 0.006;
      P.body.rotation.y = spin * PI * 2;
      P.body.rotation.z = Math.sin(spin * PI) * 0.4;
      P.tail.rotation.y = Math.sin(spin * PI) * 0.5 - bump(c, 0.6, 1.4) * 0.3; // 휘두르기 전에 뒤로 당김
      P.tail.rotation.x = -0.15;
      P.head.rotation.x = -bump(c, 0.6, 1.4) * 0.2;
      P.angry(t, c > 0.6 && c < 2 ? 1 : 0);
    },
  };
});

// 5. 돌떨굼이: 높이 떠서 조약돌을 떨어뜨리고 깍깍 웃음
magpie.push(() => {
  const P = makeMagpie();
  const rock = mesh(new THREE.DodecahedronGeometry(0.008, 0).scale(1, 0.8, 1), mat('#8d8a85', 0.95), P.g, '돌');
  return {
    g: P.g, name: '돌떨굼이', desc: '위에서 돌 떨구고 깔깔',
    update(t) {
      const c = t % 2.4;
      P.flap(t, 12, 0.8);
      P.fly.position.y = 0.24 + Math.sin(t * 2) * 0.006;
      P.feet.forEach((f) => (f.rotation.x = c < 0.8 ? 0.4 : 1.3));
      P.head.rotation.x = 0.5; // 아래를 내려다봄
      const fall = Math.max(0, c - 0.8);
      rock.position.set(0, c < 0.8 ? P.fly.position.y - 0.04 : Math.max(0.0065, P.fly.position.y - 0.04 - 4 * fall * fall), 0.004);
      rock.rotation.set(Math.min(fall, 0.45) * 12, Math.min(fall, 0.45) * 8, 0);
      const laugh = c > 1.2;
      P.jaw.rotation.x = laugh ? Math.abs(Math.sin(c * 18)) * 0.45 : 0; // 깍깍깍
      P.body.rotation.x = laugh ? Math.sin(c * 18) * 0.06 : 0;
      P.angry(t, 0);
      P.blink(laugh ? 0.5 : 0);
    },
  };
});

// 6. 깃세움이: 날개 활짝·꽁지 치켜들고 목털 부풀려 위협
magpie.push(() => {
  const P = makeMagpie({ wing: 1.25 });
  return {
    g: P.g, name: '깃세움이', desc: '날개 쫙 펴고 몸 부풀려 위협',
    update(t) {
      const c = t % 3;
      const puff = gease(gseg(c, 0.3, 0.7)) * (1 - gease(gseg(c, 2.4, 2.9)));
      P.flap(t, 9, 0.6 * (1 - puff) + 0.05, 0.2 + puff * 0.2);
      P.fly.position.set(Math.sin(t * 40) * 0.0012 * puff, 0.14, 0); // 부르르
      P.neck.scale.setScalar(1 + puff * 0.35);
      P.tail.rotation.x = puff * 0.6;
      P.tail.scale.x = 1 + puff * 0.8;
      P.body.rotation.x = -puff * 0.25;
      P.jaw.rotation.x = puff * 0.5;
      P.angry(t, puff > 0.3 ? 1 : 0);
    },
  };
});

// 7. 가지창: 나뭇가지를 창처럼 물고 앞으로 돌진, 콕 찌르고 물러남
magpie.push(() => {
  const P = makeMagpie({ sheen: '#3b6f8f' });
  const twig = mesh(new THREE.CylinderGeometry(0.0013, 0.002, 0.07, 6).rotateX(PI / 2), mat('#7a5634', 0.9), P.head, '가지');
  twig.position.set(0.004, -0.004, 0.045);
  return {
    g: P.g, name: '가지창', desc: '가지 물고 돌격',
    update(t) {
      const c = t % 2.2;
      const charge = gease(gseg(c, 0.8, 1.1)) * (1 - gease(gseg(c, 1.5, 2.2)));
      P.flap(t, 13 + charge * 12, 0.9 - charge * 0.6);
      P.sweep(charge * 0.8);
      P.fly.position.set(0, 0.13, -0.04 + charge * 0.09);
      P.body.rotation.x = charge * 0.3 - bump(c, 0.2, 0.8) * 0.15;
      P.head.rotation.x = -bump(c, 0.2, 0.8) * 0.15; // 겨누기
      P.angry(t, charge > 0.2 ? 1 : 0);
    },
  };
});

// 8. 왕까치: 덩치 큰 우두머리. 무겁게 날갯짓하며 빨간 눈으로 노려보고 고개를 휙 돌림
magpie.push(() => {
  const P = makeMagpie({ fat: 1.25, wing: 1.3, tail: 2.8, iris: '#e23b2e', sheen: '#4a2f7a' });
  return {
    g: P.g, name: '왕까치', desc: '까치들의 우두머리, 노려보기',
    update(t) {
      const c = t % 3.6;
      P.flap(t, 7, 1.0, 0.25);
      P.fly.position.y = 0.14 + Math.sin(t * 7) * 0.008;
      const snap = gease(gseg(c, 1.8, 1.95)) * (1 - gease(gseg(c, 3, 3.3)));
      P.head.rotation.y = snap * 0.9 - 0.15;
      P.head.rotation.x = -0.12 - snap * 0.1;
      P.jaw.rotation.x = 0;
      if (c > 2 && c < 2.5) caw(P, c - 2, 10);
      P.blink(0.25); // 가늘게 뜬 눈
      P.angry(t, snap > 0.5 ? 1 : 0);
    },
  };
});

// ── 깍깍이 시안 (monsters.html?set=kkakkak): 텃세대장을 다듬은 공격형 까치. 날씬한 몸, 깡패 같은 성격 ──
// 늘 반쯤 감은 눈으로 째려보고, 동작마다 '내 구역에서 꺼져' 하는 태도
const kkakkak = [];
// 몸·동작은 monsters/kkakkak.js 에 (게임과 함께 씀). 매 프레임 처음 자세로 되돌린 뒤 동작을 얹는다
const KM = {}; // 이름 → 동작 (체형 시안에서 다시 씀)
const kFrame = (P, t, X, m) => { kReset(P, t); m.update(P, t, X); };
KKAK_MOTIONS.forEach((m) => {
  KM[m.name] = m;
  kkakkak.push(() => {
    const P = makeKkakkak();
    const X = m.extra?.(P) ?? {};
    return { g: P.g, name: m.name, desc: m.desc, update: (t) => kFrame(P, t, X, m) };
  });
});

// ── 깍깍이 체형 시안 (monsters.html?set=kkakkakLook): 몸 비율만 바꿔 나란히. 4초씩 서서 깍깍 ↔ 날기 번갈아 ──
const kkakkakLook = [
  ['지금', '꼬마 체형 (현재)', {}],
  ['예전', '짧고 살짝 통통', { fat: 0.85, len: 0.62, size: 0.85 }],
  ['더 통통', '몸통 더 굵고 짧게', { fat: 1.0, len: 0.56 }],
  ['땅딸', '굵고 아주 짧게, 목 더 짧게', { fat: 0.95, len: 0.5, neckH: 0.6, tail: 2.6 }],
  ['균형', '몸통 조금 길게, 목 조금 길게', { fat: 0.85, len: 0.75, neckH: 0.82 }],
  ['꽁지 길게', '꽁지가 몸의 두 배', { tail: 3.6 }],
  ['날개 크게', '날개를 더 크게', { wing: 1.6 }],

  ['덩치', '크고 다부지게', { fat: 0.95, len: 0.7, size: 1.0 }],
].map(([name, desc, look]) => () => {
  const P = makeKkakkak(look);
  return { g: P.g, name, desc, update: (t) => kFrame(P, t, {}, KM[Math.floor(t / 4) % 2 ? '대기' : '서서 깍깍']) };
});

// ── 구구 모션 시안 (monsters.html?set=gugu): 같은 구구로 게임에 쓸 동작을 하나씩 반복 ──
const gugu = GUGU_MOTIONS.map((m) => () => {
  const P = makePigeon();
  const X = m.extra?.(P) ?? {};
  return { g: P.g, name: m.name, desc: m.desc, update(t) { P.reset(); m.fn(t % m.period, P, t, X); P.keepAbove(0); } };
});

// ── 구구 어울림 시안 (monsters.html?set=guguWith): 날개콩·나무·주민 같은 다른 것과 함께하는 동작 ──
const guguWith = [];

// 합동: 구구가 날아와 날개콩 머리에 턱 앉음 → 날개콩이 물음표 띄우고 "뭐지?" 갸웃갸웃 → 깜짝 눈치채고(!)
// → 위를 째려보며 화내고 방방 뜀 → 구구는 화들짝 날아가고, 날개콩은 하늘을 보며 한 번 더 씩씩
// (구구는 중립형: 먼저 공격하지 않고 그냥 앉을 데를 찾았을 뿐)
const questionMark = () => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    transparent: true, depthWrite: false, depthTest: false, // 머리 위 구구에 가려지지 않게
    map: canvasTexture('monsterQuestion', 128, 128, (g, w, h) => {
      g.font = `900 ${h * 0.9}px 'Pretendard', 'Malgun Gothic', sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineJoin = 'round';
      g.lineWidth = 16;
      g.strokeStyle = '#4a3525';
      g.strokeText('?', w / 2, h * 0.54);
      g.fillStyle = '#ffffff';
      g.fillText('?', w / 2, h * 0.54);
    }),
  }));
  s.renderOrder = 2;
  return s;
};
guguWith.push(() => {
  const g = new THREE.Group();
  const N = createNalgaekong();
  N.root.userData.smoothPose = true; // 날개콩 동작이 바뀔 때도 부드럽게
  g.add(N.root);
  const P = makePigeon();
  g.add(P.g);
  const q = questionMark();
  N.root.add(q);
  const START = new THREE.Vector3(-0.35, 0.3, -0.12); // 왼쪽 뒤 하늘에서 옴
  const END = new THREE.Vector3(0.38, 0.36, -0.2); // 오른쪽 하늘로 도망
  const AT = new THREE.Vector3(0, 0, -0.004);
  const nBody = N.root.getObjectByName('몸');
  const core = nBody.parent;
  // 날개콩 정수리 높이 (구구 좌표로): 몸 공 가운데 + 반지름(찌부·부풀기까지 따라감)
  const sc = new THREE.Vector3();
  const headTop = () => {
    g.updateMatrixWorld(true);
    nBody.getWorldPosition(tmpV);
    tmpV.y += 0.0618 * sc.setFromMatrixScale(nBody.matrixWorld).y;
    return P.g.worldToLocal(tmpV).y;
  };
  let last = 0;
  const T = 9;
  return {
    g, name: '날개콩이랑', desc: '머리에 앉자 "뭐지?" → 눈치채고 방방, 구구는 도망',
    update(t) {
      const c = t % T, pc = last % T;
      const dt = Math.min(0.1, Math.max(0, t - last));
      const at = (x) => (pc < x && c >= x) || (c < pc && x <= c); // 이번 프레임에 x 초를 지났나
      last = t;
      // ── 날개콩 ──
      if (at(0.05)) { N.play('idle'); N.setMood(null); }
      if (at(3.6)) N.play('notice'); // 깜짝! (느낌표)
      if (at(4.0)) { N.play('angry'); N.setMood('angry'); }
      if (at(5.0)) N.play('angry');
      if (at(6.3)) N.play('angry'); // 날아간 하늘에 대고 한 번 더
      if (at(8.2)) N.setMood(null);
      N.update(dt);
      // 뭐지?: 물음표가 뿅 뜨고, 고개를 이쪽저쪽 갸웃하며 눈을 위로 굴림
      const huh = gease(gseg(c, 2.3, 2.5)) * (1 - gease(gseg(c, 3.45, 3.6)));
      q.visible = huh > 0.01;
      q.scale.setScalar(0.06 * huh * (1 + 0.1 * Math.sin(c * 8)));
      q.position.set(-0.085, 0.135 + Math.sin(c * 4) * 0.004, 0.02); // 머리 옆 (위는 구구 자리)
      core.rotation.z += Math.sin((c - 2.3) * 3.2) * 0.22 * huh;
      // 화남: 고개(몸 전체)를 뒤로 젖혀 머리 위 구구를 째려봄 (원래 화남은 고개를 숙임) → 구구가 날아가면 그쪽 하늘을 봄
      const lookUp = Math.max(huh * 0.35, gease(gseg(c, 3.6, 3.9)) * (1 - gease(gseg(c, 7.6, 8.2))));
      core.rotation.x = THREE.MathUtils.lerp(core.rotation.x, -0.45, lookUp);
      core.rotation.y = gease(gseg(c, 5.5, 6.2)) * 0.5 * lookUp; // 도망가는 쪽(오른쪽)으로 고개 돌림
      const hops = (c - 4.1) * 2.6; // 방방 횟수 (정수일 때 발이 땅에 닿음)
      const hopping = hops > 0 && hops < 5; // 땅에 닿는 순간에만 시작·끝·높이 바꿈
      N.root.position.y = hopping ? Math.abs(Math.sin(hops * PI)) * (hops > 2 ? 0.045 : 0.03) : 0; // 방방
      N.root.rotation.y = hopping ? Math.sin(c * 9) * 0.15 : 0;
      const top = headTop();

      // ── 구구: 날아와 앉아 쉬다가, 날개콩이 깜짝 뛰자 휘청휘청 → 화들짝 도망 ──
      P.reset();
      perchCycle(P, c, t, AT, top, {
        from: START, to: END, leaveAt: 5.3,
        sit: (s) => {
          const shake = c > 3.6 ? 1 : 0;
          if (!shake) return;
          P.body.rotation.z = Math.sin(c * 16) * 0.18; // 휘청
          P.body.rotation.x = -0.1 + Math.sin(c * 11) * 0.1;
          P.head.rotation.y = -0.7; // 밑을 내려다봄
          P.head.rotation.x = 0.35;
          P.eyes.forEach((e) => e.scale.setScalar(1.4));
          if (c > 4.6) P.wings.forEach(([w, ws]) => (w.rotation.z += ws * Math.abs(Math.sin(c * 20)) * 0.4)); // 날개 들썩, 버티기
        },
      });
      if (c > 5.3) P.eyes.forEach((e) => e.scale.setScalar(1.4 - 0.4 * gseg(c, 5.5, 6.5)));
      P.keepAbove(0);
    },
  };
});

// 날아와 어딘가(나뭇가지·캐릭터 머리)에 앉았다가 다시 날아가는 한 바퀴 (T 초)
// top: 앉을 자리 윗면 (구구 좌표), at: 앉을 자리 x·z. 0~1.8 날아옴 → 2.1 착지 → leaveAt 까지 앉아 쉼 → 날아감 → 안 보임
// fold·eyes: 날개 접기·눈 (깍깍이는 자기 접기·째려보는 눈)
function perchCycle(P, c, t, at, top, { from, to, leaveAt = 4.6, sit = null, fold = foldWings, eyes = gBlink }) {
  const spot = new THREE.Vector3(at.x, top + 0.04, at.z);
  P.g.visible = c < leaveAt + 1.8;
  const ph = kPhase(c, 1e3, (x) => 20 + 8 * gseg(x, 1.6, 1.9)); // 내려앉을 때 날갯짓이 빨라져도 위상은 이어지게
  if (c < 1.8) { // 날아옴
    const k = gease(gseg(c, 0, 1.8));
    P.fly.position.lerpVectors(from, spot, k);
    P.fly.position.y += Math.sin(k * PI) * 0.06 + 0.02 * (1 - k);
    P.fly.rotation.y = THREE.MathUtils.lerp(Math.atan2(spot.x - from.x, spot.z - from.z), 0, gease(gseg(c, 1.2, 1.8)));
    P.flap(ph, 1, 1.0, 0.2 + 0.1 * gseg(c, 1.5, 1.8));
    P.body.rotation.x = 0.15;
  } else if (c < 2.1) { // 내려앉기: 몸 세우고 발 내밀며 파닥파닥 브레이크
    const k = gease(gseg(c, 1.8, 2.1));
    P.fly.position.copy(spot);
    P.flap(ph, 1, 1.1, 0.3);
    P.body.rotation.x = -0.5;
    P.tail.scale.x = 1.6;
    P.tail.rotation.x = -0.4;
    P.feet.forEach((f) => (f.rotation.x = -0.2));
    P.plant(top, k);
  } else if (c < leaveAt) { // 앉아 쉼: 날개 접고 까딱·두리번, 한 번 구구구 (목 부풀리고 꾸벅)
    const s = c - 2.1;
    P.fly.position.copy(spot);
    const f = gease(gseg(c, 2.1, 2.35)); // 브레이크 날갯짓이 잦아들며 접힘
    if (f < 1) P.flap(ph, 1, 1.1 * (1 - f), 0.3 * (1 - f));
    fold(P, f);
    P.feet.forEach((fo) => (fo.rotation.x = -0.2 * (1 - f)));
    P.bob(t, 1.6, 0.006);
    P.head.rotation.y = Math.sin(s * 2.2) * 0.6;
    const coo = bump(c, 2.8, 3.8);
    P.neck.scale.setScalar(1 + coo * 0.3);
    P.body.rotation.x = -0.1 + Math.max(0, Math.sin(s * 9)) * coo * 0.3;
    P.tail.scale.x = 1 + coo * 0.4;
    sit?.(s, coo);
    // 브레이크 자세(몸 세우고 꽁지 쫙)에서 앉은 자세로 스르르
    P.body.rotation.x = THREE.MathUtils.lerp(-0.5, P.body.rotation.x, f);
    P.tail.scale.x = THREE.MathUtils.lerp(1.6, P.tail.scale.x, f);
    P.tail.rotation.x = THREE.MathUtils.lerp(-0.4, P.tail.rotation.x, f);
    P.plant(top);
  } else { // 짝! 날아감
    const clap = bump(c, leaveAt, leaveAt + 0.2);
    const k = gease(gseg(c, leaveAt + 0.15, leaveAt + 1.8));
    P.fly.position.lerpVectors(spot, to, k);
    P.fly.position.y += clap * 0.02;
    P.fly.rotation.y = THREE.MathUtils.lerp(0, Math.atan2(to.x - spot.x, to.z - spot.z), gease(gseg(c, leaveAt + 0.1, leaveAt + 0.6)));
    if (c < leaveAt + 0.2) {
      P.wings.forEach(([w, s, h]) => { w.rotation.z = s * clap * 1.5; h.rotation.z = s * clap * 0.4; });
      fold(P, 1 - gease(gseg(c, leaveAt, leaveAt + 0.12))); // 접은 날개를 펴면서 짝!
    }
    else { const r = gease(gseg(c, leaveAt + 0.2, leaveAt + 0.35)); P.flap(t, 24, r, 0.25 * r); } // 짝 뒤로 날갯짓이 스르르 시작
    P.body.rotation.x = 0.2 * k;
    P.feet.forEach((f) => (f.rotation.x = THREE.MathUtils.lerp(0, 1.3, k)));
    if (c < leaveAt + 0.15) P.plant(top);
  }
  eyes(P, t);
}


// 나무에 앉기: 따로 가지를 만들지 않고, 마을에 있는 둥근 나무 그대로 잎 덩어리 위 평평한 곳에 사뿐
// K: 누가 앉나 (구구·깍깍이) — 만들기·처음 자세·앉는 버릇
const treePerch = (K) => () => {
  const g = new THREE.Group();
  const tree = new THREE.Group();
  g.add(tree);
  mesh(trunkGeometry(), mat('#c0905c', 0.9), tree, '줄기');
  mesh(roundCanopy(), new THREE.MeshStandardMaterial({ color: '#8fcf6a', vertexColors: true, roughness: 0.9 }), tree, '잎');
  // 화면 앞쪽(+z)으로 보이고 덜 기울어진 자리 하나를 고름
  const score = (c) => c.p.z + c.p.x * 0.3 - c.slope * 0.6;
  const spot = canopyPerches().sort((a, b) => score(b) - score(a))[0].p;
  const P = K.make();
  g.add(P.g);
  const TREE_S = 0.8; // 마을 나무 크기 (주민 키와 견줘 보기 좋게)
  const at = new THREE.Vector3();
  return {
    g, name: '나무에 앉기', desc: K.treeDesc,
    update(t) {
      tree.scale.setScalar(TREE_S / g.scale.x); // 시안 화면은 몬스터만 크게 키우므로 나무는 원래 크기로 되돌림
      tree.position.set(-0.3 / g.scale.x, 0, -0.7 / g.scale.x); // 다른 시안 뒤쪽에
      g.updateMatrixWorld(true);
      at.copy(spot);
      P.g.worldToLocal(tree.localToWorld(at));
      K.reset(P, t);
      perchCycle(P, t % 7, t, at, at.y, {
        from: new THREE.Vector3(at.x + 0.45, at.y + 0.1, at.z + 0.2), to: new THREE.Vector3(at.x + 0.5 * K.far, at.y + 0.25 + K.up, at.z - 0.3), leaveAt: 4.9, ...K.opts(P, t),
      });
      P.keepAbove(0);
    },
  };
};

// 캐릭터 머리에 앉기: 주민이 가만히 서 있으면 머리 위로 와서 앉음 (주민이 움직이면 놀라 날아가는 건 게임에서)
const headPerch = (K) => () => {
  const g = new THREE.Group();
  const V = createVillager(PRESETS.boy);
  g.add(V.root);
  const P = K.make();
  g.add(P.g);
  const head = V.rig.head;
  // 정수리 자리 (머리 기준): 머리 묶음 전체의 가장 높은 곳
  g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(head);
  const crown = head.worldToLocal(new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y - 0.01, (box.min.z + box.max.z) / 2 - 0.02));
  const at = new THREE.Vector3();
  return {
    g, name: '머리에 앉기', desc: K.headDesc,
    update(t) {
      V.root.scale.setScalar(1 / g.scale.x); // 시안 화면은 몬스터만 크게 키우므로 주민은 원래 크기로 되돌림
      g.updateMatrixWorld(true);
      at.copy(crown);
      P.g.worldToLocal(head.localToWorld(at));
      K.reset(P, t);
      const top = at.y;
      perchCycle(P, t % 7.5, t, at, top, {
        from: new THREE.Vector3(at.x - 0.4, top + 0.15, at.z + 0.15), to: new THREE.Vector3(at.x + 0.4 * K.far, top + 0.25 + K.up, at.z - 0.2), leaveAt: 5.4, ...K.opts(P, t, (s) => { if (s > 2.2) P.head.rotation.x = 0.4; }), // 나중엔 머리카락 사이를 콕콕 들여다봄
      });
      P.keepAbove(0);
    },
  };
};
const PIGEON_K = {
  make: makePigeon, reset: (P) => P.reset(), opts: (P, t, sit = null) => ({ sit }), far: 1, up: 0, // far·up: 떠날 때 얼마나 멀리·높이
  treeDesc: '마을 나무 잎 덩어리 위 평평한 곳에 사뿐, 구구구 쉬다 날아감', headDesc: '가만히 있는 캐릭터 머리에 와서 털썩',
};
guguWith.push(treePerch(PIGEON_K), headPerch(PIGEON_K));

// 하악냥이랑: 하악냥이 잡으려 해도 구구는 가볍게 피함 (하악냥은 게임과 같은 monsters/haaknyang.js 동작을 이어 붙임)
const haakFn = (name) => HAAK_MOTIONS.find((m) => m.name === name).fn;
const guguHaak = []; // 마을 나무가 없으니 따로 가까이서 봄
const haakDuo = (name, desc, T, fn) => guguHaak.push(() => {
  const g = new THREE.Group();
  const H = makeHaak();
  H.g.name = '하악냥'; // 하악냥은 원래 외곽선 그대로
  H.g.userData.haak = H;
  H.g.scale.setScalar(1.6); // 비둘기보다 고양이가 커 보이게
  g.add(H.g);
  const P = makePigeon();
  g.add(P.g);
  return {
    g, name, desc,
    update(t) {
      H.reset();
      P.reset();
      fn(t % T, H, P, t);
      H.ground();
      H.whiskers(t);
      P.keepAbove(0);
    },
  };
});

// ① 날 때: 머리 위에서 파닥이는 구구를 올려다보다 웅크렸다 폴짝! 앞발 툭툭 → 구구는 살짝 옆으로 비켜 올라감 → 하악냥 실망, 구구는 유유히 날아감
const JUMP = haakFn('점프 툭'), SAD = haakFn('실망');
const HOVER = new THREE.Vector3(0, 0.25, 0.06), DODGE = new THREE.Vector3(0.12, 0.32, 0.03);
haakDuo('하악냥 점프', '날고 있으면 폴짝 뛰어 툭툭 → 구구는 살짝 비켜 유유히', 6.2, (c, H, P, t) => {
  // 하악냥
  if (c < 1.4) { // 고개 들고 구구를 따라 봄, 꼬리 살랑
    H.head.rotation.x = -0.45;
    H.head.rotation.y = Math.sin(c * 3) * 0.15;
    H.eyeSize(1.2);
    hBlink(H, t);
  } else if (c < 2.9) JUMP(c - 1.4, H, t); // 앞발이 닿는 순간: 2.0, 2.08 초
  else SAD(c - 2.9, H, t);
  // 구구
  P.g.visible = c < 5.4;
  const inK = gease(gseg(c, 0, 1.0));
  const dodge = gease(gseg(c, 1.72, 1.98)); // 앞발이 닿기 직전에 사뿐
  const away = gease(gseg(c, 3.6, 5.4));
  P.fly.position.set(-0.45, 0.38, -0.1).lerp(HOVER, inK).lerp(DODGE, dodge);
  P.fly.position.lerp(new THREE.Vector3(0.5, 0.48, -0.3), away);
  P.fly.position.y += Math.sin(t * 7) * 0.004 * (1 - away); // 제자리 파닥이며 둥실
  P.fly.rotation.y = THREE.MathUtils.lerp(1.3, 0.5, inK) + away * 0.8;
  const quick = bump(c, 1.72, 2.05);
  P.flap(t, 18 + quick * 12, 1.0 + quick * 0.2, 0.25);
  P.body.rotation.z = -quick * 0.4; // 옆으로 몸을 기울여 비킴
  P.body.rotation.x = 0.05 + 0.15 * away;
  P.feet.forEach((f) => (f.rotation.x = 1.3));
  const look = c > 1.0 && c < 3.6 ? 1 : 0; // 밑의 하악냥을 내려다봄
  P.head.rotation.x = 0.4 * look;
  P.head.rotation.y = -0.4 * look;
  P.eyes.forEach((e) => e.scale.setScalar(1 + 0.3 * bump(c, 1.6, 2.6)));
  gBlink(P, t);
});

// ② 걸을 때: 구구가 아장아장 콕콕 → 하악냥이 납작 웅크려 엉덩이 씰룩 → 덮쳐! → 구구는 짝! 가볍게 날아올라 피함
// → 하악냥 코 박고 부르르, 구구는 옆에 사뿐 내려앉아 아무 일 없다는 듯 다시 아장아장
const POUNCE = haakFn('공격 ② 덮치기');
const PZ = 0.16; // 구구가 걷는 줄 (하악냥이 덮치면 코가 닿는 곳)
haakDuo('하악냥 덮치기', '걷고 있으면 웅크렸다 덮쳐! → 구구는 짝! 날아 피함', 7, (c, H, P, t) => {
  // 하악냥: 0.4 초부터 덮치기 (웅크림 0.4~1.6, 덮침 1.6~2.0, 코 박음 2.0~3.2, 부르르, 제자리 ~4.2)
  if (c < 0.4 || c > 4.2) { H.head.rotation.y = -0.4; hBlink(H, t); }
  else POUNCE(c - 0.4, H, t);
  // 구구
  const up = gseg(c, 1.5, 1.85), down = gseg(c, 3.7, 4.3);
  const air = gease(up) * (1 - gease(down));
  let x;
  if (c < 1.5) x = THREE.MathUtils.lerp(-0.2, 0, gease(gseg(c, 0, 1.0))); // 아장아장 와서 콕콕
  else if (c < 4.3) x = THREE.MathUtils.lerp(0, 0.15, gease(gseg(c, 1.55, 4.3))); // 날아서 옆으로 비킴
  else x = THREE.MathUtils.lerp(0.15, 0.3, gseg(c, 4.6, 7)); // 다시 아장아장 지나감
  P.fly.position.set(x, 0, PZ);
  P.fly.rotation.y = PI / 2;
  P.g.visible = c < 6.9;
  if (c < 1.5 || c > 4.3) { // 땅
    foldWings(P, 1);
    P.body.rotation.x = -0.12;
    const walking = c < 1.0 || c > 4.5;
    if (walking) waddle(P, t * PI * 2.6, c > 4.3 ? gease(gseg(c, 4.5, 4.8)) : 1); // 내려앉은 뒤엔 천천히 다시 걸음
    else if (c < 1.5) { // 콕콕
      const peck = Math.max(0, Math.sin((c - 1.0) * PI * 4));
      P.body.rotation.x = -0.12 + peck * 0.6;
      P.head.rotation.x = peck * 0.6;
      P.tail.rotation.x = peck * 0.3;
    }
    if (c > 4.3) P.head.rotation.y = -0.5 * (1 - gease(gseg(c, 4.6, 5.0))); // 내려앉아 하악냥 쪽을 힐끔 보다가 앞으로
    P.fly.position.y = STAND_Y;
    P.plant(0);
  } else if (c < 1.65) { // 짝! 날개 위로 (하악냥이 박차기 직전, 엉덩이 씰룩할 때 눈치챔)
    const clap = bump(c, 1.5, 1.65);
    P.wings.forEach(([w, s, h]) => { w.rotation.z = s * clap * 1.5; h.rotation.z = s * clap * 0.4; });
    foldWings(P, 1 - gease(gseg(c, 1.5, 1.6))); // 접은 날개를 펴면서 짝!
    P.feet.forEach((f) => (f.rotation.x = -0.2));
    P.fly.position.y = STAND_Y + clap * 0.012;
    P.eyes.forEach((e) => e.scale.setScalar(1.4));
  } else { // 둥실 떠서 코 박은 하악냥을 내려다봄 → 브레이크하며 내려앉음
    const brake = bump(c, 3.8, 4.3);
    P.flap(t, 20 + brake * 8, 1.0, 0.25 + brake * 0.1);
    P.body.rotation.x = 0.05 - brake * 0.6;
    P.tail.scale.x = 1 + brake * 0.7;
    P.tail.rotation.x = -brake * 0.4;
    P.feet.forEach((f) => (f.rotation.x = brake > 0.1 ? 1.3 - brake * 1.6 : THREE.MathUtils.lerp(0, 1.3, air)));
    P.head.rotation.x = 0.45 * (1 - brake);
    P.head.rotation.y = -0.6;
    P.eyes.forEach((e) => e.scale.setScalar(1.4 - 0.4 * gseg(c, 2.2, 3.0)));
    P.fly.position.y = THREE.MathUtils.lerp(STAND_Y, 0.2, air) + Math.sin(t * 20) * 0.003 * air;
    if (c > 4.1) P.plant(0, gseg(c, 4.1, 4.3));
  }
  gBlink(P, t);
});

// ── 깍깍이 어울림 시안 (monsters.html?set=kkakkakWith): 날개콩 괴롭히기, 먼 거리 날기, 나무·머리에 앉기 ──
const kkakkakWith = [];
const kLerp = THREE.MathUtils.lerp;

// 괴롭히기: 날아와 날개콩 옆에 내려앉음 → 날개콩 깜짝(!) 돌아봄 → 깍깍 시비 → 콕콕콕 쪼기
// (날개콩은 맞을 때마다 번쩍·찌부·깃털, 조금씩 밀려남) → 울상으로 버둥버둥 도망 → 깍깍이는 깡총깡총 쫓다가 가슴 펴고 깍깍 비웃고 날아감
kkakkakWith.push(() => {
  const g = new THREE.Group();
  const N = createNalgaekong();
  N.root.userData.smoothPose = true;
  g.add(N.root);
  const nMove = N.root.getObjectByName('몸').parent.parent; // 날개콩 동작이 움직이는 몸 묶음
  const P = makeKkakkak();
  g.add(P.g);
  const T = 10;
  const PK = [3.1, 3.55, 4.0, 4.4, 4.75]; // 부리가 닿는 순간
  const FROM = new THREE.Vector3(-0.42, 0.28, -0.2), AWAY = new THREE.Vector3(0.6, 0.42, -0.4);
  const MX = -0.117; // 날개콩 왼쪽 옆, 깍깍이가 설 자리
  const pushed = (c) => PK.reduce((s, p) => s + 0.016 * gease(gseg(c, p, p + 0.25)), 0); // 맞을 때마다 쓱 밀려난 거리
  const ground = new THREE.Vector3();
  let last = 0;
  return {
    g, name: '날개콩 괴롭히기', desc: '옆에 내려앉아 깍깍 시비 → 콕콕콕 → 날개콩은 울상으로 도망, 깍깍 비웃음',
    update(t) {
      const c = t % T, pc = last % T;
      const dt = Math.min(0.1, Math.max(0, t - last));
      const at = (x) => (pc < x && c >= x) || (c < pc && x <= c);
      last = t;
      // ── 날개콩 ──
      if (at(0.02)) N.play('idle');
      if (at(2.3)) N.play('notice'); // 깜짝! 옆에 누가?
      PK.forEach((p) => { if (at(p)) N.play('hit'); });
      if (at(5.15)) N.play('flutter'); // 울상(질끈 눈·땀)으로 버둥버둥 도망
      if (at(7.35)) N.play('walk');
      if (at(9.2)) N.play('spawn');
      N.update(dt);
      nMove.position.z *= 0.3; // 맞고 뒤로 밀리는 건 아래 pushed 로 쌓음 (맞을 때마다 제자리로 툭 돌아오지 않게)
      const back = c >= 9.2; // 다시 처음 자리에서 뿅
      const flee = gseg(c, 5.15, 8.3);
      N.root.position.set(back ? 0 : pushed(c) + 0.7 * flee ** 1.4, 0, 0);
      N.root.rotation.y = back ? 0 : -PI / 2 * gease(gseg(c, 2.5, 2.9)) + PI * gease(gseg(c, 5.0, 5.35)); // 깍깍이 쪽을 봤다가 반대로 휙
      N.root.visible = !(c > 8.3 && c < 9.2);
      N.root.scale.setScalar(back ? 1 : 1 - gease(gseg(c, 7.9, 8.3)));

      // ── 깍깍이 ──
      kReset(P, t);
      P.g.visible = c < 9.3;
      const chase = gease(gseg(c, 5.2, 5.9));
      ground.set(MX + pushed(c - 0.12) + 0.09 * chase, STAND_Y, 0);
      if (c < 1.5) { // 날아옴
        const k = gease(gseg(c, 0, 1.5));
        P.fly.position.lerpVectors(FROM, ground, k);
        P.fly.position.y += Math.sin(k * PI) * 0.05 + (1 - k) * 0.03;
        P.fly.rotation.y = kLerp(Math.atan2(ground.x - FROM.x, ground.z - FROM.z), PI / 2, gease(gseg(c, 0.9, 1.5)));
        P.fly.scale.setScalar(gease(gseg(c, 0, 0.2)));
        P.flap(t, 20, 1.0, 0.2 + 0.1 * gseg(c, 1.1, 1.5));
        P.body.rotation.x = kLerp(0.15, -0.6, gease(gseg(c, 1.1, 1.5))); // 몸 세워 브레이크
        P.tailFan = gease(gseg(c, 1.1, 1.5));
        P.feet.forEach((f) => (f.rotation.x = kLerp(1.3, -0.3, gseg(c, 1.0, 1.5))));
      } else if (c < 1.9) { // 파닥파닥 브레이크하며 내려앉음
        const k = gease(gseg(c, 1.5, 1.9));
        P.fly.position.copy(ground);
        P.fly.position.y += (1 - k) * 0.012;
        P.fly.rotation.y = PI / 2;
        P.flap(t, 20, 1.0 + 0.1 * k, 0.3);
        P.body.rotation.x = -0.6;
        P.tailFan = 1;
        P.feet.forEach((f) => (f.rotation.x = -0.3));
        P.plant(0, k);
      } else if (c < 7.4) { // 땅
        const f = gease(gseg(c, 1.9, 2.2)); // 날개 착 접음
        if (f < 1) P.flap(t, 20, 1.1 * (1 - f), 0.3 * (1 - f));
        kStand(P, f);
        P.fly.position.x = ground.x;
        P.fly.rotation.y = PI / 2;
        P.body.rotation.x = kLerp(-0.6, 0.05, f);
        P.tailFan = 1 - gease(gseg(c, 1.9, 2.4));
        P.feet.forEach((fo) => (fo.rotation.x = -0.3 * (1 - f)));
        // 깍깍 시비: 고개 들이밀며 깍깍, 꽁지 까딱
        const ch = Math.abs(Math.sin(c * 14)) * gease(gseg(c, 2.35, 2.45)) * (1 - gease(gseg(c, 2.7, 2.85)));
        P.jaw.rotation.x = ch * 0.5;
        P.head.position.z += gease(gseg(c, 2.2, 2.4)) * (1 - gease(gseg(c, 2.75, 2.95))) * 0.006;
        P.tail.rotation.x = ch * 0.3;
        // 콕콕콕: 고개 젖혀 힘 모았다가 몸째 콕!
        let wind = 0, hit = 0;
        for (const p of PK) {
          const s = c - p;
          wind = Math.max(wind, gease(gseg(s, -0.3, -0.12)) * (1 - gease(gseg(s, -0.1, -0.03))));
          hit = Math.max(hit, gease(gseg(s, -0.08, 0)) * (1 - gease(gseg(s, 0.05, 0.25))));
        }
        P.body.rotation.x += hit * 0.2 - wind * 0.15; // 땅이 아니라 날개콩 옆구리를 향해 앞으로 콕
        P.head.rotation.x += hit * 0.15 - wind * 0.3;
        P.head.position.z += hit * 0.012;
        P.fly.position.x += hit * 0.008 - wind * 0.004; // 몸째 들이받듯
        P.tail.rotation.x += hit * 0.35;
        P.wings.forEach(([w, s]) => (w.rotation.z += s * hit * 0.12));
        // 밀려난 날개콩 따라 한 발짝, 도망가면 깡총깡총 쫓아감
        const step = PK.reduce((m, p) => Math.max(m, bump(c, p + 0.12, p + 0.4)), 0);
        const hop = c > 5.2 && c < 5.9 ? Math.abs(Math.sin(((c - 5.2) / 0.35) * PI)) : 0;
        P.fly.position.y += step * 0.006 + hop * 0.018;
        P.feet.forEach((fo) => (fo.rotation.x += hop * 0.7));
        // 깍깍 비웃음: 가슴 쭉, 고개 쳐들고 깍깍깍, 꽁지 까딱
        const mock = gease(gseg(c, 6.0, 6.25)) * (1 - gease(gseg(c, 7.0, 7.3)));
        const ha = Math.abs(Math.sin(c * 13)) * mock;
        P.body.rotation.x -= mock * 0.3 + ha * 0.08;
        P.head.rotation.x -= mock * 0.25;
        P.jaw.rotation.x += ha * 0.55;
        P.tail.rotation.x += ha * 0.3 + mock * Math.max(0, Math.sin(c * 7)) * 0.2;
        P.plant(0);
      } else { // 짝! 날아감
        const open = gease(gseg(c, 7.4, 7.6));
        const k = gease(gseg(c, 7.45, 9.3));
        P.fly.position.lerpVectors(ground, AWAY, k);
        P.fly.position.y = kLerp(STAND_Y, AWAY.y, k) + bump(c, 7.4, 7.65) * 0.015;
        P.fly.rotation.y = kLerp(PI / 2, Math.atan2(AWAY.x - ground.x, AWAY.z - ground.z), gease(gseg(c, 7.5, 8.1)));
        P.flap(t, 20, 1.0 * open, 0.25 * open);
        P.foldWings(1 - open);
        P.body.rotation.x = kLerp(0.05, 0.15, k);
        P.feet.forEach((f) => (f.rotation.x = kLerp(0, 1.3, gseg(c, 7.5, 8.0))));
        P.fly.scale.setScalar(1 - gease(gseg(c, 9.0, 9.3)));
        if (c < 7.6) P.plant(0);
      }
      P.glare(c > 2.9 && c < 4.9 ? 0.6 : 0.45);
      P.angry(t, c > 2.3 && c < 7.4 ? 1 : 0);
    },
  };
});

// 공중에서 머리 쪼기: 날개콩 머리 위에 떠서 정수리를 콕콕 → 날개콩이 버둥버둥 도망가도 위에 붙어 따라가며 콕콕
// → 위로 솟아 깍깍 비웃고 날아감
kkakkakWith.push(() => {
  const g = new THREE.Group();
  const N = createNalgaekong();
  N.root.userData.smoothPose = true;
  g.add(N.root);
  const nBall = N.root.getObjectByName('몸');
  const nMove = nBall.parent.parent;
  const P = makeKkakkak();
  g.add(P.g);
  const T = 9;
  const PK = [2.2, 2.6, 3.0, 3.4, 4.75, 5.15]; // 부리가 정수리에 닿는 순간 (뒤의 둘은 도망가는 걸 따라가며)
  const FROM = new THREE.Vector3(-0.42, 0.3, -0.2), AWAY = new THREE.Vector3(0.65, 0.45, -0.4);
  const sc = new THREE.Vector3(), head = new THREE.Vector3(), hover = new THREE.Vector3(), from2 = new THREE.Vector3();
  // 날개콩 정수리 (깍깍이 좌표로)
  const headTop = () => {
    g.updateMatrixWorld(true);
    nBall.getWorldPosition(head);
    head.y += 0.0618 * sc.setFromMatrixScale(nBall.matrixWorld).y;
    return P.g.worldToLocal(head);
  };
  let last = 0;
  return {
    g, name: '날개콩 머리 쪼기', desc: '머리 위에 떠서 정수리 콕콕, 도망가도 따라가며 콕콕',
    update(t) {
      const c = t % T, pc = last % T;
      const dt = Math.min(0.1, Math.max(0, t - last));
      const at = (x) => (pc < x && c >= x) || (c < pc && x <= c);
      last = t;
      // ── 날개콩 ──
      if (at(0.02)) N.play('idle');
      if (at(1.5)) N.play('notice'); // 머리 위에 뭐야?!
      PK.forEach((p) => { if (at(p)) N.play('hit'); });
      if (at(3.85)) N.play('flutter'); // 버둥버둥 도망
      if (at(6.05)) N.play('walk');
      if (at(8.3)) N.play('spawn');
      N.update(dt);
      nMove.position.z *= 0.3;
      const back = c >= 8.3;
      const flee = gseg(c, 3.85, 7.0);
      N.root.position.set(back ? 0 : 0.6 * flee ** 1.3, 0, 0);
      N.root.rotation.y = back ? 0 : PI / 2 * gease(gseg(c, 3.7, 4.0)); // 도망가는 쪽으로 휙
      const lookUp = gease(gseg(c, 1.5, 1.8)) * (1 - gease(gseg(c, 3.6, 3.9))); // 머리 위를 올려다봄
      nBall.parent.rotation.x = THREE.MathUtils.lerp(nBall.parent.rotation.x, -0.35, lookUp);
      N.root.visible = !(c > 7.0 && c < 8.3);
      N.root.scale.setScalar(back ? 1 : 1 - gease(gseg(c, 6.6, 7.0)));
      const top = headTop();

      // ── 깍깍이 ──
      kReset(P, t);
      P.g.visible = c < 8.3;
      P.fly.rotation.y = PI / 2;
      hover.set(top.x - 0.034, 0.1263 + nMove.position.y + 0.006, top.z); // 높이는 찌부되기 전 정수리 (맞고 찌부될 때 같이 내려가지 않게) // 정수리 왼쪽 위에 떠서
      let wind = 0, hit = 0;
      for (const p of PK) {
        const s = c - p;
        wind = Math.max(wind, gease(gseg(s, -0.25, -0.1)) * (1 - gease(gseg(s, -0.09, -0.03))));
        hit = Math.max(hit, gease(gseg(s, -0.07, 0)) * (1 - gease(gseg(s, 0.05, 0.22))));
      }
      P.flap(kPhase(t, T, (x) => 14 + 8 * gseg(x, 3.8, 4.2) * (1 - gseg(x, 5.5, 5.9))), 1, 0.85, 0.3); // 쫓아갈 땐 다급하게
      if (c < 1.4) { // 날아와 머리 위에 멈춤
        const k = gease(gseg(c, 0, 1.4));
        P.fly.position.lerpVectors(FROM, hover, k);
        P.fly.position.y += Math.sin(k * PI) * 0.04;
        P.fly.rotation.y = THREE.MathUtils.lerp(Math.atan2(hover.x - FROM.x, hover.z - FROM.z), PI / 2, gease(gseg(c, 0.8, 1.4)));
        P.fly.scale.setScalar(gease(gseg(c, 0, 0.2)));
        P.body.rotation.x = 0.15 * (1 - k);
      } else if (c < 5.6) { // 떠서 콕콕 (도망가면 따라붙음)
        P.fly.position.copy(hover);
        P.fly.position.y += Math.sin(t * 9) * 0.003 + wind * 0.008 - hit * 0.008;
        P.body.rotation.x = -0.25 + hit * 0.75 - wind * 0.2; // 몸 세워 떠 있다가 앞으로 숙여 내리찍기
        P.head.rotation.x = hit * 0.5 - wind * 0.3;
        P.head.position.z += hit * 0.006;
        P.tailFan = 0.6;
        P.tail.rotation.x = -0.3 + hit * 0.5;
        P.feet.forEach((f) => (f.rotation.x = -0.2 + hit * 0.3)); // 발톱 앞으로
      } else { // 휙 솟아 깍깍 비웃고 날아감
        const rise = gease(gseg(c, 5.6, 6.1));
        const k = gease(gseg(c, 6.6, 8.3));
        from2.copy(hover); from2.y += 0.06 * rise;
        P.fly.position.lerpVectors(from2, AWAY, k);
        P.fly.rotation.y = THREE.MathUtils.lerp(PI / 2, Math.atan2(AWAY.x - from2.x, AWAY.z - from2.z), gease(gseg(c, 6.6, 7.1)));
        const ha = Math.abs(Math.sin(c * 13)) * gease(gseg(c, 5.9, 6.05)) * (1 - gease(gseg(c, 6.4, 6.6)));
        P.jaw.rotation.x = ha * 0.55;
        P.head.rotation.x = -0.2 * (1 - k) - ha * 0.2;
        P.body.rotation.x = THREE.MathUtils.lerp(-0.25, 0.15, gease(gseg(c, 6.4, 7.0)));
        P.tailFan = 0.6 * (1 - k);
        P.feet.forEach((f) => (f.rotation.x = THREE.MathUtils.lerp(-0.2, 1.3, k)));
        P.fly.scale.setScalar(1 - gease(gseg(c, 8.0, 8.3)));
      }
      P.glare(c > 2 && c < 5.6 ? 0.6 : 0.45);
      P.angry(t, c > 1.6 && c < 6.6 ? 1 : 0);
    },
  };
});

// 쪼기 세기: PK(부리가 닿는 순간들) 앞에 고개 젖혀 힘 모으기(wind) → 콕(hit)
const kPeck = (c, PK) => {
  let wind = 0, hit = 0;
  for (const p of PK) {
    const s = c - p;
    wind = Math.max(wind, gease(gseg(s, -0.25, -0.1)) * (1 - gease(gseg(s, -0.09, -0.03))));
    hit = Math.max(hit, gease(gseg(s, -0.07, 0)) * (1 - gease(gseg(s, 0.05, 0.22))));
  }
  return { wind, hit };
};

// 비둘기 쫓아내기: 구구가 종종 걸어와 근처에서 콕콕 → 깍깍이가 홱 돌아보고 성질(날개 반쯤 펴 부르르, 깍깍깍)
// → 짝! 날아올라 들이받듯 쫓아감 → 구구는 화들짝 날아 도망 → 깍깍이는 꽁지 쪼다 멈춰 깍깍, 제자리로 돌아와 가슴 쭉
kkakkakWith.push(() => {
  const g = new THREE.Group();
  const K = makeKkakkak();
  g.add(K.g);
  const G = makePigeon();
  g.add(G.g);
  const T = 8;
  const HOME = new THREE.Vector3(-0.05, STAND_Y, 0);
  const GO = new THREE.Vector3(0.85, 0.42, -0.35); // 구구가 도망가는 하늘
  const LEAVE = 3.35, GP0 = new THREE.Vector3(0.15, STAND_Y, 0.02);
  const away = new THREE.Vector3().subVectors(GO, GP0).normalize();
  // 도망가는 구구 자리: 처음에 확 튀어 나감
  const flee = (c, out) => out.lerpVectors(GP0, GO, 1 - (1 - gseg(c, LEAVE + 0.1, 5.4)) ** 2);
  const CHASE = flee(4.3, new THREE.Vector3()).addScaledVector(away, -0.16); // 깍깍이가 꽁지 뒤까지 쫓아가다 멈추는 곳
  CHASE.y -= 0.03;
  const gp = new THREE.Vector3(), kp = new THREE.Vector3();
  return {
    g, name: '비둘기 쫓아내기', desc: '구구가 근처에 오면 성질내며 깍깍 → 날아가 쫓아냄, 돌아와 으스댐',
    update(t) {
      const c = t % T;
      // ── 구구 ──
      G.reset();
      G.g.visible = c < 5.4;
      gp.set(kLerp(0.45, 0.15, gease(gseg(c, 0, 2.2))), STAND_Y, 0.02);
      if (c < LEAVE) { // 종종 걸어와 콕콕, 깍깍이가 성질내면 움찔
        foldWings(G, 1);
        G.fly.position.copy(gp);
        G.fly.rotation.y = -PI / 2;
        G.fly.scale.setScalar(gease(gseg(c, 0, 0.3)));
        G.body.rotation.x = -0.12;
        if (c < 2.2) waddle(G, t * PI * 2.6, 1 - gease(gseg(c, 2.0, 2.2)));
        else {
          const peck = Math.max(0, Math.sin((c - 2.2) * PI * 4)) * (1 - gease(gseg(c, 2.75, 2.9)));
          G.body.rotation.x = -0.12 + peck * 0.6;
          G.head.rotation.x = peck * 0.6;
          G.tail.rotation.x = peck * 0.3;
        }
        const scared = gease(gseg(c, 2.85, 3.0));
        G.head.rotation.y = 0.6 * scared; // 깍깍이 쪽을 돌아봄
        G.body.rotation.x -= 0.15 * scared;
        G.eyes.forEach((e) => e.scale.setScalar(1 + 0.4 * scared));
        G.plant(0);
      } else { // 짝! 화들짝 날아 도망
        const clap = bump(c, LEAVE, LEAVE + 0.2);
        const k = gease(gseg(c, LEAVE + 0.1, 5.4));
        flee(c, G.fly.position);
        G.fly.position.y += clap * 0.02;
        G.fly.rotation.y = kLerp(-PI / 2, Math.atan2(GO.x - GP0.x, GO.z - GP0.z), gease(gseg(c, LEAVE, LEAVE + 0.4)));
        if (c < LEAVE + 0.2) {
          G.wings.forEach(([w, s, h]) => { w.rotation.z = s * clap * 1.5; h.rotation.z = s * clap * 0.4; });
          foldWings(G, 1 - gease(gseg(c, LEAVE, LEAVE + 0.12)));
        } else G.flap(t, 28, 1.1, 0.25); // 다급하게
        G.body.rotation.x = 0.2 * k;
        G.feet.forEach((f) => (f.rotation.x = kLerp(0, 1.3, k)));
        G.eyes.forEach((e) => e.scale.setScalar(1.4));
        G.fly.scale.setScalar(1 - gease(gseg(c, 5.1, 5.4)));
        if (c < LEAVE + 0.15) G.plant(0);
      }
      gBlink(G, t);

      // ── 깍깍이 ──
      kReset(K, t);
      const notice = gease(gseg(c, 2.3, 2.45)); // 홱 돌아봄
      const rage = gease(gseg(c, 2.55, 2.75)) * (1 - gease(gseg(c, 3.15, 3.3)));
      if (c < 3.2 || c >= 6.4) { // 땅: 서서 꽁지 까딱 → 돌아보고 성질 / 돌아와 으스댐
        const back = c >= 6.4;
        const f = back ? gease(gseg(c, 6.4, 6.7)) : 1;
        if (f < 1) K.flap(t, 16, 1.0 * (1 - f), 0.35 * (1 - f)); // 내려앉던 날갯짓과 같은 빠르기로 잦아듦
        kStand(K, back ? f : 1 - rage * 0.6);
        K.fly.position.x = HOME.x;
        K.fly.rotation.y = back ? PI / 2 : kLerp(1.0, PI / 2, notice);
        K.tail.rotation.x = Math.max(0, Math.sin(t * 7)) * 0.3 * (1 - rage);
        K.head.rotation.y = back ? 0 : (c < 1.2 ? 0.5 : -0.5) * (1 - notice);
        // 성질: 날개 반쯤 펴 부르르, 꽁지 부채, 고개 낮춰 깍깍깍
        K.wings.forEach(([w, s]) => (w.rotation.z += s * rage * (0.3 + Math.sin(t * 40) * 0.06)));
        K.body.rotation.x += rage * 0.3;
        K.head.rotation.x = -rage * 0.25;
        K.tailFan = rage;
        K.tail.rotation.x += rage * 0.5;
        const ch = Math.abs(Math.sin(c * 15)) * rage;
        K.jaw.rotation.x = ch * 0.55;
        K.fly.position.x += Math.sin(t * 45) * 0.001 * rage;
        if (back) { // 돌아와 가슴 쭉, 깍깍 하고 꽁지 까딱
          K.body.rotation.x = kLerp(-0.6, 0.05, f);
          K.feet.forEach((fo) => (fo.rotation.x = -0.3 * (1 - f)));
          const brag = gease(gseg(c, 6.7, 6.9)) * (1 - gease(gseg(c, 7.6, 7.9)));
          const ha = Math.abs(Math.sin(c * 13)) * gease(gseg(c, 6.9, 7.0)) * (1 - gease(gseg(c, 7.3, 7.45)));
          K.body.rotation.x -= brag * 0.3 + ha * 0.08;
          K.head.rotation.x -= brag * 0.2;
          K.jaw.rotation.x = ha * 0.55;
          K.fly.rotation.y = kLerp(PI / 2, 1.0, gease(gseg(c, 7.5, 8.0))); // 처음 자세로
        }
        K.plant(0);
      } else if (c < 5.0) { // 짝! 날아올라 쫓아감 → 멈춰 깍깍
        const open = gease(gseg(c, 3.2, 3.35));
        const k = gease(gseg(c, 3.25, 4.3));
        flee(Math.min(c, 4.3), kp).addScaledVector(away, -0.16); // 구구 꽁지 바로 뒤를 따라붙음
        kp.y -= 0.03;
        K.fly.position.lerpVectors(HOME, kp, k);
        K.fly.rotation.y = kLerp(PI / 2, Math.atan2(away.x, away.z), gease(gseg(c, 3.25, 3.6)));
        K.flap(kPhase(t, T, (x) => 26 - 10 * gseg(x, 4.2, 4.6)), 1, open, 0.25 * open);
        K.foldWings(1 - open);
        K.body.rotation.x = 0.3 * k * (1 - gseg(c, 4.3, 4.6));
        const snap = c > 3.95 && c < 4.45 ? Math.max(0, Math.sin((c - 3.95) * 18)) : 0; // 따라잡아 꽁지 쪼듯 콕콕
        K.head.position.z += snap * 0.008;
        K.jaw.rotation.x = snap * 0.5 + Math.abs(Math.sin(c * 14)) * bump(c, 4.4, 5.0) * 0.55; // 멈춰서 깍깍
        K.feet.forEach((f) => (f.rotation.x = kLerp(0, 1.3, k)));
        if (c < 3.4) K.plant(0);
      } else { // 제자리로 돌아와 내려앉음
        const k = gease(gseg(c, 5.0, 6.1));
        K.fly.position.lerpVectors(CHASE, HOME, k);
        K.fly.position.y += Math.sin(k * PI) * 0.03;
        K.fly.rotation.y = kLerp(Math.atan2(away.x, away.z), -PI / 2 + 0.2, gease(gseg(c, 5.0, 5.3))); // 돌아서
        K.fly.rotation.y = kLerp(K.fly.rotation.y, PI / 2, gease(gseg(c, 5.9, 6.35))); // 내려앉으며 다시 그쪽을 봄
        K.flap(t, 16, 1.0, 0.25 + 0.1 * gseg(c, 5.9, 6.4));
        K.body.rotation.x = kLerp(0.15, -0.6, gease(gseg(c, 5.9, 6.3)));
        K.tailFan = gease(gseg(c, 5.9, 6.3));
        K.feet.forEach((f) => (f.rotation.x = kLerp(1.3, -0.3, gseg(c, 5.7, 6.2))));
        if (c > 6.1) K.plant(0, gseg(c, 6.1, 6.4));
      }
      K.glare(rage > 0.3 ? 0.6 : 0.45);
      K.angry(t, c > 2.5 && c < 5.0 ? 1 : 0);
    },
  };
});

// 하악냥에게 시비: 앞에 내려앉아 깡총깡총 깍깍 시비 → 날아올라 얼굴을 콕콕콕 → 하악냥 냥냥펀치로 반격하지만
// 깍깍이는 요리조리 다 피하며 깍깍 비웃음 → 다시 콕콕 → 하악냥은 시무룩 한숨, 깍깍이는 의기양양 날아감
kkakkakWith.push(() => {
  const g = new THREE.Group();
  const H = makeHaak();
  H.g.name = '하악냥';
  H.g.userData.haak = H;
  H.g.scale.setScalar(1.6);
  const CAT_Y = -1.2; // 왼쪽을 보며 몸은 살짝 이쪽으로
  H.g.rotation.y = CAT_Y;
  g.add(H.g);
  const K = makeKkakkak();
  g.add(K.g);
  const T = 13.2;
  const fwd = new THREE.Vector3(Math.sin(CAT_Y), 0, Math.cos(CAT_Y)); // 하악냥이 보는 쪽
  const side = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const FACE_Y = CAT_Y + PI; // 깍깍이는 하악냥을 마주 봄
  const PK1 = [3.75, 4.15, 4.55], PK2 = [8.6, 9.0];
  // 맞음은 한 번씩만 (콕마다 다시 틀면 꼬리·털이 툭 튐) — 뒤의 콕은 아래에서 움찔만 얹음. 펀치는 맞음이 다 끝난 뒤
  const SEQ = [[0, '대기'], [1.5, '발견'], [3.55, '맞음'], [5.75, '공격 ① 냥냥펀치'], [8.4, '맞음'], [10.6, '실망']];
  const FROM = new THREE.Vector3(-0.6, 0.3, 0.1), AWAY = new THREE.Vector3(-0.7, 0.5, -0.4);
  const face = new THREE.Vector3(), ground = new THREE.Vector3(), hover = new THREE.Vector3(), tmp = new THREE.Vector3();
  let faceAt = null; // 하악냥 얼굴 앞 (처음 자세에서 한 번 재어 둠)
  return {
    g, name: '하악냥에게 시비', desc: '깡총 깍깍 시비 → 얼굴 콕콕, 냥냥펀치는 다 피함 → 하악냥 시무룩',
    update(t) {
      const c = t % T;
      // ── 하악냥 ──
      H.reset();
      if (!faceAt) { // 머리 공 앞쪽 끝 (깍깍이 좌표로)
        g.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(H.head);
        box.getCenter(face);
        faceAt = K.g.worldToLocal(face.clone()).addScaledVector(fwd, 0.5 * (box.max.y - box.min.y) / g.scale.x);
      }
      let i = SEQ.length - 1;
      while (SEQ[i][0] > c) i--;
      const [s0, name] = SEQ[i];
      haakFn(name)(name === '대기' ? (c - s0) % 4.4 : c - s0, H, t);
      const flinch = [...PK1.slice(1), ...PK2.slice(1)].reduce((m, p) => Math.max(m, bump(c, p, p + 0.25)), 0); // 또 콕! 움찔
      H.body.scale.multiply(tmp.set(1 + flinch * 0.12, 1 - flinch * 0.18, 1 + flinch * 0.12));
      H.head.rotation.x -= flinch * 0.25;
      H.ground();
      H.whiskers(t);

      // ── 깍깍이 ──
      kReset(K, t);
      K.g.visible = c < 11.65;
      ground.copy(faceAt).setY(STAND_Y).addScaledVector(fwd, 0.07); // 하악냥 코앞 땅
      const hop = c > 2.0 && c < 2.9 ? Math.abs(Math.sin(((c - 2.0) / 0.3) * PI)) : 0;
      ground.addScaledVector(fwd, -0.025 * gease(gseg(c, 2.0, 2.9))); // 깡총깡총 다가감
      const p1 = kPeck(c, PK1), p2 = kPeck(c, PK2);
      const hit = Math.max(p1.hit, p2.hit), wind = Math.max(p1.wind, p2.wind);
      // 냥냥펀치 피하기: 펀치가 오는 순간마다 옆·위로 휙 (6.1 ~ 7.35 사이 여섯 번)
      const pc = gseg(c, 5.75 + 0.35, 5.75 + 1.6) * 6;
      const dodgeOn = gease(gseg(c, 5.95, 6.15)) * (1 - gease(gseg(c, 7.45, 7.75)));
      const dodge = Math.sin(pc * PI) * dodgeOn; // 번갈아 좌우
      hover.copy(faceAt).addScaledVector(fwd, 0.035 + 0.03 * dodgeOn + wind * 0.01 - hit * 0.012);
      hover.y += 0.01 + Math.abs(dodge) * 0.02;
      hover.addScaledVector(side, dodge * 0.03);
      if (c < 1.4) { // 날아옴
        const k = gease(gseg(c, 0, 1.4));
        K.fly.position.lerpVectors(FROM, ground, k);
        K.fly.position.y += Math.sin(k * PI) * 0.05 + (1 - k) * 0.03;
        K.fly.rotation.y = kLerp(Math.atan2(ground.x - FROM.x, ground.z - FROM.z), FACE_Y, gease(gseg(c, 0.8, 1.4)));
        K.fly.scale.setScalar(gease(gseg(c, 0, 0.2)));
        K.flap(t, 20, 1.0, 0.2 + 0.1 * gseg(c, 1.0, 1.4));
        K.body.rotation.x = kLerp(0.15, -0.6, gease(gseg(c, 1.0, 1.4)));
        K.tailFan = gease(gseg(c, 1.0, 1.4));
        K.feet.forEach((f) => (f.rotation.x = kLerp(1.3, -0.3, gseg(c, 0.9, 1.4))));
      } else if (c < 3.25) { // 땅: 내려앉아 깡총깡총 다가가며 깍깍 시비
        const f = gease(gseg(c, 1.4, 1.8));
        if (f < 1) K.flap(t, 20, 1.1 * (1 - f), 0.3 * (1 - f));
        kStand(K, f);
        K.fly.position.x = ground.x;
        K.fly.position.z = ground.z;
        K.fly.position.y += (1 - f) * 0.012 + hop * 0.015;
        K.fly.rotation.y = FACE_Y;
        K.body.rotation.x = kLerp(-0.6, 0.05, f) - hop * 0.1;
        K.tailFan = 1 - gease(gseg(c, 1.4, 1.9));
        K.feet.forEach((fo) => (fo.rotation.x = -0.3 * (1 - f) + hop * 0.7));
        const ch = Math.abs(Math.sin(c * 14)) * gease(gseg(c, 2.85, 2.95)) * (1 - gease(gseg(c, 3.1, 3.2)));
        K.jaw.rotation.x = ch * 0.55;
        K.head.rotation.x = -0.35 * gease(gseg(c, 2.9, 3.05)); // 큰 고양이를 올려다보며 깍깍
        K.tail.rotation.x = ch * 0.3 + bump(c, 2.2, 2.5) * 0.3;
        K.plant(0);
      } else if (c < 9.85) { // 공중: 얼굴 앞에 떠서 콕콕 → 펀치 다 피함 → 다시 콕콕
        const k = gease(gseg(c, 3.25, 3.6));
        tmp.copy(ground);
        K.fly.position.lerpVectors(tmp, hover, k);
        K.fly.position.y += Math.sin(t * 9) * 0.003 * k;
        K.fly.rotation.y = FACE_Y;
        const open = gease(gseg(c, 3.25, 3.35));
        K.flap(kPhase(t, T, (x) => 16 + 8 * bump(x, 5.95, 7.65)), 1, 0.9 * open, 0.3 * open);
        K.foldWings(1 - open);
        K.body.rotation.x = kLerp(0.05, -0.25, k) + hit * 0.45 - wind * 0.2; // 서 있던 자세에서 이어서
        K.head.rotation.x = kLerp(-0.35, 0, k) + hit * 0.2 - wind * 0.3;
        K.head.position.z += hit * 0.008;
        K.tailFan = 0.6 * k;
        K.body.rotation.z = dodge * 0.4; // 피할 때 몸을 기울임
        K.feet.forEach((f) => (f.rotation.x = kLerp(0, -0.2, k)));
        const ha = Math.abs(Math.sin(c * 13)) * gease(gseg(c, 6.65, 6.85)) * (1 - gease(gseg(c, 7.85, 8.05))); // 피하며 깍깍 비웃음
        K.jaw.rotation.x = ha * 0.55;
      } else { // 위로 솟아 의기양양 깍깍, 날아감
        const k = gease(gseg(c, 10.25, 11.65));
        tmp.copy(hover); tmp.y += 0.08 * gease(gseg(c, 9.85, 10.25));
        K.fly.position.lerpVectors(tmp, AWAY, k);
        K.fly.rotation.y = kLerp(FACE_Y, Math.atan2(AWAY.x - tmp.x, AWAY.z - tmp.z), gease(gseg(c, 10.25, 10.75)));
        K.flap(kPhase(t, T, (x) => 16 + 8 * bump(x, 5.95, 7.65)), 1, 0.9, 0.3);
        const ha = Math.abs(Math.sin(c * 13)) * gease(gseg(c, 9.95, 10.05)) * (1 - gease(gseg(c, 10.4, 10.55)));
        K.jaw.rotation.x = ha * 0.55;
        K.body.rotation.x = kLerp(-0.25, 0.15, k);
        K.tailFan = 0.6 * (1 - k);
        K.feet.forEach((f) => (f.rotation.x = kLerp(-0.2, 1.3, k)));
        K.fly.scale.setScalar(1 - gease(gseg(c, 11.35, 11.65)));
      }
      K.glare(c > 3.4 && c < 9.6 ? 0.6 : 0.45);
      K.angry(t, c > 2.8 && c < 10.25 ? 1 : 0);
    },
  };
});

// 먼 거리 날기: 비둘기보다 훨씬 높이·멀리. 파닥파닥 몇 번 치며 오르고, 날개 접고 쑥 내려가는 물결 비행으로
// 나무·주민 머리 위로 쭉 솟아올라 화면 끝에서 끝까지 가로지름
kkakkakWith.push(() => {
  const P = makeKkakkak();
  const T = 9;
  return {
    g: P.g, name: '먼 거리 날기', desc: '나무보다 훨씬 높이 솟아 물결치듯 멀리 가로지름',
    update(t) {
      const c = t % T;
      kReset(P, t);
      const b = c % 1.1; // 한 물결: 0~0.7 파닥이며 오름, 0.7~1.1 접고 쑥
      const shut = bump(b, 0.7, 1.08);
      const climb = gseg(c, 0, 4.5); // 처음 절반은 계속 오름
      P.flap(t, 20 + 4 * (1 - climb), 1.0 * (1 - shut), 0.15);
      P.sweep(shut * 0.9);
      P.open *= 1 - shut;
      const wave = b < 0.7 ? b / 0.7 : 1 - (b - 0.7) / 0.4;
      P.fly.position.set(-2.0 + 4.0 * (c / T), 0.35 + 0.65 * gease(climb) + wave * 0.035, -0.4);
      P.fly.rotation.y = PI / 2;
      P.body.rotation.x = 0.1 + shut * 0.1 - 0.25 * (1 - climb); // 오를 땐 고개 들고
      P.head.rotation.y = Math.sin(t * 0.9) > 0.7 ? 0.4 : 0; // 가끔 밑을 휙 훑어봄
      P.fly.scale.setScalar(gease(gseg(c, 0, 0.3)) * (1 - gease(gseg(c, 8.7, 9)))); // 끝에서 스르르
      P.glare();
    },
  };
});

// 나무·머리에 앉기: 구구와 같은 한 바퀴. 앉아서는 구구구 대신 꽁지 까딱하며 깍깍깍
const KKAK_K = {
  make: makeKkakkak, reset: kReset, far: 1.8, up: 0.35, // 비둘기보다 높이 멀리 날아감
  opts: (P, t, sit2 = null) => ({
    fold: (Q, k) => Q.foldWings(k), eyes: (Q) => Q.glare(),
    sit: (s, coo) => {
      P.neck.scale.setScalar(1);
      P.tail.scale.x = 1;
      P.body.rotation.x = 0.05;
      const ch = Math.abs(Math.sin(s * 14)) * coo;
      P.jaw.rotation.x = ch * 0.5;
      P.body.rotation.x -= ch * 0.08;
      P.tail.rotation.x = Math.max(0, Math.sin(s * 7)) * 0.3 + ch * 0.2;
      sit2?.(s, coo);
    },
  }),
  treeDesc: '마을 나무 꼭대기에 턱, 꽁지 까딱 깍깍깍 하고 날아감', headDesc: '가만히 있는 캐릭터 머리에 털썩, 깍깍 하고 콕콕',
};
kkakkakWith.push(treePerch(KKAK_K), headPerch(KKAK_K));

// ── 게임용 깍깍이 점검 (monsters.html?set=kkakkakGame): 게임과 같은 createKkakkak 로 동작 하나씩 되풀이 (끝나면 대기로 갔다가 다시) ──
const kkakkakGame = Object.entries(KKAK_STATES).map(([name, { label, dur }]) => () => {
  const K = createKkakkak();
  const T = (dur ?? 3) + 1;
  let last = 0;
  return {
    g: K.root, name, desc: label,
    update(t) {
      const dt = Math.min(0.1, Math.max(0, t - last));
      if (Math.floor(t / T) !== Math.floor(last / T) || !last) K.play(name);
      last = t;
      const c = t % T;
      if (name === 'air') K.setAir(0.12 + 0.02 * Math.sin(c), 1, 0); // 앞으로 날아가는 중
      if (name === 'perch') K.setAir(0.05, 0, 0, c > 2.5 ? 1 : 0); // 앉은 자리가 들썩이면 휘청
      K.update(dt);
    },
  };
});

// 비둘기는 부품 크기와 상관없이 외곽선 두께를 하나로 (날개·꼬리 판도, 깃털·빵도 같은 두께)
const FOOT = new Set(['발', '발가락', '발톱']);
const pigeonLine = (make) => () => {
  const m = make();
  const villager = new Set(); // 합동 시안에 같이 선 주민은 원래 외곽선 그대로
  for (const k of ['주민', '하악냥']) m.g.getObjectByName(k)?.traverse((o) => villager.add(o));
  m.g.traverse((o) => { if (o.isMesh && !villager.has(o)) o.userData.outlineWidth = FOOT.has(o.name) ? 0.0012 : 0.002; }); // 가는 발은 선도 가늘게
  const pigeons = [], haaks = [];
  const others = [];
  m.g.traverse((o) => { if (o.userData.pigeon) pigeons.push(o.userData.pigeon); if (o.userData.haak) haaks.push(o.userData.haak); if (o.userData.smoothPose) others.push(o); });
  const smooth = poseSmoother([...pigeons.map((P) => P.g), ...haaks.map((H) => H.g), ...others]);
  const up = m.update;
  m.update = (t) => { // 자세를 부드럽게 이은 뒤에도 땅에 안 파묻히게 (비둘기 시안 8종 포함)
    up(t);
    smooth(t);
    pigeons.forEach((P) => P.keepAbove(0));
    haaks.forEach((H) => H.ground());
  };
  return m;
};

// ── 배치 ──
const SET = new URLSearchParams(location.search).get('set');
const SETS = {
  basic: { list: monsters, title: '쪼렙 몬스터 시안', link: '?' },
  stationery: { list: stationery, title: '필기도구 몬스터 시안', link: '?set=stationery' },
  field: { list: field, title: '들판 몬스터 시안', link: '?set=field' },
  school: { list: school, title: '학용품 몬스터 시안', link: '?set=school' },
  eraser: { list: eraser, title: '지우개 조각 몬스터 시안', link: '?set=eraser' },
  banjjok: { list: banjjok, title: '반쪽이 모션 시안', link: '?set=banjjok', cols: 4 }, // 동작이 잘 보이게 크게, 4마리씩 두 줄
  banjjokEyes: { list: banjjokEyes, title: '반쪽이 눈 시안', link: '?set=banjjokEyes', cols: 4 },
  cat: { list: cat, title: '고양이 몬스터 시안', link: '?set=cat', cols: 4 },
  haak: { list: haak, title: '하악냥 모션 시안', link: '?set=haak', cols: 4 },
  haakEyes: { list: haakEyes, title: '하악냥 눈 시안', link: '?set=haakEyes', cols: 4 },
  pigeon: { list: pigeon.map(pigeonLine), title: '비둘기 몬스터 시안', link: '?set=pigeon', cols: 4 },
  gugu: { list: gugu.map(pigeonLine), title: '구구 모션 시안', link: '?set=gugu', cols: 4 },
  guguWith: { list: guguWith.map(pigeonLine), title: '구구 어울림 시안', link: '?set=guguWith', dist: 6.5, lookY: 1.2 }, // 마을 나무가 실제 크기라 멀리서 올려다봄
  magpie: { list: magpie.map(pigeonLine), title: '까치 몬스터 시안', link: '?set=magpie', cols: 4 },
  kkakkak: { list: kkakkak.map(pigeonLine), title: '깍깍이 시안', link: '?set=kkakkak', cols: 5 },
  kkakkakLook: { list: kkakkakLook.map(pigeonLine), title: '깍깍이 체형 시안', link: '?set=kkakkakLook', cols: 4, spacing: 0.62, side: true, dist: 3.4 }, // 몸 비율이 잘 보이게 옆모습, 두 줄을 앞에서
  kkakkakWith: { list: kkakkakWith.map(pigeonLine), title: '깍깍이 어울림 시안', link: '?set=kkakkakWith', spacing: 1.3, dist: 7, lookY: 0.5 }, // 날개콩·구구가 멀리 도망가고 나무도 있어 넓게 (하나씩 크게 보려면 &only=이름)
  kkakkakGame: { list: kkakkakGame, title: '게임용 깍깍이 점검', link: '?set=kkakkakGame', cols: 6, side: true, dist: 3.4 },
  guguHaak: { list: guguHaak.map(pigeonLine), title: '구구·하악냥 어울림 시안', link: '?set=guguHaak', spacing: 0.9 }, // 둘이 같이 뛰노는 자리가 넓어 띄워 놓음
};
const cur = SETS[SET] ? SET : 'basic';
// 시안 목록은 비슷한 종류끼리 한 줄씩 (새 세트를 만들면 여기 알맞은 줄에 넣기)
const GROUPS = [
  ['쪼렙·들판', ['basic', 'field']],
  ['학용품', ['stationery', 'school', 'eraser']],
  ['반쪽이', ['banjjok', 'banjjokEyes']],
  ['고양이', ['cat', 'haak', 'haakEyes']],
  ['비둘기', ['pigeon', 'gugu', 'guguWith', 'guguHaak']],
  ['까치', ['magpie', 'kkakkak', 'kkakkakLook', 'kkakkakWith', 'kkakkakGame']],
];
const setLink = (k) => (k === cur ? `<b>${SETS[k].title.replace(' 시안', '')}</b>` : `<a href="${SETS[k].link}">${SETS[k].title.replace(' 시안', '')}</a>`);
document.getElementById('title').innerHTML = `${SETS[cur].title}<span>마우스로 돌려 보기 · 휠로 확대 · 맨 오른쪽은 크기 비교용 주민</span>${
  GROUPS.map(([name, keys]) => `<span>${name}: ${keys.map(setLink).join(' · ')}</span>`).join('')}`;
// &only=툭툭,실망: 이름이 맞는 것만 골라 한 줄로 크게, 비스듬히 옆에서 보이게
const ONLY = new URLSearchParams(location.search).get('only')?.split(',').map((x) => x.trim()).filter(Boolean);
const built = SETS[cur].list.map((make) => make()).filter((m) => !ONLY || ONLY.includes(m.name));
const COLS = ONLY ? built.length : SETS[cur].cols ?? built.length; // 한 줄에 몇 마리
const ROWS = Math.ceil(built.length / COLS);
const GRID = ROWS > 1;
const SPACING = SETS[cur].spacing ?? (GRID ? 0.6 : 0.36);
const MON_SCALE = GRID ? 2.4 : 1.5; // 한 줄일 땐 주민 무릎 높이쯤
const ROW_GAP = 1.1;
const startX = -(COLS * SPACING) / 2;
if (SETS[cur].lookY) { controls.target.y = SETS[cur].lookY; camera.position.y = SETS[cur].lookY + 0.4; }
if (GRID && SETS[cur].side) { // 옆모습 두 줄: 비스듬히 위에서 봐야 앞줄이 뒷줄을 가리지 않음
  camera.position.set(0, 1.4, 3.0);
  controls.target.set(0.15, 0.05, 0.1);
} else if (GRID) {
  camera.position.set(0, 2.0, 3.0); // 위에서 내려다봐야 앞뒤 줄이 화면에서 겹치지 않음
  controls.target.set(0.15, 0, 0.1);
}
built.forEach((m, i) => {
  const row = Math.floor(i / COLS), col = i % COLS;
  m.g.position.x = startX + col * SPACING + (GRID ? SPACING / 2 : 0);
  m.g.position.z = GRID ? (row - (ROWS - 1) / 2) * ROW_GAP : 0;
  m.g.scale.setScalar(ONLY ? 3.2 : MON_SCALE);
  if (ONLY || SETS[cur].side) m.g.rotation.y = -1.35; // 다리 움직임·몸 비율이 잘 보이게 거의 옆모습으로
  m.g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(m.g);
});

if (built[0] && new URLSearchParams(location.search).has('top')) { // &top: 첫 몬스터를 위에서 내려다보기
  controls.target.set(built[0].g.position.x, 0.12, 0);
  camera.position.set(controls.target.x, 1.2, 0.05);
} else if (built[0] && new URLSearchParams(location.search).has('near')) { // &near: 첫 몬스터를 가운데 두고 옆에서
  controls.target.set(built[0].g.position.x, 0.1, 0);
  camera.position.set(controls.target.x, 0.14, 1);
}

// 크기 비교용 주민 (맨 오른쪽)
const villager = createVillager(PRESETS.boy);
const vRoot = villager.root;
{
  vRoot.position.x = startX + COLS * SPACING + (GRID ? 0.25 : 0.05);
  vRoot.rotation.y = -0.5;
  vRoot.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(vRoot);
}

// 이름표
const tags = built.map((m) => {
  const el = document.createElement('div');
  el.className = 'tag';
  el.innerHTML = `<b>${m.name}</b><small>${m.desc}</small>`;
  document.body.appendChild(el);
  return el;
});

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // 좁은 화면에서도 모두 들어오게 뒤로 물러남
  const near = Number(new URLSearchParams(location.search).get('dist')) || (SETS[cur].dist ?? 3.6); // &dist=1 처럼 가까이서 보기
  const dist = Math.max(near, near * (1.7 / camera.aspect));
  controls.maxDistance = Math.max(6, dist); // 넓은 시안은 더 물러날 수 있게
  camera.position.sub(controls.target).setLength(dist).add(controls.target);
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
const tmp = new THREE.Vector3();
window.__sketch = { built, camera, controls, villager: vRoot, stop: () => renderer.setAnimationLoop(null) }; // 콘솔 점검용: 동작을 프레임마다 돌려 튀는 곳 찾기
renderer.setAnimationLoop(() => {
  const t = clock.getElapsedTime();
  built.forEach((m) => m.update(t));
  built.forEach((m) => syncToon(m.g, true));
  syncToon(vRoot, true);
  controls.update();
  renderer.render(scene, camera);
  built.forEach((m, i) => {
    tmp.set(m.g.position.x, -0.03, m.g.position.z + 0.16).project(camera);
    // 한 줄일 땐 이름표를 짝수·홀수로 위아래 엇갈려 겹치지 않게
    const y = (-tmp.y * 0.5 + 0.5) * innerHeight + 8 + (GRID ? 0 : (i % 2) * 44);
    tags[i].style.left = `${(tmp.x * 0.5 + 0.5) * innerWidth}px`;
    tags[i].style.top = `${y}px`;
  });
});
