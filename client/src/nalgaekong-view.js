// 몬스터 동작 시안 화면: 버튼으로 동작을 하나씩 틀어 보거나, 자동으로 전부 돌려 본다
// 어떤 몬스터를 볼지는 <body data-mon="mongdang"> 처럼 고른다 (mongdang | banjjok, 없으면 날개콩)
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { canvasTexture } from './villager/textures.js';
import { createNalgaekong, NALGAE_MOTIONS } from './monsters/nalgaekong.js';
import { createMongdang, MONGDANG_MOTIONS } from './monsters/mongdang.js';
import { createBanjjok, BANJJOK_MOTIONS } from './monsters/banjjok.js';

const KIND = document.body.dataset.mon;
const MONGDANG = KIND === 'mongdang';
const BANJJOK = KIND === 'banjjok';
const MOTIONS = MONGDANG ? MONGDANG_MOTIONS : BANJJOK ? BANJJOK_MOTIONS : NALGAE_MOTIONS;

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
scene.background = canvasTexture('nalgaeBg', 4, 512, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#bfe3f7');
  gr.addColorStop(0.65, '#e6f4fb');
  gr.addColorStop(1, '#fdf3e2');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
});

const camera = new THREE.PerspectiveCamera(30, 1, 0.02, 30);
camera.position.set(0.35, 0.5, 1.5);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.08, -0.08);
controls.enableDamping = true;
controls.minDistance = 0.3;
controls.maxDistance = 3;
controls.maxPolarAngle = PI * 0.52;

scene.add(new THREE.HemisphereLight(0xdbeeff, 0xffe8d6, 0.85));
const key = new THREE.DirectionalLight(0xfff1e0, 1.9);
key.position.set(-1.6, 2.6, 2.2);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -0.6, right: 0.6, top: 0.6, bottom: -0.6 });
key.shadow.radius = 5;
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.006;
scene.add(key);
const fill = new THREE.DirectionalLight(0xffd2b0, 0.6);
fill.position.set(2.2, 0.9, 1.6);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xf4f8ff, 1.5);
rim.position.set(0.6, 1.8, -2.4);
scene.add(rim);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(2.5, 64).rotateX(-PI / 2),
  new THREE.MeshStandardMaterial({
    roughness: 1,
    map: canvasTexture('nalgaeGround', 512, 512, (g, w, h) => {
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

// ── 날개콩 ──
const AUTO_ORDER = ['idle', 'walk', MONGDANG ? 'scribble' : BANJJOK ? 'rub' : 'flutter', 'notice', 'attack', 'hit', 'die'];
const LOOP_HOLD = { idle: 3, walk: 4 }; // 자동 재생에서 반복 동작을 보여 줄 시간
let auto = true;
let autoIdx = 0;
let holdLeft = LOOP_HOLD.idle;

const mon = (MONGDANG ? createMongdang : BANJJOK ? createBanjjok : createNalgaekong)({
  fxParent: scene,
  onDone(name) {
    if (name === 'die') return; // 사라진 뒤 잠깐 있다 다시 등장 (아래에서 처리)
    if (auto) nextAuto();
    else show('idle');
  },
});
mon.root.scale.setScalar(1.5); // 마을에서 쓸 크기 (주민 무릎쯤)
scene.add(mon.root);

const nowEl = document.getElementById('now');
const bar = document.getElementById('bar');
const buttons = {};
function show(name) {
  mon.play(name);
  holdLeft = LOOP_HOLD[name] ?? 0;
  nowEl.textContent = MOTIONS[name].label;
  for (const [k, b] of Object.entries(buttons)) b.classList.toggle('on', k === name);
}
function nextAuto() {
  autoIdx = (autoIdx + 1) % AUTO_ORDER.length;
  show(AUTO_ORDER[autoIdx]);
}

for (const [name, m] of Object.entries(MOTIONS)) {
  const b = document.createElement('button');
  b.textContent = m.label;
  b.onclick = () => { setAuto(false); show(name); };
  bar.appendChild(b);
  buttons[name] = b;
}
bar.appendChild(Object.assign(document.createElement('div'), { className: 'sep' }));
const autoBtn = document.createElement('button');
const setAuto = (on) => { auto = on; autoBtn.textContent = on ? '자동 재생 켜짐' : '자동 재생'; autoBtn.classList.toggle('on', on); };
autoBtn.onclick = () => { setAuto(!auto); if (auto) { autoIdx = -1; nextAuto(); } };
bar.appendChild(autoBtn);
let slow = 1;
const slowBtn = document.createElement('button');
slowBtn.textContent = '느리게 보기';
slowBtn.onclick = () => { slow = slow === 1 ? 0.3 : 1; slowBtn.classList.toggle('on', slow !== 1); };
bar.appendChild(slowBtn);
setAuto(true);
show('idle');

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
let walkAngle = 0;
let goneFor = 0;
const R = 0.16;
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05) * slow;
  const st = mon.state;

  // 걷기: 작은 원을 그리며 돌아다님 / 그 밖에는 제자리로 돌아와 카메라 쪽을 봄
  if (st === 'walk') {
    walkAngle += dt * 0.12 / R;
    mon.root.position.set(Math.sin(walkAngle) * R, 0, Math.cos(walkAngle) * R - R);
    mon.root.rotation.y = walkAngle + PI / 2;
  } else {
    const k = 1 - Math.exp(-dt * 6);
    mon.root.position.lerp(new THREE.Vector3(0, 0, 0), k);
    let dy = Math.atan2(Math.sin(-mon.root.rotation.y), Math.cos(-mon.root.rotation.y));
    mon.root.rotation.y += dy * k;
    if (Math.abs(mon.root.position.x) < 0.002 && Math.abs(mon.root.position.z) < 0.002) walkAngle = 0;
  }

  if (auto && LOOP_HOLD[st] !== undefined) {
    holdLeft -= dt;
    if (holdLeft <= 0) nextAuto();
  }
  // 쓰러져 사라지면 잠깐 뒤 다시 등장
  if (st === 'gone') {
    goneFor += dt;
    if (goneFor > 0.8) {
      goneFor = 0;
      mon.root.position.set(0, 0, 0);
      mon.root.rotation.y = 0;
      walkAngle = 0;
      show('spawn');
      if (auto) autoIdx = -1; // 등장이 끝나면 처음(대기)부터
    }
  }

  mon.update(dt);
  controls.update();
  renderer.render(scene, camera);
});

window.__nalgae = { mon, renderer, scene, camera }; // 확인용
