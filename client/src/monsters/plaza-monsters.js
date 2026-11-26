// 광장·들판에 소환하는 쪼렙 몬스터 (날개콩·몽당연필·반쪽이·하악냥·구구): 정해진 자리를 빙 돌며 걷기·쉬기·특기(날기 시도·물구나무 낙서·박박 문지르기)·두리번을 되풀이한다.
// 가야 할 자리와 동작을 시계(Date.now)로 정하므로, 같은 서버에 들어온 사람들 화면에서 거의 같은 자리·같은 동작으로 보인다.
// 맞는 판정도 (모두의 화면에 똑같이 보이는) 휘두르는 사람의 자리·방향으로 정하므로, 누가 때려도 모두의 화면에서 함께 맞는다.
// (서버가 따로 몬스터를 관리하지 않는 맛보기용. 가까이 다가가면 내 화면에서만 깜짝 놀란다)
import { PLAZA, WORLD, FIELD_MAP } from '../../../shared/world.js';
import * as THREE from 'three';
import { curveDrop, blobGeometry } from '../materials.js';
import { createNalgaekong } from './nalgaekong.js';
import { createMongdang } from './mongdang.js';
import { createBanjjok } from './banjjok.js';
import { createHaaknyang, swatTaps } from './haaknyang.js';
import { createGugu } from './gugu.js';
import { createKkakkak, KKAK_JAB } from './kkakkak.js';
import { createKkreyong } from './kkreyong.js';
import { canvasTexture } from '../villager/textures.js';
import { syncToon, batchRigid } from '../villager/toon.js';

// 몬스터 종류: 만드는 함수 · 몸 반지름(시안 크기) · 일정의 특기 칸에 하는 동작 · 기본 성격 · size(크기 배율, 없으면 1) · shadow(발밑 그림자 좌우·앞뒤 배율, 없으면 동그랗게)
// 성격(temper): 캐릭터를 발견했을 때 어떻게 하는지
//   'flee'    도망형: 일정 거리까지 도망감. 나한테 맞으면 화가 나서 쫓아와 공격
//   'neutral' 중립형: 별다른 행동 없이 제 할 일만 함
//   'aggro'   공격형: 다가와서 공격
const KINDS = {
  nalgae: { create: createNalgaekong, r: 0.065, special: 'flutter', temper: 'neutral' },
  mongdang: { create: createMongdang, r: 0.042, special: 'scribble', temper: 'neutral' },
  banjjok: { create: createBanjjok, r: 0.04, special: 'rub', temper: 'neutral', size: 1.35, shadow: [1, 0.62] }, // 납작해서 조금 크게 · 그림자는 길쭉하게 · 몸통박치기도 0.47초에 닿음
  haak: { create: createHaaknyang, r: 0.033, special: 'groom', temper: 'flee', run: 1.5, size: 1.15, shadow: [0.75, 1.15], hunts: true, // 둘레 곤충을 쫓아가 툭툭 침
    // 고양이답게: 돌아다니기보다 한 자리에서 오래 낮잠 자고 그루밍하다가, 가끔 조금 걸어 자리를 옮김
    plan: [['walk', 2.5], ['idle', 2], ['special', 2.7], ['special', 2.7], ['sleep', 20], ['idle', 2.5], ['special', 2.7], ['walk', 2], ['idle', 4], ['sleep', 14], ['idle', 2]] }, // 하악냥: 앞뒤로 길쭉해서 그림자도 앞뒤로 · 덮치기도 0.47초에 닿음
  // 구구(비둘기): 중립형이라 사람을 봐도 제 할 일만. 뒤뚱뒤뚱 걷다 모이 콕콕, 가끔 짝! 날아올랐다 내려앉음 · 하악냥보다 작게
  gugu: { create: createGugu, r: 0.03, special: 'peck', temper: 'neutral', size: 0.75, shadow: [0.8, 1.1],
    plan: [['walk', 4], ['idle', 2.5], ['special', 2], ['walk', 3], ['special', 2], ['fly', 3.4], ['idle', 2], ['walk', 5], ['special', 2], ['idle', 3]], flies: {} },
  // 깍깍이(까치): 중립형 깡패. 깡총깡총 다니며 깍깍, 사람은 본 척도 안 함 (몬스터들만 괴롭힘). 구구처럼 나들이를 다니는데 더 높이·멀리·자주
  kkakkak: { create: createKkakkak, r: 0.03, special: 'caw', temper: 'neutral', size: 0.85, shadow: [0.8, 1.2],
    plan: [['walk', 3], ['idle', 2.5], ['special', 3], ['walk', 4], ['idle', 2], ['walk', 3], ['special', 3], ['idle', 2.5]],
    flies: { speed: 3.4, chance: 0.1, cool: 7, far: 0.5, farDist: [20, 34], farArc: 5, nearArc: 1.0 } }, // 나들이 설정 (없는 값은 구구 값)
  // 끄레용(크레파스): 중립형. 콩콩 다니다 물구나무 서서 바닥에 빙글빙글 낙서, 가만히 있으면 종이옷이 줄줄 흘러내림
  kkreyong: { create: createKkreyong, r: 0.025, special: 'scribble', temper: 'neutral', size: 1.3 },
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
const GUGU_FAR = 0.25; // 나들이 가운데 멀리 날아가 다른 곳에서 한동안 놀다 오는 비율
const GUGU_FAR_DIST = [12, 20]; // 그때 날아가는 거리 (m, 이 사이)
const GUGU_HIGH = 0.3; // 이보다 높이 떠 있으면 휘둘러도 안 맞음 (m)
const CAT_NEAR = 4; // 하악냥이 이만큼 안에 있어야 장난을 검 (m)
// 깍깍이 합동 (괴롭히기·쫓아내기·시비): 깍깍이 크기 기준 (마을에선 S배)
const KK_GAP = 0.069; // 날개콩 옆에서 쫄 때 날개콩 가운데까지
const KK_CAT_GAP = 0.097; // 하악냥 앞에서 쫄 때 하악냥 가운데까지
const KK_BACK = 0.069; // 머리를 위에서 쫄 때 정수리에서 이만큼 뒤에 떠서 (몸을 숙이면 부리가 앞으로 나감)
const KK_DROP = 0.039; // 그때 발이 정수리보다 이만큼 아래 (부리가 몸보다 위에 있어서)
const HAAK_HEAD_R = 0.0288; // 하악냥 머리 공 반지름 (하악냥 크기 기준): 깍깍이가 정수리를 쫌
const CAT_HOVER = 0.9; // 하악냥 머리 위에서 파닥이는 높이 (m): 폴짝 뛰면 앞발이 닿을락 말락
const NALGAE_TOP = 0.0618; // 날개콩 몸 공 가운데에서 정수리까지 (날개콩 크기 기준)
const sm = (x, a, b) => THREE.MathUtils.smoothstep(x, a, b);
// 구구가 날 때 넘어가야 하는 것들: 둥근 기둥 { x, z, r, top(땅에서 높이 m) } — 나무는 잎까지, 바위, 분수·벤치·가로등·표지판·포탈 기둥
// shortcut: 높이는 모양별 어림값(나무 잎 덩어리 크기 1.3·높이 3.9 × 크기), 새 물체를 마을에 놓으면 여기도 넣어야 함
// (들판 나무·바위는 WORLD.trees·rocks 뒤에 붙어 있다. 부딪힘 목록은 마을·들판 따로, 앞쪽 나무·바위 몫을 건너뛴다)
const SKY = [
  ...WORLD.trees.map((t) => ({ x: t.x, z: t.z, r: 1.3 * t.s, top: 3.9 * t.s })),
  ...WORLD.rocks.map((o) => ({ x: o.x, z: o.z, r: 0.9 * o.s, top: 0.8 * o.s })),
  ...[...WORLD.colliders.slice(FIELD_MAP.base.trees + FIELD_MAP.base.rocks), ...FIELD_MAP.colliders.slice(FIELD_MAP.trees.length + FIELD_MAP.rocks.length)]
    .map((c) => ({ x: c.x, z: c.z, r: c.r + 0.2, top: c.h ? c.h + 0.1 : c.r >= 1 ? 2.2 : c.r >= 0.5 ? 0.8 : 2.8 })),
];
const GUGU_CLEAR = 0.3; // 물체 위를 이만큼 띄워 넘어감 (m)
// 직선으로 날 때 물체를 뚫지 않으려면 포물선 꼭대기(arc)가 얼마나 높아야 하나 (출발·도착 자리를 덮는 물체 = 앉을 나무 등은 뺌)
function clearArc(f, p, h0, h1, arc) {
  const ends = SKY.filter((o) => Math.hypot(o.x - f.x, o.z - f.z) < o.r || Math.hypot(o.x - p.x, o.z - p.z) < o.r);
  for (let i = 1; i < 24; i++) {
    const k = i / 24, e = sm(k, 0, 1);
    const x = f.x + (p.x - f.x) * e, z = f.z + (p.z - f.z) * e;
    let need = 0;
    for (const o of SKY) if (!ends.includes(o) && Math.hypot(o.x - x, o.z - z) < o.r + 0.15) need = Math.max(need, o.top + GUGU_CLEAR);
    if (need) arc = Math.max(arc, (need - (h0 + (h1 - h0) * e)) / Math.max(0.3, Math.sin(k * Math.PI)));
  }
  return Math.min(arc, 6);
}
console.assert(clearArc({ x: 1e4, z: 0 }, { x: 1e4, z: 1 }, 0, 0, 0.2) === 0.2, 'clearArc: 아무것도 없으면 그대로');
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
const BLEND = 0.18; // 동작이 바뀔 때 앞 자세에서 새 동작으로 이만큼(초)에 걸쳐 스르륵 넘어감 (물구나무 → 맞음처럼 자세가 툭 튀지 않게)
const TURN_MAX = 9; // 몸이 보이게 도는 가장 빠른 빠르기 (라디안/초): 방향을 홱 틀어도 한 프레임에 확 돌아 보이지 않게
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
// 다른 합동 모션 (모두 시안 크기가 아니라 마을 크기 m)
const SEED_GAP = 0.09; // 몽당연필이 모이처럼 콕콕 찍는 점 사이 거리 (m)
const PRINT_GAP = 0.11; // 구구 발자국 사이 거리 (m)
const PRINT_ROUNDS = 3; // 구구가 발자국을 남기러 걸어가는 횟수: 세 번째를 다 지우면 반쪽이가 화냄
const GUGU_WALK = 0.35; // 구구가 땅에서 걷는 빠르기 (m/s)
const BANJJOK_TOP = 0.02; // 반쪽이 몸 가운데에서 윗면까지 (반쪽이 크기 기준): 날개콩이 올라섬
// 내가 먼저 짝을 찾는 합동 모션: 내 종류 → [짝 종류, 합동 이름, 짝이 낮잠 자는 중이어야 하는지] (구구 짝은 구구 나들이에서 찾음)
const DUO_PAIRS = {
  mongdang: [['banjjok', 'scrub'], ['haak', 'tip'], ['nalgae', 'wings']],
  banjjok: [['nalgae', 'lift'], ['haak', 'nap', true]],
  kkreyong: [['nalgae', 'picture'], ['haak', 'poke'], ['mongdang', 'color'], ['banjjok', 'smear'], ['gugu', 'paint']], // 깍깍이 짝(peel)은 깍깍이 나들이에서
};
// ── 끄레용 합동 (그림 그려 주기 · 하악냥 툭툭 · 몽당연필 그림 색칠 · 반쪽이가 지우다 번짐 · 구구 배 칠하기 · 깍깍이가 종이옷 벗겨 감) ──
const KK_DUOS = new Set(['picture', 'poke', 'color', 'smear', 'paint', 'peel']);
const CRAYON = 0x5b8ff0;
// 땅 자국: [첫째 marks, 둘째 marks2] 설정 — color: 연필 테두리 + 크레파스 색칠 · smear: 크레파스 낙서 + 지우개로 번진 얼룩
const KK_MARKS = { picture: [{ color: CRAYON }], color: [{}, { color: CRAYON, r: 0.03 }], smear: [{ color: CRAYON }, { color: 0xb8cdf2, r: 0.055 }] };
const FILL_GAP = 0.02; // 색칠 점 사이 (m)
const PAINT_TIME = 5; // 구구 배를 다 칠하는 데 (초)
const KK_PEEL_GAP = 0.075; // 깍깍이가 끄레용 옆에 내려앉는 거리 (깍깍이 크기 기준)
// 고리 하나: 가운데 (cx, cz) · 반지름 rx·rz · a0 에서 시작 (첫 점은 펜을 들고 감)
const ring = (cx, cz, rx, rz, a0, n) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (i / n) * Math.PI * 2; return { x: cx + Math.cos(a) * rx, z: cz + Math.sin(a) * rz, pen: i > 0 }; });
// 날개콩 그림 (가운데 기준 x 옆·z 앞, m): 콩 몸 → 왼날개 → 오른날개 → 눈 둘
const PICTURE = (() => {
  const RX = 0.34, RZ = 0.27, WR = 0.12;
  return [...ring(0, 0, RX, RZ, Math.PI, 60), ...ring(-RX - WR, 0, WR, WR * 1.3, 0, 30), ...ring(RX + WR, 0, WR, WR * 1.3, Math.PI, 30),
    ...ring(-0.1, -0.07, 0.035, 0.035, 0, 12), ...ring(0.1, -0.07, 0.035, 0.035, 0, 12)];
})();
// 몽당연필이 그리는 테두리 (반지름 1 언저리, 각도 a → x·z): 동그라미 · 하트 · 별 · 꽃
const SHAPES = [
  (a) => [Math.cos(a), Math.sin(a)],
  (a) => [Math.sin(a) ** 3, 0.2 - (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 16],
  (a) => {
    const k = (a / (Math.PI * 2)) * 10, i = Math.floor(k), f = k - i;
    const v = (j) => { const r = j % 2 ? 0.45 : 1.05, b = (j / 10) * Math.PI * 2 - Math.PI / 2; return [Math.cos(b) * r, Math.sin(b) * r]; };
    const p = v(i), q = v(i + 1);
    return [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
  },
  (a) => { const r = 0.62 + 0.38 * Math.abs(Math.cos(2.5 * a)); return [Math.cos(a) * r, Math.sin(a) * r]; },
];
// 모양 테두리 길과 그 안을 바깥부터 빙글빙글 메우는 색칠 길 (가운데 cx·cz, 크기 R m)
function shapePaths(shape, cx, cz, R) {
  const edge = Array.from({ length: 121 }, (_, i) => { const [x, z] = shape((i / 120) * Math.PI * 2); return { x: cx + x * R, z: cz + z * R, pen: i > 0 }; });
  const BINS = 72, rad = new Array(BINS).fill(0); // 각도마다 테두리까지 거리
  for (let i = 0; i < 360; i++) {
    const [x, z] = shape((i / 360) * Math.PI * 2), b = Math.floor((Math.atan2(z, x) / (Math.PI * 2) + 1) * BINS) % BINS;
    rad[b] = Math.max(rad[b], Math.hypot(x, z));
  }
  for (let i = 0; i < BINS; i++) if (!rad[i]) rad[i] = rad[(i + 1) % BINS] || rad[(i + BINS - 1) % BINS];
  const fill = Array.from({ length: 301 }, (_, i) => {
    const s = i / 300, a = s * Math.PI * 2 * 5, b = Math.floor(((a / (Math.PI * 2)) % 1) * BINS) % BINS, r = (rad[b] * 0.82 * (1 - s) + 0.04) * R;
    return { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, pen: i > 0 };
  });
  return { edge, fill };
}
console.assert(shapePaths(SHAPES[0], 0, 0, 1).fill[0].x > 0.8 && Math.abs(shapePaths(SHAPES[2], 0, 0, 1).edge[0].z + 1.05) < 1e-9, 'shapePaths: 바깥에서 시작 · 별은 위 꼭짓점부터');
// 반쪽이가 지울 크레파스 낙서: 앞으로 나아가며 빙글빙글 (끄레용 기준 x 옆·z 앞, m)
const SCRIBBLE = Array.from({ length: 91 }, (_, i) => { const s = i / 90, a = s * Math.PI * 2 * 5; return { x: Math.cos(a) * 0.14, z: 0.2 + s * 0.8 + Math.sin(a) * 0.16, pen: i > 0 }; });
// 크기 기준 길을 (cx, cz) 에서 h 쪽(앞)을 보게 놓음
const place = (path, cx, cz, h) => {
  const fx = Math.sin(h), fz = Math.cos(h), rx = Math.cos(h), rz = -Math.sin(h);
  return path.map((p) => ({ x: cx + rx * p.x + fx * p.z, z: cz + rz * p.x + fz * p.z, pen: p.pen }));
};
// 구구 배에 칠하는 크레파스 (구구 몸 기준, 시안과 같음)
const PAINT_COLS = 20, PAINT_ROWS = 12;
let paintMat = null;
const paintMaterial = () => (paintMat ??= new THREE.MeshBasicMaterial({
  transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
  map: canvasTexture('pigeonPaint', 128, 128, (c, w, h) => {
    let s = 7;
    const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    c.lineCap = 'round';
    for (let i = 0; i < 90; i++) { // 비스듬히 박박 칠한 결
      c.strokeStyle = `rgba(70,120,230,${0.65 + r() * 0.35})`;
      c.lineWidth = 5 + r() * 6;
      const x = r() * w * 1.4 - w * 0.2, y = r() * h;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + 30 + r() * 20, y - 12 - r() * 10); c.stroke();
    }
    c.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(0,0,0,${0.2 + r() * 0.5})`; c.fillRect(r() * w, r() * h, 1 + r(), 1); }
  }),
}));
// 날개콩 머리 위에 퐁퐁 뜨는 하트
const heartMark = () => {
  const q = new THREE.Sprite(new THREE.SpriteMaterial({
    transparent: true, depthWrite: false, depthTest: false,
    map: canvasTexture('monsterHeart', 128, 128, (g, w, h) => {
      g.beginPath();
      g.moveTo(w / 2, h * 0.86);
      g.bezierCurveTo(w * 0.05, h * 0.55, w * 0.1, h * 0.12, w / 2, h * 0.32);
      g.bezierCurveTo(w * 0.9, h * 0.12, w * 0.95, h * 0.55, w / 2, h * 0.86);
      g.lineJoin = 'round';
      g.lineWidth = 12;
      g.strokeStyle = '#4a3525';
      g.stroke();
      g.fillStyle = '#ff6f91';
      g.fill();
    }),
  }));
  q.renderOrder = 2;
  return q;
};
// 몽당연필 물구나무 낙서 모양: [점 사이, 좌우 지그재그 폭, 그리는 시간(초), 처음 자리에서 퍼지는 거리]
const DRAW = { scrub: [DOT_GAP, ZIG, DOODLE_TIME, DOODLE_SPREAD], seed: [SEED_GAP, 0, 4.2, 0.5], tip: [DOT_GAP, ZIG, 9, DOODLE_SPREAD] };
// 날개콩 양옆 땅에 그리는 날개 한 짝 (날개콩 기준 x 옆·z 앞, m) — 어깨는 두 몸이 닿는 거리(약 0.54) 밖이라 연필이 걸어가 닿을 수 있음: 어깨에서 바깥 위로 뻗어 뾰족한 끝 → 아래쪽은 깃털 끝 네 개가 톱니처럼
function wingPath(s) {
  const pts = [];
  for (let i = 0; i <= 24; i++) { const u = i / 24; pts.push({ x: s * (0.62 + 0.98 * u), z: 0.05 + 0.6 * u + 0.18 * Math.sin(Math.PI * u), pen: i > 0 }); }
  for (let i = 1; i <= 40; i++) {
    const v = i / 40;
    pts.push({ x: s * (1.6 - 0.98 * v), z: 0.65 - 0.6 * v - 0.3 * Math.sin(Math.PI * v) - 0.2 * Math.abs(Math.sin(4 * Math.PI * v)) * (1 - 0.4 * v), pen: true });
  }
  return pts;
}
const WINGS = [...wingPath(1), { x: 0, z: -0.7, pen: false }, ...wingPath(-1)]; // 오른쪽 날개 → (펜 들고) 뒤로 돌아 → 왼쪽 날개
console.assert(WINGS.length === 131 && Math.abs(WINGS[64].x - 0.62) < 1e-9 && Math.abs(WINGS[64].z - 0.05) < 1e-9, 'WINGS: 어깨에서 시작해 어깨로 돌아옴');
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
function createMarks(scene, { color = 0x45454e, r: dotR = DOT_R } = {}) {
  const MAX = 900;
  const mat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
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
      const r = dotR * (0.85 + Math.random() * 0.3); // 연필 자국 굵기가 조금씩 다르게
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
  duo.marks2?.fadeOut();
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
  // 나는 종류(구구·깍깍이)의 나들이: 빠르기 · 1초마다 떠날 확률 · 다녀온 뒤 쉬는 시간 · 멀리 가는 비율·거리·높이 · 가까운 곳 갈 때 높이
  const FLY = K.flies && { speed: GUGU_FLY, chance: GUGU_TRIP_CHANCE, cool: GUGU_TRIP_COOL, far: GUGU_FAR, farDist: GUGU_FAR_DIST, farArc: 3, nearArc: 0.8, ...K.flies };
  const S = SCALE * (K.size ?? 1); // 이 몬스터의 크기
  const BODY_R = K.r * S; // 몸 반지름 (m): 캐릭터가 이 안으로 지나가지 못한다
  // 다른 몬스터 몸과 겹치는 자리인지 (몬스터끼리도 서로 통과하지 못한다)
  // kind·free·seen·duo·duoCool: 합동 모션 짝 찾기용 (free: 제 길을 따라 한가하게 걷거나 쉬는 중 · seen: 마지막으로 움직인 시각)
  const self = { x: 0, z: 0, r: BODY_R, solid: false, kind, free: false, seen: 0, duo: null, duoCool: DUO_COOL * 0.4, napping: false, h: 0 };
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
  // 부품을 재질마다 한 메시로 묶어 그리기 횟수를 줄인다 (묶은 메시는 스스로 화면 밖인지 못 가리므로 main 이 batches 를 숨긴다)
  syncToon(mon.root, true, OUTLINE_SCALE);
  mon.root.userData.batches = batchRigid(mon.root);
  // 동작이 바뀌면 바로 앞 자세를 적어 두고, 새 동작 자세로 BLEND 초 동안 이어 붙임 (나는 종류는 스스로 이어 붙임)
  // 나타나기·사라지기(spawn·gone)는 크기가 0에서/0으로 가는 동작이라 이어 붙이지 않음
  const poseNodes = [];
  if (!K.flies) mon.root.children[0].traverse((o) => poseNodes.push(o));
  const poseBuf = new Float32Array(poseNodes.length * 10);
  let blendT = BLEND;
  const play0 = mon.play;
  mon.play = (name) => {
    if (poseNodes.length && name !== mon.state && name !== 'spawn' && name !== 'gone' && mon.state !== 'gone' && mon.state !== 'spawn') {
      poseNodes.forEach((o, i) => { o.position.toArray(poseBuf, i * 10); o.quaternion.toArray(poseBuf, i * 10 + 3); o.scale.toArray(poseBuf, i * 10 + 7); });
      blendT = 0;
    }
    play0(name);
  };
  const BV = new THREE.Vector3(), BQ = new THREE.Quaternion();
  const blendPose = (dt) => {
    if (blendT >= BLEND) return;
    blendT += dt;
    const k = sm(blendT, 0, BLEND);
    poseNodes.forEach((o, i) => {
      BV.copy(o.position); o.position.fromArray(poseBuf, i * 10).lerp(BV, k);
      BQ.copy(o.quaternion); o.quaternion.fromArray(poseBuf, i * 10 + 3).slerp(BQ, k);
      BV.copy(o.scale); o.scale.fromArray(poseBuf, i * 10 + 7).lerp(BV, k);
    });
  };
  // 걷다가 막히면 제자리에서 기다림: 한 프레임 막혔다 풀렸다 할 때마다 걷기↔쉬기가 깜빡이지 않게 잠깐 막힌 건 걷던 대로 둠
  let stuckT = 0;
  const stepLegs = (stuck, dt) => {
    stuckT = stuck ? stuckT + dt : 0;
    if (stuckT > 0.25) { if (mon.state === 'walk') mon.play('idle'); } else if (!stuck && mon.state !== 'walk') mon.play('walk');
  };
  let shownH = 0; // 보이는 방향 (heading 을 TURN_MAX 빠르기 넘지 않게 따라감)
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
  // 합동 모션 (구구 짝 말고 모두)
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
  let frameDt = 1 / 60; // 이번 프레임 시간 (깍깍이가 머리 위를 부드럽게 따라갈 때)
  let air = 0; // 땅에서 떠 있는 높이 (m)
  let tripCool = (FLY?.cool ?? 0) * 0.5;
  let tripTick = -1;
  let extraY = 0; // 날개콩이 방방 뛰는 높이 (m)
  let post = null; // 이번 프레임 몬스터 자세 위에 덧씌울 것 (합동 모션 중 날개콩 고개 젖히기·물음표)
  let duoMood = false; // 합동 모션 중 화난 얼굴
  let qMark = null;
  const nBody = kind === 'nalgae' ? mon.root.getObjectByName('몸') : null;
  const core = nBody?.parent;
  const bBody = kind === 'banjjok' ? mon.root.getObjectByName('몸') : null;
  const hHead = kind === 'haak' ? mon.root.getObjectByName('머리') : null;
  const gBody = kind === 'gugu' ? mon.root.getObjectByName('몸')?.parent : null; // 구구 몸통 (끄레용이 배를 칠함)
  let paint = null, paintHold = 0; // 구구 배 칠 · 남은 시간 (초)
  const kBeak = kind === 'kkakkak' ? mon.root.getObjectByName('부리') : null;
  let carry = null; // 깍깍이가 문 끄레용 종이옷 { m, fall (떨어뜨린 지 초, 물고 있으면 null), d }
  if (kind === 'kkreyong') self.makeWrapper = mon.makeWrapper;
  let hearts = null;
  // 날개콩 머리 위 하트 셋 (c: 시작한 지 초)
  const showHearts = (c) => {
    hearts ??= [0, 1, 2].map(() => { const h = heartMark(); mon.root.add(h); return h; });
    hearts.forEach((h, i) => {
      const k = THREE.MathUtils.clamp((c - i * 0.3) / 1.0, 0, 1);
      h.visible = k > 0 && k < 1;
      h.scale.setScalar(((0.035 * Math.sin(k * Math.PI) * 1.2 * SCALE) / S) || 1e-6);
      h.position.set(((i - 1) * 0.03 * SCALE) / S, 0.17 + k * 0.07, 0);
    });
  };
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
      if (!trip.dur) {
        trip.arc = clearArc(f, p, f.h, toH, st.arc ?? Math.min(FLY.nearArc, 0.15 + dist * 0.12));
        trip.dur = st.dur ?? 0.5 + Math.hypot(dist, toH - f.h, trip.arc) / FLY.speed; // 높이 넘어가면 그만큼 오래
      }
      if (mon.state !== 'air') mon.play('air');
      const lead = f.h < 0.05 ? 0.2 : 0; // 땅에서 뜰 땐 날개를 짝! 치고 나서 출발
      const k = THREE.MathUtils.clamp((T - lead) / trip.dur, 0, 1), e = sm(k, 0, 1);
      px = f.x + (p.x - f.x) * e;
      pz = f.z + (p.z - f.z) * e;
      air = f.h + (toH - f.h) * e + trip.arc * Math.sin(e * Math.PI); // 같은 길을 천천히 떠서 사뿐 내려앉게 (위로 툭 튀어 오르지 않게)
      if (dist > 0.15) heading += wrap(Math.atan2(p.x - f.x, p.z - f.z) - heading) * Math.min(1, dt * 6);
      mv = Math.sin(k * Math.PI);
      br = st.land ? sm(k, 0.6, 0.95) : 0;
      done = k >= 1;
    } else if (st.walk) {
      // 땅에서 뒤뚱뒤뚱 걸어감 (막히면 dur 초에 그만)
      const p = st.walk();
      const dist = Math.hypot(p.x - px, p.z - pz);
      if (dist > 0.03) {
        const a = Math.atan2(p.x - px, p.z - pz), step = Math.min(dist, GUGU_WALK * dt);
        [px, pz] = move(px, pz, px + Math.sin(a) * step, pz + Math.cos(a) * step);
        heading += wrap(a - heading) * Math.min(1, dt * 8);
        if (mon.state !== 'walk') mon.play('walk');
      }
      air = 0;
      done = dist <= 0.03 || T >= (st.dur ?? Infinity);
    } else {
      const p = (st.sit ?? st.hover)?.();
      if (p) { px = p.x; pz = p.z; air = p.y - groundAt(p.x, p.z); }
      if (st.sit && mon.state !== 'perch') mon.play('perch');
      if (st.hover && mon.state !== 'air' && mon.state !== 'jab') mon.play('air');
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
      if (trip.i >= trip.steps.length) { stopTrip(); mon.play('idle'); tripCool = FLY.cool; }
    }
  }
  const faceTo = (o) => () => Math.atan2(o.x - px, o.z - pz);
  // 머리 위 물음표 (k: 0~1 크기, y: 몬스터 크기 기준 높이, c: 흔들 시계) — 몬스터가 커도 물음표 크기는 같게
  const showQ = (k, y, c) => {
    if (!qMark) { qMark = questionMark(); mon.root.add(qMark); }
    qMark.visible = k > 0.01;
    qMark.scale.setScalar(0.06 * k * (1 + 0.1 * Math.sin(c * 8)) * SCALE / S);
    qMark.position.set(0.055 * SCALE / S, y + Math.sin(c * 4) * 0.004, 0);
  };
  // 멀리 나들이: 높이 날아 멀리 내려앉아 쪼고 두리번거리고 콩콩 옮겨 다니다가 다시 날아 돌아옴
  function farTrip(r) {
    let at = null;
    for (let i = 0; i < 8 && !at; i++) {
      const a = (r + i * 0.381) * Math.PI * 2;
      const d = FLY.farDist[0] + ((r * 7.7 + i * 0.53) % 1) * (FLY.farDist[1] - FLY.farDist[0]);
      const x = px + Math.sin(a) * d, z = pz + Math.cos(a) * d;
      if (!wall(x, z) && !wall((px + x) / 2, (pz + z) / 2)) at = { x, z }; // 맵 밖·벽 속에는 안 내림
    }
    if (!at) return;
    const a = r * 9.1;
    const hop = { x: at.x + Math.sin(a) * 1.4, z: at.z + Math.cos(a) * 1.4 };
    const there = wall(hop.x, hop.z) ? at : hop;
    startTrip([
      { fly: () => at, land: true, arc: FLY.farArc },
      { wait: true, dur: 2.5 },
      { wait: true, act: 'peck', dur: 2 },
      { fly: () => there, land: true, arc: 0.3 },
      { wait: true, act: 'peck', dur: 2 },
      { wait: true, dur: 3 + ((r * 5.3) % 1) * 4 },
      { fly: home, land: true, arc: FLY.farArc },
    ]);
  }
  // 나들이 떠나기: 둘레의 한가한 하악냥(장난) · 날개콩(머리에 앉기) · 나무·캐릭터 머리(perches) 중 하나를 주사위로
  function guguTrip(r) {
    if (r < FLY.far) { farTrip(r / FLY.far); return; }
    r = (r - FLY.far) / (1 - FLY.far);
    const free = (k, near) => (kind === 'gugu' || kind === 'kkakkak') && [...ALL].find((o) => o.kind === k && o.free && Date.now() - o.seen < 500 && Math.hypot(o.x - px, o.z - pz) < near); // 날개콩·하악냥과의 장난은 구구만
    const cat = free('haak', CAT_NEAR);
    const nal = free('nalgae', GUGU_REACH);
    const ban = free('banjjok', DUO_NEAR);
    const pen = free('mongdang', GUGU_REACH);
    const spots = (perches?.() ?? []).filter((o) => Math.hypot(o.x - px, o.z - pz) < GUGU_REACH && o.get());
    const pig = kind === 'kkakkak' && free('gugu', GUGU_REACH);
    const cray = kind === 'kkakkak' && free('kkreyong', GUGU_REACH);
    const opts = (kind === 'kkakkak' ? [nal && 'bully', nal && 'headPeck', cat && 'fight', pig && 'shoo', cray && 'peel', spots.length && 'spot']
      : [cat && 'catJump', cat && 'catPounce', nal && 'perch', spots.length && 'spot', ban && 'prints', pen && 'seed']).filter(Boolean);
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
    if (kind === 'kkakkak') { kkakkakDuo(pick, { bully: nal, headPeck: nal, fight: cat, shoo: pig, peel: cray }[pick], r); return; }
    const mate = { perch: nal, prints: ban, seed: pen }[pick] ?? cat;
    const d = { type: pick, p: self, e: mate, over: false, landed: false, nT: 0, hop: 0, hovering: false, catT: -1 };
    if (pick === 'prints') Object.assign(d, { marks: createMarks(scene, { color: 0x8a6a4a, r: 0.011 }), round: 0, walking: false });
    if (pick === 'seed') Object.assign(d, { marks: createMarks(scene, { r: 0.016 }), cx: mate.x, cz: mate.z, dir: r * 6.3, turn: 0, dist: 0, len: 0, rng: seeded(Math.round(r * 1e6)), drawn: false });
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
    } else if (pick === 'prints') {
      // 뒤뚱뒤뚱 걸으며 발자국 → 반쪽이가 쫓아와 박박 지움 → 다 지우면 또 걸어가 발자국 (세 번) → 화난 반쪽이가 몸통박치기 하면 짝! 날아올라 피함
      let dest, lx, lz, gap, foot = 1, esc;
      const stamp = () => {
        foot = -foot;
        const h = heading, bx = px + Math.cos(h) * 0.035 * foot, bz = pz - Math.sin(h) * 0.035 * foot;
        for (const t of [-0.55, 0, 0.55]) d.marks.add(bx + Math.sin(h + t) * 0.035, bz + Math.cos(h + t) * 0.035); // 발가락 셋
        d.marks.add(bx - Math.sin(h) * 0.012, bz - Math.cos(h) * 0.012); // 뒤꿈치
      };
      const walkRound = (i) => ({
        start() {
          d.walking = true;
          d.round = i + 1;
          lx = px; lz = pz; gap = 0;
          const away = Math.atan2(px - mate.x, pz - mate.z);
          dest = { x: px, z: pz };
          for (let j = 0; j < 6; j++) {
            const a = away + (((r * 5.1 + i * 0.37 + j * 0.29) % 1) - 0.5) * 2.4;
            const g = { x: px + Math.sin(a) * 1.2, z: pz + Math.cos(a) * 1.2 };
            if (!wall(g.x, g.z)) { dest = g; break; }
          }
        },
        walk: () => dest,
        dur: 5,
        tick() {
          gap += Math.hypot(px - lx, pz - lz);
          lx = px; lz = pz;
          while (gap >= PRINT_GAP) { gap -= PRINT_GAP; stamp(); }
        },
        bail: () => d.over,
      });
      const steps = [];
      for (let i = 0; i < PRINT_ROUNDS; i++) {
        steps.push(walkRound(i), { start() { d.walking = false; }, wait: true, act: 'peck', face: faceTo(mate), until: (T) => (d.cleanAt && Date.now() - d.cleanAt > 1300) || T > 9, bail: () => d.over }); // 반쪽이가 다 지우고 뿌듯해할 틈을 줌
      }
      startTrip([
        ...steps,
        { wait: true, face: faceTo(mate), until: () => d.slam, bail: () => d.over },
        { start() { const a = Math.atan2(px - mate.x, pz - mate.z) + 0.8; esc = { x: px + Math.sin(a) * 0.7, z: pz + Math.cos(a) * 0.7 }; esc.y = groundAt(esc.x, esc.z) + 0.9; }, fly: () => esc, dur: 0.5, arc: 0.05, down: true },
        { hover: () => esc, dur: 1.2, down: true, face: faceTo(mate) },
        homeStep,
      ]);
    } else if (pick === 'seed') {
      // 몽당연필이 땅에 점점점 콕콕 → 모이인 줄 알고 날아와 콕콕 → 갸웃 "?" → 퉤, 목 빵빵 화남 → 연필을 뒤뚱뒤뚱 쫓아감 (연필은 콩콩 도망)
      let spot;
      startTrip([
        { wait: true, face: faceTo(mate), until: () => d.drawn, bail: () => d.over },
        { start() { const c = d.marks.center() ?? mate; spot = { x: c.x, z: c.z }; }, fly: () => spot, land: true, bail: () => d.over },
        { wait: true, act: 'peck', dur: 2.2, bail: () => d.over },
        { start: () => mon.play('idle'), wait: true, dur: 1.5, tick: (T) => showQ(sm(T, 0, 0.2) * (1 - sm(T, 1.2, 1.45)), 0.145, T), bail: () => d.over },
        { wait: true, act: 'angry', face: faceTo(mate), dur: 1.6, tick: () => { d.mad = true; duoMood = true; }, bail: () => d.over },
        { walk: () => ({ x: mate.x, z: mate.z }), dur: 2.5, tick: () => (duoMood = true), bail: () => d.over },
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

  // ── 깍깍이 합동: 날개콩 괴롭히기(땅에서 콕콕 / 머리 위에서 콕콕) · 구구 쫓아내기 · 하악냥에게 시비 ──
  // 깍깍이가 나들이처럼 단계를 밟고, 짝은 duo 로 받아줌 (d.hits: 쫀 횟수 → 짝이 맞는 시늉)
  function kkakkakDuo(pick, mate, r) {
    const d = { type: pick, p: self, e: mate, over: false, hits: 0 };
    self.duo = mate.duo = d;
    self.free = mate.free = false;
    const bail = () => d.over;
    const face = faceTo(mate);
    const homeStep = { fly: home, land: true };
    // times 초마다 콕! → 부리가 닿는 순간 d.hits++
    const jabs = (times) => {
      let last = -1;
      return (T) => {
        for (const x of times) {
          if (last < x && T >= x) mon.play('jab');
          if (last < x + KKAK_JAB && T >= x + KKAK_JAB) d.hits++;
        }
        last = T;
      };
    };
    const side = Math.atan2(px - mate.x, pz - mate.z); // 내가 있던 쪽에서 다가감
    const beside = (gap) => () => ({ x: mate.x + Math.sin(side) * gap * S, z: mate.z + Math.cos(side) * gap * S });
    // 정수리(h) 뒤 위에 떠서: 몸을 숙여 콕 하면 부리가 정수리에
    // 짝 머리가 맞고 움찔해도 깍깍이는 툭 튀지 않게 살짝 늦게 따라감
    const above = (get) => {
      let cur = null;
      return () => {
        const h = get(), p = { x: h.x + Math.sin(side) * KK_BACK * S, z: h.z + Math.cos(side) * KK_BACK * S, y: h.y - KK_DROP * S };
        if (!cur) return (cur = p);
        const k = 1 - Math.exp(-frameDt * 10);
        cur = { x: cur.x + (p.x - cur.x) * k, z: cur.z + (p.z - cur.z) * k, y: cur.y + (p.y - cur.y) * k };
        return cur;
      };
    };
    const mad = () => (duoMood = true);
    let esc;
    const flyOff = (up, out) => ({ start() { const a = side + (r > 0.5 ? 0.9 : -0.9); esc = { x: px + Math.sin(a) * out, z: pz + Math.cos(a) * out }; esc.y = groundAt(esc.x, esc.z) + up; }, fly: () => esc, dur: 0.8 });
    if (pick === 'bully') {
      // 날개콩 옆에 내려앉아 째려봄 → 콕콕콕콕 (날개콩은 아야아야) → 날개콩이 도망가면 깍깍 비웃음
      startTrip([
        { fly: beside(KK_GAP), land: true, arc: 0.3, bail },
        { wait: true, act: 'angry', face, dur: 1.6, tick: mad, bail },
        { wait: true, face, dur: 3.2, tick: jabs([0.1, 1.05, 2.0, 2.6]), bail }, // 날개콩이 아야 하는 틈(0.9초)을 두고, 마지막은 연달아
        { start: () => (d.flee = true), wait: true, act: 'caw', face, dur: 3 },
        homeStep,
      ]);
    } else if (pick === 'headPeck') {
      // 날개콩 머리 위에 떠서 정수리 콕콕 → 버둥버둥 도망가도 위에 붙어 따라가며 콕콕 → 휙 솟아 날아감
      const over = above(() => ({ x: mate.x, z: mate.z, y: mate.topY ?? groundAt(mate.x, mate.z) + 0.6 }));
      const toward = () => side + Math.PI;
      const hit1 = jabs([0.6, 1.15, 1.7, 2.25]);
      startTrip([
        { fly: over, arc: 0.3, bail },
        { hover: over, face: toward, tick: (T) => { mad(); d.above = true; hit1(T); }, dur: 2.6, bail },
        { start: () => (d.flee = true), hover: over, face: toward, tick: jabs([0.5, 1.1]), dur: 1.9 },
        flyOff(0.9, 1.2),
        homeStep,
      ]);
    } else if (pick === 'fight') {
      // 하악냥 앞에 내려앉아 깍깍 시비 → 콕콕콕 → 하악냥이 하악! 덮치면 짝! 머리 위로 피해 → 위에서 정수리 콕콕 → 하악냥 시무룩, 깍깍이는 날아감
      const top = above(() => mate.head ?? { x: mate.x, z: mate.z, y: groundAt(mate.x, mate.z) + 0.5 });
      const toward = () => side + Math.PI;
      startTrip([
        { fly: beside(KK_CAT_GAP), land: true, arc: 0.3, bail },
        { wait: true, act: 'caw', face, dur: 1.8, tick: mad, bail },
        { wait: true, face, dur: 2.5, tick: jabs([0.1, 1.05, 2.0]), bail }, // 하악냥이 아야 하는 틈(0.9초)을 두고
        { start: () => (d.punch = true), wait: true, face, until: () => (d.pounce ?? -1) >= 0.25, bail },
        { fly: top, dur: 0.45, arc: 0.05, down: true, bail },
        { hover: top, face: toward, down: true, dur: 3.2, tick: jabs([0.9, 1.85, 2.8]), bail },
        { start() { d.sulk = true; flyOff(1, 1.3).start(); }, fly: () => esc, dur: 0.8 },
        homeStep,
      ]);
    } else if (pick === 'peel') {
      // 끄레용 옆에 내려앉아 깍깍 → 종이옷을 콕 물어 쏙 → 문 채로 끄레용 둘레를 빙빙 놀림 → 머리 위에서 툭 떨어뜨려 줌 → 깍깍
      const hit = jabs([0.1]);
      const hold = () => {
        if (!d.hits || carry || !mate.makeWrapper) return;
        const m = mate.makeWrapper();
        kBeak.add(m);
        const ks = (SCALE * KINDS.kkreyong.size) / kBeak.getWorldScale(TMP).x; // 끄레용 크기대로
        m.scale.setScalar(ks);
        m.position.set(0, -0.036 * ks, 0.012);
        m.rotation.x = 0.3;
        carry = { m, fall: null, d };
      };
      const around = (i, y) => () => { const a = side + i * 2.1; return { x: mate.x + Math.sin(a) * 0.9, z: mate.z + Math.cos(a) * 0.9, y: groundAt(mate.x, mate.z) + y }; };
      const over = () => ({ x: mate.x - Math.sin(side) * 0.25, z: mate.z - Math.cos(side) * 0.25, y: groundAt(mate.x, mate.z) + 1.0 });
      startTrip([
        { fly: beside(KK_PEEL_GAP), land: true, arc: 0.3, bail },
        { wait: true, act: 'caw', face, dur: 1.4, bail },
        { wait: true, face, dur: 0.9, tick: (T) => { hit(T); hold(); }, bail },
        { fly: around(0.6, 1.2), arc: 0.3, dur: 1.0, bail },
        { fly: around(1.6, 1.0), arc: 0.15, dur: 0.9, bail },
        { fly: around(2.6, 1.2), arc: 0.15, dur: 0.9, bail },
        { fly: over, dur: 0.8, bail },
        { hover: over, face, dur: 0.6, down: true, bail },
        { start() { if (carry) carry.fall = 0; }, hover: over, face, dur: 1.2, down: true },
        homeStep,
      ]);
    } else {
      // 구구를 보고 부르르 화냄 → 구구한테 날아가면 구구는 화들짝 날아 도망 → 그 자리에 앉아 깍깍
      let spot;
      startTrip([
        { wait: true, act: 'angry', face, dur: 1.6, tick: mad, bail },
        { start() { d.go = true; spot = { x: mate.x, z: mate.z }; }, fly: () => spot, land: true, arc: 0.25 },
        { wait: true, act: 'caw', face, dur: 3 },
        homeStep,
      ]);
    }
  }
  // 구구: 깍깍이가 덤비면 화들짝 날아올라 멀리 도망 → 한참 뒤 돌아옴
  function shooed(d) {
    d.fled = true;
    const a = Math.atan2(px - d.p.x, pz - d.p.z);
    let far = null;
    for (let i = 0; i < 6 && !far; i++) {
      const b = a + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.5;
      const g = { x: px + Math.sin(b) * 5, z: pz + Math.cos(b) * 5 };
      if (!wall(g.x, g.z) && !wall((px + g.x) / 2, (pz + g.z) / 2)) far = g;
    }
    if (!far) { endDuo(d); return; }
    const up = { x: px + (far.x - px) * 0.3, z: pz + (far.z - pz) * 0.3 };
    up.y = groundAt(up.x, up.z) + 1.2;
    startTrip([
      { fly: () => up, dur: 0.7, arc: 0.05 },
      { fly: () => far, land: true, arc: 0.4 },
      { wait: true, act: 'peck', dur: 2, start: () => endDuo(d) },
      { wait: true, dur: 4 },
      { fly: home, land: true },
    ]);
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
      if (!power) return { x: px, z: pz, y: 0.07 * S }; // 빗나감: 닿았지만 밀리지도 다치지도 않는다
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
      return { x: px, z: pz, y: 0.07 * S, dead: hp <= 0 };
    },
    // me: 내 캐릭터 (없으면 아직 입장 전)
    update(dt, me) {
      frameDt = dt;
      const { s, th, x: tx, z: tz } = target();
      extraY = 0;
      if (qMark) qMark.visible = false;
      if (hearts) for (const h of hearts) h.visible = false;
      if (!self.duo) {
        duoMood = false;
        if (!FLY) air = 0; // 반쪽이 위에 올라탔던 날개콩도 합동이 끊기면 땅으로
        if (kind === 'kkreyong') { mon.setSlip(0); mon.setBare(false); } // 툭툭 흘러내린·벗겨진 종이옷도 합동이 끊기면 제자리
      }
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
      const busy = BUSY.has(mon.state) && !(mon.state === 'hit' && self.duo?.fakeHit === self); // 합동 모션 속 '맞음'은 연기라 그만두지 않음

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
      if (busy || !me || trip) mode = 'route'; // 나들이 중엔 사람을 봐도 다녀와서 (깍깍이도 날아가는 동안은 안 덤빔)
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
      if (FLY) {
        if (busy) { if (trip) stopTrip(); if (self.duo) endDuo(self.duo); } // 맞으면 나들이·합동 그만
        if (kind === 'gugu' && self.duo?.type === 'shoo' && self.duo.go && !self.duo.fled) shooed(self.duo); // 깍깍이가 덤빔
        mode = trip ? 'trip' : kind === 'gugu' ? 'route' : mode; // 깍깍이는 나들이가 아니면 쫓기·화남 그대로
      } else if (self.duo) {
        if (!busy && (mode === 'route' || mode === 'duo')) mode = 'duo';
        else { endDuo(self.duo); if (mode === 'duo') mode = 'route'; }
      } else if (mode === 'duo') mode = 'route';
      if (mode !== 'duo' && (mon.state === 'doodle' || mon.state === 'scrub' || mon.state === 'panic' || mon.state === 'paint')) mon.play('idle'); // 끝없이 도는 합동 동작은 그만두면 바로 멈춤
      // 한가한지: 제 길 가까이에서 걷거나 쉬는 중 (짝이 될 수 있음. 같은 길을 줄지어 따라가며 조금 처질 때도 있어 넉넉히)
      const onRoute = mode === 'route' && !busy && Math.hypot(tx - px, tz - pz) < 0.6 && (mon.state === 'idle' || mon.state === 'walk');
      self.free = onRoute && !self.duo && self.duoCool <= 0;
      self.napping = mode === 'route' && !busy && mon.state === 'sleep' && Math.hypot(tx - px, tz - pz) < 0.6 && !self.duo && self.duoCool <= 0; // 낮잠 자는 하악냥 (반쪽이가 다가옴)
      self.seen = Date.now();
      self.duoCool -= dt;
      // 구구: 1초마다 주사위를 굴려 나들이를 떠남 (같은 서버 사람들 화면에서 거의 같이)
      tripCool -= dt;
      if (FLY && self.free && tripCool <= 0) {
        const sec = Math.floor(Date.now() / 1000);
        if (sec !== tripTick) {
          tripTick = sec;
          if (dice(sec, Math.round(phase * 10) + 7) < FLY.chance) {
            guguTrip(dice(sec, Math.round(phase * 10) + 99));
            if (trip) mode = 'trip';
          }
        }
      }
      // 합동 모션 짝 찾기: 1초마다 주사위를 굴려, 가까이 한가한(또는 낮잠 자는) 짝이 있으면 시작
      if (DUO_PAIRS[kind] && self.free) {
        const sec = Math.floor(Date.now() / 1000);
        if (sec !== duoTick) {
          duoTick = sec;
          const mates = [];
          for (const [k, type, nap] of DUO_PAIRS[kind]) {
            for (const o of ALL) {
              if (o.kind === k && (nap ? o.napping : o.free) && Date.now() - o.seen < 500 && Math.hypot(o.x - px, o.z - pz) < DUO_NEAR) { mates.push([o, type]); break; }
            }
          }
          const ph = Math.round(phase * 10);
          if (mates.length && dice(sec, ph) < DUO_CHANCE) {
            const [mate, type] = mates[Math.floor(dice(sec, ph + 3) * mates.length)];
            const mk = KK_MARKS[type];
            const duo = { type, p: self, e: mate, over: false, t: 0, cx: px, cz: pz, dir: heading, turn: 0, dist: 0, len: 0,
              rng: seeded(sec * 31 + ph), marks: type === 'lift' || type === 'nap' || (KK_DUOS.has(type) && !mk) ? null : createMarks(scene, mk?.[0]),
              marks2: mk?.[1] ? createMarks(scene, mk[1]) : null, drawn: false, cleaned: false };
            self.duo = mate.duo = duo;
            self.free = mate.free = mate.napping = false;
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
      } else if (mon.state === 'attack' && mode !== 'duo' && mode !== 'trip') {
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
            stepLegs(stuck, dt);
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
          duoStep = kind === 'mongdang' && DRAW[d.type] ? 'draw' : 'watch';
          if (d.type === 'scrub' && kind === 'banjjok') mon.play('notice');
          else if (duoStep === 'draw') mon.play('doodle');
          else if (kind === 'nalgae' && (d.type === 'lift' || d.type === 'wings')) mon.play('flutter'); // 날기 시도부터 (또 1cm)
          else if (d.type !== 'nap' || kind !== 'haak') mon.play('idle'); // 낮잠 자던 하악냥은 그대로 잠
        }
        // 반쪽이: 가장 가까운 자국으로 뒤뚱뒤뚱 가서 엎드려 박박 지우며 따라감 → 지울 게 없거나 한동안 하나도 못 지우면 false
        const scrubMarks = () => {
          const n = d.marks.nearest(px, pz);
          noErase += dt;
          if (!n || noErase > ERASE_GIVEUP) return false;
          const dist = Math.hypot(n.x - px, n.z - pz);
          const scrubbing = mon.state === 'scrub';
          if (dist > SCRUB_REACH + (scrubbing ? 0.2 : 0)) walkTo(n.x, n.z, 0.7, SCRUB_REACH * 0.8); // 멀리 있는 자국으로는 뒤뚱뒤뚱 걸어감
          else {
            // 엎드려 박박 문지르며 자국을 따라 조금씩 나아감 (몸 앞쪽에 닿은 자국이 슥슥 지워짐)
            if (!scrubbing) { mon.play('scrub'); duoT = 0; }
            const want = Math.atan2(n.x - px, n.z - pz);
            if (dist > 0.12) {
              const step = Math.min(dist - 0.1, SCRUB_SPEED * dt);
              [px, pz] = move(px, pz, px + Math.sin(want) * step, pz + Math.cos(want) * step);
            }
            turnTo(want, 3);
            if (duoT > 0.3) {
              const ex = px + Math.sin(heading) * 0.1, ez = pz + Math.cos(heading) * 0.1, n = d.marks.erase(ex, ez, ERASE_R, dt);
              if (n) noErase = 0;
              // 크레파스 낙서는 지워지지 않고 번지기만 함
              if (d.marks2) for (let i = 0; i < Math.ceil(n / 2); i++) d.marks2.add(ex + (d.rng() - 0.5) * ERASE_R * 1.6, ez + (d.rng() - 0.5) * ERASE_R * 1.6);
            }
          }
          return true;
        };
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
          stepLegs(stuck, dt);
          turnTo(dir);
          legs = speed / SPEED * 0.7;
          return false;
        };
        // 물구나무 서서 길(tr.path)을 따라 그림 (펜 든 구간은 자국 없이 지나감) → 다 그렸으면 true
        const tracePath = (tr, marks, speed, gap) => {
          let left = speed * dt;
          while (left > 0 && tr.i < tr.path.length) {
            const t = tr.path[tr.i], dx = t.x - px, dz = t.z - pz, dist = Math.hypot(dx, dz), step = Math.min(dist, left);
            if (dist > 1e-6) { tr.dir = Math.atan2(dx, dz); px += (dx / dist) * step; pz += (dz / dist) * step; }
            left -= step;
            if (t.pen) {
              tr.dist += step;
              while (tr.dist >= gap) { tr.dist -= gap; marks.add(px - Math.sin(tr.dir) * tr.dist, pz - Math.cos(tr.dir) * tr.dist); }
            }
            if (step >= dist) tr.i++;
          }
          turnTo(tr.dir, 10);
          return tr.i >= tr.path.length;
        };
        if (duoT > 30) endDuo(d); // 혹시 어딘가 끼어 끝나지 않으면 그만둠
        else if (KK_DUOS.has(d.type)) {
          // 끄레용 합동: 끄레용과 짝이 d 의 표시(drawn·filled·taps·hits·back …)를 보고 차례로 움직임
          const cr = d.type === 'peel' ? d.e : d.p, mate = d.type === 'peel' ? d.p : d.e;
          // 첫 점으로 가서 물구나무 → 길 따라 그리기 → 내려옴 → then() (이 단계들이 아니면 false)
          const drawAlong = (tr, marks, speed, gap, then) => {
            if (duoStep === 'go') { if (walkTo(tr.path[0].x, tr.path[0].z, 0.7, 0.06) || duoT > 6) { duoStep = 'flip'; duoT = 0; mon.play('doodle'); } }
            else if (duoStep === 'flip') { if (duoT > 0.5) duoStep = 'trace'; }
            else if (duoStep === 'trace') { if (tracePath(tr, marks, speed, gap)) { duoStep = 'land'; mon.play('doodleEnd'); } }
            else if (duoStep === 'land') { if (mon.state !== 'doodleEnd') { duoT = 0; then(); } }
            else return false;
            return true;
          };
          const goAside = (x, z) => { asideX = x; asideZ = z; if (wall(x, z)) { asideX = px; asideZ = pz; } duoStep = 'aside'; duoT = 0; };
          const aside = () => { if (walkTo(asideX, asideZ, 0.7) || duoT > 4) { duoStep = 'look'; duoT = 0; if (mon.state === 'walk') mon.play('idle'); } };
          const idleFace = (o) => { if (mon.state === 'walk') mon.play('idle'); face(o); };
          if (d.type === 'picture') {
            // 끄레용이 땅에 날개콩을 그려 줌 → 날개콩이 와서 보고 깜짝 → 신나서 파닥파닥, 하트 퐁퐁 → 끄레용 킥킥
            if (!d.tr) {
              const a = Math.atan2(cr.x - mate.x, cr.z - mate.z); // 날개콩 반대쪽으로 조금 물러난 자리에 그림
              let cx = cr.x + Math.sin(a) * 0.5, cz = cr.z + Math.cos(a) * 0.5;
              if (wall(cx, cz)) { cx = cr.x; cz = cr.z; }
              d.c = { x: cx, z: cz, h: a + Math.PI }; // 그림 앞(h)은 날개콩 쪽
              d.tr = { path: place(PICTURE, cx, cz, d.c.h), i: 0, dist: 0, dir: 0 };
            }
            const C = d.c, fx = Math.sin(C.h), fz = Math.cos(C.h);
            if (kind === 'kkreyong') {
              if (duoStep === 'watch') duoStep = 'go';
              if (drawAlong(d.tr, d.marks, 0.7, DOT_GAP, () => { d.drawn = true; goAside(C.x + fz * 1.0, C.z - fx * 1.0); })) { /* 그리는 중 */ }
              else if (duoStep === 'aside') aside();
              else {
                idleFace(mate);
                if (d.loved && !d.shy) { d.shy = true; mon.play('giggle'); }
                if (d.done || duoT > 14) endDuo(d);
              }
            } else if (duoStep === 'watch') { idleFace(cr); if (d.drawn) { duoStep = 'come'; duoT = 0; } }
            else if (duoStep === 'come') { if (walkTo(C.x + fx * 0.85, C.z + fz * 0.85, 0.6, 0.08) || duoT > 6) { duoStep = 'see'; duoT = 0; mon.play('notice'); } }
            else if (duoStep === 'see') { face(C); if (mon.state !== 'notice') { duoStep = 'yay'; duoT = 0; mon.play('flutter'); d.loved = true; } }
            else { face(C); showHearts(duoT); if (duoT > 2.2 && mon.state !== 'flutter') { d.done = true; endDuo(d); } }
          } else if (d.type === 'poke') {
            // 하악냥이 호기심에 앞발로 종이옷을 툭툭 → 툭 할 때마다 종이옷이 쑥쑥 (끄레용 부끄) → 세 번째 뒤 끄레용이 폴짝 끌어올리면 하악냥이 깜짝
            if (kind === 'haak') {
              if (duoStep === 'watch') { idleFace(cr); if (duoT > 1.2) { duoStep = 'stalk'; duoT = 0; } }
              else if (duoStep === 'stalk') {
                if (walkTo(cr.x, cr.z, 0.5, BODY_R + cr.r + HUNT_REACH * 0.5)) {
                  idleFace(cr);
                  if (Math.abs(wrap(Math.atan2(cr.x - px, cr.z - pz) - heading)) < 0.3) {
                    mon.setReach?.(0);
                    tapsAt = swatTaps(0);
                    taps = 0;
                    mon.play('swat');
                    duoStep = 'swat';
                    d.round = (d.round ?? 0) + 1;
                  }
                } else if (duoT > 8) endDuo(d);
              } else if (duoStep === 'swat') {
                face(cr);
                if (taps < tapsAt.length && mon.time >= tapsAt[taps]) { taps++; d.taps = (d.taps ?? 0) + 1; }
                if (mon.state !== 'swat') { duoT = 0; if (d.round >= 3) { duoStep = 'after'; d.swatted = true; } else duoStep = 'stalk'; }
              } else {
                idleFace(cr);
                if (d.pulled && !d.jumped) { d.jumped = true; mon.play('notice'); }
                else if ((d.jumped && mon.state !== 'notice') || duoT > 6) endDuo(d);
              }
            } else {
              idleFace(mate);
              if ((d.taps ?? 0) > (d.seen ?? 0)) { d.seen = d.taps; mon.setSlip(Math.min(0.85, d.taps * 0.15)); mon.play('poked'); }
              if (d.swatted && !d.pulled && mon.state !== 'poked') { d.pulled = true; mon.setSlip(0); mon.play('notice'); }
            }
          } else if (d.type === 'color') {
            // 몽당연필이 땅에 테두리(동그라미·하트·별·꽃)를 그리면 → 끄레용이 물구나무 서서 안을 빙글빙글 색칠 → 끄레용 킥킥, 연필은 우와
            if (!d.paths) {
              const mx = (cr.x + mate.x) / 2, mz = (cr.z + mate.z) / 2, a = Math.atan2(mate.x - cr.x, mate.z - cr.z) + Math.PI / 2;
              let cx = mx + Math.sin(a), cz = mz + Math.cos(a);
              if (wall(cx, cz)) { cx = mx - Math.sin(a); cz = mz - Math.cos(a); }
              d.c = { x: cx, z: cz };
              d.paths = shapePaths(SHAPES[Math.floor(d.rng() * SHAPES.length)], cx, cz, 0.5);
              d.tr1 = { path: d.paths.edge, i: 0, dist: 0, dir: 0 };
              d.tr2 = { path: d.paths.fill, i: 0, dist: 0, dir: 0 };
            }
            const C = d.c;
            if (kind === 'mongdang') {
              if (duoStep === 'watch') duoStep = 'go';
              if (drawAlong(d.tr1, d.marks, 0.7, DOT_GAP, () => {
                d.drawn = true;
                const a = Math.atan2(px - C.x, pz - C.z);
                goAside(C.x + Math.sin(a) * 1.15, C.z + Math.cos(a) * 1.15);
              })) { /* 그리는 중 */ }
              else if (duoStep === 'aside') aside();
              else { idleFace(C); if (d.filled && !d.wow) { d.wow = true; mon.play('notice'); } }
            } else if (duoStep === 'watch') { idleFace(d.drawn ? C : mate); if (d.drawn) { duoStep = 'go'; duoT = 0; } else if (duoT > 25) endDuo(d); }
            else if (!drawAlong(d.tr2, d.marks2, 0.9, FILL_GAP, () => { d.filled = true; duoStep = 'done'; mon.play('giggle'); })) {
              if (mon.state !== 'giggle') endDuo(d);
            }
          } else if (d.type === 'smear') {
            // 끄레용이 크레파스로 빙글빙글 낙서 → 반쪽이가 지우려고 박박 → 크레파스라 번지기만 함 → 반쪽이 당황 "?!", 끄레용 킥킥
            if (!d.tr) d.tr = { path: place(SCRIBBLE, cr.x, cr.z, Math.atan2(mate.x - cr.x, mate.z - cr.z) + Math.PI / 2), i: 0, dist: 0, dir: 0 };
            if (kind === 'kkreyong') {
              if (duoStep === 'watch') duoStep = 'go';
              if (drawAlong(d.tr, d.marks, 0.8, DOT_GAP, () => {
                d.drawn = true;
                const a = Math.atan2(px - mate.x, pz - mate.z);
                goAside(px + Math.sin(a) * 0.6, pz + Math.cos(a) * 0.6);
              })) { /* 그리는 중 */ }
              else if (duoStep === 'aside') aside();
              else {
                idleFace(mate);
                if (d.panic && !d.giggled) { d.giggled = true; mon.play('giggle'); }
                if (d.done || duoT > 25) endDuo(d);
              }
            } else if (duoStep === 'watch') { idleFace(cr); if (d.drawn) { duoStep = 'erase'; noErase = 0; } else if (duoT > 20) endDuo(d); }
            else if (duoStep === 'erase') { if (!scrubMarks()) { duoStep = 'oops'; duoT = 0; mon.play('notice'); d.panic = true; } }
            else {
              // 어? 어?! 좌우로 홱홱 돌아보며 동동
              const c = duoT, k = 1 - sm(c, 2.2, 2.6);
              showQ(sm(c, 0.2, 0.4) * k, 0.07, c);
              post = () => {
                mon.root.rotation.y += Math.sin(c * 11) * 0.5 * k;
                mon.root.children[0].position.y += Math.abs(Math.sin(c * 17)) * 0.012 * k;
              };
              if (c > 2.8) { d.done = true; endDuo(d); }
            }
          } else if (d.type === 'paint') {
            // 콕콕 쪼며 다니는 구구 배 한쪽(구구 오른쪽)에 슬쩍 붙어 파랗게 칠함 → 구구는 무신경해서 모름 → 끄레용 킥킥
            d.paint ??= 0;
            if (duoStep === 'done') { if (mon.state !== 'giggle') endDuo(d); }
            else {
              const a = mate.h - Math.PI / 2, gap = mate.r + BODY_R + 0.03;
              const gx = mate.x + Math.sin(a) * gap, gz = mate.z + Math.cos(a) * gap;
              if (Math.hypot(gx - px, gz - pz) > (mon.state === 'paint' ? 0.18 : 0.08)) { if (mon.state === 'paint') mon.play('walk'); walkTo(gx, gz, 0.8, 0.04); }
              else {
                turnTo(Math.atan2(mate.x - px, mate.z - pz), 8);
                if (mon.state !== 'paint') mon.play('paint');
                else if (mon.time > 0.3) d.paint = Math.min(1, d.paint + dt / PAINT_TIME);
                if (d.paint >= 1) { duoStep = 'done'; mon.play('giggle'); }
              }
              if (duoT > 25) endDuo(d);
            }
          } else if (duoStep === 'watch') {
            // 깍깍이가 종이옷을 콕 물어 벗겨 감 → 끄레용 당황 (발 동동, 깍깍이를 눈으로 쫓음) → 머리 위에서 떨어뜨려 주면 다시 입고 휴~
            idleFace(mate);
            if (d.hits) { duoStep = 'bare'; mon.setBare(true); mon.play('panic'); } else if (duoT > 15) endDuo(d);
          } else if (duoStep === 'bare') {
            face(mate);
            if (d.back) { mon.setBare(false); duoStep = 'calm'; mon.play('relief'); }
          } else if (mon.state !== 'relief') endDuo(d);
        } else if (d.type === 'perch') {
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
        else if (d.type === 'bully' || d.type === 'headPeck') {
          // 날개콩: 깍깍이를 보며 쭈뼛 → 콕 쪼일 때마다 아야 → 버둥버둥 도망
          const kk = d.p;
          d.seen ??= 0;
          if (d.hits > d.seen) { d.seen = d.hits; if (mon.state !== 'hit') { d.fakeHit = self; mon.play('hit'); } }
          if (!d.flee) {
            if (mon.state === 'walk') mon.play('idle');
            if (d.type === 'bully' || !d.above) face(kk);
            else post = () => { core.rotation.x = THREE.MathUtils.lerp(core.rotation.x, -0.35, Math.min(1, duoT * 3)); }; // 머리 위를 올려다봄
            if (duoT > 20) endDuo(d);
          } else {
            d.runT = (d.runT ?? 0) + dt;
            const a = Math.atan2(px - kk.x, pz - kk.z), dir = steer(a) ?? a;
            [px, pz] = move(px, pz, px + Math.sin(dir) * 0.9 * dt, pz + Math.cos(dir) * 0.9 * dt);
            turnTo(dir, 10);
            if (mon.state === 'idle') mon.play('walk');
            legs = 2.4;
            if (d.runT > 3.5) endDuo(d);
          }
        } else if (d.type === 'fight') {
          // 하악냥: 시비 거는 깍깍이를 노려봄 → 콕콕 맞음 → 하악! 덮침 (깍깍이는 위로 피함) → 위에서 또 콕콕 → 시무룩
          const kk = d.p;
          if (d.hits > (d.seen ?? 0)) { d.seen = d.hits; if (mon.state !== 'attack') { d.fakeHit = self; mon.play('hit'); } }
          if (d.pounce != null) d.pounce += dt;
          if (d.sulk) {
            if (!d.sulking && mon.state !== 'hit') { d.sulking = true; mon.play('sulk'); }
            else if (d.sulking && mon.state !== 'sulk') endDuo(d);
          } else if (d.punch && !d.mad) { d.mad = true; duoMood = true; mon.play('angry'); }
          else if (d.mad && d.pounce == null && mon.state !== 'angry') { d.pounce = 0; mon.play('attack'); }
          if (mon.state === 'walk') mon.play('idle');
          if (mon.state !== 'attack') face(kk);
          if (duoT > 25) endDuo(d);
        } else if (d.type === 'prints') {
          // 반쪽이: 구구 발자국을 보고 깜짝 → 쫓아다니며 박박 → 다 지우면 뿌듯, 그런데 또 생김 → 세 번째까지 지우면 화나서 몸통박치기 (구구는 짝! 피함)
          const pig = d.p;
          if (d.slam) { if (mon.state !== 'attack') endDuo(d); } // 박치기를 마치면 끝
          else if (duoStep === 'watch') {
            if (mon.state === 'walk') mon.play('idle');
            face(pig);
            if (d.marks.alive > 6) { duoStep = 'spot'; mon.play('notice'); }
            else if (duoT > 8) endDuo(d);
          } else if (duoStep === 'spot') {
            face(pig);
            if (mon.state !== 'notice') { duoStep = 'erase'; noErase = 0; }
          } else if (duoStep === 'erase') {
            if (scrubMarks()) { /* 박박 */ }
            else if (d.marks.alive) endDuo(d); // 손이 안 닿아 포기
            else if (d.round >= PRINT_ROUNDS && !d.walking) { duoStep = 'mad'; d.cleanAt = Date.now(); mon.play('angry'); }
            else { duoStep = 'wait'; duoT = 0; d.cleanAt = Date.now(); mon.play('scrubEnd'); }
          } else if (duoStep === 'wait') {
            // 다 지웠다고 뿌듯해하는데 구구가 또 뒤뚱뒤뚱: 새 발자국이 생기면 다시
            if (mon.state === 'walk') mon.play('idle');
            face(pig);
            if (d.marks.alive > 3) { duoStep = 'erase'; noErase = 0; d.cleanAt = 0; }
            else if (duoT > 12) endDuo(d);
          } else {
            duoMood = true;
            if (mon.state === 'angry') face(pig);
            else if (walkTo(pig.x, pig.z, 0.9, BODY_R + pig.r + 0.12)) { face(pig); mon.play('attack'); d.slam = true; }
          }
        } else if (d.type === 'lift') {
          // 날개콩이 또 1cm → 반쪽이가 옆에 와서 발판이 돼 줌 → 날개콩이 폴짝 올라가 파닥파닥 (반쪽이는 받친 채 뒤뚱뒤뚱) → 그래도 1cm, 미끄러져 툭 → 둘 다 깜짝
          const b = d.p, n = d.e;
          const top = () => (b.topY ?? groundAt(b.x, b.z) + 0.28) - groundAt(px, pz);
          if (kind === 'nalgae') {
            if (duoStep === 'watch') { if (mon.state !== 'flutter') { duoStep = 'huh'; duoT = 0; } }
            else if (duoStep === 'huh') {
              const c = duoT, huh = sm(c, 0, 0.2) * (1 - sm(c, 1.2, 1.4));
              showQ(huh, 0.17, c);
              post = () => { core.rotation.z += Math.sin((c - 0.2) * 3.2) * 0.22 * huh; }; // 갸웃갸웃
              if (c > 1.4) {
                d.huh = true;
                if (d.ready) { duoStep = 'hop'; duoT = 0; d.from = { x: px, z: pz }; } else if (c > 9) endDuo(d);
              }
            } else if (duoStep === 'hop') {
              // 반쪽이 등으로 폴짝
              const k = Math.min(1, duoT / 0.5), e = sm(k, 0, 1);
              px = d.from.x + (b.x - d.from.x) * e;
              pz = d.from.z + (b.z - d.from.z) * e;
              air = top() * e + 0.15 * Math.sin(k * Math.PI);
              turnTo(b.h, 6);
              if (k >= 1) { duoStep = 'ride'; mon.play('flutter'); d.riding = true; }
            } else if (duoStep === 'ride') {
              px = b.x;
              pz = b.z;
              air = top();
              turnTo(b.h, 4);
              if (mon.state !== 'flutter') {
                duoStep = 'fall';
                duoT = 0;
                const a = b.h + Math.PI / 2;
                d.from = { x: px, z: pz, y: air };
                d.to = { x: px + Math.sin(a) * (b.r + BODY_R + 0.02), z: pz + Math.cos(a) * (b.r + BODY_R + 0.02) };
              }
            } else if (duoStep === 'fall') {
              // 미끄러져 옆으로 툭
              const k = Math.min(1, duoT / 0.4);
              px = d.from.x + (d.to.x - d.from.x) * k;
              pz = d.from.z + (d.to.z - d.from.z) * k;
              air = d.from.y * (1 - k * k);
              if (k >= 1) { air = 0; duoStep = 'shock'; mon.play('notice'); d.fell = true; }
            } else if (mon.state !== 'notice') endDuo(d);
          } else if (duoStep === 'watch') {
            if (mon.state === 'walk') mon.play('idle');
            face(n);
            if (d.huh) { duoStep = 'go'; duoT = 0; } else if (duoT > 8) endDuo(d);
          } else if (duoStep === 'go') {
            const a = Math.atan2(px - n.x, pz - n.z), gap = n.r + BODY_R + 0.04;
            if (walkTo(n.x + Math.sin(a) * gap, n.z + Math.cos(a) * gap, 0.7, 0.06) || duoT > 6) { duoStep = 'ready'; mon.play('idle'); d.ready = true; }
          } else if (duoStep === 'ready') {
            if (d.riding) duoStep = 'carry';
          } else if (duoStep === 'carry') {
            // 날개콩을 받친 채 앞으로 뒤뚱뒤뚱
            if (d.fell) { duoStep = 'shock'; mon.play('notice'); }
            else {
              const step = 0.12 * dt;
              [px, pz] = move(px, pz, px + Math.sin(heading) * step, pz + Math.cos(heading) * step);
              if (mon.state !== 'walk') mon.play('walk');
              legs = 0.5;
            }
          } else if (mon.state === 'walk') mon.play('idle');
        } else if (d.type === 'nap') {
          // 반쪽이가 낮잠 자는 하악냥에게 살금살금 → 부러진 면을 옆구리에 대 봄 (꾹, 꾹) "내 반쪽?" → 하악냥이 깨서 하악! → 깜짝 도망 / 하악냥은 도로 잠
          const cat = d.e;
          if (kind === 'haak') {
            if (!d.check) { if (mon.state !== 'sleep') mon.play('sleep'); }
            else if (!d.hiss) { d.hiss = true; mon.play('angry'); }
            else if (mon.state === 'angry') { face(d.p); duoMood = true; }
            else if (mon.state !== 'sleep') mon.play('sleep');
          } else if (duoStep === 'watch') {
            // 하악냥 옆구리 (가까운 쪽) 로 살금살금
            const right = (px - cat.x) * Math.cos(cat.h) - (pz - cat.z) * Math.sin(cat.h) > 0 ? 1 : -1;
            const a = cat.h + (Math.PI / 2) * right, gap = cat.r + BODY_R + 0.03;
            if (walkTo(cat.x + Math.sin(a) * gap, cat.z + Math.cos(a) * gap, 0.4, 0.06) || duoT > 8) { duoStep = 'turn'; duoT = 0; if (mon.state === 'walk') mon.play('idle'); }
          } else if (duoStep === 'turn') {
            turnTo(Math.atan2(cat.x - px, cat.z - pz) - Math.PI / 2, 5); // 부러진 면(+x)을 하악냥 쪽으로
            if (duoT > 0.8) { duoStep = 'press'; duoT = 0; }
          } else if (duoStep === 'press') {
            const c = duoT, a = Math.atan2(cat.x - px, cat.z - pz);
            const push = c < 1.8 ? 0.05 * Math.max(0, Math.sin((c * Math.PI) / 0.6)) ** 2 : 0; // 꾹 (0~0.6초), 꾹 (1.2~1.8초)
            showQ(sm(c, 0.7, 0.9) * (1 - sm(c, 2.4, 2.6)), 0.07, c);
            post = () => { mon.root.position.x += Math.sin(a) * push; mon.root.position.z += Math.cos(a) * push; };
            if (c > 2.6) { d.check = true; duoStep = 'wait'; duoT = 0; }
          } else if (duoStep === 'wait') {
            if (duoT > 0.35) { duoStep = 'flee'; duoT = 0; mon.play('notice'); }
          } else {
            const a = Math.atan2(px - cat.x, pz - cat.z);
            if (duoT > 0.5) walkTo(px + Math.sin(a) * 0.5, pz + Math.cos(a) * 0.5, 1.1, 0);
            if (duoT > 2.6) endDuo(d);
          }
        } else if (d.type === 'wings') {
          // 날개콩이 또 1cm → 몽당연필이 날개콩 양옆 땅에 커다란 날개를 그려 줌 → 날개 위에서 신나게 파닥파닥 → 그래도 1cm, 갸웃 "?"
          const n = d.e;
          if (kind === 'nalgae') {
            if (duoStep === 'watch') { if (mon.state !== 'flutter') { d.ask = true; duoStep = 'stay'; } }
            else if (duoStep === 'stay') { if (d.drawn) { duoStep = 'try'; mon.play('flutter'); } }
            else if (duoStep === 'try') { if (mon.state !== 'flutter') { duoStep = 'huh'; duoT = 0; } }
            else {
              const c = duoT, huh = sm(c, 0, 0.2) * (1 - sm(c, 1.8, 2));
              showQ(huh, 0.17, c);
              post = () => { core.rotation.z += Math.sin((c - 0.2) * 3.2) * 0.22 * huh; };
              if (c > 2.1) endDuo(d);
            }
          } else if (duoStep === 'watch') {
            if (mon.state === 'walk') mon.play('idle');
            face(n);
            if (d.ask) {
              // 날개콩이 바라보는 쪽 기준으로 날개 자리를 정함 (날개콩은 그리는 동안 가만히 있음)
              const h = n.h, rx = Math.cos(h), rz = -Math.sin(h), fx = Math.sin(h), fz = Math.cos(h);
              d.path = WINGS.map((w) => ({ x: n.x + rx * w.x + fx * w.z, z: n.z + rz * w.x + fz * w.z, pen: w.pen }));
              d.i = 0;
              duoStep = 'go';
              duoT = 0;
            } else if (duoT > 6) endDuo(d);
          } else if (duoStep === 'go') {
            if (walkTo(d.path[0].x, d.path[0].z, 0.7, 0.06) || duoT > 6) { duoStep = 'flip'; duoT = 0; mon.play('doodle'); }
          } else if (duoStep === 'flip') {
            if (duoT > 0.55) duoStep = 'trace'; // 물구나무 다 설 때까지
          } else if (duoStep === 'trace') {
            // 날개 모양 길을 따라 물구나무 서서 쓱쓱 (펜 든 구간은 자국 없이 지나감). 길을 따라가느라 몸은 다른 몬스터를 뚫고 지나갈 수도 있음
            let left = 0.85 * dt;
            while (left > 0 && d.i < d.path.length) {
              const t = d.path[d.i], dx = t.x - px, dz = t.z - pz, dist = Math.hypot(dx, dz);
              const step = Math.min(dist, left);
              if (dist > 1e-6) { d.dir = Math.atan2(dx, dz); px += (dx / dist) * step; pz += (dz / dist) * step; }
              left -= step;
              if (t.pen) {
                d.dist += step;
                while (d.dist >= DOT_GAP) { d.dist -= DOT_GAP; d.marks.add(px - Math.sin(d.dir) * d.dist, pz - Math.cos(d.dir) * d.dist); }
              }
              if (step >= dist) d.i++;
            }
            turnTo(d.dir, 10);
            if (d.i >= d.path.length) { duoStep = 'land'; mon.play('doodleEnd'); }
          } else if (duoStep === 'land') {
            if (mon.state !== 'doodleEnd') {
              d.drawn = true;
              duoStep = 'aside';
              duoT = 0;
              asideX = n.x + Math.sin(n.h) * 1.3; // 날개콩 앞에서 구경
              asideZ = n.z + Math.cos(n.h) * 1.3;
              if (wall(asideX, asideZ)) { asideX = px; asideZ = pz; }
            }
          } else if (duoStep === 'aside') {
            if (walkTo(asideX, asideZ, 0.7) || duoT > 4) { duoStep = 'look'; if (mon.state === 'walk') mon.play('idle'); }
          } else { if (mon.state === 'walk') mon.play('idle'); face(n); }
        } else if (kind === 'mongdang') {
          // 몽당연필 (scrub 반쪽이와 · seed 구구와 · tip 하악냥과): 물구나무 서서 낙서 → 착지 → 옆으로 비켜 구경
          const other = d.p === self ? d.e : d.p;
          const [gap, zigW, drawTime, spread] = DRAW[d.type];
          if (d.type === 'tip' && d.knock && duoStep === 'draw') { d.fakeHit = self; mon.play('hit'); duoStep = 'down'; duoT = 0; }
          if (duoStep === 'draw') {
            if (mon.state !== 'doodle') mon.play('doodle');
            if (duoT > 0.55) {
              // 홱홱 방향을 틀며 끄적끄적. 처음 자리에서 너무 멀어지면 돌아오며 그려서 낙서가 한 군데 몰림
              // 가끔은 뱅글뱅글 고리를 그리고, 가끔은 홱 꺾임
              if (d.rng() < dt * 1.5) d.turn = (d.rng() < 0.5 ? -1 : 1) * (5 + d.rng() * 6);
              d.turn += ((d.rng() - 0.5) * 50 - d.turn * 1.2) * dt;
              d.dir += (d.turn + Math.sin(duoT * 9) * 3) * dt;
              if (Math.hypot(px - d.cx, pz - d.cz) > spread) d.dir += wrap(Math.atan2(d.cx - px, d.cz - pz) - d.dir) * Math.min(1, dt * 5);
              const step = DOODLE_SPEED * dt;
              const nx = px + Math.sin(d.dir) * step, nz = pz + Math.cos(d.dir) * step;
              if (blocked(nx, nz)) d.dir += 2; // 벽·다른 몬스터에 닿으면 홱 돌아섬
              else {
                px = nx;
                pz = nz;
                d.dist += step;
                // 심 끝(물구나무 선 몸 바로 밑)이 지나간 자리에 점을 찍음: 촘촘하면 선, 띄엄띄엄이면 모이 같은 점점점. 좌우로 박박 그으면 지그재그
                while (d.dist >= gap) {
                  d.dist -= gap;
                  d.len += gap;
                  const zig = Math.sin(d.len * ZIG_K) * zigW;
                  d.marks.add(px - Math.sin(d.dir) * d.dist + Math.cos(d.dir) * zig, pz - Math.cos(d.dir) * d.dist - Math.sin(d.dir) * zig);
                }
              }
              turnTo(d.dir, 10);
            }
            if (duoT > drawTime) { duoStep = 'land'; duoT = 0; mon.play('doodleEnd'); }
          } else if (duoStep === 'down') {
            // 하악냥 앞발에 툭 맞아 넘어짐 → 벌떡 일어나 화남! → 다가가 콕! (심 부러짐)
            if (mon.state === 'hit') { /* 넘어짐 */ }
            else if (!d.mad) { d.mad = true; d.fakeHit = null; mon.play('angry'); }
            else if (mon.state === 'angry') face(other);
            else if (!d.stab) { if (walkTo(other.x, other.z, 0.8, BODY_R + other.r + 0.1)) { face(other); mon.play('attack'); d.stab = true; } }
            else if (mon.state !== 'attack') { if (mon.state === 'walk') mon.play('idle'); face(other); }
            duoMood = !!d.mad;
          } else if (duoStep === 'land') {
            if (mon.state !== 'doodleEnd') {
              if (d.type === 'tip') endDuo(d); // 하악냥이 끝내 심 끝을 못 잡음
              else {
                // 착지 끝: 짝이 지나갈 길을 비켜 낙서 옆으로 물러남
                d.drawn = true;
                duoStep = 'aside';
                duoT = 0;
                const c = d.marks.center() ?? { x: px, z: pz };
                const side = Math.atan2(c.x - other.x, c.z - other.z);
                const out = spread + 0.7;
                asideX = px;
                asideZ = pz;
                for (const a of [side + Math.PI / 2, side - Math.PI / 2, side]) {
                  const gx = c.x + Math.sin(a) * out, gz = c.z + Math.cos(a) * out;
                  if (!wall(gx, gz)) { asideX = gx; asideZ = gz; break; }
                }
              }
            }
          } else if (duoStep === 'aside') {
            if (walkTo(asideX, asideZ, 0.7) || duoT > 4) { duoStep = 'watch'; duoT = 0; if (mon.state === 'walk') mon.play('idle'); }
          } else if (duoStep === 'flee') {
            // 화난 구구를 피해 콩콩 도망
            const a = Math.atan2(px - other.x, pz - other.z);
            if (duoT > 0.6) walkTo(px + Math.sin(a) * 0.5, pz + Math.cos(a) * 0.5, 1.2, 0);
            if (duoT > 3.2) endDuo(d);
          } else {
            // 짝을 구경. 반쪽이가 다 지우면 "앗, 내 낙서!" 하고 깜짝 · 구구가 화내면 깜짝 놀라 도망
            if (mon.state === 'walk') mon.play('idle');
            face(other);
            if (d.type === 'scrub' && d.cleaned && duoStep === 'watch') { duoStep = 'shock'; mon.play('notice'); }
            if (d.type === 'seed' && d.mad) { duoStep = 'flee'; duoT = 0; mon.play('notice'); }
          }
        } else if (kind === 'haak') {
          // 하악냥 (tip): 끄적이는 심 끝을 빤히 → 살금살금 쫓아가 앞발로 툭 → 연필이 콕! 찌르면 깜짝 폴짝 → 시무룩
          const pen = d.p;
          if (duoStep === 'watch') {
            if (mon.state === 'walk') mon.play('idle');
            face(pen);
            if (duoT > 1.5) duoStep = 'stalk';
          } else if (duoStep === 'stalk') {
            if (walkTo(pen.x, pen.z, 0.9 * RUN, BODY_R + pen.r + HUNT_REACH * 0.5)) {
              if (mon.state === 'walk') mon.play('idle');
              face(pen);
              if (Math.abs(wrap(Math.atan2(pen.x - px, pen.z - pz) - heading)) < 0.4) {
                mon.setReach?.(0);
                tapsAt = swatTaps(0);
                taps = 0;
                mon.play('swat');
                duoStep = 'swat';
              }
            }
          } else if (duoStep === 'swat') {
            face(pen);
            if (taps < tapsAt.length && mon.time >= tapsAt[taps]) { taps++; d.knock = true; } // 앞발이 닿으면 연필이 넘어짐
            if (mon.state !== 'swat') duoStep = d.knock ? 'wait' : 'stalk';
          } else if (duoStep === 'wait') {
            if (mon.state === 'walk') mon.play('idle');
            face(pen);
            if (d.stab) { duoStep = 'stab'; duoT = 0; }
          } else if (!d.jumped) {
            if (duoT > STRIKE_AT) { d.jumped = true; mon.play('notice'); } // 콕! 찔리는 순간 깜짝 폴짝
          } else if (mon.state !== 'notice' && mon.state !== 'sulk') {
            if (d.sulked) endDuo(d);
            else { d.sulked = true; mon.play('sulk'); }
          }
        } else {
          // 반쪽이 (scrub): 낙서하는 연필을 보고 깜짝 → 계속 쳐다봄 → 낙서를 따라다니며 박박 지움 → 뿌듯
          if (duoStep === 'watch') {
            if (mon.state === 'walk') mon.play('idle');
            face(d.p);
            if (d.drawn) { duoStep = 'erase'; duoT = 0; }
          } else if (duoStep === 'erase') {
            if (!scrubMarks()) {
              // 다 지움 (또는 손이 닿지 않아 포기)
              d.cleaned = true;
              duoStep = 'proud';
              duoT = 0;
              mon.play(d.marks.alive ? 'idle' : 'scrubEnd');
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
          stepLegs(stuck, dt);
          heading += wrap(dir - heading) * Math.min(1, dt * 8);
          lastKey = s.key; // 돌아가는 동안 지나간 일정은 건너뜀
        } else if (hitsMon(tx, tz)) {
          // 일정 자리에 다른 몬스터가 있으면 겹치지 않게 비켜날 때까지 기다림 (여럿이 같은 자리를 노리면 줄지어 따라감)
          stepLegs(true, dt);
        } else {
          stuckT = 0;
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
      self.h = heading;

      mon.root.position.set(px, groundY(px, pz) - curveDrop(px, pz) + (FLY ? 0 : air), pz); // 나는 종류(구구·깍깍이)는 높이를 스스로 (setAir)
      if (mon.state === 'spawn') shownH = heading; // 새로 나타날 땐 바로 그 방향
      shownH += THREE.MathUtils.clamp(wrap(heading - shownH), -TURN_MAX * dt, TURN_MAX * dt);
      mon.root.rotation.y = shownH;
      mon.update(mon.state === 'walk' ? dt * legs : dt, legs); // legs: 달리기 모션이 있는 몬스터(하악냥)는 빨리 갈 때 달림
      blendPose(dt);
      post?.();
      post = null;
      if (gBody) { // 끄레용이 칠한 구구 배: 칠한 만큼 보이고, 합동이 끝나도 한참 남았다가 스르르
        const d = self.duo;
        if (d?.type === 'paint') {
          if (!paint) {
            paint = new THREE.Mesh(new THREE.SphereGeometry(1, PAINT_COLS, PAINT_ROWS, -0.95, 1.9, 1.35, 1.2).scale(0.0352, 0.0322, 0.043).translate(0, 0, -0.005), paintMaterial().clone());
            paint.name = '색칠';
            gBody.add(paint);
          }
          paint.visible = true;
          paint.material.opacity = 1;
          paint.geometry.setDrawRange(0, Math.floor((d.paint ?? 0) * PAINT_ROWS) * PAINT_COLS * 6);
          paintHold = 20;
        } else if (paint?.visible) {
          paintHold -= dt;
          paint.material.opacity = Math.min(1, paintHold / 3);
          if (paintHold <= 0) paint.visible = false;
        }
      }
      if (carry) { // 깍깍이가 문 종이옷: 합동이 끊기면 치움 · 떨어뜨리면 끄레용 위로 툭 떨어져 쏙 끼워짐
        if (carry.fall == null) { if (carry.d.over) { carry.m.removeFromParent(); carry = null; } }
        else {
          if (carry.fall === 0) { scene.attach(carry.m); carry.y0 = carry.m.position.y; }
          carry.fall += dt;
          const m = carry.m, o = carry.d.e, k = Math.min(1, dt * 10);
          m.position.x += (o.x - m.position.x) * k;
          m.position.z += (o.z - m.position.z) * k;
          m.position.y = carry.y0 - 4.9 * carry.fall ** 2;
          m.quaternion.slerp(new THREE.Quaternion(), Math.min(1, dt * 8));
          if (m.position.y <= groundAt(o.x, o.z) + 0.05) { carry.d.back = true; m.removeFromParent(); carry = null; }
        }
      }
      if (bBody) { // 반쪽이 윗면 높이 (날개콩이 올라설 때)
        bBody.getWorldPosition(TMP);
        const y = TMP.y;
        self.topY = y + BANJJOK_TOP * TMP.setFromMatrixScale(bBody.matrixWorld).y;
      }
      if (hHead) { // 하악냥 정수리 (깍깍이가 위에서 쫄 때)
        hHead.getWorldPosition(TMP);
        self.head = { x: TMP.x, z: TMP.z, y: TMP.y + HAAK_HEAD_R * TMP.setFromMatrixScale(hHead.matrixWorld).y };
      }
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
