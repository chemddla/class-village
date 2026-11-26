// 끄레용: 종이옷이 자꾸 흘러내리는 하찮은 파란 크레파스 몬스터 (시안: monster-sketch.js ?set=jooljool)
// 몽당연필과 같은 방식: createKkreyong() 의 root 를 장면에 넣고 매 프레임 update(dt), 동작은 play('walk') 처럼 바꾼다
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

export const KKREYONG_MOTIONS = {
  idle: { label: '대기 (가끔 종이옷이 줄줄)', loop: true },
  walk: { label: '걷기 (콩콩)', loop: true },
  scribble: { label: '물구나무 낙서', dur: 2.6 },
  notice: { label: '발견!', dur: 1.3 },
  angry: { label: '화남!', dur: 1.1 },
  attack: { label: '공격 (콕!)', dur: 1.4 },
  hit: { label: '맞음', dur: 0.9 },
  die: { label: '쓰러짐', dur: 2.3 },
  spawn: { label: '등장', dur: 0.7 },
  // 합동 모션 (plaza-monsters 가 길·차례를 정함)
  doodle: { label: '물구나무 서서 그리기 (길은 밖에서)', loop: true },
  doodleEnd: { label: '물구나무에서 내려옴', dur: 0.6 },
  poked: { label: '툭! 종이옷이 쑥 (부끄)', dur: 0.7 },
  panic: { label: '당황 (발을 동동)', loop: true },
  relief: { label: '휴~ 안심', dur: 1.8 },
  paint: { label: '몸을 기울여 슥슥 칠하기', loop: true },
  giggle: { label: '킥킥', dur: 1.4 },
};

// 치수 (m, 시안 크기)
const R = 0.022; // 몸통 반지름
const TIP = 0.098; // 뭉툭한 끝까지 높이
const UP = 0.008; // 종이옷을 제대로 입었을 때 아랫단 높이
const LIE = 0.024; // 옆으로 누웠을 때 몸 가운데 높이 (종이옷 반지름)
const LIFT = 0.0015; // 밑면 외곽선이 땅에 묻히지 않게

export function createKkreyong({ fxParent = null, onDone = null, outlineScale = 1 } = {}) {
  const mat = (color, roughness = 0.6) => new THREE.MeshStandardMaterial({ color, roughness });
  const BLUE = mat('#5b8ff0', 0.55);
  const PAPER = mat('#fff4dc', 0.95);
  const STRIPE = mat('#3d6ccc', 0.8);
  const PUFF = mat('#fffaf0', 1);
  const add = (geo, m, parent, name = '부품') => {
    const o = new THREE.Mesh(geo, m);
    o.name = name;
    o.castShadow = true;
    o.userData.outlineWidth = 0.0022;
    parent.add(o);
    return o;
  };

  // root(위치·방향) > body(자리·뱅글·찌부) > tilt(바닥 기준으로 기울이기·뒤집기: 몸과 종이옷을 함께 돌려야 종이옷이 몸을 뚫지 않음)
  const root = new THREE.Group();
  root.name = '끄레용';
  const body = new THREE.Group();
  root.add(body);
  const tilt = new THREE.Group();
  body.add(tilt);
  const core = new THREE.Group(); // 크레파스 몸 (찌부는 여기, 종이옷은 따로)
  tilt.add(core);
  add(new THREE.CylinderGeometry(R, R, 0.074, 32).translate(0, 0.037, 0), BLUE, core, '몸');
  add(new THREE.CylinderGeometry(0.009, R, 0.02, 32).translate(0, 0.084, 0), BLUE, core, '몸');
  add(new THREE.SphereGeometry(0.009, 16, 12).scale(1, 0.45, 1).translate(0, 0.094, 0), BLUE, core, '몸'); // 살짝 뭉툭하게 닳은 끝

  // ── 얼굴: 몸통 겉면을 따라 휘어 붙인 그림판 (튀어나오지 않게) ──
  const INK = '#2b2b33';
  const HL = 'rgba(255,255,255,0.95)';
  const oval = (g, x, y, rx, ry) => { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, PI * 2); };
  const stroke = (g, w) => { g.strokeStyle = INK; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke(); };
  // 도안 단위: 가운데 0,0 / ±22칸 (눈판 한 변 0.016m)
  const EYE_DRAW = {
    open: (g) => { oval(g, 0, 0, 13.5, 17); g.fillStyle = INK; g.fill(); oval(g, 5, -7, 5, 5); g.fillStyle = HL; g.fill(); },
    wide: (g) => { oval(g, 0, 0, 16, 20); g.fillStyle = INK; g.fill(); oval(g, 5.5, -8, 6, 6); g.fillStyle = HL; g.fill(); oval(g, -5, 7, 2.5, 2.5); g.fill(); },
    closed: (g) => { g.beginPath(); g.moveTo(-13, -2); g.quadraticCurveTo(0, 14, 13, -2); stroke(g, 4.5); }, // ‿ 감은 눈 (휴~ 안심)
    squint: (g) => { g.beginPath(); g.moveTo(-11, -11); g.lineTo(10, 0); g.lineTo(-11, 11); stroke(g, 4.5); },
    dead: (g) => { g.beginPath(); g.moveTo(-10, -10); g.lineTo(10, 10); g.moveTo(10, -10); g.lineTo(-10, 10); stroke(g, 4.5); },
    dizzy: (g) => { g.beginPath(); for (let a = 0; a < PI * 5; a += 0.2) g.lineTo(Math.cos(a) * a * 0.9, Math.sin(a) * a * 0.9); stroke(g, 3.2); },
    angry: (g) => {
      oval(g, 0, 2, 13.5, 16); g.fillStyle = INK; g.fill();
      g.save();
      g.globalCompositeOperation = 'destination-out';
      g.beginPath(); g.moveTo(-22, -22); g.lineTo(22, -22); g.lineTo(22, 2); g.lineTo(-22, -8); g.closePath(); g.fill();
      g.restore();
    },
  };
  const MOUTH_DRAW = { // 입판 한 변 0.012m
    smile: (g) => { g.beginPath(); g.arc(0, -4, 11, 0.15 * PI, 0.85 * PI); stroke(g, 4); },
    o: (g) => { oval(g, 0, 2, 7, 9); g.fillStyle = '#5a2430'; g.fill(); stroke(g, 3.5); },
    frown: (g) => { g.beginPath(); g.arc(0, 12, 11, 1.15 * PI, 1.85 * PI); stroke(g, 4); },
    wavy: (g) => { g.beginPath(); g.moveTo(-12, 1); for (let i = 1; i <= 6; i++) g.lineTo(-12 + i * 4, i % 2 ? -3 : 3); stroke(g, 3.4); },
    grit: (g) => {
      g.beginPath(); g.roundRect(-11, -5, 22, 10, 3.5); g.fillStyle = '#ffffff'; g.fill(); stroke(g, 3);
      g.beginPath(); g.moveTo(-10, 0); g.lineTo(10, 0); g.moveTo(-3.7, -5); g.lineTo(-3.7, 5); g.moveTo(3.7, -5); g.lineTo(3.7, 5); stroke(g, 1.8);
    },
  };
  const tex = (kind, draw) => canvasTexture(`kkreyong:${kind}`, 96, 96, (g, w, h) => {
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
    m.renderOrder = 1;
    return m;
  };
  const blushTex = canvasTexture('kkreyongBlush', 64, 32, (g, w, h) => { oval(g, w / 2, h / 2, w / 2 - 1, h / 2 - 1); g.fillStyle = '#ffffff'; g.fill(); });
  const CHEEK = new THREE.Color('#ff9fae'), CHEEK_HOT = new THREE.Color('#ff5f7e');
  const cheeks = [-1, 1].map((s) => decal(0.017, 0.0084, s * 0.016, 0.054, blushTex, 0.0002));
  const eyes = [-1, 1].map((s) => ({ kind: 'open', m: decal(0.016, 0.016, s * 0.009, 0.062, tex('open', EYE_DRAW.open)) }));
  const mouth = { kind: 'smile', m: decal(0.012, 0.012, 0, 0.053, tex('smile', MOUTH_DRAW.smile)) };

  const sweat = add(new THREE.SphereGeometry(0.004, 12, 9).scale(0.8, 1.3, 0.8), mat('#bfe8ff', 0.2), core, '땀');
  sweat.position.set(0.02, 0.075, 0.012);

  // ── 종이옷: 안팎 두 면 + 위아래 단면이 있는 얇은 관, 파란 줄 두 개 ──
  const PIN = 0.0229, POUT = 0.0236, PH = 0.038, e = 0.0002;
  const prof = [[PIN, 0], [POUT - e, 0], [POUT, e], [POUT, PH - e], [POUT - e, PH], [PIN, PH], [PIN, 0]].map(([x, y]) => new THREE.Vector2(x, y));
  const wrapGeo = new THREE.LatheGeometry(prof, 40);
  const stripeGeo = [0.006, 0.032].map((y) => new THREE.CylinderGeometry(POUT + 0.0002, POUT + 0.0002, 0.0035, 40, 1, true).translate(0, y, 0));
  const makeWrapper = () => {
    const w = new THREE.Group();
    w.name = '종이옷';
    add(wrapGeo, PAPER, w, '종이옷');
    for (const g of stripeGeo) add(g, STRIPE, w, '줄무늬').userData.noOutline = true;
    return w;
  };
  const wrapper = makeWrapper();
  tilt.add(wrapper);

  const bang = new THREE.Sprite(new THREE.SpriteMaterial({
    map: canvasTexture('kkreyongBang', 64, 128, (g, w, h) => {
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
  fx.name = '끄레용효과';
  (fxParent ?? root).add(fx);
  const puffGeo = new THREE.SphereGeometry(0.02, 14, 10);
  const parts = [];
  const tmp = new THREE.Vector3();
  const toFx = (v) => (fxParent ? v : root.worldToLocal(v));
  const k = () => (fxParent ? root.scale.x : 1);

  function puffs(n) {
    const c = toFx(tilt.localToWorld(new THREE.Vector3(0, 0.04, 0)));
    for (let i = 0; i < n; i++) {
      const m = add(puffGeo, PUFF, fx, '연기');
      const a = (i / n) * PI * 2;
      m.position.copy(c).add(tmp.set(Math.cos(a) * 0.03, (Math.random() - 0.3) * 0.03, Math.sin(a) * 0.03).multiplyScalar(k()));
      const v = new THREE.Vector3(Math.cos(a) * 0.12, 0.06 + Math.random() * 0.05, Math.sin(a) * 0.12).multiplyScalar(k());
      parts.push({ m, v, kind: 'puff', age: 0, life: 0.6, size: 1.1 * k() * (0.8 + Math.random() * 0.5) });
    }
  }
  // 바닥 낙서: 크레파스로 그은 결이 있는 납작한 띠 하나 (그은 만큼만 보이게 drawRange)
  const strokeTex = canvasTexture('crayonStroke', 256, 64, (c, w, h) => {
    let s = 3;
    const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    c.lineCap = 'round';
    for (let i = 0; i < 700; i++) {
      const y = h / 2 + (r() + r() + r() - 1.5) * h * 0.42, x = r() * w;
      c.strokeStyle = `rgba(255,255,255,${0.35 + r() * 0.65})`;
      c.lineWidth = 0.8 + r() * 2.4;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + 8 + r() * 40, y + (r() - 0.5) * 2); c.stroke();
      c.beginPath(); c.moveTo(x - w, y); c.lineTo(x - w + 8 + r() * 40, y); c.stroke();
    }
    c.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 1600; i++) {
      c.fillStyle = `rgba(0,0,0,${0.4 + r() * 0.6})`;
      c.fillRect(r() * w, r() * h, 0.6 + r() * 1.6, 0.6 + r() * 1.2);
    }
  });
  const SCRIB_N = 160;
  // 물구나무 낙서 길: 몸 앞쪽(+z)을 가운데로 바깥에서 안으로 빙글빙글 (몸 기준 시안 크기)
  const scribAt = (s) => { const r = 0.032 * (1 - s) + 0.006, a = s * PI * 2 * 2.5; return [Math.sin(a) * r, 0.05 - Math.cos(a) * r]; };
  let scrib = null;
  function startScribble() {
    const pts = [];
    for (let i = 0; i <= SCRIB_N; i++) { const [x, z] = scribAt(i / SCRIB_N); pts.push(toFx(root.localToWorld(new THREE.Vector3(x, 0, z)))); } // body 가 아니라 root 기준 (body 는 그리는 동안 이 길을 따라 움직임)
    const W = 0.0035 * k(), y0 = pts[0].y + 0.0008 * k();
    const pos = [], uv = [], idx = [];
    let len = 0;
    for (let i = 0; i <= SCRIB_N; i++) {
      const p = pts[i], d = tmp.copy(pts[Math.min(SCRIB_N, i + 1)]).sub(pts[Math.max(0, i - 1)]);
      if (i > 0) len += p.distanceTo(pts[i - 1]);
      const nl = Math.hypot(d.x, d.z) || 1, nx = -d.z / nl, nz = d.x / nl;
      pos.push(p.x + nx * W, y0, p.z + nz * W, p.x - nx * W, y0, p.z - nz * W);
      uv.push(len / (0.03 * k()), 1, len / (0.03 * k()), 0);
      if (i < SCRIB_N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geo.setDrawRange(0, 0);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#5b8ff0', roughness: 0.9, map: strokeTex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
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

  // ── 동작 상태 ──
  let state = 'idle';
  let u = 0;
  let t = 0;
  let mood = null; // 'angry': 화가 난 채로 있음
  let moodT = 0;
  let slipNow = 0; // 지금 흘러내린 정도 (동작이 바뀌어도 툭 튀지 않게 따라감)
  let slipBase = 0; // 밖에서 정한 흘러내림 (하악냥이 툭툭 칠 때마다 쌓임)
  const fired = new Set();
  const once = (key, at) => (u >= at && !fired.has(key) ? (fired.add(key), true) : false);

  function play(name) {
    if (!KKREYONG_MOTIONS[name] && name !== 'gone') return;
    state = name;
    u = 0;
    fired.clear();
  }

  function update(dt) {
    t += dt;
    u += dt;
    moodT += dt;
    // slip: 종이옷 흘러내림 0~1 · wrapY: 종이옷을 더 올리거나 내림(물구나무·쓰러짐) · flip: 물구나무 각도 (몸 밑면 기준)
    const P = { sy: 1, sxz: 1, x: 0, y: 0, z: 0, ry: 0, rx: 0, rz: 0, flip: 0, slip: 0, wrapY: 0, wrapR: 0, eyes: 'open', blink: 1,
      mouth: 'smile', cheek: 0, bang: 0, sweat: false, flash: 0, show: 1, anger: 0, red: 0 };

    const br = Math.sin(t * 2.4);
    P.sy = 1 + 0.012 * br;
    if (t % 3.3 < 0.12) P.blink = 0.1;

    const M = KKREYONG_MOTIONS[state];
    if (state === 'idle') {
      // 가만히 숨쉬다가 6.8초에 한 번 종이옷이 줄줄 → 부끄러워 바들바들 → 폴짝 끌어올리고 휴
      const c = (t + 2) % 6.8;
      if (c >= 3.4) {
        const down = smooth(seg(c, 3.4, 4.3));
        const pull = c < 5.3 ? 0 : smooth(seg(c, 5.3, 5.55));
        P.slip = down * (1 - pull);
        P.cheek = Math.min(1, P.slip * 1.3);
        if (P.slip > 0.5) { P.mouth = 'frown'; P.sweat = true; P.rz = Math.sin(t * 22) * 0.03; }
        const hop = bump(c, 5.3, 5.6);
        P.y += hop * 0.012;
        P.sy *= 1 - hop * 0.06;
        if (c > 5.6 && c < 6.4) { P.eyes = 'closed'; P.cheek = 0.5 * (1 - seg(c, 6.0, 6.4)); } // 휴~
      } else P.rz = Math.sin(t * 1.3) * 0.03;
    } else if (state === 'walk') {
      // 콩콩: 뛸 때마다 좌우로 번갈아 기울고, 종이옷이 한 박자 늦게 들썩
      const ph = u * 2.6;
      const f = ph % 1;
      const side = Math.floor(ph) % 2 ? 1 : -1;
      const air = Math.sin(f * PI);
      P.y = air * 0.014;
      P.rz = side * 0.1 * air;
      P.rx = 0.06;
      const land = f < 0.15 ? 1 - f / 0.15 : 0;
      P.sy *= 1 - 0.1 * land + 0.05 * air;
      P.sxz *= 1 + 0.06 * land;
      P.slip = 0.12 * Math.max(0, Math.sin((f - 0.25) * PI * 2));
    } else if (state === 'scribble') {
      // 폴짝 물구나무 → 뭉툭한 끝으로 바닥에 빙글빙글 낙서 (종이옷이 얼굴로 흘러내려 눈을 가림) → 다시 바로 서서 뿌듯
      if (u < 0.15) { P.sy = 1 - 0.12 * smooth(u / 0.15); P.sxz = 1 + 0.06 * smooth(u / 0.15); }
      P.flip = PI * (smooth(seg(u, 0.15, 0.5)) + smooth(seg(u, 2.05, 2.4)));
      const arc = Math.sin(seg(u, 0.15, 0.5) * PI) + Math.sin(seg(u, 2.05, 2.4) * PI);
      P.y = arc * 0.025;
      const down = clamp01((u - 0.45) / 0.3) * (1 - seg(u, 2.0, 2.2));
      P.wrapY = 0.03 * smooth(down);
      if (u >= 0.5 && u < 2.05) {
        const s = seg(u, 0.55, 1.95);
        [P.x, P.z] = scribAt(s);
        P.flip += Math.sin(u * 9) * 0.06; // 박박 그리느라 흔들흔들
        P.cheek = 0.5;
        if (once('line', 0.55)) startScribble();
        if (scrib) scrib.geometry.setDrawRange(0, Math.floor(s * SCRIB_N) * 6);
      }
      if (u >= 2.05) [P.x, P.z] = scribAt(1).map((v) => v * (1 - smooth(seg(u, 2.05, 2.4))));
      if (u >= 2.4) { const w = wobble(u - 2.4, 8, 26); P.sy = 1 - 0.15 * w; P.sxz = 1 + 0.08 * w; P.eyes = 'closed'; P.cheek = 0.6; }
    } else if (state === 'notice') {
      // 깜짝! 폴짝 뛰고 눈이 동그래짐, 종이옷이 반쯤 쑥 → 느낌표
      if (u < 0.12) { P.sy = 1 - 0.15 * (u / 0.12); P.sxz = 1 + 0.08 * (u / 0.12); }
      const j = seg(u, 0.12, 0.5);
      if (u >= 0.12 && u < 0.5) { P.y = Math.sin(j * PI) * 0.03; P.sy = 1.1 - 0.1 * j; P.sxz = 0.96; }
      if (u >= 0.5) { const w = wobble(u - 0.5); P.sy = 1 - 0.15 * w; P.sxz = 1 + 0.08 * w; }
      const surprise = u < 0.12 ? 0 : u < 1.0 ? 1 : 1 - seg(u, 1.0, 1.3);
      P.eyes = surprise > 0.5 ? 'wide' : 'open';
      P.blink = 1;
      P.mouth = surprise > 0.5 ? 'o' : 'smile';
      P.slip = 0.5 * surprise;
      P.cheek = surprise;
      P.sweat = surprise > 0.5;
      P.bang = u < 0.12 ? 0 : u < 1.0 ? outBack(seg(u, 0.12, 0.3)) : 1 - seg(u, 1.0, 1.3);
    } else if (state === 'angry') {
      // 화남! 움츠렸다가 부르르 → 제자리 쿵쿵, 이를 악물고 몸이 붉어짐
      const crouch = smooth(seg(u, 0, 0.14)) * (1 - seg(u, 0.14, 0.22));
      const puff = smooth(seg(u, 0.14, 0.3)) * (1 - smooth(seg(u, 0.85, 1.1)));
      const shake = u > 0.14 && u < 0.85 ? 1 : 0;
      P.sy = 1 - 0.14 * crouch + 0.07 * puff;
      P.sxz = 1 + 0.07 * crouch + 0.03 * puff;
      P.rz = Math.sin(u * 55) * 0.05 * shake;
      P.x = Math.sin(u * 70) * 0.0025 * shake;
      if (shake) P.y = Math.abs(Math.sin(u * PI * 4.5)) * 0.008;
      P.eyes = 'angry';
      P.blink = 1;
      P.mouth = 'grit';
      P.anger = angerPulse(u - 0.14, t);
      P.red = puff;
      P.cheek = puff;
    } else if (state === 'attack') {
      // 뒤로 젖혀 힘 모으기 → 앞으로 콕! (뭉툭한 끝으로 찌름) → 아야, 끝이 뭉개져 눈물 찔끔 → 바로 섬
      const a = smooth(seg(u, 0, 0.35));
      const b = seg(u, 0.35, 0.47);
      const back = smooth(seg(u, 0.7, 1.1));
      P.rx = -0.35 * a;
      if (u >= 0.35) { P.rx = -0.35 + 1.35 * (1 - (1 - b) ** 2); P.z = 0.03 * b; }
      if (u >= 0.7) { P.rx = 1.0 * (1 - back); P.z = 0.03 * (1 - back); }
      if (u > 0.47 && u < 0.95) { P.eyes = 'squint'; P.mouth = 'wavy'; P.sweat = true; P.rz = Math.sin(u * 40) * 0.04; }
      P.slip = 0.25 * bump(u, 0.4, 1.2);
    } else if (state === 'hit') {
      const w = wobble(u, 6, 26);
      P.sy = 1 - 0.22 * w;
      P.sxz = 1 + 0.13 * w;
      P.flash = u < 0.12 ? 1 - u / 0.12 : 0;
      P.z = -0.025 * Math.sin(Math.min(1, u / 0.7) * PI);
      P.rx = -0.35 * Math.exp(-5 * u);
      P.eyes = u < 0.6 ? 'squint' : 'open';
      P.mouth = u < 0.5 ? 'o' : 'frown';
      P.slip = 0.7 * (1 - seg(u, 0.6, 0.9)); // 맞으면 종이옷이 쑥
      P.cheek = 0.8;
    } else if (state === 'die') {
      // 번쩍 → 폴짝 뛰며 옆으로 쿵 → 종이옷이 쑥 빠져 데굴 → 펑
      P.flash = u < 0.15 ? 1 - u / 0.15 : 0;
      if (u < 0.15) { const w = wobble(u, 6, 26); P.sy = 1 - 0.25 * w; P.sxz = 1 + 0.15 * w; }
      const j = seg(u, 0.15, 0.55);
      P.rz = (PI / 2) * smooth(j);
      P.y = Math.sin(j * PI) * 0.03;
      P.wrapY = -0.03 * smooth(seg(u, 0.6, 1.1)); // 누운 채로 발끝 쪽으로 쑥 빠짐
      P.wrapR = 0.3 * smooth(seg(u, 0.6, 1.1));
      P.eyes = u < 0.3 ? 'squint' : 'dead';
      P.mouth = 'wavy';
      P.blink = 1;
      if (u > 1.45) P.show = u < 1.6 ? 1 + 0.12 * seg(u, 1.45, 1.6) : 1.12 * (1 - smooth(seg(u, 1.6, 1.72)));
      if (once('puff', 1.6)) puffs(7);
    } else if (state === 'doodle') {
      // 폴짝 물구나무 → 거꾸로 선 채 박박 (어디로 갈지는 밖에서 몸을 옮김)
      P.flip = PI * smooth(seg(u, 0.1, 0.45)) + (u > 0.45 ? Math.sin(t * 9) * 0.06 : 0);
      P.y = Math.sin(seg(u, 0.1, 0.45) * PI) * 0.025;
      P.wrapY = 0.03 * smooth(seg(u, 0.4, 0.7));
      P.cheek = 0.5;
    } else if (state === 'doodleEnd') {
      P.flip = PI * (1 - smooth(seg(u, 0, 0.35)));
      P.y = Math.sin(seg(u, 0, 0.35) * PI) * 0.025;
      P.wrapY = 0.03 * (1 - smooth(seg(u, 0, 0.2)));
      if (u >= 0.35) { const w = wobble(u - 0.35, 8, 26); P.sy = 1 - 0.15 * w; P.sxz = 1 + 0.08 * w; P.eyes = 'closed'; P.cheek = 0.6; }
    } else if (state === 'poked') {
      // 툭! 움찔하고 부끄러워 바들바들
      const w = wobble(u, 7, 30);
      P.sy = 1 - 0.1 * w;
      P.sxz = 1 + 0.06 * w;
      P.rz = Math.sin(t * 22) * 0.03;
      P.eyes = u < 0.25 ? 'squint' : 'open';
      P.mouth = 'frown';
      P.cheek = 1;
      P.sweat = true;
    } else if (state === 'panic') {
      // 어쩌지어쩌지: 콩콩 제자리 동동, 좌우로 홱홱, 눈 동그랗게
      P.y = Math.abs(Math.sin(t * 17)) * 0.012;
      P.ry = Math.sin(t * 11) * 0.55;
      P.rz = Math.sin(t * 8.5) * 0.12;
      P.eyes = 'wide';
      P.blink = 1;
      P.mouth = 'o';
      P.cheek = 1;
      P.sweat = true;
    } else if (state === 'relief') {
      // 휴~: 숨을 크게 들이쉬고 (부풂) 내쉬며 (스르르) 눈을 감음
      const inhale = bump(u, 0.1, 0.6), exhale = bump(u, 0.6, 1.4);
      P.sy *= 1 + 0.08 * inhale - 0.06 * exhale;
      P.sxz *= 1 + 0.03 * inhale + 0.03 * exhale;
      P.rx = -0.12 * inhale + 0.08 * exhale;
      P.eyes = 'closed';
      P.cheek = 0.5;
    } else if (state === 'paint') {
      // 몸을 앞으로 기울여 뭉툭한 끝으로 슥슥 (짝 몸에 칠함)
      const k = smooth(seg(u, 0, 0.3));
      P.rx = k * (0.85 + Math.sin(t * 13) * 0.12);
      P.rz = k * Math.sin(t * 6.5) * 0.08;
      P.z = k * 0.006;
      P.cheek = 0.7;
      if (u > 0.3) P.blink = 1;
    } else if (state === 'giggle') {
      // 킥킥: 눈 감고 들썩들썩
      P.y = Math.abs(Math.sin(u * PI * 4)) * 0.008 * (1 - seg(u, 1.0, 1.4));
      P.rz = Math.sin(u * 20) * 0.05 * (1 - seg(u, 1.0, 1.4));
      P.eyes = 'closed';
      P.cheek = 0.8;
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

    // ── 자세 적용 ──
    slipNow += (Math.max(P.slip, slipBase) - slipNow) * Math.min(1, dt * 12);
    // 기울거나 뒤집어도 땅에 묻히지 않게: 물구나무는 끝까지 높이, 옆으로는 종이옷 반지름만큼 들어 올림
    const lean = Math.max(Math.abs(Math.sin(P.rx)), Math.abs(Math.sin(P.rz)), Math.abs(Math.sin(P.flip)));
    const lift = Math.max((TIP * (1 - Math.cos(P.flip))) / 2, lean * LIE);
    body.scale.setScalar(P.show);
    body.position.set(P.x, P.y + lift + LIFT, P.z);
    body.rotation.y = P.ry;
    tilt.rotation.set(P.rx + P.flip, 0, P.rz);
    core.scale.set(P.sxz, P.sy, P.sxz);
    const ws = Math.max(1 + slipNow * 0.12, P.sxz); // 몸이 퍼지면 종이옷도 같이 넓어져야 뚫리지 않음
    wrapper.scale.set(ws, 1 - slipNow * 0.5, ws);
    wrapper.position.y = UP * (1 - slipNow) + P.wrapY;
    wrapper.rotation.z = P.wrapR;
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
    if (P.sweat) sweat.position.y = 0.075 - ((t * 0.6) % 1) * 0.02;
    bang.visible = P.bang > 0.001;
    bang.scale.set(0.03 * P.bang, 0.06 * P.bang, 1);
    bang.position.set(0.035, 0.15 + P.y, 0);
    anger.visible = P.anger > 0.001;
    anger.scale.setScalar(0.045 * P.anger);
    anger.position.set(-0.04, 0.13 + P.y, 0);

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
    makeWrapper, // 깍깍이가 물고 가는 종이옷 (따로 하나 더 만듦)
    setBare(b) { wrapper.visible = !b; }, // 종이옷을 벗겨 감
    setSlip(v) { slipBase = v; },
    get state() { return state; },
    get time() { return u; },
  };
}
