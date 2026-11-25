// 손맛 연출: 먼지·조각·별빛 파티클, 휘두르기 궤적(잔상), 히트스톱, 맞은 물체 흔들기
// 파티클은 종류별 InstancedMesh 두 개(불투명 조각·반짝이)로 한 번에 그려 그리기 횟수가 늘지 않는다.
import * as THREE from 'three';

const MAX = 700;
const m4 = new THREE.Matrix4();
const qq = new THREE.Quaternion();
const ee = new THREE.Euler();
const sv = new THREE.Vector3();
const pv = new THREE.Vector3();
const cc = new THREE.Color();
const rnd = (a, b) => a + Math.random() * (b - a);

// 3단계 만화풍 명암 (캐릭터와 같은 톤)
const gradient = (() => {
  const t = new THREE.DataTexture(new Uint8Array([150, 205, 255]), 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();

class Pool {
  constructor(scene, geo, mat) {
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.list = [];
  }

  add(p) {
    if (this.list.length >= MAX) this.list.shift();
    this.list.push(p);
  }

  update(dt) {
    const L = this.list;
    let n = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      const drag = Math.exp(-p.drag * dt);
      p.vx *= drag; p.vz *= drag; p.vy = p.vy * drag - p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < p.floor) { // 땅에 닿으면 통 튀고 미끄러짐
        p.y = p.floor;
        p.vy *= -0.35;
        p.vx *= 0.55; p.vz *= 0.55;
        p.spin *= 0.5;
      }
      const k = p.age / p.life;
      // puff: 부풀었다가 사그라듦 · 나머지: 끝에서 오그라듦
      const s = p.size * (p.puff ? Math.min(1, k * 6) * (1 - k * k) * (0.7 + k * 0.6) : 1 - k ** 3);
      ee.set(p.rx + p.spin * p.age, p.ry + p.spin * 0.7 * p.age, 0);
      m4.compose(pv.set(p.x, p.y, p.z), qq.setFromEuler(ee), sv.set(s * p.sx, s * p.sy, s * p.sz));
      this.mesh.setMatrixAt(n, m4);
      this.mesh.setColorAt(n, cc.setHex(p.color));
      L[n++] = p;
    }
    L.length = n;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

// ── 휘두르기 궤적 / 공중제비 잔상: 두 점(a: 안쪽, b: 바깥쪽)을 매 장면 받아 반투명 띠로 잇는다 ──
const SUB = 4; // 표본 사이를 곡선으로 몇 칸 나눌지 (빠른 휘두르기는 몇 장면뿐이라 각지지 않게)
function cr(p0, p1, p2, p3, t, out) {
  const t2 = t * t;
  const t3 = t2 * t;
  for (const k of ['x', 'y', 'z']) {
    out[k] = 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2
      + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
  }
  return out;
}

export class Trail {
  constructor(scene, { life = 0.15, color = 0xffffff, alpha = 0.7, max = 24 } = {}) {
    this.life = life;
    this.alpha = alpha;
    this.max = max;
    this.samples = [];
    const verts = (max - 1) * SUB + 1;
    this.pos = new Float32Array(verts * 2 * 3);
    this.col = new Float32Array(verts * 2 * 4);
    const idx = [];
    for (let i = 0; i < verts - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(idx);
    geo.setDrawRange(0, 0);
    this.rgb = new THREE.Color(color);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
  }

  push(t, a, b) {
    const last = this.samples[this.samples.length - 1];
    if (last && last.t === t) return; // 히트스톱 중에는 같은 표본을 또 넣지 않음
    this.samples.push({ t, a: a.clone(), b: b.clone() });
    if (this.samples.length > this.max) this.samples.shift();
  }

  update(t) {
    const S = this.samples;
    while (S.length && t - S[0].t > this.life) S.shift();
    const geo = this.mesh.geometry;
    if (S.length < 2) { geo.setDrawRange(0, 0); return; }
    let v = 0;
    const tmpA = new THREE.Vector3();
    const tmpB = new THREE.Vector3();
    const put = (A, B, st) => {
      const fade = Math.max(0, 1 - (t - st) / this.life);
      // 끝으로 갈수록(오래된 쪽) 가늘어지도록 안쪽 점을 바깥으로 당긴다
      const inner = tmpA.copy(A).lerp(B, (1 - fade) * 0.8);
      this.pos.set([inner.x, inner.y, inner.z, B.x, B.y, B.z], v * 6);
      const { r, g, b } = this.rgb;
      this.col.set([r, g, b, fade * this.alpha * 0.25, r, g, b, fade * this.alpha], v * 8);
      v++;
    };
    for (let i = 0; i < S.length - 1; i++) {
      const p0 = S[Math.max(0, i - 1)];
      const p1 = S[i];
      const p2 = S[i + 1];
      const p3 = S[Math.min(S.length - 1, i + 2)];
      for (let j = 0; j < SUB; j++) {
        const f = j / SUB;
        put(cr(p0.a, p1.a, p2.a, p3.a, f, tmpB.clone()), cr(p0.b, p1.b, p2.b, p3.b, f, new THREE.Vector3()), p1.t + (p2.t - p1.t) * f);
      }
    }
    const L = S[S.length - 1];
    put(L.a, L.b, L.t);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.setDrawRange(0, (v - 1) * 6);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.removeFromParent();
  }
}

// 파티클 종류: 색 목록과 움직임
const KINDS = {
  dust: { colors: [0xfff8ea, 0xf3ead6, 0xffffff], puff: true, size: [0.09, 0.16], g: -0.6, drag: 4, life: [0.35, 0.6], speed: [0.6, 1.6], up: [0.2, 0.8] },
  wood: { colors: [0xc8925a, 0xa8743f, 0xe2b97f], size: [0.045, 0.08], g: 14, drag: 1, life: [0.6, 0.9], speed: [1.5, 3.2], up: [2.2, 4], flat: true },
  leaf: { colors: [0x7cc35a, 0x9bd66f, 0x5fae4a], size: [0.06, 0.09], g: 2.2, drag: 3.5, life: [0.9, 1.4], speed: [0.8, 2], up: [0.5, 1.8], flat: true },
  stone: { colors: [0xc9c4ba, 0xa9a398, 0xe4e0d8], size: [0.04, 0.08], g: 16, drag: 1, life: [0.5, 0.8], speed: [1.6, 3.4], up: [2, 3.8] },
  petal: { colors: [0xff9fb8, 0xfff07a, 0xffffff, 0xc7a8ff], size: [0.04, 0.06], g: 1.6, drag: 3.5, life: [0.8, 1.2], speed: [0.6, 1.5], up: [1, 2.2], flat: true },
  splash: { colors: [0xbfe8ff, 0xffffff, 0x8fd3f7], size: [0.04, 0.075], g: 12, drag: 1.2, life: [0.45, 0.7], speed: [0.8, 2], up: [2.5, 4.2] },
  star: { colors: [0xfff27a, 0xffe14d, 0xffffff], glow: true, size: [0.07, 0.12], g: 3, drag: 2.5, life: [0.45, 0.7], speed: [1.6, 3], up: [0.8, 2.2] },
  sparkle: { colors: [0xffffff, 0xfff6c2, 0xd8f4ff], glow: true, size: [0.05, 0.09], g: -0.8, drag: 3, life: [0.5, 0.8], speed: [0.4, 1.2], up: [0.4, 1.4] },
};

// ── 기 모으기 빛줄기: 둘레 여기저기에서 가는 노란 선이 한 점(몽둥이)으로 쭉 빨려 들어간다 ──
// 선 하나는 길쭉한 막대: 바깥에서 출발해 점점 빨라지며 가운데로 모이고, 다가갈수록 짧고 가늘어진다
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const gv = new THREE.Vector3();
const STREAK_COLORS = [0xffe14d, 0xfff3a0, 0xffc21a];
class Streaks {
  constructor(scene) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, 200);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(200 * 3), 3);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
    this.list = [];
    this.gathers = [];
  }

  // target(out): 모이는 자리를 out 에 담아 돌려준다 (매 장면 다시 물어 움직이는 몽둥이를 따라간다). alive(): false 가 되면 그만
  // colors: 줄기 색 (없으면 노란 기)
  start(target, { dur = 0.16, rate = 70, radius = [0.8, 1.3], life = 0.16, alive = () => true, colors = STREAK_COLORS } = {}) {
    this.gathers.push({ target, dur, rate, radius, life, alive, colors, t: 0, acc: 0 });
  }

  update(dt) {
    this.gathers = this.gathers.filter((g) => {
      if (!g.alive()) return false;
      g.t += dt;
      g.acc += g.rate * dt;
      for (; g.acc >= 1; g.acc -= 1) {
        // 방향은 둘레 아무 데나, 다만 땅속에서 올라오지 않게 아래쪽은 덜
        const a = Math.random() * Math.PI * 2;
        const y = Math.random() * 1.5 - 0.5;
        const d = new THREE.Vector3(Math.cos(a), y, Math.sin(a)).normalize();
        this.list.push({ g, d, r0: rnd(...g.radius), age: 0, life: g.life * rnd(0.85, 1.15), color: g.colors[Math.floor(Math.random() * g.colors.length)] });
      }
      return g.t < g.dur;
    });
    let n = 0;
    const L = this.list;
    for (let i = 0; i < L.length && n < 200; i++) {
      const s = L[i];
      s.age += dt;
      const k = s.age / s.life;
      if (k >= 1 || !s.g.alive()) continue;
      const r = s.r0 * (1 - k * k); // 점점 빨라지며 모인다
      const len = Math.min(0.6, 0.15 + r * 0.5);
      const w = 0.045 * (1 - k * 0.6);
      s.g.target(gv);
      pv.copy(s.d).multiplyScalar(r + len / 2).add(gv);
      qq.setFromUnitVectors(Y_AXIS, s.d);
      m4.compose(pv, qq, sv.set(w, len, w));
      this.mesh.setMatrixAt(n, m4);
      this.mesh.setColorAt(n, cc.setHex(s.color));
      L[n++] = s;
    }
    L.length = n;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
}

export const FX = {
  pools: null,
  scene: null,
  stop: 0,

  init(scene) {
    this.scene = scene;
    const solid = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradient });
    // 반짝이: 마름모 두 개를 엇갈려 붙인 별 + 빛나 보이게 명암 없이
    const starGeo = new THREE.OctahedronGeometry(1, 0).scale(0.45, 1, 0.45);
    const glow = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.pools = {
      solid: new Pool(scene, new THREE.IcosahedronGeometry(1, 0), solid),
      glow: new Pool(scene, starGeo, glow),
    };
    this.streaks = new Streaks(scene);
  },

  // kind 종류를 n개 (x,y,z)에서 터뜨림. dir: [dx, dz] 쪽으로 더 많이 · floor: 바닥 높이 · spread: 흩어지는 각
  burst(kind, n, x, y, z, { dir = null, floor = y - 1, spread = Math.PI, power = 1, ring = false } = {}) {
    if (!this.pools) return;
    const K = KINDS[kind];
    const pool = K.glow ? this.pools.glow : this.pools.solid;
    const base = dir ? Math.atan2(dir[0], dir[1]) : 0;
    for (let i = 0; i < n; i++) {
      const a = ring ? (i / n) * Math.PI * 2 + rnd(-0.2, 0.2) : base + rnd(-spread, spread);
      const sp = rnd(...K.speed) * power;
      const s = rnd(...K.size);
      pool.add({
        x: x + Math.sin(a) * 0.05, y, z: z + Math.cos(a) * 0.05,
        vx: Math.sin(a) * sp, vz: Math.cos(a) * sp, vy: rnd(...K.up) * power,
        g: K.g, drag: K.drag, floor, puff: !!K.puff,
        age: 0, life: rnd(...K.life), size: s,
        sx: 1, sy: K.flat ? 0.35 : 1, sz: K.flat ? 0.75 : 1,
        rx: rnd(0, 6.28), ry: rnd(0, 6.28), spin: K.puff ? 0 : rnd(-14, 14),
        color: K.colors[Math.floor(Math.random() * K.colors.length)],
      });
    }
  },

  trail(opts) { return new Trail(this.scene, opts); },

  // 기 모으기: 노란 빛줄기들이 target 자리로 모여든다 (Streaks.start 참고)
  gather(target, opts) { this.streaks?.start(target, opts); },

  // 히트스톱: 이 시간만큼 캐릭터·파티클을 멈춘다 (카메라는 계속 움직임)
  hitstop(sec) { this.stop = Math.max(this.stop, sec); },
  simDt(dt) {
    if (this.stop > 0) { this.stop -= dt; return 0; }
    return dt;
  },

  // 맞은 물체 흔들기: 맞은 쪽(dx, dz)으로 휘청였다가 흔들흔들 멈춘다
  shakes: [],
  shake(obj, dx, dz, power = 1) {
    if (!obj.userData.shakeBase) obj.userData.shakeBase = obj.rotation.clone();
    this.shakes = this.shakes.filter((s) => s.obj !== obj);
    this.shakes.push({ obj, t: 0, dx, dz, power });
  },

  // 데미지 숫자: (x,y,z)에서 톡 튀어 커졌다가 위로 떠오르며 사라진다 (테두리 두른 굵은 글씨, 벽에 안 가림)
  nums: [],
  // big: 치명타 (더 크게 튄다)
  damage(n, x, y, z, color = '#fff27a', big = false) {
    if (!this.scene) return;
    const c = document.createElement('canvas');
    c.width = 256; c.height = 80; // '빗나감' 세 글자가 들어가는 폭
    const ctx = c.getContext('2d');
    ctx.font = 'bold 64px "Maplestory","Apple SD Gothic Neo","Malgun Gothic",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 10;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#3d2f22';
    ctx.strokeText(String(n), 128, 42);
    ctx.fillStyle = color;
    ctx.fillText(String(n), 128, 42);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
    sp.renderOrder = 12;
    sp.position.set(x + rnd(-0.15, 0.15), y, z + rnd(-0.15, 0.15));
    this.scene.add(sp);
    this.nums.push({ sp, t: 0, y: sp.position.y, s: big ? 1.4 : 1 });
  },

  update(dt) {
    if (!this.pools) return;
    this.pools.solid.update(dt);
    this.pools.glow.update(dt);
    this.streaks.update(dt);
    this.nums = this.nums.filter((d) => {
      d.t += dt;
      const k = d.t / 0.8;
      if (k >= 1) { d.sp.material.map.dispose(); d.sp.material.dispose(); d.sp.removeFromParent(); return false; }
      const pop = d.t < 0.12 ? 0.6 + (d.t / 0.12) * 0.6 : 1.2 - Math.min(0.2, (d.t - 0.12) * 2); // 톡 커졌다가 살짝 줄어듦
      d.sp.scale.set(1.2 * pop * d.s, 0.375 * pop * d.s, 1);
      d.sp.position.y = d.y + 0.7 * (1 - (1 - k) ** 2);
      d.sp.material.opacity = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
      return true;
    });
    this.shakes = this.shakes.filter((s) => {
      s.t += dt;
      const b = s.obj.userData.shakeBase;
      const w = 0.16 * s.power * Math.sin(s.t * 34) * Math.exp(-s.t * 7);
      s.obj.rotation.set(b.x + s.dz * w, b.y, b.z - s.dx * w);
      if (s.t > 0.8) { s.obj.rotation.copy(b); return false; }
      return true;
    });
  },
};
