// 카툰 모드 (쇼룸·마을 공용): 역법선(Inverted Hull) 외곽선 + 반-툰 명암
import * as THREE from 'three';

export const OUTLINE_COLOR = 0x4a3525; // 검정 대신 따뜻한 짙은 갈색
// 눈·렌즈 같은 평면 데칼과 그물·발목 입구처럼 얇은 면에는 외곽선을 두르지 않음
const NO_OUTLINE = new Set(['눈', '렌즈', '그물', '그물코', '발목입구']);

// 4단계 계단형 명암: 가장 어두운 단도 55% 밝기라 그늘이 칙칙해지지 않음
const toonGradient = new THREE.DataTexture(new Uint8Array([140, 185, 225, 255]), 4, 1, THREE.RedFormat);
toonGradient.minFilter = toonGradient.magFilter = THREE.NearestFilter;
toonGradient.needsUpdate = true;

// 두께별로 공유하는 외곽선 재질: 정점을 법선 방향으로 밀어낸 뒤 뒷면만 그림
const outlineMats = new Map();
function outlineMaterial(thickness, color) {
  const key = `${thickness.toFixed(4)}:${color}`;
  if (!outlineMats.has(key)) {
    const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
    m.onBeforeCompile = (sh) => {
      // noLine: 정점마다 외곽선을 줄이는 정도(0~1). 이 속성이 없는 메시는 0으로 읽혀 평소 두께 그대로다
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float noLine;')
        .replace('#include <begin_vertex>',
          `#include <begin_vertex>
  transformed += normalize(normal) * ${thickness.toFixed(4)} * (1.0 - noLine);`);
    };
    m.customProgramCacheKey = () => `outline:${key}`;
    outlineMats.set(key, m);
  }
  return outlineMats.get(key);
}

// 메시에 같은 지오메트리를 쓰는 외곽선 껍질을 자식으로 붙임 (메시와 함께 움직이고 함께 사라짐)
export function addOutline(mesh, thickness = 0.012, color = OUTLINE_COLOR) {
  // 휘는 메시(스키닝)는 외곽선 껍질도 같은 뼈를 따라 휘어야 한다
  const o = mesh.isSkinnedMesh ? new THREE.SkinnedMesh(mesh.geometry, outlineMaterial(thickness, color)) : new THREE.Mesh(mesh.geometry, outlineMaterial(thickness, color));
  if (mesh.isSkinnedMesh) o.bind(mesh.skeleton, mesh.bindMatrix);
  o.name = '외곽선';
  o.userData.isOutline = true;
  o.raycast = () => {};
  mesh.add(o);
  mesh.userData.outline = o;
  return o;
}

// 원래 재질의 색·텍스처·범프를 그대로 옮긴 툰 재질 (원래 재질이 버려지면 같이 버림)
const toonCache = new WeakMap();
function toonOf(src) {
  let t = toonCache.get(src);
  if (!t) {
    t = new THREE.MeshToonMaterial({
      color: src.color, map: src.map, bumpMap: src.bumpMap, bumpScale: src.bumpScale, side: src.side,
      emissive: src.emissive ?? 0x000000, emissiveIntensity: src.emissiveIntensity ?? 1, gradientMap: toonGradient,
    });
    src.addEventListener('dispose', () => t.dispose());
    toonCache.set(src, t);
  }
  return t;
}

// 매 프레임 호출: 옷을 바꾸거나 장비를 바꿔 새로 생긴 메시도 자동으로 같은 모드가 됨
// widthScale: 외곽선 두께 배율 (멀리서 보는 마을은 얇게)
export function syncToon(root, on, widthScale = 1) {
  root.traverse((m) => {
    if (!m.isMesh || m.userData.isOutline || m.userData.toon === on) return;
    m.userData.toon = on;
    const mat = m.userData.pbr ?? m.material;
    if (mat.transparent || NO_OUTLINE.has(m.name)) return;
    if (on) {
      m.userData.pbr = mat;
      m.material = toonOf(mat);
      if (!m.userData.outline && !m.userData.noOutline) {
        // 얼굴·머리·옷은 0.012, 신발끈·꽃잎 같은 작은 부품은 크기에 맞춰 더 얇게
        if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
        addOutline(m, widthScale * (m.userData.outlineWidth ?? Math.min(0.012, m.geometry.boundingSphere.radius * 0.12)));
      }
      if (m.userData.outline) m.userData.outline.visible = true;
    } else {
      m.material = mat;
      if (m.userData.outline) m.userData.outline.visible = false;
    }
  });
}
