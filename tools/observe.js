// 수업 관찰 도구: 서버에 '관찰' 캐릭터로 들어가 학생들이 무엇을 하는지 기록한다 (게임 개선용)
// 사용법: node tools/observe.js [서버 주소]   (기본: 테스트판)
// 기록: observe-data/<날짜>/events.jsonl (입장·퇴장·대화·낚시·쓰러짐·레벨업·전직),
//       snapshots.jsonl (10초마다 모두의 자리·동작·도구·레벨), summary.json (1분마다 학생별 합계),
//       perf.jsonl·perf-summary.json (1분마다 학생별 끊김·버벅임), hitch.jsonl (0.3초 넘게 멈춘 장면의 진단값)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, getStateCallbacks } from 'colyseus.js';
import { ANIM, TOOLS, EDGE, isBlocked, fromCm, levelOf, inField } from '../shared/world.js';

const SERVER = process.argv[2] || 'wss://test.class-village.duckdns.org/colyseus';
const DIR = path.join(fileURLToPath(new URL('../observe-data/', import.meta.url)),
  new Date().toLocaleString('sv-SE').slice(0, 16).replace(/[: ]/g, '-'));
fs.mkdirSync(DIR, { recursive: true });
const ANIM_NAME = Object.fromEntries(Object.entries(ANIM).map(([k, v]) => [v, k]));
const now = () => new Date().toLocaleTimeString('ko-KR', { hour12: false });
const write = (file, o) => fs.appendFileSync(path.join(DIR, file), JSON.stringify({ t: now(), ...o }) + '\n');
const ev = (type, o) => { write('events.jsonl', { type, ...o }); console.log(now(), type, JSON.stringify(o)); };

// 학생별 합계 (이름으로 묶음: 새로 들어와도 이어서 센다)
const stats = new Map();
const statOf = (name) => {
  if (!stats.has(name)) stats.set(name, { sec: 0, field: 0, idle: 0, anim: {}, tool: {}, deaths: 0, says: 0, caught: 0, joins: 0, lv: 1, xp: 0, job: '', bag: {}, dex: {} });
  return stats.get(name);
};
const add = (o, k, v = 1) => { o[k] = (o[k] ?? 0) + v; };

// 끊김·버벅임 (학생별, 1분마다 perf.jsonl 에 한 줄씩 쓰고 비움): gaps 걷는 중 보낸 간격(ms) · lags 늦게 도착(ms) · freeze 5초 넘게 멈춤
const perf = new Map();
const perfOf = (name) => {
  if (!perf.has(name)) perf.set(name, { gaps: [], lags: [], freeze: 0, fps: [], low: [], hitch: [], gq: 0 });
  return perf.get(name);
};
const pct = (a, q) => (a.length ? a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * q))] : null);
const perfTotal = new Map(); // 이름 → 수업 전체 합계
function flushPerf() {
  const rows = [];
  for (const [name, { gaps, lags, freeze, fps, low, hitch, gq }] of perf) {
    if (!gaps.length && !lags.length && !freeze && !fps.length) continue;
    const row = {
      name, moves: gaps.length,
      gap50: pct(gaps, 0.5), gap95: pct(gaps, 0.95), gapMax: gaps.length ? Math.max(...gaps) : null,
      hitch300: gaps.filter((g) => g >= 300).length, hitch1000: gaps.filter((g) => g >= 1000).length, freeze,
      lag50: Math.round(pct(lags, 0.5)), lag95: Math.round(pct(lags, 0.95)), lagMax: Math.round(Math.max(...lags)), lag500: lags.filter((l) => l >= 500).length,
      // 화면이 직접 알려 준 값 (10초마다): 평균 FPS 가운데값·가장 낮은 값 · 가장 느린 0.5초 FPS · 가장 긴 장면(ms) · 화질
      fps50: pct(fps, 0.5), fpsMin: fps.length ? Math.min(...fps) : null, fpsLow: low.length ? Math.min(...low) : null, hitchMs: hitch.length ? Math.max(...hitch) * 10 : null, gq,
    };
    rows.push(row);
    const tot = perfTotal.get(name) ?? { min: 0, moves: 0, hitch300: 0, hitch1000: 0, freeze: 0, lag500: 0, worstGap: 0, worstLag: 0, fps: [], fpsLow: null, hitchMs: 0, gq: 0 };
    tot.min++; tot.moves += row.moves; tot.hitch300 += row.hitch300; tot.hitch1000 += row.hitch1000; tot.freeze += freeze; tot.lag500 += row.lag500;
    tot.worstGap = Math.max(tot.worstGap, row.gapMax ?? 0); tot.worstLag = Math.max(tot.worstLag, row.lagMax);
    tot.fps.push(...fps); tot.gq = gq;
    if (row.fpsLow !== null) tot.fpsLow = Math.min(tot.fpsLow ?? 255, row.fpsLow);
    tot.hitchMs = Math.max(tot.hitchMs, row.hitchMs ?? 0);
    perfTotal.set(name, tot);
  }
  perf.clear();
  if (rows.length) write('perf.jsonl', { rows });
  fs.writeFileSync(path.join(DIR, 'perf-summary.json'), JSON.stringify(Object.fromEntries([...perfTotal].map(([k, v]) => [k, { ...v, fps: undefined, fps50: pct(v.fps, 0.5), fps10: pct(v.fps, 0.1) }])), null, 1));
}
setInterval(flushPerf, 60000);

// 관찰 캐릭터는 마을 구석 빈자리에 세워 둔다
function corner() {
  for (let d = 2; d < 20; d += 0.5) if (!isBlocked(EDGE - d, EDGE - d)) return { x: EDGE - d, z: EDGE - d, r: 0 };
  return undefined;
}

async function run() {
  const room = await new Client(SERVER).joinOrCreate('village', { name: '관찰', color: 0, spot: corner() });
  console.log(`${now()} 접속함 → 기록 폴더 ${DIR}`);
  await new Promise((ok) => room.onStateChange.once(ok));
  const me = room.sessionId;
  const nameOf = (sid) => room.state.players.get(sid)?.name ?? sid;
  const prev = new Map(); // sid → 지난 1초의 { a, lv, job }

  room.onMessage('say', ([sid, text]) => { if (sid !== me) { add(statOf(nameOf(sid)), 'says'); ev('say', { name: nameOf(sid), text }); } });
  room.onMessage('caught', ([sid, id]) => { add(statOf(nameOf(sid)), 'caught'); ev('caught', { name: nameOf(sid), fish: id }); });
  for (const m of ['monHit', 'rockHit', 'bossSpill', 'fix']) room.onMessage(m, () => {});
  room.onMessage('*', () => {});

  // 끊김·버벅임: 화면은 걷거나 뛰는 동안 0.1초마다 자리를 보내고, 보낸 때(p.s, 10ms 단위)를 붙인다.
  // · 보낸 간격(gap): 걷는 중인데 0.1초보다 한참 늦게 보냈다면 그 학생 화면이 그만큼 멈춘 것 (프레임 버벅임)
  // · 늦게 도착(lag): 도착한 때 − 보낸 때 를 그 학생의 가장 빠른 값과 견준다 (통신 끊김·밀림, 관찰 쪽 통신도 섞임)
  // shortcut: 벽에 막혀 제자리걸음이면 보내지 않아 버벅임으로 잘못 셀 수 있다. 정확한 FPS 는 화면이 직접 알려 줘야 함
  const $ = getStateCallbacks(room);
  $(room.state).players.onAdd((p, sid) => {
    if (sid === me) return;
    let lastS = 0; let lastT = 0; let lastMoving = false; let sc = 0; let base = Infinity; let lastFps = '';
    $(p).onChange(() => {
      // shortcut: 10초 전과 네 값이 똑같으면 바뀐 게 없어 소식이 오지 않아 한 번 빠진다 (가운데값에는 거의 영향 없음)
      const f = `${p.fps},${p.fpsLow},${p.hitch},${p.gq},${p.pd},${p.pl}`;
      if (p.fps && f !== lastFps) {
        const n = perfOf(p.name); n.fps.push(p.fps); n.low.push(p.fpsLow); n.hitch.push(p.hitch); n.gq = p.gq;
        // 0.3초 넘게 멈춘 장면은 진단값과 함께 hitch.jsonl 에 (화면이 보내는 순서: main.js trackPerf)
        if (p.hitch >= 30 && p.pd) {
          const [logic, render, after, outside, prog, tex, geo, calls, field, heapMB] = p.pd.split(',').map(Number);
          write('hitch.jsonl', { name: p.name, ms: p.hitch * 10, logic, render, after, outside, prog, tex, geo, calls, field: !!field, heapMB, loaf: p.pl, fps: p.fps, gq: p.gq });
        }
      }
      lastFps = f;
      if (!p.s || p.s === lastS) return;
      const t = performance.now();
      const moving = p.a === ANIM.WALK || p.a === ANIM.RUN;
      const n = perfOf(p.name);
      if (lastS && t - lastT < 600000) {
        const gap = ((p.s - lastS + 65535) % 65535) * 10;
        sc += gap;
        if (moving && lastMoving) {
          if (gap > 5000) n.freeze++; // 5초 넘게 멈춤: 탭을 내렸거나 화면이 꺼졌을 수도
          else n.gaps.push(gap);
        }
      } else { sc = 0; base = Infinity; }
      const off = t - sc;
      base = Math.min(base, off);
      n.lags.push(off - base);
      lastS = p.s; lastT = t; lastMoving = moving;
    });
  });

  const tick = setInterval(() => {
    const seen = new Set();
    room.state.players.forEach((p, sid) => {
      if (sid === me) return;
      seen.add(sid);
      const s = statOf(p.name);
      const { lv } = levelOf(p.xp);
      const was = prev.get(sid);
      if (!was) { s.joins++; ev('join', { name: p.name, n: room.state.players.size - 1 }); }
      else {
        if (p.a === ANIM.FAINT && was.a !== ANIM.FAINT) { s.deaths++; ev('faint', { name: p.name, lv, field: inField(fromCm(p.x), fromCm(p.z)) }); }
        if (lv > was.lv) ev('levelup', { name: p.name, lv, playedSec: s.sec });
        if (p.job !== was.job) ev('job', { name: p.name, job: p.job, lv });
      }
      prev.set(sid, { a: p.a, lv, job: p.job, name: p.name });
      s.sec++;
      if (inField(fromCm(p.x), fromCm(p.z))) s.field++;
      if (p.a === ANIM.IDLE) s.idle++;
      add(s.anim, ANIM_NAME[p.a] ?? p.a);
      add(s.tool, TOOLS[p.t] ?? p.t);
      Object.assign(s, { lv, xp: p.xp, job: p.job, bag: Object.fromEntries(p.bag ?? []), dex: Object.fromEntries(p.dex ?? []) });
    });
    for (const sid of prev.keys()) if (!seen.has(sid)) { ev('leave', { name: prev.get(sid).name, n: seen.size }); prev.delete(sid); }
  }, 1000);

  const snap = setInterval(() => {
    const players = [];
    room.state.players.forEach((p, sid) => {
      if (sid === me) return;
      const x = fromCm(p.x); const z = fromCm(p.z);
      players.push({ fps: p.fps, name: p.name, x: +x.toFixed(1), z: +z.toFixed(1), field: inField(x, z), a: ANIM_NAME[p.a], tool: TOOLS[p.t], lv: levelOf(p.xp).lv, xp: p.xp, job: p.job });
    });
    write('snapshots.jsonl', { n: players.length, drops: room.state.drops.size, holes: room.state.holes.size, plants: room.state.plants.size, players });
  }, 10000);

  const sum = setInterval(() => fs.writeFileSync(path.join(DIR, 'summary.json'), JSON.stringify(Object.fromEntries(stats), null, 1)), 60000);

  await new Promise((ok) => room.onLeave(ok));
  clearInterval(tick); clearInterval(snap); clearInterval(sum);
  console.log(`${now()} 연결 끊김, 5초 뒤 다시 들어감`);
}

for (;;) {
  try { await run(); } catch (e) { console.log(`${now()} 접속 실패: ${e.message ?? e}`); }
  await new Promise((ok) => setTimeout(ok, 5000));
}
