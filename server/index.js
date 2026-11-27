// 마을 게임 서버 (Colyseus 0.16)
// - 학생 화면이 보낸 위치를 검사만 하고 모두에게 전달한다.
// - 위치는 메모리에만 두고 데이터베이스에 저장하지 않는다.
import http from 'node:http';
import { Server, Room } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { schema, MapSchema, ArraySchema } from '@colyseus/schema';
import {
  ANIM, ANIM_MAX, TOOLS, ARROW, COLORS, RUN_SPEED, SPAWN, isBlocked, toCm, fromCm, cleanLook,
  WORLD, fruitOf, FRUIT_MAX, FRUIT_REGROW, BAG_MAX, PICK_REACH, SHAKE_DROP, GRAB_REACH, DROP_LIFE, WOOD_STOCK, WOOD_REGROW, CHOP_REACH, rollWood, LIFE_SPOTS, DIG_HOLE, ROCK_HP, ROCK_REGROW, ROCKS_GONE, groundKind,
  FOSSIL_SPOTS, pickFossil, FLOWER_ITEMS, PICK_FLOWER_REACH, PLANT, plantKind, plantItem, SEEDS, HALF, FIELD, inField,
  PORTALS, PORTAL, portalArrive, RARITY, waterNear, waterAt, BOB_AHEAD, byteToAngle, fishForShadow, sizeOfShadow, FISH_APPROACH, NIBBLE_GAP, BITE_AFTER, REEL_SLACK, XP, MONSTERS, killXp, shareXp, levelOf, afterDeath, JOBS, JOB_LEVEL, canWield,
} from '../shared/world.js';
import { setupBugs } from './bugs.js';

const PORT = Number(process.env.GAME_PORT || 2567);
const MAX_CLIENTS = Number(process.env.MAX_CLIENTS || 40);
// 몬스터 피해 나누기 (monHit·monHurt): 한 번에 믿어 주는 가장 큰 피해 · 이만큼(ms) 안 맞으면 기여도를 잊음 (몬스터 체력도 10초면 다시 참) · 같은 몬스터 두 번 나누기 막는 시간
const MON_HIT_MAX = 2000;
const PVP_MAX = 10; // 친구를 PVP_WINDOW 안에 이만큼 때리면 PVP_CUFF 동안 수갑 (꼼짝 못 함)
const PVP_WINDOW = 10 * 60 * 1000;
const PVP_CUFF = 60 * 1000;
const MON_FORGET = 12000;
const BOSS_FORGET = 90000; // 보스(id 가 b 로 시작)는 싸움이 길고 체력이 서서히 차므로 오래 기억
const BOSS_SPILL_GAP = 10000; // 보스 졸개 소환 사이 최소 간격 (ms)
const forgetOf = (id) => (id[0] === 'b' ? BOSS_FORGET : MON_FORGET);
const MON_KILL_DUP = 3000;
// 몬스터 맡기기 (monNear·monOwn·monSync): 이만큼(m) 안의 몬스터만 맡음 · 맡은 학생보다 이만큼(m) 더 가까워야 넘김 · 이만큼(ms) 소식이 없으면 풀어 줌
const MON_CLAIM = 30;
const MON_SWITCH = 4;
const MON_STALE = 3000;
// 몬스터 id: 짧은 글자만 (화면이 정함: 광장 p0~, 들판 f0~)
const monId = (v) => (typeof v === 'string' && /^[a-z][0-9]{1,4}$/.test(v) ? v : null);
const RECONNECT_SECONDS = 60;
// 화면을 닫거나 다른 곳으로 갈 때 '나가요(bye)'를 보낸 경우: 새로고침해서 돌아올 만큼만 기다린다
const BYE_SECONDS = 8;
// 연결 확인: 이만큼(ms)마다 확인을 보내고, 이만큼 연달아 답이 없으면 끊는다. 기본값(3초 × 2번)은 교실 와이파이가 6초만 멈춰도
// 끊겨서, 다시 붙는 동안 화면이 마을을 다시 받느라 또 멈췄다. 20초까지는 끊지 않고 기다린다 (그동안 캐릭터는 그 자리에 서 있다)
const PING_MS = 5000;
const PING_RETRIES = 4;
// 테스트 서버에서는 외형을 마음대로 바꿀 수 있다 (실제 수업 서버는 NODE_ENV=production 또는 FREE_LOOK=0 으로 끔)
const FREE_LOOK = process.env.FREE_LOOK ? process.env.FREE_LOOK === '1' : process.env.NODE_ENV !== 'production';

// ── 주고받는 상태 정의 ──
const Player = schema({
  x: 'int16', // cm
  z: 'int16', // cm
  r: 'uint8', // 바라보는 방향 0~255
  a: 'uint8', // 동작 번호
  t: 'uint8', // 든 도구 번호 (TOOLS)
  q: 'uint8', // 화살통에 든 화살 개수 (다른 학생 화면의 화살통에 보이게)
  name: 'string',
  color: 'uint8',
  look: 'string', // 꾸민 외형(JSON), 비어 있으면 색 번호로 정한 기본 모습
  bag: { map: 'uint8' }, // 가방: 과일 이름(FRUITS)·물고기 id(FISH) → 개수. 나중에 상점에 판다
  dex: { map: 'uint16' }, // 도감: 잡아 본 물고기 id → 지금까지 잡은 마릿수
  xp: 'uint32', // 지금까지 모은 경험치 (레벨은 levelOf 로 계산)
  job: 'string', // 직업 (JOBS 열쇠, 비어 있으면 모험가). 스텟은 레벨·직업으로 계산
  fps: 'uint8', // 선생님 관찰용 (tools/observe.js): 화면이 10초마다 알려 주는 평균 FPS · 가장 느린 0.5초의 FPS · 가장 긴 장면(×10ms) · 화질
  fpsLow: 'uint8',
  hitch: 'uint8',
  gq: 'uint8',
  pl: 'string', // 가장 긴 '긴 장면': 길이|막은 시간|코드 두 개 (어디서 불렸나:함수@파일:위치:ms)
  pd: 'string', // 가장 긴 장면의 진단값 (숫자를 쉼표로): 계산·그리기·그리기 뒤·장면 밖 ms, 새 셰이더·텍스처·도형 수, 그리기 횟수, 들판, 메모리 MB
  cuff: 'boolean', // 수갑 (친구를 너무 많이 때린 벌): 찬 동안은 움직이지 못한다
  s: 'uint16', // 이 자리를 보낸 때 (보낸 쪽 시계, 10ms 단위로 1~65535 를 돈다. 0 = 모름): 받는 쪽이 자리 사이 간격을 고르게 잡는 데 쓴다
}, 'Player');

// 땅에 떨어진 과일 (누구나 주울 수 있음)
const Drop = schema({
  x: 'int16', // cm
  z: 'int16', // cm
  f: 'string', // 과일 이름 (FRUITS) 또는 목재 id (WOODS)
  k: 'int8', // 떨어진 과일나무 번호 (떨어지는 연출용)
  t: 'int16', // 목재: 찍은 나무 번호 + 1 (광장 체험용 나무는 음수, 0 이면 없음 · 떨어지는 연출용)
}, 'Drop');

// 마을의 곤충 (누구나 잠자리채로 잡을 수 있음, 움직임은 서버가 정함: server/bugs.js)
const Bug = schema({
  s: 'string', // 곤충 종류 (BUGS id)
  x: 'int16', // cm
  z: 'int16', // cm
  y: 'uint16', // 높이 cm
  r: 'uint8', // 바라보는 방향 0~255
  f: 'uint8', // 1 이면 날거나 뛰는 중 (날개짓·다리 동작)
}, 'Bug');

// 삽으로 판 구덩이 (누구나 덮을 수 있음)
const Hole = schema({
  x: 'int16', // cm
  z: 'int16', // cm
  k: 'string', // 'grass' 풀밭(흙) · 'sand' 모래
}, 'Hole');

// 화석 자리: 땅에 금(✱)이 그려진 곳. 여기를 파면 화석이 나온다
const FossilSpot = schema({
  x: 'int16', // cm
  z: 'int16', // cm
}, 'FossilSpot');

// 구덩이에 심은 과일·꽃 (새싹 → 자라는 중 → 다 자람)
const Plant = schema({
  x: 'int16', // cm
  z: 'int16', // cm
  f: 'string', // 심은 것: 과일 이름(FRUITS) 또는 꽃씨 id(SEEDS)
  g: 'uint8', // 자란 단계 0 새싹 · 1 자라는 중 · 2 다 자람
}, 'Plant');

const VillageState = schema({
  players: { map: Player },
  freeLook: 'boolean',
  fruitLeft: ['uint8'], // 과일나무마다 남은 과일 개수 (WORLD.fruitTrees 순서)
  drops: { map: Drop }, // 땅에 떨어진 과일·목재: 번호 → 자리
  bugs: { map: Bug }, // 곤충: 번호 → 종류·자리
  holes: { map: Hole }, // 삽으로 판 구덩이: 번호 → 자리
  rocksGone: { map: 'uint8' }, // 삽으로 깨뜨려 지금 없는 바위: 바위 번호 → 1
  plants: { map: Plant }, // 구덩이에 심은 과일·꽃: 번호 → 자리·단계
  fossils: { map: FossilSpot }, // 화석 자리: 번호 → 자리
}, 'VillageState');

// ── 전송량 측정 ──
const traffic = { out: 0, in: 0 };
function meter(client) {
  const ws = client.ref;
  if (!ws || ws.__metered) return;
  ws.__metered = true;
  const send = ws.send.bind(ws);
  ws.send = (data, ...rest) => {
    traffic.out += data?.byteLength ?? data?.length ?? 0;
    return send(data, ...rest);
  };
  ws.on?.('message', (d) => { traffic.in += d?.byteLength ?? d?.length ?? 0; });
}

// ── 끊긴 까닭 (선생님이 기록으로 보는 용도) ──
// 학생 화면이 닫히며 보내는 'bye' 의 까닭 → 기록에 쓰는 말 (없으면 학생이 직접 새로 고치거나 탭을 닫은 것)
const BYE_WHY = { low: '가벼운 모드로 바꾸려고 새로 고침', reset: '화질을 처음으로 되돌리려고 새로 고침', reload: '서버가 다시 켜져 새로 고침' };
// 연결이 닫힐 때의 코드와, 서버가 응답 없는 연결을 끊은 것인지를 적어 둔다 (onLeave 에서 까닭을 적으려고)
function watchClose(client) {
  const ws = client.ref;
  if (!ws?.prependListener || ws.__watched) return;
  ws.__watched = true;
  ws.prependListener('close', (code) => {
    ws.__closeCode = code;
    ws.__noAnswer = ws.pingCount >= PING_RETRIES; // 서버가 확인을 보냈는데 답이 없어 끊음 = 와이파이 끊김·기기 잠듦
  });
}
function leaveWhy(client, bye) {
  if (bye !== undefined) return BYE_WHY[bye] ?? '학생이 직접 새로 고치거나 탭을 닫음';
  const ws = client.ref;
  if (ws?.__noAnswer) return `응답 없음 ${(PING_MS * PING_RETRIES) / 1000}초 넘게 (와이파이 끊김·기기 잠듦)`;
  if (ws?.__closeCode === 1001) return '탭이 닫히거나 다른 곳으로 감 (알림 없이)';
  return `연결이 갑자기 끊김 (코드 ${ws?.__closeCode ?? '?'})`;
}

function cleanName(n) {
  const s = String(n ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 10);
  return s || '학생';
}

class VillageRoom extends Room {
  maxClients = MAX_CLIENTS;

  onCreate() {
    this.setState(new VillageState());
    if (!this.state.players) this.state.players = new MapSchema();
    this.state.freeLook = FREE_LOOK;
    this.state.fruitLeft = new ArraySchema(...WORLD.fruitTrees.map(() => FRUIT_MAX));
    if (!this.state.drops) this.state.drops = new MapSchema();
    this.state.holes = new MapSchema();
    this.state.rocksGone = new MapSchema();
    this.state.plants = new MapSchema();
    this.state.fossils = new MapSchema();
    this.fossilId = 0;
    for (let i = 0; i < FOSSIL_SPOTS.village; i++) this.addFossilSpot(false);
    for (let i = 0; i < FOSSIL_SPOTS.field; i++) this.addFossilSpot(true);
    if (!this.state.bugs) this.state.bugs = new MapSchema();
    // 학생마다 지금 움직이는 빠르기 (곤충이 놀라는지 볼 때 씀): 0.4초 넘게 움직임이 없으면 멈춘 것으로 본다
    this.speeds = new Map();
    setupBugs(this, Bug, (sid) => {
      const v = this.speeds.get(sid);
      return v && Date.now() - v.t < 400 ? v.v : 0;
    });
    this.regrow = []; // 다시 열릴 과일: { k: 나무 번호, at: 시각(ms) }
    this.dropAt = new Map(); // 떨어진 과일 번호 → 사라질 시각(ms)
    this.dropId = 0;
    // 떨어뜨린 과일은 FRUIT_REGROW 초 뒤에 하나씩 다시 열리고, 오래 안 주운 과일은 사라진다
    this.clock.setInterval(() => {
      const now = Date.now();
      this.regrow = this.regrow.filter(({ k, at }) => {
        if (at > now) return true;
        this.state.fruitLeft[k] = Math.min(FRUIT_MAX, this.state.fruitLeft[k] + 1);
        return false;
      });
      for (const [id, at] of this.dropAt) {
        if (at > now) continue;
        this.dropAt.delete(id);
        this.state.drops.delete(id);
      }
    }, 1000);

    // 과일나무 흔들기: [과일나무 번호]. 나무 가까이 있으면 남은 과일 중 3~4개가 나무 둘레 땅에 떨어진다
    this.onMessage('shake', (client, k) => {
      const p = this.state.players.get(client.sessionId);
      k = Number(k);
      if (!p || !Number.isInteger(k) || k < 0 || k >= WORLD.fruitTrees.length) return;
      const now = Date.now();
      if (now - (client.userData?.shakeAt ?? 0) < 600) return; // 너무 빠른 연속 흔들기는 무시
      const t = WORLD.trees[WORLD.fruitTrees[k]];
      if (Math.hypot(fromCm(p.x) - t.x, fromCm(p.z) - t.z) > t.r + PICK_REACH) return;
      const left = this.state.fruitLeft[k];
      if (left <= 0) return;
      client.userData = { ...client.userData, shakeAt: now };
      const [lo, hi] = SHAKE_DROP;
      const n = Math.min(left, lo + Math.floor(Math.random() * (hi - lo + 1)));
      this.state.fruitLeft[k] = left - n;
      for (let i = 0; i < n; i++) {
        // 나무 둘레 고리 모양 자리에 흩어진다 (갈 수 없는 곳은 피함)
        let x = t.x;
        let z = t.z + t.r + 0.6;
        for (let tries = 0; tries < 12; tries++) {
          const a = Math.random() * Math.PI * 2;
          const d = t.r + 0.45 + Math.random() * 0.8;
          const tx = t.x + Math.cos(a) * d;
          const tz = t.z + Math.sin(a) * d;
          if (!isBlocked(tx, tz, 0.15)) { x = tx; z = tz; break; }
        }
        const id = String(++this.dropId);
        const d = new Drop();
        d.x = toCm(x);
        d.z = toCm(z);
        d.f = fruitOf(k);
        d.k = k;
        this.state.drops.set(id, d);
        this.dropAt.set(id, now + DROP_LIFE * 1000);
        this.regrow.push({ k, at: now + FRUIT_REGROW * 1000 });
      }
    });

    // ── 낚시: 던지기(cast) → 서버가 물고기와 그 물고기가 오는 흐름(나타남·톡톡·덥석)을 정해 알려 줌(fishOn)
    //    → 학생이 G를 누르면(reel) 덥석 문 뒤 정해진 시간 안이었는지 서버가 판정한다 (너무 이르면 도망, 늦으면 놓침)
    this.fishing = new Map(); // sessionId → { id, fish, biteAt, react, timer }
    this.fishId = 0;
    const stopFishing = (sid) => {
      const f = this.fishing.get(sid);
      if (f) { f.timer?.clear(); this.fishing.delete(sid); }
    };
    this.stopFishing = stopFishing;
    const between = ([lo, hi]) => lo + Math.random() * (hi - lo);
    // 던지기: [바라보는 방향(0~255)]. 바라보는 쪽 앞에 떨어진 찌가 물속인지 확인하고 기록만 한다
    // (물고기는 지나가던 물고기가 찌를 알아채야 온다)
    this.onMessage('cast', (client, dir) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      const x = fromCm(p.x);
      const z = fromCm(p.z);
      const rot = byteToAngle(Number(dir) & 255);
      const where = waterNear(x, z) && waterAt(x + Math.sin(rot) * BOB_AHEAD, z + Math.cos(rot) * BOB_AHEAD);
      if (!where) return;
      stopFishing(client.sessionId);
      this.fishing.set(client.sessionId, { id: 0, where, castAt: Date.now(), fish: null, timer: null });
    });
    // 알아챔: [그림자 몸길이(m)]. 찌 앞을 지나던 물고기가 다가오기 시작함 → 그 그림자 크기에 맞는 물고기를 정하고
    // 오는 흐름(헤엄쳐 옴 → 톡톡 4~5번 → 덥석)을 알려 준다 (물고기 이름은 잡을 때까지 비밀)
    this.onMessage('interest', (client, len) => {
      const f = this.fishing.get(client.sessionId);
      len = Number(len);
      if (!f || f.fish || !Number.isFinite(len) || Date.now() - f.castAt > 120000) return;
      const fish = fishForShadow(f.where, Math.max(0.3, Math.min(2.4, sizeOfShadow(len))));
      const nibbles = [];
      let t = FISH_APPROACH * 1000;
      const n = Math.random() < 0.5 ? 4 : 5;
      for (let k = 0; k < n; k++) {
        nibbles.push(Math.round(t));
        t += between(NIBBLE_GAP) * 1000;
      }
      const biteAt = Math.round(nibbles[n - 1] + between(BITE_AFTER) * 1000);
      const react = RARITY[fish.rarity].react;
      const id = ++this.fishId;
      Object.assign(f, { id, fish, biteAt: Date.now() + biteAt, react });
      // 아무도 안 누르면 덥석 문 뒤 잠시 있다가 도망감
      f.timer = this.clock.setTimeout(() => {
        if (this.fishing.get(client.sessionId) !== f) return;
        this.fishing.delete(client.sessionId);
        client.send('escaped', 'late');
      }, biteAt + (react + REEL_SLACK + 0.5) * 1000);
      client.send('fishOn', { id, nibbles, bite: biteAt, react });
    });
    this.onMessage('cancelFish', (client) => stopFishing(client.sessionId));
    // 낚아채기(G): [번호]. 덥석 문 순간부터 react 초 안이면 잡힘, 그 전(톡톡 중)이면 놀라 도망, 지나면 놓침
    this.onMessage('reel', (client, msg) => {
      const p = this.state.players.get(client.sessionId);
      const f = this.fishing.get(client.sessionId);
      const id = Array.isArray(msg) ? msg[0] : msg;
      if (!p || !f || !f.id || id !== f.id) return;
      stopFishing(client.sessionId);
      const dt = (Date.now() - f.biteAt) / 1000;
      if (dt < -0.12) { client.send('escaped', 'early'); return; }
      if (dt > f.react + REEL_SLACK) { client.send('escaped', 'late'); return; }
      const have = p.bag.get(f.fish.id) ?? 0;
      if (have >= BAG_MAX) { client.send('escaped', 'full'); return; }
      p.bag.set(f.fish.id, have + 1);
      p.dex.set(f.fish.id, Math.min(65535, (p.dex.get(f.fish.id) ?? 0) + 1));
      p.xp += XP.fish * RARITY[f.fish.rarity].stars;
      this.broadcast('caught', [client.sessionId, f.fish.id]); // 모두의 화면에서 머리 위로 물고기를 들어 보임
    });

    // 도끼로 나무 찍기: [나무 번호] (광장 체험용 나무는 -(번호+1)). 찍을 때마다 목재가 하나 나무 밑동(찍은 쪽)에 떨어진다.
    // 한 그루에서 WOOD_STOCK 개가 나오면 잠시 쉬고, WOOD_REGROW 초마다 하나씩 다시 찬다
    this.woodLeft = new Map(); // 나무 번호 → { n: 남은 개수, at: 다음에 하나 차는 시각 }
    this.onMessage('chop', (client, i) => {
      const p = this.state.players.get(client.sessionId);
      i = Number(i);
      if (!p || !Number.isInteger(i)) return;
      const t = i >= 0 ? WORLD.trees[i] : FREE_LOOK && LIFE_SPOTS[-i - 1]?.kind === 'tree' ? { ...LIFE_SPOTS[-i - 1], r: 0.25 } : null;
      if (!t) return;
      const px = fromCm(p.x);
      const pz = fromCm(p.z);
      if (Math.hypot(px - t.x, pz - t.z) > t.r + CHOP_REACH) return;
      const now = Date.now();
      if (now - (client.userData?.chopAt ?? 0) < 400) return; // 너무 빠른 연속 찍기는 무시
      client.userData = { ...client.userData, chopAt: now };
      const w = this.woodLeft.get(i) ?? { n: WOOD_STOCK, at: 0 };
      while (w.n < WOOD_STOCK && w.at && now >= w.at) { w.n += 1; w.at = w.n < WOOD_STOCK ? w.at + WOOD_REGROW * 1000 : 0; }
      if (w.n <= 0) { this.woodLeft.set(i, w); client.send('woodRest'); return; }
      w.n -= 1;
      if (!w.at) w.at = now + WOOD_REGROW * 1000;
      this.woodLeft.set(i, w);
      // 찍은 사람의 왼쪽이나 오른쪽 옆 밑동 둘레에 툭 (정면이면 발밑에 깔려 안 보인다 · 갈 수 없는 곳은 피함)
      const base = Math.atan2(px - t.x, pz - t.z);
      let x = t.x + Math.sin(base + 1) * (t.r + 0.5);
      let z = t.z + Math.cos(base + 1) * (t.r + 0.5);
      for (let tries = 0; tries < 10; tries++) {
        const a = base + (Math.random() < 0.5 ? -1 : 1) * (0.75 + Math.random() * 0.7);
        const d = t.r + 0.35 + Math.random() * 0.45;
        const tx = t.x + Math.sin(a) * d;
        const tz = t.z + Math.cos(a) * d;
        if (!isBlocked(tx, tz, 0.15)) { x = tx; z = tz; break; }
      }
      const id = String(++this.dropId);
      const d = new Drop();
      d.x = toCm(x);
      d.z = toCm(z);
      d.f = rollWood(i);
      d.k = -1;
      d.t = i >= 0 ? i + 1 : i;
      this.state.drops.set(id, d);
      this.dropAt.set(id, now + DROP_LIFE * 1000);
      // 과일나무를 찍으면 흔들린 가지에서 과일도 하나 떨어진다 (남은 과일이 있을 때. 흔들기처럼 나중에 다시 열린다)
      const k = WORLD.fruitTrees.indexOf(i);
      if (k >= 0 && this.state.fruitLeft[k] > 0) {
        this.state.fruitLeft[k] -= 1;
        let fx = t.x;
        let fz = t.z + t.r + 0.6;
        for (let tries = 0; tries < 12; tries++) {
          const a = Math.random() * Math.PI * 2;
          const r = t.r + 0.45 + Math.random() * 0.8;
          const tx = t.x + Math.cos(a) * r;
          const tz = t.z + Math.sin(a) * r;
          if (!isBlocked(tx, tz, 0.15) && Math.hypot(tx - x, tz - z) > 0.4) { fx = tx; fz = tz; break; }
        }
        const fid = String(++this.dropId);
        const f = new Drop();
        f.x = toCm(fx);
        f.z = toCm(fz);
        f.f = fruitOf(k);
        f.k = k;
        this.state.drops.set(fid, f);
        this.dropAt.set(fid, now + DROP_LIFE * 1000);
        this.regrow.push({ k, at: now + FRUIT_REGROW * 1000 });
      }
    });

    // ── 삽 ──
    // 파기: [x, z](cm). 몸 가까이의 풀밭·모래만, 다른 구덩이와 겹치지 않게. 너무 많으면 오래된 것부터 메워진다
    // 덮기: [구덩이 번호]. 바위 치기: [바위 번호]. ROCK_HP 번 치면 깨져 돌멩이가 떨어지고, ROCK_REGROW 초 뒤 다시 생긴다
    this.holeId = 0;
    this.rockHp = new Map(); // 바위 번호 → 남은 체력
    const shovelReady = (client) => {
      const now = Date.now();
      if (now - (client.userData?.shovelAt ?? 0) < 450) return false; // 너무 빠른 연속 삽질은 무시
      client.userData = { ...client.userData, shovelAt: now };
      return true;
    };
    this.onMessage('dig', (client, at) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || !Array.isArray(at) || !shovelReady(client)) return;
      const x = Number(at[0]) / 100;
      const z = Number(at[1]) / 100;
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      if (Math.hypot(x - fromCm(p.x), z - fromCm(p.z)) > DIG_HOLE.reach) return;
      const k = groundKind(x, z);
      if (!k) return;
      for (const h of this.state.holes.values()) if (Math.hypot(fromCm(h.x) - x, fromCm(h.z) - z) < DIG_HOLE.r * 2) return;
      for (const pl of this.state.plants.values()) if (Math.hypot(fromCm(pl.x) - x, fromCm(pl.z) - z) < DIG_HOLE.r * 1.6) return; // 심은 자리는 못 판다
      if (this.state.holes.size >= DIG_HOLE.max) this.state.holes.delete(this.state.holes.keys().next().value);
      const h = new Hole();
      h.x = toCm(x);
      h.z = toCm(z);
      h.k = k;
      this.state.holes.set(String(++this.holeId), h);
      // 화석 자리(✱)를 팠으면 화석이 나와 구덩이 옆에 놓이고, 그 자리는 사라졌다가 다른 곳에 새로 생긴다
      let spot = null;
      for (const [sid, f] of this.state.fossils) if (Math.hypot(fromCm(f.x) - x, fromCm(f.z) - z) < FOSSIL_SPOTS.reach) spot = sid;
      if (spot) {
        const field = inField(fromCm(this.state.fossils.get(spot).x), fromCm(this.state.fossils.get(spot).z));
        this.state.fossils.delete(spot);
        this.clock.setTimeout(() => this.addFossilSpot(field), FOSSIL_SPOTS.respawn * 1000);
        const px = fromCm(p.x) - x;
        const pz = fromCm(p.z) - z;
        const L = Math.hypot(px, pz) || 1;
        const side = Math.random() < 0.5 ? 1 : -1;
        const d = new Drop();
        d.x = toCm(x + (px / L) * 0.15 + (pz / L) * 0.75 * side); // 구덩이 옆 (판 학생 발밑이 아니라)
        d.z = toCm(z + (pz / L) * 0.15 - (px / L) * 0.75 * side);
        d.f = pickFossil().id;
        d.k = -1;
        const id = String(++this.dropId);
        this.state.drops.set(id, d);
        this.dropAt.set(id, Date.now() + DROP_LIFE * 1000);
      }
    });
    // 심기: [구덩이 번호, 심을 것]. 가방의 과일·꽃 하나를 구덩이에 넣고 덮는다. 단계마다 PLANT.grow 초 뒤에 자란다
    this.plantId = 0;
    this.onMessage('plant', (client, msg) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || !Array.isArray(msg) || !shovelReady(client)) return;
      const hid = String(msg[0]);
      const key = String(msg[1]); // 가방 열쇠: 심을 것 (파낸 것이면 '심은것@단계')
      const h = this.state.holes.get(hid);
      const kind = plantKind(key);
      if (!h || !kind || !(p.bag.get(key) > 0)) return;
      const { item, g: from } = plantItem(key);
      if (Math.hypot(fromCm(h.x) - fromCm(p.x), fromCm(h.z) - fromCm(p.z)) > DIG_HOLE.reach + 0.3) return;
      this.state.holes.delete(hid);
      const left = p.bag.get(key) - 1;
      if (left > 0) p.bag.set(key, left); else p.bag.delete(key);
      if (this.state.plants.size >= PLANT.max) this.state.plants.delete(this.state.plants.keys().next().value);
      const pl = new Plant();
      pl.x = h.x;
      pl.z = h.z;
      pl.f = item;
      pl.g = from;
      const id = String(++this.plantId);
      this.state.plants.set(id, pl);
      // 파냈다가 다시 심은 것은 자라던 단계부터 이어서 자란다
      const grow = PLANT.grow[FREE_LOOK ? 'test' : 'real'][kind];
      grow.forEach((sec, i) => {
        if (i < from) return;
        this.clock.setTimeout(() => {
          const cur = this.state.plants.get(id);
          if (cur === pl) cur.g = i + 1;
        }, (sec - (from > 0 ? grow[from - 1] : 0)) * 1000);
      });
    });
    // 파내기: [심은 것 번호]. 삽으로 파서 가방에 넣고(자란 단계 그대로), 그 자리는 구덩이가 된다 (다른 곳에 다시 심을 수 있다)
    this.onMessage('unplant', (client, id) => {
      const p = this.state.players.get(client.sessionId);
      const pl = this.state.plants.get(String(id));
      if (!p || !pl || !shovelReady(client)) return;
      if (Math.hypot(fromCm(pl.x) - fromCm(p.x), fromCm(pl.z) - fromCm(p.z)) > DIG_HOLE.reach + 0.3) return;
      const key = pl.g > 0 ? `${pl.f}@${pl.g}` : pl.f;
      const have = p.bag.get(key) ?? 0;
      if (have >= BAG_MAX) return;
      this.state.plants.delete(String(id));
      p.bag.set(key, have + 1);
      const h = new Hole();
      h.x = pl.x;
      h.z = pl.z;
      h.k = groundKind(fromCm(pl.x), fromCm(pl.z)) ?? 'grass';
      this.state.holes.set(String(++this.holeId), h);
    });
    this.onMessage('fill', (client, id) => {
      const p = this.state.players.get(client.sessionId);
      const h = this.state.holes.get(String(id));
      if (!p || !h || !shovelReady(client)) return;
      if (Math.hypot(fromCm(h.x) - fromCm(p.x), fromCm(h.z) - fromCm(p.z)) > DIG_HOLE.reach + 0.3) return;
      this.state.holes.delete(String(id));
    });
    this.onMessage('smash', (client, i) => {
      const p = this.state.players.get(client.sessionId);
      i = Number(i);
      const r = WORLD.rocks[i];
      if (!p || !r || this.state.rocksGone.has(String(i)) || !shovelReady(client)) return;
      if (Math.hypot(r.x - fromCm(p.x), r.z - fromCm(p.z)) > r.r + DIG_HOLE.reach) return;
      const hp = (this.rockHp.get(i) ?? ROCK_HP) - 1;
      this.broadcast('rockHit', [client.sessionId, i, hp]); // 모두의 화면에서 바위가 흔들리고 조각이 튄다
      if (hp > 0) { this.rockHp.set(i, hp); return; }
      // 깨짐: 바위가 사라지고 그 자리에 돌이 두세 개 (가끔 반짝이는 돌)
      this.rockHp.delete(i);
      this.state.rocksGone.set(String(i), 1);
      ROCKS_GONE.add(i);
      const now = Date.now();
      const n = 2 + (Math.random() < 0.4 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * r.r * 0.8;
        const dr = new Drop();
        dr.x = toCm(r.x + Math.cos(a) * d);
        dr.z = toCm(r.z + Math.sin(a) * d);
        dr.f = Math.random() < 0.15 ? 'shinystone' : 'stone';
        dr.k = -1;
        const id = String(++this.dropId);
        this.state.drops.set(id, dr);
        this.dropAt.set(id, now + DROP_LIFE * 1000);
      }
      this.clock.setTimeout(() => {
        this.state.rocksGone.delete(String(i));
        ROCKS_GONE.delete(i);
      }, ROCK_REGROW * 1000);
    });

    // 꽃 꺾기: [꽃 번호 (WORLD.flowers)]. 가까이 있으면 그 색 꽃 하나를 가방에 넣는다 (꽃은 그대로 남는다)
    this.onMessage('pickFlower', (client, i) => {
      const p = this.state.players.get(client.sessionId);
      const f = WORLD.flowers[Number(i)];
      if (!p || !f) return;
      const now = Date.now();
      if (now - (client.userData?.flowerAt ?? 0) < 500) return;
      if (Math.hypot(fromCm(p.x) - f.x, fromCm(p.z) - f.z) > PICK_FLOWER_REACH + 0.4) return;
      const item = FLOWER_ITEMS[f.c % FLOWER_ITEMS.length].id;
      const have = p.bag.get(item) ?? 0;
      if (have >= BAG_MAX) return;
      client.userData = { ...client.userData, flowerAt: now };
      p.bag.set(item, have + 1);
      p.xp += XP.grab;
    });

    // 떨어진 과일·목재 줍기: [번호]. 가까이 있을 때만 가방에 넣는다
    this.onMessage('grab', (client, id) => {
      const p = this.state.players.get(client.sessionId);
      const d = this.state.drops.get(String(id));
      if (!p || !d) return;
      if (Math.hypot(fromCm(p.x) - fromCm(d.x), fromCm(p.z) - fromCm(d.z)) > GRAB_REACH + 0.4) return;
      const have = p.bag.get(d.f) ?? 0;
      if (have >= BAG_MAX) return;
      this.state.drops.delete(String(id));
      this.dropAt.delete(String(id));
      p.bag.set(d.f, have + 1);
      p.xp += XP.grab;
    });

    // 전직: [직업 열쇠]. JOB_LEVEL 이 되어야 하고, 다른 직업으로 다시 바꿀 수도 있다 (모험가로 되돌리기는 안 됨)
    this.onMessage('job', (client, job) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || typeof job !== 'string' || !JOBS[job]?.main || levelOf(p.xp).lv < JOB_LEVEL) return;
      p.job = job;
    });

    // 몬스터를 쓰러뜨림: 몬스터는 화면이 판정하므로 서버는 얼마나 자주 오는지만 본다
    // (한꺼번에 3마리까지, 그 뒤로는 2초에 1마리꼴로만 쳐 준다)
    // 경험치는 몬스터 종류·레벨마다 (killXp: 나보다 많이 낮은 몬스터는 덜 줌, 모르는 종류면 XP.monster)
    // { kind, lv } 로 오고, 예전 화면은 종류 글자만 보낸다 (그때는 그 종류의 기본 레벨)
    // id 가 있는 몬스터(광장·들판 일반 몬스터)는 함께 싸운 사람 모두에게 기여도대로 나눈다 (shareXp)
    this.onMessage('kill', (client, msg) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      const now = Date.now();
      const u = client.userData ?? {};
      const b = Math.min(3, (u.killB ?? 3) + (now - (u.killAt ?? now)) / 2000);
      client.userData = { ...u, killAt: now, killB: Math.max(0, b - 1) };
      if (b < 1) return;
      const kind = typeof msg === 'string' ? msg : msg?.kind;
      const lv = Number.isFinite(msg?.lv) ? msg.lv : undefined;
      const known = typeof kind === 'string' && Object.hasOwn(MONSTERS, kind);
      const id = monId(msg?.id);
      if (id && known) {
        if (this.monKilled.get(id) > now - MON_KILL_DUP) return; // 둘이 거의 같이 막타를 쳤다: 한 번만 나눈다
        this.monKilled.set(id, now);
        const f = this.monFight.get(id);
        this.monFight.delete(id);
        if (f) {
          const got = shareXp((sid) => killXp(kind, lv, levelOf(this.state.players.get(sid)?.xp ?? 0).lv), f.dealt, f.taken);
          for (const [sid, xp] of got) { const q = this.state.players.get(sid); if (q) q.xp += xp; }
          if (got.size) return;
        }
      }
      p.xp += known ? killXp(kind, lv, levelOf(p.xp).lv) : XP.monster;
    });
    // 몬스터 피해 나누기: 몬스터는 각자 화면이 움직이므로, 누가 때린 피해(그 화면에서 굴린 값)를 모두에게 그대로 전해
    // 모든 화면에서 체력이 같게 깎이도록 한다. 서버는 기여도(준 피해·받은 피해)를 세어 쓰러뜨리면 경험치를 나눈다
    // monHit: [몬스터 id, 때린 자리 x, z(cm), 피해 ×10, 맞힘(0 빗나감 · 1 보통 · 2 치명타)] · monHurt: [몬스터 id, 받은 피해 ×10]
    this.monFight = new Map(); // 몬스터 id → { dealt: Map(sid → 피해), taken: Map(sid → 피해), at: 마지막으로 맞은 시각 }
    this.monKilled = new Map(); // 몬스터 id → 쓰러뜨린 시각 (같은 몬스터를 두 번 나누지 않게)
    const fightOf = (id, now) => {
      let f = this.monFight.get(id);
      if (!f || now - f.at > forgetOf(id)) { f = { dealt: new Map(), taken: new Map(), at: now }; this.monFight.set(id, f); } // 오래 안 맞으면 몬스터 체력도 다시 차므로 처음부터
      return f;
    };
    this.onMessage('monHit', (client, m) => {
      if (!Array.isArray(m) || !this.state.players.has(client.sessionId)) return;
      const id = monId(m[0]);
      const [x, z, d10, k] = m.slice(1).map(Number);
      if (!id || ![x, z, d10, k].every(Number.isFinite)) return;
      const dmg = Math.max(0, Math.min(MON_HIT_MAX, d10 / 10));
      const now = Date.now();
      const f = fightOf(id, now);
      f.at = now;
      if (dmg > 0) f.dealt.set(client.sessionId, (f.dealt.get(client.sessionId) ?? 0) + dmg);
      this.broadcast('monHit', [client.sessionId, id, Math.round(x), Math.round(z), Math.round(dmg * 10), k === 2 ? 2 : k ? 1 : 0], { except: client });
    });
    this.onMessage('monHurt', (client, m) => {
      if (!Array.isArray(m) || !this.state.players.has(client.sessionId)) return;
      const id = monId(m[0]);
      const dmg = Math.max(0, Math.min(MON_HIT_MAX, Number(m[1]) / 10));
      if (!id || !(dmg > 0)) return;
      const f = fightOf(id, Date.now());
      f.taken.set(client.sessionId, (f.taken.get(client.sessionId) ?? 0) + dmg);
    });
    // 보스 졸개 소환: 보스는 각자 화면이 움직이므로 쏟으려 한 화면이 알려 오면, 서버가 졸개 이름을 정해 모두에게 같이 전한다
    // (BOSS_SPILL_GAP 안에 또 오면 무시: 여러 화면의 보스가 거의 같이 쏟으려 해도 한 번만) · bossSpill: [보스 id, 종류 번호 셋]
    this.bossSpillAt = new Map(); // 보스 id → 마지막으로 쏟은 시각
    this.minionSeq = 0;
    this.onMessage('bossSpill', (client, m) => {
      if (!Array.isArray(m) || !this.state.players.has(client.sessionId)) return;
      const id = monId(m[0]);
      const kinds = m.slice(1, 4).map(Number);
      if (!id || id[0] !== 'b' || kinds.length !== 3 || !kinds.every((k) => Number.isInteger(k) && k >= 0 && k < 10)) return;
      const now = Date.now();
      if (now - (this.bossSpillAt.get(id) ?? 0) < BOSS_SPILL_GAP) return;
      this.bossSpillAt.set(id, now);
      const ids = kinds.map(() => `m${(this.minionSeq = (this.minionSeq % 9999) + 1)}`);
      this.broadcast('bossSpill', [id, kinds, ids]);
    });
    // ── 몬스터 맡기기: 몬스터는 화면이 움직이므로, 몬스터마다 가장 가까운 학생 한 명의 화면이 할 일(쫓기·도망·공격)을 정하고
    // 그 상태(monSync)를 다른 학생에게 전한다. 다른 화면은 받은 대로 따라 그려서 모두의 화면에서 같게 보인다
    // monNear: [[몬스터 id, 거리 cm], …] 화면이 1초마다 둘레(MON_CLAIM m 안) 몬스터를 알려 옴 → 가장 가까운 학생에게 맡김
    // (맡은 학생보다 MON_SWITCH m 넘게 더 가까운 학생이 오면 넘김: 비슷한 거리에서 자꾸 바뀌지 않게)
    // monOwn: [몬스터 id, 1 맡음 | 0 그만] 해당 학생에게만 · monSync: [[몬스터 id, …상태], …] 맡은 학생 → 다른 모두
    this.monOwner = new Map(); // 몬스터 id → { sid, d: 거리(m), at: 마지막으로 알려 온 시각 }
    const setOwner = (id, sid) => {
      const cur = this.monOwner.get(id);
      if (cur?.sid === sid) return;
      if (cur) this.clients.getById(cur.sid)?.send('monOwn', [id, 0]);
      if (sid) this.clients.getById(sid)?.send('monOwn', [id, 1]);
    };
    this.freeMonsters = (sid) => { // 나간 학생이 맡던 몬스터를 풀어 줌 (다음 monNear 때 다른 학생에게)
      for (const [id, o] of this.monOwner) if (o.sid === sid) this.monOwner.delete(id);
    };
    this.onMessage('monNear', (client, list) => {
      if (!Array.isArray(list) || !this.state.players.has(client.sessionId)) return;
      const now = Date.now();
      const sid = client.sessionId;
      for (const e of list.slice(0, 80)) {
        if (!Array.isArray(e)) continue;
        const id = monId(e[0]);
        const d = Number(e[1]) / 100;
        if (!id || !Number.isFinite(d) || d < 0 || d > MON_CLAIM) continue;
        const cur = this.monOwner.get(id);
        if (cur && cur.sid === sid) { cur.d = d; cur.at = now; continue; }
        if (cur && now - cur.at < MON_STALE && d + MON_SWITCH >= cur.d) continue; // 맡은 학생이 아직 가까이 있음
        setOwner(id, sid);
        this.monOwner.set(id, { sid, d, at: now });
      }
    });
    this.onMessage('monSync', (client, list) => {
      if (!Array.isArray(list)) return;
      const sid = client.sessionId;
      const mine = list.slice(0, 80).filter((e) => Array.isArray(e) && e.length <= 12 && this.monOwner.get(monId(e[0]))?.sid === sid);
      if (!mine.length) return;
      // 맡은 학생과 같은 맵(들판/마을)에 있는 학생에게만: 몬스터는 가까운 학생이 맡으므로 맡은 학생 맵 = 몬스터 맵
      const onMap = (q) => q && inField(fromCm(q.x), fromCm(q.z));
      const field = onMap(this.state.players.get(sid));
      for (const c of this.clients) if (c !== client && onMap(this.state.players.get(c.sessionId)) === field) c.send('monSync', mine);
    });
    this.clock.setInterval(() => { // 오랫동안 알려 오지 않는 학생(멀리 갔거나 다른 맵)이 맡던 몬스터는 풀어 줌
      const now = Date.now();
      for (const [id, o] of this.monOwner) if (now - o.at > MON_STALE) { setOwner(id, null); this.monOwner.delete(id); }
    }, 1000);
    this.clock.setInterval(() => { // 오래된 기록 치우기
      const now = Date.now();
      for (const [id, f] of this.monFight) if (now - f.at > forgetOf(id)) this.monFight.delete(id);
      for (const [id, t] of this.monKilled) if (now - t > MON_KILL_DUP) this.monKilled.delete(id);
    }, 30000);
    this.patchRate = 100; // 초당 10회만 바뀐 부분 전송
    this.last = new Map(); // sessionId → 마지막으로 인정한 위치와 시각
    this.bye = new Map(); // 화면을 닫는다고 알려 온 sessionId → 까닭 (BYE_WHY, 없으면 '')
    this.waiting = new Map(); // 다시 접속하기를 기다리는 sessionId → { name, wait }

    this.onMessage('bye', (client, why) => this.bye.set(client.sessionId, typeof why === 'string' ? why.slice(0, 10) : ''));

    // 친구 때리기 벌: 맞은 학생 화면이 [때린 학생 번호]를 알린다. 10분 안에 10번 때리면 1분 동안 수갑을 차고 꼼짝 못 함 (Player.cuff)
    // 이름으로 기억해, 새로 고치거나 다시 들어와도 남은 시간만큼 다시 찬다
    this.pvpHits = new Map(); // 때린 학생 이름 → 때린 시각들
    this.cuffUntil = new Map(); // 이름 → 수갑이 풀리는 시각
    this.onMessage('pvp', (client, sid) => {
      const now = Date.now();
      const p = this.state.players.get(sid);
      if (!p || sid === client.sessionId || !this.state.players.has(client.sessionId)) return;
      if (now - (client.userData?.pvpAt ?? 0) < 400) return; // 맞은 쪽이 너무 잦게 알리면 무시 (아파하는 동안은 또 맞지 않는다)
      client.userData = { ...client.userData, pvpAt: now };
      if (p.cuff) return; // 벌 받는 중에는 세지 않는다
      const hits = (this.pvpHits.get(p.name) ?? []).filter((t) => now - t < PVP_WINDOW);
      hits.push(now);
      if (hits.length < PVP_MAX) { this.pvpHits.set(p.name, hits); return; }
      this.pvpHits.delete(p.name);
      this.cuffUntil.set(p.name, now + PVP_CUFF);
      p.cuff = true;
      console.log(`[친구 때리기] ${p.name}: 10분 안에 ${PVP_MAX}번 → 1분 수갑`);
    });
    this.clock.setInterval(() => { // 시간이 다 된 수갑 풀기
      const now = Date.now();
      for (const [name, t] of this.cuffUntil) if (t <= now) this.cuffUntil.delete(name);
      this.state.players.forEach((p) => { if (p.cuff && !this.cuffUntil.has(p.name)) p.cuff = false; });
    }, 500);

    // 말풍선 대화: [글자]. 40자까지, 너무 잦으면(0.7초) 무시. 모두에게 ['say', 학생 번호, 글자] (선생님이 볼 수 있게 서버 기록에도 남김)
    this.onMessage('say', (client, text) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || typeof text !== 'string') return;
      const t = text.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 40); // 줄바꿈 등 제어 문자는 뺀다
      if (!t) return;
      const now = Date.now();
      if (now - (client.userData?.sayAt ?? 0) < 700) return;
      client.userData = { ...client.userData, sayAt: now };
      this.broadcast('say', [client.sessionId, t]);
      console.log(`[대화] ${p.name}: ${t}`);
    });

    // 포탈 타기: [포탈 번호]. 포탈 가까이 있을 때만 이어진 포탈 앞으로 옮기고 'fix'로 알려 준다
    this.onMessage('portal', (client, i) => {
      const p = this.state.players.get(client.sessionId);
      const from = PORTALS[Number(i)];
      if (!p || !from || Math.hypot(fromCm(p.x) - from.x, fromCm(p.z) - from.z) > PORTAL.reach + 1) return;
      const to = portalArrive(PORTALS[from.to]);
      this.stopFishing(client.sessionId);
      p.x = toCm(to.x);
      p.z = toCm(to.z);
      this.last.set(client.sessionId, { x: to.x, z: to.z, t: Date.now() });
      client.send('fix', [p.x, p.z]);
    });
    // 쓰러짐: 마을 포탈 앞(광장)에서 다시 일어난다. 체력은 화면이 세므로 서버는 옮기기만 한다
    this.onMessage('revive', (client) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      const to = portalArrive(PORTALS[0]);
      this.stopFishing(client.sessionId);
      p.xp = afterDeath(p.xp);
      p.x = toCm(to.x);
      p.z = toCm(to.z);
      this.last.set(client.sessionId, { x: to.x, z: to.z, t: Date.now() });
      client.send('fix', [p.x, p.z]);
    });

    // 이동: [x(cm), z(cm), 방향(0~255), 동작, 도구, 화살 개수]
    this.onMessage('m', (client, msg) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || !Array.isArray(msg) || msg.length < 4) return;
      const [cx, cz, r, a, tool = 0, arrows = 0, stamp = 0] = msg.map((v) => Number(v) | 0);
      const now = Date.now();
      const prev = this.last.get(client.sessionId);
      const dt = Math.min((now - prev.t) / 1000, 1.5);
      const x = fromCm(cx);
      const z = fromCm(cz);
      const dist = Math.hypot(x - prev.x, z - prev.z);
      // 허용 거리: 달리기 속도 × 시간 × 여유를 '모아 둔 여유(b)'에 쌓고, 움직인 만큼 쓴다 (+ 작은 오차).
      // 메시지 사이 시간만 보면, 통신이 잠깐 밀려 두 메시지가 한꺼번에 도착할 때(사이 시간 0) 달리던 학생이 뒤로 튕긴다
      const budget = Math.min((prev.b ?? 0) + RUN_SPEED * dt * 1.6, RUN_SPEED * 1.5 * 1.6);
      const cuffed = p.cuff; // 수갑 찬 동안은 제자리 (동작 번호만 받는다)
      if (dist > (cuffed ? 0.05 : budget + 0.4) || isBlocked(x, z, 0.2)) {
        // 이상한 이동 → 마지막 정상 위치로 되돌림
        client.send('fix', [toCm(prev.x), toCm(prev.z)]);
        return;
      }
      this.last.set(client.sessionId, { x, z, t: now, b: Math.max(0, budget - dist) });
      if (dt > 0.03) this.speeds.set(client.sessionId, { v: dist / dt, t: now });
      p.x = cx;
      p.z = cz;
      p.r = r & 255;
      p.a = a >= 0 && a <= ANIM_MAX ? a : 0;
      p.t = tool >= 0 && tool < TOOLS.length && canWield(TOOLS[tool], p.job, FREE_LOOK) ? tool : 0; // 전직 전에는 몽둥이만 (남의 화면에도)
      p.q = Math.max(0, Math.min(ARROW.max, arrows));
      p.s = stamp & 65535;
    });

    // 화면 성능 (10초마다): [평균 FPS, 가장 느린 0.5초의 FPS, 가장 긴 장면 ×10ms, 화질]
    this.onMessage('perf', (client, m) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || !Array.isArray(m) || m.length < 4) return;
      const [fps, low, hitch, gq] = m.slice(0, 4).map((v) => Math.max(0, Math.min(255, Number(v) | 0)));
      Object.assign(p, { fps, fpsLow: low, hitch, gq });
      p.pd = m.slice(4, 14).map((v) => Math.max(0, Math.min(99999, Number(v) | 0))).join(',');
      p.pl = typeof m[14] === 'string' ? m[14].replace(/[^\w.:;|@?$-]/g, '').slice(0, 200) : '';
    });

    // 외형 바꾸기 (테스트 서버에서만)
    this.onMessage('look', (client, look) => {
      const p = this.state.players.get(client.sessionId);
      // 외형이 바뀌면 모두의 화면에서 캐릭터를 다시 만들므로 너무 잦은 변경은 무시
      const now = Date.now();
      if (!FREE_LOOK || !p || now - (client.userData?.lookAt ?? 0) < 250) return;
      client.userData = { ...client.userData, lookAt: now };
      p.look = cleanLook(look);
    });
  }

  // 화석 자리 하나를 마을(또는 들판)의 팔 수 있는 빈 땅에 새로 만든다
  addFossilSpot(field = false) {
    for (let tries = 0; tries < 200; tries++) {
      const x = field ? FIELD.x + (Math.random() * 2 - 1) * FIELD.r * 0.8 : (Math.random() * 2 - 1) * HALF * 0.9;
      const z = field ? FIELD.z + (Math.random() * 2 - 1) * FIELD.r * 0.8 : (Math.random() * 2 - 1) * HALF * 0.9;
      if (inField(x, z) !== field || !groundKind(x, z)) continue;
      if (!field && Math.hypot(x - SPAWN.x, z - SPAWN.z) < 8) continue; // 광장 바로 옆은 피한다
      let near = false;
      for (const o of [...this.state.fossils.values(), ...this.state.holes.values(), ...this.state.plants.values()]) {
        if (Math.hypot(fromCm(o.x) - x, fromCm(o.z) - z) < 3) near = true;
      }
      if (near) continue;
      const f = new FossilSpot();
      f.x = toCm(x);
      f.z = toCm(z);
      this.state.fossils.set(String(++this.fossilId), f);
      return;
    }
  }

  onJoin(client, options = {}) {
    meter(client);
    watchClose(client);
    // 처음 위치: 광장 근처의 빈자리
    let x = SPAWN.x;
    let z = SPAWN.z;
    for (let i = 0; i < 30; i++) {
      const tx = SPAWN.x + (Math.random() * 2 - 1) * 4;
      const tz = SPAWN.z + (Math.random() * 2 - 1) * 3;
      if (!isBlocked(tx, tz)) { x = tx; z = tz; break; }
    }
    // 테스트 서버: 서버가 다시 켜져 새로 들어오는 경우 원래 있던 자리·방향으로 되돌려 준다 (화면이 보낸 spot).
    // 갈 수 있는 곳일 때만 받아 준다. 실제 수업 서버(FREE_LOOK 꺼짐)에서는 늘 광장에서 시작
    let r = 0;
    const spot = options.spot;
    if (FREE_LOOK && spot && Number.isFinite(spot.x) && Number.isFinite(spot.z)
      && !isBlocked(spot.x, spot.z)) { // 바다·나무 등 갈 수 없는 곳이면 광장에서 시작
      x = spot.x;
      z = spot.z;
      r = Math.max(0, Math.min(255, Number(spot.r) | 0));
    }
    const p = new Player();
    p.x = toCm(x);
    p.z = toCm(z);
    p.r = r;
    p.a = ANIM.IDLE;
    p.name = cleanName(options.name);
    p.color = Math.max(0, Math.min(COLORS.length - 1, Number(options.color) | 0));
    p.look = FREE_LOOK ? cleanLook(options.look) : '';
    if (!p.bag) p.bag = new MapSchema();
    // 테스트 서버: 상점이 아직 없으니 꽃씨를 몇 개씩 넣어 준다 (심기 시험용)
    if (FREE_LOOK) for (const sd of SEEDS) if (!p.bag.has(sd.id)) p.bag.set(sd.id, 5);
    if (!p.dex) p.dex = new MapSchema();
    p.xp = 0; // 정하지 않으면 undefined 라서 += 하면 NaN
    p.job = '';
    p.cuff = this.cuffUntil.has(p.name); // 수갑을 찬 채 새로 고쳐도 그대로
    // 같은 이름으로 새로 들어오면, 연결이 끊겨 기다리던 예전 캐릭터는 바로 지운다 (새 탭·다른 기기로 다시 들어온 경우)
    for (const w of this.waiting.values()) if (w.name === p.name) w.wait.reject(false);
    this.state.players.set(client.sessionId, p);
    this.last.set(client.sessionId, { x, z, t: Date.now() });
    console.log(`입장: ${p.name} (현재 ${this.clients.length}명)`);
  }

  async onLeave(client, consented) {
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    const why = consented ? '' : leaveWhy(client, this.bye.get(client.sessionId));
    if (!consented) {
      // 와이파이가 끊기거나 화면이 꺼진 경우: 잠시 기다린다
      p.a = ANIM.IDLE;
      const gone = Date.now();
      const wait = this.allowReconnection(client, this.bye.has(client.sessionId) ? BYE_SECONDS : RECONNECT_SECONDS);
      this.waiting.set(client.sessionId, { name: p.name, wait });
      try {
        const back = await wait;
        this.bye.delete(client.sessionId);
        meter(back);
        watchClose(back);
        this.last.set(client.sessionId, { x: fromCm(p.x), z: fromCm(p.z), t: Date.now() });
        console.log(`재접속: ${p.name} · ${why} · ${((Date.now() - gone) / 1000).toFixed(1)}초 만에`);
        return;
      } catch {
        // 시간 안에 돌아오지 않음 (또는 같은 이름으로 새로 들어옴)
      } finally {
        this.waiting.delete(client.sessionId);
      }
    }
    this.bye.delete(client.sessionId);
    this.stopFishing?.(client.sessionId);
    this.freeMonsters?.(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.last.delete(client.sessionId);
    console.log(`퇴장: ${p.name} (현재 ${this.clients.length}명)${why ? ` · ${why}` : ''}`);
  }
}

// ── 서버 시작 ──
const httpServer = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('마을 서버 동작 중');
  }
});

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer, pingInterval: PING_MS, pingMaxRetries: PING_RETRIES }),
});
gameServer.define('village', VillageRoom);

await gameServer.listen(PORT, '0.0.0.0');
console.log(`마을 서버 시작: 포트 ${PORT}`);

// 10초마다 전송량 출력
let lastLog = Date.now();
setInterval(() => {
  const now = Date.now();
  const sec = (now - lastLog) / 1000;
  lastLog = now;
  const out = traffic.out / sec;
  const inn = traffic.in / sec;
  traffic.out = 0;
  traffic.in = 0;
  if (out === 0 && inn === 0) return;
  const n = connectedCount();
  const people = Math.max(1, n);
  console.log(
    `[전송량] 접속 ${n}명 | 서버→학생 합계 ${(out / 1024).toFixed(1)}KB/초, 1명당 ${(out / people / 1024).toFixed(2)}KB/초 | 학생→서버 합계 ${(inn / 1024).toFixed(1)}KB/초`,
  );
}, 10000);

function connectedCount() {
  let n = 0;
  for (const c of gameServer.transport.wss?.clients ?? []) if (c.readyState === 1) n++;
  return n;
}
