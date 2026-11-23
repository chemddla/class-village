// 날아가는 화살: 활을 놓는 순간(bowRelease 의 타격 시점) 쏜 사람 손에 든 활에서 바라보는 쪽으로 날아간다.
// 내 화살이든 다른 학생의 화살이든 모두 각자 화면에서 똑같이 날려 보고, 맞았는지는 main.js 가 정한다 (hit 콜백).
import * as THREE from 'three';
import { makeArrow, ARROW_LEN } from './villager/equipment.js';
import { syncToon } from './villager/toon.js';
import { curveDrop } from './materials.js';
import { ARROW, WORLD, inField, isBlocked } from '../../shared/world.js';

const SCALE = 1.7; // 캐릭터 크기 배율 (character.js 와 같게)
const OUTLINE_SCALE = 0.65;
const GRAVITY = 2.2; // 살짝만 떨어지며 날아간다 (m/초²)
const STEP = 0.12; // 한 번에 검사하는 거리 (m): 빠른 화살이 작은 몬스터를 건너뛰지 않게
const STUCK_TIME = 3; // 땅·나무에 박힌 채 남아 있는 시간 (초)
const MAX = 40; // 한꺼번에 있을 수 있는 화살 수 (넘으면 오래된 것부터 치운다)

const v = new THREE.Vector3();

// 화살이 날아가다 막히는 곳: 마을은 나무·바위·건물 둘레(강·바다 위는 지나간다), 들판은 들판 벽
const blocked = (x, z) => (inField(x, z) ? isBlocked(x, z, 0) : WORLD.colliders.some((c) => Math.hypot(x - c.x, z - c.z) < c.r));

// hit(화살, 쏜 캐릭터, 내 화살인지) → 맞았으면 true (화살은 사라진다)
export function createArrows(scene, hit) {
  const list = [];

  function remove(a) {
    scene.remove(a.mesh);
    a.mesh.traverse((x) => { if (x.geometry) x.geometry.dispose(); if (x.material) x.material.dispose(); });
    list.splice(list.indexOf(a), 1);
  }

  return {
    // char: 쏜 캐릭터 (Character), mine: 내 캐릭터가 쐈는지
    shoot(char, mine) {
      const mesh = makeArrow();
      mesh.scale.setScalar(SCALE);
      syncToon(mesh, true, OUTLINE_SCALE);
      const dir = new THREE.Vector3(Math.sin(char.targetRot), 0, Math.cos(char.targetRot));
      // 활 손잡이 자리에서 출발 (화살 꼬리가 원점이므로 반 길이만큼 뒤에서)
      const at = char.villager.rig.leftSocket.getWorldPosition(new THREE.Vector3());
      // 활 손잡이는 조준선 위에 있다 (equipment.js bowDraw): 메긴 화살 자리 그대로 꼬리가 손잡이 조금 뒤에서 출발
      const pos = at.clone().addScaledVector(dir, -0.15);
      const a = { mesh, pos, vel: dir.multiplyScalar(ARROW.speed), dir: dir.clone().normalize(), from: char, mine, flown: 0, stuck: -1 };
      mesh.position.copy(pos);
      mesh.lookAt(v.copy(pos).add(a.vel));
      scene.add(mesh);
      list.push(a);
      if (list.length > MAX) remove(list[0]);
      return a;
    },
    update(dt) {
      for (const a of [...list]) {
        if (a.stuck >= 0) {
          a.stuck += dt;
          if (a.stuck > STUCK_TIME) remove(a);
          continue;
        }
        a.vel.y -= GRAVITY * dt;
        const move = a.vel.length() * dt;
        const n = Math.max(1, Math.ceil(move / STEP));
        let done = false;
        for (let i = 0; i < n && !done; i++) {
          a.pos.addScaledVector(a.vel, dt / n);
          a.flown += move / n;
          // 화살촉 자리로 맞았는지 본다
          const tip = v.copy(a.vel).normalize().multiplyScalar(ARROW_LEN * SCALE).add(a.pos);
          a.tip = tip;
          if (hit(a, a.from, a.mine)) { remove(a); done = true; break; }
          const ground = -curveDrop(tip.x, tip.z);
          if (tip.y <= ground + 0.01 || blocked(tip.x, tip.z)) {
            // 땅·나무에 꽂혀 잠시 남는다 (촉이 조금 박히게)
            a.pos.addScaledVector(a.vel.clone().normalize(), 0.08);
            a.stuck = 0;
            done = true;
          } else if (a.flown > ARROW.range) { remove(a); done = true; } // 멀리 가면 사라진다
        }
        if (!list.includes(a)) continue;
        a.mesh.position.copy(a.pos);
        if (a.stuck < 0) a.mesh.lookAt(v.copy(a.pos).add(a.vel));
      }
    },
  };
}
