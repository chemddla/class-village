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
