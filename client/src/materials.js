// 만화풍 재질과 "둥근 지평선" 효과
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// 둥근 정도 (클수록 멀리 있는 땅이 더 많이 내려감)
// yaw: 카메라가 돈 각도의 (sin, cos). 보는 방향으로는 많이, 옆으로는 조금 내려간다
export const CURVE = { strength: 0.0065, center: new THREE.Vector2(0, 0), yaw: new THREE.Vector2(0, 1) };
const uniforms = {
  uCurve: { value: CURVE.strength },
  uCurveCenter: { value: CURVE.center },
  uCurveYaw: { value: CURVE.yaw },
};

// 화면 밖 계산용 (이름표처럼 재질을 쓰지 않는 것에 같은 효과 적용)
export function curveDrop(x, z) {
  const dz = z - CURVE.center.y;
  const dx = x - CURVE.center.x;
  const { x: sn, y: cs } = CURVE.yaw;
  const f = dx * sn + dz * cs;
  const sd = dx * cs - dz * sn;
  return (f * f * 0.8 + sd * sd * 0.25) * CURVE.strength;
}

export function setCurveCenter(x, z, yaw = 0) {
  CURVE.center.set(x, z);
  CURVE.yaw.set(Math.sin(yaw), Math.cos(yaw));
}

// 3단계 명암 (만화풍)
const gradient = (() => {
  const data = new Uint8Array([90, 185, 255]);
  const tex = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
})();

// pre: 정점 위치를 휘기 전에 끼워 넣을 셰이더 코드 (외곽선 부풀리기 등)
function addCurve(material, pre = '', key = 'curved') {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCurve = uniforms.uCurve;
    shader.uniforms.uCurveCenter = uniforms.uCurveCenter;
    shader.uniforms.uCurveYaw = uniforms.uCurveYaw;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uCurve;\nuniform vec2 uCurveCenter;\nuniform vec2 uCurveYaw;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${pre}`)
      .replace(
        '#include <project_vertex>',
        `vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
  mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
#endif
vec4 cvWorld = modelMatrix * mvPosition;
float cvDz = cvWorld.z - uCurveCenter.y;
float cvDx = cvWorld.x - uCurveCenter.x;
float cvF = cvDx * uCurveYaw.x + cvDz * uCurveYaw.y;
float cvS = cvDx * uCurveYaw.y - cvDz * uCurveYaw.x;
cvWorld.y -= (cvF * cvF * 0.8 + cvS * cvS * 0.25) * uCurve;
mvPosition = viewMatrix * cvWorld;
gl_Position = projectionMatrix * mvPosition;`,
      );
  };
  // 같은 종류는 셰이더를 한 번만 만들도록
  material.customProgramCacheKey = () => key;
  return material;
}

export function toon(color, opts = {}) {
  return addCurve(new THREE.MeshToonMaterial({ color, gradientMap: gradient, ...opts }));
}

export function basic(color, opts = {}) {
  return addCurve(new THREE.MeshBasicMaterial({ color, ...opts }));
}

// ── 외곽선: 법선 방향으로 부풀린 뒷면 껍질 (캐릭터와 같은 갈색, 둥근 지평선도 똑같이 적용) ──
const OUTLINE_COLOR = 0x4a3525;
const outlineMats = new Map();
function outlineMaterial(t) {
  if (!outlineMats.has(t)) {
    const m = new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide });
    outlineMats.set(t, addCurve(m, `transformed += normalize(normal) * ${t.toFixed(4)};`, `curved-outline:${t}`));
  }
  return outlineMats.get(t);
}
// 각진 도형(상자·다면체)은 면마다 법선이 갈라져 껍질에 틈이 생기므로, 꼭짓점을 합쳐 매끈한 법선으로 부풀린다
const hullCache = new WeakMap();
function hullGeometry(geo) {
  if (!hullCache.has(geo)) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', geo.attributes.position);
    if (geo.index) g.setIndex(geo.index);
    const h = mergeVertices(g, 1e-4);
    h.computeVertexNormals();
    hullCache.set(geo, h);
  }
  return hullCache.get(geo);
}
export function addOutline(mesh, thickness = 0.035) {
  const geo = hullGeometry(mesh.geometry);
  const mat = outlineMaterial(thickness);
  let o;
  if (mesh.isInstancedMesh) {
    o = new THREE.InstancedMesh(geo, mat, mesh.count);
    o.instanceMatrix = mesh.instanceMatrix; // 같은 자리·크기를 그대로 따라감
  } else o = new THREE.Mesh(geo, mat);
  o.frustumCulled = mesh.frustumCulled;
  o.raycast = () => {};
  mesh.add(o);
  return mesh;
}

// 꼭짓점마다 색을 넣은 도형을 하나로 합칠 때 쓰는 재질 (캐릭터 등)
export const vertexColorToon = toon(0xffffff, { vertexColors: true });

// 발밑 동그란 그림자
export const blobGeometry = new THREE.CircleGeometry(0.45, 20).rotateX(-Math.PI / 2);
export const blobMaterial = basic(0x2a3b1a, { transparent: true, opacity: 0.18, depthWrite: false });

// 도형에 단색을 칠한다 (합치기 전에)
export function paint(geometry, color) {
  const c = new THREE.Color(color);
  const n = geometry.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geometry;
}
