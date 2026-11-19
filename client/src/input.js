// 조작: 화면 조이스틱(태블릿) + 방향키/WASD(컴퓨터)
// Space 점프 · 1~4 감정 표현 · Q 도구 바꾸기 · G 생활 행동 · I 인벤토리 · Z/왼쪽 클릭 공격 · 마우스 왼쪽 끌기 시점 돌리기 · 휠 확대/축소
const JOY_RADIUS = 58; // 손잡이가 움직일 수 있는 최대 거리(px)
const RUN_AT = 0.8; // 이만큼 이상 밀면 달리기

// 키 → 행동 이름 (화면 버튼은 data-key 로 같은 키를 누른 것처럼 동작)
const ACTION_KEYS = {
  Space: 'jump', KeyQ: 'tool', KeyG: 'life', KeyI: 'inv', KeyZ: 'attack',
  Digit1: 'emote1', Digit2: 'emote2', Digit3: 'emote3', Digit4: 'emote4',
  Numpad1: 'emote1', Numpad2: 'emote2', Numpad3: 'emote3', Numpad4: 'emote4',
};

export function createInput({ onAction, onOrbit, onZoom }) {
  const keys = new Set();
  const joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
  const base = document.getElementById('joy-base');
  const knob = document.getElementById('joy-knob');
  let enabled = false;

  // ── 키보드 ──
  const KEYMAP = {
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    ShiftLeft: 'run', ShiftRight: 'run',
  };
  addEventListener('keydown', (e) => {
    if (!enabled) return;
    if (KEYMAP[e.code]) { keys.add(KEYMAP[e.code]); e.preventDefault(); }
    if (ACTION_KEYS[e.code]) { if (!e.repeat) onAction(ACTION_KEYS[e.code]); e.preventDefault(); }
  });
  addEventListener('keyup', (e) => { if (KEYMAP[e.code]) keys.delete(KEYMAP[e.code]); });
  addEventListener('blur', () => keys.clear());

  // ── 마우스: 왼쪽 버튼으로 끌면 시점 회전, 휠로 확대/축소 ──
  const canvas = document.getElementById('game');
  const drag = { id: null, x: 0, y: 0, moved: 0 };
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); onZoom(e.deltaY); }, { passive: false });

  // ── 떠 있는 조이스틱: 화면 왼쪽 아무 곳이나 누르면 그 자리에 생김 (터치·펜) ──
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') {
      if (e.button !== 0 || drag.id !== null) return;
      drag.id = e.pointerId;
      drag.x = e.clientX;
      drag.y = e.clientY;
      drag.moved = 0;
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
      if (enabled && e.type === 'pointerup' && drag.moved < 6) onAction('attack'); // 끌지 않고 누르기만 하면 공격
    }
    if (e.pointerId !== joy.id) return;
    joy.id = null;
    joy.x = joy.y = 0;
    base.classList.add('hidden');
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  for (const b of document.querySelectorAll('[data-key]')) {
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); if (enabled) onAction(ACTION_KEYS[b.dataset.key]); });
  }

  // iOS 확대 동작 막기
  for (const t of ['gesturestart', 'gesturechange', 'dblclick']) {
    document.addEventListener(t, (e) => e.preventDefault(), { passive: false });
  }
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    enable(v) { enabled = v; if (!v) { keys.clear(); joy.id = null; joy.x = joy.y = 0; base.classList.add('hidden'); } },
    // 화면 기준 이동 방향: x(오른쪽+), z(아래쪽+), 세기 0~1, 달리기 여부
    read() {
      let x = 0;
      let z = 0;
      let run = keys.has('run');
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
