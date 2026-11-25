// 우측 하단 미니맵: 섬 전체를 한눈에. 카메라가 보는 쪽이 늘 위로 오게 돌아간다
import {
  WORLD, HALF, COLORS, PLAZA, PLOTS, BRIDGE, RIVER_HALF_WIDTH, BEACH, islandN, shoreN, riverCenterZ,
  FIELD, FIELD_MAP, FIELD_POND, PORTALS, fieldEdge, inField,
} from '../../shared/world.js';

const RANGE = HALF + 12; // 가운데에서 이만큼(m)까지 보여 줌 (섬 바닷가가 약 HALF + 11m)
const RES = 240; // 배경 그림 크기 (px)
const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;

// 배경(바다·모래·풀·강·나무)은 지도가 늘 같으니 한 번만 그린다
function drawBackground() {
  const bg = document.createElement('canvas');
  bg.width = bg.height = RES;
  const g = bg.getContext('2d');
  const img = g.createImageData(RES, RES);
  const k = (RANGE * 2) / RES;
  for (let py = 0; py < RES; py++) {
    for (let px = 0; px < RES; px++) {
      const x = (px + 0.5) * k - RANGE;
      const z = (py + 0.5) * k - RANGE;
      const sea = shoreN(x, z) - islandN(x, z);
      const river = Math.abs(z - riverCenterZ(x)) < RIVER_HALF_WIDTH;
      const bridge = river && Math.abs(x - BRIDGE.x) < BRIDGE.halfWidth;
      const plaza = Math.hypot(x - PLAZA.fountain.x, z - PLAZA.fountain.z) < PLAZA.r;
      const c = sea < 0 ? [120, 190, 230] : sea < BEACH.grass ? [240, 222, 170] : bridge ? [176, 128, 84] : river ? [110, 180, 225] : plaza ? [214, 206, 190] : [150, 205, 120];
      img.data.set([...c, 255], (py * RES + px) * 4);
    }
  }
  g.putImageData(img, 0, 0);
  const s = RES / (RANGE * 2);
  const at = (x, z) => [(x + RANGE) * s, (z + RANGE) * s];
  g.fillStyle = '#5f9a52';
  for (const t of WORLD.trees) {
    g.beginPath();
    g.arc(...at(t.x, t.z), Math.max(1.2, t.r * s * 1.6), 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = 'rgba(160, 120, 80, 0.55)';
  for (const p of PLOTS) {
    const [x, z] = at(p.x - p.w / 2, p.z - p.d / 2);
    g.fillRect(x, z, p.w * s, p.d * s);
  }
  return bg;
}

// 들판 미니맵 (가운데가 FIELD): 숲·풀밭·연못·흙길·나무·바위·포탈
const FIELD_RANGE = FIELD.r + 5;
function drawFieldBackground() {
  const bg = document.createElement('canvas');
  bg.width = bg.height = RES;
  const g = bg.getContext('2d');
  const img = g.createImageData(RES, RES);
  const k = (FIELD_RANGE * 2) / RES;
  for (let py = 0; py < RES; py++) {
    for (let px = 0; px < RES; px++) {
      const x = FIELD.x + (px + 0.5) * k - FIELD_RANGE;
      const z = FIELD.z + (py + 0.5) * k - FIELD_RANGE;
      const out = Math.hypot(x - FIELD.x, z - FIELD.z) > fieldEdge(x, z);
      const pond = Math.hypot(x - FIELD_POND.x, z - FIELD_POND.z) < FIELD_POND.r;
      const path = (z > FIELD.z && z < PORTALS[1].z && Math.abs(x - FIELD.x) < 1.2) || Math.hypot(x - FIELD.x, z - FIELD.z) < 3.2;
      const c = out ? [95, 150, 85] : pond ? [120, 200, 230] : path ? [220, 195, 145] : [185, 222, 135];
      img.data.set([...c, 255], (py * RES + px) * 4);
    }
  }
  g.putImageData(img, 0, 0);
  const s = RES / (FIELD_RANGE * 2);
  const at = (x, z) => [(x - FIELD.x + FIELD_RANGE) * s, (z - FIELD.z + FIELD_RANGE) * s];
  const dots = (list, color, k2) => {
    g.fillStyle = color;
    for (const o of list) { g.beginPath(); g.arc(...at(o.x, o.z), Math.max(1.2, o.r * s * k2), 0, Math.PI * 2); g.fill(); }
  };
  dots(FIELD_MAP.trees, '#5f9a52', 1.6);
  dots(FIELD_MAP.rocks, '#a9a294', 1.2);
  dots([{ ...PORTALS[1], r: 0.9 }], '#a98cff', 1);
  return bg;
}

export function createMinimap(canvas) {
  const maps = {
    village: { bg: drawBackground(), x: 0, z: 0, range: RANGE },
    field: { bg: drawFieldBackground(), x: FIELD.x, z: FIELD.z, range: FIELD_RANGE },
  };
  { // 광장 포탈 자리
    const g = maps.village.bg.getContext('2d');
    g.fillStyle = '#a98cff';
    const s = RES / (RANGE * 2);
    g.beginPath();
    g.arc((PORTALS[0].x + RANGE) * s, (PORTALS[0].z + RANGE) * s, 2.5, 0, Math.PI * 2);
    g.fill();
  }
  const ctx = canvas.getContext('2d');

  // me: 내 캐릭터, others: 다른 학생 캐릭터 목록, yaw: 카메라 방향
  function draw(me, others, yaw) {
    const size = canvas.clientWidth;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(size * dpr)) canvas.width = canvas.height = Math.round(size * dpr);
    const half = canvas.width / 2;
    const map = me && inField(me.x, me.z) ? maps.field : maps.village;
    const s = canvas.width / (map.range * 2);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(half, half);
    ctx.rotate(yaw); // 화면 위쪽 = 카메라가 보는 쪽
    ctx.drawImage(map.bg, -half, -half, canvas.width, canvas.height);
    ctx.lineWidth = 1.5 * dpr;
    ctx.strokeStyle = '#fff';
    for (const c of others) {
      ctx.fillStyle = hex(COLORS[c.colorIndex % COLORS.length]);
      ctx.beginPath();
      ctx.arc((c.x - map.x) * s, (c.z - map.z) * s, 3.5 * dpr, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    if (me) {
      // 나: 바라보는 쪽을 가리키는 화살표
      ctx.translate((me.x - map.x) * s, (me.z - map.z) * s);
      ctx.rotate(-me.targetRot);
      ctx.fillStyle = '#e8463c';
      ctx.beginPath();
      ctx.moveTo(0, 7 * dpr);
      ctx.lineTo(4.5 * dpr, -4 * dpr);
      ctx.lineTo(0, -1.5 * dpr);
      ctx.lineTo(-4.5 * dpr, -4 * dpr);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
  return { draw };
}
