// 조작: 화면 조이스틱(태블릿) + 방향키(컴퓨터, 같은 방향 두 번 연타 후 누르고 있으면 달리기)
// Space 회피 구르기(방향키 쪽으로, 안 누르면 정면으로) · C 점프 · Ctrl+1~4 감정 표현 · Q 무기 바꾸기 · R 생활 도구(도끼·낚싯대) 들기 · G 생활 행동(필요한 도구는 알아서 듦) · F 과일나무 흔들기·떨어진 과일 줍기 · I 인벤토리 · B 도감 · Z 공격(꾹 누르면 연속, 활은 누르면 조준·떼면 발사) · 마우스 왼쪽 끌기 시점 돌리기 · 휠 확대/축소
const JOY_RADIUS = 58; // 손잡이가 움직일 수 있는 최대 거리(px)
const RUN_AT = 0.8; // 이만큼 이상 밀면 달리기

// 키 → 행동 이름 (화면 버튼은 data-key 로 같은 키를 누른 것처럼 동작)
const ACTION_KEYS = {
  KeyC: 'jump', Space: 'dodge', KeyQ: 'tool', KeyR: 'lifeTool', KeyG: 'life', KeyF: 'pick', KeyI: 'inv', KeyB: 'dex', KeyZ: 'attack',
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
    ArrowUp: 'up', ArrowDown: 'down',
    ArrowLeft: 'left', ArrowRight: 'right',
  };
  // 같은 방향키를 빠르게 두 번 누르면 달리기 시작, 방향키를 하나라도 누르고 있는 동안 계속 달린다
  // 한 번이라도 멈추면(방향키를 다 떼거나, 맞선 키가 서로 지워 제자리) 바로 달리기가 풀린다
  const TAP_MS = 300;
  let lastTap = { dir: null, t: 0 };
  let runDir = null;
  addEventListener('keydown', (e) => {
    if (!enabled) return;
    const dir = KEYMAP[e.code];
    if (dir) {
      const now = performance.now();
      keys.add(dir);
      e.preventDefault();
      if (!e.repeat) {
        if (lastTap.dir === dir && now - lastTap.t < TAP_MS) { runDir = dir; lastTap.dir = null; }
        else lastTap = { dir, t: now };
      }
    }
    const name = keyAction(e);
    if (name) { held.add(name); if (!e.repeat) onAction(name); e.preventDefault(); } // Ctrl+숫자의 브라우저 탭 넘기기도 막는다
  });
  addEventListener('keyup', (e) => {
    const dir = KEYMAP[e.code];
    if (dir) { keys.delete(dir); if (!keys.size) runDir = null; } // 방향키를 다 뗐다 → 멈췄으니 달리기 풀림
    if (ACTION_KEYS[e.code]) held.delete(ACTION_KEYS[e.code]);
  });
  addEventListener('blur', () => { keys.clear(); held.clear(); runDir = null; });

  // ── 마우스: 왼쪽 버튼으로 끌면 시점 회전, 휠로 확대/축소 ──
  const canvas = document.getElementById('game');
  // 마우스 왼쪽 버튼은 시점 돌리기만 한다 (공격은 Z 키로만)
  const drag = { id: null, x: 0, y: 0 };
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); onZoom(e.deltaY); }, { passive: false });

  // ── 떠 있는 조이스틱: 화면 왼쪽 아무 곳이나 누르면 그 자리에 생김 (터치·펜) ──
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') {
      if (e.button !== 0 || drag.id !== null) return;
      drag.id = e.pointerId;
      drag.x = e.clientX;
      drag.y = e.clientY;
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
    if (e.pointerId === drag.id) drag.id = null;
    if (e.pointerId !== joy.id) return;
    joy.id = null;
    joy.x = joy.y = 0;
    joy.noRun = false;
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
    holding(name) { return enabled && held.has(name); },
    stopRun() { runDir = null; joy.noRun = joy.id !== null; }, // 대시 공격 뒤 걷기로: 스틱은 한 번 덜 밀었다가 다시 끝까지 밀어야 달린다
    enable(v) { enabled = v; if (!v) { keys.clear(); held.clear(); runDir = null; joy.id = null; joy.x = joy.y = 0; base.classList.add('hidden'); } },
    // 화면 기준 이동 방향: x(오른쪽+), z(아래쪽+), 세기 0~1, 달리기 여부
    read() {
      let x = 0;
      let z = 0;
      let run = runDir !== null && keys.size > 0;
      if (keys.has('left')) x -= 1;
      if (keys.has('right')) x += 1;
      if (keys.has('up')) z -= 1;
      if (keys.has('down')) z += 1;
      let mag = Math.hypot(x, z);
      if (mag > 0) { x /= mag; z /= mag; mag = 1; }
      else if (keys.size) { runDir = null; run = false; } // 맞선 키를 함께 눌러 제자리에 섰다 → 달리기 풀림
      if (joy.id !== null) {
        const jm = Math.hypot(joy.x, joy.y);
        if (jm > 0.15) {
          x = joy.x / jm;
          z = joy.y / jm;
          mag = Math.min(1, jm);
          if (jm < RUN_AT) joy.noRun = false;
          run = run || (jm >= RUN_AT && !joy.noRun);
        }
      }
      return { x, z, mag, run };
    },
  };
}
