// 카툰 모드 (쇼룸·마을 공용): 역법선(Inverted Hull) 외곽선 + 반-툰 명암
import * as THREE from 'three';
import { mergeVertices, mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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
  if (dot(normal, normal) > 1e-12) transformed += normalize(normal) * ${thickness.toFixed(4)} * (1.0 - noLine);`); // 앞뒤 면이 맞붙어 법선이 0이 된 꼭짓점은 그대로
    };
    m.customProgramCacheKey = () => `outline:${key}`;
    outlineMats.set(key, m);
  }
  return outlineMats.get(key);
}

// 각진 모서리·UV 이음새는 같은 자리 꼭짓점의 법선이 갈라져 있어 껍질을 밀면 틈이 벌어진다(시점 따라 뚫리거나 떠 보임):
// 같은 자리 꼭짓점을 합쳐 매끈한 법선으로 다시 계산한 껍질을 쓴다 (뼈 가중치·noLine 은 그대로 남김)
const hullCache = new WeakMap();
function hullGeometry(geo) {
  let h = hullCache.get(geo);
  if (!h) {
    const g = new THREE.BufferGeometry();
    for (const k of ['position', 'skinIndex', 'skinWeight', 'noLine']) if (geo.attributes[k]) g.setAttribute(k, geo.attributes[k]);
    if (geo.index) g.setIndex(geo.index);
    h = mergeVertices(g, 1e-4);
    h.computeVertexNormals();
    hullCache.set(geo, h);
  }
  return h;
}

// 메시에 같은 지오메트리를 쓰는 외곽선 껍질을 자식으로 붙임 (메시와 함께 움직이고 함께 사라짐)
// userData.outlineGeometry 가 있으면 그 모양으로 껍질을 만든다
export function addOutline(mesh, thickness = 0.012, color = OUTLINE_COLOR) {
  const geo = mesh.userData.outlineGeometry ?? hullGeometry(mesh.geometry);
  // 휘는 메시(스키닝)는 외곽선 껍질도 같은 뼈를 따라 휘어야 한다
  const o = mesh.isSkinnedMesh ? new THREE.SkinnedMesh(geo, outlineMaterial(thickness, color)) : new THREE.Mesh(geo, outlineMaterial(thickness, color));
  if (mesh.isSkinnedMesh) o.bind(mesh.skeleton, mesh.bindMatrix);
  o.name = '외곽선';
  o.userData.isOutline = true;
  o.userData.thickness = thickness;
  o.userData.color = color;
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

// 같은 관절에 붙은 굳은(휘지 않는) 부품들의 외곽선을 하나로 합친다: 신발 한 짝만 해도 부품 8개 × 외곽선 8개를 따로 그리던 것을 외곽선 1개로.
// 여럿이 모이면 그리기 횟수가 곧 프레임이라 마을 캐릭터에만 쓴다 (syncToon 뒤에 부른다. 이미 합친 것은 건너뛴다)
// skip(o): 합치지 않을 가지 (손에 든 도구·화살통처럼 부품이 따로 움직이거나 숨는 것)
// shortcut: 부품을 개별로 숨기거나 움직이면 합친 외곽선이 따라가지 않는다, 몸 부품에 그런 연출이 생기면 그 부품은 skip 으로 뺀다
export function mergeOutlines(root, skip = () => false) {
  const walk = (parent) => {
    if (skip(parent)) return;
    const own = parent.children.filter((m) => m.isMesh && !m.isSkinnedMesh && m.userData.outline?.parent === m
      && m.userData.outline.geometry.index && m.userData.outline.geometry.attributes.normal);
    if (own.length > 1) {
      const T = Math.max(...own.map((m) => m.userData.outline.userData.thickness * m.scale.x));
      const parts = own.map((m) => {
        const o = m.userData.outline;
        m.updateMatrix();
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', o.geometry.attributes.position.clone());
        g.setAttribute('normal', o.geometry.attributes.normal.clone());
        g.setIndex(o.geometry.index.clone());
        g.applyMatrix4(m.matrix);
        // 부품마다 다른 두께는 꼭짓점 값(noLine)으로 옮긴다: 가장 두꺼운 두께 T 를 기준으로 줄이는 정도
        const k = (o.userData.thickness * m.scale.x) / T;
        const src = o.geometry.attributes.noLine;
        const nl = new Float32Array(g.attributes.position.count);
        for (let i = 0; i < nl.length; i++) nl[i] = 1 - (1 - (src ? src.getX(i) : 0)) * k;
        g.setAttribute('noLine', new THREE.BufferAttribute(nl, 1));
        return g;
      });
      const merged = new THREE.Mesh(mergeGeometries(parts), outlineMaterial(T, own[0].userData.outline.userData.color));
      merged.name = '외곽선';
      merged.userData.isOutline = true;
      merged.raycast = () => {};
      parent.add(merged);
      for (const m of own) { m.remove(m.userData.outline); m.userData.outline = merged; }
    }
    for (const c of parent.children) if (!c.userData.isOutline) walk(c);
  };
  walk(root);
}
