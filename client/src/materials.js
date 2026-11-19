// 만화풍 재질과 "둥근 지평선" 효과
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// 둥근 정도 (클수록 멀리 있는 땅이 더 많이 내려감)
// yaw: 카메라가 돈 각도의 (sin, cos). 보는 방향으로는 많이, 옆으로는 조금 내려간다
export const CURVE = { strength: 0.0065, center: new THREE.Vector2(0, 0), yaw: new THREE.Vector2(0, 1) };
// 풀잎 흔들림·구름 그림자·물결이 함께 쓰는 시간(초)
export const TIME = { value: 0 };
const uniforms = {
  uCurve: { value: CURVE.strength },
  uCurveCenter: { value: CURVE.center },
  uCurveYaw: { value: CURVE.yaw },
  uTime: TIME,
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

// 4단계 명암 (캐릭터 toon.js와 같은 톤: 가장 어두운 단도 55% 밝기라 그늘이 칙칙하지 않음)
const gradient = (() => {
  const data = new Uint8Array([140, 185, 225, 255]);
  const tex = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
})();

// 흘러가는 구름 그림자: 땅 위 좌표에 따라 천천히 움직이는 부드러운 얼룩 (0 맑음 ~ 1 그늘)
const CLOUD_GLSL = `
uniform float uTime;
varying vec2 vCvWorld;
float cloudShade(vec2 p) {
  vec2 q = p * 0.055 + vec2(uTime * 0.03, uTime * 0.012);
  float n = sin(q.x * 2.1 + sin(q.y * 1.3)) * sin(q.y * 1.7 + sin(q.x * 0.9 + 1.3));
  n += 0.45 * sin(q.x * 4.3 - q.y * 3.1 + 2.0);
  return smoothstep(0.32, 0.9, n);
}`;

// 바람: 높이의 제곱만큼 끝이 휘청 (풀잎·꽃). 자리마다 박자가 달라 물결처럼 번진다. 방향은 세계 기준으로 일정하게
const WIND_GLSL = `
#ifdef USE_INSTANCING
vec3 wIP = instanceMatrix[3].xyz;
#else
vec3 wIP = vec3(0.0);
#endif
float wH = max(transformed.y, 0.0);
float wPh = uTime * 1.7 - wIP.x * 0.32 - wIP.z * 0.21;
float wGust = sin(wPh) * 0.55 + sin(wPh * 2.7 + wIP.z) * 0.2 + 0.4;
vec3 wDir = vec3(1.0, 0.0, 0.45) * wGust * wH * wH * 1.6;
#ifdef USE_INSTANCING
wDir = transpose(mat3(instanceMatrix)) * wDir / dot(instanceMatrix[0].xyz, instanceMatrix[0].xyz);
#endif
transformed += wDir;
transformed.y -= wGust * wGust * wH * wH * 0.25;`;

// pre: 정점 위치를 휘기 전에 끼워 넣을 셰이더 코드 (외곽선 부풀리기 등)
// clouds: 구름 그림자를 드리울지 (빛을 받는 툰 재질만)
function addCurve(material, pre = '', key = 'curved', { clouds = false } = {}) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    if (clouds) {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${CLOUD_GLSL}`)
        .replace('#include <fog_fragment>', 'gl_FragColor.rgb *= mix(vec3(1.0), vec3(0.8, 0.85, 0.96), cloudShade(vCvWorld));\n#include <fog_fragment>');
    }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uCurve;\nuniform vec2 uCurveCenter;\nuniform vec2 uCurveYaw;\nuniform float uTime;\nvarying vec2 vCvWorld;')
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
vCvWorld = cvWorld.xz;
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
  return addCurve(new THREE.MeshToonMaterial({ color, gradientMap: gradient, ...opts }), '', 'curved-toon', { clouds: true });
}

// 바람에 살랑이는 툰 재질 (풀잎·들꽃). 도형은 뿌리가 y=0, 위로 자라게 만든다
export function windToon(color, opts = {}) {
  return addCurve(new THREE.MeshToonMaterial({ color, gradientMap: gradient, ...opts }), WIND_GLSL, 'curved-wind', { clouds: true });
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
