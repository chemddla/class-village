// 고품질 마을 주민 캐릭터 (모두 코드로 생성: 회전체 + 변형 구 + 캔버스 텍스처)
// 키 약 1.0, 약 2.6등신. 정면은 +Z.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  aoGradient, liveTexture, drawFace, drawEye, hairTexture, clothTexture, clothBump,
  plaidTexture, soleBump, pocketTexture, shade, logoTexture, canvasTexture, FACE,
} from './textures.js';
import { ACTIONS, ARM_REST, createAnimator } from './actions.js';
import { EQUIPMENT, attachEquipment, disposeEquipment, updateEquipment, straightenWrists } from './equipment.js';
import { resolveArmCollision } from './collision.js';

const PI = Math.PI;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// ───────────── 머리 모양: 볼살이 아래로 처진 가로로 넓은 둥근 사각 구 ─────────────
export const HEAD_R = 0.2;

export function dir(phi, th, out = V()) {
  return out.set(Math.sin(th) * Math.sin(phi), Math.cos(th), Math.sin(th) * Math.cos(phi));
}

export function headShape(n, out = V()) {
  // 정면 윤곽은 참고 사진(짧은 머리 정면) 윤곽의 높이별 폭에 맞춘 값이다:
  // 가로·세로가 거의 같고, 정수리는 둥글게 차오르며, 볼 아래에서 턱까지 둥글게 모인다.
  // 얼굴 앞면은 넓고 평평하게(비스듬히 봐도 먼 쪽 눈이 윤곽 끝에 보이게), 뒤통수는 공처럼 둥글게
  const lower = Math.max(0, -n.y);
  const p = 2.8;
  const q = 2 + 1.2 * Math.min(1, Math.max(0, n.z) * 1.6); // 앞쪽만 깊이 방향 지수를 키워 얼굴을 평평하게
  const k = ((Math.abs(n.x) ** p + Math.abs(n.y) ** p) ** (q / p) + Math.abs(n.z) ** q) ** (1 / q);
  out.copy(n).divideScalar(k).lerp(n, 0.2);
  out.x *= 0.94;
  out.y *= 0.95;
  out.z *= 0.93;
  // 아래 볼살: 입~턱 높이의 얼굴 앞쪽이 앞으로 도톰하게 나와 턱이 둥글게 받쳐진다
  const jowl = gauss(n.y + 0.55, 0.38) * Math.max(0, n.z) * (1 - 0.5 * lower * lower);
  out.z *= 1 + 0.15 * jowl;
  return out.multiplyScalar(HEAD_R);
}

const surf = (phi, th, scale = 1) => headShape(dir(phi, th)).multiplyScalar(scale);

function surfNormal(phi, th, scale = 1) {
  const e = 0.002;
  const a = surf(phi + e, th, scale).sub(surf(phi - e, th, scale));
  const b = surf(phi, th + e, scale).sub(surf(phi, th - e, scale));
  return b.cross(a).normalize();
}

// 곡면 칸 수 배율: 마을처럼 멀리서 여럿이 보일 때는 낮춰 삼각형을 줄인다 (몸을 만들 때마다 createVillager 가 정한다)
let SEG = 1;

// 방위각·극각 격자로 곡면 만들기 (가장자리가 계단 없이 매끈함)
function shellGrid(nPhi, nT, thetaMax, point, { phiMin = -PI, phiMax = PI } = {}) {
  nPhi = Math.round(nPhi * SEG);
  nT = Math.max(2, Math.round(nT * SEG));
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
  // 둘레는 최소 48칸: 소매·바짓단 같은 둥근 테두리에 각진 면이 보이지 않게
  const g = new THREE.LatheGeometry(pts, Math.round(Math.max(segs, 48) * SEG), PI, PI * 2);
  if (zScale !== 1) g.scale(1, 1, zScale);
  g.computeVertexNormals();
  return g;
}

function ellipsoid(rx, ry, rz, segs = 32) {
  const n = Math.round(Math.max(segs, 32) * SEG);
  return new THREE.SphereGeometry(1, n, Math.round(Math.max(24, n * 0.7 / SEG) * SEG)).scale(rx, ry, rz);
}

// ───────────── 재질 ─────────────
// 피부: 보송한 솜털 광(sheen)으로 혈색 있게
// 몸 모든 부위가 함께 쓰는 살색 바탕 (그늘은 조명·툰 명암이 맡는다)
const flatSkin = (skin) => aoGradient('skinFlat', skin, [[0, 1], [1, 1]]);
function skinMat(map) {
  return new THREE.MeshPhysicalMaterial({
    color: 0xffffff, map, roughness: 0.55, sheen: 0.4, sheenColor: new THREE.Color(0xffd5c2), sheenRoughness: 0.8,
  });
}
// 천(코튼): 거칠지만 결 방향으로 포근하게 번지는 sheen
function clothMat(map, bumpMap, { roughness = 0.85, bumpScale = 1.2 } = {}) {
  return new THREE.MeshPhysicalMaterial({
    map, bumpMap, bumpScale, roughness, metalness: 0, sheen: 0.6, sheenRoughness: 0.8, sheenColor: new THREE.Color(0xffffff),
  });
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

// 머리 덮개가 얹히는 높이: 정수리는 두상의 약 1.15배로 풍성하게 (소두 효과)
const capScale = (th) => 1.09 + 0.075 * Math.max(0, Math.cos(th));

// 덮개 곡면: 뒤통수는 봉긋하게, 귀 위쪽은 안으로 눌러 붕 뜨지 않게 (press: 누르는 정도)
function capS(phi, th, press = 1) {
  const a = Math.abs(phi);
  const back = 0.055 * smooth(1.5, 2.9, a) * Math.exp(-(((th - 1.35) / 0.55) ** 2));
  const ear = 0.04 * press * Math.exp(-(((a - 1.57) / 0.5) ** 2)) * smooth(PI * 0.3, PI * 0.48, th);
  return capScale(th) + back - ear;
}
const SKIN_HUG = 1.012; // 머리끝이 내려앉는 높이 (피부 바로 위)

// 텍스처 세로 좌표를 극각으로: 덮개와 가닥의 엔젤링이 한 줄로 이어짐
const hairV = (th) => 1 - th / (PI * 0.8);
function thetaUV(g) {
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const r = Math.hypot(p.getX(i), p.getY(i), p.getZ(i));
    uv.setY(i, hairV(Math.acos(THREE.MathUtils.clamp(p.getY(i) / r, -1, 1))));
  }
  return g;
}

// 헤어는 스타일마다 '통짜 곡면 한 장'. 덮개의 아래 경계선(극각 thetaMax(phi))을 수학 곡선으로 깎아
// 앞머리 모양 자체를 만든다. 가닥 조각을 덧대지 않으므로 이음새·겹침 그림자·외곽선 속 지저분한 선이 없다.
// front(phi): 이마 쪽 경계선, side/back: 옆·뒤 끝 (π 배수), press: 귀 위를 누르는 정도
const gauss = (x, w) => Math.exp(-((x / w) ** 2));
// 부드러운 최댓값: 여러 갈래 곡선을 이어 붙일 때 사이 골짜기만 살짝 둥글게 (k가 클수록 날카로움)
const smax = (k, ...xs) => Math.log(xs.reduce((s, x) => s + Math.exp(k * x), 0)) / k;
// 위로 파고드는 좁은 역V자 홈 (아래로 벌어지고 꼭짓점만 살짝 둥글게: 외곽선이 끝에 뭉치지 않게)
const notch = (phi, c, w, depth) => depth * Math.max(0, 1 - Math.hypot(phi - c, w * 0.15) / w);
// 아래로 뾰족하게 떨어지는 갈래: c에서 길이 tip, 양옆 기울기 slopeL/slopeR, soft만큼 끝을 둥글림
const spike = (phi, c, tip, slopeL, slopeR = slopeL, soft = 0) => {
  const d = Math.hypot(phi - c, soft) - soft;
  return tip - d * (phi < c ? slopeL : slopeR);
};

// side: 귀 위 옆머리 끝, burn: 구레나룻 끝, back: 뒷머리 끝 (모두 π 배수 극각. 귀는 0.50π~0.62π)
// nape: 목덜미 가운데로 더 내려오는 길이, wisp: 다발 끝이 맺히는 길이
// whorl: 머릿결이 퍼져 나오는 가마 [방위각, 극각(π 배수), 둘레 다발 수] (포니테일은 묶은 자리), relief: 다발 굴곡 깊이
export const HAIRSTYLES = {
  side: {
    label: '시스루 댄디컷', whorl: [2.6, 0.1, 15], side: 0.485, burn: 0.6, back: 0.68, nape: 0.045, press: 1.6,
    flicks: [[-1.95, 0.16], [1.95, 0.16]],
    // 한쪽으로 쓸어내린 사선 앞머리: 캐릭터 왼쪽은 높고 오른쪽 눈썹 쪽으로 길어지며, 끝은 같은 방향으로 누운 가닥 4개
    front: (phi) => smax(70, 0.4 + 0.055 * smooth(0.8, -0.7, phi),
      spike(phi, -0.6, 0.482, 0.9, 0.3, 0.04), spike(phi, -0.22, 0.47, 0.9, 0.3, 0.04),
      spike(phi, 0.14, 0.455, 0.9, 0.3, 0.04), spike(phi, 0.48, 0.438, 0.9, 0.3, 0.04)),
    volume: (phi, th) => 0.035 * gauss(th - PI * 0.2, 0.35),
  },
  bob: {
    label: '풀뱅 보브 단발', whorl: [PI, 0.06, 17], side: 0.7, back: 0.7, press: 0.6, wisp: 0.006,
    // 얼굴을 감싸듯 양옆이 살짝 더 긴 둥근 앞머리에 이마가 비치는 가는 틈 2개
    front: (phi) => 0.44 + 0.035 * Math.min(1, phi * phi) - notch(phi, -0.22, 0.08, 0.06) - notch(phi, 0.33, 0.07, 0.05),
  },
  pony: {
    label: '커튼뱅 포니테일', whorl: [PI, 0.4, 22], relief: 0.016, side: 0.5, burn: 0.64, back: 0.6, nape: 0.05, press: 1,
    // 가운데 가르마에서 양옆으로 넘어가는 커튼뱅: 이마가 역V로 드러나고 그대로 귀 앞 잔머리(구레나룻)로 흘러내림
    front: (phi) => 0.28 + 0.165 * smooth(0, 0.85, Math.abs(phi - 0.06)) ** 0.8,
  },
  short: {
    label: '쉼표 가르마 펌', whorl: [1.1, 0.14, 14], relief: 0.026, side: 0.48, burn: 0.59, back: 0.63, nape: 0.05, press: 1.4,
    flicks: [[-1.95, 0.15], [1.95, 0.15]],
    // 6.5:3.5 가르마. 넓은 쪽은 가르마에서 솟았다가 눈썹 위로 둥글게 내려와 끝이 쉼표처럼 맺히고, 좁은 쪽은 귀 쪽으로 넘어감
    front: (phi) => {
      const part = 0.42;
      if (phi >= part) return 0.33 + 0.09 * smooth(part, 1.1, phi);
      return smax(60, 0.33 + 0.15 * smooth(part, -0.25, phi) - 0.06 * smooth(-0.3, -0.95, phi), spike(phi, -0.3, 0.5, 0.35, 1.2, 0.04));
    },
    // 넓은 쪽 윗머리만 봉긋하게
    volume: (phi, th) => 0.065 * gauss(phi + 0.3, 0.55) * gauss(th - PI * 0.22, 0.3),
  },
};

// hairSegs: 머리 곡면의 둘레 칸 수 (이마 경계선의 섬세함 ↔ 정점 수)
function buildHair(head, o, { hairSegs = 720 } = {}, hat = null) {
  const hair = new THREE.Group();
  hair.name = '헤어';
  head.add(hair);
  // 매끈한 파스텔 재질: 반사는 낮추고 결 방향 sheen만 은은하게
  const mat = new THREE.MeshPhysicalMaterial({
    map: hairTexture(o.hairColor), roughness: 0.62, specularIntensity: 0.35,
    sheen: 0.3, sheenRoughness: 0.7, sheenColor: new THREE.Color(0xffffff), side: THREE.DoubleSide,
  });
  const style = HAIRSTYLES[o.hair] ? o.hair : 'side';
  const S = HAIRSTYLES[style];
  // 머릿결: 가마(whorl)에서 사방으로 흘러내리는 굵은 다발. 다발 가운데는 도톰하고 다발 사이는 얕은 골이 진다
  // (줄무늬 텍스처가 아니라 곡면 자체의 굴곡이라 빛·툰 명암·외곽선이 결을 따라 생긴다)
  const [wPhi, wTh, nLock] = S.whorl ?? [PI, 0.1, 15];
  const relief = S.relief ?? 0.022;
  const W = dir(wPhi, PI * wTh);
  const E1 = V(1, 0, 0).addScaledVector(W, -W.x).normalize();
  const E2 = V().crossVectors(W, E1);
  const pt = V();
  const lock = (phi, th) => {
    dir(phi, th, pt);
    const az = Math.atan2(pt.dot(E2), pt.dot(E1));
    const w = az + 0.1 * Math.sin(az * 3 + 1.3) + 0.05 * Math.sin(az * 7 + 0.4); // 다발 굵기를 불규칙하게
    const far = Math.acos(THREE.MathUtils.clamp(pt.dot(W), -1, 1)); // 가마 근처는 매끈하게
    return (Math.abs(Math.sin((w * nLock) / 2)) ** 0.7 - 0.6) * smooth(0.12, 0.7, far);
  };
  // 아래 경계선 한 줄로 머리 모양이 정해진다: 앞머리 → 관자놀이 → 구레나룻 → 귀 위 → 귀 뒤 → 목덜미
  const thetaMax = (phi) => {
    const a = Math.abs(phi);
    const f = PI * S.front(phi);
    let h = f + (PI * S.side - f) * smooth(0.8, 1.25, a);
    // 구레나룻: 관자놀이에서 귀(phi=±π/2) 앞으로 흘러내리는 둥근 갈래. 얼굴 쪽은 완만하게, 귀 쪽은 귀 앞선을 따라 가파르게
    const d = a - 1.3;
    h += PI * Math.max(0, (S.burn ?? 0) - S.side) * Math.exp(-((Math.abs(d) / (d < 0 ? 0.2 : 0.085)) ** 1.6));
    // 귀 위를 지나 귀 뒤에서 목덜미 길이까지 내려가고, 목덜미 가운데로 살짝 모인다
    h += PI * (S.back - S.side) * smooth(1.72, 2.25, a) + PI * (S.nape ?? 0) * gauss(a - PI, 0.5);
    // 끝선도 다발마다 둥글게 맺힌다 (다발 가운데가 조금 더 길고 골은 짧게). 모양을 따로 그린 앞머리는 약하게
    return h + PI * (S.wisp ?? 0.012) * lock(phi, h) * (0.4 + 0.6 * smooth(0.7, 1.2, a)) + PI * 0.018 * flick(phi);
  };
  const height = (phi, th) => {
    const s = capS(phi, th, S.press) + (S.volume ? S.volume(phi, th) : 0) + relief * lock(phi, th);
    if (!hat) return s;
    // 모자를 쓰면 윗머리 볼륨이 모자 안쪽 높이까지 눌리고, 모자 끝선 밖에서 다시 살아난다
    const edge = hatLine(o, hat, phi);
    return Math.min(s, HATS[hat].fit(th) - 0.014 + 0.12 * smooth(edge - 0.04, edge + 0.22, th));
  };
  // 삐침: 귀 뒤에서 살짝 뻗치는 머리끝 [방위각, 반폭]. 끝을 둥글게 다듬은 낮은 봉우리라 뒤통수 밖으로 뿔처럼 튀어나오지 않는다
  // (뒷머리 아래쪽에는 두지 않는다: 뒤에서 보면 목덜미에 가시가 돋은 것처럼 보인다)
  const flick = (phi) => (S.flicks ?? []).reduce((m, [c, w]) => Math.max(m, smooth(0, 1, 1 - Math.abs(phi - c) / w)), 0);
  // 머리끝이 내려앉는 높이: 골은 피부에 닿고 다발 가운데는 도톰하게 떠서 끝에도 두께가 보인다
  const hug = (phi, th) => SKIN_HUG + relief * (0.6 + lock(phi, th));
  let g;
  if (style === 'bob') {
    // 종 모양: 옆·뒤는 아래로 갈수록 살짝 퍼졌다가(A라인) 턱선에서 안쪽으로 부드럽게 말림(C컬)
    g = shellGrid(hairSegs, Math.round(hairSegs / 11), thetaMax, (phi, _th, t) => {
      const tm = thetaMax(phi);
      const body = 0.86;
      const flare = (th) => 0.06 * smooth(PI * 0.35, tm, th) ** 1.5 * smooth(0.9, 1.5, Math.abs(phi));
      if (t <= body) {
        const th = (t / body) * tm;
        // 앞머리 쪽 끝은 이마로 내려앉음
        const s = height(phi, th) + flare(th);
        // 실제 경계선에서 일정한 폭만 이마로 내려앉음 (홈 가장자리도 이마에 얹히고, 위로 긴 주름은 없음)
        const tuck = smooth(tm - PI * 0.08, tm, th);
        return surf(phi, th, s + (hug(phi, th) - s) * tuck * (1 - smooth(0.9, 1.4, Math.abs(phi))));
      }
      // 안으로 말리는 C컬은 옆·뒤만 (이마 앞머리는 말리지 않고 그대로 이마에 얹힘)
      const a = ((t - body) / (1 - body)) * PI;
      const k = smooth(0.9, 1.4, Math.abs(phi));
      const s = height(phi, tm) + flare(tm);
      return surf(phi, tm + 0.03 * Math.sin(a) * k, s + (hug(phi, tm) - s) * (1 - k) - 0.035 * (1 - Math.cos(a)) * k);
    });
  } else {
    // 돔: 끝은 피부 쪽으로 부드럽게 내려앉아 앞머리 끝이 이마에 얹힌 듯
    g = shellGrid(hairSegs, Math.round(hairSegs / 15), thetaMax, (phi, th, t) => {
      const s = height(phi, th);
      const tm = thetaMax(phi);
      // 삐침 자리는 피부에 내려앉지 않고 끝으로 갈수록 바깥으로 들린다
      const out = 0.07 * flick(phi) * smooth(tm - PI * 0.09, tm, th);
      return surf(phi, th, s + (hug(phi, th) + out - s) * smooth(tm - PI * 0.1, tm, th) ** 1.3);
    });
  }
  // 머리 외곽선은 절반 두께: 단발 뒷머리 외곽선이 턱 아래 목선 쪽으로 비치지 않게
  mesh(thetaUV(g), mat, hair, '머리').userData.outlineWidth = 0.006;
  if (style === 'pony') buildPonytail(hair, mat, o);
  return hair;
}

// 뒤통수 포니테일: 머리끈 1개 + 매끈한 꼬리 1개 (통통하게 내려오다 S자로 흐르며 끝이 뾰족하게 모임)
function buildPonytail(hair, mat, o) {
  const th = PI * 0.4;
  const sc = capS(PI, th);
  const tail = new THREE.Group();
  tail.name = '포니테일';
  tail.position.copy(surf(PI, th, sc)).addScaledVector(surfNormal(PI, th, sc), 0.006);
  tail.rotation.x = 0.2; // 뒤로 살짝 비스듬히 처짐
  hair.add(tail);
  // 스크런치: 둘레를 따라 주름이 잡힌 도넛
  const R = 0.03;
  const tieGeo = new THREE.TorusGeometry(R, 0.013, 16, 72);
  const tp = tieGeo.attributes.position;
  const c = V();
  const p = V();
  for (let i = 0; i < tp.count; i++) {
    p.fromBufferAttribute(tp, i);
    const u = Math.atan2(p.y, p.x);
    c.set(Math.cos(u) * R, Math.sin(u) * R, 0);
    p.sub(c).multiplyScalar(1 + 0.22 * Math.sin(u * 14)).add(c);
    tp.setXYZ(i, p.x, p.y, p.z);
  }
  tieGeo.rotateX(PI / 2).computeVertexNormals();
  const tie = mesh(tieGeo, new THREE.MeshPhysicalMaterial({ color: o.tie ?? '#ff6b8a', roughness: 0.6, sheen: 0.6, sheenRoughness: 0.6 }), tail, '머리끈');
  tie.position.y = 0.002;
  const L = 0.36;
  const g = lathe([[0.022, 0.004], [0.042, -0.03], [0.056, -0.09], [0.054, -0.16], [0.042, -0.23], [0.026, -0.29],
    [0.011, -0.335], [0, -L]], 48);
  // 아래로 갈수록 뒤로 휘고 옆으로 S자 물결
  const gp = g.attributes.position;
  for (let k = 0; k < gp.count; k++) {
    const y = -gp.getY(k);
    gp.setX(k, gp.getX(k) + 0.03 * Math.sin((2 * PI * y) / L) * (y / L));
    gp.setZ(k, gp.getZ(k) - 0.18 * y * y);
  }
  g.computeVertexNormals();
  mesh(g, mat, tail, '꼬리').userData.outlineWidth = 0.006;
}

// ───────────── 얼굴 ─────────────
function buildHead(head, o, live) {
  const skin = skinMat(live.face, o.skin);
  const g = shellGrid(96, 64, () => PI, (phi, th) => surf(phi, th));
  // 머리 밑바닥(목이 붙는 둘레)에는 외곽선을 두르지 않는다: 그 껍질을 목이 뚫고 올라오면서 턱 바로 밑 목에 가는 줄이 그어진다.
  // 턱선 자체(옆에서 본 머리 윤곽)는 그보다 위라 그대로 남는다
  const gp = g.attributes.position;
  const noLine = new Float32Array(gp.count);
  for (let i = 0; i < gp.count; i++) {
    const th = Math.acos(THREE.MathUtils.clamp(gp.getY(i) / Math.hypot(gp.getX(i), gp.getY(i), gp.getZ(i)), -1, 1));
    noLine[i] = smooth(PI * 0.76, PI * 0.86, th);
  }
  g.setAttribute('noLine', new THREE.Float32BufferAttribute(noLine, 1));
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
    // 눈은 크고 동그랗게, 얼굴 폭의 절반쯤 벌어지게 (옆으로 돌아가는 만큼 가로 폭을 더 준다)
    const geo = facePatch(s * FACE.eyePhi, FACE.eyeTh, 0.3, 0.28, { flipU: s < 0, bulge: 0.008 });
    const m = mesh(geo, mat, eyes, '눈');
    m.castShadow = false;
  }
  // 눈 깜빡임용: 눈 높이를 기준점으로
  const eyeY = surf(0, FACE.eyeTh - PI * 0.005).y;
  eyes.position.y = eyeY;
  eyes.children.forEach((c) => c.position.y -= eyeY);

  // 코: 피부보다 진한 주황빛 조각이 도톰하게 튀어나옴 (그려 넣는 코는 얼굴 텍스처가 맡는다)
  const noseGeo = NOSE_STYLES[o.noseStyle] ? NOSE_STYLES[o.noseStyle].geo : NOSE_STYLES.classic.geo;
  if (noseGeo) {
    const nose = mesh(noseGeo(), new THREE.MeshPhysicalMaterial({
      color: shade(o.nose, 1), roughness: 0.45, sheen: 0.4, sheenColor: new THREE.Color('#ffd0b0'),
    }), head, '코');
    const np = surf(0, FACE.noseTh);
    nose.position.copy(np).addScaledVector(surfNormal(0, FACE.noseTh), 0.008);
    nose.castShadow = false; // 코 그림자가 어깨에 초승달처럼 떨어지는 것 방지
  }

  // 귀
  // (얼굴 재질을 그대로 쓰면 얼굴 그림 전체가 귀에도 작게 입혀져 볼 발그레와 입이 귀에 찍힌다: 그림 없는 살색 재질을 쓴다)
  const earSkin = skinMat(flatSkin(o.skin));
  for (const s of [-1, 1]) {
    // 귀는 눈 아래~코 높이, 머리 옆면에 붙어 옆으로 살짝 튀어나온다.
    // 참고 사진처럼 위쪽이 넓고 둥글며 아래(귓불)로 갈수록 좁아지는 달걀 꼴
    const earGeo = ellipsoid(0.03, 0.056, 0.034);
    const ep = earGeo.attributes.position;
    for (let i = 0; i < ep.count; i++) {
      const t = ep.getY(i) / 0.056; // 아래 -1 ~ 위 1
      const w = 1 + 0.22 * t;
      ep.setX(i, ep.getX(i) * w);
      ep.setZ(i, ep.getZ(i) * w);
    }
    earGeo.computeVertexNormals();
    const ear = mesh(earGeo, earSkin, head, '귀');
    ear.position.copy(surf(s * PI * 0.5, FACE.earTh)).multiplyScalar(0.99);
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
// 목: 옷 윗단(NECK_Y)을 내리고 머리(HEAD_Y)는 그 위로 띄워, 턱과 옷 사이에 피부색 목 기둥이 또렷이 보인다
// (옷이 턱까지 올라오면 목이 파묻혀 어깨가 승모근처럼 솟아 보인다)
export const NECK_Y = 0.218 * TY; // 상의 목둘레 높이
export const HEAD_Y = 0.245 * TY + 0.188; // 머리 중심 높이 (머리 아래쪽 반지름 약 0.19): 목은 아주 짧게, 턱 아래로 조금만 보인다

// 상의 단면 [반지름, 높이] (세로 TY배 전): 목둘레 → 밑단, 끝 세 점은 안쪽으로 접힌 밑단 두께.
// 맨몸 몸통(BODY)을 천 두께만큼만 띄워 그대로 따라간다: 어깨는 둥글게 넘어가고, 겨드랑이 아래로는 종처럼 벌어지지 않고
// 거의 곧게 내려가 밑단만 살짝 여유를 둔다. 옷을 입혀도 몸통 옆선이 다리 바깥선으로 이어지는 맨몸의 실루엣이 그대로 남는다.
// 어깨 끝(목 옆 평평한 윗면 → 옆구리)은 둥근 호(중심 0.073, 0.145)로 채운다: 좁게 꺾이면 팔을 들거나 몸을 틀어
// 소매가 비켜날 때 어깨가 상자 모서리처럼 드러난다
const SHIRT = [
  [0.042, 0.2], [0.049, 0.218], [0.063, 0.2175], [0.073, 0.2145], [0.0793, 0.2121], [0.0853, 0.2052], [0.0903, 0.1941],
  [0.0942, 0.1797], [0.0967, 0.163], [0.0975, 0.145], [0.101, 0.125], [0.1045, 0.1], [0.1075, 0.065], [0.1095, 0.02], [0.1115, -0.02],
  [0.1125, -0.031], [0.1065, -0.032], [0.1015, -0.02],
];
// 몸 충돌 검사용 상의 단면: 둥글리기 전 모양 그대로 둔다 (두 손 쥐기·팔 밀어내기가 이 모양에 맞춰져 있다)
const SHIRT_FIT = [
  [0.042, 0.2], [0.049, 0.218], [0.063, 0.2175], [0.073, 0.2145], [0.081, 0.208], [0.087, 0.198], [0.091, 0.184],
  [0.094, 0.165], [0.0975, 0.145], [0.101, 0.125], [0.1045, 0.1], [0.1075, 0.065], [0.1095, 0.02], [0.1115, -0.02],
];
// 목 단면 (몸통 기준 높이): 머리 속에서 넓게 시작해 목둘레까지
// 목은 머리 폭의 5분의 1쯤으로 가늘게
const NECK = [[0.072, HEAD_Y - 0.13], [0.058, HEAD_Y - 0.158], [0.045, HEAD_Y - 0.178], [0.039, HEAD_Y - 0.2], [0.039, NECK_Y + 0.012]];
// 맨몸 몸통 단면: 어깨까지는 상의와 같고, 겨드랑이 아래로는 벌어지지 않고 곧게 내려가 골반·다리 바깥선으로 그대로 이어진다
const BODY = [
  [0.046, 0.2], [0.052, 0.218], [0.063, 0.2175], [0.073, 0.2145], [0.0793, 0.2121], [0.0853, 0.2052], [0.0903, 0.1941],
  [0.0925, 0.18],
  // 허리 아래(속옷 속에 숨는 곳)는 조금 안으로 넣는다: 속옷과 간격이 거의 없어 앞면을 눌러 다리로 이을 때 맨살이 비쳐 나온다
  [0.093, 0.165], [0.094, 0.145], [0.097, 0.125], [0.1, 0.1], [0.102, 0.065], [0.103, 0.02], [0.098, -0.03], [0.086, -0.05],
];
// 높이 y(세로 배율 적용 전)에서 셔츠 겉 반지름
function shirtRadius(y) {
  const side = SHIRT.slice(1, 16);
  for (let i = 1; i < side.length; i++) {
    const [r1, y1] = side[i];
    if (y >= y1) {
      const [r0, y0] = side[i - 1];
      return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
    }
  }
  return side[side.length - 1][0];
}
// 어깨 관절: 목둘레 바로 아래, 몸통 곡면보다 안쪽에 둔다 → 소매 윗선이 넥라인에서 곧장 시작해
// 목 → 어깨 → 팔이 끊기지 않는 한 줄의 A자 경사로 떨어진다 (낮고 바깥이면 몸통 어깨 곡선과 소매 사이가 뚝 끊겨 보인다).
// 값을 바꾸면 두 손으로 도구를 쥐는 자세가 달라지므로 collision.check.js 를 꼭 돌릴 것 (조금만 달라도 통과·실패가 갈린다)
// 몸통·다리 굵기 배율 (단면 수치는 그대로 두고 다 만든 뒤 가로·앞뒤로 줄인다: slimBody)
export const BODY_K = 0.9;
export const LEG_K = 0.88;
export const SHOULDER = { x: 0.076 * BODY_K, y: 0.184 * TY };

// 소매·맨팔 윗부분: 어깨 관절을 중심으로 한 둥근 마감(어깨 살). 팔과 함께 돌기 때문에 팔을 어느 쪽으로 움직여도
// 몸통 어깨선과 팔이 둥글게 이어지고 따로 떨어져 보이지 않는다. 팔보다 조금 굵게 잡아 팔을 들 때 생기는
// 몸통 어깨선과 팔 윗면 사이의 오목한 꺾임을 둥글게 메운다
const CAP_R = 0.027;
// 둥근 반구 그대로 둔다: 마감이 팔 각도를 따라 기울어(shoulderBone) 몸통 어깨 호와 볼록하게만 이어진다.
// 납작하게 누르면 몸통 호가 급히 떨어진 뒤 마감이 다시 솟아 그 사이가 오목하게 꺼진다
const SHOULDER_CAP = [0, 20, 40, 60, 78, 90].map((d) => [CAP_R * Math.sin((d * PI) / 180), CAP_R * Math.cos((d * PI) / 180)]);
// 어깨 둥근 마감의 외곽선: 몸통과 맞닿는 쪽(몸 안쪽 반쪽)은 선을 긋지 않는다.
// 선이 남으면 팔을 들거나 몸을 틀 때 몸통 위에 소매 테두리가 그어져 어깨가 따로 붙은 공처럼 끊겨 보인다.
// (바깥쪽 꼭대기는 남긴다: 차렷 자세에서 어깨 윗선이 이 마감의 윤곽이다)
// s: 팔 방향(-1 오른팔, 1 왼팔). 반환값 0 = 선 그대로, 1 = 선 없음
const capLine = (s) => (x, y) => smooth(0.004, -0.012, x * s) * smooth(-0.05, -0.025, y);

// 셔츠 겉면을 따라가는 세로 단면 조각 (아래→위, off만큼 띄움): 로고·지퍼·주머니 같은 덧댐에 쓴다
function shirtProf(y0, y1, off = 0.002, n = 8) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const y = y1 + ((y0 - y1) * i) / n;
    pts.push([shirtRadius(y) + off, y * TY]);
  }
  return pts;
}
// 긴바지 차림의 상의는 아래로 갈수록 앞뒤 두께를 줄인다: 옆에서 보면 A라인 밑단이 가는 바지 앞뒤로 튜브처럼 떠 보이므로,
// 좌우 폭(정면 실루엣)은 그대로 두고 앞뒤만 바지 쪽으로 자연스럽게 떨어지게 한다. (buildBody 가 차림에 따라 켠다)
let hemTaper = 0;
const depthK = (y) => 1 - 0.3 * hemTaper * smooth(0.12, -0.03, y); // y: 몸통 기준 높이
// 옆에서 본 몸통 두께(앞뒤 반두께): 높이 y(몸통 기준), 그 높이의 회전체 반지름 r.
// 몸통은 앞뒤로 납작(0.78배)하지만, 위쪽은 목 굵기에서 시작해 가슴·등까지 완만하게 불어나는 물방울 꼴로 떨어진다.
// (어깨 높이까지 납작한 통 두께 그대로 올라가면 옆에서 볼 때 몸통이 상자처럼 머리 밑에 바로 붙어 보인다)
const NECK_TOP = 0.206; // 이보다 위(목)는 둥근 그대로
function sideDepth(y, r) {
  if (y >= NECK_TOP + 0.006) return r;
  const u = Math.max(0, Math.min(1, (NECK_TOP - y) / (NECK_TOP - 0.12)));
  const curve = 0.039 + 0.033 * (1 - (1 - u) ** 2); // 목 두께 → 가슴 두께, 위쪽일수록 빨리 불어나는 곡선
  const flat = 0.78 * r;
  const d = Math.min(r, flat + (curve - flat) * smooth(0.11, 0.2, y)) * depthK(y);
  // 둥근 목과 만나는 곳은 두께가 뚝 끊기지 않게 섞는다 (끊기면 목 밑에 주름·외곽선 꺾임이 생긴다)
  return d + (r - d) * smooth(NECK_TOP - 0.014, NECK_TOP + 0.006, y);
}
// 몸통에 붙는 조각(상의·밑단 띠·덧댐)의 앞뒤 두께를 같은 곡선으로 맞춘다. zs: 회전체를 만들 때 이미 곱한 앞뒤 비율
function fitTorso(g, zs = 0.78) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i) / zs;
    const r = Math.hypot(x, z);
    if (r > 1e-6) p.setZ(i, z * (sideDepth(p.getY(i), r) / r));
  }
  g.computeVertexNormals();
  return g;
}
// 셔츠 앞면에서 가로 x 지점의 앞뒤 위치
const shirtZ = (y, x) => {
  const r = shirtRadius(y);
  return Math.sqrt(Math.max(0, r * r - x * x)) * (sideDepth(y * TY, r) / r);
};

// 회전체의 한 부분(부채꼴)만 떼어 낸 덧댐 조각: 정면이 phi=0, 캐릭터 왼쪽(+x)이 +phi. 텍스처는 조각에 꽉 차게 입혀진다
function sector(pts, phiC, dPhi, zs, mat, parent, name) {
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 12, phiC - dPhi, dPhi * 2);
  if (zs !== 1) fitTorso(g.scale(1, 1, zs), zs); // 앞뒤로 납작한 조각은 몸통에 붙는 것뿐
  g.computeVertexNormals();
  const m = mesh(g, mat, parent, name);
  m.castShadow = false;
  m.userData.noOutline = true; // 옷 위에 붙은 무늬라 따로 외곽선을 두르지 않는다
  return m;
}
// 다른 부위 속으로 들어가 이어지는 쪽 끝에는 외곽선을 두르지 않는다 (이음새마다 갈색 고리가 그어지지 않게)
// f(x, y, z) → 0(외곽선 그대로) ~ 1(없음)
function fadeLine(m, f) {
  const p = m.geometry.attributes.position;
  const a = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) a[i] = f(p.getX(i), p.getY(i), p.getZ(i));
  m.geometry.setAttribute('noLine', new THREE.Float32BufferAttribute(a, 1));
  return m;
}
const flatMat = (color, map = null) => new THREE.MeshStandardMaterial({ color: map ? '#ffffff' : color, map, roughness: 0.8, side: THREE.DoubleSide });

// ───────────── 의상 ─────────────
// sleeve: 소매 길이, pants: 발목까지 오는 긴바지(하의 선택과 상관없이), inner: 반팔 안에 긴팔을 겹쳐 입음, accent: 기본 배색
export const OUTFITS = {
  tee: { label: '기본 티', sleeve: 'short' },
  street: { label: '오버핏 반팔', sleeve: 'short', pants: true, accent: '#e2574c' },
  hoodie: { label: '로고 후드티', sleeve: 'long', pants: true, accent: '#e2574c' },
  track: { label: '트랙 집업', sleeve: 'long', pants: true, accent: '#ffffff' },
  layered: { label: '레이어드 긴팔', sleeve: 'short', inner: true, pants: true, accent: '#fffaf2' },
  // 옷을 걷어 낸 맨몸 (점검용): 몸통·어깨·팔다리가 이어지는 모양을 옷 없이 본다. 속바지만 입힌 인형 몸
  base: { label: '기본 외형(맨몸)', sleeve: 'none', bare: true },
};
// 모자: front/back = 모자 끝선의 극각(π 배수), fit = 머리에 얹히는 높이 배율
export const HATS = {
  beanie: { label: '니트 비니', front: 0.395, back: 0.5, fit: (th) => 1.15 + 0.085 * Math.max(0, Math.cos(th)) ** 1.5 },
  cap: { label: '스트릿 볼캡', front: 0.36, back: 0.47, fit: (th) => 1.14 + 0.012 * Math.max(0, Math.cos(th)) },
};

// 손목에서 끊김 없이 이어지는 동그란 손
function mittenGeometry() {
  // 엄지 없는 동그란 주먹: 손목에서 둥글게 부풀었다가 끝이 둥글게 닫힌다 (앞뒤로 누르지 않아 어느 쪽에서 봐도 동그랗다)
  return lathe([[0.024, 0.006], [0.028, -0.006], [0.036, -0.024], [0.0415, -0.044], [0.0405, -0.06], [0.034, -0.076], [0.022, -0.086], [0, -0.09]], 32);
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
    const phi = s * FACE.eyePhi;
    const th = FACE.eyeTh;
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
  const zBack = -0.076; // 몸에 맞는 등판에 붙도록
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

// 팔이 파고들면 안 되는 몸 부피 (collision.js): 겉옷보다 조금 안쪽으로 잡아,
// 소매·팔꿈치가 옷에 살짝 스치는 기본 자세는 그대로 두고 눈에 띄게 박히는 것만 밀어낸다
const COLLIDER_INSET = 0.012;
const HEAD_COLLIDER = [0.19, 0.19, 0.19];
const slimProf = (pts) => pts.map(([r, y]) => [r * BODY_K, y]);
const inset = (pts, d = COLLIDER_INSET) => pts.map(([r, y]) => [Math.max(0.02, r - (typeof d === 'function' ? d(y) : d)), y]);
// 셔츠 아랫단·바지는 부드러운 천이라 더 깊이 허용: 내려 둔 손이 엉덩이 옆에 살짝 스쳐도 팔을 벌려 밀어내지 않게
const HEM_INSET = (y) => THREE.MathUtils.lerp(0.025, COLLIDER_INSET, THREE.MathUtils.smoothstep(y, 0.02 * TY, 0.1 * TY));
export function bodyColliders(o, hips, torso) {
  const list = [
    // 상의: 어깨 관절 바로 아래부터 밑단까지 (어깨 위는 팔이 붙는 곳이라 뺌)
    { joint: torso, zs: 0.78, prof: slimProf(inset(ty(SHIRT_FIT.slice(8, 14)), HEM_INSET)) },
    // 바지·치마 (골반 공간)
    o.bottom === 'skirt'
      ? { joint: hips, zs: 0.82, prof: slimProf(inset([[0.1, 0.015], [0.106, -0.012], [0.124, -0.055], [0.148, -0.108], [0.152, -0.118]], 0.03)) }
      : { joint: hips, zs: 0.8, prof: slimProf(inset([[0.105, 0.015], [0.108, -0.02], [0.108, -0.045], [0.1, -0.066]], 0.03)) },
  ];
  // 허리에 묶은 체크 셔츠는 부드러운 천이라 뺀다 (넣으면 차렷 자세의 손까지 밀려 팔이 벌어짐)
  return list;
}

// 관절 계층 (rig): root → pelvis → spine → head / shoulder → elbow → hand,  pelvis → hip → knee → foot
// R은 캐릭터의 오른쪽(-x), L은 왼쪽(+x)
const SIDE = { '-1': 'R', 1: 'L' };

function buildBody(root, o, live, detail) {
  const P = {}; // 움직일 관절들

  // 골반 (전체 기준점)
  const hips = new THREE.Group();
  hips.name = 'pelvis';
  hips.position.y = HIP_Y;
  root.add(hips);
  P.pelvis = hips;

  const outfit = OUTFITS[o.outfit] ? o.outfit : 'tee';
  const style = OUTFITS[outfit];
  const bottom = style.pants ? 'pants' : style.bare ? 'bare' : o.bottom;
  hemTaper = 0; // 상의가 몸에 맞아 앞뒤로 뜨지 않으므로 더는 줄이지 않는다
  const bottomCol = style.bare ? '#f4f1ea' : o.bottomColor;
  // 바지/치마
  if (bottom === 'skirt') {
    const skirtMat = clothMat(clothTexture('skirt', bottomCol, { stitches: [0.82], ao: [[0, 0.75], [0.15, 1], [0.85, 1], [1, 0.8]] }),
      clothBump('skirt', [0.82]));
    // 골반에 맞게 시작해 완만하게 퍼지는 A라인 치마 + 밑단 안쪽으로 접힌 두께
    // 허리는 상의 밑단(반지름 0.129)보다 확실히 좁게 넣어, 밑단이 치마 위를 덮고 경계가 또렷하게 (겹쳐서 번지지 않게)
    mesh(lathe([[0.1, 0.015], [0.105, -0.012], [0.111, -0.03], [0.124, -0.055], [0.138, -0.085], [0.148, -0.108], [0.152, -0.118], [0.145, -0.115], [0.124, -0.07]], 48, 0.8),
      skirtMat, hips, '치마');
  } else {
    const shortsMat = clothMat(clothTexture('shorts', bottomCol, { stitches: [0.35], ao: [[0, 0.8], [0.2, 1], [1, 0.9]] }),
      clothBump('shorts', [0.35]));
    // 허리는 상의 밑단 안쪽으로 넣는다 (같은 반지름이면 앞뒤로 겹쳐 번져 보임)
    // 긴바지는 엉덩이가 바짓가랑이 바깥선(0.108)과 같은 폭으로 곧게 내려가 다리로 그대로 이어진다
    // (반바지처럼 아래로 벌어지면 상의 밑에 튜브를 낀 것처럼 불룩해 보인다)
    // 반바지·긴바지 허리는 맨몸 골반과 같은 꼴: 몸통과 같은 폭으로 곧게 내려가 다리 바깥선에 닿는다
    const waist = bottom === 'bare'
      ? [[0.1035, 0.012], [0.1045, -0.01], [0.1045, -0.04], [0.098, -0.062], [0.07, -0.08], [0, -0.086]]
      : [[0.104, 0.015], [0.1075, -0.012], [0.108, -0.045], [0.1, -0.066], [0.07, -0.082], [0, -0.088]];
    // 긴바지 허리는 다리와 같은 민무늬 천 (반바지용 봉제선·명암이 섞이면 허리만 따로 논다)
    const waistMat = bottom === 'pants' ? clothMat(clothTexture('pantsTop', bottomCol), clothBump('pants')) : shortsMat;
    mesh(lathe(waist, 48, bottom === 'bare' ? 0.8 : 0.76), waistMat, hips, '바지허리');
  }

  // 다리: 허벅지 + 무릎 관절 + 종아리 (걷기에서 무릎을 굽힘)
  const legMat = skinMat(flatSkin(o.skin));
  const shinMat = legMat;
  const pantsMat = bottom === 'pants'
    ? clothMat(clothTexture('pants', bottomCol, { ao: [[0, 1], [0.9, 1], [1, 0.85]] }), clothBump('pants')) : null;
  // 맨몸은 옷에 가려 어두워지는 데가 없으므로 허벅지 위쪽 그늘을 뺀다 (얼룩처럼 보인다)
  const bareLeg = style.bare ? shinMat : legMat;
  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(s * 0.058, -0.04, 0);
    hips.add(leg);
    if (bottom === 'shorts') {
      // 바짓단: 접어 올린 커프스 + 안쪽으로 파인 밑단
      const cuffMat = clothMat(clothTexture('cuff', bottomCol, { stitches: [0.6], ao: [[0, 0.85], [0.5, 1], [0.62, 1.12], [0.9, 1.08], [1, 0.6]] }),
        clothBump('cuff', [0.6]));
      // 굵은 허벅지를 감싸는 짧은 통: 골반 폭에서 곧게 내려와 무릎 위에서 끝난다 (넓게 벌어지는 나팔 모양이 아님)
      mesh(lathe([[0.0505, 0.035], [0.0515, 0], [0.0525, -0.04], [0.0532, -0.056], [0.0535, -0.062], [0.05, -0.0625], [0.0485, -0.052]], 32),
        cuffMat, leg, '바짓단');
      // 바짓단 윗단을 메우는 구: 다리를 크게 들거나 쪼그리면 통 모양 바짓단이 허리 밖으로 돌아 나와 속이 비어 보인다
      mesh(ellipsoid(0.051, 0.051, 0.051, 20), cuffMat, leg, '바지엉덩이').position.y = 0.006;
    }
    const knee = new THREE.Group();
    knee.position.y = -THIGH;
    leg.add(knee);
    if (pantsMat) {
      // 긴바지: 허벅지에서 발목까지 한 통. 무릎에서 조각을 잇지 않고 통째로 휘어, 굽혀도 꺾인 자국이 없다
      limb([[0.05, 0.035], [0.05, 0], [0.049, -0.05], [0.048, -0.1], [0.047, -0.14], [0.046, -0.172], [0.046, -0.194], [0.042, -0.195], [0.041, -0.188]],
        32, pantsMat, leg, knee, '바지통', 0.04);
      // 엉덩이 관절은 같은 굵기의 구로 메운다: 쪼그려 앉아 허벅지가 크게 돌면 바지통 윗단이 허리 밖으로 나와 속이 뚫려 보인다
      mesh(ellipsoid(0.05, 0.05, 0.05, 20), pantsMat, leg, '바지엉덩이');
    } else {
      // 다리는 짧고 통통하게: 허벅지는 골반 폭을 그대로 받아 굵게 시작해 발목으로 갈수록 가늘어진다 → 몸통 옆선이
      // 다리 바깥선으로 곧장 이어지고, 두 다리 안쪽은 가랑이에서 ∧ 모양으로 갈라진다.
      // 허벅지~종아리는 한 통이라 무릎을 굽히면 통째로 부드럽게 휜다 (조각을 구로 이어 붙이면 굽힐 때 마디가 보인다)
      limb([[0.045, 0.01], [0.0455, -0.03], [0.044, -0.075], [0.042, -0.1], [0.0415, -0.12], [0.039, -0.16], [0.037, -0.19], [0.036, -0.2]],
        24, bareLeg, leg, knee, '다리', 0.04);
      mesh(ellipsoid(0.045, 0.045, 0.045, 16), bareLeg, leg, '다리뿌리');
    }
    const foot = new THREE.Group();
    foot.position.y = -(LEG - THIGH);
    knee.add(foot);
    // 발목: 발을 꺾어도 종아리(바짓부리)와 신발 사이가 비지 않게
    mesh(ellipsoid(0.035, 0.035, 0.035, 16), pantsMat ? pantsMat : shinMat, foot, '발목');
    P[`hip${SIDE[s]}`] = leg;
    P[`knee${SIDE[s]}`] = knee;
    P[`foot${SIDE[s]}`] = foot;
    buildShoe(foot, o, bottom === 'pants');
  }

  // 몸통 (허리 기준)
  const torso = new THREE.Group();
  hips.add(torso);
  P.spine = torso;
  const top = o.top;
  const accent = o.accent ?? style.accent ?? '#ffffff';
  const shirtStitch = outfit === 'tee' ? [0.9] : [];
  const shirtMat = style.bare ? skinMat(flatSkin(o.skin)) /* 팔·어깨와 같은 살색: 조각마다 명암이 다르면 어깨가 얼룩져 보인다 */ : clothMat(
    clothTexture(`shirt${shirtStitch.length}`, top, { stitches: shirtStitch, ao: [[0, 0.62], [0.08, 0.95], [0.16, 1], [0.86, 1], [0.95, 0.9], [1, 0.7]] }),
    clothBump(`shirt${shirtStitch.length}`, shirtStitch),
  );
  // 물방울 상의 (세로 90%): 목 굵기에서 둥글게 벌어져 아래로 퍼짐, 목둘레·밑단은 안쪽으로 접힌 두께
  // 맨몸은 목까지 한 조각으로 잇는다: 목과 몸통을 따로 만들면 만나는 자리에 외곽선이 한 줄 그어진다
  const bodyProf = style.bare
    // 목에서 어깨로 넘어가는 곳은 외곽선 두께(1.2cm)보다 크게 둥글린다: 좁게 꺾이면 외곽선 껍질이 접혀 목에 줄이 생긴다
    ? [...[...NECK.slice(0, 3), [0.0395, 0.222], [0.041, 0.213], [0.045, 0.2055], [0.051, 0.1995], [0.06, 0.1962]].map(([r, y]) => [r, y / TY]), ...BODY.slice(3)]
    : SHIRT;
  // 목은 둥글고 몸통은 앞뒤로 납작하다: 목에서 가슴까지 납작한 정도가 부드럽게 바뀐다 (sideDepth)
  const bodyZs = style.bare ? 1 : 0.78;
  const shirtMesh = mesh(fitTorso(lathe(ty(bodyProf), 56, bodyZs), bodyZs), shirtMat, torso, '상의');
  // 어깨 관절 둘레의 바깥쪽(어깨 끝·옆구리)은 몸통 외곽선을 긋지 않는다: 팔을 들거나 몸을 틀면 몸통 어깨 끝 옆선이
  // 소매 위로 비쳐 어깨와 몸통 사이에 세로 줄이 그어지고, 팔이 따로 끼운 것처럼 끊겨 보인다.
  // 목에서 관절까지의 어깨 윗선은 남긴다 (차렷 자세의 어깨 윤곽. 관절 바깥쪽 윤곽은 소매 마감이 그린다).
  // (아직 몸을 줄이기 전(slimBody) 좌표라 관절의 가로 자리는 BODY_K로 나눠 둔다)
  const jx = SHOULDER.x / BODY_K;
  // 아래로는 차렷 자세에서 소매가 덮는 높이(관절 아래 약 8cm)까지
  const armSeam = (x, y, z) => smooth(0.085, 0.055, Math.hypot(Math.abs(x) - jx, y - SHOULDER.y, z)) * smooth(jx - 0.012, jx + 0.004, Math.abs(x));
  // 이음새는 팔을 내리고 있을 때만 지운다: 팔을 들면 소매가 덮던 옆구리가 드러나므로 외곽선을 되살린다 (toon.js armSeam, followShoulders 의 seamHide)
  // 오른쪽(x<0)은 음수, 왼쪽은 양수로 담아 팔마다 따로 정한다
  fadeLine(shirtMesh, style.bare ? (x, y) => smooth(HEAD_Y - 0.186, HEAD_Y - 0.174, y) : () => 0); // 맨몸 목 윗끝은 머리 속에서 외곽선 없이
  const sp = shirtMesh.geometry.attributes.position;
  const seam = new Float32Array(sp.count);
  for (let i = 0; i < sp.count; i++) seam[i] = Math.sign(sp.getX(i)) * armSeam(sp.getX(i), sp.getY(i), sp.getZ(i));
  shirtMesh.geometry.setAttribute('armSeam', new THREE.Float32BufferAttribute(seam, 1));
  P.seamHide = shirtMesh.userData.seamHide = new THREE.Vector2(1, 1);
  P.colliders = bodyColliders(o, hips, torso);
  const ribMat = (key, color) => clothMat(clothTexture(key, color, { ao: [[0, 0.9], [0.5, 1], [1, 0.9]] }), clothBump(key), { bumpScale: 1.6 });
  const trim = ribMat('trim', shade(top, 0.9));

  // 넥라인: 목을 감싸는 두툼한 시보리 고리 → 피부색 목과 옷의 경계가 또렷하다
  if (style.bare) {
    // 맨몸에는 넥라인 없음
  } else if (outfit === 'track') {
    // 트랙 재킷은 세운 깃
    mesh(lathe(ty([[0.05, 0.2], [0.057, 0.224], [0.0575, 0.244], [0.054, 0.248], [0.0505, 0.243], [0.05, 0.222]]), 56, 0.88), trim, torso, '세운깃');
  } else {
    const tube = outfit === 'hoodie' ? 0.0125 : 0.0085;
    const rib = mesh(new THREE.TorusGeometry(0.0405 + tube, tube, 14, 56).rotateX(PI / 2).scale(1, 1, 0.88),
      outfit === 'layered' ? ribMat('trimIn', accent) : trim, torso, '넥시보리');
    rib.position.y = NECK_Y + tube * 0.25;
  }

  if (outfit === 'tee') {
    // 카라 (둥근 피터팬 칼라): 앞쪽 좌우 두 장, 어깨 곡선을 따라 내려옴
    if (o.collar) {
      const cm = clothMat(clothTexture('peter', o.collar, { stitches: [0.75], ao: [[0, 0.85], [0.3, 1], [1, 0.95]] }), clothBump('peter', [0.75]));
      cm.side = THREE.DoubleSide;
      const prof = ty([[0.053, 0.228], [0.063, 0.2275], [0.073, 0.2245], [0.081, 0.218], [0.087, 0.208], [0.09, 0.196]])
        .map(([r, y]) => new THREE.Vector2(r, y)).reverse();
      for (const [start, len] of [[0.05, PI * 0.5], [PI * 1.45, PI * 0.5]]) {
        const g = fitTorso(new THREE.LatheGeometry(prof, 24, start, len).scale(1, 1, 0.8), 0.8);
        const flap = mesh(g, cm, torso, '카라');
        flap.position.y = 0.002;
      }
    } else {
      // 가슴 주머니 (카라가 있는 옷에는 생략)
      const pocket = mesh(new RoundedBoxGeometry(0.046, 0.05, 0.007, 2, 0.004),
        clothMat(pocketTexture(top), clothBump('pocket')), torso, '주머니');
      const px = 0.05;
      pocket.position.set(px, 0.14 * TY, shirtZ(0.14, px) + 0.001);
      pocket.rotation.set(-0.06, Math.atan2(px, 0.09), 0);
    }
    // 허리에 묶은 체크무늬 셔츠: 매듭은 절반 크기, 소매는 아래로 자연스럽게 늘어뜨림
    if (o.plaid) {
      const pm = clothMat(plaidTexture(...o.plaid), clothBump('plaid'), { bumpScale: 1.5 });
      mesh(lathe([[0.116, 0.03], [0.1195, 0.01], [0.1215, -0.015], [0.117, -0.025]], 56, 0.8), pm, torso, '묶은셔츠');
      const zf = 0.1215 * 0.8;
      const knot = mesh(ellipsoid(0.019, 0.014, 0.013), pm, torso, '매듭');
      knot.position.set(0, 0.004, zf + 0.008);
      for (const s of [-1, 1]) {
        const sl = mesh(lathe([[0.016, 0], [0.019, -0.04], [0.022, -0.09], [0.023, -0.11], [0, -0.115]], 20), pm, torso, '셔츠소매');
        sl.position.set(s * 0.01, 0.0, zf + 0.004);
        sl.rotation.set(0.14, 0, s * 0.16);
      }
      const back = mesh(new THREE.LatheGeometry(
        [[0.117, 0], [0.126, -0.05], [0.132, -0.095], [0.128, -0.105]].map(([r, y]) => new THREE.Vector2(r, y)), 24, PI * 0.6, PI * 0.8,
      ).scale(1, 1, 0.82), pm, torso, '셔츠자락');
      back.material = pm.clone();
      back.material.side = THREE.DoubleSide;
    }
  }
  // 밑단 시보리 (후드·재킷)
  if (outfit === 'hoodie' || outfit === 'track') {
    mesh(fitTorso(lathe(ty([[0.1105, -0.01], [0.113, -0.014], [0.1138, -0.031], [0.1095, -0.034], [0.103, -0.02]]), 56, 0.78)), trim, torso, '밑단시보리');
  }
  if (outfit === 'street') {
    // 가슴 왼쪽의 작은 가로 바 패치
    sector(shirtProf(0.169, 0.157, 0.002, 2), 0.52, 0.16, 0.78, flatMat(accent), torso, '바패치');
  } else if (outfit === 'hoodie') {
    // 목 뒤로 넘긴 후드 뭉치
    const hood = mesh(ellipsoid(0.078, 0.034, 0.044), shirtMat, torso, '후드');
    hood.position.set(0, NECK_Y - 0.002, -0.05);
    hood.rotation.x = 0.3;
    // 앞가슴으로 내려오는 후드 끈 두 줄 (끝은 매듭)
    const cord = new THREE.MeshStandardMaterial({ color: '#fffaf2', roughness: 0.7 });
    for (const s of [-1, 1]) {
      const a = V(s * 0.02, 0.212 * TY, shirtZ(0.212, 0.02) + 0.004);
      const b = V(s * 0.025, 0.16 * TY, shirtZ(0.16, 0.025) + 0.0045);
      rod(a, b, 0.0034, cord, torso, '후드끈');
      mesh(ellipsoid(0.005, 0.007, 0.005, 12), cord, torso, '끈매듭').position.copy(b);
    }
    // 가슴 한가운데 박스 로고 + 배 앞 캥거루 주머니
    sector(shirtProf(0.15, 0.108, 0.002), 0, 0.5, 0.78, flatMat(null, logoTexture('CLASS', accent, '#ffffff', { w: 320, h: 128 })), torso, '박스로고');
    sector(shirtProf(0.07, 0.0, 0.0025), 0, 0.72, 0.78, flatMat(shade(top, 0.92)), torso, '앞주머니');
  } else if (outfit === 'track') {
    // 앞지퍼 줄 + 지퍼 손잡이
    sector(shirtProf(0.216, -0.03, 0.002, 14), 0, 0.032, 0.78, flatMat(accent), torso, '지퍼');
    const pull = mesh(new RoundedBoxGeometry(0.008, 0.016, 0.005, 2, 0.002), new THREE.MeshStandardMaterial({ color: '#d9d9de', roughness: 0.3, metalness: 0.6 }), torso, '지퍼손잡이');
    pull.position.set(0, 0.2 * TY, shirtZ(0.2, 0) + 0.004);
    // 가슴 왼쪽 작은 배색 패치
    sector(shirtProf(0.17, 0.15, 0.002, 3), 0.5, 0.12, 0.78, flatMat(accent), torso, '가슴패치');
  } else if (outfit === 'layered') {
    // 반팔 밑단 아래로 비치는 이너 자락
    mesh(fitTorso(lathe(ty([[0.1095, -0.024], [0.1125, -0.04], [0.1125, -0.048], [0.1065, -0.05], [0.101, -0.04]]), 56, 0.78)), ribMat('trimIn', accent), torso, '이너자락');
  }

  // 목: 턱 아래로 또렷이 보이는 피부색 기둥. 위쪽은 머리 안으로 넓게 퍼지며 스며듦 (맨몸은 몸통과 한 조각이라 따로 만들지 않는다)
  if (!style.bare) {
    const neckMat = skinMat(flatSkin(o.skin));
    // 머리 속으로 들어가는 위쪽 끝은 외곽선 없이 (턱 밑에 고리가 그어지지 않게)
    fadeLine(mesh(lathe([...NECK, [0.041, NECK_Y - 0.03]], 32), neckMat, torso, '목'), (x, y) => smooth(HEAD_Y - 0.186, HEAD_Y - 0.174, y));
  }

  // 머리 (목 위)
  const head = new THREE.Group();
  head.position.y = HEAD_Y;
  torso.add(head);
  P.head = head;
  const hat = HATS[o.hat] ? o.hat : null;
  buildHead(head, o, live);
  buildHair(head, o, detail, hat);
  if (hat) buildHat(head, o, hat);
  else if (o.crown) buildFlowerCrown(head);
  if (o.glasses) buildGlasses(head);
  if (o.backpack) buildBackpack(torso, o.bagColor ?? '#f0a848');
  P.eyes = head.getObjectByName('눈');
  P.colliders.push({ joint: head, ell: HEAD_COLLIDER });
  // 도구는 목·어깨 위쪽도 지나가면 안 된다 (팔은 거기 붙어 있으므로 팔 검사에는 넣지 않는다)
  P.toolColliders = [...P.colliders, {
    joint: torso, zs: 0.78,
    prof: [[0.05, HEAD_Y - 0.17], [0.05, NECK_Y], ...slimProf(inset(ty(SHIRT_FIT.slice(1, 9)), 0.006))],
  }];

  // 팔: 어깨 → 팔꿈치 → 손
  const sleeveMat = clothMat(
    clothTexture('sleeve', top, { stitches: outfit === 'tee' ? [0.74] : [], ao: [[0, 0.92], [0.15, 1], [0.8, 1], [0.9, 0.95], [1, 0.62]] }),
    clothBump('sleeve', [0.78]),
  );
  const plainMat = clothMat(clothTexture('plain', top), clothBump('plain'));
  const innerMat = style.inner ? clothMat(clothTexture('plain', accent), clothBump('plain')) : plainMat;
  const handMat = skinMat(flatSkin(o.skin));
  const armMat = handMat;
  const long = style.sleeve === 'long' || style.inner; // 손목까지 덮는가
  const rE = style.inner ? 0.025 : 0.0268; // 긴소매의 팔꿈치 굵기 (이너는 겉 반팔 속으로 들어가게 더 가늘다)
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(s * SHOULDER.x, SHOULDER.y, 0);
    torso.add(arm);
    const elbow = new THREE.Group();
    elbow.position.y = -0.09;
    arm.add(elbow);
    // 소매: 팔과 같은 축·같은 기울기의 곧은 원뿔대. 어깨 위로 솟는 둥근 캡 없이 납작한 윗면은 몸통 곡면 속에 묻히고,
    // 어깨에서 소매 끝까지 일직선으로 떨어진다 (팔 관절에 붙어 있어 팔을 어떻게 움직여도 기울기가 같다)
    if (style.sleeve === 'short') {
      const len = outfit === 'tee' ? 0.074 : 0.084; // 오버핏은 팔꿈치 바로 위까지
      const r = CAP_R + 0.05 * len;
      fadeLine(mesh(lathe([...SHOULDER_CAP, [r, -len], [r - 0.003, -len - 0.0008], [r - 0.0045, -len + 0.007]], 48),
        sleeveMat, arm, '소매'), capLine(s));
    }
    if (long) {
      // 긴소매: 어깨에서 손목까지 한 통 (팔꿈치에서 통째로 휜다)
      const up = style.inner ? [[0.0215, -0.03], [rE, -0.09]] : [...SHOULDER_CAP, [rE, -0.09]];
      fadeLine(limb([...up, [rE + 0.0008, -0.13], [rE + 0.0008, -0.156], [rE - 0.0004, -0.1655], [0.0242, -0.165], [0.0236, -0.158]], 48, innerMat, arm, elbow, '긴소매'), capLine(s));
      if (!style.inner) {
        // 소맷부리 시보리
        mesh(lathe([[rE, -0.058], [rE + 0.0024, -0.062], [rE + 0.0024, -0.0765], [0.0242, -0.0775]], 48), trim, elbow, '소맷부리');
      }
      if (outfit === 'track') {
        // 소매 바깥쪽을 따라 내려오는 배색 줄 (팔꿈치 둘레는 비워 둔다: 휘는 소매 위에서 뜨지 않게)
        const stripe = flatMat(accent);
        sector([[rE + 0.0008, -0.062], [0.0248, -0.002]], (s * PI) / 2, 0.42, 1, stripe, arm, '소매줄');
        sector([[rE + 0.002, -0.058], [rE + 0.0018, -0.03]], (s * PI) / 2, 0.42, 1, stripe, elbow, '소매줄');
      }
    } else {
      // 윗팔~아래팔 한 통: 팔꿈치에서 통째로 휘고, 손목에서 손과 같은 굵기로 끝난다
      // 어깨 쪽(몸통 속)과 손목 쪽(손 속) 끝은 외곽선 없이 이어진다
      fadeLine(limb([[0.0205, -0.034], [0.021, -0.06], [0.0215, -0.09], [0.0218, -0.11], [0.0225, -0.135], [0.0232, -0.155], [0.0238, -0.168]], 24, handMat, arm, elbow, '팔'),
        (x, y) => Math.max(smooth(-0.05, -0.036, y), smooth(-0.15, -0.165, y)));
      // 맨몸: 소매 대신 같은 둥근 어깨를 피부로 (몸통과 맞닿는 안쪽은 외곽선 없이)
      if (style.bare) fadeLine(mesh(lathe([...SHOULDER_CAP, [0.0222, -0.05]], 48), handMat, arm, '어깨'), capLine(s));
    }
    const hand = new THREE.Group();
    hand.position.y = -0.078;
    elbow.add(hand);
    fadeLine(mesh(mittenGeometry(), handMat, hand, '손'), (x, y) => smooth(-0.012, 0.002, y)); // 손목 쪽 끝은 외곽선 없이
    // 손목: 도구를 쥐느라 손을 크게 꺾어도 아래팔과 손 사이가 벌어지지 않게
    mesh(ellipsoid(0.024, 0.024, 0.024, 16), handMat, hand, '손목').userData.noOutline = true; // 팔과 손 사이를 메우는 속 조각
    // 도구 소켓: 주먹 한가운데 (equipment.js 가 여기에 도구를 붙인다)
    hand.name = s < 0 ? 'RightHand' : 'LeftHand';
    const socket = new THREE.Group();
    socket.name = s < 0 ? 'rightSocket' : 'leftSocket';
    socket.position.set(0, -0.05, 0.004);
    hand.add(socket);
    P[s < 0 ? 'rightSocket' : 'leftSocket'] = socket;
    anchorShoulder(arm, torso);
    P[`shoulder${SIDE[s]}`] = arm;
    P[`elbow${SIDE[s]}`] = elbow;
    P[`hand${SIDE[s]}`] = hand;
  }
  if (bottom !== 'skirt') tuckFront(hips, torso, 0.058, bottom === 'bare' ? 0.045 : 0.051);
  slimBody(hips, torso, P);
  bendWaist(root, hips, torso);
  bindLimbs(root);
  for (const j of Object.values(P)) if (j.isObject3D) j.userData.rest = j.position.clone(); // colliders(배열)는 관절이 아님
  return P;
}

// ───────────── 몸통·다리 가늘게 ─────────────
// 다 만든 몸통·바지·다리 조각을 가로·앞뒤로 줄인다. 목둘레 위(목·넥라인)는 목 굵기 그대로 두고 그 아래로 서서히 줄여
// 목에서 어깨로 이어지는 선이 끊기지 않는다. 신발과 팔·머리는 건드리지 않는다.
function bakeScale(c, k) {
  c.updateMatrix();
  const g = c.geometry.applyMatrix4(c.matrix); // 놓인 자리·기울기를 정점에 넣고 부모 기준으로 줄인다
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const f = k(p.getY(i));
    p.setX(i, p.getX(i) * f);
    p.setZ(i, p.getZ(i) * f);
  }
  g.computeVertexNormals();
  g.computeBoundingSphere();
  c.position.set(0, 0, 0);
  c.rotation.set(0, 0, 0);
  c.scale.set(1, 1, 1);
}
// 아랫배 → 다리: 몸통·허리는 앞뒤로 다리보다 훨씬 두꺼워, 옆에서 보면 허리 밑에서 다리로 넘어갈 때 앞쪽이 턱처럼 튀어나온다.
// 배 아래부터 앞면(z>0)만 점점 눌러 허리 밑단에서는 다리 앞선과 같은 두께가 되게 한다 → 배에서 허벅지 앞으로 한 줄로 흘러내린다.
// 상의·밑단 띠·바지 허리를 같은 높이에서 같은 비율로 누르므로 겹친 순서(상의가 바지 허리를 덮음)는 그대로다.
// 치마는 A라인으로 퍼지는 모양이라 누르지 않는다 (상의만 누르면 치마 허리가 상의 밑단을 뚫고 나온다)
const TUCK_HI = 0.05; // 여기 위는 그대로
const TUCK_LO = -0.065; // 여기 아래는 다리 앞선 두께까지 눌린다
const TUCK_K = 0.58; // 맨 아래에서 앞쪽 두께 비율 (허리 앞 0.08 → 다리 앞 0.045 쯤)
// legR: 다리 뿌리(엉덩이 관절 구) 반지름. 눌린 앞면이 그보다 안으로 들어가면 다리 뿌리가 옷을 뚫고 비쳐 나오므로 그 앞선에서 멈춘다
function tuckFront(hips, torso, legX, legR) {
  const v = new THREE.Vector3();
  // 같은 (x, y) 자리의 모든 층(맨살·상의·바지 허리)을 같은 비율로 눌러야 겹친 순서가 그대로 남는다.
  // 그래서 "허리 앞면이 다리 앞선에서 멈추는" 비율을 허리 단면(반지름 0.1045, 앞뒤 0.8배) 기준으로 구해 아래 한계로 쓴다
  const minK = (x) => {
    const d = Math.abs(x) - legX;
    if (d * d >= legR * legR) return 0;
    const waist = 0.8 * Math.sqrt(Math.max(1e-6, 0.1045 * 0.1045 - x * x));
    return Math.min(1, (Math.sqrt(legR * legR - d * d) + 0.004) / waist);
  };
  for (const c of [...hips.children, ...torso.children]) {
    if (!c.isMesh) continue;
    c.updateMatrix();
    const inv = c.matrix.clone().invert();
    const p = c.geometry.attributes.position;
    let changed = false;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(c.matrix); // 몸통 기준 위치로 바꿔 높이를 잰다
      if (v.z <= 0 || v.y >= TUCK_HI) continue;
      v.z *= Math.max(1 - (1 - TUCK_K) * smooth(TUCK_HI, TUCK_LO, v.y), minK(v.x));
      v.applyMatrix4(inv);
      p.setXYZ(i, v.x, v.y, v.z);
      changed = true;
    }
    if (changed) {
      p.needsUpdate = true;
      c.geometry.computeVertexNormals();
    }
  }
}
function slimBody(hips, torso, P) {
  const kTorso = (y) => BODY_K + (1 - BODY_K) * smooth(NECK_Y - 0.025, NECK_Y, y);
  for (const c of torso.children) {
    if (c.isMesh) bakeScale(c, kTorso);
    else if (c.name === '가방') c.position.z += 0.076 * (1 - BODY_K); // 얇아진 등판에 붙도록
  }
  for (const c of hips.children) if (c.isMesh) bakeScale(c, () => BODY_K);
  for (const s of ['R', 'L']) {
    const leg = P[`hip${s}`];
    leg.position.x *= BODY_K; // 골반 폭을 따라 다리 사이도 좁힌다
    const foot = P[`foot${s}`];
    leg.traverse((c) => {
      if (!c.isMesh) return;
      for (let a = c.parent; a && a !== leg; a = a.parent) if (a === foot) return; // 신발은 그대로
      bakeScale(c, () => LEG_K);
    });
  }
}

// ───────────── 팔다리 휘기 ─────────────
// 관절을 지나는 팔·다리를 한 통으로 만들고, 관절 위쪽은 윗마디·아래쪽은 아랫마디를 따르도록 그 둘레에서 섞는다.
// points: 윗마디(joint) 기준 [반지름, 높이] 위→아래, child: 아랫마디 관절, blend: 섞는 구간의 절반 길이
const pendingSkins = [];
function limb(points, segs, mat, joint, child, name, blend = 0.03) {
  // 휘려면 관절 둘레에 정점이 촘촘해야 한다: 긴 구간을 잘게 나눈다
  const dense = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const [r0, y0] = points[i - 1];
    const [r1, y1] = points[i];
    const n = Math.max(1, Math.ceil(Math.abs(y1 - y0) / 0.008));
    for (let k = 1; k <= n; k++) dense.push([r0 + ((r1 - r0) * k) / n, y0 + ((y1 - y0) * k) / n]);
  }
  const g = lathe(dense, segs);
  const pos = g.attributes.position;
  const idx = new Uint16Array(pos.count * 4);
  const wt = new Float32Array(pos.count * 4);
  const yJ = child.position.y;
  for (let i = 0; i < pos.count; i++) {
    const k = smooth(yJ + blend, yJ - blend, pos.getY(i));
    idx[i * 4 + 1] = 1;
    wt[i * 4] = 1 - k;
    wt[i * 4 + 1] = k;
  }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wt, 4));
  const m = new THREE.SkinnedMesh(g, mat);
  m.name = name;
  m.castShadow = true;
  m.receiveShadow = true;
  joint.add(m);
  pendingSkins.push([m, [joint, child]]);
  return m;
}
// ───────────── 어깨 잇기 ─────────────
// 소매·어깨 윗부분의 둥근 마감은 어깨 관절을 감싼 반구라, 팔과 통째로 돌면 팔을 가슴 앞으로 크게 돌릴 때
// 그 둥근 면이 몸통 밖(등 쪽)으로 공처럼 드러난다. 관절 위쪽은 몸통을 따르고 아래로 내려갈수록 팔을 따르도록 섞어
// 둥근 마감은 늘 몸통 속에 머물고 소매가 몸통에서 팔로 부드럽게 늘어나며 이어지게 한다.
const ANCHOR_LO = -0.03; // 여기 아래(팔 관절 기준)는 팔 그대로
const ANCHOR_HI = 0.02; // 여기 위는 몸통 그대로
// 어깨 뼈 두 개: 자리는 팔 관절에 두고, 팔을 들어 수평(앞·가슴 쪽)에 가까워질수록 '몸 옆 방향'으로 납작하게 누른다.
// 관절이 몸통 옆 끝에 있어 팔을 앞으로 뻗으면 관절을 감싼 둥근 마감과 소매 통이 몸통 옆으로 1.5cm쯤 비어져 나와
// 공처럼 튀어나와 보인다. 누르는 방향은 팔이 뻗은 방향과 수직으로 잡아, 팔을 옆으로 벌릴 때 팔 길이가 줄지 않게 한다.
//  - 마감 뼈(spin 0): 팔과 함께 돌지 않고 몸통을 따른다 (관절 위 둥근 마감)
//  - 소매 뼈(spin 1): 팔과 함께 돈다 (어깨 쪽 소매 통·윗팔)
const CAP_SQUASH = 0.55; // 팔이 앞으로 수평일 때 옆으로 줄이는 몫
const ARM_DOWN = new THREE.Vector3();
const SQ_AXIS = new THREE.Vector3();
const SQ_M = new THREE.Matrix4();
const SQ_Q = new THREE.Quaternion();
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const CAP_TILT = 2.2; // 마감이 따라 기우는 최대 각 (만세처럼 머리 위로 든 팔까지)
function shoulderBone(arm, torso, spin, name) {
  const b = new THREE.Object3D();
  // 마감 뼈는 팔이 옆으로 벌어진 만큼(평소 A자 각도까지만) 같이 기운다: 꼿꼿이 서 있으면 마감 옆면이 수직으로 떨어지다
  // 아래 소매에서 바깥으로 다시 꺾여 어깨선이 울퉁불퉁해진다. 앞으로 뻗는 팔은 따라가지 않아 등 쪽으로 튀어나오지 않는다
  const side = Math.sign(arm.position.x);
  const REST_SQ = new THREE.Quaternion();
  b.name = name;
  b.updateMatrix = function updateShoulderBone() {
    ARM_DOWN.set(0, -1, 0).applyQuaternion(arm.quaternion);
    // 팔이 수평에 가까울수록, 그리고 옆이 아니라 앞·가슴 쪽을 향할수록 많이 누른다
    const lift = Math.min(1, Math.max(0, 1 + ARM_DOWN.y));
    const k = CAP_SQUASH * lift * lift * (3 - 2 * lift) * (1 - ARM_DOWN.x * ARM_DOWN.x);
    // 누르는 축: 몸 옆(x)에서 팔 방향 성분을 뺀 방향
    SQ_AXIS.set(1, 0, 0).addScaledVector(ARM_DOWN, -ARM_DOWN.x);
    const n2 = SQ_AXIS.lengthSq();
    // 정면에서 본 팔의 벌림 각 (앞뒤로 뻗을수록 정면 성분이 줄어 덜 기운다)
    const fan = Math.atan2(side * ARM_DOWN.x, -ARM_DOWN.y) * Math.hypot(ARM_DOWN.x, ARM_DOWN.y);
    REST_SQ.setFromAxisAngle(Z_AXIS, side * Math.max(0, Math.min(CAP_TILT, fan)));
    SQ_Q.slerpQuaternions(REST_SQ, arm.quaternion, spin);
    this.matrix.makeRotationFromQuaternion(SQ_Q);
    if (n2 > 1e-6 && k > 1e-4) {
      SQ_AXIS.divideScalar(Math.sqrt(n2));
      const { x, y, z } = SQ_AXIS;
      // 축 방향으로만 (1 - k)배: I - k·n·nᵀ
      SQ_M.set(1 - k * x * x, -k * x * y, -k * x * z, 0, -k * y * x, 1 - k * y * y, -k * y * z, 0, -k * z * x, -k * z * y, 1 - k * z * z, 0, 0, 0, 0, 1);
      this.matrix.premultiply(SQ_M);
    }
    this.matrix.setPosition(arm.position);
    this.matrixWorldNeedsUpdate = true;
  };
  torso.add(b);
  return b;
}
// 팔을 앞(가슴 쪽)으로 뻗을수록 어깨 관절을 안쪽으로 옮긴다 (사람도 팔을 앞으로 뻗으면 어깨가 몸 앞쪽으로 모인다).
// (앞뒤 자리는 동작이 정하는 값(shoulder.pz)이 있어 건드리지 않는다)
// 관절이 몸통 옆 끝에 그대로 있으면 앞으로 뻗은 팔이 몸통 옆에서 튀어나와, 뒤에서 볼 때 어깨에 공이 붙은 것처럼 보인다.
// 두 손으로 쥐는 동작은 팔 각도가 IK로 정해지므로 바로 앞 장의 팔 방향(rig.armDir)으로 정하고, 부드럽게 따라가게 한다
const SHOULDER_IN = 0.024; // 안쪽으로 옮기는 최대 거리
// amount: 동작이 정하는 배율 (fx.shoulderIn, 기본 1). 팔을 머리 위로 드는 동작은 0 으로 해 어깨가 몸통 속으로 들어가 보이지 않게
function followShoulders(rig, dt, amount = 1) {
  const a = 1 - Math.exp(-14 * dt);
  for (const s of ['R', 'L']) {
    const arm = rig[`shoulder${s}`];
    const rest = arm.userData.rest;
    if (!rest) continue;
    const d = rig.armDir?.[s] ?? new THREE.Vector3(0, -1, 0).applyQuaternion(arm.quaternion);
    const lift = Math.min(1, Math.max(0, 1 + d.y)); // 0: 내림 → 1: 수평 이상
    const fwd = Math.min(1, Math.max(0, d.z * 1.2)); // 앞을 향한 정도
    if (rig.seamHide) rig.seamHide[s === 'R' ? 'x' : 'y'] = 1 - smooth(0.3, 0.65, lift); // 팔을 들수록 어깨 이음새 외곽선을 되살린다
    const k = lift * lift * (3 - 2 * lift) * fwd * amount;
    const st = (rig.shoulderShift ??= { R: 0, L: 0 });
    st[s] += (k - st[s]) * a;
    const side = s === 'R' ? -1 : 1;
    arm.position.x = rest.x - side * SHOULDER_IN * st[s];
  }
}
const SLEEVE_LO = -0.09; // 여기 아래(팔 관절 기준)는 소매 뼈의 영향을 받지 않는다
const SLEEVE_HI = -0.035; // 여기 위는 소매 뼈를 그대로 따른다
function anchorShoulder(arm, torso) {
  const cap = shoulderBone(arm, torso, 0, '어깨마감');
  const sleeve = shoulderBone(arm, torso, 1, '어깨소매');
  for (const c of [...arm.children]) {
    if (!c.isMesh) continue;
    const g = c.geometry;
    const pos = g.attributes.position;
    let top = -Infinity;
    for (let i = 0; i < pos.count; i++) top = Math.max(top, pos.getY(i));
    if (top < SLEEVE_LO) continue; // 어깨에 닿지 않는 조각
    const capW = (i) => smooth(ANCHOR_LO, ANCHOR_HI, pos.getY(i));
    const sleeveW = (i) => (1 - capW(i)) * smooth(SLEEVE_LO, SLEEVE_HI, pos.getY(i));
    const pending = pendingSkins.find(([m]) => m === c);
    if (pending) {
      // 이미 팔꿈치에서 휘는 팔·긴소매: 세 번째·네 번째 뼈로 마감 뼈·소매 뼈를 더한다
      const idx = g.attributes.skinIndex;
      const wt = g.attributes.skinWeight;
      for (let i = 0; i < pos.count; i++) {
        const a = capW(i);
        const b = sleeveW(i);
        const rest = 1 - a - b;
        wt.setXYZW(i, wt.getX(i) * rest, wt.getY(i) * rest, a, b);
        idx.setXYZW(i, 0, 1, 2, 3);
      }
      pending[1].push(cap, sleeve);
      continue;
    }
    const idx = new Uint16Array(pos.count * 4);
    const wt = new Float32Array(pos.count * 4);
    for (let i = 0; i < pos.count; i++) {
      const a = capW(i);
      const b = sleeveW(i);
      idx[i * 4 + 1] = 1;
      idx[i * 4 + 2] = 2;
      wt[i * 4] = 1 - a - b;
      wt[i * 4 + 1] = a;
      wt[i * 4 + 2] = b;
    }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wt, 4));
    const m = new THREE.SkinnedMesh(g, c.material);
    m.name = c.name;
    m.castShadow = c.castShadow;
    m.receiveShadow = c.receiveShadow;
    Object.assign(m.userData, c.userData);
    m.position.copy(c.position);
    m.quaternion.copy(c.quaternion);
    m.scale.copy(c.scale);
    arm.remove(c);
    arm.add(m);
    pendingSkins.push([m, [arm, cap, sleeve]]);
  }
}

// 관절이 모두 제자리에 놓인 뒤(기본 자세) 한꺼번에 뼈에 묶는다
function bindLimbs(root) {
  root.updateWorldMatrix(true, true);
  for (const [m, bones] of pendingSkins.splice(0)) m.bind(new THREE.Skeleton(bones), m.matrixWorld);
}

// ───────────── 허리 휘기 ─────────────
// 몸통(상의와 거기 붙은 밑단 띠·지퍼·주머니 등)을 통째로 꺾지 않고, 밑단은 골반을 따르고 가슴 위는 상체를 따르도록
// 그 사이를 높이에 따라 섞는다 (뼈 두 개짜리 스키닝). 허리를 숙이거나 틀어도 배 쪽이 겹쳐 튀어나오거나 등 쪽이
// 벌어지지 않고 한 덩어리로 부드럽게 휜다.
const WAIST_LO = -0.035; // 여기 아래는 골반 그대로
const WAIST_HI = 0.135; // 여기 위는 상체 그대로 (어깨 관절보다 아래)
// 골반과 상체 사이에 "사이 뼈"를 여러 개 둔다: 각각 상체 회전의 1/6, 2/6, … 만큼만 돈다.
// 두 뼈만으로 섞으면 허리를 크게 틀 때(야구 스윙처럼 80도 넘게) 가운데 정점들이 두 회전의 평균 자리, 곧 안쪽으로 모여
// 허리가 비틀린 사탕 껍질처럼 홀쭉해진다. 사이 뼈가 적으면(가운데 하나) 굵기는 지켜도, 몸통 단면이 앞뒤로 납작해서
// 뼈와 뼈 사이 구간이 곧은 면으로 이어지고 구간 경계마다 옆선이 꺾여 각져 보인다.
// 뼈를 촘촘히 두면 한 구간에서 도는 각이 작아져 비틀림이 높이를 따라 고르게 퍼지고 옆선이 매끈하게 휜다
const WAIST_STEPS = 6; // 골반 → 상체 사이 구간 수
const REST_Q = new THREE.Quaternion();
function waistBone(hips, torso, f) {
  const b = new THREE.Object3D();
  b.name = '허리사이';
  b.updateMatrix = function updateWaistBone() {
    this.position.copy(torso.position);
    this.quaternion.slerpQuaternions(REST_Q, torso.quaternion, f);
    this.scale.set(1, 1, 1).lerp(torso.scale, f);
    THREE.Object3D.prototype.updateMatrix.call(this);
  };
  hips.add(b);
  return b;
}
function bendWaist(root, hips, torso) {
  const bones = [hips];
  for (let i = 1; i < WAIST_STEPS; i++) bones.push(waistBone(hips, torso, i / WAIST_STEPS));
  bones.push(torso);
  root.updateWorldMatrix(true, true);
  const skeleton = new THREE.Skeleton(bones);
  // 바지 허리·치마도 상의와 똑같이 휘게 한다: 골반에만 붙여 두면 허리를 틀거나 숙일 때 상의 밑단만 따라 돌아
  // 그 속의 바지 허리가 상의를 뚫고 나온다 (같은 뼈·같은 비율로 휘면 둘 사이 간격이 그대로 유지된다)
  for (const c of hips.children.filter((m) => m.isMesh && (m.name === '바지허리' || m.name === '치마'))) torso.add(c);
  for (const c of [...torso.children]) {
    if (!c.isMesh) continue;
    c.updateMatrix();
    const g = c.geometry.applyMatrix4(c.matrix); // 놓인 자리·기울기를 정점에 굽혀 넣고 몸통 기준으로 맞춘다
    g.computeBoundingBox();
    if (g.boundingBox.min.y >= WAIST_HI) { // 허리 위에만 있는 조각은 상체에 그대로 붙여 둔다
      g.applyMatrix4(c.matrix.clone().invert());
      continue;
    }
    const pos = g.attributes.position;
    const idx = new Uint16Array(pos.count * 4);
    const wt = new Float32Array(pos.count * 4);
    for (let i = 0; i < pos.count; i++) {
      // 0 골반 → … 사이 뼈들 … → 1 상체. 양 끝은 부드럽게 시작·마무리하고(smoothstep), 사이는 이웃한 두 뼈를 곧게 섞는다
      const k = smooth(WAIST_LO, WAIST_HI, pos.getY(i)) * WAIST_STEPS;
      const j = Math.min(WAIST_STEPS - 1, Math.floor(k));
      const w = k - j;
      idx[i * 4] = j;
      idx[i * 4 + 1] = j + 1;
      wt[i * 4] = 1 - w;
      wt[i * 4 + 1] = w;
    }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wt, 4));
    const m = new THREE.SkinnedMesh(g, c.material);
    m.name = c.name;
    m.castShadow = c.castShadow;
    m.receiveShadow = c.receiveShadow;
    Object.assign(m.userData, c.userData);
    torso.remove(c);
    torso.add(m);
    m.updateMatrixWorld(true);
    m.bind(skeleton, m.matrixWorld);
  }
}

// ───────────── 모자 ─────────────
// 모자 끝선: 이마 위(front)에서 뒤통수(back)로 내려간다. 포니테일은 묶은 자리 위에서 끝난다
function hatLine(o, hat, phi) {
  const H = HATS[hat];
  const back = o.hair === 'pony' ? 0.33 : H.back;
  return PI * (H.front + (back - H.front) * smooth(1.0, 2.4, Math.abs(phi)));
}

function buildHat(head, o, hat) {
  const g = new THREE.Group();
  g.name = '모자';
  head.add(g);
  const H = HATS[hat];
  const color = o.hatColor ?? '#2b2b33';
  const tm = (phi) => hatLine(o, hat, phi);
  if (hat === 'beanie') {
    const knit = clothMat(clothTexture('knit', color), clothBump('knit'), { bumpScale: 2.2 });
    const CUFF = PI * 0.125; // 접어 올린 단의 폭
    // 머리를 푹 덮는 돔 + 아래쪽 접어 올린 두툼한 단
    const fit = (phi, th) => H.fit(th) + 0.03 * smooth(tm(phi) - CUFF - 0.025, tm(phi) - CUFF, th);
    mesh(shellGrid(96, 44, tm, (phi, th, t) => surf(phi, th, fit(phi, th) - 0.035 * smooth(0.965, 1, t))), knit, g, '비니');
    // 접은 단 앞면의 글자
    const t0 = tm(0) - CUFF + 0.03;
    const t1 = tm(0) - 0.04;
    const text = mesh(shellGrid(24, 6, () => 1, (phi, _th, t) => { const th = t0 + (t1 - t0) * t; return surf(phi, th, fit(phi, th) + 0.004); }, { phiMin: -0.5, phiMax: 0.5 }),
      flatMat(null, logoTexture('VILLAGE', color, '#ffffff', { w: 512, h: 160 })), g, '모자글자');
    text.userData.noOutline = true;
    text.castShadow = false;
  } else {
    const twill = clothMat(clothTexture('twill', color), clothBump('twill'));
    mesh(shellGrid(96, 40, tm, (phi, th, t) => surf(phi, th, H.fit(th) - 0.03 * smooth(0.965, 1, t))), twill, g, '볼캡');
    // 챙: 이마 끝선에서 앞으로 뻗는 얇은 반달 판 (윗면으로 나갔다가 아랫면으로 돌아오는 닫힌 모양)
    const W = 0.98;
    mesh(shellGrid(56, 14, () => 1, (phi, _th, t) => {
      const u = t < 0.5 ? t * 2 : 2 - t * 2;
      const L = 0.115 * Math.max(0, Math.cos((phi / W) * (PI / 2))) ** 0.55;
      const p = surf(phi, tm(phi), H.fit(tm(phi)) - 0.005);
      const f = V(Math.sin(phi) * 0.5, 0, Math.cos(phi)).normalize();
      return p.addScaledVector(f, L * u).add(V(0, -0.028 * u * u - (t < 0.5 ? 0 : 0.007), 0));
    }, { phiMin: -W, phiMax: W }), twill, g, '챙');
    // 꼭대기 단추
    mesh(ellipsoid(0.012, 0.006, 0.012, 16), twill, g, '모자단추').position.copy(surf(0, 0.001, H.fit(0)));
    // 앞면 사각 패치 로고
    const t0 = PI * 0.2;
    const t1 = PI * 0.325;
    const patch = mesh(shellGrid(20, 8, () => 1, (phi, _th, t) => { const th = t0 + (t1 - t0) * t; return surf(phi, th, H.fit(th) + 0.004); }, { phiMin: -0.3, phiMax: 0.3 }),
      flatMat(null, logoTexture('CV', '#ffffff', color, { w: 256, h: 176, border: true })), g, '모자패치');
    patch.userData.noOutline = true;
    patch.castShadow = false;
  }
}

// covered: 긴바지 밑단이 발목을 덮는가 (그러면 신발 발목 부분은 만들지 않는다)
function buildShoe(foot, o, covered = false) {
  const upperMat = new THREE.MeshStandardMaterial({
    map: aoGradient('shoe2', o.shoes, [[0, 1], [0.7, 1], [1, 0.9]]), roughness: 0.3, // 발목 둘레를 어둡게 하지 않는다 (발목과 색이 이어지게)
  });
  const white = new THREE.MeshStandardMaterial({ color: '#f7f3ea', roughness: 0.4, bumpMap: soleBump(), bumpScale: 2 });
  // 스트릿 스니커즈 배색: 밑창 아래쪽(겉창)과 발목을 감싸는 도톰한 카라
  const point = o.shoeAccent ?? shade(o.shoes, 0.55);
  const soleMat = new THREE.MeshStandardMaterial({
    roughness: 0.45, map: canvasTexture(`sole:${point}`, 8, 64, (g, w, h) => {
      g.fillStyle = '#f7f3ea';
      g.fillRect(0, 0, w, h);
      g.fillStyle = point;
      g.fillRect(0, h * 0.6, w, h * 0.4);
    }),
  });
  // 고무 밑창
  // 갑피(타원)와 같은 윤곽을 가진 일체형 고무창: 단위 회전체를 가로·세로로 늘림
  const soleGeo = lathe([[0, 0.008], [0.86, 0.008], [0.97, 0.006], [1.0, 0.0], [0.97, -0.006], [0.86, -0.008], [0, -0.008]], 48);
  soleGeo.scale(0.0425, 1, 0.0675);
  soleGeo.computeVertexNormals();
  // 아래를 향한 법선은 옆으로 눕힌다: 외곽선 껍질이 땅 밑으로 내려가 바닥·발밑 그림자와 엇갈리며 잔선이 깨져 보이지 않게
  const sn = soleGeo.attributes.normal;
  for (let i = 0; i < sn.count; i++) {
    if (sn.getY(i) >= 0) continue;
    const h = Math.hypot(sn.getX(i), sn.getZ(i));
    if (h < 1e-3) sn.setXYZ(i, 0, 1, 0);
    else sn.setXYZ(i, sn.getX(i) / h, 0, sn.getZ(i) / h);
  }
  const sole = mesh(soleGeo, soleMat, foot, '밑창');
  sole.position.set(0, -0.04, 0.018);
  // 갑피 (발등)
  const upper = mesh(ellipsoid(0.041, 0.034, 0.065), upperMat, foot, '갑피');
  upper.position.set(0, -0.013, 0.018);
  // 앞코 (흰색)
  const toe = mesh(ellipsoid(0.033, 0.018, 0.026), white, foot, '앞코');
  toe.position.set(0, -0.021, 0.064);
  // 발목: 갑피와 같은 색·같은 재질로, 다리 굵기에서 시작해 아래로 갈수록 넓게 퍼지며 갑피 곡면 위로 완만하게 내려앉는다.
  // 색이 다른 띠나 곧게 선 통을 얹으면 신발 위에 고리를 낀 것처럼 선이 생기므로, 발등에서 발목까지 한 덩어리로 이어지게 한다
  if (!covered) {
  // 윗단은 도톰하게 말지 않고 다리 굵기에서 곧장 시작해 매끈하게 벌어진다 (말린 테두리는 발목에 울퉁불퉁한 고리처럼 보인다)
  // 발목 위로 올라오는 부분은 두지 않는다: 신발은 발등 높이에서 끝나고 그 위로는 바로 다리다 (로우탑)
  const ankleGeo = lathe([[0.0364, 0.016], [0.0385, 0.0145], [0.042, 0.011], [0.046, 0.007], [0.05, 0.003], [0.055, -0.003], [0.05, -0.012]], 32);
  // 아래로 퍼지는 자락은 좌우·뒤로는 좁혀 신발 폭(갑피 반폭 0.041)과 뒤꿈치를 넘지 않게 하고, 앞으로만 발등 쪽으로 길게 흐르게 둔다
  const ap = ankleGeo.attributes.position;
  for (let i = 0; i < ap.count; i++) {
    const k = smooth(0.042, 0.055, Math.hypot(ap.getX(i), ap.getZ(i)));
    ap.setX(i, ap.getX(i) * (1 - 0.27 * k));
    // 뒤쪽은 옆과 같이 좁혀 뒤꿈치를 곧게 감싼다 (뒤로도 퍼지면 뒤꿈치 밖으로 울퉁불퉁 튀어나온다). 앞쪽만 발등으로 흐른다
    ap.setZ(i, ap.getZ(i) * (ap.getZ(i) < 0 ? 1 - 0.27 * k : 1 + 0.15 * k));
  }
  ankleGeo.computeVertexNormals();
  const ankle = mesh(ankleGeo, new THREE.MeshStandardMaterial({ color: o.shoes, roughness: 0.3 }), foot, '발목카라');
  ankle.position.set(0, 0, -0.002);
  } // 긴바지를 입으면 바짓부리가 신발 위를 덮는다: 그 속에서 신발 발목이 비어져 나오면 밑단에 고리를 두른 것처럼 보인다
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
    skin: '#ffd3b4', nose: '#ff8a62', noseStyle: 'classic', mouthStyle: 'classic', hair: 'side', hairColor: '#a65a2e', iris: '#6a4a33', lash: false, eyeStyle: 'basic',
    top: '#f3efe6', bottom: 'shorts', bottomColor: '#3f5f8f', shoes: '#e2574c',
    plaid: ['#e7b74a', '#b9502f', '#3a2a22'], collar: null, crown: false, glasses: false, backpack: false,
    outfit: 'tee', hat: 'none',
  },
  girl: {
    skin: '#ffd6b8', nose: '#ff8f6a', noseStyle: 'classic', mouthStyle: 'classic', hair: 'bob', hairColor: '#e4b660', iris: '#3d6fc4', lash: true, eyeStyle: 'basic',
    top: '#f28aa0', bottom: 'skirt', bottomColor: '#fff3dc', shoes: '#7b5bd6', plaid: null,
    collar: '#fffaf2', crown: true, glasses: false, backpack: false, outfit: 'tee', hat: 'none',
  },
};

// 코 모양: geo가 있으면 도톰한 조각, 없으면 얼굴에 그려 넣는다 (textures.js DRAWN_NOSES)
export const NOSE_STYLES = {
  classic: { label: '기존 코', geo: () => ellipsoid(0.022, 0.012, 0.016) }, // 가로로 납작한 작은 타원
  bead: { label: '작은 구슬', geo: () => ellipsoid(0.013, 0.012, 0.013) },
  button: { label: '납작 단추', geo: () => ellipsoid(0.03, 0.013, 0.012) },
  big: { label: '동글 큰 코', geo: () => ellipsoid(0.028, 0.024, 0.024) },
  tri: {
    label: '세모 코',
    geo: () => {
      // 아래가 넓고 위가 뾰족한 세모: 얼굴 쪽으로 납작하게 눌러 붙인다
      const g = new THREE.ConeGeometry(0.019, 0.05, 32);
      g.scale(1, 1, 0.7);
      g.translate(0, 0.006, 0);
      return g;
    },
  },
  block: { label: '네모 코', geo: () => new RoundedBoxGeometry(0.044, 0.022, 0.02, 4, 0.008) },
  pointy: {
    label: '뾰족 코',
    geo: () => {
      const g = new THREE.ConeGeometry(0.015, 0.034, 32);
      g.rotateX(PI / 2); // 끝이 앞으로
      g.translate(0, 0, 0.01);
      return g;
    },
  },
  hook: { label: '선 코' },
  nostril: { label: '콧구멍 코' },
};

// 표정 = 눈 두 개(캐릭터의 오른쪽, 왼쪽) + 입 + 볼터치 진하기
export const EXPRESSIONS = {
  smile: { label: '기본(미소)', eyes: ['open', 'open'], mouth: 'smile', blush: 1 },
  grin: { label: '활짝 웃음', eyes: ['happy', 'happy'], mouth: 'grin', blush: 1.35 },
  surprised: { label: '놀람', eyes: ['round', 'round'], mouth: 'o', blush: 0.8 },
  wink: { label: '윙크', eyes: ['closed', 'open'], mouth: 'smile', blush: 1.2 },
  angry: { label: '화남', eyes: ['angry', 'angry'], mouth: 'pout', blush: 1.15 },
  calm: { label: '명상', eyes: ['happy', 'happy'], mouth: 'smile', blush: 1.1, hidden: true }, // 지팡이 강타로 기를 모을 때 (액션 전용)
  ko: { label: '기절', eyes: ['closed', 'closed'], mouth: 'o', blush: 0.6, hidden: true }, // 액션 전용
  hurt: { label: '아파함', eyes: ['wince', 'wince'], mouth: 'wince', blush: 1.45, hidden: true }, // 맞았을 때 (액션 전용)
};

// 이 키가 바뀌면 얼굴·눈 텍스처를 다시 그린다
const FACE_KEYS = ['skin', 'nose', 'iris', 'lash', 'eyeStyle', 'noseStyle', 'mouthStyle'];

// texScale: 표정 텍스처 해상도 배율 (마을처럼 여러 명이 동시에 보일 때는 낮춰 메모리를 아낀다)
// hairSegs: 머리 곡면 해상도 (기본 720, 마을은 낮춤) · segScale: 몸 곡면 칸 수 배율 (마을은 0.5)
export function createVillager(options = {}, { texScale = 1, hairSegs = 720, segScale = 1 } = {}) {
  const detail = { hairSegs };
  const o = { ...PRESETS.boy, ...options };
  const root = new THREE.Group();
  root.name = '주민';
  root.userData.rest = root.position.clone();
  // action·equipment는 읽기 전용으로 보고, 바꿀 때는 setAction / equip 을 쓴다
  const state = { action: 'idle', expression: 'smile', equipment: 'none' };
  let baseExpression = null; // 액션이 표정을 잠깐 바꿨을 때 돌아갈 표정
  // 표정용 실시간 텍스처: 몸을 다시 만들어도 같은 텍스처를 계속 쓴다
  const E = 1024 * texScale;
  const live = { face: liveTexture(2 * E, E), eyes: [liveTexture(E, E), liveTexture(E, E)] };
  let rig = null;

  function redrawFace() {
    const e = EXPRESSIONS[state.expression] ?? EXPRESSIONS.smile;
    drawFace(live.face, o.skin, e, { mouthStyle: o.mouthStyle, noseStyle: o.noseStyle, noseColor: o.nose });
    e.eyes.forEach((mode, i) => drawEye(live.eyes[i], { iris: o.iris, lash: o.lash, mode, style: o.eyeStyle }));
  }

  // 지오메트리만 버린다. 재질은 그냥 둔다: 버리면 셰이더 프로그램이 지워져 다시 만들 때 컴파일로 화면이 멈춘다 (equipment.js attachEquipment 참고)
  function clear() {
    disposeEquipment(rig); // 내려놓고 넣어 둔 도구까지
    for (const c of [...root.children]) {
      root.remove(c);
      c.traverse((x) => { if (x.isMesh) { x.geometry.dispose(); x.skeleton?.dispose(); } });
    }
  }

  function rebuild() {
    clear();
    SEG = segScale;
    rig = buildBody(root, o, live, detail);
    SEG = 1;
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
  // offset: 몇 초 지난 자리부터 이어서 재생 (공중 공격이 점프 높이를 그대로 이어받을 때)
  function setAction(name, onHit, onComplete, offset = 0) {
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
    player.play(name, onHit, onComplete, offset);
    api.onChange?.();
  }
  player.onEnd = (_name, next) => { if (next) setAction(next); };

  let blinkT = 2 + Math.random() * 3;
  let trailOn = false; // 동작이 지금 휘두르는 궤적을 남기라고 했는가 (구간이 매번 달라지는 공중 공격용)

  function update(t, dt = 1 / 60) {
    if (state.action !== player.action) setAction(state.action); // state.action 을 직접 바꾼 경우도 받아 줌
    const fx = player.update(rig, t, dt);
    trailOn = !!fx.trail;
    followShoulders(rig, dt, fx.shoulderIn ?? 1); // 팔을 앞으로 뻗은 만큼 어깨를 안쪽으로 (두 손 쥐기 계산보다 먼저: 손은 옮긴 어깨에서 다시 뻗는다)
    updateEquipment(rig, root, fx, t, dt, state);
    resolveArmCollision(rig); // 팔이 몸·옷 속으로 들어가지 않게 (장비 IK까지 끝난 뒤)
    straightenWrists(rig); // 팔꿈치가 옮겨진 뒤에도 손목은 아래팔과 한 줄로
    rig.armPrev = [rig.shoulderR, rig.elbowR, rig.handR].map((o) => o.quaternion.clone()); // 이 장면의 최종 오른팔 자세 (팔 붙잡기의 기준)
    for (const s of ['R', 'L']) (rig.armDir ??= {})[s] = new THREE.Vector3(0, -1, 0).applyQuaternion(rig[`shoulder${s}`].quaternion); // 다음 장의 어깨 위치에 쓴다
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
  // 완전히 치울 때: 몸과 이 캐릭터 전용 표정 텍스처까지 해제 (공유 캐시 텍스처는 남김)
  function dispose() {
    clear();
    live.face.dispose();
    live.eyes.forEach((t) => t.dispose());
    root.removeFromParent();
  }
  const api = { root, get rig() { return rig; }, get progress() { return player.progress; }, get trailOn() { return trailOn; }, options: o, state, set, setExpression, setAction, equip, update, dispose, onChange: null };
  return api;
}
