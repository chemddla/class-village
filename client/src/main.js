// 우리 반 마을 - 1단계 시제품 (이동 + 동시 접속)
import * as THREE from 'three';
import { Client, getStateCallbacks } from 'colyseus.js';
import {
  ANIM, COLORS, TOOLS, LIFE_SPOTS, WORLD, LIFE_COLLIDERS, PLAYER_RADIUS, WALK_SPEED, RUN_SPEED, resolveMove, inSwing, inThrust, toCm, fromCm, angleToByte, byteToAngle,
} from '../../shared/world.js';
import { buildVillage } from './village.js';
import { Character, actTime, LAND } from './character.js';
import { LIFE, findTarget, findLife, buildLifeSpots } from './life.js';
import { createLookEditor } from './look-editor.js';
import { EQUIPMENT } from './villager/equipment.js';
import { createInput } from './input.js';
import { setCurveCenter, curveDrop } from './materials.js';
import { FX } from './fx.js';

const params = new URLSearchParams(location.search);
const LOW = params.get('q') === 'low';
// 실제 서버(HTTPS)에서는 같은 주소의 /colyseus 경로로 접속한다 (학교 방화벽 대비 443 포트만 사용)
// 내 컴퓨터 시험(HTTP)에서는 기존처럼 2567 포트로 접속한다
// (원격 main을 보여 주는 상시 서버는 VITE_GAME_PORT 로 다른 게임 서버 포트를 알려 준다: tools/live-server.cjs --main)
const SERVER = params.get('server')
  || (location.protocol === 'https:'
    ? `wss://${location.host}/colyseus`
    : `ws://${location.hostname}:${import.meta.env.VITE_GAME_PORT || 2567}`);
const SEND_INTERVAL = 0.1; // 초당 10회
const INTERP_DELAY = 150; // 다른 학생은 150ms 늦게 그림

// ── 저장 도우미 (사생활 보호 모드에서도 오류 없이) ──
const store = {
  get(s, k) { try { return s.getItem(k); } catch { return null; } },
  set(s, k, v) { try { s.setItem(k, v); } catch { /* 무시 */ } },
  del(s, k) { try { s.removeItem(k); } catch { /* 무시 */ } },
};

// ── 3D 기본 설정 ──
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOW, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, LOW ? 1 : 1.5)); // 태블릿 성능을 위해 최대 1.5배
const scene = new THREE.Scene();
// 하늘: 위는 맑은 하늘색, 지평선 쪽은 안개와 같은 파스텔색으로 번지는 그라데이션
const FOG_COLOR = 0xdcecf6;
const FOG_DENSITY = 0.0145;
scene.background = (() => {
  const cv = document.createElement('canvas');
  cv.width = 2;
  cv.height = 256;
  const g = cv.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#8fcfff');
  grd.addColorStop(0.55, '#c4e4fb');
  grd.addColorStop(1, '#dcecf6');
  g.fillStyle = grd;
  g.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
})();
// 거리 안개: 가까운 곳은 또렷하고 맵 가장자리로 갈수록 하늘과 자연스럽게 섞임
scene.fog = new THREE.FogExp2(FOG_COLOR, FOG_DENSITY);
scene.add(new THREE.HemisphereLight(0xfff6ec, 0x9cc98a, 1.65));
const sun = new THREE.DirectionalLight(0xfff3dc, 2.0); // 살짝 따뜻한 햇빛
sun.position.set(8, 15, 6);
scene.add(sun);
FX.init(scene);

const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 150);
const camTarget = new THREE.Vector3(0, 0, 3);
let camScale = 1;
// 시점: 마우스 왼쪽 끌기로 돌리기(yaw)·기울기(pitch), 휠로 거리(zoom). 처음 값은 예전 고정 시점과 같음
const cam = { yaw: 0, pitch: Math.atan2(12.5, 13.5), dist: Math.hypot(12.5, 13.5), zoom: 1 };
// 새로고침해도 카메라 각도·거리는 그대로 (이 탭에만 기억)
try { Object.assign(cam, JSON.parse(store.get(sessionStorage, 'cam') ?? '{}')); } catch { /* 처음 */ }
const saveCam = () => store.set(sessionStorage, 'cam', JSON.stringify({ yaw: cam.yaw, pitch: cam.pitch, zoom: cam.zoom }));
const camOffset = new THREE.Vector3();

function resize() {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camScale = camera.aspect < 1 ? 1.35 : 1; // 세로 화면이면 조금 더 멀리
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const village = buildVillage(scene, { low: LOW });

// ── 화면 요소 ──
const $id = (id) => document.getElementById(id);
const ui = {
  join: $id('join'), form: $id('join-form'), name: $id('name'), colors: $id('colors'),
  joinBtn: $id('join-btn'), error: $id('join-error'), hud: $id('hud'), people: $id('people'),
  fps: $id('fps'), actions: $id('actions'), hint: $id('hint'), reconnect: $id('reconnect'),
  toolBtn: $id('tool-btn'), lifeBtn: $id('life-btn'), quick: $id('quick'), toast: $id('toast'), inv: $id('inv-panel'), invBtn: $id('inv-btn'),
};
let toastTimer = 0;
function toast(text) {
  ui.toast.textContent = text;
  ui.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 1800);
}

let chosenColor = Number(store.get(localStorage, 'color') ?? Math.floor(Math.random() * COLORS.length)) % COLORS.length;
ui.name.value = store.get(localStorage, 'name') ?? '';
COLORS.forEach((c, i) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `swatch${i === chosenColor ? ' on' : ''}`;
  b.style.background = `#${c.toString(16).padStart(6, '0')}`;
  b.setAttribute('aria-label', `색 ${i + 1}`);
  b.onclick = () => {
    chosenColor = i;
    [...ui.colors.children].forEach((el, j) => el.classList.toggle('on', j === i));
  };
  ui.colors.appendChild(b);
});

// ── 게임 상태 ──
const client = new Client(SERVER);
let room = null;
let me = null; // 내 캐릭터
const others = new Map(); // sessionId → { char, buf }
// act: 지금 하는 잠깐 동작(ANIM 번호), actLeft: 남은 시간, tool: 지금 손에 든 도구 번호,
// equip: 퀵슬롯에서 고른 장비 번호 (생활 행동 중에는 그 일에 맞는 도구를 잠깐 들었다가, 끝나면 다시 이것으로 돌아온다)
const local = { sendTimer: 0, act: ANIM.IDLE, actLeft: 0, tool: 0, equip: 0, last: null, hurt: 0, lifeTimer: 0 };
// 휘두르기 시작 → 내려찍는 순간 (동작 길이 × hitAt): 1타 0.72초 × 0.5, 이어 치는 2타·3타 0.62초 × 0.5
const HIT_DELAY = { [ANIM.SMASH]: 360, [ANIM.SMASH2]: 310, [ANIM.SMASH3]: 310, [ANIM.SMASH_AIR]: 190, [ANIM.SMASH_SLAM]: 400, [ANIM.SMASH_DASH]: 300,
  [ANIM.SLASH1]: 282, [ANIM.SLASH2]: 232, [ANIM.SLASH3]: 264, [ANIM.SLASH4]: 282 }; // 목검: 동작 길이 × hitAt
// 연속 공격: 휘두르는 중에 또 누르면(또는 누르고 있으면) 다음 타로 이어진다. 1타 → 2타 → 3타 → 2타 → 3타 → …
// (3타는 2타에서 이어지도록 만든 1타. 2타와 3타가 서로의 끝 자세에서 시작해 끊기지 않고 8자를 그린다)
const NEXT_SWING = { [ANIM.SMASH]: ANIM.SMASH2, [ANIM.SMASH2]: ANIM.SMASH3, [ANIM.SMASH3]: ANIM.SMASH2,
  // 목검: 1타 → 2타 → 3타(찌르기) → 이어 치는 1타 → 2타 → …
  [ANIM.SLASH1]: ANIM.SLASH2, [ANIM.SLASH2]: ANIM.SLASH3, [ANIM.SLASH3]: ANIM.SLASH4, [ANIM.SLASH4]: ANIM.SLASH2 };
// 다음 타로 넘어가는 때(초): 휘두른 몽둥이가 관성 끝까지 간 직후, 왼손을 놓기 전
const COMBO_AT = { [ANIM.SMASH]: 0.47, [ANIM.SMASH2]: 0.405, [ANIM.SMASH3]: 0.405,
  // 목검: 칼이 관성 끝까지 간 순간 (손을 놓기 전)
  [ANIM.SLASH1]: 0.384, [ANIM.SLASH2]: 0.335, [ANIM.SLASH3]: 0.558, [ANIM.SLASH4]: 0.384 }; // 3타는 찌른 자세로 버틴 뒤에 이어진다
// 이어 하는 도끼질: 도끼가 나무에 박혀 멈춘 뒤에도 G를 누르고 있으면, 뽑아서 다시 찍는 동작으로 넘어간다
const NEXT_CHOP = { [ANIM.CHOP]: ANIM.CHOP2, [ANIM.CHOP2]: ANIM.CHOP3, [ANIM.CHOP3]: ANIM.CHOP2 };
const CHOP_AT = 0.72; // 넘어가는 때 (동작 길이의 비율): 박혀서 떨림이 잦아든 뒤, 손을 놓기 전
// 떠 있는 동안의 동작: 움직여도 끊기지 않는다
const AIRBORNE = new Set([ANIM.JUMP, ANIM.FLIP, ANIM.SMASH_AIR, ANIM.SMASH_SLAM]);
// 공격 동작: 하는 동안에는 방향키로 움직이지 못한다 (떠서 하는 공중 공격·내리찍기도 마찬가지)
const ATTACKS = new Set([ANIM.SMASH, ANIM.SMASH2, ANIM.SMASH3, ANIM.SMASH_AIR, ANIM.SMASH_SLAM, ANIM.SMASH_DASH,
  ANIM.SLASH1, ANIM.SLASH2, ANIM.SLASH3, ANIM.SLASH4]);
const DASH_SPEED = RUN_SPEED * 1.55; // 대시 공격으로 뛰어드는 빠르기 (내리친 뒤에는 멈춘다)
// 목검 3타(찌르기): 칼을 내지르는 동안(초) 앞으로 미끄러져 나간다. 가장 빠를 때 THRUST_SPEED, 모두 1m쯤 (팔을 쭉 펴고 크게 내디딘다)
const THRUST_STEP = [0.17, 0.33];
const THRUST_SPEED = 9.8; // 0.1초에 1m 안쪽이라 서버 이동 검사(0.1초에 1.3m)도 통과한다
// 더블 점프 내리찍기: 내려오며 찍는 동안(초) 보는 쪽으로 살짝 나아간다. 가장 빠를 때 SLAM_SPEED, 모두 0.55m쯤
// (제자리에 곧장 떨어지면 몸을 실어 찍는 느낌이 나지 않는다)
const SLAM_STEP = [0.42, 0.72];
const SLAM_SPEED = 2.9;
function getHit(fromX, fromZ) {
  local.act = ANIM.SURPRISE; // 'hit' 피격 모션
  local.actLeft = actTime(ANIM.SURPRISE);
  local.hurt = local.actLeft; // 맞는 동안은 움직여도 끊기지 않음
  me.setPose(me.x, me.z, Math.atan2(fromX - me.x, fromZ - me.z)); // 때린 쪽으로 돌아봄
}
// ── 타격 연출: 휘두르기·생활 행동의 '맞는 순간'(hitAt)에 불림 (내 캐릭터·다른 학생 모두) ──
// 히트스톱(내가 때리거나 맞을 때만) + 대상 흔들기 + 대상에 맞는 조각 파티클
function hitFx(char, action) {
  const slam = action === 'clubSlam';
  const thrust = action === 'swordSlash3'; // 찌르기는 앞으로 길고 좁게 맞는다
  if (/^clubSmash\d|^clubAir$|^clubSlam$|^clubDash$|^swordSlash\d$/.test(action)) action = 'clubSmash'; // 이어 치는 타·공중·대시 공격·목검도 타격 연출은 같다
  if (action === 'chopAgain' || action === 'chopAgain2') action = 'chop';
  const fx = Math.sin(char.targetRot);
  const fz = Math.cos(char.targetRot);
  const gy = char.groundY;
  const dir = [fx, fz];
  const at = (x, z, y = 0.6) => [x, gy + y, z];
  const burst = (kind, n, [x, y, z], opts = {}) => FX.burst(kind, n, x, y, z, { floor: gy, dir, spread: 1.4, ...opts });
  const spotIdx = (kind, x, z, reach) => LIFE_SPOTS.findIndex((s) => lifeSpots.length && s.kind === kind && Math.hypot(s.x - x, s.z - z) < reach);
  const shakeSpot = (i) => { const o = lifeSpotsMesh?.children[i]; if (o) FX.shake(o, fx, fz); };
  let strong = false;

  if (action === 'clubSmash' || action === 'chop') {
    // 몽둥이: 사람 → 바위 → 나무 → 땅 순서로 맞은 것을 찾는다 · 도끼: 나무
    const reach = thrust ? 1.9 : 0.95;
    const hx = char.x + fx * reach;
    const hz = char.z + fz * reach;
    const hits = thrust ? inThrust : inSwing;
    const victims = action === 'clubSmash' ? [me, ...[...others.values()].map((o) => o.char)].filter((c) => c && c !== char && hits(char.x, char.z, char.targetRot, c.x, c.z)) : [];
    const rock = action === 'clubSmash' ? village.nearRock(hx, hz, 0.7) : -1;
    const tree = village.nearTree(hx, hz, action === 'chop' ? 1.2 : 0.7);
    const spot = spotIdx('tree', hx, hz, 1.3);
    if (victims.length) {
      for (const v of victims) {
        v.shake();
        burst('star', 9, at(v.x, v.z, 1.35), { spread: Math.PI, power: 0.9 });
        burst('dust', 4, at(v.x, v.z, 0.9), { spread: Math.PI, power: 0.5 });
        if (v === me) strong = true;
      }
    } else if (rock >= 0) {
      const r = WORLD.rocks[rock];
      village.shakeRock(rock, fx, fz);
      const p = at(r.x - fx * r.r, r.z - fz * r.r, 0.45 * r.s);
      burst('stone', 10, p, { dir: [-fx, -fz] });
      burst('dust', 6, p, { spread: Math.PI, power: 0.7 });
    } else if (tree >= 0 || spot >= 0) {
      const t = tree >= 0 ? WORLD.trees[tree] : { ...LIFE_SPOTS[spot], r: 0.25, s: 0.85 };
      if (tree >= 0) village.shakeTree(tree, fx, fz, action === 'chop' ? 1 : 0.7);
      else shakeSpot(spot);
      // 나뭇조각은 맞은 자리에서 때린 사람 쪽으로 튀고, 잎은 위에서 팔랑팔랑
      burst('wood', 9, at(t.x - fx * t.r, t.z - fz * t.r, 0.6), { dir: [-fx, -fz] });
      burst('leaf', 7, at(t.x, t.z, 1.9 * t.s), { spread: Math.PI, power: 0.8 });
    } else {
      burst('dust', 10, at(hx, hz, 0.05), { ring: true, power: 1.1 });
      burst('stone', 4, at(hx, hz, 0.05), { spread: Math.PI, power: 0.6 });
    }
  } else if (action === 'gather') {
    const t = findTarget('none', char.x, char.z, lifeSpots) ?? { x: char.x + fx * 0.6, z: char.z + fz * 0.6 };
    burst('petal', 7, at(t.x, t.z, 0.3), { spread: Math.PI, power: 0.8 });
    burst('sparkle', 8, at(t.x, t.z, 0.45), { spread: Math.PI });
  } else if (action === 'fish') {
    const t = findTarget('rod', char.x, char.z, lifeSpots) ?? { x: char.x + fx * 1.5, z: char.z + fz * 1.5 };
    burst('splash', 14, at(t.x, t.z, 0), { spread: Math.PI, floor: gy - 0.1 });
    burst('star', 6, at(t.x, t.z, 0.8), { spread: Math.PI, power: 0.6 });
  }
  if (slam) { // 땅을 내리찍으면 발밑에서 먼지가 둥글게 퍼진다
    burst('dust', 14, at(char.x + fx * 0.6, char.z + fz * 0.6, 0.05), { ring: true, power: 1.5 });
    burst('stone', 6, at(char.x + fx * 0.6, char.z + fz * 0.6, 0.05), { spread: Math.PI, power: 0.9 });
  }
  if (char === me || strong) FX.hitstop(slam ? 0.08 : 0.05);
}
Character.onHit = (char, action) => hitFx(char, action);

const EMOTES = { emote1: ANIM.WAVE, emote2: ANIM.CHEER, emote3: ANIM.SURPRISE, emote4: ANIM.FAINT };
const TOOL_ICON = { none: '✋', axe: '🪓', rod: '🎣', club: '🏏', woodSword: '🗡️' };
const LIFE_ICON = { none: '🌼', axe: '🌳', rod: '🐟' };
const LIFE_LABEL = { none: '채집', axe: '벌목', rod: '낚시' };
const QUICK_SLOTS = 4;
let invItems = [1, 2, 4]; // 가방에 든 장비 번호 (맨손은 빼고). 목검(4)은 기본, 테스트 서버에선 나무 몽둥이(3)를 하나 더 줌
let lifeSpots = []; // 테스트 서버에서만 광장에 놓는 체험용 나무
let lifeSpotsMesh = null;
// 퀵슬롯: 칸마다 장비 번호 또는 null. Q 를 누르면 맨손 → 1칸 → 2칸 → … 차례로 바꿔 든다
const quick = (() => {
  try {
    const v = JSON.parse(store.get(localStorage, 'quick') ?? 'null');
    if (Array.isArray(v)) return Array.from({ length: QUICK_SLOTS }, (_, i) => (Number.isInteger(v[i]) && v[i] > 0 && v[i] < TOOLS.length ? v[i] : null));
  } catch { /* 저장된 값이 깨졌으면 처음부터 */ }
  return [3, 4, null, null]; // 처음에는 몽둥이를 1칸, 목검을 2칸에 넣어 둔다 (가방에 있을 때만 보인다)
})();
const saveQuick = () => store.set(localStorage, 'quick', JSON.stringify(quick));
const slotItem = (i) => (quick[i] !== null && invItems.includes(quick[i]) ? quick[i] : null); // 가방에 없는 장비는 빈칸으로 본다

function showTool() {
  const t = TOOLS[local.equip];
  ui.toolBtn.innerHTML = `${TOOL_ICON[t]}<span>Q 바꾸기</span>`;
}
// 생활 버튼: 가까이 있는 생활 대상에 맞춰 무엇을 할지 보여 준다
let lifeShown = '';
function showLife(tool) {
  const key = tool ?? '';
  if (key === lifeShown) return;
  lifeShown = key;
  ui.lifeBtn.innerHTML = tool ? `${LIFE_ICON[tool]}<span>G ${LIFE_LABEL[tool]}</span>` : '✨<span>G 생활</span>';
  ui.lifeBtn.classList.toggle('dim', !tool);
}
showLife(null);

// 손에 든 도구만 바꾼다 (생활 행동 때 잠깐 꺼내 드는 것)
function holdTool(t) {
  if (local.tool === t) return;
  local.tool = t;
  me?.setTool(t);
}
// 장비를 고른다 (퀵슬롯·Q·가방)
function equipTool(t) {
  if (local.actLeft > 0) return;
  local.equip = t;
  holdTool(t);
  showTool();
  renderQuick();
  renderInv();
}
// Q: 맨손과 퀵슬롯에 넣은 장비를 차례로 돌려 든다
function nextQuick() {
  const list = [0, ...quick.map((_, i) => slotItem(i)).filter((t) => t !== null)];
  if (list.length === 1) { toast('가방(I)에서 장비를 퀵슬롯에 넣어 보세요'); return; }
  const i = list.indexOf(local.equip);
  equipTool(list[(i + 1) % list.length]);
}
function renderQuick() {
  ui.quick.innerHTML = '';
  for (let i = 0; i < QUICK_SLOTS; i++) {
    const t = slotItem(i);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = t !== null && t === local.equip ? 'on' : t === null ? 'empty' : '';
    b.title = t === null ? '빈칸 (가방에서 장비를 넣을 수 있어요)' : EQUIPMENT[TOOLS[t]].label;
    b.innerHTML = `<small>${i + 1}</small>${t === null ? '' : TOOL_ICON[TOOLS[t]]}`;
    // 든 장비 칸을 다시 누르면 내려놓고 맨손이 된다
    b.onclick = () => { if (t === null) ui.inv.classList.remove('hidden'); else equipTool(t === local.equip ? 0 : t); };
    ui.quick.appendChild(b);
  }
  const q = document.createElement('span');
  q.className = 'quick-key';
  q.textContent = 'Q';
  ui.quick.appendChild(q);
}
// 가방: 장비를 누르면 퀵슬롯에 넣고, 이미 넣은 장비를 누르면 뺀다
function renderInv() {
  ui.inv.innerHTML = '<h3>🎒 인벤토리 <small>(I)</small></h3><p class="inv-help">장비를 누르면 퀵슬롯에 넣거나 뺍니다. 생활 도구는 G를 누르면 알아서 꺼내 들어요.</p>';
  const row = document.createElement('div');
  row.className = 'look-row';
  for (const t of invItems) {
    const slot = quick.findIndex((v, i) => v === t && slotItem(i) === t);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = slot >= 0 ? 'on' : '';
    b.textContent = `${TOOL_ICON[TOOLS[t]]} ${EQUIPMENT[TOOLS[t]].label}${slot >= 0 ? ` · ${slot + 1}칸` : ''}`;
    b.onclick = () => {
      if (slot >= 0) {
        quick[slot] = null;
        if (local.equip === t) equipTool(0);
      } else {
        const empty = quick.findIndex((_, i) => slotItem(i) === null);
        if (empty < 0) { toast('퀵슬롯이 가득 찼어요. 넣어 둔 장비를 눌러 빼 주세요'); return; }
        quick[empty] = t;
      }
      saveQuick();
      renderQuick();
      renderInv();
    };
    row.appendChild(b);
  }
  ui.inv.appendChild(row);
}
showTool();
renderQuick();
renderInv();

// 마우스가 가리키는 땅 위 지점을 내 캐릭터에서 바라보는 방향 (마우스가 없거나 너무 가까우면 null)
const aimRay = new THREE.Raycaster();
const aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const aimHit = new THREE.Vector3();
function aimRot() {
  const p = input.pointer;
  if (!p || !me) return null;
  const r = canvas.getBoundingClientRect();
  aimRay.setFromCamera(new THREE.Vector2(((p.x - r.left) / r.width) * 2 - 1, -((p.y - r.top) / r.height) * 2 + 1), camera);
  aimPlane.constant = -me.groundY; // 내 발밑 높이의 평면
  if (!aimRay.ray.intersectPlane(aimPlane, aimHit)) return null;
  const dx = aimHit.x - me.x;
  const dz = aimHit.z - me.z;
  return Math.hypot(dx, dz) < 0.25 ? null : Math.atan2(dx, dz);
}

function startAct(a) {
  if (local.actLeft > 0) return; // 하던 동작이 끝나야 다음 동작
  local.act = a;
  local.actLeft = actTime(a);
}

const input = createInput({
  onAction(name) {
    if (!me) return;
    if (name === 'jump') {
      // 더블 점프: 떠 있는 동안 한 번 더 누르면 앞으로 공중제비
      const up = actTime(ANIM.JUMP) - local.actLeft;
      if (local.act === ANIM.JUMP && local.actLeft > 0 && up > 0.12 && up < 0.7) {
        local.act = ANIM.FLIP;
        local.actLeft = actTime(ANIM.FLIP);
      } else startAct(ANIM.JUMP);
    }
    else if (EMOTES[name] !== undefined) startAct(EMOTES[name]);
    else if (name === 'tool') {
      nextQuick();
    } else if (name === 'inv') {
      ui.inv.classList.toggle('hidden');
    } else if (name === 'attack') {
      // 한 번 누르면 한 번만 휘두른다: 휘두르는 중에 또 눌러도 다음 타를 예약하지 않는다 (이어 치기는 꾹 누르고 있을 때만)
      if (local.hurt > 0) return;
      if (TOOLS[local.tool] === 'woodSword') {
        // 목검은 한 손으로 베기만 한다 (공중·대시 공격 없이 그 자리에서). 계속 누르면 아래에서 다음 타로 이어진다
        if (local.actLeft > 0) return;
        const rot = aimRot();
        if (rot !== null) me.setPose(me.x, me.z, rot);
        startAct(ANIM.SLASH1);
        return;
      }
      if (TOOLS[local.tool] !== 'club') return;
      const el = actTime(local.act) - local.actLeft; // 지금 동작이 흐른 시간
      const rot = aimRot(); // 마우스가 가리키는 땅 쪽으로 돌아서서 휘두른다 (터치·화면 버튼은 보던 방향 그대로)
      if (local.act === ANIM.JUMP && local.actLeft > 0 && el > 0.08 && el < 0.5) {
        // 공중 공격: 뛰어오른 높이를 그대로 이어받아 공중에서 휘두른다 (길이가 점프와 같아 남은 시간도 그대로)
        if (rot !== null) me.setPose(me.x, me.z, rot);
        local.act = ANIM.SMASH_AIR;
      } else if (local.act === ANIM.FLIP && local.actLeft > 0 && el < 0.5) {
        // 더블 점프 뒤 공격: 착지하며 땅을 내리찍는다
        if (rot !== null) me.setPose(me.x, me.z, rot);
        local.act = ANIM.SMASH_SLAM;
        local.actLeft = actTime(ANIM.SMASH_SLAM) - el;
      } else if (local.actLeft <= 0) {
        const inp = input.read();
        if (inp.run && inp.mag > 0) startAct(ANIM.SMASH_DASH); // 달리던 방향 그대로 뛰어들며 내리친다
        else {
          if (rot !== null) me.setPose(me.x, me.z, rot);
          startAct(ANIM.SMASH);
        }
      }
    } else if (name === 'life') {
      // 손에 무엇을 들었든, 가장 가까운 생활 대상에 맞는 도구를 꺼내 들고 한다 (끝나면 고른 장비로 돌아온다)
      if (local.actLeft > 0) return;
      const t = findLife(me.x, me.z, lifeSpots);
      if (!t) { toast('나무·물가·꽃 가까이에서 G를 눌러 보세요'); return; }
      holdTool(TOOLS.indexOf(t.tool));
      me.setPose(me.x, me.z, Math.atan2(t.x - me.x, t.z - me.z)); // 대상 쪽으로 돌아섬
      startAct(LIFE[t.tool].anim);
    }
  },
  onOrbit(dx, dy) {
    cam.yaw -= dx * 0.006;
    cam.pitch = THREE.MathUtils.clamp(cam.pitch + dy * 0.004, 0.3, 1.3);
    saveCam();
  },
  onZoom(dy) {
    cam.zoom = THREE.MathUtils.clamp(cam.zoom * Math.exp(dy * 0.0012), 0.4, 1.6);
    saveCam();
  },
});

let lookSendTimer = 0;
const lookEditor = createLookEditor({
  panel: $id('look-panel'),
  button: $id('look-btn'),
  getColor: () => me?.colorIndex ?? chosenColor,
  onChange(look) {
    store.set(localStorage, 'look', JSON.stringify(look));
    me?.setLook(look);
    // 여러 번 연달아 고르면 마지막 것만 보냄 (서버는 너무 잦은 변경을 무시)
    clearTimeout(lookSendTimer);
    lookSendTimer = setTimeout(() => room?.send('look', look), 300);
  },
});
function parseLook(v) { try { return JSON.parse(v || '{}'); } catch { return {}; } }
lookEditor.set(parseLook(store.get(localStorage, 'look')));

function setPeople() {
  ui.people.textContent = `접속 ${room ? room.state.players.size : 0}명`;
}

function clearPlayers() {
  for (const o of others.values()) o.char.dispose();
  others.clear();
  if (me) { me.dispose(); me = null; }
}

function attach(r) {
  room = r;
  store.set(sessionStorage, 'reconnect', r.reconnectionToken);
  const $ = getStateCallbacks(r);

  $(r.state).players.onAdd((p, id) => {
    if (id === r.sessionId) {
      me = new Character(p.name, p.color, parseLook(p.look));
      me.setTool(local.tool);
      me.setPose(fromCm(p.x), fromCm(p.z), byteToAngle(p.r));
      me.root.rotation.y = me.targetRot;
      scene.add(me.root);
      camTarget.set(me.x, 0, me.z);
      local.last = null;
    } else {
      const char = new Character(p.name, p.color, parseLook(p.look));
      char.setTool(p.t);
      char.setPose(fromCm(p.x), fromCm(p.z), byteToAngle(p.r));
      char.root.rotation.y = char.targetRot;
      scene.add(char.root);
      const o = { char, buf: [] };
      others.set(id, o);
      const push = () => {
        const t = performance.now();
        const last = o.buf[o.buf.length - 1];
        // 오래 멈춰 있다가 다시 움직이면, 직전 위치를 "방금 전"으로 다시 찍어 순간이동을 막음
        if (last && t - last.t > 200) o.buf.push({ ...last, t: t - 100 });
        o.buf.push({ t, x: fromCm(p.x), z: fromCm(p.z), r: byteToAngle(p.r), a: p.a });
        if (o.buf.length > 30) o.buf.shift();
        char.setTool(p.t);
      };
      push();
      $(p).onChange(push);
      $(p).listen('look', (v, prev) => { if (prev !== undefined) char.setLook(parseLook(v)); });
    }
    setPeople();
  });

  $(r.state).players.onRemove((p, id) => {
    const o = others.get(id);
    if (o) { o.char.dispose(); others.delete(id); }
    setPeople();
  });

  // 테스트 서버: 외형 꾸미기 + 광장 가운데 생활 체험 요소
  // (입장 직후에는 상태가 아직 안 왔을 수 있어 값이 들어올 때 반영)
  $(r.state).listen('freeLook', (v) => {
    const free = !!v;
    lookEditor.show(free);
    lifeSpots = free ? LIFE_SPOTS : [];
    invItems = free ? [1, 2, 3, 4] : [1, 2, 4];
    if (local.equip && !invItems.includes(local.equip)) equipTool(0);
    renderQuick();
    renderInv();
    if (free && !lifeSpotsMesh) lifeSpotsMesh = buildLifeSpots(scene);
  });

  // 마을 주된 과일: 과일나무에 그 과일이 열린다
  $(r.state).listen('fruit', (v) => village.setFruit(v));

  // 서버가 이상한 이동이라고 판단하면 되돌림
  r.onMessage('fix', ([x, z]) => {
    if (!me) return;
    me.setPose(fromCm(x), fromCm(z), me.targetRot);
    local.last = null;
  });

  r.onLeave((code) => {
    room = null;
    if (code === 1000 || code === 4000) return; // 스스로 나간 경우
    tryReconnect();
  });
}

// 한 번 들어온 탭은 새로고침하거나 서버가 다시 켜져도 입장 화면 없이 그대로 돌아온다 (클래스 아레나처럼).
// 1) 원래 자리가 아직 남아 있으면(와이파이가 잠깐 끊김·새로고침) 그 자리로 다시 접속
// 2) 서버가 다시 켜져 자리가 없어졌으면, 기억해 둔 이름·색·외형·위치로 새로 들어간다
// 3) 둘 다 안 되면(서버가 켜지는 중·인터넷 끊김) 2초마다 다시 해 본다
function joinVillage(spot = null) {
  const name = (store.get(localStorage, 'name') ?? ui.name.value).trim().slice(0, 10);
  return client.joinOrCreate('village', { name, color: chosenColor, look: lookEditor.look, ...(spot ? { spot } : {}) });
}
function savedSpot() {
  try { return JSON.parse(store.get(sessionStorage, 'spot') ?? 'null'); } catch { return null; }
}
// 돌아오기: 다시 접속했으면 'back', 새로 들어갔으면 'rejoined'
async function resume() {
  input.enable(false);
  // 바로 돌아오면(새로고침) "연결이 끊겼어요" 안내는 띄우지 않는다
  const notice = setTimeout(() => ui.reconnect.classList.remove('hidden'), 800);
  try {
    return await retryResume();
  } finally {
    clearTimeout(notice);
  }
}
async function retryResume() {
  for (;;) {
    const token = store.get(sessionStorage, 'reconnect');
    if (token) {
      try {
        const r = await client.reconnect(token);
        clearPlayers();
        attach(r);
        return 'back';
      } catch { /* 자리가 없어졌거나 아직 연결이 안 됨 */ }
    }
    try {
      const r = await joinVillage(savedSpot());
      clearPlayers();
      attach(r);
      return 'rejoined';
    } catch {
      await new Promise((ok) => setTimeout(ok, 2000));
    }
  }
}
function resumed() {
  ui.reconnect.classList.add('hidden');
  enterGame();
}

async function tryReconnect() {
  const how = await resume();
  // 서버가 다시 켜졌다 = 새 버전이 올라왔을 수 있다: 화면도 새로 불러 새 코드를 받는다
  // (방금 잡은 자리로 곧바로 다시 접속하고, 위치·카메라는 기억해 둔 그대로라 화면이 그대로 이어진다)
  if (how === 'rejoined') { location.reload(); return; }
  resumed();
}

function enterGame() {
  ui.join.classList.add('hidden');
  ui.hud.classList.remove('hidden');
  ui.actions.classList.remove('hidden');
  ui.hint.classList.remove('hidden');
  ui.invBtn.classList.remove('hidden');
  ui.quick.classList.remove('hidden');
  input.enable(true);
}

ui.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = ui.name.value.trim().slice(0, 10);
  if (!name) return;
  store.set(localStorage, 'name', name);
  store.set(localStorage, 'color', String(chosenColor));
  ui.joinBtn.disabled = true;
  ui.error.textContent = '';
  try {
    store.del(sessionStorage, 'spot'); // 입장 화면에서 새로 들어가면 광장에서 시작
    const r = await joinVillage();
    attach(r);
    store.set(sessionStorage, 'joined', '1');
    enterGame();
  } catch (err) {
    console.error(err);
    ui.error.textContent = '서버에 연결하지 못했어요. 서버가 켜져 있는지 확인해 주세요.';
  } finally {
    ui.joinBtn.disabled = false;
  }
});

// 화면을 닫거나 다른 곳으로 갈 때: 서버에 알려 내 캐릭터가 오래 남아 있지 않게 (새로고침이면 곧바로 돌아온다)
addEventListener('pagehide', () => { try { room?.send('bye'); } catch { /* 이미 끊김 */ } });

// 새로고침·화면 꺼짐·서버 재시작 뒤에는 입장 화면 없이 자동으로 원래 자리로 돌아감 (이 탭에서 한 번 들어왔으면)
// (새로고침 때는 위에서 자리를 비우므로, 기억해 둔 이름·외형·위치로 새로 들어간다)
if (store.get(sessionStorage, 'joined') && store.get(localStorage, 'name')) {
  ui.join.classList.add('hidden');
  resume().then(resumed);
}

// ── 내 캐릭터 움직이기 ──
function updateMe(dt) {
  const inp = input.read();
  let anim = ANIM.IDLE;
  if (local.hurt > 0) local.hurt -= dt;
  // 공격하는 동안은 방향키로 움직이지 못한다. 동작이 스스로 나아가는 만큼만 보는 쪽으로 움직인다:
  // 대시 공격은 뛰어들었다가 내리친 뒤 멈추고, 목검 찌르기와 더블 점프 내리찍기는 정해진 구간에만 살짝 나아간다
  if (ATTACKS.has(local.act) && local.actLeft > 0) {
    const sec = actTime(local.act) - local.actLeft;
    const glide = ([s0, s1], top) => (sec > s0 && sec < s1 ? top * Math.sin(Math.PI * (sec - s0) / (s1 - s0)) : 0);
    let speed = 0;
    if (local.act === ANIM.SMASH_DASH) speed = DASH_SPEED * (1 - THREE.MathUtils.smoothstep(sec / actTime(ANIM.SMASH_DASH), 0.35, 0.6));
    else if (local.act === ANIM.SLASH3) speed = glide(THRUST_STEP, THRUST_SPEED);
    else if (local.act === ANIM.SMASH_SLAM) speed = glide(SLAM_STEP, SLAM_SPEED);
    if (speed > 0 && local.hurt <= 0) {
      const extra = lifeSpots.length ? [...LIFE_COLLIDERS] : [];
      for (const { char } of others.values()) extra.push({ x: char.x, z: char.z, r: PLAYER_RADIUS });
      const [nx, nz] = resolveMove(me.x, me.z, me.x + Math.sin(me.targetRot) * speed * dt, me.z + Math.cos(me.targetRot) * speed * dt, extra);
      me.setPose(nx, nz, me.targetRot);
    }
  } else if (inp.mag > 0 && local.hurt <= 0) {
    // 화면 기준 방향을 카메라가 돈 만큼 돌려 땅 위 방향으로
    const c = Math.cos(cam.yaw);
    const sn = Math.sin(cam.yaw);
    const wx = inp.x * c + inp.z * sn;
    const wz = -inp.x * sn + inp.z * c;
    const speed = inp.run ? RUN_SPEED : WALK_SPEED * Math.max(0.45, inp.mag);
    const extra = lifeSpots.length ? [...LIFE_COLLIDERS] : [];
    for (const { char } of others.values()) extra.push({ x: char.x, z: char.z, r: PLAYER_RADIUS });
    const [nx, nz] = resolveMove(me.x, me.z, me.x + wx * speed * dt, me.z + wz * speed * dt, extra);
    me.setPose(nx, nz, Math.atan2(wx, wz));
    anim = inp.run ? ANIM.RUN : ANIM.WALK;
    if (!AIRBORNE.has(local.act)) local.actLeft = 0; // 움직이면 감정 표현·생활 행동은 멈춤 (점프는 뛰면서도 가능)
    else if (local.actLeft > 0) {
      // 달리며 뛰었으면 발이 닿자마자 바로 다시 달린다: 착지 뒤 일어서는 자세를 끝까지 틀면 쪼그린 채로 미끄러져 끊겨 보인다
      const land = local.act === ANIM.JUMP ? LAND.jump : LAND.flip;
      // 공중제비는 무릎을 굽혀 받아 내는 모습이 보이도록 조금 더 둔다
      if (actTime(local.act) - local.actLeft >= land + (local.act === ANIM.FLIP ? 0.1 : 0.04)) local.actLeft = 0;
    }
  }
  // 몽둥이를 들고 Z·마우스 왼쪽을 꾹 누르고 있으면 계속 휘두른다. 한 번 눌렀다 떼면 한 번만 휘두른다:
  // 다음 타로 넘어갈지는 미리 예약하지 않고, 넘어가는 그 순간에도 키를 누르고 있는지로 정한다
  // (누른 순간부터 예약하면 짧게 한 번 눌러도 키가 눌려 있던 몇 장면 때문에 2타가 따라 나온다)
  const weapon = TOOLS[local.tool];
  const holdSwing = (weapon === 'club' || weapon === 'woodSword') && input.holding('attack') && local.hurt <= 0;
  if (holdSwing && local.actLeft <= 0) {
    const rot = aimRot();
    if (rot !== null) me.setPose(me.x, me.z, rot);
    startAct(weapon === 'club' ? ANIM.SMASH : ANIM.SLASH1);
  } else if (holdSwing && NEXT_SWING[local.act]) {
    // 넘어가는 때: 휘두른 몽둥이가 관성 끝까지 간 직후의 짧은 구간 (왼손을 놓은 뒤에 넘어가면 동작이 튄다)
    const at = actTime(local.act) - local.actLeft - COMBO_AT[local.act];
    if (at >= 0 && at < 0.06) {
      const rot = aimRot();
      if (rot !== null) me.setPose(me.x, me.z, rot); // 그때마다 마우스 쪽으로 다시 돌아선다
      local.act = NEXT_SWING[local.act];
      local.actLeft = actTime(local.act);
    }
  }
  // 도끼를 들고 G를 누르고 있으면 계속 찍는다: 나무에 박혀 멈춘 도끼를 뽑아 다시 뒤로 보냈다가 또 찍는다
  if (TOOLS[local.tool] === 'axe' && input.holding('life') && local.hurt <= 0) {
    if (local.actLeft <= 0) {
      const t = findTarget('axe', me.x, me.z, lifeSpots);
      if (t) {
        me.setPose(me.x, me.z, Math.atan2(t.x - me.x, t.z - me.z));
        startAct(ANIM.CHOP);
      }
    } else if (NEXT_CHOP[local.act]) {
      const at = actTime(local.act) * (1 - CHOP_AT) - local.actLeft; // 넘어가는 때를 지난 시간
      if (at >= 0 && at < 0.06) {
        local.act = NEXT_CHOP[local.act];
        local.actLeft = actTime(local.act);
      }
    }
  }
  // 생활 행동이 끝나면 잠깐 꺼내 든 도구를 넣고 고른 장비를 다시 든다
  if (local.actLeft <= 0 && local.tool !== local.equip) holdTool(local.equip);
  // 생활 버튼 글자: 가까이 있는 대상에 맞춰 가끔 바꾼다
  local.lifeTimer -= dt;
  if (local.lifeTimer <= 0) {
    local.lifeTimer = 0.2;
    showLife(findLife(me.x, me.z, lifeSpots)?.tool ?? null);
  }
  if (local.actLeft > 0) {
    local.actLeft -= dt;
    anim = local.act;
  }
  me.setAnim(anim);

  // 움직임이 있을 때만 초당 10회 전송
  local.sendTimer += dt;
  if (local.sendTimer >= SEND_INTERVAL && room) {
    local.sendTimer = 0;
    const msg = [toCm(me.x), toCm(me.z), angleToByte(me.targetRot), anim, local.tool];
    const l = local.last;
    if (!l || msg.some((v, i) => v !== l[i])) {
      room.send('m', msg);
      local.last = msg;
      // 서버가 다시 켜져 새로 들어갈 때 이 자리·방향으로 돌아오도록 기억 (이 탭에만)
      store.set(sessionStorage, 'spot', JSON.stringify({ x: me.x, z: me.z, r: msg[2] }));
    }
  }
}

// ── 다른 학생: 150ms 늦게 그리면서 사이를 채움 ──
function updateOthers(now) {
  const renderT = now - INTERP_DELAY;
  for (const o of others.values()) {
    const { char, buf } = o;
    const prevAnim = char.anim;
    while (buf.length >= 2 && buf[1].t <= renderT) buf.shift();
    const a = buf[0];
    const b = buf[1];
    if (!a) continue;
    if (b && a.t <= renderT) {
      const k = Math.min(1, (renderT - a.t) / Math.max(1, b.t - a.t));
      char.setPose(a.x + (b.x - a.x) * k, a.z + (b.z - a.z) * k, b.r);
      char.setAnim(a.a === ANIM.IDLE && (b.x !== a.x || b.z !== a.z) ? ANIM.WALK : a.a);
    } else {
      char.setPose(a.x, a.z, a.r);
      char.setAnim(a.a);
    }
    // 휘두르기 시작을 보면 내려찍는 순간에 내가 앞에 있는지 확인
    if (HIT_DELAY[char.anim] && char.anim !== prevAnim) { o.hitAt = now + HIT_DELAY[char.anim]; o.hitAnim = char.anim; }
    if (o.hitAt && now >= o.hitAt) {
      o.hitAt = 0;
      if (me && (o.hitAnim === ANIM.SLASH3 ? inThrust : inSwing)(char.x, char.z, char.targetRot, me.x, me.z)) getHit(char.x, char.z);
    }
  }
}

// 개발 중 점검용 (그리기 횟수 등 확인)
// step: 화면이 가려져 그리기가 멈춘 동안에도 내 캐릭터만 정해진 시간만큼 움직여 보는 점검용
if (import.meta.env.DEV) window.__game = { renderer, scene, camera, others, cam, local, input, FX, get me() { return me; }, get room() { return room; }, step(dt) { updateMe(dt); me?.update(dt); } };

// ── 매 장면 ──
const clock = new THREE.Clock();
let fpsFrames = 0;
let fpsTime = 0;

renderer.setAnimationLoop(() => {
  const realDt = Math.min(clock.getDelta(), 0.05);
  const now = performance.now();
  // 히트스톱: 맞는 순간 아주 잠깐 캐릭터·파티클을 멈춰 '퍽' 하는 손맛을 준다 (카메라·풍경은 계속)
  const dt = FX.simDt(realDt);
  village.update(realDt, now / 1000);

  if (me) updateMe(dt);
  updateOthers(now);

  // 카메라는 비스듬히 내려다보며 부드럽게 따라감
  if (me) camTarget.lerp(new THREE.Vector3(me.x, 0, me.z), Math.min(1, dt * 5));
  else camTarget.set(Math.sin(now / 6000) * 6, 0, 3 + Math.cos(now / 6000) * 4); // 입장 전: 천천히 둘러보기
  const d = cam.dist * camScale * cam.zoom;
  camOffset.set(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch));
  camera.position.copy(camTarget).addScaledVector(camOffset, d);
  camera.lookAt(camTarget.x, 0.8, camTarget.z);
  // 멀리 볼수록 안개를 옅게 (멀리 빼도 내 주변이 뿌옇게 되지 않게)
  scene.fog.density = FOG_DENSITY / Math.max(1, cam.zoom * camScale);
  setCurveCenter(camTarget.x, camTarget.z, cam.yaw);
  // 둥근 지평선의 중심을 정한 뒤에 캐릭터를 내린다 (한 프레임 늦으면 걸을 때 발이 땅과 어긋남)
  if (me) me.update(dt);
  for (const { char } of others.values()) char.update(dt);
  FX.update(dt);

  for (const label of village.labels) {
    const b = label.userData.base;
    label.position.set(b.x, b.y - curveDrop(b.x, b.z), b.z);
  }

  renderer.render(scene, camera);

  fpsFrames++;
  fpsTime += realDt;
  if (fpsTime >= 0.5) {
    ui.fps.textContent = `${Math.round(fpsFrames / fpsTime)} FPS`;
    fpsFrames = 0;
    fpsTime = 0;
  }
});
