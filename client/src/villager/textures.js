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

// ── 얼굴 피부 (볼 터치, 웃는 입, 턱 밑 그림자) ──
// 머리 메시의 UV: u = (방위각+π)/2π (정면 0.5), v = 위에서부터 θ/π
export function faceTexture(skin) {
  return canvasTexture(`face:${skin}`, 2048, 1024, (g, W, H) => {
    g.fillStyle = css(skin);
    g.fillRect(0, 0, W, H);
    const at = (phi, th) => [(phi / (Math.PI * 2) + 0.5) * W, (th / Math.PI) * H];

    // 아주 옅은 피부 결
    const r = rng(7);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = `rgba(255,${200 + r() * 40},${170 + r() * 40},${0.03 + r() * 0.03})`;
      g.fillRect(r() * W, r() * H, 2, 2);
    }

    // 볼 터치: 경계 없는 방사형 그라데이션
    for (const s of [-1, 1]) {
      const [x, y] = at(s * 0.52, Math.PI * 0.61);
      const rad = 92;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, 'rgba(255,120,110,0.55)');
      gr.addColorStop(0.45, 'rgba(255,130,118,0.32)');
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

    // 웃는 입
    const [mx, my] = at(0, Math.PI * 0.655);
    g.strokeStyle = '#5a2e22';
    g.lineCap = 'round';
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(mx - 46, my - 10);
    g.quadraticCurveTo(mx, my + 34, mx + 46, my - 10);
    g.stroke();
    // 입꼬리 살짝
    g.lineWidth = 6;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(mx + s * 46, my - 10);
      g.lineTo(mx + s * 54, my - 16);
      g.stroke();
    }

    // 턱 밑(목과 닿는 곳) 어둡게
    const grad = g.createLinearGradient(0, H * 0.78, 0, H);
    grad.addColorStop(0, 'rgba(150,70,50,0)');
    grad.addColorStop(1, 'rgba(150,70,50,0.22)');
    g.fillStyle = grad;
    g.fillRect(0, H * 0.78, W, H * 0.22);
  });
}

// ── 눈: 세로 1.25배 타원. 홍채가 위아래를 꽉 채워 흰자는 좌우에만 살짝 보임 ──
// 눈 조각은 실제 크기가 정사각형이므로, 여기서 그린 비율이 그대로 보인다.
export function eyeTexture(iris, lash = false) {
  return canvasTexture(`eye3:${iris}:${lash}`, 512, 512, (g, W, H) => {
    const cx = W / 2;
    const cy = H * 0.52;
    const rx = W * 0.3;
    const ry = rx * 1.25; // 세로로 1.25배
    const ell = (x, y, a, b) => {
      g.beginPath();
      g.ellipse(x, y, a, b, 0, 0, Math.PI * 2);
    };
    // 흰자
    g.fillStyle = '#fffdf8';
    ell(cx, cy, rx, ry);
    g.fill();
    // 흰자 모양 안에서만 홍채·동공을 그림
    g.save();
    ell(cx, cy, rx, ry);
    g.clip();
    // 홍채: 위아래는 흰자 끝까지, 좌우는 조금 좁게
    const icx = cx - W * 0.01;
    const icy = cy + H * 0.015;
    const irx = rx * 0.8;
    const iry = ry * 1.02;
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
    // 큰 동공
    g.fillStyle = '#1b120f';
    ell(icx, icy + H * 0.02, irx * 0.62, iry * 0.6);
    g.fill();
    // 위쪽 그늘 (눈꺼풀 그림자)
    const lid = g.createLinearGradient(0, cy - ry, 0, cy - ry * 0.4);
    lid.addColorStop(0, 'rgba(40,20,10,0.45)');
    lid.addColorStop(1, 'rgba(40,20,10,0)');
    g.fillStyle = lid;
    g.fillRect(0, 0, W, cy);
    g.restore();
    // 반짝임 (큰 것 + 작은 것)
    // 위쪽에 작은 반짝임 하나 + 아래쪽에 아주 옅은 반사광
    g.fillStyle = 'rgba(255,255,255,0.92)';
    ell(icx + irx * 0.28, icy - iry * 0.42, irx * 0.17, iry * 0.13);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.35)';
    ell(icx - irx * 0.3, icy + iry * 0.5, irx * 0.09, iry * 0.05);
    g.fill();
    // 윗속눈썹 라인
    g.strokeStyle = '#24160f';
    g.lineCap = 'round';
    g.lineWidth = 26;
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
  });
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
