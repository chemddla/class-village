// 캔버스로 직접 그리는 고해상도 텍스처와 범프맵
import * as THREE from 'three';

// 항상 같은 무늬가 나오도록 시드 난수 사용
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cache = new Map();

export function canvasTexture(key, w, h, draw, { color = true, repeat = null } = {}) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  if (repeat) {
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  cache.set(key, t);
  return t;
}

// 색 계산 도우미
export function shade(hex, k) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, Math.min(1, hsl.s * (k < 1 ? 1.08 : 0.95)), Math.max(0, Math.min(1, hsl.l * k)));
  return `#${c.getHexString()}`;
}
const css = (hex) => (typeof hex === 'number' ? `#${hex.toString(16).padStart(6, '0')}` : hex);

// 세로 방향 그라데이션 (v=0 위쪽 → v=1 아래쪽). stops: [[위치, 밝기배율], ...]
// 파츠가 맞닿는 곳을 어둡게 해서 가짜 그림자(AO)를 만든다.
export function aoGradient(key, base, stops) {
  return canvasTexture(`ao:${key}:${base}`, 8, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    for (const [pos, k] of stops) grad.addColorStop(pos, shade(css(base), k));
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

// ── 실시간으로 다시 그리는 텍스처 (표정 변화용). 캐시하지 않고 주민마다 따로 가진다 ──
export function liveTexture(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

// 얼굴 바탕 (피부 + 결 + 턱 밑 그림자): 피부색별로 한 번만 그려 두고 표정마다 재사용
const faceBases = new Map();
function faceBase(skin, W, H) {
  const key = `${skin}:${W}`;
  if (faceBases.has(key)) return faceBases.get(key);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = css(skin);
  g.fillRect(0, 0, W, H);
  // 아주 옅은 피부 결
  const r = rng(7);
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(255,${200 + r() * 40},${170 + r() * 40},${0.03 + r() * 0.03})`;
    g.fillRect(r() * W, r() * H, 2, 2);
  }
  // 턱 밑(목과 닿는 곳) 어둡게
  const grad = g.createLinearGradient(0, H * 0.78, 0, H);
  grad.addColorStop(0, 'rgba(150,70,50,0)');
  grad.addColorStop(1, 'rgba(150,70,50,0.22)');
  g.fillStyle = grad;
  g.fillRect(0, H * 0.78, W, H * 0.22);
  faceBases.set(key, c);
  return c;
}

// ── 얼굴 피부 (볼 터치 + 입). mouth: smile | grin | o | pout ──
// 머리 메시의 UV: u = (방위각+π)/2π (정면 0.5), v = 위에서부터 θ/π
export function drawFace(tex, skin, { mouth = 'smile', blush = 1 } = {}) {
  const c = tex.image;
  const g = c.getContext('2d');
  const W = c.width;
  const H = c.height;
  g.drawImage(faceBase(skin, W, H), 0, 0);
  const at = (phi, th) => [(phi / (Math.PI * 2) + 0.5) * W, (th / Math.PI) * H];

  // 볼 터치: 경계 없는 방사형 그라데이션 (표정에 따라 진하기)
  for (const s of [-1, 1]) {
    const [x, y] = at(s * 0.52, Math.PI * 0.61);
    const rad = 92;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `rgba(255,120,110,${Math.min(0.85, 0.55 * blush)})`);
    gr.addColorStop(0.45, `rgba(255,130,118,${Math.min(0.55, 0.32 * blush)})`);
    gr.addColorStop(1, 'rgba(255,140,125,0)');
    g.fillStyle = gr;
    g.save();
    g.translate(x, y);
    g.scale(1.25, 1);
    g.translate(-x, -y);
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  const [mx, my] = at(0, Math.PI * 0.655);
  const ink = '#5a2e22';
  g.strokeStyle = ink;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  // 벌린 입: 어두운 입 안 + 아래쪽 혀 + 테두리
  const open = (path, tongue) => {
    g.fillStyle = '#7a2c24';
    g.fill(path);
    g.save();
    g.clip(path);
    g.fillStyle = '#ff8a86';
    g.beginPath();
    g.ellipse(...tongue, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
    g.lineWidth = 7;
    g.stroke(path);
  };
  if (mouth === 'grin') {
    // 활짝: 위는 살짝 휜 선, 아래는 크게 벌린 D자
    const p = new Path2D();
    p.moveTo(mx - 54, my - 16);
    p.quadraticCurveTo(mx, my - 4, mx + 54, my - 16);
    p.bezierCurveTo(mx + 48, my + 46, mx - 48, my + 46, mx - 54, my - 16);
    open(p, [mx, my + 36, 30, 17]);
  } else if (mouth === 'o') {
    const p = new Path2D();
    p.ellipse(mx, my + 6, 19, 25, 0, 0, Math.PI * 2);
    open(p, [mx, my + 26, 14, 9]);
  } else if (mouth === 'pout') {
    // 삐죽 입: 한쪽으로 치우친 짧은 시옷자
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(mx - 34, my + 12);
    g.quadraticCurveTo(mx - 8, my - 14, mx + 30, my + 4);
    g.stroke();
  } else {
    // 기본 미소
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(mx - 46, my - 10);
    g.quadraticCurveTo(mx, my + 34, mx + 46, my - 10);
    g.stroke();
    g.lineWidth = 6;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(mx + s * 46, my - 10);
      g.lineTo(mx + s * 54, my - 16);
      g.stroke();
    }
  }
  tex.needsUpdate = true;
}

// ── 눈: 세로 1.25배 타원. mode: open | round | happy | closed | angry ──
// 눈 조각은 실제 크기가 정사각형이므로 그린 비율이 그대로 보인다. 텍스처 오른쪽(+u)이 바깥쪽 눈꼬리.
export function drawEye(tex, { iris, lash = false, mode = 'open' }) {
  const c = tex.image;
  const g = c.getContext('2d');
  const W = c.width;
  const H = c.height;
  g.clearRect(0, 0, W, H);
  const cx = W / 2;
  const cy = H * 0.52;
  const rx = W * 0.3;
  const ry = rx * 1.25;
  const ink = '#24160f';
  const ell = (x, y, a, b) => {
    g.beginPath();
    g.ellipse(x, y, a, b, 0, 0, Math.PI * 2);
  };
  g.lineCap = 'round';
  g.strokeStyle = ink;

  if (mode === 'happy' || mode === 'closed') {
    // 반달 눈웃음(∩) / 감은 눈: 굵은 곡선 하나
    const k = mode === 'happy' ? 0.5 : 0.34;
    g.lineWidth = 30;
    g.beginPath();
    g.ellipse(cx, cy + ry * 0.25, rx * 0.85, ry * k, 0, Math.PI * 1.06, Math.PI * 1.94);
    g.stroke();
    if (lash) {
      g.lineWidth = 18;
      g.beginPath();
      g.moveTo(cx + rx * 0.8, cy + ry * 0.25 - ry * k * 0.25);
      g.quadraticCurveTo(cx + rx * 1.05, cy, cx + rx * 1.2, cy - ry * 0.18);
      g.stroke();
    }
    tex.needsUpdate = true;
    return;
  }

  const round = mode === 'round';
  // 흰자
  g.fillStyle = '#fffdf8';
  ell(cx, cy, rx, ry);
  g.fill();
  // 흰자 모양 안에서만 홍채·동공을 그림
  g.save();
  ell(cx, cy, rx, ry);
  g.clip();
  // 홍채: 기본은 위아래를 꽉 채우고, 놀란 눈은 작고 동그랗게 떠 있음
  const icx = round ? cx : cx - W * 0.01;
  const icy = round ? cy : cy + H * 0.015;
  const irx = rx * (round ? 0.56 : 0.8);
  const iry = ry * (round ? 0.5 : 1.02);
  const ir = g.createRadialGradient(icx, icy + iry * 0.3, 8, icx, icy, iry);
  ir.addColorStop(0, shade(css(iris), 1.5));
  ir.addColorStop(0.5, css(iris));
  ir.addColorStop(1, shade(css(iris), 0.42));
  g.fillStyle = ir;
  ell(icx, icy, irx, iry);
  g.fill();
  g.lineWidth = 7;
  g.strokeStyle = shade(css(iris), 0.32);
  g.stroke();
  // 동공 (놀라면 작아짐)
  g.fillStyle = '#1b120f';
  ell(icx, icy + (round ? 0 : H * 0.02), irx * (round ? 0.45 : 0.62), iry * (round ? 0.45 : 0.6));
  g.fill();
  // 위쪽 그늘 (눈꺼풀 그림자)
  if (!round) {
    const lid = g.createLinearGradient(0, cy - ry, 0, cy - ry * 0.4);
    lid.addColorStop(0, 'rgba(40,20,10,0.45)');
    lid.addColorStop(1, 'rgba(40,20,10,0)');
    g.fillStyle = lid;
    g.fillRect(0, 0, W, cy);
  }
  g.restore();
  // 반짝임: 위쪽 작은 것 + 아래쪽 옅은 반사광
  g.fillStyle = 'rgba(255,255,255,0.92)';
  ell(icx + irx * 0.28, icy - iry * 0.42, irx * (round ? 0.24 : 0.17), iry * (round ? 0.2 : 0.13));
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.35)';
  ell(icx - irx * 0.3, icy + iry * 0.5, irx * 0.09, iry * 0.05);
  g.fill();
  // 윗속눈썹 라인 (놀란 눈은 얇게)
  g.strokeStyle = ink;
  g.lineWidth = round ? 16 : 26;
  g.beginPath();
  g.ellipse(cx, cy + 4, rx * 1.03, ry * 1.02, 0, Math.PI * 1.1, Math.PI * 1.9);
  g.stroke();
  if (lash) {
    g.lineWidth = 20;
    g.beginPath();
    g.moveTo(cx + rx * 0.85, cy - ry * 0.55);
    g.quadraticCurveTo(cx + rx * 1.15, cy - ry * 0.65, cx + rx * 1.28, cy - ry * 0.88);
    g.stroke();
    g.beginPath();
    g.moveTo(cx + rx * 0.97, cy - ry * 0.3);
    g.quadraticCurveTo(cx + rx * 1.22, cy - ry * 0.34, cx + rx * 1.34, cy - ry * 0.5);
    g.stroke();
  }

  if (mode === 'angry') {
    // 찡그린 눈: 안쪽(코 쪽, 왼쪽)으로 갈수록 낮아지는 사선으로 윗부분을 잘라냄
    const yIn = cy - ry * 0.1;
    const yOut = cy - ry * 0.72;
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(W, 0);
    g.lineTo(W, yOut - (W - cx - rx) * 0.4);
    g.lineTo(0, yIn + (cx - rx) * 0.4);
    g.closePath();
    g.fill();
    g.restore();
    // 잘린 자리에 눈꺼풀 선 + 그 위로 찡그린 눈썹
    g.lineWidth = 24;
    g.beginPath();
    g.moveTo(cx - rx * 0.95, yIn - rx * 0.02);
    g.lineTo(cx + rx * 0.95, yOut + rx * 0.02);
    g.stroke();
    g.strokeStyle = '#3a2418';
    g.lineWidth = 28;
    g.beginPath();
    g.moveTo(cx - rx * 1.0, yIn - 66);
    g.lineTo(cx + rx * 1.0, Math.max(18, yOut - 70));
    g.stroke();
  }
  tex.needsUpdate = true;
}


// ── 머리카락: 정수리→끝 그라데이션 + 결 + 엔젤링 ──
export function hairTexture(color) {
  return canvasTexture(`hair:${color}`, 1024, 512, (g, W, H) => {
    const base = css(color);
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, shade(base, 1.18));
    grad.addColorStop(0.5, base);
    grad.addColorStop(1, shade(base, 0.72));
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    // 머릿결: 세로로 흐르는 가는 선
    const r = rng(11);
    for (let i = 0; i < 260; i++) {
      const x = r() * W;
      const dark = r() < 0.6;
      g.strokeStyle = dark ? `rgba(40,20,10,${0.03 + r() * 0.07})` : `rgba(255,240,220,${0.04 + r() * 0.08})`;
      g.lineWidth = 1 + r() * 3;
      g.beginPath();
      g.moveTo(x, r() * H * 0.2);
      g.bezierCurveTo(x + (r() - 0.5) * 20, H * 0.4, x + (r() - 0.5) * 20, H * 0.7, x + (r() - 0.5) * 10, H);
      g.stroke();
    }
    // 엔젤링: 은은한 밝은 띠 (결 따라 끊김)
    for (let x = 0; x < W; x += 3) {
      const a = 0.18 + 0.16 * Math.sin(x * 0.11) * Math.sin(x * 0.023);
      const y = H * (0.36 + 0.02 * Math.sin(x * 0.01));
      const gg = g.createLinearGradient(0, y - 26, 0, y + 26);
      gg.addColorStop(0, 'rgba(255,250,235,0)');
      gg.addColorStop(0.5, `rgba(255,250,235,${Math.max(0, a)})`);
      gg.addColorStop(1, 'rgba(255,250,235,0)');
      g.fillStyle = gg;
      g.fillRect(x, y - 26, 3, 52);
    }
  });
}

export function hairBump() {
  return canvasTexture('hairBump', 1024, 512, (g, W, H) => {
    g.fillStyle = '#808080';
    g.fillRect(0, 0, W, H);
    const r = rng(12);
    for (let i = 0; i < 700; i++) {
      const x = r() * W;
      g.strokeStyle = r() < 0.5 ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)';
      g.lineWidth = 1 + r() * 4;
      g.beginPath();
      g.moveTo(x, 0);
      g.bezierCurveTo(x + (r() - 0.5) * 20, H * 0.4, x + (r() - 0.5) * 20, H * 0.7, x, H);
      g.stroke();
    }
  }, { color: false });
}

// ── 천: 옷감 결 + 봉제선 + 맞닿는 곳 어둡게 ──
// stitches: 봉제선 위치(v 값 목록), ao: [[위치, 밝기], ...]
export function clothTexture(key, color, { stitches = [], ao = [[0, 1], [1, 1]] } = {}) {
  return canvasTexture(`cloth:${key}:${color}`, 1024, 512, (g, W, H) => {
    const base = css(color);
    const grad = g.createLinearGradient(0, 0, 0, H);
    for (const [p, k] of ao) grad.addColorStop(p, shade(base, k));
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    // 옷감 결 (가로·세로 잔결)
    const r = rng(key.length * 31 + 5);
    for (let i = 0; i < 4000; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.035)' : 'rgba(255,255,255,0.045)';
      g.fillRect(r() * W, r() * H, 1 + r() * 6, 1);
    }
    // 봉제선 (점선)
    g.setLineDash([10, 8]);
    g.lineWidth = 3;
    for (const v of stitches) {
      g.strokeStyle = shade(base, 0.72);
      g.beginPath();
      g.moveTo(0, v * H);
      g.lineTo(W, v * H);
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.25)';
      g.beginPath();
      g.moveTo(0, v * H + 3);
      g.lineTo(W, v * H + 3);
      g.stroke();
    }
    g.setLineDash([]);
  });
}

export function clothBump(key, stitches = []) {
  return canvasTexture(`clothBump:${key}`, 1024, 512, (g, W, H) => {
    g.fillStyle = '#808080';
    g.fillRect(0, 0, W, H);
    const r = rng(77);
    // 직조 무늬
    for (let y = 0; y < H; y += 4) {
      g.fillStyle = `rgba(0,0,0,${0.06 + r() * 0.05})`;
      g.fillRect(0, y, W, 1);
    }
    for (let x = 0; x < W; x += 4) {
      g.fillStyle = `rgba(255,255,255,${0.05 + r() * 0.04})`;
      g.fillRect(x, 0, 1, H);
    }
    g.setLineDash([10, 8]);
    g.lineWidth = 4;
    g.strokeStyle = 'rgba(0,0,0,0.7)';
    for (const v of stitches) {
      g.beginPath();
      g.moveTo(0, v * H);
      g.lineTo(W, v * H);
      g.stroke();
    }
    g.setLineDash([]);
  }, { color: false });
}

// ── 체크무늬 (허리에 묶은 셔츠) ──
export function plaidTexture(a, b, line) {
  return canvasTexture(`plaid:${a}:${b}:${line}`, 512, 512, (g, W, H) => {
    g.fillStyle = css(a);
    g.fillRect(0, 0, W, H);
    g.globalAlpha = 0.55;
    g.fillStyle = css(b);
    for (let i = 0; i < 4; i++) {
      g.fillRect(i * 128 + 20, 0, 52, H);
      g.fillRect(0, i * 128 + 20, W, 52);
    }
    g.globalAlpha = 0.8;
    g.fillStyle = css(line);
    for (let i = 0; i < 4; i++) {
      g.fillRect(i * 128 + 96, 0, 6, H);
      g.fillRect(0, i * 128 + 96, W, 6);
    }
    g.globalAlpha = 1;
    const r = rng(3);
    for (let i = 0; i < 3000; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
      g.fillRect(r() * W, r() * H, 1 + r() * 4, 1);
    }
  }, { repeat: [3, 1] });
}

// ── 신발 밑창: 흰 고무 + 홈 ──
export function soleBump() {
  return canvasTexture('soleBump', 256, 256, (g, W, H) => {
    g.fillStyle = '#808080';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(0,0,0,0.8)';
    g.lineWidth = 6;
    for (let y = 16; y < H; y += 22) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(W, y);
      g.stroke();
    }
  }, { color: false });
}

// ── 주머니: 테두리 봉제선 + 덮개 선 ──
export function pocketTexture(color) {
  return canvasTexture(`pocket:${color}`, 256, 256, (g, W, H) => {
    const base = shade(css(color), 0.96);
    g.fillStyle = base;
    g.fillRect(0, 0, W, H);
    g.setLineDash([12, 9]);
    g.lineWidth = 5;
    g.strokeStyle = shade(base, 0.7);
    g.strokeRect(22, 22, W - 44, H - 44);
    g.beginPath();
    g.moveTo(22, 70);
    g.lineTo(W - 22, 70);
    g.stroke();
    g.setLineDash([]);
    const grad = g.createLinearGradient(0, 0, 0, 76);
    grad.addColorStop(0, 'rgba(0,0,0,0.12)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, 76);
  });
}

// ── 바닥에 깔리는 부드러운 접지 그림자 ──
export function contactShadow() {
  return canvasTexture('contact', 256, 256, (g, W, H) => {
    const gr = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2);
    gr.addColorStop(0, 'rgba(40,50,20,0.55)');
    gr.addColorStop(0.5, 'rgba(40,50,20,0.22)');
    gr.addColorStop(1, 'rgba(40,50,20,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
  });
}
