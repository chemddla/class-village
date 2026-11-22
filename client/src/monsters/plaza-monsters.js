// 테스트 서버 광장에 소환하는 날개콩: 분수 둘레를 돌며 걷기·쉬기·날기 시도·두리번을 되풀이한다.
// 가야 할 자리와 동작을 시계(Date.now)로 정하므로, 같은 서버에 들어온 사람들 화면에서 거의 같은 자리·같은 동작으로 보인다.
// 맞는 판정도 (모두의 화면에 똑같이 보이는) 휘두르는 사람의 자리·방향으로 정하므로, 누가 때려도 모두의 화면에서 함께 맞는다.
// (서버가 따로 몬스터를 관리하지 않는 맛보기용. 가까이 다가가면 내 화면에서만 깜짝 놀란다)
import { PLAZA } from '../../../shared/world.js';
import { curveDrop } from '../materials.js';
import { createNalgaekong } from './nalgaekong.js';

const SCALE = 1.5 * 1.7 * 2; // 시안 크기 × 마을 주민 배율 × 2 → 주민 허리 아래쯤
const OUTLINE_SCALE = 0.65; // 마을 주민과 같은 외곽선 배율
const BODY_R = 0.065 * SCALE; // 몸 반지름 (m): 캐릭터가 이 안으로 지나가지 못한다
const R = 3.0; // 분수 중심에서 떨어진 거리 (분수와 벤치 사이 길) (m)
const SPEED = 0.3; // 걷는 빠르기 (m/s)
const CATCH_UP = 0.9; // 맞고 밀려난 뒤 제 길로 돌아가는 빠르기 (m/s)
const NOTICE_NEAR = 2.0; // 이만큼 가까이 오면 깜짝 놀람 (m)
const NOTICE_COOL = 8; // 한 번 놀란 뒤 다시 놀라기까지 (초)
const HP = 3; // 이만큼 맞으면 쓰러짐
const HP_RESET = 10; // 이 시간 동안 안 맞으면 다시 멀쩡해짐 (초)
const RESPAWN = 4; // 쓰러져 사라진 뒤 다시 나타나기까지 (초)
const KNOCK = 1.1; // 맞았을 때 밀려나는 첫 빠르기 (m/s)

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
// 일정과 상관없이 날개콩이 직접 하는 동작 (맞음·쓰러짐 등): 이 동안에는 일정을 따르지 않는다
const BUSY = new Set(['hit', 'die', 'gone', 'spawn']);

export function createPlazaMonsters(scene) {
  const f = PLAZA.fountain;
  const mon = createNalgaekong({ fxParent: scene, outlineScale: OUTLINE_SCALE });
  mon.root.scale.setScalar(SCALE);
  scene.add(mon.root);
  let lastKey = '';
  let heading = 0;
  let noticeCool = 0;
  let px = null; // 지금 서 있는 자리 (맞고 밀려나면 일정 자리와 달라짐)
  let pz = 0;
  let kx = 0; // 밀려나는 빠르기
  let kz = 0;
  let hp = HP;
  let sinceHit = 0;
  let goneFor = 0;

  const target = () => {
    const s = scheduleAt(Date.now() / 1000);
    const th = (s.walked * SPEED) / R;
    return { s, th, x: f.x + Math.sin(th) * R, z: f.z + Math.cos(th) * R };
  };

  return {
    root: mon.root,
    // 캐릭터가 지나가지 못하는 둥근 몸 (사라져 있을 때는 없음)
    colliders() {
      return px === null || mon.state === 'gone' || mon.state === 'die' ? [] : [{ x: px, z: pz, r: BODY_R }];
    },
    // 휘두르기에 맞았는지 보고, 맞았으면 맞는 동작. hits(때린 사람 자리·방향, 맞을 자리) → 맞았으면 맞은 자리를 돌려줌
    tryHit(ax, az, hits) {
      if (px === null || mon.state === 'gone' || mon.state === 'die' || mon.state === 'spawn') return null;
      if (!hits(px, pz)) return null;
      const d = Math.hypot(px - ax, pz - az) || 1;
      kx = ((px - ax) / d) * KNOCK;
      kz = ((pz - az) / d) * KNOCK;
      heading = Math.atan2(ax - px, az - pz); // 때린 쪽을 돌아봄
      hp -= 1;
      sinceHit = 0;
      if (hp <= 0) {
        mon.play('die');
        kx *= 0.5;
        kz *= 0.5;
      } else mon.play('hit');
      return { x: px, z: pz, y: 0.07 * SCALE };
    },
    // me: 내 캐릭터 (없으면 아직 입장 전)
    update(dt, me) {
      const { s, th, x: tx, z: tz } = target();
      if (px === null) { px = tx; pz = tz; }
      sinceHit += dt;
      if (sinceHit > HP_RESET) hp = HP;

      // 밀려나기: 처음엔 빠르게, 금방 멈춤
      px += kx * dt;
      pz += kz * dt;
      const damp = Math.exp(-6 * dt);
      kx *= damp;
      kz *= damp;

      const busy = BUSY.has(mon.state);
      if (mon.state === 'gone') {
        // 쓰러져 사라졌다가 잠시 뒤 제 길 위에서 다시 나타남
        goneFor += dt;
        if (goneFor > RESPAWN) {
          goneFor = 0;
          hp = HP;
          px = tx;
          pz = tz;
          kx = kz = 0;
          mon.play('spawn');
        }
      } else if (!busy) {
        const gap = Math.hypot(tx - px, tz - pz);
        if (gap > 0.05) {
          // 밀려났으면 제 길로 종종걸음으로 돌아감
          const step = Math.min(gap, CATCH_UP * dt);
          px += ((tx - px) / gap) * step;
          pz += ((tz - pz) / gap) * step;
          if (mon.state !== 'walk') mon.play('walk');
          heading += wrap(Math.atan2(tx - px, tz - pz) - heading) * Math.min(1, dt * 8);
          lastKey = s.key; // 돌아가는 동안 지나간 일정은 건너뜀
        } else {
          px = tx;
          pz = tz;
          if (s.key !== lastKey) {
            // 새 구간: 한 번짜리 동작은 처음부터 볼 때만 틀고, 중간에 들어왔으면 쉬기로 둔다
            const oneShot = s.name !== 'walk' && s.name !== 'idle';
            mon.play(oneShot && (lastKey === '' || s.into > 0.4) ? 'idle' : s.name);
            lastKey = s.key;
          } else if (s.name === 'walk' && mon.state !== 'walk') {
            mon.play('walk');
          } else if (s.name !== 'walk' && mon.state === 'walk') {
            mon.play('idle');
          }

          // 쉬는 중에 내가 가까이 오면 깜짝 놀라 나를 쳐다봄 (내 화면에서만)
          let want = heading;
          noticeCool -= dt;
          const near = me ? Math.hypot(me.x - px, me.z - pz) : Infinity;
          if (s.name === 'walk') want = th + Math.PI / 2;
          else if (near < 3) want = Math.atan2(me.x - px, me.z - pz);
          if (s.name === 'idle' && mon.state === 'idle' && near < NOTICE_NEAR && noticeCool <= 0) {
            mon.play('notice');
            noticeCool = NOTICE_COOL;
          }
          heading += wrap(want - heading) * Math.min(1, dt * 6);
        }
      }

      mon.root.position.set(px, -curveDrop(px, pz), pz);
      mon.root.rotation.y = heading;
      mon.update(dt);
    },
  };
}
