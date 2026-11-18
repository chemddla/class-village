// 캐릭터 쇼룸: 부드러운 3점 조명 + 반구광으로 고품질 렌더링 확인
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createVillager, PRESETS } from './villager/villager.js';
import { contactShadow, canvasTexture } from './villager/textures.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
// 배경: 위는 하늘색, 아래는 따뜻한 빛
scene.background = canvasTexture('bg', 4, 512, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#bfe3f7');
  gr.addColorStop(0.65, '#e6f4fb');
  gr.addColorStop(1, '#fdf3e2');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
});

const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 50);
camera.position.set(0.55, 0.78, 2.7);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.5, 0);
controls.enableDamping = true;
controls.minDistance = 0.8;
controls.maxDistance = 6;
controls.maxPolarAngle = Math.PI * 0.55;

// ── 조명: 반구광 + 키 라이트(따뜻) + 필 라이트(따뜻·약하게) + 림 라이트(뒤에서 외곽선) ──
scene.add(new THREE.HemisphereLight(0xe3f1ff, 0xd8c3a0, 1.25));

const key = new THREE.DirectionalLight(0xfff1e0, 2.6);
key.position.set(-1.6, 2.6, 2.2);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -0.9;
key.shadow.camera.right = 0.9;
key.shadow.camera.top = 1.4;
key.shadow.camera.bottom = -0.4;
key.shadow.radius = 6;
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.015;
scene.add(key);

const fill = new THREE.DirectionalLight(0xffd2b0, 0.9);
fill.position.set(2.2, 0.9, 1.6);
scene.add(fill);

const rim = new THREE.DirectionalLight(0xf4f8ff, 2.2);
rim.position.set(0.6, 1.8, -2.4);
scene.add(rim);

// ── 바닥: 부드러운 잔디 원판 + 발밑 접지 그림자 ──
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(3, 64).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({
    roughness: 1,
    map: canvasTexture('groundTex', 512, 512, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      gr.addColorStop(0, '#a9dc86');
      gr.addColorStop(0.7, '#9fd57d');
      gr.addColorStop(1, '#e6f4fb');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    }),
  }),
);
ground.receiveShadow = true;
scene.add(ground);
const contact = new THREE.Mesh(
  new THREE.PlaneGeometry(0.55, 0.45).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ map: contactShadow(), transparent: true, depthWrite: false }),
);
contact.position.y = 0.002;
scene.add(contact);

// ── 캐릭터 ──
let villager = null;
let preset = 'boy';
let pose = 'wave';
let spin = false;

function spawn() {
  if (villager) {
    scene.remove(villager.root);
    villager.root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
  }
  villager = createVillager(PRESETS[preset]);
  villager.state.pose = pose;
  villager.root.rotation.y = -0.25;
  scene.add(villager.root);
}

spawn();

// ── 버튼 ──
for (const b of document.querySelectorAll('[data-preset]')) {
  b.onclick = () => {
    preset = b.dataset.preset;
    document.querySelectorAll('[data-preset]').forEach((x) => x.classList.toggle('on', x === b));
    spawn();
  };
}
const poseBtn = document.getElementById('pose');
const POSES = { wave: '손 흔들기', walk: '걷기', idle: '차렷' };
poseBtn.onclick = () => {
  const keys = Object.keys(POSES);
  pose = keys[(keys.indexOf(pose) + 1) % keys.length];
  villager.state.pose = pose;
  poseBtn.textContent = `자세: ${POSES[pose]}`;
};
const spinBtn = document.getElementById('spin');
spinBtn.onclick = () => {
  spin = !spin;
  spinBtn.classList.toggle('on', spin);
};

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  if (spin) villager.root.rotation.y += dt * 0.6;
  villager.update(t, dt);
  controls.update();
  renderer.render(scene, camera);
});

// 개발 중 점검용
window.__show = { renderer, scene, camera, get villager() { return villager; } };
