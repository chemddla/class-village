// 연습용 짧은 나무 완드(장식 없음) 디자인 시안: 칸마다 주민이 다른 지팡이를 들고 빙글 돈다 (고른 것을 equipment.js 의 staff() 로 옮긴다)
// 시안 지팡이는 이 화면에서만 EQUIPMENT·ACTIONS 에 잠깐 끼워 넣는다 (게임 표는 건드리지 않음)
import * as THREE from 'three';
import { createVillager, PRESETS } from './villager/villager.js';
import { ACTIONS } from './villager/actions.js';
import { EQUIPMENT } from './villager/equipment.js';
import { syncToon } from './villager/toon.js';

const PI = Math.PI;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
// equipment.js 와 같은 도우미 (쥐는 곳이 원점, 손잡이→머리가 +Y)
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.3, ...o });
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
// 처음 받는 연습용 지팡이: 장식 없이 나무만. 마법을 쓸 때는 끝마디(crystal)만 따뜻하게 빛난다
// (equipment.js 의 staff 갱신이 crystal 을 빛내고 빙글 돌리므로, 끝마디는 둥근 공으로 둬 돌아도 티가 나지 않게)
const BARK = (color) => mat(color, { roughness: 0.85 });
function finish(g, crystal) {
  const light = new THREE.PointLight('#ffcf7a', 0, 0.6);
  light.position.copy(crystal.position);
  g.add(light);
  g.userData.staff = { crystal, light };
  return grip(g);
}
// 굽은 나무 대: 점들을 잇는 관, 아래(r0)에서 끝(r1)으로 갈수록 가늘다. 양 끝은 공으로 막는다
// r0 에 함수를 주면 굵기를 길이 비율 t(0 밑동 → 1 끝)마다 그 함수로 정한다
function woodTube(g, color, pts, r0, r1, name = '대') {
  const rf = typeof r0 === 'function' ? r0 : (t) => r0 + (r1 - r0) * t;
  const curve = new THREE.CatmullRomCurve3(pts);
  const SEG = 96, RAD = 10;
  const geo = new THREE.TubeGeometry(curve, SEG, 1, RAD);
  const p = geo.attributes.position;
  const c = V();
  for (let i = 0; i <= SEG; i++) {
    curve.getPointAt(i / SEG, c);
    const r = rf(i / SEG);
    for (let j = 0; j <= RAD; j++) {
      const k = i * (RAD + 1) + j;
      p.setXYZ(k, c.x + (p.getX(k) - c.x) * r, c.y + (p.getY(k) - c.y) * r, c.z + (p.getZ(k) - c.z) * r);
    }
  }
  geo.computeVertexNormals();
  part(geo, BARK(color), g, name);
  part(new THREE.SphereGeometry(rf(0), 12, 8), BARK(color), g, '밑동', pts[0].toArray());
  return curve;
}
// ── 짧은 나무 완드 (한 손에 쥐는 길이) ──
// 손잡이는 고른 굵기, 손잡이 위부터 끝으로 갈수록 가늘어져 날카롭게 (끝은 아주 작은 둥근 마개). 밑동은 살짝만 가늘게. 장식 없이 한 가지 나무색
const R = 0.0075;
const BOTTOM = -0.035; // 손잡이 끝 (주먹 아래로 살짝)
const TOP = 0.255;
const WOOD = '#8a5530';
function wand() {
  const g = new THREE.Group();
  const end = (d) => 0.55 + 0.45 * Math.sin(Math.min(1, d / 0.08) * PI / 2); // 끝 굵기 0.55R
  const sharp = (t) => (t < 0.3 ? 1 : 1 - 0.74 * ((t - 0.3) / 0.7) ** 1.3); // 손잡이 위(t 0.3)부터 끝 굵기 0.26R 까지
  const cv = woodTube(g, WOOD, [V(0, BOTTOM, 0), V(0, 0.1, 0), V(0, TOP, 0)], (t) => R * Math.min(end(t), sharp(t))); // 밑동 마개는 woodTube 가 끝 굵기로 붙인다
  // 끝마개도 같은 색: 평소엔 거의 티 안 나고, 마법을 쓸 때만 따뜻하게 빛난다 (equipment.js 가 emissiveIntensity 를 올림)
  const tip = part(new THREE.SphereGeometry(R * 0.26, 10, 6), mat(WOOD, { roughness: 0.85, emissive: '#2a1808', emissiveIntensity: 0.5 }), g, '끝마개', cv.getPointAt(1).toArray());
  // 외곽선 두께를 부품 크기 대신 하나로: 대(길어서 두꺼움)와 끝마개(작아서 얇음)가 달라 끝에 대 외곽선 입구가 뚫려 보였다
  g.traverse((m) => { if (m.isMesh) m.userData.outlineWidth = 0.003; });
  return finish(g, tip);
}

const SAMPLES = [
  { id: 'n_a', make: wand, title: '연습용 나무 완드', text: '손잡이는 고른 굵기, 끝으로 갈수록 가늘어져 날카롭게. 장식 없이 한 가지 나무색' },
];
for (const s of SAMPLES) {
  EQUIPMENT[s.id] = { label: s.title, right: s.make, carry: EQUIPMENT.staff.carry };
  ACTIONS[`bolt_${s.id}`] = { ...ACTIONS.staffBolt, equip: s.id };
}

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
renderer.shadowMap.autoUpdate = false; // 칸·확대 화면마다 그림자를 다시 그리지 않게, 한 프레임에 한 번만

const scene = new THREE.Scene();
scene.background = new THREE.Color('#dff0f8');
scene.add(new THREE.HemisphereLight(0xdbeeff, 0xffe8d6, 0.85));
const fill = new THREE.DirectionalLight(0xffd2b0, 0.6);
fill.position.set(2.2, 0.9, 1.6);
scene.add(fill);

const GAP = 4;
const grid = document.getElementById('grid');
const cells = SAMPLES.map((s, i) => {
  const x = i * GAP;
  const spot = new THREE.Group();
  spot.position.x = x;
  spot.rotation.y = -0.5;
  scene.add(spot);
  const v = createVillager(PRESETS[i % 2 ? 'girl' : 'boy'], { texScale: 0.5, hairSegs: 240 });
  spot.add(v.root);
  v.equip(s.id);
  v.setAction('idle');

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

  const cam = new THREE.PerspectiveCamera(26, 1, 0.05, 20);
  cam.position.set(x, 0.7, 3.1);
  cam.lookAt(x, 0.5, 0);

  const el = document.createElement('div');
  el.className = 'cell';
  el.innerHTML = `<h2>${s.title}</h2><p>${s.text}</p>`;
  grid.appendChild(el);
  // 확대 화면 (칸 오른쪽 아래): 캐릭터와 멀리 떨어진 곳에 같은 지팡이를 하나 더 세워 두고 머리 쪽을 비춘다
  const show = new THREE.Group();
  show.position.set(x, 0, -30);
  const tool = s.make();
  tool.rotation.x = 0; // grip 이 눕힌 것을 다시 세운다 (+Y 가 위)
  tool.scale.setScalar(1.7);
  show.add(tool);
  scene.add(show);
  const close = new THREE.PerspectiveCamera(24, 1, 0.01, 5);
  close.position.set(x, 0.7, -30 + 1.4); // 완드 전체가 보이게, 살짝 위에서 내려다봐 고리와 대 사이 틈이 보이게
  close.lookAt(x, 0.2, -30);
  return { s, v, spot, cam, close, show };
});

let cols = 4, rows = 2;
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  cols = w < h || cells.length <= 4 ? 2 : 4;
  rows = Math.ceil(cells.length / cols);
  grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  grid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
  for (const c of cells) { c.cam.aspect = w / cols / (h / rows); c.cam.updateProjectionMatrix(); }
}
addEventListener('resize', resize);
resize();

let spin = true, casting = false, castT = 0;
const spinBtn = document.getElementById('spin');
spinBtn.onclick = () => { spin = !spin; spinBtn.classList.toggle('on', spin); };
const castBtn = document.getElementById('cast');
castBtn.onclick = () => {
  casting = !casting;
  castBtn.classList.toggle('on', casting);
  castT = 99;
  if (!casting) for (const c of cells) c.v.setAction('idle');
};

const clock = new THREE.Clock();
let t = 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  t += dt;
  castT += dt;
  if (casting && castT > ACTIONS.staffBolt.duration + 0.5) {
    castT = 0;
    for (const c of cells) c.v.setAction(`bolt_${c.s.id}`);
  }
  for (const c of cells) {
    if (spin) c.spot.rotation.y += dt * 0.7;
    c.v.update(t, dt);
    syncToon(c.v.root, true);
    c.show.rotation.y = t * 0.9;
    syncToon(c.show, true);
  }
  renderer.shadowMap.needsUpdate = true;
  const W = innerWidth, H = innerHeight;
  cells.forEach((c, i) => {
    const cw = W / cols, ch = H / rows;
    const x = (i % cols) * cw, y = H - (Math.floor(i / cols) + 1) * ch;
    renderer.setViewport(x, y, cw, ch);
    renderer.setScissor(x, y, cw, ch);
    renderer.render(scene, c.cam);
    const s = Math.min(cw, ch) * 0.48;
    renderer.setViewport(x + cw - s - 8, y + 8, s, s);
    renderer.setScissor(x + cw - s - 8, y + 8, s, s);
    renderer.render(scene, c.close);
  });
});
