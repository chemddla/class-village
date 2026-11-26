// 만화풍 재질과 "둥근 지평선" 효과
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// 둥근 정도 (클수록 멀리 있는 땅이 더 많이 내려감)
// yaw: 카메라가 돈 각도의 (sin, cos). 보는 방향으로는 많이, 옆으로는 조금 내려간다
export const CURVE = { strength: 0.0065, center: new THREE.Vector2(0, 0), yaw: new THREE.Vector2(0, 1) };
// 풀잎 흔들림·구름 그림자·물결이 함께 쓰는 시간(초)
export const TIME = { value: 0 };
// 캐릭터를 가리는 것 뚫어 보기: 화면에서 캐릭터 둘레(xy 픽셀, z 반지름 픽셀) 안에 있으면서 캐릭터보다 카메라에 가까운 것은
// 점점이 비워 비쳐 보이게 한다. 나무는 한 재질을 여러 그루가 나눠 쓰는 InstancedMesh 라 재질 투명도 대신 셰이더에서 거른다
export const HOLE = { center: new THREE.Vector3(0, 0, 0), depth: { value: 0 } };
const uniforms = {
  uHole: { value: HOLE.center },
  uHoleDepth: HOLE.depth,
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

// 나무 흔들림: 잎 덩어리가 줄기 위(1m)부터 높이에 비례해 살짝 기울었다 돌아옴. 자리마다 박자가 달라 숲이 물결치듯
// 꼭대기에서도 몇 cm 정도만 움직여 자연스럽게. 외곽선도 같은 식으로 움직여야 어긋나지 않는다
const SWAY_GLSL = `
#ifdef USE_INSTANCING
vec3 sIP = instanceMatrix[3].xyz;
#else
vec3 sIP = modelMatrix[3].xyz; // 따로 그리는 나무(과일나무)도 자리마다 박자가 다르게
#endif
float sH = max(transformed.y - 1.0, 0.0);
float sPh = uTime * 1.1 - sIP.x * 0.21 - sIP.z * 0.17;
float sG = sin(sPh) * 0.7 + sin(sPh * 2.3 + sIP.x) * 0.3;
vec3 sDir = vec3(1.0, 0.0, 0.45) * sG * sH * 0.05;
#ifdef USE_INSTANCING
sDir = transpose(mat3(instanceMatrix)) * sDir / dot(instanceMatrix[0].xyz, instanceMatrix[0].xyz);
#endif
transformed += sDir;`;

// pre: 정점 위치를 휘기 전에 끼워 넣을 셰이더 코드 (외곽선 부풀리기 등)
// clouds: 구름 그림자를 드리울지 (빛을 받는 툰 재질만)
function addCurve(material, pre = '', key = 'curved', { clouds = false } = {}) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    // 땅(y<0.25)은 거르지 않는다: 발 앞 땅은 늘 캐릭터보다 가깝다. 구멍 안도 30%는 남겨 무엇이 있는지는 보이게
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uHole;\nuniform float uHoleDepth;\nvarying float vHoleZ;\nvarying float vHoleY;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
if (uHole.z > 0.0 && vHoleY > 0.25 && vHoleZ < uHoleDepth - 0.7) {
  float keep = mix(0.3, 1.0, smoothstep(0.55, 1.0, length(gl_FragCoord.xy - uHole.xy) / uHole.z));
  if (keep < fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))))) discard;
}`);
    if (clouds) {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${CLOUD_GLSL}`)
        .replace('#include <fog_fragment>', 'gl_FragColor.rgb *= mix(vec3(1.0), vec3(0.8, 0.85, 0.96), cloudShade(vCvWorld));\n#include <fog_fragment>');
    }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uCurve;\nuniform vec2 uCurveCenter;\nuniform vec2 uCurveYaw;\nuniform float uTime;\nvarying vec2 vCvWorld;\nvarying float vHoleZ;\nvarying float vHoleY;')
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
vHoleY = cvWorld.y;
float cvDz = cvWorld.z - uCurveCenter.y;
float cvDx = cvWorld.x - uCurveCenter.x;
float cvF = cvDx * uCurveYaw.x + cvDz * uCurveYaw.y;
float cvS = cvDx * uCurveYaw.y - cvDz * uCurveYaw.x;
cvWorld.y -= (cvF * cvF * 0.8 + cvS * cvS * 0.25) * uCurve;
mvPosition = viewMatrix * cvWorld;
vHoleZ = -mvPosition.z;
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

// 바람에 살짝 흔들리는 나무 잎 (도형은 뿌리가 y=0)
export function swayToon(color, opts = {}) {
  return addCurve(new THREE.MeshToonMaterial({ color, gradientMap: gradient, ...opts }), SWAY_GLSL, 'curved-sway', { clouds: true });
}

export function basic(color, opts = {}) {
  // forceSinglePass: 양면 반투명은 three 가 뒷면·앞면 두 번에 나눠 그리며 그때마다 재질을 다시 검사한다(메모리·시간). 물결·빛줄기 같은 납작한 면은 한 번에 그려도 똑같다
  return addCurve(new THREE.MeshBasicMaterial({ forceSinglePass: true, color, ...opts }));
}

// ── 외곽선: 법선 방향으로 부풀린 뒷면 껍질 (캐릭터와 같은 갈색, 둥근 지평선도 똑같이 적용) ──
const OUTLINE_COLOR = 0x4a3525;
const outlineMats = new Map();
function outlineMaterial(t, sway = false) {
  const key = `${t}:${sway}`;
  if (!outlineMats.has(key)) {
    const m = new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide });
    const pre = `${sway ? SWAY_GLSL : ''}\nif (dot(normal, normal) > 1e-12) transformed += normalize(normal) * ${t.toFixed(4)};`; // 법선 0인 꼭짓점은 NaN 대신 제자리
    outlineMats.set(key, addCurve(m, pre, `curved-outline:${key}`));
  }
  return outlineMats.get(key);
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
// sway: 흔들리는 나무 잎(swayToon)에 두를 때 true — 외곽선도 함께 흔들린다
export function addOutline(mesh, thickness = 0.035, { sway = false } = {}) {
  const geo = hullGeometry(mesh.geometry);
  const mat = outlineMaterial(thickness, sway);
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

// 인스턴스 수백 개를 한 덩어리로 두면 화면 밖 것까지 늘 다 그린다: CELL(m) 칸으로 나눠 칸마다 InstancedMesh 하나씩 두어 화면 밖 칸은 빠지게 한다.
// items: [{ x, z }] · make(n): n개짜리 InstancedMesh (addOutline 을 둘러도 됨) · init(mesh, j, i): items[i] 를 mesh 의 j 번 자리에 놓기
// 돌려주는 값: 번호 i → { mesh, j } (나중에 그 인스턴스의 자리를 바꿀 때)
// shortcut: 둘레 공은 처음 놓은 자리로 한 번만 잡는다, 인스턴스를 멀리(수 m) 옮기게 되면 다시 잡아야 한다
const CELL = 30; // 작을수록 삼각형은 줄고 그리기 횟수는 는다 (24m: 134만·453회, 40m: 162만·397회 — 광장에서 잰 값)
const cellSpheres = [];
export function instancedCells(group, items, make, init) {
  const cells = new Map();
  items.forEach((t, i) => {
    const key = `${Math.floor(t.x / CELL)},${Math.floor(t.z / CELL)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(i);
  });
  const slot = [];
  for (const ids of cells.values()) {
    const mesh = make(ids.length);
    ids.forEach((i, j) => { slot[i] = { mesh, j }; init(mesh, j, i); });
    mesh.computeBoundingSphere();
    cullCurved(mesh.boundingSphere);
    for (const o of mesh.children) if (o.isInstancedMesh) o.boundingSphere = mesh.boundingSphere; // 외곽선도 같은 공으로
    group.add(mesh);
  }
  return slot;
}
// 둘레 공 s 를 매 장면 둥근 지평선에 맞춰 늘릴 목록에 올린다 (cullCells 가 고친다)
function cullCurved(s) { cellSpheres.push({ s, y: s.center.y, r: s.radius }); }
// 매 장면: 그릴 때 둥근 지평선만큼 내려가므로(멀수록 많이, 십수 m까지) 둘레 공도 그만큼 아래로 늘려야 멀리서 내려와 화면에 드는 것이 빠지지 않는다
export function cullCells() {
  for (const { s, y, r } of cellSpheres) {
    const { x, z } = s.center;
    const drop = Math.max(curveDrop(x, z), curveDrop(x + r, z), curveDrop(x - r, z), curveDrop(x, z + r), curveDrop(x, z - r)) * 1.5; // 칸 안 가장 많이 내려가는 곳 (어림 + 여유)
    s.center.y = y - drop / 2;
    s.radius = r + drop / 2 + 1; // +1m: 바람에 흔들리는 잎·외곽선 두께
  }
}

// 넓은 땅(PlaneGeometry, 한 변 seg 칸)을 한 장으로 두면 화면 밖까지 늘 다 그린다 (마을 땅 26만 삼각형):
// 꼭짓점은 함께 쓰고 삼각형만 TILE 칸(30m)씩 나눈 조각으로 그려 화면 밖 조각은 빠지게 한다
export function tiled(geo, seg, material) {
  const TILE = 60;
  const all = geo.index.array; // 칸마다 6개씩, 줄(iy) 차례로
  const pos = geo.attributes.position;
  const tiles = new THREE.Group();
  const v = new THREE.Vector3();
  for (let ty = 0; ty < seg; ty += TILE) {
    for (let tx = 0; tx < seg; tx += TILE) {
      const idx = [];
      const box = new THREE.Box3();
      for (let y = ty; y < Math.min(seg, ty + TILE); y++) {
        for (let i = (y * seg + tx) * 6; i < (y * seg + Math.min(seg, tx + TILE)) * 6; i++) {
          idx.push(all[i]);
          box.expandByPoint(v.fromBufferAttribute(pos, all[i]));
        }
      }
      const g = new THREE.BufferGeometry();
      for (const k in geo.attributes) g.setAttribute(k, geo.attributes[k]);
      g.setIndex(idx);
      g.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
      cullCurved(g.boundingSphere);
      tiles.add(new THREE.Mesh(g, material));
    }
  }
  return tiles;
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
