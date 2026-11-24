// 말풍선 대화 시험용 친구: 광장 분수 앞에 서서, 누가 말하면 그쪽을 돌아보고 말풍선으로 대답한다
// 사용법: node tools/chat-bot.js [서버 주소] [이름]
// 예:     node tools/chat-bot.js wss://test.class-village.duckdns.org/colyseus
// 연결이 끊기면 잠시 뒤 다시 들어온다. 끝내려면 Ctrl+C
import { Client } from 'colyseus.js';
import { ANIM, fromCm, angleToByte } from '../shared/world.js';

const SERVER = process.argv[2] || 'ws://localhost:2567';
const NAME = process.argv[3] || '대화봇';
const SPOT = { x: 2.2, z: 5.8 }; // 광장 분수 앞 (막히지 않은 자리)
const REPLY_GAP = 1500; // 대답 사이 최소 간격 (ms)
const IGNORE = ['아야!', '그만 때려! 😠']; // 맞았을 때 외치는 말에는 대답하지 않는다
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const pick = (list) => list[Math.floor(Math.random() * list.length)];
// 이름 뒤 '이야/야' (받침에 맞게)
const iya = (name) => { const c = name.charCodeAt(name.length - 1) - 0xac00; return `${name}${c >= 0 && c <= 11171 && c % 28 ? '이야' : '야'}`; };

function replyTo(text) {
  if (/안녕|하이|hi|hello|반가/i.test(text)) return { line: pick(['안녕! 나는 말풍선 대화 시험용 친구야 👋', '반가워! Enter를 누르면 나랑 이야기할 수 있어']), anim: ANIM.WAVE };
  if (/이름|누구/.test(text)) return { line: `내 이름은 ${iya(NAME)}! 여기서 대화를 시험해 봐` };
  if (/고마|감사/.test(text)) return { line: '천만에! 😊', anim: ANIM.CHEER };
  if (/잘\s*가|바이|bye/i.test(text)) return { line: '잘 가! 또 놀러 와 👋', anim: ANIM.WAVE };
  if (/[?？]$/.test(text)) return { line: pick(['음… 잘 모르겠어! 🤔', '좋은 질문이야! 선생님께 여쭤 볼까?']) };
  const quote = text.length > 20 ? `${text.slice(0, 19)}…` : text;
  return { line: pick([`"${quote}"라고 했구나!`, `오! "${quote}" 잘 들었어`, '응응, 듣고 있어! 😄']) };
}

async function run() {
  const client = new Client(SERVER);
  const room = await client.joinOrCreate('village', { name: NAME, color: 4, spot: { ...SPOT, r: 0 } });
  console.log(`[${new Date().toLocaleTimeString()}] ${NAME} 접속: ${SERVER}`);
  await new Promise((ok) => room.onStateChange.once(ok));
  const me = room.state.players.get(room.sessionId);
  const x = fromCm(me.x);
  const z = fromCm(me.z);
  let rot = 0;
  let lastReply = 0;
  const send = (anim = ANIM.IDLE) => room.send('m', [me.x, me.z, angleToByte(rot), anim, 0]);
  send();
  room.onMessage('*', () => {});
  room.onMessage('say', async ([sid, text]) => {
    if (sid === room.sessionId || typeof text !== 'string' || IGNORE.includes(text)) return;
    const p = room.state.players.get(sid);
    if (!p || /봇/.test(p.name)) return; // 다른 봇끼리 끝없이 주고받지 않게
    const now = Date.now();
    if (now - lastReply < REPLY_GAP) return;
    lastReply = now;
    console.log(`  ${p.name}: ${text}`);
    rot = Math.atan2(fromCm(p.x) - x, fromCm(p.z) - z); // 말한 학생 쪽으로 돌아본다
    const { line, anim } = replyTo(text);
    await sleep(700);
    send(anim ?? ANIM.IDLE);
    room.send('say', line);
    if (anim) { await sleep(1500); send(); }
  });
  await new Promise((ok) => room.onLeave(ok));
  console.log(`[${new Date().toLocaleTimeString()}] 연결 끊김, 다시 들어감`);
}

for (;;) {
  try { await run(); } catch (e) { console.log(`접속 실패: ${e.message}`); }
  await sleep(5000);
}
