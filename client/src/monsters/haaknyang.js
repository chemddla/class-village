// 하악냥: 하악질은 하는데 너무 작아서 하나도 안 무서운 새끼 고양이 몬스터
// 다른 몬스터와 같은 방식: createHaaknyang() 의 root 를 장면에 넣고 매 프레임 update(dt), 동작은 play('walk') 처럼 바꾼다
// 몸·얼굴·동작은 몬스터 시안 화면(monsters.html?set=haak, haakEyes)과 같은 코드를 함께 쓴다
import * as THREE from 'three';
import { syncToon } from '../villager/toon.js';
import { angerMark, angerPulse } from './anger.js';
import { canvasTexture } from '../villager/textures.js';

const PI = Math.PI;
const mat = (color, rough = 0.6) => new THREE.MeshStandardMaterial({ color, roughness: rough });
const BLACK = mat('#2b1d14', 0.3);
const WHITE = mat('#ffffff', 0.3);
const BLUSH = mat('#ff9fae', 0.8);
export const PINK = mat('#ffb3c1', 0.8);
function mesh(geo, m, parent, name = '부품') {
  const o = new THREE.Mesh(geo, m);
  o.name = name;
  o.castShadow = true;
  parent.add(o);
  return o;
}
const ball = (r, n = 32) => new THREE.SphereGeometry(r, n, Math.round(n * 0.75));
function blush(parent, { x, y, z, r = 0.012 }) {
  for (const s of [-1, 1]) {
    const b = mesh(ball(r, 16), BLUSH, parent, '눈');
    b.position.set(s * x, y, z);
    b.scale.set(1.4, 0.7, 0.3);
  }
}
export const csm = (x, a, b) => THREE.MathUtils.smoothstep(x, a, b);
export const bump = (c, a, b) => (c > a && c < b ? Math.sin(((c - a) / (b - a)) * PI) : 0); // a~b 동안 0 → 1 → 0
const seg = (u, a, b) => THREE.MathUtils.clamp((u - a) / (b - a), 0, 1);
const ease = (x) => x * x * (3 - 2 * x);
const outBack = (x, s = 2) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2);

// 세모 귀 한 쌍 (안쪽은 분홍). [회전축, 좌우] 목록을 돌려줘서 귀를 접었다 폈다 할 수 있다
function catEars(parent, color, { x, y, z = 0, h = 0.028, r = 0.015, tilt = 0.35 }) {
  const ears = [];
  const fur = mat(color, 0.8);
  for (const s of [-1, 1]) {
    const piv = new THREE.Group();
    piv.position.set(s * x, y, z);
    piv.rotation.z = -s * tilt;
    parent.add(piv);
    // 밑동 30%를 머리 속에 묻어서 귀를 움직여도 머리에서 떨어져 보이지 않게
    const H = h * 1.3, sink = H * 0.3;
    const half = (rr, hh, sz, front) => {
      const geo = new THREE.ConeGeometry(rr, hh, 16, 10, true, front ? -PI / 2 : PI / 2, PI);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) { // 끝으로 갈수록 덜 가늘어지게 해서 귀 끝을 둥글고 뭉툭하게
        const h = (p.getY(i) + hh / 2) / hh;
        const f = h < 0.999 ? (1 - h) ** 0.6 / (1 - h) : 0;
        p.setX(i, p.getX(i) * f);
        p.setZ(i, p.getZ(i) * f);
      }
      geo.computeVertexNormals();
      return geo.scale(1, 1, sz).translate(0, hh / 2 - sink, 0);
    };
    mesh(half(r, H, 0.5, false), fur, piv, '귀'); // 뒤쪽 털
    mesh(half(r, H, 0.14, true), fur, piv, '귀'); // 앞쪽 털 테두리
    mesh(half(r * 0.8, H * 0.82, 0.32, true), PINK, piv, '눈'); // 분홍 안쪽: 앞면을 넓게 채움
    ears.push([piv, s]);
  }
  return ears;
}
// 고양이 얼굴: 점 눈 + 볼터치 + ω 입 + 수염. 둥근 머리(R, 가로 늘임 sx)면 표면에, front 가 있으면 그 평면에 붙인다
// 눈 부품을 얼굴 표면에 납작하게 눌러 붙인다 (그려진 것처럼). 부품끼리 앞뒤 순서(흰자 < 눈동자 < 반짝이)는 그대로 남긴다
function paintOnFace(p, root, anchorZ, zAt) {
  root.traverse((m) => {
    if (!m.isMesh) return;
    const M = new THREE.Matrix4();
    for (let o = m; o !== p; o = o.parent) { o.updateMatrix(); M.premultiply(o.matrix); }
    const geo = m.geometry.clone().applyMatrix4(M);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      pos.setZ(i, zAt(x, y) + 0.00025 + (pos.getZ(i) - anchorZ) * 0.15);
    }
    geo.applyMatrix4(M.invert());
    geo.computeVertexNormals();
    m.geometry = geo;
    // 그린 부품은 빛을 받지 않는 단색으로 (명암 그라데이션 없이)
    const src = m.material;
    m.material = new THREE.MeshBasicMaterial({ color: src.color, transparent: src.transparent, opacity: src.opacity });
    m.userData.toon = true; // 툰 재질로 다시 바뀌지 않게 (윤곽선도 두르지 않음)
  });
}
function catFace(p, { R = 0.038, sx = 1, sy = 1, front = null, x = 0.015, y = 0.004, r = 0.0065, sleepy = false, cheek = true, eye = null, flat = false }) {
  const zAt = (xx, yy) => front ?? Math.sqrt(Math.max(0, R * R - (xx / sx) ** 2 - (yy / sy) ** 2));
  const open = new THREE.Group(), shut = new THREE.Group();
  p.add(open, shut);
  const eyes = [];
  for (const s of [-1, 1]) {
    const e = new THREE.Group();
    e.position.set(s * x, y, zAt(x, y));
    open.add(e);
    if (eye) eye(e, s, r); else {
      mesh(ball(r, 16).scale(1, 1.25, 0.6), BLACK, e, '눈');
      const hl = mesh(ball(r * 0.35, 8), WHITE, e, '눈');
      hl.position.set(r * 0.35, r * 0.45, r * 0.55);
    }
    eyes.push(e);
    // 감은 눈: 아래로 휜 실눈 (‿)
    const c = mesh(new THREE.TorusGeometry(r * 0.9, r * 0.22, 6, 12, PI), BLACK, shut, '눈');
    c.position.set(s * x, y + r * 0.3, zAt(x, y) + 0.001);
    c.rotation.z = PI;
    if (flat) {
      paintOnFace(p, e, e.position.z, zAt);
      paintOnFace(p, c, c.position.z, zAt);
    }
  }
  shut.visible = sleepy;
  open.visible = !sleepy;
  if (cheek) blush(p, { x: x * 1.9, y: y - 0.01, z: zAt(x * 1.9, y - 0.01) - 0.001, r: r * 1.05 });
  const my = y - 0.013;
  const mouth = new THREE.Group();
  mouth.position.set(0, my, zAt(0, my) + 0.001);
  p.add(mouth);
  for (const s of [-1, 1]) { // ω
    const m = mesh(new THREE.TorusGeometry(r * 0.5, r * 0.15, 6, 12, PI), BLACK, mouth, '눈');
    m.position.x = s * r * 0.5;
    m.rotation.z = PI;
  }
  mesh(ball(r * 0.35, 10).scale(1.3, 0.8, 0.6), PINK, mouth, '눈').position.y = r * 0.35; // 코
  const whiskers = [];
  for (const s of [-1, 1]) for (const k of [-1, 1]) { // 수염
    const len = 0.024;
    const w = mesh(new THREE.CylinderGeometry(0.0007, 0.0007, len, 4).rotateZ(PI / 2).translate(s * len / 2, 0, 0), BLACK, p, '눈');
    const wx = x * 2.1, wy = my + k * 0.002;
    w.position.set(s * wx, wy, zAt(wx, wy));
    w.rotation.set(0, -s * 0.35, s * k * 0.2);
    whiskers.push([w, s, k]);
  }
  return {
    eyes, mouth, open, shut, zAt,
    blink(k) { eyes.forEach((e) => (e.scale.y = Math.max(0.08, 1 - k))); },
    sleep(on) { shut.visible = on; open.visible = !on; },
    // 수염 흔들기: up 은 끝이 위로(+)/아래로(-), back 은 끝이 뒤로(+)/앞으로(-), 위아래 수염은 조금씩 다르게
    whisk(up, back) {
      whiskers.forEach(([w, s, k]) => w.rotation.set(0, -s * 0.35 + s * back * (1 + 0.25 * k), s * k * 0.2 + s * up * (1 - 0.2 * k)));
    },
  };
}
function catTail(parent, color, pts, r = 0.006) {
  const curve = new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q)));
  const tail = new THREE.Group();
  parent.add(tail);
  const fur = mat(color, 0.8);
  mesh(new THREE.TubeGeometry(curve, 24, r, 8), fur, tail, '꼬리');
  for (const end of [0, 1]) mesh(ball(r, 10), fur, tail, '꼬리').position.copy(curve.getPoint(end));
  return tail;
}

// ── 하악냥 몸 ──
// g > move(이동·방향) > body(바닥 가운데 기준 기울기) > 몸통·다리·머리·꼬리
const HAAK_LINE = 0.0022;
const LEG_Y = 0.026; // 다리 회전축 높이 (몸통 속)
// 새끼 고양이 다리: 위는 통통, 아래로 갈수록 가늘어지는 짧은 다리. 뒷다리는 발목이 살짝 뒤로 꺾인다 (회전축이 y=0, 발바닥 쪽이 -y)
function kittenLeg(hind) {
  // 발바닥부터 몸통 속 끝까지 부드러운 곡선 하나로 굵기를 정한다: 동그란 발 → 가는 발목 → 통통한 윗다리 → 둥근 끝
  const top = hind ? 0.0072 : 0.0074;
  const B = -LEG_Y;
  const ctrl = [
    [0.0001, B], [0.0036, B + 0.0003], [0.0056, B + 0.0028], [0.0052, B + 0.0068], [0.0047, -0.015],
    [0.0054, -0.009], [top * 0.9, -0.003], [top, 0.002], [top * 0.85, 0.007], [0.0001, 0.0105],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const prof = new THREE.SplineCurve(ctrl).getPoints(40);
  prof[0].set(0.0001, B);
  prof[prof.length - 1].set(0.0001, 0.0105);
  const geo = new THREE.LatheGeometry(prof, 28);
  const p = geo.attributes.position;
  const gauss = (v, c, w) => Math.exp(-(((v - c) / w) ** 2));
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    let z = p.getZ(i);
    const u = THREE.MathUtils.clamp(-y / LEG_Y, 0, 1); // 0 뿌리 ~ 1 발바닥
    const paw = THREE.MathUtils.smoothstep(u, 0.62, 0.92); // 발: 앞으로 살짝 길쭉
    z = z * (1 + 0.35 * paw) + 0.0016 * paw;
    if (hind) { // 뒷다리: 허벅지는 앞뒤로 도톰하고 뒤로 빠졌다가 발목에서 앞으로
      z = z * (1 + 0.12 * gauss(y, 0.0, 0.009)) - 0.0014 * gauss(y, -0.004, 0.009) + 0.0016 * paw;
    } else {
      z += 0.0012 * u * u; // 앞다리: 아래로 갈수록 살짝 앞으로
    }
    p.setZ(i, z);
  }
  geo.computeVertexNormals();
  return geo;
}
// 새끼 고양이 몸통: 공을 앞뒤로 늘인 뒤 엉덩이는 동글 통통, 허리는 살짝 잘록, 가슴은 앞으로 솟아 목으로 이어지고,
// 배는 아래로 볼록, 등은 살짝 평평하게 다듬는다 (+z 가 앞)
function kittenBody() {
  const geo = ball(1, 48);
  const p = geo.attributes.position;
  const gauss = (u, c, w) => Math.exp(-(((u - c) / w) ** 2));
  const L = 0.037, R = 0.023;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), u = p.getZ(i); // u: -1 엉덩이 ~ 1 가슴
    // 굵기 변화는 넓고 완만하게 (엉덩이 조금 통통, 허리 아주 살짝, 가슴 조금)
    const m = 1 + 0.06 * gauss(u, -0.4, 0.55) - 0.025 * gauss(u, 0.15, 0.4) + 0.03 * gauss(u, 0.55, 0.45);
    // 위아래 비율은 꺾이는 곳 없이 한 줄로: 위쪽은 조금 납작, 아래쪽은 조금 둥글게
    const yy = y * (0.97 - 0.04 * y);
    const lift = 0.006 * THREE.MathUtils.smoothstep(u, -0.3, 1); // 가슴 쪽이 부드럽게 올라가 목으로 이어짐
    p.setXYZ(i, x * R * m * 0.97, yy * R * m * 0.92 + lift, u * L);
  }
  geo.computeVertexNormals();
  return geo;
}
function makeHaak({ eye = HAAK_EYES.bean.build } = {}) { // 기본 눈: 세로 콩눈
  const C = '#cfc8c0';
  const fur = mat(C, 0.85);
  const g = new THREE.Group(), move = new THREE.Group(), body = new THREE.Group();
  g.add(move);
  move.add(body);
  const torso = new THREE.Group();
  body.add(torso);
  mesh(kittenBody(), fur, torso, '몸');
  // 다리: 회전축(어깨·엉덩이)을 몸통 속 깊이 두고, 다리 윗부분도 몸통 속까지 올려서 흔들어도 이음매가 드러나지 않게
  const legs = [[-0.012, 0.019, false], [0.012, 0.019, false], [-0.0105, -0.019, true], [0.0105, -0.019, true]].map(([x, z, hind]) => {
    const l = new THREE.Group();
    l.position.set(x, LEG_Y, z);
    l.userData.y0 = LEG_Y;
    body.add(l);
    mesh(kittenLeg(hind), fur, l, '다리');
    return l;
  });
  const head = new THREE.Group();
  body.add(head);
  mesh(ball(0.03).scale(1.1, 0.95, 1), fur, head, '머리');
  const ears = catEars(head, C, { x: 0.019, y: 0.02, h: 0.024, r: 0.013 });
  const face = catFace(head, { R: 0.03, sx: 1.1, sy: 0.95, x: 0.012, y: 0.004, r: 0.0058, cheek: false, eye, flat: true });
  // 벌린 입: ω 바로 밑에 매달려 아래로 벌어진다. 어두운 입속 + 아랫입술 위로 살짝 나온 분홍 혓바닥
  const roar = new THREE.Group();
  roar.position.set(0, -0.0012, 0);
  face.mouth.add(roar);
  mesh(ball(0.0062, 18).scale(1.05, 1, 0.3), mat('#5c2431', 0.7), roar, '입').position.set(0, -0.0052, 0.0004);
  const tongue = new THREE.Group();
  tongue.position.set(0, -0.0082, 0.0018);
  tongue.rotation.x = 0.4; // 끝이 앞·아래로
  roar.add(tongue);
  mesh(ball(0.0044, 18).scale(1.15, 0.45, 1.15), mat('#ff8fa5', 0.5), tongue, '혀');
  mesh(new THREE.CapsuleGeometry(0.00045, 0.003, 4, 6).rotateX(PI / 2), mat('#e3657e', 0.6), tongue, '눈').position.set(0, 0.0019, 0.0008); // 가운데 홈
  // 입속과 혀도 얼굴 곡면에 납작하게 붙여서, 입을 벌려도 앞으로 툭 튀어나오지 않게
  face.mouth.updateMatrix();
  paintOnFace(head, roar, face.mouth.position.z, face.zAt);
  roar.traverse((o) => (o.userData.noOutline = true)); // 그린 입이라 윤곽선은 두르지 않음
  // 맞거나 쓰러질 때 쓰는 > < 질끈 눈 (평소엔 숨김)
  const squeeze = new THREE.Group();
  head.add(squeeze);
  face.eyes.forEach((e, i) => {
    const q = new THREE.Group();
    q.position.copy(e.position);
    squeeze.add(q);
    HAAK_EYES.squeeze.build(q, i === 0 ? -1 : 1, 0.0058);
    paintOnFace(head, q, q.position.z, face.zAt);
  });
  squeeze.visible = false;
  // 쓰러졌을 때 쓰는 X 눈 (평소엔 숨김)
  const cross = new THREE.Group();
  head.add(cross);
  face.eyes.forEach((e) => {
    const q = new THREE.Group();
    q.position.copy(e.position);
    cross.add(q);
    for (const a of [0.78, -0.78]) {
      const bar = mesh(new THREE.CapsuleGeometry(0.0058 * 0.22, 0.0058 * 1.9, 4, 8).rotateZ(PI / 2), BLACK, q, '눈');
      bar.rotation.z = a;
    }
    paintOnFace(head, q, q.position.z, face.zAt);
  });
  cross.visible = false;
  // 할짝할 때 입 밖으로 쏙 나오는 혀 (그린 혀가 아니라 앞으로 튀어나옴)
  const lickTongue = new THREE.Group();
  lickTongue.position.set(0, -0.0028, -0.001);
  face.mouth.add(lickTongue);
  mesh(ball(0.0028, 16).scale(1, 0.42, 1.6).translate(0, 0, 0.0036), mat('#ff8fa5', 0.5), lickTongue, '혀');
  lickTongue.visible = false;
  // 동작마다 바꿔 끼우는 입 모양 (모두 얼굴에 그린 듯 붙임). 기본은 ω
  const omega = face.mouth.children.filter((o) => o.isMesh && o.geometry.type === 'TorusGeometry');
  const darkMouth = mat('#5c2431', 0.7);
  const shapes = {};
  const shape = (name, build) => {
    const gr = new THREE.Group();
    face.mouth.add(gr);
    build(gr);
    paintOnFace(head, gr, face.mouth.position.z, face.zAt);
    gr.visible = false;
    shapes[name] = gr;
  };
  shape('o', (gr) => mesh(ball(0.0026, 16).scale(1, 1.25, 0.3), darkMouth, gr, '입').position.set(0, -0.0032, 0)); // 놀란 ㅇ
  shape('frown', (gr) => mesh(new THREE.TorusGeometry(0.0032, 0.0007, 6, 16, PI), BLACK, gr, '입').position.set(0, -0.0042, 0)); // 시무룩 ∩
  shape('wavy', (gr) => { // 울먹·겁먹은 물결 ~
    const pts = [];
    for (let i = 0; i <= 12; i++) pts.push(new THREE.Vector3(-0.0055 + (i / 12) * 0.011, -0.0026 + 0.0008 * Math.sin((i / 12) * PI * 4), 0));
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.00065, 5), BLACK, gr, '입');
  });
  shape('flat', (gr) => mesh(new THREE.CapsuleGeometry(0.0007, 0.006, 4, 6).rotateZ(PI / 2), BLACK, gr, '입').position.set(0, -0.0025, 0)); // 힘준 ㅡ
  shape('tongue', (gr) => mesh(ball(0.0024, 14).scale(1, 1.35, 0.35), mat('#ff8fa5', 0.5), gr, '혀').position.set(0.0012, -0.0032, 0)); // ω 밑으로 혀 빼꼼
  // 꼬리는 두 마디(뼈): 뿌리 쪽은 동작이 직접 움직이고, 끝 마디는 한 박자 늦게 따라와 휘청 휘어짐
  // 꼬리 전체를 관 하나로 만들고 두 뼈에 나눠 붙여서, 휘어도 이음매 없이 부드럽게 이어짐
  const tail = new THREE.Bone(); // 꼬리 뿌리
  tail.position.set(0, 0.036, -0.03);
  body.add(tail);
  const tailTip = new THREE.Bone();
  tailTip.position.set(0.002, 0.026, -0.015);
  tail.add(tailTip);
  {
    const TR = 0.005, SEG = 40, RAD = 12;
    const pts = [[0, 0, 0], [0, 0.014, -0.012], [0.002, 0.026, -0.015], [0.004, 0.035, -0.0145], [0.010, 0.045, -0.009]]; // 뿌리 기준
    const curve = new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q).add(tail.position)), false, 'centripetal');
    const geo = new THREE.TubeGeometry(curve, SEG, TR, RAD);
    const lens = curve.getLengths(200);
    const joint = lens[100] / lens[200]; // 가운데 점(이음매)이 꼬리 길이의 어디쯤인지
    const n = geo.attributes.position.count, idx = [], wt = [];
    for (let i = 0; i < n; i++) {
      const w = THREE.MathUtils.smoothstep(Math.floor(i / (RAD + 1)) / SEG, joint - 0.15, joint + 0.15); // 이음매 둘레는 두 뼈가 나눠 가짐
      idx.push(0, 1, 0, 0);
      wt.push(1 - w, w, 0, 0);
    }
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wt, 4));
    const tailFur = mat(C, 0.8);
    const sk = new THREE.SkinnedMesh(geo, tailFur);
    sk.name = '꼬리';
    body.add(sk);
    body.updateMatrixWorld(true);
    sk.bind(new THREE.Skeleton([tail, tailTip]));
    mesh(ball(TR, 12), tailFur, tailTip, '꼬리').position.set(0.008, 0.019, 0.006); // 꼬리 끝 동글
  }
  // 윤곽선 굵기를 부품 크기와 상관없이 모두 같게
  g.traverse((o) => { if (o.isMesh) o.userData.outlineWidth = HAAK_LINE; });
  const ws = { u: 0, uv: 0, b: 0, bv: 0, e: 0, ev: 0, tx: 0, txv: 0, tz: 0, tzv: 0, trx: 0, trz: 0, tprev: null, tp: new THREE.Vector3(), tv: new THREE.Vector3(), t: null, prev: null, tmp: new THREE.Vector3(), vel: new THREE.Vector3(), q: new THREE.Quaternion() };
  const solid = [];
  move.traverse((o) => { if (o.isMesh && ['몸', '머리', '다리', '꼬리'].includes(o.name)) solid.push(o); });
  return {
    // 땅 밑으로 파고든 만큼 통째로 들어 올림 (기울거나 찌부러져도 몸이 땅에 묻히지 않게)
    ground() {
      move.updateWorldMatrix(true, true);
      let min = Infinity;
      for (const m of solid) {
        if (!m.visible) continue;
        const p = m.geometry.attributes.position, e = m.matrixWorld.elements;
        for (let i = 0; i < p.count; i += 2) {
          const wy = e[1] * p.getX(i) + e[5] * p.getY(i) + e[9] * p.getZ(i) + e[13];
          if (wy < min) min = wy;
        }
      }
      const floor = g.matrixWorld.elements[13]; // 서 있는 바닥 높이 (광장 돌바닥 위 등)
      if (min < floor) move.position.y += (floor - min) / g.scale.y;
    },
    g, move, body, torso, legs, head, ears, face, roar, tail,
    fluff(k) { // 털 쭈뼛 + 등 아치
      torso.scale.set(1 + k * 0.08, 1 + k * 0.22, 1 + k * 0.06);
      torso.position.y = 0.032 + k * 0.006;
      tail.scale.set(1 + k * 0.7, 1 + k * 0.15, 1 + k * 0.7);
      // 몸이 솟으면 다리 뿌리도 같이 올라가고, 다리가 늘어나 발은 땅에 붙어 있게 (발끝으로 선 느낌)
      const ly = LEG_Y + k * 0.006;
      legs.forEach((l) => { l.position.y = ly; l.scale.y = ly / LEG_Y; });
    },
    hiss(k) { // 입 쩍 + 귀 납작
      roar.visible = k > 0.02;
      roar.scale.set(0.7 + 0.3 * k, Math.max(0.01, k), 1);
      face.mouth.scale.setScalar(1 + k * 0.3);
      this.earAt(k * 0.9);
      head.rotation.x -= k * 0.15;
      this.hissK = k;
    },
    // 수염: 코끝이 움직인 만큼 끝이 뒤늦게 따라오며 출렁 (용수철), 하악질하면 앞쪽 위로 쫙 펴짐
    hissK: 0,
    whiskers(t) {
      const dt = Math.min(0.05, Math.max(0, t - (ws.t ?? t)));
      ws.t = t;
      head.updateWorldMatrix(true, false);
      const nose = head.localToWorld(ws.tmp.set(0, 0, 0.03));
      if (ws.prev && dt > 0) {
        const vel = ws.vel.subVectors(nose, ws.prev).divideScalar(dt * g.scale.x / 2.4); // 크기와 상관없이 시안(2.4배) 기준 빠르기로
        head.getWorldQuaternion(ws.q).invert();
        vel.applyQuaternion(ws.q); // 머리 기준 방향으로
        const tu = THREE.MathUtils.clamp(-vel.y * 0.9, -0.7, 0.7); // 머리가 올라가면 수염 끝은 아래로 처짐
        const tb = THREE.MathUtils.clamp(vel.z * 0.9, -0.6, 0.6); // 앞으로 가면 끝이 뒤로 젖혀짐
        // 귀: 앞으로 가거나 솟구치면 뒤로, 멈추거나 내려앉으면 앞으로 살짝 접힘 (수염보다 무르게)
        const te = THREE.MathUtils.clamp(-(vel.z * 0.6 + vel.y * 0.45), -0.45, 0.45);
        for (let n = 0; n < 4; n++) { // 잘게 나눠서 용수철 계산
          const h = dt / 4;
          ws.ev += (-110 * (ws.e - te) - 7 * ws.ev) * h; ws.e += ws.ev * h;
          ws.uv += (-170 * (ws.u - tu) - 9 * ws.uv) * h; ws.u += ws.uv * h;
          ws.bv += (-170 * (ws.b - tb) - 9 * ws.bv) * h; ws.b += ws.bv * h;
        }
      }
      ws.prev = (ws.prev ?? new THREE.Vector3()).copy(nose);
      const idle = Math.sin(t * 2.3) * 0.04 + bump(t % 3.7, 3.3, 3.55) * 0.18 * Math.sin(t * 40); // 가끔 씰룩
      face.whisk(ws.u + idle + this.hissK * 0.35, ws.b - this.hissK * 0.3);
      const flick = bump(t % 5.3, 4.95, 5.2); // 가끔 한쪽 귀만 쫑긋 털기
      ears.forEach(([e, s]) => (e.rotation.x += ws.e * (1 + 0.15 * s) + (s > 0 ? -flick * 0.35 : 0)));
      // 꼬리: 몸이 움직인 반대쪽으로, 또 뿌리를 휙 돌리면 끝이 뒤늦게 따라오며 출렁
      const rx = tail.rotation.x, rz = tail.rotation.z; // 이번 동작이 정한 뿌리 각도
      tail.updateWorldMatrix(true, false);
      const tb = tail.getWorldPosition(ws.tp);
      if (ws.tprev && dt > 0) {
        const v = ws.tv.subVectors(tb, ws.tprev).divideScalar(dt * g.scale.x / 2.4);
        body.getWorldQuaternion(ws.q).invert();
        v.applyQuaternion(ws.q); // 몸 기준 방향으로
        const drx = (rx - ws.trx) / dt, drz = (rz - ws.trz) / dt;
        const tx = THREE.MathUtils.clamp(-(v.y + v.z) * 0.8 - drx * 0.1, -0.9, 0.9); // 솟구치거나 앞으로 가면 끝이 뒤로 처짐
        const tz = THREE.MathUtils.clamp(v.x * 0.9 - drz * 0.1, -0.9, 0.9); // 옆으로 가면 반대쪽으로
        for (let n = 0; n < 4; n++) {
          const h = dt / 4;
          ws.txv += (-90 * (ws.tx - tx) - 6 * ws.txv) * h; ws.tx += ws.txv * h;
          ws.tzv += (-90 * (ws.tz - tz) - 6 * ws.tzv) * h; ws.tz += ws.tzv * h;
        }
      }
      ws.tprev = (ws.tprev ?? new THREE.Vector3()).copy(tb);
      ws.trx = rx; ws.trz = rz;
      tail.rotation.x += ws.tx * 0.35;
      tail.rotation.z += ws.tz * 0.35;
      tailTip.rotation.x = ws.tx + Math.sin(t * 2.1) * 0.08; // 끝 마디가 더 크게, 가만있어도 살랑
      tailTip.rotation.z = ws.tz + Math.sin(t * 2.6 + 1) * 0.15;
    },
    // 귀 접기: 옆으로 너무 벌리지 않고 뒤로 눕혀서 밑동이 머리에 붙어 있게
    earAt(a) { ears.forEach(([e, s]) => { e.rotation.z = -s * (0.35 + a * 0.55); e.rotation.x = -Math.max(0, a) * 0.6; }); },
    eyeSize(k) { face.eyes.forEach((e) => e.scale.set(k, k * e.scale.y, 1)); },
    squint(on) { // > < 눈
      squeeze.visible = on;
      if (on) { face.open.visible = false; face.shut.visible = false; }
    },
    lick(amt) { // 혀 내밀기 (amt 0 ~ 1: 얼마나 나왔나)
      lickTongue.visible = amt > 0.02;
      lickTongue.scale.set(1, 1, Math.max(0.01, amt));
      lickTongue.rotation.x = 0.5 - amt * 0.4; // 나오면서 살짝 위로 말림
    },
    crossEyes(on) { // X 눈 (기절)
      cross.visible = on;
      if (on) { face.open.visible = false; face.shut.visible = false; squeeze.visible = false; }
    },
    // 입 모양: 'omega'(기본) | 'o' | 'frown' | 'wavy' | 'flat' | 'tongue', amt 는 크기
    mouthAs(kind, amt = 1) {
      for (const [k, gr] of Object.entries(shapes)) gr.visible = k === kind;
      omega.forEach((o) => (o.visible = kind === 'tongue' || !shapes[kind]));
      if (shapes[kind]) shapes[kind].scale.setScalar(Math.max(0.01, amt));
    },
    reset() {
      move.position.set(0, 0, 0);
      move.rotation.set(0, 0, 0);
      move.scale.setScalar(1);
      body.position.set(0, 0, 0);
      body.rotation.set(0, 0, 0);
      body.scale.set(1, 1, 1);
      torso.rotation.set(0, 0, 0);
      this.fluff(0);
      legs.forEach((l) => { l.rotation.set(0, 0, 0); l.scale.set(1, 1, 1); });
      head.position.set(0, 0.058, 0.03);
      head.rotation.set(0, 0, 0);
      head.scale.set(1, 1, 1);
      tail.rotation.set(0, 0, 0);
      roar.scale.set(1, 0.01, 1);
      roar.visible = false;
      face.mouth.scale.setScalar(1);
      this.earAt(0);
      face.eyes.forEach((e) => e.scale.set(1, 1, 1));
      face.sleep(false);
      this.hissK = 0;
      this.mouthAs('omega');
      squeeze.visible = false;
      cross.visible = false;
      lickTongue.visible = false;
    },
  };
}

// ── 동작 (시안 화면과 게임이 함께 씀): fn(c, H, t) · c 는 이 동작 안에서 흐른 시간, t 는 전체 시간 ──
export const HAAK_MOTIONS = [];
function hmotion(name, desc, period, fn, extra) { HAAK_MOTIONS.push({ name, desc, period, fn, extra }); }
const motion = (name) => HAAK_MOTIONS.find((m) => m.name === name);
const hBlink = (H, t) => H.face.blink(bump(t % 2.9, 2.75, 2.9));
// 고양이 걸음새: 발마다 한 주기(0~1) 중 앞쪽 duty 만큼은 땅을 딛고 몸 밑으로 쭉 밀고(앞 → 뒤, 일정하게),
// 나머지는 다리를 살짝 접어(짧게) 발을 들고 앞으로 휙 가져간다. offs: 다리마다 주기 어긋남 [앞왼, 앞오, 뒤왼, 뒤오]
// amp: [앞발, 뒷발] 흔드는 폭 · lift: 발 들 때 다리를 얼마나 접나 (rotation.x + 는 발이 뒤로)
function gait(H, c, offs, duty, amp, lift) {
  H.legs.forEach((l, i) => {
    const ph = (((c + offs[i]) % 1) + 1) % 1;
    const a = amp[i < 2 ? 0 : 1];
    if (ph < duty) { // 딛고 밀기
      l.rotation.x = a * (-1 + (2 * ph) / duty);
    } else { // 들고 앞으로: 처음엔 뒤에서 발을 톡 떼고, 끝에선 앞으로 뻗어 내려놓음
      const sw = (ph - duty) / (1 - duty);
      l.rotation.x = a * Math.cos(PI * sw);
      l.scale.y = 1 - lift * Math.sin(PI * sw);
    }
  });
}
const walkLegs = (H, p, amp) => H.legs.forEach((l, i) => (l.rotation.x = (i === 0 || i === 3 ? 1 : -1) * Math.sin(p) * amp)); // 대각선 다리끼리 같이

// 1. 대기: 꼬리 살랑, 앞발 핥기
hmotion('대기', '꼬리 살랑살랑, 앞발 할짝할짝', 4.4, (c, H, t) => {
  H.tail.rotation.z = Math.sin(t * 2) * 0.45;
  H.tail.rotation.x = Math.sin(t * 1.3) * 0.15;
  H.body.scale.y = 1 + Math.sin(t * 3) * 0.015;
  const k = ease(seg(c, 1.6, 1.9)) * (1 - ease(seg(c, 3.5, 3.8)));
  H.legs[1].rotation.x = -1.9 * k;
  H.legs[1].rotation.z = 0.35 * k;
  H.body.rotation.x = -0.1 * k; // 살짝 뒤로 앉으며
  H.head.rotation.x = 0.3 * k + Math.sin(t * 14) * 0.1 * k;
  H.head.rotation.y = 0.35 * k;
  if (k > 0.5) { H.face.sleep(true); H.lick(Math.max(0, Math.sin(t * 14))); } else hBlink(H, t); // 할짝할짝: 혀가 쏙쏙 나왔다 들어감
});

// 2. 걷기: 종종종 쫑쫑걸음
hmotion('걷기', '꼬리 바짝 세우고 종종종', (2 * PI) / 0.7, (c, H, t) => {
  const v = Math.cos(t * 0.7);
  H.move.position.x = Math.sin(t * 0.7) * 0.045;
  H.move.rotation.y = (PI / 2) * THREE.MathUtils.clamp(v * 5, -1, 1);
  const p = t * 16;
  // 옆걸음 순서 (뒤왼 → 앞왼 → 뒤오 → 앞오): 늘 세 발이 땅에 닿은 채 차분히
  gait(H, p / (2 * PI), [0.75, 0.25, 0, 0.5], 0.62, [0.5, 0.6], 0.32);
  H.body.rotation.z = Math.sin(p) * 0.035; // 딛는 쪽으로 엉덩이가 살짝 실룩
  H.head.rotation.z = -H.body.rotation.z * 0.8;
  H.move.position.y = Math.abs(Math.sin(p)) * 0.0025;
  H.head.rotation.y = -H.move.rotation.y * 0.35; // 걸으면서 힐끔 이쪽
  H.tail.rotation.x = -0.25;
  H.tail.rotation.z = Math.sin(p * 0.5) * 0.15;
  hBlink(H, t);
});

// 2-1. 달리기: 앞발 모아 쭉, 뒷발 모아 탁! 몸을 폈다 웅크렸다 하며 다다닥 (걷기보다 두 배 빠르게)
hmotion('달리기', '귀 젖히고 꼬리 휘날리며 다다닥', (2 * PI) / 1.3, (c, H, t) => {
  const v = Math.cos(t * 1.3);
  H.move.position.x = Math.sin(t * 1.3) * 0.05;
  H.move.rotation.y = (PI / 2) * THREE.MathUtils.clamp(v * 5, -1, 1);
  const p = t * 24;
  const s = Math.sin(p); // + 몸 쭉 폄(앞발 앞, 뒷발 뒤, 공중) · - 웅크림(뒷발이 앞발 밑까지)
  // 갤럽: 뒷발 둘이 탁탁 차고(몸이 쭉 펴짐) → 앞발 둘이 탁탁 받고 → 네 발을 몸 밑에 모은 채 공중으로
  // (s = 1 일 때 앞발은 막 땅에 닿아 앞으로 뻗고, 뒷발은 막 차고 뒤로 뻗음)
  const cc = p / (2 * PI);
  gait(H, cc, [-0.25, -0.31, 0.1, 0.04], 0.35, [0.85, 0.95], 0.45);
  H.move.position.y = Math.max(0, -s) * 0.01; // 네 발을 모았을 때 붕 뜸
  H.body.rotation.x = -s * 0.12; // 펼 땐 코가 들리고, 웅크릴 땐 숙여짐
  H.torso.scale.set(1 - s * 0.03, 1 - s * 0.05, 1 + s * 0.09); // 늘었다 줄었다
  H.head.rotation.x = s * 0.1; // 머리는 몸과 반대로 까딱해서 거의 수평
  H.earAt(0.55);
  H.eyeSize(1.2);
  H.mouthAs('o', 0.55);
  H.tail.rotation.x = -1.0 + s * 0.15; // 뒤로 휘날림
  H.tail.rotation.z = Math.sin(p * 0.5) * 0.1;
  hBlink(H, t);
});

// 3. 발견: 깜짝 제자리 점프, 털이 펑
hmotion('발견', '깜짝! 제자리에서 폴짝, 털이 펑', 2.6, (c, H, t) => {
  const jump = bump(c, 0.25, 0.7);
  const f = ease(seg(c, 0.28, 0.42)) * (1 - ease(seg(c, 1.7, 2.2)));
  const land = bump(c, 0.7, 0.85);
  H.move.position.y = jump * 0.045;
  H.fluff(f);
  H.body.scale.set(1 + land * 0.12, 1 - land * 0.18, 1 + land * 0.12);
  H.legs.forEach((l, i) => (l.rotation.x = (i < 2 ? -1 : 1) * jump * 0.5)); // 공중에서 네 발 쫙
  H.earAt(-f * 0.25); // 귀 쫑긋
  H.eyeSize(1 + f * 0.45);
  if (f > 0.15) H.mouthAs('o', 0.6 + f * 0.6); // 깜짝 ㅇ
  H.tail.rotation.x = -0.5 * f;
  H.body.position.x = Math.sin(t * 60) * 0.001 * f;
  if (c < 0.25) hBlink(H, t);
});

// 4. 위협: 옆으로 서서 게걸음 하악
hmotion('위협', '옆으로 서서 게걸음 하악… "냐"', 3.4, (c, H, t) => {
  const on = ease(seg(c, 0, 0.3)) * (1 - ease(seg(c, 3.0, 3.4)));
  H.move.rotation.y = 1.35 * on;
  H.head.rotation.y = -1.25 * on; // 몸은 옆으로, 얼굴은 상대를 봄
  H.fluff(on);
  const step = Math.abs(Math.sin(c * PI * 3));
  H.move.position.x = Math.sin((c / 3.4) * PI * 2) * 0.025;
  H.move.position.y = step * 0.006 * on;
  H.legs.forEach((l, i) => (l.rotation.z = (i % 2 ? 1 : -1) * step * 0.3 * on));
  const hk = Math.pow(bump(c, 0.9, 2.7), 0.5);
  if (hk < 0.05 && on > 0.3) H.mouthAs('wavy'); // 하악 전후엔 겁먹은 물결 입
  H.hiss(hk);
  H.body.position.z = Math.sin(t * 70) * 0.0012 * on; // 바들바들
  H.tail.rotation.x = -0.4 * on;
  H.tail.rotation.z = 0.6 * on;
});

// 5. 공격 ① 냥냥펀치: 쨉쨉쨉, 근데 다 허공
hmotion('공격 ① 냥냥펀치', '쨉쨉쨉! 근데 다 허공', 2.6, (c, H, t) => {
  const up = ease(seg(c, 0, 0.3)) * (1 - ease(seg(c, 2.2, 2.6)));
  H.body.rotation.x = -0.45 * up; // 뒷발로 일어섬
  H.move.position.y = 0.006 * up;
  H.head.rotation.x = 0.35 * up;
  const pc = seg(c, 0.35, 1.6);
  const n = pc * 7; // 일곱 번 쨉
  const jab = pc > 0 && pc < 1 ? Math.sin((n % 1) * PI) : 0;
  const which = Math.floor(n) % 2;
  H.legs[0].rotation.x = -1.3 * up - (which === 0 ? jab * 0.7 : 0);
  H.legs[1].rotation.x = -1.3 * up - (which === 1 ? jab * 0.7 : 0);
  H.body.rotation.y = (which ? -1 : 1) * jab * 0.12;
  if (pc > 0 && pc < 1) { H.face.blink(0.5); H.earAt(0.3); H.mouthAs('flat'); } // 힘줘서 입 꾹
  if (c > 1.7 && c < 2.3) { // 내 발… 안 맞았네?
    H.head.rotation.z = 0.3 * bump(c, 1.7, 2.3);
    H.eyeSize(1.25);
    H.mouthAs('o', 0.7);
  }
  H.tail.rotation.z = Math.sin(t * 8) * 0.3;
});

// 6. 공격 ② 덮치기: 엉덩이 씰룩씰룩 → 덮쳤는데 코 박음
hmotion('공격 ② 덮치기', '엉덩이 씰룩 → 덮치다 코 박음', 3.8, (c, H, t) => {
  const ready = ease(seg(c, 0, 0.2)) * (1 - seg(c, 1.2, 1.25));
  H.body.position.y = -0.006 * ready;
  H.body.rotation.x = 0.15 * ready;
  H.torso.rotation.y = Math.sin(t * 28) * 0.2 * ready * seg(c, 0.3, 0.6); // 엉덩이 씰룩씰룩
  H.tail.rotation.z = Math.sin(t * 30) * 0.25 * ready;
  H.legs.forEach((l) => (l.scale.y = 1 - ready * 0.25));
  if (c > 0.3 && c < 1.2) H.mouthAs('flat'); // 집중
  const fly = seg(c, 1.2, 1.6);
  const back = ease(seg(c, 3.1, 3.7));
  H.move.position.z = 0.055 * ease(fly) * (1 - back);
  if (c > 1.2 && c < 1.6) {
    H.move.position.y = Math.sin(fly * PI) * 0.035;
    H.body.rotation.x = -0.4 + fly * 0.9;
    H.legs.forEach((l, i) => (l.rotation.x = i < 2 ? -1.2 : 0.9));
    H.eyeSize(1.2);
    H.mouthAs('o', 1.1); // 덮쳐라!
  }
  const plant = ease(seg(c, 1.6, 1.7)) * (1 - ease(seg(c, 2.5, 2.8)));
  if (c >= 1.6 && c < 2.8) { // 코 박고 엉덩이만 하늘로
    H.body.rotation.x = 0.75 * plant;
    H.move.position.y = 0.012 * plant;
    H.head.scale.set(1 + plant * 0.1, 1 - plant * 0.15, 1);
    H.legs[2].rotation.x = H.legs[3].rotation.x = 0.3 * plant;
    H.tail.rotation.z = Math.sin(t * 6) * 0.5 * plant;
    H.squint(true); // 코 박고 > <
    H.mouthAs('frown');
  }
  if (c >= 2.8 && c < 3.2) { // 부르르 털기
    const sh = bump(c, 2.8, 3.2);
    H.body.rotation.z = Math.sin(t * 50) * 0.15 * sh;
    H.head.rotation.y = Math.sin(t * 55) * 0.4 * sh;
    H.squint(true); // 부르르 털면서도 > <
    H.mouthAs('wavy');
  }
  if (c >= 3.1) walkLegs(H, t * 16, 0.5 * (1 - seg(c, 3.6, 3.8))); // 뒷걸음질로 제자리
});

// 7. 맞음: 찌부 + 털 폭발 + 뒤로 콩
hmotion('맞음', '찌부! 털 폭발하고 뒤로 콩', 2.2, (c, H, t) => {
  const sq = bump(c, 0.2, 0.45);
  const f = ease(seg(c, 0.3, 0.45)) * (1 - ease(seg(c, 1.0, 1.6)));
  const kb = ease(seg(c, 0.2, 0.45)) * (1 - ease(seg(c, 1.3, 2.0)));
  H.body.scale.set(1 + sq * 0.25, 1 - sq * 0.35, 1 + sq * 0.25);
  H.move.position.z = -0.025 * kb;
  H.move.position.y = bump(c, 0.4, 0.75) * 0.012;
  H.body.rotation.x = -0.3 * bump(c, 0.25, 0.9);
  H.fluff(f * 1.3);
  H.earAt(f * 1.0);
  H.tail.rotation.x = -0.6 * f;
  if (c > 0.2 && c < 1.1) { H.squint(true); H.mouthAs('wavy'); } // 아야… > < 울먹
  else {
    hBlink(H, t);
    if (c >= 1.1 && c < 1.9) H.mouthAs('frown'); // 시무룩
  }
});

// 8. 쓰러짐: 발라당 뒤집혀 발 버둥, 펑 사라짐
hmotion('쓰러짐', '발라당 항복, 발 버둥 → 펑', 4.4, (c, H, t) => {
  const wob = bump(c, 0, 0.5);
  H.body.rotation.z = Math.sin(t * 18) * 0.12 * wob;
  if (wob > 0.05) H.mouthAs('wavy'); // 휘청휘청
  const roll = ease(seg(c, 0.5, 0.85));
  H.body.rotation.z += PI * 0.97 * roll;
  H.move.position.y = 0.06 * roll;
  if (roll > 0) {
    H.legs.forEach((l, i) => (l.rotation.x = Math.sin(t * 22 + i * 1.7) * 0.5 * (1 - seg(c, 2.2, 2.6)))); // 발 버둥
    H.tail.rotation.z = Math.sin(t * 9) * 0.4;
    H.crossEyes(true); // X 눈
    H.lick(0.75 + Math.sin(t * 6) * 0.08); // 기절해서 혀가 입 밖으로 축 (발 버둥에 맞춰 살짝 흔들)
  }
  const gone = seg(c, 2.6, 2.8);
  if (c > 2.6 && c < 3.8) H.move.scale.setScalar(Math.max(0.0001, (1 + 0.2 * Math.sin(gone * PI)) * (1 - gone)));
  if (c >= 3.8) { // 다시 나타남
    H.move.position.y = 0;
    H.body.rotation.z = 0;
    H.crossEyes(false);
    H.face.sleep(false);
    H.mouthAs('omega');
    H.move.scale.setScalar(Math.max(0.0001, ease(seg(c, 3.8, 4.2))));
  }
  const r = seg(c, 2.6, 3.3);
  H.puffs.forEach(([p, d]) => {
    p.visible = r > 0 && r < 1;
    p.position.set(d.x * 0.05 * ease(r), 0.04 + d.y * 0.03 * ease(r) + r * 0.01, d.z * 0.05 * ease(r));
    p.scale.setScalar(Math.max(0.0001, 0.018 * Math.sin(r * PI)));
  });
}, (H) => {
  H.puffs = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * PI * 2;
    const p = mesh(ball(1, 16), mat('#fffaf0', 0.9), H.g, '연기');
    H.puffs.push([p, new THREE.Vector3(Math.cos(a), (i % 3) * 0.5 - 0.3, Math.sin(a))]);
  }
});


// build(e, s, r): e 는 얼굴 표면에 놓인 눈 하나의 자리(깜빡일 땐 e 를 납작하게), s 는 -1 왼눈 / 1 오른눈, r 은 기본 눈 크기
const HAAK_EYES = {
  bean: { name: '세로 콩눈 (지금 눈)', desc: '세로로 길쭉한 콩, 멍청 귀여움', build(e, s, r) {
    mesh(ball(r, 16).scale(0.72, 1.4, 0.5), BLACK, e, '눈');
    mesh(ball(r * 0.26, 8), WHITE, e, '눈').position.set(r * 0.18, r * 0.75, r * 0.6);
  } },
  glossy: { name: '촉촉 왕눈', desc: '크고 아래쪽이 밝은 반짝 왕눈', build(e, s, r) {
    mesh(ball(r * 1.5, 20).scale(1, 1.12, 0.4), BLACK, e, '눈');
    mesh(ball(r * 1.05, 18).scale(1.1, 0.6, 0.4), mat('#7a5240', 0.4), e, '눈').position.set(0, -r * 0.75, r * 0.3);
    mesh(ball(r * 0.55, 12).scale(1, 1.15, 1), WHITE, e, '눈').position.set(-s * r * 0.45, r * 0.6, r * 0.7);
    mesh(ball(r * 0.22, 8), WHITE, e, '눈').position.set(s * r * 0.55, -r * 0.55, r * 0.75);
  } },
  wide: { name: '동공 왕 초록눈', desc: '흥분해서 동공이 커다래짐', build(e, s, r) {
    mesh(ball(r * 1.45, 20).scale(1, 1.08, 0.4), mat('#9ad46e', 0.35), e, '눈');
    mesh(ball(r * 1.12, 18).scale(1, 1.08, 0.4), BLACK, e, '눈').position.z = r * 0.3;
    mesh(ball(r * 0.42, 10), WHITE, e, '눈').position.set(r * 0.45, r * 0.5, r * 0.7);
    mesh(ball(r * 0.18, 8), WHITE, e, '눈').position.set(-r * 0.45, -r * 0.45, r * 0.7);
  } },
  meh: { name: '귀찮은 반눈', desc: '만사 귀찮아서 반쯤 감김', build(e, s, r) {
    mesh(new THREE.SphereGeometry(r * 1.1, 18, 10, 0, PI * 2, PI / 2, PI / 2).scale(1.15, 1, 0.5), BLACK, e, '눈');
    mesh(new THREE.CapsuleGeometry(r * 0.2, r * 2.3, 4, 8).rotateZ(PI / 2), BLACK, e, '눈').position.set(0, r * 0.05, r * 0.2);
    mesh(ball(r * 0.22, 8), WHITE, e, '눈').position.set(r * 0.35, -r * 0.3, r * 0.6);
  } },
  ring: { name: 'ㅇㅅㅇ 링눈', desc: '동그라미에 작은 점, 얼빠짐', build(e, s, r) {
    mesh(ball(r * 1.15, 18).scale(1, 1, 0.4), WHITE, e, '눈');
    mesh(new THREE.TorusGeometry(r * 1.12, r * 0.2, 8, 28), BLACK, e, '눈').position.z = r * 0.3;
    mesh(ball(r * 0.38, 10).scale(1, 1, 0.5), BLACK, e, '눈').position.set(0, -r * 0.1, r * 0.5);
  } },
  squeeze: { name: '질끈 > < 눈', desc: '하악질하는 척 눈 질끈', build(e, s, r) {
    for (const k of [1, -1]) {
      const arm = mesh(new THREE.CapsuleGeometry(r * 0.22, r * 1.15, 4, 8).rotateZ(PI / 2), BLACK, e, '눈');
      arm.position.set(s * r * 0.05, k * r * 0.32, 0);
      arm.rotation.z = k * s * 0.55; // 왼눈 >, 오른눈 <
    }
  } },
  maro: { name: '동글 눈썹', desc: '점눈 위에 동그란 점 눈썹, 순둥', build(e, s, r) {
    mesh(ball(r * 0.95, 16).scale(1, 1.2, 0.5), BLACK, e, '눈');
    mesh(ball(r * 0.33, 8), WHITE, e, '눈').position.set(r * 0.3, r * 0.42, r * 0.55);
    mesh(ball(r * 0.36, 12).scale(1.3, 0.85, 0.4), mat('#5e544c', 0.8), e, '눈썹').position.set(-s * r * 0.3, r * 2.1, 0);
  } },
  star: { name: '별 반짝 눈', desc: '눈 속에 별이 반짝', build(e, s, r) {
    mesh(ball(r * 1.3, 18).scale(1, 1.12, 0.4), BLACK, e, '눈');
    for (const a of [0, PI / 2]) { // 네 갈래 반짝이
      const sp = mesh(ball(r * 0.5, 10).scale(0.22, 1.25, 0.4), WHITE, e, '눈');
      sp.position.set(r * 0.35, r * 0.35, r * 0.6);
      sp.rotation.z = a;
    }
    mesh(ball(r * 0.17, 8), WHITE, e, '눈').position.set(-r * 0.45, -r * 0.5, r * 0.6);
  } },
};

export { catEars, catFace, catTail, makeHaak, HAAK_EYES, hBlink };

// ── 게임용 하악냥 ──
// 게임 동작 이름 → 길이 (loop 는 되풀이)
export const HAAKNYANG_MOTIONS = {
  idle: { label: '대기', loop: true },
  walk: { label: '걷기 (종종종)', loop: true },
  groom: { label: '앞발 할짝할짝', dur: 2.7 },
  notice: { label: '발견! (깜짝 폴짝)', dur: 1.3 },
  angry: { label: '화남! (하악)', dur: 1.1 },
  attack: { label: '공격 (덮치기)', dur: 1.6 },
  hit: { label: '맞음', dur: 0.9 },
  die: { label: '쓰러짐', dur: 2.3 },
  spawn: { label: '등장', dur: 0.7 },
};
// 여러 구간을 이어 붙인 시간 바꾸기: [[u0, c0], [u1, c1], ...] 사이를 직선으로
const remap = (u, pts) => {
  for (let i = 1; i < pts.length; i++) {
    const [u0, c0] = pts[i - 1], [u1, c1] = pts[i];
    if (u <= u1) return c0 + (c1 - c0) * seg(u, u0, u1);
  }
  return pts[pts.length - 1][1];
};

export function createHaaknyang({ onDone = null, outlineScale = 1 } = {}) {
  const H = makeHaak();
  const root = H.g; // 첫 자식(move)이 몸 전체: 그림자가 이 크기·높이를 따라감
  root.name = '하악냥';
  const DIE = motion('쓰러짐');
  DIE.extra(H); // 펑 연기
  const anger = angerMark();
  root.add(anger);
  // 놀랐을 때 머리 위에 뜨는 느낌표 (다른 몬스터와 같은 모양)
  const bang = new THREE.Sprite(new THREE.SpriteMaterial({
    map: canvasTexture('haakBang', 64, 128, (g, w, h) => {
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

  let state = 'idle';
  let u = 0;
  let t = 0;
  let mood = null;
  let moodT = 0;
  function play(name) {
    if (!HAAKNYANG_MOTIONS[name] && name !== 'gone') return;
    state = name;
    u = 0;
  }

  function update(dt, legs = 1) {
    const run = state === 'walk' && legs > 1; // 도망·쫓기: 걷기 대신 달리기
    if (run) dt /= 2.2; // 달리기 모션은 도망 배수(2.2)일 때가 제 빠르기: 더 빨리 달리면 다리도 그만큼 빨리 놀림
    t += dt;
    u += dt;
    moodT += dt;
    H.reset();
    let angerK = 0;
    if (state === 'idle') {
      motion('대기').fn(t % 1.5, H, t); // 할짝 구간 앞까지만: 꼬리 살랑, 숨쉬기, 깜빡
    } else if (state === 'walk') {
      motion(run ? '달리기' : '걷기').fn(0, H, t);
      H.move.position.x = 0; // 자리·방향은 게임이 정함
      H.move.rotation.y = 0;
      H.head.rotation.y = 0;
    } else if (state === 'groom') {
      motion('대기').fn(1.5 + u * (2.4 / 2.7), H, t);
    } else if (state === 'notice') {
      motion('발견').fn(u * 2, H, t);
    } else if (state === 'angry') {
      // 화남!: 털을 세우고 바들바들, 입을 쩍 벌려 하악
      const on = ease(seg(u, 0, 0.15)) * (1 - ease(seg(u, 0.9, 1.1)));
      H.fluff(on);
      H.hiss(Math.pow(bump(u, 0.1, 1.0), 0.5));
      H.body.position.x = Math.sin(t * 70) * 0.0012 * on;
      H.move.position.y = Math.abs(Math.sin(u * PI * 4)) * 0.004 * on;
      H.tail.rotation.x = -0.4 * on;
      angerK = angerPulse(u - 0.1, t);
    } else if (state === 'attack') {
      // 덮치기: 엉덩이 씰룩(빠르게) → 0.47초에 덮쳐 닿음 → 코 박고 > < → 부르르 → 제자리
      motion('공격 ② 덮치기').fn(remap(u, [[0, 0.3], [0.25, 1.2], [0.47, 1.6], [1.6, 3.8]]), H, t);
    } else if (state === 'hit') {
      motion('맞음').fn(0.15 + u * 2, H, t);
    } else if (state === 'die') {
      DIE.fn(Math.min(u * 1.25, 3.79), H, t);
    } else if (state === 'spawn') {
      H.move.scale.setScalar(Math.max(0.0001, outBack(seg(u, 0.05, 0.45), 2.4)));
      if (u > 0.5 && u < 0.6) H.face.blink(0.9);
    } else if (state === 'gone') {
      H.move.scale.setScalar(0.0001);
    }
    if (state !== 'die') H.puffs.forEach(([p]) => (p.visible = false));

    // 화가 난 채로 있을 때: 귀를 뒤로 젖히고 털을 살짝 세움, 머리 위 화남 표시가 콩닥콩닥
    if (mood === 'angry' && (state === 'idle' || state === 'walk')) {
      H.earAt(0.45);
      H.fluff(0.3);
      angerK = 0.75 * angerPulse(moodT, t);
    }
    anger.visible = angerK > 0.001;
    anger.scale.setScalar(0.04 * angerK);
    anger.position.set(0.03, 0.11 + H.move.position.y, 0);
    const bk = state === 'notice' ? (u < 0.12 ? 0 : u < 1.0 ? outBack(seg(u, 0.12, 0.3)) : 1 - seg(u, 1.0, 1.3)) : 0;
    bang.visible = bk > 0.001;
    bang.scale.set(0.028 * bk, 0.056 * bk, 1);
    bang.position.set(0.02, 0.135 + H.move.position.y, 0);

    const M = HAAKNYANG_MOTIONS[state];
    if (M && !M.loop && u >= M.dur) {
      const ended = state;
      play(ended === 'die' ? 'gone' : 'idle');
      onDone?.(ended);
    }
    if (state !== 'gone') {
      H.ground();
      H.whiskers(t);
    }
    syncToon(root, true, outlineScale);
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
