// 마을 게임 서버 (Colyseus 0.16)
// - 학생 화면이 보낸 위치를 검사만 하고 모두에게 전달한다.
// - 위치는 메모리에만 두고 데이터베이스에 저장하지 않는다.
import http from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { Server, Room } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { schema, MapSchema } from '@colyseus/schema';
import {
  ANIM, ANIM_MAX, TOOLS, COLORS, RUN_SPEED, SPAWN, isBlocked, toCm, fromCm, cleanLook, FRUITS, FRUIT_NAMES,
} from '../shared/world.js';

const PORT = Number(process.env.GAME_PORT || 2567);
const MAX_CLIENTS = Number(process.env.MAX_CLIENTS || 40);
const RECONNECT_SECONDS = 60;
// 화면을 닫거나 다른 곳으로 갈 때 '나가요(bye)'를 보낸 경우: 새로고침해서 돌아올 만큼만 기다린다
const BYE_SECONDS = 8;
// 테스트 서버에서는 외형을 마음대로 바꿀 수 있다 (실제 수업 서버는 NODE_ENV=production 또는 FREE_LOOK=0 으로 끔)
const FREE_LOOK = process.env.FREE_LOOK ? process.env.FREE_LOOK === '1' : process.env.NODE_ENV !== 'production';

// ── 마을 설정 (주된 과일): 처음 켤 때 무작위로 하나 정해 파일에 남겨, 서버를 다시 켜도 그대로 ──
// VILLAGE_FRUIT=apple 처럼 환경 변수로 직접 정할 수도 있다
const DATA_DIR = new URL('./data/', import.meta.url);
const VILLAGE_FILE = new URL('village.json', DATA_DIR);
function loadVillage() {
  let v = {};
  let saved = '';
  try { saved = readFileSync(VILLAGE_FILE, 'utf8'); v = JSON.parse(saved); } catch { /* 처음 켬 */ }
  const want = process.env.VILLAGE_FRUIT;
  if (FRUITS.includes(want)) v.fruit = want;
  if (!FRUITS.includes(v.fruit)) v.fruit = FRUITS[Math.floor(Math.random() * FRUITS.length)];
  // 바뀐 게 있을 때만 쓴다 (개발 중 서버가 파일 변경을 보고 다시 켜지므로, 매번 쓰면 끝없이 다시 켜진다)
  const text = JSON.stringify(v, null, 2);
  if (text !== saved) {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(VILLAGE_FILE, text);
  }
  return v;
}
const VILLAGE = loadVillage();
console.log(`마을 주된 과일: ${FRUIT_NAMES[VILLAGE.fruit]}`);

// ── 주고받는 상태 정의 ──
const Player = schema({
  x: 'int16', // cm
  z: 'int16', // cm
  r: 'uint8', // 바라보는 방향 0~255
  a: 'uint8', // 동작 번호
  t: 'uint8', // 든 도구 번호 (TOOLS)
  name: 'string',
  color: 'uint8',
  look: 'string', // 꾸민 외형(JSON), 비어 있으면 색 번호로 정한 기본 모습
}, 'Player');

const VillageState = schema({
  players: { map: Player },
  freeLook: 'boolean',
  fruit: 'string', // 마을 주된 과일 (FRUITS)
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
    this.state.fruit = VILLAGE.fruit;
    this.patchRate = 100; // 초당 10회만 바뀐 부분 전송
    this.last = new Map(); // sessionId → 마지막으로 인정한 위치와 시각
    this.bye = new Set(); // 화면을 닫는다고 알려 온 sessionId
    this.waiting = new Map(); // 다시 접속하기를 기다리는 sessionId → { name, wait }

    this.onMessage('bye', (client) => this.bye.add(client.sessionId));

    // 이동: [x(cm), z(cm), 방향(0~255), 동작, 도구]
    this.onMessage('m', (client, msg) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || !Array.isArray(msg) || msg.length < 4) return;
      const [cx, cz, r, a, tool = 0] = msg.map((v) => Number(v) | 0);
      const now = Date.now();
      const prev = this.last.get(client.sessionId);
      const dt = Math.min((now - prev.t) / 1000, 1.5);
      const x = fromCm(cx);
      const z = fromCm(cz);
      const dist = Math.hypot(x - prev.x, z - prev.z);
      // 허용 거리: 달리기 속도 × 시간 × 여유 + 작은 오차
      const allowed = RUN_SPEED * dt * 1.6 + 0.4;
      if (dist > allowed || isBlocked(x, z, 0.2)) {
        // 이상한 이동 → 마지막 정상 위치로 되돌림
        client.send('fix', [toCm(prev.x), toCm(prev.z)]);
        return;
      }
      this.last.set(client.sessionId, { x, z, t: now });
      p.x = cx;
      p.z = cz;
      p.r = r & 255;
      p.a = a >= 0 && a <= ANIM_MAX ? a : 0;
      p.t = tool >= 0 && tool < TOOLS.length ? tool : 0;
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
    const p = new Player();
    p.x = toCm(x);
    p.z = toCm(z);
    p.r = 0;
    p.a = ANIM.IDLE;
    p.name = cleanName(options.name);
    p.color = Math.max(0, Math.min(COLORS.length - 1, Number(options.color) | 0));
    p.look = FREE_LOOK ? cleanLook(options.look) : '';
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
