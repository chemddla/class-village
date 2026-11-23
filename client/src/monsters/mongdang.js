// 몽당연필: 너무 깎여서 엄지만 해진 연필 몬스터. 지우개 쪽으로 서서 콩콩 뛰어다닌다
// 날개콩과 같은 방식: createMongdang() 의 root 를 장면에 넣고 매 프레임 update(dt), 동작은 play('walk') 처럼 바꾼다
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { canvasTexture } from '../villager/textures.js';
import { syncToon } from '../villager/toon.js';

const PI = Math.PI;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const seg = (u, a, b) => clamp01((u - a) / (b - a));
const smooth = (x) => x * x * (3 - 2 * x);
const outBack = (x, s = 2) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2);
const wobble = (u, k = 7, w = 24) => (u < 0 ? 0 : Math.exp(-k * u) * Math.cos(w * u));
const lerp = (a, b, k) => a + (b - a) * k;

export const MONGDANG_MOTIONS = {
  idle: { label: '대기', loop: true },
  walk: { label: '걷기 (콩콩)', loop: true },
  scribble: { label: '물구나무 낙서', dur: 2.6 },
  notice: { label: '발견!', dur: 1.3 },
  attack: { label: '공격 (콕! 심 부러짐)', dur: 1.7 },
  hit: { label: '맞음', dur: 0.9 },
  die: { label: '쓰러짐', dur: 2.3 },
  spawn: { label: '등장', dur: 0.7 },
};

// 치수 (m): 아래부터 지우개 → 쇠테 → 노란 몸 → 깎인 나무 → 심
const R = 0.04; // 육각 몸 꼭짓점까지 반지름
const APO = R * Math.cos(PI / 6); // 평평한 면까지 거리 (얼굴이 붙는 면)
const Y_ERASER = 0.02, Y_FERRULE = 0.034, Y_BODY = 0.094, Y_WOOD = 0.129, TIP = 0.136;

export function createMongdang({ fxParent = null, onDone = null, outlineScale = 1 } = {}) {
  const mat = (color, roughness = 0.6) => new THREE.MeshStandardMaterial({ color, roughness });
  const YELLOW = mat('#ffd23f', 0.6);
  const WOOD = mat('#f3d2a2', 0.9);
  const LEAD = mat('#4a4a52', 0.45);
  const PINK = mat('#ff9fb0', 0.95);
  const SILVER = mat('#c9ccd3', 0.35);
  const PUFF = mat('#fffaf0', 1);
  const add = (geo, m, parent, name = '부품') => {
    const o = new THREE.Mesh(geo, m);
    o.name = name;
    o.castShadow = true;
    o.userData.outlineWidth = 0.002;
    parent.add(o);
    return o;
  };
  // 각진 부품의 외곽선 껍질은 면 방향을 고르게 이은 모양으로 (모서리에서 외곽선이 벌어지지 않게)
  const smoothHull = (geo) => {
    const g = geo.clone();
    g.deleteAttribute('normal');
    g.deleteAttribute('uv');
    const m = mergeVertices(g, 1e-5);
    m.computeVertexNormals();
    return m;
  };
  const hex = (r1, r2, h, y) => new THREE.CylinderGeometry(r1, r2, h, 6).rotateY(PI / 6).translate(0, y + h / 2, 0); // 평평한 면이 앞

  // root(위치·방향) > body(자리·뱅글·찌부) > core(바닥 기준으로 기울이기·뒤집기) > roller(쓰러져 데굴 구르기)
  const root = new THREE.Group();
  root.name = '몽당연필';
  const body = new THREE.Group();
  root.add(body);
  const core = new THREE.Group();
  body.add(core);
  const roller = new THREE.Group();
  core.add(roller);

  add(new THREE.CylinderGeometry(0.036, 0.034, Y_ERASER, 24).translate(0, Y_ERASER / 2, 0), PINK, roller, '지우개');
  add(new THREE.CylinderGeometry(0.0405, 0.0405, Y_FERRULE - Y_ERASER, 24).translate(0, (Y_ERASER + Y_FERRULE) / 2, 0), SILVER, roller, '쇠테');
  for (const y of [Y_ERASER + 0.004, Y_FERRULE - 0.004]) { // 쇠테 주름
    const ring = add(new THREE.TorusGeometry(0.041, 0.0012, 6, 32).rotateX(PI / 2), SILVER, roller, '쇠테');
    ring.position.y = y;
    ring.userData.noOutline = true;
  }
  const bodyGeo = hex(R, R, Y_BODY - Y_FERRULE, Y_FERRULE);
  add(bodyGeo, YELLOW, roller, '몸').userData.outlineGeometry = smoothHull(bodyGeo);
  const woodGeo = hex(0.008, R, Y_WOOD - Y_BODY, Y_BODY);
  add(woodGeo, WOOD, roller, '나무').userData.outlineGeometry = smoothHull(woodGeo);
  const lead = new THREE.Group(); // 부러져 날아갔다가 다시 깎여 나옴
  lead.position.y = Y_WOOD;
  roller.add(lead);
  const leadGeo = new THREE.CylinderGeometry(0.0025, 0.008, TIP - Y_WOOD, 12).translate(0, (TIP - Y_WOOD) / 2, 0); // 뭉툭하게 닳은 심
  add(leadGeo, LEAD, lead, '심');

  // ── 얼굴: 앞면에 딱 붙인 얇은 판에 그림을 그려 입힌다 (날개콩 눈과 같은 잉크·하이라이트 색) ──
  const INK = '#3a2318';
  const HL = 'rgba(255,255,255,0.95)';
  const oval = (g, x, y, rx, ry) => { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, PI * 2); };
  const stroke = (g, w) => { g.strokeStyle = INK; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke(); };
  // 도안 단위: 가운데 0,0 / ±22칸. 화면 왼쪽 눈 기준(-x 가 바깥), 오른쪽 눈은 좌우를 뒤집어 그린다
  const EYE_DRAW = {
    open: (g) => { oval(g, 0, 0, 5.5, 6); g.fillStyle = INK; g.fill(); }, // 콕 찍은 점눈 (하찮음 최대)
    wide: (g) => { oval(g, 0, 0, 7, 7.6); g.fillStyle = INK; g.fill(); oval(g, -2.3, -2.6, 2, 2); g.fillStyle = HL; g.fill(); }, // 놀라면 점이 살짝 커지고 반짝
    closed: (g) => { g.beginPath(); g.moveTo(-10, 1); g.quadraticCurveTo(0, 9, 10, 1); stroke(g, 3.4); },
    squint: (g) => { g.beginPath(); g.moveTo(-9, -9); g.lineTo(8, 0); g.lineTo(-9, 9); stroke(g, 3.6); },
    dead: (g) => { g.beginPath(); g.moveTo(-8, -8); g.lineTo(8, 8); g.moveTo(8, -8); g.lineTo(-8, 8); stroke(g, 3.4); },
    dizzy: (g) => { g.beginPath(); for (let a = 0; a < PI * 5; a += 0.2) g.lineTo(Math.cos(a) * a * 0.7, Math.sin(a) * a * 0.7); stroke(g, 2.6); },
  };
  const MOUTH_DRAW = {
    smile: (g) => { g.beginPath(); g.moveTo(-4.5, -1); g.quadraticCurveTo(0, 3.5, 4.5, -1); stroke(g, 2.6); }, // 점눈에 맞춘 조그만 입
    o: (g) => { oval(g, 0, 1, 4.5, 6); g.fillStyle = '#8a3a2e'; g.fill(); stroke(g, 2.4); },
    frown: (g) => { g.beginPath(); g.moveTo(-6, 4); g.quadraticCurveTo(0, -4, 6, 4); stroke(g, 3); },
    wavy: (g) => { g.beginPath(); g.moveTo(-9, 1); for (let i = 1; i <= 6; i++) g.lineTo(-9 + i * 3, i % 2 ? -2 : 2); stroke(g, 2.6); },
  };
  const tex = (kind, s, draw) => canvasTexture(`mongdang:${kind}:${s}`, 96, 96, (g, w, h) => {
    g.translate(w / 2, h / 2);
    g.scale((s < 0 ? 1 : -1) * w / 44, h / 44);
    draw(g);
  });
  const decal = (w, h, x, y, map, name) => {
    const m = add(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map, transparent: true, depthWrite: false,
      roughness: 0.3, polygonOffset: true, polygonOffsetFactor: -3 }), roller, name);
    m.position.set(x, y, APO + 0.0002);
    m.castShadow = false;
    m.renderOrder = 1;
    return m;
  };
  const blushTex = canvasTexture('mongdangBlush', 64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    for (let i = 0; i <= 10; i++) gr.addColorStop(i / 10, `rgba(255,140,150,${(0.7 * Math.exp(-((i / 10) ** 2) * 4.2)).toFixed(3)})`);
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  });
  for (const s of [-1, 1]) decal(0.014, 0.008, s * 0.0155, 0.055, blushTex, '눈');
  const eyes = [-1, 1].map((s) => ({ s, kind: 'open', m: decal(0.02, 0.02, s * 0.0095, 0.067, tex('open', s, EYE_DRAW.open), '눈') }));
  const mouth = { kind: 'smile', m: decal(0.015, 0.015, 0, 0.0535, tex('smile', 1, MOUTH_DRAW.smile), '눈') };

  const sweat = add(new THREE.SphereGeometry(0.005, 12, 9).scale(0.8, 1.3, 0.8), mat('#bfe8ff', 0.2), roller, '땀');
  sweat.position.set(0.034, 0.085, 0.02);
  const bang = new THREE.Sprite(new THREE.SpriteMaterial({
    map: canvasTexture('mongdangBang', 64, 128, (g, w, h) => {
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

  // ── 효과(연필밥·연기·낙서·부러진 심): 몸이 움직여도 제자리에 남도록 바깥에 둠 ──
  const fx = new THREE.Group();
  fx.name = '몽당연필효과';
  (fxParent ?? root).add(fx);
  const chipGeo = new THREE.TorusGeometry(0.006, 0.0018, 6, 10, PI * 1.3); // 돌돌 말린 연필밥 조각
  const puffGeo = new THREE.SphereGeometry(0.02, 14, 10);
  const dotGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.0008, 10);
  const parts = [];
  const tmp = new THREE.Vector3();
  const toFx = (v) => (fxParent ? v : root.worldToLocal(v));
  const k = () => (fxParent ? root.scale.x : 1);
  const tipWorld = () => toFx(lead.localToWorld(tmp.set(0, TIP - Y_WOOD, 0)).clone());

  function chips(n) {
    const c = toFx(roller.localToWorld(new THREE.Vector3(0, 0.07, 0)));
    for (let i = 0; i < n; i++) {
      const m = add(chipGeo, i % 3 ? WOOD : YELLOW, fx, '연필밥');
      m.position.copy(c);
      m.scale.setScalar(k());
      const a = Math.random() * PI * 2;
      const v = new THREE.Vector3(Math.cos(a) * 0.3, 0.4 + Math.random() * 0.35, Math.sin(a) * 0.3).multiplyScalar(k() * (0.6 + Math.random() * 0.5));
      m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      parts.push({ m, v, kind: 'fall', age: 0, life: 1.6 + Math.random() * 0.4, spin: 10 });
    }
  }
  function puffs(n) {
    const c = toFx(roller.localToWorld(new THREE.Vector3(0, 0.06, 0)));
    for (let i = 0; i < n; i++) {
      const m = add(puffGeo, PUFF, fx, '연기');
      const a = (i / n) * PI * 2;
      m.position.copy(c).add(tmp.set(Math.cos(a) * 0.03, (Math.random() - 0.3) * 0.03, Math.sin(a) * 0.03).multiplyScalar(k()));
      const v = new THREE.Vector3(Math.cos(a) * 0.12, 0.06 + Math.random() * 0.05, Math.sin(a) * 0.12).multiplyScalar(k());
      parts.push({ m, v, kind: 'puff', age: 0, life: 0.6, size: 1.2 * k() * (0.8 + Math.random() * 0.5) });
    }
  }
  function scribbleDot() {
    const m = add(dotGeo, LEAD, fx, '낙서');
    m.castShadow = false;
    m.userData.noOutline = true;
    m.position.copy(tipWorld());
    m.position.y = 0.0004 * k();
    m.scale.setScalar(k());
    parts.push({ m, v: new THREE.Vector3(), kind: 'mark', age: 0, life: 6 });
  }
  function snapLead() {
    const m = add(leadGeo, LEAD, fx, '부러진심');
    m.position.copy(tipWorld());
    m.scale.setScalar(k());
    const fwd = toFx(roller.localToWorld(new THREE.Vector3(0, 0, 1))).sub(toFx(roller.localToWorld(new THREE.Vector3())));
    fwd.y = 0;
    fwd.normalize();
    const v = fwd.multiplyScalar(0.35).add(tmp.set(0, 0.45, 0)).multiplyScalar(k());
    parts.push({ m, v, kind: 'fall', age: 0, life: 1.6, spin: 22 });
  }
  function updateParts(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age += dt;
      const r = p.age / p.life;
      if (r >= 1) { fx.remove(p.m); parts.splice(i, 1); continue; }
      if (p.kind === 'fall') {
        // 튀어 올랐다가 떨어져 바닥에서 한 번 통 튀고 멈춤
        p.v.y -= 1.6 * k() * dt;
        p.m.position.addScaledVector(p.v, dt);
        const floor = 0.002 * k();
        if (p.m.position.y < floor) {
          p.m.position.y = floor;
          p.v.set(p.v.x * 0.3, Math.abs(p.v.y) > 0.15 * k() ? -p.v.y * 0.35 : 0, p.v.z * 0.3);
          p.spin *= 0.3;
        }
        p.m.rotation.x += p.spin * dt;
        p.m.scale.setScalar(k() * (r > 0.8 ? (1 - r) / 0.2 : 1));
      } else if (p.kind === 'puff') {
        p.v.multiplyScalar(1 - 4 * dt);
        p.m.position.addScaledVector(p.v, dt);
        p.m.scale.setScalar(p.size * Math.sin(Math.min(1, r * 1.3) * PI) * (0.7 + r));
      } else {
        p.m.scale.set(k() * (r > 0.7 ? (1 - r) / 0.3 : 1), k(), k() * (r > 0.7 ? (1 - r) / 0.3 : 1));
      }
    }
  }

  // ── 동작 상태 ──
  let state = 'idle';
  let u = 0;
  let t = 0;
  let dotClock = 0;
  const fired = new Set();
  const once = (key, at) => (u >= at && !fired.has(key) ? (fired.add(key), true) : false);

  function play(name) {
    if (!MONGDANG_MOTIONS[name] && name !== 'gone') return;
    state = name;
    u = 0;
    fired.clear();
  }

  function update(dt) {
    t += dt;
    u += dt;
    const P = { sy: 1, sxz: 1, x: 0, y: 0, z: 0, ry: 0, rx: 0, rz: 0, roll: 0, eyes: 'open', eyeS: 1, blink: 1,
      mouth: 'smile', bang: 0, sweat: false, flash: 0, show: 1, lead: 1 };

    const br = Math.sin(t * 2.4);
    P.sy = 1 + 0.025 * br;
    P.sxz = 1 - 0.012 * br;
    if (t % 3.1 < 0.12) P.blink = 0.1;

    const M = MONGDANG_MOTIONS[state];
    if (state === 'idle') {
      // 짧은 몸으로 좌우 뒤뚱, 가끔 자기 심 끝을 올려다보며 "오?"
      const c = t % 6;
      const look = c > 4 && c < 5.4 ? Math.sin(seg(c, 4, 5.4) * PI) : 0;
      P.rz = Math.sin(t * 1.3) * 0.05;
      P.rx = -0.18 * look;
      if (look > 0.3) P.mouth = 'o';
    } else if (state === 'walk') {
      // 지우개로 콩콩: 뛸 때마다 좌우로 번갈아 기울어짐
      const ph = u * 2.4;
      const f = ph % 1;
      const side = Math.floor(ph) % 2 ? 1 : -1;
      const air = Math.sin(f * PI);
      P.y = air * 0.016;
      P.rz = side * 0.12 * air;
      P.rx = 0.07;
      const land = f < 0.15 ? 1 - f / 0.15 : 0;
      P.sy *= 1 - 0.1 * land + 0.06 * air;
      P.sxz *= 1 + 0.06 * land;
    } else if (state === 'scribble') {
      // 폴짝 물구나무 → 심 끝으로 서서 뱅글뱅글 돌며 바닥에 낙서 → 앞으로 한 바퀴 돌아 착지, 어질어질
      if (u < 0.15) { P.sy = 1 - 0.12 * smooth(u / 0.15); P.sxz = 1 + 0.06 * smooth(u / 0.15); }
      const flipUp = smooth(seg(u, 0.15, 0.55));
      const flipDown = smooth(seg(u, 1.95, 2.35));
      P.rx = PI * (flipUp + flipDown);
      const arc = Math.sin(seg(u, 0.15, 0.55) * PI) + Math.sin(seg(u, 1.95, 2.35) * PI);
      P.y = TIP * (1 - Math.cos(P.rx)) / 2 + arc * 0.035;
      if (u >= 0.55 && u < 1.95) {
        const s = smooth(seg(u, 0.55, 1.95));
        P.ry = PI * 4 * s;
        P.x = Math.sin(P.ry / 2) * 0.07; // 8자를 그리며 낙서
        P.z = Math.sin(P.ry) * 0.035;
        P.rz = Math.sin(u * 17) * 0.04;
        P.eyes = 'squint';
        P.mouth = 'wavy';
        P.sweat = true;
        dotClock += dt;
        if (dotClock > 0.025 && u > 0.6) { dotClock = 0; scribbleDot(); }
      }
      if (u >= 2.35) {
        const w = wobble(u - 2.35, 8, 26);
        P.sy = 1 - 0.18 * w;
        P.sxz = 1 + 0.1 * w;
        P.eyes = 'dizzy';
        P.mouth = 'wavy';
        P.rz = Math.sin(u * 9) * 0.08;
      }
    } else if (state === 'notice') {
      // 깜짝! 폴짝 뛰고 눈이 동그래짐, 머리 위에 느낌표
      if (u < 0.12) { P.sy = 1 - 0.15 * (u / 0.12); P.sxz = 1 + 0.08 * (u / 0.12); }
      const j = seg(u, 0.12, 0.5);
      if (u >= 0.12 && u < 0.5) { P.y = Math.sin(j * PI) * 0.035; P.sy = 1.12 - 0.12 * j; P.sxz = 0.95; }
      if (u >= 0.5) { const w = wobble(u - 0.5); P.sy = 1 - 0.15 * w; P.sxz = 1 + 0.08 * w; }
      const surprise = u < 0.12 ? 0 : u < 1.0 ? 1 : 1 - seg(u, 1.0, 1.3);
      P.eyeS = 1 + 0.35 * surprise;
      P.blink = 1;
      P.mouth = surprise > 0.5 ? 'o' : 'smile';
      P.bang = u < 0.12 ? 0 : u < 1.0 ? outBack(seg(u, 0.12, 0.3)) : 1 - seg(u, 1.0, 1.3);
    } else if (state === 'attack') {
      // 뒤로 젖혀 힘 모으기 → 앞으로 콕! → 심이 톡 부러져 날아감 → 눈물 찔끔 → 다시 깎아서 심이 쏙
      const a = smooth(seg(u, 0, 0.35));
      const b = seg(u, 0.35, 0.47);
      const back = smooth(seg(u, 0.75, 1.2));
      P.rx = -0.35 * a;
      P.z = -0.01 * a;
      P.sy *= 1 - 0.08 * a;
      if (u >= 0.35) { P.rx = lerp(-0.35, 1.0, 1 - (1 - b) ** 2); P.z = lerp(-0.01, 0.03, b); P.y = Math.sin(b * PI) * 0.012; }
      if (u >= 0.75) { P.rx = lerp(1.0, 0, back); P.z = lerp(0.03, 0, back); }
      if (once('snap', 0.47)) snapLead();
      P.lead = u < 0.47 ? 1 : u < 1.3 ? 0 : outBack(seg(u, 1.3, 1.55), 3);
      if (u > 0.47 && u < 1.3) { P.eyes = 'squint'; P.mouth = 'wavy'; P.sweat = true; }
      if (u > 0.47 && u < 0.75) P.rz = Math.sin(u * 40) * 0.05;
      if (u >= 1.3 && u < 1.55) { P.ry = PI * 2 * smooth(seg(u, 1.3, 1.55)); P.eyeS = 1.3; } // 뱅글 돌며 다시 깎임
      if (once('sharpen', 1.3)) chips(4);
    } else if (state === 'hit') {
      if (once('chips', 0)) chips(5);
      const w = wobble(u, 6, 26);
      P.sy = 1 - 0.25 * w;
      P.sxz = 1 + 0.15 * w;
      P.flash = u < 0.12 ? 1 - u / 0.12 : 0;
      P.z = -0.03 * Math.sin(Math.min(1, u / 0.7) * PI);
      P.rx = -0.4 * Math.exp(-5 * u);
      P.eyes = u < 0.6 ? 'squint' : 'open';
      P.mouth = u < 0.5 ? 'o' : 'frown';
    } else if (state === 'die') {
      // 번쩍 → 폴짝 뛰며 옆으로 쿵 → 육각 몸이라 데굴 한 칸 굴러 얼굴이 하늘로 → 펑
      if (once('chips', 0)) chips(6);
      P.flash = u < 0.15 ? 1 - u / 0.15 : 0;
      if (u < 0.15) { const w = wobble(u, 6, 26); P.sy = 1 - 0.25 * w; P.sxz = 1 + 0.15 * w; }
      const j = seg(u, 0.15, 0.55);
      P.rz = PI / 2 * smooth(j);
      P.roll = PI / 2 * smooth(seg(u, 0.6, 1.1)); // 모서리로 쿵 → 90도 굴러 평평한 얼굴 면이 위로
      P.z = -P.roll * APO;
      // 바닥에 닿는 높이: 아래쪽을 향한 꼭짓점까지 거리 (굴러가며 모서리를 넘을 때 들썩)
      const a = (((PI / 3 - P.roll) % (PI / 3)) + PI / 3) % (PI / 3);
      const lying = R * Math.cos(Math.min(a, PI / 3 - a));
      P.y = Math.sin(j * PI) * 0.03 + lying * smooth(j);
      P.eyes = u < 0.3 ? 'squint' : 'dead';
      P.mouth = 'wavy';
      P.blink = 1;
      if (u > 1.45) P.show = u < 1.6 ? 1 + 0.12 * seg(u, 1.45, 1.6) : 1.12 * (1 - smooth(seg(u, 1.6, 1.72)));
      if (once('puff', 1.6)) { puffs(7); chips(4); }
    } else if (state === 'spawn') {
      P.show = outBack(seg(u, 0.05, 0.45), 2.4);
      P.blink = u > 0.5 && u < 0.6 ? 0.1 : 1;
    } else if (state === 'gone') {
      P.show = 0;
    }

    if (M && !M.loop && u >= M.dur) {
      const ended = state;
      play(ended === 'die' ? 'gone' : 'idle');
      onDone?.(ended);
    }

    // ── 자세 적용 ──
    body.scale.set(P.sxz * P.show, P.sy * P.show, P.sxz * P.show);
    body.position.set(P.x, P.y, P.z);
    body.rotation.y = P.ry;
    core.rotation.set(P.rx, 0, P.rz);
    roller.rotation.y = P.roll;
    lead.visible = P.lead > 0.001;
    lead.scale.setScalar(Math.max(0.001, P.lead));
    let eyeKind = P.eyes;
    if (eyeKind === 'open') eyeKind = P.blink < 0.5 ? 'closed' : P.eyeS > 1.15 ? 'wide' : 'open';
    for (const e of eyes) {
      if (e.kind === eyeKind) continue;
      e.kind = eyeKind;
      e.m.material.map = tex(eyeKind, e.s, EYE_DRAW[eyeKind]);
    }
    if (mouth.kind !== P.mouth) {
      mouth.kind = P.mouth;
      mouth.m.material.map = tex(P.mouth, 1, MOUTH_DRAW[P.mouth]);
    }
    sweat.visible = P.sweat;
    if (P.sweat) sweat.position.y = 0.085 - ((u * 1.5) % 1) * 0.02;
    bang.visible = P.bang > 0.001;
    bang.scale.set(0.035 * P.bang, 0.07 * P.bang, 1);
    bang.position.set(0.04, 0.19 + P.y, 0);

    updateParts(dt);
    syncToon(root, true, outlineScale);
    if (fxParent) syncToon(fx, true, outlineScale);
    core.traverse((o) => {
      if (o.isMesh && !o.userData.isOutline && !o.material.transparent && o.material.emissive) o.material.emissive.setRGB(P.flash, P.flash, P.flash * 0.9);
    });
  }

  return {
    root,
    play,
    update,
    get state() { return state; },
  };
}
