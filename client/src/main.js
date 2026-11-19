// 우리 반 마을 - 1단계 시제품 (이동 + 동시 접속)
import * as THREE from 'three';
import { Client, getStateCallbacks } from 'colyseus.js';
import {
  ANIM, COLORS, TOOLS, LIFE_TOOLS, LIFE_SPOTS, LIFE_COLLIDERS, PLAYER_RADIUS, WALK_SPEED, RUN_SPEED, resolveMove, inSwing, toCm, fromCm, angleToByte, byteToAngle,
} from '../../shared/world.js';
import { buildVillage } from './village.js';
import { Character, actTime } from './character.js';
import { LIFE, findTarget, buildLifeSpots } from './life.js';
import { createLookEditor } from './look-editor.js';
import { EQUIPMENT } from './villager/equipment.js';
import { createInput } from './input.js';
import { setCurveCenter, curveDrop } from './materials.js';

const params = new URLSearchParams(location.search);
const LOW = params.get('q') === 'low';
// 실제 서버(HTTPS)에서는 같은 주소의 /colyseus 경로로 접속한다 (학교 방화벽 대비 443 포트만 사용)
// 내 컴퓨터 시험(HTTP)에서는 기존처럼 2567 포트로 접속한다
const SERVER = params.get('server')
  || (location.protocol === 'https:'
    ? `wss://${location.host}/colyseus`
    : `ws://${location.hostname}:2567`);
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
scene.background = new THREE.Color(0xbfe6ff);
scene.fog = new THREE.Fog(0xbfe6ff, 26, 52);
scene.add(new THREE.HemisphereLight(0xfffaf0, 0x9ccf7a, 1.7));
const sun = new THREE.DirectionalLight(0xffffff, 1.9);
sun.position.set(8, 15, 6);
scene.add(sun);

const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 150);
const camTarget = new THREE.Vector3(0, 0, 3);
let camScale = 1;
// 시점: 마우스 왼쪽 끌기로 돌리기(yaw)·기울기(pitch), 휠로 거리(zoom). 처음 값은 예전 고정 시점과 같음
const cam = { yaw: 0, pitch: Math.atan2(12.5, 13.5), dist: Math.hypot(12.5, 13.5), zoom: 1 };
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

const village = buildVillage(scene);

// ── 화면 요소 ──
const $id = (id) => document.getElementById(id);
const ui = {
  join: $id('join'), form: $id('join-form'), name: $id('name'), colors: $id('colors'),
  joinBtn: $id('join-btn'), error: $id('join-error'), hud: $id('hud'), people: $id('people'),
  fps: $id('fps'), actions: $id('actions'), hint: $id('hint'), reconnect: $id('reconnect'),
  toolBtn: $id('tool-btn'), lifeBtn: $id('life-btn'), toast: $id('toast'), inv: $id('inv-panel'), invBtn: $id('inv-btn'),
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
// act: 지금 하는 잠깐 동작(ANIM 번호), actLeft: 남은 시간, tool: 든 도구 번호
const local = { sendTimer: 0, act: ANIM.IDLE, actLeft: 0, tool: 0, last: null, hurt: 0 };
const HIT_DELAY = 0.45 * 1000; // 휘두르기 시작 → 내려찍는 순간 (clubSmash 0.9초 × hitAt 0.5)
function getHit(fromX, fromZ) {
  local.act = ANIM.SURPRISE; // 'hit' 피격 모션
  local.actLeft = actTime(ANIM.SURPRISE);
  local.hurt = local.actLeft; // 맞는 동안은 움직여도 끊기지 않음
  me.setPose(me.x, me.z, Math.atan2(fromX - me.x, fromZ - me.z)); // 때린 쪽으로 돌아봄
}
const EMOTES = { emote1: ANIM.WAVE, emote2: ANIM.CHEER, emote3: ANIM.SURPRISE, emote4: ANIM.FAINT };
const TOOL_ICON = { none: '✋', axe: '🪓', rod: '🎣', club: '🏏' };
const LIFE_ICON = { none: '🌼', axe: '🌳', rod: '🐟', club: '💥' };
const LIFE_LABEL = { none: '채집', axe: '벌목', rod: '낚시', club: '공격' };
let invItems = [0, 1, 2]; // 가진 도구 번호. 테스트 서버에선 나무 몽둥이(3)를 하나 줌
let lifeSpots = []; // 테스트 서버에서만 광장에 놓는 체험용 나무·연못·덤불
let lifeSpotsMesh = null;

function showTool() {
  const t = TOOLS[local.tool];
  ui.toolBtn.innerHTML = `${TOOL_ICON[t]}<span>Q ${EQUIPMENT[t].label}</span>`;
  ui.lifeBtn.innerHTML = `${LIFE_ICON[t]}<span>G ${LIFE_LABEL[t]}</span>`;
}
showTool();

function equipTool(t) {
  if (local.actLeft > 0) return;
  local.tool = t;
  me?.setTool(t);
  showTool();
  renderInv();
}
function renderInv() {
  ui.inv.innerHTML = '<h3>🎒 인벤토리 <small>(I)</small></h3>';
  const row = document.createElement('div');
  row.className = 'look-row';
  for (const t of invItems) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = t === local.tool ? 'on' : '';
    b.textContent = `${TOOL_ICON[TOOLS[t]]} ${EQUIPMENT[TOOLS[t]].label}`;
    b.onclick = () => equipTool(t);
    row.appendChild(b);
  }
  ui.inv.appendChild(row);
}
renderInv();

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
      equipTool((local.tool + 1) % LIFE_TOOLS);
    } else if (name === 'inv') {
      ui.inv.classList.toggle('hidden');
    } else if (name === 'attack' || (name === 'life' && TOOLS[local.tool] === 'club')) {
      if (TOOLS[local.tool] === 'club') startAct(ANIM.SMASH);
    } else if (name === 'life') {
      if (local.actLeft > 0) return;
      const tool = TOOLS[local.tool];
      const t = findTarget(tool, me.x, me.z, lifeSpots);
      if (!t) { toast(`${LIFE[tool].what} 가까이에서 해 보세요 (Q로 도구 바꾸기)`); return; }
      me.setPose(me.x, me.z, Math.atan2(t.x - me.x, t.z - me.z)); // 대상 쪽으로 돌아섬
      startAct(LIFE[tool].anim);
    }
  },
  onOrbit(dx, dy) {
    cam.yaw -= dx * 0.006;
    cam.pitch = THREE.MathUtils.clamp(cam.pitch + dy * 0.004, 0.3, 1.3);
  },
  onZoom(dy) {
    cam.zoom = THREE.MathUtils.clamp(cam.zoom * Math.exp(dy * 0.0012), 0.4, 1.6);
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
    invItems = free ? [0, 1, 2, 3] : [0, 1, 2];
    if (!invItems.includes(local.tool)) equipTool(0);
    renderInv();
    if (free && !lifeSpotsMesh) lifeSpotsMesh = buildLifeSpots(scene);
  });

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

async function tryReconnect() {
  const token = store.get(sessionStorage, 'reconnect');
  if (!token) { location.reload(); return; }
  input.enable(false);
  ui.reconnect.classList.remove('hidden');
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const r = await client.reconnect(token);
      clearPlayers();
      attach(r);
      ui.reconnect.classList.add('hidden');
      input.enable(true);
      return;
    } catch {
      await new Promise((ok) => setTimeout(ok, 2000));
    }
  }
  store.del(sessionStorage, 'reconnect');
  ui.reconnect.querySelector('.card').textContent = '다시 연결하지 못했어요. 화면을 새로고침해 주세요.';
}

function enterGame() {
  ui.join.classList.add('hidden');
  ui.hud.classList.remove('hidden');
  ui.actions.classList.remove('hidden');
  ui.hint.classList.remove('hidden');
  ui.invBtn.classList.remove('hidden');
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
    const r = await client.joinOrCreate('village', { name, color: chosenColor, look: lookEditor.look });
    attach(r);
    enterGame();
  } catch (err) {
    console.error(err);
    ui.error.textContent = '서버에 연결하지 못했어요. 서버가 켜져 있는지 확인해 주세요.';
  } finally {
    ui.joinBtn.disabled = false;
  }
});

// 새로고침·화면 꺼짐 뒤에는 자동으로 원래 자리로 돌아감
(async () => {
  const token = store.get(sessionStorage, 'reconnect');
  if (!token) return;
  try {
    const r = await client.reconnect(token);
    attach(r);
    enterGame();
  } catch {
    store.del(sessionStorage, 'reconnect');
  }
})();

// ── 내 캐릭터 움직이기 ──
function updateMe(dt) {
  const inp = input.read();
  let anim = ANIM.IDLE;
  if (local.hurt > 0) local.hurt -= dt;
  if (inp.mag > 0 && local.hurt <= 0) {
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
    if (local.act !== ANIM.JUMP && local.act !== ANIM.FLIP) local.actLeft = 0; // 움직이면 감정 표현·생활 행동은 멈춤 (점프는 뛰면서도 가능)
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
    }
  }
}

// ── 다른 학생: 150ms 늦게 그리면서 사이를 채움 ──
function updateOthers(now) {
  const renderT = now - INTERP_DELAY;
  for (const o of others.values()) {
    const { char, buf } = o;
    const wasSmash = char.anim === ANIM.SMASH;
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
    if (char.anim === ANIM.SMASH && !wasSmash) o.hitAt = now + HIT_DELAY;
    if (o.hitAt && now >= o.hitAt) {
      o.hitAt = 0;
      if (me && inSwing(char.x, char.z, char.targetRot, me.x, me.z)) getHit(char.x, char.z);
    }
  }
}

// 개발 중 점검용 (그리기 횟수 등 확인)
if (import.meta.env.DEV) window.__game = { renderer, scene, camera, others, cam, local, input, get me() { return me; }, get room() { return room; } };

// ── 매 장면 ──
const clock = new THREE.Clock();
let fpsFrames = 0;
let fpsTime = 0;

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const now = performance.now();

  if (me) updateMe(dt);
  updateOthers(now);

  // 카메라는 비스듬히 내려다보며 부드럽게 따라감
  if (me) camTarget.lerp(new THREE.Vector3(me.x, 0, me.z), Math.min(1, dt * 5));
  else camTarget.set(Math.sin(now / 6000) * 6, 0, 3 + Math.cos(now / 6000) * 4); // 입장 전: 천천히 둘러보기
  const d = cam.dist * camScale * cam.zoom;
  camOffset.set(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch));
  camera.position.copy(camTarget).addScaledVector(camOffset, d);
  camera.lookAt(camTarget.x, 0.8, camTarget.z);
  // 멀리 볼수록 안개도 멀리 (멀리 빼도 내 주변이 뿌옇게 되지 않게)
  scene.fog.near = 26 * Math.max(1, cam.zoom);
  scene.fog.far = 52 * Math.max(1, cam.zoom);
  setCurveCenter(camTarget.x, camTarget.z, cam.yaw);
  // 둥근 지평선의 중심을 정한 뒤에 캐릭터를 내린다 (한 프레임 늦으면 걸을 때 발이 땅과 어긋남)
  if (me) me.update(dt);
  for (const { char } of others.values()) char.update(dt);

  for (const label of village.labels) {
    const b = label.userData.base;
    label.position.set(b.x, b.y - curveDrop(b.x, b.z), b.z);
  }

  renderer.render(scene, camera);

  fpsFrames++;
  fpsTime += dt;
  if (fpsTime >= 0.5) {
    ui.fps.textContent = `${Math.round(fpsFrames / fpsTime)} FPS`;
    fpsFrames = 0;
    fpsTime = 0;
  }
});
