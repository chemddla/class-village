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
  // 위쪽은 둥근 사각형, 아래(턱)로 갈수록 구에 가깝게 완만하게
  const lower = Math.max(0, -n.y);
  out.copy(n).divideScalar(k).lerp(n, 0.35 + 0.4 * lower);
  out.x *= 1.12;
  out.y *= 0.95;
  out.z *= 0.97;
  if (out.y < 0) {
    // 아래쪽 볼살: 옆과 앞으로 통통하게 (턱은 거의 납작하게 누르지 않음)
    const t = -out.y;
    out.x *= 1 + 0.09 * t;
    out.z *= 1 + 0.06 * t;
    out.y *= 1 - 0.025 * t;
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
function strand({ phiRoot, phiTip, thRoot, thTip, width, tipWidth = 0, lift = 0.012, curl = 0, hug = false }) {
  const rows = 14;
  const cols = 4;
  const pos = [];
  const uv = [];
  const idx = [];
  for (let r = 0; r <= rows; r++) {
    const t = r / rows;
    const phi = phiRoot + (phiTip - phiRoot) * t ** 1.3;
    const th = thRoot + (thTip - thRoot) * t;
    // 끝이 둥글게 모이는 폭 (뿌리 쪽은 넓게 유지)
    const w = width * (1 - t ** 2.4) ** 0.55 + tipWidth * t;
    // hug: 끝으로 갈수록 머리 피부 곡면에 붙도록 (구레나룻 등)
    const lay = capScale(th) + 0.012 + curl * t * t;
    const sc = hug ? lay * (1 - t) + 1.012 * t : lay;
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
    const side = bob ? PI * 0.68 : PI * 0.47;
    const back = bob ? PI * 0.7 : PI * 0.6;
    if (a < 1.2) return front + (side - front) * smooth(0.55, 1.2, a);
    return side + (back - side) * smooth(1.6, 2.6, a);
  };
  let cap;
  if (bob) {
    // 한 장으로 이어진 단발 볼륨: 아래로 갈수록 바깥으로 퍼지고(A라인), 끝은 둥글게 안으로 말림
    cap = shellGrid(140, 48, thetaMax, (phi, _th, t) => {
      const tm = thetaMax(phi);
      const body = 0.88;
      if (t <= body) {
        const th = (t / body) * tm;
        const flare = 0.1 * smooth(PI * 0.42, tm, th);
        return surf(phi, th, capScale(th) + flare);
      }
      // 끝단: 바깥 면에서 안쪽 면으로 반원을 그리며 말려 들어감
      const u = (t - body) / (1 - body);
      const outer = capScale(tm) + 0.1;
      const a = u * PI;
      const sc = outer - 0.03 * (1 - Math.cos(a)) / 2 * 2;
      const th = tm + 0.035 * Math.sin(a);
      return surf(phi, th, sc);
    });
  } else {
    cap = shellGrid(120, 36, thetaMax, (phi, th) => surf(phi, th, capScale(th)));
  }
  mesh(cap, mat, head, '머리덮개');

  const strands = [];
  if (bob) {
    // 일자 앞머리: 넓은 가닥이 같은 길이로 촘촘히
    for (let i = 0; i < 13; i++) {
      const phi = -1.05 + (2.1 * i) / 12;
      strands.push({ phiRoot: phi, phiTip: phi, thRoot: PI * 0.16, thTip: PI * (0.435 + (i % 2) * 0.012),
        width: 0.2, tipWidth: 0.07, lift: 0.014 });
    }
  } else {
    // 옆으로 넘긴 뾰족한 앞머리: 길이를 번갈아
    for (let i = 0; i < 5; i++) {
      const phi = -0.92 + (1.84 * i) / 4;
      strands.push({ phiRoot: phi, phiTip: phi + 0.2, thRoot: PI * 0.14,
        thTip: PI * (0.425 + (i % 2) * 0.02 - Math.abs(phi) * 0.02), width: 0.4, tipWidth: 0.0, lift: 0.024 });
    }
    // 귀 옆 구레나룻
    for (const s of [-1, 1]) {
      strands.push({ phiRoot: s * 1.3, phiTip: s * 1.24, thRoot: PI * 0.36, thTip: PI * 0.56, width: 0.2, lift: 0.006, hug: true });
    }
    // 뒤통수 삐침
    for (let i = 0; i < 9; i++) {
      const phi = 2.2 + (1.9 * i) / 8;
      const p = phi > PI ? phi - 2 * PI : phi;
      strands.push({ phiRoot: p, phiTip: p, thRoot: PI * 0.4, thTip: PI * 0.64, width: 0.3, tipWidth: 0.08, lift: 0.016, curl: 0.03 });
    }
  }
  for (const s of strands) mesh(strand(s), mat, head, '머리가닥');

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
    const geo = facePatch(s * 0.38, PI * 0.54, 0.235, 0.275, { flipU: s < 0, bulge: 0.008 });
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
  nose.castShadow = false; // 코 그림자가 어깨에 초승달처럼 떨어지는 것 방지

  // 귀
  for (const s of [-1, 1]) {
    const ear = mesh(ellipsoid(0.022, 0.04, 0.03), skin, head, '귀');
    ear.position.copy(surf(s * PI * 0.5, PI * 0.56)).multiplyScalar(0.97);
    ear.rotation.z = s * 0.15;
    ear.castShadow = false;
  }
}

// ───────────── 몸 ─────────────
// 비율: 다리는 이전의 75%, 몸통은 90% → 머리가 큰 약 2.5등신
const LEG = 0.2; // 엉덩이 관절 ~ 발목
const THIGH = 0.1; // 엉덩이 ~ 무릎
const TY = 0.9; // 몸통 세로 비율
const HIP_Y = 0.04 + LEG + 0.05; // 땅에서 엉덩이까지
const ty = (pts) => pts.map(([r, y]) => [r, y * TY]);

// 손목에서 끊김 없이 이어지는 통통한 벙어리장갑 (위는 둥근 단면, 아래로 갈수록 납작)
function mittenGeometry() {
  const g = lathe([[0.0285, 0.006], [0.031, -0.006], [0.039, -0.024], [0.045, -0.044], [0.044, -0.062], [0.037, -0.079], [0.024, -0.09], [0, -0.095]], 32);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = Math.min(1, Math.max(0, -p.getY(i) / 0.035));
    p.setZ(i, p.getZ(i) * (1 - 0.24 * k));
  }
  g.computeVertexNormals();
  return g;
}

function flower(petalCol, parent) {
  const g = new THREE.Group();
  const petalMat = new THREE.MeshStandardMaterial({ color: petalCol, roughness: 0.6 });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * PI * 2;
    const pt = mesh(ellipsoid(0.016, 0.006, 0.011, 16), petalMat, g, '꽃잎');
    pt.position.set(Math.cos(a) * 0.014, 0, Math.sin(a) * 0.014);
    pt.rotation.y = -a;
  }
  const c = mesh(ellipsoid(0.008, 0.006, 0.008, 12), new THREE.MeshStandardMaterial({ color: '#ffd84a', roughness: 0.5 }), g, '꽃술');
  c.position.y = 0.004;
  parent.add(g);
  return g;
}

function buildFlowerCrown(head) {
  const crown = new THREE.Group();
  crown.name = '화관';
  head.add(crown);
  const leafMat = new THREE.MeshStandardMaterial({ color: '#6fb85a', roughness: 0.7 });
  const cols = ['#ff7a7a', '#ffb36b', '#c79cf2', '#ff9ec4', '#ff7a7a'];
  const up = V(0, 1, 0);
  cols.forEach((c, i) => {
    const phi = -0.62 + (1.24 * i) / (cols.length - 1);
    const th = PI * (0.15 + (i % 2) * 0.025);
    const sc = capScale(th) + 0.06; // 앞머리 가닥보다 위로
    const f = flower(c, crown);
    f.position.copy(surf(phi, th, sc));
    f.quaternion.setFromUnitVectors(up, surfNormal(phi, th, sc));
    f.scale.setScalar(1.55 + (i % 2) * 0.25);
    // 잎사귀
    const lf = mesh(ellipsoid(0.024, 0.005, 0.011, 12), leafMat, crown, '잎');
    lf.position.copy(surf(phi + 0.15, th + 0.02, sc - 0.015));
    lf.quaternion.setFromUnitVectors(up, surfNormal(phi + 0.15, th, sc));
    lf.rotateY(0.7);
  });
}

function buildBody(root, o) {
  const P = {}; // 움직일 관절들

  // 엉덩이 (전체 기준점)
  const hips = new THREE.Group();
  hips.position.y = HIP_Y;
  root.add(hips);
  P.hips = hips;

  const bottomCol = o.bottomColor;
  // 바지/치마
  if (o.bottom === 'skirt') {
    const skirtMat = clothMat(clothTexture('skirt', bottomCol, { stitches: [0.82], ao: [[0, 0.75], [0.15, 1], [0.85, 1], [1, 0.8]] }),
      clothBump('skirt', [0.82]));
    // A라인 치마 + 밑단 안쪽으로 접힌 두께 (다리 비율에 맞춰 짧게)
    mesh(lathe([[0.118, 0.015], [0.128, -0.018], [0.155, -0.07], [0.18, -0.115], [0.188, -0.127], [0.176, -0.123], [0.145, -0.07]], 48, 0.82),
      skirtMat, hips, '치마');
  } else {
    const shortsMat = clothMat(clothTexture('shorts', bottomCol, { stitches: [0.35], ao: [[0, 0.8], [0.2, 1], [1, 0.9]] }),
      clothBump('shorts', [0.35]));
    mesh(lathe([[0.118, 0.015], [0.126, -0.02], [0.132, -0.05], [0.115, -0.075], [0.06, -0.088], [0, -0.092]], 48, 0.8),
      shortsMat, hips, '바지허리');
  }

  // 다리: 허벅지 + 무릎 관절 + 종아리 (걷기에서 무릎을 굽힘)
  P.legs = [];
  const legMat = skinMat(aoGradient('leg2', o.skin, [[0, 0.72], [0.25, 0.95], [0.4, 1], [1, 1]]), o.skin);
  const shinMat = skinMat(aoGradient('shin', o.skin, [[0, 1], [0.8, 1], [1, 0.8]]), o.skin);
  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(s * 0.058, -0.04, 0);
    hips.add(leg);
    P.legs.push(leg);
    if (o.bottom !== 'skirt') {
      // 바짓단: 접어 올린 커프스 + 안쪽으로 파인 밑단
      const cuffMat = clothMat(clothTexture('cuff', bottomCol, { stitches: [0.6], ao: [[0, 0.85], [0.5, 1], [0.62, 1.12], [0.9, 1.08], [1, 0.6]] }),
        clothBump('cuff', [0.6]));
      mesh(lathe([[0.058, 0.04], [0.062, 0], [0.066, -0.04], [0.07, -0.06], [0.071, -0.07], [0.06, -0.067], [0.055, -0.05]], 32),
        cuffMat, leg, '바짓단');
    }
    mesh(lathe([[0.026, 0.0], [0.028, -0.05], [0.028, -0.095], [0.026, -0.108]], 24), legMat, leg, '허벅지');
    const knee = new THREE.Group();
    knee.position.y = -THIGH;
    leg.add(knee);
    // 종아리: 발목 쪽으로 살짝 굵어짐
    mesh(lathe([[0.026, 0.008], [0.028, -0.01], [0.029, -0.05], [0.032, -0.085], [0.031, -0.1]], 24), shinMat, knee, '종아리');
    const foot = new THREE.Group();
    foot.position.y = -(LEG - THIGH);
    knee.add(foot);
    leg.userData.knee = knee;
    leg.userData.foot = foot;
    buildShoe(foot, o);
  }

  // 몸통 (허리 기준)
  const torso = new THREE.Group();
  hips.add(torso);
  P.torso = torso;
  const shirtStitch = [0.9];
  const shirtMat = clothMat(
    clothTexture('shirt', o.top, { stitches: shirtStitch, ao: [[0, 0.62], [0.08, 0.95], [0.16, 1], [0.86, 1], [0.95, 0.9], [1, 0.7]] }),
    clothBump('shirt', shirtStitch),
  );
  // A라인 티셔츠 (세로 90%): 좁은 어깨 → 아래로 퍼짐, 목둘레·밑단은 안쪽으로 접힌 두께
  mesh(lathe(ty([
    [0.044, 0.215], [0.051, 0.238], [0.072, 0.236], [0.096, 0.222], [0.11, 0.2], [0.114, 0.165],
    [0.117, 0.12], [0.124, 0.07], [0.134, 0.02], [0.142, -0.02], [0.144, -0.032], [0.132, -0.029], [0.127, -0.005],
  ]), 56, 0.78), shirtMat, torso, '상의');

  // 옷깃: 셔츠 목둘레와 같은 타원을 따라 도톰하게 말린 리브
  mesh(lathe(ty([[0.044, 0.236], [0.048, 0.247], [0.056, 0.246], [0.06, 0.238], [0.058, 0.232]]), 56, 0.78),
    clothMat(clothTexture('collar', shade(o.top, 0.97), { ao: [[0, 0.8], [0.5, 1], [1, 0.9]] }), clothBump('collar')),
    torso, '옷깃');

  // 카라 (둥근 피터팬 칼라): 앞쪽 좌우 두 장, 어깨 경사를 따라 내려옴
  if (o.collar) {
    const cm = clothMat(clothTexture('peter', o.collar, { stitches: [0.75], ao: [[0, 0.85], [0.3, 1], [1, 0.95]] }), clothBump('peter', [0.75]));
    cm.side = THREE.DoubleSide;
    const prof = ty([[0.05, 0.246], [0.064, 0.244], [0.08, 0.236], [0.092, 0.226], [0.098, 0.218]])
      .map(([r, y]) => new THREE.Vector2(r, y)).reverse();
    for (const [start, len] of [[0.05, PI * 0.5], [PI * 1.45, PI * 0.5]]) {
      const g = new THREE.LatheGeometry(prof, 24, start, len).scale(1, 1, 0.8);
      g.computeVertexNormals();
      const flap = mesh(g, cm, torso, '카라');
      flap.position.y = 0.004;
    }
  }

  // 가슴 주머니 (카라가 있는 옷에는 생략)
  if (!o.collar) {
    const pocket = mesh(new RoundedBoxGeometry(0.046, 0.05, 0.007, 2, 0.004),
      clothMat(pocketTexture(o.top), clothBump('pocket')), torso, '주머니');
    const py = 0.14 * TY;
    const pr = 0.116;
    const px = 0.05;
    pocket.position.set(px, py, Math.sqrt(pr * pr - px * px) * 0.78 + 0.002);
    pocket.rotation.set(-0.06, Math.atan2(px, 0.09), 0);
  }

  // 허리에 묶은 체크무늬 셔츠: 매듭은 절반 크기, 소매는 아래로 자연스럽게 늘어뜨림
  if (o.plaid) {
    const pm = clothMat(plaidTexture(...o.plaid), clothBump('plaid'), { bumpScale: 1.5 });
    mesh(lathe([[0.148, 0.03], [0.152, 0.01], [0.155, -0.015], [0.15, -0.025]], 56, 0.8), pm, torso, '묶은셔츠');
    const zf = 0.155 * 0.8;
    const knot = mesh(ellipsoid(0.019, 0.014, 0.013), pm, torso, '매듭');
    knot.position.set(0, 0.004, zf + 0.008);
    for (const s of [-1, 1]) {
      const sl = mesh(lathe([[0.016, 0], [0.019, -0.04], [0.022, -0.09], [0.023, -0.11], [0, -0.115]], 20), pm, torso, '셔츠소매');
      sl.position.set(s * 0.01, 0.0, zf + 0.004);
      sl.rotation.set(0.14, 0, s * 0.16);
    }
    const back = mesh(new THREE.LatheGeometry(
      [[0.15, 0], [0.163, -0.05], [0.172, -0.1], [0.168, -0.11]].map(([r, y]) => new THREE.Vector2(r, y)), 24, PI * 0.6, PI * 0.8,
    ).scale(1, 1, 0.82), pm, torso, '셔츠자락');
    back.material = pm.clone();
    back.material.side = THREE.DoubleSide;
  }

  // 목: 조금 굵게, 위쪽은 머리 안으로 넓게 퍼지며 스며듦
  const neckTop = 0.245 * TY;
  const neckMat = skinMat(aoGradient('neck2', o.skin, [[0, 1], [0.35, 0.95], [0.75, 1], [1, 0.9]]), o.skin);
  mesh(lathe([[0.075, neckTop + 0.07], [0.06, neckTop + 0.04], [0.048, neckTop + 0.015], [0.046, neckTop - 0.01], [0.048, neckTop - 0.03]], 32),
    neckMat, torso, '목');

  // 머리 (목 위)
  const head = new THREE.Group();
  head.position.y = neckTop + 0.2;
  torso.add(head);
  P.head = head;
  buildHead(head, o);
  buildHair(head, o);
  if (o.crown) buildFlowerCrown(head);
  P.eyes = head.getObjectByName('눈');

  // 팔
  P.arms = [];
  const sleeveMat = clothMat(
    clothTexture('sleeve', o.top, { stitches: [0.74], ao: [[0, 0.92], [0.15, 1], [0.8, 1], [0.9, 0.95], [1, 0.62]] }),
    clothBump('sleeve', [0.78]),
  );
  const armMat = skinMat(aoGradient('arm2', o.skin, [[0, 0.6], [0.2, 0.9], [0.32, 1], [1, 1]]), o.skin);
  const handMat = skinMat(aoGradient('hand2', o.skin, [[0, 1], [1, 0.97]]), o.skin);
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(s * 0.106, 0.2 * TY, 0);
    torso.add(arm);
    P.arms.push(arm);
    // 소매: 윗부분은 어깨 경사를 덮는 돔, 끝은 안쪽으로 접힌 두께
    mesh(lathe([[0, 0.034], [0.026, 0.03], [0.042, 0.018], [0.052, 0.0], [0.056, -0.025], [0.058, -0.05], [0.06, -0.072], [0.061, -0.082], [0.05, -0.079], [0.046, -0.06]], 40),
      sleeveMat, arm, '소매');
    // 팔: 손목에서 손과 같은 굵기로 끝남 (경계 링 없음)
    mesh(lathe([[0.024, -0.02], [0.025, -0.07], [0.026, -0.11], [0.028, -0.15], [0.0285, -0.168]], 24), armMat, arm, '팔');
    const hand = new THREE.Group();
    hand.position.y = -0.168;
    arm.add(hand);
    mesh(mittenGeometry(), handMat, hand, '손');
    const thumb = mesh(ellipsoid(0.014, 0.022, 0.014), handMat, hand, '엄지');
    thumb.position.set(-s * 0.032, -0.03, 0.01);
    thumb.rotation.z = -s * 0.45;
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
  // 갑피(타원)와 같은 윤곽을 가진 일체형 고무창: 단위 회전체를 가로·세로로 늘림
  const soleGeo = lathe([[0, 0.008], [0.86, 0.008], [0.97, 0.006], [1.0, 0.0], [0.97, -0.006], [0.86, -0.008], [0, -0.008]], 48);
  soleGeo.scale(0.0425, 1, 0.0675);
  soleGeo.computeVertexNormals();
  const sole = mesh(soleGeo, white, foot, '밑창');
  sole.position.set(0, -0.04, 0.018);
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
    collar: '#fffaf2', crown: true,
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
    const [armR, armL] = P.arms; // arms[0]은 -x(캐릭터의 오른쪽)
    const [legR, legL] = P.legs;
    const breathe = Math.sin(t * 2.2) * 0.004;
    const reset = () => {
      for (const a of P.arms) { a.rotation.set(0, 0, 0); a.userData.hand.rotation.set(0, 0, 0); }
      for (const l of P.legs) { l.rotation.set(0, 0, 0); l.userData.knee.rotation.set(0, 0, 0); l.userData.foot.rotation.set(0, 0, 0); }
      P.hips.rotation.set(0, 0, 0);
      P.torso.rotation.set(0, 0, 0);
      P.head.rotation.set(0, 0, 0);
      P.hips.position.y = HIP_Y;
    };
    reset();
    if (state.pose === 'wave') {
      // 손 흔드는 비대칭 포즈 (한 발 앞으로, 오른손 들어 흔들기)
      armR.rotation.set(-0.35, 0.2, -2.05 + Math.sin(t * 7) * 0.2);
      armR.userData.hand.rotation.set(0, 0, 0.25 + Math.sin(t * 7 + 0.6) * 0.15);
      armL.rotation.set(0.12, 0, 0.3);
      legL.rotation.set(-0.3, 0, 0.04);
      legL.userData.knee.rotation.x = 0.12;
      legL.userData.foot.rotation.x = 0.18;
      legR.rotation.set(0.12, 0, -0.03);
      legR.userData.foot.rotation.x = -0.12;
      P.hips.rotation.set(0, 0.12, 0.02);
      P.hips.position.y = HIP_Y - 0.006 + breathe;
      P.torso.rotation.set(0.02, -0.08, -0.04);
      P.head.rotation.set(0.04, 0.1 + Math.sin(t * 1.3) * 0.03, 0.09);
    } else if (state.pose === 'walk') {
      // 걷기: 무릎을 들어 올리고 팔을 반대로 크게 흔듦
      const ph = t * 6.5;
      for (const [i, l] of [legR, legL].entries()) {
        const p = ph + i * PI;
        const swing = Math.sin(p);
        l.rotation.x = -swing * 0.5; // 앞(+) 뒤(-)
        const lift = Math.max(0, Math.cos(p)); // 앞으로 나갈 때 무릎 굽힘
        l.userData.knee.rotation.x = 0.15 + lift * 0.85;
        l.userData.foot.rotation.x = -(l.rotation.x + l.userData.knee.rotation.x) * 0.7;
      }
      armR.rotation.set(Math.sin(ph) * 0.6, 0, -0.22);
      armL.rotation.set(-Math.sin(ph) * 0.6, 0, 0.22);
      P.hips.position.y = HIP_Y - 0.012 + Math.abs(Math.cos(ph)) * 0.016;
      P.hips.rotation.set(0, Math.sin(ph) * 0.08, 0);
      P.torso.rotation.set(0.06, -Math.sin(ph) * 0.12, 0);
      P.head.rotation.set(-0.02, Math.sin(ph) * 0.05, Math.sin(ph) * 0.03);
    } else {
      armR.rotation.set(0, 0, -0.14);
      armL.rotation.set(0, 0, 0.14);
      P.hips.position.y = HIP_Y + breathe;
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
