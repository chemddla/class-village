// 우리 반 마을 - 1단계 시제품 (이동 + 동시 접속)
import * as THREE from 'three';
import { Client, getStateCallbacks } from 'colyseus.js';
import {
  ANIM, COLORS, WALK_SPEED, RUN_SPEED, resolveMove, toCm, fromCm, angleToByte, byteToAngle,
} from '../../shared/world.js';
import { buildVillage } from './village.js';
import { Character } from './character.js';
import { createInput } from './input.js';
import { setCurveCenter, curveDrop } from './materials.js';

const params = new URLSearchParams(location.search);
const LOW = params.get('q') === 'low';
const SERVER = params.get('server')
  || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:2567`;
const SEND_INTERVAL = 0.1; // 초당 10회
const INTERP_DELAY = 150; // 다른 학생은 150ms 늦게 그림
const WAVE_TIME = 1.6;

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
const CAM_OFFSET = new THREE.Vector3(0, 12.5, 13.5);
const camTarget = new THREE.Vector3(0, 0, 3);
let camScale = 1;

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
  fps: $id('fps'), action: $id('action'), hint: $id('hint'), reconnect: $id('reconnect'),
};

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
const local = { sendTimer: 0, waveTimer: 0, last: null };

const input = createInput({
  onAction() {
    if (!me) return;
    local.waveTimer = WAVE_TIME;
    me.wave();
  },
});

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
      me = new Character(p.name, p.color);
      me.setPose(fromCm(p.x), fromCm(p.z), byteToAngle(p.r));
      me.root.rotation.y = me.targetRot;
      scene.add(me.root);
      camTarget.set(me.x, 0, me.z);
      local.last = null;
    } else {
      const char = new Character(p.name, p.color);
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
      };
      push();
      $(p).onChange(push);
    }
    setPeople();
  });

  $(r.state).players.onRemove((p, id) => {
    const o = others.get(id);
    if (o) { o.char.dispose(); others.delete(id); }
    setPeople();
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
  ui.action.classList.remove('hidden');
  ui.hint.classList.remove('hidden');
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
    const r = await client.joinOrCreate('village', { name, color: chosenColor });
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
  if (inp.mag > 0) {
    const speed = inp.run ? RUN_SPEED : WALK_SPEED * Math.max(0.45, inp.mag);
    const [nx, nz] = resolveMove(me.x, me.z, me.x + inp.x * speed * dt, me.z + inp.z * speed * dt);
    me.setPose(nx, nz, Math.atan2(inp.x, inp.z));
    anim = inp.run ? ANIM.RUN : ANIM.WALK;
    local.waveTimer = 0;
  } else if (local.waveTimer > 0) {
    local.waveTimer -= dt;
    anim = ANIM.WAVE;
  }
  me.anim = anim;

  // 움직임이 있을 때만 초당 10회 전송
  local.sendTimer += dt;
  if (local.sendTimer >= SEND_INTERVAL && room) {
    local.sendTimer = 0;
    const msg = [toCm(me.x), toCm(me.z), angleToByte(me.targetRot), anim];
    const l = local.last;
    if (!l || l[0] !== msg[0] || l[1] !== msg[1] || l[2] !== msg[2] || l[3] !== msg[3]) {
      room.send('m', msg);
      local.last = msg;
    }
  }
}

// ── 다른 학생: 150ms 늦게 그리면서 사이를 채움 ──
function updateOthers(now) {
  const renderT = now - INTERP_DELAY;
  for (const { char, buf } of others.values()) {
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
  }
}

// 개발 중 점검용 (그리기 횟수 등 확인)
if (import.meta.env.DEV) window.__game = { renderer, scene, camera, others, get me() { return me; } };

// ── 매 장면 ──
const clock = new THREE.Clock();
let fpsFrames = 0;
let fpsTime = 0;

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const now = performance.now();

  if (me) updateMe(dt);
  updateOthers(now);
  if (me) me.update(dt);
  for (const { char } of others.values()) char.update(dt);

  // 카메라는 비스듬히 내려다보며 부드럽게 따라감
  if (me) camTarget.lerp(new THREE.Vector3(me.x, 0, me.z), Math.min(1, dt * 5));
  else camTarget.set(Math.sin(now / 6000) * 6, 0, 3 + Math.cos(now / 6000) * 4); // 입장 전: 천천히 둘러보기
  camera.position.copy(camTarget).addScaledVector(CAM_OFFSET, camScale);
  camera.lookAt(camTarget.x, 0.8, camTarget.z);
  setCurveCenter(camTarget.x, camTarget.z);

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
