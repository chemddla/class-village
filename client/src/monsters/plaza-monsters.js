// 테스트 서버 광장에 소환하는 날개콩: 분수 둘레를 돌며 걷기·쉬기·날기 시도·두리번을 되풀이한다.
// 자리와 동작을 시계(Date.now)로 정하므로, 같은 서버에 들어온 사람들 화면에서 거의 같은 자리·같은 동작으로 보인다.
// (서버가 따로 몬스터를 관리하지 않는 맛보기용. 가까이 다가가면 내 화면에서만 깜짝 놀란다)
import { PLAZA } from '../../../shared/world.js';
import { curveDrop } from '../materials.js';
import { createNalgaekong } from './nalgaekong.js';

const SCALE = 1.5 * 1.7; // 시안 크기 × 마을 주민 배율 → 주민 무릎쯤
const OUTLINE_SCALE = 0.65; // 마을 주민과 같은 외곽선 배율
const R = 3.0; // 분수 중심에서 떨어진 거리 (분수와 벤치 사이 길) (m)
const SPEED = 0.3; // 걷는 빠르기 (m/s)
const NOTICE_NEAR = 1.6; // 이만큼 가까이 오면 깜짝 놀람 (m)
const NOTICE_COOL = 8; // 한 번 놀란 뒤 다시 놀라기까지 (초)

// 한 바퀴 일정 (동작 이름, 초)
const PLAN = [['walk', 6], ['idle', 3], ['flutter', 2.2], ['walk', 5], ['idle', 2.5], ['notice', 1.3], ['idle', 1.5]];
const CYCLE = PLAN.reduce((a, [, d]) => a + d, 0);
const WALK_PER_CYCLE = PLAN.reduce((a, [n, d]) => a + (n === 'walk' ? d : 0), 0);

// t초일 때 일정의 몇 번째 구간인지, 지금까지 걸은 시간은 얼마인지
function scheduleAt(t) {
  const cycle = Math.floor(t / CYCLE);
  let r = t - cycle * CYCLE;
  let walked = cycle * WALK_PER_CYCLE;
  for (let i = 0; i < PLAN.length; i++) {
    const [name, d] = PLAN[i];
    if (r < d) return { name, key: `${cycle}:${i}`, into: r, walked: walked + (name === 'walk' ? r : 0) };
    if (name === 'walk') walked += d;
    r -= d;
  }
  return { name: 'idle', key: `${cycle}:end`, into: 0, walked };
}

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function createPlazaMonsters(scene) {
  const f = PLAZA.fountain;
  const mon = createNalgaekong({ fxParent: scene, outlineScale: OUTLINE_SCALE });
  mon.root.scale.setScalar(SCALE);
  scene.add(mon.root);
  let lastKey = '';
  let heading = 0;
  let noticeCool = 0;

  return {
    root: mon.root,
    // me: 내 캐릭터 (없으면 아직 입장 전)
    update(dt, me) {
      const s = scheduleAt(Date.now() / 1000);
      const th = (s.walked * SPEED) / R;
      const x = f.x + Math.sin(th) * R;
      const z = f.z + Math.cos(th) * R;

      if (s.key !== lastKey) {
        // 새 구간: 한 번짜리 동작은 처음부터 볼 때만 틀고, 중간에 들어왔으면 쉬기로 둔다
        const oneShot = s.name !== 'walk' && s.name !== 'idle';
        mon.play(oneShot && (lastKey === '' || s.into > 0.4) ? 'idle' : s.name);
        lastKey = s.key;
      } else if (s.name === 'walk' && mon.state !== 'walk') {
        mon.play('walk');
      }

      // 쉬는 중에 내가 가까이 오면 깜짝 놀라 나를 쳐다봄 (내 화면에서만)
      let want = heading;
      noticeCool -= dt;
      const near = me ? Math.hypot(me.x - x, me.z - z) : Infinity;
      if (s.name === 'walk') want = th + Math.PI / 2;
      else if (near < 3) want = Math.atan2(me.x - x, me.z - z);
      if (s.name === 'idle' && mon.state === 'idle' && near < NOTICE_NEAR && noticeCool <= 0) {
        mon.play('notice');
        noticeCool = NOTICE_COOL;
      }
      heading += wrap(want - heading) * Math.min(1, dt * 6);

      mon.root.position.set(x, -curveDrop(x, z), z);
      mon.root.rotation.y = heading;
      mon.update(dt);
    },
  };
}
