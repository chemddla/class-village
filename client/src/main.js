// 우리 반 마을 - 1단계 시제품 (이동 + 동시 접속)
import * as THREE from 'three';
import { Client, getStateCallbacks } from 'colyseus.js';
import {
  ANIM, COLORS, TOOLS, LIFE_SPOTS, WORLD, LIFE_COLLIDERS, PLAYER_RADIUS, WALK_SPEED, RUN_SPEED, resolveMove, isBlocked, inSwing, inThrust, inDive, toCm, fromCm, angleToByte, byteToAngle,
  ARROW, BOLT, PORTALS, PORTAL, inField, FIELD_MONSTERS, FIELD_MAP, BUGS, BUG_BY_ID, NET_CATCH, solidAt, WOODS, WOOD_BY_ID, DIG_HOLE, DIG_AHEAD, groundKind, ROCKS_GONE, STONES, STONE_BY_ID, TOOL_DURABILITY, FRUITS, FRUIT_NAMES, VILLAGE_FRUIT, BAG_MAX, GRAB_REACH, FISH, FISH_BY_ID, RARITY, waterAt, BOB_AHEAD, NOTICE, NIBBLE_MS, levelOf, statsOf, abilitiesOf, WEAPON_STAT, STAT_NAMES, JOBS, JOB_LEVEL, canWield,
  SKILLS, SKILL_TYPES, inStrike,
} from '../../shared/world.js';
import { buildVillage, fishModel, bugModel, treePerch } from './village.js';
import { buildField } from './field.js';
import { Character, actTime, LAND, BOW_SLAM_LAND } from './character.js';
import { BOW_PITCH, BOW_STRIKE, DIVE, DASH_RATE, DAGGER_CHARGE, bowDrawn } from './villager/actions.js';
import { LIFE, findTarget, findLife, findFruit, buildLifeSpots, fruitLeft, bugSpots } from './life.js';
import { createLookEditor } from './look-editor.js';
import { createMinimap } from './minimap.js';
import { EQUIPMENT } from './villager/equipment.js';
import { createInput } from './input.js';
import { setCurveCenter, curveDrop, HOLE } from './materials.js';
import { FX } from './fx.js';
import { createPlazaMonsters } from './monsters/plaza-monsters.js';
import { createArrows } from './arrows.js';

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
// 다른 학생은 200ms 늦게 그림: 내가 보내는 때(0.1초)와 서버가 묶어 보내는 때(0.1초)가 엇갈리면 소식이 0.2초 만에 오기도 해서,
// 이보다 짧으면 그때마다 잠깐 멈췄다가 튄다
const INTERP_DELAY = 200;

// ── 저장 도우미 (사생활 보호 모드에서도 오류 없이) ──
const store = {
  get(s, k) { try { return s.getItem(k); } catch { return null; } },
  set(s, k, v) { try { s.setItem(k, v); } catch { /* 무시 */ } },
  del(s, k) { try { s.removeItem(k); } catch { /* 무시 */ } },
};

// ── 3D 기본 설정 ──
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOW, powerPreference: 'high-performance', stencil: true }); // stencil: 삽으로 판 구덩이 속을 땅 아래로 그리기
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
const RECENTER_RATE = 5; // V 로 등 뒤로 돌아갈 때 스프링 세기 (약 0.6초)
// 새로고침해도 카메라 각도·거리는 그대로 (이 탭에만 기억)
try { Object.assign(cam, JSON.parse(store.get(sessionStorage, 'cam') ?? '{}')); } catch { /* 처음 */ }
// 마우스 끌기·휠은 여기(목표)만 바꾸고 cam 은 장면마다 스르르 따라간다: 마우스 신호는 장면과 박자가 안 맞아 바로 넣으면 툭툭 끊긴다
const camGoal = { yaw: cam.yaw, pitch: cam.pitch, zoom: cam.zoom };
const CAM_EASE = 14; // 클수록 손을 바로 따라옴 (1/s)
const saveCam = () => store.set(sessionStorage, 'cam', JSON.stringify(camGoal));
const camOffset = new THREE.Vector3();
const camWant = new THREE.Vector3();

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
const field = buildField(scene, { low: LOW }); // 들판(저렙 사냥터): 마을과 멀리 떨어진 곳, 포탈로 오간다

// ── 화면 요소 ──
const $id = (id) => document.getElementById(id);
const ui = {
  join: $id('join'), form: $id('join-form'), name: $id('name'), colors: $id('colors'),
  joinBtn: $id('join-btn'), error: $id('join-error'), hud: $id('hud'), people: $id('people'),
  fps: $id('fps'), actions: $id('actions'), hint: $id('hint'), reconnect: $id('reconnect'),
  hp: $id('hp-bar'), mp: $id('mp-bar'), xp: $id('xp-bar'),
  toolBtn: $id('tool-btn'), lifeBtn: $id('life-btn'), pickBtn: $id('pick-btn'), quick: $id('quick'), toast: $id('toast'), inv: $id('inv-panel'), invBtn: $id('inv-btn'),
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
// 방향키가 가리키는 땅 위 방향의 기준 각도. V 로 맞추는 동안은 도착할 각도를 써서, 카메라가 도는 동안 캐릭터가 따라 돌지 않게
const moveYaw = () => local.recenter ?? cam.yaw;
const local = { dodge: -1, dodgeRot: 0, sendTimer: 0, act: ANIM.IDLE, actLeft: 0, tool: 0, equip: 0, last: null, hurt: 0, lifeTimer: 0, picked: null, fishing: null };
// 휘두르기 시작 → 내려찍는 순간 (동작 길이 × hitAt): 1타 0.72초 × 0.5, 이어 치는 2타·4타 0.62초 × 0.5, 3타(야구 스윙) 0.78초 × 0.5
const HIT_DELAY = { [ANIM.SMASH]: 360, [ANIM.SMASH2]: 310, [ANIM.SMASH3]: 390, [ANIM.SMASH4]: 310, [ANIM.SMASH_AIR]: 190, [ANIM.SMASH_SLAM]: 400, [ANIM.SMASH_DASH]: 300,
  [ANIM.SLASH1]: 282, [ANIM.SLASH2]: 232, [ANIM.SLASH3]: 264, [ANIM.SLASH4]: 282, // 목검: 동작 길이 × hitAt
  [ANIM.SLASH_AIR]: 190, [ANIM.SLASH_SLAM]: 400, [ANIM.SLASH_DASH]: 300, // 목검 공중·내려베기·대시 (몽둥이와 같은 때)
  [ANIM.DAGGER1]: 184, [ANIM.DAGGER2]: 136, [ANIM.DAGGER3]: 207, [ANIM.DAGGER5]: 168, [ANIM.DAGGER4]: 184, // 나무 단검: 짧고 빠르게
  [ANIM.DAGGER_AIR]: 150, [ANIM.DAGGER_AIR2]: 120, [ANIM.DAGGER_DASH2]: 120 / DASH_RATE, [ANIM.DAGGER_SLAM]: (DIVE.raise + DIVE.time / DIVE.rate) * 1000 + 20, [ANIM.DAGGER_DASH]: 360 / DASH_RATE, // 단검 점프 베기 · 내려가며 베기(착지 때) · 대시 베기
  [ANIM.STRIKE_CLUB]: 546, [ANIM.STRIKE_SWORD]: 500, [ANIM.STRIKE_DAGGER]: 260 + DAGGER_CHARGE.sec * 1000 }; // 강타: 몽둥이(1.02초 × 0.535) · 목검(1초 × 0.5) · 단검(0.62초 × 0.42 + 아래에서 기 모으는 시간)
// 연속 공격: 휘두르는 중에 또 누르면(또는 누르고 있으면) 다음 타로 이어진다. 1타 → 2타 → 3타 → 4타 → 2타 → 3타 → …
// (3타는 야구 배트처럼 수평으로 크게 휘두르고, 4타는 3타에서 이어지도록 만든 1타. 서로의 끝 자세에서 시작해 끊기지 않는다)
const NEXT_SWING = { [ANIM.SMASH]: ANIM.SMASH2, [ANIM.SMASH2]: ANIM.SMASH3, [ANIM.SMASH3]: ANIM.SMASH4, [ANIM.SMASH4]: ANIM.SMASH2,
  // 목검: 1타 → 2타 → 3타(찌르기) → 이어 치는 1타 → 2타 → …
  [ANIM.SLASH1]: ANIM.SLASH2, [ANIM.SLASH2]: ANIM.SLASH3, [ANIM.SLASH3]: ANIM.SLASH4, [ANIM.SLASH4]: ANIM.SLASH2,
  // 나무 단검: 가로 베기 → 되베기 → 내려찍기 → 올려 베기(4타, DAGGER5) → 이어 치는 1타(DAGGER4) → 2타 → …
  [ANIM.DAGGER1]: ANIM.DAGGER2, [ANIM.DAGGER2]: ANIM.DAGGER3, [ANIM.DAGGER3]: ANIM.DAGGER5, [ANIM.DAGGER5]: ANIM.DAGGER4, [ANIM.DAGGER4]: ANIM.DAGGER2 };
// 다음 타로 넘어가는 때(초): 휘두른 몽둥이가 관성 끝까지 간 직후, 왼손을 놓기 전
const COMBO_AT = { [ANIM.SMASH]: 0.47, [ANIM.SMASH2]: 0.405, [ANIM.SMASH3]: 0.55, [ANIM.SMASH4]: 0.405, // 3타는 크게 휘둘러 끝까지 넘긴 뒤에 이어진다
  // 목검: 칼이 관성 끝까지 간 순간 (손을 놓기 전)
  [ANIM.SLASH1]: 0.384, [ANIM.SLASH2]: 0.335, [ANIM.SLASH3]: 0.558, [ANIM.SLASH4]: 0.384, // 3타는 찌른 자세로 버틴 뒤에 이어진다
  [ANIM.DAGGER1]: 0.322, [ANIM.DAGGER2]: 0.204, [ANIM.DAGGER3]: 0.285, [ANIM.DAGGER5]: 0.24, [ANIM.DAGGER4]: 0.322 }; // 단검: 휘두른 끝 자세에 닿자마자
// 이어 하는 도끼질: 도끼가 나무에 박혀 멈춘 뒤에도 G를 누르고 있으면, 뽑아서 다시 찍는 동작으로 넘어간다
const NEXT_CHOP = { [ANIM.CHOP]: ANIM.CHOP2, [ANIM.CHOP2]: ANIM.CHOP3, [ANIM.CHOP3]: ANIM.CHOP2 };
const CHOP_AT = 0.72; // 넘어가는 때 (동작 길이의 비율): 박혀서 떨림이 잦아든 뒤, 손을 놓기 전
// 떠 있는 동안의 동작: 움직여도 끊기지 않는다
// 활: 공격키를 누르고 있는 동안 조준(BOW_AIM), 떼면 쏜다(BOW_SHOT). 하는 동안 방향키로는 걷지 않고 돌아서기만 한다
const BOWS = new Set([ANIM.BOW_AIM, ANIM.BOW_SHOT]);
const MIN_DRAW = 0.4; // 화살을 메기고 시위를 당기기까지 걸리는 시간(초): 짧게 눌렀다 떼도 이만큼 당긴 뒤에 쏜다
const REDRAW_AT = 0.3; // 쏘고 나서 이만큼(초) 지나면 다음 화살을 당길 수 있다
const AIRBORNE = new Set([ANIM.JUMP, ANIM.FLIP, ANIM.SMASH_AIR, ANIM.SMASH_SLAM, ANIM.SLASH_AIR, ANIM.SLASH_SLAM, ANIM.BOW_AIR, ANIM.BOW_SLAM, ANIM.DAGGER_AIR, ANIM.DAGGER_SLAM, ANIM.DAGGER_AIR2]);
// 공격 동작: 하는 동안에는 방향키로 움직이지 못한다 (떠서 하는 공중 공격·내리찍기도 마찬가지)
const ATTACKS = new Set([ANIM.SMASH, ANIM.SMASH2, ANIM.SMASH3, ANIM.SMASH4, ANIM.SMASH_AIR, ANIM.SMASH_SLAM, ANIM.SMASH_DASH,
  ANIM.SLASH1, ANIM.SLASH2, ANIM.SLASH3, ANIM.SLASH4, ANIM.SLASH_AIR, ANIM.SLASH_SLAM, ANIM.SLASH_DASH,
  ANIM.BOW_AIR, ANIM.BOW_SLAM, ANIM.BOW_BACK, ANIM.STAFF_CAST, ANIM.STAFF_CHARGE, ANIM.STAFF_FIRE, ANIM.STAFF_BIG, // 활 점프·더블 점프·달리기 공격 · 지팡이
  ANIM.DAGGER1, ANIM.DAGGER2, ANIM.DAGGER3, ANIM.DAGGER4, ANIM.DAGGER5, ANIM.DAGGER_AIR, ANIM.DAGGER_SLAM, ANIM.DAGGER_DASH, ANIM.DAGGER_AIR2, ANIM.DAGGER_DASH2,
  ANIM.STRIKE_CLUB, ANIM.STRIKE_SWORD, ANIM.STRIKE_DAGGER, ANIM.STRIKE_BOW, ANIM.STRIKE_BOW_SHOT, ANIM.STRIKE_STAFF]); // 강타 스킬
// 강타: 휘두르는 동안 보는 쪽으로 힘차게 나아간다 ([시작, 끝](초), 가장 빠를 때 m/초. 서버 이동 검사 0.1초에 1.3m 안쪽)
// 몽둥이 0.6m쯤 · 목검 0.65m쯤(숙이며 크게 베어 내린다) · 단검 0.5m쯤(뛰어오르며)
const STRIKE_STEP = { [ANIM.STRIKE_CLUB]: [[0.42, 0.62], 4.5], [ANIM.STRIKE_SWORD]: [[0.42, 0.6], 5], [ANIM.STRIKE_DAGGER]: [[0.2 + DAGGER_CHARGE.sec, 0.38 + DAGGER_CHARGE.sec], 4] }; // 단검은 웅크려 기를 모으는 동안은 제자리, 일어서며 베어 올릴 때 뛰어나간다
const DASH_SPEED = RUN_SPEED * 1.55; // 대시 공격으로 뛰어드는 빠르기 (내리친 뒤에는 멈춘다)
const DODGE = { speed: RUN_SPEED * 1.05, time: 0.4, cool: 0.3 }; // Space 회피 구르기: 방향키 쪽(없으면 정면)으로 구르며 나아가는 빠르기·시간 (speed는 서버 허용 거리 1.6배 안으로)
// 목검 3타(찌르기): 칼을 내지르는 동안(초) 앞으로 미끄러져 나간다. 가장 빠를 때 THRUST_SPEED, 모두 1m쯤 (팔을 쭉 펴고 크게 내디딘다)
const THRUST_STEP = [0.17, 0.33];
const THRUST_SPEED = 9.8; // 0.1초에 1m 안쪽이라 서버 이동 검사(0.1초에 1.3m)도 통과한다
// 더블 점프 내리찍기: 내려오며 찍는 동안(초) 보는 쪽으로 살짝 나아간다. 가장 빠를 때 SLAM_SPEED, 모두 0.55m쯤
// (제자리에 곧장 떨어지면 몸을 실어 찍는 느낌이 나지 않는다)
const SLAM_STEP = [0.42, 0.72];
// 점프·더블 점프 공격 중 방향키를 누르고 있을 때 앞으로 나아가는 빠르기 (걷기·달리기 빠르기의 배수)
const AIR_ATTACK_BOOST = 1.3;
const BOW_AIM_TURN = 1.4; // 활을 당기는 동안·지팡이로 기를 모으는 동안 방향키로 돌아서는 빠르기(라디안/초): 느려서 조금씩 맞출 수 있다
const JUMP_ATTACK_BOOST = 0.8; // 점프 공격만 따로: 너무 멀리 날아가지 않게 걷기·달리기보다 조금 느리게
const SLAM_SPEED = 2.9;
// 단검 더블 점프 공격: 누르면 DIVE.raise 초 동안 공중에서 치켜든 뒤, DIVE.time 초 동안 보는 쪽 앞 아래로 이 빠르기로 내려간다 (모두 2m쯤, 서버 이동 검사 0.1초에 1.3m 안쪽)
const DIVE_SPEED = 10.5;
const AIR_COMBO_AT = 0.24; // 단검 점프 공격 1타를 누른 뒤 벤 끝 자세에 닿는 때(초): 여기서 2타로 넘어간다
const DASH_COMBO_AT = 0.5 / DASH_RATE; // 단검 대시 공격 1타가 벤 끝 자세에 닿는 때(초): 여기서 2타로 넘어간다
// 더블 점프 뒤 공격 시작: 공중제비가 흐른 시간(el)에서 이어받는다
function startSlam(anim, el) {
  local.act = anim;
  local.actLeft = actTime(anim) - el;
  local.diveFrom = el; // 단검: 여기서부터 DIVE.raise 동안 치켜들고, 이어서 DIVE.time 동안 앞 아래로 내려간다
}
// 땅에서 휘두르는 타(몽둥이 1~4타, 목검 1·2·4타): 타격 직전부터 직후까지(0.25초) 보는 쪽으로 SWING_STEP(m)만큼 살짝 나아간다
const STEP_SWINGS = new Set([ANIM.SMASH, ANIM.SMASH2, ANIM.SMASH3, ANIM.SMASH4, ANIM.SLASH1, ANIM.SLASH2, ANIM.SLASH4]);
const SWING_STEP = 0.3;
// 체력·마나 (내 화면에서만 셈)
// 마나: 대시 공격·더블 점프 내리찍기에 쓰고 천천히 찬다
const STAT = { max: 100, hit: 10 }; // 회복·치명타 같은 나머지는 레벨에 따른 능력치(ab)
const BASE_AB = abilitiesOf(statsOf(1)); // 다른 학생이 친 것은 기본값으로 보여 준다
let ab = BASE_AB; // 내 능력치 (레벨이 오르면 다시 계산: showXp)
const stats = { hp: STAT.max, mp: STAT.max };
const ghost = { hp: { v: STAT.max, hold: 0 }, mp: { v: STAT.max, hold: 0 } };
// 모자라서 못 썼을 때 그 줄을 떨어 보인다
function statShort(k) {
  const row = ui[k];
  row.classList.remove('short');
  void row.offsetWidth; // 연달아 눌러도 다시 떨리게
  row.classList.add('short');
}
function useMana(n) {
  if (stats.mp < n) { statShort('mp'); toast('마나가 모자라요'); return false; }
  stats.mp -= n;
  return true;
}
// 경험치 줄: 오르면 머리 위에 +XP, 레벨이 오르면 알려 준다 (prev 가 없으면 처음 들어온 것)
let myXp = 0;
let myJob = ''; // 직업 (서버가 정함, 비어 있으면 모험가)
function showXp(total, prev) {
  const { lv, xp, need } = levelOf(total);
  myXp = total;
  ab = abilitiesOf(statsOf(lv, myJob));
  renderInfo();
  renderSkills();
  ui.xp.querySelector('i').style.width = `${(xp / need) * 100}%`;
  ui.xp.querySelector('em').textContent = lv;
  ui.xp.title = `경험치 ${xp} / ${need}`;
  if (prev === undefined || total <= prev || !me) return;
  FX.damage(`+${total - prev} XP`, me.x, me.groundY + 2.2, me.z, '#ffd45e');
  if (lv > levelOf(prev).lv) {
    toast(lv === JOB_LEVEL && !myJob ? `🎉 Lv ${lv}! 이제 전직할 수 있어요` : `🎉 레벨 업! 이제 Lv ${lv}`);
    FX.burst('star', 14, me.x, me.groundY + 1.6, me.z, { floor: me.groundY, spread: Math.PI, power: 1 });
  }
}
function updateStats(dt) {
  stats.hp = Math.min(ab.hpMax, stats.hp + ab.hpRegen * dt);
  stats.mp = Math.min(ab.mpMax, stats.mp + ab.mpRegen * dt);
  for (const k of ['hp', 'mp']) {
    // 잔상: 줄어든 자리에 잠깐(0.4초) 머물렀다가 빠르게 따라 내려온다 (차오를 때는 바로 같이)
    const g = ghost[k];
    if (stats[k] >= g.v) { g.v = stats[k]; g.hold = 0.4; }
    else if ((g.hold -= dt) < 0) g.v = Math.max(stats[k], g.v - 90 * dt);
    const row = ui[k];
    const fill = row.querySelector('i');
    const max = k === 'hp' ? ab.hpMax : ab.mpMax;
    const w = `${(stats[k] / max) * 100}%`;
    if (fill.style.width !== w) fill.style.width = w;
    const gw = `${(g.v / max) * 100}%`;
    const gb = row.querySelector('b');
    if (gb.style.width !== gw) gb.style.width = gw;
    const n = String(Math.floor(stats[k]));
    const em = row.querySelector('em');
    if (em.textContent !== n) em.textContent = n;
    row.classList.toggle('low', stats[k] < max * 0.25);
  }
}
// 치명타·빗나감: 맞힐 때마다 굴려 피해 배수를 정한다 (0 = 빗나감)
// mine: 내가 친 것이면 내 능력치(빗나감·치명타), 아니면 기본값
function rollHit(mine = false) {
  const a = mine ? ab : BASE_AB;
  const r = Math.random();
  return r < a.miss ? 0 : r < a.miss + a.crit ? a.critMult : 1;
}
// 내가 몬스터를 칠 때 공격력 배수 (stat: 무기가 쓰는 스텟). 남이 친 것은 1
const atkMul = (mine, stat) => (mine ? ab.attack[stat] / STAT.hit : 1);
const meleeStat = () => WEAPON_STAT[TOOLS[local.tool]] ?? 'str';
// 피해 숫자: 하얀색, 빗나가면 '빗나감', 치명타면 노란색 큰 숫자에 '!'
function showDamage(base, k, x, y, z) {
  if (!k) FX.damage('빗나감', x, y, z, '#d8d0c4');
  else if (k > 1) FX.damage(`${Math.round(base * k)}!`, x, y, z, '#ffe14d', true);
  else FX.damage(Math.round(base), x, y, z, '#ffffff');
}
// power: 피해 배수 (지팡이로 기를 다 모아 쏜 큰 볼은 BOLT.big)
function getHit(fromX, fromZ, power = 1) {
  const k = rollHit();
  if (me) showDamage(STAT.hit * power, k, me.x, me.groundY + 1.9, me.z);
  if (!k) return; // 빗나가면 안 아프고 움찔하지도 않는다
  stats.hp = Math.max(0, stats.hp - STAT.hit * power * k);
  if (stats.hp <= 0) { // 다 닳으면 벌러덩 쓰러졌다가 다시 꽉 찬다
    stats.hp = ab.hpMax;
    local.act = ANIM.FAINT;
    local.actLeft = local.hurt = actTime(ANIM.FAINT);
    return;
  }
  ouch(fromX, fromZ);
}
// 맞았다: 때린 쪽으로 돌아보며 아파하는 표정으로 움찔. 짧은 시간에 자꾸 맞으면 발을 동동 구르며 화낸다
// (내 동작이 다른 학생 화면에도 그대로 보여, 아파하는 얼굴·화내는 모습을 모두가 본다)
const ANGRY_HITS = 3; // ANGRY_WINDOW 초 안에 이만큼 맞으면 화낸다
const ANGRY_WINDOW = 8;
function ouch(fromX, fromZ) {
  const now = performance.now();
  local.hits = (local.hits ?? []).filter((t) => now - t < ANGRY_WINDOW * 1000);
  local.hits.push(now);
  const angry = local.hits.length >= ANGRY_HITS;
  if (angry) local.hits = [];
  if (local.fishing) stopFishing();
  local.act = angry ? ANIM.ANGRY : ANIM.HURT;
  local.actLeft = actTime(local.act);
  local.hurt = local.actLeft; // 맞는 동안은 움직여도 끊기지 않음
  me.setPose(me.x, me.z, Math.atan2(fromX - me.x, fromZ - me.z)); // 때린 쪽으로 돌아봄
  // 머리 위 말풍선으로 외친다 (모두에게 보이게 서버로도 보냄)
  const line = angry ? ANGRY_LINE : OUCH_LINE;
  me.say(line, angry ? 2.5 : 1.5);
  room?.send('say', line);
  return angry;
}
const OUCH_LINE = '아야!';
const ANGRY_LINE = '그만 때려! 😠';
// 다른 학생이 맞는 것을 내 화면에서 봤다: 그 학생이 보낸 동작이 도착하기 전에 바로 아파하는 얼굴·'아야!'
// (그 학생 화면에서 자꾸 맞아 화를 내면, 도착한 동작·말풍선이 이것을 바꿔 준다)
function predictOuch(v) {
  if (v.anim === ANIM.ANGRY && v.actLeft > 0) return;
  v.forceAnim(ANIM.HURT, 0.6);
  v.say(OUCH_LINE, 1.5);
}
// ── 타격 연출: 휘두르기·생활 행동의 '맞는 순간'(hitAt)에 불림 (내 캐릭터·다른 학생 모두) ──
// 히트스톱(내가 때리거나 맞을 때만) + 대상 흔들기 + 대상에 맞는 조각 파티클
function hitFx(char, action) {
  // 활: 시위를 놓는 순간 화살이 날아간다 (맞는 건 arrowHit). 점프·더블 점프 공격은 대각선 아래로
  // 조준했다 쏘는 화살(bowRelease)만 시위를 당긴 정도를 따른다: 덜 당기면 가다가 떨어지고 덜 정확하다 (점프·달리기 공격은 늘 끝까지 당겨 쏜다)
  if (action === 'bowRelease' || action === 'bowAir' || action === 'bowSlam' || action === 'bowBack') { arrows.shoot(char, char === me, BOW_PITCH[action] ?? 0, false, action === 'bowRelease' ? char.bowPower ?? 1 : 1); return; }
  if (action === 'bowStrikeShot') { // 활 강타: 끝까지 당겨 곧게 쏘고, 더 아프며 하나를 꿰뚫는다
    arrows.shoot(char, char === me, 0, false, 1, { pierce: SKILLS.strike.pierce, dmg: SKILLS.strike.power });
    const fx = Math.sin(char.targetRot);
    const fz = Math.cos(char.targetRot);
    FX.burst('star', 10, char.x + fx * 0.7, char.groundY + 1.2, char.z + fz * 0.7, { floor: char.groundY, dir: [fx, fz], spread: 0.9, power: 1.1 });
    return;
  }
  if (action === 'staffBolt' || action === 'staffFire' || action === 'staffBig') { arrows.shoot(char, char === me, 0, true, action === 'staffBig' ? BOLT.big : 1); return; } // 지팡이 끝에서 에너지 볼 (다 모아 쏘면 크게)
  const slam = action === 'clubSlam' || action === 'swordSlam';
  const strike = /^(club|sword|dagger)Strike$/.test(action) ? SKILLS.strike : null; // 강타 스킬: 더 멀리·넓게, 더 세게
  const power = strike?.power ?? 1;
  const thrust = action === 'swordSlash3'; // 찌르기는 앞으로 길고 좁게 맞는다
  const dive = action === 'daggerSlam'; // 단검 더블 점프 공격: 내려온 길 전체가 맞는다
  if (/^clubSmash\d|^clubAir$|^clubSlam$|^clubDash$|^swordSlash\d$|^swordAir$|^swordSlam$|^swordDash$|^daggerStab\d$|^daggerAir2?$|^daggerSlam$|^daggerDash2?$|Strike$/.test(action)) action = 'clubSmash'; // 이어 치는 타·공중·대시 공격·목검도 타격 연출은 같다
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
    const reach = thrust ? 1.9 : dive ? 0.6 : strike ? 1.15 : 0.95;
    const hx = char.x + fx * reach;
    const hz = char.z + fz * reach;
    const hits = strike ? inStrike : thrust ? inThrust : dive ? inDive : inSwing;
    const victims = action === 'clubSmash' ? [me, ...[...others.values()].map((o) => o.char)].filter((c) => c && c !== char && hits(char.x, char.z, char.targetRot, c.x, c.z)) : [];
    const rock = action === 'clubSmash' ? village.nearRock(hx, hz, 0.7) : -1;
    const tree = village.nearTree(hx, hz, action === 'chop' ? 1.2 : 0.7);
    const spot = spotIdx('tree', hx, hz, 1.3);
    // 몬스터: 휘두른 범위 안에 있는 것은 모두 맞는다 (한 번 휘둘러 여럿)
    const monHits = action === 'clubSmash' ? hereMonsters().map((m) => { const k = rollHit(char === me); const h = m.tryHit(char.x, char.z, (bx, bz) => hits(char.x, char.z, char.targetRot, bx, bz), char === me, k * atkMul(char === me, meleeStat()) * power); return h && { ...h, k }; }).filter(Boolean) : [];
    if (char === me) for (const m of monHits) if (m.dead) room?.send('kill');
    // 곤충: 휘두른 범위 안에 있으면 놀라 날아간다 (내가 휘둘렀을 때만 서버에 알림)
    if (action === 'clubSmash' && char === me) spookBugs((b) => b.y - gy < 2.2 && hits(char.x, char.z, char.targetRot, b.x, b.z));
    if (victims.length || monHits.length) {
      for (const v of victims) {
        v.shake();
        if (v !== me) predictOuch(v); // 사람끼리는 데미지 없이 움찔만
        burst('star', 9, at(v.x, v.z, 1.35), { spread: Math.PI, power: 0.9 });
        burst('dust', 4, at(v.x, v.z, 0.9), { spread: Math.PI, power: 0.5 });
        if (v === me) strong = true;
      }
      // 깃털이 빠지고 찌부되는 건 몬스터가 직접 하고, 여기서는 맞은 자리마다 별만 튀긴다
      for (const m of monHits) { if (m.k) burst('star', 8, at(m.x, m.z, m.y), { spread: Math.PI, power: 0.8 }); showDamage(STAT.hit * atkMul(char === me, meleeStat()) * power, m.k, m.x, gy + m.y + 0.5, m.z); }
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
      // 도끼로 찍은 순간: (내 캐릭터면) 서버에 알려 목재가 하나 밑동에 떨어진다 (광장 체험용 나무는 -(번호+1))
      if (action === 'chop' && char === me) {
        room?.send('chop', tree >= 0 ? tree : -spot - 1);
        wearTool('axe');
      }
      // 나뭇조각은 맞은 자리에서 때린 사람 쪽으로 튀고, 잎은 위에서 팔랑팔랑
      burst('wood', 9, at(t.x - fx * t.r, t.z - fz * t.r, 0.6), { dir: [-fx, -fz] });
      burst('leaf', 7, at(t.x, t.z, 1.9 * t.s), { spread: Math.PI, power: 0.8 });
    } else {
      burst('stone', 4, at(hx, hz, 0.05), { spread: Math.PI, power: 0.6 });
    }
  } else if (action === 'netSwing' || action === 'netHigh' || action === 'netLow') {
    // 다 쓸고 난 순간: (내 캐릭터면) 그물 테가 지나간 길을 서버에 보내, 그 길에 걸린 곤충을 잡는다
    if (char === me && !local.netSent) {
      local.netSent = true;
      room?.send('swing', (char.netPath ?? []).map((p) => p.map((v) => Math.round(v * 100))));
      wearTool('net');
    }
    burst('leaf', 4, at(char.x + fx * 1.3, char.z + fz * 1.3, 0.4), { spread: Math.PI, power: 0.5 });
  } else if (action === 'dig' || action === 'fill') {
    // 삽날이 땅에 꽂히는 순간: (내 캐릭터면) 서버에 파기·덮기·바위 치기를 알린다. 흙(모래)·돌 조각이 튄다
    const px = char.x + fx * DIG_AHEAD;
    const pz = char.z + fz * DIG_AHEAD;
    const pend = char === me ? local.shovel : null;
    if (pend) {
      local.shovel = null;
      wearTool('shovel');
      if (pend.dig) room?.send('dig', [toCm(pend.x), toCm(pend.z)]);
      else if (pend.fill) room?.send('fill', pend.fill);
      else if (pend.rock !== undefined) {
        room?.send('smash', pend.rock);
        village.shakeRock(pend.rock, fx, fz, 1.2);
      }
    }
    const rock = action === 'fill' ? -1 : pend?.rock ?? (onField ? -1 : village.nearRock(px, pz, 0.5));
    if (action === 'fill') {
      // 덮기: 흙(모래)이 구덩이로 쏟아지며 먼지가 퐁
      const h = pend?.fill ? holes.get(pend.fill) : null;
      burst('dust', 12, at(h?.x ?? px, h?.z ?? pz, 0.05), { ring: true, power: 0.8 });
      burst('wood', 5, at(h?.x ?? px, h?.z ?? pz, 0.15), { spread: Math.PI, power: 0.4 }); // 흙덩이
    } else if (rock >= 0) {
      const r = WORLD.rocks[rock];
      burst('stone', 9, at(r.x - fx * r.r, r.z - fz * r.r, 0.4 * r.s), { dir: [-fx, -fz], spread: 1.6 });
      burst('dust', 5, at(r.x - fx * r.r, r.z - fz * r.r, 0.3), { spread: Math.PI, power: 0.6 });
    } else {
      burst('dust', 10, at(px, pz, 0.08), { spread: Math.PI, power: 0.8 });
      burst('wood', 4, at(px, pz, 0.1), { spread: Math.PI, power: 0.5 }); // 흙덩이
    }
  } else if (action === 'angry') {
    // 화나서 발을 구르는 순간 발밑에 먼지가 퐁
    burst('dust', 8, at(char.x, char.z, 0.05), { ring: true, power: 0.7 });
  } else if (action === 'treeShake') {
    // 줄기를 잡은 순간: (내 캐릭터면) 서버에 흔들기를 알려 과일이 떨어지게 하고, 잎이 우수수
    const pend = char === me ? local.picked : null;
    if (pend?.shake !== undefined) { local.picked = null; room?.send('shake', pend.shake); }
    burst('leaf', 9, at(char.x + fx * 1.0, char.z + fz * 1.0, 2.0), { spread: Math.PI, power: 0.8 });
  } else if (action === 'pocket') {
    // 떨어진 과일을 집는 순간: (내 캐릭터면) 서버에 알려 과일이 손에 맞춰 사라지고 가방에 들어간다
    const pend = char === me && local.picked?.grab !== undefined ? local.picked : null;
    if (pend) {
      local.picked = null;
      const f = drops.get(pend.grab)?.f;
      const w = WOOD_BY_ID[f] ?? STONE_BY_ID[f];
      room?.send('grab', pend.grab);
      if (w) toast(`${STONE_BY_ID[f] ? '🪨' : '🪵'} ${eul(w.name)} 주웠다! ${stars(w.rarity)} ${RARITY[w.rarity].name}`);
    }
    burst('sparkle', 8, at(char.x + fx * 0.45, char.z + fz * 0.45, 0.25), { spread: Math.PI });
  } else if (action === 'gather') {
    const t = findTarget('none', char.x, char.z, lifeSpots) ?? { x: char.x + fx * 0.6, z: char.z + fz * 0.6 };
    burst('petal', 7, at(t.x, t.z, 0.3), { spread: Math.PI, power: 0.8 });
    burst('sparkle', 8, at(t.x, t.z, 0.45), { spread: Math.PI });
  } else if (action === 'fish') {
    const t = findTarget('rod', char.x, char.z, lifeSpots) ?? { x: char.x + fx * 1.5, z: char.z + fz * 1.5 };
    burst('splash', 14, at(t.x, t.z, 0), { spread: Math.PI, floor: gy - 0.1 });
    burst('star', 6, at(t.x, t.z, 0.8), { spread: Math.PI, power: 0.6 });
  }
  if (strike) { // 강타: 맞은 자리에서 별이 크게 터진다
    const r = thrust ? 1.6 : 1.0;
    burst('star', 14, at(char.x + fx * r, char.z + fz * r, 0.9), { spread: Math.PI, power: 1.3 });
  }
  if (slam) { // 땅을 내리찍으면 돌 조각이 튄다 (먼지는 내지 않는다)
    burst('stone', 6, at(char.x + fx * 0.6, char.z + fz * 0.6, 0.05), { spread: Math.PI, power: 0.9 });
  }
  // 멈칫(히트스톱)은 무언가를 세게 때리는 동작(몽둥이·목검·도끼)에만: 잠자리채·낚시·채집·줍기에 넣으면 렉처럼 보인다
  if ((char === me || strong) && (action === 'clubSmash' || action === 'chop')) FX.hitstop(strike ? 0.11 : slam ? 0.08 : 0.05);
}
Character.onHit = (char, action) => hitFx(char, action);

// 내 공격에 맞은 곤충을 서버에 알려 놀라 날아가게 한다. test(곤충 자리 {x, y, z}) 가 true 인 것 모두
// (화살은 날아가는 동안 매 순간 묻으므로, 한 번 알린 곤충은 다시 보내지 않는다)
const spookedBugs = new Set();
function spookBugs(test) {
  const ids = [...bugSpots].filter(([id, b]) => !spookedBugs.has(id) && test(b)).map(([id]) => id);
  if (!ids.length || !room) return;
  for (const id of ids) spookedBugs.add(id);
  room.send('spook', ids);
}

// 날아가는 화살이 무언가에 맞았는지: 사람(쏜 사람 빼고) → 몬스터 순서. 맞았으면 true (화살은 사라진다)
const ARROW_HIT_R = 0.4; // 화살촉이 이만큼(m) 안으로 들어오면 맞음 (사람·몬스터 몸 둘레)
function arrowHit(a, from, mine) {
  const { x, y, z } = a.tip;
  // 화살·마법 볼이 곤충 곁을 스치면 놀라 날아간다 (곤충은 작아서 화살을 멈추지는 않는다)
  if (mine) spookBugs((b) => Math.hypot(b.x - x, b.y - y, b.z - z) < (a.bolt ? 0.6 : 0.5));
  if (a.bolt) return boltTouches(a, from); // 마법 볼은 닿기만 보고, 맞히는 것은 터질 때 둘레 모두 (boltBurst)
  const bx = x - a.dir.x; // 날아온 쪽 (맞은 쪽이 그 반대로 밀리고, 그쪽을 돌아본다)
  const bz = z - a.dir.z;
  const burst = (kind, n, px, py, pz, opts = {}) => FX.burst(kind, n, px, py, pz, { floor: py - 1, dir: [a.dir.x, a.dir.z], spread: Math.PI, ...opts });
  // 꿰뚫는 화살(활 강타)은 맞힌 대상을 기억해 두고 그대로 날아가, 꿰뚫는 횟수를 다 쓴 다음 대상에서 멈춘다
  const done = () => { if (a.pierce > 0) { a.pierce--; return false; } return true; };
  for (const c of [me, ...[...others.values()].map((o) => o.char)]) {
    if (!c || c === from || a.struck.has(c) || Math.hypot(c.x - x, c.z - z) > ARROW_HIT_R || y > c.groundY + 1.7) continue;
    a.struck.add(c);
    c.shake();
    burst('star', 8, c.x, c.groundY + 1.3, c.z, { power: 0.8 });
    // 사람끼리는 데미지 없이 움찔만 (체력은 그대로)
    if (c !== me) predictOuch(c);
    else if (local.dodge <= 0 && local.hurt <= 0) { ouch(bx, bz); FX.hitstop(0.05); } // 구르는 중에는 피한다
    return done();
  }
  const k = rollHit(mine);
  const dmg = atkMul(mine, 'dex') * a.dmg;
  let m = null;
  for (const mon of hereMonsters()) {
    if (a.struck.has(mon)) continue;
    m = mon.tryHit(bx, bz, (mx, mz) => Math.hypot(mx - x, mz - z) < ARROW_HIT_R, mine, k * dmg);
    if (m) { a.struck.add(mon); break; }
  }
  if (!m) return false;
  if (mine && m.dead) room?.send('kill');
  if (k) burst('star', a.dmg > 1 ? 14 : 8, m.x, from.groundY + m.y, m.z, { power: a.dmg > 1 ? 1.2 : 0.8 });
  showDamage(STAT.hit * dmg, k, m.x, from.groundY + m.y + 0.5, m.z);
  if (mine && k) FX.hitstop(a.dmg > 1 ? 0.08 : 0.04);
  return done();
}
// 마법 볼이 사람·몬스터에 닿았는지만 본다 (몬스터는 맞는지 묻기만 하고 맞히지는 않는다: hits 가 늘 false)
function boltTouches(a, from) {
  const { x, y, z } = a.tip;
  for (const c of [me, ...[...others.values()].map((o) => o.char)]) {
    if (c && c !== from && Math.hypot(c.x - x, c.z - z) <= ARROW_HIT_R * a.size && y <= c.groundY + 1.7) return true;
  }
  let touched = false;
  for (const mon of hereMonsters()) mon.tryHit(x, z, (mx, mz) => { touched ||= Math.hypot(mx - x, mz - z) < ARROW_HIT_R * a.size; return false; });
  return touched;
}
// 조준선이 멈출 자리: 화살촉이 (x, y, z) 에 오면 무엇에 맞는지만 본다 (arrowHit 과 같은 둘레, 맞히지는 않음)
// 'person'(나 빼고 다른 학생) · 'monster' · 없으면 null
function arrowWouldHit(x, y, z) {
  for (const { char: c } of others.values()) {
    if (Math.hypot(c.x - x, c.z - z) <= ARROW_HIT_R && y <= c.groundY + 1.7) return 'person';
  }
  let touched = false;
  for (const mon of hereMonsters()) mon.tryHit(x, z, (mx, mz) => { touched ||= Math.hypot(mx - x, mz - z) < ARROW_HIT_R; return false; });
  return touched ? 'monster' : null;
}
// 마법 볼이 터진 자리 둘레(BOLT.splash) 안의 사람·몬스터가 모두 맞는다 (쏜 사람 빼고). 터진 자리에서 바깥으로 밀린다
// 기를 다 모아 쏜 큰 볼(a.size = BOLT.big)은 둘레도 피해도 그 배수만큼
function boltBurst(a, at) {
  const { from, mine } = a;
  const R = BOLT.splash * a.size; // 다 모아 쏜 큰 볼은 터지는 둘레도 크다
  if (mine) spookBugs((b) => Math.hypot(b.x - at.x, b.y - at.y, b.z - at.z) < R + 0.3); // 터진 둘레의 곤충도 놀라 날아감
  const star = (px, py, pz, dx, dz) => FX.burst('star', 8, px, py, pz, { floor: py - 1, dir: [dx, dz], spread: Math.PI, power: 0.8 });
  for (const c of [me, ...[...others.values()].map((o) => o.char)]) {
    if (!c || c === from || Math.hypot(c.x - at.x, c.z - at.z) > R || at.y > c.groundY + 1.7 + R) continue;
    c.shake();
    star(c.x, c.groundY + 1.3, c.z, c.x - at.x, c.z - at.z);
    // 사람끼리는 데미지 없이 움찔만 (체력은 그대로)
    if (c !== me) predictOuch(c);
    else if (local.dodge <= 0 && local.hurt <= 0) { ouch(at.x, at.z); FX.hitstop(0.05); } // 구르는 중에는 피한다
  }
  let any = false;
  for (const mon of hereMonsters()) {
    const k = rollHit(mine);
    const m = mon.tryHit(at.x, at.z, (mx, mz) => Math.hypot(mx - at.x, mz - at.z) < R, mine, a.size * k * atkMul(mine, 'int'));
    if (mine && m?.dead) room?.send('kill');
    if (m) { any ||= k > 0; if (k) star(m.x, from.groundY + m.y, m.z, m.x - at.x, m.z - at.z); showDamage(STAT.hit * a.size * atkMul(mine, 'int'), k, m.x, from.groundY + m.y + 0.5, m.z); }
  }
  if (any && mine) FX.hitstop(0.04);
}
const arrows = createArrows(scene, arrowHit, boltBurst);

const EMOTES = { emote1: ANIM.WAVE, emote2: ANIM.CHEER, emote3: ANIM.SURPRISE, emote4: ANIM.FAINT };
// 잠자리채 + 채집통 아이콘 (그림 문자에 없어서 직접 그림)
const NET_ICON = `<svg class="ico" viewBox="0 0 32 32" aria-hidden="true">
<path d="M4 29 L15.5 14.5" stroke="#c9a35c" stroke-width="2.6" stroke-linecap="round"/>
<path d="M4 29 L7.2 25" stroke="#4f9a5c" stroke-width="3.6" stroke-linecap="round"/>
<path d="M14 9.5 Q14.5 22 23 19.5 Q27.5 17 25 9.5" fill="#eef8f2" stroke="#9cc7ad" stroke-width="1"/>
<path d="M16.5 11 Q18 18 21 18 M19.5 10.5 Q21.5 16 24 16" stroke="#b9dbc6" stroke-width="0.8" fill="none"/>
<ellipse cx="19.5" cy="8.6" rx="6.2" ry="3.4" fill="none" stroke="#3b8f5a" stroke-width="2"/>
<rect x="20" y="22" width="9.5" height="8" rx="1.6" fill="#dff3f6" stroke="#7fb7c2" stroke-width="1"/>
<rect x="19.4" y="20.6" width="10.7" height="2.6" rx="1" fill="#4f9a5c"/>
<path d="M22.5 20.6 Q24.75 17.6 27 20.6" stroke="#8a8f96" stroke-width="1.1" fill="none"/>
<path d="M23 29 Q24 25.5 23.5 24 M25.5 29 Q26.5 26 27.2 25" stroke="#7fbf4f" stroke-width="1.2" fill="none" stroke-linecap="round"/>
</svg>`;
// 삽 아이콘 (그림 문자에 없어서 직접 그림): 비스듬한 나무 자루 + D자 손잡이 + 쇠 삽날
const SHOVEL_ICON = `<svg class="ico" viewBox="0 0 32 32" aria-hidden="true">
<path d="M8.5 8.5 L20 20" stroke="#b07a45" stroke-width="2.8" stroke-linecap="round"/>
<path d="M4.2 7.6 Q4 4 7.6 4.2 L9.6 6.2 L6.2 9.6 Z" fill="none" stroke="#6e4526" stroke-width="2.2" stroke-linejoin="round"/>
<path d="M19 17.5 L23.5 13 Q29.5 15.5 29 22 Q28.5 28.5 22 29 Q15.5 29.5 13 23.5 L17.5 19 Z" fill="#b9c2ca" stroke="#6f7c86" stroke-width="1.4" stroke-linejoin="round"/>
<path d="M21 21 L26 26" stroke="#e7edf2" stroke-width="1.6" stroke-linecap="round"/>
</svg>`;
const TOOL_ICON = { none: '✋', axe: '🪓', rod: '🎣', club: '🏏', woodSword: '🗡️', bow: '🏹', net: NET_ICON, staff: '🪄', dagger: '🔪', shovel: SHOVEL_ICON };
const LIFE_ICON = { none: '🌼', axe: '🌳', rod: '🐟', net: NET_ICON, shovel: SHOVEL_ICON };
const LIFE_LABEL = { none: '채집', axe: '벌목', rod: '낚시', net: '곤충', shovel: '삽질' };
const QUICK_SLOTS = 4;
const FRUIT_ICON = { peach: '🍑', apple: '🍎', orange: '🍊', pear: '🍐' };
const bag = new Map(); // 내 가방에 든 과일: 이름 → 개수 (서버가 정함)
const drops = new Map(); // 땅에 떨어진 과일: 번호 → { x, z, f } (서버가 정함)
const dex = new Map(); // 내 도감: 물고기 id → 잡은 마릿수 (서버가 정함)
const announced = new Set(); // '도감에 새로 등록!'을 이미 알린 물고기
// 손이 닿는 가장 가까운 떨어진 과일 { id, x, z } 또는 null
function nearDrop(x, z) {
  let best = null;
  let bestD = GRAB_REACH;
  for (const [id, d] of drops) {
    const dist = Math.hypot(d.x - x, d.z - z);
    if (dist < bestD) { bestD = dist; best = { id, x: d.x, z: d.z }; }
  }
  return best;
}
// 화살통에 든 화살 (이 브라우저에 저장). 다 쓰면 화살통이 비어 활을 쏠 수 없다
local.arrows = (() => { const v = store.get(localStorage, 'arrows'); const n = Number(v); return v !== null && Number.isInteger(n) && n >= 0 && n <= ARROW.max ? n : ARROW.max; })();
function setArrows(n) {
  local.arrows = Math.max(0, Math.min(ARROW.max, n));
  store.set(localStorage, 'arrows', String(local.arrows));
  me?.setArrows(local.arrows);
  renderQuick();
  renderInv();
}
const BOW = TOOLS.indexOf('bow');
const NET = TOOLS.indexOf('net');
const STAFF = TOOLS.indexOf('staff');
const DAGGER = TOOLS.indexOf('dagger');
const SHOVEL = TOOLS.indexOf('shovel');
// 생활 도구 내구도: 쓸 때마다 1씩 닳고 0이 되면 부서져 가방에서 사라진다 (이 브라우저에 저장. 대장간에서 새로 만든다)
const WEAR_TOOLS = Object.keys(TOOL_DURABILITY); // axe · rod · net
local.dura = (() => {
  let saved = {};
  try { saved = JSON.parse(store.get(localStorage, 'dura') ?? '{}') ?? {}; } catch { /* 처음 */ }
  return Object.fromEntries(WEAR_TOOLS.map((k) => {
    const n = saved[k];
    return [k, Number.isInteger(n) && n >= 0 && n <= TOOL_DURABILITY[k] ? n : TOOL_DURABILITY[k]];
  }));
})();
const saveDura = () => store.set(localStorage, 'dura', JSON.stringify(local.dura));
const toolBroken = (name) => WEAR_TOOLS.includes(name) && local.dura[name] <= 0;
const wearWarn = (name) => Math.ceil(TOOL_DURABILITY[name] * 0.2); // 이만큼 남으면 한 번 알려 준다
// 이름 뒤에 받침에 맞는 '이/가'
const iga = (name) => { const c = name.charCodeAt(name.length - 1) - 0xac00; return `${name}${c >= 0 && c <= 11171 && c % 28 ? '이' : '가'}`; };
// 가방에 든 장비 목록 정하기 (부서진 도구는 뺀다)
function setInvItems(list) {
  invItems = list.filter((t) => !toolBroken(TOOLS[t]));
  if (local.equip && !invItems.includes(local.equip)) equipTool(0);
}
// 생활 도구를 한 번 썼다: 닳게 하고, 다 닳으면 부서진다 (낚싯대는 그 낚시를 마친 뒤에 부서진다)
function wearTool(name) {
  if (!WEAR_TOOLS.includes(name) || local.dura[name] <= 0) return;
  local.dura[name] -= 1;
  saveDura();
  const label = EQUIPMENT[name].label;
  if (local.dura[name] === wearWarn(name)) toast(`⚠️ ${iga(label)} 많이 닳았어요! ${wearWarn(name)}번 더 쓰면 부서져요`);
  if (local.dura[name] > 0 || (name === 'rod' && local.fishing)) { renderQuick(); return; }
  breakTool(name);
}
// 부서짐: 도구 자리에서 조각·별이 튀고, 손과 가방에서 사라진다
function breakTool(name) {
  FX.burst('wood', 14, me.x + Math.sin(me.targetRot) * 0.5, me.groundY + 0.9, me.z + Math.cos(me.targetRot) * 0.5, { floor: me.groundY, spread: Math.PI, power: 1.1 });
  FX.burst('star', 8, me.x, me.groundY + 1.4, me.z, { floor: me.groundY, spread: Math.PI, power: 0.8 });
  toast(`💥 ${iga(EQUIPMENT[name].label)} 부서졌어요! 대장간에서 목재로 새로 만들어야 해요`);
  setInvItems(invItems);
  renderQuick();
  renderInv();
}
let invItems = [1, 2, 4, NET, STAFF, DAGGER, SHOVEL].filter((t) => !toolBroken(TOOLS[t])); // 가방에 든 장비 번호 (맨손은 빼고). 목검(4)·잠자리채·나무 단검은 기본, 테스트 서버에선 나무 몽둥이(3)를 하나 더 줌
let lifeSpots = []; // 테스트 서버에서만 광장에 놓는 체험용 나무
let lifeSpotsMesh = null;
let plazaMonsters = []; // 테스트 서버에서만 광장에 소환하는 몬스터 (날개콩·몽당연필·반쪽이·하악냥)
// 들판 몬스터: 정해진 자리를 빙 돈다 (서로 다른 동작을 하도록 일정을 어긋나게, 날개콩·몽당연필·반쪽이·하악냥을 돌아가며)
// 몬스터 공통 설정: 공격이 닿으면 내가 맞음 (구르는 중·이미 맞는 중이면 피함) · 도망·쫓을 때 벽·분수·광장 나무에 막힘
const monsterOpts = {
  onAttack(x, z) {
    if (me && local.dodge <= 0 && local.hurt <= 0) getHit(x, z);
  },
  blocked: (x, z, r) => isBlocked(x, z, r) || (lifeSpots.length > 0 && LIFE_COLLIDERS.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + r)),
};
// 구구(비둘기)가 날아가 앉을 만한 곳: 마을 둥근 나무 꼭대기 언저리, 한동안 가만히 서 있는 캐릭터 머리 위
// get() 은 지금 앉을 자리(월드)를, 못 앉게 되면(캐릭터가 움직이거나 떠남) null 을 돌려줌 → 앉아 있던 구구는 화들짝 날아감
const PERCH_STILL = 3; // 캐릭터가 이만큼(초) 가만히 서 있어야 머리에 앉음
const TREE_PERCHES = [...WORLD.trees.map((t, i) => treePerch(t, i)), ...FIELD_MAP.trees.map((t) => treePerch(t, -1, t.kind === 1 ? 1 : 0))].filter(Boolean)
  .map((p) => ({ x: p.x, z: p.z, get: () => ({ x: p.x, y: p.y - curveDrop(p.x, p.z), z: p.z }) }));
const stillSince = new WeakMap(); // 캐릭터 → 마지막으로 움직인 자리·시각
const headTopOff = new WeakMap(); // 캐릭터 → 머리 꼭대기가 머리 관절보다 얼마나 높은지 (m)
const perchV = new THREE.Vector3();
function stillFor(c) {
  const now = performance.now() / 1000;
  let s = stillSince.get(c);
  if (!s || Math.hypot(c.x - s.x, c.z - s.z) > 0.05 || c.current !== 'idle') stillSince.set(c, (s = { x: c.x, z: c.z, t: now }));
  return now - s.t;
}
const headPerch = (c) => ({
  x: c.x,
  z: c.z,
  get() {
    if (!c.root.parent || !c.root.visible || stillFor(c) < PERCH_STILL) return null;
    const head = c.villager.rig.head;
    head.getWorldPosition(perchV);
    let off = headTopOff.get(c);
    if (off === undefined) { off = new THREE.Box3().setFromObject(head).max.y - perchV.y; headTopOff.set(c, off); }
    return { x: perchV.x, y: perchV.y + off - 0.03, z: perchV.z };
  },
});
const guguPerches = () => [...TREE_PERCHES, ...[me, ...[...others.values()].map((o) => o.char)].filter(Boolean).map(headPerch)];
const FIELD_KINDS = ['nalgae', 'mongdang', 'banjjok', 'haak'];
const fieldMonsters = FIELD_MONSTERS.map((spot, i) => createPlazaMonsters(scene, { ...monsterOpts, ...spot, phase: i * 7.3, kind: FIELD_KINDS[i % FIELD_KINDS.length] }));
// 들판 구구: 하악냥 자리(가장 넓음) 안쪽 작은 원을 돌게 해서(같은 원이면 하악냥에 막혀 줄만 섬) 하악냥과 합동 모션이 나게
fieldMonsters.push(createPlazaMonsters(scene, { ...monsterOpts, ...FIELD_MONSTERS[3], r: FIELD_MONSTERS[3].r / 2, kind: 'gugu', phase: 3.7, perches: guguPerches }));
// 들판 깍깍이 (공격형 까치): 날개콩 자리 안쪽 작은 원에서 깡총깡총 텃세, 나무·머리에 앉거나 멀리 높이 날아갔다 옴
fieldMonsters.push(createPlazaMonsters(scene, { ...monsterOpts, ...FIELD_MONSTERS[4], r: FIELD_MONSTERS[4].r / 2, kind: 'kkakkak', phase: 6.1, perches: guguPerches }));
// 들판 끄레용 (크레파스): 몽당연필 자리 안쪽 작은 원
fieldMonsters.push(createPlazaMonsters(scene, { ...monsterOpts, ...FIELD_MONSTERS[1], r: FIELD_MONSTERS[1].r / 2, kind: 'kkreyong', phase: 9.4 }));
let onField = false; // 지금 들판에 있는지 (내 자리로 정함)
// 지금 있는 맵의 날개콩만 (다른 맵 몬스터는 숨기고 움직이지 않는다)
const hereMonsters = () => (onField ? fieldMonsters : plazaMonsters);
function showMap(f) {
  onField = f;
  village.group.visible = !f;
  field.group.visible = f;
  for (const m of plazaMonsters) m.root.visible = !f;
  for (const m of fieldMonsters) m.root.visible = f;
}
showMap(false);
// 퀵슬롯: 칸마다 장비 번호 또는 null. Q 를 누르면 맨손 → 1칸 → 2칸 → … 차례로 바꿔 든다
const quick = (() => {
  try {
    const v = JSON.parse(store.get(localStorage, 'quick') ?? 'null');
    if (Array.isArray(v)) return Array.from({ length: QUICK_SLOTS }, (_, i) => (Number.isInteger(v[i]) && v[i] > 0 && v[i] < TOOLS.length ? v[i] : null));
  } catch { /* 저장된 값이 깨졌으면 처음부터 */ }
  return [3, 4, null, null]; // 처음에는 몽둥이를 1칸, 목검을 2칸에 넣어 둔다 (가방에 있을 때만 보인다)
})();
const saveQuick = () => store.set(localStorage, 'quick', JSON.stringify(quick));
// 나무 단검을 처음 받으면 빈 퀵슬롯에 넣어 준다 (한 번만)
if (!store.get(localStorage, 'daggerGiven')) {
  store.set(localStorage, 'daggerGiven', '1');
  const empty = quick.indexOf(null);
  if (!quick.includes(TOOLS.indexOf('dagger')) && empty >= 0) { quick[empty] = TOOLS.indexOf('dagger'); saveQuick(); }
}
// 생활 도구(도끼·낚싯대)는 따로 생활 도구 칸에 있고, 퀵슬롯(1~4)에는 무기만 넣는다
const LIFE_ITEMS = [TOOLS.indexOf('axe'), TOOLS.indexOf('rod'), TOOLS.indexOf('net'), TOOLS.indexOf('shovel')];
const isLifeItem = (t) => LIFE_ITEMS.includes(t);
const slotItem = (i) => (quick[i] !== null && invItems.includes(quick[i]) && !isLifeItem(quick[i]) ? quick[i] : null); // 가방에 없는 장비·생활 도구는 빈칸으로 본다

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
let freeServer = false; // 테스트 서버(freeLook): 전직 전에도 모든 무기를 시험할 수 있다
const wieldable = (t) => canWield(TOOLS[t], myJob, freeServer);
// 이름 뒤에 받침에 맞는 '은/는' (전사는 · 도적은)
const eun = (name) => { const c = (name.charCodeAt(name.length - 1) - 0xac00) % 28; return `${name}${c > 0 ? '은' : '는'}`; };
function equipTool(t) {
  if (local.actLeft > 0) return;
  if (!wieldable(t)) { toast(myJob ? `${eun(JOBS[myJob].name)} 몽둥이와 ${WEAPON_NAMES[JOBS[myJob].weapon]}만 쓸 수 있어요` : '전직하기 전에는 몽둥이만 쓸 수 있어요 (Lv 10에 전직)'); return; }
  local.equip = t;
  holdTool(t);
  showTool();
  renderQuick();
  renderInv();
}
// Q: 맨손과 퀵슬롯에 넣은 무기를 차례로 돌려 든다 (생활 도구를 들고 있었으면 첫 무기부터)
function nextQuick() {
  const list = [0, ...quick.map((_, i) => slotItem(i)).filter((t) => t !== null && wieldable(t))];
  if (list.length === 1) { toast('가방(I)에서 무기를 퀵슬롯에 넣어 보세요'); return; }
  const i = list.indexOf(local.equip);
  equipTool(list[(i + 1) % list.length]);
}
// R: 맨손 → 도끼 → 낚싯대 → 맨손 (생활 도구를 든 채 돌아다닐 수 있다)
function nextLifeTool() {
  const list = [0, ...LIFE_ITEMS.filter((t) => invItems.includes(t))];
  const i = list.indexOf(local.equip);
  equipTool(list[(i + 1) % list.length]);
}
// 생활 도구 칸 아래의 내구도 막대 (많이 닳으면 빨갛게). 닳지 않는 도구면 빈 글자
function durabilityBar(t) {
  const name = TOOLS[t];
  if (!WEAR_TOOLS.includes(name)) return '';
  const k = local.dura[name] / TOOL_DURABILITY[name];
  return `<span class="dura${local.dura[name] <= wearWarn(name) ? ' low' : ''}"><i style="width:${Math.round(k * 100)}%"></i></span>`;
}
const duraText = (t) => (WEAR_TOOLS.includes(TOOLS[t]) ? ` · 내구도 ${local.dura[TOOLS[t]]}/${TOOL_DURABILITY[TOOLS[t]]}` : '');
function renderQuick() {
  ui.quick.innerHTML = '';
  // 왼쪽: 생활 도구 칸 (R) — 누르면 들고, 든 것을 다시 누르면 내려놓는다
  const life = document.createElement('div');
  life.className = 'life-group';
  for (const t of LIFE_ITEMS.filter((x) => invItems.includes(x))) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = t === local.equip ? 'on' : '';
    b.title = `${EQUIPMENT[TOOLS[t]].label} (생활 도구)`;
    b.innerHTML = TOOL_ICON[TOOLS[t]] + durabilityBar(t);
    b.title += duraText(t);
    b.onclick = () => equipTool(t === local.equip ? 0 : t);
    life.appendChild(b);
  }
  const rk = document.createElement('span');
  rk.className = 'quick-key';
  rk.textContent = 'R';
  life.appendChild(rk);
  ui.quick.appendChild(life);
  // 오른쪽: 무기 퀵슬롯 1~4 (Q)
  for (let i = 0; i < QUICK_SLOTS; i++) {
    const t = slotItem(i);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = t !== null && t === local.equip ? 'on' : t === null ? 'empty' : '';
    b.title = t === null ? '빈칸 (가방에서 무기를 넣을 수 있어요)' : EQUIPMENT[TOOLS[t]].label;
    b.innerHTML = `<small>${i + 1}</small>${t === null ? '' : TOOL_ICON[TOOLS[t]]}`
      + (t === BOW ? `<em class="ammo${local.arrows ? '' : ' out'}">${local.arrows}</em>` : ''); // 활 칸에는 남은 화살 개수
    // 든 장비 칸을 다시 누르면 내려놓고 맨손이 된다
    b.onclick = () => { if (t === null) ui.inv.classList.remove('hidden'); else equipTool(t === local.equip ? 0 : t); };
    ui.quick.appendChild(b);
  }
  const q = document.createElement('span');
  q.className = 'quick-key';
  q.textContent = 'Q';
  ui.quick.appendChild(q);
}
// 가방: 위에는 퀵슬롯 4칸, 아래에는 네모 칸마다 물건 하나씩 (아이콘 + 개수)
// 무기 칸을 누르면 빈 퀵슬롯에 넣고, 이미 넣은 무기를 누르면 뺀다. 무기를 퀵슬롯 칸으로 끌어다 놓아도 된다
const INV_COLS = 5;
const INV_MIN_CELLS = 15; // 물건이 적어도 빈칸을 보여 가방처럼 보이게
let invInfo = ''; // 마지막으로 누른 칸의 설명 (손가락으로 누를 때도 이름을 볼 수 있게)
// 가방 칸 자리: 물건 열쇠('t:3'·'arrow'·'f:peach'…) → 칸 번호. 끌어다 옮긴 것만 적고, 나머지는 빈칸을 앞에서부터 채운다
const invPos = (() => {
  try { const v = JSON.parse(store.get(localStorage, 'invPos') ?? '{}'); if (v && typeof v === 'object' && !Array.isArray(v)) return v; } catch { /* 깨졌으면 처음부터 */ }
  return {};
})();
// 지금 쏘는 화살 (칸 테두리가 파랗다). 다른 화살을 이 칸으로 끌어다 놓으면 그 화살로 바뀐다
// shortcut: 화살이 한 종류('arrow')뿐이라 저장하지 않고 쏘는 화살도 그대로다, 화살 종류가 생기면 열쇠를 'arrow:종류'로 하고 저장·발사에 잇는다
let activeArrow = 'arrow';
function setQuickSlot(slot, t) {
  const was = quick.findIndex((v, i) => v === t && slotItem(i) === t);
  if (was >= 0) quick[was] = slotItem(slot); // 다른 칸에 있던 무기를 옮기면 두 칸을 맞바꾼다
  quick[slot] = t;
  saveQuick();
  renderQuick();
  renderInv();
}
function renderInv() {
  ui.inv.innerHTML = '<h3>🎒 인벤토리 <small>(I)</small></h3>';
  const cell = (icon, { count, title, cls = '', badge, color } = {}) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `inv-cell ${cls}`;
    if (title) b.title = title;
    b.innerHTML = `<i>${icon}</i>`
      + (badge ? `<small>${badge}</small>` : '')
      + (count !== undefined ? `<em${count ? '' : ' class="out"'}>${count}</em>` : '')
      + (color ? `<b style="background:${color}"></b>` : '');
    return b;
  };

  // 퀵슬롯 (1~4): 누르면 뺀다
  const qTitle = document.createElement('p');
  qTitle.className = 'inv-label';
  qTitle.textContent = '퀵슬롯 (Q로 바꿔 들기)';
  ui.inv.appendChild(qTitle);
  const qRow = document.createElement('div');
  qRow.className = 'inv-quick';
  for (let i = 0; i < QUICK_SLOTS; i++) {
    const t = slotItem(i);
    const b = t === null
      ? cell('', { cls: 'empty', badge: i + 1, title: '빈칸: 아래 무기를 눌러 넣어요' })
      : cell(TOOL_ICON[TOOLS[t]], { cls: t === local.equip ? 'on' : '', badge: i + 1, title: `${EQUIPMENT[TOOLS[t]].label} (눌러서 빼기)` });
    b.onclick = () => {
      if (t === null) return;
      quick[i] = null;
      if (local.equip === t) equipTool(0);
      invInfo = `${EQUIPMENT[TOOLS[t]].label}을(를) 퀵슬롯에서 뺐어요`;
      saveQuick();
      renderQuick();
      renderInv();
    };
    // 가방의 무기를 끌어다 놓으면 이 칸에 넣는다
    b.ondragover = (e) => { e.preventDefault(); b.classList.add('drop'); };
    b.ondragleave = () => b.classList.remove('drop');
    b.ondrop = (e) => {
      e.preventDefault();
      const k = e.dataTransfer.getData('text/plain');
      const d = k.startsWith('t:') ? Number(k.slice(2)) : NaN;
      if (invItems.includes(d) && !isLifeItem(d)) setQuickSlot(i, d);
    };
    qRow.appendChild(b);
  }
  ui.inv.appendChild(qRow);

  // 가방 칸
  const gTitle = document.createElement('p');
  gTitle.className = 'inv-label';
  gTitle.textContent = '가방';
  ui.inv.appendChild(gTitle);
  const grid = document.createElement('div');
  grid.className = 'inv-grid';
  grid.style.gridTemplateColumns = `repeat(${INV_COLS}, 1fr)`;
  const cells = [];
  const add = (key, b) => { b.dataset.key = key; cells.push(b); return b; };
  // 무기: 퀵슬롯에 넣거나 뺀다
  for (const t of invItems.filter((x) => !isLifeItem(x))) {
    const slot = quick.findIndex((v, i) => v === t && slotItem(i) === t);
    const name = EQUIPMENT[TOOLS[t]].label;
    const b = cell(TOOL_ICON[TOOLS[t]], { cls: slot >= 0 ? 'in-quick' : '', badge: slot >= 0 ? slot + 1 : undefined, title: name });
    b.onclick = () => {
      if (slot >= 0) {
        quick[slot] = null;
        if (local.equip === t) equipTool(0);
        invInfo = `${name}을(를) 퀵슬롯에서 뺐어요`;
      } else {
        const empty = quick.findIndex((_, i) => slotItem(i) === null);
        if (empty < 0) { toast('퀵슬롯이 가득 찼어요. 넣어 둔 무기를 눌러 빼 주세요'); return; }
        quick[empty] = t;
        invInfo = `${name}을(를) 퀵슬롯 ${empty + 1}칸에 넣었어요`;
      }
      saveQuick();
      renderQuick();
      renderInv();
    };
    add(`t:${t}`, b);
  }
  // 생활 도구: 누르면 들고, 든 것을 다시 누르면 내려놓는다
  for (const t of LIFE_ITEMS.filter((x) => invItems.includes(x))) {
    const name = EQUIPMENT[TOOLS[t]].label;
    const dura = duraText(t);
    const b = cell(TOOL_ICON[TOOLS[t]] + durabilityBar(t), { cls: `life${t === local.equip ? ' on' : ''}`, title: `${name} (생활 도구, R)${dura}` });
    b.onclick = () => {
      invInfo = (t === local.equip ? `${name}을(를) 내려놓았어요` : `${name}을(를) 들었어요 (생활 도구는 R로도 들어요)`) + dura;
      equipTool(t === local.equip ? 0 : t);
    };
    add(`t:${t}`, b);
  }
  // 소모품·모은 것: 누르면 이름과 설명만 보여 준다
  const info = (b, text) => { b.onclick = () => { invInfo = text; renderInv(); }; return b; };
  if (invItems.includes(BOW) || local.arrows > 0) {
    add('arrow', info(cell('➶', { cls: activeArrow === 'arrow' ? 'active' : '', count: local.arrows, title: `화살 ×${local.arrows}` }),
      local.arrows ? `화살 ×${local.arrows}: 활을 들면 등의 화살통에 들어가요 (한 발에 하나씩 써요)` : '화살을 다 썼어요. 화살이 있어야 활을 쏠 수 있어요'));
  }
  for (const f of FRUITS.filter((x) => bag.get(x) > 0)) {
    add(`f:${f}`, info(cell(FRUIT_ICON[f], { count: bag.get(f), title: `${FRUIT_NAMES[f]} ×${bag.get(f)}` }),
      `${FRUIT_NAMES[f]} ×${bag.get(f)}: 상점이 열리면 팔 수 있어요`));
  }
  for (const f of FISH.filter((x) => bag.get(x.id) > 0)) {
    const color = `#${f.color.toString(16).padStart(6, '0')}`;
    add(`fish:${f.id}`, info(cell('🐟', { count: bag.get(f.id), title: `${f.name} ×${bag.get(f.id)}`, color }),
      `${f.name} ×${bag.get(f.id)} (${RARITY[f.rarity].name}): 희귀할수록 비싸게 팔 수 있어요`));
  }
  for (const st of STONES.filter((x) => bag.get(x.id) > 0)) {
    add(`stone:${st.id}`, info(cell('🪨', { count: bag.get(st.id), title: `${st.name} ×${bag.get(st.id)}`, color: `#${st.color.toString(16).padStart(6, '0')}` }),
      `${st.name} ×${bag.get(st.id)} (${RARITY[st.rarity].name}): 바위를 삽으로 깨서 얻었어요. 대장간에서 도구를 만드는 재료예요`));
  }
  for (const w of WOODS.filter((x) => bag.get(x.id) > 0)) {
    const color = `#${w.inner.toString(16).padStart(6, '0')}`;
    add(`wood:${w.id}`, info(cell(w.shape === 'branch' ? '🌿' : '🪵', { count: bag.get(w.id), title: `${w.name} ×${bag.get(w.id)}`, color }),
      `${w.name} ×${bag.get(w.id)} (${RARITY[w.rarity].name}): 대장간에서 무기·생활 도구를 만드는 재료예요 (희귀할수록 좋은 재료)`));
  }
  for (const b of BUGS.filter((x) => bag.get(x.id) > 0)) {
    add(`bug:${b.id}`, info(cell('🦋', { count: bag.get(b.id), title: `${b.name} ×${bag.get(b.id)}` }),
      `${b.name} ×${bag.get(b.id)} (${RARITY[b.rarity].name}): 희귀할수록 비싸게 팔 수 있어요`));
  }
  // 자리 잡기: 옮겨 둔 물건은 그 칸에, 나머지는 빈칸을 앞에서부터
  const at = [];
  for (const c of cells) { const p = invPos[c.dataset.key]; if (Number.isInteger(p) && p >= 0 && p < 100 && !at[p]) at[p] = c; }
  let free = 0;
  for (const c of cells) {
    if (at.includes(c)) continue;
    while (at[free]) free++;
    at[free] = c;
  }
  const total = Math.max(INV_MIN_CELLS, Math.ceil(at.length / INV_COLS) * INV_COLS);
  for (let i = 0; i < total; i++) {
    const c = at[i] ?? cell('', { cls: 'empty' });
    if (at[i]) {
      c.draggable = true;
      c.ondragstart = (e) => e.dataTransfer.setData('text/plain', c.dataset.key);
    }
    // 끌어다 놓으면 이 칸으로 옮긴다 (물건이 있던 칸이면 서로 맞바꾼다)
    c.ondragover = (e) => { e.preventDefault(); c.classList.add('drop'); };
    c.ondragleave = () => c.classList.remove('drop');
    c.ondrop = (e) => {
      e.preventDefault();
      const from = e.dataTransfer.getData('text/plain');
      const src = at.findIndex((x) => x?.dataset.key === from);
      const to = at[i]?.dataset.key;
      if (src >= 0 && src !== i) {
        at.forEach((x, j) => { invPos[x.dataset.key] = j; }); // 다른 물건이 밀려 움직이지 않게 지금 자리를 모두 적어 둔다
        if (to) invPos[to] = src;
        invPos[from] = i;
        if (to === activeArrow && from.startsWith('arrow')) activeArrow = from;
        store.set(localStorage, 'invPos', JSON.stringify(invPos));
      }
      renderInv();
    };
    grid.appendChild(c);
  }
  ui.inv.appendChild(grid);

  const help = document.createElement('p');
  help.className = 'inv-help inv-info';
  help.textContent = invInfo || '무기를 누르거나 퀵슬롯 칸으로 끌어다 놓아 넣어요. 가방 칸끼리 끌어다 놓으면 자리를 옮겨요. 과일은 나무를 F로 흔들어, 물고기는 물가에서 G로 낚시해, 곤충은 잠자리채(R)를 들고 G로 잡아, 목재는 도끼로 나무를 찍어 떨어진 것을 F로 주워 모아요(대장간 재료). 도끼·낚싯대·잠자리채는 많이 쓰면 부서져요.';
  ui.inv.appendChild(help);
}

// ── 도감 (B): 강·바다 물고기를 모두 보여 주고, 잡아 본 것만 이름·희귀도·값이 보인다 ──
const dexPanel = $id('dex-panel');
const stars = (r) => '★'.repeat(RARITY[r].stars);
// 이름 뒤에 받침에 맞는 '을/를' (원목을 · 꿀벌을 · 나뭇가지를)
const eul = (name) => { const c = name.charCodeAt(name.length - 1) - 0xac00; return `${name}${c >= 0 && c <= 11171 && c % 28 ? '을' : '를'}`; };
// 이름 뒤에 받침에 맞는 '로/으로' (전사로 · 도적으로)
const ro = (name) => { const c = (name.charCodeAt(name.length - 1) - 0xac00) % 28; return `${name}${c > 0 && c !== 8 ? '으로' : '로'}`; };
let dexTab = 'fish'; // 'fish' · 'bug'
// 곤충 사는 곳 (도감에서 묶어 보여 줄 때)
const BUG_PLACE = [['fly', '🌼 날아다니는 곤충'], ['flower', '🌸 꽃에 앉는 곤충'], ['tree', '🌳 나무에 붙는 곤충'], ['ground', '🌱 풀밭에서 뛰는 곤충']];
function renderDex() {
  const list = dexTab === 'fish' ? FISH : BUGS;
  const got = list.filter((f) => dex.get(f.id) > 0).length;
  dexPanel.innerHTML = `<h3>📖 도감 <small>(B)</small></h3>`;
  const tabs = document.createElement('div');
  tabs.className = 'look-row dex-tabs';
  for (const [key, label] of [['fish', '🐟 물고기'], ['bug', '🦋 곤충']]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = key === dexTab ? 'on' : '';
    b.textContent = label;
    b.onclick = () => { dexTab = key; renderDex(); };
    tabs.appendChild(b);
  }
  dexPanel.appendChild(tabs);
  const p = document.createElement('p');
  p.className = 'inv-help';
  p.textContent = `${got} / ${list.length} 종류를 잡았어요`;
  dexPanel.appendChild(p);
  const groups = dexTab === 'fish'
    ? [['river', '🏞️ 강'], ['sea', '🌊 바다']].map(([w, t]) => [t, FISH.filter((x) => x.where === w)])
    : BUG_PLACE.map(([mv, t]) => [t, BUGS.filter((x) => x.move === mv)]);
  for (const [title, items] of groups) {
    const h = document.createElement('h4');
    h.textContent = title;
    dexPanel.appendChild(h);
    for (const f of items) {
      const n = dex.get(f.id) ?? 0;
      const row = document.createElement('div');
      row.className = `dex-row${n ? '' : ' unknown'}`;
      const color = n ? `#${f.color.toString(16).padStart(6, '0')}` : '#e6dccb';
      row.innerHTML = n
        ? `<span class="dot" style="background:${color}"></span><span class="nm">${f.name}</span><span class="stars">${stars(f.rarity)}</span><span class="meta">${RARITY[f.rarity].name} · ${f.price.toLocaleString()}원 · ${n}${dexTab === 'fish' ? '마리' : '번'}</span>`
        : `<span class="dot" style="background:${color}"></span><span class="nm">???</span><span class="stars">${stars(f.rarity)}</span><span class="meta">${RARITY[f.rarity].name}</span>`;
      dexPanel.appendChild(row);
    }
  }
}
renderDex();

// ── 스킬: 액티브(키를 눌러 쓰고 마나·대기 시간이 듦)와 패시브(배우면 늘 저절로) ──
// 지금은 모험가 시절 액티브 스킬 '강타'(A) 하나. 이어 치는 중에 쓰면 휘두른 끝 자세에서 곧장 강타로 넘어간다
const STRIKE_ANIMS = new Set(Object.values(SKILLS.strike.weapons));
const skillCool = {}; // 스킬 id → 다시 쓸 수 있기까지 남은 시간(초)
// 배운 스킬: 레벨이 되고, 모험가 스킬이거나 내 직업 스킬
const knowsSkill = (s) => levelOf(myXp).lv >= s.lv && (!s.job || s.job === myJob);
const WEAPON_NAMES = { club: '몽둥이', woodSword: '목검', dagger: '단검', bow: '활', staff: '지팡이' };
// 지팡이 강타는 치지 않고 가만히 기를 모아 마나를 채운다: 마나가 들지 않는다 (가득해도 쓸 수 있다)
const skillCost = (s, anim) => (anim === ANIM.STRIKE_STAFF ? 0 : s.mp);
const weaponList = (s) => Object.keys(s.weapons).map((w) => WEAPON_NAMES[w]).join('·');
function useSkill(id) {
  const s = SKILLS[id];
  if (!me || !s || s.type !== 'active' || local.hurt > 0) return;
  if (!knowsSkill(s)) { toast(`${s.name}은(는) 아직 배우지 않았어요`); return; }
  const anim = s.weapons[TOOLS[local.tool]];
  if (!anim) { toast(`${s.name}은(는) ${weaponList(s)}을 들고 써요`); return; }
  if ((skillCool[id] ?? 0) > 0) { toast(`${s.name}: ${Math.ceil(skillCool[id])}초 뒤에 다시 쓸 수 있어요`); return; }
  const bow = anim === ANIM.STRIKE_BOW;
  if (local.actLeft > 0) {
    // 땅에서 이어 치는 중이면 휘두른 끝(이어지는 때)부터 바로 넘어간다. 그 밖의 동작(점프·구르기·생활 등) 중에는 못 쓴다
    // 활은 조준하는 중(아직 화살을 쓰지 않음)이나 쏜 시위가 다 떨린 뒤에 바로 넘어간다
    const el = actTime(local.act) - local.actLeft;
    const bowReady = bow && (local.act === ANIM.BOW_AIM || (local.act === ANIM.BOW_SHOT && el >= REDRAW_AT));
    if (!bowReady && (!NEXT_SWING[local.act] || el < COMBO_AT[local.act])) return;
  }
  if (bow && local.arrows <= 0) { toast('화살통이 비었어요! 화살이 있어야 쏠 수 있어요'); return; }
  if (local.fishing) stopFishing();
  if (!useMana(skillCost(s, anim))) return; // 활은 화살을 놓을 때 꺼낸다 (updateMe)
  skillCool[id] = s.cool;
  local.act = anim;
  local.actLeft = actTime(anim);
  local.charged = false;
  local.meditateGain = 0;
  local.meditateT = 0;
  input.stopRun();
}
// 강타 기 모으기 연출: at 시작하는 때(초) · tip 빛줄기가 모이는 장비 부분 · dur 줄기가 새로 나오는 동안(초)
// 몽둥이: 꼭대기에서 짧게 버티는 동안(actions.js CLUB_STYLES.strike.hold: 0.31~0.4초) 빛줄기가 모여들어, 마지막 줄기가 휘두르기 직전에 몽둥이 끝에 닿는다
// 단검: 다 웅크려 부르르 떠는 동안(actions.js DAGGER_CHARGE: 0.14~0.42초쯤) 날로 모여들고, 마지막 줄기가 뛰어오르기 직전에 닿는다
const STRIKE_CHARGE = {
  [ANIM.STRIKE_CLUB]: { at: 0.27, tip: '몽둥이끝', dur: 0.09, rate: 140 }, // equipment.js club() 의 둥근 끝
  // 목검: 높이 들어 올린 꼭대기에서 버티는 동안(actions.js SWORD_STYLES.strike.hold: 0.28~0.42초) 칼끝으로 모여든다
  [ANIM.STRIKE_SWORD]: { at: 0.25, tip: '목검', off: [-0.02, 0.42, 0], dur: 0.14, rate: 140 }, // off: 목검 안에서 칼끝 자리
  [ANIM.STRIKE_DAGGER]: { at: DAGGER_CHARGE.at[0] * 0.62, tip: '단검날', dur: DAGGER_CHARGE.sec * 0.7, rate: 110 },
  // 활: 시위를 다 당긴 뒤 기를 다 모을 때까지(actions.js BOW_STRIKE: 0.3~0.95초)만 메긴 화살촉으로 모여든다. 그 뒤로는 뗄 때까지 살짝 떨기만 한다
  [ANIM.STRIKE_BOW]: { at: BOW_STRIKE.draw, socket: 'leftSocket', tip: '화살촉', dur: BOW_STRIKE.rel - BOW_STRIKE.draw - 0.13, rate: 120 },
  // 지팡이: 자세를 다 잡은 뒤로 모으는 내내 둘레에서 파란 빛줄기가 천천히 지팡이 끝으로 모여든다 (마나 기운)
  [ANIM.STRIKE_STAFF]: { at: 0.4, tip: '끝마개', dur: 600, rate: 26, life: 0.45, radius: [0.8, 1.4], colors: [0x7dd6ff, 0xbfeaff, 0x4fb4ff] },
};
// 기 모으기 연출: 둘레 여기저기에서 노란 빛줄기들이 무기 끝으로 쭉 빨려 들어간다 (무기가 떨려도 따라간다)
function chargeFx(char, anim) {
  const C = STRIKE_CHARGE[anim];
  const socket = char.villager.rig[C.socket ?? 'rightSocket'];
  const tip = socket.getObjectByName(C.tip) ?? socket;
  FX.gather((out) => (C.off ? tip.localToWorld(out.set(...C.off)) : tip.getWorldPosition(out)), { dur: C.dur, rate: C.rate, life: C.life ?? 0.13, radius: C.radius ?? [0.9, 1.5], colors: C.colors, alive: () => char.anim === anim });
}
// 매 장면: 대기 시간을 줄이고, A 버튼에 남은 시간과 지금 쓸 수 있는지를 보여 준다
const skillBtn = $id('skill-btn');
let skillBtnState = '';
function updateSkills(dt) {
  for (const k in skillCool) skillCool[k] = Math.max(0, skillCool[k] - dt);
  const s = SKILLS.strike;
  const left = skillCool.strike ?? 0;
  const anim = s.weapons[TOOLS[local.tool]];
  const ready = !!anim && left <= 0 && (anim === ANIM.STRIKE_STAFF || stats.mp >= s.mp) && (local.tool !== BOW || local.arrows > 0);
  const state = `${Math.ceil(left * 20)}|${ready}`;
  if (state === skillBtnState) return;
  skillBtnState = state;
  skillBtn.style.setProperty('--cd', `${(left / s.cool) * 360}deg`);
  skillBtn.classList.toggle('dim', !ready);
  skillBtn.querySelector('b').textContent = left > 0 ? Math.ceil(left) : '';
}
// 스킬 창 (K): 액티브·패시브로 나눠 보여 준다
const skillPanel = $id('skill-panel');
function toggleSkillPanel() {
  skillPanel.classList.toggle('hidden');
  infoPanel.classList.add('hidden');
  renderSkills();
}
function renderSkills() {
  if (skillPanel.classList.contains('hidden')) return;
  const card = (s) => {
    const on = knowsSkill(s);
    const meta = s.type === 'active'
      ? `<span>마나 ${s.mp}</span><span>대기 ${s.cool}초</span><span>피해 ${s.power}배</span><span>${weaponList(s)}</span>`
      : '';
    return `<div class="skill-card${on ? '' : ' locked'}">
      <div class="skill-ico">${s.icon}${s.key ? `<kbd>${s.key}</kbd>` : ''}</div>
      <div class="skill-body"><div class="skill-name">${s.name} <small>${JOBS[s.job].name} · Lv ${s.lv}${on ? '' : ' · 아직 못 배움'}</small></div>
        <div class="skill-desc">${s.desc}</div>${meta ? `<div class="skill-meta">${meta}</div>` : ''}</div></div>`;
  };
  skillPanel.innerHTML = `<h3>⚡ 스킬 <small>(K)</small></h3>${Object.entries(SKILL_TYPES).map(([type, label]) => {
    const list = Object.values(SKILLS).filter((s) => s.type === type);
    return `<h4>${label} 스킬 <small>${type === 'active' ? '(키를 눌러 써요)' : '(배우면 늘 저절로)'}</small></h4>${list.length ? list.map(card).join('') : '<p class="inv-help">아직 없어요</p>'}`;
  }).join('')}`;
}

// ── 내 정보 (P): 레벨·직업·스텟·능력치·생활 기록. 스텟과 능력치는 레벨(과 직업)로 계산한 값 ──
const infoPanel = $id('info-panel');
const JOB_ICON = { warrior: '🗡️', archer: '🏹', mage: '🪄', thief: '🥷' };
infoPanel.addEventListener('click', (e) => {
  const job = e.target.closest('[data-job]')?.dataset.job;
  if (job && job !== myJob) room?.send('job', job);
});
function renderInfo() {
  if (infoPanel.classList.contains('hidden')) return;
  const { lv, xp, need } = levelOf(myXp);
  const job = JOBS[myJob];
  const st = statsOf(lv, myJob);
  const row = (k, v) => `<div class="info-row"><span>${k}</span><b>${v}</b></div>`;
  const pct = (v) => `${Math.round(v * 1000) / 10}%`;
  const tag = (k) => (k === job.main ? '<span class="tag">주</span>' : k === job.sub ? '<span class="tag sub">부</span>' : '');
  const caught = (list) => { const got = list.filter((f) => dex.get(f.id) > 0); return `${got.reduce((n, f) => n + dex.get(f.id), 0)}마리 (${got.length}/${list.length}종)`; };
  infoPanel.innerHTML = `<h3>📋 내 정보 <small>(P)</small></h3>
    <div class="who">${room?.state.players.get(room.sessionId)?.name ?? ''} <small>Lv ${lv} · ${job.name}</small></div>
    ${row('경험치', `${xp} / ${need}`)}
    ${lv >= JOB_LEVEL ? `<p class="note">${myJob ? '다른 직업으로 바꿀 수도 있어요' : '⭐ 전직할 수 있어요! 직업을 골라요'}</p>
      <div class="job-pick">${Object.entries(JOBS).filter(([, j]) => j.main).map(([k, j]) => `<button type="button" data-job="${k}" class="${k === myJob ? 'on' : ''}">${JOB_ICON[k]} ${j.name}<small>${STAT_NAMES[j.main]}·${STAT_NAMES[j.sub]}</small></button>`).join('')}</div>`
    : `<p class="inv-help">Lv ${JOB_LEVEL}이 되면 전직할 수 있어요</p>`}
    <h4>스텟 <small>(${myJob ? '레벨이 오르면 저절로' : '모험가는 힘만 올라요'})</small></h4>
    ${Object.entries(STAT_NAMES).map(([k, n]) => row(`${n}${tag(k)}`, st[k])).join('')}
    <h4>능력치</h4>
    ${row('최대 HP', Math.round(ab.hpMax))}${row('최대 MP', Math.round(ab.mpMax))}
    ${row('HP 회복', `${ab.hpRegen.toFixed(1)} / 초`)}${row('MP 회복', `${ab.mpRegen.toFixed(1)} / 초`)}
    ${row(`공격력 (${WEAPON_NAMES[job.weapon]})`, ab.attack[WEAPON_STAT[job.weapon]].toFixed(1))}
    ${row('치명타 확률', pct(ab.crit))}${row('치명타 피해', `${ab.critMult.toFixed(2)}배`)}
    ${row('빗나감', pct(ab.miss))}${row('구르기 대기', `${ab.dodgeCool.toFixed(2)}초`)}
    <h4>생활</h4>
    ${row('🐟 낚은 물고기', caught(FISH))}${row('🦋 잡은 곤충', caught(BUGS))}`;
}

// ── 낚시: 물가에서 G → 던지기 → 물고기가 찌로 다가와 4~5번 톡톡(찌가 까딱) → 덥석(찌가 쏙, 머리 위 ❗) → 바로 G ──
// 톡톡 건드릴 때 누르면 놀라 도망가고, 쏙 들어간 뒤 너무 늦게 누르면 놓친다 (희귀할수록 누를 시간이 짧다)
// 머리 위 느낌표 (덥석 물었을 때)
const alertMark = (() => {
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = '#fffaf0';
  g.strokeStyle = '#4a3525';
  g.lineWidth = 8;
  g.beginPath();
  g.arc(64, 60, 46, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = '#e2574c';
  g.font = 'bold 76px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('!', 64, 64);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.setScalar(0.7);
  s.renderOrder = 10;
  s.visible = false;
  scene.add(s);
  return s;
})();
// 캐릭터가 바라보는 쪽으로 던진다 (찌가 떨어질 자리가 물이어야 함)
function startFishing() {
  if (!room || !me) return;
  const water = waterAt(me.x + Math.sin(me.targetRot) * BOB_AHEAD, me.z + Math.cos(me.targetRot) * BOB_AHEAD);
  if (!water) { toast('물가에 서서 물 쪽을 바라보고 G를 눌러요'); return; }
  holdTool(TOOLS.indexOf('rod'));
  startAct(ANIM.FISH_CAST);
  // 찌가 떨어지고 1.5~3초는 물고기가 알아채지 않는다 (던지자마자 달려들지 않게)
  const [n0, n1] = NOTICE.after;
  local.fishing = { phase: 'cast', water, castAt: performance.now(), noticeAt: performance.now() + (n0 + Math.random() * (n1 - n0)) * 1000 };
  room.send('cast', angleToByte(me.targetRot));
  wearTool('rod');
}
// 낚시가 끝나면 찌·물고기·느낌표를 정리 (flee: 물고기가 도망가는 모습)
function endFishing(flee) {
  const f = local.fishing;
  if (f?.ambient) village.fishShadows.release(f.ambient.fish); // 그 물고기는 다른 곳에서 다시 나타남
  local.fishing = null;
  alertMark.visible = false;
  if (me) me.bobberDip = 0;
  village.lure.end(flee ? 'flee' : 'caught');
  if (toolBroken('rod') && invItems.includes(TOOLS.indexOf('rod'))) breakTool('rod'); // 마지막으로 던진 낚시를 마치면 부서진다
}
// 낚시 그만두기 (움직이거나, 물고기가 오기 전에 G를 다시 누름)
function stopFishing() {
  const f = local.fishing;
  if (!f) return;
  if (f.phase !== 'reeling') room?.send('cancelFish');
  endFishing(true);
  if (local.act === ANIM.FISH_CAST || local.act === ANIM.FISH_WAIT) local.actLeft = 0;
}
// 낚아채기(G): 서버가 덥석 문 뒤 시간 안이었는지 판정한다
function reel() {
  const f = local.fishing;
  if (!f || !f.id || f.phase === 'reeling') return;
  room?.send('reel', [f.id]);
  f.phase = 'reeling';
}
// 매 장면: 흐름에 맞춰 찌를 까딱·쏙, 톡톡마다 작은 물결, 덥석이면 물보라와 ❗
function updateFishing() {
  const f = local.fishing;
  if (!f || !me) return;
  // 찌가 물에 떨어진 뒤(0.7초): 지나가던 물고기가 찌를 입 앞에 두면 알아채고 다가온다
  if (!f.ambient && performance.now() > f.noticeAt) {
    const bx = me.x + Math.sin(me.targetRot) * BOB_AHEAD;
    const bz = me.z + Math.cos(me.targetRot) * BOB_AHEAD;
    const c = village.fishShadows.notice(f.water, bx, bz);
    if (c) {
      f.ambient = c;
      village.fishShadows.take(c.fish); // 돌아다니던 그림자를 빼고, 찌로 오는 물고기가 그 자리에서 이어 간다
      village.lure.start({ bx, bz, y: f.water === 'sea' ? -0.027 : -0.045, len: c.len, from: c, t0: performance.now() });
      room?.send('interest', c.len); // 서버가 그 크기에 맞는 물고기와 톡톡·덥석 때를 정해 준다
    }
  }
  if (!f.id) return;
  const tau = performance.now() - f.t0;
  let dip = 0;
  for (const t of f.nibbles) dip = Math.max(dip, 0.45 * Math.exp(-(((tau - t) / (NIBBLE_MS * 0.8)) ** 2))); // 입이 닿는 만큼 천천히 까딱
  if (tau >= f.bite && f.phase !== 'reeling') dip = 1;
  me.bobberDip = dip;
  const bx = me.x + Math.sin(me.targetRot) * BOB_AHEAD;
  const bz = me.z + Math.cos(me.targetRot) * BOB_AHEAD;
  const splash = (n, power) => FX.burst('splash', n, bx, me.groundY, bz, { floor: me.groundY - 0.1, spread: Math.PI, power });
  while (f.next < f.nibbles.length && tau >= f.nibbles[f.next]) { splash(3, 0.35); f.next++; }
  if (tau >= f.bite && f.phase === 'wait') {
    f.phase = 'bite';
    splash(14, 0.9);
    alertMark.visible = true;
  }
  if (alertMark.visible) alertMark.position.set(me.x, me.root.position.y + 2.75 + Math.sin(tau / 60) * 0.03, me.z);
}
// 잡은 물고기를 머리 위로 들어 보인다 (내 캐릭터·다른 학생 모두)
const shows = [];
// ── 곤충 채집: 잠자리채를 휘두르면 손이 닿는 순간 서버가 앞쪽 곤충을 잡았는지 정한다 ──
// target: 곤충 쪽으로 돌아설 자리 (없으면 바라보는 쪽 그대로)
function swingNet(target) {
  holdTool(TOOLS.indexOf('net'));
  // 앞쪽(좌우 50도) 2.6m 안에서 가장 가까운 곤충 쪽으로 돌아서고, 그 높이에 맞춰 높이·가슴·낮게 중 하나로 휘두른다
  const r0 = me.targetRot;
  let aim = null;
  let best = 2.6;
  for (const b of bugSpots.values()) {
    const d = Math.hypot(b.x - me.x, b.z - me.z);
    const off = Math.abs(Math.atan2(Math.sin(Math.atan2(b.x - me.x, b.z - me.z) - r0), Math.cos(Math.atan2(b.x - me.x, b.z - me.z) - r0)));
    const near = target ? Math.hypot(b.x - target.x, b.z - target.z) < 0.3 : off < 0.87;
    if (near && d < best) { best = d; aim = b; }
  }
  const y = aim?.y ?? 1;
  const anim = y < NET_LOW_Y ? ANIM.NET_LOW : y > NET_HIGH_Y ? ANIM.NET_HIGH : ANIM.NET_SWING;
  if (aim) {
    // 위에서 아래로 비스듬히 덮으므로, 곤충 높이에서 그물 테가 지나가는 쪽(각도)과 거리에 곤충이 오도록 돌아서고
    // 채를 젖히는 동안 한 발 다가서거나 물러선다
    const { ang, ring } = netCross(anim, y);
    me.setPose(me.x, me.z, Math.atan2(aim.x - me.x, aim.z - me.z) - ang);
    const want = THREE.MathUtils.clamp(best - ring, -0.7, 1.0);
    const dir = Math.atan2(aim.x - me.x, aim.z - me.z);
    local.netStep = { left: Math.abs(want), speed: Math.abs(want) / NET_STEP_TIME, rot: dir + (want < 0 ? Math.PI : 0) };
  }
  startAct(anim);
  local.netCaught = null; // 이번 휘두르기에 그물에 걸린 곤충 (잡는 순간 연출용)
  local.netBlocked = false; // 그물이 나무·분수 같은 단단한 것에 턱 막혔는지
  local.netSent = false; // 그물이 지나간 길을 서버에 이미 보냈는지 (막히면 그 자리에서 바로 보낸다)
}
const NET_LOW_Y = 0.5; // 이보다 낮은 곤충은 발 앞을 위에서 덮고
const NET_HIGH_Y = 1.6; // 이보다 높으면 머리 위로 쓴다
// 휘두를 때 그물 테가 지나가는 길: [바라보는 쪽에서 각도(도, 오른쪽이 -), 땅에서 높이(m), 몸에서 거리(m)].
// 오른쪽 위에서 앞 아래로 비스듬히 지나가므로 높을수록 오른쪽, 낮을수록 왼쪽에서 지나간다 (actions.js netSweep 를 재어 둔 값)
const NET_PATHS = {
  [ANIM.NET_SWING]: [[-28, 1.72, 1.14], [-6, 1.16, 1.4], [6, 0.74, 1.54], [22, 0.34, 1.48]],
  [ANIM.NET_LOW]: [[-26, 1.38, 1.38], [-6, 0.72, 1.56], [4, 0.4, 1.58], [12, 0.2, 1.54], [16, 0.14, 1.52]],
  [ANIM.NET_HIGH]: [[0, 2.06, 0.75]], // 머리 위로 옆으로 쓴다 (몸 가까이로 지나감)
};
// 높이 y 에서 그물 테가 지나가는 각도(라디안)와 몸에서 거리
function netCross(anim, y) {
  const rows = NET_PATHS[anim];
  let r = rows[0];
  if (y <= rows[rows.length - 1][1]) r = rows[rows.length - 1];
  else {
    for (let i = 0; i < rows.length - 1; i++) {
      const [a0, h0, d0] = rows[i];
      const [a1, h1, d1] = rows[i + 1];
      if (y <= h0 && y >= h1) {
        const t = (h0 - y) / (h0 - h1);
        r = [a0 + (a1 - a0) * t, y, d0 + (d1 - d0) * t];
        break;
      }
    }
  }
  return { ang: (r[0] * Math.PI) / 180, ring: r[2] };
}
const NET_STEP_TIME = 0.28; // 채를 젖히는 동안 (초): 이 사이에 다가서거나 물러선다

// 잠자리채로 잡는 순간 (내 화면에서 그물 테가 곤충을 지나가는 그 장면): 서버 답을 기다리지 않고 바로
// 그물 자리에서 반짝·별이 톡 + 몸이 통 튀고 + 카메라가 살짝 다가갔다 돌아온다 (멈칫하는 히트스톱은 렉처럼 보여서 넣지 않는다). 곤충은 그물 속으로 쏙 (숨김).
// 서버가 판정은 같은 길로 하므로 거의 늘 잡히고, 혹시 놓쳤다고 오면 곤충을 다시 보인다
const NET_ANIMS = new Set([ANIM.NET_SWING, ANIM.NET_HIGH, ANIM.NET_LOW]);
function netCatchMoment(id, [x, y, z]) {
  local.netCaught = id;
  village.bugs.hide(id);
  FX.burst('sparkle', 16, x, y, z, { floor: me.groundY, spread: Math.PI, power: 1.0 });
  FX.burst('star', 7, x, y, z, { floor: me.groundY, spread: Math.PI, power: 0.8 });
  me.squash(1.07, 0.93, 1.07);
  local.camKick = 1;
}
// 그물이 단단한 것(나무 줄기·바위·분수·벤치·가로등·표지판)에 턱 막혔다: 그 자리에서 잠깐 멈췄다가(내 캐릭터만, 세상은 그대로)
// 휘두르기를 그만두고 들고 다니는 자세로 돌아온다. 막힌 곳까지 지나간 길로 곤충 판정을 받는다
const NET_STUCK = 0.16; // 막혀서 멈춰 있는 시간 (초)
const NET_HOOP = 0.09; // 그물 테 둘레 두께 (끝 쪽은 테가 넓어서 이만큼 더 일찍 닿는다)
const spotSolids = () => (lifeSpots.length ? LIFE_SPOTS.filter((t) => t.kind === 'tree').map((t) => ({ x: t.x, z: t.z, r: 0.2, h: 1.6, kind: 'spot' })) : []);
function netBlocked([x, y, z], solid) {
  local.netBlocked = true;
  local.netStep = null;
  local.netStuck = NET_STUCK;
  if (!local.netSent) {
    local.netSent = true;
    room?.send('swing', me.netPath.map((p) => p.map((v) => Math.round(v * 100))));
    wearTool('net');
  }
  const opts = { floor: me.groundY, spread: Math.PI, power: 0.7 };
  if (solid.kind === 'head') {
    // 다른 학생 머리: 별만 톡 (흔들기·움찔은 netBonk 에서)
  } else if (solid.kind === 'tree' || solid.kind === 'spot') {
    if (solid.kind === 'tree' && !onField) village.shakeTree(solid.i, Math.sin(me.targetRot), Math.cos(me.targetRot), 0.45);
    FX.burst('leaf', 5, x, y, z, opts);
    FX.burst('wood', 4, x, y, z, opts);
  } else {
    FX.burst('dust', 7, x, y, z, opts);
    FX.burst(solid.kind === 'rock' || solid.kind === 'fountain' ? 'stone' : 'wood', 3, x, y, z, opts);
  }
  me.squash(0.97, 1.03, 0.97);
  local.camKick = 0.45;
}
// ── 잠자리채로 다른 학생 머리 콩: 휘두르는 학생(내 캐릭터·다른 학생 모두)의 채가 다른 학생 머리에 닿으면
// 맞은 학생은 흔들리며 머리 위로 별이 튀고, 휘두른 채는 턱 막힌다. 내가 맞았으면 아파하고, 자꾸 맞으면 화낸다 (그물이라 체력은 그대로)
// 판정은 학생마다 자기 화면에서 한다 (몽둥이와 같은 방식)
const BONK_R = 0.45; // 머리 가운데에서 이만큼 안에 채가 들어오면 맞음 (머리 반지름 약 0.4m + 그물 테 두께)
const headPos = new THREE.Vector3();
function checkNetBonks() {
  const chars = [me, ...[...others.values()].map((o) => o.char)].filter(Boolean);
  for (const c of chars) {
    if (!c.current?.startsWith('net') || c.netBonked || !c.netSegs?.length) continue;
    if (c === me && local.netBlocked) continue;
    const [base, tip] = c.netSegs[c.netSegs.length - 1];
    for (const v of chars) {
      if (v === c || !v.root.visible) continue;
      v.villager.rig.head.getWorldPosition(headPos);
      const hit = [0.6, 0.8, 1].map((f) => base.map((b, n) => b + (tip[n] - b) * f)).find((p) => headPos.distanceTo(new THREE.Vector3(...p)) < BONK_R);
      if (hit) { netBonk(c, v, hit); break; }
    }
  }
}
function netBonk(c, v, p) {
  c.netBonked = true;
  v.shake();
  FX.burst('star', 9, headPos.x, headPos.y + 0.25, headPos.z, { floor: v.groundY, spread: Math.PI, power: 0.8 });
  if (c === me) netBlocked(p, { kind: 'head' }); // 내가 휘둘렀으면 내 채가 턱 막힌다
  if (v !== me) predictOuch(v);
  if (v === me && local.dodge <= 0 && local.hurt <= 0) {
    // 내가 맞았다: 휘두른 쪽으로 돌아보며 아파한다 (그물이라 체력은 그대로). 자꾸 맞으면 화낸다
    ouch(c.x, c.z);
  }
}

// 매 장면: 방금 그물 테가 지나간 마디가 곤충에 닿았는지 (서버와 같은 거리 NET_CATCH), 단단한 것에 부딪혔는지
function checkNetCatch() {
  if (!me || local.netBlocked || !NET_ANIMS.has(local.act) || local.actLeft <= 0) return;
  const path = me.netPath;
  if (!path?.length) return;
  const b = path[path.length - 1];
  const a = path[path.length - 2] ?? b;
  // 채 전체(자루 가운데 → 그물 테 끝)를, 지난 장면에서 이번 장면까지 몇 걸음으로 나눠 본다
  // (빠르게 휘두르면 한 장면에 많이 움직여 끝 한 점만 보면 얇은 기둥을 뚫고 지나간다)
  const segs = me.netSegs;
  if (segs?.length) {
    const s1 = segs[segs.length - 1];
    const s0 = segs[segs.length - 2] ?? s1;
    const extra = spotSolids();
    const lerp = (p, q, t) => p.map((v, n) => v + (q[n] - v) * t);
    for (let k = 1; k <= 4; k++) {
      const base = lerp(s0[0], s1[0], k / 4);
      const tip = lerp(s0[1], s1[1], k / 4);
      for (const f of [0.45, 0.6, 0.75, 0.9, 1]) { // 자루 가운데부터 그물 테 끝까지 (손 가까이는 몸이라 빼고)
        const p = lerp(base, tip, f);
        const s = solidAt(p[0], p[1] - me.groundY, p[2], extra, f > 0.8 ? NET_HOOP : 0.02);
        if (s) { netBlocked(p, s); return; }
      }
    }
  }
  if (local.netCaught) return;
  for (const [id, bug] of bugSpots) {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ap = [bug.x - a[0], bug.y - a[1], bug.z - a[2]];
    const L = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
    const t = L > 0 ? Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / L)) : 0;
    if (Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t) < NET_CATCH) { netCatchMoment(id, b); return; }
  }
}

// mesh: 들어 보일 모양 (물고기·곤충), big: 원래 크기의 몇 배로 보일지
function showCatch(char, mesh, big = 1) {
  scene.add(mesh);
  shows.push({ char, mesh, t: 0, base: mesh.scale.x * big });
}
function updateShows(dt) {
  for (let i = shows.length - 1; i >= 0; i--) {
    const s = shows[i];
    s.t += dt;
    const up = Math.min(1, s.t / 0.25);
    s.mesh.position.set(s.char.x, s.char.groundY + 2.2 + up * 0.5 + Math.sin(s.t * 6) * 0.04, s.char.z);
    s.mesh.rotation.set(0, s.char.root.rotation.y + Math.PI / 2, Math.sin(s.t * 9) * 0.25); // 파닥파닥
    const pop = up < 1 ? up * (1 + Math.sin(up * Math.PI) * 0.45) : 1; // 커지며 한 번 통 튀었다가 제 크기로
    s.mesh.scale.setScalar(s.base * (s.t > 2 ? Math.max(0, 1 - (s.t - 2) / 0.25) : pop));
    if (s.t > 2.25) { scene.remove(s.mesh); shows.splice(i, 1); }
  }
}
showTool();
renderQuick();
renderInv();

// 활: 시위를 당기기 시작한다 (공격키를 떼면 updateMe 가 쏜다). 화살이 없으면 당기지 못한다
// 화살 하나를 꺼낸다 (없으면 알려 주고 false)
function takeArrow() {
  if (local.arrows <= 0) { toast('화살통이 비었어요! 화살이 있어야 쏠 수 있어요'); return false; }
  setArrows(local.arrows - 1);
  return true;
}
function drawBow() {
  // 점프 중이면 공중에서 대각선 아래로, 더블 점프 중이면 공중제비를 마치고 가파르게 아래로, 달리는 중이면 뒤돌아 쏜다 (모두 누르자마자 바로 쏜다)
  // 공격은 마우스 쪽이 아니라 캐릭터가 바라보는 방향 그대로 한다
  const el = actTime(local.act) - local.actLeft;
  if (local.act === ANIM.JUMP && local.actLeft > 0 && el > 0.08 && el < 0.5) {
    if (!takeArrow()) return;
    local.act = ANIM.BOW_AIR; // 길이가 점프와 같아 남은 시간도 그대로
    return;
  }
  if (local.act === ANIM.FLIP && local.actLeft > 0 && el < 0.4) {
    if (!takeArrow()) return;
    local.act = ANIM.BOW_SLAM;
    local.actLeft = actTime(ANIM.BOW_SLAM) - el;
    return;
  }
  const run = input.read();
  if (local.actLeft <= 0 && run.run && run.mag > 0) {
    if (!takeArrow()) return;
    local.backRot = me.targetRot; // 달리던 쪽: 이쪽으로 미끄러지면서 뒤를 보고 쏜다
    me.setPose(me.x, me.z, me.targetRot + Math.PI);
    startAct(ANIM.BOW_BACK);
    return;
  }
  const shotAgo = local.act === ANIM.BOW_SHOT ? actTime(ANIM.BOW_SHOT) - local.actLeft : Infinity;
  if (local.actLeft > 0 && shotAgo < REDRAW_AT) return; // 방금 쏜 시위가 아직 떨리는 중 (쏜 뒤 남은 동작은 끊고 바로 다시 당긴다)
  if (local.actLeft > 0 && local.act !== ANIM.BOW_SHOT) return;
  if (local.arrows <= 0) { toast('화살통이 비었어요! 화살이 있어야 쏠 수 있어요'); return; }
  if (local.fishing) stopFishing();
  local.act = ANIM.BOW_AIM;
  local.actLeft = actTime(ANIM.BOW_AIM);
}

// ── 삽: 앞 땅(DIG_AHEAD)을 보고 할 일을 고른다. 가까이 구덩이가 있으면 덮고, 앞에 바위가 있으면 치고(여러 번 치면 깨짐),
// 아니면 풀밭·모래를 판다. 실제 파기·덮기·치기는 삽날이 땅에 꽂히는 순간(hitFx 'dig')에 서버로 보낸다
const holes = new Map(); // 번호 → { x, z, k } (서버가 정함)
const HOLE_BLOCK = DIG_HOLE.r * 0.8; // 구덩이가 막는 둘레 (테두리 흙은 밟을 수 있게 구멍보다 조금 작게)
const HOLE_JUMP_AFTER = 0.3; // 구덩이 앞에서 방향키를 이만큼(초) 누르고 있으면 뛰어 넘는다
function shovelTarget() {
  const fx = Math.sin(me.targetRot);
  const fz = Math.cos(me.targetRot);
  const ax = me.x + fx * DIG_AHEAD;
  const az = me.z + fz * DIG_AHEAD;
  let fill = null;
  let best = DIG_HOLE.r + 0.35;
  for (const [id, h] of holes) {
    const d = Math.min(Math.hypot(h.x - ax, h.z - az), Math.hypot(h.x - me.x, h.z - me.z) - 0.2);
    if (d < best) { best = d; fill = { fill: id, x: h.x, z: h.z }; }
  }
  if (fill) return fill;
  if (!onField) {
    const rock = village.nearRock(ax, az, 0.5);
    if (rock >= 0) return { rock, x: WORLD.rocks[rock].x, z: WORLD.rocks[rock].z };
  }
  return groundKind(ax, az) ? { dig: true, x: ax, z: az } : null;
}
function useShovel() {
  if (local.actLeft > 0 || !me) return;
  if (toolBroken('shovel')) { toast('삽이 부서져서 쓸 수 없어요. 대장간에서 새로 만들어야 해요'); return; }
  const t = shovelTarget();
  if (!t) { toast('여기는 팔 수 없어요. 풀밭이나 모래사장에서 G를 눌러 보세요'); return; }
  if (t.fill || t.rock !== undefined) me.setPose(me.x, me.z, Math.atan2(t.x - me.x, t.z - me.z)); // 덮을 구덩이·칠 바위 쪽으로 돌아섬
  local.shovel = t;
  startAct(t.fill ? ANIM.FILL : ANIM.DIG); // 덮을 때는 흙을 긁어 넣고 톡톡 다지는 동작
}

function startAct(a) {
  if (local.actLeft > 0) return; // 하던 동작이 끝나야 다음 동작
  local.act = a;
  local.actLeft = actTime(a);
}

// Z 는 공격만 한다. 무기를 들지 않았으면(맨손·도끼·낚싯대·잠자리채·삽) 아무것도 하지 않는다 (생활은 G로만)
const NOT_WEAPON = new Set(['none', 'axe', 'rod', 'net', 'shovel']);
function clickAction() {
  if (local.fishing || NOT_WEAPON.has(TOOLS[local.tool])) return null;
  return 'attack';
}

// ── 말풍선 대화: Enter(또는 💬 버튼)로 칸을 열고, 쓰고 Enter 로 보내면 내 머리 위 말풍선으로 모두에게 보인다. Esc 로 닫기 ──
const chatForm = $id('chat-form');
const chatInput = $id('chat-input');
function openChat() {
  if (!me || !room) return;
  chatForm.classList.remove('hidden');
  input.enable(false); // 쓰는 동안 캐릭터가 움직이지 않게
  chatInput.focus();
}
function closeChat() {
  chatForm.classList.add('hidden');
  chatInput.value = '';
  chatInput.blur();
  input.enable(true);
}
chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (text) room?.send('say', text);
  closeChat();
});
chatInput.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeChat(); });
chatInput.addEventListener('blur', () => { if (!chatForm.classList.contains('hidden')) setTimeout(closeChat, 0); });
$id('chat-btn').addEventListener('click', openChat);
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') for (const p of [ui.inv, dexPanel, infoPanel, skillPanel, $id('look-panel')]) p.classList.add('hidden');
});
for (const panel of [ui.inv, dexPanel, infoPanel, skillPanel, $id('look-panel')]) { // 인벤토리·도감·꾸미기 창: 제목줄을 잡고 끌면 옮겨진다 (칸 안 물건 끌기와 안 겹치게 제목줄만)
  let drag = null;
  const key = `panelPos:${panel.id}`;
  const saved = store.get(localStorage, key)?.split(',').map(Number);
  if (saved?.length === 2 && saved.every(Number.isFinite)) { // 화면이 작아졌어도 제목줄은 보이게
    panel.style.left = `${Math.max(0, Math.min(innerWidth - 80, saved[0]))}px`;
    panel.style.top = `${Math.max(0, Math.min(innerHeight - 40, saved[1]))}px`;
    panel.style.right = 'auto';
  }
  panel.addEventListener('pointerdown', (e) => {
    if (e.target.closest('h3') !== panel.querySelector('h3')) return; // 맨 위 제목줄만
    e.preventDefault();
    e.stopPropagation();
    panel.setPointerCapture(e.pointerId);
    const r = panel.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
  });
  panel.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const s = panel.style;
    s.left = `${Math.max(0, Math.min(innerWidth - panel.offsetWidth, e.clientX - drag.dx))}px`;
    s.top = `${Math.max(0, Math.min(innerHeight - 40, e.clientY - drag.dy))}px`;
    s.right = 'auto';
  });
  const end = () => {
    if (!drag) return;
    drag = null;
    if (panel.style.left) store.set(localStorage, key, `${parseFloat(panel.style.left)},${parseFloat(panel.style.top)}`);
  };
  panel.addEventListener('pointerup', end);
  panel.addEventListener('pointercancel', end);
}
addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.isComposing || !chatForm.classList.contains('hidden')) return;
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  e.preventDefault();
  openChat();
});

const input = createInput({
  onAction(name) {
    if (!me) return;
    if (name === 'attack') name = clickAction();
    if (!name) return;
    if (name === 'skill1') { useSkill('strike'); return; } // A: 강타
    if (name === 'skills') { toggleSkillPanel(); return; } // K: 스킬 창
    if (name === 'behind') { local.recenter = me.targetRot + Math.PI; return; } // V: 누른 순간 보던 쪽의 등 뒤로 스르르 (그 뒤에 돌아도 따라가지 않음)
    if (name === 'jump') {
      // 더블 점프: 떠 있는 동안 한 번 더 누르면 앞으로 공중제비
      const up = actTime(ANIM.JUMP) - local.actLeft;
      if (local.act === ANIM.JUMP && local.actLeft > 0 && up > 0.12 && up < 0.7) {
        local.act = ANIM.FLIP;
        local.actLeft = actTime(ANIM.FLIP);
      } else startAct(ANIM.JUMP);
    }
    else if (name === 'dodge') {
      // 공격 중·맞는 중·쿨타임에는 못 한다. 방향키(조이스틱)를 누르고 있으면 그쪽으로, 아니면 보던 쪽(정면)으로
      if (local.hurt > 0 || local.dodge > -ab.dodgeCool || ((ATTACKS.has(local.act) || AIRBORNE.has(local.act)) && local.actLeft > 0)) return;
      if (local.fishing) stopFishing();
      local.act = ANIM.ROLL;
      local.actLeft = actTime(ANIM.ROLL);
      local.dodge = DODGE.time;
      const inp = input.read();
      local.dodgeRot = inp.mag > 0
        ? Math.atan2(inp.x * Math.cos(moveYaw()) + inp.z * Math.sin(moveYaw()), -inp.x * Math.sin(moveYaw()) + inp.z * Math.cos(moveYaw()))
        : me.targetRot;
      me.setPose(me.x, me.z, local.dodgeRot);
    }
    else if (EMOTES[name] !== undefined) startAct(EMOTES[name]);
    else if (name === 'tool') {
      nextQuick();
    } else if (name === 'lifeTool') {
      if (local.fishing) stopFishing();
      nextLifeTool();
    } else if (name === 'inv') {
      ui.inv.classList.toggle('hidden');
      dexPanel.classList.add('hidden'); // 가방과 도감은 같은 자리에 열려서 하나만
    } else if (name === 'info') {
      infoPanel.classList.toggle('hidden');
      skillPanel.classList.add('hidden'); // 내 정보와 스킬 창은 같은 자리에 열려서 하나만
      renderInfo();
    } else if (name === 'dex') {
      renderDex();
      dexPanel.classList.toggle('hidden');
      ui.inv.classList.add('hidden');
    } else if (name === 'attack') {
      // 한 번 누르면 한 번만 휘두른다: 휘두르는 중에 또 눌러도 다음 타를 예약하지 않는다 (이어 치기는 꾹 누르고 있을 때만)
      if (local.hurt > 0) return;
      if (local.tool === BOW) { drawBow(); return; }
      if (local.tool === STAFF) { // 마나를 써서 바라보는 쪽으로 에너지 볼
        if (local.actLeft > 0 || !useMana(BOLT.cost)) return;
        startAct(ANIM.STAFF_CAST);
        return;
      }
      // 몽둥이와 목검은 같은 흐름: 점프 중이면 공중 공격, 더블 점프 중이면 착지하며 내리치기, 달리는 중이면 대시 공격, 아니면 1타
      // (계속 누르면 아래에서 다음 타로 이어진다)
      // 나무 단검도 같은 흐름: 점프 중이면 공중에서 베기, 더블 점프 중이면 앞 아래로 내려가며 베기, 달리는 중이면 숙여 달려들며 베기
      const sword = TOOLS[local.tool] === 'woodSword';
      if (!sword && TOOLS[local.tool] !== 'club' && local.tool !== DAGGER) return;
      // 점프·더블 점프·대시 공격은 어느 무기든 마나를 쓰지 않는다
      const A = local.tool === DAGGER ? { air: ANIM.DAGGER_AIR, slam: ANIM.DAGGER_SLAM, dash: ANIM.DAGGER_DASH, first: ANIM.DAGGER1 }
        : sword ? { air: ANIM.SLASH_AIR, slam: ANIM.SLASH_SLAM, dash: ANIM.SLASH_DASH, first: ANIM.SLASH1 }
          : { air: ANIM.SMASH_AIR, slam: ANIM.SMASH_SLAM, dash: ANIM.SMASH_DASH, first: ANIM.SMASH };
      const el = actTime(local.act) - local.actLeft; // 지금 동작이 흐른 시간
      // 마우스 쪽으로 돌아서지 않고 바라보던 방향 그대로 휘두른다
      if (local.act === ANIM.JUMP && local.actLeft > 0 && el > 0.08 && el < 0.5) {
        // 공중 공격: 뛰어오른 높이를 그대로 이어받아 공중에서 휘두른다 (길이가 점프와 같아 남은 시간도 그대로)
        local.act = A.air;
        local.airFrom = el; // 단검: 점프 공격 2타로 넘어가는 때를 여기서부터 잰다
      } else if (local.act === ANIM.FLIP && local.actLeft > 0 && el < 0.5) {
        // 더블 점프 뒤 공격: 착지하며 땅을 내리찍는다 (목검은 내려벤다)
        // 단검은 공중제비를 막 시작했을 때 누르면 기억해 두었다가 DIVE.from 초에 시작한다 (아래 매 장면 처리)
        if (local.tool === DAGGER && el < DIVE.from) { local.diveQueued = true; return; }
        startSlam(A.slam, el);
      } else if (local.actLeft <= 0) {
        const inp = input.read();
        if (inp.run && inp.mag > 0) { startAct(A.dash); input.stopRun(); } // 달리던 방향 그대로 뛰어들며 내리친다 (목검은 가로로 벤다)
        else startAct(A.first);
      }
    } else if (name === 'pick') {
      // F: 떨어진 과일이 가까이 있으면 줍고, 없으면 과일나무를 흔들어 과일을 떨어뜨린다
      if (local.actLeft > 0) return;
      const d = local.clickDrop ?? nearDrop(me.x, me.z); // 마우스로 콕 누른 것이 있으면 그것부터
      local.clickDrop = null;
      const t = d ? null : findFruit(me.x, me.z);
      if (!d && !t) { toast(`${FRUIT_NAMES[VILLAGE_FRUIT]}가 열린 과일나무에 바짝 붙어서 F를 눌러 보세요`); return; }
      const item = d && drops.get(d.id)?.f;
      if (d && (bag.get(item) ?? 0) >= BAG_MAX) { toast(`가방에 ${WOOD_BY_ID[item]?.name ?? STONE_BY_ID[item]?.name ?? FRUIT_NAMES[item] ?? '이것'}이(가) 가득 찼어요`); return; }
      const aim = d ?? t;
      local.picked = d ? { grab: d.id, x: d.x, z: d.z } : { shake: t.pick, x: t.x, z: t.z };
      holdTool(0);
      me.setPose(me.x, me.z, Math.atan2(aim.x - me.x, aim.z - me.z)); // 줍거나 흔들 쪽으로 돌아섬
      startAct(d ? ANIM.POCKET : ANIM.TREE_SHAKE);
    } else if (name === 'life') {
      // 손에 무엇을 들었든, 가장 가까운 생활 대상에 맞는 도구를 꺼내 들고 한다 (끝나면 고른 장비로 돌아온다)
      if (local.fishing) {
        if (local.fishing.id) reel(); // 물고기가 온 뒤에는 G = 낚아채기 (톡톡 중이면 너무 이름)
        else { stopFishing(); toast('낚싯줄을 감았어요'); }
        return;
      }
      if (local.actLeft > 0) return;
      // 잠자리채를 들고 있으면 G = 바라보는 쪽으로 휘두르기 (곤충이 없어도)
      if (TOOLS[local.equip] === 'net') { swingNet(null); return; }
      if (TOOLS[local.equip] === 'shovel') { useShovel(); return; } // 삽을 들고 있으면 G = 앞 땅 파기·구덩이 덮기·바위 치기
      const t = findLife(me.x, me.z, lifeSpots);
      if (!t) { toast('곤충·나무·물가·꽃 가까이에서 G를 눌러 보세요'); return; }
      if (toolBroken(t.tool)) { toast(`${iga(EQUIPMENT[t.tool].label)} 부서져서 쓸 수 없어요. 대장간에서 새로 만들어야 해요`); return; }
      if (t.tool === 'net') { swingNet(t); return; }
      if (t.tool === 'rod') { startFishing(); return; }
      holdTool(TOOLS.indexOf(t.tool));
      me.setPose(me.x, me.z, Math.atan2(t.x - me.x, t.z - me.z)); // 대상 쪽으로 돌아섬
      startAct(LIFE[t.tool].anim);
    }
  },
  onOrbit(dx, dy) {
    local.recenter = null; // 손으로 돌리면 V 로 돌아가던 것은 그만
    camGoal.yaw -= dx * 0.006;
    camGoal.pitch = THREE.MathUtils.clamp(camGoal.pitch + dy * 0.004, 0.3, 1.3);
    saveCam();
  },
  onZoom(dy) {
    camGoal.zoom = THREE.MathUtils.clamp(camGoal.zoom * Math.exp(dy * 0.0012), 0.2, 3);
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
      me.setArrows(local.arrows);
      me.setPose(fromCm(p.x), fromCm(p.z), byteToAngle(p.r));
      me.root.rotation.y = me.targetRot;
      scene.add(me.root);
      // 도구마다 한 번씩 쥐고 화면 한 점에만 미리 그려 둔다 (들어올 때 한 번): 셰이더 컴파일·텍스처 올리기를 여기서 끝내지 않으면
      // 누가 그 도구를 처음 쥐는 순간마다 화면이 0.1초쯤 멈춘다 (카메라는 매 장면 다시 놓으므로 여기서 옮겨도 된다.
      // 따로 만든 그림판에 그리면 색 공간이 달라 다른 셰이더가 컴파일되므로 화면에 직접 그린다)
      camera.position.set(me.x, 3, me.z + 5);
      camera.lookAt(me.x, 1, me.z);
      renderer.setScissorTest(true);
      renderer.setScissor(0, 0, 1, 1);
      for (let t = 1; t < TOOLS.length; t++) { me.villager.equip(TOOLS[t]); renderer.render(scene, camera); }
      renderer.setScissorTest(false);
      me.villager.equip(TOOLS[local.tool]);
      camTarget.set(me.x, 0, me.z);
      local.last = null;
      // 내 가방: 과일이 늘면 알려 주고 가방 창을 새로 그린다
      bag.clear();
      const setBag = (n, f) => {
        const before = bag.get(f) ?? 0;
        if (n > 0) bag.set(f, n); else bag.delete(f);
        if (n > before && FRUIT_NAMES[f]) toast(`${FRUIT_ICON[f] ?? ''} ${FRUIT_NAMES[f]}를 주웠어요! (가방에 ${n}개)`);
        renderInv();
      };
      dex.clear();
      const setDex = (n, f) => { dex.set(f, n); renderDex(); renderInfo(); };
      $(p).dex.onAdd(setDex, false);
      $(p).dex.onChange(setDex);
      p.dex.forEach((n, f) => { dex.set(f, n); announced.add(f); });
      renderDex();
      $(p).bag.onAdd(setBag, false);
      $(p).bag.onChange(setBag);
      $(p).bag.onRemove((_, f) => setBag(0, f));
      p.bag.forEach((n, f) => bag.set(f, n));
      renderInv();
      $(p).listen('xp', (v, prev) => showXp(v, prev));
      $(p).listen('job', (v, prev) => {
        myJob = v ?? '';
        ab = abilitiesOf(statsOf(levelOf(myXp).lv, myJob));
        renderInfo();
        if (!wieldable(local.equip)) equipTool(0); // 직업을 바꿔 못 쓰게 된 무기는 내려놓는다
        if (prev !== undefined && v) toast(`✨ ${ro(JOBS[v].name)} ${prev ? '바꿨어요' : '전직했어요!'}`);
      });
    } else {
      const char = new Character(p.name, p.color, parseLook(p.look));
      if (noLines) char.setOutline(false);
      char.setTool(p.t);
      char.setArrows(p.q);
      char.setPose(fromCm(p.x), fromCm(p.z), byteToAngle(p.r));
      char.root.rotation.y = char.targetRot;
      scene.add(char.root);
      const o = { char, buf: [] };
      others.set(id, o);
      const push = () => {
        const t = performance.now();
        const last = o.buf[o.buf.length - 1];
        // 보낸 쪽 시계(p.s)가 있으면 자리 사이 간격을 그 시계로 잡는다: 도착한 때는 서버가 0.1초마다 묶어 보내는 데 맞춰 들쭉날쭉해서,
        // 그대로 쓰면 고르게 걷는 학생도 속도가 0.5~2배로 출렁인다. (도착한 때에서 0.12초 넘게 벗어나지는 않게 붙잡아 둔다)
        // 시계가 그대로면 자리 소식이 아니라 체력·가방 같은 다른 것이 바뀐 것이므로 자리를 새로 찍지 않는다
        const fresh = !p.s || p.s !== o.stamp;
        let st = t;
        if (p.s && o.stamp && last) {
          const ds = ((p.s - o.stamp + 65535) % 65535) * 10;
          if (ds < 1000) st = Math.min(t, Math.max(last.t + ds, t - 120));
        }
        o.stamp = p.s;
        if (fresh) {
          // 오래 멈춰 있다가 다시 움직이면, 직전 위치를 "방금 전"으로 다시 찍어 순간이동을 막음
          if (last && Math.hypot(fromCm(p.x) - last.x, fromCm(p.z) - last.z) > 8) o.buf.length = 0; // 포탈을 탔으면 미끄러지지 않고 바로 그 자리에
          else if (last && st - last.t > 300) o.buf.push({ ...last, t: st - 100 });
          o.buf.push({ t: st, x: fromCm(p.x), z: fromCm(p.z), r: byteToAngle(p.r), a: p.a });
          if (o.buf.length > 30) o.buf.shift();
        }
        char.setTool(p.t);
        char.setArrows(p.q);
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
    freeServer = free;
    lookEditor.show(free);
    lifeSpots = free ? LIFE_SPOTS : [];
    if (free) { for (const k of WEAR_TOOLS) local.dura[k] = TOOL_DURABILITY[k]; saveDura(); } // 테스트 서버: 들어올 때마다 새 생활 도구 (아직 대장간이 없음)
    setInvItems(free ? [1, 2, 3, 4, BOW, NET, STAFF, DAGGER, SHOVEL] : [1, 2, 3, 4, NET, STAFF, DAGGER, SHOVEL]);
    // 활을 처음 받으면 빈 퀵슬롯에 넣어 준다 (한 번만). 테스트 서버에서는 들어올 때마다 화살통을 가득 채워 준다 (아직 화살을 얻는 곳이 없음)
    if (free && !store.get(localStorage, 'bowGiven')) {
      store.set(localStorage, 'bowGiven', '1');
      const empty = quick.indexOf(null);
      if (!quick.includes(BOW) && empty >= 0) { quick[empty] = BOW; saveQuick(); }
    }
    if (free) setArrows(ARROW.max);
    renderQuick();
    renderInv();
    if (free && !lifeSpotsMesh) lifeSpotsMesh = buildLifeSpots(scene);
    if (free && !plazaMonsters.length) {
      // 하악냥은 광장 둘레 곤충을 쫓아가 툭툭 침: 두 번째 툭에 서버에 알려 곤충이 놀라 날아가게 (들판엔 곤충이 없어 광장 하악냥만)
      const preyOpts = { prey: () => bugSpots, onSwat: (id, x, z) => room?.send('catSwat', [id, toCm(x), toCm(z)]) };
      // 몽당연필·반쪽이·하악냥·구구는 날개콩과 같은 분수 둘레 길을 일정을 어긋나게 돈다
      plazaMonsters = [createPlazaMonsters(scene, monsterOpts), createPlazaMonsters(scene, { ...monsterOpts, kind: 'mongdang', phase: 11 }),
        createPlazaMonsters(scene, { ...monsterOpts, kind: 'banjjok', phase: 5.5 }), createPlazaMonsters(scene, { ...monsterOpts, kind: 'haak', phase: 16.5, ...preyOpts }),
        createPlazaMonsters(scene, { ...monsterOpts, kind: 'gugu', phase: 8.2, perches: guguPerches }),
        createPlazaMonsters(scene, { ...monsterOpts, kind: 'kkakkak', phase: 13.4, perches: guguPerches }),
        createPlazaMonsters(scene, { ...monsterOpts, kind: 'kkreyong', phase: 19.6 })]; // 깍깍이: 공격형이라 다가가면 쫓아옴 · 끄레용: 도망형 크레파스
      for (const m of plazaMonsters) m.root.visible = !onField;
    }
  });

  // 과일나무마다 남은 과일: 누가 따거나 다시 열리면 모두의 화면에서 바뀐다
  const setLeft = (n, k) => { fruitLeft[k] = n; village.setFruitLeft(k, n); };
  $(r.state).fruitLeft.onAdd(setLeft);
  $(r.state).fruitLeft.onChange(setLeft);

  // 땅에 떨어진 과일: 들어올 때 이미 있던 것은 그냥 놓고, 그 뒤에 생긴 것은 나무에서 떨어지며 나무가 흔들린다
  for (const id of drops.keys()) village.removeDrop(id);
  drops.clear();
  let dropsReady = false;
  $(r.state).drops.onAdd((d, id) => {
    const x = fromCm(d.x);
    const z = fromCm(d.z);
    drops.set(id, { x, z, f: d.f });
    village.addDrop(id, d.f, x, z, d.k, dropsReady, d.t);
    if (dropsReady && d.k >= 0) {
      const t = WORLD.trees[WORLD.fruitTrees[d.k]];
      if (t) village.shakeTree(WORLD.fruitTrees[d.k], (x - t.x) * 0.3, (z - t.z) * 0.3, 0.6);
    }
  });
  $(r.state).drops.onRemove((_, id) => { drops.delete(id); village.removeDrop(id); });
  // 삽으로 판 구덩이 · 깨뜨린 바위
  for (const id of holes.keys()) village.holes.remove(id);
  holes.clear();
  $(r.state).holes.onAdd((h, id) => {
    const x = fromCm(h.x);
    const z = fromCm(h.z);
    holes.set(id, { x, z, k: h.k });
    village.holes.add(id, x, z, h.k, dropsReady);
  });
  $(r.state).holes.onRemove((_, id) => { holes.delete(id); village.holes.remove(id); });
  for (const i of ROCKS_GONE) village.setRockGone(i, false);
  ROCKS_GONE.clear();
  $(r.state).rocksGone.onAdd((_, key) => {
    const i = Number(key);
    ROCKS_GONE.add(i);
    village.setRockGone(i, true);
    if (dropsReady) { // 지금 막 깨졌으면 와르르
      const rk = WORLD.rocks[i];
      FX.burst('stone', 18, rk.x, 0.5 * rk.s, rk.z, { floor: 0, spread: Math.PI, power: 1.2 });
      FX.burst('dust', 12, rk.x, 0.3, rk.z, { floor: 0, ring: true, power: 1.1 });
    }
  });
  $(r.state).rocksGone.onRemove((_, key) => { ROCKS_GONE.delete(Number(key)); village.setRockGone(Number(key), false); });
  r.onMessage('rockHit', ([sid, i, hp]) => {
    if (sid !== r.sessionId) village.shakeRock(i, 0, 0, 1);
    else if (hp > 0) toast(`🪨 바위에 금이 갔어요! ${hp}번 더 치면 깨져요`);
  });

  // 곤충: 서버가 정한 자리로 그리고, 놀라 날아가거나(bugGone) 잡히면(bugCaught) 없앤다
  for (const id of bugSpots.keys()) village.bugs.remove(id, 'caught');
  bugSpots.clear();
  const bugGone = new Map(); // 곧 없어질 곤충 번호 → 까닭 (상태에서 빠지기 전에 메시지가 먼저 옴)
  $(r.state).bugs.onAdd((b, id) => {
    const sp = BUG_BY_ID[b.s];
    if (!sp) return;
    const put = () => {
      const x = fromCm(b.x);
      const z = fromCm(b.z);
      const y = b.y / 100;
      bugSpots.set(id, { x, y, z });
      return [x, y, z, byteToAngle(b.r), b.f];
    };
    village.bugs.add(id, sp, ...put());
    $(b).onChange(() => village.bugs.set(id, ...put()));
  });
  $(r.state).bugs.onRemove((_, id) => {
    bugSpots.delete(id);
    village.bugs.remove(id, bugGone.get(id) ?? 'caught');
    bugGone.delete(id);
  });
  r.onMessage('bugGone', ([id, why]) => bugGone.set(id, why));
  r.onMessage('bugCaught', ([sid, , id]) => {
    const sp = BUG_BY_ID[id];
    const char = sid === r.sessionId ? me : others.get(sid)?.char;
    if (!sp || !char) return;
    showCatch(char, bugModel(sp), 2.6);
    if (char !== me) return;
    const first = !announced.has(id) && (dex.get(id) ?? 0) <= 1;
    announced.add(id);
    toast(`🦋 ${eul(sp.name)} 잡았다! ${stars(sp.rarity)} ${RARITY[sp.rarity].name}${first ? ' · 도감에 새로 등록!' : ''}`);
  });
  r.onMessage('say', ([sid, text]) => {
    const char = sid === r.sessionId ? me : others.get(sid)?.char;
    if (char && typeof text === 'string') char.say(text, Math.min(7, 2.5 + text.length * 0.12));
  });
  r.onMessage('woodRest', () => toast('이 나무에서는 목재를 다 얻었어요. 잠시 뒤에 다시 찍거나 다른 나무를 찍어 보세요'));
  r.onMessage('netResult', (m) => {
    if (local.netCaught) { village.bugs.hide(local.netCaught, false); local.netCaught = null; } // 그물에 걸린 줄 알았는데 서버는 놓쳤다고
    if (m.full) toast('가방에 이 곤충이 가득 찼어요');
    else if (m.scared) toast('앗, 놓쳤어요! 곤충이 놀라 날아갔어요');
    else if (m.near) toast('아깝다! 곤충을 바라보고 가까이에서 G');
  });
  setTimeout(() => { dropsReady = true; }, 300);

  // 낚시: 서버가 정한 물고기의 흐름(나타남·톡톡·덥석)을 받아 그림자를 찌로 데려온다 (어떤 물고기인지는 잡을 때까지 비밀)
  r.onMessage('fishOn', (o) => {
    const f = local.fishing;
    if (!f || f.id || !f.ambient || !me) return;
    const now = performance.now();
    Object.assign(f, { phase: 'wait', id: o.id, t0: now, nibbles: o.nibbles, bite: o.bite, next: 0 });
    // 이미 찌 쪽으로 오고 있는 물고기에 톡톡·덥석 때를 넣는다 (받은 때 기준)
    village.lure.setTimeline(o.nibbles.map((t) => now + t), now + o.bite);
  });
  r.onMessage('caught', ([sid, id]) => {
    const fish = FISH_BY_ID[id];
    const char = sid === r.sessionId ? me : others.get(sid)?.char;
    if (!fish || !char) return;
    showCatch(char, fishModel(fish));
    if (char !== me) return;
    const first = !announced.has(id) && (dex.get(id) ?? 0) <= 1; // 도감 갱신과 이 알림 중 무엇이 먼저 와도 처음 잡은 것만
    announced.add(id);
    endFishing(false);
    local.actLeft = 0; // 기다리던 자세를 끝내고 바로 낚아 올린다
    startAct(ANIM.FISH_CATCH);
    toast(`🎣 ${eul(fish.name)} 낚았다! ${stars(fish.rarity)} ${RARITY[fish.rarity].name}${first ? ' · 도감에 새로 등록!' : ''}`);
  });
  r.onMessage('escaped', (why) => {
    if (!local.fishing) return;
    endFishing(true);
    local.actLeft = 0;
    toast(why === 'full' ? '가방에 이 물고기가 가득 찼어요'
      : why === 'early' ? '앗, 너무 빨랐어요! 물고기가 놀라 도망갔어요 (찌가 쏙 들어갈 때 G)'
        : '놓쳤다… 찌가 쏙 들어가고 ❗가 뜨면 바로 G!');
  });

  // 서버가 이상한 이동이라고 판단하면 되돌림
  r.onMessage('fix', ([x, z]) => {
    if (!me) return;
    const nx = fromCm(x);
    const nz = fromCm(z);
    const warp = inField(nx, nz) !== inField(me.x, me.z); // 포탈을 탔다
    if (warp) {
      const to = PORTALS.find((p) => inField(p.x, p.z) !== inField(me.x, me.z));
      if (local.fishing) stopFishing();
      me.setPose(nx, nz, to.rot);
      camTarget.set(nx, 0, nz); // 카메라도 바로 옮긴다 (멀리서 미끄러져 오지 않게)
      showMap(inField(nx, nz));
      toast(`🌀 ${PORTALS[to.to].name}에 왔어요!`);
    } else me.setPose(nx, nz, me.targetRot);
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
  $id('behind-btn').classList.remove('hidden');
  $id('dex-btn').classList.remove('hidden');
  $id('info-btn').classList.remove('hidden');
  $id('skills-btn').classList.remove('hidden');
  $id('chat-btn').classList.remove('hidden');
  ui.quick.classList.remove('hidden');
  $id('minimap').classList.remove('hidden');
  $id('map-size').classList.remove('hidden');
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
// 활 조준·지팡이 기 모으기: 방향키를 누르면 그쪽으로 BOW_AIM_TURN 빠르기로 천천히 돌아선다 (걷지는 않는다)
function aimTurn(inp, dt) {
  if (local.hurt > 0 || inp.mag <= 0) return;
  const want = Math.atan2(inp.x * Math.cos(moveYaw()) + inp.z * Math.sin(moveYaw()), -inp.x * Math.sin(moveYaw()) + inp.z * Math.cos(moveYaw()));
  const diff = Math.atan2(Math.sin(want - me.targetRot), Math.cos(want - me.targetRot)); // -π~π 사이로 줄인 남은 각도
  const step = BOW_AIM_TURN * dt;
  me.setPose(me.x, me.z, me.targetRot + THREE.MathUtils.clamp(diff, -step, step));
}
function updateMe(dt) {
  const inp = input.read();
  let anim = ANIM.IDLE;
  if (local.hurt > 0) local.hurt -= dt;
  updateStats(dt);
  updateSkills(dt);
  if (STRIKE_CHARGE[local.act] && local.actLeft > 0 && !local.charged && actTime(local.act) - local.actLeft >= STRIKE_CHARGE[local.act].at) { local.charged = true; chargeFx(me, local.act); }
  local.dodge -= dt; // 0 아래로 내려간 만큼이 쿨타임이 지난 시간
  // 잠자리채: 휘두르기 전에 곤충과의 거리를 맞추는 한 발
  if (local.netStep?.left > 0) {
    const step = Math.min(local.netStep.left, local.netStep.speed * dt);
    local.netStep.left -= step;
    const r = local.netStep.rot;
    const [nx, nz] = resolveMove(me.x, me.z, me.x + Math.sin(r) * step, me.z + Math.cos(r) * step, lifeSpots.length ? [...LIFE_COLLIDERS] : []);
    me.setPose(nx, nz, me.targetRot);
  }
  if (local.dodge > 0) {
    const extra = lifeSpots.length ? [...LIFE_COLLIDERS] : [];
    for (const m of hereMonsters()) extra.push(...m.colliders());
    for (const { char } of others.values()) extra.push({ x: char.x, z: char.z, r: PLAYER_RADIUS });
    const step = DODGE.speed * dt;
    const [nx, nz] = resolveMove(me.x, me.z, me.x + Math.sin(local.dodgeRot) * step, me.z + Math.cos(local.dodgeRot) * step, extra);
    me.setPose(nx, nz, local.dodgeRot);
  } else
  // 공격하는 동안은 방향키로 움직이지 못한다. 동작이 스스로 나아가는 만큼만 보는 쪽으로 움직인다:
  // 대시 공격은 뛰어들었다가 내리친 뒤 멈추고, 목검 찌르기와 더블 점프 내리찍기는 정해진 구간에만 살짝 나아간다
  if (ATTACKS.has(local.act) && local.actLeft > 0) {
    const sec = actTime(local.act) - local.actLeft;
    const glide = ([s0, s1], top) => (sec > s0 && sec < s1 ? top * Math.sin(Math.PI * (sec - s0) / (s1 - s0)) : 0);
    let speed = 0;
    let moveRot = me.targetRot; // 나아가는 쪽 (보통은 보는 쪽)
    if (local.act === ANIM.SMASH_DASH || local.act === ANIM.SLASH_DASH) speed = DASH_SPEED * (1 - THREE.MathUtils.smoothstep(sec / actTime(local.act), 0.35, 0.6));
    else if (local.act === ANIM.DAGGER_DASH) speed = DASH_SPEED * 1.1 * DASH_RATE * (1 - THREE.MathUtils.smoothstep(sec * DASH_RATE, 0.33, 0.43)); // 벨 때까지 빠르게 달려든다 (빨라진 만큼 더 빨리 달려 거리는 그대로)
    else if (local.act === ANIM.DAGGER_SLAM) {
      // 앞 아래로 빠르게 내려가며 벤다 → 착지하면 조금 미끄러지다 멈춘다
      const t = (sec - (local.diveFrom ?? 0.2) - DIVE.raise) * DIVE.rate; // 내려가기 시작한 뒤 동작 안의 시각. 치켜드는 동안(t < 0)은 제자리에 떠 있다
      // 빨라진 만큼 더 빨리 내려가 거리는 그대로 (가장 빠를 때 0.1초에 1.26m: 서버 이동 검사 1.3m 안쪽)
      speed = DIVE.rate * (t < 0 ? 0 : t < DIVE.time ? DIVE_SPEED : DIVE_SPEED * 0.4 * (1 - THREE.MathUtils.smoothstep(t, DIVE.time, DIVE.time + 0.15)));
    }
    else if (local.act === ANIM.SLASH3) speed = glide(THRUST_STEP, THRUST_SPEED);
    else if (STRIKE_STEP[local.act]) speed = glide(...STRIKE_STEP[local.act]);
    else if (STEP_SWINGS.has(local.act)) {
      const h = HIT_DELAY[local.act] / 1000;
      speed = glide([h - 0.2, h + 0.05], SWING_STEP * Math.PI / (2 * 0.25)); // sin 한 봉우리의 넓이 = 최고 속도 × 길이 × 2/π
    }
    else if (local.act === ANIM.SMASH_SLAM || local.act === ANIM.SLASH_SLAM) {
      // 더블 점프 공격: 착지하며 내리찍을 때 살짝 나아가고, 방향키를 누르고 있으면 착지할 때까지 보는 쪽으로 힘차게 나아간다
      speed = glide(SLAM_STEP, SLAM_SPEED);
      if (inp.mag > 0 && sec < LAND.flip) speed = Math.max(speed, (inp.run ? RUN_SPEED : WALK_SPEED) * AIR_ATTACK_BOOST);
    }
    // 점프 공격: 방향키를 누르고 있으면 착지할 때까지 보는 쪽으로 나아가며 휘두른다 (걷기·달리기보다 조금 느리게)
    else if ((local.act === ANIM.SMASH_AIR || local.act === ANIM.SLASH_AIR || local.act === ANIM.BOW_AIR || local.act === ANIM.DAGGER_AIR || local.act === ANIM.DAGGER_AIR2) && inp.mag > 0 && sec < LAND.jump) {
      speed = (inp.run ? RUN_SPEED : WALK_SPEED) * JUMP_ATTACK_BOOST;
    }
    // 활 더블 점프 공격: 방향키를 누르고 있으면 내려앉을 때까지 보는 쪽으로 나아간다
    else if (local.act === ANIM.BOW_SLAM && inp.mag > 0 && sec < BOW_SLAM_LAND) speed = (inp.run ? RUN_SPEED : WALK_SPEED) * JUMP_ATTACK_BOOST;
    // 활 달리기 공격: 뒤를 보고 쏘면서 달리던 쪽으로 미끄러지다 멈춘다
    else if (local.act === ANIM.BOW_BACK) { speed = RUN_SPEED * (1 - THREE.MathUtils.smoothstep(sec / actTime(local.act), 0.05, 0.7)); moveRot = local.backRot; }
    if (local.act === ANIM.STAFF_CHARGE) aimTurn(inp, dt); // 지팡이 기 모으기: 활 조준처럼 방향키로 천천히 돌아선다
    if (local.act === ANIM.STRIKE_BOW) aimTurn(inp, dt); // 활 강타: 기를 모으는 동안 쏠 쪽을 맞춘다
    if (speed > 0 && local.hurt <= 0) {
      const extra = lifeSpots.length ? [...LIFE_COLLIDERS] : [];
      for (const m of hereMonsters()) extra.push(...m.colliders()); // 날개콩은 지나갈 수 없음
      for (const { char } of others.values()) extra.push({ x: char.x, z: char.z, r: PLAYER_RADIUS });
      const [nx, nz] = resolveMove(me.x, me.z, me.x + Math.sin(moveRot) * speed * dt, me.z + Math.cos(moveRot) * speed * dt, extra);
      me.setPose(nx, nz, me.targetRot);
    }
  } else if (BOWS.has(local.act) && local.actLeft > 0) {
    // 활: 조준하는 동안 방향키를 누르면 그쪽으로 천천히 돌아선다 (걷지는 않는다)
    // 한 번에 휙 돌지 않으니 짧게 톡톡 눌러 쏘는 방향을 조금씩 맞출 수 있다. 안 누르면 바라보던 방향 그대로
    if (local.act === ANIM.BOW_AIM) aimTurn(inp, dt);
  } else if (inp.mag > 0 && local.hurt <= 0) {
    // 화면 기준 방향을 카메라가 돈 만큼 돌려 땅 위 방향으로
    const c = Math.cos(moveYaw());
    const sn = Math.sin(moveYaw());
    const wx = inp.x * c + inp.z * sn;
    const wz = -inp.x * sn + inp.z * c;
    const speed = inp.run ? RUN_SPEED : WALK_SPEED * Math.max(0.45, inp.mag);
    const extra = lifeSpots.length ? [...LIFE_COLLIDERS] : [];
    for (const m of hereMonsters()) extra.push(...m.colliders()); // 날개콩은 지나갈 수 없음
    for (const { char } of others.values()) extra.push({ x: char.x, z: char.z, r: PLAYER_RADIUS });
    // 삽으로 판 구덩이는 걸어서 못 지나간다 (뛰어오른 동안에는 넘어간다)
    const airborne = AIRBORNE.has(local.act) && local.actLeft > 0;
    if (!airborne) for (const h of holes.values()) extra.push({ x: h.x, z: h.z, r: HOLE_BLOCK });
    const [nx, nz] = resolveMove(me.x, me.z, me.x + wx * speed * dt, me.z + wz * speed * dt, extra);
    // 구덩이 앞에서 방향키를 계속 누르고 있으면 폴짝 뛰어 넘는다
    // (구덩이에 바짝 붙어 있고, 누르는 방향이 구덩이 쪽(좌우 60도 안)이면 미는 중으로 본다. 비스듬히 밀어도 넘는다)
    const wl = Math.hypot(wx, wz) || 1;
    const intoHole = !airborne && [...holes.values()].some((h) => {
      const dx = h.x - me.x;
      const dz = h.z - me.z;
      const d = Math.hypot(dx, dz);
      return d < HOLE_BLOCK + PLAYER_RADIUS + 0.15 && (dx * wx + dz * wz) / (d * wl) > 0.5;
    });
    local.holePush = intoHole ? (local.holePush ?? 0) + dt : 0;
    me.setPose(nx, nz, Math.atan2(wx, wz));
    anim = inp.run ? ANIM.RUN : ANIM.WALK;
    if (local.holePush > HOLE_JUMP_AFTER && local.actLeft <= 0) { local.holePush = 0; startAct(ANIM.JUMP); }
    if (local.fishing && local.fishing.phase !== 'reeling') stopFishing(); // 움직이면 낚시를 그만둠
    if (!AIRBORNE.has(local.act)) local.actLeft = 0; // 움직이면 감정 표현·생활 행동은 멈춤 (점프는 뛰면서도 가능)
    else if (local.actLeft > 0) {
      // 달리며 뛰었으면 발이 닿자마자 바로 다시 달린다: 착지 뒤 일어서는 자세를 끝까지 틀면 쪼그린 채로 미끄러져 끊겨 보인다
      const land = local.act === ANIM.JUMP ? LAND.jump : LAND.flip;
      // 공중제비는 무릎을 굽혀 받아 내는 모습이 보이도록 조금 더 둔다
      if (actTime(local.act) - local.actLeft >= land + (local.act === ANIM.FLIP ? 0.1 : 0.04)) local.actLeft = 0;
    }
  }
  // 몽둥이를 들고 Z 를 꾹 누르고 있으면 계속 휘두른다. 한 번 눌렀다 떼면 한 번만 휘두른다:
  // 다음 타로 넘어갈지는 미리 예약하지 않고, 넘어가는 그 순간에도 키를 누르고 있는지로 정한다
  // (누른 순간부터 예약하면 짧게 한 번 눌러도 키가 눌려 있던 몇 장면 때문에 2타가 따라 나온다)
  const weapon = TOOLS[local.tool];
  // 단검 더블 점프 공격을 일찍 눌러 두었으면: 공중제비가 DIVE.from 초 돈 때 시작한다 (공중제비가 끝났거나 무기를 바꿨으면 잊는다)
  if (local.diveQueued) {
    const el = actTime(local.act) - local.actLeft;
    if (local.act !== ANIM.FLIP || local.actLeft <= 0 || weapon !== 'dagger' || local.hurt > 0) local.diveQueued = false;
    else if (el >= DIVE.from) { local.diveQueued = false; startSlam(ANIM.DAGGER_SLAM, el); }
  }
  // 단검 점프·대시 공격은 한 번만 눌러도 2타까지: 1타를 벤 끝에 저절로 이어서 되벤다
  if (weapon === 'dagger' && local.actLeft > 0 && local.hurt <= 0) {
    const el = actTime(local.act) - local.actLeft;
    // 점프: 1타를 누른 뒤 0.24초. 착지하기 전에 다 벨 수 있을 때만 (길이가 같아 남은 시간·뛰어오른 높이는 그대로)
    if (local.act === ANIM.DAGGER_AIR && el - (local.airFrom ?? 0) >= AIR_COMBO_AT && el < 0.56) local.act = ANIM.DAGGER_AIR2;
    // 대시: 1타가 왼쪽 어깨 뒤까지 감아 벤 때 (0.5초)
    else if (local.act === ANIM.DAGGER_DASH && el >= DASH_COMBO_AT) { local.act = ANIM.DAGGER_DASH2; local.actLeft = actTime(ANIM.DAGGER_DASH2); }
  }
  const holdSwing = (weapon === 'club' || weapon === 'woodSword' || weapon === 'dagger') && input.holding('attack') && local.hurt <= 0;
  if (holdSwing && local.actLeft <= 0) {
    startAct(weapon === 'club' ? ANIM.SMASH : weapon === 'dagger' ? ANIM.DAGGER1 : ANIM.SLASH1);
  } else if (holdSwing && NEXT_SWING[local.act]) {
    // 넘어가는 때: 휘두른 몽둥이가 관성 끝까지 간 직후의 짧은 구간 (왼손을 놓은 뒤에 넘어가면 동작이 튄다)
    const at = actTime(local.act) - local.actLeft - COMBO_AT[local.act];
    if (at >= 0 && at < 0.06) {
      local.act = NEXT_SWING[local.act];
      local.actLeft = actTime(local.act);
    }
  }
  // 활: 공격키를 떼면 (시위를 충분히 당긴 뒤에) 쏜다. 활을 내려놓았으면 조준을 그만둔다
  if (local.act === ANIM.BOW_AIM && local.actLeft > 0) {
    const drawn = actTime(ANIM.BOW_AIM) - local.actLeft;
    if (local.tool !== BOW) local.actLeft = 0;
    else if (!input.holding('attack') && drawn >= MIN_DRAW) {
      setArrows(local.arrows - 1);
      local.act = ANIM.BOW_SHOT;
      local.actLeft = actTime(ANIM.BOW_SHOT);
    }
  }
  // 활 강타: A를 떼면 (기를 다 모은 뒤에) 쏜다. 짧게 눌렀다 떼도 다 모은 뒤에 쏜다. 활을 내려놓았으면 그만둔다
  if (local.act === ANIM.STRIKE_BOW && local.actLeft > 0) {
    const el = actTime(ANIM.STRIKE_BOW) - local.actLeft;
    if (local.tool !== BOW) local.actLeft = 0;
    else if (!input.holding('skill1') && el >= BOW_STRIKE.rel) {
      if (local.arrows > 0) {
        setArrows(local.arrows - 1);
        local.act = ANIM.STRIKE_BOW_SHOT;
        local.actLeft = actTime(ANIM.STRIKE_BOW_SHOT);
      } else local.actLeft = 0; // 모으는 사이에 화살이 없어졌다
    }
  }
  // 지팡이 강타: A를 누르고 있는 동안 마나가 차는 빠르기가 2배(SKILLS.strike.meditate)가 된다. 떼거나, 움직이거나, 맞거나, 지팡이를 내려놓으면 그만둔다 (마나가 가득해도 계속 모을 수 있다)
  // 찬 만큼은 1초마다 머리 위에 파란 숫자로 보여 준다
  if (local.act === ANIM.STRIKE_STAFF && local.actLeft > 0) {
    const el = actTime(ANIM.STRIKE_STAFF) - local.actLeft;
    const stop = local.tool !== STAFF || local.hurt > 0 || !input.holding('skill1') || inp.mag > 0;
    if (!stop && el >= STRIKE_CHARGE[ANIM.STRIKE_STAFF].at) {
      // 평소 회복(updateStats)은 이미 했으니 나머지 배수만큼 더한다. 머리 위 숫자는 모으는 동안 찬 전부(평소 회복 포함)
      const add = Math.min(ab.mpMax - stats.mp, ab.mpRegen * (SKILLS.strike.meditate - 1) * dt);
      stats.mp += add;
      local.meditateGain += ab.mpRegen * SKILLS.strike.meditate * dt;
      local.meditateT = (local.meditateT ?? 0) + dt;
    }
    const full = stats.mp >= ab.mpMax - 0.01;
    if (full) local.meditateGain = 0; // 가득 찬 뒤로는 더 차지 않으니 숫자도 띄우지 않는다
    if (local.meditateGain >= 1 && (stop || local.meditateT >= 1)) {
      FX.damage(`+${Math.round(local.meditateGain)} MP`, me.x, me.groundY + 2.2, me.z, '#7dd6ff');
      local.meditateGain = 0;
      local.meditateT = 0;
    }
    if (stop) local.actLeft = 0;
  }
  // 지팡이: 공격키를 꾹 누르고 있으면 지팡이를 다 들어 올린 때 기 모으기로 넘어간다 (짧게 누르면 보통 공격 그대로)
  // 모으는 동안 마나가 든다. 다 모은 뒤에는 마나 없이 그대로 들고 있다가 떼면 큰 볼을 쏘고, 다 모으기 전에 떼거나 마나가 떨어지면 보통 볼을 쏜다
  if (local.act === ANIM.STAFF_CAST && local.actLeft > 0 && local.hurt <= 0 && input.holding('attack')) {
    const el = actTime(ANIM.STAFF_CAST) - local.actLeft;
    if (el >= actTime(ANIM.STAFF_CAST) * 0.47 && el < actTime(ANIM.STAFF_CAST) * 0.578) { // 다 들어 올린 뒤 찌르기 전
      local.act = ANIM.STAFF_CHARGE;
      local.actLeft = actTime(ANIM.STAFF_CHARGE);
      local.chargeT = 0;
    }
  } else if (local.act === ANIM.STAFF_CHARGE && local.actLeft > 0) {
    local.chargeT += dt;
    const need = BOLT.chargeCost * dt;
    const full = local.chargeT >= BOLT.charge;
    const fire = (a) => { local.act = a; local.actLeft = actTime(a); };
    if (local.tool !== STAFF || local.hurt > 0) local.actLeft = 0;
    else if (!input.holding('attack')) fire(full ? ANIM.STAFF_BIG : ANIM.STAFF_FIRE); // 떼면 쏜다: 다 모았으면 큰 볼
    else if (full) {} // 다 모은 채로 들고 기다린다 (마나는 더 들지 않는다)
    else if (stats.mp >= need) stats.mp -= need;
    else { statShort('mp'); toast('마나가 모자라요'); fire(ANIM.STAFF_FIRE); }
  }
  // 도끼를 들고 G(또는 Z)를 누르고 있으면 계속 찍는다: 나무에 박혀 멈춘 도끼를 뽑아 다시 뒤로 보냈다가 또 찍는다
  if (TOOLS[local.tool] === 'axe' && (input.holding('life') || input.holding('attack')) && local.hurt <= 0) {
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
  // 낚시: 던지기가 끝나면 입질을 기다리는 자세로, 기다리는 동안은 그 자세를 이어 간다
  if (local.fishing && local.actLeft <= 0 && local.fishing.phase !== 'reeling') startAct(ANIM.FISH_WAIT);
  updateFishing();
  // 생활 행동이 끝나면 잠깐 꺼내 든 도구를 넣고 고른 장비를 다시 든다
  if (local.actLeft <= 0 && local.tool !== local.equip) holdTool(local.equip);
  // 생활 버튼 글자: 가까이 있는 대상에 맞춰 가끔 바꾼다
  local.lifeTimer -= dt;
  if (local.lifeTimer <= 0) {
    local.lifeTimer = 0.2;
    showLife(TOOLS[local.equip] === 'net' || TOOLS[local.equip] === 'shovel' ? TOOLS[local.equip] : findLife(me.x, me.z, lifeSpots)?.tool ?? null); // 잠자리채를 들면 G = 휘두르기
    const grab = nearDrop(me.x, me.z);
    const shake = !grab && findFruit(me.x, me.z);
    ui.pickBtn.classList.toggle('hidden', !grab && !shake);
    const label = grab ? `${FRUIT_ICON[VILLAGE_FRUIT]}<span>F 줍기</span>` : '🌳<span>F 흔들기</span>';
    if (ui.pickBtn.dataset.label !== label) { ui.pickBtn.dataset.label = label; ui.pickBtn.innerHTML = label; }
  }
  if (local.actLeft > 0) {
    local.actLeft -= dt;
    anim = local.act;
  }
  me.setAnim(anim);

  // 포탈: 문 가운데로 들어서는 순간 한 번 서버에 알린다 (서버가 옮겨 주면 'fix'로 받는다)
  const gate = PORTALS.findIndex((p) => Math.hypot(me.x - p.x, me.z - p.z) < PORTAL.reach);
  if (gate >= 0 && local.gate !== gate && room) room.send('portal', gate);
  local.gate = gate;

  // 움직임이 있을 때만 초당 10회 전송
  local.sendTimer += dt;
  if (local.sendTimer >= SEND_INTERVAL && room) {
    local.sendTimer %= SEND_INTERVAL; // 남은 시간을 넘겨 정확히 0.1초마다 (0으로 되돌리면 60fps에서 0.117초마다가 돼 서버 묶음과 계속 어긋난다)
    const msg = [toCm(me.x), toCm(me.z), angleToByte(me.targetRot), anim, local.tool, local.arrows];
    const l = local.last;
    if (!l || msg.some((v, i) => v !== l[i])) {
      room.send('m', [...msg, Math.round(performance.now() / 10) % 65535 + 1]); // 끝은 보낸 때 (10ms 단위, 1~65535): 받는 쪽이 자리 사이 간격을 고르게 잡는다
      local.last = msg;
      // 서버가 다시 켜져 새로 들어갈 때 이 자리·방향으로 돌아오도록 기억 (이 탭에만)
      store.set(sessionStorage, 'spot', JSON.stringify({ x: me.x, z: me.z, r: msg[2] }));
    }
  }
}

// ── 다른 학생: 200ms 늦게 그리면서 사이를 채움 ──
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
    // 강타 기 모으기 연출 (활 강타는 화살이 맞히므로 휘두르기 맞음 검사는 없다)
    if (STRIKE_CHARGE[char.anim] && char.anim !== prevAnim) { o.chargeAt = now + STRIKE_CHARGE[char.anim].at * 1000; o.chargeAnim = char.anim; }
    if (o.chargeAt && now >= o.chargeAt) { o.chargeAt = 0; if (char.anim === o.chargeAnim) chargeFx(char, o.chargeAnim); }
    if (o.hitAt && now >= o.hitAt) {
      o.hitAt = 0;
      const strike = STRIKE_ANIMS.has(o.hitAnim); // 강타: 더 넓게 맞고 더 아프다
      const test = strike ? inStrike
        : o.hitAnim === ANIM.SLASH3 ? inThrust : o.hitAnim === ANIM.DAGGER_SLAM ? inDive : inSwing;
      // 다른 학생에게 맞으면 데미지 없이 움찔만 (체력은 그대로)
      if (me && local.dodge <= 0 && local.hurt <= 0 && test(char.x, char.z, char.targetRot, me.x, me.z)) ouch(char.x, char.z);
    }
  }
}

// 개발 중 점검용 (그리기 횟수 등 확인)
// step: 화면이 가려져 그리기가 멈춘 동안에도 내 캐릭터만 정해진 시간만큼 움직여 보는 점검용
if (import.meta.env.DEV) window.__game = { field, renderer, scene, camera, others, cam, local, input, FX, arrows, setArrows, hereMonsters, stats, get me() { return me; }, get room() { return room; }, step(dt) { updateMe(dt); me?.update(dt); } };

// ── 매 장면 ──
const clock = new THREE.Clock();
const minimap = createMinimap($id('minimap'));
// 미니맵 크기: 왼쪽 위 손잡이를 끌어 키우고 줄인다 (이 브라우저에 기억). 고르기 전에는 화면 크기에 맞춘 기본 크기 (style.css)
const MAP_MIN = 90;
const mapMax = () => Math.max(MAP_MIN, Math.min(innerWidth, innerHeight) * 0.45); // 화면 짧은 변의 45%까지
const mapNow = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--map'));
function setMapSize(px) {
  const v = Math.round(Math.max(MAP_MIN, Math.min(mapMax(), px)));
  document.documentElement.style.setProperty('--map', `${v}px`);
  return v;
}
{
  const saved = Number(store.get(localStorage, 'mapPx'));
  if (saved > 0) setMapSize(saved);
  const grip = $id('map-size');
  let drag = null;
  grip.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    grip.setPointerCapture(e.pointerId);
    grip.classList.add('drag');
    drag = { x: e.clientX, y: e.clientY, size: mapNow() };
  });
  grip.addEventListener('pointermove', (e) => {
    if (!drag) return;
    // 지도는 오른쪽 아래에 붙어 있으니 왼쪽·위로 끌면 커지고, 오른쪽·아래로 끌면 작아진다
    setMapSize(drag.size + Math.max(drag.x - e.clientX, drag.y - e.clientY));
  });
  const end = () => {
    if (!drag) return;
    drag = null;
    grip.classList.remove('drag');
    store.set(localStorage, 'mapPx', String(mapNow()));
  };
  grip.addEventListener('pointerup', end);
  grip.addEventListener('pointercancel', end);
  addEventListener('resize', () => { if (store.get(localStorage, 'mapPx') !== null) setMapSize(mapNow()); });
}
const viewFrustum = new THREE.Frustum();
const viewMatrix = new THREE.Matrix4();
const viewSphere = new THREE.Sphere(new THREE.Vector3(), 3); // 캐릭터 + 머리 위 이름·든 물건·휘두른 궤적
const FAR_ANIM = 9;
let frameNo = 0;
let slowFrames = 0;
let slowTime = 0;
let slowFor = 0;
// 낮춘 화질은 이 기기에 기억해 [낮춘 횟수, 해상도 배율, 외곽선 끔], 다음에는 느린 채로 몇 초 버티지 않고 처음부터 그 화질로 시작한다
let [qStep, qRatio, qLines] = (() => {
  try { const q = JSON.parse(store.get(localStorage, 'quality')); if (q[0] > 0 && q[1] >= 0.5) return q; } catch { /* 기억한 것 없음 */ }
  return [0, Infinity, false];
})();
renderer.setPixelRatio(Math.min(renderer.getPixelRatio(), qRatio));
let noLines = LOW || !!qLines; // 다른 학생의 외곽선을 끈 상태인지 (자동 화질 2단계, ?q=low 는 처음부터)
// FPS 를 누르면 처음 화질로 되돌린다 (어쩌다 한 번 느렸던 기기가 계속 낮은 화질에 머물지 않게)
ui.fps.style.cssText += ';pointer-events:auto;cursor:pointer';
ui.fps.onclick = () => {
  if (!qStep || !confirm('화질을 처음으로 되돌릴까요? (화면을 새로 고칩니다)')) return;
  store.del(localStorage, 'quality');
  location.reload();
};
let fpsFrames = 0;
let fpsTime = 0;

// 나무·건물이 내 캐릭터를 가리면 그 부분을 비쳐 보이게 (materials.js HOLE)
const holeV = new THREE.Vector3();
const holeSize = new THREE.Vector2();
function updateHole() {
  if (!me) { HOLE.center.z = 0; return; }
  holeV.set(me.x, 0.9, me.z).applyMatrix4(camera.matrixWorldInverse);
  const depth = -holeV.z;
  holeV.applyMatrix4(camera.projectionMatrix); // 화면 좌표(-1~1)
  renderer.getDrawingBufferSize(holeSize);
  HOLE.depth.value = depth;
  HOLE.center.set((holeV.x * 0.5 + 0.5) * holeSize.x, (holeV.y * 0.5 + 0.5) * holeSize.y,
    1.3 * holeSize.y * 0.5 / (Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * Math.max(depth, 0.5))); // 반지름 약 1.3m
}
function frame() {
  const rawDt = clock.getDelta();
  const realDt = Math.min(rawDt, 0.05);
  if (rawDt < 0.12) { slowFrames++; slowTime += rawDt; } // 창이 가려져 장면이 드문드문 오는 때는 세지 않는다
  const now = performance.now();
  // 히트스톱: 맞는 순간 아주 잠깐 캐릭터·파티클을 멈춰 '퍽' 하는 손맛을 준다 (카메라·풍경은 계속)
  const dt = FX.simDt(realDt);
  village.update(realDt, now / 1000);
  field.update(now / 1000);
  if (me && inField(me.x, me.z) !== onField) showMap(!onField);

  if (me) updateMe(dt);
  updateOthers(now);

  // 카메라는 부드럽게 따라감. exp 로 줄여야 장면 빠르기가 출렁여도 캐릭터가 화면에서 앞뒤로 떨리지 않는다
  if (me) camTarget.lerp(camWant.set(me.x, 0, me.z), 1 - Math.exp(-dt * 5));
  else camTarget.set(Math.sin(now / 6000) * 6, 0, 3 + Math.cos(now / 6000) * 4); // 입장 전: 천천히 둘러보기
  // V: 카메라가 등 뒤로 돌아간다. 스프링(임계 감쇠)이라 스르르 빨라졌다 스르르 멈춘다.
  // 목표는 V 를 누른 순간 정해진다: 맞추는 동안 캐릭터가 돌아도 카메라가 쫓아 돌지 않는다
  if (me && local.recenter != null) {
    const diff = local.recenter - cam.yaw;
    const w = RECENTER_RATE;
    if (Math.abs(Math.atan2(Math.sin(diff), Math.cos(diff))) < 0.01) { local.recenter = null; saveCam(); }
    local.yawVel = (local.yawVel ?? 0) + (Math.atan2(Math.sin(diff), Math.cos(diff)) * w * w - 2 * w * (local.yawVel ?? 0)) * realDt;
    camGoal.yaw = cam.yaw += local.yawVel * realDt; // 스프링이 이미 부드러우니 목표도 함께 옮긴다
  } else if (local.yawVel) { local.yawVel *= Math.exp(-realDt * 6); camGoal.yaw = cam.yaw += local.yawVel * realDt; } // 멈출 때도 스르르
  const ease = 1 - Math.exp(-realDt * CAM_EASE);
  cam.yaw += (camGoal.yaw - cam.yaw) * ease;
  cam.pitch += (camGoal.pitch - cam.pitch) * ease;
  cam.zoom *= (camGoal.zoom / cam.zoom) ** (ease * 0.7); // 거리는 배율로 (가까울 때·멀 때 똑같은 느낌), 조금 더 느긋하게
  const d = cam.dist * camScale * cam.zoom;
  camOffset.set(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch));
  camera.position.copy(camTarget).addScaledVector(camOffset, d);
  // 잠자리채로 잡는 순간: 카메라가 살짝 다가가며 떨렸다가 돌아온다
  if (local.camKick > 0) {
    local.camKick = Math.max(0, local.camKick - realDt / 0.28);
    const k = local.camKick * local.camKick;
    camera.position.addScaledVector(camOffset, -d * 0.06 * k);
    camera.position.y += Math.sin(now * 0.08) * 0.05 * k;
  }
  camera.lookAt(camTarget.x, 0.8, camTarget.z);
  // 멀리 볼수록 안개를 옅게 (멀리 빼도 내 주변이 뿌옇게 되지 않게)
  scene.fog.density = FOG_DENSITY / Math.max(1, cam.zoom * camScale);
  setCurveCenter(camTarget.x, camTarget.z, cam.yaw);
  // 둥근 지평선의 중심을 정한 뒤에 캐릭터를 내린다 (한 프레임 늦으면 걸을 때 발이 땅과 어긋남)
  // 그물이 턱 막히면 내 캐릭터만 잠깐 그 자세로 멈췄다가 휘두르기를 그만둔다 (세상과 카메라는 그대로 흘러 렉처럼 보이지 않는다)
  if (local.netStuck > 0) {
    local.netStuck -= realDt;
    if (local.netStuck <= 0 && NET_ANIMS.has(local.act)) local.actLeft = 0;
  }
  if (me) me.update(local.netStuck > 0 ? 0 : dt);
  checkNetCatch();
  // 화면 밖 학생은 숨기고 움직이지도 않는다 (숨기지 않으면 보이지 않아도 매 장면 뼈대를 계산한다).
  // 동작 중이면 화면 밖이어도 움직인다: 화면 밖에서 쏜 화살·휘두른 타격이 그 동작의 '맞는 순간'에 나온다
  camera.updateMatrixWorld();
  updateHole();
  viewFrustum.setFromProjectionMatrix(viewMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  // 내게서 FAR_ANIM(m)보다 먼 학생은 두 장면에 한 번만 움직인다 (그동안 흐른 시간을 모아서): 팔·도구 자세 계산이 한 명당 0.2ms 라 여럿이면 크다
  frameNo++;
  let nth = 0;
  for (const { char } of others.values()) {
    viewSphere.center.set(char.x, 1, char.z);
    char.root.visible = viewFrustum.intersectsSphere(viewSphere);
    char.lag = (char.lag ?? 0) + dt;
    if (!char.root.visible && char.actLeft <= 0) continue;
    if ((frameNo + nth++) % 2 && Math.hypot(char.x - camTarget.x, char.z - camTarget.z) > FAR_ANIM) continue;
    char.update(Math.min(char.lag, 0.1)); // 화면 밖에 오래 있다 돌아왔으면 한꺼번에 넘기지 않는다
    char.lag = 0;
  }
  checkNetBonks(); // 다른 학생들도 움직인 뒤에
  for (const m of hereMonsters()) m.update(dt, me);
  arrows.update(dt);
  // 활을 당기는 동안: 지금 놓으면 화살이 날아갈 길을 희미하게 보여 준다 (당긴 만큼 길어진다)
  const aiming = me && local.act === ANIM.BOW_AIM && local.actLeft > 0 && me.anim === ANIM.BOW_AIM && me.aimAt != null;
  // 활 강타: 끝까지 당긴 뒤 기를 모으는 동안에도 (끝까지 당긴 길로) 보여 준다
  const striking = me && local.act === ANIM.STRIKE_BOW && me.anim === ANIM.STRIKE_BOW && local.actLeft > 0
    && actTime(local.act) - local.actLeft >= BOW_STRIKE.draw;
  arrows.aimGuide(aiming || striking ? me : null, aiming ? bowDrawn(me.time - me.aimAt) : 1, arrowWouldHit);
  FX.update(dt);
  updateShows(dt);

  for (const label of onField ? field.labels : village.labels) {
    const b = label.userData.base;
    label.position.set(b.x, b.y - curveDrop(b.x, b.z), b.z);
  }

  renderer.render(scene, camera);
  if (me) minimap.draw(me, [...others.values()].map((o) => o.char), cam.yaw);

  fpsFrames++;
  fpsTime += realDt;
  if (fpsTime >= 0.5) {
    ui.fps.textContent = `${Math.round(fpsFrames / fpsTime)} FPS${qStep ? ` · 화질 -${qStep}` : ''}`;
    // 자동 화질: 2초 넘게 30fps 에 못 미치면 한 단계씩 낮춘다. 해상도 0.75배까지(20%씩) → 다른 학생 외곽선 끄기 → 해상도 0.5배까지
    // 해상도는 화면 칠하기가 벅찬 기기(태블릿)에, 외곽선은 그리기 횟수가 벅찬 기기에 듣는다
    // shortcut: 한 번 낮추면 다시 올리지 않는다 (오르내리며 깜빡이지 않게), 올려야 하면 새로고침
    slowFor = slowFrames > 5 && slowTime / slowFrames > 1 / 30 ? slowFor + 1 : 0;
    slowFrames = slowTime = 0;
    if (slowFor >= 4 && (renderer.getPixelRatio() > 0.5 || !noLines)) {
      if (renderer.getPixelRatio() <= 0.75 && !noLines) {
        noLines = true;
        for (const o of others.values()) o.char.setOutline(false);
      } else renderer.setPixelRatio(Math.max(noLines ? 0.5 : 0.75, renderer.getPixelRatio() * 0.8));
      store.set(localStorage, 'quality', JSON.stringify([++qStep, renderer.getPixelRatio(), noLines]));
      slowFor = -4; // 낮춘 효과가 보일 때까지 잠깐 기다린다
    }
    fpsFrames = 0;
    fpsTime = 0;
  }
}
renderer.setAnimationLoop(frame);
if (import.meta.env.DEV) window.__game.frame = frame; // 점검용: 창이 가려져 있어도 한 장면에 드는 시간을 잴 수 있게
