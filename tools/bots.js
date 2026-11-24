// 가짜 학생 시험 도구
// 사용법: npm run bots -- [인원 수] [서버 주소]
// 예:     npm run bots -- 30
import { Client } from 'colyseus.js';
import {
  ANIM, COLORS, WALK_SPEED, RUN_SPEED, EDGE, resolveMove, isBlocked, toCm, fromCm, angleToByte,
} from '../shared/world.js';

const COUNT = Number(process.argv[2] || 30);
const SERVER = process.argv[3] || 'ws://localhost:2567';
const TICK = 100; // 초당 10회 (실제 학생 화면과 같음)

const client = new Client(SERVER);
const stamp = () => Math.round(performance.now() / 10) % 65535 + 1; // 보낸 때 (실제 화면과 같은 꼴)
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

function pickTarget(x, z) {
  for (let i = 0; i < 20; i++) {
    const tx = x + (Math.random() * 2 - 1) * 12;
    const tz = z + (Math.random() * 2 - 1) * 12;
    if (Math.abs(tx) < EDGE - 1 && Math.abs(tz) < EDGE - 1 && !isBlocked(tx, tz)) return [tx, tz];
  }
  return [0, 3];
}

async function runBot(i) {
  const room = await client.joinOrCreate('village', { name: `봇${i + 1}`, color: i % COLORS.length });
  // 첫 상태가 올 때까지 기다림
  await new Promise((ok) => room.onStateChange.once(ok));
  const p = room.state.players.get(room.sessionId);
  let x = fromCm(p.x);
  let z = fromCm(p.z);
  let [tx, tz] = pickTarget(x, z);
  let pause = Math.random() * 3;
  let run = false;
  let rot = 0;
  let stuck = 0;

  room.onMessage('fix', ([fx, fz]) => { x = fromCm(fx); z = fromCm(fz); });

  const dt = TICK / 1000;
  const timer = setInterval(() => {
    if (pause > 0) {
      pause -= dt;
      if (pause <= 0) { [tx, tz] = pickTarget(x, z); run = Math.random() < 0.3; }
      return; // 멈춰 있을 때는 아무것도 보내지 않음
    }
    const dx = tx - x;
    const dz = tz - z;
    const d = Math.hypot(dx, dz);
    if (d < 0.3 || stuck > 15) {
      pause = 1 + Math.random() * 4;
      stuck = 0;
      room.send('m', [toCm(x), toCm(z), angleToByte(rot), ANIM.IDLE, 0, 0, stamp()]);
      return;
    }
    const speed = (run ? RUN_SPEED : WALK_SPEED) * dt;
    const step = Math.min(speed, d);
    const [nx, nz] = resolveMove(x, z, x + (dx / d) * step, z + (dz / d) * step);
    if (Math.hypot(nx - x, nz - z) < 0.01) stuck++;
    x = nx;
    z = nz;
    rot = Math.atan2(dx, dz);
    room.send('m', [toCm(x), toCm(z), angleToByte(rot), run ? ANIM.RUN : ANIM.WALK, 0, 0, stamp()]);
  }, TICK);

  room.onLeave(() => clearInterval(timer));
  return room;
}

console.log(`가짜 학생 ${COUNT}명 접속 시작 → ${SERVER}`);
const rooms = [];
for (let i = 0; i < COUNT; i++) {
  try {
    rooms.push(await runBot(i));
  } catch (err) {
    console.error(`봇${i + 1} 접속 실패:`, err.message ?? err);
  }
  await sleep(50);
}
console.log(`${rooms.length}명 접속 완료. 멈추려면 Ctrl+C`);

process.on('SIGINT', async () => {
  await Promise.allSettled(rooms.map((r) => r.leave()));
  process.exit(0);
});
