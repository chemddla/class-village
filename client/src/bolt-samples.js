// 지팡이 기본 공격 투사체 디자인 시안: 칸마다 주민이 완드로 마법을 쏘고, 칸마다 다른 모양의 투사체가 날아간다
// 고른 것을 arrows.js 의 makeBolt() 로 옮긴다 (게임 코드는 건드리지 않음)
import * as THREE from 'three';
import { createVillager, PRESETS } from './villager/villager.js';
import { ACTIONS } from './villager/actions.js';
import { syncToon } from './villager/toon.js';
import { makeBolt, makeBurst } from './arrows.js';
import { BOLT } from '../../shared/world.js';

const PI = Math.PI;
const SCALE = 1.7; // 게임 캐릭터 크기 (character.js 와 같게)
// 빛무리 재질: 조명과 상관없이 밝은 반투명 (밝은 하늘 위에서도 색이 보이게 더하기 섞기는 쓰지 않는다)
const glow = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
const solid = (color) => new THREE.MeshBasicMaterial({ color });
const ball = (r, m, seg = 12) => new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(6, seg * 0.66 | 0)), m);

// 투사체 하나: { obj, update(dt, age) }. obj 는 +X 쪽으로 날아간다
const DESIGNS = [
  {
    title: '① 지금 볼', text: '④ 도는 불꽃에서 도는 빛을 뺀 것. 게임에 들어간 것 (arrows.js)',
    make() {
      const m = makeBolt();
      m.rotation.y = PI / 2; // 볼은 +Z 쪽으로 날도록 만들어져 있다 → 이 화면은 +X 로 난다
      const g = new THREE.Group();
      g.add(m);
      return { obj: g, update() {} };
    },
  },
  {
    title: '② 꼬리 혜성', text: '밝은 심 뒤로 점점 작아지는 빛 방울이 꼬리처럼 따라온다',
    make() {
      const g = new THREE.Group();
      g.add(ball(0.08, solid('#f2fdff')), ball(0.14, glow('#4fc3ff', 0.55)));
      const tail = [];
      for (let i = 1; i <= 6; i++) {
        const b = ball(0.12 * (1 - i / 8), glow('#4fc3ff', 0.5 * (1 - i / 7)), 8);
        b.position.x = -i * 0.09;
        g.add(b);
        tail.push(b);
      }
      return { obj: g, update(dt, age) { tail.forEach((b, i) => { b.position.y = Math.sin(age * 30 - i) * 0.012 * i; }); } };
    },
  },
  {
    title: '③ 빙글 별', text: '노란 별이 빙글빙글 돌며 날아간다. 아이들 마법 느낌',
    make() {
      const shape = new THREE.Shape();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 0.06 : 0.15, a = (i / 10) * PI * 2 + PI / 2;
        shape[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
      }
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 1 }).center();
      const star = new THREE.Mesh(geo, solid('#ffe36b'));
      const g = new THREE.Group();
      g.add(star, ball(0.17, glow('#ffd23f', 0.3)));
      return { obj: g, update(dt) { star.rotation.z -= dt * 12; } };
    },
  },
  {
    title: '④ 도는 불꽃', text: '파란 심 둘레를 작은 빛 두 개가 빙글빙글 돈다',
    make() {
      const g = new THREE.Group();
      g.add(ball(0.08, solid('#e8fbff')), ball(0.13, glow('#4fc3ff', 0.5)));
      const sparks = [0, 1].map(() => { const s = ball(0.035, solid('#bff3ff'), 8); g.add(s); return s; });
      return {
        obj: g,
        update(dt, age) {
          sparks.forEach((s, i) => {
            const a = age * 18 + i * PI;
            s.position.set(0, Math.cos(a) * 0.17, Math.sin(a) * 0.17);
          });
        },
      };
    },
  },
  {
    title: '⑤ 마나 방울', text: '마나 막대와 같은 파란 물방울. 앞이 둥글고 뒤가 뾰족하다',
    make() {
      const pts = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12; // 0 뒤 끝(뾰족) → 1 앞 끝(둥금)
        pts.push(new THREE.Vector2(Math.sin(t * PI) ** 0.8 * 0.1 * (0.35 + 0.65 * t), (t - 0.6) * 0.32));
      }
      const drop = new THREE.Mesh(new THREE.LatheGeometry(pts, 14).rotateZ(-PI / 2), new THREE.MeshBasicMaterial({ color: '#5aa8ff' }));
      const shine = ball(0.025, solid('#ffffff'), 8);
      shine.position.set(0.04, 0.04, 0.05);
      const g = new THREE.Group();
      g.add(drop, shine, ball(0.15, glow('#3f7fd6', 0.35)));
      return { obj: g, update(dt, age) { drop.scale.set(1 + Math.sin(age * 25) * 0.06, 1 - Math.sin(age * 25) * 0.05, 1); } };
    },
  },
  {
    title: '⑥ 반짝이 뭉치', text: '작은 반짝이 여러 개가 깜빡이며 뭉쳐 날아간다',
    make() {
      const g = new THREE.Group();
      g.add(ball(0.07, solid('#f2fdff')), ball(0.12, glow('#8fd8ff', 0.4)));
      const bits = [];
      for (let i = 0; i < 9; i++) {
        const b = new THREE.Mesh(new THREE.OctahedronGeometry(0.03, 0), solid(i % 3 ? '#bff3ff' : '#ffe9a8'));
        b.userData.p = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(0.1 + Math.random() * 0.1);
        b.userData.k = Math.random() * 10;
        g.add(b);
        bits.push(b);
      }
      return {
        obj: g,
        update(dt, age) {
          for (const b of bits) {
            b.position.copy(b.userData.p).applyAxisAngle(new THREE.Vector3(1, 0, 0), age * 6);
            b.scale.setScalar(0.5 + 0.5 * Math.abs(Math.sin(age * 14 + b.userData.k)));
            b.rotation.y += dt * 8;
          }
        },
      };
    },
  },
];

// ── 화면 ──
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.setScissorTest(true);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#dff0f8');
scene.add(new THREE.HemisphereLight(0xdbeeff, 0xffe8d6, 1.1));
const sun = new THREE.DirectionalLight(0xfff1e0, 1.8);
sun.position.set(-2, 4, 3);
scene.add(sun);

const GAP = 12; // 칸끼리 날아가는 볼이 섞이지 않게 멀리 떨어뜨린다
const FLY = 3.6; // 칸 안에서 날아가는 거리 (m)
const PERIOD = 1.3; // 한 번 쏘고 다음 쏘기까지 (초)
const SHOOT_AT = ACTIONS.staffBolt.duration * ACTIONS.staffBolt.hitAt;
const grid = document.getElementById('grid');
const cells = DESIGNS.map((d, i) => {
  const x = i * GAP;
  const v = createVillager(PRESETS[i % 2 ? 'girl' : 'boy'], { texScale: 0.5, hairSegs: 240 });
  const spot = new THREE.Group(); // 주민 root 는 동작이 움직이므로 자리·크기·방향은 바깥 묶음에 준다
  spot.scale.setScalar(SCALE);
  spot.position.x = x;
  spot.rotation.y = PI / 2; // +X 쪽을 본다
  spot.add(v.root);
  v.equip('staff');
  v.setAction('idle');
  scene.add(spot);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(GAP, 6).rotateX(-PI / 2), new THREE.MeshStandardMaterial({ color: '#a9dc86', roughness: 1 }));
  floor.position.set(x + FLY / 2, 0, 0);
  scene.add(floor);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 40);
  cam.position.set(x + 1.3, 1.3, 7.5);
  cam.lookAt(x + 1.3, 1.0, 0);
  const el = document.createElement('div');
  el.className = 'cell';
  el.innerHTML = `<h2>${d.title}</h2><p>${d.text}</p>`;
  grid.appendChild(el);
  return { d, v, x, cam, t: PERIOD - 0.3, shot: true, bolts: [] };
});

window.cells = cells; // 개발용: 콘솔에서 살펴보기
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

let speed = 1;
const FREEZE = new URLSearchParams(location.search).has('u') ? Number(new URLSearchParams(location.search).get('u')) : null;
const slowBtn = document.getElementById('slow');
slowBtn.onclick = () => { speed = speed === 1 ? 0.25 : 1; slowBtn.classList.toggle('on', speed < 1); };

const clock = new THREE.Clock();
let t = 0;
const bursts = [];
function frame(dt) {
  // ?u=0.4 : 첫 공격 동작의 그 비율(0~1)에서 멈춰 자세를 살핀다
  if (FREEZE !== null && cells[0].casting && cells[0].t >= FREEZE * ACTIONS.staffBolt.duration) dt = 0;
  t += dt;
  for (const p of [...bursts]) if (!p.update(dt)) { scene.remove(p.obj); bursts.splice(bursts.indexOf(p), 1); }
  for (const c of cells) {
    c.t += dt;
    if (c.t >= PERIOD) { c.t = 0; c.shot = false; c.casting = true; c.v.setAction('staffBolt'); }
    c.v.update(t, dt);
    syncToon(c.v.root, true);
    if (!c.shot && c.t >= SHOOT_AT) { // 게임처럼 완드 끝에서 출발 (arrows.js shoot 과 같은 자리)
      c.shot = true;
      const b = c.d.make();
      let tip = null;
      c.v.rig.rightSocket.traverse((o) => { tip ??= o.userData.staff?.crystal ?? null; });
      tip.getWorldPosition(b.obj.position);
      b.age = 0;
      scene.add(b.obj);
      c.bolts.push(b);
    }
    for (const b of [...c.bolts]) {
      b.age += dt;
      b.obj.position.x += BOLT.speed * dt; // 게임과 같은 속도
      b.update(dt, b.age);
      if (b.obj.position.x > c.x + FLY) {
        scene.remove(b.obj);
        c.bolts.splice(c.bolts.indexOf(b), 1);
        if (c === cells[0]) { const p = makeBurst(b.obj.position); scene.add(p.obj); bursts.push(p); } // ① 은 게임처럼 끝에서 펑
      }
    }
  }
  const W = innerWidth, H = innerHeight;
  cells.forEach((c, i) => {
    const cw = W / cols, ch = H / rows;
    const x = (i % cols) * cw, y = H - (Math.floor(i / cols) + 1) * ch;
    renderer.setViewport(x, y, cw, ch);
    renderer.setScissor(x, y, cw, ch);
    renderer.render(scene, c.cam);
  });
}
renderer.setAnimationLoop(() => frame(Math.min(clock.getDelta(), 0.05) * speed));
window.step = (sec) => { for (let i = 0; i < sec * 60; i++) frame(1 / 60); }; // 개발용: 화면이 숨겨져 멈췄을 때 손으로 시간 넘기기
