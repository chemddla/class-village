// 구구: 날아다니는데 하찮은 비둘기 몬스터 (중립형: 먼저 덤비지 않고 제 할 일만 함)
// 다른 몬스터와 같은 방식: createGugu() 의 root 를 장면에 넣고 매 프레임 update(dt), 동작은 play('walk') 처럼 바꾼다
// 몸·동작은 몬스터 시안 화면(monsters.html?set=pigeon, gugu, guguWith, guguHaak)과 같은 코드를 함께 쓴다
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { syncToon } from '../villager/toon.js';
import { canvasTexture } from '../villager/textures.js';
import { bump } from './haaknyang.js';
import { angerMark, angerPulse } from './anger.js';

const PI = Math.PI;
const mat = (color, rough = 0.6) => new THREE.MeshStandardMaterial({ color, roughness: rough });
const BLACK = mat('#2b1d14', 0.3);
function mesh(geo, m, parent, name = '부품') {
  const o = new THREE.Mesh(geo, m);
  o.name = name;
  o.castShadow = true;
  parent.add(o);
  return o;
}
const ball = (r, n = 32) => new THREE.SphereGeometry(r, n, Math.round(n * 0.75));

// 기본 비둘기: fly(공중 높이) > body > head·neck·wings·tail·feet. 앞이 +z
// 진짜 비둘기처럼: 작은 머리, 통통한 가슴, 초록·보라로 반짝이는 목, 검은 줄 두 개 있는 회색 날개,
// 끝이 짙은 뾰족한 날개깃, 끝에 검은 띠가 있는 부채꼴 꼬리, 주황 눈, 부리 위 하얀 혹, 짧은 빨간 발
// 날개는 팔(안쪽)·손(바깥쪽) 두 마디라 파도치듯 접혔다 펴진다
export const tmpV = new THREE.Vector3();
export function makePigeon({ grey = '#a9b0bd', wingC = '#9aa2b0', tipC = '#5d6470', neck = '#5f9a7e', neck2 = '#8e7ab0', fat = 1, wing = 1, eye = 'orange', pied = null, tailC = null, legC = '#e0605f', len = 1, neckH = 1, backLine = null, napeFill = 0, shoulderIn = 0 } = {}) {
  // neckH: 목·머리 높이 배율 (1 보다 작으면 목이 짧아 머리가 어깨에 낮게 얹힘)
  // len: 몸통(가슴~꽁지) 앞뒤 길이 배율. 뼈 크기로 줄이면 목덜미가 꺾이니 모양 자체를 줄인다 (머리·목은 그대로)
  // pied: 까치처럼 흰 무늬 색 (배·어깨·날개깃 안쪽), 비둘기 날개 검은 줄은 없앰 / tailC: [뿌리, 끝] 꽁지 빛깔
  const g = new THREE.Group();
  const fly = new THREE.Group();
  fly.position.y = 0.13;
  g.add(fly);
  const body = new THREE.Group();
  fly.add(body);
  // 깃털처럼 말랑한 판(날개·꼬리): 2D 모양(x 바깥, y 앞)을 아주 둥글게 부풀려 뽑고,
  // 뿌리는 두툼·끝은 얇게, 위로 살짝 불룩하게 휘게 한 뒤 무늬는 그림(텍스처)으로 얹는다
  // smooth(): 찍은 점들을 지나는 매끈한 닫힌 곡선 위의 점들 (각진 데 없이)
  const smooth = (pts, n = 64) => new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x, y, 0)), true, 'centripetal')
    .getPoints(n).slice(0, -1).map((v) => [v.x, v.y]);
  // warp(u, v): u 뿌리→끝(0~1), v 뒤→앞(0~1) 자리에서 [두께 배율, 위아래 옮김]
  const softPlate = (pts, s, warp) => {
    const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    let geo = new THREE.ExtrudeGeometry(sh, { depth: 0.001, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.002, bevelSegments: 5, curveSegments: 4 })
      .translate(0, 0, -0.0005).rotateX(PI / 2);
    geo.deleteAttribute('uv');
    geo.deleteAttribute('normal');
    geo = mergeVertices(geo); // 모서리를 이어 붙여 매끈한 그늘
    geo.computeBoundingBox();
    const bb = geo.boundingBox, pos = geo.attributes.position;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      let u = (pos.getX(i) - bb.min.x) / (bb.max.x - bb.min.x);
      if (s < 0) u = 1 - u;
      const v = (pos.getZ(i) - bb.min.z) / (bb.max.z - bb.min.z);
      const [sy, oy] = warp(u, v);
      pos.setY(i, pos.getY(i) * sy + oy);
      uv[i * 2] = u;
      uv[i * 2 + 1] = v;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    return geo;
  };
  // 날개 한 마디의 휨: t0~t1 은 날개 전체에서 이 마디가 차지하는 자리 (끝으로 갈수록 얇아지고 살짝 처짐, 앞 가장자리가 두툼)
  const wingWarp = (t0, t1) => (u, v) => {
    const t = t0 + (t1 - t0) * u;
    return [(1 - 0.55 * t) * (0.65 + 0.5 * v), 0.0022 * (1 - (2 * v - 1) ** 2) - 0.004 * t * t];
  };
  const feather = (draw) => new THREE.MeshStandardMaterial({ roughness: 0.85, map: canvasTexture(draw[0], 128, 64, draw[1]) });
  // 머리·목·몸통을 한 덩어리로: 꼬리 끝에서 부리 밑까지 휘어진 등뼈를 따라 둥근 단면을 이어 붙인다
  // 뼈 셋(몸·목·머리)에 붙여서 고개를 돌리거나 목을 부풀려도 이음매 없이 같이 휜다
  // 등뼈 점 [y, z] 와 그 자리 단면 반지름 [옆, 위아래]
  const SPINE = [
    [0.006, -0.062, 0.001, 0.001], // 꼬리 끝 (닫힘)
    [0.005, -0.052, 0.012, 0.007],
    [0.002, -0.035, 0.026 * fat, 0.022 * fat], // 엉덩이
    [0, -0.008, 0.034 * fat, 0.031 * fat], // 몸통
    [0.006, 0.02, 0.032 * fat, 0.031 * fat], // 불룩한 가슴
    [0.022, 0.033, Math.max(0.021 * fat, 0.018), 0.021], // 목 밑 (몸이 가늘어도 목보다 가늘어지면 잘록해지니 최소 굵기)
    [0.036, 0.039, 0.0155, 0.015], // 목
    // 머리는 목을 위로 쭉 이어 둥글게 닫는다 (앞으로 확 꺾으면 목 앞이 접혀 눈 밑에 주름 선이 생김)
    [0.049, 0.043, 0.0165, 0.018], // 머리
    [0.059, 0.044, 0.012, 0.013],
    [0.064, 0.044, 0.005, 0.005],
    [0.0655, 0.044, 0.0005, 0.0005], // 정수리 (닫힘)
  ];
  const bodyZ = (z) => (z < 0.02 ? z * len : z - 0.02 * (1 - len)); // 가슴(z 0.02)까지만 줄이고, 목·머리는 그만큼 뒤로 당겨 붙임
  // 목(가슴 y 0.006 ~ 목 꼭대기 0.036)만 줄이고, 머리는 모양 그대로 그만큼 내려 붙임 (머리가 찌부되지 않게)
  const neckY = (y) => (y <= 0.006 ? y : y <= 0.036 ? 0.006 + (y - 0.006) * neckH : y - 0.03 * (1 - neckH));
  const spine = new THREE.CatmullRomCurve3(SPINE.map(([y, z]) => new THREE.Vector3(0, neckY(y), bodyZ(z))), false, 'catmullrom'); // 균일 매개변수: 반지름 곡선과 같은 빠르기로 지나가야 단면 이음에 꺾임(띠)이 없음
  backLine = backLine?.map(([z, y]) => [bodyZ(z), y]); // 몸 길이(len)를 줄이면 등선도 같이 줄임
  const radii = new THREE.CatmullRomCurve3(SPINE.map(([, , rx, ry]) => new THREE.Vector3(rx, ry, 0)), false, 'catmullrom');
  const NS = 60, NR = 28; // 등뼈 따라 / 둘레
  const pos = [], uvs = [], si = [], sw = [], idx = [];
  const X = new THREE.Vector3(1, 0, 0), U = new THREE.Vector3(), c = new THREE.Vector3(), r = new THREE.Vector3(), T = new THREE.Vector3();
  const ease01 = (x) => { x = THREE.MathUtils.clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  for (let i = 0; i <= NS; i++) {
    const u = i / NS; // 등뼈 점 i 는 u = i / 10 자리 (점 사이를 고르게 나눔)
    spine.getPoint(u, c);
    // 단면 기울기는 앞뒤 넓게 본 방향으로: 몸을 짧게 줄이면 등뼈가 급히 꺾여 단면 고리끼리 겹쳐 접히고(등에 주름 띠) 울퉁불퉁해짐
    T.subVectors(spine.getPoint(Math.min(1, u + 0.12)), spine.getPoint(Math.max(0, u - 0.12), r)).normalize();
    radii.getPoint(u, r);
    U.crossVectors(T, X).normalize(); // 단면의 '위' 방향
    const wh = ease01((u - 0.6) / 0.1); // 목 → 머리 넘어가는 자리
    const wn = ease01((u - 0.4) / 0.1) * (1 - wh); // 가슴 → 목
    // backLine [[z, y], ...] (z 오름차순): 옆에서 본 등선을 이 점들을 지나게 맞춤. 단면 위쪽 반만 늘이고 줄여서 배·가슴은 그대로
    // 몸을 짧게 줄이면 등이 평평한 턱처럼 높고 목덜미에서 움푹 꺾이니, 목덜미에서 엉덩이까지 한 줄로 흘러내리게
    let ryTop = r.y;
    if (backLine && U.y > 0.3) {
      for (let k = 0; k < 3; k++) { // 위 점의 z 가 ry 에 따라 살짝 움직이니 몇 번 맞춰 봄
        const z = c.z + U.z * ryTop, n = backLine.length - 1;
        if (z <= backLine[0][0] || z >= backLine[n][0]) { ryTop = r.y; break; }
        let s = 0;
        while (backLine[s + 1][0] < z) s++;
        const [z0, y0] = backLine[s], [z1, y1] = backLine[s + 1];
        const yt = y0 + ((y1 - y0) * (z - z0)) / (z1 - z0);
        const w = ease01((z - backLine[0][0]) / 0.003) * ease01((backLine[n][0] - z) / 0.003); // 양 끝은 원래 모양으로 스르르
        ryTop = r.y + w * ((yt - c.y) / U.y - r.y);
      }
    }
    ryTop *= 1 + napeFill * Math.exp(-(((u - 0.625) / 0.035) ** 2)); // 등선과 목 뒤가 만나는 오목한 모서리를 둥글게 채움
    for (let j = 0; j <= NR; j++) {
      const a = -PI / 2 + (j / NR) * PI * 2; // 이음매는 배 밑으로 숨김
      const ry = Math.sin(a) > 0 ? ryTop : r.y;
      pos.push(c.x + Math.cos(a) * r.x, c.y + U.y * Math.sin(a) * ry, c.z + U.z * Math.sin(a) * ry);
      uvs.push(j / NR, u);
      si.push(0, 1, 2, 0);
      sw.push(1 - wn - wh, wn, wh, 0);
    }
  }
  for (let i = 0; i < NS; i++) {
    for (let j = 0; j < NR; j++) {
      const a = i * (NR + 1) + j, b = a + NR + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const bodyGeo = new THREE.BufferGeometry();
  bodyGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  bodyGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  bodyGeo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  bodyGeo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  bodyGeo.setIndex(idx);
  bodyGeo.computeVertexNormals();
  // 몸 색: 회색 바탕에 목 둘레만 보라(아래)·초록(위)으로 반짝이는 띠가 부드럽게 번진다 (그림 위쪽이 머리 쪽)
  const bodyTex = canvasTexture(`pigeonBody:${grey}:${neck}:${neck2}:${pied}`, pied ? 64 : 8, 256, (g2, w, h) => {
    g2.fillStyle = grey;
    g2.fillRect(0, 0, w, h);
    const band = (col, u0, u1) => {
      const gr = g2.createLinearGradient(0, (1 - u1) * h, 0, (1 - u0) * h);
      gr.addColorStop(0, `${col}00`); // 가장자리는 같은 색의 투명으로 (투명한 검정으로 흐리면 띠 경계마다 어두운 줄이 생김)
      gr.addColorStop(0.3, col);
      gr.addColorStop(0.7, col);
      gr.addColorStop(1, `${col}00`);
      g2.fillStyle = gr;
      g2.fillRect(0, (1 - u1) * h, w, (u1 - u0) * h);
    };
    band(neck2, 0.42, 0.56);
    band(neck, 0.5, 0.66);
    if (pied) { // 배·옆구리 무늬 (까치 흰 배): 그림 가로는 몸 둘레(양 끝이 배 밑). 가슴·꽁지 밑은 검게 남기고 옆구리 높이까지, 가장자리는 흐리게
      g2.filter = 'blur(3px)';
      g2.fillStyle = pied;
      for (const x of [0, w]) { g2.beginPath(); g2.ellipse(x, (1 - 0.265) * h, w * 0.3, h * 0.105, 0, 0, PI * 2); g2.fill(); }
      g2.filter = 'none';
    }
  });
  const bodyBone = new THREE.Bone();
  body.add(bodyBone);
  const neckG = new THREE.Bone(); // 목 뼈 (화나면 빵빵하게 부풀린다)
  neckG.position.set(0, neckY(0.026), bodyZ(0.03));
  body.add(neckG);
  const head = new THREE.Bone(); // 머리 뼈: 부리·눈이 여기 붙는다
  head.position.set(0, neckY(0.05), bodyZ(0.042));
  body.add(head);
  const skin = new THREE.SkinnedMesh(bodyGeo, new THREE.MeshStandardMaterial({ roughness: 0.75, map: bodyTex }));
  skin.name = '몸';
  skin.castShadow = true;
  body.add(skin);
  g.updateMatrixWorld(true);
  skin.bind(new THREE.Skeleton([bodyBone, neckG, head]));
  const beak = mesh(new THREE.ConeGeometry(0.0042, 0.013, 12).rotateX(PI / 2).translate(0, -0.003, 0.021), mat('#3d3540', 0.5), head, '부리');
  mesh(ball(0.0042, 12).scale(1.2, 0.75, 1.3).translate(0, 0.0005, 0.0165), mat('#f3efe8', 0.9), head, '코'); // 부리 위 하얀 혹
  const eyes = [-1, 1].map((s) => {
    const e = new THREE.Group();
    e.position.set(s * 0.0145, 0.004, 0.007);
    head.add(e);
    if (eye === 'orange') mesh(ball(0.0055, 16).scale(1, 1, 0.5), mat('#ff7a1f', 0.35), e, '눈');
    const p = mesh(ball(eye === 'orange' ? 0.0028 : 0.004, 12).scale(1, 1, 0.5), BLACK, e, '눈');
    p.position.set(s * 0.0008, 0, 0.0025);
    e.rotation.y = s * 1.15; // 비둘기 눈은 옆을 본다
    return e;
  });
  // 날개 무늬: 팔은 회색 바탕에 검은 줄 두 줄 + 뒤쪽 깃털 결, 손은 끝으로 갈수록 짙어지는 날개깃 + 깃털 결
  // (그림 아래쪽이 날개 뒤 가장자리, 왼쪽이 뿌리)
  const ARM_MAT = feather([`pigeonArm:${wingC}:${pied}`, (g, w, h) => {
    g.fillStyle = wingC;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(50,45,60,0.28)';
    g.lineWidth = 2;
    for (let i = 0; i < 8; i++) { // 뒤쪽 깃털 결
      const x = w * (0.06 + i * 0.12);
      g.beginPath(); g.moveTo(x, h * 0.66); g.quadraticCurveTo(x + w * 0.01, h * 0.85, x + w * 0.03, h); g.stroke();
    }
    if (pied) { // 까치 어깨깃: 날개 앞쪽 뿌리에 큰 흰 무늬
      g.filter = 'blur(2px)';
      g.fillStyle = pied;
      g.beginPath(); g.ellipse(w * 0.3, h * 0.12, w * 0.42, h * 0.36, 0, 0, PI * 2); g.fill();
      g.filter = 'none';
      return;
    }
    g.strokeStyle = '#3f3a44';
    g.lineCap = 'round';
    g.lineWidth = w * 0.06;
    for (const x of [0.42, 0.66]) { // 검은 줄 두 줄: 날개 앞에서 뒤로 가로지름 (가운데가 살짝 휘게)
      g.beginPath(); g.moveTo(w * x, h * 0.14); g.quadraticCurveTo(w * (x + 0.05), h * 0.48, w * (x + 0.02), h * 0.8); g.stroke();
    }
  }]);
  const HAND_MAT = feather([`pigeonHand:${wingC}:${tipC}:${pied}`, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0.3, wingC);
    gr.addColorStop(0.62, tipC);
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    if (pied) { // 까치 날개깃: 뿌리는 파랑, 가운데는 흰 깃, 끝은 검정 — 검은 깃 결과 번갈아 흰·검 줄무늬가 된다
      const pg = g.createLinearGradient(0, 0, w, 0);
      pg.addColorStop(0.3, wingC);
      pg.addColorStop(0.4, pied);
      pg.addColorStop(0.78, pied);
      pg.addColorStop(0.9, tipC);
      g.fillStyle = pg;
      g.fillRect(0, 0, w, h);
      g.fillStyle = tipC;
      g.fillRect(0, 0, w, h * 0.12); // 앞 가장자리(바깥 깃 가장자리)는 검게
    }
    g.strokeStyle = pied ? tipC : 'rgba(35,30,40,0.3)';
    g.lineWidth = pied ? 4 : 2;
    for (let i = 0; i < 7; i++) { // 날개깃 결: 뿌리 앞쪽에서 끝·뒤쪽으로 부채처럼
      g.beginPath(); g.moveTo(w * 0.05, h * 0.35); g.quadraticCurveTo(w * (0.25 + i * 0.08), h * 0.5, w * (0.18 + i * 0.13), h * (1 - i * 0.07)); g.stroke();
    }
  }]);
  const wings = [-1, 1].map((s) => {
    const k = wing;
    const arm = new THREE.Group();
    arm.position.set(s * (0.026 * fat - shoulderIn), 0.02, bodyZ(0.006)); // shoulderIn: 어깨 축을 몸 안으로 (날개를 젖히거나 휘둘러도 뿌리가 몸 밖으로 뜨지 않게) // 몸을 짧게 줄이면 어깨도 같이 (안 그러면 날개 뿌리가 가는 목 밑에 걸려 몸 밖에 뜸)
    body.add(arm);
    // 팔: 앞 가장자리는 둥글게, 뒤 가장자리는 깃털 끝이 살짝 물결치게
    const ARM = smooth([[0, 0.011], [0.018, 0.014], [0.034, 0.012], [0.041, 0.004], [0.04, -0.02], [0.035, -0.024], [0.029, -0.022],
      [0.023, -0.026], [0.017, -0.024], [0.01, -0.026], [0.002, -0.021], [-0.003, -0.006]]);
    mesh(softPlate(ARM.map(([x, y]) => [s * x * k * 0.93, y * k * 0.93]), s, wingWarp(0, 0.45)), ARM_MAT, arm, '날개');
    const hand = new THREE.Group();
    hand.position.set(s * 0.035 * k, 0, 0);
    arm.add(hand);
    // 손: 팔과 겹쳐 시작해 끝이 뾰족하게 휘어지고, 뒤쪽은 날개깃 끝이 물결
    const HAND = smooth([[-0.004, 0.009], [0.012, 0.009], [0.026, 0.005], [0.039, -0.003], [0.05, -0.013], [0.045, -0.017], [0.04, -0.015],
      [0.035, -0.019], [0.029, -0.017], [0.023, -0.021], [0.016, -0.019], [0.008, -0.022], [-0.004, -0.02]]);
    mesh(softPlate(HAND.map(([x, y]) => [s * x * k * 0.93, y * k * 0.93]), s, wingWarp(0.45, 1)), HAND_MAT, hand, '날개');
    return [arm, s, hand];
  });
  const tail = new THREE.Group();
  tail.position.set(0, 0.006, -0.045 * len);
  body.add(tail);
  // 꼬리: 부채꼴, 끝은 깃털 끝처럼 살짝 물결 + 끝의 검은 띠와 깃털 결은 그림으로
  const TAIL = smooth([[0, 0.007], [0.009, 0.005], [0.016, -0.016], [0.02, -0.031], [0.014, -0.037], [0.007, -0.036], [0, -0.04],
    [-0.007, -0.036], [-0.014, -0.037], [-0.02, -0.031], [-0.016, -0.016], [-0.009, 0.005]]);
  const TAIL_MAT = feather([`pigeonTail:${wingC}:${tailC}`, (g, w, h) => {
    if (tailC) { // 뿌리에서 끝으로 빛깔이 바뀌는 긴 꽁지 (까치: 청록 → 보라)
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, tailC[0]);
      gr.addColorStop(0.8, tailC[1]);
      gr.addColorStop(1, tipC); // 꽁지 끝은 날개깃 끝과 같은 짙은 색
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    } else {
      g.fillStyle = wingC;
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#3f3a44';
      g.fillRect(0, h * 0.8, w, h * 0.2); // 끝의 검은 띠
    }
    g.strokeStyle = 'rgba(50,45,60,0.3)';
    g.lineWidth = 2;
    for (let i = 0; i < 7; i++) { // 꽁지깃 결: 뿌리에서 부채처럼
      g.beginPath(); g.moveTo(w * 0.5, 0); g.lineTo(w * (0.08 + i * 0.14), h * 0.8); g.stroke();
    }
  }]);
  mesh(softPlate(TAIL.map(([x, y]) => [x * 0.93, y * 0.93]), 1, (u, v) => [0.55 + 0.35 * v, 0.0015 * (1 - (2 * u - 1) ** 2)]), TAIL_MAT, tail, '꼬리');
  const feet = [-1, 1].map((s) => {
    const f = new THREE.Group();
    f.position.set(s * 0.011, -0.024 * fat, -0.004);
    body.add(f);
    // 비둘기 발: 짧은 분홍빛 빨간 다리, 앞으로 쫙 벌어진 긴 발가락 셋(가운데가 제일 김) + 뒤로 난 짧은 발가락 하나, 끝엔 까만 발톱
    const R = mat(legC, 0.55);
    const CLAW = mat('#3a3036', 0.5);
    const leg = mesh(new THREE.CapsuleGeometry(0.0015, 0.0105, 4, 10).translate(0, -0.007, 0), R, f, '발');
    mesh(ball(0.0019, 12).translate(0, -0.0135, 0), R, f, '발'); // 발바닥 가운데 볼록
    const toes = [[-0.55, 0.009], [0, 0.011], [0.55, 0.009], [PI, 0.006]].map(([yaw, len]) => {
      const tg = new THREE.Group();
      tg.position.set(0, -0.0135, 0);
      tg.rotation.order = 'YXZ'; // 옆으로 벌린 뒤 제 방향대로 오므린다
      tg.rotation.y = yaw;
      tg.userData.len = len;
      f.add(tg);
      mesh(new THREE.CapsuleGeometry(0.0009, len, 3, 8).rotateX(PI / 2).translate(0, 0, len / 2), R, tg, '발가락');
      mesh(new THREE.ConeGeometry(0.0008, 0.0025, 8).rotateX(PI / 2).translate(0, -0.0002, len + 0.0017), CLAW, tg, '발톱');
      return tg;
    });
    // 다리를 뒤로 접을수록(날 때) 발가락을 오므린다
    f.userData.toes = toes;
    f.userData.curl = () => {
      const curl = THREE.MathUtils.clamp(f.rotation.x / 1.3, 0, 1) * 1.1;
      toes.forEach((tg) => (tg.rotation.x = curl));
    };
    leg.onBeforeRender = f.userData.curl; // 그리기 직전에 다리 각도를 보고 맞춤
    f.rotation.x = 1.3; // 날 땐 발을 뒤로 착 접는다
    return f;
  });
  // 땅에 파묻히지 않게 볼 검사 점: [부품, 그 부품 안의 자리, 여유]. 몸 끝·부리·날개 끝·꼬리 끝·발가락 끝처럼 튀어나온 곳만
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const probes = [
    [body, V(0, -0.031 * fat, -0.006 * len)], [body, V(0, -0.024 * fat, 0.024 * len)], [body, V(0, -0.016, -0.036 * len)], [body, V(0, 0.031 * fat, -0.008 * len)],
    [body, V(0.034 * fat, 0, -0.008 * len)], [body, V(-0.034 * fat, 0, -0.008 * len)], [body, V(0, 0.008, -0.06 * len)],
    [head, V(0, -0.003, 0.028)], [head, V(0, -0.017, 0.002)], [head, V(0, 0.019, 0)], [head, V(0.017, 0, 0)], [head, V(-0.017, 0, 0)],
    [tail, V(0, 0, -0.038)], [tail, V(0.019, 0, -0.03)], [tail, V(-0.019, 0, -0.03)],
    ...wings.flatMap(([a, s, hd]) => [
      [a, V(s * 0.02 * wing, -0.003, -0.025 * wing)], [a, V(s * 0.03 * wing, -0.003, 0.012 * wing)],
      [hd, V(s * 0.047 * wing, -0.005, -0.012 * wing)], [hd, V(s * 0.025 * wing, -0.004, -0.02 * wing)], [hd, V(s * 0.02 * wing, -0.003, 0.008 * wing)],
    ]),
  ].map(([o, v]) => [o, v, 0.0025]); // 외곽선 두께만큼 띄움
  for (const f of feet) for (const tg of f.userData.toes) probes.push([tg, V(0, 0, 0), 0.001], [tg, V(0, 0, tg.userData.len + 0.002), 0.001]);
  // 동작 시안에서 매 프레임 처음 자세로 되돌리려고 움직이는 부품의 처음 값을 기억해 둔다
  const parts = [fly, body, head, neckG, tail, ...wings.flatMap(([a, , h]) => [a, h]), ...feet, ...eyes];
  const rest = parts.map((o) => [o.position.clone(), o.rotation.clone(), o.scale.clone()]);
  const P = {
    g, fly, body, head, neck: neckG, wings, tail, feet, eyes, beak, probes, // probes: 다른 모양 날개·꽁지를 붙일 때 땅 검사 점을 더 넣음
    reset() { parts.forEach((o, i) => { o.position.copy(rest[i][0]); o.rotation.copy(rest[i][1]); o.scale.copy(rest[i][2]); }); },
    // 날갯짓: 아래로 세게 치고(빠르게) 위로 들 때 손마디가 늦게 따라와 접힌다
    flap(t, speed = 14, amp = 0.9, base = 0.2) {
      const p = t * speed;
      const a = Math.sin(p) * amp + base;
      const h = Math.sin(p - 0.9) * amp * 0.55 - 0.05;
      wings.forEach(([w, s, hd]) => { w.rotation.z = s * a; hd.rotation.z = s * h; });
      return a;
    },
    // 날개를 V 자로 들고 쭉 편 채 미끄러지기
    glide(v = 0.35) { wings.forEach(([w, s, hd]) => { w.rotation.z = s * v; hd.rotation.z = -s * 0.08; }); },
    // 날개를 뒤로 젖혀 접기 (0~1)
    sweep(k) { wings.forEach(([w, s, hd]) => { w.rotation.y = s * k * 0.9; hd.rotation.y = s * k * 0.9; }); },
    // 비둘기 고개 까딱: 머리를 휙 앞으로 내밀고 천천히 당긴다
    bob(t, rate = 2.4, d = 0.01) {
      const k = (t * rate) % 1;
      head.position.z += (k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8) * d;
    },
    blink(k) { eyes.forEach((e) => (e.scale.y = 1 - k * 0.9)); },
    // 땅 위로: 자세를 다 잡은 뒤 부르면, 어느 부분이든 높이 h(땅 0, 물체 위면 그 윗면) 밑으로 파묻혔을 때만 몸 전체를 그만큼 올린다
    keepAbove(h = 0) {
      feet.forEach((f) => f.userData.curl());
      g.updateMatrixWorld(true);
      let need = 0;
      for (const [o, v, pad] of probes) {
        tmpV.copy(v);
        g.worldToLocal(o.localToWorld(tmpV));
        need = Math.max(need, h + pad - tmpV.y);
      }
      fly.position.y += need;
    },
    // 발 딛기: 자세를 다 잡은 뒤 부르면, 제일 낮은 발가락 밑이 높이 h(땅 0, 돌·상자 같은 물체 위면 그 윗면 높이)에 딱 닿도록 몸 전체를 올리고 내린다
    // k: 0 이면 그대로(공중), 1 이면 완전히 딛음 — 날아오르고 내려앉을 때 섞는다
    plant(h = 0, k = 1) {
      if (k <= 0) return;
      feet.forEach((f) => f.userData.curl());
      g.updateMatrixWorld(true);
      let lo = Infinity;
      for (const f of feet) for (const tg of f.userData.toes) for (const z of [0, tg.userData.len]) {
        tmpV.set(0, 0, z);
        g.worldToLocal(tg.localToWorld(tmpV));
        lo = Math.min(lo, tmpV.y);
      }
      fly.position.y += (h - (lo - 0.001)) * k; // 0.001: 발가락 두께 절반
    },
  };
  g.userData.pigeon = P; // 시안 화면에서 동작 뒤 땅 위로 올릴 때 씀
  return P;
}

export const GUGU_MOTIONS = [];
export const gmotion = (name, desc, period, fn, extra) => GUGU_MOTIONS.push({ name, desc, period, fn, extra });
export const gseg = (c, a, b) => THREE.MathUtils.clamp((c - a) / (b - a), 0, 1);
export const gease = (x) => x * x * (3 - 2 * x);
export const gBlink = (P, t) => P.blink(bump(t % 3, 2.82, 3));
export const GROUND_Y = 0.036; // 배를 땅에 대고 있을 때 fly 높이
// 깃털 몇 장: 맞음·쓰러짐에서 펑 흩날린다
export const featherPuff = (P, n = 6) => {
  const fs = [];
  for (let i = 0; i < n; i++) {
    const f = mesh(ball(0.008, 10).scale(0.45, 0.12, 1.2), mat('#c9ced8', 0.9), P.g, '깃털');
    f.visible = false;
    fs.push(f);
  }
  return (u, at) => fs.forEach((f, i) => { // u: 펑 하고 지난 시간, at: 펑한 자리
    f.visible = u > 0 && u < 1.6;
    if (!f.visible) return;
    const a = (i / n) * PI * 2;
    const out = 1 - Math.exp(-u * 6);
    f.position.set(at.x + Math.cos(a) * 0.05 * out, Math.max(0.003, at.y + 0.03 * out - u * u * 0.05), at.z + Math.sin(a) * 0.05 * out);
    f.rotation.set(Math.sin(u * 5 + i) * 0.7, u * 3 + i, Math.cos(u * 6 + i) * 0.7);
  });
};

// 1. 대기: 파닥파닥 몇 번 치고 날개를 V 자로 든 채 스르륵 미끄러지기. 한쪽 눈으로 두리번
// 파닥이다 스르륵 미끄러지기를 gl(0 파닥 ~ 1 미끄러짐)만큼 섞음: 날개가 툭 멈추지 않고 펴지며 굳음
export const flapGlide = (P, t, gl, speed, amp, base, v) => {
  P.flap(t, speed, amp, base);
  P.wings.forEach(([w, s, h]) => {
    w.rotation.z = THREE.MathUtils.lerp(w.rotation.z, s * v, gl);
    h.rotation.z = THREE.MathUtils.lerp(h.rotation.z, -s * 0.08, gl);
  });
};
gmotion('대기', '파닥파닥 하다 V 자로 스르륵, 한쪽 눈으로 두리번', 3.2, (c, P, t) => {
  const gl = gease(gseg(c, 1.3, 1.5)) * (1 - gease(gseg(c, 2.7, 2.9))); // 미끄러지는 동안
  flapGlide(P, t, gl, 20, 0.95, 0.15, 0.38);
  P.fly.position.y += (c < 1.4 ? c / 1.4 : 1 - (c - 1.4) / 1.8) * 0.014 + Math.sin(t * 20) * 0.002 * (1 - gl);
  P.body.rotation.x = -0.12 + gl * 0.12;
  P.tail.scale.x = 1 + gl * 0.25; // 미끄러질 땐 꼬리를 펴서 균형
  const look = Math.sin(t * 0.9) > 0 ? 1 : -1; // 이쪽저쪽 고개를 휙 돌려 한쪽 눈으로 봄
  P.head.rotation.y = look * 0.6 * Math.min(1, Math.abs(Math.sin(t * 0.9)) * 5);
  P.head.rotation.z = -look * 0.15;
  gBlink(P, t);
});

// 2. 이동: 몸을 수평으로 눕히고 쌩쌩, 목은 쭉 내밀고 발은 착 접음
gmotion('이동', '몸 쭉 펴고 쌩쌩, 가끔 스르륵', 2, (c, P, t) => {
  const gl = gease(gseg(c, 1.25, 1.4)) * (1 - gease(gseg(c, 1.8, 1.95)));
  flapGlide(P, t, gl, 24, 1.0, 0.05, 0.25);
  P.body.rotation.x = 0.12;
  P.head.position.z += 0.006;
  P.head.position.y -= 0.004;
  P.head.rotation.x = -0.12; // 앞을 똑바로
  P.tail.scale.x = 0.75; // 꼬리 오므림
  P.fly.position.y += Math.sin(t * 24) * 0.003 * (1 - gl);
  P.fly.position.z = ((t * 0.08) % 0.16) - 0.08; // 앞으로 슬금슬금 (시안이라 제자리로 돌아옴)
});

// ── 땅에서 걷기 도우미 ──
export const STAND_Y = 0.039; // 두 발로 땅에 섰을 때 fly 높이
// 날개 접기 (k: 0 편 날개 → 1 몸 옆에 착 붙여 뒤로 접음)
export const foldWings = (P, k) => P.wings.forEach(([w, s, h]) => {
  w.rotation.set(0, THREE.MathUtils.lerp(w.rotation.y, s * 1.45, k), THREE.MathUtils.lerp(w.rotation.z, -s * 0.2, k));
  w.position.x += s * 0.006 * k; // 몸에 파묻히지 않게 살짝 바깥·위로
  w.position.y += 0.004 * k;
  h.rotation.set(0, THREE.MathUtils.lerp(h.rotation.y, s * 0.15, k), THREE.MathUtils.lerp(h.rotation.z, 0, k));
});
// 뒤뚱뒤뚱 걸음: ph 는 걸음 위상(한 걸음에 PI). 발을 번갈아 앞뒤로, 든 발은 살짝 들고, 몸은 좌우로 기우뚱
// 비둘기답게 고개는 걸음마다 휙 앞으로 내밀고 몸이 따라올 때까지 멈춰 있다
export const waddle = (P, ph, amt = 1) => {
  P.feet.forEach((f, i) => {
    const sw = Math.sin(ph + i * PI);
    f.rotation.x = -sw * 0.55 * amt;
    f.position.y += Math.max(0, Math.cos(ph + i * PI)) * 0.005 * amt;
  });
  P.body.rotation.z += Math.sin(ph) * 0.09 * amt;
  P.body.position.y += Math.abs(Math.cos(ph)) * 0.002 * amt;
  const k = ((ph / PI) % 1 + 1) % 1; // 걸음마다 0→1
  P.head.position.z += (k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8) * 0.01 * amt;
};

// 걷기: 뒤뚱뒤뚱 고개 까딱까딱 걷다가 멈춰서 땅을 콕콕
gmotion('걷기', '뒤뚱뒤뚱 고개 까딱, 가다 서서 콕콕', 4, (c, P, t) => {
  foldWings(P, 1);
  P.fly.position.y = STAND_Y;
  P.body.rotation.x = -0.12;
  const walking = c < 2.8;
  if (walking) {
    waddle(P, c * PI * 2.6);
    P.fly.position.z = (c / 2.8) * 0.05 - 0.025; // 앞으로 아장아장 (시안이라 제자리로 돌아옴)
  } else {
    P.fly.position.z = 0.025;
    const peck = Math.max(0, Math.sin((c - 2.8) * PI * 3.3)); // 콕, 콕
    P.body.rotation.x = -0.12 + peck * 0.55;
    P.head.rotation.x = peck * 0.6;
    P.tail.rotation.x = peck * 0.3; // 쪼을 땐 꽁지가 들림
  }
  P.plant(0); // 떠 있지 않게 발끝을 땅에 붙임
  gBlink(P, t);
});

// 걷다 날기: 아장아장 걷다가 날개를 짝! 치며 뛰어올라 한 바퀴 날고, 발 내밀고 파닥파닥 내려앉아 다시 걷기
gmotion('걷다 날기', '아장아장 걷다 짝! 날아올랐다 다시 내려앉음', 6, (c, P, t) => {
  const up = gseg(c, 1.8, 2.6); // 날아오름
  const down = gseg(c, 4.2, 5.0); // 내려앉음
  const air = up * (1 - down); // 0 땅 ~ 1 하늘
  let bob = 0;
  const fold = 1 - gease(gseg(c, 1.7, 1.9)) + gease(gseg(c, 4.9, 5.1)); // 땅에선 날개 접음
  if (c < 1.8 || c > 5.0) { // 걷기
    waddle(P, t * PI * 2.6);
    P.body.rotation.x = -0.12;
  } else if (c < 2.0) { // 날개 위로 짝!
    const clap = bump(c, 1.8, 2.0);
    P.wings.forEach(([w, s, h]) => { w.rotation.z = s * clap * 1.5; h.rotation.z = s * clap * 0.4; });
    P.feet.forEach((f) => (f.rotation.x = -0.2));
  } else { // 날기 + 내려앉을 땐 몸 세우고 발 앞으로 내밀며 브레이크
    const brake = bump(c, 4.3, 5.0);
    P.flap(t, 20 + brake * 8, 1.0, 0.2 + brake * 0.1);
    P.body.rotation.x = 0.15 * air - brake * 0.6;
    P.tail.scale.x = 1 + brake * 0.7;
    P.tail.rotation.x = -brake * 0.4;
    P.feet.forEach((f) => (f.rotation.x = brake > 0.1 ? 1.3 - brake * 1.6 : THREE.MathUtils.lerp(0, 1.3, air)));
    bob = Math.sin(t * 20) * 0.003 * air;
  }
  if (fold > 0) foldWings(P, Math.min(1, fold));
  P.fly.position.y = THREE.MathUtils.lerp(STAND_Y, 0.13, gease(air)) + bump(c, 1.95, 2.3) * 0.01 + bob; // 짝! 할 때 폴짝
  if (c < 1.8 || c > 5.0) P.plant(0); // 걷는 동안은 발끝을 땅에 붙임
  P.fly.position.z = Math.sin(c / 6 * PI * 2) * 0.03; // 앞뒤로 조금씩 오감
  gBlink(P, t);
});

// 모이 먹기: 땅에 흩어진 모이를 하나씩 찾아 뒤뚱뒤뚱 가서 콕콕 쪼아 꿀꺽 (모이마다 2초, 세 알 다 먹으면 처음부터)
export const EAT_R = 0.05, EAT_N = 3;
export const eatStand = (i) => { const a = (((i % EAT_N) + EAT_N) % EAT_N) * (PI * 2 / EAT_N); return new THREE.Vector3(Math.cos(a) * EAT_R, 0, Math.sin(a) * EAT_R); };
export const eatYaw = (i) => { const d = eatStand(i).sub(eatStand(i - 1)); return Math.atan2(d.x, d.z); };
gmotion('모이 먹기', '모이 찾아 뒤뚱뒤뚱, 콕콕 쪼아 꿀꺽', EAT_N * 2, (c, P, t, X) => {
  const i = Math.floor(c / 2), u = c % 2;
  foldWings(P, 1);
  P.body.rotation.x = -0.12;
  const from = eatStand(i - 1), to = eatStand(i);
  const yaw0 = eatYaw(i - 1), yaw1 = eatYaw(i);
  const turn = gease(gseg(u, 0, 0.25));
  P.fly.rotation.y = yaw0 + Math.atan2(Math.sin(yaw1 - yaw0), Math.cos(yaw1 - yaw0)) * turn; // 짧은 쪽으로 돌기
  if (u < 0.8) { // 다음 모이로 아장아장
    P.fly.position.copy(from).lerp(to, gease(u / 0.8));
    waddle(P, u * PI * 5);
  } else {
    P.fly.position.copy(to);
    const peck = u < 1.4 ? Math.max(0, Math.sin((u - 0.8) * PI * 3.33)) : 0; // 콕, 콕
    P.body.rotation.x = -0.12 + peck * 0.6;
    P.head.rotation.x = peck * 0.6;
    P.tail.rotation.x = peck * 0.3;
    const gulp = bump(u, 1.45, 1.9); // 고개 들고 꿀꺽
    P.head.rotation.x -= gulp * 0.35;
    P.neck.scale.set(1 + gulp * 0.15, 1 + gulp * 0.2, 1 + gulp * 0.15);
  }
  // 모이: 먹힌 알만 사라지고, 한 바퀴 돌면 다시 뿌려짐
  X.seeds.forEach((sd, j) => {
    const st = eatStand(j), yw = eatYaw(j);
    sd.position.set(st.x + Math.sin(yw) * 0.062, 0.003, st.z + Math.cos(yw) * 0.062);
    const eaten = c > j * 2 + 1.25;
    sd.visible = !eaten;
    sd.scale.setScalar(Math.min(1, c * 4)); // 처음에 톡 나타남
  });
  P.fly.position.y = STAND_Y;
  P.plant(0);
  gBlink(P, t);
}, (P) => {
  const seeds = [];
  for (let j = 0; j < EAT_N; j++) {
    const sd = new THREE.Group();
    P.g.add(sd);
    for (const [x, z, r] of [[0, 0, 0.004], [0.006, 0.004, 0.003], [-0.005, 0.005, 0.0032]]) {
      mesh(ball(r, 10).scale(1, 0.6, 1.4).translate(x, 0, z), mat(j === 1 ? '#e8b86a' : '#e2c27a', 0.8), sd, '모이');
    }
    seeds.push(sd);
  }
  return { seeds };
});

// 3. 발견!: 날개를 짝! 맞부딪치고 목 쭉, 고개를 옆으로 돌려 한쪽 눈으로 빤히 + 까딱까딱
gmotion('발견!', '날개 짝! 치고 한쪽 눈으로 빤히', 2.6, (c, P, t) => {
  const clap = bump(c, 0.2, 0.45); // 날개 위로 짝
  const k = gease(gseg(c, 0.4, 0.55)) * (1 - gease(gseg(c, 2.2, 2.5)));
  if (c > 0.2 && c < 0.45) P.wings.forEach(([w, s, h]) => { w.rotation.z = s * clap * 1.5; h.rotation.z = s * clap * 0.4; });
  else P.flap(t, 20, 0.9 - k * 0.3, 0.2);
  P.fly.position.y += clap * 0.02;
  P.neck.scale.y = 1 + k * 0.25; // 목 쭉
  P.head.position.y += k * 0.008;
  P.head.position.z += k * 0.004;
  P.head.rotation.y = k * 1.0; // 고개 옆으로: 한쪽 눈으로 빤히
  if (c > 0.8 && c < 2.1) P.bob(t, 3.5, 0.006 * k); // 빤히 보면서 까딱까딱
  P.eyes.forEach((e) => e.scale.setScalar(1 + k * 0.35));
  P.feet.forEach((f) => (f.rotation.x = 1.3 - k * 0.9)); // 놀라서 발이 툭 내려옴
});

// 4. 화남: 비둘기 과시. 목을 빵빵하게 부풀리고 꼬리를 부채처럼 펴고 고개를 숙였다 들며 빙글 (구구구구)
gmotion('화남!', '목 빵빵, 꼬리 쫙, 꾸벅꾸벅 빙글 구구구구', 3.2, (c, P, t, X) => {
  const k = gease(gseg(c, 0.15, 0.4)) * (1 - gease(gseg(c, 2.8, 3.1)));
  P.flap(t, 16, 0.6, 0.35); // 날갯짓은 작게
  P.neck.scale.set(1 + k * 0.45, 1 + k * 0.3, 1 + k * 0.45); // 목 빵빵
  P.body.scale.set(1 + k * 0.08, 1 + k * 0.08, 1);
  const bow = Math.max(0, Math.sin(c * PI * 2.2)) * k; // 꾸벅 (고개 숙이며 구구)
  P.body.rotation.x = -0.25 * k + bow * 0.45;
  P.head.rotation.x = bow * 0.3;
  P.tail.scale.x = 1 + k * 0.7; // 꼬리 부채
  P.tail.rotation.x = -k * 0.35; // 꼬리를 아래로 끌듯이
  P.fly.rotation.y = Math.sin(c * PI * 0.9) * 0.8 * k; // 빙글 반 바퀴씩
  P.eyes.forEach((e) => (e.scale.y = 1 - k * 0.35));
  X.mark.visible = k > 0.05;
  X.mark.scale.setScalar(0.028 * angerPulse(c - 0.2, t) * Math.min(1, k * 2));
}, (P) => {
  const mark = angerMark();
  mark.position.set(0.028, 0.034, 0);
  P.head.add(mark);
  return { mark };
});

// 5. 공격: 위로 올라 날개 접고 쑥 내리꽂기 → 날개로 찰싹찰싹 때리고 콕콕 → 다시 올라감
gmotion('공격 (쪼기)', '내리꽂아 날개로 찰싹, 부리로 콕콕', 2.6, (c, P, t) => {
  const up = gease(gseg(c, 0.1, 0.5));
  const dive = gease(gseg(c, 0.5, 0.72));
  const back = gease(gseg(c, 1.7, 2.4));
  P.fly.position.y += up * 0.03 - dive * 0.11 + back * 0.08;
  P.fly.position.z = dive * 0.04 * (1 - back);
  P.body.rotation.x = -up * 0.35 * (1 - dive) + dive * 0.6 * (1 - back);
  const hit = c > 0.72 && c < 1.7;
  if (c > 0.5 && c <= 0.72) { P.glide(0.15); P.sweep(1); } // 날개 뒤로 접고 쑥
  else if (hit) { // 날개를 앞으로 휘둘러 찰싹 + 콕콕
    const sl = Math.abs(Math.sin((c - 0.72) * PI * 3));
    P.wings.forEach(([w, s, h]) => { w.rotation.z = s * (0.9 - sl * 0.9); w.rotation.y = -s * sl * 0.9; h.rotation.z = -s * sl * 0.3; });
    const peck = Math.abs(Math.sin((c - 0.72) * PI * 5));
    P.head.rotation.x = peck * 0.7;
    P.head.position.z += peck * 0.008;
  } else P.flap(t, 22 + back * 8, 1.0, 0.2);
  P.tail.scale.x = 1 + (hit ? 0.5 : 0);
  P.feet.forEach((f) => (f.rotation.x = hit ? 0.2 : 1.3)); // 발도 앞으로 내밀어 할퀴는 척
});

// 6. 맞음: 깃털이 펑 빠지고 뒤로 퉁, 날개 허우적
gmotion('맞음', '깃털 펑! 뒤로 퉁 튕겨 허우적', 1.6, (c, P, t, X) => {
  const k = Math.exp(-c * 5) * (c > 0.1 ? 1 : 0);
  P.fly.position.z = -k * 0.05;
  P.fly.position.y += k * 0.02;
  P.body.rotation.x = -k * 1.1;
  P.body.rotation.z = Math.sin(c * 30) * k * 0.4;
  P.wings.forEach(([w, s, h], i) => { // 양쪽이 엇박자로 허우적
    w.rotation.z = s * (0.4 + Math.sin(t * 30 + i * 2) * (0.5 + k));
    h.rotation.z = s * Math.sin(t * 30 + i * 2 - 1) * 0.5;
  });
  P.neck.scale.setScalar(1 - k * 0.2); // 움츠림
  P.feet.forEach((f) => (f.rotation.x = 1.3 - k * 1.2));
  P.blink(c > 0.1 && c < 0.7 ? 1 : 0);
  X.puff(c - 0.1, P.fly.position);
}, (P) => ({ puff: featherPuff(P) }));

// 7. 쓰러짐: 허우적대다 날개가 만세로 굳고 빙글빙글 추락, 뒤집혀서 발만 파르르
gmotion('쓰러짐', '허우적… 빙글 추락, 발 하늘로 파르르', 4, (c, P, t, X) => {
  const stop = gease(gseg(c, 0.3, 0.6));
  const fall = gseg(c, 0.5, 1.2);
  const land = c > 1.2;
  P.wings.forEach(([w, s, h], i) => {
    const lie = gease(gseg(c, 1.0, 1.3)); // 뒤집혀 누우면 날개를 양옆으로 납작하게 (만세 그대로면 땅을 뚫음)
    w.rotation.z = s * THREE.MathUtils.lerp(0.2 + stop * 0.9 + Math.sin(t * 28 + i * 2) * (1 - stop), -0.15, lie);
    h.rotation.z = s * THREE.MathUtils.lerp(stop * 0.2 + Math.sin(t * 28 + i * 2 - 1) * 0.5 * (1 - stop), -0.1, lie);
  });
  P.fly.position.y = land ? GROUND_Y + bump(c, 1.2, 1.4) * 0.012 : 0.13 - (0.13 - GROUND_Y) * fall * fall;
  P.body.rotation.y = land ? 3 * PI : fall * 3 * PI;
  P.body.rotation.z = gease(gseg(c, 0.9, 1.25)) * PI;
  P.tail.scale.x = 1 + stop * 0.5;
  P.blink(stop);
  P.feet.forEach((f, i) => (f.rotation.x = land ? 0.1 + Math.sin(t * 20 + i) * 0.3 * Math.max(0, 1 - (c - 1.3) * 1.2) : 1.3));
  X.puff(c - 1.2, new THREE.Vector3(0, 0.02, 0));
}, (P) => ({ puff: featherPuff(P, 4) }));

// 8. 등장: 위에서 날개 V 자로 들고 스르륵 내려오다, 몸을 세우고 발 내밀며 파닥파닥 브레이크
gmotion('등장', 'V 자로 스르륵 내려와 파닥파닥 브레이크', 2.2, (c, P, t) => {
  const k = gseg(c, 0, 0.8);
  const brake = bump(c, 0.6, 1.3);
  P.fly.scale.setScalar(c < 0.05 ? 0 : 1);
  P.fly.position.y += (1 - gease(k)) * 0.22;
  P.fly.position.z = (1 - gease(k)) * -0.08;
  if (c < 0.6) P.glide(0.4);
  else P.flap(t, 26, 1.1, 0.3);
  P.body.rotation.x = 0.15 * (1 - k) - brake * 0.6; // 브레이크 땐 몸을 세움
  P.tail.scale.x = 1 + brake * 0.7;
  P.tail.rotation.x = -brake * 0.4;
  P.feet.forEach((f) => (f.rotation.x = 1.3 - brake * 1.6)); // 발 앞으로 쭉
  gBlink(P, t);
});


// 동작이 바뀌는 순간 자세가 툭 튀지 않게 (관성 블렌딩): 한 프레임에 예상보다 확 튄 만큼을 기억했다가 0.2초쯤에 걸쳐 스르르 풀어 줌
// 원래 빠른 움직임(날갯짓)은 매 프레임 비슷하게 움직이니 건드리지 않고, 갑자기 꺾인 곳만 잡음
export const SMOOTH_THR = [0.003, 0.003, 0.003, 0.3, 0.3, 0.3, 0.08, 0.08, 0.08]; // 위치·회전·크기
export function poseSmoother(roots) {
  const objs = [];
  roots.forEach((r) => r.traverse((o) => { if (o !== r) objs.push([o, r]); }));
  const st = new Map();
  const read = (o) => [o.position.x, o.position.y, o.position.z, o.rotation.x, o.rotation.y, o.rotation.z, o.scale.x, o.scale.y, o.scale.z];
  const shown = (o, r) => { for (let p = o; p && p !== r.parent; p = p.parent) if (!p.visible) return false; return true; };
  const wrap = (d, k) => (k >= 3 && k < 6 ? Math.atan2(Math.sin(d), Math.cos(d)) : d);
  let lastT = null;
  return (t) => {
    const dt = lastT === null ? -1 : t - lastT;
    lastT = t;
    const fresh = !(dt > 0 && dt < 0.25); // 처음이거나 시간이 건너뛰면 그냥 원래 자세
    const decay = Math.exp(-dt / 0.06);
    for (const [o, r] of objs) {
      let raw = read(o);
      const s = st.get(o);
      if (!shown(o, r)) { st.delete(o); continue; } // 숨었다 나타나면 새로 시작 (사라진 자리에서 미끄러져 오지 않게)
      if (fresh || !s) { st.set(o, { raw, v: null, off: raw.map(() => 0), out: raw }); continue; }
      if (raw.every((x, k) => x === s.out[k])) raw = s.raw; // 이번 프레임에 아무도 안 건드린 부품 → 원래 값은 지난번 그대로
      const out = [];
      for (let k = 0; k < 9; k++) {
        const v = wrap(raw[k] - s.raw[k], k);
        const jerk = s.v ? v - s.v[k] : 0; // 처음 한 프레임은 속도를 모르니 그냥 지나감
        s.off[k] *= decay;
        if (Math.abs(jerk) > SMOOTH_THR[k] && Math.abs(jerk) > 2.5 * Math.abs(s.v[k] - (s.pv?.[k] ?? 0))) s.off[k] -= jerk;
        out.push(raw[k] + s.off[k]);
      }
      s.pv = s.v;
      s.v = raw.map((x, k) => wrap(x - s.raw[k], k));
      s.raw = raw;
      s.out = out;
      o.position.set(out[0], out[1], out[2]);
      o.rotation.set(out[3], out[4], out[5]);
      o.scale.set(out[6], out[7], out[8]);
    }
  };
}

// ── 게임용 구구: 땅을 뒤뚱뒤뚱 걷고 모이를 콕콕, 가끔 짝! 날아올랐다 내려앉음 ──
// 시안 동작(공중에서 만든 것)은 땅에 선 높이에서 시작하도록 fly 높이를 먼저 내려놓고 부름
const motionOf = (name) => GUGU_MOTIONS.find((m) => m.name === name);
const FLY_Y = 0.13; // makePigeon 의 fly 기본 높이 (공중)
const FOOT = new Set(['발', '발가락', '발톱']);
export const GUGU_STATES = {
  idle: { label: '대기 (두리번 까딱)', loop: true },
  walk: { label: '걷기 (뒤뚱뒤뚱)', loop: true },
  peck: { label: '모이 콕콕 꿀꺽', dur: 2.0 },
  fly: { label: '짝! 날아올랐다 내려앉기', dur: 3.4 },
  notice: { label: '발견! (짝)', dur: 1.3 },
  angry: { label: '화남! (목 빵빵)', dur: 1.6 },
  attack: { label: '공격 (쪼기)', dur: 1.7 },
  hit: { label: '맞음 (깃털 펑)', dur: 1.0 },
  die: { label: '쓰러짐', dur: 3.4 },
  spawn: { label: '등장 (스르륵 내려앉음)', dur: 1.2 },
  // 나들이 (게임이 setAir 로 높이·빠르기를 정함): 짝! 날아올라 파닥파닥 · 어딘가 위에 앉아 쉼
  air: { label: '날기 (나들이)', loop: true },
  perch: { label: '앉아 쉬기 (나무·머리 위)', loop: true },
};

export function createGugu({ onDone = null, outlineScale = 1 } = {}) {
  const P = makePigeon();
  const root = P.g; // 첫 자식(fly)이 몸 전체: 그림자가 이 크기·높이를 따라감
  root.name = '구구';
  const X = {};
  for (const m of GUGU_MOTIONS) if (['화남!', '맞음', '쓰러짐'].includes(m.name)) X[m.name] = m.extra(P);
  const feathers = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.userData.outlineWidth = FOOT.has(o.name) ? 0.0012 : 0.002; // 부품 크기와 상관없이 같은 두께 (가는 발은 가늘게)
    if (o.name === '깃털') feathers.push(o);
  });
  const smooth = poseSmoother([root]); // 동작이 바뀌어도 자세가 툭 튀지 않게
  const run = (name, c) => motionOf(name).fn(c, P, t, X[name]);
  const stand = () => {
    foldWings(P, 1);
    P.fly.position.y = STAND_Y;
    P.body.rotation.x = -0.12;
  };

  let state = 'idle';
  let u = 0;
  let t = 0;
  let lift = 0; // 나들이 높이 (구구 크기 기준): 땅 0, 앉은 자리 윗면 또는 나는 높이
  let move = 0; // 앞으로 날아가는 정도 0~1 (몸을 앞으로 눕힘)
  let brake = 0; // 내려앉으려 브레이크 거는 정도 0~1 (몸 세우고 발 내밂)
  let shake = 0; // 앉은 자리가 들썩이는 정도 0~1 (휘청휘청)
  let down = 0; // 밑을 내려다보는 정도 0~1
  function play(name) {
    if (!GUGU_STATES[name] && name !== 'gone') return;
    state = name;
    u = 0;
  }

  function update(dt) {
    t += dt;
    u += dt;
    P.reset();
    feathers.forEach((f) => (f.visible = false));
    X['화남!'].mark.visible = false;
    if (state === 'idle') { // 두리번두리번, 가끔 고개 까딱
      stand();
      P.head.rotation.y = (Math.sin(t * 0.7) + Math.sin(t * 1.9) * 0.5) * 0.45;
      P.bob(t, 0.9, 0.005);
      gBlink(P, t);
      P.plant(0);
    } else if (state === 'walk') {
      stand();
      waddle(P, t * PI * 2.6);
      gBlink(P, t);
      P.plant(0);
    } else if (state === 'peck') { // 콕, 콕, 콕 → 고개 들고 꿀꺽
      stand();
      const peck = u < 1.2 ? Math.max(0, Math.sin(u * PI * 2.5)) : 0;
      P.body.rotation.x = -0.12 + peck * 0.6;
      P.head.rotation.x = peck * 0.6;
      P.tail.rotation.x = peck * 0.3;
      const gulp = bump(u, 1.35, 1.85);
      P.head.rotation.x -= gulp * 0.35;
      P.neck.scale.set(1 + gulp * 0.15, 1 + gulp * 0.2, 1 + gulp * 0.15);
      gBlink(P, t);
      P.plant(0);
    } else if (state === 'fly') {
      run('걷다 날기', 1.7 + u); // 짝! → 한 바퀴 파닥 → 발 내밀고 브레이크 → 사뿐
      P.fly.position.z = 0; // 자리는 게임이 정함
    } else if (state === 'notice') { // 날개 짝! 치고 목 쭉, 한쪽 눈으로 빤히
      stand();
      const clap = bump(u, 0.05, 0.3);
      const k = gease(gseg(u, 0.25, 0.4)) * (1 - gease(gseg(u, 1.0, 1.3)));
      P.wings.forEach(([w, s, h]) => { w.rotation.z = s * clap * 1.5; h.rotation.z = s * clap * 0.4; });
      foldWings(P, 1 - clap);
      P.fly.position.y += clap * 0.012;
      P.neck.scale.y = 1 + k * 0.25;
      P.head.position.y += k * 0.008;
      P.head.rotation.y = k;
      P.eyes.forEach((e) => e.scale.setScalar(1 + k * 0.35));
      P.plant(0, 1 - clap);
    } else if (state === 'angry') {
      P.fly.position.y = STAND_Y + 0.02;
      run('화남!', u * 2);
    } else if (state === 'attack') { // 쪼기: 0.47초에 부리가 닿음 (시안 0.72초)
      P.fly.position.y = STAND_Y + 0.02;
      run('공격 (쪼기)', u * 1.53);
      P.fly.position.z = 0;
    } else if (state === 'hit') {
      P.fly.position.y = STAND_Y;
      run('맞음', u * 1.6);
    } else if (state === 'die') { // 허우적 → 빙글 넘어져 뒤집힘 → 발 파르르 → 펑 작아짐
      const c = Math.min(u, 3.0);
      run('쓰러짐', c);
      if (c < 1.2) P.fly.position.y -= (FLY_Y - STAND_Y) * (1 - gseg(c, 0.5, 1.2)); // 공중이 아니라 선 자리에서 넘어짐
      P.fly.scale.setScalar(Math.max(0.0001, 1 - gease(gseg(u, 3.0, 3.4))));
    } else if (state === 'spawn') { // 위에서 스르륵 내려와 파닥파닥 브레이크 → 날개 접고 섬
      P.fly.position.y = STAND_Y;
      run('등장', u);
      const k = gseg(u, 0.9, 1.2);
      if (k > 0) {
        foldWings(P, k);
        P.feet.forEach((f) => (f.rotation.x *= 1 - k));
        P.plant(0, k);
      }
    } else if (state === 'air') {
      const clap = bump(u, 0, 0.22); // 처음엔 날개를 위로 짝! (접은 날개를 펴면서)
      if (u < 0.22) {
        P.wings.forEach(([w, s, h]) => { w.rotation.z = s * clap * 1.5; h.rotation.z = s * clap * 0.4; });
        foldWings(P, 1 - gease(gseg(u, 0, 0.12)));
      } else P.flap(t, 20 + brake * 8, 1.0 + brake * 0.1, 0.2 + brake * 0.1);
      P.fly.position.y = STAND_Y + lift + clap * 0.012 + Math.sin(t * 20) * 0.003 * (1 - brake);
      P.body.rotation.x = 0.15 * move - brake * 0.55;
      P.tail.scale.x = 1 + brake * 0.7;
      P.tail.rotation.x = -brake * 0.4;
      P.feet.forEach((f) => (f.rotation.x = u < 0.22 ? -0.2 : 1.3 - brake * 1.6)); // 날 땐 발을 접고, 내려앉을 땐 앞으로 쭉
      P.head.rotation.x = 0.4 * down;
      P.head.rotation.y = -0.5 * down;
      gBlink(P, t);
    } else if (state === 'perch') { // 앉아 쉼: 두리번 까딱, 자리가 들썩이면 휘청휘청 날개로 버팀
      foldWings(P, 1);
      P.fly.position.y = STAND_Y + lift;
      P.body.rotation.x = -0.1;
      P.head.rotation.y = (Math.sin(t * 0.8) + Math.sin(t * 2.1) * 0.5) * 0.45 * (1 - shake);
      P.bob(t, 1.4, 0.006 * (1 - shake));
      if (shake > 0) {
        P.body.rotation.z = Math.sin(t * 16) * 0.18 * shake;
        P.body.rotation.x += Math.sin(t * 11) * 0.1 * shake;
        P.head.rotation.x = 0.35 * shake; // 밑을 내려다봄
        P.head.rotation.y -= 0.7 * shake;
        P.eyes.forEach((e) => e.scale.setScalar(1 + 0.4 * shake));
        P.wings.forEach(([w, s]) => (w.rotation.z += s * Math.abs(Math.sin(t * 20)) * 0.4 * shake));
      } else P.head.rotation.x = 0.4 * down;
      gBlink(P, t);
      P.plant(lift);
    } else if (state === 'gone') {
      P.fly.scale.setScalar(0.0001);
    }
    smooth(t);
    P.keepAbove(0);

    const M = GUGU_STATES[state];
    if (M && !M.loop && u >= M.dur) {
      const ended = state;
      play(ended === 'die' ? 'gone' : 'idle');
      onDone?.(ended);
    }
    syncToon(root, true, outlineScale);
  }

  return {
    root,
    play,
    update,
    setMood() {}, // 중립형이라 화난 채로 다니지 않음
    // 나들이(air·perch) 자세: h 높이(구구 크기 기준) · mv 앞으로 나는 정도 · br 브레이크 · sh 앉은 자리 들썩임 · dn 밑을 내려다봄 (모두 0~1)
    setAir(h, mv = 0, br = 0, sh = 0, dn = 0) { lift = h; move = mv; brake = br; shake = sh; down = dn; },
    get state() { return state; },
    get time() { return u; }, // 지금 동작을 시작한 지 (초)
  };
}
