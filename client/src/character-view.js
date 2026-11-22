// 캐릭터 쇼룸: 부드러운 3점 조명 + 반구광으로 고품질 렌더링 확인
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createVillager, PRESETS, EXPRESSIONS, HAIRSTYLES, OUTFITS, HATS, NOSE_STYLES } from './villager/villager.js';
import { EQUIPMENT } from './villager/equipment.js';
import { contactShadow, canvasTexture, setMaxAnisotropy, EYE_STYLES, MOUTH_STYLES } from './villager/textures.js';
import { syncToon } from './villager/toon.js';

// 쇼룸 밖에서도 쓰던 외곽선 도우미는 공용 모듈에서 그대로 내보냄
export { addOutline } from './villager/toon.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
// ACES 톤 매핑: 밝은 곳은 부드럽게 눌러 주고 채도는 살려 화사하게
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// 캔버스 텍스처(눈·볼터치·체크무늬)가 비스듬히 봐도 번지지 않게
setMaxAnisotropy(renderer.capabilities.getMaxAnisotropy());

const scene = new THREE.Scene();
// 스튜디오 환경광(IBL): 표면마다 은은한 반사광이 돌아 찰흙처럼 탁한 느낌이 사라짐
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;
pmrem.dispose();
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
// 반구광: 맑은 하늘색 + 따뜻한 크림·피치 지면 반사 → 그늘도 회색이 아닌 파스텔 톤으로
scene.add(new THREE.HemisphereLight(0xdbeeff, 0xffe8d6, 0.75));

const key = new THREE.DirectionalLight(0xfff1e0, 1.9);
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

const fill = new THREE.DirectionalLight(0xffd2b0, 0.6);
fill.position.set(2.2, 0.9, 1.6);
scene.add(fill);

const rim = new THREE.DirectionalLight(0xf4f8ff, 1.8);
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

// 흰 배경일 때만 보이는 그림자 받이 (바닥 없이 그림자만)
const shadowCatcher = new THREE.Mesh(
  new THREE.PlaneGeometry(6, 6).rotateX(-Math.PI / 2),
  new THREE.ShadowMaterial({ opacity: 0.12 }),
);
shadowCatcher.receiveShadow = true;
shadowCatcher.visible = false;
scene.add(shadowCatcher);

let toon = true;

// ── 캐릭터 ──
const villager = createVillager(PRESETS.boy);
villager.root.rotation.y = -0.25;
scene.add(villager.root);
let spin = false;

// ── 패널 데이터: 버튼 목록은 전부 여기서 만든다 ──
const ACTION_LABELS = { idle: '대기', walk: '걷기', run: '달리기', jump: '점프', flip: '공중제비', wave: '인사', cheer: '환호' };
const LIFE_ACTIONS = { gather: '채집', chop: '벌목', chopAgain: '벌목(이어 찍기)', fish: '낚시(연속)', fishCast: '던지기', fishWait: '입질 대기', fishCatch: '낚아채기' };
const COMBAT_ACTIONS = {
  slash1: '기본 베기', slash2: '연속 횡베기', smash: '강공격 내려찍기', guard: '방어', bowShot: '활 쏘기',
  castSpell: '마법 시전', hit: '피격', faint: '기절',
  swordSlash1: '목검 1타 · 대각선 베기', swordSlash2: '목검 2타 · 가로 되베기', swordSlash3: '목검 3타 · 찌르기',
  // 몽둥이 휘두르기 시안 (비교용)
  clubSmash: '몽둥이 A · 대각선(1타)', clubSmash2: '몽둥이 2타', clubSmash3: '몽둥이 3타(이어 치는 1타)', clubAir: '몽둥이 공중 공격', clubSlam: '몽둥이 내리찍기(더블 점프)', clubDash: '몽둥이 대시 공격', clubOverhead: '몽둥이 B · 내려찍기', clubSide: '몽둥이 C · 옆으로', clubUpper: '몽둥이 D · 올려치기',
};
// 타격 시점 콜백을 눈으로 확인할 수 있도록 잠깐 띄우는 문구
const HIT_TEXT = {
  gather: '줍기!', chop: '쿵!', fishCast: '퐁당', fish: '월척!', fishCatch: '월척!', slash1: '슥!', slash2: '슥슥!',
  smash: '쾅!', bowShot: '슝!', castSpell: '반짝!',
};
const SKINS = [
  { skin: '#ffe2cc', nose: '#ff9a78' },
  { skin: '#ffd3b4', nose: '#ff8a62' },
  { skin: '#e3ad84', nose: '#d4785a' },
  { skin: '#a8714f', nose: '#86492f' },
];
const HAIR_COLORS = ['#3a2a22', '#a65a2e', '#e4b660', '#d9604a', '#6b8fd6', '#f2a5c0'];
const TOP_COLORS = ['#f3efe6', '#f28aa0', '#8cc7f0', '#9ad48a', '#f7d36b', '#b59af0'];
const BOTTOM_COLORS = ['#3f5f8f', '#fff3dc', '#4a4a52', '#c96b5a', '#7fb9a8', '#e7c39b'];
const ACCESSORIES = { crown: '꽃 화관', glasses: '둥근 안경', backpack: '백팩' };

const $ = (id) => document.getElementById(id);
const syncers = [];
// 버튼 하나 만들기: isOn()으로 켜짐 표시를 갱신
function button(parent, { label, color, onClick, isOn }) {
  const b = document.createElement('button');
  b.type = 'button';
  if (color) {
    b.className = 'sw';
    b.style.background = color;
    b.setAttribute('aria-label', label);
    b.title = label;
  } else {
    b.className = 'pill';
    b.textContent = label;
  }
  b.onclick = () => { onClick(); sync(); };
  parent.appendChild(b);
  syncers.push(() => {
    const on = isOn();
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on);
  });
}
function sync() { for (const f of syncers) f(); }

const o = villager.options;
for (const [k, e] of Object.entries(EXPRESSIONS)) {
  if (e.hidden) continue;
  button($('expression'), { label: e.label, onClick: () => villager.setExpression(k), isOn: () => villager.state.expression === k });
}
let toastTimer = 0;
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 700);
}
const onHit = (name) => toast(HIT_TEXT[name] ?? '탁!');
for (const [id, list] of [['action', ACTION_LABELS], ['life-action', LIFE_ACTIONS], ['combat-action', COMBAT_ACTIONS]]) {
  for (const [k, label] of Object.entries(list)) {
    button($(id), { label, onClick: () => villager.setAction(k, onHit), isOn: () => villager.state.action === k });
  }
}
// 1타 → 2타 연속 재생 (게임에서 공격을 두 번 눌렀을 때와 같은 흐름)
button($('combat-action'), {
  label: '몽둥이 연속(1→2→3→2타)',
  onClick: () => {
    villager.setAction('clubSmash', onHit);
    [['clubSmash2', 470], ['clubSmash3', 875], ['clubSmash2', 1280]].forEach(([a, ms]) => setTimeout(() => villager.setAction(a, onHit), ms));
  },
  isOn: () => false,
});
button($('combat-action'), {
  label: '목검 연속(1→2→3→1타)',
  onClick: () => {
    villager.setAction('swordSlash1', onHit);
    [['swordSlash2', 384], ['swordSlash3', 719], ['swordSlash4', 1277]].forEach(([a, ms]) => setTimeout(() => villager.setAction(a, onHit), ms));
  },
  isOn: () => false,
});
for (const [k, e] of Object.entries(EQUIPMENT)) {
  button($('equipment'), { label: e.label, onClick: () => villager.equip(k), isOn: () => villager.state.equipment === k });
}
// 액션이 끝나 대기로 돌아가거나 장비가 자동으로 바뀌면 버튼 표시도 갱신
villager.onChange = () => sync();

// 탭: 외형 꾸미기 / 생활 · 전투 액션
for (const tab of document.querySelectorAll('.tab')) {
  tab.onclick = () => {
    for (const t of document.querySelectorAll('.tab')) {
      const on = t === tab;
      t.setAttribute('aria-selected', on);
      $(t.getAttribute('aria-controls')).hidden = !on;
    }
  };
}
for (const [k, h] of Object.entries(HAIRSTYLES)) {
  button($('hair'), { label: h.label, onClick: () => villager.set({ hair: k }), isOn: () => o.hair === k });
}
for (const [id, key, list] of [['noseStyle', 'noseStyle', NOSE_STYLES], ['mouthStyle', 'mouthStyle', MOUTH_STYLES]]) {
  for (const [k, e] of Object.entries(list)) {
    button($(id), { label: e.label, onClick: () => villager.set({ [key]: k }), isOn: () => (o[key] ?? 'classic') === k });
  }
}
for (const [k, e] of Object.entries(EYE_STYLES)) {
  button($('eyeStyle'), { label: e.label, onClick: () => villager.set({ eyeStyle: k }), isOn: () => (o.eyeStyle ?? 'basic') === k });
}
SKINS.forEach((s, i) => button($('skin'), { label: `피부색 ${i + 1}`, color: s.skin, onClick: () => villager.set(s), isOn: () => o.skin === s.skin }));
for (const [id, key, list] of [['hairColor', 'hairColor', HAIR_COLORS], ['top-color', 'top', TOP_COLORS], ['bottomColor', 'bottomColor', BOTTOM_COLORS]]) {
  list.forEach((c) => button($(id), { label: c, color: c, onClick: () => villager.set({ [key]: c }), isOn: () => o[key] === c }));
}
for (const [k, f] of Object.entries(OUTFITS)) {
  button($('outfit'), { label: f.label, onClick: () => villager.set({ outfit: k }), isOn: () => (o.outfit ?? 'tee') === k });
}
// 모자는 하나만 쓴다 (다시 누르면 벗음)
for (const [k, h] of Object.entries(HATS)) {
  button($('acc'), { label: h.label, onClick: () => villager.set({ hat: o.hat === k ? 'none' : k }), isOn: () => o.hat === k });
}
for (const [k, label] of Object.entries(ACCESSORIES)) {
  button($('acc'), { label, onClick: () => villager.set({ [k]: !o[k] }), isOn: () => !!o[k] });
}
for (const b of document.querySelectorAll('[data-preset]')) {
  const p = PRESETS[b.dataset.preset];
  syncers.push(() => b.classList.toggle('on', Object.keys(p).every((k) => o[k] === p[k])));
  b.onclick = () => { villager.set(p); sync(); };
}

// ── 상단 바 ──
const sky = scene.background;
let white = false;
$('bg').onclick = () => {
  white = !white;
  scene.background = white ? new THREE.Color('#ffffff') : sky;
  ground.visible = !white;
  shadowCatcher.visible = white;
  $('bg').textContent = white ? '배경: 순백색' : '배경: 잔디';
};
$('outline').onclick = () => {
  toon = !toon;
  $('outline').textContent = `외곽선: ${toon ? 'ON' : 'OFF'}`;
  $('outline').classList.toggle('on', toon);
};
$('outline').classList.toggle('on', toon);
$('spin').onclick = () => {
  spin = !spin;
  $('spin').classList.toggle('on', spin);
};
$('glb').onclick = async () => {
  const btn = $('glb');
  btn.disabled = true;
  btn.textContent = '내보내는 중…';
  try {
    // 외곽선 껍질과 툰 재질은 화면 전용이므로 원래 3D 재질로 되돌린 상태로 내보냄
    syncToon(villager.root, false);
    const glb = await new GLTFExporter().parseAsync(villager.root, { binary: true });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([glb], { type: 'model/gltf-binary' }));
    a.download = `villager-${o.hair}.glb`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch (err) {
    console.error(err);
    alert('GLB 내보내기에 실패했어요. 콘솔을 확인해 주세요.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'GLB 내보내기';
  }
};
sync();

// 패널에 가려지지 않게 화면 중심을 패널 반대쪽으로 옮김
function resize() {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const panel = $('panel').getBoundingClientRect();
  if (w > 760) camera.setViewOffset(w, h, (panel.width + 16) / 2, 0, w, h);
  else camera.setViewOffset(w, h, 0, panel.height / 2, w, h);
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
  syncToon(villager.root, toon);
  // 뛰어오르면 발밑 그림자가 작고 옅어짐
  const k = 1 - Math.min(0.6, villager.root.position.y * 2.5);
  contact.scale.setScalar(k);
  contact.material.opacity = k;
  controls.update();
  renderer.render(scene, camera);
});

// ── 외부 게임 로직에서 캐릭터를 다루는 전역 컨트롤러 ──
// CharacterApp.setAction('chop', () => 나무체력--, () => console.log('끝'))
window.CharacterApp = {
  villager,
  actions: { ...ACTION_LABELS, ...LIFE_ACTIONS, ...COMBAT_ACTIONS },
  equipment: Object.keys(EQUIPMENT),
  setAction(name, onHitCallback, onCompleteCallback) {
    villager.setAction(name, onHitCallback, onCompleteCallback);
  },
  setExpression(name) {
    if (!EXPRESSIONS[name]) throw new Error(`없는 표정: ${name}`);
    villager.setExpression(name);
  },
  equip(itemId) {
    if (!EQUIPMENT[itemId]) throw new Error(`없는 장비: ${itemId}`);
    villager.equip(itemId);
  },
  // 'boy' | 'girl' 같은 프리셋 이름, 또는 바꿀 값만 담은 객체 ({ hair: 'pony', glasses: true })
  setPreset(config) {
    const patch = typeof config === 'string' ? PRESETS[config] : config;
    if (!patch) throw new Error(`없는 프리셋: ${config}`);
    villager.set(patch);
    sync();
  },
};

// 개발 중 점검용
window.__show = { renderer, scene, camera, villager, syncToon: (on) => syncToon(villager.root, on) };
