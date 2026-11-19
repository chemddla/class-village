// 고품질 마을 주민 캐릭터 (모두 코드로 생성: 회전체 + 변형 구 + 캔버스 텍스처)
// 키 약 1.0, 약 2.6등신. 정면은 +Z.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  aoGradient, liveTexture, drawFace, drawEye, hairTexture, hairBump, clothTexture, clothBump,
  plaidTexture, soleBump, pocketTexture, shade,
} from './textures.js';
import { ACTIONS, createAnimator } from './actions.js';
import { EQUIPMENT, attachEquipment, updateEquipment } from './equipment.js';

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
    // 뿌리는 덮개에 바짝 붙였다가 서서히 떠오름 (뿌리에 가로 이음새가 생기지 않게)
    const blend = smooth(0, 0.35, t);
    // hug: 끝으로 갈수록 머리 피부 곡면에 붙도록 (구레나룻 등)
    const lay = capScale(th) + 0.003 + 0.009 * blend + curl * t * t;
    const sc = hug ? lay * (1 - t) + 1.012 * t : lay;
    for (let c = 0; c <= cols; c++) {
      const s = c / cols;
      const off = (s - 0.5) * 2;
      const ph = phi + (off * w) / Math.max(0.3, Math.sin(th));
      const p = surf(ph, th, sc);
      const crown = (1 - off * off) * lift * (1 - 0.6 * t) * blend;
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

// 헤어스타일별 덮개 범위 (옆·뒤 끝이 내려오는 극각, π 배수)
export const HAIRSTYLES = {
  side: { label: '덮은 앞머리', side: 0.47, back: 0.6 },
  bob: { label: '일자 단발', side: 0.68, back: 0.7 },
  pony: { label: '포니테일', side: 0.5, back: 0.58 },
  short: { label: '숏컷(가르마)', side: 0.42, back: 0.55 },
};

function buildHair(head, o) {
  const hair = new THREE.Group();
  hair.name = '헤어';
  head.add(hair);
  const mat = new THREE.MeshStandardMaterial({
    map: hairTexture(o.hairColor), bumpMap: hairBump(), bumpScale: 0.5, roughness: 0.5, side: THREE.DoubleSide,
  });
  const style = HAIRSTYLES[o.hair] ? o.hair : 'side';
  const bob = style === 'bob';
  // 덮개: 앞은 이마 위, 옆·뒤는 스타일에 따라
  const thetaMax = (phi) => {
    const a = Math.abs(phi);
    const front = PI * 0.33;
    const side = PI * HAIRSTYLES[style].side;
    const back = PI * HAIRSTYLES[style].back;
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
        // 퍼짐을 일찍·완만하게 시작해 옆면에 가로로 꺾이는 선이 생기지 않게
        const flare = 0.1 * smooth(PI * 0.3, tm, th) ** 1.4;
        return surf(phi, th, capScale(th) + flare);
      }
      // 끝단: 바깥 면에서 안쪽 면으로 반원을 그리며 말려 들어감
      const u = (t - body) / (1 - body);
      const outer = capScale(tm) + 0.1;
      const a = u * PI;
      const sc = outer - 0.03 * (1 - Math.cos(a));
      const th = tm + 0.035 * Math.sin(a);
      return surf(phi, th, sc);
    });
  } else {
    cap = shellGrid(120, 36, thetaMax, (phi, th) => surf(phi, th, capScale(th)));
  }
  mesh(cap, mat, hair, '머리덮개');

  const strands = [];
  const sideburns = (thTip) => {
    for (const s of [-1, 1]) {
      strands.push({ phiRoot: s * 1.3, phiTip: s * 1.24, thRoot: PI * 0.36, thTip, width: 0.2, lift: 0.006, hug: true });
    }
  };
  const backTufts = (thTip, curl) => {
    for (let i = 0; i < 9; i++) {
      const phi = 2.2 + (1.9 * i) / 8;
      const p = phi > PI ? phi - 2 * PI : phi;
      strands.push({ phiRoot: p, phiTip: p, thRoot: PI * 0.4, thTip, width: 0.3, tipWidth: 0.08, lift: 0.016, curl });
    }
  };
  if (bob) {
    // 일자 앞머리: 넓은 가닥이 같은 길이로 촘촘히. 뿌리를 정수리에 두어 이마 위에 가로 이음새가 안 보이게
    for (let i = 0; i < 13; i++) {
      const phi = -1.05 + (2.1 * i) / 12;
      strands.push({ phiRoot: phi, phiTip: phi, thRoot: PI * 0.04, thTip: PI * (0.435 + (i % 2) * 0.012),
        width: 0.2, tipWidth: 0.07, lift: 0.014 });
    }
  } else if (style === 'side') {
    // 옆으로 넘긴 뾰족한 앞머리: 길이를 번갈아
    for (let i = 0; i < 5; i++) {
      const phi = -0.92 + (1.84 * i) / 4;
      strands.push({ phiRoot: phi, phiTip: phi + 0.2, thRoot: PI * 0.14,
        thTip: PI * (0.425 + (i % 2) * 0.02 - Math.abs(phi) * 0.02), width: 0.4, tipWidth: 0.0, lift: 0.024 });
    }
    sideburns(PI * 0.56);
    backTufts(PI * 0.64, 0.03);
  } else if (style === 'pony') {
    // 살짝 넘긴 둥근 앞머리 + 얼굴 옆으로 흘러내리는 잔머리 + 높이 묶은 꼬리
    for (let i = 0; i < 7; i++) {
      const phi = -0.95 + (1.9 * i) / 6;
      strands.push({ phiRoot: phi, phiTip: phi + 0.1, thRoot: PI * 0.15, thTip: PI * (0.415 + (i % 2) * 0.015),
        width: 0.27, tipWidth: 0.05, lift: 0.018 });
    }
    sideburns(PI * 0.66);
    buildPonytail(hair, mat, o);
  } else {
    // 숏컷: phi≈0.5의 가르마에서 양쪽으로 갈라져 넘어가는 짧은 앞머리
    for (let i = 0; i < 5; i++) {
      const phi = 0.42 - i * 0.3;
      strands.push({ phiRoot: phi, phiTip: phi - 0.38, thRoot: PI * 0.1, thTip: PI * (0.37 + (i % 2) * 0.02),
        width: 0.34, tipWidth: 0, lift: 0.022 });
    }
    for (const phi of [0.62, 0.95]) {
      strands.push({ phiRoot: phi, phiTip: phi + 0.3, thRoot: PI * 0.12, thTip: PI * 0.38, width: 0.3, lift: 0.018 });
    }
    sideburns(PI * 0.5);
    backTufts(PI * 0.58, 0.015);
  }
  for (const s of strands) mesh(strand(s), mat, hair, '머리가닥');
  return hair;
}

// 뒤통수 높이 묶은 포니테일: 머리끈 + 아래로 처지며 가늘어지는 꼬리
function buildPonytail(hair, mat, o) {
  const th = PI * 0.36;
  const sc = capScale(th);
  const tail = new THREE.Group();
  tail.name = '포니테일';
  tail.position.copy(surf(PI, th, sc)).addScaledVector(surfNormal(PI, th, sc), 0.012);
  tail.rotation.x = 0.55; // 뒤로 비스듬히 처짐
  hair.add(tail);
  const tie = mesh(new THREE.TorusGeometry(0.026, 0.009, 12, 28).rotateX(PI / 2),
    new THREE.MeshStandardMaterial({ color: o.tie ?? '#ff6b8a', roughness: 0.45 }), tail, '머리끈');
  tie.position.y = 0.004;
  const g = lathe([[0.022, 0.012], [0.036, -0.02], [0.05, -0.06], [0.054, -0.1], [0.046, -0.15], [0.03, -0.19], [0.012, -0.215], [0, -0.22]], 32);
  // 끝으로 갈수록 바깥으로 살짝 휘어 올라감
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = -p.getY(i);
    p.setZ(i, p.getZ(i) - 0.35 * y * y);
  }
  g.computeVertexNormals();
  mesh(g, mat, tail, '꼬리');
}

// ───────────── 얼굴 ─────────────
function buildHead(head, o, live) {
  const skin = skinMat(live.face, o.skin);
  const g = shellGrid(96, 64, () => PI, (phi, th) => surf(phi, th));
  mesh(g, skin, head, '얼굴');

  // 눈: 세로로 긴 타원 텍스처를 곡면 조각에 입힘
  const eyes = new THREE.Group();
  eyes.name = '눈';
  head.add(eyes);
  // eyes[0]은 캐릭터의 오른쪽 눈(-x), 텍스처는 표정이 바뀔 때마다 다시 그려진다
  for (const [i, s] of [-1, 1].entries()) {
    const mat = new THREE.MeshStandardMaterial({
      map: live.eyes[i], transparent: true, roughness: 0.22, polygonOffset: true, polygonOffsetFactor: -2,
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

// 도톰한 꽃: 두께 있는 꽃잎이 바깥쪽으로 살짝 들려 컵 모양을 이루고, 가운데 꽃술이 봉긋
function flower(petalCol, parent) {
  const g = new THREE.Group();
  const petalMat = new THREE.MeshStandardMaterial({ color: petalCol, roughness: 0.55 });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * PI * 2;
    const pt = mesh(ellipsoid(0.017, 0.0085, 0.0125, 20), petalMat, g, '꽃잎');
    pt.position.set(Math.cos(a) * 0.015, 0.002, Math.sin(a) * 0.015);
    pt.rotation.y = -a;
    pt.rotateZ(0.38);
  }
  const c = mesh(ellipsoid(0.0095, 0.0085, 0.0095, 16), new THREE.MeshStandardMaterial({ color: '#ffd84a', roughness: 0.5 }), g, '꽃술');
  c.position.y = 0.007;
  parent.add(g);
  return g;
}

function buildFlowerCrown(head) {
  const crown = new THREE.Group();
  crown.name = '화관';
  head.add(crown);
  const leafMat = new THREE.MeshStandardMaterial({ color: '#6fb85a', roughness: 0.7 });
  const budMat = new THREE.MeshStandardMaterial({ color: '#fff4f0', roughness: 0.5 });
  const cols = ['#ff7a7a', '#ffb36b', '#c79cf2', '#ff9ec4', '#ffb36b', '#ff7a7a'];
  const up = V(0, 1, 0);
  const n = cols.length;
  cols.forEach((c, i) => {
    const phi = -0.78 + (1.56 * i) / (n - 1);
    const th = PI * (0.16 + (i % 2) * 0.02);
    const sc = capScale(th) + 0.065; // 앞머리 가닥보다 위로
    const f = flower(c, crown);
    f.position.copy(surf(phi, th, sc));
    f.quaternion.setFromUnitVectors(up, surfNormal(phi, th, sc));
    f.scale.setScalar(1.6 + (i % 2) * 0.3);
    // 잎사귀 + 꽃 사이 작은 봉오리
    const lf = mesh(ellipsoid(0.026, 0.006, 0.012, 12), leafMat, crown, '잎');
    lf.position.copy(surf(phi + 0.14, th + 0.02, sc - 0.02));
    lf.quaternion.setFromUnitVectors(up, surfNormal(phi + 0.14, th, sc));
    lf.rotateY(0.7);
    if (i < n - 1) {
      const bud = mesh(ellipsoid(0.008, 0.008, 0.008, 12), budMat, crown, '봉오리');
      bud.position.copy(surf(phi + 0.78 / (n - 1), th + 0.03, sc - 0.01));
    }
  });
}

// 두 점을 잇는 막대
function rod(a, b, r, mat, parent, name) {
  const m = mesh(new THREE.CylinderGeometry(r, r, a.distanceTo(b), 10), mat, parent, name);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}

// 둥근 안경: 눈 중심 앞에 테 + 옅은 렌즈, 코받침 다리, 머리 옆을 따라 귀로 가는 안경다리
function buildGlasses(head) {
  const g = new THREE.Group();
  g.name = '안경';
  head.add(g);
  const frame = new THREE.MeshStandardMaterial({ color: '#4a3426', roughness: 0.35, metalness: 0.4 });
  const lens = new THREE.MeshPhysicalMaterial({
    color: '#ffffff', transparent: true, opacity: 0.16, roughness: 0.05, depthWrite: false,
  });
  const Z = V(0, 0, 1);
  const R = 0.054;
  const inner = [];
  for (const s of [-1, 1]) {
    const phi = s * 0.38;
    const th = PI * 0.54;
    const n = surfNormal(phi, th);
    const c = surf(phi, th).addScaledVector(n, 0.032);
    const q = new THREE.Quaternion().setFromUnitVectors(Z, n.clone().lerp(Z, 0.6).normalize());
    const rim = mesh(new THREE.TorusGeometry(R, 0.0048, 12, 56), frame, g, '안경테');
    rim.position.copy(c);
    rim.quaternion.copy(q);
    const ln = mesh(new THREE.CircleGeometry(R, 40), lens, g, '렌즈');
    ln.position.copy(c);
    ln.quaternion.copy(q);
    ln.castShadow = false;
    inner.push(c.clone().add(V(-s * R, 0.012, 0).applyQuaternion(q)));
    const outer = c.clone().add(V(s * R, 0.01, 0).applyQuaternion(q));
    const mid = surf(s * 1.0, PI * 0.52, 1.07);
    rod(outer, mid, 0.0042, frame, g, '안경다리');
    rod(mid, surf(s * PI * 0.5, PI * 0.52, 1.05), 0.0042, frame, g, '안경다리');
  }
  rod(inner[0], inner[1], 0.0045, frame, g, '코다리');
}

// 등에 메는 백팩: 둥근 몸통 + 덮개 + 앞주머니 + 어깨끈
function buildBackpack(torso, color) {
  const g = new THREE.Group();
  g.name = '가방';
  torso.add(g);
  const main = clothMat(clothTexture('bag', color, { stitches: [0.12, 0.9], ao: [[0, 0.9], [0.2, 1], [0.85, 1], [1, 0.8]] }),
    clothBump('bag', [0.12, 0.9]));
  const dark = clothMat(clothTexture('bagDark', shade(color, 0.82), { stitches: [0.2, 0.8] }), clothBump('bagDark', [0.2, 0.8]));
  const zBack = -0.093;
  const body = mesh(new RoundedBoxGeometry(0.17, 0.16, 0.075, 4, 0.03), main, g, '가방몸통');
  body.position.set(0, 0.115, zBack - 0.042);
  const lid = mesh(new RoundedBoxGeometry(0.176, 0.06, 0.084, 4, 0.025), dark, g, '가방덮개');
  lid.position.set(0, 0.178, zBack - 0.044);
  const pocket = mesh(new RoundedBoxGeometry(0.11, 0.065, 0.03, 3, 0.012), dark, g, '가방주머니');
  pocket.position.set(0, 0.085, zBack - 0.085);
  // 어깨끈: 등에서 어깨 위를 넘어 가슴 앞으로 내려오는 반원
  for (const s of [-1, 1]) {
    const strap = mesh(new THREE.TorusGeometry(0.1, 0.0075, 8, 32, PI).rotateY(PI / 2).scale(1.5, 1, 0.98), dark, g, '어깨끈');
    strap.position.set(s * 0.058, 0.122, -0.002);
  }
}

// 관절 계층 (rig): root → pelvis → spine → head / shoulder → elbow → hand,  pelvis → hip → knee → foot
// R은 캐릭터의 오른쪽(-x), L은 왼쪽(+x)
const SIDE = { '-1': 'R', 1: 'L' };

function buildBody(root, o, live) {
  const P = {}; // 움직일 관절들

  // 골반 (전체 기준점)
  const hips = new THREE.Group();
  hips.name = 'pelvis';
  hips.position.y = HIP_Y;
  root.add(hips);
  P.pelvis = hips;

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
  const legMat = skinMat(aoGradient('leg2', o.skin, [[0, 0.72], [0.25, 0.95], [0.4, 1], [1, 1]]), o.skin);
  const shinMat = skinMat(aoGradient('shin', o.skin, [[0, 1], [0.8, 1], [1, 0.8]]), o.skin);
  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(s * 0.058, -0.04, 0);
    hips.add(leg);
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
    P[`hip${SIDE[s]}`] = leg;
    P[`knee${SIDE[s]}`] = knee;
    P[`foot${SIDE[s]}`] = foot;
    buildShoe(foot, o);
  }

  // 몸통 (허리 기준)
  const torso = new THREE.Group();
  hips.add(torso);
  P.spine = torso;
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
  buildHead(head, o, live);
  buildHair(head, o);
  if (o.crown) buildFlowerCrown(head);
  if (o.glasses) buildGlasses(head);
  if (o.backpack) buildBackpack(torso, o.bagColor ?? '#f0a848');
  P.eyes = head.getObjectByName('눈');

  // 팔: 어깨 → 팔꿈치 → 손
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
    // 소매: 윗부분은 어깨 경사를 덮는 돔, 끝은 안쪽으로 접힌 두께
    mesh(lathe([[0, 0.034], [0.026, 0.03], [0.042, 0.018], [0.052, 0.0], [0.056, -0.025], [0.058, -0.05], [0.06, -0.072], [0.061, -0.082], [0.05, -0.079], [0.046, -0.06]], 40),
      sleeveMat, arm, '소매');
    // 윗팔 + 팔꿈치(굽혀도 틈이 안 보이도록 같은 굵기의 구) + 아래팔: 손목에서 손과 같은 굵기로 끝남
    mesh(lathe([[0.024, -0.02], [0.025, -0.06], [0.0255, -0.085], [0.0258, -0.092]], 24), armMat, arm, '윗팔');
    const elbow = new THREE.Group();
    elbow.position.y = -0.09;
    arm.add(elbow);
    mesh(ellipsoid(0.0262, 0.0262, 0.0262, 20), handMat, elbow, '팔꿈치');
    mesh(lathe([[0.0258, 0.002], [0.026, -0.02], [0.027, -0.045], [0.028, -0.065], [0.0285, -0.078]], 24), handMat, elbow, '아래팔');
    const hand = new THREE.Group();
    hand.position.y = -0.078;
    elbow.add(hand);
    mesh(mittenGeometry(), handMat, hand, '손');
    const thumb = mesh(ellipsoid(0.014, 0.022, 0.014), handMat, hand, '엄지');
    thumb.position.set(-s * 0.032, -0.03, 0.01);
    thumb.rotation.z = -s * 0.45;
    // 도구 소켓: 주먹 한가운데 (equipment.js 가 여기에 도구를 붙인다)
    hand.name = s < 0 ? 'RightHand' : 'LeftHand';
    const socket = new THREE.Group();
    socket.name = s < 0 ? 'rightSocket' : 'leftSocket';
    socket.position.set(0, -0.05, 0.004);
    hand.add(socket);
    P[s < 0 ? 'rightSocket' : 'leftSocket'] = socket;
    P[`shoulder${SIDE[s]}`] = arm;
    P[`elbow${SIDE[s]}`] = elbow;
    P[`hand${SIDE[s]}`] = hand;
  }
  for (const j of Object.values(P)) j.userData.rest = j.position.clone();
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

// ───────────── 만들기 + 표정 + 액션 ─────────────
// 프리셋은 모든 커스터마이징 키를 빠짐없이 가진다 (프리셋을 바꾸면 이전 선택이 남지 않도록)
export const PRESETS = {
  boy: {
    skin: '#ffd3b4', nose: '#ff8a62', hair: 'side', hairColor: '#a65a2e', iris: '#6a4a33', lash: false,
    top: '#f3efe6', bottom: 'shorts', bottomColor: '#3f5f8f', shoes: '#e2574c',
    plaid: ['#e7b74a', '#b9502f', '#3a2a22'], collar: null, crown: false, glasses: false, backpack: false,
  },
  girl: {
    skin: '#ffd6b8', nose: '#ff8f6a', hair: 'bob', hairColor: '#e4b660', iris: '#3d6fc4', lash: true,
    top: '#f28aa0', bottom: 'skirt', bottomColor: '#fff3dc', shoes: '#7b5bd6', plaid: null,
    collar: '#fffaf2', crown: true, glasses: false, backpack: false,
  },
};

// 표정 = 눈 두 개(캐릭터의 오른쪽, 왼쪽) + 입 + 볼터치 진하기
export const EXPRESSIONS = {
  smile: { label: '기본(미소)', eyes: ['open', 'open'], mouth: 'smile', blush: 1 },
  grin: { label: '활짝 웃음', eyes: ['happy', 'happy'], mouth: 'grin', blush: 1.35 },
  surprised: { label: '놀람', eyes: ['round', 'round'], mouth: 'o', blush: 0.8 },
  wink: { label: '윙크', eyes: ['closed', 'open'], mouth: 'smile', blush: 1.2 },
  angry: { label: '화남', eyes: ['angry', 'angry'], mouth: 'pout', blush: 1.15 },
  ko: { label: '기절', eyes: ['closed', 'closed'], mouth: 'o', blush: 0.6, hidden: true }, // 액션 전용
};

// 이 키가 바뀌면 얼굴·눈 텍스처를 다시 그린다
const FACE_KEYS = ['skin', 'iris', 'lash'];

export function createVillager(options = {}) {
  const o = { ...PRESETS.boy, ...options };
  const root = new THREE.Group();
  root.name = '주민';
  root.userData.rest = root.position.clone();
  // action·equipment는 읽기 전용으로 보고, 바꿀 때는 setAction / equip 을 쓴다
  const state = { action: 'idle', expression: 'smile', equipment: 'none' };
  let baseExpression = null; // 액션이 표정을 잠깐 바꿨을 때 돌아갈 표정
  // 표정용 실시간 텍스처: 몸을 다시 만들어도 같은 텍스처를 계속 쓴다
  const live = { face: liveTexture(2048, 1024), eyes: [liveTexture(512, 512), liveTexture(512, 512)] };
  let rig = null;

  function redrawFace() {
    const e = EXPRESSIONS[state.expression] ?? EXPRESSIONS.smile;
    drawFace(live.face, o.skin, e);
    e.eyes.forEach((mode, i) => drawEye(live.eyes[i], { iris: o.iris, lash: o.lash, mode }));
  }

  function rebuild() {
    for (const c of [...root.children]) {
      root.remove(c);
      // 재질만 버리고 텍스처는 남긴다 (캐시·실시간 텍스처를 계속 재사용)
      c.traverse((x) => { if (x.isMesh) { x.geometry.dispose(); x.material.dispose(); } });
    }
    rig = buildBody(root, o, live);
    rig.root = root;
    attachEquipment(rig, state.equipment);
  }

  // 커스터마이징: 바뀐 값만 넘기면 된다. 예) set({ hair: 'pony', hairColor: '#3a2a22', glasses: true })
  function set(patch) {
    Object.assign(o, patch);
    if (FACE_KEYS.some((k) => k in patch)) redrawFace();
    rebuild();
  }

  function setExpression(name) {
    baseExpression = null; // 직접 고른 표정이 우선
    state.expression = name;
    redrawFace();
    api.onChange?.();
  }

  function equip(id) {
    state.equipment = EQUIPMENT[id] ? id : 'none';
    attachEquipment(rig, state.equipment);
    api.onChange?.();
  }

  const player = createAnimator();

  // 액션 실행: 필요한 장비를 자동으로 쥐고, 표정이 있는 액션은 끝날 때 원래 표정으로 되돌린다
  // onHit(이름, 몇 번째 타격) · onComplete(이름) 는 일회성 액션에서 불린다
  function setAction(name, onHit, onComplete) {
    const def = ACTIONS[name] ? ACTIONS[name] : (name = 'idle', ACTIONS.idle);
    if (def.equip && def.equip !== state.equipment) equip(def.equip);
    if (def.expression) {
      if (baseExpression === null) baseExpression = state.expression;
      state.expression = def.expression;
      redrawFace();
    } else if (baseExpression !== null) {
      state.expression = baseExpression;
      baseExpression = null;
      redrawFace();
    }
    state.action = name;
    player.play(name, onHit, onComplete);
    api.onChange?.();
  }
  player.onEnd = (_name, next) => { if (next) setAction(next); };

  let blinkT = 2 + Math.random() * 3;

  function update(t, dt = 1 / 60) {
    if (state.action !== player.action) setAction(state.action); // state.action 을 직접 바꾼 경우도 받아 줌
    const fx = player.update(rig, t, dt);
    updateEquipment(rig, root, fx, t, dt, state);
    // 간헐적 눈 깜빡임
    blinkT -= dt;
    let sy = 1;
    if (blinkT < 0.12) sy = Math.max(0.08, Math.abs(blinkT - 0.06) / 0.06);
    if (blinkT < 0) blinkT = 2.5 + Math.random() * 3;
    rig.eyes.scale.y = sy;
  }

  redrawFace();
  rebuild();
  // onChange: 액션 종료·자동 장착 등 내부에서 상태가 바뀔 때 UI가 다시 그리도록 연결하는 자리
  const api = { root, get rig() { return rig; }, options: o, state, set, setExpression, setAction, equip, update, onChange: null };
  return api;
}
