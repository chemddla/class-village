// 액션 상태 머신: 액션 함수가 매 프레임 관절 목표값을 내놓고, 현재값은 lerp로 부드럽게 따라간다.
// 키 형식 '관절.축' — r?=회전(라디안), p?=쉬는 자리에서 옮긴 거리, sy=세로로 늘어난 비율(눌림·늘어남). 빠진 키는 0(기본 자세)으로 돌아간다.
// 관절: root → pelvis → spine → head / shoulderR·L → elbowR·L → handR·L,  pelvis → hipR·L → kneeR·L → footR·L
// 부호: 팔·다리 rx < 0 이면 앞으로, 무릎 rx > 0 이면 뒤로 굽힘, 오른팔(R, -x쪽) rz < 0 이면 옆으로 들어 올림.
import * as THREE from 'three';

const PI = Math.PI;
const sm = THREE.MathUtils.smoothstep;
const SIDES = ['R', 'L'];

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
function kf(u, ...pts) {
  if (u <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [u1, v1] = pts[i];
    if (u <= u1) {
      const [u0, v0] = pts[i - 1];
      return v0 + (v1 - v0) * sm(u, u0, u1);
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
    crouch(P, 0.1 + 0.05 * b);
    P['spine.py'] = b * 0.004;
    P['spine.sy'] = b * 0.012;
    P['spine.rx'] = b * 0.015;
    P['spine.rz'] = sway * 0.015;
    P['head.rx'] = -b * 0.012;
    P['head.ry'] = Math.sin(t * 0.8) * 0.05;
    P['head.rz'] = -sway * 0.02;
    P['shoulderR.rz'] = -0.14 - b * 0.02;
    P['shoulderL.rz'] = 0.14 + b * 0.02;
    P['shoulderR.rx'] = sway * 0.03;
    P['shoulderL.rx'] = -sway * 0.03;
    P['elbowR.rx'] = P['elbowL.rx'] = -0.08;
  },

  walk(t, P) {
    const ph = t * 6.5;
    const sw = Math.sin(ph);
    stride(P, ph, 0.5, 0.15, 0.85);
    P['shoulderR.rx'] = sw * 0.6;
    P['shoulderL.rx'] = -sw * 0.6;
    P['shoulderR.rz'] = -0.22;
    P['shoulderL.rz'] = 0.22;
    P['elbowR.rx'] = P['elbowL.rx'] = -0.25;
    P['pelvis.ry'] = sw * 0.08;
    P['spine.rx'] = 0.06;
    P['spine.ry'] = -sw * 0.12;
    P['head.rx'] = -0.02;
    P['head.ry'] = sw * 0.05;
    P['head.rz'] = sw * 0.03;
    P['root.sy'] = -Math.cos(ph * 2) * 0.02; // 디딜 때 살짝 눌렸다 펴지는 탄력
    P['spine.rz'] = sw * 0.03;
  },

  run(t, P) {
    const ph = t * 11;
    const sw = Math.sin(ph);
    stride(P, ph, 0.85, 0.35, 1.3);
    P['shoulderR.rx'] = sw * 1.0;
    P['shoulderL.rx'] = -sw * 1.0;
    P['shoulderR.rz'] = -0.25;
    P['shoulderL.rz'] = 0.25;
    P['elbowR.rx'] = P['elbowL.rx'] = -1.4;
    P['root.py'] = Math.abs(sw) * 0.02; // 두 다리가 벌어진 순간 살짝 뜸
    P['pelvis.ry'] = sw * 0.1;
    P['spine.rx'] = 0.28; // 상체를 앞으로
    P['spine.ry'] = -sw * 0.15;
    P['head.rx'] = -0.18; // 고개는 앞을 보도록 되돌림
    P['root.sy'] = -Math.cos(ph * 2) * 0.03;
  },

  // 가볍게 폴짝: 누르자마자 떠오르는 포물선. 두 팔은 옆으로 살짝 벌리고 다리는 짝짝이로 접었다가, 착지하며 눌렸다 튕김
  jump: {
    duration: 0.95,
    fn(u, P) {
      const s = THREE.MathUtils.clamp((u - 0.08) / 0.7, 0, 1); // 공중 진행도
      const air = 4 * s * (1 - s); // 포물선
      const k = sm(air, 0, 0.35); // 공중 자세로 넘어간 정도
      crouch(P, kf(u, [0, 0], [0.06, 0.5], [0.1, 0], [0.76, 0], [0.84, 0.55], [1, 0]));
      P['root.py'] = air * 0.5;
      P['root.sy'] = kf(u, [0, 0], [0.06, -0.06], [0.16, 0.07], [0.5, 0], [0.76, 0.04], [0.84, -0.1], [0.92, 0.03], [1, 0]);
      P['hipR.rx'] -= 0.8 * k;
      P['hipL.rx'] -= 0.5 * k;
      P['kneeR.rx'] += 1.1 * k;
      P['kneeL.rx'] += 0.7 * k;
      P['footR.rx'] = P['footL.rx'] += 0.3 * k;
      P['shoulderR.rz'] = -0.14 - 0.85 * k;
      P['shoulderL.rz'] = 0.14 + 0.85 * k;
      P['shoulderR.rx'] = P['shoulderL.rx'] = -0.15 * k;
      P['elbowR.rx'] = P['elbowL.rx'] = -0.1 - 0.25 * k;
      P['head.rx'] = kf(u, [0, 0], [0.2, -0.12], [0.6, 0.02], [0.84, 0.1], [1, 0]);
    },
  },

  // 더블 점프: 공중에서 한 번 더 솟으며 몸을 말아 앞으로 한 바퀴 (몸 가운데를 축으로)
  flip: {
    duration: 0.85,
    fn(u, P) {
      const ang = sm(u, 0, 0.62) * PI * 2;
      const h = 0.45; // 회전축 높이 (몸 가운데)
      const tuck = sm(u, 0, 0.12) * (1 - sm(u, 0.5, 0.66));
      crouch(P, kf(u, [0.72, 0], [0.8, 0.6], [1, 0]));
      P['root.rx'] = ang;
      P['root.py'] = kf(u, [0, 0.5], [0.26, 0.8], [0.74, 0]) + h - h * Math.cos(ang);
      P['root.pz'] = -h * Math.sin(ang);
      P['root.sy'] = kf(u, [0.7, 0], [0.8, -0.1], [0.9, 0.03], [1, 0]);
      for (const s of SIDES) {
        P[`hip${s}.rx`] -= 1.3 * tuck;
        P[`knee${s}.rx`] += 1.7 * tuck;
        P[`elbow${s}.rx`] = -1.2 * tuck;
      }
      P['shoulderR.rx'] = P['shoulderL.rx'] = -0.9 * tuck;
      P['shoulderR.rz'] = -0.14 - 0.5 * (1 - tuck) * sm(u, 0.5, 0.7) * (1 - sm(u, 0.8, 1));
      P['shoulderL.rz'] = -P['shoulderR.rz'];
      P['spine.rx'] += 0.35 * tuck;
      P['head.rx'] = 0.3 * tuck;
    },
  },

  wave(t, P) {
    const w = Math.sin(t * 7);
    P['shoulderR.rz'] = -2.3 + w * 0.25;
    P['shoulderR.rx'] = -0.3;
    P['elbowR.rx'] = -0.35;
    P['handR.rz'] = 0.2 + Math.sin(t * 7 + 0.6) * 0.2;
    P['shoulderL.rz'] = 0.2;
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
    armsUp(P, 2.45 + Math.sin(ph * 2) * 0.1);
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
function twoHand(P, fx) {
  fx.twoHand = true;
  for (const s of SIDES) for (const j of ['shoulder', 'elbow', 'hand']) for (const a of ['rx', 'ry', 'rz']) P[`${j}${s}.${a}`] ??= 0;
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
  twoHand(P, fx);
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
      P['spine.rx'] += kf(u, [0, 0], [0.28, 0.42], [0.46, 0.46], [0.56, 0.25], [0.84, -0.05], [1, 0]);
      P['spine.ry'] = kf(u, [0, 0], [0.3, 0.2], [0.56, -0.1], [0.9, 0]);
      P['head.rx'] = kf(u, [0, 0], [0.28, 0.3], [0.56, 0.15], [0.76, -0.22], [1, 0]);
      P['head.rz'] = Math.sin(u * 30) * 0.06 * kf(u, [0.68, 0], [0.78, 1], [0.92, 1], [1, 0]);
      P['shoulderR.rx'] = kf(u, [0, 0], [0.3, -0.95], [0.46, -1.1], [0.54, -0.65], [0.78, -1.9], [0.9, -1.8], [1, 0]);
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
  chop: {
    duration: 1.3, hitAt: 0.55, equip: 'axe',
    fn(u, P, fx) {
      twoHand(P, fx);
      // 허리를 틀어 도끼를 오른쪽 어깨 위로 크게 넘겼다가 체중을 실어 내려찍고, 맞는 순간 부르르 되튐
      const shake = u > 0.55 ? Math.sin((u - 0.55) * 60) * Math.exp(-(u - 0.55) * 14) : 0;
      crouch(P, kf(u, [0, 0], [0.2, 0.2], [0.42, 0.05], [0.56, 0.55], [0.75, 0.45], [1, 0]));
      P['shoulderR.rx'] = kf(u, [0, 0], [0.42, -1.9], [0.55, -0.5], [0.75, -0.6], [1, 0]) + shake * 0.12;
      P['shoulderR.rz'] = kf(u, [0, 0], [0.42, -1.2], [0.55, 0.3], [0.75, 0.3], [1, 0]);
      P['shoulderL.rx'] = kf(u, [0, 0], [0.42, -1.3], [0.55, -0.5], [0.75, -0.55], [1, 0]) + shake * 0.12;
      P['shoulderL.rz'] = kf(u, [0, 0], [0.42, -0.2], [0.55, -0.35], [1, 0]);
      P['elbowR.rx'] = kf(u, [0, 0], [0.42, -0.45], [0.55, -0.1], [1, 0]);
      P['elbowL.rx'] = kf(u, [0, 0], [0.42, -0.9], [0.55, -0.2], [1, 0]);
      P['spine.rx'] += kf(u, [0, 0], [0.42, -0.25], [0.55, 0.45], [0.75, 0.35], [1, 0]) + shake * 0.05;
      P['spine.ry'] = kf(u, [0, 0], [0.42, -0.32], [0.55, 0.18], [1, 0]);
      P['pelvis.ry'] = kf(u, [0, 0], [0.42, -0.14], [0.55, 0.1], [1, 0]);
      P['head.rx'] = kf(u, [0, 0], [0.42, -0.2], [0.55, 0.15], [1, 0]) - shake * 0.06;
      P['head.ry'] = kf(u, [0, 0], [0.42, 0.25], [0.55, -0.1], [1, 0]); // 몸을 틀어도 눈은 나무에
      P['hipL.rx'] -= kf(u, [0, 0], [0.42, 0.25], [1, 0]);
      P['root.sy'] = kf(u, [0.3, 0], [0.42, 0.04], [0.56, -0.05], [0.75, 0]);
    },
  },
  // 몽둥이 내려치기: 두 손으로 머리 위까지 번쩍 들었다가 몸 앞으로 곧게 내리찍고, 맞는 순간 부르르
  clubSmash: {
    duration: 0.9, hitAt: 0.5, equip: 'club',
    fn(u, P, fx) {
      twoHand(P, fx);
      const shake = u > 0.5 ? Math.sin((u - 0.5) * 60) * Math.exp(-(u - 0.5) * 14) : 0;
      crouch(P, kf(u, [0, 0], [0.32, 0.1], [0.52, 0.55], [0.75, 0.45], [1, 0]));
      P['shoulderR.rx'] = kf(u, [0, 0], [0.32, -2.8], [0.5, -0.9], [0.75, -1.0], [1, 0]) + shake * 0.12;
      P['shoulderR.rz'] = kf(u, [0, 0], [0.32, -0.25], [0.5, 0.15], [1, 0]);
      P['elbowR.rx'] = kf(u, [0, 0], [0.32, -0.7], [0.5, -0.1], [1, 0]);
      P['handR.rx'] = kf(u, [0, 0], [0.32, -0.5], [0.5, 0.25], [1, 0]);
      P['spine.rx'] += kf(u, [0, 0], [0.32, -0.25], [0.5, 0.4], [0.75, 0.3], [1, 0]) + shake * 0.05;
      P['head.rx'] = kf(u, [0, 0], [0.32, -0.2], [0.5, 0.15], [1, 0]) - shake * 0.06;
      P['hipL.rx'] -= kf(u, [0, 0], [0.32, 0.3], [0.6, 0.2], [1, 0]);
      P['root.sy'] = kf(u, [0.2, 0], [0.32, 0.04], [0.52, -0.05], [0.75, 0]);
    },
  },
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
export function createAnimator(rate = 18) {
  const cur = {};
  const target = {};
  let name = 'idle';
  let start = null;
  let hits = 0;
  let done = false;
  let cb = {};
  const wrap = (d) => Math.atan2(Math.sin(d), Math.cos(d));

  return {
    get action() { return name; },
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
      if (typeof def === 'function') def(t, target, fx);
      else if (def.loop) def.loop(t, target, fx);
      else {
        const sec = t - start;
        const u = Math.min(1, sec / def.duration);
        def.fn(u, target, fx, sec);
        const at = [].concat(def.hitAt ?? []);
        while (hits < at.length && u >= at[hits]) {
          hits += 1; // ?.() 는 콜백이 없으면 인자 계산도 건너뛰므로 증가는 따로
          cb.onHit?.(name, hits);
        }
        if (u >= 1 && !done) { done = true; ended = true; }
      }
      const a = 1 - Math.exp(-rate * dt);
      for (const k of new Set([...Object.keys(cur), ...Object.keys(target)])) {
        const [joint, ch] = k.split('.');
        const o = rig[joint];
        const goal = target[k] ?? 0;
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
          cur[k] = THREE.MathUtils.lerp(c, goal, a);
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
