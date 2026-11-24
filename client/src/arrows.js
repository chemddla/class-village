// 날아가는 화살: 활을 놓는 순간(bowRelease 의 타격 시점) 쏜 사람 손에 든 활에서 바라보는 쪽으로 날아간다.
// 내 화살이든 다른 학생의 화살이든 모두 각자 화면에서 똑같이 날려 보고, 맞았는지는 main.js 가 정한다 (hit 콜백).
import * as THREE from 'three';
import { makeArrow, ARROW_LEN } from './villager/equipment.js';
import { syncToon } from './villager/toon.js';
import { curveDrop } from './materials.js';
import { ARROW, WORLD, inField, isBlocked } from '../../shared/world.js';

const SCALE = 1.7; // 캐릭터 크기 배율 (character.js 와 같게)
const OUTLINE_SCALE = 0.65;
const GRAVITY = 1.2; // 아주 살짝만 떨어진다 (m/초²): 사거리(20m) 끝까지 거의 땅과 나란히 날아간다
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
    a.mesh.traverse((x) => x.geometry?.dispose()); // 재질은 두어 셰이더를 다시 컴파일하지 않게 (equipment.js attachEquipment 참고)
    list.splice(list.indexOf(a), 1);
  }

  // 화면에 놓기: 평평한 땅 기준 자리를 둥근 지평선만큼 내리고, 조금 앞의 (내린) 자리를 바라보게 해 땅의 굽이를 따라 눕힌다
  const ahead = new THREE.Vector3();
  function place(a) {
    a.mesh.position.copy(a.pos).setY(a.pos.y - curveDrop(a.pos.x, a.pos.z));
    if (a.stuck < 0) a.look = a.vel.clone().normalize();
    ahead.copy(a.pos).addScaledVector(a.look, 0.3);
    ahead.y -= curveDrop(ahead.x, ahead.z);
    a.mesh.lookAt(ahead);
  }

  return {
    // char: 쏜 캐릭터 (Character), mine: 내 캐릭터가 쐈는지, pitch: 아래로 기울여 쏘는 각 (점프 공격)
    shoot(char, mine, pitch = 0) {
      const mesh = makeArrow();
      mesh.scale.setScalar(SCALE);
      syncToon(mesh, true, OUTLINE_SCALE);
      const dir = new THREE.Vector3(Math.sin(char.targetRot) * Math.cos(pitch), -Math.sin(pitch), Math.cos(char.targetRot) * Math.cos(pitch));
      // 활 손잡이 자리에서 출발 (화살 꼬리가 원점이므로 반 길이만큼 뒤에서)
      const at = char.villager.rig.leftSocket.getWorldPosition(new THREE.Vector3());
      // 활 손잡이는 조준선 위에 있다 (equipment.js bowDraw): 메긴 화살 자리 그대로 꼬리가 손잡이 조금 뒤에서 출발
      // 둥근 지평선: 땅과 캐릭터는 화면 가운데에서 멀수록 아래로 내려 그린다(curveDrop). 화살은 '평평한 땅 기준 높이'로 날리고
      // 그릴 때만 그 자리만큼 내린다 → 곧게 쏘아도 땅에서 떠오르지 않고 땅을 따라 날아간다
      const pos = at.clone().addScaledVector(dir, -0.15);
      pos.y += curveDrop(at.x, at.z);
      const a = { mesh, pos, vel: dir.multiplyScalar(ARROW.speed), dir: dir.clone().setY(0).normalize(), from: char, mine, flown: 0, stuck: -1 };
      place(a);
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
          else place(a); // 화면이 움직이면 땅이 내려가는 정도도 바뀌므로 꽂힌 화살도 매번 다시 놓는다
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
          a.tip = tip.clone().setY(tip.y - curveDrop(tip.x, tip.z)); // 맞았는지는 화면에 그린 자리로 (캐릭터도 내려 그림)
          if (hit(a, a.from, a.mine)) { remove(a); done = true; break; }
          if (tip.y <= 0.01 || blocked(tip.x, tip.z)) { // 평평한 땅 기준이라 땅 높이는 0
            // 땅·나무에 꽂혀 잠시 남는다 (촉이 조금 박히게)
            a.pos.addScaledVector(a.vel.clone().normalize(), 0.08);
            a.stuck = 0;
            done = true;
          } else if (a.flown > ARROW.range) { remove(a); done = true; } // 멀리 가면 사라진다
        }
        if (list.includes(a)) place(a);
      }
    },
  };
}
