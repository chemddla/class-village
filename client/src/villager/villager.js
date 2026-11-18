// 고품질 마을 주민 캐릭터 (모두 코드로 생성: 회전체 + 변형 구 + 캔버스 텍스처)
// 키 약 1.0, 약 2.6등신. 정면은 +Z.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  aoGradient, faceTexture, eyeTexture, hairTexture, hairBump, clothTexture, clothBump,
  plaidTexture, soleBump, pocketTexture, shade,
} from './textures.js';

const PI = Math.PI;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// ───────────── 머리 모양: 볼살이 아래로 처진 가로로 넓은 둥근 사각 구 ─────────────
export const HEAD_R = 0.2;

export function dir(phi, th, out = V()) {
  return out.set(Math.sin(th) * Math.sin(phi), Math.cos(th), Math.sin(th) * Math.cos(phi));
}

export function headShape(n, out = V()) {
  const p = 2.6; // 2보다 크면 둥근 사각형(스쿼클)
  const k = (Math.abs(n.x) ** p + Math.abs(n.y) ** p + Math.abs(n.z) ** p) ** (1 / p);
  out.copy(n).divideScalar(k).lerp(n, 0.35);
  out.x *= 1.12;
  out.y *= 0.95;
  out.z *= 0.97;
  if (out.y < 0) {
    // 아래쪽 볼살: 옆과 앞으로 통통하게, 턱은 살짝 납작
    const t = -out.y;
    out.x *= 1 + 0.11 * t;
    out.z *= 1 + 0.07 * t;
    out.y *= 1 - 0.07 * t;
  }
  return out.multiplyScalar(HEAD_R);
}

const surf = (phi, th, scale = 1) => headShape(dir(phi, th)).multiplyScalar(scale);

function surfNormal(phi, th, scale = 1) {
  const e = 0.002;
  const a = surf(phi + e, th, scale).sub(surf(phi - e, th, scale));
  const b = surf(phi, th + e, scale).sub(surf(phi, th - e, scale));
  return b.cross(a).normalize();
}

// 방위각·극각 격자로 곡면 만들기 (가장자리가 계단 없이 매끈함)
function shellGrid(nPhi, nT, thetaMax, point, { phiMin = -PI, phiMax = PI } = {}) {
  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i <= nPhi; i++) {
    const phi = phiMin + ((phiMax - phiMin) * i) / nPhi;
    const tm = thetaMax(phi);
    for (let j = 0; j <= nT; j++) {
      const t = j / nT;
      const p = point(phi, t * tm, t);
      pos.push(p.x, p.y, p.z);
      uv.push(i / nPhi, 1 - t);
    }
  }
  for (let i = 0; i < nPhi; i++) {
    for (let j = 0; j < nT; j++) {
      const a = i * (nT + 1) + j;
      const b = (i + 1) * (nT + 1) + j;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// 얼굴 위에 딱 붙는 곡면 조각 (눈 등). 가운데가 살짝 볼록.
function facePatch(phiC, thC, dPhi, dTh, { lift = 0.0025, bulge = 0.006, flipU = false, n = 20 } = {}) {
  const pos = [];
  const uv = [];
  const idx = [];
  for (let a = 0; a <= n; a++) {
    for (let b = 0; b <= n; b++) {
      const s = a / n;
      const t = b / n;
      const phi = phiC + (s - 0.5) * 2 * dPhi;
      const th = thC + (t - 0.5) * 2 * dTh;
      const e = (1 - (2 * s - 1) ** 2) * (1 - (2 * t - 1) ** 2);
      const p = surf(phi, th).addScaledVector(surfNormal(phi, th), lift + bulge * e);
      pos.push(p.x, p.y, p.z);
      uv.push(flipU ? 1 - s : s, 1 - t);
    }
  }
  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) {
      const i0 = a * (n + 1) + b;
      const i1 = (a + 1) * (n + 1) + b;
      idx.push(i0, i0 + 1, i1, i1, i0 + 1, i1 + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// 회전체 (위→아래 순서의 [반지름, 높이] 목록). 이음매는 뒤쪽, 정면은 u=0.5
function lathe(points, segs = 40, zScale = 1) {
  // 입력은 위→아래 순서. 바깥을 향하도록 아래→위로 뒤집는다 (텍스처 v도 위=위가 됨)
  const pts = [...points].reverse().map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, segs, PI, PI * 2);
  if (zScale !== 1) g.scale(1, 1, zScale);
  g.computeVertexNormals();
  return g;
}

function ellipsoid(rx, ry, rz, segs = 32) {
  return new THREE.SphereGeometry(1, segs, Math.round(segs * 0.7)).scale(rx, ry, rz);
}

// ───────────── 재질 ─────────────
function skinMat(map, skin) {
  return new THREE.MeshPhysicalMaterial({
    color: 0xffffff, map, roughness: 0.58, sheen: 0.35, sheenColor: new THREE.Color(shade(skin, 1.1)),
    sheenRoughness: 0.8,
  });
}
function clothMat(map, bumpMap, { roughness = 0.85, bumpScale = 1.2 } = {}) {
  return new THREE.MeshStandardMaterial({ map, bumpMap, bumpScale, roughness, metalness: 0 });
}

function mesh(geo, mat, parent, name) {
  const m = new THREE.Mesh(geo, mat);
  m.name = name;
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// ───────────── 머리카락 ─────────────
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// 머리 덮개가 얹히는 높이 (정수리일수록 볼륨)
const capScale = (th) => 1.07 + 0.05 * Math.max(0, Math.cos(th));

// 뾰족한 머리 가닥 (뿌리→끝으로 좁아지고 가운데가 볼록한 리본)
function strand({ phiRoot, phiTip, thRoot, thTip, width, tipWidth = 0, lift = 0.012, curl = 0 }) {
  const rows = 14;
  const cols = 4;
  const pos = [];
  const uv = [];
  const idx = [];
  for (let r = 0; r <= rows; r++) {
    const t = r / rows;
    const phi = phiRoot + (phiTip - phiRoot) * t ** 1.3;
    const th = thRoot + (thTip - thRoot) * t;
    const w = width * (1 - t) ** 0.85 + tipWidth * t;
    const sc = capScale(th) + 0.012 + curl * t * t;
    for (let c = 0; c <= cols; c++) {
      const s = c / cols;
      const off = (s - 0.5) * 2;
      const ph = phi + (off * w) / Math.max(0.3, Math.sin(th));
      const p = surf(ph, th, sc);
      const crown = (1 - off * off) * lift * (1 - 0.6 * t);
      p.addScaledVector(surfNormal(ph, th, sc), crown);
      pos.push(p.x, p.y, p.z);
      uv.push(0.3 + s * 0.4 + phiRoot * 0.05, 1 - (0.15 + t * 0.85));
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = r * (cols + 1) + c;
      const b = (r + 1) * (cols + 1) + c;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function buildHair(head, o) {
  const mat = new THREE.MeshStandardMaterial({
    map: hairTexture(o.hairColor), bumpMap: hairBump(), bumpScale: 0.5, roughness: 0.5, side: THREE.DoubleSide,
  });
  const bob = o.hair === 'bob';
  // 덮개: 앞은 이마 위, 옆·뒤는 스타일에 따라
  const thetaMax = (phi) => {
    const a = Math.abs(phi);
    const front = PI * 0.33;
    const side = bob ? PI * 0.7 : PI * 0.47;
    const back = bob ? PI * 0.72 : PI * 0.6;
    if (a < 1.2) return front + (side - front) * smooth(0.55, 1.2, a);
    return side + (back - side) * smooth(1.6, 2.6, a);
  };
  const cap = shellGrid(120, 36, thetaMax, (phi, th) => surf(phi, th, capScale(th)));
  mesh(cap, mat, head, '머리덮개');

  const strands = [];
  if (bob) {
    // 일자 앞머리: 넓은 가닥이 같은 길이로 촘촘히
    for (let i = 0; i < 13; i++) {
      const phi = -1.05 + (2.1 * i) / 12;
      strands.push({ phiRoot: phi, phiTip: phi, thRoot: PI * 0.16, thTip: PI * (0.435 + (i % 2) * 0.012),
        width: 0.2, tipWidth: 0.07, lift: 0.014 });
    }
    // 단발 끝: 아래로 살짝 바깥으로 말린 가닥
    for (let i = 0; i < 22; i++) {
      const phi = 1.15 + ((2 * PI - 2.3) * i) / 21;
      const p = phi > PI ? phi - 2 * PI : phi;
      strands.push({ phiRoot: p, phiTip: p, thRoot: PI * 0.42, thTip: PI * (0.75 + (i % 3) * 0.01),
        width: 0.22, tipWidth: 0.05, lift: 0.016, curl: 0.05 });
    }
  } else {
    // 옆으로 넘긴 뾰족한 앞머리: 길이를 번갈아
    for (let i = 0; i < 7; i++) {
      const phi = -0.95 + (1.9 * i) / 6;
      strands.push({ phiRoot: phi, phiTip: phi + 0.22, thRoot: PI * 0.14,
        thTip: PI * (0.42 + (i % 2) * 0.025 - Math.abs(phi) * 0.025), width: 0.27, tipWidth: 0.06, lift: 0.02 });
    }
    // 귀 옆 구레나룻
    for (const s of [-1, 1]) {
      strands.push({ phiRoot: s * 1.3, phiTip: s * 1.22, thRoot: PI * 0.35, thTip: PI * 0.56, width: 0.16, lift: 0.01 });
    }
    // 뒤통수 삐침
    for (let i = 0; i < 9; i++) {
      const phi = 2.2 + (1.9 * i) / 8;
      const p = phi > PI ? phi - 2 * PI : phi;
      strands.push({ phiRoot: p, phiTip: p, thRoot: PI * 0.4, thTip: PI * 0.64, width: 0.3, tipWidth: 0.08, lift: 0.016, curl: 0.03 });
    }
  }
  for (const s of strands) mesh(strand(s), mat, head, '머리가닥');

  if (o.hair === 'side') {
    // 정수리 볼륨 덩어리
    const tuft = mesh(ellipsoid(0.11, 0.05, 0.1), mat, head, '정수리');
    tuft.position.set(-0.03, HEAD_R * 1.02, 0.02);
    tuft.rotation.z = 0.2;
  }
}

// ───────────── 얼굴 ─────────────
function buildHead(head, o) {
  const skin = skinMat(faceTexture(o.skin), o.skin);
  const g = shellGrid(96, 64, () => PI, (phi, th) => surf(phi, th));
  mesh(g, skin, head, '얼굴');

  // 눈: 세로로 긴 타원 텍스처를 곡면 조각에 입힘
  const eyes = new THREE.Group();
  eyes.name = '눈';
  head.add(eyes);
  for (const s of [-1, 1]) {
    const tex = eyeTexture(o.iris, o.lash);
    const mat = new THREE.MeshStandardMaterial({
      map: tex, transparent: true, roughness: 0.22, polygonOffset: true, polygonOffsetFactor: -2,
    });
    const geo = facePatch(s * 0.38, PI * 0.535, 0.185, 0.245, { flipU: s < 0, bulge: 0.008 });
    const m = mesh(geo, mat, eyes, '눈');
    m.castShadow = false;
  }
  // 눈 깜빡임용: 눈 높이를 기준점으로
  const eyeY = surf(0, PI * 0.535).y;
  eyes.position.y = eyeY;
  eyes.children.forEach((c) => c.position.y -= eyeY);

  // 코: 피부보다 진한 주황빛 타원이 도톰하게 튀어나옴
  const nose = mesh(ellipsoid(0.022, 0.017, 0.018), new THREE.MeshPhysicalMaterial({
    color: shade(o.nose, 1), roughness: 0.45, sheen: 0.4, sheenColor: new THREE.Color('#ffd0b0'),
  }), head, '코');
  const np = surf(0, PI * 0.585);
  nose.position.copy(np).addScaledVector(surfNormal(0, PI * 0.585), 0.008);

  // 귀
  for (const s of [-1, 1]) {
    const ear = mesh(ellipsoid(0.022, 0.04, 0.03), skin, head, '귀');
    ear.position.copy(surf(s * PI * 0.5, PI * 0.56)).multiplyScalar(0.97);
    ear.rotation.z = s * 0.15;
  }
}

// ───────────── 몸 ─────────────
function buildBody(root, o) {
  const P = {}; // 움직일 관절들

  // 엉덩이 (전체 기준점)
  const hips = new THREE.Group();
  hips.position.y = 0.36;
  root.add(hips);
  P.hips = hips;

  const bottomCol = o.bottomColor;
  // 바지/치마
  if (o.bottom === 'skirt') {
    const skirtMat = clothMat(clothTexture('skirt', bottomCol, { stitches: [0.82], ao: [[0, 0.75], [0.15, 1], [0.85, 1], [1, 0.8]] }),
      clothBump('skirt', [0.82]));
    // A라인 치마 + 밑단 안쪽으로 접힌 두께
    mesh(lathe([[0.118, 0.015], [0.128, -0.02], [0.16, -0.09], [0.19, -0.15], [0.198, -0.162], [0.186, -0.158], [0.15, -0.09]], 48, 0.82),
      skirtMat, hips, '치마');
  } else {
    const shortsMat = clothMat(clothTexture('shorts', bottomCol, { stitches: [0.35], ao: [[0, 0.8], [0.2, 1], [1, 0.9]] }),
      clothBump('shorts', [0.35]));
    mesh(lathe([[0.118, 0.015], [0.126, -0.02], [0.132, -0.05], [0.115, -0.08], [0.06, -0.095], [0, -0.1]], 48, 0.8),
      shortsMat, hips, '바지허리');
    P.shortsMat = shortsMat;
  }

  // 다리
  P.legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(s * 0.058, -0.04, 0);
    hips.add(leg);
    P.legs.push(leg);
    if (o.bottom !== 'skirt') {
      // 바짓단: 접어 올린 커프스 + 안쪽으로 파인 밑단
      const cuffMat = clothMat(clothTexture('cuff', bottomCol, { stitches: [0.6], ao: [[0, 0.85], [0.5, 1], [0.62, 1.12], [0.9, 1.08], [1, 0.6]] }),
        clothBump('cuff', [0.6]));
      mesh(lathe([[0.058, 0.04], [0.062, 0], [0.066, -0.05], [0.07, -0.075], [0.071, -0.088], [0.06, -0.084], [0.055, -0.06]], 32),
        cuffMat, leg, '바짓단');
    }
    const legMat = skinMat(aoGradient('leg', o.skin, [[0, 0.7], [0.18, 0.92], [0.3, 1], [0.86, 1], [1, 0.78]]), o.skin);
    // 아래로 갈수록 살짝 굵어지는 다리
    mesh(lathe([[0.026, 0.0], [0.028, -0.06], [0.027, -0.12], [0.029, -0.19], [0.032, -0.25], [0.031, -0.275]], 24), legMat, leg, '다리');

    // 발 (신발)
    const foot = new THREE.Group();
    foot.position.y = -0.27;
    leg.add(foot);
    leg.userData.foot = foot;
    buildShoe(foot, o);
  }

  // 몸통 (허리 기준)
  const torso = new THREE.Group();
  torso.position.y = 0.0;
  hips.add(torso);
  P.torso = torso;
  const shirtStitch = [0.9];
  const shirtMat = clothMat(
    clothTexture('shirt', o.top, { stitches: shirtStitch, ao: [[0, 0.62], [0.08, 0.95], [0.16, 1], [0.86, 1], [0.95, 0.9], [1, 0.7]] }),
    clothBump('shirt', shirtStitch),
  );
  // A라인 티셔츠: 좁은 어깨 → 아래로 퍼짐, 목둘레와 밑단은 안쪽으로 접힌 두께
  mesh(lathe([
    [0.04, 0.215], [0.047, 0.238], [0.07, 0.236], [0.096, 0.222], [0.11, 0.2], [0.114, 0.165],
    [0.117, 0.12], [0.124, 0.07], [0.134, 0.02], [0.142, -0.02], [0.144, -0.032], [0.132, -0.029], [0.127, -0.005],
  ], 56, 0.78), shirtMat, torso, '상의');

  // 옷깃 (둥근 목둘레 리브)
  // 옷깃: 셔츠 목둘레와 같은 타원을 따라 도톰하게 말린 리브
  mesh(lathe([[0.04, 0.236], [0.044, 0.247], [0.052, 0.246], [0.056, 0.238], [0.054, 0.232]], 56, 0.78),
    clothMat(clothTexture('collar', shade(o.top, 0.97), { ao: [[0, 0.8], [0.5, 1], [1, 0.9]] }), clothBump('collar')),
    torso, '옷깃');

  // 가슴 주머니
  const pocket = mesh(new RoundedBoxGeometry(0.046, 0.05, 0.007, 2, 0.004),
    clothMat(pocketTexture(o.top), clothBump('pocket')), torso, '주머니');
  const py = 0.14;
  const pr = 0.116;
  const px = 0.05;
  pocket.position.set(px, py, Math.sqrt(pr * pr - px * px) * 0.78 + 0.002);
  pocket.rotation.set(-0.06, Math.atan2(px, 0.09), 0);

  // 허리에 묶은 체크무늬 셔츠
  if (o.plaid) {
    const pm = clothMat(plaidTexture(...o.plaid), clothBump('plaid'), { bumpScale: 1.5 });
    mesh(lathe([[0.148, 0.035], [0.152, 0.01], [0.155, -0.02], [0.15, -0.03]], 56, 0.8), pm, torso, '묶은셔츠');
    const knot = mesh(ellipsoid(0.036, 0.026, 0.024), pm, torso, '매듭');
    knot.position.set(0, 0.005, 0.155 * 0.8 + 0.012);
    for (const s of [-1, 1]) {
      const sl = mesh(lathe([[0.02, 0], [0.024, -0.05], [0.027, -0.11], [0.028, -0.13], [0, -0.135]], 20), pm, torso, '셔츠소매');
      sl.position.set(s * 0.012, 0.0, 0.155 * 0.8 + 0.01);
      sl.rotation.set(0.25, 0, s * 0.42);
    }
    // 뒤로 늘어진 셔츠 자락 (뒤쪽 반원만)
    const back = mesh(new THREE.LatheGeometry(
      [[0.15, 0], [0.163, -0.05], [0.172, -0.1], [0.168, -0.11]].map(([r, y]) => new THREE.Vector2(r, y)), 24, PI * 0.6, PI * 0.8,
    ).scale(1, 1, 0.82), pm, torso, '셔츠자락');
    back.material = pm.clone();
    back.material.side = THREE.DoubleSide;
  }

  // 목
  const neckMat = skinMat(aoGradient('neck', o.skin, [[0, 0.78], [0.45, 0.94], [0.8, 1], [1, 0.86]]), o.skin);
  mesh(lathe([[0.037, 0.29], [0.037, 0.26], [0.039, 0.23], [0.042, 0.21]], 24), neckMat, torso, '목');

  // 머리 (목 위)
  const head = new THREE.Group();
  head.position.y = 0.245 + 0.205;
  torso.add(head);
  P.head = head;
  buildHead(head, o);
  buildHair(head, o);
  P.eyes = head.getObjectByName('눈');

  // 팔
  P.arms = [];
  const sleeveMat = clothMat(
    clothTexture('sleeve', o.top, { stitches: [0.74], ao: [[0, 0.92], [0.15, 1], [0.8, 1], [0.9, 0.95], [1, 0.62]] }),
    clothBump('sleeve', [0.78]),
  );
  const armMat = skinMat(aoGradient('arm', o.skin, [[0, 0.6], [0.2, 0.9], [0.32, 1], [1, 1]]), o.skin);
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(s * 0.098, 0.205, 0);
    torso.add(arm);
    P.arms.push(arm);
    // 소매: 끝이 안쪽으로 접혀 들어간 두께
    mesh(lathe([[0, 0.004], [0.03, 0.0], [0.042, -0.012], [0.046, -0.02], [0.053, -0.045], [0.057, -0.07], [0.058, -0.082], [0.047, -0.079], [0.043, -0.06]], 32),
      sleeveMat, arm, '소매');
    // 팔: 손목 쪽으로 살짝 굵어짐
    mesh(lathe([[0.024, -0.02], [0.025, -0.08], [0.025, -0.13], [0.028, -0.18], [0.031, -0.205], [0.03, -0.215]], 24),
      armMat, arm, '팔');
    // 벙어리장갑 손: 손목에서 이어지는 둥근 덩어리 + 엄지
    const hand = new THREE.Group();
    hand.position.y = -0.215;
    arm.add(hand);
    const palm = mesh(ellipsoid(0.041, 0.05, 0.034), skinMat(aoGradient('hand', o.skin, [[0, 0.92], [0.25, 1], [1, 1]]), o.skin), hand, '손');
    palm.position.y = -0.035;
    const thumb = mesh(ellipsoid(0.015, 0.024, 0.015), palm.material, hand, '엄지');
    thumb.position.set(-s * 0.03, -0.026, 0.014);
    thumb.rotation.z = -s * 0.5;
    arm.userData.hand = hand;
  }
  return P;
}

function buildShoe(foot, o) {
  const upperMat = new THREE.MeshStandardMaterial({
    map: aoGradient('shoe', o.shoes, [[0, 0.55], [0.18, 0.95], [0.3, 1], [1, 0.9]]), roughness: 0.6,
  });
  const white = new THREE.MeshStandardMaterial({ color: '#f7f3ea', roughness: 0.75, bumpMap: soleBump(), bumpScale: 2 });
  // 고무 밑창
  const sole = mesh(new RoundedBoxGeometry(0.08, 0.016, 0.128, 3, 0.007), white, foot, '밑창');
  sole.position.set(0, -0.037, 0.02);
  // 갑피 (발등)
  const upper = mesh(ellipsoid(0.041, 0.034, 0.065), upperMat, foot, '갑피');
  upper.position.set(0, -0.013, 0.018);
  // 앞코 (흰색)
  const toe = mesh(ellipsoid(0.033, 0.018, 0.026), white, foot, '앞코');
  toe.position.set(0, -0.021, 0.064);
  // 발목 입구 (어두운 안쪽)
  const opening = mesh(new THREE.CircleGeometry(0.026, 24).rotateX(-PI / 2).scale(1, 1, 1.15),
    new THREE.MeshStandardMaterial({ color: shade(o.shoes, 0.35), roughness: 1 }), foot, '발목입구');
  opening.position.set(0, 0.016, -0.004);
  // 신발 끈
  const laceMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 });
  for (let i = 0; i < 3; i++) {
    const lace = mesh(new THREE.CapsuleGeometry(0.0038, 0.028, 4, 8).rotateZ(PI / 2), laceMat, foot, '신발끈');
    const z = 0.026 + i * 0.013;
    const k = (z - 0.018) / 0.065;
    lace.position.set(0, -0.013 + 0.034 * Math.sqrt(1 - k * k) - 0.001, z);
    lace.rotation.x = -0.35 - i * 0.15;
  }
}

// ───────────── 만들기 + 포즈 ─────────────
export const PRESETS = {
  boy: {
    skin: '#ffd3b4', nose: '#ff8a62', hair: 'side', hairColor: '#a65a2e', iris: '#6a4a33', lash: false,
    top: '#f3efe6', bottom: 'shorts', bottomColor: '#3f5f8f', shoes: '#e2574c',
    plaid: ['#e7b74a', '#b9502f', '#3a2a22'],
  },
  girl: {
    skin: '#ffd6b8', nose: '#ff8f6a', hair: 'bob', hairColor: '#e4b660', iris: '#3d6fc4', lash: true,
    top: '#f28aa0', bottom: 'skirt', bottomColor: '#fff3dc', shoes: '#7b5bd6', plaid: null,
  },
};

export function createVillager(options = {}) {
  const o = { ...PRESETS.boy, ...options };
  const root = new THREE.Group();
  root.name = '주민';
  const P = buildBody(root, o);

  let blinkT = 2 + Math.random() * 3;
  const state = { pose: 'wave' };

  function update(t, dt = 1 / 60) {
    // 손 흔드는 비대칭 포즈 (한 발 앞으로, 오른손 들어 흔들기)
    const wave = state.pose === 'wave';
    const [armR, armL] = P.arms; // arms[0]은 -x(캐릭터의 오른쪽)
    const [legR, legL] = P.legs;
    const breathe = Math.sin(t * 2.2) * 0.004;
    if (wave) {
      armR.rotation.set(-0.35, 0.2, -2.05 + Math.sin(t * 7) * 0.2);
      armR.userData.hand.rotation.set(0, 0, 0.25 + Math.sin(t * 7 + 0.6) * 0.15);
      armL.rotation.set(0.12, 0, 0.32);
      legL.rotation.set(-0.32, 0, 0.04);
      legR.rotation.set(0.14, 0, -0.03);
      legL.userData.foot.rotation.x = 0.36;
      legR.userData.foot.rotation.x = -0.14;
      P.hips.rotation.set(0, 0.12, 0.02);
      P.hips.position.y = 0.36 - 0.012 + breathe;
      P.torso.rotation.set(0.02, -0.08, -0.04);
      P.head.rotation.set(0.04, 0.1 + Math.sin(t * 1.3) * 0.03, 0.09);
    } else {
      armR.rotation.set(0, 0, -0.16);
      armL.rotation.set(0, 0, 0.16);
      armR.userData.hand.rotation.set(0, 0, 0);
      for (const l of P.legs) { l.rotation.set(0, 0, 0); l.userData.foot.rotation.x = 0; }
      P.hips.rotation.set(0, 0, 0);
      P.hips.position.y = 0.36 + breathe;
      P.torso.rotation.set(0, 0, 0);
      P.head.rotation.set(0, Math.sin(t * 0.8) * 0.05, 0);
    }
    // 눈 깜빡임
    blinkT -= dt;
    let sy = 1;
    if (blinkT < 0.12) sy = Math.max(0.08, Math.abs(blinkT - 0.06) / 0.06);
    if (blinkT < 0) blinkT = 2.5 + Math.random() * 3;
    P.eyes.scale.y = sy;
  }

  return { root, parts: P, options: o, state, update };
}
