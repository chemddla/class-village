// 반쪽이: 반으로 부러진 지우개 몬스터. 종이 옷은 왼쪽 절반만 남았고, 나머지 반쪽을 찾아 두리번거린다
// 몽당연필과 같은 방식: createBanjjok() 의 root 를 장면에 넣고 매 프레임 update(dt), 동작은 play('walk') 처럼 바꾼다
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
const lerp = (a, b, k) => a + (b - a) * k;

export const BANJJOK_MOTIONS = {
  idle: { label: '대기 (두리번)', loop: true },
  walk: { label: '걷기 (뒤뚱)', loop: true },
  rub: { label: '박박 문지르기', dur: 2.7 },
  scrub: { label: '열심히 지우기 (몽당연필과 합동)', loop: true }, // 엎드려 계속 박박: 몸은 바깥(광장 몬스터)에서 낙서를 따라 움직인다
  scrubEnd: { label: '다 지움! 뿌듯', dur: 1.2 },
  notice: { label: '발견!', dur: 1.3 },
  angry: { label: '화남!', dur: 1.1 },
  attack: { label: '공격 (몸통박치기)', dur: 1.6 },
  hit: { label: '맞음', dur: 0.9 },
  die: { label: '쓰러짐', dur: 2.3 },
  spawn: { label: '등장', dur: 0.7 },
};

// 치수 (m, 시안 크기): 가로(부러진 쪽이 +x) · 높이 · 두께 · 모서리 둥글기
const W = 0.072, H = 0.04, D = 0.038, ROUND = 0.009;
const FACE_X = 0.017; // 얼굴은 종이 옷 밖 맨살 쪽
const LIFT = 0.0025; // 밑면 외곽선까지 땅 위로

const part = (geo, m, parent, name = '부품') => {
  const o = new THREE.Mesh(geo, m);
  o.name = name;
  o.castShadow = true;
  parent.add(o);
  return o;
};

// 모서리가 둥근 지우개 덩어리. broken 에 적은 면('+x', '-z' 같은)은 부러진 단면처럼 울퉁불퉁하게
// soft: 부러진 면도 모서리는 둥글게 두고, 굵고 완만한 굴곡만 (말랑하게 뜯긴 느낌)
export function eraserChunk(w, h, d, { broken = [], seed = 1, r = 0.007, amp = 0.005, soft = false } = {}) {
  const geo = new THREE.BoxGeometry(w, h, d, 14, 14, 14);
  const p = geo.attributes.position;
  const half = { x: w / 2, y: h / 2, z: d / 2 };
  const o = new THREE.Vector3(), v = new THREE.Vector3(), inner = new THREE.Vector3();
  const C = THREE.MathUtils.clamp;
  const OTHER = { x: ['y', 'z'], y: ['x', 'z'], z: ['x', 'y'] };
  for (let i = 0; i < p.count; i++) {
    o.fromBufferAttribute(p, i);
    inner.set(C(o.x, -half.x + r, half.x - r), C(o.y, -half.y + r, half.y - r), C(o.z, -half.z + r, half.z - r));
    v.copy(o).sub(inner);
    v.lengthSq() > 0 ? v.normalize().multiplyScalar(r).add(inner) : v.copy(o);
    for (const f of broken) {
      const sign = f[0] === '+' ? 1 : -1, k = f[1];
      if (o[k] * sign < half[k] - 1e-6) continue;
      const [a, b] = OTHER[k];
      if (soft) {
        const n = Math.sin(o[a] * 140 + seed) * Math.sin(o[b] * 120 + seed * 2.3) * 0.7
          + Math.sin(o[a] * 250 + o[b] * 200 + seed * 5.1) * 0.3;
        const edge = Math.min(half[a] - Math.abs(o[a]), half[b] - Math.abs(o[b]));
        v[k] += sign * n * amp * smooth(C(edge / (r * 1.6), 0, 1)); // 가장자리로 갈수록 굴곡이 잦아들어 둥근 모서리와 이어짐
        continue;
      }
      const n = Math.sin(o[a] * 380 + seed) * Math.sin(o[b] * 330 + seed * 2.3) * 0.6
        + Math.sin(o[a] * 910 + o[b] * 640 + seed * 5.1) * 0.4;
      v[a] = o[a]; v[b] = o[b]; // 부러진 면은 둥글리지 않고 각지게
      v[k] = o[k] + sign * n * amp;
    }
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

// 지우개 종이 옷: 몸통 단면(둥근 모서리 사각형)을 따라 얇게 감싼 띠. x0 부터 +x 쪽으로 SW 만큼
export function eraserSleeve(parent, w, h, d, r, { x0 = -w / 2 + 0.003, SW = 0.034, color = '#4f7fd8' } = {}) {
  const roundRect = (path, rw, rh, rad) => {
    const x = -rw / 2, y = h / 2 - rh / 2;
    path.moveTo(x + rad, y);
    path.lineTo(x + rw - rad, y);
    path.quadraticCurveTo(x + rw, y, x + rw, y + rad);
    path.lineTo(x + rw, y + rh - rad);
    path.quadraticCurveTo(x + rw, y + rh, x + rw - rad, y + rh);
    path.lineTo(x + rad, y + rh);
    path.quadraticCurveTo(x, y + rh, x, y + rh - rad);
    path.lineTo(x, y + rad);
    path.quadraticCurveTo(x, y, x + rad, y);
    return path;
  };
  const gap = 0.0002, t = 0.0013;
  const shape = roundRect(new THREE.Shape(), d + 2 * (gap + t), h + 2 * (gap + t), r + gap + t);
  shape.holes.push(roundRect(new THREE.Path(), d + 2 * gap, h + 2 * gap, r + gap));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: SW, bevelEnabled: false, curveSegments: 10 });
  geo.rotateY(PI / 2).translate(x0, 0, 0); // 단면은 y·z 평면, 두께 방향은 +x
  part(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.8 }), parent, '종이옷');
  const white = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 });
  for (const s of [-1, 1]) { // 앞뒤 평평한 면에 흰 줄
    const stripe = part(new THREE.BoxGeometry(SW, 0.006, 0.0005), white, parent, '종이옷');
    stripe.position.set(x0 + SW / 2, h / 2, s * (d / 2 + gap + t + 0.0003));
    stripe.userData.noOutline = true;
  }
}

export function createBanjjok({ fxParent = null, onDone = null, outlineScale = 1 } = {}) {
  const mat = (color, roughness = 0.6) => new THREE.MeshStandardMaterial({ color, roughness });
  const RUBBER = mat('#f6f3ec', 0.95);
  const CRUMB = mat('#d6cebf', 0.95);
  const INK = mat('#2b1d14', 0.3);
  const SHINE = mat('#ffffff', 0.3);
  const STAR = mat('#ffd34d', 0.5);
  const PUFF = mat('#fffaf0', 1);

  // root(위치·방향) > body(자리·뱅글·찌부) > core(바닥 가운데 기준으로 기울이기)
  const root = new THREE.Group();
  root.name = '반쪽이';
  const body = new THREE.Group();
  root.add(body);
  const core = new THREE.Group();
  body.add(core);

  const eraser = part(eraserChunk(W, H, D, { broken: ['+x'], seed: 2, amp: 0.0045, r: ROUND, soft: true }), RUBBER, core, '몸');
  eraser.position.y = H / 2;
  eraser.userData.outlineWidth = 0.002;
  eraserSleeve(core, W, H, D, ROUND);
  core.traverse((o) => { if (o.isMesh && o.name === '종이옷') o.userData.outlineWidth = 0.002; });

  // ── 얼굴: 작은 점눈 + 조그만 입 (이름이 '눈'이면 외곽선을 두르지 않는다) ──
  const eyes = [-1, 1].map((s) => {
    const e = new THREE.Group();
    e.position.set(FACE_X + s * 0.0075, H * 0.55, D / 2);
    core.add(e);
    part(new THREE.SphereGeometry(0.0042, 14, 10).scale(1, 1.25, 0.6), INK, e, '눈');
    part(new THREE.SphereGeometry(0.0015, 8, 6), SHINE, e, '눈').position.set(0.0014, 0.0019, 0.0025);
    return e;
  });
  // 화난 눈썹: 눈 위에 안쪽이 낮게 비스듬히 (화났을 때만 보임)
  const brows = [-1, 1].map((s) => {
    const b = part(new THREE.CapsuleGeometry(0.0011, 0.0075, 4, 8).rotateZ(PI / 2), INK, core, '눈');
    b.position.set(FACE_X + s * 0.0081, H * 0.55 + 0.0072, D / 2 + 0.0012);
    b.rotation.z = s * 0.5;
    b.visible = false;
    return b;
  });
  const mouth = part(new THREE.TorusGeometry(0.0035, 0.001, 8, 16, PI), INK, core, '눈');
  mouth.position.set(FACE_X, H * 0.3, D / 2 + 0.001);
  const mouthO = part(new THREE.SphereGeometry(0.003, 12, 8).scale(1, 1.3, 0.4), mat('#8a3a2e', 0.6), core, '눈');
  mouthO.position.set(FACE_X, H * 0.29, D / 2 + 0.0005);

  const sweat = part(new THREE.SphereGeometry(0.004, 12, 9).scale(0.8, 1.3, 0.8), mat('#bfe8ff', 0.2), core, '땀');
  sweat.position.set(W / 2 + 0.002, H, 0.012);
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
  // 화났을 때 머리 옆에 뜨는 빨간 화남 표시
  const anger = angerMark();
  root.add(anger);

  // ── 효과(지우개 가루·별·연기·떨어진 조각): 몸이 움직여도 제자리에 남도록 바깥에 둠 ──
  const fx = new THREE.Group();
  fx.name = '반쪽이효과';
  (fxParent ?? root).add(fx);
  // 지우개 가루: 문지를 때 밀려 나오는 가늘고 꼬불꼬불 말린 실 모양 (몇 가지 모양을 돌려 씀)
  const crumbGeos = [0, 1, 2, 3, 4, 5].map((i) => {
    const len = 0.009 + (i % 4) * 0.003, curl = 1.2 + (i % 3) * 0.9;
    const pts = [];
    for (let j = 0; j <= 10; j++) {
      const q = j / 10;
      pts.push(new THREE.Vector3(q * len - len / 2, Math.sin(q * curl * PI) * 0.0018, Math.cos(q * curl * PI) * 0.0012));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.0014 - (i % 2) * 0.0003, 5);
  });
  const chipGeo = eraserChunk(0.012, 0.011, 0.012, { broken: ['+x', '-x', '+y'], seed: 11, r: 0.002, amp: 0.001 });
  const starGeo = new THREE.OctahedronGeometry(0.006, 0).scale(1, 1, 0.4);
  const puffGeo = new THREE.SphereGeometry(0.02, 14, 10);
  const parts = [];
  const tmp = new THREE.Vector3();
  const toFx = (v) => (fxParent ? v : root.worldToLocal(v));
  const k = () => (fxParent ? root.scale.x : 1);
  const floorY = () => (fxParent ? root.position.y : 0); // 몬스터가 선 바닥 높이 (광장 돌바닥 위 등)
  const at = (x, y, z) => toFx(core.localToWorld(new THREE.Vector3(x, y, z)));
  const dirOf = (x, z) => at(x, 0, z).sub(at(0, 0, 0)).setY(0).normalize(); // 몸 기준 방향을 효과 좌표로

  function crumb(side) {
    const m = part(crumbGeos[parts.length % crumbGeos.length], CRUMB, fx, '가루');
    m.userData.noOutline = true; // 가는 실이라 외곽선을 두르면 시커메짐
    m.castShadow = false;
    m.position.copy(at(side * 0.03, 0.003, D / 2));
    m.scale.setScalar(k());
    const v = dirOf(side, 0.8).multiplyScalar(0.18 + Math.random() * 0.12).add(tmp.set(0, 0.25 + Math.random() * 0.15, 0)).multiplyScalar(k());
    m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    parts.push({ m, v, kind: 'fall', age: 0, life: 2.6 + Math.random() * 0.6, spin: 12, flat: true });
  }
  function chip() {
    const m = part(chipGeo, RUBBER, fx, '조각');
    m.userData.outlineWidth = 0.0015;
    m.position.copy(at(W / 2, H * 0.6, 0));
    m.scale.setScalar(k());
    const v = dirOf(1, 0).multiplyScalar(0.3).add(tmp.set(0, 0.45, 0)).multiplyScalar(k());
    parts.push({ m, v, kind: 'fall', age: 0, life: 1.8, spin: 16 });
  }
  function stars(n) {
    const c = at(FACE_X, H * 0.6, D / 2 + 0.03);
    const side = dirOf(1, 0);
    for (let i = 0; i < n; i++) {
      const m = part(starGeo, STAR, fx, '별');
      m.userData.noOutline = true;
      m.castShadow = false;
      m.position.copy(c);
      const a = (i / n) * PI * 2 + 0.4;
      const v = side.clone().multiplyScalar(Math.cos(a) * 0.12).add(tmp.set(0, Math.sin(a) * 0.1 + 0.03, 0)).multiplyScalar(k());
      parts.push({ m, v, kind: 'star', age: 0, life: 0.55, size: k() });
    }
  }
  function puffs(n) {
    const c = at(0, H / 2, 0);
    for (let i = 0; i < n; i++) {
      const m = part(puffGeo, PUFF, fx, '연기');
      const a = (i / n) * PI * 2;
      m.position.copy(c).add(tmp.set(Math.cos(a) * 0.03, (Math.random() - 0.3) * 0.02, Math.sin(a) * 0.03).multiplyScalar(k()));
      const v = new THREE.Vector3(Math.cos(a) * 0.12, 0.06 + Math.random() * 0.05, Math.sin(a) * 0.12).multiplyScalar(k());
      parts.push({ m, v, kind: 'puff', age: 0, life: 0.6, size: 1.1 * k() * (0.8 + Math.random() * 0.5) });
    }
  }
  // 화가 나서 머리 위로 칙칙 뿜는 김
  function steam(n) {
    for (let i = 0; i < n; i++) {
      const s = i % 2 ? 1 : -1;
      const m = part(puffGeo, PUFF, fx, '김');
      m.castShadow = false;
      m.position.copy(at(FACE_X + s * 0.012, H + 0.004, 0));
      const v = new THREE.Vector3(0, 0.22, 0).add(dirOf(s, 0).multiplyScalar(0.04)).multiplyScalar(k());
      parts.push({ m, v, kind: 'puff', age: 0, life: 0.5, size: 0.4 * k() * (0.8 + Math.random() * 0.4) });
    }
  }
  function updateParts(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age += dt;
      const r = p.age / p.life;
      if (r >= 1) { fx.remove(p.m); parts.splice(i, 1); continue; }
      if (p.kind === 'fall') {
        // 튀어 올랐다가 떨어져 바닥에서 한 번 통 튀고 멈춤 (가루는 바닥에 납작 누움)
        p.v.y -= 1.6 * k() * dt;
        p.m.position.addScaledVector(p.v, dt);
        const floor = floorY() + 0.0015 * k();
        if (p.m.position.y < floor) {
          p.m.position.y = floor;
          p.v.set(p.v.x * 0.3, Math.abs(p.v.y) > 0.15 * k() ? -p.v.y * 0.35 : 0, p.v.z * 0.3);
          p.spin *= 0.3;
          if (p.flat && p.v.y === 0) { p.m.rotation.x = 0; p.m.rotation.z = 0; p.spin = 0; }
        }
        p.m.rotation.x += p.spin * dt;
        p.m.rotation.z += p.spin * 0.6 * dt;
        p.m.scale.setScalar(k() * (r > 0.8 ? (1 - r) / 0.2 : 1));
      } else if (p.kind === 'star') {
        p.m.position.addScaledVector(p.v, dt);
        p.m.rotation.z += 8 * dt;
        p.m.scale.setScalar(p.size * Math.sin(r * PI));
      } else {
        p.v.multiplyScalar(1 - 4 * dt);
        p.m.position.addScaledVector(p.v, dt);
        p.m.scale.setScalar(p.size * Math.sin(Math.min(1, r * 1.3) * PI) * (0.7 + r));
      }
    }
  }

  // ── 동작 상태 ──
  let state = 'idle';
  let u = 0;
  let t = 0;
  let crumbClock = 0;
  let crumbSide = 1;
  let mood = null; // 'angry': 화가 난 채로 있음 (평소 눈이 화난 눈, 머리 옆에 화남 표시)
  let moodT = 0;
  const fired = new Set();
  const once = (key, when) => (u >= when && !fired.has(key) ? (fired.add(key), true) : false);

  function play(name) {
    if (!BANJJOK_MOTIONS[name] && name !== 'gone') return;
    state = name;
    u = 0;
    fired.clear();
  }

  function update(dt) {
    t += dt;
    u += dt;
    moodT += dt;
    // eyes: 'open' | 'wide' | 'squint'(질끈) | 'half'(시무룩) | 'closed' | 'angry'(눈썹을 내리고 째려봄)
    // mouth: 'frown' | 'smile' | 'o' | 'grit'(이 악물기: 입을 옆으로 납작하게)
    const P = { sx: 1, sy: 1, sz: 1, x: 0, y: 0, z: 0, ry: 0, rx: 0, rz: 0, eyes: 'open', blink: 1,
      mouth: 'frown', bang: 0, sweat: false, flash: 0, show: 1, anger: 0, red: 0 };

    const br = Math.sin(t * 2.4);
    P.sy = 1 + 0.02 * br;
    P.sx = P.sz = 1 - 0.01 * br;
    if (t % 2.9 < 0.12) P.blink = 0.12;

    const M = BANJJOK_MOTIONS[state];
    if (state === 'idle') {
      // 왼쪽 오른쪽 두리번두리번, 반쪽이 안 보이면 한숨
      const c = t % 5;
      P.ry = c < 1 ? 0.6 * smooth(c) : c < 1.8 ? 0.6 : c < 2.5 ? lerp(0.6, -0.6, smooth(seg(c, 1.8, 2.5))) : c < 3.3 ? -0.6 : -0.6 * (1 - smooth(seg(c, 3.3, 3.8)));
      if (c > 3.8) {
        const s = Math.sin(seg(c, 3.8, 4.7) * PI);
        P.rz = 0.08 * s;
        P.sy *= 1 - 0.05 * s;
        if (s > 0.3) P.eyes = 'half';
      }
    } else if (state === 'walk') {
      // 부러진 쪽이 무거워서 늘 그쪽으로 기운 채 뒤뚱뒤뚱
      const ph = u * 2.5;
      const f = ph % 1;
      const side = Math.floor(ph) % 2 ? 1 : -1;
      const hop = Math.sin(f * PI);
      P.rz = side * 0.14 * hop - 0.07;
      P.y = hop * 0.01;
      const land = f < 0.15 ? 1 - f / 0.15 : 0;
      P.sy *= 1 - 0.08 * land + 0.04 * hop;
      P.sx *= 1 + 0.05 * land;
    } else if (state === 'rub') {
      // 앞으로 엎드려 박박 문질러 지우기 → 가루가 폴폴 → 다 지우고 뿌듯
      const lean = smooth(seg(u, 0, 0.3)) * (1 - smooth(seg(u, 1.9, 2.2)));
      P.rx = 0.45 * lean;
      P.z = 0.012 * lean;
      if (u > 0.3 && u < 1.9) {
        const rub = Math.sin((u - 0.3) * PI * 2 * 6);
        P.x = rub * 0.016;
        P.rz = rub * 0.07;
        P.eyes = 'squint';
        P.mouth = 'o';
        P.sweat = true;
        crumbClock += dt;
        if (crumbClock > 0.09) { crumbClock = 0; crumbSide = -crumbSide; crumb(crumbSide); }
      }
      if (u >= 2.2) {
        P.y = Math.sin(seg(u, 2.2, 2.55) * PI) * 0.012;
        P.mouth = 'smile';
        P.eyes = 'half';
      }
    } else if (state === 'scrub') {
      // 앞으로 엎드려 땀 뻘뻘 흘리며 쉬지 않고 박박 (평소 문지르기보다 빠르고 세게)
      const lean = smooth(seg(u, 0, 0.3));
      P.rx = 0.45 * lean;
      P.z = 0.012 * lean;
      if (u > 0.3) {
        const rub = Math.sin((u - 0.3) * PI * 2 * 7);
        P.x = rub * 0.018;
        P.rz = rub * 0.08;
        P.y = Math.abs(rub) * 0.002;
        P.eyes = 'squint';
        P.mouth = 'grit';
        P.sweat = true;
        crumbClock += dt;
        if (crumbClock > 0.08) { crumbClock = 0; crumbSide = -crumbSide; crumb(crumbSide); }
      }
    } else if (state === 'scrubEnd') {
      // 몸을 일으켜 이마 땀을 털듯 부르르 → 폴짝 뛰며 반짝, 뿌듯
      P.rx = 0.45 * (1 - smooth(seg(u, 0, 0.3)));
      P.z = 0.012 * (1 - smooth(seg(u, 0, 0.3)));
      if (u > 0.3 && u < 0.55) P.rz = Math.sin(u * 60) * 0.05;
      const j = seg(u, 0.55, 0.9);
      if (u >= 0.55) { P.y = Math.sin(j * PI) * 0.02; P.sy *= 1 + 0.08 * Math.sin(j * PI); }
      if (u >= 0.9) { const w = wobble(u - 0.9); P.sy = 1 - 0.12 * w; P.sx = P.sz = 1 + 0.06 * w; }
      P.eyes = u < 0.3 ? 'squint' : 'half';
      P.mouth = 'smile';
      if (once('stars', 0.7)) stars(5);
    } else if (state === 'notice') {
      // 깜짝 폴짝! 혹시 내 반쪽? 눈이 커지고 머리 위에 느낌표
      if (u < 0.12) { P.sy = 1 - 0.15 * (u / 0.12); P.sx = P.sz = 1 + 0.08 * (u / 0.12); }
      const j = seg(u, 0.12, 0.5);
      if (u >= 0.12 && u < 0.5) { P.y = Math.sin(j * PI) * 0.028; P.sy = 1.1 - 0.1 * j; P.sx = P.sz = 0.96; }
      if (u >= 0.5) {
        const w = wobble(u - 0.5);
        P.sy = 1 - 0.14 * w;
        P.sx = P.sz = 1 + 0.07 * w;
        P.rx = 0.18 * smooth(seg(u, 0.55, 0.8)) * (1 - seg(u, 1.05, 1.3)); // 앞으로 쭉 기울여 기대
      }
      const surprise = u < 0.12 ? 0 : u < 1.0 ? 1 : 1 - seg(u, 1.0, 1.3);
      if (surprise > 0.5) { P.eyes = 'wide'; P.mouth = 'o'; }
      P.blink = 1;
      P.bang = u < 0.12 ? 0 : u < 1.0 ? outBack(seg(u, 0.12, 0.3)) : 1 - seg(u, 1.0, 1.3);
    } else if (state === 'angry') {
      // 화남! 움츠렸다가 빵빵하게 부풀며 부르르 → 쿵쿵 제자리 구르기, 머리 위로 김이 칙칙, 몸이 붉어짐
      const crouch = smooth(seg(u, 0, 0.14)) * (1 - seg(u, 0.14, 0.22));
      const puff = smooth(seg(u, 0.14, 0.3)) * (1 - smooth(seg(u, 0.85, 1.1)));
      const shake = u > 0.14 && u < 0.85 ? 1 : 0;
      P.sy = 1 - 0.14 * crouch + 0.08 * puff;
      P.sx = P.sz = 1 + 0.07 * crouch + 0.05 * puff;
      P.rz = Math.sin(u * 55) * 0.05 * shake;
      P.x = Math.sin(u * 70) * 0.0025 * shake;
      P.rx = 0.1 * puff;
      if (shake) P.y = Math.abs(Math.sin(u * PI * 4.5)) * 0.007;
      P.eyes = 'angry';
      P.blink = 1;
      P.mouth = 'grit';
      P.anger = angerPulse(u - 0.14, t);
      P.red = puff;
      if (once('steam1', 0.25)) steam(2);
      if (once('steam2', 0.55)) steam(2);
    } else if (state === 'attack') {
      // 뒤로 젖혀 힘 모으기 → 앞으로 몸통 쿵! (0.47초에 닿음) → 별이 튀고 어질어질 → 제자리
      const a = smooth(seg(u, 0, 0.35));
      const b = seg(u, 0.35, 0.47);
      const back = smooth(seg(u, 0.75, 1.25));
      P.rx = -0.35 * a;
      P.z = -0.012 * a;
      P.sy *= 1 - 0.1 * a;
      P.sx *= 1 + 0.06 * a;
      P.eyes = 'squint';
      if (u >= 0.35) { P.rx = lerp(-0.35, 0.6, 1 - (1 - b) ** 2); P.z = lerp(-0.012, 0.05, b); P.sy = 1; P.sx = 1; P.eyes = 'wide'; }
      if (u >= 0.47) P.rz = Math.sin(u * 40) * 0.05 * (1 - seg(u, 0.47, 0.75));
      if (u >= 0.75) { P.rx = lerp(0.6, 0, back); P.z = lerp(0.05, 0, back); }
      if (once('stars', 0.47)) stars(5);
      if (u > 0.55) {
        const dz = 1 - seg(u, 0.55, 1.5);
        P.ry = Math.sin(u * 13) * 0.18 * dz; // 어질어질
        P.eyes = dz > 0.2 ? 'half' : 'open';
        P.mouth = 'o';
      }
    } else if (state === 'hit') {
      // 찌그러지며 뒤로 밀리고, 부러진 쪽에서 조각이 톡 떨어짐
      if (once('chip', 0)) { chip(); crumb(1); crumb(-1); }
      const w = wobble(u, 6, 26);
      P.sy = 1 - 0.25 * w;
      P.sx = P.sz = 1 + 0.15 * w;
      P.flash = u < 0.12 ? 1 - u / 0.12 : 0;
      P.z = -0.03 * Math.sin(Math.min(1, u / 0.7) * PI);
      P.rx = -0.3 * Math.exp(-5 * u);
      P.eyes = u < 0.6 ? 'squint' : 'open';
      P.mouth = u < 0.5 ? 'o' : 'frown';
    } else if (state === 'die') {
      // 번쩍 → 부들부들 → 폴짝 → 부러진 쪽으로 쿵 쓰러짐 → 펑
      if (once('chip', 0)) chip();
      P.flash = u < 0.15 ? 1 - u / 0.15 : 0;
      if (u < 0.3) P.x = Math.sin(u * 60) * 0.003;
      const j = seg(u, 0.3, 0.75);
      P.y = Math.sin(j * PI) * 0.02;
      P.rz = -PI / 2 * smooth(seg(u, 0.45, 0.8)) + Math.sin(seg(u, 0.8, 1.05) * PI) * 0.12;
      P.eyes = u < 0.8 ? 'wide' : 'squint';
      P.mouth = 'o';
      P.blink = 1;
      if (u > 1.45) P.show = u < 1.6 ? 1 + 0.12 * seg(u, 1.45, 1.6) : 1.12 * (1 - smooth(seg(u, 1.6, 1.72)));
      if (once('puff', 1.6)) { puffs(7); for (let i = 0; i < 4; i++) crumb(i % 2 ? 1 : -1); }
    } else if (state === 'spawn') {
      P.show = outBack(seg(u, 0.05, 0.45), 2.4);
      P.blink = u > 0.5 && u < 0.6 ? 0.12 : 1;
    } else if (state === 'gone') {
      P.show = 0;
    }

    // 화가 난 채로 있을 때: 평소 눈은 화난 눈, 화남 표시가 콩닥콩닥
    if (mood === 'angry' && P.show > 0.5 && state !== 'die') {
      if (P.eyes === 'open' && P.blink >= 0.5) P.eyes = 'angry';
      if (state !== 'angry') P.anger = Math.max(P.anger, 0.75 * angerPulse(moodT, t));
    }

    if (M && !M.loop && u >= M.dur) {
      const ended = state;
      play(ended === 'die' ? 'gone' : 'idle');
      onDone?.(ended);
    }

    // ── 자세 적용 ── (기울어도 모서리가 땅에 박히지 않게 올려 줌)
    const lift = (W / 2) * Math.abs(Math.sin(P.rz)) + (D / 2) * Math.abs(Math.sin(P.rx));
    body.scale.set(P.sx * P.show, P.sy * P.show, P.sz * P.show);
    body.position.set(P.x, P.y + lift * P.show + LIFT, P.z);
    body.rotation.y = P.ry;
    core.rotation.set(P.rx, 0, P.rz);
    let ex = 1, ey = 1;
    if (P.eyes === 'wide') { ex = 1.45; ey = 1.5; }
    else if (P.eyes === 'squint') { ex = 1.2; ey = 0.2; }
    else if (P.eyes === 'half') ey = 0.45;
    else if (P.eyes === 'angry') { ex = 1.1; ey = 0.7; }
    ey *= P.blink;
    for (const e of eyes) e.scale.set(ex, Math.max(0.08, ey), 1);
    for (const b of brows) b.visible = P.eyes === 'angry';
    mouth.visible = P.mouth !== 'o';
    mouth.rotation.z = P.mouth === 'smile' ? PI : 0;
    mouth.scale.set(P.mouth === 'grit' ? 1.5 : 1, P.mouth === 'grit' ? 0.45 : 1, 1); // 이 악물기: 옆으로 넓고 납작한 입
    mouthO.visible = P.mouth === 'o';
    sweat.visible = P.sweat;
    if (P.sweat) sweat.position.y = H - ((u * 1.5) % 1) * 0.015;
    bang.visible = P.bang > 0.001;
    bang.scale.set(0.03 * P.bang, 0.06 * P.bang, 1);
    bang.position.set(FACE_X, 0.1 + P.y, 0);
    anger.visible = P.anger > 0.001;
    anger.scale.setScalar(0.04 * P.anger);
    anger.position.set(FACE_X - 0.03, 0.09 + P.y, 0);

    updateParts(dt);
    syncToon(root, true, outlineScale);
    if (fxParent) syncToon(fx, true, outlineScale);
    core.traverse((o) => {
      if (o.isMesh && !o.userData.isOutline && !o.material.transparent && o.material.emissive) {
        const r = o.name === '눈' || o.name === '종이옷' ? 0 : P.red; // 눈·입은 붉히지 않음 (파란 종이 옷도 붉히면 보라색이 됨)
        o.material.emissive.setRGB(P.flash + r * 0.32, P.flash + r * 0.02, P.flash * 0.9);
      }
    });
  }

  return {
    root,
    play,
    update,
    // 기분: 'angry'(화난 채로) | null(보통)
    setMood(m) { if (m !== mood) { mood = m; moodT = 0; } },
    get state() { return state; },
  };
}
