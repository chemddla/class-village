// 조작: 화면 조이스틱(태블릿) + 방향키/WASD(컴퓨터, 같은 방향 두 번 연타 후 누르고 있으면 달리기)
// Shift 회피 대시(마우스 쪽으로) · Space 점프 · Ctrl+1~4 감정 표현 · Q 무기 바꾸기 · R 생활 도구(도끼·낚싯대) 들기 · G 생활 행동(필요한 도구는 알아서 듦) · F 과일나무 흔들기·떨어진 과일 줍기 · I 인벤토리 · B 도감 · Z/왼쪽 클릭 공격(꾹 누르면 연속) · 마우스 왼쪽 끌기 시점 돌리기 · 휠 확대/축소
const JOY_RADIUS = 58; // 손잡이가 움직일 수 있는 최대 거리(px)
const RUN_AT = 0.8; // 이만큼 이상 밀면 달리기

// 키 → 행동 이름 (화면 버튼은 data-key 로 같은 키를 누른 것처럼 동작)
const ACTION_KEYS = {
  Space: 'jump', ShiftLeft: 'dodge', ShiftRight: 'dodge', KeyQ: 'tool', KeyR: 'lifeTool', KeyG: 'life', KeyF: 'pick', KeyI: 'inv', KeyB: 'dex', KeyZ: 'attack',
  Digit1: 'emote1', Digit2: 'emote2', Digit3: 'emote3', Digit4: 'emote4',
  Numpad1: 'emote1', Numpad2: 'emote2', Numpad3: 'emote3', Numpad4: 'emote4',
};
// 감정 표현은 Ctrl 을 누른 채 숫자를 눌러야 나온다 (숫자만 누르면 아무 일 없음)
const isEmote = (name) => name.startsWith('emote');
// 키보드로 누른 키가 어떤 행동인지: Ctrl 조합이 맞지 않으면 없음
const keyAction = (e) => {
  const name = ACTION_KEYS[e.code];
  if (!name) return null;
  return isEmote(name) === e.ctrlKey ? name : null;
};

export function createInput({ onAction, onOrbit, onZoom }) {
  const keys = new Set();
  const held = new Set(); // 누르고 있는 행동 키·화면 버튼 (꾹 누르면 연속 공격)
  const joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
  const base = document.getElementById('joy-base');
  const knob = document.getElementById('joy-knob');
  let enabled = false;

  // ── 키보드 ──
  const KEYMAP = {
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  };
  // 같은 방향키를 빠르게 두 번 누르면, 두 번째로 누른 키를 누르고 있는 동안 달린다
  const TAP_MS = 300;
  let lastTap = { dir: null, t: 0 };
  let runDir = null;
  addEventListener('keydown', (e) => {
    if (!enabled) return;
    const dir = KEYMAP[e.code];
    if (dir) {
      keys.add(dir);
      e.preventDefault();
      if (!e.repeat) {
        const now = performance.now();
        if (lastTap.dir === dir && now - lastTap.t < TAP_MS) { runDir = dir; lastTap.dir = null; }
        else lastTap = { dir, t: now };
      }
    }
    const name = keyAction(e);
    if (name) { held.add(name); if (!e.repeat) onAction(name); e.preventDefault(); } // Ctrl+숫자의 브라우저 탭 넘기기도 막는다
  });
  addEventListener('keyup', (e) => {
    const dir = KEYMAP[e.code];
    if (dir) { keys.delete(dir); if (dir === runDir) runDir = null; }
    if (ACTION_KEYS[e.code]) held.delete(ACTION_KEYS[e.code]);
  });
  addEventListener('blur', () => { keys.clear(); held.clear(); runDir = null; });

  // ── 마우스: 왼쪽 버튼으로 끌면 시점 회전, 휠로 확대/축소 ──
  const canvas = document.getElementById('game');
  // 끌지 않고 누르기만 하면 공격: 짧게 눌렀다 떼면 한 번, 끌지 않은 채 꾹 누르고 있으면 뗄 때까지 연속 공격
  // (누르자마자 휘두르면 시점을 돌리려고 끄는 것과 구별할 수 없으므로, 잠깐 지켜본 뒤 꾹 누름으로 친다)
  const HOLD_MS = 200;
  const drag = { id: null, x: 0, y: 0, moved: 0, timer: 0, attacking: false };
  // 마우스가 마지막으로 가리킨 화면 자리 (공격할 때 그쪽을 바라보는 데 쓴다). 터치·펜은 없음
  let pointer = null;
  addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') pointer = { x: e.clientX, y: e.clientY }; });
  addEventListener('pointerdown', (e) => { pointer = e.pointerType === 'mouse' ? { x: e.clientX, y: e.clientY } : null; }, true);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); onZoom(e.deltaY); }, { passive: false });

  // ── 떠 있는 조이스틱: 화면 왼쪽 아무 곳이나 누르면 그 자리에 생김 (터치·펜) ──
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') {
      if (e.button !== 0 || drag.id !== null) return;
      drag.id = e.pointerId;
      drag.x = e.clientX;
      drag.y = e.clientY;
      drag.moved = 0;
      drag.attacking = false;
      clearTimeout(drag.timer);
      drag.timer = setTimeout(() => {
        if (!enabled || drag.id !== e.pointerId || drag.moved >= 6) return;
        drag.attacking = true;
        held.add('attack');
        onAction('attack');
      }, HOLD_MS);
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (!enabled || joy.id !== null) return;
    if (e.clientX > innerWidth * 0.6) return; // 오른쪽은 행동 버튼 영역
    joy.id = e.pointerId;
    joy.ox = e.clientX;
    joy.oy = e.clientY;
    joy.x = joy.y = 0;
    base.style.left = `${joy.ox}px`;
    base.style.top = `${joy.oy}px`;
    knob.style.transform = 'translate(0px, 0px)';
    base.classList.remove('hidden');
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId === drag.id) {
      onOrbit(e.clientX - drag.x, e.clientY - drag.y);
      drag.moved += Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y);
      drag.x = e.clientX;
      drag.y = e.clientY;
      return;
    }
    if (e.pointerId !== joy.id) return;
    let dx = e.clientX - joy.ox;
    let dy = e.clientY - joy.oy;
    const d = Math.hypot(dx, dy);
    if (d > JOY_RADIUS) { dx *= JOY_RADIUS / d; dy *= JOY_RADIUS / d; }
    joy.x = dx / JOY_RADIUS;
    joy.y = dy / JOY_RADIUS;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  });
  const end = (e) => {
    if (e.pointerId === drag.id) {
      drag.id = null;
      clearTimeout(drag.timer);
      if (drag.attacking) held.delete('attack'); // 꾹 눌러 연속 공격하던 것을 멈춘다 (이미 휘둘렀으니 뗄 때 또 치지 않는다)
      else if (enabled && e.type === 'pointerup' && drag.moved < 6) onAction('attack'); // 짧게 눌렀다 떼면 한 번
      drag.attacking = false;
    }
    if (e.pointerId !== joy.id) return;
    joy.id = null;
    joy.x = joy.y = 0;
    base.classList.add('hidden');
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  for (const b of document.querySelectorAll('[data-key]')) {
    const name = ACTION_KEYS[b.dataset.key];
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); if (enabled) { held.add(name); onAction(name); } });
    for (const t of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(t, () => held.delete(name));
  }

  // iOS 확대 동작 막기
  for (const t of ['gesturestart', 'gesturechange', 'dblclick']) {
    document.addEventListener(t, (e) => e.preventDefault(), { passive: false });
  }
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    get pointer() { return pointer; },
    holding(name) { return enabled && held.has(name); },
    enable(v) { enabled = v; if (!v) { keys.clear(); held.clear(); runDir = null; joy.id = null; joy.x = joy.y = 0; base.classList.add('hidden'); } },
    // 화면 기준 이동 방향: x(오른쪽+), z(아래쪽+), 세기 0~1, 달리기 여부
    read() {
      let x = 0;
      let z = 0;
      let run = runDir !== null;
      if (keys.has('left')) x -= 1;
      if (keys.has('right')) x += 1;
      if (keys.has('up')) z -= 1;
      if (keys.has('down')) z += 1;
      let mag = Math.hypot(x, z);
      if (mag > 0) { x /= mag; z /= mag; mag = 1; }
      if (joy.id !== null) {
        const jm = Math.hypot(joy.x, joy.y);
        if (jm > 0.15) {
          x = joy.x / jm;
          z = joy.y / jm;
          mag = Math.min(1, jm);
          run = run || jm >= RUN_AT;
        }
      }
      return { x, z, mag, run };
    },
  };
}
