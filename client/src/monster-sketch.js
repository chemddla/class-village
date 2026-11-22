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

// ── 배치 ──
const built = monsters.map((make) => make());
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
