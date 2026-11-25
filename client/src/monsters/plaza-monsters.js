// 광장·들판에 소환하는 쪼렙 몬스터 (날개콩·몽당연필·반쪽이·하악냥·구구): 정해진 자리를 빙 돌며 걷기·쉬기·특기(날기 시도·물구나무 낙서·박박 문지르기)·두리번을 되풀이한다.
// 가야 할 자리와 동작을 시계(Date.now)로 정하므로, 같은 서버에 들어온 사람들 화면에서 거의 같은 자리·같은 동작으로 보인다.
// 맞는 판정도 (모두의 화면에 똑같이 보이는) 휘두르는 사람의 자리·방향으로 정하므로, 누가 때려도 모두의 화면에서 함께 맞는다.
// (서버가 따로 몬스터를 관리하지 않는 맛보기용. 가까이 다가가면 내 화면에서만 깜짝 놀란다)
import { PLAZA } from '../../../shared/world.js';
import * as THREE from 'three';
import { curveDrop, blobGeometry } from '../materials.js';
import { createNalgaekong } from './nalgaekong.js';
import { createMongdang } from './mongdang.js';
import { createBanjjok } from './banjjok.js';
import { createHaaknyang, swatTaps } from './haaknyang.js';
import { createGugu } from './gugu.js';
import { canvasTexture } from '../villager/textures.js';

// 몬스터 종류: 만드는 함수 · 몸 반지름(시안 크기) · 일정의 특기 칸에 하는 동작 · 기본 성격 · size(크기 배율, 없으면 1) · shadow(발밑 그림자 좌우·앞뒤 배율, 없으면 동그랗게)
// 성격(temper): 캐릭터를 발견했을 때 어떻게 하는지
//   'flee'    도망형: 일정 거리까지 도망감. 나한테 맞으면 화가 나서 쫓아와 공격
//   'neutral' 중립형: 별다른 행동 없이 제 할 일만 함
//   'aggro'   공격형: 다가와서 공격
const KINDS = {
  nalgae: { create: createNalgaekong, r: 0.065, special: 'flutter', temper: 'flee' },
  mongdang: { create: createMongdang, r: 0.042, special: 'scribble', temper: 'flee' },
  banjjok: { create: createBanjjok, r: 0.04, special: 'rub', temper: 'flee', size: 1.35, shadow: [1, 0.62] }, // 납작해서 조금 크게 · 그림자는 길쭉하게 · 몸통박치기도 0.47초에 닿음
  haak: { create: createHaaknyang, r: 0.033, special: 'groom', temper: 'flee', run: 1.5, size: 1.15, shadow: [0.75, 1.15], hunts: true, // 둘레 곤충을 쫓아가 툭툭 침
    // 고양이답게: 돌아다니기보다 한 자리에서 오래 낮잠 자고 그루밍하다가, 가끔 조금 걸어 자리를 옮김
    plan: [['walk', 2.5], ['idle', 2], ['special', 2.7], ['special', 2.7], ['sleep', 20], ['idle', 2.5], ['special', 2.7], ['walk', 2], ['idle', 4], ['sleep', 14], ['idle', 2]] }, // 하악냥: 앞뒤로 길쭉해서 그림자도 앞뒤로 · 덮치기도 0.47초에 닿음
  // 구구(비둘기): 중립형이라 사람을 봐도 제 할 일만. 뒤뚱뒤뚱 걷다 모이 콕콕, 가끔 짝! 날아올랐다 내려앉음 · 하악냥보다 작게
  gugu: { create: createGugu, r: 0.03, special: 'peck', temper: 'neutral', size: 0.75, shadow: [0.8, 1.1],
    plan: [['walk', 4], ['idle', 2.5], ['special', 2], ['walk', 3], ['special', 2], ['fly', 3.4], ['idle', 2], ['walk', 5], ['special', 2], ['idle', 3]] },
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
const WAKE_NEAR = 1.6; // 자는 몬스터는 이만큼 가까이 와야 깸 (m)
const VIEW = 1.2; // 바라보는 쪽에서 좌우 이만큼(라디안, 약 70°) 안에 있어야 알아챔: 뒤로 몰래 다가가면 모른다
const SPOT_TIME = 1.1; // '발견!' 동작을 하고 이만큼 뒤에 도망치기 시작 (초)
const FLEE_LOOK = [0.3, 0.6, 1.0]; // 도망갈 쪽이 막혔는지 미리 살펴보는 거리들 (m)
const FLEE_TURNS = [0, 0.4, 0.8, 1.2, 1.6, 2.0, 2.4]; // 막혔을 때 바로 반대쪽에서 이만큼씩(라디안) 틀어 보며 빈 길을 찾음
const FLEE_SPEED = 2.4; // 도망가는 빠르기 (m/s): 걷는 캐릭터(3.2)보다 조금 느려 쫓아가면 잡힌다
const FLEE_TO = 10; // 이만큼 떨어지면 도망을 멈추고 제 길로 돌아감 (m)
const FLEE_TIME = 5; // 이만큼 도망치면 멈춤 (초)
const FLEE_RUN = 8; // 이만큼 달아나면 멈춤 (m)
// 도망을 멈추면 나를 잊는다: 다시 눈에 띄면 또 '발견!' 하고 도망
const AGGRO_SIGHT = 5; // 공격형이 알아채는 거리 (m)
const CHASE_LOSE = 9; // 이만큼 멀어지면 쫓기를 그만둠 (m): 화난 도망형도 이만큼 멀어지면 나를 잊는다
const CHASE_SPEED = 1.6; // 쫓아오는 빠르기 (m/s)
const LEASH = 7; // 제 길에서 이보다 멀리는 가지 않음 (m)
const ANGRY_LEASH = 25; // 화나서 쫓거나 도망칠 때는 이만큼까지 따라감 (m): 맵 끝까지 끝없이 따라오지는 않게
const ATTACK_REACH = 0.55; // 몸 가장자리에서 이만큼 안이면 공격 (m)
const ATTACK_COOL = 1.6; // 공격 사이 쉬는 시간 (초)
const STRIKE_AT = 0.47; // 공격 동작에서 부리·심·몸통이 닿는 순간 (초)
// 곤충 사냥 (hunts 인 몬스터 = 하악냥): 쉬거나 걷다가 둘레 곤충을 보면 쫓아가 앞발로 툭툭 → 곤충은 놀라 날아가고 시무룩
const HUNT_SIGHT = 5; // 이만큼 안의 곤충을 알아챔 (m)
const HUNT_HIGH = 1.5; // 이보다 높이 나는 곤충은 못 침 (m)
const HUNT_REACH = 0.3; // 몸 가장자리에서 이만큼 안이면 툭툭 (m)
const HUNT_SPEED = 1.3; // 곤충 쫓는 빠르기 (m/s, 종류의 run 배수를 곱함)
const HUNT_COOL = 7; // 한 번 사냥한 뒤 다시 곤충을 노리기까지 (초)
const RAGE_TIME = 1.0; // 나를 공격 대상으로 알아챘을 때 '화남!' 동작을 하고 이만큼 뒤에 쫓아오기 시작 (초)
// 구구(비둘기) 나들이: 한가할 때 가끔 날아가 나무 꼭대기·가만히 선 캐릭터 머리·날개콩 머리에 앉았다 오거나, 하악냥에게 장난을 걸었다가 가볍게 피함
const GUGU_TRIP_CHANCE = 0.06; // 한가할 때 1초마다 나들이를 떠날 확률 (평균 17초에 한 번쯤)
const GUGU_TRIP_COOL = 10; // 다녀온 뒤 다시 떠나기까지 (초)
const GUGU_REACH = 9; // 이만큼 안의 자리로만 날아감 (m)
const GUGU_FLY = 2.2; // 나는 빠르기 (m/s)
const GUGU_SIT = [3, 6]; // 나무·머리 위에 앉아 쉬는 시간 (초, 이 사이)
const GUGU_HIGH = 0.3; // 이보다 높이 떠 있으면 휘둘러도 안 맞음 (m)
const CAT_NEAR = 4; // 하악냥이 이만큼 안에 있어야 장난을 검 (m)
const CAT_HOVER = 0.9; // 하악냥 머리 위에서 파닥이는 높이 (m): 폴짝 뛰면 앞발이 닿을락 말락
const NALGAE_TOP = 0.0618; // 날개콩 몸 공 가운데에서 정수리까지 (날개콩 크기 기준)
const sm = (x, a, b) => THREE.MathUtils.smoothstep(x, a, b);
const TMP = new THREE.Vector3();
// 날개콩 머리 위에 뜨는 물음표 (뭐지?)
const questionMark = () => {
  const q = new THREE.Sprite(new THREE.SpriteMaterial({
    transparent: true, depthWrite: false, depthTest: false,
    map: canvasTexture('monsterQuestion', 128, 128, (g, w, h) => {
      g.font = `900 ${h * 0.9}px 'Pretendard', 'Malgun Gothic', sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineJoin = 'round';
      g.lineWidth = 16;
      g.strokeStyle = '#4a3525';
      g.strokeText('?', w / 2, h * 0.54);
      g.fillStyle = '#ffffff';
      g.fillText('?', w / 2, h * 0.54);
    }),
  }));
  q.renderOrder = 2;
  return q;
};
// 발밑 그림자: 주민(character.js)과 같은 반투명 동그라미. 땅에 바짝 붙이고 겹침 깜빡임은 polygonOffset으로
const SHADOW_MAT = new THREE.MeshBasicMaterial({
  color: 0x2a3b1a, transparent: true, opacity: 0.24, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
});
const BLOB_R = 0.45; // blobGeometry 반지름 (m)
const PUSH = 6; // 다른 몬스터와 겹쳤을 때 밀려나는 빠르기 (겹친 만큼 × 이 값 / 초)
const ALL = new Set(); // 소환된 몬스터 모두의 자리·몸 반지름 (몬스터끼리 서로 통과하거나 겹치지 않게)
const groundY = (x, z) => (Math.hypot(x - PLAZA.fountain.x, z - PLAZA.fountain.z) < PLAZA.r ? PAVE : 0);

// ── 합동 모션: 몽당연필이 땅에 마구 낙서하면 가까이 있던 반쪽이가 쫓아다니며 박박 지운다 ──
// 시작은 시계(1초마다)와 몬스터 자리로 정하므로, 같은 서버의 사람들 화면에서 거의 같이 시작한다
const DUO_NEAR = 3.5; // 둘이 이만큼 안에 있어야 함께 함 (m)
const DUO_CHANCE = 0.035; // 가까이 있을 때 1초마다 시작할 확률 (평균 30초에 한 번쯤)
const DUO_COOL = 25; // 한 번 한 뒤 다시 하기까지 쉬는 시간 (초)
const DOODLE_TIME = 4.2; // 물구나무 서서 낙서하는 시간 (뒤집는 시간 포함, 초)
const DOODLE_SPEED = 0.6; // 낙서하며 움직이는 빠르기 (m/s)
const DOODLE_SPREAD = 0.9; // 처음 자리에서 이보다 멀어지면 돌아오며 끄적임 (m): 낙서가 한 군데 몰리게
const DOT_GAP = 0.012; // 낙서 점 사이 거리 (m): 점이 이어져 선처럼 보임
const DOT_R = 0.022; // 낙서 점 반지름 (m)
const ZIG = 0.07; // 심 끝이 좌우로 박박 긋는 폭 (m): 매끈한 선이 아니라 지그재그 낙서가 되게
const ZIG_K = 30; // 지그재그 촘촘함 (움직인 1m마다 이 라디안만큼)
const SCRUB_SPEED = 0.32; // 지우며 움직이는 빠르기 (m/s)
const SCRUB_REACH = 0.45; // 가장 가까운 낙서가 이보다 멀면 걸어가고, 가까우면 엎드려 지우며 다가감 (m)
const ERASE_R = 0.3; // 엎드린 몸 앞 이만큼 안의 낙서가 지워짐 (m)
const ERASE_GIVEUP = 4; // 이만큼 하나도 못 지우면(벽 너머 등) 포기 (초)
const MARK_FADE = 3; // 합동 모션이 끊기면 남은 낙서가 이만큼에 걸쳐 흐려져 사라짐 (초)
const MARK_GEO = new THREE.CircleGeometry(1, 10).rotateX(-Math.PI / 2);
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);
const FADING = new Set(); // 흐려지는 중인 낙서들 (어느 몬스터든 매 프레임 시계로 흐리게 함)
// 두 수로 0~1 사이 같은 값 (모두의 화면에서 똑같이 나오는 주사위)
function dice(a, b) {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b | 0, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x27d4eb2d);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
// 정해진 씨앗으로 계속 같은 순서의 0~1 값을 내놓는 주사위
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// 땅에 남는 연필 낙서: 납작한 점들을 이어 찍는다 (한 번에 그리도록 점들을 하나로 묶음)
function createMarks(scene) {
  const MAX = 900;
  const mat = new THREE.MeshBasicMaterial({
    color: 0x45454e, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  });
  const mesh = new THREE.InstancedMesh(MARK_GEO, mat, MAX);
  mesh.name = '연필낙서';
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  scene.add(mesh);
  const pts = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  let alive = 0;
  let fadeFrom = 0;
  return {
    get alive() { return alive; },
    add(x, z) {
      if (pts.length >= MAX) return;
      const r = DOT_R * (0.85 + Math.random() * 0.3); // 연필 자국 굵기가 조금씩 다르게
      m4.compose(v.set(x, groundY(x, z) - curveDrop(x, z) + 0.004, z), q.setFromAxisAngle(UP, Math.random() * 6), sc.set(r, 1, r));
      mesh.setMatrixAt(pts.length, m4);
      pts.push({ x, z, on: true });
      alive++;
      mesh.count = pts.length;
      mesh.instanceMatrix.needsUpdate = true;
    },
    // (x, z) 둘레 r 안의 점을 조금씩 지움 (한꺼번에 사라지지 않고 문지르는 동안 슥슥 지워지게) → 지운 개수
    erase(x, z, r, dt) {
      let n = 0;
      pts.forEach((p, i) => {
        if (!p.on || Math.hypot(p.x - x, p.z - z) > r || Math.random() > dt * 6) return;
        p.on = false;
        alive--;
        n++;
        mesh.setMatrixAt(i, HIDE);
      });
      if (n) mesh.instanceMatrix.needsUpdate = true;
      return n;
    },
    // 가장 가까운 남은 점
    nearest(x, z) {
      let best = null, bd = Infinity;
      for (const p of pts) {
        if (!p.on) continue;
        const d = Math.hypot(p.x - x, p.z - z);
        if (d < bd) { bd = d; best = p; }
      }
      return best;
    },
    // 남은 점들의 가운데
    center() {
      let sx = 0, sz = 0;
      for (const p of pts) if (p.on) { sx += p.x; sz += p.z; }
      return alive ? { x: sx / alive, z: sz / alive } : null;
    },
    // 남은 낙서를 천천히 흐리게 하다가 치움
    fadeOut() {
      if (!alive) { this.dispose(); return; }
      fadeFrom = Date.now();
      FADING.add(this);
    },
    fade() {
      const r = (Date.now() - fadeFrom) / 1000 / MARK_FADE;
      mat.opacity = 0.85 * Math.max(0, 1 - r);
      if (r >= 1) { FADING.delete(this); this.dispose(); }
    },
    dispose() {
      scene.remove(mesh);
      mesh.dispose();
      mat.dispose();
    },
  };
}
// 합동 모션 끝내기 (끝까지 했든 중간에 끊겼든): 둘 다 제 길로 돌아가고, 남은 낙서는 흐려져 사라짐
function endDuo(duo) {
  if (duo.over) return;
  duo.over = true;
  duo.p.duo = duo.e.duo = null;
  duo.p.duoCool = duo.e.duoCool = DUO_COOL;
  duo.marks?.fadeOut(); // 구구 합동은 낙서가 없음
}

// 한 바퀴 일정 (동작 이름, 초)
const PLAN = [['walk', 6], ['idle', 3], ['special', 2.7], ['walk', 5], ['idle', 2.5], ['notice', 1.3], ['idle', 1.5]];

// t초일 때 일정(plan)의 몇 번째 구간인지, 지금까지 걸은 시간은 얼마인지
function scheduleAt(t, plan = PLAN) {
  const len = plan.reduce((a, [, d]) => a + d, 0);
  const cycle = Math.floor(t / len);
  let r = t - cycle * len;
  let walked = cycle * plan.reduce((a, [n, d]) => a + (n === 'walk' ? d : 0), 0);
  for (let i = 0; i < plan.length; i++) {
    const [name, d] = plan[i];
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
// kind: 'nalgae'(날개콩) | 'mongdang'(몽당연필) | 'banjjok'(반쪽이) | 'haak'(하악냥) · temper: 성격 (없으면 종류의 기본 성격)
// onAttack(x, z): 이 몬스터의 공격이 내 캐릭터에 닿았을 때 불림 (몬스터 자리)
// blocked(x, z, r): 반지름 r인 몸이 (x, z)에 서면 벽·분수·나무 등에 부딪히는지 (없으면 막히는 데 없음)
// perches(): 구구가 앉을 만한 자리 [{ x, z, get() → { x, y, z } (월드, 못 앉게 되면 null) }] — 구구만 씀
// prey(): 곤충 번호 → { x, y, z } (Map) · onSwat(id, x, z): 이 몬스터가 곤충을 툭툭 쳤을 때 불림 (몬스터 자리) — 둘 다 hunts 인 종류만 씀
export function createPlazaMonsters(scene, { x = PLAZA.fountain.x, z = PLAZA.fountain.z, r: R = 3.0, phase = 0, kind = 'nalgae', temper, onAttack, prey, onSwat, perches = null, blocked: blockedAt = () => false } = {}) {
  const f = { x, z };
  const K = KINDS[kind];
  const TEMPER = temper ?? K.temper;
  const RUN = K.run ?? 1; // 도망·쫓을 때 빠르기 배수 (하악냥은 더 빨리 달림)
  const S = SCALE * (K.size ?? 1); // 이 몬스터의 크기
  const BODY_R = K.r * S; // 몸 반지름 (m): 캐릭터가 이 안으로 지나가지 못한다
  // 다른 몬스터 몸과 겹치는 자리인지 (몬스터끼리도 서로 통과하지 못한다)
  // kind·free·seen·duo·duoCool: 합동 모션 짝 찾기용 (free: 제 길을 따라 한가하게 걷거나 쉬는 중 · seen: 마지막으로 움직인 시각)
  const self = { x: 0, z: 0, r: BODY_R, solid: false, kind, free: false, seen: 0, duo: null, duoCool: DUO_COOL * 0.4 };
  ALL.add(self);
  const hitsMon = (bx, bz) => {
    for (const o of ALL) if (o !== self && o.solid && Math.hypot(bx - o.x, bz - o.z) < o.r + BODY_R) return true;
    return false;
  };
  const wall = (bx, bz) => blockedAt(bx, bz, BODY_R);
  const blocked = (bx, bz) => wall(bx, bz) || hitsMon(bx, bz);
  // 막히면 미끄러지듯 이동 (이미 막힌 자리에 있으면 빠져나갈 수 있게 그냥 움직임)
  const slide = (test) => (ax, az, nx, nz) => {
    if (!test(nx, nz) || test(ax, az)) return [nx, nz];
    if (!test(nx, az)) return [nx, az];
    if (!test(ax, nz)) return [ax, nz];
    return [ax, az];
  };
  // 다른 몬스터와 가장 깊게 겹친 정도 (m, 안 겹치면 0 이하)
  const depth = (bx, bz) => {
    let d = 0;
    for (const o of ALL) if (o !== self && o.solid) d = Math.max(d, o.r + BODY_R - Math.hypot(bx - o.x, bz - o.z));
    return d;
  };
  // 벽·분수·나무·다른 몬스터에 막힘. 이미 다른 몬스터와 겹쳐 있으면 더 파고드는 쪽으로는 못 가고 빠져나가는 쪽으로만
  const move = (ax, az, nx, nz) => {
    const inWall = wall(ax, az), d0 = depth(ax, az);
    const ok = (x, z) => (!wall(x, z) || inWall) && depth(x, z) <= d0 + 1e-6;
    if (ok(nx, nz)) return [nx, nz];
    if (ok(nx, az)) return [nx, az];
    if (ok(ax, nz)) return [ax, nz];
    return [ax, az];
  };
  const moveWall = slide(wall); // 벽에만 막힘 (몬스터끼리 밀어낼 때)
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
  mon.root.scale.setScalar(S);
  scene.add(mon.root);
  // 발밑 그림자: 몬스터와 함께 숨고 함께 돈다 (root 가 S배 커져 있으므로 그만큼 나눠서)
  const shadow = new THREE.Mesh(blobGeometry, SHADOW_MAT);
  shadow.name = '그림자';
  shadow.renderOrder = 1;
  shadow.position.y = 0.004 / S;
  mon.root.add(shadow);
  const [shX, shZ] = K.shadow ?? [1, 1];
  const SH = (BODY_R * 1.15) / BLOB_R / S;
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
  let mode = 'route'; // 'route' 제 길 | 'spot' 발견! (멈춰서 놀람) | 'flee' 도망 | 'rage' 화남! (멈춰서 씩씩) | 'chase' 쫓아가 공격
  let spotLeft = 0; // '발견!' 동작이 끝나기까지 남은 시간 (초)
  let fleeT = 0; // 이번에 도망친 시간 (초)
  let fleeRun = 0; // 이번에 달아난 거리 (m)
  let fleeSide = 1; // 막혔을 때 먼저 틀어 볼 쪽 (1 왼쪽 | -1 오른쪽): 한번 정하면 그쪽으로 계속 돌아가 좌우로 갈팡질팡하지 않게
  let angry = false; // 내가 때려서 화가 났는지: 화나면 멀어질 때까지 계속 쫓아와 공격
  let targeting = false; // 나를 공격 대상으로 삼고 있는지 (처음 알아챌 때만 '화남!' 하고, 그동안은 화난 얼굴)
  let rageLeft = 0; // '화남!' 동작이 끝나기까지 남은 시간 (초)
  let attackCool = 0;
  let attackT = -1; // 공격 동작을 시작한 지 (초), 공격 중이 아니면 -1
  let preyId = null; // 쫓는 곤충 번호
  let swatting = false; // 툭툭 치는 중인지
  let taps = 0; // 이번 툭툭에서 앞발이 닿은 횟수
  let tapsAt = swatTaps(0); // 이번 툭툭에서 앞발이 닿는 순간들 (앉은 곤충·나는 곤충이 다름)
  let huntCool = 3 + Math.random() * 3; // 다시 곤충을 노리기까지 남은 시간 (초)
  const HUNTS = !!(K.hunts && prey && onSwat);
  // 합동 모션 (몽당연필·반쪽이)
  let duoTick = -1; // 마지막으로 짝 찾기 주사위를 굴린 시각 (초)
  let myDuo = null; // 지금 하고 있는 합동 모션 (바뀌면 처음부터)
  let duoStep = ''; // 내 차례의 단계 — 연필: 'draw' 낙서 · 'land' 착지 · 'aside' 비켜서기 · 'watch' 구경 / 반쪽이: 'watch' 지켜봄 · 'erase' 지우기 · 'proud' 뿌듯
  let duoT = 0; // 이 단계를 시작한 지 (초)
  let asideX = 0, asideZ = 0; // 연필이 낙서를 마치고 비켜설 자리
  let noErase = 0; // 반쪽이가 하나도 못 지운 채 지난 시간 (초)
  // 사냥 그만두기: 곤충이 날아갔으면 시무룩, 아니면 그냥 제 길로
  const endHunt = (sulk) => {
    preyId = null;
    swatting = false;
    huntCool = HUNT_COOL;
    if (sulk) { mon.play('sulk'); mode = 'sulk'; } else mode = 'route';
  };
  // 쫓을 만한 곤충: 가깝고, 너무 높지 않고, 제 길에서 너무 멀지 않은 것 중 가장 가까운 것
  const findPrey = (tx, tz) => {
    let best = null, bestD = HUNT_SIGHT;
    for (const [id, b] of prey()) {
      if (b.y > HUNT_HIGH || Math.hypot(b.x - tx, b.z - tz) > LEASH) continue;
      const d = Math.hypot(b.x - px, b.z - pz);
      if (d < bestD && !blocked(b.x, b.z)) { bestD = d; best = id; }
    }
    return best;
  };

  // ── 구구 나들이 ──
  // 단계를 차례로: { fly: () => 갈 자리(월드 x·y·z, y 없으면 땅), land, dur, arc } 날아감 · { sit | hover: () => 자리 } 앉아 쉼 · 떠서 기다림
  // · { wait, act } 땅에서 기다림 — 모두 dur 초 또는 until(T) 까지. start() 단계 시작 때 · tick(T) 매 프레임 · bail() 이면 마지막 단계(집으로)로 건너뜀
  let trip = null;
  let air = 0; // 땅에서 떠 있는 높이 (m)
  let tripCool = GUGU_TRIP_COOL * 0.5;
  let tripTick = -1;
  let extraY = 0; // 날개콩이 방방 뛰는 높이 (m)
  let post = null; // 이번 프레임 몬스터 자세 위에 덧씌울 것 (합동 모션 중 날개콩 고개 젖히기·물음표)
  let duoMood = false; // 합동 모션 중 화난 얼굴
  let qMark = null;
  const nBody = kind === 'nalgae' ? mon.root.getObjectByName('몸') : null;
  const core = nBody?.parent;
  const groundAt = (x, z) => groundY(x, z) - curveDrop(x, z);
  const home = () => { const { x, z } = target(); return { x, z }; };
  const stopTrip = () => { trip = null; air = 0; mon.setAir?.(0); };
  const startTrip = (steps) => { trip = { steps, i: 0, t: 0, dur: 0, from: null }; };
  function runTrip(dt) {
    let st = trip.steps[trip.i];
    if (trip.i < trip.steps.length - 1 && st.bail?.()) { trip.i = trip.steps.length - 1; trip.from = null; st = trip.steps[trip.i]; }
    if (!trip.from) { trip.from = { x: px, z: pz, h: air }; trip.t = 0; trip.dur = 0; st.start?.(); }
    trip.t += dt;
    const T = trip.t;
    let mv = 0, br = 0, sh = 0, done;
    if (st.fly) {
      const p = st.fly();
      const f = trip.from;
      const toH = p.y == null ? 0 : p.y - groundAt(p.x, p.z);
      const dist = Math.hypot(p.x - f.x, p.z - f.z);
      if (!trip.dur) trip.dur = st.dur ?? 0.5 + Math.hypot(dist, toH - f.h) / GUGU_FLY;
      if (mon.state !== 'air') mon.play('air');
      const lead = f.h < 0.05 ? 0.2 : 0; // 땅에서 뜰 땐 날개를 짝! 치고 나서 출발
      const k = THREE.MathUtils.clamp((T - lead) / trip.dur, 0, 1), e = sm(k, 0, 1);
      px = f.x + (p.x - f.x) * e;
      pz = f.z + (p.z - f.z) * e;
      air = f.h + (toH - f.h) * e + (st.arc ?? Math.min(0.8, 0.15 + dist * 0.12)) * Math.sin(k * Math.PI);
      if (dist > 0.15) heading += wrap(Math.atan2(p.x - f.x, p.z - f.z) - heading) * Math.min(1, dt * 6);
      mv = Math.sin(k * Math.PI);
      br = st.land ? sm(k, 0.6, 0.95) : 0;
      done = k >= 1;
    } else {
      const p = (st.sit ?? st.hover)?.();
      if (p) { px = p.x; pz = p.z; air = p.y - groundAt(p.x, p.z); }
      if (st.sit && mon.state !== 'perch') mon.play('perch');
      if (st.hover && mon.state !== 'air') mon.play('air');
      if (st.wait && (mon.state === 'air' || mon.state === 'perch' || mon.state === 'walk' || (st.act && mon.state === 'idle'))) mon.play(st.act ?? 'idle');
      if (st.face) heading += wrap(st.face() - heading) * Math.min(1, dt * 6);
      sh = st.shake?.() ?? 0;
      done = st.until ? st.until(T) : T >= st.dur;
    }
    st.tick?.(T);
    mon.setAir(air / S, mv, br, sh, st.down ? 1 : 0);
    if (done) {
      trip.i++;
      trip.from = null;
      if (trip.i >= trip.steps.length) { stopTrip(); mon.play('idle'); tripCool = GUGU_TRIP_COOL; }
    }
  }
  const faceTo = (o) => () => Math.atan2(o.x - px, o.z - pz);
  // 나들이 떠나기: 둘레의 한가한 하악냥(장난) · 날개콩(머리에 앉기) · 나무·캐릭터 머리(perches) 중 하나를 주사위로
  function guguTrip(r) {
    const free = (k, near) => [...ALL].find((o) => o.kind === k && o.free && Date.now() - o.seen < 500 && Math.hypot(o.x - px, o.z - pz) < near);
    const cat = free('haak', CAT_NEAR);
    const nal = free('nalgae', GUGU_REACH);
    const spots = (perches?.() ?? []).filter((o) => Math.hypot(o.x - px, o.z - pz) < GUGU_REACH && o.get());
    const opts = [cat && 'catJump', cat && 'catPounce', nal && 'perch', spots.length && 'spot'].filter(Boolean);
    if (!opts.length) return;
    const pick = opts[Math.floor(r * opts.length)];
    const homeStep = { fly: home, land: true };
    if (pick === 'spot') {
      const spot = spots[Math.floor(((r * 7.3) % 1) * spots.length)];
      let last = spot.get();
      const at = () => (last = spot.get() ?? last);
      startTrip([
        { fly: at, land: true, bail: () => !spot.get() },
        { sit: at, dur: GUGU_SIT[0] + ((r * 13.1) % 1) * (GUGU_SIT[1] - GUGU_SIT[0]), bail: () => !spot.get() }, // 캐릭터가 움직이면 화들짝 날아감
        homeStep,
      ]);
      return;
    }
    const mate = pick === 'perch' ? nal : cat;
    const d = { type: pick, p: self, e: mate, over: false, landed: false, nT: 0, hop: 0, hovering: false, catT: -1 };
    self.duo = mate.duo = d;
    self.free = mate.free = false;
    if (pick === 'perch') {
      // 날개콩 머리에 턱 앉음 → 날개콩이 뭐지? → 깜짝 → 화내며 방방 뛰면 휘청휘청 → 화들짝 날아감
      const head = () => ({ x: mate.x, z: mate.z, y: mate.topY ?? groundAt(mate.x, mate.z) + 0.6 });
      let esc;
      startTrip([
        { fly: head, land: true, bail: () => d.over },
        { sit: head, tick: () => (d.landed = true), shake: () => (d.nT > 1.5 ? 1 : 0), until: () => d.nT >= 3.2, bail: () => d.over },
        { start() { const a = heading + 2; esc = { x: px + Math.sin(a) * 1.8, z: pz + Math.cos(a) * 1.8 }; esc.y = groundAt(esc.x, esc.z) + 1.4; }, fly: () => esc, dur: 0.9 },
        homeStep,
      ]);
    } else if (pick === 'catJump') {
      // 하악냥 머리 위에서 파닥파닥 → 하악냥이 밑으로 와서 폴짝! 앞발 툭 → 닿기 직전 살짝 옆으로 비켜 올라감 → 잠깐 내려다보다 돌아감
      const a0 = Math.atan2(px - mate.x, pz - mate.z);
      const spot = { x: mate.x + Math.sin(a0) * 0.55, z: mate.z + Math.cos(a0) * 0.55 };
      spot.y = groundAt(spot.x, spot.z) + CAT_HOVER;
      let esc;
      startTrip([
        { fly: () => spot, bail: () => d.over },
        { hover: () => spot, down: true, face: faceTo(mate), tick: () => (d.hovering = true), until: () => d.catT >= 0.42, bail: () => d.over },
        { start() { const a = Math.atan2(spot.x - mate.x, spot.z - mate.z) + Math.PI / 2; esc = { x: spot.x + Math.sin(a) * 0.6, z: spot.z + Math.cos(a) * 0.6, y: spot.y + 0.35 }; }, fly: () => esc, dur: 0.32, arc: 0.05, down: true },
        { hover: () => esc, dur: 1.4, down: true, face: faceTo(mate) },
        homeStep,
      ]);
    } else {
      // 땅에서 콕콕 → 하악냥이 살금살금 다가와 웅크렸다 덮침! → 짝! 가볍게 날아올라 피함 → 옆에 사뿐 내려앉아 아무 일 없다는 듯
      let esc, land;
      startTrip([
        { wait: true, act: 'peck', until: () => d.catT >= 0.18, bail: () => d.over },
        { start() { const a = Math.atan2(px - mate.x, pz - mate.z) + 1.2; esc = { x: px + Math.sin(a) * 0.5, z: pz + Math.cos(a) * 0.5 }; esc.y = groundAt(esc.x, esc.z) + 0.75; }, fly: () => esc, dur: 0.45, arc: 0.05, down: true },
        { hover: () => esc, dur: 1.3, down: true, face: faceTo(mate) },
        { start() { const a = Math.atan2(esc.x - mate.x, esc.z - mate.z); land = { x: esc.x + Math.sin(a) * 0.4, z: esc.z + Math.cos(a) * 0.4 }; }, fly: () => land, land: true },
        { wait: true, dur: 0.8 },
        homeStep,
      ]);
    }
  }

  const target = () => {
    const s = scheduleAt(Date.now() / 1000 + phase, K.plan);
    const th = (s.walked * SPEED) / R;
    return { s, th, x: f.x + Math.sin(th) * R, z: f.z + Math.cos(th) * R };
  };

  return {
    root: mon.root,
    // 캐릭터가 지나가지 못하는 둥근 몸 (사라져 있을 때는 없음)
    colliders() {
      return px === null || mon.state === 'gone' || mon.state === 'die' || air > 0.1 ? [] : [{ x: px, z: pz, r: BODY_R }];
    },
    // 휘두르기에 맞았는지 보고, 맞았으면 맞는 동작. hits(때린 사람 자리·방향, 맞을 자리) → 맞았으면 맞은 자리를 돌려줌
    // byMe: 내 캐릭터가 때렸는지 (도망형은 나한테 맞으면 화가 나 나를 쫓아옴) · power: 한 번에 깎는 체력 (지팡이로 기를 다 모아 쏜 큰 볼은 BOLT.big)
    tryHit(ax, az, hits, byMe = false, power = 1) {
      if (px === null || mon.state === 'gone' || mon.state === 'die' || mon.state === 'spawn' || air > GUGU_HIGH) return null; // 높이 날고 있으면 안 닿음
      if (!hits(px, pz)) return null;
      const d = Math.hypot(px - ax, pz - az) || 1;
      kx = ((px - ax) / d) * KNOCK;
      kz = ((pz - az) / d) * KNOCK;
      heading = Math.atan2(ax - px, az - pz); // 때린 쪽을 돌아봄
      hp -= power;
      sinceHit = 0;
      attackT = -1;
      if (byMe && TEMPER === 'flee') angry = true;
      if (hp <= 0) {
        mon.play('die');
        kx *= 0.5;
        kz *= 0.5;
      } else mon.play('hit');
      return { x: px, z: pz, y: 0.07 * S };
    },
    // me: 내 캐릭터 (없으면 아직 입장 전)
    update(dt, me) {
      const { s, th, x: tx, z: tz } = target();
      extraY = 0;
      if (qMark) qMark.visible = false;
      if (!self.duo) duoMood = false;
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

      if (mon.state === 'die' || mon.state === 'gone') angry = targeting = false;
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
      const hostile = TEMPER === 'aggro' || angry;
      // 나를 볼 수 있는지: 가까이 있고, 바라보는 쪽 앞에 있음 (뒤에서 다가가면 모른다)
      // 자는 중엔 눈을 감고 있어서 아주 가까이 와야(발소리) 깸
      const sees = me && (mon.state === 'sleep' ? near < WAKE_NEAR : near < SIGHT && Math.abs(wrap(Math.atan2(me.x - px, me.z - pz) - heading)) < VIEW);
      if (busy || !me) mode = 'route';
      else if (hostile && (mode === 'chase' || mode === 'rage' || angry ? near < CHASE_LOSE : near < AGGRO_SIGHT)) {
        if (!targeting) {
          // 처음 공격 대상으로 알아챔: 멈춰서 '화남!' 하고 나서 쫓아옴 (쫓다가 맞은 뒤에는 바로 다시 쫓음)
          targeting = true;
          mode = 'rage';
          rageLeft = RAGE_TIME;
          mon.play('angry');
        } else if (mode === 'rage') {
          rageLeft -= dt;
          if (rageLeft <= 0) mode = 'chase';
        } else mode = 'chase';
      }
      else if (angry) {
        // 화났는데 너무 멀어짐: 나를 잊고 제 길로 돌아감 (다시 보면 '발견!'부터)
        angry = false;
        mode = 'route';
      }
      else if (TEMPER === 'flee' && !hostile) {
        if (mode === 'spot') {
          // 놀라는 동작이 끝나면 도망
          spotLeft -= dt;
          if (spotLeft <= 0) mode = 'flee';
        } else if (mode === 'flee') {
          // 도망을 마치면 주변을 다시 살핌: 내가 아직 가까이 있으면(뒤에 있어도) 또 '발견!' 하고 도망
          if (near >= FLEE_TO || fleeT >= FLEE_TIME || fleeRun >= FLEE_RUN) mode = near < SIGHT ? 'spotAgain' : 'route';
        }
        const calm = mode !== 'spot' && mode !== 'flee' && mode !== 'spotAgain';
        if (mode === 'spotAgain' || (calm && sees)) {
          if (preyId !== null || mode === 'sulk') { preyId = null; swatting = false; huntCool = HUNT_COOL; } // 사냥하다 나를 보면 깜짝 놀라 도망
          mode = 'spot';
          spotLeft = SPOT_TIME;
          fleeT = 0;
          fleeRun = 0;
          fleeSide = Math.random() < 0.5 ? 1 : -1;
          mon.play('notice');
        } else if (calm && HUNTS && !self.duo) {
          if (mode === 'sulk') { if (mon.state !== 'sulk') { mode = 'route'; huntCool = HUNT_COOL; } }
          else if (mode === 'hunt') {
            const b = prey().get(preyId);
            if (swatting && mon.state !== 'swat') endHunt(true); // 툭툭 끝: 곤충이 날아가서 시무룩
            else if (!b && mon.state !== 'swat') endHunt(true); // 쫓던 곤충이 날아가 버림 (누가 잡았거나 놀라서)
            else if (b && Math.hypot(b.x - tx, b.z - tz) > LEASH && mon.state !== 'swat') endHunt(false); // 너무 멀리 감: 포기
          } else {
            mode = 'route';
            huntCool -= dt;
            const st = mon.state;
            if (huntCool <= 0 && s.name !== 'sleep' && (st === 'idle' || st === 'walk' || st === K.special)) {
              preyId = findPrey(tx, tz);
              if (preyId !== null) { mode = 'hunt'; swatting = false; } else huntCool = 0.5; // 0.5초마다 둘레를 살핌
            }
          }
        } else if (calm) mode = 'route';
      } else mode = 'route';
      if (mode !== 'hunt' && mode !== 'sulk') preyId = null;
      // 합동 모션 중: 아무 일 없으면(제 길로 돌아갈 차례면) 계속하고, 맞거나 나를 보고 놀라는 등 다른 일이 생기면 그만둠
      if (kind === 'gugu') {
        if (trip && busy) { stopTrip(); if (self.duo) endDuo(self.duo); } // 맞으면 나들이 그만
        mode = trip ? 'trip' : 'route';
      } else if (self.duo) {
        if (!busy && (mode === 'route' || mode === 'duo')) mode = 'duo';
        else { endDuo(self.duo); if (mode === 'duo') mode = 'route'; }
      } else if (mode === 'duo') mode = 'route';
      if (mode !== 'duo' && (mon.state === 'doodle' || mon.state === 'scrub')) mon.play('idle'); // 끝없이 도는 합동 동작은 그만두면 바로 멈춤
      // 한가한지: 제 길 가까이에서 걷거나 쉬는 중 (짝이 될 수 있음. 같은 길을 줄지어 따라가며 조금 처질 때도 있어 넉넉히)
      const onRoute = mode === 'route' && !busy && Math.hypot(tx - px, tz - pz) < 0.6 && (mon.state === 'idle' || mon.state === 'walk');
      self.free = onRoute && !self.duo && self.duoCool <= 0;
      self.seen = Date.now();
      self.duoCool -= dt;
      // 구구: 1초마다 주사위를 굴려 나들이를 떠남 (같은 서버 사람들 화면에서 거의 같이)
      tripCool -= dt;
      if (kind === 'gugu' && self.free && tripCool <= 0) {
        const sec = Math.floor(Date.now() / 1000);
        if (sec !== tripTick) {
          tripTick = sec;
          if (dice(sec, Math.round(phase * 10) + 7) < GUGU_TRIP_CHANCE) {
            guguTrip(dice(sec, Math.round(phase * 10) + 99));
            if (trip) mode = 'trip';
          }
        }
      }
      // 몽당연필이 짝을 찾음: 1초마다 주사위를 굴려, 가까이 한가한 반쪽이가 있으면 합동 모션 시작
      if (kind === 'mongdang' && self.free) {
        const sec = Math.floor(Date.now() / 1000);
        if (sec !== duoTick) {
          duoTick = sec;
          let mate = null;
          for (const o of ALL) {
            if (o.kind === 'banjjok' && o.free && Date.now() - o.seen < 500 && Math.hypot(o.x - px, o.z - pz) < DUO_NEAR) { mate = o; break; }
          }
          if (mate && dice(sec, Math.round(phase * 10)) < DUO_CHANCE) {
            const duo = { p: self, e: mate, over: false, t: 0, cx: px, cz: pz, dir: heading, turn: 0, dist: 0, len: 0,
              rng: seeded(sec * 31 + Math.round(phase * 10)), marks: createMarks(scene), drawn: false, cleaned: false };
            self.duo = mate.duo = duo;
            self.free = mate.free = false;
            mode = 'duo';
          }
        }
      }
      for (const m of FADING) m.fade();
      // 제 길에서 너무 멀어지면 그만두고 돌아감
      if ((mode === 'flee' || mode === 'chase' || mode === 'rage') && Math.hypot(tx - px, tz - pz) > (angry || mode === 'flee' ? ANGRY_LEASH : LEASH)) {
        mode = 'route';
        angry = false;
      }
      // 맞는 중(busy)이 아닌데 쫓지 않게 되면 나를 잊음: 다음에 다시 알아채면 또 '화남!'부터
      if (!busy && mode !== 'chase' && mode !== 'rage') targeting = false;
      mon.setMood(targeting || duoMood ? 'angry' : null);

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
      } else if (mon.state === 'attack' && mode !== 'duo') {
        // 공격하는 동안은 제자리에서 나를 바라봄
        if (me) heading += wrap(Math.atan2(me.x - px, me.z - pz) - heading) * Math.min(1, dt * 8);
      } else if (mode === 'rage') {
        // 화가 나서 제자리에서 나를 째려보며 씩씩댐
        if (mon.state === 'walk') mon.play('idle');
        heading += wrap(Math.atan2(me.x - px, me.z - pz) - heading) * Math.min(1, dt * 10);
        lastKey = s.key;
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
          const [nx, nz] = move(px, pz, px + Math.sin(dir) * FLEE_SPEED * RUN * dt, pz + Math.cos(dir) * FLEE_SPEED * RUN * dt);
          fleeRun += Math.hypot(nx - px, nz - pz);
          px = nx;
          pz = nz;
          if (mon.state !== 'walk') mon.play('walk');
          heading += wrap(dir - heading) * Math.min(1, dt * 10);
          legs = 2.2 * RUN; // 다리를 빨리 놀림
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
        const stop = BODY_R + ATTACK_REACH;
        if (near > stop + 0.05) { // 조금 여유를 둬서 닿을 듯 말 듯한 거리에서 계속 걷기만 하지 않게
          // 앞이 막혔으면 옆으로 틀어 돌아서 쫓아옴 (벽·벤치에 몸을 박고 서 있지 않게)
          const step = Math.min(near - stop, CHASE_SPEED * RUN * dt);
          const dir = steer(want, near - stop) ?? want;
          [px, pz] = move(px, pz, px + Math.sin(dir) * step, pz + Math.cos(dir) * step);
          heading += wrap(dir - heading) * Math.min(1, dt * 8);
          if (mon.state !== 'walk') mon.play('walk');
          legs = 1.6 * RUN;
        } else {
          heading += wrap(want - heading) * Math.min(1, dt * 8);
          if (mon.state === 'walk') mon.play('idle');
          if (attackCool <= 0 && Math.abs(wrap(want - heading)) < 0.6) {
            mon.play('attack');
            attackT = 0;
            attackCool = ATTACK_COOL;
          }
        }
        lastKey = s.key;
      } else if (mode === 'hunt') {
        // 곤충 쪽으로 살금살금 다가가서, 닿을 만큼 가까우면 앞발로 툭툭
        const b = prey().get(preyId);
        if (mon.state === 'swat') {
          if (b) heading += wrap(Math.atan2(b.x - px, b.z - pz) - heading) * Math.min(1, dt * 6);
          // 두 번째 툭에 곤충이 놀라 날아감
          if (taps < tapsAt.length && mon.time >= tapsAt[taps]) { taps++; if (taps === tapsAt.length && b) onSwat(preyId, px, pz); }
        } else if (b) {
          const d = Math.hypot(b.x - px, b.z - pz);
          const want = Math.atan2(b.x - px, b.z - pz);
          const stop = BODY_R + HUNT_REACH;
          if (d > stop + 0.05) {
            const step = Math.min(d - stop, HUNT_SPEED * RUN * dt);
            const dir = steer(want, d - stop) ?? want;
            const [nx, nz] = move(px, pz, px + Math.sin(dir) * step, pz + Math.cos(dir) * step);
            const stuck = nx === px && nz === pz;
            px = nx;
            pz = nz;
            if (stuck) { if (mon.state === 'walk') mon.play('idle'); } else if (mon.state !== 'walk') mon.play('walk');
            heading += wrap(dir - heading) * Math.min(1, dt * 8);
            legs = 1.6 * RUN;
          } else {
            if (mon.state === 'walk') mon.play('idle');
            heading += wrap(want - heading) * Math.min(1, dt * 8);
            if (Math.abs(wrap(want - heading)) < 0.4) {
              const by = b.y - groundY(px, pz); // 곤충이 땅에서 얼마나 높이 있나
              // 앉은 곤충은 엎드려 툭툭, 나는 곤충은 웅크렸다가 뛰어올라 툭툭 (높이 날수록 높이 뜀)
              const reach = by > 0.45 ? THREE.MathUtils.clamp((by - 0.45) / 0.9, 0.2, 1) : 0;
              mon.setReach?.(reach);
              tapsAt = swatTaps(reach);
              mon.play('swat');
              swatting = true;
              taps = 0;
            }
          }
        }
        lastKey = s.key;
      } else if (mode === 'sulk') {
        lastKey = s.key; // 시무룩하는 동안은 일정을 따르지 않음
      } else if (mode === 'duo') {
        // 합동 모션: 연필은 물구나무 서서 마구 낙서 → 착지 → 옆으로 비켜 구경 / 반쪽이는 깜짝 놀라 지켜보다가 → 낙서를 따라다니며 박박 지움 → 뿌듯
        const d = self.duo;
        if (myDuo !== d) {
          myDuo = d;
          duoT = 0;
          noErase = 0;
          duoStep = kind === 'mongdang' ? 'draw' : 'watch';
          mon.play(d.type ? 'idle' : kind === 'mongdang' ? 'doodle' : 'notice');
        }
        duoT += dt;
        const turnTo = (a, k = 8) => { heading += wrap(a - heading) * Math.min(1, dt * k); };
        const face = (o) => turnTo(Math.atan2(o.x - px, o.z - pz), 6);
        // (gx, gz)로 걸어감 (막히면 돌아서) → 다 왔으면 true
        const walkTo = (gx, gz, speed, stop = 0.05) => {
          const dist = Math.hypot(gx - px, gz - pz);
          if (dist < stop) return true;
          const want = Math.atan2(gx - px, gz - pz);
          const dir = steer(want, dist) ?? want;
          const step = Math.min(dist - stop * 0.5, speed * dt);
          const [nx, nz] = move(px, pz, px + Math.sin(dir) * step, pz + Math.cos(dir) * step);
          const stuck = nx === px && nz === pz;
          px = nx;
          pz = nz;
          if (stuck) { if (mon.state === 'walk') mon.play('idle'); } else if (mon.state !== 'walk') mon.play('walk');
          turnTo(dir);
          legs = speed / SPEED * 0.7;
          return false;
        };
        if (duoT > 30) endDuo(d); // 혹시 어딘가 끼어 끝나지 않으면 그만둠
        else if (d.type === 'perch') {
          // 날개콩: 머리에 구구가 앉으면 물음표 띄우고 갸웃갸웃 "뭐지?" → 깜짝! → 위를 째려보며 화내고 방방 → 날아간 하늘에 대고 한 번 더 씩씩
          if (mon.state === 'walk') mon.play('idle');
          if (!d.landed) { if (duoT > 10) endDuo(d); } // 구구가 끝내 못 오면 그만
          else {
            d.nT += dt;
            const c = d.nT, at = (x) => c - dt < x && c >= x;
            if (at(1.5)) mon.play('notice');
            if (at(1.9) || at(2.9) || at(4.2)) mon.play('angry');
            duoMood = c > 1.9 && c < 6;
            const huh = sm(c, 0.2, 0.4) * (1 - sm(c, 1.35, 1.5));
            const lookUp = Math.max(huh * 0.35, sm(c, 1.5, 1.8) * (1 - sm(c, 5.5, 6.1)));
            const hops = (c - 2.0) * 2.6; // 방방 횟수 (정수일 때 발이 땅에 닿음)
            const hopping = hops > 0 && hops < 5;
            extraY = hopping ? Math.abs(Math.sin(hops * Math.PI)) * (hops > 2 ? 0.045 : 0.03) * S : 0;
            d.hop = extraY;
            if (c > 3.4) face(d.p); // 날아가는 구구 쪽을 봄
            post = () => {
              if (!qMark) { qMark = questionMark(); mon.root.add(qMark); }
              qMark.visible = huh > 0.01;
              qMark.scale.setScalar(0.06 * huh * (1 + 0.1 * Math.sin(c * 8)));
              qMark.position.set(0.055, 0.17 + Math.sin(c * 4) * 0.004, 0);
              core.rotation.z += Math.sin((c - 0.2) * 3.2) * 0.22 * huh; // 갸웃갸웃
              core.rotation.x = THREE.MathUtils.lerp(core.rotation.x, -0.45, lookUp); // 고개를 젖혀 머리 위를 째려봄
              if (hopping) { mon.root.children[0].position.y += extraY / S; mon.root.rotation.y += Math.sin(c * 9) * 0.15; } // 몸만 띄워 그림자는 땅에 남고 작아짐
            };
            if (c > 6.3) endDuo(d);
          }
        } else if (d.type === 'catJump' || d.type === 'catPounce') {
          // 하악냥: 머리 위 구구 밑으로 가서 폴짝 툭 / 땅의 구구에게 살금살금 다가가 덮침 → 놓치면 시무룩
          const pig = d.p, a = Math.atan2(pig.x - px, pig.z - pz);
          if (d.catT >= 0) {
            d.catT += dt;
            if (!d.sulk && mon.state !== 'swat' && mon.state !== 'attack') { d.sulk = true; mon.play('sulk'); }
            else if (d.sulk && mon.state !== 'sulk') endDuo(d);
            if (d.sulk) face(pig);
          } else if (d.type === 'catJump') {
            if (!d.hovering) { if (mon.state === 'walk') mon.play('idle'); face(pig); d.ready = 0; }
            else {
              d.ready += dt; // 구구가 머리 위에 자리 잡은 뒤 흐른 시간
              if (walkTo(pig.x - Math.sin(a) * 0.28, pig.z - Math.cos(a) * 0.28, 0.8, 0.08)) {
                if (mon.state === 'walk') mon.play('idle');
                turnTo(a);
                if (d.ready > 1.0 && Math.abs(wrap(a - heading)) < 0.3) { mon.setReach?.(0.6); mon.play('swat'); d.catT = 0; }
              }
            }
          } else if (walkTo(pig.x - Math.sin(a) * 0.55, pig.z - Math.cos(a) * 0.55, 0.45, 0.08) && duoT > 1.2) {
            if (mon.state === 'walk') mon.play('idle');
            turnTo(a);
            if (Math.abs(wrap(a - heading)) < 0.2) { mon.play('attack'); d.catT = 0; }
          }
          if (duoT > 15) endDuo(d);
        }
        else if (d.type) { /* 구구 짝은 위에서 함 */ } else if (kind === 'mongdang') {
          if (duoStep === 'draw') {
            if (mon.state !== 'doodle') mon.play('doodle');
            if (duoT > 0.55) {
              // 홱홱 방향을 틀며 끄적끄적. 처음 자리에서 너무 멀어지면 돌아오며 그려서 낙서가 한 군데 몰림
              // 가끔은 뱅글뱅글 고리를 그리고, 가끔은 홱 꺾임
              if (d.rng() < dt * 1.5) d.turn = (d.rng() < 0.5 ? -1 : 1) * (5 + d.rng() * 6);
              d.turn += ((d.rng() - 0.5) * 50 - d.turn * 1.2) * dt;
              d.dir += (d.turn + Math.sin(duoT * 9) * 3) * dt;
              if (Math.hypot(px - d.cx, pz - d.cz) > DOODLE_SPREAD) d.dir += wrap(Math.atan2(d.cx - px, d.cz - pz) - d.dir) * Math.min(1, dt * 5);
              const step = DOODLE_SPEED * dt;
              const nx = px + Math.sin(d.dir) * step, nz = pz + Math.cos(d.dir) * step;
              if (blocked(nx, nz)) d.dir += 2; // 벽·다른 몬스터에 닿으면 홱 돌아섬
              else {
                px = nx;
                pz = nz;
                d.dist += step;
                // 심 끝(물구나무 선 몸 바로 밑)이 지나간 자리에 촘촘히 점을 찍어 선이 되게. 좌우로 박박 그어 지그재그
                while (d.dist >= DOT_GAP) {
                  d.dist -= DOT_GAP;
                  d.len += DOT_GAP;
                  const zig = Math.sin(d.len * ZIG_K) * ZIG;
                  d.marks.add(px - Math.sin(d.dir) * d.dist + Math.cos(d.dir) * zig, pz - Math.cos(d.dir) * d.dist - Math.sin(d.dir) * zig);
                }
              }
              turnTo(d.dir, 10);
            }
            if (duoT > DOODLE_TIME) { duoStep = 'land'; duoT = 0; mon.play('doodleEnd'); }
          } else if (duoStep === 'land') {
            if (mon.state !== 'doodleEnd') {
              // 착지 끝: 반쪽이가 지나갈 길을 비켜 낙서 옆으로 물러남
              d.drawn = true;
              duoStep = 'aside';
              duoT = 0;
              const c = d.marks.center() ?? { x: px, z: pz };
              const side = Math.atan2(c.x - d.e.x, c.z - d.e.z);
              const out = DOODLE_SPREAD + 0.7;
              asideX = px;
              asideZ = pz;
              for (const a of [side + Math.PI / 2, side - Math.PI / 2, side]) {
                const gx = c.x + Math.sin(a) * out, gz = c.z + Math.cos(a) * out;
                if (!wall(gx, gz)) { asideX = gx; asideZ = gz; break; }
              }
            }
          } else if (duoStep === 'aside') {
            if (walkTo(asideX, asideZ, 0.7) || duoT > 4) { duoStep = 'watch'; duoT = 0; if (mon.state === 'walk') mon.play('idle'); }
          } else {
            // 지우는 반쪽이를 구경. 다 지우면 "앗, 내 낙서!" 하고 깜짝
            if (mon.state === 'walk') mon.play('idle');
            face(d.e);
            if (d.cleaned && duoStep === 'watch') { duoStep = 'shock'; mon.play('notice'); }
          }
        } else {
          if (duoStep === 'watch') {
            // 낙서하는 연필을 보고 깜짝 → 계속 쳐다봄
            if (mon.state === 'walk') mon.play('idle');
            face(d.p);
            if (d.drawn) { duoStep = 'erase'; duoT = 0; }
          } else if (duoStep === 'erase') {
            const n = d.marks.nearest(px, pz);
            noErase += dt;
            if (!n || noErase > ERASE_GIVEUP) {
              // 다 지움 (또는 손이 닿지 않아 포기)
              d.cleaned = true;
              duoStep = 'proud';
              duoT = 0;
              mon.play(n ? 'idle' : 'scrubEnd');
            } else {
              const dist = Math.hypot(n.x - px, n.z - pz);
              const scrubbing = mon.state === 'scrub';
              if (dist > SCRUB_REACH + (scrubbing ? 0.2 : 0)) walkTo(n.x, n.z, 0.7, SCRUB_REACH * 0.8); // 멀리 있는 낙서로는 뒤뚱뒤뚱 걸어감
              else {
                // 엎드려 박박 문지르며 낙서를 따라 조금씩 나아감 (몸 앞쪽에 닿은 자국이 슥슥 지워짐)
                if (!scrubbing) { mon.play('scrub'); duoT = 0; }
                const want = Math.atan2(n.x - px, n.z - pz);
                if (dist > 0.12) {
                  const step = Math.min(dist - 0.1, SCRUB_SPEED * dt);
                  [px, pz] = move(px, pz, px + Math.sin(want) * step, pz + Math.cos(want) * step);
                }
                turnTo(want, 3);
                if (duoT > 0.3 && d.marks.erase(px + Math.sin(heading) * 0.1, pz + Math.cos(heading) * 0.1, ERASE_R, dt)) noErase = 0;
              }
            }
          } else if (mon.state !== 'scrubEnd') endDuo(d); // 뿌듯 동작까지 마치면 끝
        }
        lastKey = s.key;
      } else if (mode === 'trip') {
        runTrip(dt);
        lastKey = s.key; // 나들이 동안 지나간 일정은 건너뜀
      } else if (!busy) {
        const gap = Math.hypot(tx - px, tz - pz);
        if (gap > 0.05) {
          // 밀려나거나 도망쳤으면 제 길로 종종걸음으로 돌아감 (분수·벤치 등은 돌아서)
          const step = Math.min(gap, CATCH_UP * dt);
          const toward = Math.atan2(tx - px, tz - pz);
          const dir = steer(toward, gap) ?? toward;
          const [nx, nz] = move(px, pz, px + Math.sin(dir) * step, pz + Math.cos(dir) * step);
          const stuck = nx === px && nz === pz; // 앞을 다른 몬스터가 막고 있으면 제자리에서 기다림
          px = nx;
          pz = nz;
          if (stuck) { if (mon.state === 'walk') mon.play('idle'); } else if (mon.state !== 'walk') mon.play('walk');
          heading += wrap(dir - heading) * Math.min(1, dt * 8);
          lastKey = s.key; // 돌아가는 동안 지나간 일정은 건너뜀
        } else if (hitsMon(tx, tz)) {
          // 일정 자리에 다른 몬스터가 있으면 겹치지 않게 비켜날 때까지 기다림 (여럿이 같은 자리를 노리면 줄지어 따라감)
          if (mon.state === 'walk') mon.play('idle');
        } else {
          px = tx;
          pz = tz;
          if (s.key !== lastKey) {
            // 새 구간: 한 번짜리 동작은 처음부터 볼 때만 틀고, 중간에 들어왔으면 쉬기로 둔다
            const oneShot = s.name !== 'walk' && s.name !== 'idle' && s.name !== 'sleep'; // 낮잠은 중간에 들어와도 바로 잠
            mon.play(oneShot && (lastKey === '' || s.into > 0.4) ? 'idle' : s.name === 'special' ? K.special : s.name);
            lastKey = s.key;
          } else if (s.name === 'walk' && mon.state !== 'walk') {
            mon.play('walk');
          } else if (s.name !== 'walk' && mon.state === 'walk') {
            mon.play(s.name === 'sleep' ? 'sleep' : 'idle');
          } else if (s.name === 'sleep' && mon.state === 'idle') {
            mon.play('sleep'); // 맞거나 놀랐다 돌아와서도 낮잠 시간이면 다시 웅크려 잠
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

      // 그래도 겹쳐 있으면(맞고 밀려났거나 같은 자리에서 다시 나타남) 서로 조금씩 밀어냄. 벽 너머로는 밀리지 않는다
      self.solid = mon.state !== 'gone' && mon.state !== 'die' && air < 0.1; // 날고 있는 구구는 다른 몬스터와 안 부딪힘
      if (self.solid) {
        for (const o of ALL) {
          if (o === self || !o.solid) continue;
          const dx = px - o.x, dz = pz - o.z;
          const d = Math.hypot(dx, dz);
          const over = o.r + BODY_R - d;
          if (over <= 0) continue;
          const k = Math.min(over, over * PUSH * dt + 0.002);
          const a = d > 1e-4 ? Math.atan2(dx, dz) : heading + Math.PI; // 완전히 같은 자리면 뒤로
          [px, pz] = moveWall(px, pz, px + Math.sin(a) * k, pz + Math.cos(a) * k);
        }
      }
      self.x = px;
      self.z = pz;

      mon.root.position.set(px, groundY(px, pz) - curveDrop(px, pz), pz);
      mon.root.rotation.y = heading;
      mon.update(mon.state === 'walk' ? dt * legs : dt, legs); // legs: 달리기 모션이 있는 몬스터(하악냥)는 빨리 갈 때 달림
      post?.();
      post = null;
      if (nBody) { // 날개콩 정수리 높이 (구구가 머리에 앉을 때)
        nBody.getWorldPosition(TMP);
        const y = TMP.y;
        self.topY = y + NALGAE_TOP * TMP.setFromMatrixScale(nBody.matrixWorld).y;
      }
      // 그림자: 몸이 작아지면(펑 사라짐·등장) 같이 작아지고, 뛰어오르면 작아져 높이가 읽힌다
      const b = mon.root.children[0];
      const k = Math.min(1.2, Math.max(0, b.scale.x)) / (1 + b.position.y * S * 0.9);
      shadow.scale.set(SH * shX * k, 1, SH * shZ * k);
      shadow.visible = mon.state !== 'gone' && k > 0.01;
    },
  };
}
