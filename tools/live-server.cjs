#!/usr/bin/env node
/*
 * 상시 테스트 서버 (내 컴퓨터 전용)
 *
 * 작업 폴더(Class Village)를 그대로 보여 주는 화면 서버(Vite, 5173)와 게임 서버(2567)를 함께 켜 두고,
 * 어느 쪽이든 멈추면 몇 초 뒤 다시 켠다. 작업 스케줄러 "ClassVillage live test server"가 로그인할 때와
 * 2분마다 이 프로그램을 켜 본다 (이미 켜져 있으면 그냥 넘어감) → 컴퓨터를 켜 두기만 하면 늘 접속할 수 있다.
 *
 *   node tools/live-server.cjs                     → http://localhost:5173
 *   node tools/live-server.cjs --main              → http://localhost:5180 (원격 main, 게임 서버 2577)
 *   node tools/live-server.cjs --main --deploy-test → 위와 같고, 원격 main이 바뀌면 https://test.class-village.duckdns.org 에도 올림
 *   node tools/live-server.cjs --log <파일>         → 화면 없이 켤 때(작업 스케줄러) 기록을 파일로 남김
 *
 * --main: 작업 폴더 대신 전용 작업 폴더(%LOCALAPPDATA%\ClassVillage\live-main)를 몇 초마다 원격 main(origin/main)에
 *   맞추고 그 폴더를 보여 준다 → 다른 컴퓨터에서 푸시해도 몇 초 안에 반영된다. 전용 폴더는 강제로 덮어쓰므로 거기서는 고치지 말 것.
 *   설치 폴더(node_modules)는 작업 폴더의 것을 함께 쓴다 (main에서 새 패키지를 넣었으면 작업 폴더에서도 npm install 필요)
 *   화면·게임 서버(5180·2577)는 스위치 파일 %LOCALAPPDATA%\ClassVillage\main-serve.on 이 있을 때만 켠다 (기본은 꺼짐).
 *   원격 main 받아오기와 테스트판 올리기(--deploy-test)는 스위치와 상관없이 늘 한다
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
const MAIN = process.argv.includes('--main');
const DATA = path.join(process.env.LOCALAPPDATA || require('os').tmpdir(), 'ClassVillage');
const ROOT = MAIN ? path.join(DATA, 'live-main') : REPO; // 보여 줄 폴더
const VIEW_PORT = MAIN ? 5180 : 5173;
const GAME_PORT = MAIN ? 2577 : 2567;
const POLL_MS = 5000;
// 이 관리 프로그램과, 이것이 켠 화면·게임 서버의 번호(PID). 작업 스케줄러가 작업을 멈추면 창(conhost)만 꺼지고
// 이 프로그램과 서버들은 남아 포트를 잡고 있으므로, 다음에 켤 때 남은 것을 먼저 끄고 자리를 넘겨받는다
// (그 번호를 지금 쓰는 프로그램이 정말 이 마을의 관리 프로그램·서버인지 명령줄로 확인한 뒤에만 끈다)
const PID_FILE = path.join(DATA, MAIN ? 'live-main-pids.json' : 'live-pids.json');
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
  const ours = (cmd) => (SUPERVISOR.test(cmd) && /\s--main/.test(cmd) === MAIN) || GAME.test(cmd)
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

// 하나의 프로그램을 켜 두고, 멈추면 RETRY_MS 뒤 다시 켠다.
// on(): 지금 켜 두어야 하는지 (스위치 파일로 끄고 켤 때). 꺼야 하면 끄고, 다시 켜야 하면 켠다 (2초마다 확인)
function keep(name, args, env = {}, on = () => true) {
  // busy: 포트를 이미 다른 곳에서 쓰고 있어 기다리는 중. 그동안은 같은 오류를 몇 초마다 되풀이해 적지 않는다
  const job = { child: null, restartNow: false, busy: false, waiting: false, stopping: false };
  const start = () => {
    job.waiting = false;
    if (!on()) return;
    const child = spawn(process.execPath, args, {
      cwd: ROOT, windowsHide: true, env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', ...env }, stdio: ['ignore', 'pipe', 'pipe'],
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
      if (job.stopping) {
        job.stopping = false;
        console.log(`[live] ${stamp()} ${name} 끔`);
        return;
      }
      if (inUse) {
        if (!job.busy) console.warn(`[live] ${stamp()} ${name}: 포트를 이미 다른 곳에서 쓰고 있음 → 비워질 때까지 ${RETRY_MS / 1000}초마다 다시 켜 봄`);
        job.busy = true;
      } else {
        job.busy = false;
        if (!now) console.warn(`[live] ${stamp()} ${name} 멈춤 (코드 ${code}) → ${RETRY_MS / 1000}초 뒤 다시 켬`);
      }
      job.waiting = true;
      setTimeout(start, now ? 0 : RETRY_MS);
    });
  };
  setInterval(() => {
    if (on() && !job.child && !job.waiting) start();
    else if (!on() && job.child && !job.stopping) {
      job.stopping = true;
      job.child.kill();
    }
  }, 2000);
  job.restart = () => {
    if (!job.child) return;
    job.restartNow = true;
    job.child.kill();
  };
  start();
  return job;
}

// ── --main: 전용 작업 폴더를 원격 main에 맞춘다 ──
function git(args, cwd = REPO) {
  return execFileSync('git', args, { cwd, windowsHide: true, encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
let shown = '';
function ensureWorktree() {
  if (fs.existsSync(path.join(ROOT, '.git'))) return;
  fs.mkdirSync(path.dirname(ROOT), { recursive: true });
  git(['worktree', 'prune']);
  git(['fetch', '--quiet', 'origin', 'main']);
  git(['worktree', 'add', '--detach', '--force', ROOT, 'origin/main']);
  console.log(`[live] ${stamp()} 원격 main 전용 작업 폴더를 만들었음: ${ROOT}`);
}
function linkModules() {
  // 설치 폴더는 작업 폴더의 것을 연결해 함께 쓴다 (node_modules는 git이 무시하므로 맞출 때 지워지지 않는다)
  const link = path.join(ROOT, 'node_modules');
  if (!fs.existsSync(link)) fs.symlinkSync(path.join(REPO, 'node_modules'), link, 'junction');
}
function sync() {
  try {
    // 다른 세션이 동시에 받아오면 잠금 오류가 날 수 있음 → 다음 주기에 다시 시도
    git(['fetch', '--quiet', 'origin', 'main'], ROOT);
    const target = git(['rev-parse', 'origin/main'], ROOT);
    if (git(['rev-parse', 'HEAD'], ROOT) !== target) {
      git(['checkout', '--quiet', '--force', '--detach', target], ROOT);
      git(['clean', '-fdq'], ROOT);
    }
    if (target !== shown) {
      shown = target;
      console.log(`[live] ${stamp()} 원격 main → ${target.slice(0, 7)} ${git(['log', '-1', '--format=%s', target], ROOT)}`);
    }
    if (DEPLOY_TEST) deployTest(target);
  } catch (e) {
    console.warn(`[live] ${stamp()} 원격 main 맞추기 실패 (다음 주기에 다시):`, String(e.stderr || e.message || e).split('\n')[0]);
  }
}

// ── --deploy-test: 원격 main이 바뀌면 실제 서버의 테스트판(https://test.class-village.duckdns.org)에도 올린다 ──
// 저장소가 비공개라 서버가 GitHub에서 직접 받아올 수 없으므로, 늘 켜져 있는 이 프로그램이 대신 올려 준다.
// 올리는 중에 또 바뀌면 끝난 뒤 가장 새 커밋을 한 번 더 올린다. 실패하면 다음 확인 때 다시 시도한다
const DEPLOY_TEST = MAIN && process.argv.includes('--deploy-test');
const DEPLOYED_FILE = path.join(DATA, 'test-deployed.txt'); // 테스트판에 마지막으로 올린 커밋
const BASH = ['C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Program Files (x86)\\Git\\bin\\bash.exe'].find((p) => fs.existsSync(p)) || 'bash';
let deploying = false;
let deployFailAt = 0;
function deployTest(target) {
  let done = '';
  try { done = fs.readFileSync(DEPLOYED_FILE, 'utf8').trim(); } catch { /* 처음 */ }
  if (deploying || done === target || Date.now() - deployFailAt < 60000) return;
  deploying = true;
  console.log(`[live] ${stamp()} 테스트판에 올리는 중: ${target.slice(0, 7)}`);
  const child = spawn(BASH, ['tools/deploy.sh'], {
    cwd: REPO, windowsHide: true, env: { ...process.env, DEPLOY_TARGET: 'test', DEPLOY_REF: target }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  child.on('exit', (code) => {
    deploying = false;
    if (code === 0) {
      fs.writeFileSync(DEPLOYED_FILE, target);
      console.log(`[live] ${stamp()} 테스트판에 올림: ${target.slice(0, 7)} → https://test.class-village.duckdns.org`);
    } else {
      deployFailAt = Date.now(); // 1분 뒤 다시 시도 (서버가 잠깐 안 될 때 계속 두드리지 않게)
      console.warn(`[live] ${stamp()} 테스트판에 올리기 실패 (코드 ${code}, 1분 뒤 다시):\n${out.trim().split('\n').slice(-6).join('\n')}`);
    }
  });
}

if (MAIN) {
  ensureWorktree();
  linkModules();
  sync();
  setInterval(sync, POLL_MS);
}

const vite = path.join(REPO, 'node_modules', 'vite', 'bin', 'vite.js');
// strictPort: 포트가 쓰이고 있으면 다른 포트로 옮겨 가지 않고 멈췄다가 다시 시도한다 (늘 같은 주소로 접속하도록)
// 스위치 파일: --main 서버의 화면·게임 서버는 이 파일이 있을 때만 켠다 (원격 main 받아오기·테스트판 올리기는 늘 함).
// 켜기: 파일 만들기 · 끄기: 파일 지우기 → 2초 안에 따라간다. 로컬용(5173)은 스위치 없이 늘 켠다
const SWITCH = path.join(DATA, 'main-serve.on');
const serving = () => !MAIN || fs.existsSync(SWITCH);
const view = keep('화면', [vite, 'client', '--host', '--strictPort', '--port', String(VIEW_PORT)], { VITE_GAME_PORT: String(GAME_PORT) }, serving);
const game = keep('게임', ['server/index.js'], { GAME_PORT: String(GAME_PORT) }, serving);

// 게임 서버 코드가 바뀌면 다시 켠다 (여러 파일이 한꺼번에 바뀌어도 한 번만)
let timer = null;
for (const dir of ['server', 'shared']) {
  fs.watch(path.join(ROOT, dir), { recursive: true }, (_e, file) => {
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
console.log(`[live] ${stamp()} 상시 테스트 서버${MAIN ? '(원격 main)' : ''}: http://localhost:${VIEW_PORT}  (게임 서버 포트 ${GAME_PORT})`
  + (MAIN ? ` — 화면·게임 서버는 스위치 파일(${SWITCH})이 있을 때만 켬, 지금 ${serving() ? '켜짐' : '꺼짐'}` : ''));
