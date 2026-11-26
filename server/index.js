// 마을 게임 서버 (Colyseus 0.16)
// - 학생 화면이 보낸 위치를 검사만 하고 모두에게 전달한다.
// - 위치는 메모리에만 두고 데이터베이스에 저장하지 않는다.
import http from 'node:http';
import { Server, Room } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { schema, MapSchema, ArraySchema } from '@colyseus/schema';
import {
  ANIM, ANIM_MAX, TOOLS, ARROW, COLORS, RUN_SPEED, SPAWN, isBlocked, toCm, fromCm, cleanLook,
  WORLD, VILLAGE_FRUIT, FRUIT_MAX, FRUIT_REGROW, BAG_MAX, PICK_REACH, SHAKE_DROP, GRAB_REACH, DROP_LIFE, WOOD_STOCK, WOOD_REGROW, CHOP_REACH, rollWood, LIFE_SPOTS, DIG_HOLE, ROCK_HP, ROCK_REGROW, ROCKS_GONE, groundKind,
  PORTALS, PORTAL, portalArrive, RARITY, waterNear, waterAt, BOB_AHEAD, byteToAngle, fishForShadow, sizeOfShadow, FISH_APPROACH, NIBBLE_GAP, BITE_AFTER, REEL_SLACK, XP, levelOf, JOBS, JOB_LEVEL, canWield,
} from '../shared/world.js';
import { setupBugs } from './bugs.js';

const PORT = Number(process.env.GAME_PORT || 2567);
const MAX_CLIENTS = Number(process.env.MAX_CLIENTS || 40);
const RECONNECT_SECONDS = 60;
// 화면을 닫거나 다른 곳으로 갈 때 '나가요(bye)'를 보낸 경우: 새로고침해서 돌아올 만큼만 기다린다
const BYE_SECONDS = 8;
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

const VillageState = schema({
  players: { map: Player },
  freeLook: 'boolean',
  fruitLeft: ['uint8'], // 과일나무마다 남은 과일 개수 (WORLD.fruitTrees 순서)
  drops: { map: Drop }, // 땅에 떨어진 과일·목재: 번호 → 자리
  bugs: { map: Bug }, // 곤충: 번호 → 종류·자리
  holes: { map: Hole }, // 삽으로 판 구덩이: 번호 → 자리
  rocksGone: { map: 'uint8' }, // 삽으로 깨뜨려 지금 없는 바위: 바위 번호 → 1
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
        d.f = VILLAGE_FRUIT;
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
        f.f = VILLAGE_FRUIT;
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
      if (this.state.holes.size >= DIG_HOLE.max) this.state.holes.delete(this.state.holes.keys().next().value);
      const h = new Hole();
      h.x = toCm(x);
      h.z = toCm(z);
      h.k = k;
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
    this.onMessage('kill', (client) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      const now = Date.now();
      const u = client.userData ?? {};
      const b = Math.min(3, (u.killB ?? 3) + (now - (u.killAt ?? now)) / 2000);
      client.userData = { ...u, killAt: now, killB: Math.max(0, b - 1) };
      if (b >= 1) p.xp += XP.monster;
    });
    this.patchRate = 100; // 초당 10회만 바뀐 부분 전송
    this.last = new Map(); // sessionId → 마지막으로 인정한 위치와 시각
    this.bye = new Set(); // 화면을 닫는다고 알려 온 sessionId
    this.waiting = new Map(); // 다시 접속하기를 기다리는 sessionId → { name, wait }

    this.onMessage('bye', (client) => this.bye.add(client.sessionId));

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
      if (dist > budget + 0.4 || isBlocked(x, z, 0.2)) {
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

  onJoin(client, options = {}) {
    meter(client);
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
    if (!p.dex) p.dex = new MapSchema();
    p.xp = 0; // 정하지 않으면 undefined 라서 += 하면 NaN
    p.job = '';
    // 같은 이름으로 새로 들어오면, 연결이 끊겨 기다리던 예전 캐릭터는 바로 지운다 (새 탭·다른 기기로 다시 들어온 경우)
    for (const w of this.waiting.values()) if (w.name === p.name) w.wait.reject(false);
    this.state.players.set(client.sessionId, p);
    this.last.set(client.sessionId, { x, z, t: Date.now() });
    console.log(`입장: ${p.name} (현재 ${this.clients.length}명)`);
  }

  async onLeave(client, consented) {
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    if (!consented) {
      // 와이파이가 끊기거나 화면이 꺼진 경우: 잠시 기다린다
      p.a = ANIM.IDLE;
      const wait = this.allowReconnection(client, this.bye.has(client.sessionId) ? BYE_SECONDS : RECONNECT_SECONDS);
      this.waiting.set(client.sessionId, { name: p.name, wait });
      try {
        const back = await wait;
        this.bye.delete(client.sessionId);
        meter(back);
        this.last.set(client.sessionId, { x: fromCm(p.x), z: fromCm(p.z), t: Date.now() });
        console.log(`재접속: ${p.name}`);
        return;
      } catch {
        // 시간 안에 돌아오지 않음 (또는 같은 이름으로 새로 들어옴)
      } finally {
        this.waiting.delete(client.sessionId);
      }
    }
    this.bye.delete(client.sessionId);
    this.stopFishing?.(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.last.delete(client.sessionId);
    console.log(`퇴장: ${p.name} (현재 ${this.clients.length}명)`);
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
  transport: new WebSocketTransport({ server: httpServer }),
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
