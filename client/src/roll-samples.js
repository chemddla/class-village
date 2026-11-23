// 구르기 동작 시안: 지금 게임에 들어간 앞구르기와, 구르는 방식이 다른 시안 몇 가지를 칸마다 나란히 반복해서 보여 준다
// 시안 동작은 이 화면에서만 ACTIONS 에 잠깐 끼워 넣는다 (게임 동작 표는 건드리지 않음)
import * as THREE from 'three';
import { createVillager, PRESETS } from './villager/villager.js';
import { ACTIONS, ARM_REST } from './villager/actions.js';
import { syncToon } from './villager/toon.js';

const PI = Math.PI;
const sm = THREE.MathUtils.smoothstep;
const SIDES = [['R', -1], ['L', 1]];

// actions.js 와 같은 키프레임 함수 (구간마다 smoothstep)
function kf(u, ...pts) {
  if (u <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [u1, v1] = pts[i];
    if (u <= u1) { const [u0, v0] = pts[i - 1]; return v0 + (v1 - v0) * sm(u, u0, u1); }
  }
  return pts[pts.length - 1][1];
}
// 발바닥을 바닥과 평행하게 둔 채 무릎 굽히기 (actions.js 의 crouch 와 같음)
function crouch(P, c) {
  for (const [s] of SIDES) {
    P[`hip${s}.rx`] = -0.7 * c;
    P[`knee${s}.rx`] = 1.2 * c;
    P[`foot${s}.rx`] = -0.5 * c;
  }
  P['pelvis.py'] = 0.1 * Math.cos(0.7 * c) + 0.1 * Math.cos(0.5 * c) - 0.2;
  P['spine.rx'] = 0.2 * c;
}
// 공처럼 말기: 무릎을 가슴으로, 두 팔로 정강이를 끌어안고, 턱을 당긴다
function ball(P, k, hug = 1) {
  for (const [s, side] of SIDES) {
    P[`hip${s}.rx`] = (P[`hip${s}.rx`] ?? 0) - 2.0 * k;
    P[`knee${s}.rx`] = (P[`knee${s}.rx`] ?? 0) + 2.2 * k;
    P[`shoulder${s}.rx`] = -1.0 * k * hug;
    P[`shoulder${s}.rz`] = side * (ARM_REST * (1 - k) + 0.22 * k);
    P[`elbow${s}.rx`] = -1.5 * k * hug;
  }
  P['spine.rx'] = (P['spine.rx'] ?? 0) + 0.9 * k;
  P['head.rx'] = 0.8 * k;
  P['head.s'] = -0.35 * k; // 큰 머리가 먼저 땅에 박히지 않게 잠깐 작게
}

// 시안마다: 동작(액션 정의) · 나아가는 방향(로컬 축과 거리) · 공중에 뜬 높이 · 바라보는 방향
const SAMPLES = [
  {
    id: 'roll', title: '① 지금 구르기',
    text: '몸을 비스듬히 틀며 땅을 짚고, 몸을 말아 어깨부터 대각선으로 한 바퀴. (지금 게임에 들어간 동작: 어깨 구르기)',
    travel: [0, 0, 0.55],
  },
  {
    id: 'rollBall', title: '② 공 말이 앞구르기',
    text: '손을 짚지 않고 쪼그려 앉자마자 무릎을 끌어안고 공처럼 데굴. 짧고 빠르다.',
    travel: [0, 0, 0.5],
    def: {
      duration: 0.5, rootRate: 2000,
      fn(u, P) {
        crouch(P, kf(u, [0, 0], [0.12, 0.7], [0.8, 0.45], [1, 0]));
        ball(P, kf(u, [0, 0], [0.14, 1], [0.7, 1], [0.9, 0]));
        P['root.rx'] = sm(u, 0.1, 0.78) * PI * 2;
      },
    },
  },
  {
    id: 'rollDive', title: '③ 다이빙 구르기',
    text: '앞으로 몸을 날려 잠깐 떴다가, 두 손으로 받으며 말아 구른다. 멀리 빠지지만 느리다.',
    travel: [0, 0, 0.85],
    air: (u) => (u > 0.1 && u < 0.36 ? 0.16 * Math.sin(PI * (u - 0.1) / 0.26) : 0),
    def: {
      duration: 0.8, rootRate: 2000,
      fn(u, P) {
        const load = kf(u, [0, 0], [0.1, 1], [0.16, 0]); // 박차기 전 쪼그리기
        const fly = kf(u, [0.1, 0], [0.18, 1], [0.32, 1], [0.4, 0]); // 날아가는 동안 몸을 쭉 편다
        const tuck = kf(u, [0.32, 0], [0.44, 1], [0.7, 1], [0.88, 0]);
        crouch(P, 0.7 * load + kf(u, [0.7, 0], [0.86, 0.5], [1, 0]));
        P['root.rx'] = kf(u, [0.1, 0], [0.34, 1.25], [0.82, PI * 2]);
        for (const [s, side] of SIDES) {
          P[`hip${s}.rx`] += 0.35 * fly; // 다리는 뒤로 쭉
          P[`knee${s}.rx`] += 0.25 * fly;
          P[`shoulder${s}.rx`] = -2.5 * fly - 1.5 * kf(u, [0.3, 0], [0.36, 1], [0.44, 0]);
          P[`shoulder${s}.rz`] = side * (ARM_REST * (1 - Math.max(fly, tuck)) + 0.4 * fly);
        }
        ball(P, tuck);
        P['spine.rx'] += -0.25 * fly;
        P['head.rx'] = -0.3 * fly + 0.8 * tuck;
      },
    },
  },
  {
    id: 'rollSide', title: '④ 옆구르기',
    text: '몸을 공처럼 말고 옆으로 데굴. 바라보는 쪽을 그대로 둔 채 옆으로 피한다.',
    travel: [0.5, 0, 0], face: 0,
    def: {
      duration: 0.55, rootRate: 2000,
      fn(u, P) {
        crouch(P, kf(u, [0, 0], [0.12, 0.7], [0.8, 0.45], [1, 0]));
        const k = kf(u, [0, 0], [0.14, 1], [0.7, 1], [0.9, 0]);
        ball(P, k);
        P['spine.rx'] -= 0.4 * k; // 옆으로 구를 땐 너무 숙이지 않게
        P['root.rz'] = -sm(u, 0.1, 0.8) * PI * 2;
      },
    },
  },
  {
    id: 'rollBack', title: '⑤ 뒤구르기',
    text: '엉덩방아 찧듯 주저앉아, 두 손을 귀 옆에 대고 뒤로 한 바퀴. 뒤로 물러나며 피한다.',
    travel: [0, 0, -0.45],
    def: {
      duration: 0.7, rootRate: 2000,
      fn(u, P) {
        crouch(P, kf(u, [0, 0], [0.18, 1], [0.8, 0.6], [1, 0]));
        const k = kf(u, [0.12, 0], [0.26, 1], [0.7, 1], [0.88, 0]);
        ball(P, k, 0);
        const hands = kf(u, [0.1, 0], [0.24, 1], [0.66, 1], [0.8, 0]); // 손바닥을 귀 옆에 (뒤로 넘어갈 때 땅을 민다)
        for (const [s, side] of SIDES) {
          P[`shoulder${s}.rx`] = -2.4 * hands;
          P[`shoulder${s}.rz`] = side * (ARM_REST * (1 - Math.max(hands, k)) + 0.35 * hands);
          P[`elbow${s}.rx`] = -1.9 * hands;
        }
        P['root.rx'] = -sm(u, 0.16, 0.84) * PI * 2;
      },
    },
  },
];
for (const s of SAMPLES) if (s.def) ACTIONS[s.id] = s.def;

// ── 화면 ──
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setScissorTest(true);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#dff0f8');
scene.add(new THREE.HemisphereLight(0xdbeeff, 0xffe8d6, 0.85));
const fill = new THREE.DirectionalLight(0xffd2b0, 0.6);
fill.position.set(2.2, 0.9, 1.6);
scene.add(fill);

const GAP = 4; // 칸마다 주민을 멀리 떨어뜨려 놓고, 칸마다 카메라를 따로 둔다
const grid = document.getElementById('grid');
const cells = SAMPLES.map((s, i) => {
  const x = i * GAP;
  const spot = new THREE.Group();
  spot.position.x = x;
  spot.rotation.y = s.face ?? PI / 2; // 기본은 화면 오른쪽(+x)을 보고 구른다
  scene.add(spot);
  const mover = new THREE.Group();
  spot.add(mover);
  const v = createVillager(PRESETS[i % 2 ? 'girl' : 'boy'], { texScale: 0.5, hairSegs: 240 });
  mover.add(v.root);
  v.root.traverse((m) => { if (m.isMesh) m.castShadow = true; });

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(GAP, 4).rotateX(-PI / 2), new THREE.MeshStandardMaterial({ color: '#a9dc86', roughness: 1 }));
  floor.position.set(x, 0, 0);
  floor.receiveShadow = true;
  scene.add(floor);
  const key = new THREE.DirectionalLight(0xfff1e0, 1.9);
  key.position.set(x - 1.2, 2.6, 2.2);
  key.target.position.set(x, 0, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -1.2, right: 1.2, top: 1.2, bottom: -1.2 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.006;
  scene.add(key, key.target);

  const cam = new THREE.PerspectiveCamera(28, 1, 0.05, 20);
  cam.position.set(x + 0.2, 0.9, 3.6);
  cam.lookAt(x, 0.32, 0);

  const el = document.createElement('div');
  el.className = 'cell';
  el.innerHTML = `<h2>${s.title}</h2><p>${s.text}</p><div class="bar"><i></i></div>`;
  grid.appendChild(el);
  return { s, v, spot, mover, cam, el, bar: el.querySelector('i'), dur: ACTIONS[s.id].duration };
});

let cols = 3, rows = 2;
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  cols = w < h ? 2 : 3;
  rows = Math.ceil(cells.length / cols);
  grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  grid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
  for (const c of cells) { c.cam.aspect = w / cols / (h / rows); c.cam.updateProjectionMatrix(); }
}
addEventListener('resize', resize);
resize();

// ── 반복 재생 ──
const PAUSE = 0.7; // 한 번 구르고 쉬는 시간 (초)
let speed = 1, paused = false, simT = 0;
for (const c of cells) c.t0 = -1; // 아직 시작 전
for (const b of document.querySelectorAll('[data-speed]')) {
  b.onclick = () => {
    speed = +b.dataset.speed;
    document.querySelectorAll('[data-speed]').forEach((x) => x.classList.toggle('on', x === b));
  };
}
const pauseBtn = document.getElementById('pause');
pauseBtn.onclick = () => { paused = !paused; pauseBtn.classList.toggle('on', paused); pauseBtn.textContent = paused ? '이어 보기' : '멈춤'; };

const box = new THREE.Box3();
// 진행도 p 에 맞춰 앞으로 나아간 자리와 땅 높이를 맞춘다
function place(c, p) {
  syncToon(c.v.root, true);
  // 나아가기: 칸 가운데를 지나도록 출발점은 뒤쪽 절반
  const go = sm(p, 0.05, 0.85) - 0.5;
  const [tx, , tz] = c.s.travel;
  c.mover.position.set(tx * go, 0, tz * go);
  // 몸의 가장 낮은 곳이 늘 땅에 닿게 (공중에 뜬 시안만 그만큼 띄운다)
  c.spot.updateMatrixWorld(true);
  box.setFromObject(c.v.root);
  c.mover.position.y = -box.min.y + (c.s.air?.(p) ?? 0);
  c.bar.style.width = `${(p * 100).toFixed(1)}%`;
}

// 멈춰서 보기: 모든 시안을 같은 진행도(0~1)에서 멈춘다. 관절이 부드럽게 따라가므로 처음부터 짧게 다시 돌려서 맞춘다
const scrub = document.getElementById('scrub');
const scrubVal = document.getElementById('scrubVal');
let frozen = null;
function freeze(p) {
  frozen = p;
  const H = 1 / 240;
  for (const c of cells) {
    c.v.setAction('idle');
    for (let k = 0; k < 60; k++) { simT += H; c.v.update(simT, H); }
    c.v.setAction(c.s.id);
    const n = Math.round(p * c.dur / H);
    for (let k = 0; k < n; k++) { simT += H; c.v.update(simT, H); }
    c.t0 = simT - p * c.dur;
    place(c, p);
  }
  scrubVal.textContent = `${Math.round(p * 100)}%`;
}
scrub.oninput = () => freeze(scrub.value / 100);
document.getElementById('play').onclick = () => { frozen = null; scrubVal.textContent = '재생 중'; for (const c of cells) c.t0 = -1; };
window.rollSamples = { freeze, play: () => document.getElementById('play').click() };

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = paused || frozen !== null ? 0 : Math.min(clock.getDelta(), 0.05) * speed;
  if (dt === 0) clock.getDelta();
  simT += dt;
  if (frozen === null) {
    for (const c of cells) {
      if (c.t0 < 0 || simT - c.t0 > c.dur + PAUSE) { c.t0 = simT; c.v.setAction(c.s.id); }
      if (dt > 0) c.v.update(simT, dt);
      place(c, Math.min(1, (simT - c.t0) / c.dur));
    }
  }
  const W = innerWidth, H = innerHeight;
  cells.forEach((c, i) => {
    const cw = W / cols, ch = H / rows;
    const x = (i % cols) * cw, y = H - (Math.floor(i / cols) + 1) * ch; // WebGL 은 아래쪽이 0
    renderer.setViewport(x, y, cw, ch);
    renderer.setScissor(x, y, cw, ch);
    renderer.render(scene, c.cam);
  });
});
