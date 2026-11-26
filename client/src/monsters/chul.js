// 철필통대장: 들판 왼쪽(북서쪽) 맨 끝 구석의 필드보스. 뚜껑이 입처럼 열리는 파란 철필통 (시안: monster-sketch.js ?set=chul)
// makeChulBody() 는 몸과 자세 손잡이(P)를, CHUL_MOTIONS 는 동작(매 프레임 P.reset() 뒤 자세를 잡는 함수)을,
// createChulBoss() 는 들판에서 잠·깨어남·싸움·제자리로 돌아가기를 맡는 보스를 만든다
// spin: 몸 한가운데를 축으로 돌리는 묶음 (데굴데굴·뒤로 꽈당) · snap: 뚜껑을 왼쪽 끝에서 돌리는 묶음 (경첩이 빠져 덜렁)
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { canvasTexture } from '../villager/textures.js';
import { syncToon } from '../villager/toon.js';
import { curveDrop } from '../materials.js';
import { monsterStats, defCut } from '../../../shared/world.js';
import { angerMark, angerPulse } from './anger.js';
import { createMongdang } from './mongdang.js';
import { createTtok } from './ttok.js';
import { createKkreyong } from './kkreyong.js';

const PI = Math.PI;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (x) => x * x * (3 - 2 * x);
const wob = (u, k = 7, w = 24) => (u < 0 ? 0 : Math.exp(-k * u) * Math.cos(w * u));
const cseg = (c, a, b) => clamp01((c - a) / (b - a));
const cbump = (c, a, b) => (c <= a || c >= b ? 0 : Math.sin(((c - a) / (b - a)) * PI));
const blinkAt = (c, ...at) => at.reduce((k, a) => Math.max(k, cbump(c, a, a + 0.16)), 0);

const CHUL_BLUE = '#3d8fe0', CHUL_DENT = '#5f7590';
export const CHUL_LINE = 0.0022; // 윤곽선 굵기 (하악냥과 같음)
// 필통 속에 들어 있다가 와르르 쏟기 때 불려 나오는 필기도구 몬스터
export const CHUL_MINIONS = ['mongdang', 'ttok', 'kkreyong'];
const MINION_BODY = { mongdang: createMongdang, ttok: createTtok, kkreyong: createKkreyong };

const mat = (color, rough = 0.6) => new THREE.MeshStandardMaterial({ color, roughness: rough });
const tin = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.32, metalness: 0.2 });
const INK = '#2b1d14';
function mesh(geo, m, parent, name = '부품') {
  const o = new THREE.Mesh(geo, m);
  o.name = name;
  o.castShadow = true;
  parent.add(o);
  return o;
}
// 평평한 그림 딱지. face: 'up'(위를 봄) · 'down'(아래를 봄) · 'front'(앞을 봄)
function decal(parent, tex, wd, ht, { x = 0, y, z = 0, face = 'up' }) {
  const p = mesh(new THREE.PlaneGeometry(wd, ht), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.6 }), parent, '무늬');
  p.rotation.x = face === 'up' ? -PI / 2 : face === 'down' ? PI / 2 : 0;
  p.position.set(x, y, z);
  p.castShadow = false;
  return p;
}
const timesTable = () => canvasTexture('pilboxTimes', 512, 256, (c, w, h) => { // 뚜껑 안쪽 구구단표
  c.fillStyle = '#fffaf0'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#e8443a'; c.font = 'bold 30px sans-serif'; c.fillText('구구단', 16, 36);
  c.fillStyle = INK; c.font = '19px sans-serif';
  for (let a = 2; a <= 9; a++) for (let b = 1; b <= 9; b += 2) c.fillText(`${a}×${b}=${a * b}`, 10 + (a - 2) * 62, 72 + ((b - 1) / 2) * 40);
});
const starSticker = () => canvasTexture('pilboxStars', 256, 128, (c) => { // 뚜껑 위 별 딱지
  const star = (x, y, r, col) => {
    c.fillStyle = col; c.beginPath();
    for (let i = 0; i < 10; i++) { const a = -PI / 2 + (i * PI) / 5, rr = i % 2 ? r * 0.45 : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    c.fill();
  };
  star(48, 54, 30, '#ffd23f'); star(204, 80, 22, '#ff9fb0'); star(130, 38, 14, '#ffffff');
  c.fillStyle = '#ffffff'; c.font = 'bold 26px sans-serif'; c.fillText('3-2', 100, 112);
});
const rrect = (p, W, D, r) => {
  const x = -W / 2, y = -D / 2;
  p.moveTo(x + r, y); p.lineTo(x + W - r, y); p.quadraticCurveTo(x + W, y, x + W, y + r);
  p.lineTo(x + W, y + D - r); p.quadraticCurveTo(x + W, y + D, x + W - r, y + D);
  p.lineTo(x + r, y + D); p.quadraticCurveTo(x, y + D, x, y + D - r);
  p.lineTo(x, y + r); p.quadraticCurveTo(x, y, x + r, y);
  return p;
};

// 몸 (시안 단위: 너비 0.3). line: 윤곽선 굵기 (보스는 크게 키우므로 그만큼 나눠 넘김) · minions: 필통 속 졸개 셋의 종류
export function makeChulBody({ line = CHUL_LINE, minions: minionKinds = ['mongdang', 'ttok', 'mongdang'] } = {}) {
  const w = 0.3, h = 0.085, d = 0.13, lidH = 0.028;
  const HY = (h + lidH) / 2, HZ = d / 2, CY = HY;
  const g = new THREE.Group(), root = new THREE.Group(), spin = new THREE.Group(), body = new THREE.Group();
  g.add(root); root.add(spin); spin.add(body);
  spin.position.y = CY;
  body.position.y = -CY;
  const tinM = tin(CHUL_BLUE);
  // 속이 빈 필통: 둥근 네모 테두리(벽) + 바닥판. 열면 파란 속에 졸개들이 서 있다
  const WALL = 0.014, FLOOR = 0.008, BV = 0.003, RO = 0.014;
  const wallShape = rrect(new THREE.Shape(), w - 2 * BV, d - 2 * BV, RO - BV);
  wallShape.holes.push(rrect(new THREE.Path(), w - 2 * WALL, d - 2 * WALL, Math.max(0.004, RO - WALL)));
  const base = mesh(new THREE.ExtrudeGeometry(wallShape, { depth: h - 2 * BV, bevelEnabled: true, bevelThickness: BV, bevelSize: BV, bevelSegments: 2, curveSegments: 8 })
    .rotateX(-PI / 2).translate(0, BV, 0), tinM, body, '몸');
  mesh(new THREE.ExtrudeGeometry(rrect(new THREE.Shape(), w - 2 * WALL + 0.006, d - 2 * WALL + 0.006, Math.max(0.004, RO - WALL)), { depth: FLOOR, bevelEnabled: false, curveSegments: 8 })
    .rotateX(-PI / 2), tinM, body, '바닥');
  // 뚜껑: 경첩(hinge)은 뒤쪽 위 모서리. hinge.rotation.x 가 음수면 열림 · snap 은 왼쪽 끝 (경첩이 빠지면 여기만 붙어 덜렁)
  const hinge = new THREE.Group();
  hinge.position.set(0, h, -d / 2);
  body.add(hinge);
  mesh(new THREE.CylinderGeometry(0.0055, 0.0055, w * 0.7, 12).rotateZ(PI / 2), mat('#c9ccd3', 0.3), hinge, '경첩');
  const snap = new THREE.Group();
  snap.position.x = -w * 0.44;
  hinge.add(snap);
  const lidM = tin(CHUL_BLUE);
  const lid = mesh(new RoundedBoxGeometry(w + 0.006, lidH, d + 0.006, 4, 0.012).translate(0, lidH / 2, d / 2), lidM, snap, '뚜껑');
  lid.position.x = w * 0.44;
  decal(lid, starSticker(), 0.2, 0.1, { y: lidH + 0.0008, z: d / 2 });
  decal(lid, timesTable(), w - 0.03, d - 0.03, { y: -0.0006, z: d / 2, face: 'down' });
  // 앞 벽 위에 줄 선 색연필 끝 = 이빨
  const fangs = ['#e8443a', '#ff8a3d', '#f5c623', '#5cc65a', '#3d8fe0', '#8c5be0', '#e8443a'].map((c, i) => {
    const t = new THREE.Group();
    t.position.set((i / 6 - 0.5) * (w - 0.05), h, d / 2 - WALL / 2);
    body.add(t);
    mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.008, 6).translate(0, 0.004, 0), mat('#f3d2a2', 0.9), t, '이빨');
    mesh(new THREE.ConeGeometry(0.0055, 0.012, 6).translate(0, 0.014, 0), mat(c, 0.6), t, '이빨');
    return t;
  });

  // 얼굴: 눈·눈썹·입을 캔버스에 그려 앞면에 붙임 (튀어나오지 않게). 얼굴 상태(F)가 바뀔 때만 다시 그림
  const EY = h * 0.55, MY = h * 0.25, BROW = 0.017; // 눈썹은 눈보다 이만큼 위 (화나서 기울어도 그림 위쪽에서 안 잘리게)
  const FW = w - 0.024, FH = h - 0.004, CW = 512, CH = Math.round((512 * FH) / FW);
  const cv = document.createElement('canvas');
  cv.width = CW; cv.height = CH;
  const cx = cv.getContext('2d');
  const faceTex = new THREE.CanvasTexture(cv);
  faceTex.colorSpace = THREE.SRGBColorSpace;
  faceTex.anisotropy = 4;
  decal(body, faceTex, FW, FH, { y: h / 2, z: d / 2 + 0.0006, face: 'front' });
  const PX = CW / FW;
  const toC = (x, y) => [CW / 2 + x * PX, CH / 2 - (y - h / 2) * PX];
  const FACE0 = { hide: false, blink: 0, wide: 0, lx: 0, ly: 0, mode: 'dot', spin: 0, tilt: 0.35, lift: 0, mouth: 'grump', open: 0 };
  const F = { ...FACE0 };
  let faceKey = '';
  function drawFace() {
    const q = (v, n = 20) => Math.round(v * n) / n;
    const key = F.hide ? 'hide' : [q(F.blink), q(F.wide), q(F.lx, 4), q(F.ly, 4), F.mode, F.mode === 'dizzy' ? q(F.spin % (PI * 2), 3) : 0, q(F.tilt), q(F.lift * 1000, 1), F.mouth, q(F.open)].join();
    if (key === faceKey) return;
    faceKey = key;
    cx.clearRect(0, 0, CW, CH);
    faceTex.needsUpdate = true;
    if (F.hide) return; // 자는 동안은 얼굴이 없는 그냥 필통
    cx.lineCap = 'round'; cx.lineJoin = 'round';
    cx.fillStyle = cx.strokeStyle = INK;
    const R = 0.011 * PX * (1 + F.wide * 0.4);
    for (const s of [-1, 1]) {
      const [ex, ey] = toC(s * 0.045, EY);
      if (F.mode === 'dot') {
        const ry = R * 1.25 * (1 - F.blink * 0.88);
        const px = ex + F.lx * 7, py = ey - F.ly * 7;
        if (ry < 6) { // 감은 눈: 아래로 휜 선
          cx.lineWidth = 7;
          cx.beginPath(); cx.moveTo(px - R, py); cx.quadraticCurveTo(px, py + 8, px + R, py); cx.stroke();
        } else {
          cx.beginPath(); cx.ellipse(px, py, R, ry, 0, 0, PI * 2); cx.fill();
          if (F.blink < 0.5) {
            cx.fillStyle = '#fff';
            cx.beginPath(); cx.arc(px + R * 0.38, py - ry * 0.42, R * 0.34, 0, PI * 2); cx.fill();
            cx.fillStyle = INK;
          }
        }
      } else if (F.mode === 'dizzy') { // 빙글빙글 소용돌이
        cx.lineWidth = 5;
        cx.beginPath();
        for (let a = 0; a <= PI * 4; a += 0.2) {
          const r = (a / (PI * 4)) * R * 1.3, b = a * s + F.spin * s;
          cx.lineTo(ex + Math.cos(b) * r, ey + Math.sin(b) * r);
        }
        cx.stroke();
      } else { // X 눈
        cx.lineWidth = 8;
        const k = R * 0.9;
        cx.beginPath(); cx.moveTo(ex - k, ey - k); cx.lineTo(ex + k, ey + k); cx.moveTo(ex + k, ey - k); cx.lineTo(ex - k, ey + k); cx.stroke();
      }
      // 눈썹: 안쪽 끝이 내려간 굵은 선 (tilt 가 클수록 화남)
      const [bx, by] = toC(s * 0.045, EY + BROW + F.lift);
      cx.save();
      cx.translate(bx, by);
      cx.rotate(-s * F.tilt);
      cx.lineWidth = 11;
      cx.beginPath(); cx.moveTo(-27, 0); cx.lineTo(27, 0); cx.stroke();
      cx.restore();
    }
    // 입
    const [mx, my] = toC(0, MY);
    const M = 0.036 * PX;
    cx.lineWidth = 7;
    cx.beginPath();
    if (F.mouth === 'grump') { // 뚱한 ㅅ자
      cx.moveTo(mx - M / 2, my + 7); cx.quadraticCurveTo(mx, my - 12, mx + M / 2, my + 7); cx.stroke();
    } else if (F.mouth === 'smirk') { // 한쪽만 씩
      cx.moveTo(mx - M / 2, my); cx.quadraticCurveTo(mx + M * 0.1, my + 10, mx + M / 2, my - 10); cx.stroke();
    } else if (F.mouth === 'grit') { // 이 악물기: 흰 이빨 칸
      const ww = M * 1.05, hh = 26;
      cx.roundRect(mx - ww / 2, my - hh / 2, ww, hh, 8);
      cx.fillStyle = '#fff'; cx.fill(); cx.fillStyle = INK; cx.lineWidth = 6; cx.stroke();
      cx.beginPath(); cx.lineWidth = 4;
      cx.moveTo(mx - ww / 2, my); cx.lineTo(mx + ww / 2, my);
      for (let i = 1; i < 5; i++) { const x = mx - ww / 2 + (ww * i) / 5; cx.moveTo(x, my - hh / 2); cx.lineTo(x, my + hh / 2); }
      cx.stroke();
    } else if (F.mouth === 'roar') { // 쩍 벌린 입 + 혀
      const ry = 10 + F.open * 16;
      cx.ellipse(mx, my, M * 0.55, ry, 0, 0, PI * 2);
      cx.fillStyle = '#5a1e22'; cx.fill(); cx.fillStyle = INK; cx.lineWidth = 6; cx.stroke();
      cx.save(); cx.clip();
      cx.fillStyle = '#ff7b8a';
      cx.beginPath(); cx.ellipse(mx, my + ry * 0.85, M * 0.32, ry * 0.5, 0, 0, PI * 2); cx.fill();
      cx.restore();
    } else if (F.mouth === 'o') { // 헉
      cx.ellipse(mx, my, 11, 14, 0, 0, PI * 2); cx.fill();
    } else if (F.mouth === 'wavy') { // 어질어질 물결
      for (let i = 0; i <= 16; i++) cx.lineTo(mx - M / 2 + (M * i) / 16, my + Math.sin((i / 16) * PI * 3) * 6);
      cx.stroke();
    } else if (F.mouth === 'ouch') { // 아야 지그재그
      for (let i = 0; i <= 6; i++) cx.lineTo(mx - M / 2 + (M * i) / 6, my + (i % 2 ? -7 : 7));
      cx.stroke();
    }
  }

  // 필통 속 졸개 (게임과 같은 몸을 작게): 바닥에 서 있고 머리가 테두리 바로 아래
  // 졸개 한 자리: 세 종류 몸을 다 넣어 두고 하나만 보임 (쏟을 때마다 종류를 새로 뽑음)
  const holder = (kind, scale) => {
    const s = new THREE.Group();
    s.scale.setScalar(scale);
    const bodies = {};
    for (const k of CHUL_MINIONS) {
      const r = MINION_BODY[k]().root;
      r.traverse((o) => { if (o.isSprite) o.visible = false; }); // 몸에 딸린 말풍선·화남 표시 같은 그림은 숨김 (몸만 씀)
      bodies[k] = r;
      s.add(r);
    }
    s.userData.setKind = (kind) => { for (const k in bodies) bodies[k].visible = k === kind; };
    s.userData.setKind(kind);
    return s;
  };
  const mins = minionKinds.map((k, i) => {
    const s = holder(k, 0.5);
    s.position.set((i / (minionKinds.length - 1) - 0.5) * (w - 0.09), FLOOR, -0.012 + (i % 2) * 0.02);
    body.add(s);
    return s;
  });
  const minHome = mins.map((m) => m.position.clone());
  // 쏟아져 나오는 졸개: 필통 속에서 튀어나와 앞에 떨어지는 모형 (게임에서는 벌떡 일어나는 순간 진짜 몬스터로 바뀜)
  const spill = minionKinds.map((k) => { const s = holder(k, 0.42); root.add(s); return s; });

  const mark = angerMark();
  mark.position.set(0.11, h + 0.07, 0.02);
  body.add(mark);
  // 머리 위를 도는 별 (어질어질)
  const starShape = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = PI / 2 + (i * PI) / 5, r = i % 2 ? 0.006 : 0.014; starShape[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); }
  const starGeo = new THREE.ExtrudeGeometry(starShape, { depth: 0.003, bevelEnabled: false }).translate(0, 0, -0.0015);
  const stars = new THREE.Group();
  stars.position.y = h + lidH + 0.05;
  body.add(stars);
  const starM = mat('#ffd23f', 0.4);
  const starList = [0, 1, 2].map(() => mesh(starGeo, starM, stars, '별'));
  // 쾅! 땅에 퍼지는 충격 고리
  const ringM = new THREE.MeshBasicMaterial({ color: '#fff7d6', transparent: true, depthWrite: false });
  const ring = mesh(new THREE.RingGeometry(0.85, 1, 48).rotateX(-PI / 2).translate(0, 0.002, 0), ringM, root, '고리');
  ring.castShadow = false;
  // 찌그러짐 (화난 단계): 앞면 왼쪽 아래가 움푹 (k 0~1), 색도 회색빛으로 바램
  const pos = base.geometry.attributes.position;
  const flat = Float32Array.from(pos.array);
  const dented = Float32Array.from(pos.array);
  for (let i = 0; i < pos.count; i++) {
    const x = flat[i * 3], y = flat[i * 3 + 1], z = flat[i * 3 + 2];
    if (z > 0) dented[i * 3 + 2] = z - Math.max(0, 1 - Math.hypot(x + 0.1, y - 0.03) / 0.05) * 0.018;
  }
  let dentK = -1;
  const blue = new THREE.Color(CHUL_BLUE), gray = new THREE.Color(CHUL_DENT);
  const P = {
    g, root, spin, body, base, hinge, snap, lid, fangs, mins, spill, mark, stars, ring, HY, HZ, CY, w, h, d,
    minsOut: false, // 졸개를 쏟아 내 필통 속이 비었음
    spillAt: [[-0.12, 0.2], [0, 0.25], [0.12, 0.2]], // 쏟은 졸개가 떨어지는 자리 (몸 앞쪽, 시안 단위)
    spillGone: [false, false, false], // 진짜 몬스터로 바뀌어 모형을 숨김
    setKinds(kinds) { kinds.forEach((k, i) => { mins[i].userData.setKind(k); spill[i].userData.setKind(k); }); },
    game: false, // 게임에서는 걷기가 제자리 (자리는 보스가 옮김)
    reset() {
      for (const o of [root, spin, body]) { o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1); }
      root.position.set(0, 0, 0);
      spin.position.set(0, CY, 0);
      body.position.set(0, -CY, 0);
      hinge.rotation.set(0, 0, 0);
      snap.rotation.set(0, 0, 0);
      Object.assign(F, FACE0);
      mins.forEach((m, i) => { m.position.copy(minHome[i]); m.rotation.set(0, 0, 0); m.visible = !P.minsOut; });
      spill.forEach((s) => { s.visible = false; s.position.set(0, 0, 0); s.rotation.set(0, 0, 0); s.scale.setScalar(0.42); });
      fangs.forEach((f) => f.rotation.set(0, 0, 0));
      mark.visible = false;
      stars.visible = false;
      ring.visible = false;
      P.dent(0);
    },
    lid(o) { hinge.rotation.x = -o; }, // 0 닫힘 · 1 쩍 · 1.6 뒤로 젖혀짐
    hideFace() { F.hide = true; },
    blink(k) { F.blink = k; },
    wide(k) { F.wide = k; },
    look(x, y = 0) { F.lx = x; F.ly = y; },
    eyeMode(m) { F.mode = m; }, // 'dot' 점 눈 · 'dizzy' 소용돌이 · 'x' 쓰러짐
    spiral(a) { F.spin = a; },
    brow(tilt, lift = 0) { F.tilt = tilt; F.lift = lift; },
    mouth(type, open = 0) { F.mouth = type; F.open = open; }, // grump 뚱 · grit 이 악물기 · roar 쩍 · o 헉 · wavy 어질 · ouch 아야 · smirk 씩
    drawFace,
    angry(u, t) { mark.visible = u >= 0; mark.scale.setScalar(0.06 * angerPulse(u, t)); },
    // 몸 한가운데를 축으로 앞(+)·뒤(-)로 굴림. 땅에 닿게 높이를 맞춤
    roll(a) { spin.rotation.x = a; spin.position.y = Math.abs(HY * Math.cos(a)) + Math.abs(HZ * Math.sin(a)); },
    dent(k) {
      if (k === dentK) return;
      dentK = k;
      for (let i = 0; i < pos.array.length; i++) pos.array[i] = flat[i] + (dented[i] - flat[i]) * k;
      pos.needsUpdate = true;
      base.geometry.computeVertexNormals();
      [base, lid].forEach((o) => o.material.color.copy(blue).lerp(gray, k)); // 툰 재질로 바뀐 뒤에도 지금 붙은 재질의 색을 바꿈
    },
    rattle(t, k = 1) { mins.forEach((m, i) => (m.position.y = minHome[i].y + Math.abs(Math.sin(t * 17 + i * 2)) * 0.006 * k)); }, // 안에서 달그락
    peek(i, k) { mins[i].position.y = minHome[i].y + k * 0.035; },
    starsSpin(t) {
      stars.visible = true;
      starList.forEach((s, i) => { const a = t * 4 + (i * PI * 2) / 3; s.position.set(Math.cos(a) * 0.07, Math.sin(a * 2) * 0.006, Math.sin(a) * 0.05); s.rotation.y = t * 6; });
    },
    shock(u) { ring.visible = u > 0 && u < 1; ring.scale.setScalar(0.05 + u * 0.28); ringM.opacity = (1 - u) * 0.9; },
  };
  // 윤곽선 통일: 부품 크기·졸개 축소와 상관없이 모두 같은 굵기 (외곽선은 부품 자기 크기 기준으로 밀리므로 줄인 만큼 나눠 줌)
  g.traverse((o) => {
    if (!o.isMesh) return;
    let k = 1;
    for (let p = o; p && p !== g; p = p.parent) k *= p.scale.x;
    o.userData.outlineWidth = line / k;
  });
  P.reset();
  return P;
}

// 동작: fn(P, t) 의 t 는 동작을 시작한 뒤 흐른 시간 (시안은 period 마다 되풀이). loop 는 끝없이 · dur 는 게임에서 이만큼 하고 끝남
// key 는 게임에서 부르는 이름
const roarFn = (P, t) => {
  const c = t % 3;
  P.mouth('roar', Math.sin((Math.min(1, c / 0.6) * PI) / 2) * (c < 2.4 ? 1 : 0));
  const rear = smooth(cseg(c, 0.2, 0.6)) * (1 - smooth(cseg(c, 2.2, 2.6)));
  P.roll(-rear * 0.3);
  P.lid(rear * 1.35);
  P.root.position.x = rear * Math.sin(t * 60) * 0.004;
  P.fangs.forEach((f, i) => (f.rotation.x = rear * Math.sin(t * 50 + i) * 0.25));
  P.brow(0.35 + rear * 0.35);
  P.blink(rear * 0.35);
  P.mins.forEach((m, i) => (m.position.y += rear * 0.025 * (0.6 + Math.abs(Math.sin(t * 9 + i)) * 0.4)));
  P.angry(c > 0.35 && c < 2.4 ? c - 0.35 : -1, t);
};
export const CHUL_MOTIONS = [
  { key: 'sleep', name: '잠', desc: '뚜껑 꼭 닫고 얼굴 없이 쿨쿨, 가끔 들썩', loop: true, fn(P, t) {
    P.hideFace();
    const b = Math.sin(t * 1.3);
    P.body.scale.set(1 - b * 0.004, 1 + b * 0.008, 1);
    P.lid(cbump(t % 6, 4.6, 5.3) * 0.06); // 코 골듯 뚜껑이 살짝
  } },
  { key: 'wake', name: '깨어남 (맞으면)', desc: '부르르 → 뚜껑 퐁, 눈 번쩍 → 포효', dur: 3.0, period: 4, fn(P, t) {
    if (t < 0.6) { // 아직 얼굴 없이 부르르
      P.hideFace();
      P.root.position.x = Math.sin(t * 50) * 0.004 * (t / 0.6);
      P.lid(Math.abs(Math.sin(t * 30)) * 0.04);
      return;
    }
    roarFn(P, t - 0.6);
    P.wide(cbump(t, 0.6, 1.2));
  } },
  { key: 'idle', name: '대기 (깨어 있음)', desc: '눈 뜨고 뚜껑이 숨 쉬듯 들썩, 가끔 졸개가 빼꼼', loop: true, fn(P, t) {
    const c = t % 5, b = Math.sin(t * 2.2);
    P.body.scale.set(1 - b * 0.006, 1 + b * 0.012, 1);
    P.blink(blinkAt(c, 1.6, 4.4));
    const pk = P.minsOut ? 0 : smooth(cseg(c, 2.4, 2.8)) * (1 - smooth(cseg(c, 3.8, 4.1))); // 가운데 졸개가 빼꼼
    P.lid(0.04 + 0.03 * b + pk * 0.3);
    P.peek(1, pk);
    P.look(pk * 0.2, pk * 1.4); // 위를 힐끔
    if (pk > 0.9) P.brow(0.35 + Math.sin(t * 10) * 0.06); // 들어가! 하고 눈썹 들썩
  } },
  { key: 'doze', name: '다시 잠들기', desc: '하품 → 눈 스르르 → 뚜껑 닫고 얼굴이 사라짐', dur: 2.6, period: 3.4, fn(P, t) {
    const yawn = cbump(t, 0.2, 1.4);
    P.lid(yawn * 0.45);
    P.mouth(yawn > 0.2 ? 'o' : 'grump');
    P.roll(-yawn * 0.1);
    P.brow(0.1 - yawn * 0.15, yawn * 0.004);
    P.blink(Math.min(1, cseg(t, 0.6, 1.8) + yawn * 0.6));
    if (t > 2) P.hideFace();
    P.body.scale.y = 1 - cbump(t, 1.8, 2.4) * 0.03; // 털썩 내려앉음
  } },
  { key: 'walk', name: '쿵쿵 걷기', desc: '다리 없이 통째로 쿵쿵 뛰어 이동, 착지마다 달그락', loop: true, fn(P, t) {
    const ph = (t / 0.5) % 1, k = Math.sin(ph * PI);
    if (!P.game) { // 시안: 앞뒤로 왔다 갔다
      P.root.position.z = Math.sin((t / 4) * PI * 2) * 0.05;
      P.root.rotation.y = Math.cos((t / 4) * PI * 2) * 0.35;
    }
    P.root.position.y = k * 0.022;
    P.spin.rotation.z = Math.sin(t * PI * 2) * 0.07; // 한쪽씩 들썩이며 뒤뚱
    P.roll(Math.sin(ph * PI * 2) * 0.06);
    const land = Math.max(0, 1 - ph / 0.15);
    P.body.scale.set(1 + land * 0.03, 1 - land * 0.05, 1);
    P.lid(land * 0.12); // 쿵 할 때 뚜껑이 덜컥
    P.rattle(t, 1);
    P.brow(0.42);
  } },
  { key: 'notice', name: '화들짝!', desc: '뚜껑이 퐁 열리며 펄쩍, 그리고 노려봄', dur: 1.6, period: 2.6, fn(P, t) {
    const c = t % 2.6;
    P.mouth(c > 0.3 && c < 1.4 ? 'o' : 'grit');
    P.root.position.y = cbump(c, 0.3, 0.75) * 0.045;
    P.lid(cbump(c, 0.3, 0.9) * 0.8 + (c > 0.9 ? Math.abs(wob(c - 0.9, 8, 40)) * 0.08 : 0));
    P.wide(cbump(c, 0.3, 1.3));
    P.brow(0.35 - cbump(c, 0.3, 1.3) * 0.6, cbump(c, 0.3, 1.3) * 0.006);
    P.mins.forEach((m, i) => (m.position.y += cbump(c, 0.35 + i * 0.05, 0.9 + i * 0.05) * 0.035));
    if (c > 1.4) { P.brow(0.6); P.body.scale.set(1.02, 0.97, 1); P.look(0, -0.4); } // 노려봄
  } },
  { key: 'roar', name: '포효 (화남)', desc: '뚜껑 활짝, 색연필 이빨 달달달, 부들부들', dur: 2.6, period: 3, fn: roarFn },
  { key: 'bite', name: '덜컥 물기', desc: '뒤로 젖혀 쩍 → 와락 덤비며 덜컥!', dur: 1.8, period: 2.4, hitAt: 0.95, fn(P, t) {
    const c = t % 2.4;
    P.mouth('grit');
    const wind = smooth(cseg(c, 0.2, 0.75)), lunge = cbump(c, 0.75, 1.35);
    P.roll(-wind * 0.22 * (c < 0.8 ? 1 : 1 - cseg(c, 0.8, 0.9)) + lunge * 0.22);
    P.lid(c < 0.92 ? wind * 1.1 : 1.1 * (1 - cseg(c, 0.92, 0.98)) + Math.abs(wob(c - 0.98, 9, 40)) * 0.06);
    P.root.position.z = lunge * 0.07;
    P.root.position.y = cbump(c, 0.75, 1.05) * 0.02;
    if (c > 0.95 && c < 1.15) P.body.scale.set(1.04, 0.94, 1.04);
    P.brow(0.35 + wind * 0.3);
    P.mins.forEach((m) => (m.position.y += wind * (c < 0.92 ? 0.02 : 0)));
  } },
  { key: 'spill', name: '와르르 쏟기', desc: '앞으로 기울여 탈탈 → 속에서 졸개 셋이 퐁퐁 튀어나옴 (소환)', dur: 3.0, period: 4.4, fn(P, t) {
    const c = t % 4.4;
    P.mouth('smirk');
    const tip = smooth(cseg(c, 0.3, 0.9)) * (1 - smooth(cseg(c, 1.9, 2.5)));
    P.roll(tip * 0.85);
    P.lid(tip * 1.5);
    P.spin.rotation.z = tip * Math.sin(t * 30) * 0.03; // 탈탈 털기
    P.brow(0.5);
    P.spill.forEach((s, i) => {
      const go = cseg(c, 0.8 + i * 0.18, 1.35 + i * 0.18); // 필통 속에서 퐁 튀어나와 앞에 떨어짐
      if (go <= 0 || c > 4.1 || P.spillGone[i]) return;
      P.mins[i].visible = false; // 속에 있던 그 졸개가 나감
      s.visible = true;
      const sx = P.mins[i].position.x, [x, z] = P.spillAt[i];
      s.position.set(sx + (x - sx) * go, 0.09 * (1 - go) + cbump(go, 0, 1) * 0.11, 0.06 + (z - 0.06) * go);
      if (go >= 1) s.scale.setScalar(0.42 * (1 + Math.abs(wob(c - 1.35 - i * 0.18, 9, 30)) * 0.25 * clamp01(1 - (c - 1.35 - i * 0.18) * 3))); // 떨어지며 찌그러졌다 폄
      const up = smooth(cseg(c, 1.8 + i * 0.15, 2.2 + i * 0.15)); // 벌떡 일어남
      s.rotation.set((1 - up) * (PI / 2 + go * 2), 0, (1 - up) * 0.4 * (i - 1));
      if (c > 2.4) { // 신나서 콩콩
        s.position.y = Math.abs(Math.sin((c - 2.4) * 8 + i)) * 0.02;
        s.rotation.y = Math.sin(c * 3 + i) * 0.4;
      }
    });
  } },
  { key: 'roll', name: '데굴데굴 돌진', desc: '몸을 말아 굴러 돌진 → 쿵 부딪혀 어질', dur: 4, period: 4.6, fn(P, t) {
    const c = t % 4.6;
    P.mouth('grit');
    const crouch = cbump(c, 0, 0.5);
    P.body.scale.set(1 + crouch * 0.05, 1 - crouch * 0.1, 1);
    const u = cseg(c, 0.45, 2.1);
    if (u > 0 && c < 2.15) P.roll(smooth(u) * PI * 4);
    if (!P.game) P.root.position.z = -0.14 + smooth(u) * 0.3 - cbump(c, 2.1, 2.5) * 0.04; // 쿵 튕겨 나옴
    if (c > 2.1 && c < 2.5) P.roll(-cbump(c, 2.1, 2.5) * 0.3);
    if (c > 2.3 && c < 4) { // 어질어질
      P.eyeMode('dizzy');
      P.spiral(t * 9);
      P.mouth('wavy');
      P.starsSpin(t);
      P.spin.rotation.z = Math.sin(t * 5) * 0.08;
      P.lid(0.15 + Math.sin(t * 5) * 0.08);
    }
    if (!P.game && c > 4) P.root.position.z = 0.16 - cseg(c, 4, 4.6) * 0.3; // 제자리로 (시안용)
  } },
  { key: 'slam', name: '쾅 내려찍기', desc: '펄쩍 뛰어올라 쾅! 충격 고리', dur: 2.2, period: 3, hitAt: 1.15, fn(P, t) {
    const c = t % 3;
    P.mouth(c > 0.5 && c < 1.15 ? 'o' : 'grit');
    const sq = cbump(c, 0, 0.5);
    P.body.scale.set(1 + sq * 0.06, 1 - sq * 0.15, 1 + sq * 0.06);
    const air = cseg(c, 0.5, 1.15);
    if (air > 0 && air < 1) {
      P.root.position.y = Math.sin(air * PI) * 0.2 * (1 - air * 0.15);
      P.lid(0.4 + Math.sin(air * 20) * 0.2);
      P.roll(-0.15 + air * 0.25);
      P.wide(0.3);
    }
    const land = c - 1.15;
    if (land > 0) {
      const k = Math.max(0, 1 - land / 0.25);
      P.body.scale.set(1 + k * 0.12, 1 - k * 0.22, 1 + k * 0.12);
      P.shock(land / 0.7);
      P.rattle(t, k * 3);
      P.lid(Math.abs(wob(land, 6, 30)) * 0.25);
      P.brow(0.55);
    }
  } },
  { key: 'hit', name: '아야', desc: '움찔 밀려나며 뚜껑이 덜컥, 졸개 튐', dur: 1.0, period: 1.6, fn(P, t) {
    const c = t % 1.6;
    const u = P.game ? c : c - 0.2; // 시안은 잠깐 쉬었다가
    P.mouth(u > 0 ? 'ouch' : 'grump');
    if (u < 0) return;
    const k = Math.exp(-5 * u);
    P.roll(-0.3 * wob(u, 5, 18));
    P.root.position.z = -0.04 * (1 - Math.exp(-12 * u)) * k * 2;
    P.lid(Math.abs(wob(u, 6, 25)) * 0.6);
    P.blink(u < 0.5 ? 0.85 : 0);
    P.brow(0.1, 0.005 * k);
    P.mins.forEach((m, i) => (m.position.y += Math.max(0, Math.sin(Math.min(u * 6, PI))) * 0.03 * (1 + i * 0.2)));
  } },
  { key: 'dizzy', name: '어질어질 (빈틈)', desc: '별이 빙글, 뚜껑 반쯤 열려 덜렁 — 때릴 기회', loop: true, fn(P, t) {
    P.eyeMode('dizzy');
    P.spiral(t * 8);
    P.mouth('wavy');
    P.starsSpin(t);
    P.spin.rotation.z = Math.sin(t * 2.5) * 0.1;
    P.roll(Math.cos(t * 2.5) * 0.08);
    P.lid(0.35 + Math.sin(t * 2.5) * 0.12);
    P.snap.rotation.z = Math.sin(t * 2.5 + 1) * 0.06;
    P.mins.forEach((m, i) => { m.position.y += 0.012; m.rotation.z = Math.sin(t * 2.5 + i) * 0.4; });
  } },
  { key: 'phase', name: '화난 단계로', desc: '체력 30%: 부들부들 → 쾅! 찌그러지고 경첩이 빠짐', dur: 3.2, period: 5.4, fn(P, t) {
    const c = t % 5.4;
    P.mouth(c > 1.7 ? 'roar' : 'grit', 0.6);
    const shake = cseg(c, 0, 1.2);
    P.root.position.x = Math.sin(t * 55) * 0.004 * shake;
    P.brow(0.35 + shake * 0.3);
    P.rattle(t, shake * 2);
    const air = cseg(c, 1.2, 1.7);
    if (air > 0 && air < 1) P.root.position.y = Math.sin(air * PI) * 0.09;
    const land = c - 1.7;
    if (land >= 0) {
      P.dent(Math.min(1, land / 0.08)); // 쾅! 하는 순간 움푹
      const k = Math.max(0, 1 - land / 0.25);
      P.body.scale.set(1 + k * 0.1, 1 - k * 0.18, 1 + k * 0.1);
      P.shock(land / 0.7);
      P.snap.rotation.z = 0.32 - wob(land, 3, 14) * 0.2 + Math.sin(t * 6) * 0.05; // 경첩 하나가 빠져 덜렁
      P.lid(0.25 + Math.max(0, Math.sin(t * 5)) * 0.2);
      P.brow(0.65);
      P.angry(land - 0.2, t);
      P.root.position.x = Math.sin(t * 40) * 0.002;
    }
    if (!P.game && c > 5) P.dent(1 - cseg(c, 5, 5.4)); // 시안용: 원래대로
  } },
  { key: 'die', name: '비틀 꽈당', desc: '비틀비틀 → 뒤로 꽈당, 뚜껑 활짝', dur: 3.2, period: 5, fn(P, t) {
    const c = t % 5;
    P.mouth(c > 1.45 ? 'o' : 'wavy');
    P.spin.rotation.z = Math.sin(c * 7) * 0.1 * cbump(c, 0, 1);
    P.root.position.x = Math.sin(c * 3.5) * 0.02 * cbump(c, 0, 1);
    P.blink(cbump(c, 0, 1) * 0.5);
    const fall = cseg(c, 1, 1.45);
    if (fall > 0) {
      P.roll(-(PI / 2) * (fall * fall) - (c > 1.45 ? wob(c - 1.45, 7, 26) * 0.08 : 0));
      P.root.position.z = -fall * 0.04;
      P.lid(fall * 1.7);
      P.eyeMode(c > 1.45 ? 'x' : 'dot');
      if (c > 1.4) P.mins.forEach((m) => (m.visible = false));
      P.spill.forEach((s, i) => {
        const go = cseg(c, 1.4 + i * 0.12, 2 + i * 0.12);
        if (go <= 0 || P.game) return; // 게임에서는 쓰러질 때 모형을 쏟지 않음
        s.visible = true;
        const a2 = (i - 1) * 0.9;
        s.position.set(Math.sin(a2) * 0.18 * go, 0.1 * (1 - go) + cbump(go, 0, 1) * 0.1, -0.12 - Math.cos(a2) * 0.12 * go);
        s.rotation.set(go * 5, 0, (1 - go) * 2 + (PI / 2) * go * (i - 1 || 1));
      });
    }
  } },
];
export const CHUL_BY_KEY = Object.fromEntries(CHUL_MOTIONS.map((m) => [m.key, m]));

// ── 들판 필드보스 ──
// 잠(뚜껑 닫고 얼굴 없음) → 맞으면 포효하며 깸 → 싸움 (물기·내려찍기·와르르 쏟기로 졸개 소환)
// 싸우는 캐릭터가 싸움터(둥근 영역) 밖으로 나가면 제자리로 돌아가며 체력이 서서히 참 (돌아가는 동안은 맞지 않음)
// 제자리에서 한동안 싸우지 않으면 하품하고 뚜껑을 닫고 다시 잠. 그 전까지는 눈 뜨고 대기
// 싸우는 동안에는 싸움터 둘레가 땅에 빨간 원으로 보인다. 몬스터는 화면마다 따로 판정한다 (다른 들판 몬스터와 같음)
const BOSS_SIZE = 1.6; // 다른 들판 몬스터보다 이만큼 크게 (너비 약 2.4m)
const SCALE = 1.5 * 1.7 * 2 * BOSS_SIZE; // plaza-monsters 의 SCALE × BOSS_SIZE
const OUTLINE_SCALE = 0.65; // 마을 주민과 같은 외곽선 배율
const BODY_R = 1.05; // 캐릭터가 지나가지 못하는 둥근 몸 (m)
const SPEED = 1.5; // 쫓아오는 빠르기 (m/s)
const HOME_SPEED = 2.6; // 제자리로 돌아가는 빠르기
const BITE_REACH = 1.3; // 몸 가장자리에서 이만큼 안이면 물기
const SLAM_R = 3.2; // 내려찍기 충격이 닿는 둘레 (가운데에서)
const REGEN = 0.06; // 제자리로 돌아가거나 쉬는 동안 1초에 최대 체력의 이만큼 참
const SLEEP_AFTER = 15; // 이만큼(초) 싸우지 않으면 다시 잠
const RESPAWN = 60; // 쓰러진 뒤 다시 나타나기까지 (초)
const PHASE_HP = 0.3; // 체력이 이만큼 아래로 떨어지면 화난 단계 (찌그러짐·더 빨라짐)
const SPILL_UP = 2.2; // 쏟은 졸개 모형이 벌떡 일어나 진짜 몬스터로 바뀌는 때 (쏟기 시작부터 초, 하나마다 0.15초씩 늦게)
const FLINCH_GUARD = 3; // 한 번 움찔한 뒤 이 동안은 맞아도 움찔하지 않음 (보스라 잘 안 밀림)
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const BOSS_STATES = ['sleep', 'wake', 'fight', 'return', 'awake', 'doze', 'dead', 'gone']; // 주고받는 상태 번호
// 둥근 지평선 위에 놓기: 크고 납작한 몸이라 가운데 높이만 맞추면 멀리 있을 때 앞쪽 모서리가 땅에 묻힌다 →
// 그 자리 땅의 기울기(curveDrop 이 바뀌는 정도)만큼 몸을 기울여 바닥 전체를 땅에 붙인다
const UP = new THREE.Vector3(0, 1, 0);
const nrm = new THREE.Vector3(), qTilt = new THREE.Quaternion(), qYaw = new THREE.Quaternion();
function placeOnCurve(o, x, z, yaw) {
  const e = 1;
  nrm.set((curveDrop(x + e, z) - curveDrop(x - e, z)) / (2 * e), 1, (curveDrop(x, z + e) - curveDrop(x, z - e)) / (2 * e)).normalize();
  o.position.set(x, -curveDrop(x, z), z);
  o.quaternion.copy(qTilt.setFromUnitVectors(UP, nrm)).multiply(qYaw.setFromAxisAngle(UP, yaw));
}

// 싸움터 둘레: 둥근 지평선을 따라 땅에 붙은 빨간 띠
// 지평선이 휘는 기준(curveDrop)은 캐릭터를 따라 움직이므로, 보이는 동안 매 장면 높이를 다시 맞춘다 (userData.fit)
function arenaRing(cx, cz, R) {
  const N = 256, W = 0.09; // 칸 수 · 띠 두께 (m)
  const pos = new Float32Array((N + 1) * 2 * 3);
  const idx = [];
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * PI * 2;
    for (let j = 0; j < 2; j++) {
      const r = R + (j ? W : -W) / 2;
      pos.set([cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r], (i * 2 + j) * 3);
    }
    if (i < N) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const geo = new THREE.BufferGeometry();
  const attr = new THREE.BufferAttribute(pos, 3);
  geo.setAttribute('position', attr);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, 0, cz), R + 1);
  geo.setIndex(idx);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#ff4a3a', transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }));
  m.renderOrder = 2;
  m.visible = false;
  m.frustumCulled = false; // 높이를 매번 바꾸므로 화면 밖 가리기는 하지 않음 (256칸이라 가벼움)
  m.userData.fit = () => {
    for (let i = 0; i < pos.length; i += 3) pos[i + 1] = -curveDrop(pos[i], pos[i + 2]) + 0.05;
    attr.needsUpdate = true;
  };
  return m;
}

// x, z: 제자리 (자는 곳) · r: 싸움터 반지름 · summon(kind, x, z, lv) → 불러낸 몬스터 · unsummon(m): 치움
// id: 모두의 화면에서 같은 보스를 가리키는 이름 (피해를 서버로 나눠 맞추고 기여도를 셀 때 씀)
// onSpill(종류 번호 셋) → 서버에 알렸으면 true (그때는 서버가 전해 줄 때 spill 로 쏟는다)
export function createChulBoss(scene, { id = null, onSpill, x: HX, z: HZ, r: ARENA = 10, lv, onAttack, blocked = () => false, summon, unsummon, heading: HOME_HEAD = 0 } = {}) {
  const STATS = monsterStats('chul', lv);
  const P = makeChulBody({ line: CHUL_LINE / BOSS_SIZE, minions: [0, 1, 2].map(() => CHUL_MINIONS[Math.floor(Math.random() * 3)]) });
  P.game = true;
  const root = new THREE.Group();
  root.add(P.g);
  P.g.scale.setScalar(SCALE);
  scene.add(root);
  syncToon(root, true, OUTLINE_SCALE);
  root.userData.batches = []; // 부품을 묶지 않음 (뚜껑·얼굴·찌그러짐이 따로 움직임)
  const ring = arenaRing(HX, HZ, ARENA);
  scene.add(ring);

  let px = HX, pz = HZ, heading = HOME_HEAD;
  let hp = STATS.hp;
  let state = 'sleep'; // sleep 잠 · wake 깨어남 · fight 싸움 · return 돌아감 · awake 깨어 대기 · doze 잠드는 중 · dead 쓰러짐 · gone 사라짐
  let motion = CHUL_BY_KEY.sleep, motionT = 0, hitDone = false;
  let calm = 0; // 싸우지 않은 시간
  let goneFor = 0;
  let phase2 = false; // 화난 단계
  let flinchGuard = 0;
  let biteCool = 0, slamCool = 6, spillCool = 4;
  let ringFade = 0;
  let clock = 0;
  const minions = []; // 불러낸 졸개
  let mseq = 0; // 동작을 시작한 횟수 (받는 화면이 새 동작을 알아챔)
  const play = (key) => { motion = CHUL_BY_KEY[key]; motionT = 0; hitDone = false; mseq = (mseq + 1) % 1000; };
  const busy = () => !motion.loop && motionT < motion.dur;
  const clearMinions = () => { while (minions.length) unsummon?.(minions.pop()); P.minsOut = false; };
  const meIn = (me) => me && Math.hypot(me.x - HX, me.z - HZ) <= ARENA;
  // ── 함께 보기 (plaza-monsters 와 같음): 서버가 맡긴 화면만 싸움(쫓기·물기·내려찍기·쏟기·돌아가기)을 정하고, 다른 화면은 받은 대로 따름
  let owned = false, followUntil = 0, foeSid = null, seenSeq = -1, snap = null, sentKey = '', sentAt = -1e9;
  const isFollow = () => !owned && performance.now() < followUntil;
  // 상대할 학생: 따르는 화면은 받은 학생 · 정하는 화면은 싸움터 안에서 싸우던 학생, 없으면 싸움터 안 가장 가까운 학생 (아무도 없으면 가장 가까운 학생)
  const pickFoe = (meLocal, ctx, follow) => {
    if (!ctx) return meLocal;
    const find = (sid) => ctx.people.find((p) => p.sid === sid) ?? null;
    if (follow) return foeSid ? find(foeSid) : null;
    const cur = foeSid && find(foeSid);
    if (cur && meIn(cur)) return cur;
    let best = null, bd = Infinity;
    for (const p of ctx.people) { const d = Math.hypot(p.x - px, p.z - pz) + (meIn(p) ? 0 : 1000); if (d < bd) { bd = d; best = p; } }
    foeSid = best?.sid ?? null;
    return best;
  };
  const startFight = () => { state = 'fight'; calm = 0; };

  // 길 찾기: 가려는 쪽 앞(LOOK m 안)에 나무·바위가 있거나 싸움터 밖이면 조금씩 옆으로 틀어 빈 쪽을 찾는다
  // 한쪽으로 돌기 시작하면 DETOUR 초 동안은 그쪽으로만 돌아 (좌우로 갈팡질팡하지 않게) 장애물을 끼고 돈다
  const LOOK = [0.8, 1.6, 2.4];
  const DETOUR = 1.2;
  let detourSide = 0, detourT = 0;
  const clear = (a) => LOOK.every((l) => {
    const x = px + Math.sin(a) * l, z = pz + Math.cos(a) * l;
    return !blocked(x, z, BODY_R * 0.6) && Math.hypot(x - HX, z - HZ) < ARENA - BODY_R * 0.5;
  });
  function steer(want, dt) {
    detourT -= dt;
    if (detourT <= 0) detourSide = 0;
    if (!detourSide && clear(want)) return want;
    // 처음 막혔으면 지금 몸이 더 틀어져 있는 쪽부터 (돌아서는 데 덜 걸림)
    const first = detourSide || (wrap(heading - want) >= 0 ? 1 : -1);
    for (const side of [first, -first]) {
      for (let k = 1; k <= 10; k++) {
        const a = want + side * k * 0.25; // 14도씩, 140도까지
        if (clear(a)) { detourSide = side; detourT = DETOUR; return a; }
      }
    }
    detourSide = 0;
    return null;
  }
  // 공격이 닿는 순간
  function strike(me) {
    if (!me) return;
    const d = Math.hypot(me.x - px, me.z - pz);
    if (motion.key === 'bite') {
      const front = Math.abs(wrap(Math.atan2(me.x - px, me.z - pz) - heading)) < 1.1;
      if (front && d < BODY_R + BITE_REACH) onAttack?.(px, pz, STATS, id);
    } else if (motion.key === 'slam') {
      if (d < SLAM_R) onAttack?.(px, pz, { ...STATS, atk: Math.round(STATS.atk * 1.3) }, id);
    }
  }
  // 와르르 쏟기: 필기도구 몬스터 중 무작위로 셋을 뽑아 필통 속 졸개를 그 종류로 바꾸고,
  // 튀어나온 모형이 땅에 떨어져 벌떡 일어나는 순간 그 자리에 진짜 몬스터를 불러냄
  // 함께 싸우기: onSpill(종류 번호 셋) 이 있으면 바로 쏟지 않고 서버에 알리고, 서버가 모두에게 같은 종류·이름으로 전해 주면(spill) 쏟는다
  // (졸개 이름 ids 가 같아야 모든 화면에서 같은 졸개로 맞고 기여도를 센다)
  let spillKinds = [];
  let spillIds = [null, null, null];
  const v3 = new THREE.Vector3();
  const pickKinds = () => [0, 1, 2].map(() => Math.floor(Math.random() * CHUL_MINIONS.length));
  function startSpill(kinds = pickKinds(), ids = [null, null, null]) {
    spillKinds = kinds.map((k) => CHUL_MINIONS[k] ?? CHUL_MINIONS[0]);
    spillIds = ids;
    P.setKinds(spillKinds);
    P.spillGone = [false, false, false];
    play('spill');
  }
  function spillStep() {
    for (let i = 0; i < 3; i++) {
      if (P.spillGone[i] || motionT < SPILL_UP + i * 0.15) continue;
      P.spillGone[i] = true;
      P.minsOut = true;
      P.spill[i].getWorldPosition(v3);
      const m = summon?.(spillKinds[i], v3.x, v3.z, Math.max(1, STATS.lv - 4), spillIds[i]);
      if (m) minions.push(m);
    }
  }

  return {
    root,
    kind: 'chul',
    stats: STATS,
    get state() { return state; },
    colliders() { return state === 'gone' || state === 'dead' ? [] : [{ x: px, z: pz, r: BODY_R }]; },
    // 휘두르기·화살·마법이 닿았는지: 큰 몸이라 가운데뿐 아니라 때린 쪽 몸 가장자리도 본다
    tryHit(ax, az, hits, byMe = false, power = 10) {
      if (state === 'gone' || state === 'dead' || state === 'return') return null; // 돌아가는 동안은 맞지 않음
      const d = Math.hypot(ax - px, az - pz) || 1;
      const ex = px + ((ax - px) / d) * BODY_R * 0.85, ez = pz + ((az - pz) / d) * BODY_R * 0.85;
      let at = null;
      if (hits(px, pz)) at = [px, pz];
      else if (hits(ex, ez)) at = [ex, ez];
      if (!at) return null;
      if (!power) return { x: at[0], z: at[1], y: 0.5, dmg: 0 };
      return this.takeHit(at, power * defCut(STATS.def), byMe);
    },
    id,
    // 서버가 전해 준 졸개 소환 (누구 화면의 보스가 쏟으려 했든 모두 같이): kinds 종류 번호 셋 · ids 졸개 이름 셋
    // 싸우는 중이면 와르르 쏟는 동작으로, 아니면(이 화면은 싸움터 밖에서 구경 중) 보스 곁에 바로 불러낸다
    spill(kinds, ids) {
      if (state === 'gone' || state === 'dead') return;
      spillCool = phase2 ? 14 : 20; // 모두의 화면에서 다음 소환까지 같이 기다림
      if (state === 'fight') { startSpill(kinds, ids); return; }
      kinds.forEach((k, i) => {
        const a = heading + (i - 1) * 0.9;
        const m = summon?.(CHUL_MINIONS[k] ?? CHUL_MINIONS[0], px + Math.sin(a) * BODY_R * 1.4, pz + Math.cos(a) * BODY_R * 1.4, Math.max(1, STATS.lv - 4), ids[i]);
        if (m) minions.push(m);
      });
    },
    // 다른 학생이 때린 피해를 그대로 받는다 (그 학생 화면에서 굴린 값이 서버를 거쳐 옴): 모두의 화면에서 체력이 같게
    // dmg: 방어력까지 뺀 실제 피해 · 사라졌거나 쓰러지는 중이면 null
    setOwned(v) { owned = !!v; if (owned) { followUntil = 0; sentKey = ''; } },
    get owned() { return owned; },
    // 맡은 화면: [x cm, z cm, 방향 0~255, 상태 번호, 동작 이름, 동작 횟수, 체력 ×10, 상대 학생, 화난 단계]
    syncOut(t) {
      const si = BOSS_STATES.indexOf(state);
      const key = `${si}|${mseq}|${foeSid}|${phase2}`;
      if (t - sentAt < (key !== sentKey ? 50 : state === 'fight' || state === 'return' || state === 'wake' ? 200 : 2000)) return null;
      sentKey = key;
      sentAt = t;
      return [Math.round(px * 100), Math.round(pz * 100), Math.round((((heading % (PI * 2)) + PI * 2) % (PI * 2)) / (PI * 2) * 256) & 255,
        si, motion.key, mseq, Math.round(Math.max(0, hp) * 10), foeSid ?? '', phase2 ? 1 : 0];
    },
    // 따르는 화면: 받은 상태대로 (졸개 쏟기는 서버의 bossSpill 로 모두 같이 하므로 동작 이름이 spill 이어도 여기서 틀지 않음)
    syncIn([x, z, h, si, key, seq, hp10, fs, p2]) {
      if (owned) return;
      const t = performance.now();
      const fresh = t >= followUntil;
      followUntil = t + 1500;
      snap = { x: x / 100, z: z / 100, h: (h / 256) * PI * 2 };
      foeSid = fs || null;
      phase2 = !!p2;
      const s = BOSS_STATES[si] ?? state;
      if (s !== state) {
        if (s === 'dead') { if (state !== 'gone') { state = 'dead'; play('die'); clearMinions(); } }
        else if (state === 'gone' || state === 'dead') {
          if (s !== 'gone') { state = s; hp = STATS.hp; root.visible = true; px = snap.x; pz = snap.z; heading = snap.h; play(s === 'sleep' ? 'sleep' : 'idle'); }
        } else {
          if (state === 'fight' && s === 'return') clearMinions();
          state = s;
        }
      }
      if (seq !== seenSeq && !fresh && key !== 'spill' && CHUL_BY_KEY[key] && state !== 'dead' && state !== 'gone' && key !== motion.key) play(key);
      else if (seq !== seenSeq && !fresh && (key === 'bite' || key === 'slam') && key === motion.key) play(key); // 같은 공격을 또
      seenSeq = seq;
      const nh = hp10 / 10;
      if (state !== 'dead' && state !== 'gone' && Math.abs(nh - hp) > 0.05) hp = nh;
    },
    applyHit(ax, az, dmg, sid = null) {
      if (state === 'gone' || state === 'dead') return null;
      if (sid && !isFollow() && !(foeSid && state === 'fight')) foeSid = sid; // 싸우는 상대가 없으면 때린 학생과 싸움
      const d = Math.hypot(ax - px, az - pz) || 1;
      const at = [px + ((ax - px) / d) * BODY_R * 0.85, pz + ((az - pz) / d) * BODY_R * 0.85]; // 때린 쪽 몸 가장자리
      if (!dmg) return { x: at[0], z: at[1], y: 0.5, dmg: 0 };
      return this.takeHit(at, dmg, false);
    },
    // 맞음: at 자리에 dmg(방어력까지 뺀 값)만큼
    takeHit(at, dmg, byMe) {
      const y = 0.5;
      hp -= dmg;
      calm = 0;
      if (hp <= 0) {
        state = 'dead';
        play('die');
        clearMinions();
      } else if (state === 'sleep' || state === 'doze') { // 자다 맞으면 포효하며 깸
        state = 'wake';
        play('wake');
      } else if (state === 'awake') {
        startFight();
        play('notice');
      } else if (state === 'fight' && !busy() && flinchGuard <= 0 && byMe) {
        flinchGuard = FLINCH_GUARD;
        play('hit');
      }
      return { x: at[0], z: at[1], y, dmg, kind: 'chul', lv: STATS.lv, id, dead: hp <= 0 };
    },
    // meLocal: 내 캐릭터 · ctx: { sid, people: 같은 맵 학생들 [{ sid, x, z }] } — 아래의 me 는 보스가 상대하는 학생, 공격이 닿았는지는 내 캐릭터로
    update(dt, meLocal, ctx = null) {
      const follow = isFollow();
      const me = pickFoe(meLocal, ctx, follow);
      clock += dt;
      motionT += dt;
      calm += dt;
      flinchGuard -= dt;
      biteCool -= dt;
      slamCool -= dt;
      spillCool -= dt;
      // 쓰러진 졸개는 다시 나타나지 않게 치움
      for (let i = minions.length - 1; i >= 0; i--) if (minions[i].gone) unsummon?.(minions.splice(i, 1)[0]);
      if (!minions.length && state !== 'fight') P.minsOut = false;

      if (state === 'dead') {
        if (motionT > motion.dur) { state = 'gone'; goneFor = 0; root.visible = false; }
      } else if (state === 'gone') {
        root.visible = false;
        goneFor += dt;
        if (goneFor > RESPAWN) { // 제자리에서 자는 모습으로 다시 나타남
          state = 'sleep';
          hp = STATS.hp;
          phase2 = false;
          px = HX; pz = HZ; heading = HOME_HEAD;
          play('sleep');
          root.visible = true;
        }
      } else if (state === 'wake') {
        if (me) heading += wrap(Math.atan2(me.x - px, me.z - pz) - heading) * Math.min(1, dt * 4);
        if (motionT > motion.dur) { startFight(); play('idle'); }
      } else if (state === 'fight') {
        calm = 0;
        if (follow) { /* 따르는 화면: 할 일·동작은 받은 대로 (syncIn) */ }
        else if (!meIn(me)) { // 싸우던 캐릭터가 싸움터를 벗어남: 졸개를 거두고 제자리로
          state = 'return';
          clearMinions();
          play('walk');
        } else if (!busy()) {
          if (!phase2 && hp < STATS.hp * PHASE_HP) { phase2 = true; play('phase'); }
          else {
            const want = Math.atan2(me.x - px, me.z - pz);
            const near = Math.hypot(me.x - px, me.z - pz);
            const chase = near > BODY_R + BITE_REACH * 0.7;
            const dir = chase ? steer(want, dt) : want; // 쫓는 길이 나무·바위에 막히면 옆으로 틀어 돌아감 (null: 사방이 막힘)
            heading += wrap((dir ?? want) - heading) * Math.min(1, dt * 5);
            const rush = phase2 ? 1.35 : 1;
            if (spillCool <= 0 && !minions.length && near < 6) { // 졸개 소환 (함께 싸우면 서버를 거쳐 모두 같이: spill)
              if (!onSpill?.(pickKinds())) startSpill();
              spillCool = phase2 ? 14 : 20;
            } else if (slamCool <= 0 && near < SLAM_R - 0.3) {
              play('slam'); slamCool = phase2 ? 6 : 9; biteCool = 1;
            } else if (near < BODY_R + BITE_REACH && Math.abs(wrap(want - heading)) < 0.5) {
              if (biteCool <= 0) { play('bite'); biteCool = phase2 ? 1.2 : 1.8; } else if (motion.key !== 'idle') play('idle');
            } else if (near > BODY_R + BITE_REACH * 0.7) { // 다가감 (싸움터 밖으로는 안 나감)
              const step = Math.min(near - BODY_R - BITE_REACH * 0.6, SPEED * rush * dt);
              if (dir !== null) {
                const nx = px + Math.sin(dir) * step, nz = pz + Math.cos(dir) * step;
                if (Math.hypot(nx - HX, nz - HZ) < ARENA - BODY_R * 0.5 && !blocked(nx, nz, BODY_R * 0.6)) { px = nx; pz = nz; }
              }
              if (dir === null) { if (motion.key !== 'idle') play('idle'); } // 꽉 막힘: 제자리에서 노려봄
              else if (motion.key !== 'walk') play('walk');
            } else if (motion.key !== 'idle') play('idle');
          }
        }
        if (motion.key === 'spill') spillStep();
        // 공격이 닿는 순간
        if (motion.hitAt && !hitDone && motionT >= motion.hitAt) { hitDone = true; strike(meLocal); } // 내 캐릭터에 닿았는지
      } else if (state === 'return') {
        const d = Math.hypot(HX - px, HZ - pz);
        if (d < 0.15) { state = 'awake'; calm = 0; play('idle'); }
        else {
          const want = Math.atan2(HX - px, HZ - pz);
          heading += wrap(want - heading) * Math.min(1, dt * 6);
          const step = Math.min(d, HOME_SPEED * dt);
          px += Math.sin(want) * step; pz += Math.cos(want) * step; // 돌아갈 땐 막혀도 지나감 (끼지 않게)
          if (motion.key !== 'walk') play('walk');
        }
      } else if (state === 'awake') {
        heading += wrap(HOME_HEAD - heading) * Math.min(1, dt * 2);
        if (motion.key !== 'idle') play('idle');
        if (calm > SLEEP_AFTER && hp >= STATS.hp) { state = 'doze'; play('doze'); }
      } else if (state === 'doze') {
        if (motionT > motion.dur) { state = 'sleep'; play('sleep'); }
      }
      // 싸우지 않는 동안 체력이 서서히 참 (다 차면 화난 단계도 풀림)
      // (누군가 5초 안에 때렸으면 차지 않음: 싸움터 밖에서 구경하는 화면에서도 다른 학생이 깎은 체력이 그대로 맞게)
      if ((state === 'return' || state === 'awake' || state === 'doze' || state === 'sleep') && calm > 5) {
        hp = Math.min(STATS.hp, hp + STATS.hp * REGEN * dt);
        if (hp >= STATS.hp) phase2 = false;
      }
      // 한 번 하는 동작이 끝나면 하던 대로
      if (!motion.loop && motionT > motion.dur && state !== 'dead' && state !== 'gone') play(state === 'sleep' ? 'sleep' : 'idle');
      // 따르는 화면: 맡은 화면의 자리·방향으로 부드럽게 맞춤 (아주 멀면 바로)
      if (follow && snap && state !== 'gone') {
        const ex = snap.x - px, ez = snap.z - pz;
        if (Math.hypot(ex, ez) > 4) { px = snap.x; pz = snap.z; }
        else {
          const k = 1 - Math.exp(-4 * dt);
          px += ex * k;
          pz += ez * k;
          heading += wrap(snap.h - heading) * k;
        }
      }

      // 자세
      if (state !== 'gone') {
        P.reset();
        motion.fn(P, motion.loop ? clock : motionT);
        if (phase2 && motion.key !== 'phase') { // 화난 단계: 찌그러지고 뚜껑 한쪽이 덜렁
          P.dent(1);
          P.snap.rotation.z += 0.3 + Math.sin(clock * 6) * 0.04;
          if (state === 'fight' && motion.key !== 'die') P.brow(Math.max(0.6, 0.6));
        }
        P.drawFace();
        placeOnCurve(root, px, pz, heading);
      }
      // 싸움터 둘레: 싸우는 동안 깜빡이며 보임
      ringFade = Math.max(0, Math.min(1, ringFade + (state === 'fight' || state === 'wake' ? dt * 3 : -dt * 2)));
      ring.visible = ringFade > 0;
      if (ring.visible) ring.userData.fit();
      ring.material.opacity = ringFade * (0.45 + Math.sin(clock * 4) * 0.12);
    },
    // 다른 맵으로 가면 둘레를 숨김
    setShown(on) { if (!on) ring.visible = false; },
  };
}
