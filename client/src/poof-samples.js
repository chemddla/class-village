// 몬스터가 쓰러져 사라질 때 '펑' 연기 시안: 같은 날개콩 쓰러짐 동작에 사라지는 순간의 효과만 바꿔 칸마다 나란히 반복해서 보여 준다
// ①은 지금 게임에 들어간 연기 그대로, ②부터는 날개콩이 직접 뿜는 연기를 숨기고 이 화면의 효과를 대신 터뜨린다
import * as THREE from 'three';
import { createNalgaekong } from './monsters/nalgaekong.js';
import { addOutline } from './villager/toon.js';

const PI = Math.PI;
const SCALE = 5; // 마을에서와 비슷한 크기 (주민 허리 아래쯤)
const POOF_AT = 1.5; // 쓰러짐 동작에서 몸이 펑 하고 사라지기 시작하는 때 (nalgaekong.js 의 die)
const CYCLE = 4.4; // 쓰러짐 → 사라짐 → 다시 나타남 한 바퀴 (초)
const SPAWN_AT = 3.5;
const CENTER_Y = 0.0645 * SCALE; // 몸 가운데 높이

// ── 재질·모양 ──
const grad = new THREE.DataTexture(new Uint8Array([150, 195, 230, 255]), 4, 1, THREE.RedFormat);
grad.minFilter = grad.magFilter = THREE.NearestFilter;
grad.needsUpdate = true;
const toonMat = (color) => new THREE.MeshToonMaterial({ color, gradientMap: grad });
const SPHERE = new THREE.SphereGeometry(1, 20, 14);
const OCTA = new THREE.OctahedronGeometry(1);
const STAR = (() => {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.45 : 1;
    const a = (i / 10) * PI * 2 + PI / 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i) s.lineTo(x, y); else s.moveTo(x, y);
  }
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.1, bevelSegments: 2 }).center();
})();
const mats = new Map();
const mat = (color) => { if (!mats.has(color)) mats.set(color, toonMat(color)); return mats.get(color); };
// 외곽선 두른 덩어리 (지름 1 기준 모양을 scale 로 키운다)
function blob(geo, color, line = 0.07) {
  const m = new THREE.Mesh(geo, mat(color));
  addOutline(m, line);
  m.scale.setScalar(0.0001);
  return m;
}

const sm = (x, a, b) => THREE.MathUtils.smoothstep(x, a, b);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const outBack = (t, s = 1.8) => { t = clamp01(t) - 1; return 1 + (s + 1) * t * t * t + s * t * t; };
const rand = (a, b) => a + Math.random() * (b - a);
// 커졌다가(0 → 1, 앞쪽 grow 동안 튕기듯) 끝무렵 작아져 사라지는 크기
const popScale = (r, grow = 0.18, shrinkFrom = 0.45) => outBack(r / grow) * (1 - sm(r, shrinkFrom, 1));

// ── 입자: 칸마다 목록에 넣고 매 프레임 tick ──
// p: { m(메시), age, life, delay, tick(p, r, dt) } · r: 0 → 1 진행도
function particle(list, parent, m, life, tick, opts = {}) {
  const p = { m, age: 0, life, delay: opts.delay ?? 0, tick, ...opts };
  m.visible = p.delay <= 0;
  parent.add(m);
  list.push(p);
  return p;
}
function updateParticles(list, dt) {
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    if (p.delay > 0) { p.delay -= dt; if (p.delay > 0) continue; p.m.visible = true; }
    p.age += dt;
    const r = p.age / p.life;
    if (r >= 1) {
      p.m.removeFromParent();
      list.splice(i, 1);
      continue;
    }
    p.tick(p, r, dt);
  }
}

// 바깥으로 퍼지며 느려지는 연기 한 덩이
function puff(list, parent, { dir, speed, up = 0.2, size, life, color = '#fffaf0', delay = 0, y = CENTER_Y, grow = 0.18, drag = 5 }) {
  const m = blob(SPHERE, color);
  m.position.set(dir.x * 0.05, y + dir.y * 0.05, dir.z * 0.05);
  const v = dir.clone().multiplyScalar(speed);
  v.y += up;
  return particle(list, parent, m, life, (p, r, dt) => {
    v.multiplyScalar(Math.exp(-drag * dt));
    p.m.position.addScaledVector(v, dt);
    p.m.position.y += 0.15 * dt; // 연기는 살짝 떠오른다
    p.m.scale.setScalar(size * popScale(r, grow));
  }, { delay });
}
const ring = (i, n, tilt = 0.35) => {
  const a = (i / n) * PI * 2 + rand(-0.2, 0.2);
  const e = rand(-tilt, tilt * 1.6);
  return new THREE.Vector3(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e));
};

// ── 시안: 사라지는 순간 터뜨리는 효과 ──
const SAMPLES = [
  {
    title: '① 지금 연기',
    text: '지금 게임에 들어간 그대로. 작은 연기 일곱 덩이가 퐁 퍼지고 깃털 몇 개.',
    builtIn: true,
  },
  {
    title: '② 뭉게구름 펑',
    text: '큰 구름 한 덩이가 부풀었다가, 몽실몽실한 연기가 사방으로 퍼지며 사그라든다. 가장 무난한 만화 연기.',
    fire(L, g) {
      const core = blob(SPHERE, '#fffaf0');
      core.position.y = CENTER_Y;
      particle(L, g, core, 0.55, (p, r) => p.m.scale.setScalar(0.3 * popScale(r, 0.22, 0.35)));
      for (let i = 0; i < 10; i++) {
        puff(L, g, { dir: ring(i, 10), speed: rand(1.6, 2.2), up: 0.3, size: rand(0.12, 0.19), life: rand(0.7, 0.9), color: i % 3 ? '#fffaf0' : '#ebe5dc', delay: 0.03 });
      }
    },
  },
  {
    title: '③ 만화 펑 (별)',
    text: '연기와 함께 노란 별이 빙글빙글 돌며 사방으로 튄다. ("펑!" 글자는 뺌)',
    fire(L, g) {
      for (let i = 0; i < 7; i++) puff(L, g, { dir: ring(i, 7), speed: rand(1.3, 1.8), size: rand(0.11, 0.15), life: rand(0.6, 0.75) });
      for (let i = 0; i < 6; i++) {
        const m = blob(STAR, '#ffd84a', 0.12);
        const d = ring(i, 6, 0.6);
        const v = d.clone().multiplyScalar(rand(2.4, 3)); v.y += 0.6;
        const spin = rand(8, 14) * (i % 2 ? 1 : -1);
        m.position.y = CENTER_Y;
        particle(L, g, m, rand(0.55, 0.7), (p, r, dt) => {
          v.multiplyScalar(Math.exp(-3.5 * dt));
          p.m.position.addScaledVector(v, dt);
          p.m.rotation.z += spin * dt;
          p.m.scale.setScalar(0.07 * popScale(r, 0.12, 0.5));
        });
      }
    },
  },
  {
    title: '④ 땅 먼지 고리',
    text: '땅에 동그란 충격 고리가 번지고, 흙먼지가 바닥을 따라 굴러 퍼진다. 쿵 하고 무게감 있게 사라짐.',
    fire(L, g) {
      const rm = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 8, 48).rotateX(PI / 2), new THREE.MeshBasicMaterial({ color: '#fff6df', transparent: true, depthWrite: false }));
      rm.position.y = 0.02;
      particle(L, g, rm, 0.55, (p, r) => {
        const s = 0.1 + 0.85 * (1 - (1 - r) ** 3);
        p.m.scale.set(s, 1, s);
        p.m.material.opacity = 0.95 * (1 - sm(r, 0.35, 1));
      });
      for (let i = 0; i < 12; i++) {
        const d = ring(i, 12, 0); d.y = 0;
        puff(L, g, { dir: d, speed: rand(1.8, 2.4), up: 0.05, size: rand(0.08, 0.12), life: rand(0.65, 0.85), color: i % 2 ? '#efe2c8' : '#e2d2b2', y: 0.07, drag: 4 });
      }
      for (let i = 0; i < 4; i++) puff(L, g, { dir: ring(i, 4, 0.2), speed: 0.4, up: 0.9, size: rand(0.12, 0.16), life: 0.7, delay: 0.04 });
      // 흙 부스러기
      for (let i = 0; i < 8; i++) {
        const m = blob(OCTA, '#b98a5a', 0.1);
        const d = ring(i, 8, 0);
        const v = new THREE.Vector3(d.x * rand(1, 1.6), rand(1.6, 2.4), d.z * rand(1, 1.6));
        m.position.y = 0.05;
        particle(L, g, m, 0.7, (p, r, dt) => {
          v.y -= 7 * dt;
          p.m.position.addScaledVector(v, dt);
          if (p.m.position.y < 0.02) { p.m.position.y = 0.02; v.y = Math.abs(v.y) * 0.35; v.x *= 0.6; v.z *= 0.6; }
          p.m.rotation.x += 9 * dt;
          p.m.scale.setScalar(0.025 * popScale(r, 0.08, 0.7));
        });
      }
    },
  },
  {
    title: '⑤ 반짝 별가루',
    text: '하얗게 번쩍한 뒤 반짝이 가루가 빙글빙글 하늘로 흩어진다. 아프지 않고 예쁘게 사라지는 느낌.',
    fire(L, g) {
      const flash = new THREE.Mesh(SPHERE, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false }));
      flash.position.y = CENTER_Y;
      particle(L, g, flash, 0.3, (p, r) => {
        p.m.scale.setScalar(0.42 * outBack(r / 0.3, 1.2));
        p.m.material.opacity = 0.9 * (1 - sm(r, 0.25, 1));
      });
      for (let i = 0; i < 3; i++) puff(L, g, { dir: ring(i, 3, 0), speed: 0.9, up: 0, size: 0.11, life: 0.55, y: 0.12 });
      const COLORS = ['#ffd23a', '#ffffff', '#ff86b8', '#62c4ff'];
      for (let i = 0; i < 30; i++) {
        const m = new THREE.Mesh(OCTA, new THREE.MeshBasicMaterial({ color: COLORS[i % COLORS.length] }));
        const a0 = (i / 30) * PI * 2 * 3;
        const rise = rand(0.7, 1.2);
        const out = rand(0.3, 0.6);
        const seed = rand(0, 10);
        const size = rand(0.035, 0.06);
        particle(L, g, m, rand(0.9, 1.3), (p, r) => {
          const a = a0 + r * 5;
          const rr = 0.08 + out * sm(r, 0, 0.7);
          p.m.position.set(Math.cos(a) * rr, CENTER_Y - 0.1 + rise * (1 - (1 - r) ** 2), Math.sin(a) * rr);
          p.m.rotation.y = r * 12;
          p.m.scale.setScalar(size * (0.55 + 0.45 * Math.sin(p.age * 28 + seed)) * outBack(r / 0.1) * (1 - sm(r, 0.6, 1)));
        }, { delay: rand(0, 0.25) });
      }
    },
  },
  {
    title: '⑥ 회오리 연기',
    text: '연기가 몸 자리에서 빙글빙글 돌며 위로 솟아 흩어진다. 마법처럼 쏙 빨려 사라지는 느낌.',
    fire(L, g) {
      for (let i = 0; i < 18; i++) {
        const m = blob(SPHERE, i % 3 === 2 ? '#e7e1f2' : '#fffaf0');
        const a0 = i * 0.95;
        const size = rand(0.09, 0.14);
        particle(L, g, m, 0.8, (p, r) => {
          const a = a0 + r * 7;
          const rr = 0.12 + 0.28 * r;
          p.m.position.set(Math.cos(a) * rr, 0.08 + 1.05 * sm(r, 0, 1), Math.sin(a) * rr);
          p.m.scale.setScalar(size * (1 - 0.4 * r) * popScale(r, 0.2, 0.55));
        }, { delay: i * 0.022 });
      }
      const core = blob(SPHERE, '#fffaf0');
      core.position.y = CENTER_Y;
      particle(L, g, core, 0.4, (p, r) => p.m.scale.setScalar(0.22 * popScale(r, 0.25, 0.3)));
    },
  },
  {
    title: '⑦ 알록달록 사탕 펑',
    text: '풍선이 터지듯 알록달록한 방울이 튀어 올라 바닥에 통통 튀다 사라진다. 가장 신나고 아이들 취향.',
    fire(L, g) {
      for (let i = 0; i < 5; i++) puff(L, g, { dir: ring(i, 5), speed: 1.2, size: rand(0.12, 0.16), life: 0.55 });
      const COLORS = ['#ff5f97', '#2fc98f', '#ffc22e', '#3f9ff0', '#9b6cf0'];
      for (let i = 0; i < 14; i++) {
        const m = blob(SPHERE, COLORS[i % COLORS.length], 0.1);
        const d = ring(i, 14, 0);
        const v = new THREE.Vector3(d.x * rand(1, 1.7), rand(1.8, 2.6), d.z * rand(1, 1.7));
        const size = rand(0.045, 0.07);
        m.position.y = CENTER_Y;
        particle(L, g, m, rand(1.0, 1.3), (p, r, dt) => {
          v.y -= 7.5 * dt;
          p.m.position.addScaledVector(v, dt);
          if (p.m.position.y < size) { p.m.position.y = size; v.y = Math.abs(v.y) * 0.5; v.x *= 0.7; v.z *= 0.7; }
          p.m.scale.setScalar(size * popScale(r, 0.08, 0.75));
        });
      }
    },
  },
  {
    title: '⑧ 영혼 둥실',
    text: '작은 연기와 함께 귀여운 유령이 쏙 빠져나와 손 흔들듯 흔들리며 하늘로 둥실 올라가다 퐁 사라진다.',
    fire(L, g) {
      for (let i = 0; i < 6; i++) puff(L, g, { dir: ring(i, 6), speed: rand(1.1, 1.5), size: rand(0.1, 0.13), life: 0.6 });
      const ghost = new THREE.Group();
      const white = '#ffffff';
      const head = blob(SPHERE, white, 0.06); head.scale.setScalar(0.12); ghost.add(head);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.115, 0.2, 18).rotateX(PI).translate(0, -0.1, 0), mat(white));
      addOutline(tail, 0.008);
      tail.position.y = -0.02;
      ghost.add(tail);
      for (const s of [-1, 1]) {
        const e = new THREE.Mesh(SPHERE, new THREE.MeshBasicMaterial({ color: '#4a3525' }));
        e.scale.set(0.014, 0.02, 0.01); e.position.set(s * 0.042, 0.015, 0.11); ghost.add(e);
        const b = new THREE.Mesh(SPHERE, new THREE.MeshBasicMaterial({ color: '#ffb3c4' }));
        b.scale.set(0.018, 0.01, 0.006); b.position.set(s * 0.07, -0.015, 0.098); ghost.add(b);
      }
      ghost.position.y = CENTER_Y;
      particle(L, g, ghost, 1.7, (p, r) => {
        const s = outBack(r / 0.12, 2.2) * (r > 0.88 ? 1 + 0.3 * sm(r, 0.88, 0.94) - 1.3 * sm(r, 0.94, 1) : 1);
        p.m.scale.setScalar(Math.max(0.0001, s));
        p.m.position.set(Math.sin(r * 9) * 0.08, CENTER_Y + 0.95 * sm(r, 0.05, 1), 0);
        p.m.rotation.z = Math.sin(r * 9 + 1) * 0.25;
      }, { delay: 0.05 });
    },
  },
];

// ── 화면 ──
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setScissorTest(true);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#dff0f8');
scene.add(new THREE.HemisphereLight(0xdbeeff, 0xffe8d6, 0.9));
const fill = new THREE.DirectionalLight(0xffd2b0, 0.55);
fill.position.set(2.2, 0.9, 1.6);
scene.add(fill);

const GAP = 5; // 칸마다 몬스터를 멀리 떨어뜨려 놓고, 칸마다 카메라를 따로 둔다
const grid = document.getElementById('grid');
const cells = SAMPLES.map((s, i) => {
  const x = i * GAP;
  // 날개콩이 직접 뿜는 효과(깃털·연기)가 들어가는 곳: 월드 좌표로 넣으므로 원점에 둔다
  const monFx = new THREE.Group();
  scene.add(monFx);
  const mon = createNalgaekong({ fxParent: monFx, outlineScale: 0.8 });
  mon.root.scale.setScalar(SCALE);
  mon.root.position.set(x, 0, 0);
  mon.root.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  scene.add(mon.root);
  // 이 시안의 효과가 들어가는 곳 (칸 가운데)
  const fx = new THREE.Group();
  fx.position.x = x;
  scene.add(fx);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(GAP, 5).rotateX(-PI / 2), new THREE.MeshStandardMaterial({ color: '#a9dc86', roughness: 1 }));
  floor.position.set(x, 0, 0);
  floor.receiveShadow = true;
  scene.add(floor);
  const key = new THREE.DirectionalLight(0xfff1e0, 1.8);
  key.position.set(x - 1.2, 2.6, 2.2);
  key.target.position.set(x, 0, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -1.5, right: 1.5, top: 1.5, bottom: -1.5 });
  key.shadow.bias = -0.0004;
  scene.add(key, key.target);

  const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 30);
  cam.position.set(x, 1.15, 3.6);
  cam.lookAt(x, 0.5, 0);

  const el = document.createElement('div');
  el.className = 'cell';
  el.innerHTML = `<h2>${s.title}</h2><p>${s.text}</p>`;
  grid.appendChild(el);
  return { s, mon, monFx, fx, cam, list: [], fired: false };
});

let cols = 4, rows = 2;
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  cols = w < h ? 2 : 4;
  rows = Math.ceil(cells.length / cols);
  grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  grid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
  for (const c of cells) { c.cam.aspect = w / cols / (h / rows); c.cam.updateProjectionMatrix(); }
}
addEventListener('resize', resize);
resize();

// ── 반복 재생 ──
let speed = 1, paused = false, t = -0.6; // 처음엔 잠깐 서 있다가 쓰러짐
for (const b of document.querySelectorAll('[data-speed]')) {
  b.onclick = () => {
    speed = +b.dataset.speed;
    document.querySelectorAll('[data-speed]').forEach((x) => x.classList.toggle('on', x === b));
  };
}
const pauseBtn = document.getElementById('pause');
pauseBtn.onclick = () => { paused = !paused; pauseBtn.classList.toggle('on', paused); pauseBtn.textContent = paused ? '이어 보기' : '멈춤'; };
document.getElementById('play').onclick = () => {
  t = -0.6;
  for (const c of cells) { c.mon.play('idle'); c.fired = false; }
};

function step(dt) {
  const prev = t;
  t += dt;
  const lp = ((prev % CYCLE) + CYCLE) % CYCLE;
  const lt = ((t % CYCLE) + CYCLE) % CYCLE;
  const crossed = (at) => t >= 0 && lp < at && lt >= at;
  for (const c of cells) {
    if (t >= 0 && (prev < 0 || lt < lp)) { c.mon.play('die'); c.fired = false; } // 새 바퀴: 쓰러짐
    if (!c.fired && t >= 0 && lt >= POOF_AT && lt < SPAWN_AT) {
      c.fired = true;
      c.s.fire?.(c.list, c.fx);
    }
    if (crossed(SPAWN_AT)) c.mon.play('spawn');
    c.mon.update(dt);
    // 시안 칸은 날개콩이 직접 뿜는 연기를 숨긴다 (깃털은 그대로)
    if (!c.s.builtIn) c.monFx.traverse((o) => { if (o.name === '연기') o.visible = false; });
    updateParticles(c.list, dt);
  }
}
window.poofSamples = { step, cells };

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = paused ? 0 : Math.min(clock.getDelta(), 0.05) * speed;
  if (paused) clock.getDelta();
  if (dt > 0) step(dt);
  const W = innerWidth, H = innerHeight;
  cells.forEach((c, i) => {
    const cw = W / cols, ch = H / rows;
    const x = (i % cols) * cw, y = H - (Math.floor(i / cols) + 1) * ch; // WebGL 은 아래쪽이 0
    renderer.setViewport(x, y, cw, ch);
    renderer.setScissor(x, y, cw, ch);
    renderer.render(scene, c.cam);
  });
});
