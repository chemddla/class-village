// 곤충 채집 (서버): 마을에 늘 BUG_COUNT 마리쯤의 곤충을 두고 움직이며, 다가오는 학생에 놀라 도망가거나
// 잠자리채에 잡힌다. 위치는 상태(state.bugs)로 모두에게 같게 보이고, 잡혔는지·도망갔는지는 서버가 정한다.
import {
  BUGS, BUG_SHY, RARITY, NET_CATCH, NET_ROOM, BUG_COUNT, BAG_MAX,
  WORLD, riverCenterZ, RIVER_HALF_WIDTH, onGrass, toCm, fromCm,
} from '../shared/world.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const RUNNING = 4.0; // 이보다 빠르면 달리는 중 (m/초)
const WALKING = 0.8; // 이보다 빠르면 걷는 중
const SCARE = 1.7; // 헛손질하면 이만큼 안의 겁 많은 곤충이 (확률로) 놀라 도망감 (m)
const SPOOK_RUN = 0.3; // 달려와서 놀란 곤충이 0.1초마다 날아갈 확률
const SPOOK_WALK = 0.08; // 걸어서 너무 가까이 왔을 때 (평균 1초 남짓 버틴다)

// room: 마을 방 · Bug: 상태 스키마 · speedOf(sessionId): 그 학생이 지금 움직이는 빠르기 (m/초)
export function setupBugs(room, Bug, speedOf) {
  const sims = new Map(); // 번호 → { sp, x, y, z, h(바라보는 각), ... }
  let nextId = 0;
  const taken = new Set(); // 이미 곤충이 앉은 꽃·나무 ('f3', 't12')

  // 희귀도를 먼저 뽑고(흔할수록 잘 나옴) 그중 하나. 전설은 한 번에 한 마리까지
  function pickSpecies() {
    const legendOut = [...sims.values()].some((s) => s.sp.rarity === 'legend');
    const pool = BUGS.filter((b) => !(legendOut && b.rarity === 'legend'));
    let roll = Math.random() * pool.reduce((t, b) => t + RARITY[b.rarity].weight / BUGS.filter((x) => x.rarity === b.rarity).length, 0);
    for (const b of pool) {
      roll -= RARITY[b.rarity].weight / BUGS.filter((x) => x.rarity === b.rarity).length;
      if (roll < 0) return b;
    }
    return pool[0];
  }
  function grassSpot(tries = 40) {
    for (let i = 0; i < tries; i++) {
      const x = rnd(-29, 29);
      const z = rnd(-29, 29);
      if (onGrass(x, z)) return [x, z];
    }
    return null;
  }
  // 줄기 둘레 높이 y 에서의 반지름 (나무 크기 s, village.js trunkGeometry 와 맞춤)
  const trunkR = (t, y) => (0.25 - 0.09 * Math.min(1, y / (1.45 * t.s))) * t.s;

  function place(sp) {
    const s = { sp, born: Date.now(), life: rnd(150, 300) * 1000, h: Math.random() * Math.PI * 2, fly: 0 };
    if (sp.move === 'fly') {
      if (sp.where === 'river') {
        const x = rnd(-28, 28);
        s.hx = x;
        s.hz = riverCenterZ(x) + rnd(-1.5, 1.5);
        s.base = rnd(0.6, 1.1);
        s.R = rnd(1.2, 2);
        s.w = rnd(0.4, 0.6); // 잠자리: 나비보다 조금 빠르고 넓게
      } else {
        const g = grassSpot();
        if (!g) return null;
        [s.hx, s.hz] = g;
        s.base = rnd(0.9, 1.6);
        s.R = rnd(0.7, 1.2);
        s.w = rnd(0.25, 0.42); // 천천히 팔랑팔랑
      }
      s.gx = s.hx;
      s.gz = s.hz;
      s.p = [Math.random() * 6, Math.random() * 6, Math.random() * 6];
      s.nextHome = Date.now() + rnd(12, 22) * 1000;
      s.fly = 1;
    } else if (sp.move === 'flower') {
      const free = WORLD.flowers.map((f, i) => ({ f, i })).filter(({ i }) => !taken.has(`f${i}`));
      const pick = free[Math.floor(Math.random() * free.length)];
      if (!pick) return null;
      sitOnFlower(s, pick.i);
      s.next = Date.now() + rnd(18, 35) * 1000;
    } else if (sp.move === 'tree') {
      const fruit = new Set(WORLD.fruitTrees);
      const free = WORLD.trees.map((t, i) => ({ t, i })).filter(({ t, i }) => !fruit.has(i) && t.kind === 0 && !taken.has(`t${i}`) && Math.abs(t.x) < 29 && Math.abs(t.z) < 29);
      const pick = free[Math.floor(Math.random() * free.length)];
      if (!pick) return null;
      const { t, i } = pick;
      taken.add(`t${i}`);
      s.spot = `t${i}`;
      const a = Math.random() * Math.PI * 2;
      s.y = rnd(0.75, 1.25) * t.s;
      const r = trunkR(t, s.y) + 0.035;
      s.x = t.x + Math.cos(a) * r;
      s.z = t.z + Math.sin(a) * r;
      s.h = Math.atan2(Math.cos(a), Math.sin(a)); // 줄기 바깥을 봄 (화면에서 줄기에 붙은 자세로)
      s.tree = 1;
    } else {
      const g = grassSpot();
      if (!g) return null;
      [s.x, s.z] = g;
      s.y = 0.03;
      s.next = Date.now() + rnd(1.5, 4.5) * 1000;
    }
    if (sp.move === 'fly') { s.x = s.hx; s.z = s.hz; s.y = s.base; }
    return s;
  }
  function sitOnFlower(s, i) {
    if (s.spot) taken.delete(s.spot);
    const f = WORLD.flowers[i];
    taken.add(`f${i}`);
    s.spot = `f${i}`;
    s.x = f.x;
    s.z = f.z;
    s.y = 0.31 * f.s + 0.05;
    s.fly = 0;
  }

  function spawn() {
    for (let k = 0; k < 6; k++) {
      const s = place(pickSpecies());
      if (!s) continue;
      const id = String(++nextId);
      const b = new Bug();
      b.s = s.sp.id;
      sims.set(id, s);
      write(b, s);
      room.state.bugs.set(id, b);
      return;
    }
  }
  function write(b, s) {
    const x = toCm(s.x);
    const z = toCm(s.z);
    const y = Math.max(0, Math.round(s.y * 100));
    const r = Math.round(((s.h / (Math.PI * 2)) * 256) % 256 + 256) % 256;
    if (b.x !== x) b.x = x;
    if (b.z !== z) b.z = z;
    if (b.y !== y) b.y = y;
    if (b.r !== r) b.r = r;
    const f = s.fly ? 1 : 0;
    if (b.f !== f) b.f = f;
  }
  // 없애기: reason 'fled'(놀라 날아감) · 'left'(오래 있다가 떠남) · 'caught'(잡힘). 잠시 뒤 다른 곳에 새로 나타난다
  function remove(id, reason) {
    const s = sims.get(id);
    if (!s) return;
    if (s.spot) taken.delete(s.spot);
    sims.delete(id);
    if (reason !== 'caught') room.broadcast('bugGone', [id, reason]);
    room.state.bugs.delete(id);
    room.clock.setTimeout(spawn, rnd(6, 15) * 1000);
  }

  // 움직이기 (0.1초마다)
  function move(s, now, dt) {
    const t = (now - s.born) / 1000;
    const px = s.x;
    const pz = s.z;
    if (s.sp.move === 'fly') {
      // 집(home) 둘레를 팔랑팔랑, 가끔 집을 조금 옮김 (잠자리는 더 빠르고 넓게)
      if (now > s.nextHome) {
        s.nextHome = now + rnd(12, 22) * 1000;
        for (let i = 0; i < 10; i++) {
          const gx = s.hx + rnd(-5, 5);
          const gz = s.sp.where === 'river' ? riverCenterZ(gx) + rnd(-1.5, 1.5) : s.hz + rnd(-5, 5);
          if (s.sp.where === 'river' ? Math.abs(gx) < 30 : onGrass(gx, gz)) { s.gx = gx; s.gz = gz; break; }
        }
      }
      const step = Math.min(1, (0.3 * dt) / (Math.hypot(s.gx - s.hx, s.gz - s.hz) || 1));
      s.hx += (s.gx - s.hx) * step;
      s.hz += (s.gz - s.hz) * step;
      const [p1, p2, p3] = s.p;
      s.x = s.hx + s.R * Math.sin(s.w * t + p1) + 0.25 * Math.sin(s.w * 2.3 * t + p2);
      s.z = s.hz + s.R * Math.cos(s.w * 0.8 * t + p1) + 0.25 * Math.cos(s.w * 1.9 * t + p3);
      s.y = s.base + 0.3 * Math.sin(s.w * 1.7 * t + p3);
    } else if (s.sp.move === 'flower') {
      if (s.trip) {
        // 다른 꽃으로 포물선을 그리며 날아감 (3초)
        const k = Math.min(1, (now - s.trip.t0) / 3000);
        s.x = s.trip.x0 + (s.trip.x1 - s.trip.x0) * k;
        s.z = s.trip.z0 + (s.trip.z1 - s.trip.z0) * k;
        s.y = s.trip.y0 + (s.trip.y1 - s.trip.y0) * k + Math.sin(k * Math.PI) * 0.9;
        if (k >= 1) { sitOnFlower(s, s.trip.i); s.trip = null; s.next = now + rnd(18, 35) * 1000; }
      } else if (now > s.next) {
        const near = WORLD.flowers.map((f, i) => ({ f, i })).filter(({ f, i }) => !taken.has(`f${i}`) && Math.hypot(f.x - s.x, f.z - s.z) < 5);
        const pick = near[Math.floor(Math.random() * near.length)];
        if (pick) {
          s.trip = { t0: now, i: pick.i, x0: s.x, z0: s.z, y0: s.y, x1: pick.f.x, z1: pick.f.z, y1: 0.31 * pick.f.s + 0.05 };
          taken.add(`f${pick.i}`);
          s.fly = 1;
        } else s.next = now + 10000;
      }
    } else if (s.sp.move === 'ground') {
      if (s.hop) {
        // 폴짝 (0.6초)
        const k = Math.min(1, (now - s.hop.t0) / 600);
        s.x = s.hop.x0 + (s.hop.x1 - s.hop.x0) * k;
        s.z = s.hop.z0 + (s.hop.z1 - s.hop.z0) * k;
        s.y = 0.03 + Math.sin(k * Math.PI) * 0.35;
        if (k >= 1) { s.hop = null; s.fly = 0; s.next = now + rnd(3, 7) * 1000; }
      } else if (now > s.next) {
        for (let i = 0; i < 8; i++) {
          const a = Math.random() * Math.PI * 2;
          const d = rnd(0.4, 0.9);
          const x1 = s.x + Math.cos(a) * d;
          const z1 = s.z + Math.sin(a) * d;
          if (onGrass(x1, z1)) { s.hop = { t0: now, x0: s.x, z0: s.z, x1, z1 }; s.fly = 1; break; }
        }
        if (!s.hop) s.next = now + 2000;
      }
    }
    if (!s.tree && Math.hypot(s.x - px, s.z - pz) > 0.002) s.h = Math.atan2(s.x - px, s.z - pz);
  }

  // 겁 많은 곤충은 달려오거나(희귀할수록 멀리서부터) 걸어서 너무 가까이 오면 날아가 버린다
  function scaredBy(s) {
    const shy = BUG_SHY[s.sp.rarity];
    if (!shy.run && !shy.walk) return false;
    for (const [sid, p] of room.state.players) {
      const v = speedOf(sid);
      if (v < WALKING) continue;
      const d = Math.hypot(fromCm(p.x) - s.x, fromCm(p.z) - s.z);
      if (shy.run && v > RUNNING && d < shy.run && Math.random() < SPOOK_RUN) return true;
      if (shy.walk && d < shy.walk && Math.random() < SPOOK_WALK) return true;
    }
    return false;
  }

  let last = Date.now();
  room.clock.setInterval(() => {
    const now = Date.now();
    const dt = Math.min(0.5, (now - last) / 1000);
    last = now;
    for (const [id, s] of [...sims]) {
      if (now - s.born > s.life) { remove(id, 'left'); continue; }
      if (scaredBy(s)) { remove(id, 'fled'); continue; }
      move(s, now, dt);
      const b = room.state.bugs.get(id);
      if (b) write(b, s);
    }
  }, 100);
  for (let i = 0; i < BUG_COUNT; i++) spawn();

  // 잠자리채 휘두르기: 그물 테가 지나간 길 [[x, y, z](cm), ...]. 그 길에서 NET_CATCH 안에 든 곤충 중 가장 가까운 것을 잡는다
  // (각도·높이가 맞아야 잡힌다. 길은 캐릭터 둘레 NET_ROOM 안의 점만 믿는다)
  room.onMessage('swing', (client, path) => {
    const p = room.state.players.get(client.sessionId);
    if (!p) return;
    const now = Date.now();
    if (now - (client.userData?.swingAt ?? 0) < 450) return;
    client.userData = { ...client.userData, swingAt: now };
    const x = fromCm(p.x);
    const z = fromCm(p.z);
    const pts = (Array.isArray(path) ? path.slice(0, 60) : [])
      .map((q) => (Array.isArray(q) ? q.map((v) => Number(v) / 100) : []))
      .filter((q) => q.length === 3 && q.every(Number.isFinite) && Math.hypot(q[0] - x, q[2] - z) < NET_ROOM && q[1] > -0.5 && q[1] < 4);
    let best = null;
    let bestD = NET_CATCH;
    let near = false;
    for (const [id, s] of sims) {
      if (Math.hypot(s.x - x, s.z - z) < SCARE) near = true;
      const d = pathDist(pts, s.x, s.y, s.z);
      if (d < bestD) { bestD = d; best = id; }
    }
    if (best) {
      const s = sims.get(best);
      const have = p.bag.get(s.sp.id) ?? 0;
      if (have >= BAG_MAX) { client.send('netResult', { full: true }); return; }
      p.bag.set(s.sp.id, have + 1);
      p.dex.set(s.sp.id, Math.min(65535, (p.dex.get(s.sp.id) ?? 0) + 1));
      room.broadcast('bugCaught', [client.sessionId, best, s.sp.id]); // 모두의 화면에서 머리 위로 들어 보임
      remove(best, 'caught');
      return;
    }
    // 헛손질: 근처의 겁 많은 곤충은 놀라 날아감
    let scared = 0;
    for (const [id, s] of [...sims]) {
      if (Math.hypot(s.x - x, s.z - z) < SCARE && Math.random() < BUG_SHY[s.sp.rarity].miss) { remove(id, 'fled'); scared++; }
    }
    client.send('netResult', { near, scared });
  });
}

// 꺾은선(그물 테가 지나간 길)과 점 사이의 가장 가까운 거리
function pathDist(pts, x, y, z) {
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1] ?? a;
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ap = [x - a[0], y - a[1], z - a[2]];
    const L = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
    const t = L > 0 ? Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / L)) : 0;
    best = Math.min(best, Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t));
  }
  return best;
}
