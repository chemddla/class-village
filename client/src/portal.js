// 포탈: 돌기둥 두 개 + 둥근 아치 + 가운데서 빙글빙글 도는 빛 소용돌이, 위에 가는 곳 이름
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PORTAL } from '../../shared/world.js';
import { paint, vertexColorToon, basic, addOutline } from './materials.js';
import { makeLabel } from './label.js';

const H = 2.3; // 기둥 높이 (m)

function swirlTexture() {
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S / 2);
  grd.addColorStop(0, '#fffaff');
  grd.addColorStop(0.45, '#c9a6ff');
  grd.addColorStop(1, '#6fd6ff');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  // 소용돌이 팔 세 갈래
  g.strokeStyle = 'rgba(255,255,255,0.75)';
  g.lineWidth = 5;
  g.lineCap = 'round';
  for (let k = 0; k < 3; k++) {
    g.beginPath();
    for (let t = 0; t < 1; t += 0.02) {
      const a = k * (Math.PI * 2 / 3) + t * 5;
      const r = t * S * 0.48;
      g.lineTo(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r);
    }
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.center.set(0.5, 0.5);
  return tex;
}

// p: PORTALS 의 한 칸. 돌려주는 것: { group, label, update(t) }
export function buildPortal(p) {
  const group = new THREE.Group();
  group.position.set(p.x, 0, p.z);
  group.rotation.y = p.rot;
  const w = PORTAL.half;
  const parts = [];
  for (const k of [-1, 1]) {
    parts.push(paint(new THREE.CylinderGeometry(0.32, 0.36, 0.22, 8).translate(k * w, 0.11, 0), 0xb3a58e));
    parts.push(paint(new THREE.CylinderGeometry(PORTAL.pillar - 0.03, PORTAL.pillar, H, 8).translate(k * w, H / 2, 0), 0xd8cfc0));
  }
  // 기둥 꼭대기를 잇는 반원 아치
  parts.push(paint(new THREE.TorusGeometry(w, 0.15, 8, 20, Math.PI).translate(0, H, 0), 0xcfc4b2));
  parts.push(paint(new THREE.OctahedronGeometry(0.16).translate(0, H + w + 0.12, 0), 0xa98cff));
  group.add(addOutline(new THREE.Mesh(mergeGeometries(parts.map((g) => g.toNonIndexed())), vertexColorToon), 0.02));

  // 빛 소용돌이: 문 안을 채우는 둥근 판 (아래는 땅에 닿게 길쭉하게)
  const tex = swirlTexture();
  const mat = basic(0xffffff, { map: tex, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(w - 0.12, 32).scale(1, (H + w - 0.3) / 2 / (w - 0.12), 1), mat);
  disc.position.y = (H + w - 0.1) / 2;
  group.add(disc);
  // 발밑에 은은하게 빛나는 원
  const glow = new THREE.Mesh(new THREE.CircleGeometry(1.0, 24).rotateX(-Math.PI / 2),
    basic(0xc9a6ff, { transparent: true, opacity: 0.35, depthWrite: false }));
  glow.position.y = 0.02;
  group.add(glow);

  const label = makeLabel(`🌀 ${p.name}`, { bg: 'rgba(245,236,255,0.92)', size: 0.9 });
  label.userData.base = new THREE.Vector3(p.x, H + w + 0.6, p.z);
  return {
    group,
    label,
    update(t) {
      tex.rotation = -t * 1.6;
      mat.opacity = 0.75 + 0.12 * Math.sin(t * 3);
      glow.material.opacity = 0.25 + 0.12 * Math.sin(t * 3 + 1);
    },
  };
}
