// 액션 상태 머신: 액션 함수가 매 프레임 관절 목표값을 내놓고, 현재값은 lerp로 부드럽게 따라간다.
// 키 형식 '관절.축' — r?=회전(라디안), p?=쉬는 자리에서 옮긴 거리, sy=세로로 늘어난 비율(눌림·늘어남). 빠진 키는 0(기본 자세)으로 돌아간다.
// 관절: root → pelvis → spine → head / shoulderR·L → elbowR·L → handR·L,  pelvis → hipR·L → kneeR·L → footR·L
// 부호: 팔·다리 rx < 0 이면 앞으로, 무릎 rx > 0 이면 뒤로 굽힘, 오른팔(R, -x쪽) rz < 0 이면 옆으로 들어 올림.
import * as THREE from 'three';

const PI = Math.PI;
const sm = THREE.MathUtils.smoothstep;
const SIDES = ['R', 'L'];
// 팔을 편히 내렸을 때 옆으로 벌어지는 각도: 물방울 몸통에서 소매가 비스듬히 뻗어 나오는 A자 실루엣
const ARM_REST = 0.6;

// 무릎 굽히기 c∈[0,1]: 발바닥이 바닥과 평행하도록 엉덩이·무릎·발목을 함께 굽히고 몸을 낮춘다
function crouch(P, c) {
  for (const s of SIDES) {
    P[`hip${s}.rx`] = -0.7 * c;
    P[`knee${s}.rx`] = 1.2 * c;
    P[`foot${s}.rx`] = -0.5 * c;
  }
  // 허벅지·종아리(각 0.1)가 기울어진 만큼 정확히 낮춰 발이 땅에 붙어 있게
  P['pelvis.py'] = 0.1 * Math.cos(0.7 * c) + 0.1 * Math.cos(0.5 * c) - 0.2;
  P['spine.rx'] = 0.2 * c;
}

// 키프레임: kf(u, [u0, v0], [u1, v1], ...) — 구간마다 smoothstep으로 이어 붙인 값
// 세 번째 값으로 그 구간의 빠르기 곡선을 바꿀 수 있다: 'in' 점점 빨라짐(내려찍기) · 'out' 확 나갔다가 느려짐(관성)
const EASE = { in: (s) => s * s * s, out: (s) => 1 - (1 - s) ** 3 };
function kf(u, ...pts) {
  if (u <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [u1, v1, ease] = pts[i];
    if (u <= u1) {
      const [u0, v0] = pts[i - 1];
      const w = ease ? EASE[ease]((u - u0) / (u1 - u0)) : sm(u, u0, u1);
      return v0 + (v1 - v0) * w;
    }
  }
  return pts[pts.length - 1][1];
}

// 만세: 큰 머리에 팔이 박히지 않도록 바깥쪽으로 비스듬히 든다
function armsUp(P, a, elbow = 0.1) {
  P['shoulderR.rz'] = -a;
  P['shoulderL.rz'] = a;
  P['shoulderR.rx'] = P['shoulderL.rx'] = -0.4 * Math.min(1, a / 2);
  P['elbowR.rx'] = P['elbowL.rx'] = -elbow;
}

// 다리 교차 스윙 (걷기·달리기 공통)
function stride(P, ph, swing, bend, lift) {
  let low = 0;
  SIDES.forEach((s, i) => {
    const p = ph + i * PI;
    const hip = -Math.sin(p) * swing;
    const knee = bend + Math.max(0, Math.cos(p)) * lift;
    P[`hip${s}.rx`] = hip;
    P[`knee${s}.rx`] = knee;
    P[`foot${s}.rx`] = -(hip + knee) * 0.65;
    low = Math.max(low, 0.1 * Math.cos(hip) + 0.1 * Math.cos(hip + knee));
  });
  // 더 낮은 쪽(디딘) 발이 늘 땅에 닿도록 골반 높이를 맞춘다 (발이 땅에 묻히거나 뜨지 않게)
  P['pelvis.py'] = low - 0.2;
}

export const ACTIONS = {
  idle(t, P) {
    const b = Math.sin(t * 2.2);
    const sway = Math.sin(t * 0.7);
    // 발은 땅에 붙인 채 무릎만 아주 살짝 굽혔다 펴고, 숨쉬기는 상체(가슴)로
    crouch(P, 0.1 + 0.025 * b);
    P['spine.py'] = b * 0.004;
    P['spine.sy'] = b * 0.012;
    P['spine.rx'] = b * 0.015;
    P['spine.rz'] = sway * 0.015;
    P['head.rx'] = -b * 0.012;
    P['head.ry'] = Math.sin(t * 0.8) * 0.05;
    P['head.rz'] = -sway * 0.02;
    // 팔은 몸통에서 비스듬히 뻗어 내린다 (숨 쉴 때 살짝 벌어졌다 모임)
    P['shoulderR.rz'] = -ARM_REST - b * 0.02;
    P['shoulderL.rz'] = ARM_REST + b * 0.02;
    P['shoulderR.rx'] = sway * 0.03;
    P['shoulderL.rx'] = -sway * 0.03;
    P['elbowR.rx'] = P['elbowL.rx'] = -0.08;
  },

  // 종종걸음: 짧은 다리로 잰걸음을 치며 몸이 좌우로 뒤뚱, 팔은 살짝 벌린 채 작게 흔든다
  walk(t, P) {
    const ph = t * 9;
    const sw = Math.sin(ph);
    stride(P, ph, 0.5, 0.12, 0.6);
    P['shoulderR.rx'] = sw * 0.38;
    P['shoulderL.rx'] = -sw * 0.38;
    P['shoulderR.rz'] = -ARM_REST;
    P['shoulderL.rz'] = ARM_REST;
    P['elbowR.rx'] = -0.2 - Math.max(0, -sw) * 0.2; // 앞으로 나간 팔만 살짝 더 굽힘
    P['elbowL.rx'] = -0.2 - Math.max(0, sw) * 0.2;
    P['pelvis.ry'] = sw * 0.08;
    P['pelvis.rz'] = Math.cos(ph) * 0.035; // 디딘 발 쪽으로 엉덩이가 실리는 뒤뚱거림
    P['spine.rx'] = 0.04;
    P['spine.ry'] = -sw * 0.1;
    P['spine.rz'] = -Math.cos(ph) * 0.06;
    P['head.rx'] = -0.02 + Math.cos(ph * 2) * 0.02; // 디딜 때마다 고개가 까딱
    P['head.ry'] = sw * 0.04;
    P['head.rz'] = -Math.cos(ph) * 0.03;
    P['root.sy'] = -Math.cos(ph * 2) * 0.02; // 디딜 때 살짝 눌렸다 펴지는 탄력
  },

  // 다다다 달리기: 상체는 조금만 숙이고, 두 팔을 날개처럼 옆·뒤로 뻗은 채 발만 바쁘게 구른다
  // (머리가 큰 2.5등신이라 육상 선수처럼 팔을 접어 크게 휘두르면 팔이 얼굴을 가리고 어색하다)
  run(t, P) {
    const ph = t * 14;
    const sw = Math.sin(ph);
    stride(P, ph, 0.8, 0.3, 1.0);
    P['shoulderR.rz'] = -0.8 - Math.cos(ph * 2) * 0.05;
    P['shoulderL.rz'] = 0.8 + Math.cos(ph * 2) * 0.05;
    P['shoulderR.rx'] = 0.55 + sw * 0.14;
    P['shoulderL.rx'] = 0.55 - sw * 0.14;
    P['elbowR.rx'] = P['elbowL.rx'] = -0.12;
    P['root.py'] = Math.abs(sw) * 0.02; // 두 다리가 벌어진 순간 살짝 뜸
    P['pelvis.ry'] = sw * 0.1;
    P['spine.rx'] = 0.14; // 상체를 앞으로 (마을에서는 달리는 빠르기만큼 몸 전체가 더 숙여진다)
    P['spine.ry'] = -sw * 0.12;
    P['spine.rz'] = -Math.cos(ph) * 0.04;
    P['head.rx'] = -0.1; // 고개는 앞을 보도록 되돌림
    P['head.rz'] = -Math.cos(ph) * 0.03;
    P['root.sy'] = -Math.cos(ph * 2) * 0.03;
  },

  // 가볍게 폴짝: 누르자마자 떠오르는 포물선. 두 팔은 옆으로 살짝 벌리고 다리는 짝짝이로 접었다가, 착지하며 눌렸다 튕김
  // rootRate: 몸 전체 높이는 포물선을 거의 그대로 따라간다. 다른 관절처럼 느긋하게 따라가면 떨어지는 속도가
  // 땅 가까이에서 갑자기 줄어, 공중에서 멈칫했다가 스르르 내려앉는 것처럼 끊겨 보인다
  jump: {
    duration: 0.95, rootRate: 120,
    fn(u, P) {
      const s = THREE.MathUtils.clamp((u - 0.08) / 0.7, 0, 1); // 공중 진행도
      const air = 4 * s * (1 - s); // 포물선
      const k = sm(air, 0, 0.35); // 공중 자세로 넘어간 정도
      crouch(P, kf(u, [0, 0], [0.06, 0.5], [0.1, 0], [0.76, 0], [0.84, 0.55], [1, 0]));
      P['root.py'] = air * 0.5;
      // 눌렸다 늘어나는 탄력은 도약할 때만: 착지 때도 넣으면 몸 전체(특히 큰 머리)가 눌렸다 튀어 머리가 또잉또잉 흔들린다
      P['root.sy'] = kf(u, [0, 0], [0.06, -0.06], [0.16, 0.07], [0.5, 0]);
      P['hipR.rx'] -= 0.8 * k;
      P['hipL.rx'] -= 0.5 * k;
      P['kneeR.rx'] += 1.1 * k;
      P['kneeL.rx'] += 0.7 * k;
      P['footR.rx'] = P['footL.rx'] += 0.3 * k;
      P['shoulderR.rz'] = -ARM_REST - 0.5 * k;
      P['shoulderL.rz'] = ARM_REST + 0.5 * k;
      P['shoulderR.rx'] = P['shoulderL.rx'] = -0.15 * k;
      P['elbowR.rx'] = P['elbowL.rx'] = -0.1 - 0.25 * k;
      // 착지할 때 고개는 끄덕이지 않는다: 무릎을 굽히며 상체가 숙여지는 만큼 되돌려 머리는 그대로 앞을 본다
      P['head.rx'] = kf(u, [0, 0], [0.2, -0.12], [0.6, 0]) - P['spine.rx'] * sm(u, 0.7, 0.78);
    },
  },

  // 더블 점프: 공중에서 한 번 더 솟으며 몸을 말아 앞으로 한 바퀴 (몸 가운데를 축으로)
  flip: {
    duration: 0.85,
    fn(u, P) {
      const ang = sm(u, 0, 0.62) * PI * 2;
      const h = 0.45; // 회전축 높이 (몸 가운데)
      const tuck = sm(u, 0, 0.12) * (1 - sm(u, 0.5, 0.66));
      // 착지: 발이 닿기(0.74) 조금 전부터 무릎을 굽히기 시작해, 닿는 순간 살짝 굽힌 채 받아 내고 천천히 편다
      // (닿은 뒤에야 굽히면 뻣뻣한 다리로 쿵 떨어진 것처럼 보인다)
      crouch(P, kf(u, [0.6, 0], [0.74, 0.3], [0.84, 0.42], [1, 0]));
      P['root.rx'] = ang;
      P['root.py'] = kf(u, [0, 0.5], [0.26, 0.8], [0.74, 0]) + h - h * Math.cos(ang);
      P['root.pz'] = -h * Math.sin(ang);
      for (const s of SIDES) {
        P[`hip${s}.rx`] -= 1.3 * tuck;
        P[`knee${s}.rx`] += 1.7 * tuck;
        P[`elbow${s}.rx`] = -1.2 * tuck;
      }
      P['shoulderR.rx'] = P['shoulderL.rx'] = -0.9 * tuck;
      P['shoulderR.rz'] = -ARM_REST * (1 - tuck) - 0.14 * tuck - 0.3 * (1 - tuck) * sm(u, 0.5, 0.7) * (1 - sm(u, 0.8, 1));
      P['shoulderL.rz'] = -P['shoulderR.rz'];
      // 착지하며 무릎을 굽히는 것과 함께 상체도 살짝 숙였다가 일어난다 (무릎만 굽히면 허리가 꼿꼿해 뻣뻣하다)
      const bow = kf(u, [0.58, 0], [0.76, 1], [0.86, 0.85], [1, 0]);
      P['spine.rx'] += 0.35 * tuck + 0.2 * bow;
      // 고개는 상체가 숙여진 만큼의 절반만 되돌린다: 몸과 함께 조금 숙여지되 끄덕이며 출렁이지는 않게
      P['head.rx'] = 0.3 * tuck - 0.5 * P['spine.rx'] * sm(u, 0.66, 0.74);
    },
  },

  wave(t, P) {
    const w = Math.sin(t * 7);
    // 팔이 짧아 머리 위로는 못 올리므로, 옆으로 들어 팔꿈치를 세우고 아래팔을 와이퍼처럼 흔든다 (손이 얼굴 옆에서 보이게)
    P['shoulderR.rz'] = -1.85 + w * 0.08;
    P['shoulderR.rx'] = -0.25;
    P['elbowR.rz'] = -0.55 + w * 0.38;
    P['elbowR.rx'] = -0.15;
    P['handR.rz'] = Math.sin(t * 7 - 0.6) * 0.25; // 손목은 아래팔보다 한 박자 늦게 따라온다
    P['shoulderL.rz'] = ARM_REST;
    P['shoulderL.rx'] = 0.1;
    // 한 발 앞으로 + 고개 갸우뚱
    P['hipL.rx'] = -0.3;
    P['hipL.rz'] = 0.04;
    P['kneeL.rx'] = 0.12;
    P['footL.rx'] = 0.18;
    P['hipR.rx'] = 0.12;
    P['hipR.rz'] = -0.03;
    P['footR.rx'] = -0.12;
    P['pelvis.ry'] = 0.12;
    P['pelvis.py'] = -0.001; // 벌린 두 발이 모두 땅에 닿는 높이
    P['spine.py'] = Math.sin(t * 2.2) * 0.004;
    P['spine.ry'] = -0.08;
    P['spine.rz'] = -0.04;
    P['head.rz'] = 0.16 + Math.sin(t * 1.6) * 0.05;
    P['head.ry'] = 0.1;
  },

  cheer(t, P) {
    const ph = t * 9;
    const hop = Math.abs(Math.sin(ph)); // 바닥에 닿을 때 뾰족하게 튀어 오르는 콩콩
    crouch(P, (1 - hop) ** 3 * 0.5);
    P['root.py'] = hop * 0.06;
    for (const s of SIDES) P[`knee${s}.rx`] += hop * 0.4;
    armsUp(P, 2.0 + Math.sin(ph * 2) * 0.12); // 머리 옆에 손이 붙지 않게 Y자로 활짝
    P['head.rx'] = -0.12;
    P['head.rz'] = Math.sin(ph) * 0.06;
  },
};


// ───────────── 생활 · 사냥 액션 ─────────────
// 함수 하나 = 반복(loop) 액션: (t, P, fx). 장비가 필요한 반복 액션은 { loop, equip } 객체로.
// 객체 = 일회성(one-shot) 액션: fn(u, P, fx, sec) — u는 0→1 진행도, sec는 시작 후 흐른 초.
//   duration 길이(초) · hitAt 타격 시점(u, 여러 번이면 배열) · next 끝난 뒤 이어질 액션(기본 idle)
//   hold 끝 자세 유지 · equip 자동으로 쥘 장비 · expression 재생 중 잠깐 바꿀 표정
// fx는 관절 외 연출 값 (bobber: 찌 위치, nock: 시위 당김, arrow: 화살 보임, glow: 지팡이 빛)

// 두 손 쥐기: equipment.js가 두 팔을 IK로 덮어 도구 자루를 함께 잡게 한다 (오른팔 애니메이션은 도구 방향으로만 쓰임).
// 팔 관절의 모든 축을 키로 등록해 두면 애니메이터가 매 프레임 다시 써서, IK가 풀릴 때 남은 회전 없이 돌아온다.
// on = false: 휘두른 뒤 제자리로 돌아오는 구간에서는 왼손을 놓는다. 팔을 내린 자세로 돌아가는데 계속 두 손으로 쥐면
// 짧은 팔이 몸 앞을 가로질러 배에 박히고, 그걸 밀어내느라 손이 튄다. (놓은 뒤의 오른팔 값은 실제 팔 자세로 쓰인다)
function twoHand(P, fx, on = true) {
  fx.twoHand = on;
  if (!on) fx.carry = true; // 놓은 뒤에는 바로 평소 들고 다니는 손목 각도로 돌아가기 시작한다 (동작이 끝난 뒤 따로 한 번 더 움직이지 않게)
  for (const s of SIDES) for (const j of ['shoulder', 'elbow', 'hand']) for (const a of ['rx', 'ry', 'rz']) P[`${j}${s}.${a}`] ??= j === 'shoulder' && a === 'rz' ? (s === 'R' ? -ARM_REST : ARM_REST) : 0;
}

// 두 점 사이 섞기 / 두 방향 사이를 원호로 섞기 (방향은 길이 1)
const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
const unit = (v) => v.map((x) => x / Math.hypot(...v));
// 네 점을 지나는 부드러운 곡선(캐트멀-롬)의 p1~p2 구간
const curve = (p0, p1, p2, p3, t) => p1.map((_, k) => 0.5 * (2 * p1[k] + (p2[k] - p0[k]) * t
  + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t + (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * t * t * t));
function slerpDir(a, b, t) {
  const th = Math.acos(THREE.MathUtils.clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1));
  if (th < 1e-4) return a;
  const ka = Math.sin((1 - t) * th) / Math.sin(th);
  const kb = Math.sin(t * th) / Math.sin(th);
  return a.map((x, i) => x * ka + b[i] * kb);
}
// ── 몽둥이 휘두르기 시안 ──
// back / hit: 젖혔을 때·타격 때 몽둥이가 뻗는 방향 (몸통 기준: x 오른쪽(-)·왼쪽(+), y 위, z 앞)
// posBack / posHit: 그때 두 손이 쥔 자리,  twist: 허리 비틀기 [젖힘, 타격, 관성],  lean: 상체 숙임 [젖힘, 타격, 관성]
//  - 끝이 왼쪽을 향하면 자루 끝을 쥔 왼손이 오른손보다 오른쪽에 놓여 두 팔이 엇갈린다.
//  - 타격 때 끝이 곧장 아래를 향하면 왼손이 자루 꼭대기에 얹히고 손목이 직각으로 꺾인다.
export const CLUB_STYLES = {
  // 타격 방향은 땅이 아니라 '앞'(상대가 서 있는 쪽): 맞는 순간 몽둥이가 거의 수평으로 앞을 향하고, 두 손은 배~가슴 높이 앞에 있다.
  // 상체도 깊이 숙이지 않는다 (숙이면 몸통 기준의 '앞'이 땅 쪽으로 기울어 다시 내리찍는 꼴이 된다)
  // 맞는 순간 몽둥이는 정면에서 오른쪽으로 30도쯤 비스듬히 앞을 향한다: 곧장 앞이면 두 주먹이 앞뒤 한 줄로 서서
  // 뒤쪽 주먹(왼손)이 앞쪽 팔(오른팔) 속에 겹친다. 비스듬하면 왼손이 오른손의 왼쪽 뒤에 놓여 두 팔이 양옆에서 모인다.
  // 손은 가슴 높이로: 팔이 짧아 낮게 내밀면 다 펴져 팔꿈치를 벌릴 여유가 없다.
  // 젖힐 때 두 손은 오른 어깨 쪽으로 멀리 보내지 않고 가슴 가운데 가까이 둔다: 멀리 보내면 왼팔이 가슴을 일자로 가로지른다.
  // 가까이 두면 왼 윗팔은 아래로 내려가고 아래팔이 손으로 올라가는 V자가 된다
  // (참고 영상) 오른 어깨 옆에 세워 들었다가, 두 팔을 뻗어 앞을 지나 왼쪽 아래까지 크게 휘두른다.
  // end / posEnd: 타격을 지나 관성으로 가 닿는 방향과 손 자리. 다리는 넓게 벌려 선다(stance)
  diagonal: { label: '대각선으로 앞을 치기', back: [-0.4, 0.86, -0.3], hit: [-0.4, 0.0, 0.92], end: [0.3, -0.52, 0.8],
    posBack: [-0.05, 0.19, 0.1], posHit: [-0.02, 0.13, 0.15], posEnd: [0.03, 0.1, 0.14],
    twist: [-0.72, 0.15, 0.62], lean: [-0.16, 0.14, 0.24], crouch: 0.36, stance: 1 },
  overhead: { label: '머리 위에서 앞으로 내려치기', back: [-0.22, 0.92, -0.32], hit: [-0.45, -0.18, 0.87],
    posBack: [-0.04, 0.21, 0.125], posHit: [-0.02, 0.12, 0.145], twist: [-0.2, 0.05, 0.12], lean: [-0.3, 0.2, 0.26], crouch: 0.35 },
  side: { label: '옆으로 크게 휘두르기', back: [-0.82, 0.22, -0.53], hit: [0.12, -0.12, 0.98],
    posBack: [-0.08, 0.13, 0.11], posHit: [-0.01, 0.09, 0.155], twist: [-0.85, 0.2, 0.75], lean: [-0.05, 0.14, 0.18], crouch: 0.25 },
  // 2타: 1타(대각선)가 왼쪽 아래로 내려간 자리에서 그대로 왼쪽 위로 들어 올려, 오른쪽 아래로 대각선으로 휘두른다.
  // from: 시작 자세를 1타의 관성 끝 자세로 잡아 두 동작이 끊기지 않고 이어진다
  second: { label: '2타 · 왼쪽 위에서 앞을 지나 오른쪽으로', // (젖힐 때 몽둥이를 왼쪽으로 많이 눕히지 않고 머리 왼쪽 위로 세운다: 많이 눕히면 자루 끝을 쥔 왼손이 오른손의 오른쪽에 놓여
    //  오른팔이 왼팔을 가로질러 지나간다)
    back: [0.42, 0.72, -0.55], hit: [-0.25, 0.0, 0.97], end: [-0.72, -0.45, 0.53],
    posBack: [0.015, 0.185, 0.115], posHit: [-0.02, 0.13, 0.15], posEnd: [-0.06, 0.1, 0.13],
    twist: [0.6, -0.15, -0.55], lean: [-0.16, 0.14, 0.24], crouch: 0.36, stance: 1,
    // via: 들어 올릴 때 거쳐 가는 자세. 왼쪽 아래에서 몸 옆 뒤로 돌아 올라가야, 꼭대기에서 멈췄다 되돌아오지 않고
    // 뒤 → 위 → 앞으로 한 방향으로 돌며 그대로 내리치게 된다 (앞쪽으로 들어 올리면 꼭대기에서 방향이 뒤집혀 한 박자 선다)
    from: 'diagonal', duration: 0.62, via: { dir: [0.42, -0.62, -0.66], pos: [0.01, 0.095, 0.135] } },
  // 3타(= 이어 치는 1타): 2타가 오른쪽 아래로 내려간 자리에서 몸 오른쪽 뒤로 돌아 올라가 다시 왼쪽 아래로 내리친다.
  // 2타의 거울상이라 2타 → 3타 → 2타 → … 로 끝없이 8자를 그리며 이어진다 (끝 자세가 1타와 같아 2타가 그대로 받는다)
  third: { label: '3타 · 다시 오른쪽 위에서 앞을 지나 왼쪽으로', back: [-0.4, 0.86, -0.3], hit: [-0.4, 0.0, 0.92], end: [0.3, -0.52, 0.8],
    posBack: [-0.05, 0.19, 0.1], posHit: [-0.02, 0.13, 0.15], posEnd: [0.03, 0.1, 0.14],
    twist: [-0.72, 0.15, 0.62], lean: [-0.16, 0.14, 0.24], crouch: 0.36, stance: 1,
    from: 'second', duration: 0.62, via: { dir: [-0.8, -0.46, -0.38], pos: [-0.05, 0.09, 0.13] } },
  upper: { label: '아래에서 올려치기', back: [-0.62, -0.55, -0.56], hit: [-0.25, 0.5, 0.83],
    posBack: [-0.09, 0.07, 0.1], posHit: [-0.03, 0.15, 0.155], twist: [-0.6, 0.2, 0.45], lean: [0.3, -0.12, -0.2], crouch: 0.2, follow: 1.3 },
};
const CLUB_READY = unit([-0.2, 0.8, 0.5]);
const CLUB_READY_POS = [-0.02, 0.14, 0.105]; // 몸 가까이: 멀리 내밀면 들어 올리기 전부터 두 팔이 일자로 뻗는다

// 허리와 어깨를 감으며 몽둥이를 젖혔다가(예비 동작) 번개처럼 휘두르고(가속), 관성으로 조금 더 나간 뒤(잔여 동작) 돌아온다.
// 두 손이 쥔 자리와 몽둥이 방향은 fx.grip 으로 직접 정한다 (몸통 기준이라 허리를 틀면 함께 돈다).
// 휘두른 뒤(0.7~)에는 왼손을 놓고 오른팔 값대로 제자리로 돌아온다.
function clubSwing(S) {
  const BACK = unit(S.back);
  const HIT = unit(S.hit);
  const [tw0, tw1, tw2] = S.twist;
  const [ln0, ln1, ln2] = S.lean;
  const deep = S.crouch ?? 0.5;
  const over = S.follow ?? 1.22;
  // 시작 자세: 보통은 몸 앞에 세워 든 준비 자세, 이어 치는 동작은 앞 동작의 관성 끝 자세
  const prev = S.from ? CLUB_STYLES[S.from] : null;
  const startPos = prev ? prev.posEnd ?? mix(prev.posBack, prev.posHit, prev.follow ?? 1.22) : CLUB_READY_POS;
  const startDir = prev ? (prev.end ? unit(prev.end) : slerpDir(unit(prev.back), unit(prev.hit), prev.follow ?? 1.22)) : CLUB_READY;
  const END = S.end ? unit(S.end) : null;
  // 젖힘 → 타격 → 관성 끝을 한 줄의 곡선으로: 타격(q = 1)에서 방향이 꺾이지 않고 그대로 지나간다
  const sweep = (q) => (q <= 1
    ? { pos: curve(S.posBack, S.posBack, S.posHit, S.posEnd, q), dir: unit(curve(BACK, BACK, HIT, END, q)) }
    : { pos: curve(S.posBack, S.posHit, S.posEnd, S.posEnd, q - 1), dir: unit(curve(BACK, HIT, END, END, q - 1)) });
  const wide = S.stance ?? 0;
  const ws = prev ? (prev.stance ?? 0) : 0;
  // 이어 치는 동작은 몸(허리 비틀기·숙임·무릎)도 앞 동작이 끝난 자세에서 시작한다: 0에서 시작하면 넘어가는 순간 몸이 홱 풀렸다 다시 감긴다
  const VIA = S.via ? unit(S.via.dir) : null;
  const tws = prev ? prev.twist[2] : 0;
  const lns = prev ? prev.lean[2] : 0;
  const cs = prev ? (prev.crouch ?? 0.5) * 0.9 : 0;
  return {
    duration: S.duration ?? 0.72, hitAt: 0.5, equip: 'club', rate: 36, trail: [0.42, 0.68],
    fn(u, P, fx) {
      twoHand(P, fx, u < 0.7);
      // 되튐은 작고 느리게: 크게 떨면 내리친 뒤 몸 전체가 덜컥거린다
      const shake = u > 0.5 ? Math.sin((u - 0.5) * 40) * Math.exp(-(u - 0.5) * 16) * 0.5 : 0;
      crouch(P, kf(u, [0, cs], [0.3, 0.15], [0.42, 0.1], [0.5, deep * 0.8, 'in'], [0.62, deep, 'out'], [0.82, deep * 0.6], [1, 0]));
      // 준비 → 젖힘까지 한 번(back), 젖힌 데서 타격을 지나 관성까지는 같은 원호 위를 한 번에(swing: 0 → 타격 1 → 관성) 간다.
      // 타격에서 다른 원호로 갈아타면 가장 빠른 순간에 방향이 꺾여 덜컥거린다
      const back = kf(u, [0, 0], [0.4, 1]);
      const swing = kf(u, [0.4, 0], [0.5, 1, 'in'], [0.68, END ? 2 : over, 'out']);
      const after = (q) => (END ? sweep(q) : { pos: mix(S.posBack, S.posHit, q), dir: slerpDir(BACK, HIT, q) });
      if (S.via) {
        // 이어 치기: 시작 → 거쳐 가는 자세 → 젖힘 → 타격을 한 줄의 부드러운 곡선으로 잇고, 멈추지 않고 점점 빨라지며 지나간다
        // (젖힌 꼭대기에서도 속도가 남아 있어 채찍처럼 이어진다). 타격 뒤는 같은 방향으로 조금 더 나가며 느려진다
        const p = u < 0.5 ? 3 * (u / 0.5) ** 2.2 : 3;
        const i = Math.min(2, Math.floor(p));
        const t = p - i;
        const at = (pts) => curve(pts[Math.max(0, i - 1)], pts[i], pts[i + 1], pts[Math.min(pts.length - 1, i + 2)], t);
        fx.grip = u < 0.5
          ? { pos: at(END ? [startPos, S.via.pos, S.posBack, S.posHit, S.posEnd] : [startPos, S.via.pos, S.posBack, S.posHit]),
            dir: unit(at(END ? [startDir, VIA, BACK, HIT, END] : [startDir, VIA, BACK, HIT])) }
          : after(swing);
      } else {
        fx.grip = u < 0.4
          ? { pos: mix(startPos, S.posBack, back), dir: slerpDir(startDir, BACK, back) }
          : after(swing);
      }
      // 다리를 넓게 벌려 선다: 휘두르는 동안 버티고, 돌아올 때 모은다 (발바닥은 땅과 나란히)
      const st = kf(u, [0, ws], [0.3, wide], [0.7, wide], [1, 0]) * 0.26;
      P['hipR.rz'] = -st; P['hipL.rz'] = st;
      P['footR.rz'] = st; P['footL.rz'] = -st;
      P['pelvis.py'] -= 0.2 * (1 - Math.cos(st)) + 0.005 * (st / 0.26); // 벌린 만큼 낮춰 발이 뜨지 않게
      // 쥐기 전·놓은 뒤에 쓰이는 두 팔: 몸 앞에서 비스듬히 든 자세 (쥐는 자리와 가까워야 쥐고 놓을 때 팔이 몸을 스치지 않는다)
      // 돌아오는 구간(0.7~)은 팔꿈치·손목을 꺾지 않고 팔 전체를 어깨에서 천천히 내린다: 놓은 뒤에도 팔꿈치가 접혀 있거나
      // 손목이 젖혀 있으면 팔이 중간에서 툭 꺾인 채 내려온다
      P['shoulderR.rx'] = kf(u, [0, 0], [0.3, -0.9], [0.62, -0.65], [0.8, -0.42], [1, 0]);
      P['shoulderR.rz'] = kf(u, [0, -ARM_REST], [0.43, -0.5], [0.62, -0.3], [0.8, -0.45], [1, -ARM_REST]);
      P['elbowR.rx'] = kf(u, [0, 0], [0.3, -0.8], [0.62, -0.5], [0.8, -0.16], [1, -0.08]);
      P['handR.rx'] = kf(u, [0, 0], [0.3, 0.3], [0.62, 0.2], [0.76, 0], [1, 0]);
      P['shoulderL.rx'] = kf(u, [0, 0], [0.3, -0.6], [0.62, -0.55], [0.82, -0.3], [1, 0]);
      P['shoulderL.rz'] = kf(u, [0, ARM_REST], [0.3, 0.35], [0.62, 0.35], [1, ARM_REST]);
      P['elbowL.rx'] = kf(u, [0, 0], [0.3, -0.6], [0.62, -0.5], [0.8, -0.14], [1, -0.08]);
      // 몸은 한꺼번에 돌지 않고 골반 → 허리 → 고개 순으로 조금씩 늦게 따라 풀린다 (같은 순간에 다 같이 돌면 로봇처럼 뻣뻣하다).
      // 휘두른 뒤에는 덜컥 멈추지 않고 천천히 넘어갔다가 제자리로 돌아온다
      P['pelvis.ry'] = kf(u, [0, tws * 0.4], [0.36, tw0 * 0.4], [0.47, tw1 * 0.7, 'in'], [0.62, tw2 * 0.4, 'out'], [1, 0]);
      P['spine.ry'] = kf(u, [0, tws], [0.4, tw0], [0.495, tw1, 'in'], [0.66, tw2, 'out'], [0.86, tw2 * 0.5], [1, 0]);
      P['spine.rx'] += kf(u, [0, lns], [0.4, ln0], [0.5, ln1, 'in'], [0.66, ln2, 'out'], [0.86, ln2 * 0.45], [1, 0]) + shake * 0.05;
      P['spine.rz'] = kf(u, [0, 0], [0.4, tw0 * 0.11], [0.52, -tw0 * 0.08], [1, 0]); // 감는 쪽 어깨가 살짝 내려간다
      P['head.rx'] = kf(u, [0, 0], [0.42, ln0 * 0.45], [0.53, ln1 * 0.33], [1, 0]) - shake * 0.05;
      P['head.ry'] = kf(u, [0, -tws * 0.76], [0.4, -tw0 * 0.97], [0.52, -tw1 * 0.8], [0.68, -tw2 * 0.76], [1, 0]); // 몸을 틀어도 눈은 앞을
      P['hipL.rx'] -= kf(u, [0, 0], [0.42, 0.3], [0.62, 0.2], [1, 0]);
      P['root.sy'] = kf(u, [0.2, 0], [0.42, 0.04], [0.53, -0.05], [0.78, 0]);
    },
  };
}

// 낚시 3단계 (연속 시퀀스에서도 같은 함수를 재사용)
const fishCast = (u, P, fx) => {
  twoHand(P, fx);
  // 한 발 내딛으며 크게 뒤로 젖혔다가 휙 — 던진 뒤 낚싯대가 살짝 되튐
  P['shoulderR.rx'] = kf(u, [0, -0.3], [0.18, -0.1], [0.42, -2.6], [0.6, -0.35], [0.74, -0.65], [1, -0.55]);
  P['shoulderR.rz'] = kf(u, [0, 0.15], [0.42, -0.8], [0.6, 0.2], [1, 0.15]);
  P['elbowR.rx'] = kf(u, [0, -0.35], [0.42, -0.9], [0.6, -0.15], [1, -0.35]);
  P['handR.rx'] = kf(u, [0.42, -0.3], [0.6, 0.6], [0.78, 0.45]);
  P['shoulderL.rx'] = kf(u, [0, 0], [0.42, 0.35], [0.62, -0.5], [1, -0.6]);
  P['shoulderL.rz'] = kf(u, [0, 0.1], [0.42, 0.45], [0.62, 0.1]);
  P['elbowL.rx'] = -0.6;
  P['spine.rx'] = kf(u, [0, 0], [0.42, -0.2], [0.6, 0.24], [0.76, 0.02], [1, 0.05]);
  P['spine.ry'] = kf(u, [0, 0], [0.42, -0.35], [0.6, 0.16], [1, 0]);
  P['pelvis.ry'] = kf(u, [0, 0], [0.42, -0.12], [0.6, 0.06], [1, 0]);
  P['head.rx'] = kf(u, [0, 0], [0.42, -0.2], [0.62, 0.1], [1, 0.08]);
  P['hipL.rx'] = kf(u, [0.3, 0], [0.6, -0.36], [1, -0.15]);
  P['kneeL.rx'] = kf(u, [0.3, 0], [0.6, 0.2], [1, 0]);
  fx.bobber = u > 0.6 ? 'water' : 'hang';
};
const fishWait = (t, P, fx) => {
  const b = Math.sin(t * 2.2);
  const sway = Math.sin(t * 0.9);
  // 찌를 보다가 가끔 두리번, 몸은 좌우로 느긋하게 흔들고 낚싯대 끝은 까딱까딱
  const glance = sm(Math.sin(t * 0.55), 0.8, 1);
  twoHand(P, fx);
  P['shoulderR.rx'] = -0.55 + Math.sin(t * 1.4) * 0.04 + Math.max(0, Math.sin(t * 3.1)) ** 6 * 0.08;
  P['shoulderR.rz'] = 0.15;
  P['elbowR.rx'] = -0.35;
  P['handR.rx'] = 0.45 + Math.sin(t * 1.4 + 1) * 0.04;
  P['shoulderL.rx'] = -0.6 + sway * 0.03;
  P['elbowL.rx'] = -0.6;
  P['spine.rx'] = 0.05 + b * 0.012;
  P['spine.rz'] = sway * 0.03;
  P['spine.py'] = b * 0.004;
  P['pelvis.ry'] = sway * 0.03;
  P['hipL.rx'] = -0.15;
  P['head.rx'] = 0.08 - glance * 0.12;
  P['head.ry'] = glance * 0.45;
  P['head.rz'] = -sway * 0.04;
  fx.bobber = 'water';
};
const fishCatch = (u, P, fx) => {
  // 움찔 숙였다가 낚아채며 뒤로 젖히고 폴짝, 낚싯대를 번쩍 든 채 기뻐서 한 번 더 통통
  twoHand(P, fx, u < 0.85);
  crouch(P, kf(u, [0, 0], [0.12, 0.45], [0.26, 0], [0.5, 0], [0.56, 0.3], [0.64, 0], [0.8, 0], [0.86, 0.25], [1, 0]));
  P['shoulderR.rx'] = kf(u, [0, -0.55], [0.12, -0.3], [0.3, -2.5], [0.7, -2.3], [1, -0.4]);
  P['handR.rx'] = kf(u, [0, 0.45], [0.3, -0.1], [0.5, 0]);
  P['shoulderR.rz'] = kf(u, [0, 0.15], [0.3, -0.65], [0.7, -0.6], [1, 0]);
  P['elbowR.rx'] = kf(u, [0, -0.35], [0.3, -0.1]);
  P['shoulderL.rx'] = kf(u, [0, -0.6], [0.3, -2.1], [0.7, -1.9], [1, -0.3]);
  P['shoulderL.rz'] = kf(u, [0, 0], [0.3, 0.75], [1, 0.2]);
  P['spine.rx'] = kf(u, [0, 0.05], [0.12, 0.18], [0.3, -0.28], [0.7, -0.12], [1, 0]);
  P['root.py'] = kf(u, [0.24, 0], [0.38, 0.14], [0.52, 0], [0.62, 0], [0.71, 0.06], [0.8, 0]);
  P['root.sy'] = kf(u, [0.18, 0], [0.24, -0.05], [0.34, 0.06], [0.52, -0.05], [0.6, 0]);
  P['head.rx'] = kf(u, [0, 0.08], [0.35, -0.3], [1, 0]);
  P['head.rz'] = Math.sin(u * 22) * 0.07 * kf(u, [0.4, 0], [0.55, 1], [0.85, 1], [1, 0]);
  fx.bobber = u < 0.3 ? 'water' : 'hang';
};

Object.assign(ACTIONS, {
  // 생활
  gather: {
    duration: 1.8, hitAt: 0.5,
    fn(u, P) {
      // 쪼그려 앉아 손을 뻗고 → 톡 잡아당겨 따고 → 일어나며 딴 것을 들어 보며 폴짝
      crouch(P, kf(u, [0, 0], [0.28, 1.3], [0.44, 1.2], [0.5, 1.3], [0.6, 1.1], [0.84, 0]));
      // 큰 머리가 발끝 너머로 쏟아지지 않게: 허리는 덜 숙이고 엉덩이를 뒤로 빼며, 고개는 들어 손끝을 본다
      P['spine.rx'] += kf(u, [0, 0], [0.28, 0.06], [0.46, 0.12], [0.56, 0], [0.84, -0.05], [1, 0]);
      P['pelvis.pz'] = kf(u, [0, 0], [0.28, -0.035], [0.6, -0.03], [0.84, 0]);
      P['spine.ry'] = kf(u, [0, 0], [0.3, 0.2], [0.56, -0.1], [0.9, 0]);
      P['head.rx'] = kf(u, [0, 0], [0.28, -0.08], [0.56, -0.05], [0.76, -0.22], [1, 0]);
      P['head.rz'] = Math.sin(u * 30) * 0.06 * kf(u, [0.68, 0], [0.78, 1], [0.92, 1], [1, 0]);
      P['shoulderR.rx'] = kf(u, [0, 0], [0.3, -0.6], [0.46, -0.75], [0.54, -0.5], [0.78, -1.9], [0.9, -1.8], [1, 0]);
      P['shoulderR.rz'] = kf(u, [0, 0], [0.3, 0.25], [0.78, 0.2], [1, 0]);
      P['elbowR.rx'] = kf(u, [0.3, 0], [0.46, -0.1], [0.54, -0.7], [0.78, -1.0], [1, 0]);
      P['handR.rx'] = kf(u, [0.4, 0], [0.48, 0.4], [0.56, -0.2], [0.75, 0]);
      // 왼손은 무릎을 짚었다가, 일어나면 옆으로 가볍게 벌림
      P['shoulderL.rx'] = kf(u, [0, 0], [0.28, -0.7], [0.6, -0.6], [0.8, 0.15], [1, 0]);
      P['shoulderL.rz'] = kf(u, [0.6, 0], [0.8, 0.45], [1, 0]);
      P['elbowL.rx'] = kf(u, [0, 0], [0.28, -0.5], [0.6, -0.5], [0.8, -0.2], [1, 0]);
      P['root.py'] = kf(u, [0.76, 0], [0.86, 0.1], [0.96, 0]);
      P['root.sy'] = kf(u, [0.7, 0], [0.76, -0.05], [0.84, 0.05], [0.96, -0.04], [1, 0]);
    },
  },
  // 도끼질: 허리를 틀며 도끼를 어깨 너머로 천천히 크게 젖혀(예비 동작) → 순식간에 내려찍고(가속) →
  // 관성으로 조금 더 파고들었다가(잔여 동작) 부르르 되튐. 내려찍는 구간이 예전보다 두 배 빠르다.
  chop: {
    duration: 1.3, hitAt: 0.55, equip: 'axe', rate: 42, trail: [0.47, 0.66],
    fn(u, P, fx) {
      twoHand(P, fx, u < 0.8);
      const shake = u > 0.55 ? Math.sin((u - 0.55) * 60) * Math.exp(-(u - 0.55) * 14) : 0;
      crouch(P, kf(u, [0, 0], [0.2, 0.22], [0.48, 0.02], [0.55, 0.5, 'in'], [0.62, 0.62, 'out'], [0.78, 0.45], [1, 0]));
      P['shoulderR.rx'] = kf(u, [0, 0], [0.4, -1.85], [0.48, -2.1], [0.55, -0.5, 'in'], [0.62, -0.3, 'out'], [0.78, -0.6], [1, 0]) + shake * 0.12;
      P['shoulderR.rz'] = kf(u, [0, 0], [0.4, -1.15], [0.48, -1.3], [0.55, 0.3, 'in'], [0.62, 0.38, 'out'], [0.78, -0.2], [1, -ARM_REST]);
      P['shoulderL.rx'] = kf(u, [0, 0], [0.4, -1.25], [0.48, -1.45], [0.55, -0.5, 'in'], [0.62, -0.35, 'out'], [0.78, -0.55], [1, 0]) + shake * 0.12;
      P['shoulderL.rz'] = kf(u, [0, ARM_REST], [0.48, -0.22], [0.55, -0.35, 'in'], [0.78, 0.25], [1, ARM_REST]);
      P['elbowR.rx'] = kf(u, [0, 0], [0.48, -0.5], [0.55, -0.1, 'in'], [1, 0]);
      P['elbowL.rx'] = kf(u, [0, 0], [0.48, -0.95], [0.55, -0.2, 'in'], [1, 0]);
      P['spine.rx'] += kf(u, [0, 0], [0.4, -0.25], [0.48, -0.34], [0.55, 0.45, 'in'], [0.62, 0.55, 'out'], [0.78, 0.35], [1, 0]) + shake * 0.05;
      P['spine.ry'] = kf(u, [0, 0], [0.48, -0.38], [0.55, 0.18, 'in'], [0.62, 0.24, 'out'], [1, 0]);
      P['pelvis.ry'] = kf(u, [0, 0], [0.48, -0.16], [0.55, 0.1, 'in'], [1, 0]);
      P['head.rx'] = kf(u, [0, 0], [0.48, -0.22], [0.55, 0.15, 'in'], [1, 0]) - shake * 0.06;
      P['head.ry'] = kf(u, [0, 0], [0.48, 0.28], [0.55, -0.1, 'in'], [1, 0]); // 몸을 틀어도 눈은 나무에
      P['hipL.rx'] -= kf(u, [0, 0], [0.48, 0.28], [1, 0]);
      P['root.sy'] = kf(u, [0.3, 0], [0.48, 0.05], [0.56, -0.06], [0.75, 0]);
    },
  },
  // 몽둥이 내리치기: 허리와 어깨를 오른쪽 뒤로 크게 감으며 몽둥이를 오른 어깨 너머 뒤로 보냈다가(예비 동작),
  // 머리 위를 넘겨 몸 앞으로 번개처럼 내리치고(가속), 관성으로 왼쪽 아래까지 더 내려간 뒤(잔여 동작) 부르르 되튐.
  // 두 손이 쥔 자리와 몽둥이 방향은 fx.grip 으로 직접 정한다 (몸통 기준이라 허리를 틀면 함께 돈다).
  // 내리친 뒤(0.68~)에는 왼손을 놓고 오른팔 값대로 제자리로 돌아온다.
  clubSmash: clubSwing(CLUB_STYLES.diagonal),
  clubSmash2: clubSwing(CLUB_STYLES.second), // 1타에 이어 치는 2타
  clubSmash3: clubSwing(CLUB_STYLES.third), // 2타에 이어 치는 1타 (계속 누르면 2타 ↔ 3타 반복)
  // 쇼룸에서 비교해 보는 시안 (게임은 clubSmash 만 쓴다)
  clubOverhead: clubSwing(CLUB_STYLES.overhead),
  clubSide: clubSwing(CLUB_STYLES.side),
  clubUpper: clubSwing(CLUB_STYLES.upper),
  fishCast: { duration: 1.2, hitAt: 0.6, equip: 'rod', next: 'fishWait', fn: fishCast },
  fishWait: { loop: fishWait, equip: 'rod' },
  fishCatch: { duration: 1.3, hitAt: 0.3, equip: 'rod', expression: 'grin', fn: fishCatch },
  // 던지기 → 입질 대기 → 낚아채기를 한 번에 (5초)
  fish: {
    duration: 5, hitAt: 0.84, equip: 'rod',
    fn(u, P, fx, sec) {
      if (u < 0.24) fishCast(u / 0.24, P, fx);
      else if (u < 0.76) {
        fishWait(sec, P, fx);
        if (u > 0.66) { // 입질: 낚싯대가 파르르, 몸을 숙여 찌를 뚫어져라
          const k = sm(u, 0.66, 0.7);
          P['shoulderR.rx'] += Math.sin(sec * 40) * 0.05 * k;
          P['handR.rx'] += Math.sin(sec * 40 + 1) * 0.06 * k;
          P['spine.rx'] += 0.12 * k;
          P['head.rx'] = 0.15 * k;
          P['head.ry'] = 0;
        }
      } else fishCatch((u - 0.76) / 0.24, P, fx);
    },
  },

  // 사냥
  slash1: {
    duration: 0.75, hitAt: 0.45, equip: 'swordShield',
    fn(u, P) {
      P['shoulderR.rx'] = kf(u, [0, 0], [0.3, -2.6], [0.52, -0.5], [0.7, -0.6], [1, 0]);
      P['shoulderR.rz'] = kf(u, [0, 0], [0.3, -0.9], [0.52, 0.55], [0.7, 0.5], [1, 0]);
      P['elbowR.rx'] = kf(u, [0, 0], [0.3, -0.5], [0.52, 0], [1, 0]);
      P['spine.ry'] = kf(u, [0, 0], [0.3, -0.35], [0.52, 0.35], [1, 0]);
      P['spine.rx'] = kf(u, [0.3, 0], [0.52, 0.15], [1, 0]);
      P['shoulderL.rx'] = -0.35;
      P['elbowL.rx'] = -0.5;
      P['hipL.rx'] = kf(u, [0.2, 0], [0.5, -0.3], [1, 0]);
    },
  },
  slash2: {
    // 팔을 앞으로 뻗은 채(rx) 옆으로 쓸기(rz): 오른쪽 → 왼쪽 → 오른쪽
    duration: 0.95, hitAt: [0.3, 0.66], equip: 'swordShield',
    fn(u, P) {
      crouch(P, 0.3);
      P['shoulderR.rx'] = kf(u, [0, 0], [0.15, -1.45], [0.85, -1.45], [1, 0]);
      P['shoulderR.rz'] = kf(u, [0, 0], [0.15, -1.3], [0.35, 1.0], [0.5, 1.0], [0.7, -1.3], [0.85, -1.1], [1, 0]);
      P['handR.rx'] = kf(u, [0, 0], [0.15, 1.0], [0.85, 1.0], [1, 0]);
      P['spine.ry'] = kf(u, [0, 0], [0.15, -0.3], [0.35, 0.35], [0.5, 0.35], [0.7, -0.3], [1, 0]);
      P['shoulderL.rx'] = -0.35;
      P['elbowL.rx'] = -0.5;
    },
  },
  smash: {
    duration: 1.25, hitAt: 0.62, equip: 'swordShield',
    fn(u, P) {
      crouch(P, kf(u, [0, 0], [0.18, 0.7], [0.3, 0], [0.6, 0], [0.66, 0.9], [0.85, 0.8], [1, 0]));
      P['root.py'] = kf(u, [0.25, 0], [0.43, 0.13], [0.62, 0]);
      // 두 팔을 머리 양옆으로 크게 치켜들었다가 앞 바닥으로 모아 내리찍기
      const arm = [[0, 0], [0.2, 0.5], [0.43, -2.5], [0.62, -0.45], [0.85, -0.5], [1, 0]];
      P['shoulderR.rx'] = kf(u, ...arm);
      P['shoulderL.rx'] = kf(u, ...arm);
      P['shoulderR.rz'] = kf(u, [0.2, 0], [0.43, -0.75], [0.62, 0.3], [0.85, 0.3], [1, 0]);
      P['shoulderL.rz'] = kf(u, [0.2, 0], [0.43, 0.75], [0.62, -0.3], [0.85, -0.3], [1, 0]);
      P['spine.rx'] += kf(u, [0.3, 0], [0.43, -0.2], [0.62, 0.45], [0.85, 0.4], [1, 0]);
      P['head.rx'] = kf(u, [0.3, 0], [0.43, -0.15], [0.62, 0.1], [1, 0]);
    },
  },
  // 방패를 가슴 앞에 세움: 팔을 비틀어(ry) 방패 면을 앞으로, 아래팔은 가슴 앞을 가로지름
  guard: { equip: 'swordShield', loop(t, P) {
    const b = Math.sin(t * 3);
    crouch(P, 0.35 + b * 0.02);
    P['shoulderL.rx'] = -0.85;
    P['shoulderL.ry'] = -1.5;
    P['elbowL.rx'] = -1.5;
    P['handL.ry'] = 0.75;
    P['shoulderR.rx'] = -0.35;
    P['shoulderR.rz'] = -0.35;
    P['elbowR.rx'] = -0.9;
    P['spine.rx'] += 0.08;
    P['hipL.rx'] -= 0.2;
    P['head.rx'] = -0.06;
  } },
  bowShot: {
    duration: 1.7, hitAt: 0.66, equip: 'bow',
    fn(u, P, fx) {
      // 왼팔로 활을 앞으로 뻗고, 오른손을 활에 댔다가 어깨 옆까지 당긴 뒤 놓기
      P['shoulderL.rx'] = kf(u, [0, 0], [0.22, -1.5], [0.85, -1.5], [1, 0]);
      P['shoulderL.rz'] = kf(u, [0, 0], [0.22, -0.1], [0.85, -0.1], [1, 0]);
      P['shoulderR.rx'] = kf(u, [0, 0], [0.25, -1.45], [0.32, -1.45], [0.6, -0.15], [0.66, -0.15], [0.75, -0.3], [1, 0]);
      P['shoulderR.rz'] = kf(u, [0, 0], [0.25, 0.25], [0.32, 0.25], [0.6, -1.35], [0.66, -1.35], [0.75, -1.6], [1, 0]);
      P['elbowR.rx'] = kf(u, [0.32, 0], [0.6, -1.55], [0.66, -1.55], [0.75, -0.9], [1, 0]);
      P['spine.ry'] = kf(u, [0, 0], [0.25, -0.25], [0.85, -0.25], [1, 0]);
      P['head.ry'] = kf(u, [0, 0], [0.25, 0.25], [0.85, 0.25], [1, 0]);
      P['hipL.rx'] = kf(u, [0, 0], [0.2, -0.2], [0.85, -0.2], [1, 0]);
      fx.nock = u > 0.28 && u < 0.66;
      fx.arrow = u > 0.25 && u < 0.66;
    },
  },
  castSpell: {
    // 지팡이를 들고 제자리 한 바퀴 → 앞으로 찌르기 (회전은 각도 차를 감아서 보간하므로 2π에서 0으로 넘어가도 튀지 않음)
    duration: 1.7, hitAt: 0.66, equip: 'staff',
    fn(u, P, fx) {
      P['pelvis.ry'] = kf(u, [0.05, 0], [0.48, PI * 2]);
      // 찌르기: 팔을 앞으로 뻗고 손목을 꺾어 지팡이 끝이 정면을 향하게
      P['shoulderR.rx'] = kf(u, [0, 0], [0.15, -2.5], [0.5, -2.5], [0.66, -1.4], [0.85, -1.4], [1, 0]);
      P['handR.rx'] = kf(u, [0.5, 0], [0.66, 1.2], [0.85, 1.2], [1, 0]);
      P['shoulderR.rz'] = kf(u, [0, 0], [0.15, -0.75], [0.5, -0.75], [0.66, 0.1], [1, 0]);
      P['shoulderL.rz'] = kf(u, [0, 0], [0.15, 0.7], [0.5, 0.7], [0.66, 0.3], [1, 0]);
      P['spine.rx'] = kf(u, [0.5, 0], [0.66, 0.25], [0.85, 0.2], [1, 0]);
      P['hipL.rx'] = kf(u, [0.5, 0], [0.66, -0.35], [0.85, -0.3], [1, 0]);
      P['root.py'] = kf(u, [0.05, 0], [0.25, 0.04], [0.48, 0]);
      fx.glow = kf(u, [0, 0.2], [0.48, 0.6], [0.66, 1.6], [1, 0]);
    },
  },
  hit: {
    duration: 0.65, expression: 'surprised',
    fn(u, P) {
      P['pelvis.pz'] = kf(u, [0, 0], [0.15, -0.045], [1, 0]);
      P['spine.rx'] = kf(u, [0, 0], [0.15, -0.35], [1, 0]);
      P['head.rx'] = kf(u, [0, 0], [0.15, -0.25], [1, 0]);
      P['shoulderR.rz'] = kf(u, [0, 0], [0.15, -0.7], [1, 0]);
      P['shoulderL.rz'] = kf(u, [0, 0], [0.15, 0.7], [1, 0]);
      P['shoulderR.rx'] = P['shoulderL.rx'] = kf(u, [0, 0], [0.15, -0.4], [1, 0]);
      P['hipR.rx'] = kf(u, [0, 0], [0.15, 0.25], [1, 0]);
    },
  },
  // 무릎을 꿇었다가 옆으로 쓰러져 그대로 누워 있음 (다른 액션을 고르면 일어남)
  faint: {
    duration: 2.2, hold: true, expression: 'ko',
    fn(u, P) {
      const kneel = kf(u, [0, 0], [0.3, 1]);
      for (const s of SIDES) {
        P[`hip${s}.rx`] = kf(u, [0, 0], [0.3, -0.1], [0.75, -0.6]);
        P[`knee${s}.rx`] = 1.55 * kneel;
        P[`foot${s}.rx`] = -0.9 * kneel;
      }
      P['pelvis.py'] = kf(u, [0, 0], [0.3, -0.1], [0.45, -0.1], [0.75, -0.105]);
      P['pelvis.rz'] = kf(u, [0.45, 0], [0.75, 1.42]);
      P['spine.rx'] = kf(u, [0, 0], [0.3, 0.3], [0.75, 0.1]);
      P['head.rx'] = kf(u, [0, 0], [0.3, 0.45], [0.75, 0.15]);
      P['shoulderR.rz'] = kf(u, [0.45, 0], [0.75, -0.6]);
      P['shoulderL.rz'] = kf(u, [0.45, 0], [0.75, 0.3]);
      P['shoulderL.rx'] = kf(u, [0.45, 0], [0.75, -0.4]);
    },
  },
});

// 액션 재생기: 일회성 액션의 진행·타격 콜백·종료를 관리하고, 모든 관절을 lerp로 목표에 붙인다.
// 액션을 바꿔도 현재 자세에서 목표 자세로 미끄러지듯 넘어간다 (일회성이 끝나면 대기 자세로 돌아감).
// 액션이 값을 주지 않은 관절의 기본값: 팔은 '차렷(0)'이 아니라 편히 벌린 각도.
// 어깨 관절이 몸통 곡면 안쪽에 있어, 팔을 곧게 내리면(0) 팔이 옆구리 속에 들어간다
const REST = { 'shoulderR.rz': -ARM_REST, 'shoulderL.rz': ARM_REST };
const BLEND_OUT = 0.78; // 일회성 동작의 이 진행도부터 대기 자세로 섞기 시작
const idleT = {};
export function createAnimator(rate = 18) {
  const cur = {};
  const target = {};
  // 팔 관절은 모든 축을 매 프레임 다시 쓴다: 장비 IK·몸 충돌 보정(collision.js)이 쿼터니언으로 돌려 놓아도 다음 프레임에 쌓이지 않게
  for (const s of SIDES) for (const j of ['shoulder', 'elbow', 'hand']) for (const a of ['rx', 'ry', 'rz']) cur[`${j}${s}.${a}`] = 0;
  let name = 'idle';
  let start = null;
  let hits = 0;
  let done = false;
  let cb = {};
  let progress = -1; // 일회성 액션 진행도 0→1 (반복 액션은 -1)
  const wrap = (d) => Math.atan2(Math.sin(d), Math.cos(d));

  return {
    get action() { return name; },
    get progress() { return progress; },
    onEnd: null, // (이름, 다음 액션|null) — 일회성이 끝날 때 한 번
    play(next, onHit, onComplete) {
      name = ACTIONS[next] ? next : 'idle';
      start = null;
      hits = 0;
      done = false;
      cb = { onHit, onComplete };
    },
    update(rig, t, dt) {
      if (start === null) start = t;
      for (const k in target) delete target[k];
      const fx = {};
      const def = ACTIONS[name];
      let ended = false;
      progress = -1;
      if (typeof def === 'function') def(t, target, fx);
      else if (def.loop) def.loop(t, target, fx);
      else {
        const sec = t - start;
        const u = Math.min(1, sec / def.duration);
        progress = u;
        def.fn(u, target, fx, sec);
        const at = [].concat(def.hitAt ?? []);
        while (hits < at.length && u >= at[hits]) {
          hits += 1; // ?.() 는 콜백이 없으면 인자 계산도 건너뛰므로 증가는 따로
          cb.onHit?.(name, hits);
        }
        if (u >= 1 && !done) { done = true; ended = true; }
        // 끝자락은 대기 자세로 미리 녹여 넣는다: 동작이 '차렷'으로 끝난 뒤 대기 자세로 다시 움직이면
        // 팔이 안으로 들어왔다 도로 벌어지는 식으로 한 번 더 꿈틀한다
        if (!def.hold && (def.next ?? 'idle') === 'idle' && u > BLEND_OUT) {
          for (const k in idleT) delete idleT[k];
          ACTIONS.idle(t, idleT, {});
          const w = sm(u, BLEND_OUT, 1);
          for (const k of new Set([...Object.keys(target), ...Object.keys(idleT)])) {
            const a = target[k] ?? REST[k] ?? 0;
            if (k.startsWith('root.') || Math.abs(a) > PI) continue; // 한 바퀴 도는 회전·뛰어오른 높이는 그대로
            target[k] = a + ((idleT[k] ?? 0) - a) * w;
          }
        }
      }
      // 빠르게 휘두르는 액션은 rate를 높여 관절이 목표를 바짝 따라가게 (부드럽게 늦게 따라가면 타격이 뭉개짐)
      const a = 1 - Math.exp(-(def.rate ?? rate) * dt);
      const aRoot = def.rootRate ? 1 - Math.exp(-def.rootRate * dt) : a; // 몸 전체 위치(root.p*)만 따로 빠르게
      for (const k of new Set([...Object.keys(cur), ...Object.keys(target)])) {
        const [joint, ch] = k.split('.');
        const o = rig[joint];
        const goal = target[k] ?? REST[k] ?? 0;
        const c = cur[k] ?? 0;
        if (ch === 'ry' || k === 'root.rx') {
          // 한 바퀴 도는 회전(제자리 돌기·공중제비)은 가까운 쪽으로 돌도록 각도 차를 -π~π로 감는다
          cur[k] = THREE.MathUtils.lerp(c, c + wrap(goal - c), a);
          o.rotation[ch[1]] = cur[k];
        } else if (ch[0] === 'r') {
          cur[k] = THREE.MathUtils.lerp(c, goal, a);
          o.rotation[ch[1]] = cur[k];
        } else if (ch === 'sy') {
          cur[k] = THREE.MathUtils.lerp(c, goal, a);
          o.scale.y = o.scale.x * (1 + cur[k]); // 가로 크기(캐릭터 전체 배율)를 기준으로
        } else {
          cur[k] = THREE.MathUtils.lerp(c, goal, joint === 'root' ? aRoot : a);
          // root는 통째로 키운 캐릭터(마을 1.7배)에서도 몸 크기에 비례해 뛰도록 배율을 곱한다
          o.position[ch[1]] = o.userData.rest[ch[1]] + cur[k] * (joint === 'root' ? o.scale.x : 1);
        }
      }
      if (ended) {
        // onEnd가 다음 액션을 시작하면 name이 바뀌므로 끝난 액션 이름을 먼저 잡아 둔다
        const finished = name;
        const { onComplete } = cb;
        this.onEnd?.(finished, def.hold ? null : def.next ?? 'idle');
        onComplete?.(finished);
      }
      return fx;
    },
  };
}
