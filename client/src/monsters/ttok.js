// 똑딱이: 할 줄 아는 건 똑딱뿐인 하찮은 똑딱볼펜 몬스터 (시안: monster-sketch.js ?set=ttok · 합동 ?set=ttokWith)
// 끄레용과 같은 방식: createTtok() 의 root 를 장면에 넣고 매 프레임 update(dt), 동작은 play('walk') 처럼 바꾼다
import * as THREE from 'three';
import { canvasTexture } from '../villager/textures.js';
import { syncToon } from '../villager/toon.js';
import { angerMark, angerPulse } from './anger.js';

const PI = Math.PI;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const seg = (u, a, b) => clamp01((u - a) / (b - a));
const smooth = (x) => x * x * (3 - 2 * x);
const outBack = (x, s = 2) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2);
const wobble = (u, k = 7, w = 24) => (u < 0 ? 0 : Math.exp(-k * u) * Math.cos(w * u));
const bump = (u, a, b) => (u <= a || u >= b ? 0 : Math.sin(((u - a) / (b - a)) * PI));
// a 초에 똑! 누름 (0.12초 동안 눌렸다 올라옴)
const tap = (c, a) => (c > a && c < a + 0.12 ? Math.sin(((c - a) / 0.12) * PI) : 0);
// a 초에 나오기 시작해 b 초에 들어가는 심 (0.06초 만에 툭)
const nibOut = (c, a, b) => clamp01((c - a) / 0.06) * (1 - clamp01((c - b) / 0.06));

export const TTOK_MOTIONS = {
  idle: { label: '대기 (촉으로 서서 휘청, 가끔 똑딱)', loop: true },
  walk: { label: '걷기 (촉으로 콩콩)', loop: true },
  scribble: { label: '낙서 (용수철 끄적끄적)', dur: 3.6 },
  click: { label: '똑딱 연타 → 휴', dur: 4 },
  refill: { label: '심 갈아 끼우기', dur: 5 },
  notice: { label: '화들짝!', dur: 1.3 },
  angry: { label: '화남!', dur: 1.1 },
  attack: { label: '공격 (콕!)', dur: 1.3 },
  hit: { label: '아야 (꼭지가 퐁)', dur: 0.9 },
  die: { label: '비틀 꽈당', dur: 2.3 },
  spawn: { label: '등장', dur: 0.7 },
  // 합동 모션 (plaza-monsters 가 길·차례를 정함)
  doodle: { label: '숙여서 끄적끄적 (길은 밖에서)', loop: true },
  doodleEnd: { label: '다 그리고 바로 섬', dur: 0.6 },
  panic: { label: '당황 바들바들', loop: true },
  giggle: { label: '똑딱똑딱 놀림', dur: 1.6 },
  relief: { label: '휴~', dur: 1.6 },
  pressed: { label: '머리가 눌려 심이 툭 (당황)', loop: true },
  capOpen: { label: '꼭지 열고 샤프심 띄움', loop: true },
  capClose: { label: '꼭지 닫고 똑… 안 나옴, 한숨', dur: 2.2 },
};

// 치수 (m, 시안 크기)
const R = 0.0145; // 몸통 반지름 (볼펜처럼 가늘게)
const KNOB = 0.133; // 꼭지 밑동 높이
const HEAD = 0.137; // 머리 꼭대기
export const TTOK_TOP = 0.153; // 꼭지 끝까지 높이 (구구가 앉는 자리)
const LIFT = 0.0015; // 밑 외곽선이 땅에 묻히지 않게

export function createTtok({ fxParent = null, onDone = null, outlineScale = 1 } = {}) {
  const mat = (color, roughness = 0.6) => new THREE.MeshStandardMaterial({ color, roughness });
  const NAVY = mat('#2f4a7a', 0.7);
  const SILVER = mat('#c9ccd3', 0.35);
  const BARREL = mat('#7cc3f0', 0.4);
  const LEAD = mat('#4a4a52', 0.5);
  const PUFF = mat('#fffaf0', 1);
  const add = (geo, m, parent, name = '부품') => {
    const o = new THREE.Mesh(geo, m);
    o.name = name;
    o.castShadow = true;
    o.userData.outlineWidth = 0.0018; // 부품 크기와 상관없이 같은 두께
    parent.add(o);
    return o;
  };

  // root(위치·방향) > body(자리·뱅글·크기) > tilt(촉 끝을 축으로 기울임) > core(찌부)
  const root = new THREE.Group();
  root.name = '똑딱이';
  const body = new THREE.Group();
  root.add(body);
  const tilt = new THREE.Group();
  body.add(tilt);
  const core = new THREE.Group();
  tilt.add(core);
  // 아래로 갈수록 좁아지는 몸: 위쪽은 몸통에 매끄럽게 붙고 아래는 촉으로 이어지는 곡선
  const lathe = (y0, y1, r0, r1, curve, m, name) => {
    const pts = [];
    for (let i = 0; i <= 16; i++) { const u = i / 16; pts.push(new THREE.Vector2(r0 + (r1 - r0) * curve(u), y0 + (y1 - y0) * u)); }
    return add(new THREE.LatheGeometry(pts, 24), m, core, name);
  };
  lathe(0, 0.012, 0.0012, 0.0045, (u) => u, SILVER, '촉');
  lathe(0.012, 0.052, 0.0045, R, (u) => Math.sin((u * PI) / 2), NAVY, '손잡이');
  add(new THREE.CylinderGeometry(R, R, 0.073, 24).translate(0, 0.052 + 0.0365, 0), BARREL, core, '몸');
  add(new THREE.CylinderGeometry(R + 0.0008, R + 0.0008, 0.012, 24).translate(0, 0.125 + 0.006, 0), NAVY, core, '머리');
  const hole = add(new THREE.CircleGeometry(0.0034, 16).rotateX(-PI / 2).translate(0, HEAD + 0.0002, 0), mat('#15151a', 0.9), core, '구멍');
  hole.userData.noOutline = true;
  hole.castShadow = false;
  const knob = add(new THREE.CylinderGeometry(0.006, 0.006, 0.02, 16).translate(0, 0.01, 0), NAVY, core, '꼭지');
  add(new THREE.BoxGeometry(0.006, 0.06, 0.005).translate(0, 0.1, -(R + 0.0025)), SILVER, core, '클립');
  const nib = add(new THREE.CylinderGeometry(0.0011, 0.0011, 0.007, 8).translate(0, -0.0035, 0), LEAD, core, '볼펜심');
  nib.position.y = 0.002;
  const lead = add(new THREE.CylinderGeometry(0.0011, 0.0011, 0.07, 8).translate(0, 0.035, 0), LEAD, core, '샤프심'); // 심 갈아 끼울 때 머리 위에 둥실

  // ── 얼굴: 몸통 겉면을 따라 휘어 붙인 그림판 (튀어나오지 않게) ──
  const INK = '#2b2b33';
  const HL = 'rgba(255,255,255,0.95)';
  const oval = (g, x, y, rx, ry) => { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, PI * 2); };
  const stroke = (g, w) => { g.strokeStyle = INK; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke(); };
  const EYE_DRAW = { // 도안 단위: 가운데 0,0 / ±22칸
    open: (g) => { oval(g, 0, 0, 12, 15.5); g.fillStyle = INK; g.fill(); oval(g, 4.5, -6.5, 4.5, 4.5); g.fillStyle = HL; g.fill(); },
    wide: (g) => { oval(g, 0, 0, 15, 19); g.fillStyle = INK; g.fill(); oval(g, 5, -7.5, 5.5, 5.5); g.fillStyle = HL; g.fill(); oval(g, -5, 7, 2.5, 2.5); g.fill(); },
    closed: (g) => { g.beginPath(); g.moveTo(-13, -2); g.quadraticCurveTo(0, 14, 13, -2); stroke(g, 5); },
    squint: (g) => { g.beginPath(); g.moveTo(-11, -11); g.lineTo(10, 0); g.lineTo(-11, 11); stroke(g, 5); },
    dead: (g) => { g.beginPath(); g.moveTo(-10, -10); g.lineTo(10, 10); g.moveTo(10, -10); g.lineTo(-10, 10); stroke(g, 5); },
    angry: (g) => {
      oval(g, 0, 2, 12, 15); g.fillStyle = INK; g.fill();
      g.save();
      g.globalCompositeOperation = 'destination-out';
      g.beginPath(); g.moveTo(-22, -22); g.lineTo(22, -22); g.lineTo(22, 2); g.lineTo(-22, -8); g.closePath(); g.fill();
      g.restore();
    },
  };
  const MOUTH_DRAW = {
    smile: (g) => { g.beginPath(); g.arc(0, -4, 11, 0.15 * PI, 0.85 * PI); stroke(g, 4.5); },
    o: (g) => { oval(g, 0, 2, 7, 9); g.fillStyle = '#5a2430'; g.fill(); stroke(g, 3.5); },
    frown: (g) => { g.beginPath(); g.arc(0, 12, 11, 1.15 * PI, 1.85 * PI); stroke(g, 4.5); },
    wavy: (g) => { g.beginPath(); g.moveTo(-12, 1); for (let i = 1; i <= 6; i++) g.lineTo(-12 + i * 4, i % 2 ? -3 : 3); stroke(g, 3.6); },
    grit: (g) => {
      g.beginPath(); g.roundRect(-11, -5, 22, 10, 3.5); g.fillStyle = '#ffffff'; g.fill(); stroke(g, 3);
      g.beginPath(); g.moveTo(-10, 0); g.lineTo(10, 0); g.moveTo(-3.7, -5); g.lineTo(-3.7, 5); g.moveTo(3.7, -5); g.lineTo(3.7, 5); stroke(g, 1.8);
    },
  };
  const tex = (kind, draw) => canvasTexture(`ttok:${kind}`, 96, 96, (g, w, h) => {
    g.translate(w / 2, h / 2);
    g.scale(w / 44, h / 44);
    draw(g);
  });
  // 평평한 판을 원기둥 둘레로 휘어 붙임: x → 각도
  const decal = (w, h, x, y, map, lift = 0.0003) => {
    const geo = new THREE.PlaneGeometry(w, h, 8, 1).translate(x, y, 0);
    const p = geo.attributes.position, rr = R + lift;
    for (let i = 0; i < p.count; i++) { const a = p.getX(i) / rr; p.setXYZ(i, Math.sin(a) * rr, p.getY(i), Math.cos(a) * rr); }
    geo.computeVertexNormals();
    const m = add(geo, new THREE.MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -3 }), core, '얼굴');
    m.castShadow = false;
    m.userData.noOutline = true;
    m.renderOrder = 1;
    return m;
  };
  const blushTex = canvasTexture('ttokBlush', 64, 32, (g, w, h) => { oval(g, w / 2, h / 2, w / 2 - 1, h / 2 - 1); g.fillStyle = '#ffffff'; g.fill(); });
  const CHEEK = new THREE.Color('#f6a3b4'), CHEEK_HOT = new THREE.Color('#ff5f7e');
  const cheeks = [-1, 1].map((s) => decal(0.0096, 0.0052, s * 0.0115, 0.0875, blushTex, 0.0002));
  const eyes = [-1, 1].map((s) => ({ kind: 'open', m: decal(0.0115, 0.0115, s * 0.0062, 0.097, tex('open', EYE_DRAW.open)) }));
  const mouth = { kind: 'smile', m: decal(0.009, 0.009, 0, 0.0855, tex('smile', MOUTH_DRAW.smile)) };

  const sweat = add(new THREE.SphereGeometry(0.0035, 12, 9).scale(0.8, 1.3, 0.8), mat('#bfe8ff', 0.2), core, '땀');
  sweat.position.set(0.0145, 0.11, 0.008);

  const bang = new THREE.Sprite(new THREE.SpriteMaterial({
    map: canvasTexture('ttokBang', 64, 128, (g, w, h) => {
      g.font = '900 110px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 14;
      g.strokeStyle = '#4a3525';
      g.strokeText('!', w / 2, h / 2 + 6);
      g.fillStyle = '#ff6b5a';
      g.fillText('!', w / 2, h / 2 + 6);
    }),
    transparent: true,
  }));
  root.add(bang);
  const anger = angerMark();
  root.add(anger);

  // ── 효과(연기·바닥 낙서): 몸이 움직여도 제자리에 남도록 바깥에 둠 ──
  const fx = new THREE.Group();
  fx.name = '똑딱이효과';
  (fxParent ?? root).add(fx);
  const puffGeo = new THREE.SphereGeometry(0.016, 14, 10);
  const parts = [];
  const tmp = new THREE.Vector3();
  const toFx = (v) => (fxParent ? v : root.worldToLocal(v));
  const k = () => (fxParent ? root.scale.x : 1);

  function puffs(n) {
    const c = toFx(tilt.localToWorld(new THREE.Vector3(0, 0.05, 0)));
    for (let i = 0; i < n; i++) {
      const m = add(puffGeo, PUFF, fx, '연기');
      const a = (i / n) * PI * 2;
      m.position.copy(c).add(tmp.set(Math.cos(a) * 0.025, (Math.random() - 0.3) * 0.03, Math.sin(a) * 0.025).multiplyScalar(k()));
      const v = new THREE.Vector3(Math.cos(a) * 0.1, 0.06 + Math.random() * 0.05, Math.sin(a) * 0.1).multiplyScalar(k());
      parts.push({ m, v, kind: 'puff', age: 0, life: 0.6, size: k() * (0.8 + Math.random() * 0.5) });
    }
  }
  // 바닥 볼펜 낙서: 납작한 띠 하나 (그은 만큼만 보이게 drawRange)
  const SCRIB_N = 160;
  // 용수철 낙서 길: 몸 앞쪽(+z)에 왼쪽에서 오른쪽으로 빙글빙글 (몸 기준 시안 크기)
  const scribAt = (s) => { const a = s * PI * 8; return [(s - 0.5) * 0.05 - Math.sin(a) * 0.008, 0.032 + Math.cos(a) * 0.008 - 0.008]; };
  let scrib = null;
  function startScribble() {
    const pts = [];
    for (let i = 0; i <= SCRIB_N; i++) { const [x, z] = scribAt(i / SCRIB_N); pts.push(toFx(root.localToWorld(new THREE.Vector3(x, 0, z)))); }
    const W = 0.0014 * k(), y0 = pts[0].y + 0.0008 * k();
    const pos = [], idx = [];
    for (let i = 0; i <= SCRIB_N; i++) {
      const p = pts[i], d = tmp.copy(pts[Math.min(SCRIB_N, i + 1)]).sub(pts[Math.max(0, i - 1)]);
      const nl = Math.hypot(d.x, d.z) || 1, nx = -d.z / nl, nz = d.x / nl;
      pos.push(p.x + nx * W, y0, p.z + nz * W, p.x - nx * W, y0, p.z - nz * W);
      if (i < SCRIB_N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geo.setDrawRange(0, 0);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#2f4a7a', roughness: 0.9, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    m.name = '낙서';
    m.receiveShadow = true;
    fx.add(m);
    scrib = m;
    parts.push({ m, kind: 'mark', age: 0, life: 9 });
  }
  function updateParts(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age += dt;
      const r = p.age / p.life;
      if (r >= 1) {
        fx.remove(p.m);
        if (p.kind === 'mark') { p.m.geometry.dispose(); p.m.material.dispose(); if (scrib === p.m) scrib = null; }
        parts.splice(i, 1);
        continue;
      }
      if (p.kind === 'puff') {
        p.v.multiplyScalar(1 - 4 * dt);
        p.m.position.addScaledVector(p.v, dt);
        p.m.scale.setScalar(p.size * Math.sin(Math.min(1, r * 1.3) * PI) * (0.7 + r));
      } else p.m.material.opacity = r > 0.75 ? (1 - r) / 0.25 : 1; // 낙서는 한참 남았다가 스르르
    }
  }

  // 깍깍이가 물고 가는 샤프심 (따로 하나 더 만듦, 가운데가 원점)
  const leadGeo = new THREE.CylinderGeometry(0.0011, 0.0011, 0.07, 8);
  const makeLead = () => add(leadGeo, LEAD, new THREE.Group(), '샤프심').parent;

  // ── 동작 상태 ──
  let state = 'idle';
  let u = 0;
  let t = 0;
  let mood = null; // 'angry': 화가 난 채로 있음
  let moodT = 0;
  let leadGone = false; // capOpen 중 샤프심을 빼앗김
  let smoothed = null; // 동작이 바뀌어도 자세가 툭 튀지 않게 따라가는 값
  const fired = new Set();
  const once = (key, at) => (u >= at && !fired.has(key) ? (fired.add(key), true) : false);

  function play(name) {
    if (!TTOK_MOTIONS[name] && name !== 'gone') return;
    state = name;
    u = 0;
    fired.clear();
    if (name === 'capOpen') leadGone = false;
  }

  function update(dt) {
    t += dt;
    u += dt;
    moodT += dt;
    // press: 꼭지 눌림 (음수면 튀어나옴) · nib: 심 나옴 0~1 · open: 꼭지 열림 0~1 · knobUp·knobSpin: 꼭지가 퐁 날아감
    // leadY: 머리 위 샤프심 밑동 높이 (null 이면 안 보임) · rx·rz: 촉 끝을 축으로 기울임
    const P = { sy: 1, sxz: 1, x: 0, y: 0, z: 0, ry: 0, rx: 0, rz: 0, press: 0, nib: 0, open: 0, knobUp: 0, knobSpin: 0, leadY: null, leadS: 1,
      eyes: 'open', blink: 1, mouth: 'smile', cheek: 0, bang: 0, sweat: false, flash: 0, show: 1, anger: 0, red: 0 };

    if (t % 3.1 < 0.12) P.blink = 0.1;
    const M = TTOK_MOTIONS[state];
    if (state === 'idle') {
      // 뾰족한 촉으로 서 있느라 늘 휘청, 6초에 한 번 똑! 딱! (심 나오면 뿌듯)
      const c = (t + 1) % 6;
      P.rx = Math.sin(t * 1.7) * 0.05;
      P.rz = Math.sin(t * 2.3) * 0.07;
      P.press = tap(c, 3) + tap(c, 3.8);
      P.nib = nibOut(c, 3.03, 3.83);
      P.sy = 1 + bump(c, 3.1, 3.8) * 0.02;
    } else if (state === 'walk') {
      // 촉으로 콩콩: 내려앉을 때마다 똑, 한 걸음마다 심이 나왔다 들어감
      const ph = u * 2.5, f = ph % 1, n = Math.floor(ph), g = clamp01(f / 0.15);
      P.y = Math.sin(f * PI) * 0.018;
      P.rx = 0.08;
      P.rz = Math.sin(f * PI * 2) * 0.12;
      P.press = f < 0.3 ? Math.sin((f / 0.3) * PI) : 0;
      P.nib = n % 2 ? 1 - g : g;
    } else if (state === 'scribble') {
      // 똑! 심을 꺼내 앞으로 숙여 바닥에 용수철 낙서 → 똑! 넣고 뿌듯
      const e = smooth(seg(u, 0.05, 0.3)) * (1 - smooth(seg(u, 2.95, 3.25)));
      P.rx = e * (0.3 + Math.sin(t * 9) * 0.04);
      P.rz = e * Math.sin(t * 7) * 0.05;
      P.press = tap(u, 0.02) + tap(u, 3.0);
      P.nib = nibOut(u, 0.05, 3.03);
      const s = seg(u, 0.3, 2.9), [sx, sz] = scribAt(s), back = smooth(seg(u, 2.9, 3.3)), go = smooth(seg(u, 0.05, 0.3));
      P.x = sx * go * (1 - back);
      P.z = sz * go * (1 - back);
      P.cheek = 0.3;
      if (once('line', 0.3)) startScribble();
      if (scrib && u < 2.95) scrib.geometry.setDrawRange(0, Math.floor(s * SCRIB_N) * 6);
      if (u > 3.3) { const w = wobble(u - 3.3, 8, 26); P.sy = 1 - 0.1 * w; P.sxz = 1 + 0.05 * w; P.eyes = 'closed'; P.cheek = 0.6; }
    } else if (state === 'click') {
      // 긴장하면 똑딱똑딱 멈추질 못함 (0.13초씩 16번, 심이 들어간 채로 끝남) → 휴~ 하고 푹 꺼짐
      if (u > 0.3 && u < 2.38) {
        const c = (u - 0.3) / 0.13, f = clamp01((c % 1) / 0.4), e = clamp01((u - 0.3) / 0.1) * clamp01((2.38 - u) / 0.1);
        P.press = Math.sin((c % 1) * PI);
        P.nib = Math.floor(c) % 2 ? 1 - f : f;
        P.rx = e * Math.sin(t * 31) * 0.03;
        P.rz = e * Math.sin(t * 27) * 0.04;
        P.mouth = 'frown';
        P.sweat = true;
        P.cheek = 0.6;
      } else if (u >= 2.4 && u < 3.4) {
        const s = Math.sin((u - 2.4) * PI);
        P.sy = 1 - s * 0.06;
        P.sxz = 1 + s * 0.04;
        P.rx = s * 0.15;
        P.eyes = 'closed';
      }
    } else if (state === 'refill') {
      // 똑! 똑! 똑! 심이 안 나와 갸웃 → 꼭지를 열고 샤프심을 둥실 띄워 구멍으로 쏙 → 닫고 똑! 나오자 폴짝
      P.press = tap(u, 0.2) + tap(u, 0.5) + tap(u, 0.8) + tap(u, 3.3);
      P.rz = 0.18 * smooth(seg(u, 0.3, 0.7)) * (1 - smooth(seg(u, 1.2, 1.5)));
      P.rx = -0.12 * smooth(seg(u, 1.5, 1.8)) * (1 - smooth(seg(u, 2.6, 2.9)));
      if (u > 0.9 && u < 1.3) { P.mouth = 'frown'; P.sweat = true; }
      P.open = u < 1.3 ? 0 : u < 1.5 ? smooth(seg(u, 1.3, 1.5)) : u < 2.8 ? 1 : 1 - smooth(seg(u, 2.8, 3.1));
      if (u > 1.5 && u < 2.8) {
        const down = smooth(seg(u, 2.0, 2.7));
        P.leadY = 0.165 - down * 0.098 + (1 - down) * Math.sin(t * 6) * 0.003;
        P.leadS = seg(u, 1.5, 1.65);
      }
      P.nib = nibOut(u, 3.33, 4.7);
      P.y = bump(u, 3.45, 3.85) * 0.025;
      if (u > 3.4) P.cheek = 0.5;
    } else if (state === 'notice') {
      // 화들짝! 움찔 → 폴짝, 꼭지가 쑥 튀어나오고 심도 툭 → 느낌표
      const sq = bump(u, 0, 0.14), j = bump(u, 0.12, 0.5);
      P.sy = 1 - sq * 0.1 + j * 0.1;
      P.sxz = 1 + sq * 0.06 - j * 0.05;
      P.y = j * 0.04;
      const pop = u < 0.12 ? 0 : u < 0.2 ? seg(u, 0.12, 0.2) : u < 0.9 ? 1 : 1 - smooth(seg(u, 0.9, 1.3));
      P.press = -2.2 * pop + Math.sin(t * 40) * 0.2 * pop;
      P.nib = nibOut(u, 0.12, 1.1);
      if (u > 0.5) P.rz = Math.sin(t * 22) * 0.04 * seg(u, 0.5, 0.6) * (1 - seg(u, 1.0, 1.3));
      const surprise = u < 0.12 ? 0 : u < 1.0 ? 1 : 1 - seg(u, 1.0, 1.3);
      P.eyes = surprise > 0.5 ? 'wide' : 'open';
      P.blink = 1;
      P.mouth = surprise > 0.5 ? 'o' : 'smile';
      P.cheek = surprise;
      P.sweat = surprise > 0.5;
      P.bang = u < 0.12 ? 0 : u < 1.0 ? outBack(seg(u, 0.12, 0.3)) : 1 - seg(u, 1.0, 1.3);
    } else if (state === 'angry') {
      // 화남! 움츠렸다가 부르르 → 똑딱똑딱 마구 누르며 쿵쿵, 몸이 붉어짐
      const crouch = smooth(seg(u, 0, 0.14)) * (1 - seg(u, 0.14, 0.22));
      const puff = smooth(seg(u, 0.14, 0.3)) * (1 - smooth(seg(u, 0.85, 1.1)));
      const shake = clamp01((u - 0.14) / 0.04) * (1 - clamp01((u - 0.81) / 0.04));
      P.sy = 1 - 0.12 * crouch + 0.06 * puff;
      P.sxz = 1 + 0.06 * crouch + 0.03 * puff;
      P.rz = Math.sin(u * 55) * 0.05 * shake;
      P.y = Math.abs(Math.sin(u * PI * 4.5)) * 0.008 * shake;
      P.press = Math.abs(Math.sin(u * PI * 9)) * shake;
      P.eyes = 'angry';
      P.blink = 1;
      P.mouth = 'grit';
      P.anger = angerPulse(u - 0.14, t);
      P.red = puff;
      P.cheek = puff;
    } else if (state === 'attack') {
      // 똑! 심을 꺼내 뒤로 눕듯 젖혀 촉이 앞을 보게 → 0.47초에 앞으로 콕! → 부르르 → 바로 섬
      const lie = smooth(seg(u, 0.02, 0.3)) * (1 - smooth(seg(u, 0.75, 1.15)));
      const jab = seg(u, 0.32, 0.47);
      P.rx = -1.15 * lie + Math.sin(t * 50) * 0.03 * bump(u, 0.47, 0.75);
      P.z = 0.05 * (1 - (1 - jab) ** 2) * (1 - smooth(seg(u, 0.75, 1.15)));
      P.press = tap(u, 0.0) + tap(u, 1.15);
      P.nib = nibOut(u, 0.03, 1.18);
      if (u > 0.1 && u < 0.9) { P.mouth = 'grit'; P.eyes = 'squint'; }
    } else if (state === 'hit') {
      // 아야! 납작 → 꼭지가 퐁 빠져 머리 위로 날았다가 빙글 돌며 다시 쏙
      const w = wobble(u, 6, 26);
      P.sy = 1 - 0.2 * w;
      P.sxz = 1 + 0.12 * w;
      P.flash = u < 0.12 ? 1 - u / 0.12 : 0;
      P.z = -0.015 * Math.sin(Math.min(1, u / 0.7) * PI);
      P.rx = -0.25 * Math.exp(-5 * u) + Math.sin(u * 14) * 0.06 * Math.exp(-3 * u);
      const kk = seg(u, 0.04, 0.8);
      P.knobUp = Math.sin(kk * PI) * 0.08;
      P.knobSpin = kk * PI * 2;
      P.eyes = u < 0.6 ? 'squint' : 'open';
      P.mouth = u < 0.5 ? 'o' : 'frown';
      P.cheek = 0.8;
      P.sweat = true;
    } else if (state === 'die') {
      // 번쩍 → 촉 끝에서 비틀비틀 → 옆으로 꽈당 (그 바람에 똑) → 펑
      P.flash = u < 0.15 ? 1 - u / 0.15 : 0;
      const ws = seg(u, 0.15, 0.7);
      const fall = smooth(seg(u, 0.7, 1.0));
      P.rz = Math.sin(ws * PI * 5) * 0.15 * ws * (1 - fall) + (PI / 2) * fall;
      P.y = bump(u, 1.0, 1.2) * 0.008;
      P.press = tap(u, 0.98);
      P.nib = nibOut(u, 1.01, 9);
      P.eyes = u < 0.3 ? 'squint' : u < 1.0 ? 'wide' : 'dead';
      P.mouth = 'wavy';
      P.blink = 1;
      if (u > 1.45) P.show = u < 1.6 ? 1 + 0.12 * seg(u, 1.45, 1.6) : 1.12 * (1 - smooth(seg(u, 1.6, 1.72)));
      if (once('puff', 1.6)) puffs(7);
    } else if (state === 'doodle') {
      // 똑! 심을 꺼내 앞으로 숙여 끄적끄적 (어디로 갈지는 밖에서 몸을 옮김)
      const e = smooth(seg(u, 0.05, 0.25));
      P.rx = e * (0.3 + Math.sin(t * 9) * 0.04);
      P.rz = e * Math.sin(t * 7) * 0.05;
      P.press = tap(u, 0.0);
      P.nib = clamp01((u - 0.03) / 0.06);
      P.cheek = 0.3;
    } else if (state === 'doodleEnd') {
      // 스르르 바로 서며 똑! 심을 넣고 뿌듯
      P.rx = 0.3 * (1 - smooth(seg(u, 0, 0.25)));
      P.press = tap(u, 0.05);
      P.nib = 1 - clamp01((u - 0.08) / 0.06);
      if (u > 0.25) { const w = wobble(u - 0.25, 8, 26); P.sy = 1 - 0.1 * w; P.sxz = 1 + 0.05 * w; P.eyes = 'closed'; P.cheek = 0.6; }
    } else if (state === 'panic') {
      // 어쩌지어쩌지: 콩콩 동동, 바들바들, 꼭지가 쑥 튀어나온 채
      const e = clamp01(u / 0.15);
      P.y = Math.abs(Math.sin(t * 17)) * 0.01 * e;
      P.rz = Math.sin(t * 22) * 0.05 * e;
      P.press = -1.5 * e;
      P.eyes = 'wide';
      P.blink = 1;
      P.mouth = 'o';
      P.cheek = 1;
      P.sweat = true;
    } else if (state === 'giggle') {
      // 똑딱똑딱 놀림: 눈 감고 들썩들썩
      const e = 1 - seg(u, 1.3, 1.6);
      P.y = Math.abs(Math.sin(u * PI * 4)) * 0.006 * e;
      P.rz = Math.sin(u * 18) * 0.05 * e;
      P.press = tap(u, 0.1) + tap(u, 0.45) + tap(u, 0.8) + tap(u, 1.15);
      P.eyes = 'closed';
      P.cheek = 0.8;
    } else if (state === 'relief') {
      // 휴~: 들이쉬고 (부풂) 내쉬며 (푹) 눈을 감음
      const inhale = bump(u, 0.1, 0.6), exhale = bump(u, 0.6, 1.4);
      P.sy = 1 + 0.06 * inhale - 0.06 * exhale;
      P.sxz = 1 + 0.02 * inhale + 0.03 * exhale;
      P.rx = -0.1 * inhale + 0.12 * exhale;
      P.eyes = 'closed';
      P.cheek = 0.5;
    } else if (state === 'pressed') {
      // 머리 위에 누가 앉아 꼭지가 꾹 → 심이 툭 → 당황해서 옆으로만 바들바들 (꼭대기는 흔들리지 않게)
      const e = smooth(seg(u, 0, 0.2));
      P.press = e;
      P.nib = clamp01((u - 0.15) / 0.06);
      const sq = bump(u, 0, 0.35);
      P.sy = 1 - sq * 0.1;
      P.sxz = 1 + sq * 0.06 + Math.sin(t * 40) * 0.025 * seg(u, 0.2, 0.4);
      P.eyes = u > 0.15 ? 'wide' : 'open';
      P.blink = 1;
      P.mouth = u > 0.15 ? 'o' : 'smile';
      P.cheek = 1;
      P.sweat = u > 0.3;
    } else if (state === 'capOpen') {
      // 꼭지를 열고 새 샤프심을 머리 위에 둥실 띄워 올려다봄 (빼앗기면 바들바들 동동)
      P.open = smooth(seg(u, 0, 0.2));
      if (!leadGone) {
        P.rx = -0.12 * smooth(seg(u, 0.1, 0.4));
        P.leadY = 0.18 + Math.sin(t * 6) * 0.003;
        P.leadS = seg(u, 0.2, 0.35);
      } else {
        P.y = Math.abs(Math.sin(t * 9)) * 0.008;
        P.rz = Math.sin(t * 22) * 0.04;
        P.eyes = 'wide';
        P.blink = 1;
        P.mouth = 'o';
        P.cheek = 1;
        P.sweat = true;
      }
    } else if (state === 'capClose') {
      // 꼭지를 닫고 똑… 안 나옴 → 하아 한숨
      P.open = 1 - smooth(seg(u, 0, 0.3));
      P.press = tap(u, 0.6);
      const s = Math.sin(seg(u, 0.9, 2.1) * PI);
      P.sy = 1 - s * 0.08;
      P.sxz = 1 + s * 0.05;
      P.rx = s * 0.12;
      P.mouth = 'frown';
      P.eyes = u > 1.0 ? 'closed' : 'open';
      P.sweat = u > 0.6;
    } else if (state === 'spawn') {
      P.show = outBack(seg(u, 0.05, 0.45), 2.4);
      P.blink = u > 0.5 && u < 0.6 ? 0.1 : 1;
    } else if (state === 'gone') {
      P.show = 0;
    }

    if (mood === 'angry' && P.show > 0.5 && state !== 'die') {
      if (P.eyes === 'open' && P.blink >= 0.5) P.eyes = 'angry';
      if (P.mouth === 'smile') P.mouth = 'frown';
      if (state !== 'angry') P.anger = Math.max(P.anger, 0.75 * angerPulse(moodT, t));
    }

    if (M && !M.loop && u >= M.dur) {
      const ended = state;
      play(ended === 'die' ? 'gone' : 'idle');
      onDone?.(ended);
    }

    // ── 자세 적용: 동작이 바뀌는 순간에도 툭 튀지 않게 몸 자세는 아주 짧게(0.03초쯤) 따라감 ──
    const keys = ['x', 'y', 'z', 'ry', 'rx', 'rz', 'sy', 'sxz', 'open'];
    if (!smoothed || dt <= 0 || dt > 0.25) smoothed = Object.fromEntries(keys.map((kk) => [kk, P[kk]]));
    else {
      const a = 1 - Math.exp(-dt / 0.03);
      for (const kk of keys) smoothed[kk] += (P[kk] - smoothed[kk]) * a;
    }
    const S = smoothed;
    // 기울어도 땅에 묻히지 않게: 몸 반지름만큼 들어 올림
    const lean = Math.max(Math.abs(Math.sin(S.rx)), Math.abs(Math.sin(S.rz)));
    body.scale.setScalar(P.show);
    body.position.set(S.x, S.y + lean * R + P.nib * 0.005 + LIFT, S.z); // 심이 나온 만큼 몸을 들어 심 끝이 땅에 닿게
    body.rotation.y = S.ry;
    tilt.rotation.set(S.rx, 0, S.rz);
    core.scale.set(S.sxz, S.sy, S.sxz);
    nib.scale.y = Math.max(0.001, P.nib);
    knob.position.set(S.open * 0.016, KNOB - P.press * 0.008 + S.open * 0.012 + P.knobUp, 0);
    knob.rotation.set(P.knobSpin, 0, -S.open * 1.3);
    lead.visible = P.leadY !== null && P.leadS > 0;
    if (lead.visible) { lead.position.y = P.leadY; lead.scale.setScalar(P.leadS); }
    let eyeKind = P.eyes;
    if (eyeKind === 'open' && P.blink < 0.5) eyeKind = 'closed';
    for (const e of eyes) {
      if (e.kind === eyeKind) continue;
      e.kind = eyeKind;
      e.m.material.map = tex(eyeKind, EYE_DRAW[eyeKind]);
    }
    if (mouth.kind !== P.mouth) {
      mouth.kind = P.mouth;
      mouth.m.material.map = tex(P.mouth, MOUTH_DRAW[P.mouth]);
    }
    cheeks.forEach((c) => c.material.color.lerpColors(CHEEK, CHEEK_HOT, P.cheek));
    sweat.visible = P.sweat;
    if (P.sweat) sweat.position.y = 0.11 - ((t * 0.6) % 1) * 0.02;
    bang.visible = P.bang > 0.001;
    bang.scale.set(0.03 * P.bang, 0.06 * P.bang, 1);
    bang.position.set(0.03, 0.2 + S.y, 0);
    anger.visible = P.anger > 0.001;
    anger.scale.setScalar(0.045 * P.anger);
    anger.position.set(-0.035, 0.18 + S.y, 0);

    updateParts(dt);
    syncToon(root, true, outlineScale);
    if (fxParent) syncToon(fx, true, outlineScale);
    root.traverse((o) => {
      if (o.isMesh && !o.userData.isOutline && !o.material.transparent && o.material.emissive) o.material.emissive.setRGB(P.flash + P.red * 0.32, P.flash + P.red * 0.02, P.flash * 0.9);
    });
  }

  return {
    root,
    play,
    update,
    setMood(m) { if (m !== mood) { mood = m; moodT = 0; } },
    makeLead, // 깍깍이가 물고 가는 샤프심 (따로 하나 더 만듦)
    loseLead() { leadGone = true; }, // capOpen 중 머리 위 샤프심을 빼앗김
    get state() { return state; },
    get time() { return u; },
  };
}
