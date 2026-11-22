#!/usr/bin/env node
/*
 * 상시 테스트 서버 (내 컴퓨터 전용)
 *
 * 작업 폴더(Class Village)를 그대로 보여 주는 화면 서버(Vite, 5173)와 게임 서버(2567)를 함께 켜 두고,
 * 어느 쪽이든 멈추면 몇 초 뒤 다시 켠다. 작업 스케줄러 "ClassVillage live test server"가 로그인할 때와
 * 2분마다 이 프로그램을 켜 본다 (이미 켜져 있으면 그냥 넘어감) → 컴퓨터를 켜 두기만 하면 늘 접속할 수 있다.
 *
 *   node tools/live-server.cjs                     → http://localhost:5173
 *   node tools/live-server.cjs --log <파일>         → 화면 없이 켤 때(작업 스케줄러) 기록을 파일로 남김
 *
 * - 화면 코드(client)를 고치면 Vite가 브라우저를 곧바로 새로 그린다.
 * - 게임 서버 코드(server·shared)를 고치면 게임 서버를 다시 켠다 (고친 코드에 오류가 있어 멈추면 다음 수정 때 다시 켬).
 * - 포트가 이미 쓰이고 있으면(다른 곳에서 켠 개발 서버 등) 비워질 때까지 몇 초마다 다시 켜 본다.
 */
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const RETRY_MS = 4000;
// 이 관리 프로그램과, 이것이 켠 화면·게임 서버의 번호(PID). 작업 스케줄러가 작업을 멈추면 창(conhost)만 꺼지고
// 이 프로그램과 서버들은 남아 포트를 잡고 있으므로, 다음에 켤 때 남은 것을 먼저 끄고 자리를 넘겨받는다
// (그 번호를 지금 쓰는 프로그램이 정말 이 마을의 관리 프로그램·서버인지 명령줄로 확인한 뒤에만 끈다)
const PID_FILE = path.join(process.env.LOCALAPPDATA || require('os').tmpdir(), 'ClassVillage', 'live-pids.json');
// 관리 프로그램은 작업 폴더에서 'node tools\live-server.cjs' 로 켜진다 (명령줄에 폴더 이름이 없다).
// 화면 서버는 명령줄에 이 폴더의 vite.js 경로가 있어야 하고, 게임 서버는 'node server/index.js' 이다
const SUPERVISOR = /^"?[^"]*node(\.exe)?"?\s+tools[\\/]live-server\.cjs/i;
const VIEW = /vite[\\/]bin[\\/]vite\.js"?\s+client/i;
const GAME = /^"?[^"]*node(\.exe)?"?\s+server[\\/]index\.js/i;

const logArg = process.argv.indexOf('--log');
if (logArg > 0 && process.argv[logArg + 1]) {
  const logFile = process.argv[logArg + 1];
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const out = fs.createWriteStream(logFile, { flags: 'w' });
  for (const k of ['log', 'warn', 'error']) {
    const orig = console[k].bind(console);
    console[k] = (...a) => { orig(...a); out.write(a.map(String).join(' ') + '\n'); };
  }
}
const stamp = () => new Date().toLocaleTimeString('ko-KR', { hour12: false });

function commandLine(pid) {
  try {
    return execFileSync('powershell.exe', ['-NoProfile', '-Command',
      `[Console]::OutputEncoding = [Text.Encoding]::UTF8; (Get-CimInstance Win32_Process -Filter "ProcessId=${Number(pid)}").CommandLine`],
    { windowsHide: true, encoding: 'utf8', timeout: 15000 }).trim();
  } catch { return ''; }
}
function cleanupStale() {
  let old;
  try { old = JSON.parse(fs.readFileSync(PID_FILE, 'utf8')); } catch { return; }
  const ours = (cmd) => SUPERVISOR.test(cmd) || GAME.test(cmd)
    || (VIEW.test(cmd) && cmd.toLowerCase().includes(REPO.toLowerCase()));
  const kill = (pid, what) => {
    if (!pid || pid === process.pid) return;
    const cmd = commandLine(pid);
    if (!cmd || !ours(cmd)) return;
    try { process.kill(pid); console.log(`[live] ${stamp()} 지난번에 남은 ${what}(${pid})를 끔`); } catch { /* 이미 꺼짐 */ }
  };
  // 관리 프로그램을 먼저 꺼야 서버를 끈 뒤 그쪽이 다시 켜지 않는다
  kill(old.supervisor, '관리 프로그램');
  for (const pid of old.children ?? []) kill(pid, '서버');
}
const children = new Set();
const savePids = () => {
  try {
    fs.mkdirSync(path.dirname(PID_FILE), { recursive: true });
    fs.writeFileSync(PID_FILE, JSON.stringify({ supervisor: process.pid, children: [...children] }));
  } catch { /* 기록 못 해도 서버는 계속 */ }
};
cleanupStale();
savePids();

// 하나의 프로그램을 켜 두고, 멈추면 RETRY_MS 뒤 다시 켠다
function keep(name, args, env = {}) {
  // busy: 포트를 이미 다른 곳에서 쓰고 있어 기다리는 중. 그동안은 같은 오류를 몇 초마다 되풀이해 적지 않는다
  const job = { child: null, restartNow: false, busy: false };
  const start = () => {
    const child = spawn(process.execPath, args, {
      cwd: REPO, windowsHide: true, env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', ...env }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    job.child = child;
    children.add(child.pid);
    savePids();
    let inUse = false;
    const pipe = (s) => s.on('data', (d) => {
      const text = String(d);
      if (/EADDRINUSE|already in use/.test(text)) inUse = true;
      if (job.busy) return;
      for (const line of text.split(/\r?\n/)) if (line.trim()) console.log(`[${name}] ${line}`);
    });
    pipe(child.stdout);
    pipe(child.stderr);
    // 몇 초 동안 멈추지 않았으면 포트가 비어 제대로 켜진 것: 기록을 다시 적기 시작한다
    const ok = setTimeout(() => {
      if (job.child !== child || !job.busy) return;
      job.busy = false;
      console.log(`[live] ${stamp()} ${name}: 포트가 비어 켜졌음`);
    }, 3000);
    child.on('exit', (code) => {
      clearTimeout(ok);
      children.delete(child.pid);
      savePids();
      job.child = null;
      const now = job.restartNow;
      job.restartNow = false;
      if (inUse) {
        if (!job.busy) console.warn(`[live] ${stamp()} ${name}: 포트를 이미 다른 곳에서 쓰고 있음 → 비워질 때까지 ${RETRY_MS / 1000}초마다 다시 켜 봄`);
        job.busy = true;
      } else {
        job.busy = false;
        if (!now) console.warn(`[live] ${stamp()} ${name} 멈춤 (코드 ${code}) → ${RETRY_MS / 1000}초 뒤 다시 켬`);
      }
      setTimeout(start, now ? 0 : RETRY_MS);
    });
  };
  job.restart = () => {
    if (!job.child) return;
    job.restartNow = true;
    job.child.kill();
  };
  start();
  return job;
}

const vite = path.join(REPO, 'node_modules', 'vite', 'bin', 'vite.js');
// strictPort: 5173이 쓰이고 있으면 다른 포트로 옮겨 가지 않고 멈췄다가 다시 시도한다 (늘 같은 주소로 접속하도록)
const view = keep('화면', [vite, 'client', '--host', '--strictPort']);
const game = keep('게임', ['server/index.js']);

// 게임 서버 코드가 바뀌면 다시 켠다 (여러 파일이 한꺼번에 바뀌어도 한 번만)
let timer = null;
for (const dir of ['server', 'shared']) {
  fs.watch(path.join(REPO, dir), { recursive: true }, (_e, file) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      console.log(`[live] ${stamp()} ${dir}/${file || ''} 바뀜 → 게임 서버 다시 켬`);
      game.restart();
    }, 300);
  });
}

const stop = () => process.exit(0);
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
process.on('exit', () => { for (const j of [view, game]) j.child?.kill(); });
console.log(`[live] ${stamp()} 상시 테스트 서버: http://localhost:5173  (게임 서버 포트 2567)`);
