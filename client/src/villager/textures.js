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
const live = new Set();
let maxAniso = 8;

// 렌더러가 지원하는 최대 이방성 필터링을 이미 만든 텍스처와 앞으로 만들 텍스처 모두에 적용
export function setMaxAnisotropy(n) {
  maxAniso = n;
  for (const t of [...cache.values(), ...live]) {
    t.anisotropy = n;
    t.needsUpdate = true;
  }
}

// 그리기 코드는 논리 크기(w×h)로 그리고, 512 이하인 작은 텍스처는 실제 캔버스를 2배로 키워 선명하게
// shortcut: 큰 옷감 텍스처(1024×512)는 메모리 때문에 그대로 둠, 더 선명해야 하면 여기 기준을 올릴 것
export function canvasTexture(key, w, h, draw, { color = true, repeat = null } = {}) {
  if (cache.has(key)) return cache.get(key);
  const k = Math.max(w, h) <= 512 ? 2 : 1;
  const c = document.createElement('canvas');
  c.width = w * k;
  c.height = h * k;
  const g = c.getContext('2d');
  g.scale(k, k);
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
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
  const t = canvasTexture(`ao:${key}:${base}`, 8, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    for (const [pos, k] of stops) grad.addColorStop(pos, shade(css(base), k));
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
  t.userData.bake = true; // 부드러운 세로 그라데이션뿐이라 꼭짓점 색으로 옮겨도 같다 (toon.js mergeMeshes)
  return t;
}

// ── 실시간으로 다시 그리는 텍스처 (표정 변화용). 캐시하지 않고 주민마다 따로 가진다 ──
export function liveTexture(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  t.wrapS = THREE.RepeatWrapping;
  live.add(t);
  t.addEventListener('dispose', () => live.delete(t));
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
  // 얼굴 바탕은 몸(목·팔·다리)과 똑같은 살색 한 가지: 결 무늬나 턱 밑 그늘을 그려 넣으면
  // 얼굴만 색이 달라져 턱과 목 사이에 경계가 보인다 (그늘은 조명·툰 명암이 맡는다)
  g.fillStyle = css(skin);
  g.fillRect(0, 0, W, H);
  faceBases.set(key, c);
  return c;
}

// ── 얼굴 부위 자리 (방위각 phi, 극각 th): 머리 모양과 텍스처가 함께 쓴다 ──
// 정면 사진 기준 비율 (정수리→턱 높이 H, 얼굴 폭 W): 눈 중심 0.57H·눈 사이 0.52W·지름 0.18W,
// 코 0.67H(가로로 납작), 입 0.8H(폭 0.24W), 볼 터치는 입 높이 바깥, 귀는 코~입 높이
export const FACE = {
  eyePhi: 0.5, eyeTh: Math.PI * 0.54,
  noseTh: Math.PI * 0.605,
  mouthTh: Math.PI * 0.685, mouthScale: 1.4,
  blushPhi: 0.64, blushTh: Math.PI * 0.665,
  earTh: Math.PI * 0.565, // 눈 아래~코 높이 (너무 내려가면 귀가 처져 보인다)
};

// ── 얼굴 피부 (볼 터치 + 입). mouth: smile | grin | o | pout ──
// 머리 메시의 UV: u = (방위각+π)/2π (정면 0.5), v = 위에서부터 θ/π
// look: 고른 입 모양(mouthStyle)·코 모양(noseStyle)·코 색(noseColor). 입 모양은 평소 미소일 때만 쓴다.
export function drawFace(tex, skin, { mouth = 'smile', blush = 1 } = {}, look = {}) {
  const c = tex.image;
  const g = c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(faceBase(skin, c.width, c.height), 0, 0);
  // 캔버스 실제 크기와 상관없이 2048×1024 기준으로 그린다 (해상도를 낮춰도 입·볼 크기가 그대로)
  const W = 2048;
  const H = 1024;
  g.setTransform(c.width / W, 0, 0, c.height / H, 0, 0);
  const at = (phi, th) => [(phi / (Math.PI * 2) + 0.5) * W, (th / Math.PI) * H];

  // 볼 터치: 경계 없는 방사형 그라데이션 (표정에 따라 진하기)
  for (const s of [-1, 1]) {
    const [x, y] = at(s * FACE.blushPhi, FACE.blushTh);
    const rad = 80;
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

  // 그려 넣는 코 (도톰한 코 조각 대신)
  const drawnNose = DRAWN_NOSES[look.noseStyle];
  if (drawnNose) {
    const [nx, ny] = at(0, FACE.noseTh);
    g.save();
    g.translate(nx, ny);
    drawnNose(g, shade(css(look.noseColor ?? '#ff8a62'), 0.5));
    g.restore();
  }

  const [mx, my] = at(0, FACE.mouthTh);
  // 입은 모든 모양을 가로로 넓게 (도안은 그대로 두고 입 자리에서 가로로만 늘린다)
  g.save();
  g.translate(mx, my);
  g.scale(FACE.mouthScale, 1);
  g.translate(-mx, -my);
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
  } else if (mouth === 'wince') {
    // 아파서 찡그린 입: 꼬불꼬불한 물결 선
    g.lineWidth = 9;
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(mx - 40, my + 4);
    for (let i = 1; i <= 4; i++) g.quadraticCurveTo(mx - 40 + (i - 0.5) * 20, my + (i % 2 ? -12 : 18), mx - 40 + i * 20, my + 4);
    g.stroke();
  } else if (mouth === 'pout') {
    // 삐죽 입: 한쪽으로 치우친 짧은 시옷자
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(mx - 34, my + 12);
    g.quadraticCurveTo(mx - 8, my - 14, mx + 30, my + 4);
    g.stroke();
  } else if (MOUTH_STYLES[look.mouthStyle]?.draw) {
    g.save();
    g.translate(mx, my);
    MOUTH_STYLES[look.mouthStyle].draw(g, ink, open);
    g.restore();
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
  g.restore();
  tex.needsUpdate = true;
}

// ── 그려 넣는 코: 가운데가 (0,0), 텍스처 px 그대로 ──
const DRAWN_NOSES = {
  hook(g, c) {
    g.strokeStyle = c; g.lineWidth = 10; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-2, -34); g.quadraticCurveTo(-24, 10, 12, 8); g.stroke();
  },
  nostril(g, c) {
    g.fillStyle = c;
    for (const s of [-1, 1]) { g.beginPath(); g.ellipse(s * 15, 2, 7, 10, s * 0.35, 0, Math.PI * 2); g.fill(); }
  },
};

// ── 입 모양 도안: 가운데가 (0,0), 텍스처 px 그대로. open(path, 혀 타원)은 벌린 입 공통 칠하기 ──
const line = (g, w, f) => { g.lineWidth = w; g.beginPath(); f(); g.stroke(); };
export const MOUTH_STYLES = {
  classic: { label: '기존 미소' },
  small: { label: '작은 미소', draw(g) { line(g, 8, () => { g.moveTo(-26, -6); g.quadraticCurveTo(0, 20, 26, -6); }); } },
  wide: { label: '넓은 미소', draw(g) { line(g, 8, () => { g.moveTo(-64, -14); g.quadraticCurveTo(0, 30, 64, -14); }); } },
  cat: {
    label: '고양이 입',
    draw(g) { line(g, 8, () => { g.moveTo(-40, -6); g.quadraticCurveTo(-20, 22, 0, -2); g.quadraticCurveTo(20, 22, 40, -6); }); },
  },
  wavy: {
    label: '물결 입',
    draw(g) { line(g, 8, () => { g.moveTo(-46, 2); g.bezierCurveTo(-30, -14, -16, -14, 0, 2); g.bezierCurveTo(16, 18, 30, 18, 46, 2); }); },
  },
  flat: { label: '담담한 입', draw(g) { line(g, 8, () => { g.moveTo(-28, 4); g.quadraticCurveTo(0, 10, 28, 4); }); } },
  open: {
    label: '벌린 미소',
    draw(g, ink, open) {
      const p = new Path2D();
      p.moveTo(-34, -8); p.quadraticCurveTo(0, -2, 34, -8); p.bezierCurveTo(30, 34, -30, 34, -34, -8);
      open(p, [0, 26, 20, 12]);
    },
  },
  tri: {
    label: '세모 입',
    draw(g, ink, open) {
      const p = new Path2D();
      p.moveTo(-26, -8); p.quadraticCurveTo(0, -12, 26, -8); p.quadraticCurveTo(6, 30, 0, 30); p.quadraticCurveTo(-6, 30, -26, -8);
      open(p, [0, 26, 14, 9]);
    },
  },
  teeth: {
    label: '이 보이는 웃음',
    draw(g, ink) {
      const p = new Path2D();
      p.moveTo(-46, -12); p.quadraticCurveTo(0, -4, 46, -12); p.bezierCurveTo(40, 40, -40, 40, -46, -12);
      g.fillStyle = '#7a2c24'; g.fill(p);
      g.save(); g.clip(p);
      g.fillStyle = '#fffdf8'; g.fillRect(-50, -20, 100, 22);
      g.fillStyle = '#ff8a86'; g.beginPath(); g.ellipse(0, 32, 24, 13, 0, 0, Math.PI * 2); g.fill();
      g.restore();
      g.strokeStyle = ink; g.lineWidth = 7; g.stroke(p);
    },
  },
  fang: {
    label: '덧니 미소',
    draw(g) {
      line(g, 8, () => { g.moveTo(-44, -8); g.quadraticCurveTo(0, 30, 44, -8); });
      // 입선 바로 아래에 붙은 작은 이 하나
      g.fillStyle = '#fffdf8';
      g.beginPath(); g.moveTo(8, 11); g.lineTo(30, 5); g.lineTo(22, 28); g.closePath(); g.fill();
      g.lineWidth = 4; g.stroke();
    },
  },
  tongue: {
    label: '메롱',
    draw(g, ink) {
      g.fillStyle = '#ff7f86';
      g.beginPath(); g.moveTo(-2, 8); g.lineTo(36, 2); g.quadraticCurveTo(42, 50, 18, 48); g.quadraticCurveTo(-4, 44, -2, 8); g.fill();
      g.strokeStyle = '#c24a55'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(18, 10); g.lineTo(18, 32); g.stroke();
      g.strokeStyle = ink;
      line(g, 8, () => { g.moveTo(-40, -8); g.quadraticCurveTo(0, 24, 40, -8); });
    },
  },
  kiss: {
    label: '쪽 입',
    draw(g) { line(g, 8, () => { g.moveTo(-6, -20); g.quadraticCurveTo(18, -16, 4, -1); g.quadraticCurveTo(20, 14, -4, 20); }); },
  },
};

// ── 눈 모양 도안: 가운데가 (0,0), 오른쪽(+x)이 바깥쪽 눈꼬리, 한 칸 = 텍스처 12px ──
const EYE_INK = '#3a2318';
const EYE_WHITE = '#fffdf8';
const EYE_HL = 'rgba(255,255,255,0.95)';
const ovalPath = (g, x, y, a, b) => { g.beginPath(); g.ellipse(x, y, a, b, 0, 0, Math.PI * 2); };
const fillAs = (g, color) => { g.fillStyle = color; g.fill(); };
const strokeAs = (g, color, w) => { g.strokeStyle = color; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke(); };
const shine = (g, x, y, r) => { ovalPath(g, x, y, r, r * 1.1); fillAs(g, EYE_HL); };
const almondPath = (g, up) => {
  g.beginPath();
  g.moveTo(-15, 3);
  g.quadraticCurveTo(-2, -17 - up, 16, -5 - up);
  g.quadraticCurveTo(6, 14, -15, 3);
  g.closePath();
};
const outerLashes = (g) => {
  g.beginPath();
  g.moveTo(9, -12); g.quadraticCurveTo(15, -14, 18, -19);
  g.moveTo(12, -6); g.quadraticCurveTo(18, -7, 21, -11);
  strokeAs(g, EYE_INK, 2.6);
};
const starPath = (g, x, y, r) => {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const rr = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
};
const heartPath = (g, s) => {
  g.beginPath();
  g.moveTo(0, s * 0.55);
  g.bezierCurveTo(-s * 1.2, -s * 0.2, -s * 0.6, -s * 1.05, 0, -s * 0.45);
  g.bezierCurveTo(s * 0.6, -s * 1.05, s * 1.2, -s * 0.2, 0, s * 0.55);
};
// 흰자 모양 안에 눈동자를 가둬 그린다
const insideWhite = (g, path, drawIris) => {
  path(); fillAs(g, EYE_WHITE);
  g.save(); path(); g.clip(); drawIris(); g.restore();
};

export const EYE_STYLES = {
  basic: { label: '콩눈', draw(g, iris) { ovalPath(g, 0, 0, 10, 13); fillAs(g, iris); shine(g, 3.5, -5, 3); } },
  shine: { label: '반짝 큰 눈', draw(g, iris) { ovalPath(g, 0, 0, 12.5, 15.5); fillAs(g, iris); shine(g, 4, -6, 4); shine(g, -4, 6, 1.8); } },
  lash: { label: '속눈썹', draw(g, iris) { ovalPath(g, 0, 0, 10, 13); fillAs(g, iris); shine(g, 3.5, -5, 3); outerLashes(g); } },
  sleepy: {
    label: '졸린 눈',
    draw(g, iris) {
      g.save(); g.beginPath(); g.rect(-20, -3, 40, 30); g.clip();
      ovalPath(g, 0, 0, 10.5, 13); fillAs(g, iris); shine(g, 4, 1, 2.2);
      g.restore();
      g.beginPath(); g.moveTo(-12, -3); g.quadraticCurveTo(0, -6, 12, -3); strokeAs(g, EYE_INK, 3.2);
    },
  },
  dot: { label: '점 눈', draw(g) { ovalPath(g, 0, 0, 5.5, 6); fillAs(g, EYE_INK); shine(g, 2, -2, 1.4); } },
  bean: { label: '가는 콩눈', draw(g) { ovalPath(g, 0, 0, 5.5, 11); fillAs(g, EYE_INK); shine(g, 1.5, -5, 1.6); } },
  smile: { label: '눈웃음', draw(g) { g.beginPath(); g.ellipse(0, 5, 11, 10, 0, Math.PI * 1.08, Math.PI * 1.92); strokeAs(g, EYE_INK, 3.6); } },
  cat: {
    label: '고양이 눈',
    draw(g, iris) {
      insideWhite(g, () => almondPath(g, 5), () => { ovalPath(g, 1, -3, 8, 10); fillAs(g, iris); shine(g, 4, -7, 2.4); });
      g.beginPath(); g.moveTo(-15, 3); g.quadraticCurveTo(-2, -22, 19, -12); strokeAs(g, EYE_INK, 3.4);
    },
  },
  droopy: {
    label: '순한 눈',
    draw(g, iris) {
      const path = () => {
        g.beginPath(); g.moveTo(-14, -6); g.quadraticCurveTo(4, -15, 15, 3); g.quadraticCurveTo(2, 13, -12, 6); g.closePath();
      };
      insideWhite(g, path, () => { ovalPath(g, -1, 0, 8, 10); fillAs(g, iris); shine(g, 2, -4, 2.4); });
      g.beginPath(); g.moveTo(-14, -6); g.quadraticCurveTo(4, -15, 16, 4); strokeAs(g, EYE_INK, 3.2);
    },
  },
  // 동공을 키우고 테를 가늘게 해서 놀란 얼굴처럼 보이지 않게
  ring: {
    label: '동그란 흰자',
    draw(g, iris) {
      ovalPath(g, 0, 0, 11.5, 12.5); fillAs(g, EYE_WHITE); strokeAs(g, EYE_INK, 1.8);
      ovalPath(g, 0.5, 1, 6.5, 7.5); fillAs(g, iris); ovalPath(g, 0.5, 1.5, 3.4, 4); fillAs(g, '#1e120c');
      shine(g, 2.8, -2.2, 2);
      g.beginPath(); g.ellipse(0, 0, 11.5, 12.5, 0, Math.PI * 1.15, Math.PI * 1.85); strokeAs(g, EYE_INK, 3);
    },
  },
  star: { label: '별 반짝', draw(g, iris) { ovalPath(g, 0, 0, 11, 14); fillAs(g, iris); starPath(g, 2.5, -4, 5.5); fillAs(g, EYE_HL); shine(g, -4, 6, 1.5); } },
  heart: {
    label: '하트 눈',
    draw(g) {
      ovalPath(g, 0, 0, 12, 13); fillAs(g, EYE_WHITE); strokeAs(g, EYE_INK, 2.2);
      g.save(); g.translate(0, 1); heartPath(g, 8.5); fillAs(g, '#d0476a'); g.restore();
      shine(g, 2.5, -3, 1.6);
    },
  },
  shadow: {
    label: '아이섀도',
    draw(g, iris) {
      // 피부의 볼터치와 섞이지 않게 진한 분홍으로 눈 위를 넓게 덮는다
      g.beginPath(); g.ellipse(0, -1, 16, 19, 0, Math.PI, Math.PI * 2); g.closePath(); fillAs(g, '#e57f96');
      ovalPath(g, 0, 1, 10, 13); fillAs(g, iris); shine(g, 3.5, -4, 3);
      g.beginPath(); g.ellipse(0, 1, 12, 14.5, 0, Math.PI * 1.1, Math.PI * 1.9); strokeAs(g, EYE_INK, 2.6);
    },
  },
  // 가늘게 뜬 눈: 납작한 렌즈 모양 + 바깥쪽 속눈썹 한 가닥
  slit: {
    label: '가는 실눈',
    draw(g) {
      g.beginPath(); g.moveTo(-11, 1); g.quadraticCurveTo(0, -6, 11, -1); g.quadraticCurveTo(0, 4, -11, 1); g.closePath();
      fillAs(g, EYE_INK);
      g.beginPath(); g.moveTo(10, -1.5); g.quadraticCurveTo(14, -3, 16, -6); strokeAs(g, EYE_INK, 2.2);
    },
  },
  double: {
    label: '쌍꺼풀',
    draw(g, iris) {
      insideWhite(g, () => almondPath(g, 0), () => { ovalPath(g, 0, -2, 8, 10); fillAs(g, iris); shine(g, 3, -6, 2.4); });
      g.beginPath(); g.moveTo(-15, 3); g.quadraticCurveTo(-2, -17, 16, -5); strokeAs(g, EYE_INK, 3);
      g.beginPath(); g.moveTo(-11, -8); g.quadraticCurveTo(0, -17, 14, -12); strokeAs(g, EYE_INK, 1.4);
    },
  },
  lower: {
    label: '아래 속눈썹',
    draw(g, iris) {
      ovalPath(g, 0, 0, 10, 13); fillAs(g, iris); shine(g, 3.5, -5, 3);
      g.beginPath(); g.moveTo(2, 12); g.lineTo(3, 16); g.moveTo(6, 10.5); g.lineTo(8.5, 14.5); g.moveTo(9, 8); g.lineTo(12.5, 11);
      strokeAs(g, EYE_INK, 2);
    },
  },
  up: {
    label: '올려다보는 눈',
    draw(g, iris) {
      insideWhite(g, () => ovalPath(g, 0, 0, 11, 13.5), () => { ovalPath(g, 0, -3.5, 8.5, 10); fillAs(g, iris); shine(g, 3, -7, 2.4); });
      g.beginPath(); g.ellipse(0, 0, 11, 13.5, 0, Math.PI * 1.1, Math.PI * 1.9); strokeAs(g, EYE_INK, 3);
    },
  },
  twotone: {
    label: '두 톤 눈',
    draw(g, iris) {
      ovalPath(g, 0, 0, 11, 14); fillAs(g, iris);
      g.save(); ovalPath(g, 0, 0, 11, 14); g.clip(); ovalPath(g, 0, 9, 11, 9); fillAs(g, shade(iris, 1.6)); g.restore();
      ovalPath(g, 0, -1, 5, 6.5); fillAs(g, '#1e120c'); shine(g, 4, -6, 3.2); shine(g, -3, 7, 1.5);
    },
  },
};

// ── 눈: 세로 1.25배 타원. mode: open | round | happy | closed | angry | wince ──
// 눈 조각은 실제 크기가 정사각형이므로 그린 비율이 그대로 보인다. 텍스처 오른쪽(+u)이 바깥쪽 눈꼬리.
// 찡그리기: 그려진 눈(어떤 모양이든)의 윗부분을 코 쪽(왼쪽)이 더 내려오게 비스듬히 잘라내고, 잘린 자리에 눈꺼풀 선을 얹는다
function frownCut(g, c, W) {
  const img = g.getImageData(0, 0, c.width, c.height).data;
  let top = c.height, bottom = -1, left = c.width, right = -1;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      if (img[(y * c.width + x) * 4 + 3] < 40) continue;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
  if (bottom < 0) return;
  const k = W / c.width; // 실제 픽셀 → 512 기준
  [top, bottom, left, right] = [top * k, bottom * k, left * k, right * k];
  const h = bottom - top;
  const yIn = top + h * 0.48; // 코 쪽
  const yOut = top + h * 0.16; // 바깥 눈꼬리 쪽
  const lid = (x) => yIn + ((x - left) / Math.max(1, right - left)) * (yOut - yIn);
  g.save();
  g.globalCompositeOperation = 'destination-out';
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(W, 0);
  g.lineTo(W, lid(W));
  g.lineTo(0, lid(0));
  g.closePath();
  g.fill();
  // 눈꺼풀 선: 남은 눈 위에만 (source-atop)
  g.globalCompositeOperation = 'source-atop';
  g.strokeStyle = '#24160f';
  g.lineWidth = Math.max(14, h * 0.16);
  g.beginPath();
  g.moveTo(0, lid(0) + g.lineWidth * 0.35);
  g.lineTo(W, lid(W) + g.lineWidth * 0.35);
  g.stroke();
  g.restore();
}

export function drawEye(tex, { iris, lash = false, mode = 'open', style = 'basic' }) {
  const c = tex.image;
  const g = c.getContext('2d');
  // 캔버스 실제 크기와 상관없이 512×512 기준으로 그린다 (선 굵기가 그대로 유지됨)
  const W = 512;
  const H = 512;
  g.setTransform(c.width / W, 0, 0, c.height / H, 0, 0);
  g.clearRect(0, 0, W, H);
  // 눈 모양을 고른 경우: 평소(뜬 눈)일 때만 그 모양으로, 웃음·감음·놀람·화남은 아래 공통 표정을 쓴다
  const styled = EYE_STYLES[style] ?? EYE_STYLES.basic; // 모르는 이름(예전에 저장된 'classic' 등)은 콩눈으로
  // 화남도 고른 눈 모양 그대로 그린 뒤 윗부분만 비스듬히 잘라 찡그린다 (다른 큰 눈으로 바뀌면 남의 눈처럼 보인다)
  if (styled?.draw && (mode === 'open' || mode === 'angry')) {
    g.save();
    g.translate(W / 2, H * 0.52);
    g.scale(12, 12); // 도안은 눈 하나를 가로세로 약 ±20 칸 안에 그렸다
    styled.draw(g, css(iris));
    g.restore();
    if (mode === 'angry') frownCut(g, c, W);
    tex.needsUpdate = true;
    return;
  }
  const cx = W / 2;
  const cy = H * 0.52;
  const rx = W * 0.3;
  const ry = rx * 1.25;
  const ink = '#24160f';
  const ell = (x, y, a, b) => {
    g.beginPath();
    g.ellipse(x, y, a, b, 0, 0, Math.PI * 2);
  };
  // 눈매: 위는 둥근 아치, 아래는 평평한 반원형 (모서리만 살짝 둥글림)
  const yb = cy + ry * 0.66; // 평평한 아랫선
  const rc = rx * 0.42;
  const yArch = (cy - ry - (yb - rc) * 0.25) / 0.75; // 아치 꼭대기가 cy - ry 에 오도록 잡은 조절점 높이
  const arch = () => {
    g.beginPath();
    g.moveTo(cx - rx, yb - rc);
    g.bezierCurveTo(cx - rx, yArch, cx + rx, yArch, cx + rx, yb - rc);
  };
  const eyeShape = () => {
    arch();
    g.quadraticCurveTo(cx + rx, yb, cx + rx - rc, yb);
    g.lineTo(cx - rx + rc, yb);
    g.quadraticCurveTo(cx - rx, yb, cx - rx, yb - rc);
    g.closePath();
  };
  g.lineCap = 'round';
  g.strokeStyle = ink;

  if (mode === 'wince') {
    // 아파서 질끈 감은 눈 (> <): 바깥 눈꼬리에서 코 쪽으로 모이는 꺾인 선 (텍스처 오른쪽이 바깥)
    g.lineWidth = 30;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(cx + rx * 0.75, cy - ry * 0.55);
    g.lineTo(cx - rx * 0.6, cy + ry * 0.05);
    g.lineTo(cx + rx * 0.75, cy + ry * 0.6);
    g.stroke();
    tex.needsUpdate = true;
    return;
  }
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
  eyeShape();
  g.fill();
  // 흰자 모양 안에서만 홍채·동공을 그림
  g.save();
  eyeShape();
  g.clip();
  // 홍채: 기본은 위아래를 꽉 채우고, 놀란 눈은 작고 동그랗게 떠 있음
  const icx = round ? cx : cx - W * 0.01;
  const icy = round ? cy - ry * 0.12 : cy - ry * 0.1;
  const irx = rx * (round ? 0.56 : 0.8);
  const iry = ry * (round ? 0.5 : 0.92);
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
  arch();
  g.stroke();
  // 아랫선은 가늘게
  g.lineWidth = 8;
  g.beginPath();
  g.moveTo(cx - rx + rc, yb);
  g.lineTo(cx + rx - rc, yb);
  g.stroke();
  if (lash && mode !== 'angry') { // 화난 눈은 윗부분을 잘라내므로 바깥 속눈썹이 뿔처럼 남지 않게 뺀다
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
    // 찡그린 눈: 윗부분을 코 쪽(왼쪽)이 조금 더 내려오게 비스듬히 잘라 눈꺼풀을 내리깔고 (너무 깊이 자르면 눈이 반쪽이 된다)
    const yIn = cy - ry * 0.32;
    const yOut = cy - ry * 0.78;
    const lid = (x) => yIn + ((x - (cx - rx)) / (2 * rx)) * (yOut - yIn); // 눈 왼쪽 끝 → 오른쪽 끝을 잇는 눈꺼풀 높이
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(W, 0);
    g.lineTo(W, lid(W));
    g.lineTo(0, lid(0));
    g.closePath();
    g.fill();
    g.restore();
    // 눈꺼풀 선: 굵게, 눈 모양 안쪽만 (눈 밖으로 삐져나오지 않게). 눈썹 없이 이 선만으로 찡그린 느낌
    g.save();
    eyeShape();
    g.clip();
    g.lineWidth = 34;
    g.beginPath();
    g.moveTo(cx - rx * 1.1, lid(cx - rx * 1.1) + 10);
    g.lineTo(cx + rx * 1.1, lid(cx + rx * 1.1) + 10);
    g.stroke();
    g.restore();
  }
  tex.needsUpdate = true;
}


// ── 머리카락: 정수리→끝 그라데이션 + 결 + 엔젤링 ──
export function hairTexture(color) {
  // 줄무늬 없이 위에서 아래로 은은하게 어두워지는 깔끔한 2톤 그라데이션 (세로 v = 정수리부터의 극각)
  return canvasTexture(`hair2:${color}`, 64, 256, (g, W, H) => {
    const base = css(color);
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, shade(base, 1.06));
    grad.addColorStop(0.4, shade(base, 1.06));
    grad.addColorStop(0.75, shade(base, 0.86));
    grad.addColorStop(1, shade(base, 0.86));
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
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

// ── 옷·모자에 붙이는 글자 로고 (바탕색 + 굵은 글자, border: 테두리 선) ──
export function logoTexture(text, bg, fg, { w = 256, h = 128, border = false } = {}) {
  return canvasTexture(`logo:${text}:${bg}:${fg}:${w}x${h}:${border}`, w, h, (g, W, H) => {
    g.fillStyle = css(bg);
    g.fillRect(0, 0, W, H);
    if (border) {
      g.strokeStyle = css(fg);
      g.lineWidth = H * 0.06;
      g.strokeRect(H * 0.08, H * 0.08, W - H * 0.16, H - H * 0.16);
    }
    g.fillStyle = css(fg);
    g.font = `900 ${Math.round(H * 0.56)}px 'Arial Black', 'Malgun Gothic', sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, W / 2, H * 0.54, W * 0.82);
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
