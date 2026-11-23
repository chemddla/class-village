// 광장·들판에 소환하는 쪼렙 몬스터 (날개콩·몽당연필): 정해진 자리를 빙 돌며 걷기·쉬기·특기(날기 시도·물구나무 낙서)·두리번을 되풀이한다.
// 가야 할 자리와 동작을 시계(Date.now)로 정하므로, 같은 서버에 들어온 사람들 화면에서 거의 같은 자리·같은 동작으로 보인다.
// 맞는 판정도 (모두의 화면에 똑같이 보이는) 휘두르는 사람의 자리·방향으로 정하므로, 누가 때려도 모두의 화면에서 함께 맞는다.
// (서버가 따로 몬스터를 관리하지 않는 맛보기용. 가까이 다가가면 내 화면에서만 깜짝 놀란다)
import { PLAZA } from '../../../shared/world.js';
import { curveDrop } from '../materials.js';
import { createNalgaekong } from './nalgaekong.js';
import { createMongdang } from './mongdang.js';

// 몬스터 종류: 만드는 함수 · 몸 반지름(시안 크기) · 일정의 특기 칸에 하는 동작 · 기본 성격
// 성격(temper): 캐릭터를 발견했을 때 어떻게 하는지
//   'flee'    도망형: 일정 거리까지 도망감. 나한테 맞으면 화가 나서 쫓아와 공격
//   'neutral' 중립형: 별다른 행동 없이 제 할 일만 함
//   'aggro'   공격형: 다가와서 공격
const KINDS = {
  nalgae: { create: createNalgaekong, r: 0.065, special: 'flutter', temper: 'flee' },
  mongdang: { create: createMongdang, r: 0.042, special: 'scribble', temper: 'flee' },
};

const SCALE = 1.5 * 1.7 * 2; // 시안 크기 × 마을 주민 배율 × 2 → 주민 허리 아래쯤
const OUTLINE_SCALE = 0.65; // 마을 주민과 같은 외곽선 배율
const SPEED = 0.3; // 걷는 빠르기 (m/s)
const CATCH_UP = 0.9; // 맞고 밀려난 뒤 제 길로 돌아가는 빠르기 (m/s)
const NOTICE_NEAR = 2.0; // 이만큼 가까이 오면 깜짝 놀람 (m)
const NOTICE_COOL = 8; // 한 번 놀란 뒤 다시 놀라기까지 (초)
const HP = 3; // 이만큼 맞으면 쓰러짐
const HP_RESET = 10; // 이 시간 동안 안 맞으면 다시 멀쩡해짐 (초)
const RESPAWN = 4; // 쓰러져 사라진 뒤 다시 나타나기까지 (초)
const KNOCK = 1.1; // 맞았을 때 밀려나는 첫 빠르기 (m/s)
const PAVE = 0.05; // 광장 돌바닥 두께 (village.js buildPlaza): 광장 안에서는 이 위에 서야 발이 묻히지 않는다
// 성격별 움직임 (모두 내 화면에서만: 내 캐릭터를 보고 움직인다)
const SIGHT = 3.5; // 이만큼 가까이 오면 발견 (m)
const VIEW = 1.2; // 바라보는 쪽에서 좌우 이만큼(라디안, 약 70°) 안에 있어야 알아챔: 뒤로 몰래 다가가면 모른다
const SPOT_TIME = 1.1; // '발견!' 동작을 하고 이만큼 뒤에 도망치기 시작 (초)
const FLEE_LOOK = [0.3, 0.6, 1.0]; // 도망갈 쪽이 막혔는지 미리 살펴보는 거리들 (m)
const FLEE_TURNS = [0, 0.4, 0.8, 1.2, 1.6, 2.0, 2.4]; // 막혔을 때 바로 반대쪽에서 이만큼씩(라디안) 틀어 보며 빈 길을 찾음
const FLEE_SPEED = 2.4; // 도망가는 빠르기 (m/s): 걷는 캐릭터(3.2)보다 조금 느려 쫓아가면 잡힌다
const FLEE_TO = 6.5; // 이만큼 떨어지면 도망을 멈추고 제 길로 돌아감 (m)
const FLEE_TIME = 3; // 이만큼 도망치면 멈춤 (초)
const FLEE_RUN = 4; // 이만큼 달아나면 멈춤 (m)
// 도망을 멈추면 나를 잊는다: 다시 눈에 띄면 또 '발견!' 하고 도망
const AGGRO_SIGHT = 5; // 공격형이 알아채는 거리 (m)
const CHASE_LOSE = 9; // 이만큼 멀어지면 쫓기를 그만둠 (m)
const CHASE_SPEED = 1.6; // 쫓아오는 빠르기 (m/s)
const ANGRY = 8; // 도망형이 맞고 화가 나 있는 시간 (초): 그동안은 공격형처럼 쫓아와 공격
const LEASH = 7; // 제 길에서 이보다 멀리는 가지 않음 (m)
const ATTACK_REACH = 0.55; // 몸 가장자리에서 이만큼 안이면 공격 (m)
const ATTACK_COOL = 1.6; // 공격 사이 쉬는 시간 (초)
const STRIKE_AT = 0.47; // 공격 동작에서 부리·심이 닿는 순간 (초)
const groundY = (x, z) => (Math.hypot(x - PLAZA.fountain.x, z - PLAZA.fountain.z) < PLAZA.r ? PAVE : 0);

// 한 바퀴 일정 (동작 이름, 초)
const PLAN = [['walk', 6], ['idle', 3], ['special', 2.7], ['walk', 5], ['idle', 2.5], ['notice', 1.3], ['idle', 1.5]];
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

// spot: 빙 도는 가운데와 반지름 (기본은 광장 분수 둘레, 분수와 벤치 사이 길) · phase: 일정을 이만큼(초) 어긋나게 (여럿이 같은 동작을 하지 않게)
// kind: 'nalgae'(날개콩) | 'mongdang'(몽당연필) · temper: 성격 (없으면 종류의 기본 성격)
// onAttack(x, z): 이 몬스터의 공격이 내 캐릭터에 닿았을 때 불림 (몬스터 자리)
// blocked(x, z, r): 반지름 r인 몸이 (x, z)에 서면 벽·분수·나무 등에 부딪히는지 (없으면 막히는 데 없음)
export function createPlazaMonsters(scene, { x = PLAZA.fountain.x, z = PLAZA.fountain.z, r: R = 3.0, phase = 0, kind = 'nalgae', temper, onAttack, blocked: blockedAt = () => false } = {}) {
  const f = { x, z };
  const K = KINDS[kind];
  const TEMPER = temper ?? K.temper;
  const BODY_R = K.r * SCALE; // 몸 반지름 (m): 캐릭터가 이 안으로 지나가지 못한다
  const blocked = (bx, bz) => blockedAt(bx, bz, BODY_R);
  // 벽에 부딪히면 미끄러지듯 이동 (이미 막힌 자리에 있으면 빠져나갈 수 있게 그냥 움직임)
  const move = (ax, az, nx, nz) => {
    if (!blocked(nx, nz) || blocked(ax, az)) return [nx, nz];
    if (!blocked(nx, az)) return [nx, az];
    if (!blocked(ax, nz)) return [ax, nz];
    return [ax, az];
  };
  // a쪽(각도)으로 조금 앞까지(max m 넘게는 보지 않음) 막힌 데가 없는지
  const clearToward = (a, max = Infinity) => FLEE_LOOK.every((d) => d > max || !blocked(px + Math.sin(a) * d, pz + Math.cos(a) * d));
  // want쪽으로 가고 싶을 때 실제로 갈 쪽: 막혔으면 옆으로 조금씩 틀어 빈 길을 찾음 (못 찾으면 null)
  const steer = (want, max) => {
    for (const t of FLEE_TURNS) {
      if (clearToward(want + t * fleeSide, max)) return want + t * fleeSide;
      if (t && clearToward(want - t * fleeSide, max)) { fleeSide = -fleeSide; return want + t * fleeSide; }
    }
    return null;
  };
  const mon = K.create({ fxParent: scene, outlineScale: OUTLINE_SCALE });
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
  let mode = 'route'; // 'route' 제 길 | 'spot' 발견! (멈춰서 놀람) | 'flee' 도망 | 'chase' 쫓아가 공격
  let spotLeft = 0; // '발견!' 동작이 끝나기까지 남은 시간 (초)
  let fleeT = 0; // 이번에 도망친 시간 (초)
  let fleeRun = 0; // 이번에 달아난 거리 (m)
  let fleeSide = 1; // 막혔을 때 먼저 틀어 볼 쪽 (1 왼쪽 | -1 오른쪽): 한번 정하면 그쪽으로 계속 돌아가 좌우로 갈팡질팡하지 않게
  let angry = 0; // 내가 때려서 화가 나 있는 남은 시간 (초)
  let attackCool = 0;
  let attackT = -1; // 공격 동작을 시작한 지 (초), 공격 중이 아니면 -1

  const target = () => {
    const s = scheduleAt(Date.now() / 1000 + phase);
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
    // byMe: 내 캐릭터가 때렸는지 (도망형은 나한테 맞으면 화가 나 나를 쫓아옴)
    tryHit(ax, az, hits, byMe = false) {
      if (px === null || mon.state === 'gone' || mon.state === 'die' || mon.state === 'spawn') return null;
      if (!hits(px, pz)) return null;
      const d = Math.hypot(px - ax, pz - az) || 1;
      kx = ((px - ax) / d) * KNOCK;
      kz = ((pz - az) / d) * KNOCK;
      heading = Math.atan2(ax - px, az - pz); // 때린 쪽을 돌아봄
      hp -= 1;
      sinceHit = 0;
      attackT = -1;
      if (byMe && TEMPER === 'flee') angry = ANGRY;
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
      let legs = 1; // 동작 빠르기 배수 (도망·쫓을 때 다리를 빨리 놀림)
      if (sinceHit > HP_RESET) hp = HP;

      // 밀려나기: 처음엔 빠르게, 금방 멈춤
      px += kx * dt;
      pz += kz * dt;
      const damp = Math.exp(-6 * dt);
      kx *= damp;
      kz *= damp;

      angry = mon.state === 'die' || mon.state === 'gone' ? 0 : Math.max(0, angry - dt);
      attackCool -= dt;
      const near = me ? Math.hypot(me.x - px, me.z - pz) : Infinity;
      const busy = BUSY.has(mon.state);

      // 공격 중: 부리·심이 닿는 순간에 아직 가까이 있으면 맞음
      if (mon.state === 'attack' && attackT >= 0) {
        attackT += dt;
        if (attackT >= STRIKE_AT) {
          attackT = -1;
          if (me && near < BODY_R + ATTACK_REACH + 0.25) onAttack?.(px, pz);
        }
      } else attackT = -1;

      // 성격에 따라 할 일 정하기
      const hostile = TEMPER === 'aggro' || angry > 0;
      // 나를 볼 수 있는지: 가까이 있고, 바라보는 쪽 앞에 있음 (뒤에서 다가가면 모른다)
      const sees = me && near < SIGHT && Math.abs(wrap(Math.atan2(me.x - px, me.z - pz) - heading)) < VIEW;
      if (busy || !me) mode = 'route';
      else if (hostile && (mode === 'chase' ? near < CHASE_LOSE : near < (angry > 0 ? CHASE_LOSE : AGGRO_SIGHT))) mode = 'chase';
      else if (TEMPER === 'flee' && !hostile) {
        if (mode === 'spot') {
          // 놀라는 동작이 끝나면 도망
          spotLeft -= dt;
          if (spotLeft <= 0) mode = 'flee';
        } else if (mode === 'flee') {
          if (near >= FLEE_TO || fleeT >= FLEE_TIME || fleeRun >= FLEE_RUN) mode = 'route';
        } else if (sees) {
          mode = 'spot';
          spotLeft = SPOT_TIME;
          fleeT = 0;
          fleeRun = 0;
          fleeSide = Math.random() < 0.5 ? 1 : -1;
          mon.play('notice');
        } else mode = 'route';
      } else mode = 'route';
      // 제 길에서 너무 멀어지면 그만두고 돌아감
      if ((mode === 'flee' || mode === 'chase') && Math.hypot(tx - px, tz - pz) > LEASH) {
        mode = 'route';
        angry = 0;
      }

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
      } else if (mon.state === 'attack') {
        // 공격하는 동안은 제자리에서 나를 바라봄
        if (me) heading += wrap(Math.atan2(me.x - px, me.z - pz) - heading) * Math.min(1, dt * 8);
      } else if (mode === 'spot') {
        // 깜짝 놀라 제자리에서 나를 쳐다봄
        heading += wrap(Math.atan2(me.x - px, me.z - pz) - heading) * Math.min(1, dt * 10);
        lastKey = s.key;
      } else if (mode === 'flee') {
        // 나와 반대쪽으로 종종걸음으로 도망감. 앞이 막혔으면 옆으로 틀어 빈 길로 돌아감
        const away = Math.atan2(px - me.x, pz - me.z);
        let dir = steer(away);
        if (dir === null && blocked(px, pz)) dir = away; // 이미 끼어 있으면 그냥 빠져나감
        if (dir !== null) {
          const [nx, nz] = move(px, pz, px + Math.sin(dir) * FLEE_SPEED * dt, pz + Math.cos(dir) * FLEE_SPEED * dt);
          fleeRun += Math.hypot(nx - px, nz - pz);
          px = nx;
          pz = nz;
          if (mon.state !== 'walk') mon.play('walk');
          heading += wrap(dir - heading) * Math.min(1, dt * 10);
          legs = 2.2; // 다리를 빨리 놀림
        } else {
          // 사방이 막혀 구석에 몰림: 몸을 박지 않고 멈춰서 나를 쳐다봄
          if (mon.state === 'walk') mon.play('idle');
          heading += wrap(away + Math.PI - heading) * Math.min(1, dt * 8);
        }
        fleeT += dt;
        lastKey = s.key;
      } else if (mode === 'chase') {
        // 다가와서, 닿을 만큼 가까우면 공격
        const want = Math.atan2(me.x - px, me.z - pz);
        heading += wrap(want - heading) * Math.min(1, dt * 8);
        const stop = BODY_R + ATTACK_REACH;
        if (near > stop + 0.05) { // 조금 여유를 둬서 닿을 듯 말 듯한 거리에서 계속 걷기만 하지 않게
          const step = Math.min(near - stop, CHASE_SPEED * dt);
          [px, pz] = move(px, pz, px + ((me.x - px) / near) * step, pz + ((me.z - pz) / near) * step);
          if (mon.state !== 'walk') mon.play('walk');
          legs = 1.6;
        } else {
          if (mon.state === 'walk') mon.play('idle');
          if (attackCool <= 0 && Math.abs(wrap(want - heading)) < 0.6) {
            mon.play('attack');
            attackT = 0;
            attackCool = ATTACK_COOL;
          }
        }
        lastKey = s.key;
      } else if (!busy) {
        const gap = Math.hypot(tx - px, tz - pz);
        if (gap > 0.05) {
          // 밀려나거나 도망쳤으면 제 길로 종종걸음으로 돌아감 (분수·벤치 등은 돌아서)
          const step = Math.min(gap, CATCH_UP * dt);
          const toward = Math.atan2(tx - px, tz - pz);
          const dir = steer(toward, gap) ?? toward;
          [px, pz] = move(px, pz, px + Math.sin(dir) * step, pz + Math.cos(dir) * step);
          if (mon.state !== 'walk') mon.play('walk');
          heading += wrap(dir - heading) * Math.min(1, dt * 8);
          lastKey = s.key; // 돌아가는 동안 지나간 일정은 건너뜀
        } else {
          px = tx;
          pz = tz;
          if (s.key !== lastKey) {
            // 새 구간: 한 번짜리 동작은 처음부터 볼 때만 틀고, 중간에 들어왔으면 쉬기로 둔다
            const oneShot = s.name !== 'walk' && s.name !== 'idle';
            mon.play(oneShot && (lastKey === '' || s.into > 0.4) ? 'idle' : s.name === 'special' ? K.special : s.name);
            lastKey = s.key;
          } else if (s.name === 'walk' && mon.state !== 'walk') {
            mon.play('walk');
          } else if (s.name !== 'walk' && mon.state === 'walk') {
            mon.play('idle');
          }

          // 쉬는 중에 내가 가까이 오면 깜짝 놀라 나를 쳐다봄 (내 화면에서만)
          // (중립형은 나를 본 척도 하지 않음 · 도망형은 위에서 '발견!' 하고 도망가므로 따로 쳐다보지 않음)
          let want = heading;
          noticeCool -= dt;
          const looks = TEMPER === 'aggro';
          if (s.name === 'walk') want = th + Math.PI / 2;
          else if (looks && near < 3) want = Math.atan2(me.x - px, me.z - pz);
          if (looks && s.name === 'idle' && mon.state === 'idle' && near < NOTICE_NEAR && noticeCool <= 0) {
            mon.play('notice');
            noticeCool = NOTICE_COOL;
          }
          heading += wrap(want - heading) * Math.min(1, dt * 6);
        }
      }

      mon.root.position.set(px, groundY(px, pz) - curveDrop(px, pz), pz);
      mon.root.rotation.y = heading;
      mon.update(mon.state === 'walk' ? dt * legs : dt);
    },
  };
}
