// 쪼렙 몬스터 시안 화면: 마을과 같은 툰 그림체로 하찮고 귀여운 몬스터 여러 마리를 나란히 세워 본다
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { createVillager, PRESETS } from './villager/villager.js';
import { canvasTexture } from './villager/textures.js';
import { syncToon } from './villager/toon.js';

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

// ── 배치 ──
const STATIONERY = new URLSearchParams(location.search).get('set') === 'stationery';
if (STATIONERY) {
  document.getElementById('title').innerHTML = '필기도구 몬스터 시안<span>마우스로 돌려 보기 · 휠로 확대 · 맨 오른쪽은 크기 비교용 주민 · <a href="?">쪼렙 몬스터 보기</a></span>';
}
const built = (STATIONERY ? stationery : monsters).map((make) => make());
const SPACING = 0.36;
const MON_SCALE = 1.5; // 주민 무릎 높이쯤 오도록 키움
const startX = -((built.length) * SPACING) / 2;
built.forEach((m, i) => {
  m.g.position.x = startX + i * SPACING;
  m.g.scale.setScalar(MON_SCALE);
  m.g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(m.g);
});

// 크기 비교용 주민 (맨 오른쪽)
const villager = createVillager(PRESETS.boy);
const vRoot = villager.root;
{
  vRoot.position.x = startX + built.length * SPACING + 0.05;
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
  const dist = Math.max(3.6, 3.6 * (1.7 / camera.aspect));
  camera.position.sub(controls.target).setLength(dist).add(controls.target);
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
const tmp = new THREE.Vector3();
renderer.setAnimationLoop(() => {
  const t = clock.getElapsedTime();
  built.forEach((m) => m.update(t));
  built.forEach((m) => syncToon(m.g, true));
  syncToon(vRoot, true);
  controls.update();
  renderer.render(scene, camera);
  built.forEach((m, i) => {
    tmp.set(m.g.position.x, -0.03, 0.1).project(camera);
    // 이름표는 짝수·홀수를 위아래로 엇갈려 겹치지 않게
    const y = (-tmp.y * 0.5 + 0.5) * innerHeight + 8 + (i % 2) * 44;
    tags[i].style.left = `${(tmp.x * 0.5 + 0.5) * innerWidth}px`;
    tags[i].style.top = `${y}px`;
  });
});
