// 만화풍 재질과 "둥근 지평선" 효과
import * as THREE from 'three';

// 둥근 정도 (클수록 멀리 있는 땅이 더 많이 내려감)
export const CURVE = { strength: 0.0065, center: new THREE.Vector2(0, 0) };
const uniforms = {
  uCurve: { value: CURVE.strength },
  uCurveCenter: { value: CURVE.center },
};

// 화면 밖 계산용 (이름표처럼 재질을 쓰지 않는 것에 같은 효과 적용)
export function curveDrop(x, z) {
  const dz = z - CURVE.center.y;
  const dx = x - CURVE.center.x;
  return (dz * dz * 0.8 + dx * dx * 0.25) * CURVE.strength;
}

export function setCurveCenter(x, z) {
  CURVE.center.set(x, z);
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

function addCurve(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCurve = uniforms.uCurve;
    shader.uniforms.uCurveCenter = uniforms.uCurveCenter;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uCurve;\nuniform vec2 uCurveCenter;')
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
cvWorld.y -= (cvDz * cvDz * 0.8 + cvDx * cvDx * 0.25) * uCurve;
mvPosition = viewMatrix * cvWorld;
gl_Position = projectionMatrix * mvPosition;`,
      );
  };
  // 같은 종류는 셰이더를 한 번만 만들도록
  material.customProgramCacheKey = () => 'curved';
  return material;
}

export function toon(color, opts = {}) {
  return addCurve(new THREE.MeshToonMaterial({ color, gradientMap: gradient, ...opts }));
}

export function basic(color, opts = {}) {
  return addCurve(new THREE.MeshBasicMaterial({ color, ...opts }));
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
