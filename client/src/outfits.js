// 기본 옷 시안: 실제 주민 모델에 기본 옷(티셔츠·반바지·치마·카라·허리 셔츠·가방) 조합을 입혀 한 화면에 비교
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createVillager, PRESETS } from './villager/villager.js';
import { contactShadow, setMaxAnisotropy } from './villager/textures.js';
import { syncToon } from './villager/toon.js';

// 시안 목록: 기본 프리셋 위에 바뀐 값만 적는다
const OUTFITS = [
  { name: '1 · 하얀 티 + 청반바지', note: '가장 기본 (남)', base: 'boy',
    look: { hair: 'side', plaid: null } },
  { name: '2 · 분홍 카라 티 + 크림 치마', note: '가장 기본 (여)', base: 'girl',
    look: { hair: 'bob', crown: false } },
  { name: '3 · 병아리 노랑', note: '노랑 티 · 남색 반바지 · 초록 신발', base: 'boy',
    look: { hair: 'short', hairColor: '#3a2a22', top: '#ffd76a', bottomColor: '#34477a', shoes: '#5bb35a', plaid: null } },
  { name: '4 · 하늘 교복', note: '하늘 카라 티 · 남색 치마 · 갈색 구두', base: 'girl',
    look: { hair: 'pony', hairColor: '#4a3226', top: '#a9d8f5', collar: '#ffffff', bottomColor: '#2f3f6e', shoes: '#6b4430', crown: false } },
  { name: '5 · 숲 탐험', note: '초록 티 · 베이지 반바지 · 허리 체크셔츠', base: 'boy',
    look: { hair: 'side', hairColor: '#6b4a32', top: '#9fd27e', bottomColor: '#c9ad7f', shoes: '#8a5634',
      plaid: ['#d9604a', '#7a2e22', '#3a2a22'] } },
  { name: '6 · 라벤더', note: '연보라 티 · 보라 치마 · 흰 운동화', base: 'girl',
    look: { hair: 'bob', hairColor: '#2f2622', top: '#d9c6f4', collar: null, bottomColor: '#8e6fcf', shoes: '#ffffff', crown: false } },
  { name: '7 · 체육복', note: '빨강 티 · 회색 반바지 · 흰 운동화', base: 'boy',
    look: { hair: 'short', hairColor: '#a65a2e', top: '#e2574c', bottomColor: '#6f7680', shoes: '#ffffff', plaid: null } },
  { name: '8 · 등굣길', note: '크림 카라 티 · 갈색 치마 · 노랑 가방', base: 'girl',
    look: { hair: 'pony', hairColor: '#c99a5b', top: '#fff1d2', collar: '#e2574c', bottomColor: '#8a5634', shoes: '#d94040',
      crown: false, backpack: true, bagColor: '#f0b43c' } },
  { name: '9 · 오버핏 반팔', note: '흰 반팔 · 베이지 긴바지 · 비니', base: 'girl',
    look: { hair: 'bob', outfit: 'street', top: '#f3efe6', bottomColor: '#b7a37c', shoes: '#f3efe6', hat: 'beanie', crown: false } },
  { name: '10 · 로고 후드티', note: '회색 후드 · 검정 긴바지 · 볼캡', base: 'boy',
    look: { hair: 'short', hairColor: '#2f2622', outfit: 'hoodie', top: '#c9ccd1', bottomColor: '#2b2b33', shoes: '#34477a', hat: 'cap' } },
  { name: '11 · 트랙 집업', note: '검정 재킷 · 흰 배색 줄', base: 'boy',
    look: { hair: 'side', hairColor: '#2f2622', outfit: 'track', top: '#2b2b33', bottomColor: '#2b2b33', shoes: '#f3efe6' } },
  { name: '12 · 레이어드 긴팔', note: '빨강 반팔 · 흰 긴팔 이너', base: 'girl',
    look: { hair: 'pony', hairColor: '#4a3226', outfit: 'layered', top: '#e2574c', bottomColor: '#3b4a63', shoes: '#f3efe6', crown: false } },
];

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.setScissorTest(true);
setMaxAnisotropy(renderer.capabilities.getMaxAnisotropy());

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;
pmrem.dispose();

// 쇼룸과 같은 조명 (그림자는 접지 그림자만)
scene.add(new THREE.HemisphereLight(0xdbeeff, 0xffe8d6, 0.75));
const key = new THREE.DirectionalLight(0xfff1e0, 1.9);
key.position.set(-1.6, 2.6, 2.2);
scene.add(key);
const fill = new THREE.DirectionalLight(0xffd2b0, 0.6);
fill.position.set(2.2, 0.9, 1.6);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xf4f8ff, 1.8);
rim.position.set(0.6, 1.8, -2.4);
scene.add(rim);
const contact = new THREE.Mesh(
  new THREE.PlaneGeometry(0.55, 0.45).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ map: contactShadow(), transparent: true, depthWrite: false }),
);
contact.position.y = 0.002;
scene.add(contact);

const camera = new THREE.PerspectiveCamera(26, 3 / 4, 0.05, 50);
camera.position.set(0, 0.6, 2.5);
camera.lookAt(0, 0.52, 0);

// 카드와 캐릭터 만들기
const grid = document.getElementById('grid');
const cells = OUTFITS.map((def) => {
  const o = { ...PRESETS[def.base], ...def.look };
  const v = createVillager(o, { texScale: 0.5, hairSegs: 360 });
  v.root.visible = false;
  scene.add(v.root);
  const card = document.createElement('div');
  card.className = 'card';
  const chips = [o.top, o.collar, o.bottomColor, o.shoes, o.backpack ? o.bagColor : null, o.plaid?.[0]]
    .filter(Boolean).map((c) => `<i style="background:${c}"></i>`).join('');
  card.innerHTML = `<div class="view"></div><div class="tag"><b>${def.name}</b><span>${def.note}</span><div class="chips">${chips}</div></div>`;
  grid.appendChild(card);
  return { v, view: card.querySelector('.view') };
});

// 앞/뒤/빙글빙글
let mode = 'front';
for (const id of ['front', 'back', 'turn']) {
  document.getElementById(id).onclick = () => {
    mode = id;
    for (const b of ['front', 'back', 'turn']) document.getElementById(b).classList.toggle('on', b === id);
  };
}

const clock = new THREE.Clock();
let yaw = -0.3;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  const target = mode === 'front' ? -0.3 : mode === 'back' ? Math.PI - 0.3 : null;
  yaw = target === null ? yaw + dt * 0.8 : yaw + (target - yaw) * Math.min(1, dt * 8);

  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h, false);
  renderer.setClearColor(0x000000, 0);
  renderer.setScissor(0, 0, w, h);
  renderer.clear();
  for (const { v, view } of cells) {
    const r = view.getBoundingClientRect();
    if (r.bottom < 0 || r.top > h) continue;
    v.root.visible = true;
    v.root.rotation.y = yaw;
    v.update(t, dt);
    syncToon(v.root, true);
    // 아래쪽 이름표 높이만큼 캐릭터를 위로 올려 보이게 한다
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
    const y = h - r.bottom;
    renderer.setViewport(r.left, y, r.width, r.height);
    renderer.setScissor(r.left, y, r.width, r.height);
    renderer.render(scene, camera);
    v.root.visible = false;
  }
  requestAnimationFrame(frame);
}
frame();
