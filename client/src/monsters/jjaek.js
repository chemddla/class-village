// 짹짹이: 참새 몬스터 (하찮은 쪼렙). 동글동글 작은 몸으로 콩콩 뛰어다니며 짹짹, 맞으면 깃털이 펑
// 구구·깍깍이와 같은 makePigeon 뼈대에 참새 무늬·체형만 바꿔 입힌다 (게임에 넣을 때 같은 방식으로 쓸 수 있게)
// 몸(makeJjaek)과 동작(JJAEK_MOTIONS)은 몬스터 시안 화면(monsters.html?set=jjaek)과 함께 쓴다
import * as THREE from 'three';
import { canvasTexture } from '../villager/textures.js';
import { bump } from './haaknyang.js';
import { angerMark, angerPulse } from './anger.js';
import { makePigeon, foldWings, STAND_Y, gease, gseg } from './gugu.js';

const PI = Math.PI;
const mat = (color, rough = 0.6) => new THREE.MeshStandardMaterial({ color, roughness: rough });
function mesh(geo, m, parent, name = '부품') {
  const o = new THREE.Mesh(geo, m);
  o.name = name;
  o.castShadow = true;
  parent.add(o);
  return o;
}
const ball = (r, n = 16) => new THREE.SphereGeometry(r, n, Math.round(n * 0.75));

// 참새 색
const C = {
  belly: '#e4ddd0', // 배: 흰빛 도는 회갈색
  back: '#9b6a42', // 등: 갈색
  streak: '#3b2618', // 등 줄무늬: 짙은 밤색
  buff: '#d1ab7c', // 깃 가장자리: 옅은 황갈색
  crown: '#8a4024', // 정수리·뒷목: 적갈색
  cheek: '#f4f0e8', // 흰 뺨
  black: '#1f1a17', // 뺨 점·턱밑·눈선
};

// ── 참새 몸 ──
// 몸 그림: 가로는 몸 둘레(양 끝 0·1 이 배·얼굴 쪽, 가운데 0.5 가 등·뒤통수), 세로는 꽁지(아래) → 정수리(위)
// 눈 높이는 v 0.73 쯤, 몸통은 v 0.3 쯤
const bodyTex = () => canvasTexture('sparrowBody', 64, 256, (g, w, h) => {
  const Y = (v) => (1 - v) * h;
  g.fillStyle = C.belly;
  g.fillRect(0, 0, w, h);
  g.filter = 'blur(3px)';
  g.fillStyle = C.back; // 등: 꽁지 밑동부터 목 뒤까지
  g.fillRect(w * 0.2, Y(0.6), w * 0.6, Y(0.04) - Y(0.6));
  g.fillStyle = C.crown; // 뒷목·정수리 적갈색 (정수리 끝은 둘레 전체)
  g.fillRect(w * 0.24, Y(1), w * 0.52, Y(0.58) - Y(1));
  g.fillRect(0, Y(1), w, Y(0.87) - Y(1));
  g.fillStyle = C.cheek; // 흰 반 목테 + 흰 뺨 (양옆)
  for (const x of [0.25, 0.75]) {
    g.beginPath(); g.ellipse(w * x, Y(0.67), w * 0.1, h * 0.06, 0, 0, PI * 2); g.fill();
  }
  g.fillStyle = C.black; // 턱밑 검은 턱받이 (얼굴 쪽 = 양 끝)
  for (const x of [0, w]) { g.beginPath(); g.ellipse(x, Y(0.66), w * 0.1, h * 0.045, 0, 0, PI * 2); g.fill(); }
  g.filter = 'blur(1px)';
  for (const x of [0.25, 0.75]) { // 뺨의 검은 점 (참새 얼굴의 표시)
    g.beginPath(); g.ellipse(w * x, Y(0.665), w * 0.045, h * 0.02, 0, 0, PI * 2); g.fill();
  }
  for (const x of [0, w]) { g.beginPath(); g.ellipse(x, Y(0.77), w * 0.05, h * 0.018, 0, 0, PI * 2); g.fill(); } // 부리 밑동 눈선
  g.filter = 'none';
  g.lineCap = 'round';
  for (let i = 0; i < 5; i++) { // 등 줄무늬: 짙은 줄과 옅은 줄을 번갈아
    const x = w * (0.36 + i * 0.07);
    g.strokeStyle = i % 2 ? C.buff : C.streak;
    g.lineWidth = i % 2 ? 1.5 : 2.5;
    g.beginPath(); g.moveTo(x, Y(0.52)); g.quadraticCurveTo(x + (i - 2) * 1.5, Y(0.35), x + (i - 2) * 2.5, Y(0.15)); g.stroke();
  }
});
// 날개 그림: 왼쪽이 뿌리, 위가 앞 가장자리, 아래가 뒤 가장자리
const armTex = () => canvasTexture('sparrowArm', 128, 64, (g, w, h) => {
  g.fillStyle = '#8c5631';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#6e4226';
  g.fillRect(0, 0, w, h * 0.3); // 앞 덮깃은 조금 짙게
  g.fillStyle = '#f1ebe0'; // 흰 날개띠 두 줄
  g.fillRect(0, h * 0.3, w, h * 0.06);
  g.fillRect(0, h * 0.52, w, h * 0.05);
  for (let i = 0; i < 8; i++) { // 뒤쪽 깃: 짙은 가운데에 옅은 가장자리
    const x = w * (0.04 + i * 0.12);
    g.fillStyle = C.buff;
    g.beginPath(); g.ellipse(x + w * 0.05, h * 0.82, w * 0.06, h * 0.22, 0, 0, PI * 2); g.fill();
    g.fillStyle = C.streak;
    g.beginPath(); g.ellipse(x + w * 0.05, h * 0.8, w * 0.035, h * 0.18, 0, 0, PI * 2); g.fill();
  }
});
const handTex = () => canvasTexture('sparrowHand', 128, 64, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, w, 0);
  gr.addColorStop(0.2, '#7a4d2e');
  gr.addColorStop(0.75, '#3a281b');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = C.buff;
  g.lineWidth = 2;
  for (let i = 0; i < 7; i++) { // 날개깃 가장자리가 옅게
    g.beginPath(); g.moveTo(w * 0.05, h * 0.35); g.quadraticCurveTo(w * (0.25 + i * 0.08), h * 0.5, w * (0.18 + i * 0.13), h * (1 - i * 0.07)); g.stroke();
  }
});

// 기본 체형: 아주 동글동글 (몸통 굵고 짧게, 목은 거의 없이). size: 비둘기에 견준 전체 크기
export const JJ_BODY = { fat: 1.18, len: 0.55, neckH: 0.5, wing: 0.8, size: 0.68 };
export function makeJjaek(look = {}) {
  const { size, ...shape } = { ...JJ_BODY, ...look };
  const P = makePigeon({ grey: C.belly, wingC: '#8c5631', tipC: '#3a281b', neck: C.belly, neck2: C.belly, eye: 'dot',
    tailC: ['#6e4b30', '#3d2a1c'], legC: '#b88a6c', napeFill: 0.15, ...shape });
  P.g.getObjectByName('몸').material.map = bodyTex();
  P.wings.forEach(([arm, , hand]) => {
    arm.children.forEach((m) => { if (m.isMesh) m.material = new THREE.MeshStandardMaterial({ roughness: 0.85, map: armTex() }); });
    hand.children.forEach((m) => { if (m.isMesh) m.material = new THREE.MeshStandardMaterial({ roughness: 0.85, map: handTex() }); });
  });
  P.g.getObjectByName('코').visible = false; // 비둘기 부리 위 흰 혹은 없음
  // 부리: 짧고 뭉툭한 씨앗 까는 부리 + 짹짹 벌리는 아랫부리
  const BEAK = mat('#2a2421', 0.4);
  P.beak.geometry = new THREE.ConeGeometry(0.0058, 0.011, 12).rotateX(PI / 2).translate(0, -0.0012, 0.0205);
  P.beak.material = BEAK;
  P.jaw = new THREE.Group();
  P.jaw.position.set(0, -0.0045, 0.0155);
  P.head.add(P.jaw);
  mesh(new THREE.ConeGeometry(0.0042, 0.009, 10).rotateX(PI / 2).translate(0, 0, 0.0045), BEAK, P.jaw, '부리');
  // 눈: 까맣고 동그란 눈에 반짝 점 하나
  P.eyes.forEach((e) => {
    const hi = mesh(ball(0.0011, 8), mat('#ffffff', 0.3), e, '눈');
    hi.position.set(0, 0.0015, 0.0047);
    hi.userData.noOutline = true;
  });
  P.mark = angerMark();
  P.mark.position.set(0.012, 0.028, -0.004);
  P.head.add(P.mark);
  P.angry = (t, on = 1) => { P.mark.visible = on > 0; P.mark.scale.setScalar(0.02 * angerPulse(on ? t % 10 : -1, t)); };
  P.slim = () => P.body.scale.setScalar(size); // reset 이 크기를 되돌리니 매번 다시
  P.slim();
  return P;
}
// 매 프레임 처음 자세로 되돌린 뒤 동작을 얹는다
export const jReset = (P, t) => { P.reset(); P.slim(); P.angry(t, 0); P.jaw.rotation.x = 0; };
// 땅에 선 자세: 날개 접고 가슴 내밀어 동그랗게, 꽁지는 살짝 들고
export const jStand = (P) => {
  foldWings(P, 1);
  P.wings.forEach(([w, s]) => { w.position.x += s * 0.005; w.position.y -= 0.007; w.rotation.x = 0.25; }); // 동그란 몸 옆구리에 착 붙여 끝을 꽁지 쪽으로 내림 (등 위로 판처럼 솟지 않게)
  P.fly.position.y = STAND_Y; P.body.rotation.x = -0.22; P.feet.forEach((f) => (f.rotation.x = 0)); P.tail.rotation.x = 0.15; };
const chirp = (P, c, rate = 0.22) => { const k = bump(c % rate, 0, rate * 0.8); P.jaw.rotation.x = k * 0.6; P.head.rotation.x -= k * 0.25; return k; };
const jBlink = (P, t) => P.blink(bump(t % 2.6, 2.45, 2.6));

// 깃털 몇 장: 갈색·흰색이 섞여 펑, 살랑살랑 내려앉으며 사라짐
const FEATHER = ball(1, 10).scale(0.0022, 0.0004, 0.006);
export const jPuff = (P, n = 6) => {
  const fs = [];
  for (let i = 0; i < n; i++) {
    const f = mesh(FEATHER, mat(i % 3 === 0 ? C.cheek : i % 3 === 1 ? C.back : C.buff, 0.85), P.g, '깃털');
    f.userData.noOutline = true;
    f.visible = false;
    fs.push(f);
  }
  return (u, at) => fs.forEach((f, i) => {
    f.visible = u > 0 && u < 1.6;
    if (!f.visible) return;
    const a = (i / n) * PI * 2 + 0.3;
    const out = 1 - Math.exp(-u * 7);
    const sway = Math.sin(u * 6 + i * 1.7) * Math.min(1, u * 2);
    f.position.set(at.x + Math.cos(a) * 0.035 * out + sway * 0.005, Math.max(0.002, at.y + 0.02 * out - Math.max(0, u - 0.25) * 0.03), at.z + Math.sin(a) * 0.035 * out);
    f.rotation.set(0.5 + sway * 0.5, a + u * 1.5, sway * 0.7);
    f.scale.setScalar(1 - gease(gseg(u, 1.1, 1.6)));
  });
};

// 동작 목록: { name, desc, update(P, t, X), extra(P) → X }. 매 프레임 jReset 한 뒤 update 를 부름
export const JJAEK_MOTIONS = [];
const jmotion = (name, desc, update, extra) => JJAEK_MOTIONS.push({ name, desc, update, extra });

jmotion('대기', '동그랗게 서서 꽁지 까딱까딱, 고개 갸웃갸웃, 가끔 몸 부풀리기', (P, t) => {
  const c = t % 4;
  jStand(P);
  P.tail.rotation.x += Math.max(0, Math.sin(t * 9)) * 0.35 * (c < 1.5 ? 1 : 0.2); // 참새답게 꽁지를 쉴 새 없이 까딱
  const tilt = Math.sign(Math.sin(t * 1.3)); // 고개를 휙휙 갸웃
  P.head.rotation.z = tilt * 0.3;
  P.head.rotation.y = tilt * 0.35;
  const fluff = bump(c, 2.6, 3.6); // 깃 부풀려 동글
  P.body.scale.multiplyScalar(1 + fluff * 0.1);
  P.wings.forEach(([w, s]) => (w.rotation.z += s * fluff * 0.12));
  P.plant(0);
  jBlink(P, t);
});

jmotion('콩콩 뛰기', '두 발 모아 콩콩콩, 서서 두리번, 돌아서 다시', (P, t) => {
  const c = t % 3;
  const d = Math.floor(t / 3) % 2 ? -1 : 1; // 갔다가 돌아옴
  jStand(P);
  P.fly.rotation.y = (d > 0 ? 0 : PI) + gease(gseg(c, 2.6, 3)) * PI;
  let hop = 0;
  if (c < 1.8) {
    const ph = (c * 3.3) % 1; // 빠르게 콩콩
    hop = Math.sin(ph * PI);
    P.fly.position.z = d * ((c / 1.8) * 0.06 - 0.03);
    P.feet.forEach((f) => (f.rotation.x = hop * 0.8));
    P.tail.rotation.x += bump(ph, 0.7, 1) * 0.4;
    P.body.rotation.x -= hop * 0.12;
  } else {
    P.fly.position.z = d * 0.03;
    P.head.rotation.y = Math.sign(Math.sin(c * 7)) * 0.5 * (1 - gseg(c, 2.4, 2.6));
  }
  P.plant(0);
  P.fly.position.y += hop * 0.018;
  jBlink(P, t);
});

jmotion('모이 콕콕', '콕콕콕 빠르게 쪼고 고개 들어 오물오물, 두리번', (P, t) => {
  const c = t % 3;
  jStand(P);
  const peck = c < 1.4 ? Math.max(0, Math.sin(c * PI * 5)) * (1 - gease(gseg(c, 1.2, 1.4))) : 0;
  P.body.rotation.x += peck * 0.75;
  P.head.rotation.x = peck * 0.5;
  P.tail.rotation.x += peck * 0.4;
  if (c > 1.5 && c < 2.2) P.jaw.rotation.x = Math.abs(Math.sin(c * 30)) * 0.2; // 오물오물
  P.head.rotation.y = bump(c, 2.2, 2.9) * 0.6;
  P.plant(0);
  jBlink(P, t);
});

jmotion('짹짹', '가슴 펴고 짹짹짹! 짹마다 몸이 들썩, 꽁지도 까딱', (P, t) => {
  const c = t % 2.6;
  jStand(P);
  P.body.rotation.x -= 0.15; // 가슴 쭉
  if (c > 0.4 && c < 1.8) {
    const k = chirp(P, c - 0.4);
    P.body.position.y += k * 0.002;
    P.tail.rotation.x += k * 0.3;
    P.wings.forEach(([w, s]) => (w.rotation.z += s * k * 0.1));
  }
  P.head.rotation.y = c > 1.9 ? 0.4 : 0;
  P.plant(0);
  jBlink(P, t);
});

jmotion('포르르 날기', '포르르르 빠른 날갯짓, 물결치듯 오르내리며 날기', (P, t) => {
  const c = t % 1.2;
  const shut = bump(c, 0.75, 1.15); // 참새도 잠깐 날개 접고 쑥
  P.flap(t, 32, 1.0 * (1 - shut), 0.15);
  P.sweep(shut * 0.9);
  P.fly.position.y = 0.13 + (c < 0.75 ? c / 0.75 : 1 - (c - 0.75) / 0.45) * 0.015;
  P.body.rotation.x = 0.1;
  P.feet.forEach((f) => (f.rotation.x = 1.3));
  P.head.rotation.x = -0.1;
});

jmotion('공격 (콕!)', '잔뜩 화나서 폴짝 뛰어 날개 파닥, 콕! (하나도 안 아파 보임)', (P, t) => {
  const c = t % 1.8;
  jStand(P);
  const crouch = bump(c, 0, 0.35);
  const jump = Math.sin(gseg(c, 0.3, 0.85) * PI);
  const open = gease(gseg(c, 0.3, 0.45)) * (1 - gease(gseg(c, 0.8, 0.95)));
  const peck = bump(c, 0.5, 0.68);
  if (open > 0) P.flap(t, 30, 0.9 * open, 0.3 * open);
  P.fly.position.z = jump * 0.025;
  P.body.rotation.x += crouch * 0.25 + peck * 0.5;
  P.head.rotation.x = -crouch * 0.3 + peck * 0.5;
  P.head.position.z += peck * 0.008;
  P.tail.rotation.x += crouch * 0.3;
  P.feet.forEach((f) => (f.rotation.x = jump * 0.6));
  P.jaw.rotation.x = bump(c, 0.05, 0.3) * 0.6; // 덤비기 전에 짹!
  P.plant(0);
  P.fly.position.y += jump * 0.035 - crouch * 0.004;
  P.angry(t, 1);
});

jmotion('맞음', '짹! 비명, 깃털 펑, 뒤로 콩 튕겨 동그랗게 부풀었다 돌아옴', (P, t, X) => {
  const c = t % 1.4;
  const k = c > 0.1 ? Math.exp(-(c - 0.1) * 5) : 0;
  jStand(P);
  P.fly.position.z = -k * 0.04;
  P.body.rotation.x -= k * 0.6;
  P.body.rotation.z = Math.sin(c * 30) * k * 0.25;
  P.body.scale.multiplyScalar(1 + k * 0.15); // 놀라서 깃 부풀림
  P.wings.forEach(([w, s], i) => (w.rotation.z += s * Math.abs(Math.sin(t * 34 + i * 2)) * k * 0.8));
  P.tail.rotation.x += k * 0.5;
  P.jaw.rotation.x = k * 0.7;
  P.blink(c > 0.1 && c < 0.6 ? 1 : 0);
  P.plant(0);
  P.fly.position.y += k * 0.025;
  X.puff(c - 0.1, new THREE.Vector3(0, 0.04, P.fly.position.z));
}, (P) => ({ puff: jPuff(P) }));

jmotion('쓰러짐', '비틀비틀하다 옆으로 픽, 발만 파르르, 스르르 사라짐', (P, t, X) => {
  const c = t % 3.6;
  jStand(P);
  const wob = 1 - gseg(c, 0.5, 0.8);
  P.body.rotation.z = Math.sin(c * 12) * 0.25 * wob;
  const lie = gease(gseg(c, 0.7, 1.0));
  P.body.rotation.z += lie * PI / 2;
  P.body.rotation.x = THREE.MathUtils.lerp(P.body.rotation.x, 0, lie);
  P.wings.forEach(([w, s]) => { if (s > 0) w.rotation.z += 0.5 * lie; }); // 위쪽 날개는 힘없이 벌어짐
  P.feet.forEach((f, i) => (f.rotation.x = lie * (0.3 + Math.sin(t * 24 + i) * 0.35 * Math.max(0, 1 - (c - 1.1) * 1.3))));
  P.blink(gseg(c, 0.4, 0.9));
  if (lie < 1) P.plant(0, 1 - lie);
  P.fly.position.y = THREE.MathUtils.lerp(P.fly.position.y, 0.03, lie);
  X.puff(c - 0.9, new THREE.Vector3(0, 0.02, 0));
  P.fly.scale.setScalar(Math.max(0.0001, gease(gseg(c, 0, 0.2)) * (1 - gease(gseg(c, 2.9, 3.4)))));
}, (P) => ({ puff: jPuff(P, 4) }));
