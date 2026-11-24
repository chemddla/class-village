// 머리 위 이름표 (글자를 그림으로 만들어 띄움)
import * as THREE from 'three';

const FONT = 'bold 44px "Maplestory","Apple SD Gothic Neo","Malgun Gothic",sans-serif';
const H = 64;

// 글꼴을 한 번만 불러오고, 다 받아오면 그동안 만든 이름표를 다시 그림
let fontReady = false;
const waiting = [];
document.fonts?.load(FONT, '가A').then(() => {
  fontReady = true;
  for (const redraw of waiting.splice(0)) redraw();
}).catch(() => {});

export function makeLabel(text, { bg = 'rgba(255,255,255,0.85)', fg = '#4a3b2a', size = 0.75 } = {}) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  sprite.renderOrder = 10;

  const draw = () => {
    ctx.font = FONT;
    const w = Math.ceil(ctx.measureText(text).width) + 40;
    canvas.width = w;
    canvas.height = H;
    ctx.font = FONT;
    ctx.fillStyle = bg;
    const r = H / 2;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.arcTo(w, 0, w, H, r);
    ctx.arcTo(w, H, 0, H, r);
    ctx.arcTo(0, H, 0, 0, r);
    ctx.arcTo(0, 0, w, 0, r);
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, H / 2 + 2);
    sprite.scale.set((size * w) / H * 0.42, size * 0.42, 1);
    // 캔버스 크기가 바뀌면 그림 자료를 새로 만들어야 함
    tex.dispose();
    tex.needsUpdate = true;
  };

  draw();
  if (!fontReady) waiting.push(draw);
  return sprite;
}

// 머리 위 말풍선 (대화·아야!): 하얀 둥근 상자 + 아래로 뾰족한 꼬리. 길면 줄을 바꿔 5줄까지
const BUBBLE_FONT = 'bold 38px "Maplestory","Apple SD Gothic Neo","Malgun Gothic",sans-serif';
const BUBBLE_LINE = 48; // 줄 높이 (px)
const BUBBLE_MAX_W = 330; // 한 줄 최대 너비 (px): 넓으면 화면을 가린다
export function makeBubble(text, { size = 0.75 } = {}) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, depthTest: false, transparent: true }));
  sprite.renderOrder = 11;
  const draw = () => {
    ctx.font = BUBBLE_FONT;
    // 글자 단위로 줄 바꿈 (한글은 띄어쓰기가 없어도 넘치면 끊는다)
    const lines = [];
    let line = '';
    for (const ch of text) {
      if (ctx.measureText(line + ch).width > BUBBLE_MAX_W && line) { lines.push(line); line = ''; }
      line += ch;
    }
    lines.push(line);
    if (lines.length > 5) { lines.length = 5; lines[4] = `${lines[4].slice(0, -1)}…`; }
    const pad = 26;
    const tail = 22;
    const w = Math.ceil(Math.max(...lines.map((l) => ctx.measureText(l).width))) + pad * 2;
    const h = lines.length * BUBBLE_LINE + pad * 1.2;
    canvas.width = w + 8;
    canvas.height = h + tail + 8;
    ctx.font = BUBBLE_FONT;
    const x0 = 4;
    const y0 = 4;
    const r = Math.min(30, h / 2);
    ctx.beginPath();
    ctx.moveTo(x0 + r, y0);
    ctx.arcTo(x0 + w, y0, x0 + w, y0 + h, r);
    ctx.arcTo(x0 + w, y0 + h, x0, y0 + h, r);
    ctx.lineTo(x0 + w / 2 + 16, y0 + h);
    ctx.lineTo(x0 + w / 2, y0 + h + tail); // 꼬리
    ctx.lineTo(x0 + w / 2 - 16, y0 + h);
    ctx.arcTo(x0, y0 + h, x0, y0, r);
    ctx.arcTo(x0, y0, x0 + w, y0, r);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(74,59,42,0.55)';
    ctx.stroke();
    ctx.fillStyle = '#3d2f22';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((l, i) => ctx.fillText(l, x0 + w / 2, y0 + pad * 0.6 + BUBBLE_LINE * (i + 0.5) + 2));
    const k = ((size * 0.42) / 64) * 0.62; // 이름표보다 글자가 조금 작게 (말풍선은 크고 여러 줄이라 화면을 가리지 않게)
    sprite.scale.set(canvas.width * k, canvas.height * k, 1);
    tex.dispose();
    tex.needsUpdate = true;
  };
  draw();
  if (!fontReady) waiting.push(draw);
  return sprite;
}
