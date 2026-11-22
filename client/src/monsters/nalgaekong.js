// 날개콩: 제일 쪼렙 몬스터. 노란 솜뭉치 새인데 열심히 파닥여도 1cm밖에 못 뜬다
// createNalgaekong() 이 돌려주는 root 를 장면에 넣고, 매 프레임 update(dt) 를 부르면 된다.
// play('walk') 처럼 동작 이름을 주면 그 동작으로 바뀐다 (한 번만 하는 동작은 끝나면 대기로 돌아감)
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { canvasTexture } from '../villager/textures.js';
import { syncToon, addOutline, OUTLINE_COLOR } from '../villager/toon.js';

const PI = Math.PI;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const seg = (u, a, b) => clamp01((u - a) / (b - a)); // u 가 a→b 사이를 지날 때 0→1
const smooth = (x) => x * x * (3 - 2 * x);
const outQuad = (x) => 1 - (1 - x) * (1 - x);
const outBack = (x, s = 2) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2);
const wobble = (u, k = 7, w = 24) => (u < 0 ? 0 : Math.exp(-k * u) * Math.cos(w * u)); // 1에서 출렁이며 0으로
const lerp = (a, b, k) => a + (b - a) * k;

// loop: 계속 반복 / dur: 한 번 하고 끝나는 동작의 길이(초)
export const NALGAE_MOTIONS = {
  idle: { label: '대기', loop: true },
  walk: { label: '걷기', loop: true },
  flutter: { label: '날기 시도', dur: 2.2 },
  notice: { label: '발견!', dur: 1.3 },
  attack: { label: '공격 (쪼기)', dur: 1.1 },
  hit: { label: '맞음', dur: 0.9 },
  die: { label: '쓰러짐', dur: 2.2 },
  spawn: { label: '등장', dur: 0.7 },
};

// outlineScale: 외곽선 두께 배율 (마을에서는 주민과 같이 0.65 로 얇게)
export function createNalgaekong({ fxParent = null, onDone = null, outlineScale = 1 } = {}) {
  const mat = (color, roughness = 0.6) => new THREE.MeshStandardMaterial({ color, roughness });
  const YELLOW = mat('#ffe07a', 0.85);
  const ORANGE = mat('#ff9d3c', 0.6);
  const WHITE = mat('#ffffff', 0.3);
  const FEATHER = mat('#ffe88f', 0.9);
  const PUFF = mat('#fffaf0', 1);
  const ball = (r, n = 24) => new THREE.SphereGeometry(r, n, Math.round(n * 0.75));
  const add = (geo, m, parent, name = '부품') => {
    const o = new THREE.Mesh(geo, m);
    o.name = name;
    o.castShadow = true;
    o.userData.outlineWidth = 0.002; // 몸통도 머리 꼭지만큼 얇은 외곽선
    parent.add(o);
    return o;
  };

  // root(위치·방향) > body(바닥 기준으로 늘이고 찌그러뜨림) > core(몸 중심 기준으로 기울이고 넘어짐)
  const root = new THREE.Group();
  root.name = '날개콩';
  const body = new THREE.Group();
  root.add(body);
  // 몸 중심 높이: 발과 몸 아래쪽 외곽선까지 땅 위로 올라오도록 (땅에 파묻히면 외곽선이 끊겨 보임)
  const CY = 0.0645;
  const core = new THREE.Group();
  core.position.y = CY;
  body.add(core);

  add(ball(0.065, 40).scale(1, 0.95, 1), YELLOW, core, '몸');
  const tuft = add(ball(0.012, 12).scale(0.6, 1.4, 0.6).translate(0, 0.012, 0), YELLOW, core, '머리털');
  tuft.position.set(0, 0.054, 0.005);

  // 눈: 주민 눈과 같은 방식으로, 몸 겉면에 딱 붙은 조각에 그림을 그려 입힌다
  // 도안은 주민 눈 도안(textures.js)과 같은 단위(가운데 0,0 / 눈 하나 ±20칸)와 같은 잉크·하이라이트 색을 쓴다
  const INK = '#3a2318';
  const HL = 'rgba(255,255,255,0.95)';
  const oval = (g, x, y, rx, ry) => { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, PI * 2); };
  const stroke = (g, w) => { g.strokeStyle = INK; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke(); };
  const shine = (g, x, y, r) => { oval(g, x, y, r, r * 1.1); g.fillStyle = HL; g.fill(); };
  // 두 톤 눈동자: 위는 짙은 밤색, 아래쪽은 따뜻한 갈색이 비침 + 큰 반짝이와 작은 반짝이
  const iris = (g, rx, ry) => {
    oval(g, 0, 0, rx, ry); g.fillStyle = INK; g.fill();
    g.save(); oval(g, 0, 0, rx, ry); g.clip();
    oval(g, 0, ry * 0.75, rx * 1.05, ry * 0.62); g.fillStyle = '#7a4a2e'; g.fill();
    g.restore();
    oval(g, 0.5, -0.5, rx * 0.5, ry * 0.5); g.fillStyle = '#1e120c'; g.fill();
    shine(g, -rx * 0.38, -ry * 0.42, rx * 0.38); // 바깥 위 큰 반짝이
    shine(g, rx * 0.4, ry * 0.45, rx * 0.15); // 안쪽 아래 작은 반짝이
  };
  // 도안은 화면 왼쪽 눈 기준(-x 가 바깥 눈꼬리). 오른쪽 눈은 좌우를 뒤집어 그린다
  const EYE_DRAW = {
    open: (g) => iris(g, 10, 12.5),
    wide: (g) => iris(g, 12, 14.5), // 놀란 눈: 더 크고 반짝
    closed: (g) => { g.beginPath(); g.moveTo(-11, 1); g.quadraticCurveTo(0, 9, 11, 1); stroke(g, 3.4); }, // 감은 눈 ︶
    squint: (g) => { g.beginPath(); g.moveTo(-9, -9); g.lineTo(8, 0); g.lineTo(-9, 9); stroke(g, 3.6); }, // 질끈 >
    dead: (g) => { g.beginPath(); g.moveTo(-8, -8); g.lineTo(8, 8); g.moveTo(8, -8); g.lineTo(-8, 8); stroke(g, 3.4); }, // X
  };
  const eyeTex = (kind, s) => canvasTexture(`nalgaeEye:${kind}:${s}`, 128, 128, (g, w, h) => {
    g.translate(w / 2, h / 2);
    g.scale((s < 0 ? 1 : -1) * w / 44, h / 44);
    EYE_DRAW[kind](g);
  });
  const eyes = [];
  for (const s of [-1, 1]) {
    const d = new THREE.Vector3(s * 0.022, 0.013, 0.0605).normalize();
    const half = 0.27; // 조각 크기(각도의 절반)
    const geo = new THREE.SphereGeometry(0.0653, 14, 14, PI / 2 - half, half * 2, PI / 2 - half, half * 2)
      .rotateX(-Math.asin(d.y)).rotateY(Math.atan2(d.x, d.z)).scale(1, 0.95, 1);
    const m = add(geo, new THREE.MeshStandardMaterial({ map: eyeTex('open', s), transparent: true, depthWrite: false,
      roughness: 0.22, polygonOffset: true, polygonOffsetFactor: -3 }), core, '눈');
    m.castShadow = false;
    m.renderOrder = 1; // 홍조 위에 그려지게
    eyes.push({ m, s, kind: 'open' });
  }
  // 볼 홍조: 몸 겉면에 딱 붙은 얇은 조각에 그린 무늬라 튀어나오지 않는다
  const blushTex = canvasTexture('nalgaeBlush', 128, 128, (g, w, h) => {
    g.translate(w / 2, h / 2);
    g.scale(1, 0.62);
    // 가운데부터 가장자리까지 종 모양으로 천천히 옅어지는 분홍 (경계가 보이지 않게 단계를 촘촘히)
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, w / 2);
    for (let i = 0; i <= 10; i++) {
      const x = i / 10;
      gr.addColorStop(x, `rgba(255,150,185,${(0.68 * Math.exp(-x * x * 4.2)).toFixed(3)})`);
    }
    g.fillStyle = gr;
    g.beginPath();
    g.arc(0, 0, w / 2, 0, PI * 2);
    g.fill();
  });
  const BLUSH = new THREE.MeshStandardMaterial({ map: blushTex, transparent: true, depthWrite: false, roughness: 0.8,
    polygonOffset: true, polygonOffsetFactor: -2 });
  for (const s of [-1, 1]) {
    const d = new THREE.Vector3(s * 0.042, -0.004, 0.05).normalize();
    const a = 0.26, b = 0.26; // 조각의 가로·세로 크기(각도)
    const geo = new THREE.SphereGeometry(0.0652, 12, 10, PI / 2 - a, a * 2, PI / 2 - b, b * 2)
      .rotateX(-Math.asin(d.y)).rotateY(Math.atan2(d.x, d.z)).scale(1, 0.95, 1);
    const m = add(geo, BLUSH, core, '눈');
    m.castShadow = false;
  }

  // 부리: 윗부리는 고정, 아랫부리만 벌어짐
  const BEAK_LINE = 0.0006 * outlineScale; // 부리는 작아서 몸보다 얇은 외곽선
  // 끝이 뭉툭한 총알 모양. 가장 굵은 둘레가 몸 밖으로 나와 있어야 정면에서도 외곽선 테가 보인다
  const beakGeo = (k) => new THREE.LatheGeometry([
    [0.0001, -0.004], [0.006, -0.0035], [0.0088, 0], [0.0082, 0.0035], [0.0058, 0.0068], [0.0028, 0.0088], [0.0001, 0.0095],
  ].map(([r, y]) => new THREE.Vector2(r * k, y * k)), 24).rotateX(PI / 2);
  const beakTop = add(beakGeo(0.74), ORANGE, core, '부리');
  beakTop.position.set(0, 0.0015, 0.0662);
  beakTop.scale.y = 0.72;
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.0028, 0.0642);
  core.add(jaw);
  const lower = add(beakGeo(0.52), ORANGE, jaw, '아랫부리');
  lower.position.z = 0.0015;
  lower.scale.y = 0.7;
  // 부리 외곽선: 부리가 몸에 반쯤 묻혀 있어 보통 외곽선 껍질은 뒤쪽이 몸에 가려 테두리가 떠 보인다.
  // 그래서 부리 껍질만 화면 위치는 그대로 두고 카메라 쪽으로 12mm 당겨 그려, 몸에 가려지지 않게 한다
  // (몸 반대편으로 돌아가면 몸 두께가 그보다 훨씬 두꺼워 비쳐 보이지 않음)
  const beakLineMat = new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide });
  beakLineMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  transformed += normalize(normal) * ${BEAK_LINE.toFixed(5)};`)
      .replace('#include <project_vertex>', `vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
  mvPosition.xyz += normalize(-mvPosition.xyz) * 0.012;
  gl_Position = projectionMatrix * mvPosition;`);
  };
  for (const m of [beakTop, lower]) addOutline(m, BEAK_LINE).material = beakLineMat;

  // 날개 모양: 공을 납작하게 눌러 빚은 뒤, 아래 뒤쪽 가장자리만 물결치게 부풀려 깃털 끝 세 개를 만든다
  // (판을 밀어 만든 모양과 달리 어디에도 모서리가 없어 깃털 끝이 매끈하게 이어짐)
  const wingGeo = (() => {
    const g = new THREE.SphereGeometry(1, 48, 32);
    const p = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      let a = Math.atan2(v.y, v.z); // 0 = 앞, -π/2 = 아래, ±π = 뒤
      if (a > PI * 0.75) a -= PI * 2;
      const tt = clamp01((a + PI * 1.25) / (PI * 0.95)); // 뒤(위쪽)에서 아래 앞쪽까지 0→1
      const k = 1 + 0.11 * Math.sin(tt * PI) * (0.5 - 0.5 * Math.cos(tt * PI * 6));
      let x = v.x * 0.0045, y = v.y * 0.016 * k, z = v.z * 0.013 * k;
      if (y < 0) z += y * 0.35; // 아래쪽은 뒤로 살짝 쓸려 내려감
      p.setXYZ(i, x, y - 0.013, z);
    }
    g.computeVertexNormals();
    return g;
  })();
  // 외곽선 껍질은 꼭짓점을 이어 붙인 매끈한 법선으로 (면 경계에서 외곽선이 벌어지지 않게)
  const wingOutline = (() => {
    const g = wingGeo.clone();
    g.deleteAttribute('normal');
    g.deleteAttribute('uv');
    const m = mergeVertices(g, 1e-5);
    m.computeVertexNormals();
    return m;
  })();
  const wings = [];
  for (const s of [-1, 1]) {
    const piv = new THREE.Group();
    piv.position.set(s * 0.06, 0.008, 0);
    core.add(piv);
    const w = add(wingGeo, YELLOW, piv, '날개');
    w.userData.outlineGeometry = wingOutline;
    w.position.x = s * 0.003;
    w.rotation.y = s * 0.12; // 앞쪽이 몸에 살짝 붙게
    wings.push([piv, s]);
  }
  const feet = [];
  for (const s of [-1, 1]) {
    const f = add(ball(0.008, 10).scale(1.3, 0.5, 1.6), ORANGE, core, '발');
    feet.push([f, s]);
  }
  const sweat = add(ball(0.006, 12).scale(0.8, 1.3, 0.8), mat('#bfe8ff', 0.2), core, '땀');
  sweat.position.set(0.05, 0.045, 0.03);

  // 놀랐을 때 머리 위에 뜨는 느낌표
  const bang = new THREE.Sprite(new THREE.SpriteMaterial({
    map: canvasTexture('nalgaeBang', 64, 128, (g, w, h) => {
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
  bang.position.set(0.045, 0.175, 0);
  root.add(bang);

  // ── 효과(깃털·연기·반짝이): 몬스터가 움직여도 제자리에 남도록 바깥에 둠 ──
  const fx = new THREE.Group();
  fx.name = '날개콩효과';
  (fxParent ?? root).add(fx);
  const featherGeo = ball(0.007, 10).scale(0.55, 0.25, 1.3);
  const puffGeo = ball(0.02, 14);
  const sparkGeo = new THREE.OctahedronGeometry(0.006);
  const parts = [];
  const tmpV = new THREE.Vector3();
  const toFx = (v) => (fxParent ? v : root.worldToLocal(v));
  const k = () => (fxParent ? root.scale.x : 1);

  // from: 깃털이 나오는 부품, local: 그 부품 안에서의 위치(없으면 부품 기준점)
  function burstFeathers(n, from = core, local = null) {
    const c = toFx(local ? from.localToWorld(local.clone()) : from.getWorldPosition(new THREE.Vector3()));
    for (let i = 0; i < n; i++) {
      const m = add(featherGeo, FEATHER, fx, '깃털');
      m.position.copy(c);
      m.scale.setScalar(k());
      const a = Math.random() * PI * 2;
      const v = new THREE.Vector3(Math.cos(a) * 0.3, 0.35 + Math.random() * 0.35, Math.sin(a) * 0.3)
        .multiplyScalar(k() * (0.6 + Math.random() * 0.5));
      m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      parts.push({ m, v, kind: 'feather', age: 0, life: 1.4 + Math.random() * 0.5, seed: Math.random() * 10 });
    }
  }
  function puffs(n, size = 1) {
    const c = toFx(core.getWorldPosition(new THREE.Vector3()));
    for (let i = 0; i < n; i++) {
      const m = add(puffGeo, PUFF, fx, '연기');
      const a = (i / n) * PI * 2;
      m.position.copy(c).add(tmpV.set(Math.cos(a) * 0.03, (Math.random() - 0.3) * 0.03, Math.sin(a) * 0.03).multiplyScalar(k()));
      const v = new THREE.Vector3(Math.cos(a) * 0.12, 0.06 + Math.random() * 0.05, Math.sin(a) * 0.12).multiplyScalar(k());
      parts.push({ m, v, kind: 'puff', age: 0, life: 0.55 + Math.random() * 0.15, size: size * k() * (0.8 + Math.random() * 0.5) });
    }
  }
  function sparks(n) {
    const c = toFx(beakTop.getWorldPosition(new THREE.Vector3()));
    for (let i = 0; i < n; i++) {
      const m = add(sparkGeo, WHITE, fx, '반짝');
      m.position.copy(c);
      const a = (i / n) * PI * 2;
      const v = new THREE.Vector3(Math.cos(a) * 0.2, Math.sin(a) * 0.2 + 0.05, 0.05).multiplyScalar(k());
      parts.push({ m, v, kind: 'spark', age: 0, life: 0.3, size: k() });
    }
  }
  function updateParts(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age += dt;
      const r = p.age / p.life;
      if (r >= 1) {
        fx.remove(p.m);
        parts.splice(i, 1);
        continue;
      }
      if (p.kind === 'feather') {
        // 깃털: 위로 튀었다가 살랑살랑 흔들리며 천천히 떨어짐
        p.v.y -= 0.9 * k() * dt;
        p.v.multiplyScalar(1 - 3 * dt);
        p.m.position.addScaledVector(p.v, dt);
        p.m.position.x += Math.sin(p.age * 7 + p.seed) * 0.02 * k() * dt;
        if (p.m.position.y < 0.002) { p.m.position.y = 0.002; p.v.set(0, 0, 0); }
        else p.m.rotation.z = Math.sin(p.age * 6 + p.seed) * 0.8;
        p.m.scale.setScalar(k() * (r > 0.75 ? (1 - r) / 0.25 : 1));
      } else if (p.kind === 'puff') {
        p.v.multiplyScalar(1 - 4 * dt);
        p.m.position.addScaledVector(p.v, dt);
        p.m.scale.setScalar(p.size * Math.sin(Math.min(1, r * 1.3) * PI) * (0.7 + r));
      } else {
        p.m.position.addScaledVector(p.v, dt);
        p.m.rotation.y += dt * 12;
        p.m.scale.setScalar(p.size * (1 - r));
      }
    }
  }

  // ── 동작 상태 ──
  let state = 'idle';
  let u = 0; // 지금 동작을 시작한 뒤 흐른 시간
  let t = 0; // 전체 흐른 시간 (숨쉬기처럼 늘 이어지는 움직임용)
  const fired = new Set();
  const once = (key, at) => (u >= at && !fired.has(key) ? (fired.add(key), true) : false);

  function play(name) {
    if (!NALGAE_MOTIONS[name] && name !== 'gone') return;
    state = name;
    u = 0;
    fired.clear();
  }

  function setFlash(f) {
    core.traverse((o) => {
      if (o.isMesh && !o.userData.isOutline && o.material.emissive) o.material.emissive.setRGB(f, f, f * 0.9);
    });
  }

  function update(dt) {
    t += dt;
    u += dt;
    const P = { sy: 1, sxz: 1, y: 0, z: 0, rx: 0, rz: 0, wingL: 0.3, wingR: 0.3, eyes: 'open', eyeS: 1, blink: 1, beak: 0,
      tuft: 0, liftL: 0, liftR: 0, swingL: 0, swingR: 0, bang: 0, sweat: false, flash: 0, show: 1 };

    // 늘 깔려 있는 숨쉬기·깜빡임·머리털 흔들림
    const br = Math.sin(t * 2.4);
    P.sy = 1 + 0.03 * br;
    P.sxz = 1 - 0.015 * br;
    P.wingL = P.wingR = 0.3 + 0.05 * br;
    P.tuft = Math.sin(t * 3) * 0.2;
    if (t % 3.3 < 0.12) P.blink = 0.1;

    const M = NALGAE_MOTIONS[state];
    if (state === 'idle') {
      // 가끔 고개를 갸웃
      const c = t % 6;
      P.rz = Math.sin(t * 0.7) * 0.04 + (c > 4 && c < 5.5 ? Math.sin(seg(c, 4, 5.5) * PI) * 0.22 : 0);
    } else if (state === 'walk') {
      // 뒤뚱뒤뚱: 몸을 좌우로 크게 흔들며 짧은 다리로 종종걸음
      const p = u * PI * 2 * 2.2;
      const sp = Math.sin(p);
      P.rz = sp * 0.16;
      P.rx = 0.08;
      P.y = Math.abs(sp) * 0.006;
      P.sy *= 1 - 0.04 * Math.abs(Math.cos(p));
      P.liftL = Math.max(0, sp) * 0.012;
      P.liftR = Math.max(0, -sp) * 0.012;
      P.swingL = Math.cos(p) * 0.01;
      P.swingR = -Math.cos(p) * 0.01;
      P.wingL = P.wingR = 0.55 + Math.sin(p * 2) * 0.15;
      P.tuft = -sp * 0.35;
    } else if (state === 'flutter') {
      // 움츠렸다가 힘껏 파닥 → 공중으로 살짝 떠올라 버둥버둥 (깃털이 계속 빠짐) → 힘이 빠져 털썩 착지, 숨 헐떡
      if (u < 0.15) { P.sy = 1 - 0.1 * smooth(u / 0.15); P.sxz = 1 + 0.05 * smooth(u / 0.15); }
      if (u < 1.7) {
        const up = smooth(seg(u, 0.15, 0.55));
        const down = Math.pow(seg(u, 1.4, 1.7), 2);
        const hover = up * (1 - down);
        P.y = 0.034 * hover + Math.sin(u * 9) * 0.004 * hover; // 4~5cm 떠서 위아래로 버둥
        const flap = 0.5 + 0.5 * Math.sin(u * 45);
        P.wingL = P.wingR = 0.3 + 1.0 * flap;
        P.rx = Math.sin(u * 45) * 0.03 + 0.08 * hover;
        P.rz = Math.sin(u * 5) * 0.06 * hover;
        P.eyes = 'squint';
        P.sweat = true;
        P.swingL = Math.sin(u * 13) * 0.004 * hover; // 발은 대롱대롱
        P.swingR = -Math.sin(u * 13) * 0.004 * hover;
        P.tuft = Math.sin(u * 45) * 0.4;
        // 파닥일 때마다 날개에서 깃털이 한 개씩 빠져나옴
        if (u > 0.2 && u < 1.55) {
          const n = Math.floor(u / 0.13);
          if (once(`flap${n}`, n * 0.13)) {
            const [piv, s] = wings[n % 2];
            burstFeathers(1, piv, new THREE.Vector3(s * 0.004, -0.02, 0));
          }
        }
        if (once('liftoff', 0.2)) burstFeathers(3);
      } else {
        if (once('land', 1.7)) burstFeathers(3);
        const w = wobble(u - 1.7, 8, 26);
        P.sy = 1 - 0.2 * w;
        P.sxz = 1 + 0.11 * w;
        P.rz = Math.sin((u - 1.7) * 14) * 0.08 * (2.2 - u) / 0.5;
        P.beak = u < 1.95 ? 0.35 : 0;
        P.sweat = u < 1.95;
      }
    } else if (state === 'notice') {
      // 깜짝! 제자리에서 폴짝 뛰고 날개를 번쩍, 머리 위에 느낌표
      if (u < 0.12) { P.sy = 1 - 0.15 * (u / 0.12); P.sxz = 1 + 0.08 * (u / 0.12); }
      const j = seg(u, 0.12, 0.5);
      if (u >= 0.12 && u < 0.5) { P.y = Math.sin(j * PI) * 0.035; P.sy = 1.12 - 0.12 * j; P.sxz = 0.95; }
      if (u >= 0.5) { const w = wobble(u - 0.5); P.sy = 1 - 0.15 * w; P.sxz = 1 + 0.08 * w; }
      const surprise = u < 0.12 ? 0 : u < 1.0 ? 1 : 1 - seg(u, 1.0, 1.3);
      P.eyeS = 1 + 0.35 * surprise;
      P.blink = 1;
      P.wingL = P.wingR = lerp(0.3, u < 0.5 ? 1.7 : 1.0, surprise);
      P.beak = u > 0.12 && u < 0.45 ? 0.45 : 0;
      P.bang = u < 0.12 ? 0 : u < 1.0 ? outBack(seg(u, 0.12, 0.3)) : 1 - seg(u, 1.0, 1.3);
      P.tuft = surprise * -0.1 + Math.sin(u * 30) * 0.3 * surprise;
    } else if (state === 'attack') {
      // 뒤로 젖혀 힘 모으기 → 부리로 콕! → 부리가 얼얼해서 눈 질끈
      const a = smooth(seg(u, 0, 0.35));
      const b = outQuad(seg(u, 0.35, 0.47));
      const back = smooth(seg(u, 0.62, 1.1));
      let rx = -0.35 * a, z = -0.01 * a, wing = 0.3 + 0.9 * a, beak = 0;
      if (u >= 0.35) { rx = lerp(-0.35, 0.6, b); z = lerp(-0.01, 0.025, b); beak = 0.5 * b; wing = lerp(1.2, 0.5, b); P.y = Math.sin(b * PI) * 0.008; }
      if (u >= 0.62) { rx = lerp(0.6, 0, back); z = lerp(0.025, 0, back); beak = lerp(0.5, 0, back); wing = lerp(0.5, 0.3, back); }
      P.rx = rx; P.z = z; P.beak = beak; P.wingL = P.wingR = wing;
      P.sy = 1 - 0.08 * a * (1 - b);
      if (u > 0.5 && u < 0.85) { P.eyes = 'squint'; P.rz = Math.sin(u * 40) * 0.05; }
      if (once('spark', 0.47)) sparks(5);
    } else if (state === 'hit') {
      // 맞음: 하얗게 번쩍, 찌부 → 출렁, 뒤로 밀리고 깃털이 빠짐
      if (once('feather', 0)) burstFeathers(5);
      const w = wobble(u, 6, 26);
      P.sy = 1 - 0.28 * w;
      P.sxz = 1 + 0.18 * w;
      P.flash = u < 0.12 ? 1 - u / 0.12 : 0;
      P.z = -0.03 * Math.sin(Math.min(1, u / 0.7) * PI);
      P.rx = -0.4 * Math.exp(-5 * u);
      P.eyes = u < 0.6 ? 'squint' : 'open';
      P.beak = u < 0.4 ? 0.45 : 0;
      P.wingL = P.wingR = 0.8 + 0.5 * Math.sin(u * 40) * Math.exp(-3 * u);
    } else if (state === 'die') {
      // 쓰러짐: 번쩍 → 폴짝 뛰며 옆으로 벌러덩 → 발 파르르 → 펑 하고 사라짐
      if (once('feather', 0)) burstFeathers(7);
      P.flash = u < 0.15 ? 1 - u / 0.15 : 0;
      if (u < 0.15) { const w = wobble(u, 6, 26); P.sy = 1 - 0.25 * w; P.sxz = 1 + 0.15 * w; }
      const j = seg(u, 0.15, 0.55);
      P.y = Math.sin(j * PI) * 0.03;
      P.rz = 1.45 * smooth(j);
      if (u >= 0.55) { const w = wobble(u - 0.55, 8, 24); P.sy = 1 - 0.12 * w; P.sxz = 1 + 0.06 * w; }
      P.eyes = u < 0.3 ? 'squint' : 'dead';
      P.beak = u > 0.3 ? 0.3 : 0.45;
      P.wingL = P.wingR = u < 0.55 ? 1.2 : 0.9;
      if (u > 0.7 && u < 1.3) { const tw = Math.max(0, Math.sin(u * 28)) * 0.006; P.liftL = tw; P.liftR = Math.max(0, Math.sin(u * 28 + 1.5)) * 0.006; }
      P.tuft = u > 0.55 ? 0.5 : 0;
      P.blink = 1;
      // 살짝 부풀었다가 펑
      if (u > 1.35) P.show = u < 1.5 ? 1 + 0.12 * seg(u, 1.35, 1.5) : 1.12 * (1 - smooth(seg(u, 1.5, 1.62)));
      if (once('puff', 1.5)) { puffs(7, 1.2); burstFeathers(4); }
    } else if (state === 'spawn') {
      P.show = outBack(seg(u, 0.05, 0.45), 2.4);
      P.wingL = P.wingR = 0.3 + 0.8 * (1 - seg(u, 0.3, 0.7));
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
    body.position.set(0, P.y, P.z);
    core.rotation.set(P.rx, 0, P.rz);
    wings[0][0].rotation.z = -P.wingL;
    wings[1][0].rotation.z = P.wingR;
    let eyeKind = P.eyes;
    if (eyeKind === 'open') eyeKind = P.blink < 0.5 ? 'closed' : P.eyeS > 1.15 ? 'wide' : 'open';
    for (const e of eyes) {
      if (e.kind === eyeKind) continue;
      e.kind = eyeKind;
      e.m.material.map = eyeTex(eyeKind, e.s);
    }
    jaw.rotation.x = P.beak;
    tuft.rotation.z = P.tuft;
    feet[0][0].position.set(-0.02, -0.058 + P.liftL, 0.012 + P.swingL);
    feet[1][0].position.set(0.02, -0.058 + P.liftR, 0.012 + P.swingR);
    sweat.visible = P.sweat;
    if (P.sweat) sweat.position.y = 0.045 - ((u * 1.5) % 1) * 0.02;
    bang.visible = P.bang > 0.001;
    bang.scale.set(0.035 * P.bang, 0.07 * P.bang, 1);
    bang.position.y = 0.175 + P.y;

    updateParts(dt);
    syncToon(root, true, outlineScale);
    if (fxParent) syncToon(fx, true, outlineScale);
    setFlash(P.flash);
  }

  return {
    root,
    play,
    update,
    get state() { return state; },
  };
}
