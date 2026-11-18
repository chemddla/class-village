// 머리가 큰 귀여운 캐릭터 (기본 도형으로 만들고 동작은 코드로 움직임)
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ANIM, COLORS } from '../../shared/world.js';
import { paint, vertexColorToon, blobGeometry, blobMaterial, curveDrop } from './materials.js';
import { makeLabel } from './label.js';

const SKIN = 0xffe3c8;
const PANTS = 0x6b7fb3;
const SHOES = 0x5a4636;
const HAIRS = [0x7a4e2d, 0x3b2f2a, 0xd9a066, 0x8a5a3b, 0x5b3a29, 0xb5651d, 0x4a3426, 0xe0b878];

function sphere(r, color, x, y, z, sx = 1, sy = 1, sz = 1, ws = 16, hs = 12) {
  return paint(new THREE.SphereGeometry(r, ws, hs).scale(sx, sy, sz).translate(x, y, z), color);
}

function buildTorsoHead(shirt, hair) {
  const parts = [
    // 몸통
    paint(new THREE.CapsuleGeometry(0.26, 0.22, 6, 14).scale(1, 1, 0.85).translate(0, 0.64, 0), shirt),
    // 머리 (크게)
    sphere(0.43, SKIN, 0, 1.25, 0, 1, 0.95, 1, 20, 16),
    // 앞머리·윗머리
    paint(new THREE.SphereGeometry(0.455, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.42).translate(0, 1.29, -0.01), hair),
    // 뒷머리
    paint(new THREE.SphereGeometry(0.45, 20, 12, Math.PI, Math.PI, 0, Math.PI * 0.72).translate(0, 1.27, -0.02), hair),
    // 눈
    sphere(0.058, 0x2b2320, -0.15, 1.17, 0.375, 1, 1.35, 0.6, 10, 8),
    sphere(0.058, 0x2b2320, 0.15, 1.17, 0.375, 1, 1.35, 0.6, 10, 8),
    // 눈 반짝임
    sphere(0.02, 0xffffff, -0.13, 1.2, 0.405, 1, 1, 1, 6, 4),
    sphere(0.02, 0xffffff, 0.17, 1.2, 0.405, 1, 1, 1, 6, 4),
    // 볼
    sphere(0.06, 0xffaab5, -0.26, 1.08, 0.31, 1, 0.7, 0.4, 10, 6),
    sphere(0.06, 0xffaab5, 0.26, 1.08, 0.31, 1, 0.7, 0.4, 10, 6),
  ];
  return new THREE.Mesh(mergeGeometries(parts), vertexColorToon);
}

function buildArm(shirt) {
  const geo = mergeGeometries([
    paint(new THREE.CapsuleGeometry(0.075, 0.2, 4, 8).translate(0, -0.15, 0), shirt),
    sphere(0.08, SKIN, 0, -0.32, 0, 1, 1, 1, 10, 8),
  ]);
  return new THREE.Mesh(geo, vertexColorToon);
}

function buildLeg() {
  const geo = mergeGeometries([
    paint(new THREE.CapsuleGeometry(0.095, 0.16, 4, 8).translate(0, -0.14, 0), PANTS),
    sphere(0.1, SHOES, 0, -0.29, 0.04, 1, 0.7, 1.3, 10, 8),
  ]);
  return new THREE.Mesh(geo, vertexColorToon);
}

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export class Character {
  constructor(name, colorIndex) {
    const shirt = COLORS[colorIndex % COLORS.length];
    const hair = HAIRS[colorIndex % HAIRS.length];
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);

    this.body.add(buildTorsoHead(shirt, hair));
    this.armL = new THREE.Group();
    this.armR = new THREE.Group();
    this.armL.position.set(-0.31, 0.8, 0);
    this.armR.position.set(0.31, 0.8, 0);
    this.armL.add(buildArm(shirt));
    this.armR.add(buildArm(shirt));
    this.legL = new THREE.Group();
    this.legR = new THREE.Group();
    this.legL.position.set(-0.13, 0.36, 0);
    this.legR.position.set(0.13, 0.36, 0);
    this.legL.add(buildLeg());
    this.legR.add(buildLeg());
    this.body.add(this.armL, this.armR, this.legL, this.legR);

    const shadow = new THREE.Mesh(blobGeometry, blobMaterial);
    shadow.position.y = 0.02;
    shadow.renderOrder = 1;
    this.root.add(shadow);

    this.label = makeLabel(name);
    this.root.add(this.label);

    this.anim = ANIM.IDLE;
    this.phase = 0;
    this.amp = 0;
    this.time = Math.random() * 10;
    this.waveTime = 0;
    this.targetRot = 0;
  }

  get x() { return this.root.position.x; }
  get z() { return this.root.position.z; }

  setPose(x, z, rot) {
    this.root.position.set(x, 0, z);
    this.targetRot = rot;
  }

  wave() { this.waveTime = 1.6; }

  // 동작 바꾸기 (인사로 바뀌는 순간 한 번 손을 흔든다)
  setAnim(a) {
    if (a === ANIM.WAVE && this.anim !== ANIM.WAVE) this.wave();
    this.anim = a;
  }

  update(dt) {
    this.time += dt;
    const moving = this.anim === ANIM.WALK || this.anim === ANIM.RUN;
    const running = this.anim === ANIM.RUN;

    // 방향 돌리기 (부드럽게)
    this.root.rotation.y = lerpAngle(this.root.rotation.y, this.targetRot, Math.min(1, dt * 14));

    // 걷기·달리기 흔들림
    const targetAmp = running ? 0.95 : moving ? 0.6 : 0;
    this.amp += (targetAmp - this.amp) * Math.min(1, dt * 10);
    this.phase += dt * (running ? 15 : 10);
    const s = Math.sin(this.phase) * this.amp;
    this.legL.rotation.x = s;
    this.legR.rotation.x = -s;
    this.armL.rotation.x = -s * 0.9;
    this.armR.rotation.x = s * 0.9;
    this.body.position.y = Math.abs(Math.cos(this.phase)) * 0.07 * this.amp;
    this.body.rotation.x = running ? 0.14 * this.amp : 0;

    // 가만히 있을 때 숨쉬기
    const breathe = 1 + Math.sin(this.time * 2.2) * 0.012 * (1 - this.amp);
    this.body.scale.set(1, breathe, 1);

    // 인사 (오른팔 들고 흔들기)
    if (this.waveTime > 0) {
      this.waveTime -= dt;
      const k = Math.min(1, this.waveTime * 4, (1.6 - this.waveTime) * 6);
      this.armR.rotation.z = k * (2.6 + Math.sin(this.time * 14) * 0.35);
      this.armR.rotation.x = 0;
    } else {
      this.armR.rotation.z *= 0.8;
    }

    // 이름표: 둥근 지평선만큼 같이 내려가게
    this.label.position.y = 2.0 - curveDrop(this.root.position.x, this.root.position.z);
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.isMesh && o.geometry !== blobGeometry) o.geometry.dispose();
    });
    this.label.material.map.dispose();
    this.label.material.dispose();
    this.root.removeFromParent();
  }
}
