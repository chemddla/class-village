// 카툰 모드 (쇼룸·마을 공용): 역법선(Inverted Hull) 외곽선 + 반-툰 명암
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const OUTLINE_COLOR = 0x4a3525; // 검정 대신 따뜻한 짙은 갈색
// 눈·렌즈 같은 평면 데칼과 그물·발목 입구처럼 얇은 면에는 외곽선을 두르지 않음
const NO_OUTLINE = new Set(['눈', '렌즈', '그물', '그물코', '발목입구']);

// 4단계 계단형 명암: 가장 어두운 단도 55% 밝기라 그늘이 칙칙해지지 않음
const toonGradient = new THREE.DataTexture(new Uint8Array([140, 185, 225, 255]), 4, 1, THREE.RedFormat);
toonGradient.minFilter = toonGradient.magFilter = THREE.NearestFilter;
toonGradient.needsUpdate = true;

// 두께별로 공유하는 외곽선 재질: 정점을 법선 방향으로 밀어낸 뒤 뒷면만 그림
// seam: 캐릭터마다 하나인 Vector2(오른팔, 왼팔) — 어깨 이음새(armSeam)의 외곽선을 지울 정도. 있으면 그 캐릭터 전용 재질을 만든다
// (재질을 나눠 쓰면 같은 재질을 잇달아 그릴 때 uniform 을 다시 올리지 않아 캐릭터마다 다른 값을 줄 수 없다)
const outlineMats = new Map();
const seamMats = new WeakMap();
const NO_SEAM = new THREE.Vector2(1, 1);
// skinned: 휘는 메시용은 따로 둔다 (한 재질을 휘는 메시와 굳은 메시가 같이 쓰면 three 가 번갈아 그릴 때마다 셰이더를 다시 고르느라 메모리·시간을 쓴다)
export function outlineMaterial(thickness, color, seam = null, skinned = false) {
  const key = `${thickness.toFixed(4)}:${color}${skinned ? ':s' : ''}`;
  const cache = seam ? (seamMats.get(seam) ?? seamMats.set(seam, new Map()).get(seam)) : outlineMats;
  if (!cache.has(key)) {
    const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
    m.userData.seam = seam;
    m.onBeforeCompile = (sh) => {
      // noLine: 정점마다 외곽선을 줄이는 정도(0~1). 이 속성이 없는 메시는 0으로 읽혀 평소 두께 그대로다
      // armSeam: 어깨 관절 둘레 몸통 쪽 이음새 (오른쪽 음수, 왼쪽 양수). 팔을 내리고 있을 때만(seamHide) 외곽선을 지운다
      sh.uniforms.seamHide = { value: seam ?? NO_SEAM };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float noLine;\nattribute float armSeam;\nuniform vec2 seamHide;')
        .replace('#include <begin_vertex>',
          `#include <begin_vertex>
  float seamCut = abs(armSeam) * (armSeam < 0.0 ? seamHide.x : seamHide.y);
  if (dot(normal, normal) > 1e-12) transformed += normalize(normal) * ${thickness.toFixed(4)} * (1.0 - noLine) * (1.0 - seamCut);`); // 앞뒤 면이 맞붙어 법선이 0이 된 꼭짓점은 그대로
    };
    m.customProgramCacheKey = () => `outline:${key}`;
    cache.set(key, m);
  }
  return cache.get(key);
}
// 외곽선 묶음에 넣을 조각마다 armSeam 을 맞춰 둔다 (mergeGeometries 는 모든 조각이 같은 속성을 가져야 한다)
const copySeam = (g, src) => g.setAttribute('armSeam', src.attributes.armSeam?.clone() ?? new THREE.BufferAttribute(new Float32Array(g.attributes.position.count), 1));
const seamOf = (list) => list.map((m) => m.material.userData.seam).find(Boolean) ?? null;

// 각진 모서리·UV 이음새는 같은 자리 꼭짓점의 법선이 갈라져 있어 껍질을 밀면 틈이 벌어진다(시점 따라 뚫리거나 떠 보임):
// 같은 자리 꼭짓점을 합쳐 매끈한 법선으로 다시 계산한 껍질을 쓴다 (뼈 가중치·noLine 은 그대로 남김)
// three 의 mergeVertices 와 같은 결과(같은 반올림·같은 순서)를 내되, 꼭짓점을 글자로 이어 붙여 견주지 않고 정수로 견준다:
// 학생 한 명이 들어올 때마다 껍질 만드느라 30ms 멈추던 것을 줄인다
export function weld(geo, tol = 1e-4) {
  const names = Object.keys(geo.attributes);
  const attrs = names.map((k) => geo.attributes[k]);
  const stride = attrs.reduce((s, a) => s + a.itemSize, 0);
  const idx = geo.index;
  const vc = attrs[0].count;
  const n = idx ? idx.count : vc;
  const mul = 10 ** Math.log10(1 / tol), add = tol * 0.5 * mul;
  // 1) 꼭짓점마다 반올림한 값이 같은 것끼리 한 무리로 (cls: 꼭짓점 → 무리 번호)
  const rows = new Int32Array(vc * stride); // 무리마다 반올림한 값 한 줄
  const next = new Int32Array(vc); // 같은 해시의 다음 무리 (-1 끝)
  const cls = new Int32Array(vc);
  const head = new Map();
  let groups = 0;
  for (let v = 0; v < vc; v++) {
    const at = groups * stride;
    let h = 0, c = at;
    for (const a of attrs) for (let k = 0; k < a.itemSize; k++) { const q = ~~(a.getComponent(v, k) * mul + add); rows[c++] = q; h = (Math.imul(h, 31) + q) | 0; }
    const first = head.get(h) ?? -1;
    let j = first;
    for (; j >= 0; j = next[j]) { let k = 0; while (k < stride && rows[j * stride + k] === rows[at + k]) k++; if (k === stride) break; }
    if (j < 0) { j = groups++; next[j] = first; head.set(h, j); }
    cls[v] = j;
  }
  // 2) 삼각형 순서대로 처음 나온 무리부터 새 번호를 매긴다 (mergeVertices 와 같은 순서, 값도 처음 나온 꼭짓점 것)
  const id = new Int32Array(groups).fill(-1);
  const from = new Uint32Array(groups); // 새 꼭짓점 → 원래 꼭짓점
  const out = new Uint32Array(n);
  let count = 0;
  for (let i = 0; i < n; i++) {
    const v = idx ? idx.getX(i) : i;
    let j = id[cls[v]];
    if (j < 0) { j = id[cls[v]] = count++; from[j] = v; }
    out[i] = j;
  }
  const g = new THREE.BufferGeometry();
  names.forEach((name, t) => {
    const a = attrs[t], s = a.itemSize, arr = new a.array.constructor(count * s);
    for (let j = 0; j < count; j++) for (let k = 0; k < s; k++) arr[j * s + k] = a.array[from[j] * s + k];
    g.setAttribute(name, new a.constructor(arr, s, a.normalized));
  });
  g.setIndex(new THREE.BufferAttribute(count > 65535 ? out : new Uint16Array(out), 1));
  return g;
}

const hullCache = new WeakMap();
function hullGeometry(geo) {
  let h = hullCache.get(geo);
  if (!h) {
    const g = new THREE.BufferGeometry();
    for (const k of ['position', 'skinIndex', 'skinWeight', 'noLine', 'armSeam']) if (geo.attributes[k]) g.setAttribute(k, geo.attributes[k]);
    if (geo.index) g.setIndex(geo.index);
    h = weld(g);
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
  const mat = outlineMaterial(thickness, color, geo.attributes.armSeam ? mesh.userData.seamHide ?? null : null, !!mesh.isSkinnedMesh);
  const o = mesh.isSkinnedMesh ? new THREE.SkinnedMesh(geo, mat) : new THREE.Mesh(geo, mat);
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
// 관절 아래의 굳은 메시를 모은다 (pick 으로 고른 것만). 움직이지 않는 묶음(꽃관의 꽃송이·안경·가방처럼 isJoint 가 아닌 Group)은
// 통과해 들어가며 그 자리(행렬)를 곱해 두고, 다른 관절 아래로는 들어가지 않는다. 돌려주는 값: [{ m: 메시, mat: 관절 기준 자리 }]
function rigidUnder(joint, skip, isJoint, pick) {
  const out = [];
  const go = (node, chain) => {
    for (const c of node.children) {
      if (c.userData.isOutline || c.userData.merged || skip(c) || (!c.isMesh && isJoint(c))) continue;
      if (c.matrixAutoUpdate) c.updateMatrix(); // 행렬을 직접 써 넣는 가지(matrixAutoUpdate 꺼짐)는 건드리지 않는다
      const mat = chain ? chain.clone().multiply(c.matrix) : c.matrix.clone();
      if (c.isMesh) { if (!c.isSkinnedMesh && pick(c)) out.push({ m: c, mat }); } else go(c, mat);
    }
  };
  go(joint, null);
  return out;
}
// isJoint(o): o 가 스스로 움직이는 관절인가. 안 주면 모든 가지를 관절로 보아 같은 부모에 붙은 것끼리만 합친다
export function mergeOutlines(root, skip = () => false, isJoint = () => true) {
  const walk = (parent) => {
    if (skip(parent)) return;
    const own = parent === root || isJoint(parent) ? rigidUnder(parent, skip, isJoint, (m) => m.userData.outline?.parent === m
      && m.userData.outline.geometry.index && m.userData.outline.geometry.attributes.normal) : [];
    if (own.length > 1) {
      const T = Math.max(...own.map(({ m, mat }) => m.userData.outline.userData.thickness * mat.getMaxScaleOnAxis()));
      const parts = own.map(({ m, mat }) => {
        const o = m.userData.outline;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', o.geometry.attributes.position.clone());
        g.setAttribute('normal', o.geometry.attributes.normal.clone());
        g.setIndex(o.geometry.index.clone());
        g.applyMatrix4(mat);
        // 부품마다 다른 두께는 꼭짓점 값(noLine)으로 옮긴다: 가장 두꺼운 두께 T 를 기준으로 줄이는 정도
        const k = (o.userData.thickness * mat.getMaxScaleOnAxis()) / T;
        const src = o.geometry.attributes.noLine;
        const nl = new Float32Array(g.attributes.position.count);
        for (let i = 0; i < nl.length; i++) nl[i] = 1 - (1 - (src ? src.getX(i) : 0)) * k;
        g.setAttribute('noLine', new THREE.BufferAttribute(nl, 1));
        copySeam(g, o.geometry);
        return g;
      });
      const merged = new THREE.Mesh(mergeGeometries(parts), outlineMaterial(T, own[0].m.userData.outline.userData.color, seamOf(own.map(({ m }) => m.userData.outline))));
      merged.name = '외곽선';
      merged.userData.isOutline = true;
      merged.raycast = () => {};
      parent.add(merged);
      for (const { m } of own) { m.remove(m.userData.outline); m.userData.outline = merged; }
    }
    for (const c of parent.children) if (!c.userData.isOutline) walk(c);
  };
  walk(root);
}

// 같은 관절에 붙은 굳은 부품들을 재질이 같은 것끼리 한 메시로 묶는다 (마을 캐릭터용, syncToon·mergeOutlines 뒤에 부른다. 이미 묶은 것은 건너뛴다).
// 단색이거나 부드러운 그라데이션 텍스처(userData.bake)만 쓰는 부품은 색을 꼭짓점 색으로 옮겨 모두 한 메시가 되고,
// 그 밖의 텍스처(얼굴·옷감·밑창)를 쓰는 부품은 텍스처·색이 똑같은 것끼리만 묶는다
// shortcut: 꼭짓점 색으로 옮긴 부품은 범프(오돌토돌한 결)가 빠진다 (신발 앞코), 가까이서 보는 쇼룸은 묶지 않아 그대로다
// shortcut: 부품을 개별로 숨기거나 움직이는 연출은 묶인 뒤에는 할 수 없다, 필요해지면 그 부품을 skip 으로 뺀다
const pixels = new WeakMap();
const texel = new THREE.Color();
function sample(tex, u, v) {
  let d = pixels.get(tex);
  if (!d) {
    const c = tex.image;
    d = { w: c.width, h: c.height, data: c.getContext('2d').getImageData(0, 0, c.width, c.height).data };
    pixels.set(tex, d);
  }
  const x = Math.min(d.w - 1, Math.floor((u - Math.floor(u)) * d.w));
  const y = Math.min(d.h - 1, Math.max(0, Math.floor((1 - v) * d.h)));
  const i = (y * d.w + x) * 4;
  return texel.setRGB(d.data[i] / 255, d.data[i + 1] / 255, d.data[i + 2] / 255, THREE.SRGBColorSpace);
}
const paintMats = new Map(); // 꼭짓점 색 재질: 면 방향(side)마다 하나를 모든 캐릭터가 같이 쓴다
function paintMaterial(side, skinned = false) {
  const key = side * 2 + skinned; // 휘는 메시용은 따로 (outlineMaterial 과 같은 까닭)
  if (!paintMats.has(key)) paintMats.set(key, new THREE.MeshToonMaterial({ vertexColors: true, side, gradientMap: toonGradient }));
  return paintMats.get(key);
}
// 묶을 수 있는 재질인지, 같은 묶음에 들어갈 열쇠는 무엇인지 (꼭짓점 색으로 옮길 수 있으면 'p…', 아니면 텍스처·색이 같은 것끼리)
const mergeable = (m) => m.material?.isMeshToonMaterial && !m.material.transparent && !m.material.emissive.getHex() && m.children.every((c) => c.userData.isOutline);
const paintable = (mat) => !mat.map || !!mat.map.userData.bake;
const mergeKey = (mat) => (paintable(mat) ? `p${mat.side}` : `${mat.map.id}:${mat.bumpMap?.id}:${mat.side}:${mat.color.getHex()}`);
// 묶을 조각 하나: 위치·법선(+ 꼭짓점 색 또는 UV)만 옮겨 담는다
function mergePart(m, paint) {
  const src = m.geometry;
  const n = src.attributes.position.count;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', src.attributes.position.clone());
  g.setAttribute('normal', src.attributes.normal.clone());
  g.setIndex(src.index ? src.index.clone() : [...Array(n).keys()]);
  if (paint) {
    const col = new Float32Array(n * 3);
    const { map, color } = m.material;
    for (let i = 0; i < n; i++) {
      if (map) sample(map, src.attributes.uv.getX(i), src.attributes.uv.getY(i)).multiply(color);
      else texel.copy(color);
      texel.toArray(col, i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  } else g.setAttribute('uv', src.attributes.uv.clone());
  return g;
}
export function mergeMeshes(root, skip = () => false, isJoint = () => true) {
  const walk = (parent) => {
    if (skip(parent)) return;
    const groups = new Map();
    for (const e of parent === root || isJoint(parent) ? rigidUnder(parent, skip, isJoint, mergeable) : []) {
      const key = mergeKey(e.m.material);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(e);
    }
    for (const [key, list] of groups) {
      if (list.length < 2) continue;
      const paint = key[0] === 'p';
      const parts = list.map(({ m, mat }) => mergePart(m, paint).applyMatrix4(mat));
      const merged = new THREE.Mesh(mergeGeometries(parts), paint ? paintMaterial(list[0].m.material.side) : list[0].m.material);
      merged.name = '묶음';
      merged.userData.merged = merged.userData.toon = true;
      merged.userData.outline = list.find(({ m }) => m.userData.outline)?.m.userData.outline;
      parent.add(merged);
      for (const { m, mat } of list) {
        // 혼자 외곽선을 가진 부품이면 그 외곽선은 관절로 옮겨 남긴다 (여럿이 합친 외곽선은 이미 관절에 붙어 있다)
        for (const o of [...m.children]) { mat.decompose(o.position, o.quaternion, o.scale); parent.add(o); }
        m.removeFromParent();
        m.geometry.dispose();
      }
    }
    for (const c of [...parent.children]) if (!c.userData.isOutline && !c.userData.merged) walk(c);
  };
  walk(root);
}

// 휘는 부품(팔·다리·옷)도 묶는다: 부품마다 따로이던 뼈대를 하나로 이어 붙여, 재질이 같은 것끼리 한 메시로, 외곽선은 모두 한 메시로 그린다
// (mergeMeshes 와 같은 규칙. 마을 캐릭터용이고 이미 묶은 것은 건너뛴다)
// 뼈는 그대로 두고 번호만 새로 매긴다. 부품마다 다른 묶는 자세(bindMatrix)는 꼭짓점에 미리 곱해 두어 묶은 메시는 한 자세만 쓴다
const IDENTITY = new THREE.Matrix4();
function skinnedBatch(list, material, part, root) {
  const bones = [];
  const inverses = [];
  const slots = new Map(); // 원래 뼈대 → 새 뼈대에서 시작 번호 (같은 뼈대를 쓰는 부품은 같은 자리를 쓴다)
  const parts = list.map((m) => {
    if (!slots.has(m.skeleton)) {
      slots.set(m.skeleton, bones.length);
      bones.push(...m.skeleton.bones);
      inverses.push(...m.skeleton.boneInverses.map((b) => b.clone()));
    }
    const off = slots.get(m.skeleton);
    const g = part(m);
    const idx = Uint16Array.from(m.geometry.attributes.skinIndex.array, (v) => v + off);
    g.setAttribute('skinIndex', new THREE.BufferAttribute(idx, 4));
    g.setAttribute('skinWeight', m.geometry.attributes.skinWeight.clone());
    return g.applyMatrix4(m.bindMatrix);
  });
  const mesh = new THREE.SkinnedMesh(mergeGeometries(parts), material);
  mesh.frustumCulled = false; // 캐릭터를 통째로 숨기고 보이므로 따로 가리지 않는다
  mesh.userData.merged = true;
  root.add(mesh);
  mesh.bind(new THREE.Skeleton(bones, inverses), IDENTITY);
  return mesh;
}
export function mergeSkinned(root, skip = () => false) {
  const outlines = [];
  const groups = new Map();
  const walk = (m) => {
    if (skip(m)) return;
    for (const c of m.children) walk(c);
    if (!m.isSkinnedMesh || m.userData.merged) return;
    if (m.userData.isOutline) { if (m.geometry.index && m.userData.thickness) outlines.push(m); return; }
    if (!mergeable(m)) return;
    const key = mergeKey(m.material);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
  };
  walk(root);
  if (outlines.length > 1) {
    const T = Math.max(...outlines.map((o) => o.userData.thickness));
    const merged = skinnedBatch(outlines, outlineMaterial(T, outlines[0].userData.color, seamOf(outlines), true), (o) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', o.geometry.attributes.position.clone());
      g.setAttribute('normal', o.geometry.attributes.normal.clone());
      g.setIndex(o.geometry.index.clone());
      const src = o.geometry.attributes.noLine;
      const nl = new Float32Array(g.attributes.position.count);
      for (let i = 0; i < nl.length; i++) nl[i] = 1 - (1 - (src ? src.getX(i) : 0)) * (o.userData.thickness / T);
      g.setAttribute('noLine', new THREE.BufferAttribute(nl, 1));
      copySeam(g, o.geometry);
      return g;
    }, root);
    merged.name = '외곽선';
    merged.userData.isOutline = true;
    merged.raycast = () => {};
    for (const o of outlines) { if (o.parent.userData.outline === o) o.parent.userData.outline = merged; o.removeFromParent(); o.geometry.dispose(); }
  }
  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    const paint = key[0] === 'p';
    const merged = skinnedBatch(list, paint ? paintMaterial(list[0].material.side, true) : list[0].material, (m) => mergePart(m, paint), root);
    merged.name = '묶음';
    merged.userData.toon = true;
    merged.userData.outline = list.find((m) => m.userData.outline)?.userData.outline;
    for (const m of list) { m.removeFromParent(); m.geometry.dispose(); m.skeleton.dispose(); }
  }
}
