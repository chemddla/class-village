// 액션 상태 머신: 액션 함수가 매 프레임 관절 목표값을 내놓고, 현재값은 lerp로 부드럽게 따라간다.
// 키 형식 '관절.축' — r?=회전(라디안), p?=쉬는 자리에서 옮긴 거리, sy=세로로 늘어난 비율(눌림·늘어남). 빠진 키는 0(기본 자세)으로 돌아간다.
// 관절: root → pelvis → spine → head / shoulderR·L → elbowR·L → handR·L,  pelvis → hipR·L → kneeR·L → footR·L
// 부호: 팔·다리 rx < 0 이면 앞으로, 무릎 rx > 0 이면 뒤로 굽힘, 오른팔(R, -x쪽) rz < 0 이면 옆으로 들어 올림.
import * as THREE from 'three';
import { BOLT } from '../../../shared/world.js';

const PI = Math.PI;
const sm = THREE.MathUtils.smoothstep;
const SIDES = ['R', 'L'];
// 구르기 조절값 (손이 땅에 닿고 몸이 땅속으로 들어가지 않게 맞춘 값)
export const RL = {
  a0: 0.1, a1: 0.8, h: 0.3, plant: 0.3, arm: -1.6, spread: 0.45, shrink: 0.15, twist: 0.75,
  // 자세마다 몸의 가장 낮은 곳이 땅에 닿는 몸 높이 (client/src/villager/roll.probe.mjs 로 잰 값: 자세를 바꾸면 다시 잰다)
  py: [[0, 0], [0.163, 0.02], [0.275, 0.11], [0.288, 0.15], [0.3, 0.24], [0.313, 0.31], [0.325, 0.44], [0.338, 0.54], [0.363, 0.68], [0.375, 0.73], [0.388, 0.82], [0.4, 0.86], [0.413, 0.87], [0.425, 0.86], [0.45, 0.8], [0.463, 0.72], [0.475, 0.67], [0.488, 0.63], [0.5, 0.57], [0.513, 0.54], [0.538, 0.36], [0.55, 0.26], [0.563, 0.2], [0.575, 0.18], [0.612, 0.04], [0.625, -0.01], [0.637, -0.03], [0.662, -0.08], [0.687, -0.12], [0.737, -0.13], [0.962, -0.01], [1, 0]],
};
// 팔을 편히 내렸을 때 옆으로 벌어지는 각도: 물방울 몸통에서 소매가 비스듬히 뻗어 나오는 A자 실루엣
export const ARM_REST = 0.6;
// 과일나무 흔들기에서 앞으로 내딛을 거리 (주민 몸 크기 단위). 나무마다 줄기까지 거리가 달라서,
// 게임에서는 캐릭터가 동작을 시작할 때 손이 줄기 표면에 딱 닿을 만큼으로 정해 넣는다 (character.js)
export const SHAKE = { step: 0.2 };
// 낚시 찌가 물에 잠긴 정도 (0 떠 있음 → 1 쏙 들어감). 게임에서 캐릭터마다 그릴 때 정해 넣는다 (character.js)
export const BOBBER = { dip: 0 };

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
const EASE = { in: (s) => s * s * s, out: (s) => 1 - (1 - s) ** 3, lin: (s) => s }; // lin: 고르게 (시간 늘이기용)
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
    // 가끔(약 9초마다) 고개를 돌려 두리번거리고, 그 사이 한쪽 팔을 살짝 앞뒤로 흔든다
    const look = Math.sin(Math.PI * Math.min(1, Math.max(0, ((t % 9) - 5) / 2.4))) ** 2;
    const lookDir = Math.floor(t / 9) % 2 ? 1 : -1;
    const fidget = Math.sin(Math.PI * Math.min(1, Math.max(0, ((t % 9) - 6.5) / 1.6))) ** 2;
    P['head.ry'] = Math.sin(t * 0.8) * 0.05 + look * lookDir * 0.35;
    P['head.rz'] = -sway * 0.02;
    P['spine.ry'] = look * lookDir * 0.06;
    // 팔은 힘을 뺀 채 팔꿈치를 살짝 굽혀 손이 몸 약간 앞에 오게, 양팔이 박자를 달리해 느리게 흔들린다
    const dR = Math.sin(t * 0.9), dL = Math.sin(t * 0.75 + 1.7);
    P['shoulderR.rz'] = -ARM_REST - b * 0.02 + dR * 0.015;
    P['shoulderL.rz'] = ARM_REST + b * 0.02 - dL * 0.015;
    P['shoulderR.rx'] = -0.1 + sway * 0.03 + dR * 0.04 + fidget * Math.sin(t * 7) * 0.12;
    P['shoulderL.rx'] = -0.1 - sway * 0.03 + dL * 0.04;
    P['elbowR.rx'] = -0.3 + dR * 0.05 - fidget * 0.1;
    P['elbowL.rx'] = -0.3 + dL * 0.05;
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

  // 회피 구르기(어깨 구르기): 몸을 비스듬히 틀며 두 팔을 앞으로 뻗어 땅을 짚고, 팔을 굽히며 몸을 공처럼 말아 어깨부터 대각선으로 한 바퀴 구른 뒤 일어난다
  roll: {
    duration: 0.6, rootRate: 2000, // 몸 높이 표를 바로 따라가야 땅에 딱 붙는다
    fn(u, P) {
      const ang = sm(u, RL.a0, RL.a1) * PI * 2;
      // 회전축 높이: 땅을 짚을 때까지는 발끝을 축으로 앞으로 쓰러지고, 짚은 뒤에는 말아 쥔 몸 가운데를 축으로 구른다
      const h = kf(u, [RL.plant - 0.04, 0], [RL.plant + 0.16, RL.h]);
      const reach = kf(u, [0, 0], [0.14, 1], [RL.plant, 1], [RL.plant + 0.14, 0]); // 팔을 앞으로 뻗어 짚기
      const tuck = kf(u, [RL.plant - 0.06, 0], [RL.plant + 0.1, 1], [0.68, 1], [0.86, 0]); // 짚자마자 공처럼 동글게 만다
      crouch(P, kf(u, [0, 0], [0.12, 0.55], [0.3, 0.3], [0.72, 0.2], [0.86, 0.5], [1, 0]));
      P['root.rx'] = ang;
      P['root.py'] = kf(u, ...RL.py); // 자세마다 몸의 가장 낮은 곳이 땅에 닿는 높이 (roll.probe 로 잰 값)
      P['root.pz'] = -h * Math.sin(ang);
      const bend = sm(u, RL.plant - 0.08, RL.plant + 0.04); // 짚은 팔이 몸무게를 받으며 굽는다
      for (const [s, side] of [['R', -1], ['L', 1]]) {
        P[`hip${s}.rx`] -= 2.0 * tuck;
        P[`knee${s}.rx`] += 2.2 * tuck;
        P[`shoulder${s}.rx`] = RL.arm * reach - 0.9 * tuck * (1 - reach);
        P[`shoulder${s}.rz`] = side * (ARM_REST * (1 - Math.max(reach, tuck)) + RL.spread * reach + 0.14 * tuck);
        P[`elbow${s}.rx`] = -(0.05 + 0.9 * bend) * reach - 1.2 * tuck * (1 - reach);
      }
      P['spine.rx'] += 0.35 * reach + 0.9 * tuck;
      P['head.rx'] = 0.15 * reach + 0.8 * tuck; // 턱을 가슴에 붙여 머리부터 박지 않게
      P['head.s'] = -RL.shrink * Math.max(tuck, 0.6 * reach); // 큰 머리가 손보다 먼저 땅에 닿지 않게, 말아 구르는 동안 작게
      // 어깨 구르기: 몸을 비스듬히 틀어 오른 어깨부터 대각선으로 구른다 (낙법처럼).
      // 몸 전체(root)가 아니라 골반을 튼다: root 의 좌우 회전은 쇼룸 등에서 캐릭터가 바라보는 방향으로 쓰인다
      const tw = sm(u, 0.05, 0.3) * (1 - sm(u, 0.72, 0.95));
      P['pelvis.ry'] = RL.twist * tw;
      P['spine.rz'] = -0.3 * tw;
      P['head.rz'] = 0.35 * tw; // 고개를 반대쪽으로 꺾어 머리가 땅에 안 닿게
      // 왼팔은 짚지 않고 가슴 쪽으로 접어 넣는다
      P['shoulderL.rx'] = -0.9 * tw;
      P['shoulderL.rz'] = 0.2 + ARM_REST * (1 - tw);
      P['elbowL.rx'] = -1.6 * tw;
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

// 활 쏘기 자세 (u: 0 → 1). 왼손으로 활을 앞으로 내밀고, 오른손을 시위에 댔다가 턱 밑까지 당긴 뒤(0.6) 놓기(0.66)
// 몸을 옆으로 돌려 왼쪽 어깨가 쏘는 쪽을 향하고, 얼굴만 앞을 본다. 두 팔의 자리는 equipment.js 의 bowDraw 가 조준선 위에 맞춘다
// (fx.bowL·bowR: 두 팔을 조준선에 맞추는 정도 0~1, fx.draw: 시위를 당긴 정도 0~1, 1보다 크면 놓은 뒤 손이 뒤로 빠지는 것)
// 아래 팔 관절값은 조준선 자세로 들어가고 나올 때 섞이는 시작·끝 자세
function bowPose(u, P, fx, { legs = true } = {}) {
  P['pelvis.ry'] = kf(u, [0, 0], [0.22, -1.15], [0.85, -1.15], [1, 0]);
  P['spine.ry'] = kf(u, [0, 0], [0.22, -0.35], [0.85, -0.35], [1, 0]);
  P['head.ry'] = kf(u, [0, 0], [0.22, 1.3], [0.85, 1.3], [1, 0]);
  P['head.rx'] = kf(u, [0, 0], [0.22, 0.12], [0.85, 0.12], [1, 0]); // 살짝 숙여 화살 줄을 내려다본다
  P['shoulderL.rx'] = kf(u, [0, 0], [0.22, -1.5], [0.85, -1.5], [1, 0]);
  // 놓은 뒤 오른팔은 앞으로 다시 들지 않고 곧장 내려간다 (조준선 자세에서 풀릴 때 팔이 위로 튀어 오르지 않게)
  P['shoulderR.rx'] = kf(u, [0, 0], [0.25, -1.45], [0.66, -1.3], [1, 0]);
  P['elbowR.rx'] = kf(u, [0.25, 0], [0.66, -1.2], [1, 0]);
  if (legs) P['hipL.rx'] = kf(u, [0, 0], [0.2, -0.2], [0.85, -0.2], [1, 0]);
  fx.bowL = kf(u, [0, 0], [0.22, 1], [0.85, 1], [1, 0]);
  fx.bowR = kf(u, [0.05, 0], [0.25, 1], [0.76, 1], [0.97, 0]);
  fx.draw = kf(u, [0.28, 0], [0.6, 1], [0.66, 1], [0.7, 1.3]);
  fx.drop = kf(u, [0.69, 0], [0.9, 1]); // 놓은 뒤 뒤로 빠진 손이 아래로 떨어지는 정도 (equipment.js bowDraw)
  fx.nock = u > 0.28 && u < 0.66;
  fx.arrow = u > 0.25 && u < 0.66;
}

// 빠르게 한 발 쏘기: t(초, 쏘기 시작부터)를 bowPose 진행도로 바꾼다. draw 초 동안 당기고, rel 초에 놓고, 그 뒤 back 초 동안 팔을 내린다
function quickBow(t, draw, rel, back) {
  if (t < draw) return 0.6 * Math.max(0, t) / draw;
  if (t < rel) return 0.6;
  return 0.66 + 0.34 * Math.min(1, (t - rel) / back);
}
// 아래로 겨누며 쏘기: 활 자세 + 고개·상체를 겨눈 쪽으로 숙인다 (pitch: 아래로 기울인 각)
function bowDown(t, P, fx, pitch, draw, rel, back) {
  const v = quickBow(t, draw, rel, back);
  bowPose(v, P, fx, { legs: false });
  const w = kf(v, [0, 0], [0.22, 1], [0.85, 1], [1, 0]);
  fx.bowPitch = pitch;
  P['spine.rx'] = (P['spine.rx'] ?? 0) + pitch * 0.35 * w;
  P['head.rx'] = (P['head.rx'] ?? 0) + pitch * 0.45 * w;
}
// 조준(bowAim)을 sec 초 동안 했을 때 시위를 당긴 정도 0~1 (그림에서 시위가 당겨진 정도 fx.draw 와 같다)
export function bowDrawn(sec) {
  const u = Math.min(1, Math.max(0, sec) / ACTIONS.bowAim.duration);
  return Math.min(1, kf(u * 0.6, [0.28, 0], [0.6, 1]));
}
// 지팡이 기 모으기: staffBolt 에서 다 들어 올려 끝에 기를 모은 진행도 · 찌르기를 시작하는 진행도
const BOLT_RAISED = 0.56;
const BOLT_THRUST = 0.58;
function fireFromRaised(size) {
  const bolt = () => ACTIONS.staffBolt;
  const rest = 1 - BOLT_THRUST;
  return {
    get duration() { return bolt().duration * rest; },
    get hitAt() { return (bolt().hitAt - BOLT_THRUST) / rest; },
    equip: 'staff',
    fn(u, P, fx) {
      const v = BOLT_THRUST + u * rest;
      bolt().fn(v, P, fx);
      fx.charge = v < bolt().hitAt ? (size > 1 ? size : 0.5) : 0; // 다 모은 기는 쏠 때까지 크게 남아 있다 (1 = 날아가는 볼 크기)
      if (size > 1) fx.glow = Math.max(fx.glow, kf(v, [0.58, 3.2], [0.76, 3.2], [0.82, 0.6], [1, 0]));
    },
  };
}
// 활 강타(스킬): draw 초 동안 끝까지 당기고, rel 초에 기를 다 모은다 (그 뒤로는 A를 뗄 때까지 버틴다). 놓은 뒤 back 초 동안 팔을 내린다
export const BOW_STRIKE = { draw: 0.3, rel: 0.95, back: 0.4 };
export const BOW_PITCH ={ bowAir: 0.3, bowSlam: 0.5 }; // 점프 공격·더블 점프 공격이 화살을 아래로 기울이는 각 (약 17°·29°: 발밑이 아니라 앞쪽 멀리 꽂히게)

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
// 두 손으로 쥔 자리와 도구 방향을 키프레임으로: gripPath(u, [u0, pos, dir], [u1, pos, dir, ease], ...) → fx.grip 에 넣는다.
// 팔 관절 값으로 도구를 움직이면 두 손이 닿지 않는 데로 가거나 한 손이 반대편 팔을 뚫고 지나가므로,
// 두 손 동작은 손 자리(가슴 앞, 팔꿈치를 벌릴 여유가 있는 거리)와 도구 방향을 직접 정한다
function gripPath(u, ...keys) {
  let i = 0;
  while (i < keys.length - 2 && u >= keys[i + 1][0]) i += 1;
  const [u0, p0, d0] = keys[i];
  const [u1, p1, d1, ease] = keys[i + 1];
  const w = kf(u, [u0, 0], [u1, 1, ease]);
  return { pos: mix(p0, p1, w), dir: slerpDir(unit(d0), unit(d1), w) };
}
// 다리를 넓게 벌려 선다 (k = 0~1). 발바닥은 땅과 나란히, 벌린 만큼 몸을 낮춰 발이 뜨지 않게
function wideStance(P, k) {
  const st = k * 0.26;
  P['hipR.rz'] = -st; P['hipL.rz'] = st;
  P['footR.rz'] = st; P['footL.rz'] = -st;
  P['pelvis.py'] = (P['pelvis.py'] ?? 0) - 0.2 * (1 - Math.cos(st)) - 0.005 * k;
}
// 두 손을 놓은 뒤 팔이 돌아오는 길 (v: 0 → 1). 팔꿈치·손목을 꺾지 않고 어깨에서 천천히 내린다
function armsDown(P, v) {
  P['shoulderR.rx'] = kf(v, [0, -0.65], [0.5, -0.42], [1, 0]);
  P['shoulderR.rz'] = kf(v, [0, -0.3], [0.5, -0.45], [1, -ARM_REST]);
  P['elbowR.rx'] = kf(v, [0, -0.5], [0.5, -0.16], [1, -0.08]);
  P['shoulderL.rx'] = kf(v, [0, -0.55], [0.55, -0.3], [1, 0]);
  P['shoulderL.rz'] = kf(v, [0, 0.35], [1, ARM_REST]);
  P['elbowL.rx'] = kf(v, [0, -0.5], [0.5, -0.14], [1, -0.08]);
}
// ── 몽둥이 휘두르기 시안 ──
// back / hit: 젖혔을 때·타격 때 몽둥이가 뻗는 방향 (몸통 기준: x 오른쪽(-)·왼쪽(+), y 위, z 앞)
// posBack / posHit: 그때 두 손이 쥔 자리,  twist: 허리 비틀기 [젖힘, 타격, 관성],  lean: 상체 숙임 [젖힘, 타격, 관성]
//  - 끝이 왼쪽을 향하면 자루 끝을 쥔 왼손이 오른손보다 오른쪽에 놓여 두 팔이 엇갈린다.
//  - 타격 때 끝이 곧장 아래를 향하면 왼손이 자루 꼭대기에 얹히고 손목이 직각으로 꺾인다.
// 휘두르기 전 크게 젖힌 자세: 두 손을 오른 어깨 위·뒤로 들어 올리고, 몽둥이는 오른 어깨 너머 뒤로 비스듬히 눕힌다.
// (머리가 커서 손을 머리 위나 귀 옆으로 올리면 몽둥이가 머리에 박혀 앞으로 밀려난다: 어깨 바깥 위로 비켜 올리고,
//  몽둥이 끝은 머리를 피해 오른쪽 뒤로 보낸다. 자루 끝을 쥔 왼손이 닿도록 너무 오른쪽으로는 보내지 않는다)
// 두 손은 어깨 바로 위·뒤가 아니라 어깨 앞 위쪽에 둔다: 어깨 바로 위에 두면 오른 윗팔이 자루 끝을 쥔 왼 주먹 옆을 지나간다.
const BACK_R = { pos: [-0.115, 0.22, 0.05], dir: [-0.72, 0.34, -0.6] };
// 몸 앞에 세워 든 준비 자세에서 젖힌 자세로 갈 때 거쳐 가는 자세: 몽둥이를 오른쪽 옆으로 눕혔다가 어깨 너머로 넘긴다.
// (곧장 넘기면 몽둥이가 머리 위를 지나며 머리에 걸려, 충돌 처리가 몽둥이를 앞으로 확 젖혔다 되돌리느라 튄다)
const CLUB_SIDE = [[-0.11, 0.17, 0.08], [-0.9, 0.3, 0.3]];
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
  diagonal: { label: '대각선으로 앞을 치기', back: BACK_R.dir, hit: [-0.4, 0.2, 0.92], end: [0.2, 0.16, 0.97],
    posBack: BACK_R.pos, posHit: [-0.035, 0.135, 0.13], posEnd: [-0.01, 0.13, 0.15],
    twist: [-0.85, 0.15, 0.82], lean: [-0.2, 0.26, 0.34], crouch: 0.4, stance: 1, side: true },
  overhead: { label: '머리 위에서 앞으로 내려치기', back: [-0.22, 0.92, -0.32], hit: [-0.45, -0.18, 0.87],
    posBack: [-0.04, 0.21, 0.125], posHit: [-0.02, 0.12, 0.145], twist: [-0.2, 0.05, 0.12], lean: [-0.3, 0.2, 0.26], crouch: 0.35 },
  side: { label: '옆으로 크게 휘두르기', back: [-0.82, 0.22, -0.53], hit: [0.12, -0.12, 0.98],
    posBack: [-0.08, 0.13, 0.11], posHit: [-0.01, 0.09, 0.155], twist: [-0.85, 0.2, 0.75], lean: [-0.05, 0.14, 0.18], crouch: 0.25 },
  // 2타: 1타(대각선)가 왼쪽 아래로 내려간 자리에서 그대로 왼쪽 위로 들어 올려, 오른쪽 아래로 대각선으로 휘두른다.
  // from: 시작 자세를 1타의 관성 끝 자세로 잡아 두 동작이 끊기지 않고 이어진다
  second: { label: '2타 · 왼쪽 위에서 앞을 지나 오른쪽으로', // (젖힐 때 몽둥이를 왼쪽으로 많이 눕히지 않고 머리 왼쪽 위로 세운다: 많이 눕히면 자루 끝을 쥔 왼손이 오른손의 오른쪽에 놓여
    //  오른팔이 왼팔을 가로질러 지나간다)
    back: [0.15, 0.85, -0.5], hit: [-0.25, 0.2, 0.97], end: [-0.75, 0.16, 0.64],
    posBack: [0.015, 0.19, 0.115], posHit: [-0.035, 0.135, 0.13], posEnd: [-0.05, 0.13, 0.135],
    twist: [0.75, -0.15, -0.55], lean: [-0.14, 0.26, 0.34], crouch: 0.4, stance: 1,
    // via: 들어 올릴 때 거쳐 가는 자세. 왼쪽 아래에서 몸 옆 뒤로 돌아 올라가야, 꼭대기에서 멈췄다 되돌아오지 않고
    // 뒤 → 위 → 앞으로 한 방향으로 돌며 그대로 내리치게 된다 (앞쪽으로 들어 올리면 꼭대기에서 방향이 뒤집혀 한 박자 선다)
    from: 'diagonal', duration: 0.62, via: { dir: [0.25, 0.9, 0.35], pos: [0.0, 0.17, 0.135] } },
  // 3타(야구 스윙): 2타가 오른쪽 아래로 내려간 자리에서 몽둥이를 오른쪽 옆으로 돌려 오른 어깨 옆에 세워 들었다가(타석에 선 자세),
  // 허리를 크게 돌리며 가슴 높이에서 수평으로 휘둘러 왼쪽 뒤까지 넘긴다. 다른 타보다 허리를 훨씬 깊이 감았다가 훨씬 멀리 풀고,
  // 동작도 길다. 몽둥이 방향은 몸통 기준이라 끝 방향을 왼쪽으로 돌리지 않고 허리 비틀기로 왼쪽까지 보낸다
  // (끝 방향을 왼쪽으로 돌리면 두 팔이 엇갈린다). 끝에서는 몽둥이 끝이 살짝 위로 올라간다
  // 젖힐 때 두 손을 오른 어깨 위로 높이 들어 몽둥이를 거의 곧게 세우고(대각선 위), 거기서 내려오며 휘둘러 맞는 순간 수평을 조금 지난다.
  // 끝에서는 다시 위로 올라간다. 손은 팔이 닿는 한계 가까이 내보내 두 팔을 거의 다 편다.
  // kick: 젖히는 동안 앞다리(왼다리) 무릎을 들어 올렸다가 타격 직전에 내딛는다
  // hips: 허리 비틀기 중 골반이 함께 도는 몫 (다른 타는 0.4). 3타는 골반도 크게 돌려 다리까지 같이 돈다
  // coil: 감을 때(젖힘) 골반이 도는 몫. 늘린 만큼 허리 몫을 줄여 어깨가 도는 총량은 같다 (골반이 덜 돌면 어깨·다리만 돌고 골반은 그대로인 것처럼 보인다)
  // 가장 크게 휘두르는 순간 두 팔을 다 폈다가 끝으로 가며 다시 굽힌다. 왼손은 자루 끝을 쥐어 오른손보다 몸쪽에 있으므로
  // 두 손을 오른 어깨 앞쪽 조금 낮게 내보내야 왼팔이 가슴을 가로질러 함께 펴진다.
  // reach: 그 순간 어깨를 옮기는 양 [오른 어깨 앞으로, 왼 어깨 앞으로(음수면 뒤로)]. 왼 어깨를 살짝 빼야 왼팔이 끝까지 펴진다
  // charge: 들어 올린 꼭대기에서 힘을 모으듯 잠깐 느려졌다가 휘두른다
  // elbowDown: 젖혀 든 동안 오른 팔꿈치를 옆으로 벌리지 않고 아래로 떨어뜨린다 (타석에서 몽둥이를 세워 든 자세).
  //  곧장 아래로 떨구면 오른 아래팔이 세운 몽둥이 아래쪽을 쥔 왼 주먹을 뚫고 지나가므로 바깥 옆으로 조금 비켜 내린다
  homerun: { label: '3타 · 야구 배트처럼 높이 들었다 내리며 크게', back: [-0.35, 0.93, 0.1], elbowDown: true, hit: [-0.3, -0.04, 0.95], end: [0.65, 0.15, 0.72],
    posBack: [-0.11, 0.215, 0.11], posHit: [-0.06, 0.09, 0.2], posEnd: [0.03, 0.16, 0.14], reach: [0.01, -0.03], charge: true,
    twist: [-2.0, 0.35, 1.6], lean: [-0.32, 0.2, 0.04], crouch: 0.5, stance: 1, kick: 1, hips: 0.55, coil: 0.85,
    from: 'second', duration: 0.78, via: { dir: CLUB_SIDE[1], pos: CLUB_SIDE[0] } },
  // 4타(= 이어 치는 1타): 야구 스윙이 왼쪽 뒤로 넘어간 자리에서 몽둥이를 오른쪽으로 되돌려 오른 어깨 너머로 젖혔다가 다시 왼쪽 아래로 내리친다.
  // 끝 자세가 1타와 같아 2타가 그대로 받는다: 1타 → 2타 → 3타 → 4타 → 2타 → 3타 → …
  third: { label: '4타 · 다시 오른쪽 위에서 앞을 지나 왼쪽으로', back: BACK_R.dir, hit: [-0.4, 0.2, 0.92], end: [0.2, 0.16, 0.97],
    posBack: BACK_R.pos, posHit: [-0.035, 0.135, 0.13], posEnd: [-0.01, 0.13, 0.15],
    twist: [-0.85, 0.15, 0.82], lean: [-0.2, 0.26, 0.34], crouch: 0.4, stance: 1,
    from: 'homerun', duration: 0.62, via: { dir: CLUB_SIDE[1], pos: CLUB_SIDE[0] } },
  // 강타(스킬): 준비 자세에서 바로, 3타보다 허리를 훨씬 깊이 감고 골반까지 크게 돌린다. 무릎을 더 높이 들고, 내딛는 순간 더 낮게 주저앉는다
  // 야구 풀스윙 (참고 연속 그림 5장면): ① 오른 어깨 옆에 세워 듦 → ② 몽둥이 끝을 뒤로 눕혀 힘을 실음(back) →
  // ③ 두 손을 배 앞으로 끌어내리고 몽둥이 끝은 땅을 향함(dips) → ④ 두 팔을 쭉 펴며 끝을 수평까지 올려 앞을 맞힘(hit) →
  // ⑤ 몸을 돌려 몽둥이가 왼쪽 위로 넘어감(end) → 두 손으로 쥔 채 조금 더 감아 돌며 느려짐(settle)
  // dips: 젖힘 → 타격 사이에 거쳐 가는 자세들. 꼭대기(위 뒤)와 땅을 향한 자세는 방향이 거의 정반대라 곧장 이으면
  // 몽둥이가 한 장면 만에 휙 뒤집힌다: 먼저 몸 뒤로 수평으로 끌려오게(lag) 한 번 거쳐 간다
  // twoTo: 이때까지 두 손으로 쥐고 있다 (다른 타는 0.7). 강타는 끝 자세까지 두 손으로 쥔 채 버티다가 놓는다
  strike: { label: '강타 · 야구 풀스윙', back: [-0.6, 0.72, -0.35], elbowDown: true, hit: [-0.15, -0.04, 0.99], end: [0.6, 0.42, 0.68],
    dips: [{ pos: [-0.085, 0.14, 0.12], dir: [-0.88, 0.35, -0.32] }, { pos: [-0.045, 0.065, 0.15], dir: [-0.3, -0.88, 0.36] }],
    settle: { pos: [0.05, 0.16, 0.12], dir: [0.8, 0.45, 0.38] },
    posBack: [-0.125, 0.21, 0.09], posHit: [-0.03, 0.1, 0.22], posEnd: [0.03, 0.17, 0.15],
    twoTo: 0.93, plant: 0.44,
    reach: [0.015, -0.035], charge: true,
    twist: [-2.2, 0.42, 1.9], lean: [-0.42, 0.3, 0.1], crouch: 0.62, stance: 1, kick: 1.15, hips: 0.6, coil: 0.85, power: 1,
    // hold: 다 감아 든 꼭대기에서 [이때부터, 이때까지] 기를 모으듯 부르르 떨며 짧게 버티다가 단숨에 내리친다 (강타는 1.02초 중 0.09초쯤)
    hold: [0.3, 0.39], duration: 1.02,
    hitAt: 0.535, // 맞는 순간: 관절이 늦게 따라와 몽둥이가 실제로 수평에 닿는 때 (곡선은 0.5 에 수평)
    via: { dir: CLUB_SIDE[1], pos: CLUB_SIDE[0] } },
  upper: { label: '아래에서 올려치기', back: [-0.62, -0.55, -0.56], hit: [-0.25, 0.5, 0.83],
    posBack: [-0.09, 0.07, 0.1], posHit: [-0.03, 0.15, 0.155], twist: [-0.6, 0.2, 0.45], lean: [0.3, -0.12, -0.2], crouch: 0.2, follow: 1.3 },
};
// 내리찍기(대시·더블 점프): 오른 어깨 위·뒤로 대각선으로 치켜든 자세 → 두 팔을 앞으로 뻗어 왼쪽 앞 아래로 찍은 자세 → 조금 더 눌러 멈춘 자세.
// 찍을 때 손은 가슴 앞이 아니라 어깨에서 앞 아래로 뻗은 끝에 두고, 몽둥이는 팔이 뻗은 방향을 그대로 이어 간다.
// 몽둥이 방향은 몸통 기준이라 상체를 깊이(약 0.7) 숙이면 그만큼 아래로 기운다: 몸통 기준 거의 앞으로 두면 실제로는 40도쯤 아래를 찍는다
// (손을 몸 가까이 둔 채 몽둥이만 아래로 세우면 지팡이를 짚는 꼴이 된다)
const CLUB_RAISE = [BACK_R.pos, BACK_R.dir];
const SLAM_HIT = [[0.02, 0.125, 0.14], [-0.5, -0.3, 0.81]];
const SLAM_END = [[0.02, 0.118, 0.14], [-0.48, -0.38, 0.79]];
// 더블 점프 내리찍기의 끝 자세: 찍은 자리에서 멈추지 않고 왼쪽 아래로 더 쓸고 나간다 (몸 가운데에서 끝나면 휘두르다 만 것처럼 어색하다)
const SLAM_SWEEP = [[0.05, 0.115, 0.135], [-0.3, -0.42, 0.86]];
// 두 다리를 따로 굽혀 선다: [엉덩이, 무릎] 각도 (k = 0~1 로 원래 자세에서 섞음). 발바닥은 땅과 나란히,
// 더 아래로 뻗은 발이 땅에 닿도록 몸 높이를 맞춘다 (앞뒤로 벌린 런지 자세에서도 발이 땅에 묻히거나 뜨지 않게).
// base: 함께 섞을 무릎 굽히기(crouch) 정도
function legs(P, k, [hR, kR], [hL, kL], base = 0) {
  crouch(P, base * (1 - k));
  let low = 0;
  for (const [s, h, n] of [['R', hR, kR], ['L', hL, kL]]) {
    const hip = P[`hip${s}.rx`] + (h - P[`hip${s}.rx`]) * k;
    const knee = P[`knee${s}.rx`] + (n - P[`knee${s}.rx`]) * k;
    P[`hip${s}.rx`] = hip;
    P[`knee${s}.rx`] = knee;
    P[`foot${s}.rx`] = -(hip + knee);
    low = Math.max(low, 0.1 * Math.cos(hip) + 0.1 * Math.cos(hip + knee));
  }
  P['pelvis.py'] = low - 0.2;
}
const CLUB_READY = unit([-0.2, 0.8, 0.5]);
const CLUB_READY_POS = [-0.02, 0.14, 0.105]; // 몸 가까이: 멀리 내밀면 들어 올리기 전부터 두 팔이 일자로 뻗는다

// ── 목검(한손검) 휘두르기 ──
// 오른손 하나로만 쥐고 휘두른다: 손이 쥔 자리와 칼이 뻗는 방향을 fx.oneHand 로 직접 정한다 (몸통 기준: x 오른쪽(-)·왼쪽(+), y 위, z 앞).
// 손 자리는 '어깨에서 팔이 뻗는 방향(arm) + 뻗은 길이(reach)'로 정하고, 키 사이를 어깨를 중심으로 한 원호로 잇는다.
// (손 자리를 곧게 이으면 손이 어깨 가까이로 지나가며 팔꿈치가 접혀, 휘두르기가 아니라 지휘하는 것처럼 보인다)
// 휘두르는 구간은 팔을 거의 끝까지 뻗어(REACH) 팔꿈치가 펴진 채 어깨에서 크게 돈다.
// pole: 팔꿈치가 굽는 쪽 (몸통 기준). 키마다 정하고 사이를 부드럽게 이어, 칼을 돌리는 순간 굽는 쪽이 뒤집혀 꺾이지 않게 한다.
// line: 그 키로 가는 동안 손을 원호가 아니라 곧게 옮긴다 (찌르기)
// 왼손은 칼을 잡지 않고, 몸의 균형을 잡듯 반대쪽으로 벌렸다 모은다.
const SHOULDER_R = [-0.068, 0.166, 0]; // 몸통 기준 오른 어깨 자리
// 팔을 뻗었을 때 어깨에서 쥔 자리까지: 다 편 길이(윗팔 0.09 + 아래팔 0.078 + 손 안의 소켓 0.05 = 0.218)보다 조금 짧게.
// 이 근처에서는 길이가 조금만 짧아도 팔꿈치가 크게 굽는다 (0.212 → 27도, 0.2165 → 15도쯤)
const REACH = 0.2165;
const DOWN = [-0.35, -1, -0.1]; // 팔을 뻗을 때 팔꿈치는 아래(살짝 바깥)를 향한다
const SWORD_READY = { arm: [0, -0.55, 0.83], reach: 0.12, dir: [-0.15, 0.55, 0.82], pole: [-0.5, -1, 0] }; // 평소 들고 있던 자세와 가까운 시작점
const key = (u, arm, reach, dir, pole, ease, line) => ({ u, arm, reach, dir, pole, ease, line });
// 사선 베기 면: 어깨를 지나는 면 하나 위에서 팔과 칼이 함께 돈다 (칼끝이 그 면 위에 곧은 사선 원호를 그린다).
// hit: 타격 순간 칼이 향하는 방향(φ = 0), up: 젖힌 쪽 방향. 두 방향이 면을 이룬다. φ 가 클수록 젖힌 쪽, 음수는 내리친 쪽
// 칼은 팔보다 LEAD 만큼 젖힌 쪽에 뒤처져 따라온다: 주먹 속 칼 각도가 들고 다닐 때 그대로라 칼과 아래팔이 늘 벌어져 있어야 하고
// (손목은 75도까지 꺾인다), 이 각을 일정하게 두면 손목이 덜컥거리지 않고 팔·칼이 한 덩어리로 돈다
const LEAD = 66 * PI / 180; // 손 안의 칼이 손목에서 옆으로 비켜 있어, 아래팔 기준으로는 이보다 15도쯤 덜 벌어진다
function slashPlane(hit, up, pole, lead = LEAD) {
  const e1 = unit(hit);
  const u0 = unit(up);
  const d = u0[0] * e1[0] + u0[1] * e1[1] + u0[2] * e1[2];
  const e2 = unit(u0.map((x, i) => x - d * e1[i]));
  const at = (deg) => { const a = deg * PI / 180; return e1.map((x, i) => x * Math.cos(a) + e2[i] * Math.sin(a)); };
  const arm = (deg) => { const a = deg * PI / 180 - lead; return e1.map((x, i) => x * Math.cos(a) + e2[i] * Math.sin(a)); };
  // φ: 칼 각, reach: 팔 뻗은 길이
  return (u, deg, reach, ease) => key(u, arm(deg), reach, at(deg), pole, ease);
}
// 1타 면: 오른 어깨 위·뒤 → 앞 → 왼쪽 아래 앞 / 2타 면: 왼 어깨 위·뒤 → 앞 → 오른쪽 아래 앞
// (타격 방향을 내리치는 쪽으로 조금 돌려 두어야 마무리 때 팔이 배를 가로지르지 않고 몸 앞으로 지나간다)
const PLANE1 = slashPlane([0.3, -0.15, 0.94], [-0.62, 0.72, -0.15], [-0.6, -1, 0.1]);
const PLANE2 = slashPlane([-0.3, -0.15, 0.94], [0.75, 0.62, -0.2], [-0.3, -1, 0.3]); // 1타보다 조금 눕혀, 젖힐 때 손이 얼굴 앞이 아니라 머리 왼쪽 옆으로 간다
const SWORD_STYLES = {
  // 1타: 주먹을 몸 앞으로 들어 올리며 칼을 뒤로 젖혔다가, 팔을 쭉 뻗은 채 오른쪽 위 → 왼쪽 아래로 크게 대각선 베기
  // tilt: 휘두르는 동안 손 안의 칼을 앞으로 기울여 쥔다. 쥔 각도 그대로면 칼을 베기 면에 맞추느라 손목이 75도 가까이 꺾이므로,
  // 칼을 쥔 각도로 방향을 얼마쯤 맞춰 손목이 덜 꺾인다. 손목은 동작에 맞게 어느 정도 꺾인다
  // (1.0 을 넘기면 칼이 손 안에서 90도 가까이 돌아 거꾸로 쥔 것처럼 보인다)
  // 젖힐 때: 어깨를 바깥으로 벌려 팔꿈치를 옆구리 바깥 아래에 두고, 아래팔을 앞으로 뻗어 주먹을 가슴 오른쪽 앞 → 턱 오른쪽 앞으로 들어 올리며
  // (주먹이 얼굴 앞에 있으면 뒤로 향한 칼이 머리를 뚫고 지나간다),
  // 칼을 기울여 쥐지 않은 채(tilt 0) 손목을 엄지 쪽(위)으로 젖혀 칼끝이 곧장 뒤·위를 향하게 한다 (엄지는 몸 쪽(뒤)을 본다).
  // 팔꿈치는 키마다 같은 쪽에 고정한다(fixPole): 주먹을 실제 아래팔에 맞춰 돌려야 손목이 엄지 쪽으로 꺾이고, 팔꿈치가 튀지 않는다.
  // 내려베기 시작하며 칼을 앞으로 기울여 쥐어 손목을 편다
  slash1: { duration: 0.6, hitAt: 0.47, trail: [0.33, 0.64], tilt: [[0, 0], [0.33, 0], [0.47, 1.0], [0.64, 1.0]], fixPole: true,
    // 끝 키의 팔꿈치는 아래에서 살짝 뒤로 돌려 둔다 (2타와 같은 까닭: 손을 놓을 때 팔이 휙 돌지 않게)
    keys: [key(0.067, [-0.549, -0.38, 0.744], 0.15, [-0.244, 0.582, -0.776], [-0.719, -0.677, -0.159]), // 주먹은 가슴 오른쪽 앞, 칼은 뒤 위로
      key(0.133, [-0.55, -0.042, 0.834], 0.17, [-0.29, 0.436, -0.852], [-0.719, -0.677, -0.159]), // 주먹은 어깨 앞
      key(0.2, [-0.55, 0.297, 0.781], 0.17, [-0.336, 0.192, -0.922], [-0.719, -0.677, -0.159]), // 주먹은 턱 오른쪽 앞, 칼은 뒤로
      key(0.33, [-0.612, 0.327, 0.719], 0.18, [-0.382, 0.286, -0.879], [-0.719, -0.677, -0.159]), // 다 든 자세
      // 중간 키: 뒤로 젖힌 칼을 베기 면 가까이로 옮겨 놓아 내려벨 때 손이 끊기지 않게 (베기 면의 100° 자리에서 주먹·칼을 조금 바깥으로: 칼이 얼굴 앞을 스치지 않게)
      key(0.41, [-0.215, 0.296, 0.931], 0.2, [-0.657, 0.742, 0.129], [-0.6, -1, 0.1], 'in'),
      PLANE1(0.47, 0, REACH), { ...PLANE1(0.64, -22, REACH, 'out'), pole: [-0.6, -1, -0.4] }],
    twist: [[0, 0], [0.12, -0.35], [0.33, -1.15], [0.47, 0.3, 'in'], [0.64, 1.15, 'out']], // 젖힐 때 오른쪽 뒤로 크게 감았다가 휘두르며 왼쪽까지 확 풀어 돈다
    lean: [[0, 0], [0.33, -0.15], [0.47, 0.14], [0.64, 0.22]],
    armL: [[0, 0.6], [0.33, 1.2], [0.47, 0.9], [0.64, 0.35]],
    // 왼팔: 젖힐 때 앞으로 뻗어 균형을 잡다가, 휘두르는 순간 팔꿈치를 접어 옆구리 뒤로 당긴다 (몸을 틀어 내리치는 힘을 보탠다)
    elbowL: [[0, -0.5], [0.33, -0.75], [0.47, -1.2, 'in'], [0.64, -0.95, 'out']],
    fwdL: [[0, -0.3], [0.33, -0.55], [0.47, -0.15], [0.64, 0.15]] },
  // 2타: 왼쪽 아래 끝 자세에서 칼을 왼 어깨 위로 감아올렸다가, 팔을 쭉 뻗은 채 왼쪽 위 → 오른쪽 아래로 사선 되베기
  // (감아올릴 때 팔꿈치는 가슴 앞 아래를 향한다)
  slash2: { duration: 0.54, hitAt: 0.43, trail: [0.27, 0.62], from: 'slash1', tilt: [[0, 1.0], [0.43, 1.0], [0.62, 0.9]],
    // 끝 키의 팔꿈치는 평소 자세처럼 뒤로 돌려 둔다: 앞 아래로 둔 채 손을 놓으면 평소 자세와 윗팔 비틀림이 180도 가까이 어긋나, 놓는 도중 팔이 휙 돈다
    keys: [PLANE2(0.27, 120, 0.17), PLANE2(0.43, 0, REACH, 'in'), { ...PLANE2(0.62, -28, REACH, 'out'), pole: [-0.3, -0.5, -1] }],
    twist: [[0, 1.15], [0.27, 1.2], [0.43, 0, 'in'], [0.62, -1.1, 'out']],
    lean: [[0, 0.22], [0.27, 0.05], [0.43, 0.14], [0.62, 0.12]],
    armL: [[0, 0.35], [0.27, 0.3], [0.43, 0.9], [0.62, 1.25]],
    // 왼팔: 감아올릴 때는 접어 뒤로 당겨 두었다가, 오른쪽으로 베며 몸이 돌 때 앞으로 내밀며 조금 편다
    elbowL: [[0, -0.95], [0.27, -1.15], [0.43, -0.7, 'in'], [0.62, -0.55, 'out']],
    fwdL: [[0, 0.15], [0.27, 0.25], [0.43, -0.3], [0.62, -0.5]] },
  // (주먹 속 칼 각도가 들고 다닐 때 그대로라 칼은 아래팔과 119도쯤 벌어진다. 손목은 75도까지 꺾이므로
  //  키마다 팔이 뻗는 방향과 칼 방향을 45도 넘게 벌려 둔다: 휘두를 때는 팔이 앞을, 칼은 앞을 가로지른다)
  // 3타: 찌르기. 오른쪽으로 벤 칼을 허리 오른쪽 옆으로 당겨 칼끝을 앞으로 겨누고(팔꿈치는 뒤로 접음),
  // 오른발을 내디디며 칼끝 방향 그대로 앞으로 곧게 쭉 민다. 칼은 처음부터 끝까지 앞을 겨눈 채 돌지 않는다.
  // 팔은 앞 아래로 뻗고 손목을 위로 크게 꺾어 칼끝을 앞으로 세운다
  // 마을에서는 찌르는 순간 몸이 앞으로 0.7m쯤 미끄러져 나가고, 앞으로 길고 좁게 맞는다 (main.js). 찌른 자세로 한동안 버틴 뒤 푼다(release)
  slash3: { duration: 0.9, hitAt: 0.293, trail: [0.22, 0.34], from: 'slash2', lunge: 0.2, release: 0.74, wrist: 2.1, level: [0.173, 0.38], roll: [0, -1, 0], tilt: 1.0, shoulderIn: 0,
    // 팔을 정면으로 쭉 뻗어도 어깨 관절은 몸 안쪽으로 당기지 않는다(shoulderIn 0): 당기면 어깨가 몸통에 묻혀 보이고 다음 1타까지 이어진다.
    // 칼을 앞으로 겨누려면 손목이 꺾여야 한다. 손목은 아래로 꺾는다 (roll: 주먹을 아래로).
    // 쥔 각도 그대로면 손목을 120도나 꺾어야 하므로, 칼을 당기는 동안 손 안의 칼을 앞으로 57도쯤 기울여 쥐어(tilt) 덜 꺾게 한다 (손목은 60도 남짓).
    // 주먹이 아래로 꺾이면 칼은 아래팔보다 들린 쪽으로 나오므로, 아래팔은 앞 아래로 조금 내려 칼이 수평으로 앞을 향하게 한다.
    // 그만큼 손이 내려가지 않게 상체를 덜 숙여 어깨를 높이 두고, 손 높이는 발밑 기준으로 고정한다(level) → 칼끝은 가슴 높이로 곧게 나간다.
    // 당길 때: 허리를 틀어 오른 어깨를 뒤로 빼고, 팔꿈치도 옆구리 뒤로 접어 손을 가슴 오른쪽 옆으로 당긴다 (팔꿈치를 위로 들지 않는다).
    // 찌를 때: 그 높이 그대로 팔꿈치를 끝까지 펴며 앞으로 곧게 민다
    keys: [key(0.173, [-0.15, -0.55, 0.4], 0.13, [0.03, 0.0, 1], [-0.3, 0, -1]),
      key(0.22, [-0.15, -0.55, 0.4], 0.13, [0.03, 0.0, 1], [-0.3, 0, -1]), // 잠깐 겨누고 멈춤
      key(0.293, [-0.15, -0.38, 0.91], REACH, [0.03, 0.0, 1], [-0.3, -0.5, -0.6], 'in', true),
      key(0.4, [-0.15, -0.38, 0.91], REACH, [0.03, -0.01, 1], [-0.3, -0.5, -0.6]),
      key(0.62, [-0.15, -0.38, 0.91], REACH, [0.03, -0.02, 1], [-0.3, -0.5, -0.6])], // 찌른 채 버팀
    twist: [[0, -1.1], [0.173, -0.65], [0.22, -0.65], [0.293, 0.25, 'in'], [0.62, 0.2]], // 당길 때 오른 어깨를 뒤로 빼 두었다가 찌르며 앞으로 내민다
    lean: [[0, 0.12], [0.173, -0.05], [0.293, 0.22, 'in'], [0.4, 0.25], [0.62, 0.22]], // 앞으로 조금 숙여 몸무게를 싣되, 어깨가 내려가지 않게 얕게
    armL: [[0, 1.25], [0.173, 0.9], [0.293, 1.35], [0.62, 1.3]],
    // 왼팔: 칼을 당길 때는 앞으로 내밀어 겨누는 쪽을 잡아 주고, 찌르는 순간 팔꿈치를 접어 뒤로 확 당긴다 (반동)
    elbowL: [[0, -0.55], [0.173, -0.6], [0.293, -1.1, 'in'], [0.62, -1.0]],
    fwdL: [[0, -0.5], [0.173, -0.55], [0.293, 0.3, 'in'], [0.62, 0.3]] },
};
// 강타(스킬): 2타(왼쪽 위 → 오른쪽 아래 사선 되베기)를 준비 자세에서 바로, 더 크고 세게.
// 2타와 같은 베기 면·같은 쥐는 법으로, 허리를 2타보다 훨씬 깊이 틀며 칼을 왼 어깨 위로 높이 들어 올리고(팔꿈치는 몸 쪽으로 굽힌다),
// 꼭대기에서 기를 모으듯 부르르 떨며 버티다가(hold: 이때 노란 빛줄기가 칼끝으로 모인다, main.js STRIKE_CHARGE)
// 상체를 앞으로 깊이 숙이고 무릎을 굽혀 주저앉으며 오른쪽 아래 끝까지 크게 사선으로 벤다
SWORD_STYLES.strike = { duration: 1.0, hitAt: 0.5, trail: [0.42, 0.72], release: 0.8, lookUp: 0.6, hold: [0.28, 0.42],
  tilt: [[0, 1.0], [0.6, 1.0], [0.72, 0.9]], // 칼을 앞으로 기울여 쥐어 손목을 덜 꺾는다 (1·2타와 같은 까닭)
  keys: [PLANE2(0.28, 134, 0.18), PLANE2(0.42, 138, 0.18),
    PLANE2(0.5, 0, REACH, 'in'), { ...PLANE2(0.72, -55, REACH, 'out'), pole: [-0.3, -0.5, -1] }], // 내리칠 때 굽혔던 팔을 쭉 펴며 2타보다 더 아래까지 벤다
  twist: [[0, 0], [0.28, 2.3], [0.42, 2.4], [0.5, 0, 'in'], [0.72, -1.6, 'out']], // 허리를 훨씬 깊이 감았다가 단숨에 풀며 내리친다
  lean: [[0, 0], [0.28, -0.24], [0.42, -0.28], [0.5, 0.6, 'in'], [0.72, 0.75], [0.8, 0.7]], // 치켜들 때 뒤로 젖혔다가 벨 때 깊이 숙인다
  sink: [[0, 0.1], [0.28, 0.2], [0.42, 0.28], [0.5, 0.7, 'in'], [0.8, 0.6], [1, 0]], // 기를 모으며 몸을 꾹 눌러 낮춘다
  armL: [[0, ARM_REST], [0.28, 0.35], [0.42, 0.4], [0.5, 1.0], [0.72, 1.4]],
  elbowL: [[0, -0.3], [0.28, -1.2], [0.42, -1.25], [0.5, -0.7, 'in'], [0.72, -0.5, 'out']],
  fwdL: [[0, 0], [0.28, 0.3], [0.42, 0.3], [0.5, -0.35], [0.72, -0.6]] };
// 3타에 이어 치는 1타: 찌른 끝 자세에서 다시 어깨 위로 치켜든다 (1 → 2 → 3 → 1' → 2 → 3 …)
// (찌른 끝 자세에서 가슴 앞 첫 자세로 곧장 가면 주먹이 한 장면 만에 휙 돌므로, 첫 자세는 건너뛰고 어깨 앞 자세부터 들어 올린다.
//  팔꿈치 고정은 조금 뒤(진행도 0.05)부터 한다: 주먹을 아래로 꺾어 쥔 찌르기에서 넘어오는 첫 장면에 고정하면 주먹이 100도 넘게 돈다.
//  고정하지 않으면 위팔이 가슴 속으로 들어간다. 어깨 관절도 몸 안쪽으로 당기지 않는다(shoulderIn 0): 3타에서 이어지며 어깨가 몸통에 묻혀 보인다)
SWORD_STYLES.slash1b = { ...SWORD_STYLES.slash1, from: 'slash3', keys: SWORD_STYLES.slash1.keys.filter((k) => k.u >= 0.133), fixPole: 0.05, shoulderIn: 0 };
const WRIST_ONE = 1.3; // 한 손 쥐기의 기본 손목 한계 (equipment.js 의 WRIST_BEND 와 같게)
const RELEASE = 0.72; // 이 진행도부터 손을 놓고 평소 들고 다니는 자세로 돌아간다
const handAt = (k) => SHOULDER_R.map((x, i) => x + unit(k.arm)[i] * k.reach);
// 키 사이: 팔 방향은 어깨를 중심으로 원호로(slerp), 뻗은 길이·칼 방향·팔꿈치 방향도 함께 섞는다. line 이면 손을 곧게 옮긴다
function swordPath(u, keys) {
  let i = 0;
  while (i < keys.length - 2 && u >= keys[i + 1].u) i += 1;
  const k0 = keys[i];
  const k1 = keys[i + 1];
  const w = kf(u, [k0.u, 0], [k1.u, 1, k1.ease]);
  let pos;
  if (k1.line) pos = mix(handAt(k0), handAt(k1), w);
  else {
    const arm = slerpDir(unit(k0.arm), unit(k1.arm), w);
    const r = k0.reach + (k1.reach - k0.reach) * w;
    pos = SHOULDER_R.map((x, n) => x + arm[n] * r);
  }
  return { pos, dir: slerpDir(unit(k0.dir), unit(k1.dir), w), pole: slerpDir(unit(k0.pole), unit(k1.pole), w) };
}
// 손 안의 칼 각도(tilt): 한 값이거나, 동작 진행에 따라 바꿔 쥐는 키 [[u, 값], …]
const tiltAt = (S, u) => (Array.isArray(S.tilt) ? kf(u, ...S.tilt) : S.tilt ?? 0);
const tiltEnd = (S) => (!S ? 0 : Array.isArray(S.tilt) ? S.tilt.at(-1)[1] : S.tilt ?? 0);
const mix1 = (a, b, w) => a + (b - a) * w;
const TILT_IN = 0.17; // 동작 처음 이만큼(진행도) 동안 칼을 서서히 바꿔 쥔다 (짧으면 주먹이 휙 돌아 튄다)
function swordSwing(name) {
  const S = SWORD_STYLES[name];
  const prev = S.from ? SWORD_STYLES[S.from] : null;
  const keys = [{ ...(prev ? prev.keys.at(-1) : SWORD_READY), u: 0 }, ...S.keys];
  const k = (u, pts) => kf(u, ...pts);
  const endU = keys.at(-1).u;
  return {
    duration: S.duration, hitAt: S.hitAt, equip: 'woodSword', rate: 34, trail: S.trail,
    fn(u, P, fx) {
      const rel = S.release ?? RELEASE;
      const back = sm(u, rel, 1); // 0 → 1: 대기 자세로 풀기
      const tw = k(u, S.twist) * (1 - back);
      // 허리와 어깨를 크게 감았다 푼다: 어깨가 먼저 돌아 나가야 팔만 휘두르는 느낌이 나지 않는다
      P['spine.ry'] = tw * 0.6;
      P['pelvis.ry'] = tw * 0.4;
      P['head.ry'] = -tw * 0.75; // 몸을 틀어도 눈은 앞을
      const sink = S.sink ? k(u, S.sink) : kf(u, [0, prev ? 0.3 : 0.1], [Math.min(0.3, S.hitAt - 0.08), 0.25], [S.hitAt, 0.42, 'in'], [rel, 0.35], [1, 0]);
      crouch(P, sink);
      if (S.lunge) {
        // 찌를 때 오른발을 앞으로 크게 내딛고 왼발은 뒤로 버틴다 (강타는 더 크게: lungeLegs)
        const l = kf(u, [S.lunge, 0], [S.hitAt, 1, 'in'], [rel, 1], [1, 0]);
        const [lr, ll] = S.lungeLegs ?? [[-1.0, 0.95], [0.5, 0.2]];
        legs(P, l, lr, ll, S.sink ? sink : 0);
        P['head.rx'] = -k(u, S.lean) * 0.55 * (1 - back); // 숙여도 고개는 들어 앞을 본다
      } else {
        wideStance(P, kf(u, [0, prev ? 0.8 : 0], [0.3, 0.9], [rel, 0.9], [1, 0]));
        if (S.lookUp) P['head.rx'] = -k(u, S.lean) * S.lookUp * (1 - back); // 깊이 숙여도 고개는 들어 앞을 본다
      }
      P['spine.rx'] += k(u, S.lean) * (1 - back); // 다리 자세(legs)가 상체 숙임을 새로 쓰므로 그 뒤에 더한다
      // 왼팔: 칼과 반대쪽으로 벌려 균형을 잡고, 타마다 팔꿈치를 접었다 펴며(elbowL) 앞뒤로 흔든다(fwdL)
      const aL = k(u, S.armL) * (1 - back) + ARM_REST * back;
      P['shoulderL.rz'] = aL;
      P['shoulderL.rx'] = k(u, S.fwdL) * (1 - back);
      P['elbowL.rx'] = k(u, S.elbowL) * (1 - back) - 0.08 * back;
      if (u < rel) {
        // 키 자세는 몸통이 아니라 몸이 서 있는 방향(허리를 틀거나 숙이기 전) 기준이다 (body).
        // 그래야 휘두르는 동안 허리가 크게 돌고 숙여도 베기 면이 같이 돌지 않아 칼끝이 곧은 사선을 그리고, 찌르기도 곧게 앞으로 나간다.
        // 손 자리는 어깨에서 뻗은 벡터(arm)로 넘겨, 지금 어깨가 실제로 있는 자리에서 뻗는다.
        // (허리를 튼 목표 값으로 되돌려 계산하면, 관절이 목표를 조금 늦게 따라가는 동안 칼끝이 들렸다 내려와 내리치는 것처럼 보인다)
        const g = swordPath(Math.min(u, endU), keys);
        if (S.hold) {
          // 기 모으기: 꼭대기에서 칼끝이 잘게 떨린다 (몽둥이 강타와 같은 연출)
          const q = kf(u, [S.hold[0] - 0.03, 0], [S.hold[0] + 0.02, 1], [S.hold[1], 1], [S.hold[1] + 0.03, 0]);
          const tr = Math.sin(u * S.duration * 95) * 0.035 * q;
          g.dir = unit([g.dir[0] + tr, g.dir[1], g.dir[2] - tr * 0.6]);
        }
        fx.oneHand = { arm: g.pos.map((x, n) => x - SHOULDER_R[n]), dir: g.dir, pole: g.pole, wrist: S.wrist, fixPole: S.lunge != null || (typeof S.fixPole === 'number' ? u >= S.fixPole : !!S.fixPole), roll: S.roll, body: true };
        // level: 손 높이를 발밑 기준으로 고정 (당긴 뒤부터 서서히) → 상체를 숙여도 손과 칼끝이 같은 높이로 곧게 앞으로 나간다
        if (S.level) { fx.oneHand.level = S.level[1]; fx.oneHand.levelW = kf(u, [S.level[0] - 0.08, 0], [S.level[0], 1]); }
        // 앞 동작(찌르기)의 손 높이 고정·넓힌 손목 한계는 이어지는 동작의 처음에 서서히 푼다 (한꺼번에 풀면 팔이 한 장면 만에 튄다)
        const fade = 1 - kf(u, [0, 0], [0.2, 1]);
        if (!S.level && prev?.level && fade > 0) { fx.oneHand.level = prev.level[1]; fx.oneHand.levelW = fade; }
        if (!S.wrist && prev?.wrist) fx.oneHand.wrist = WRIST_ONE + (prev.wrist - WRIST_ONE) * fade;
        // 손 안의 칼 각도: 앞 동작이 끝날 때 쥐었던 각도(처음 동작이면 평소 쥔 각도)에서 이 동작의 각도로 처음에 서서히 바꿔 쥔다
        const tilt = mix1(tiltEnd(prev), tiltAt(S, u), kf(u, [0, 0], [TILT_IN, 1]));
        if (tilt) fx.oneHand.tilt = tilt;
      }
      fx.carry = true; // 주먹 속 칼 각도는 휘두르는 동안에도 평소 들고 다닐 때 그대로 (equipment.js 한 손 쥐기)
      if (S.shoulderIn != null) fx.shoulderIn = S.shoulderIn; // 팔을 앞으로 뻗을 때 어깨 관절을 몸 안쪽으로 당기는 정도 (villager.js followShoulders)
    },
  };
}

// ── 나무 단검 (역수): 짧고 빠르게 여러 번 ──
// 1타 오른쪽 → 왼쪽 가로 베기 · 2타 왼쪽 → 오른쪽 되베기 · 3타 머리 옆으로 치켜들었다가 앞 아래로 내려찍기 · 이어 치는 1타 …
// 키의 날 방향(blade)은 칼끝 쪽. 역수라 도구 +Y(자루 끝)는 그 반대쪽이므로 뒤집어 넘긴다.
// 가로 베기는 주먹이 앞장서고 날은 주먹 뒤로 끌리게 둔다 (날끝이 움직이는 쪽을 향하면 베기가 아니라 찌르는 것처럼 보인다)
// 왼손은 칼을 잡지 않고 가슴 앞에 들어 막는 자세를 잡는다
const dkey = (u, arm, reach, blade, pole, ease, line) => key(u, arm, reach, blade.map((x) => -x), pole, ease, line);
// 평소 들고 다니는 자세 그대로 (쇼룸 대기 자세에서 잰 값): 팔은 거의 곧게 내리고, 날은 아래팔을 따라 뒤 위로 눕는다.
// 동작은 여기서 시작해 여기로 돌아온 뒤 손을 놓는다 → 쥐는 순간·놓는 순간 주먹이 한 장면 만에 뒤집히지 않는다
const DAGGER_READY = { arm: [-0.12, -0.17, 0.05], reach: 0.21, dir: [0.18, -0.3, 0.94], pole: [-0.1, -0.25, -0.97] };
const DAGGER_STYLES = {
  // 1타: 팔을 오른쪽 옆 뒤로 길게 뻗어 당겼다가, 팔꿈치를 안쪽으로 깊이 접으며 몸 앞을 크게 감아 주먹을 왼쪽 어깨 너머까지 밀어 넣으며 벤다
  // (팔꿈치는 오른쪽 바깥 → 앞을 향한다). 허리도 오른쪽으로 깊이 감았다가 왼쪽까지 크게 풀어 베는 길이를 늘린다
  stab1: { duration: 0.46, hitAt: 0.4,
    keys: [dkey(0.2, [-0.85, -0.1, -0.2], 0.215, [-0.1, 0.2, -0.97], [-0.3, -1, -0.4]),
      dkey(0.4, [-0.1, -0.15, 1], 0.17, [-0.9, -0.25, 0.35], [-1, -0.3, 0], 'in'),
      dkey(0.53, [0.65, -0.12, 0.75], 0.11, [-0.55, -0.25, 0.8], [-0.9, -0.2, 0.4]),
      dkey(0.62, [0.95, -0.08, 0.25], 0.085, [-0.15, -0.2, 0.97], [-0.5, -0.2, 0.85]),
      dkey(0.7, [0.9, -0.05, -0.2], 0.08, [0.25, -0.2, 0.95], [-0.2, -0.2, 0.95], 'out')],
    // 돌아오는 길: 벤 끝의 팔 자세에서 평소 팔 자세까지 어깨·팔꿈치·손목을 함께 같은 비율로 옮긴다 (settle, equipment.js settleArm).
    // 팔꿈치가 펴지는 동안 어깨도 함께 내려간다 (길을 되짚거나 날 방향을 키로 맞추면 관절이 차례로 움직이거나 엉뚱하게 꺾인다)
    settle: true, tail: 0.25,
    twist: [[0, 0], [0.2, -0.9], [0.4, 0.2, 'in'], [0.7, 1.15, 'out']] },
  // 2타: 1타를 베어 낸 자세(왼쪽 어깨 앞에 접은 팔)를 그대로 붙잡고, 팔꿈치만 펴고 어깨만 살짝 바깥으로 돌리며 오른쪽으로 되벤다.
  // 손목은 돌리거나 꺾지 않는다 (hold: 앞 장면 팔 자세에서 팔꿈치 펴기 ext · 어깨 돌리기 yaw, equipment.js holdArm).
  // keys 의 끝 키는 그렇게 편 끝 자세를 잰 값: 3타와 돌아오는 길이 여기서 이어진다
  stab2: { duration: 0.34, hitAt: 0.4, from: 'stab1',
    hold: { ext: [[0.06, 0], [0.4, 0.75, 'in'], [0.6, 1, 'out']], yaw: [[0.06, 0], [0.4, -0.08, 'in'], [0.6, -0.12, 'out']] },
    keys: [dkey(0.6, [-0.94, -0.35, 0.02], 0.216, [0.42, 0.72, -0.55], [-0.2, 0.26, -0.94])],
    // ↑ 쇼룸에서 1타 → 2타로 재생해 잰 끝 자세. 팔이 다 펴져 팔꿈치 자리로는 굽는 쪽을 못 재므로, 위팔이 실제로 비틀린 쪽(뼈 +Z의 반대)을 쓴다
    // 돌아오는 길: 오른쪽으로 편 팔을 그대로 내리며 날을 뒤로 눕힌다
    back: [dkey(0.78, [-0.6, -0.75, 0.1], 0.21, [0.2, 0.5, -0.85], [-0.4, -0.3, -0.85])],
    twist: [[0, 0.9], [0.06, 0.9], [0.4, 0, 'in'], [0.6, -0.3, 'out']] },
  // 3타: 오른쪽 머리 옆 위로 치켜들었다가, 왼쪽 앞 아래로 대각선으로 내려찍는다 (날끝은 찍는 쪽 아래를 향한다)
  stab3: { duration: 0.46, hitAt: 0.45, from: 'stab2',
    keys: [dkey(0.25, [-0.7, 0.6, 0.3], 0.18, [0.3, -0.3, 0.9], [-1, -0.3, -0.2]),
      dkey(0.45, [0.25, -0.5, 0.85], REACH, [0.35, -0.9, 0.3], [-0.6, -1, 0], 'in'),
      dkey(0.62, [0.45, -0.75, 0.5], 0.18, [0.4, -0.9, 0.2], [-0.5, -1, 0.1], 'out')],
    // 돌아오는 길: 날을 아래 뒤로 돌리며 팔을 내린다
    back: [dkey(0.8, [0, -0.85, 0.45], 0.19, [-0.1, -0.5, -0.85], [-0.4, -0.5, -0.7])],
    // 찍을 때 상체를 깊이 숙이고 무릎도 더 굽혀 몸무게를 실어 더 아래까지 찍는다 (lean: 상체 숙임, sink: 무릎 굽힘)
    lean: [[0, 0.1], [0.25, -0.05], [0.45, 0.5, 'in'], [0.62, 0.55], [0.8, 0.3], [1, 0]],
    sink: [[0, 0.3], [0.25, 0.25], [0.45, 0.65, 'in'], [0.7, 0.55], [1, 0]],
    twist: [[0, -0.5], [0.25, -0.7], [0.45, 0.3, 'in'], [0.62, 0.6, 'out']] },
};
const SIDE4 = -0.42; // 4타 끝에서 상체를 왼쪽으로 기울이는 각 (음수가 왼쪽)
// 4타: 3타로 왼쪽 앞 아래까지 내려찍은 자세에서, 팔을 앞으로 쭉 뻗은 채 몸 앞을 크게 지나 오른쪽 위로 대각선으로 베어 올린다
// (팔을 접은 채 3타 길을 되감으면 찍은 칼을 뽑는 것처럼 보인다). 베어 올리는 동안 손목을 살짝 위로 꺾어, 아래를 향했던 날끝을 앞으로 세운다.
// 숙였던 상체도 펴며 올라온다. 끝나면 1타처럼 어깨·팔꿈치·손목을 함께 내린다
{
  DAGGER_STYLES.stab4 = { duration: 0.4, hitAt: 0.42, from: 'stab3',
    keys: [dkey(0.26, [0.35, -0.62, 0.7], REACH, [0.3, -0.7, 0.65], [-0.6, -0.9, 0]), // 숙인 채 발 앞 낮은 곳에서 출발해 크게 베어 올린다
      dkey(0.42, [-0.3, 0.45, 0.85], REACH, [0.1, -0.1, 0.99], [-0.8, -0.6, 0], 'in'),
      dkey(0.6, [-0.35, 0.92, 0.18], REACH, [0, 0.2, 0.98], [-1, -0.3, -0.2], 'out')], // 오른쪽 대각선 위로 팔을 쭉 뻗어 올린다 (몸 앞 가운데로 올리면 날이 얼굴 앞을 지나 머리에 닿는다)
    settle: true, tail: 0.25,
    // 시작할 때 더 숙였다가, 베어 올리며 무릎·상체를 다 펴고 끝에는 살짝 뒤로 젖힌다 (몸 전체로 크게 올려 벤다)
    lean: [[0, 0.55], [0.1, 0.65], [0.26, 0.6], [0.42, 0.1, 'in'], [0.6, -0.22, 'out'], [0.8, -0.12], [1, 0]],
    side: [[0, 0], [0.26, 0], [0.6, SIDE4, 'out'], [0.8, SIDE4 * 0.6], [1, 0]], // 베어 올릴 때 상체·머리를 왼쪽으로 기울여 팔이 머리에 걸리지 않고 위로 쭉 올라가게
    sink: [[0, 0.55], [0.1, 0.65], [0.26, 0.6], [0.42, 0.25, 'in'], [0.6, 0, 'out'], [1, 0]],
    twist: [[0, 0.6], [0.1, 0.7], [0.26, 0.6], [0.42, 0.1, 'in'], [0.6, -0.9, 'out']] };
}
// 강타(스킬): 4타(올려 베기)를 준비 자세에서 바로, 더 크고 세게. 훨씬 깊이 웅크려 허리를 감았다가
// 발 앞 낮은 곳에서 무릎을 단숨에 펴며 뛰어올라, 일어나는 힘으로 오른쪽 위 끝까지 베어 올린다.
// 공중에서는 무릎을 살짝 접고, 내려앉을 때 한 번 무릎을 굽혀 받는다 (hop: 몸이 뜨는 높이)
// 웅크린 동안은 날끝을 몸 쪽(뒤 위)으로 돌려 쥐어 땅에 박히지 않게 하고, 일어서며 손목을 위로 젖혀 날끝을 위 → 앞으로 세워 벤다
// charge: 다 웅크린 자세(원래 시각 0.22~0.32)를 0.22초 늘려, 몽둥이 강타처럼 아래에서 부르르 떨며 기를 모은 뒤 단숨에 올려 벤다
// (늘린 만큼 main.js 의 타격 시각·나아가는 때·기 모으기 연출 시각도 함께 맞춘다)
export const DAGGER_CHARGE = { at: [0.22, 0.32], sec: 0.22 };
DAGGER_STYLES.strike = { ...DAGGER_STYLES.stab4, from: undefined, duration: 0.62, tail: 0.3, trailFrom: 0.34, charge: DAGGER_CHARGE,
  // 팔은 몸통 앞(다리 사이)이 아니라 오른 다리 바깥쪽으로 내려 둔다
  // (깊이 숙이면 어깨가 무릎 위 앞으로 나오므로, 팔은 아래 바깥 뒤쪽으로 뻗어야 손이 오른 무릎 바깥 옆에 온다)
  keys: [dkey(0.2, [-0.75, -0.55, -0.35], 0.2, [-0.1, 0.4, -0.91], [-0.4, 0.2, -0.9]), // 오른 다리 옆에 낮게, 날은 몸 쪽(뒤)으로
    dkey(0.32, [-0.73, -0.57, -0.33], 0.2, [-0.1, 0.3, -0.95], [-0.4, 0.2, -0.9]),
    dkey(0.37, [-0.5, -0.25, 0.83], 0.2, [-0.05, 0.97, 0.2], [-0.6, -0.6, -0.4]), // 일어서며 오른쪽 옆에서 손목을 젖혀 날끝이 위를 지나
    ...DAGGER_STYLES.stab4.keys.slice(1)], // 앞으로 선 채 오른쪽 위로 베어 올린다
  lean: [[0, 0.05], [0.2, 1.0], [0.32, 0.95], [0.42, 0.05, 'in'], [0.6, -0.34, 'out'], [0.8, -0.16], [1, 0]],
  side: [[0, 0], [0.32, 0], [0.6, SIDE4 * 1.15, 'out'], [0.8, SIDE4 * 0.6], [1, 0]],
  sink: [[0, 0.1], [0.2, 1.15], [0.32, 1.1], [0.4, 0, 'out'], [0.55, 0.3], [0.7, 0.15], [0.76, 0.45, 'in'], [1, 0]],
  twist: [[0, 0], [0.2, 1.05], [0.32, 1.0], [0.42, 0.1, 'in'], [0.6, -1.25, 'out']],
  hop: [[0.33, 0], [0.52, 0.22, 'out'], [0.72, 0, 'in']] };
// 4타에 이어 치는 1타: 올려 벤 오른쪽 위 자세에서 팔을 오른쪽 옆으로 내리며, 아래를 향한 날을 아래 뒤로 돌려 눕혀 당긴다
// (날이 앞 아래에서 뒤로 거의 반 바퀴 돌아야 해서, 곧장 가면 주먹이 한 장면 만에 뒤집힌다)
DAGGER_STYLES.stab1b = { ...DAGGER_STYLES.stab1, from: 'stab4',
  keys: [dkey(0.1, [-0.95, 0, 0.1], 0.2, [-0.3, -0.85, -0.4], [-0.4, -1, -0.2]), ...DAGGER_STYLES.stab1.keys] };
const DAGGER_TAIL = 0.2;
function daggerSwing(name) {
  const S = DAGGER_STYLES[name];
  const prev = S.from ? DAGGER_STYLES[S.from] : null;
  // 끝에 평소 자세로 돌아오는 키를 붙인다 (이어 치는 다음 타는 그 앞, 휘두른 끝 자세에서 시작한다)
  const keys = [{ ...(prev ? prev.keys.at(-1) : DAGGER_READY), u: 0 }, ...S.keys, ...(S.back ?? []), { ...DAGGER_READY, u: 0.95 }];
  const rel = 0.7;
  // 돌아오는 부분만 DAGGER_TAIL 초 늘린다: 휘두르는 박자(타격·이어 치기 시각, 초)는 그대로이고,
  // 한 번만 치고 멈출 때 날을 뒤로 눕히며 평소 자세로 돌아오는 길이 급하지 않게 한다
  const D0 = S.duration + (S.tail ?? DAGGER_TAIL);
  const cut = S.keys.at(-1).u; // 휘두른 끝 자세 (여기까지는 원래 빠르기)
  const toU = (sec) => (sec <= S.duration * cut ? sec / S.duration : cut + (1 - cut) * (sec - S.duration * cut) / (D0 - S.duration * cut));
  // 기 모으기(charge): 원래 시각 [at0, at1] 구간을 sec 초만큼 늘려, 그 자세에서 부르르 떨며 버틴다 (몽둥이 강타의 hold 와 같은 연출)
  const C = S.charge;
  const extra = C?.sec ?? 0;
  const ca = C ? C.at[0] * S.duration : 0;
  const cb = C ? C.at[1] * S.duration : 0;
  const unwarp = (s) => (!C || s <= ca ? s : s < cb + extra ? ca + (s - ca) * (cb - ca) / (cb - ca + extra) : s - extra); // 실제 시각 → 원래 시각
  const warp = (s) => (!C || s <= ca ? s : s + extra); // 원래 시각(기 모으기 뒤) → 실제 시각
  const D = D0 + extra;
  const at = (u) => warp(u * S.duration) / D;
  return {
    duration: D, hitAt: at(S.hitAt), equip: 'dagger', rate: 48, trail: [at(S.trailFrom ?? (S.hold ? 0.15 : S.keys[0].u)), at(cut)],
    fn(u0, P, fx) {
      const sec = u0 * D;
      const u = toU(unwarp(sec));
      const back = sm(u, rel, 1);
      const tw = kf(u, ...S.twist) * (1 - back);
      P['spine.ry'] = tw * 0.6;
      P['pelvis.ry'] = tw * 0.4;
      P['head.ry'] = -tw * 0.75;
      crouch(P, S.sink ? kf(u, ...S.sink) : kf(u, [0, prev ? 0.3 : 0.1], [S.hitAt, 0.4, 'in'], [rel, 0.35], [1, 0]));
      wideStance(P, kf(u, [0, prev ? 0.8 : 0], [0.2, 0.9], [rel, 0.9], [1, 0]));
      P['spine.rx'] += S.lean ? kf(u, ...S.lean) : kf(u, [0, 0.05], [S.hitAt, 0.15], [rel, 0.12], [1, 0]) * (1 - back);
      if (S.lean) P['head.rx'] = -kf(u, ...S.lean) * 0.5; // 깊이 숙여도 고개는 들어 앞을 본다
      if (S.hop) P['root.py'] = (P['root.py'] ?? 0) + kf(u, ...S.hop); // 베어 올리며 살짝 뛰어오른다
      if (S.side) { // 상체·머리를 옆으로 기울인다 (팔을 머리 위쪽으로 올릴 자리를 낸다)
        const z = kf(u, ...S.side);
        P['spine.rz'] = (P['spine.rz'] ?? 0) + z;
        P['head.rz'] = z * 0.5;
      }
      // 왼팔: 가슴 앞에 들어 올려 막는 자세 (때릴 때마다 살짝 당긴다)
      const pull = kf(u, [0, 0], [S.hitAt, 1, 'in'], [rel, 0.4], [1, 0]);
      swordLeftArm(P, 0.45 + pull * 0.15, -0.75 + pull * 0.25, -1.5 - pull * 0.2, back);
      // 오른팔의 바탕 자세는 평소 대기 자세 (쥔 손을 놓으면 여기로 녹아든다)
      P['shoulderR.rz'] = -ARM_REST;
      P['shoulderR.rx'] = -0.1;
      P['elbowR.rx'] = -0.08;
      if (S.settle && u >= cut) {
        if (u < 0.99) fx.armSettle = sm(u, cut, 0.99);
      } else if (S.hold && u < cut) {
        // 팔 붙잡기: 한 손 쥐기는 끝 자세를 겨눈 채(다음 동작이 곧장 이어받게) 두고, 실제 팔은 붙잡은 자세에서 팔꿈치·어깨만 움직인다
        const k = S.keys.at(-1);
        fx.oneHand = { arm: unit(k.arm).map((x) => x * k.reach), dir: unit(k.dir), pole: unit(k.pole), body: true };
        fx.armHold = { ext: kf(u, ...S.hold.ext), yaw: kf(u, ...S.hold.yaw) };
      } else {
        // 평소 자세로 돌아온 뒤(0.95)에야 쥔 자리를 놓는다
        const g = swordPath(Math.min(u, 0.95), keys);
        fx.oneHand = { arm: g.pos.map((x, n) => x - SHOULDER_R[n]), dir: g.dir, pole: g.pole, body: true, w: 1 - sm(u, 0.93, 1) };
      }
      if (C) {
        // 기 모으는 동안: 웅크린 몸을 꾹 눌러 낮추고(살짝 납작), 고개를 숙여 앞을 노려본다. 칼끝과 온몸이 잘게 떨린다
        const q = kf(sec, [ca, 0], [ca + 0.04, 1], [cb + extra - 0.02, 1], [cb + extra, 0]);
        if (q > 0) {
          P['root.sy'] = (P['root.sy'] ?? 0) - 0.04 * q;
          P['head.rx'] += 0.1 * q;
          P['spine.rz'] = (P['spine.rz'] ?? 0) + Math.sin(sec * 80) * 0.025 * q;
          if (fx.oneHand) {
            const tr = Math.sin(sec * 95) * 0.05 * q;
            const d = fx.oneHand.dir;
            fx.oneHand = { ...fx.oneHand, dir: unit([d[0] + tr, d[1] - tr * 0.5, d[2] + tr * 0.6]) };
          }
        }
      }
      fx.carry = true; // 주먹 속 단검 각도(역수)는 휘두르는 동안에도 그대로
    },
  };
}

// 나무 단검 공중·대시 공격의 키 자세
// 점프 공격 (v: 휘두르기 시작부터, 0.5 = 타격): 오른쪽 위로 당겼다가 팔꿈치를 접으며 왼쪽 앞 아래로 대각선으로 벤다.
// 1타처럼 주먹이 앞장서고 날은 뒤로 끌린다. 벤 뒤에는 1타처럼 어깨·팔꿈치·손목을 함께 옮겨 평소 팔 자세로 내린다 (settleArm)
// (오른쪽 옆 뒤로 길게 당겼다가, 팔꿈치를 깊이 접으며 왼쪽 옆구리 앞까지 밀어 넣어 베는 길을 늘린다)
const DAGGER_AIR_KEYS = [{ ...DAGGER_READY, u: 0 }, dkey(0.25, [-0.65, 0.25, -0.65], 0.19, [-0.1, 0.5, -0.85], [-0.4, -1, -0.4]), // 당길 때 팔꿈치를 살짝 굽혀 둔다 (다 펴 두면 벨 때 접히는 쪽을 못 정해 팔이 튄다)
  dkey(0.38, [-0.9, -0.05, 0.35], 0.17, [-0.45, 0.35, -0.82], [-0.6, -0.8, -0.1]), // 오른쪽 옆을 지나간다 (등 뒤에서 몸 앞으로 곧장 가면 팔이 어느 쪽으로 돌지 못 정해 튄다)
  dkey(0.5, [0, -0.25, 1], 0.125, [-0.75, 0.35, 0.55], [-1, -0.3, 0], 'in'), dkey(0.63, [0.65, -0.35, 0.7], 0.09, [-0.5, 0.25, 0.8], [-0.9, -0.3, 0.35]), // 팔꿈치를 안쪽으로 접은 채 감아 벤다
  dkey(0.72, [0.95, -0.35, 0.15], 0.085, [-0.15, 0.2, 0.97], [-0.5, -0.2, 0.85]),
  dkey(0.8, [0.8, -0.35, -0.4], 0.08, [0.45, 0.2, 0.87], [-0.1, -0.2, 0.97], 'out')]; // 왼쪽 어깨 뒤쪽까지 밀어 넣는다
// 대시 공격 (u: 진행도, 0.6 = 타격): 몸을 숙여 달려드는 동안 단검을 허리 뒤로 낮게 빼 두었다가, 오른쪽 옆으로 당겨 1타처럼 벤다.
// 팔꿈치를 안쪽으로 접으며 가슴 높이 가운데를 감아 주먹을 왼쪽 어깨 앞까지 밀어 넣고, 날은 주먹 뒤로 끌린다.
// 몸을 숙인 만큼 어깨가 내려가므로 팔은 1타보다 조금 위로 뻗는다 (그대로 두면 발밑을 베는 것처럼 낮다)
const DAGGER_DASH_KEYS = [{ ...DAGGER_READY, u: 0 }, dkey(0.25, [-0.5, -0.75, -0.45], 0.19, [-0.2, 0.35, -0.9], [-0.3, 0, -1]),
  dkey(0.45, [-0.6, 0.15, -0.75], 0.215, [0.1, 0.25, -0.97], [-0.3, -1, -0.4]),
  dkey(0.6, [-0.1, 0.2, 1], 0.13, [-0.9, -0.1, 0.4], [-1, -0.3, 0], 'in'), // 팔꿈치를 안쪽으로 접은 채 감아 벤다
  dkey(0.69, [0.65, 0.2, 0.72], 0.09, [-0.55, -0.1, 0.8], [-0.9, -0.2, 0.4]),
  dkey(0.74, [0.95, 0.2, 0.2], 0.085, [-0.15, -0.1, 0.97], [-0.5, -0.2, 0.85]),
  dkey(0.79, [0.9, 0.22, -0.2], 0.08, [0.25, -0.1, 0.95], [-0.2, -0.2, 0.95]),
  dkey(0.84, [0.7, 0.22, -0.6], 0.08, [0.55, -0.1, 0.83], [0, -0.2, 1], 'out')]; // 왼쪽 어깨 뒤쪽까지 밀어 넣는다
// 더블 점프 공격: 누르면 먼저 DIVE.raise 초 동안 공중에서 팔을 오른쪽 위 대각선으로 치켜들고,
// 이어서 DIVE.time 초 동안 앞 아래로 빠르게 내려가며 같은 대각선을 따라 왼쪽 앞 아래로 내려찍는다. 착지해 버틴다
// 단검 대시 공격(1·2타) 재생 빠르기: 동작 안의 시각(초)은 그대로 두고 이 배만큼 빠르게 재생한다 (게임 쪽 시점·달려드는 빠르기도 이것으로 맞춘다)
export const DASH_RATE = 1.2;
// from: 공중제비가 이만큼(초) 돈 뒤에 시작한다 (더 일찍 누르면 기다렸다가)
// rate: 치켜든 뒤의 동작(내려가며 찍기·착지 뒤)을 이 배만큼 빠르게 재생한다 (치켜들기는 원래 빠르기: 공중제비를 너무 빨리 마저 돌면 팔이 튄다)
export const DIVE = { raise: 0.18, time: 0.2, from: 0.3, rate: 1.2 };

// ── 잠자리채 휘두르기: 오른 어깨 뒤로 채를 젖혔다가, 팔을 쭉 뻗은 채 오른쪽 → 앞 → 왼쪽으로 크게 쓸어 담는다 ──
// level: 0 가슴 높이로 오른쪽 위에서 앞 아래로 덮기, 1 머리 위로 높이 쓸기(나는 곤충), -1 쪼그려 앉으며 발 앞을 위에서 덮기(땅·꽃 곤충)
// 그물 테가 실제로 지나간 자리에 곤충이 있어야 잡힌다 (character.js 가 그 길을 모아 main.js 가 서버로 보낸다)
const NET_LEAD = 50 * PI / 180;
function netSweep(level) {
  const y = [-0.3, -0.08, 1.1][level + 1];
  // 젖히는 쪽: 가슴·발 앞은 오른쪽 위로 치켜들었다가 앞 아래로 덮듯이 내리고(위에서 아래로 잡는 느낌), 머리 위는 옆으로 쓴다
  const up = level > 0 ? [-1, 0.25, -0.1] : [-0.62, 0.78, -0.12];
  const plane = slashPlane([0.05, y, 1 - Math.abs(y) * 0.3], up, [-0.4, -1, 0.1], NET_LEAD);
  // 들고 있던 자세 → 오른쪽 뒤로 젖힘 → 앞을 지나 왼쪽까지 고르게 크게 쓸기(테 입구가 나아가는 쪽을 향함) → 멈추지 않고 쥔 자리를 서서히 놓아 들고 다니는 자세로.
  // 쓰는 구간을 몰아서 빠르게 하면 휙 사라지고, 끝에서 멈췄다 놓으면 툭 끊겨 보인다
  const keys = [{ ...SWORD_READY, u: 0 }, plane(0.3, 110, 0.17), plane(0.48, 0, REACH), { ...plane(0.64, level < 0 ? -25 : -50, REACH * 0.97, 'out'), pole: [-0.5, -1, -0.4] }];
  const low = level < 0 ? 1 : 0;
  return {
    duration: 1.1, hitAt: 0.64, equip: 'net', rate: 32, trail: [0.3, 0.64],
    fn(u, P, fx) {
      const tw = kf(u, [0, 0], [0.3, -0.95], [0.47, 0.15, 'in'], [0.64, 0.85, 'out'], [1, 0]);
      P['spine.ry'] = tw * 0.6;
      P['pelvis.ry'] = tw * 0.4;
      P['head.ry'] = -tw * 0.5; // 눈은 채가 지나가는 앞쪽을
      // 쓸 때는 곤충 높이를 본다
      P['head.rx'] = (low * 0.35 - (level > 0 ? 0.25 : 0)) * kf(u, [0, 0], [0.3, 1], [0.64, 1], [1, 0]);
      crouch(P, kf(u, [0, 0.05], [0.3, 0.2 + low * 0.5], [0.47, 0.35 + low * 0.75, 'in'], [0.64, 0.3 + low * 0.6], [1, 0]));
      wideStance(P, kf(u, [0, 0], [0.3, 0.8], [0.64, 0.8], [1, 0]));
      P['spine.rx'] += kf(u, [0, 0], [0.3, -0.1], [0.47, 0.18 + low * 0.3], [0.64, 0.2 + low * 0.25], [1, 0]);
      // 왼손(채집통): 채와 반대쪽으로 벌려 균형을 잡는다. 몸은 손을 놓는 박자(0.66 → 1)에 맞춰 함께 천천히 풀린다
      P['shoulderL.rz'] = kf(u, [0, ARM_REST], [0.3, 0.9], [0.47, 0.7], [0.64, 0.45], [1, ARM_REST]);
      P['shoulderL.rx'] = kf(u, [0, 0], [0.3, -0.35], [0.64, 0.1], [1, 0]);
      P['elbowL.rx'] = kf(u, [0, -0.08], [0.3, -0.5], [0.64, -0.4], [1, -0.08]);
      const g = swordPath(Math.min(u, 0.64), keys);
      // 다 쓴 뒤에는 쓸어 온 길을 되짚지 않고, 쥔 자리를 서서히 놓아 평소 들고 다니는 자세로 녹아들게 한다
      fx.oneHand = { arm: g.pos.map((x, n) => x - SHOULDER_R[n]), dir: g.dir, pole: g.pole, body: true, w: 1 - sm(u, 0.66, 1) };
      fx.carry = true;
    },
  };
}

// 목검 공중·대시 공격에서 쓰는 도우미: 키 자세 경로의 v 지점으로 오른손을 쥐게 한다 (몸이 서 있는 방향 기준)
// tilt: 손 안의 칼을 앞으로 기울여 쥐는 정도 (팔과 칼 사이를 좁게 벌린 베기에서 손목을 덜 꺾게)
// wrist: 손목을 꺾는 한계 (작게 주면 손목을 편 채 어깨·팔꿈치로만 칼 방향을 맞춘다)
// (손목을 펴 둘 때는 팔꿈치를 정해 둔 쪽에 고정한다(fixPole): 매 장면 팔꿈치 자리를 고르면 두 자리 사이를 갑자기 오가며 튄다)
function swordAim(fx, keys, v, tilt = 0, wrist = null) {
  const g = swordPath(Math.min(v, keys.at(-1).u), keys);
  fx.oneHand = { arm: g.pos.map((x, n) => x - SHOULDER_R[n]), dir: g.dir, pole: g.pole, body: true };
  if (tilt) fx.oneHand.tilt = tilt;
  if (wrist != null) { fx.oneHand.wrist = wrist; fx.oneHand.fixPole = true; }
}
// 왼팔: 칼과 반대쪽으로 벌려 균형을 잡고 팔꿈치를 굽힌다 (값은 0 → 1 로 풀어 평소 자세로)
function swordLeftArm(P, rz, rx, elbow, back = 0) {
  P['shoulderL.rz'] = rz * (1 - back) + ARM_REST * back;
  P['shoulderL.rx'] = rx * (1 - back);
  P['elbowL.rx'] = elbow * (1 - back) - 0.08 * back;
}
// 목검 공중·대시 공격의 베기 면 (slashPlane: 타격 방향, 젖힌 쪽, 팔꿈치 굽는 쪽)
// 점프 공격: 오른쪽 뒤에서 앞을 지나 왼쪽 앞 아래로 가로로 크게 / 대시 공격: 허리 높이에서 오른쪽 → 왼쪽으로 가로 베기
// 더블 점프 공격: 머리 위 뒤로 치켜든 칼을 착지하며 앞 아래로 곧게 내려베기
// 이 셋은 칼과 팔 사이를 좁게(30도) 벌려, 젖힐 때 팔을 뒤로 길게 뻗고 칼이 팔을 따라 크게 돈다
// (66도로 벌리면 칼을 뒤로 보내려고 팔꿈치를 몸 앞에서 접게 되어, 칼을 등 뒤로 감아 쥔 단검처럼 보인다).
// 대신 손 안의 칼을 앞으로 기울여 쥐어(SWING_TILT) 손목을 덜 꺾는다
const SWING_LEAD = 30 * PI / 180;
const SWING_TILT = 1.0;
// 공중·내려베기·대시 공격의 손 안 칼 각도 키 (점프·대시: 휘두르기 진행 v·u, 내려베기: 착지 때로부터 초).
// 휘두르는 동안 서서히 기울여 쥐었다가 놓기 전에 서서히 되돌린다. 손목은 동작에 맞게 어느 정도 꺾인다
// (SWING_TILT 를 넘기면 칼이 손 안에서 90도 가까이 돌아 거꾸로 쥔 것처럼 보인다)
const SWORD_TILTS = {
  air: [[0, 0], [0.3, SWING_TILT], [1.0, SWING_TILT], [1.45, 0]],
  slam: [[-0.43, 0], [-0.12, SWING_TILT], [0.35, SWING_TILT], [0.6, 0]],
  dash: [[0, 0], [0.3, SWING_TILT], [0.78, SWING_TILT], [0.97, 0]],
};
const PLANE_AIR = slashPlane([0.15, -0.25, 1], [-1, 0.3, -0.2], [-0.2, -1, 0], SWING_LEAD);
// 대시 공격은 손목을 꺾지 않는다: 칼을 앞으로 기울여 쥔(SWING_TILT) 주먹에서 칼은 아래팔과 62도쯤 벌어지므로,
// 팔이 칼보다 그만큼 앞서 돌게 해 어깨·팔꿈치 각도만으로 칼 방향을 맞춘다
const DASH_LEAD = 62 * PI / 180;
const PLANE_DASH = slashPlane([0.25, -0.15, 1], [-1, 0.15, -0.25], [-0.2, -1, 0], DASH_LEAD);
const PLANE_SLAM = slashPlane([0.1, -0.4, 0.9], [-0.4, 0.9, -0.1], [-1, -0.4, 0], SWING_LEAD);
const SWORD_READY_KEY = { ...SWORD_READY, u: 0 };
// 평소 들고 다니는 자세와 가까운 끝 자세: 팔은 아래로 내려 살짝만 굽히고(팔꿈치는 뒤 아래), 칼은 앞 위로
const SWORD_REST = { arm: [-0.05, -0.9, 0.42], reach: 0.19, dir: [-0.1, 0.55, 0.83], pole: [-0.3, -0.5, -1] };
// 점프 공격 키 (v: 휘두르기 시작부터, 0.5 = 타격) · 대시 공격 키 (u: 진행도, 0.48 = 타격)
// (점프 공격은 베고 난 뒤 칼을 몸 앞으로 돌려 평소 자세까지 데려온 다음 손을 놓는다: 그냥 놓으면 왼쪽으로 넘어간 팔이 가슴을 가로질러 돌아온다)
const SWORD_AIR_KEYS = [SWORD_READY_KEY, PLANE_AIR(0.3, 130, 0.2), PLANE_AIR(0.5, 0, REACH, 'in'), PLANE_AIR(0.85, -35, REACH, 'out'), PLANE_AIR(1.0, -35, REACH),
  { ...SWORD_READY, u: 1.45 }];
// 더블 점프 내려베기 키 (u: 발이 땅에 닿는 때로부터 초): 치켜들기 → 착지하며 내려베기 → 조금 더 내려가 멈춤
const SWORD_SLAM_KEYS = [PLANE_SLAM(-0.12, 140, 0.2), PLANE_SLAM(0.02, 0, REACH, 'in'), PLANE_SLAM(0.16, -25, REACH, 'out'), PLANE_SLAM(0.35, -25, REACH)];
const SWORD_DASH_KEYS = [SWORD_READY_KEY, PLANE_DASH(0.3, 150, 0.212), // 당길 때 팔을 오른쪽 뒤로 길게 뻗는다 (팔꿈치를 덜 접는다)
  PLANE_DASH(0.48, 10, REACH, 'in'), PLANE_DASH(0.66, -15, REACH, 'out'), PLANE_DASH(0.78, -15, REACH),
  { ...SWORD_REST, u: 1 }]; // 평소 들고 다니는 자세로 곧장 돌아간다 (가슴 높이 준비 자세를 거치면 손을 놓을 때 주먹이 크게 돌아 꼬인다)

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
  // dips: 젖힘과 타격 사이에 거쳐 가는 자세들 (타격 뒤 곡선도 마지막 것에서 이어지는 방향으로)
  const DIPS = (S.dips ?? []).map((d) => ({ pos: d.pos, dir: unit(d.dir) }));
  const preP = DIPS.length ? DIPS.at(-1).pos : S.posBack;
  const preD = DIPS.length ? DIPS.at(-1).dir : BACK;
  const sweep = (q) => (q <= 1
    ? { pos: curve(S.posBack, S.posBack, S.posHit, S.posEnd, q), dir: unit(curve(BACK, BACK, HIT, END, q)) }
    : { pos: curve(preP, S.posHit, S.posEnd, S.posEnd, q - 1), dir: unit(curve(preD, HIT, END, END, q - 1)) });
  const wide = S.stance ?? 0;
  const ws = prev ? (prev.stance ?? 0) : 0;
  // 이어 치는 동작은 몸(허리 비틀기·숙임·무릎)도 앞 동작이 끝난 자세에서 시작한다: 0에서 시작하면 넘어가는 순간 몸이 홱 풀렸다 다시 감긴다
  const VIA = S.via ? unit(S.via.dir) : null;
  const tws = prev ? prev.twist[2] : 0;
  const hp = S.hips ?? 0.4; // 골반이 도는 몫
  const coil = S.coil ?? hp;
  const hps = prev ? prev.hips ?? 0.4 : 0.4;
  const lns = prev ? prev.lean[2] : 0;
  const cs = prev ? (prev.crouch ?? 0.5) * 0.9 : 0;
  return {
    duration: S.duration ?? 0.72, hitAt: S.hitAt ?? 0.5, equip: S.equip ?? 'club', rate: 36, trail: [0.42, 0.68],
    fn(u0, P, fx) {
      // 기 모으기(hold): 동작 시간을 늘려 감아 든 꼭대기(원래 시각 0.34~0.37)에서 몸 전체가 감긴 채 멈춰 있게 한다.
      // 그 앞은 조금 빨리 감고, 그 뒤는 원래 시각 0.37 → 타격 0.5 를 그대로 단숨에 휘두른다
      const u = S.hold ? kf(u0, [0, 0], [S.hold[0], 0.34, 'lin'], [S.hold[1], 0.37, 'lin'], [0.5, 0.5, 'lin'], [1, 1, 'lin']) : u0;
      twoHand(P, fx, u < (S.twoTo ?? 0.7));
      // 되튐은 작고 느리게: 크게 떨면 내리친 뒤 몸 전체가 덜컥거린다
      const shake = u > 0.5 ? Math.sin((u - 0.5) * 40) * Math.exp(-(u - 0.5) * 16) * (S.power ? 1.1 : 0.5) : 0;
      crouch(P, kf(u, [0, cs], [0.3, 0.15], [0.42, 0.1], [0.5, deep * 0.8, 'in'], [0.62, deep, 'out'], [0.82, deep * 0.6], [1, 0]));
      // 준비 → 젖힘까지 한 번(back), 젖힌 데서 타격을 지나 관성까지는 같은 원호 위를 한 번에(swing: 0 → 타격 1 → 관성) 간다.
      // 타격에서 다른 원호로 갈아타면 가장 빠른 순간에 방향이 꺾여 덜컥거린다
      const back = kf(u, [0, 0], [0.4, 1]);
      // dips 가 있는 강타는 타격 직전이 가장 빨라서, 타격 뒤도 그 빠르기를 이어받아 짧게 넘긴다 (길게 늘이면 맞자마자 벽에 막힌 듯 느려진다)
      const swing = kf(u, [0.4, 0], [0.5, 1, 'in'], [S.dips ? 0.62 : 0.68, END ? 2 : over, 'out']);
      const after = (q) => (END ? sweep(q) : { pos: mix(S.posBack, S.posHit, q), dir: slerpDir(BACK, HIT, q) });
      if (S.via) {
        // 이어 치기: 시작 → 거쳐 가는 자세 → 젖힘 → 타격을 한 줄의 부드러운 곡선으로 잇고, 멈추지 않고 점점 빨라지며 지나간다
        // (젖힌 꼭대기에서도 속도가 남아 있어 채찍처럼 이어진다). 타격 뒤는 같은 방향으로 조금 더 나가며 느려진다
        // charge: 젖힌 자세(p = 2) 바로 앞까지 점점 느려지며 올라가 꼭대기에서 아주 천천히 마저 감기다가, 거기서 단숨에 휘두른다
        // dips: 젖힘(p = 2) → 몸 뒤로 끌려옴(3) → 끝이 땅을 향함(4) → 타격(5). 점점 빨라져 타격 직전 구간이 가장 빠르다
        // (구간 끝마다 빠르기가 거의 같아 멈칫하지 않는다)
        const p = DIPS.length ? kf(u, [0, 0], [0.26, 1.9, 'out'], [0.35, 2.04], [0.44, 3, 'in'], [0.475, 4, 'lin'], [0.5, 5, 'lin'])
          : S.charge ? kf(u, [0, 0], [0.26, 1.9, 'out'], [0.35, 2.04], [0.5, 3, 'in'])
          : u < 0.5 ? 3 * (u / 0.5) ** 2.2 : 3;
        const posPts = [startPos, S.via.pos, S.posBack, ...DIPS.map((d) => d.pos), S.posHit, ...(END ? [S.posEnd] : [])];
        const dirPts = [startDir, VIA, BACK, ...DIPS.map((d) => d.dir), HIT, ...(END ? [END] : [])];
        const last = 2 + DIPS.length; // 마지막으로 쓰는 구간 (타격까지)
        const i = Math.min(last, Math.floor(p));
        const t = p - i;
        const at = (pts) => curve(pts[Math.max(0, i - 1)], pts[i], pts[i + 1], pts[Math.min(pts.length - 1, i + 2)], t);
        fx.grip = u < 0.5 ? { pos: at(posPts), dir: unit(at(dirPts)) } : after(swing);
        if (S.settle) {
          // 끝 자세에서 굳지 않게: 넘긴 몽둥이가 두 손에 쥐인 채 조금 더 감아 돌며 천천히 멈춘다 (두 손을 놓는 때 twoTo 에 멈춤)
          const w = kf(u, [0.56, 0], [S.twoTo ?? 0.7, 1, 'out']);
          if (w > 0) fx.grip = { pos: mix(fx.grip.pos, S.settle.pos, w), dir: slerpDir(unit(fx.grip.dir), unit(S.settle.dir), w) };
        }
      } else if (S.side) {
        // 준비 자세 → 오른쪽 옆으로 눕힘 → 어깨 너머로 젖힘 (머리 위를 지나지 않게)
        fx.grip = u < 0.4 ? gripPath(u, [0, startPos, startDir], [0.2, ...CLUB_SIDE], [0.4, S.posBack, S.back]) : after(swing);
      } else {
        fx.grip = u < 0.4
          ? { pos: mix(startPos, S.posBack, back), dir: slerpDir(startDir, BACK, back) }
          : after(swing);
      }
      if (S.hold) {
        // 기 모으기: 꼭대기에서 몽둥이 끝이 잘게 떨리고, 몸을 꾹 눌러 낮추며 숨을 들이쉬듯 어깨가 살짝 솟는다
        const q = kf(u0, [S.hold[0] - 0.03, 0], [S.hold[0] + 0.02, 1], [S.hold[1], 1], [S.hold[1] + 0.03, 0]);
        const tr = Math.sin(u0 * S.duration * 95) * 0.035 * q;
        fx.grip = { ...fx.grip, dir: unit([fx.grip.dir[0] + tr, fx.grip.dir[1], fx.grip.dir[2] - tr * 0.6]) };
      }
      if (S.elbowDown) {
        // 팔꿈치 방향: 기본(바깥 옆) → 아래 → 휘두르며 다시 기본으로. 방향만 부드럽게 바꿔 팔이 튀지 않게 한다
        const d = kf(u, [0.1, 0], [0.28, 1], [0.44, 1], [0.52, 0]);
        fx.grip = { ...fx.grip, pole: { R: mix([-1, 0, 0.2], [-0.85, -0.5, 0.15], d) } };
      }
      // 다리를 넓게 벌려 선다: 휘두르는 동안 버티고, 돌아올 때 모은다 (발바닥은 땅과 나란히)
      wideStance(P, kf(u, [0, ws], [0.3, wide], [0.7, wide], [1, 0]));
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
      P['pelvis.ry'] = kf(u, [0, tws * hps], [0.36, tw0 * coil], [0.47, tw1 * hp * 1.75, 'in'], [0.62, tw2 * hp, 'out'], [1, 0]);
      P['spine.ry'] = kf(u, [0, tws], [0.4, tw0 * (1 + hp - coil)], [0.495, tw1, 'in'], [0.66, tw2, 'out'], [0.86, tw2 * 0.5], [1, 0]);
      P['spine.rx'] += kf(u, [0, lns], [0.4, ln0], [0.5, ln1, 'in'], [0.66, ln2, 'out'], [0.86, ln2 * 0.45], [1, 0]) + shake * 0.05;
      P['spine.rz'] = kf(u, [0, 0], [0.4, tw0 * 0.11], [0.52, -tw0 * 0.08], [1, 0]); // 감는 쪽 어깨가 살짝 내려간다
      P['head.rx'] = kf(u, [0, 0], [0.42, ln0 * 0.45], [0.53, ln1 * 0.33], [1, 0]) - shake * 0.05;
      // 몸을 틀어도 눈은 앞을: 골반 + 허리가 돈 만큼 고개를 되돌린다 (골반 몫이 큰 3타는 그만큼 더 되돌린다)
      const look = (h) => 0.76 + (h - 0.4) * 0.6;
      P['head.ry'] = kf(u, [0, -tws * look(hps)], [0.4, -tw0 * (look(hp) + 0.21)], [0.52, -tw1 * (look(hp) + 0.04)], [0.68, -tw2 * look(hp)], [1, 0]);
      P['hipL.rx'] -= kf(u, [0, 0], [0.42, 0.3], [0.62, 0.2], [1, 0]);
      if (S.kick) {
        // 야구 스윙의 다리: 젖히는 동안 앞다리(왼다리) 무릎을 들어 올려 몸을 뒷다리에 실었다가, 타격 직전에 앞으로 내딛으며 휘두른다
        // (발바닥은 땅과 나란히 두고 발끝만 살짝 늘어뜨린다). 휘두르는 동안 뒷다리(오른다리)는 무릎을 더 굽혀 몸을 밀어 돌린다
        // 무릎은 허리 높이까지 높이 들고, 들어 올리는 동안 몸을 위로 쭉 늘였다가 내딛는 순간 꾹 눌러 앉는다
        // plant: 앞발을 다 내디디는 때 (강타는 내리치기 전에 먼저 딛는다: 무릎을 든 채 휘두르면 어색하다)
        const plant = S.plant ?? 0.49;
        const lift = kf(u, [0.08, 0], [0.3, 1], [Math.min(0.4, plant - 0.07), 1], [plant, 0, 'in']) * S.kick;
        P['hipL.rx'] -= 1.45 * lift;
        P['kneeL.rx'] += 1.8 * lift;
        P['footL.rx'] -= 0.2 * lift;
        P['hipL.rz'] -= 0.18 * lift; // 든 무릎을 몸 안쪽으로 살짝 모은다 (감는 허리와 함께 몸이 꼬인다)
        // 버티는 뒷다리도 무릎을 굽혀 몸을 싣고 (발바닥은 땅과 나란히), 굽힌 만큼 몸을 낮춰 발이 뜨지 않게 한다
        P['hipR.rx'] -= 0.4 * lift;
        P['kneeR.rx'] += 0.75 * lift;
        P['footR.rx'] -= 0.35 * lift;
        P['pelvis.py'] -= 0.02 * lift;
        // 휘두르는 동안 뒷다리는 무릎을 앞으로 밀어 넣어 몸을 돌리고(발끝으로 비틀어 딛는다), 앞다리는 쭉 펴서 버틴다
        const drive = kf(u, [0.44, 0], [0.54, 1], [0.72, 1], [1, 0]) * S.kick;
        P['hipR.rx'] -= 0.3 * drive;
        P['kneeR.rx'] += 0.6 * drive;
        P['footR.rx'] += 0.25 * drive;
        // 끝 자세: 다 휘두른 뒤 뒷다리 무릎을 땅 쪽으로 깊이 꺾어 앞다리 쪽으로 모으고 발끝으로 선다 (몸이 휘둘린 힘에 끌려가는 느낌)
        const finish = kf(u, [0.5, 0], [0.64, 1, 'out'], [0.8, 1], [1, 0]) * S.kick;
        P['hipR.rx'] -= 0.25 * finish;
        P['kneeR.rx'] += 0.75 * finish;
        P['hipR.rz'] += 0.14 * finish;
        P['footR.rx'] += 0.35 * finish;
        // 뒷다리를 꺾은 만큼 발이 뜨지 않게 몸을 낮추고, 버티던 앞다리도 살짝 굽혀 받는다
        P['pelvis.py'] -= 0.015 * finish;
        P['hipL.rx'] -= 0.4 * finish;
        P['kneeL.rx'] += 0.75 * finish;
        P['footL.rx'] -= 0.35 * finish;
        const brace = kf(u, [0.47, 0], [0.56, 1], [0.74, 1], [1, 0]) * S.kick;
        P['hipL.rx'] += 0.25 * brace;
        P['kneeL.rx'] -= 0.45 * brace;
        P['footL.rx'] += 0.2 * brace;
        // 골반이 크게 도는 만큼 다리는 엉덩이에서 일부 되돌려, 발이 땅 위에서 통째로 돌지 않고 무릎만 몸을 따라 돌게 한다
        // 감는 동안은 뒷다리도 되돌리는 몫을 줄여 무릎이 몸과 함께 안쪽으로 돈다 (한쪽 다리만 돌면 어색하다)
        // 들어 올린 앞다리는 되돌리지 않는다: 허벅지가 수평이면 이 회전이 허벅지를 비틀어 무릎이 옆·반대로 굽는다
        P['hipL.ry'] = -P['pelvis.ry'] * 0.55 * (1 - lift);
        P['hipR.ry'] = -P['pelvis.ry'] * (0.55 - 0.35 * lift);
        P['root.sy'] = kf(u, [0.1, 0], [0.34, 0.04], [0.44, 0.03], [0.53, -0.08, 'in'], [0.66, -0.02], [0.8, 0]);
        if (S.reach) {
          const r = kf(u, [0.42, 0], [0.5, 1], [0.6, 1], [0.7, 0]);
          P['shoulderR.pz'] = S.reach[0] * r;
          P['shoulderL.pz'] = S.reach[1] * r;
        }
      } else {
        P['root.sy'] = kf(u, [0.2, 0], [0.42, 0.04], [0.53, -0.05], [0.78, 0]);
      }
      if (S.hold) {
        // 기 모으는 동안: 몸을 꾹 웅크려 힘을 누르고(살짝 납작), 고개를 숙여 앞을 노려본다. 온몸이 잘게 떨린다
        const q = kf(u0, [S.hold[0] - 0.03, 0], [S.hold[0] + 0.02, 1], [S.hold[1], 1], [S.hold[1] + 0.03, 0]);
        P['root.sy'] -= 0.035 * q;
        P['head.rx'] += 0.1 * q;
        P['spine.rz'] += Math.sin(u0 * S.duration * 80) * 0.02 * q;
      }
    },
  };
}

const AXE_BACK = { pos: [-0.05, 0.19, 0.1], dir: [-0.4, 0.86, -0.3] }; // 오른 어깨 옆에 세워 든 자세
const AXE_STUCK = { pos: [-0.035, 0.14, 0.14], dir: [-0.3, 0.1, 0.95] }; // 나무에 박힌 자세: 가슴 높이에서 앞으로
function axeChop(again) {
  const T = again ? { dur: 0.8, back: 0.36, hit: 0.5 } : { dur: 1.0, back: 0.4, hit: 0.5 };
  const HOLD = 0.82; // 여기까지 두 손으로 박힌 도끼를 쥐고 있다 (계속 누르고 있으면 그 전에 다음 도끼질로 넘어간다)
  const s0 = again ? 1 : 0; // 이어 찍기는 몸도 박힌 자세에서 시작한다
  return {
    duration: T.dur, hitAt: T.hit, equip: 'axe', rate: 36, trail: [T.back + 0.02, T.hit + 0.01],
    fn(u, P, fx) {
      twoHand(P, fx, u < HOLD);
      // 박힌 뒤의 떨림: 금방 잦아든다
      const since = (u - T.hit) * T.dur;
      const shake = since > 0 ? Math.sin(since * 60) * Math.exp(-since * 11) : 0;
      const g = again
        ? gripPath(u, [0, AXE_STUCK.pos, AXE_STUCK.dir], [0.1, [-0.04, 0.14, 0.125], [-0.36, 0.14, 0.92]], // 살짝 비틀어 뽑는다
          [T.back, AXE_BACK.pos, AXE_BACK.dir], [T.hit, AXE_STUCK.pos, AXE_STUCK.dir, 'in'], [1, AXE_STUCK.pos, AXE_STUCK.dir])
        : gripPath(u, [0, CLUB_READY_POS, CLUB_READY], [T.back, AXE_BACK.pos, AXE_BACK.dir], [T.hit, AXE_STUCK.pos, AXE_STUCK.dir, 'in'], [1, AXE_STUCK.pos, AXE_STUCK.dir]);
      fx.grip = { pos: g.pos, dir: unit([g.dir[0] + shake * 0.05, g.dir[1] + shake * 0.07, g.dir[2]]) };
      crouch(P, kf(u, [0, 0.28 * s0], [T.back, 0.1], [T.hit, 0.3, 'in'], [HOLD, 0.28], [1, 0]));
      // 허리를 오른쪽으로 감았다가 풀며 찍고, 박힌 자리에서 멈춘다 (지나쳐 돌아가지 않는다)
      const tw = kf(u, [0, 0.3 * s0], [T.back, -0.85], [T.hit, 0.3, 'in'], [HOLD, 0.3], [1, 0]);
      P['pelvis.ry'] = tw * 0.4;
      P['spine.ry'] = tw + shake * 0.03;
      P['spine.rx'] += kf(u, [0, 0.08 * s0], [T.back, -0.1], [T.hit, 0.08, 'in'], [HOLD, 0.08], [1, 0]) + shake * 0.03;
      P['spine.rz'] = kf(u, [0, 0], [T.back, -0.09], [T.hit, 0.05], [1, 0]);
      P['head.ry'] = -tw * 0.85; // 몸을 틀어도 눈은 나무에
      P['head.rx'] = -shake * 0.04;
      P['hipL.rx'] -= kf(u, [0, 0.2 * s0], [T.back, 0.3], [HOLD, 0.2], [1, 0]);
      wideStance(P, kf(u, [0, s0], [0.25, 1], [HOLD, 1], [1, 0]));
      armsDown(P, kf(u, [HOLD - 0.1, 0], [1, 1]));
    },
  };
}

// 낚시 3단계 (연속 시퀀스에서도 같은 함수를 재사용)
const ROD_POS = [-0.03, 0.13, 0.125];
const fishCast = (u, P, fx) => {
  twoHand(P, fx);
  fx.grip = gripPath(u,
    [0, ROD_POS, [0, 0.55, 0.83]],
    [0.18, ROD_POS, [0, 0.6, 0.8]],
    [0.42, [-0.05, 0.19, 0.1], [-0.3, 0.85, -0.43]],
    [0.6, [-0.03, 0.13, 0.14], [0, 0.25, 0.97], 'in'],
    [0.74, [-0.03, 0.13, 0.13], [0, 0.5, 0.87], 'out'],
    [1, ROD_POS, [0, 0.42, 0.9]]);
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
  // 낚싯대 끝이 느긋하게 오르내리다 가끔 까딱
  fx.grip = { pos: ROD_POS, dir: unit([0, 0.42 + Math.sin(t * 1.4) * 0.03 + Math.max(0, Math.sin(t * 3.1)) ** 6 * 0.07, 0.9]) };
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
  fx.dip = BOBBER.dip;
};
const fishCatch = (u, P, fx) => {
  // 움찔 숙였다가 낚아채며 뒤로 젖히고 폴짝, 낚싯대를 번쩍 든 채 기뻐서 한 번 더 통통
  twoHand(P, fx, u < 0.85);
  fx.grip = gripPath(u,
    [0, ROD_POS, [0, 0.42, 0.9]],
    [0.12, [-0.03, 0.12, 0.13], [0, 0.25, 0.97]],
    [0.3, [-0.04, 0.19, 0.11], [-0.1, 0.95, -0.3]],
    [0.85, [-0.04, 0.19, 0.11], [-0.1, 0.97, -0.15]]);
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
  // 잠자리채 휘두르기: 채를 머리 위로 높이 들었다가(예비 동작) 한 발 내딛으며 앞쪽 아래로 크게 덮어씌우고(0.5),
  // 잠깐 누른 채 있다가 채를 들어 올리며 제자리로. 왼손 채집통은 몸 옆에서 조금 따라 흔들린다
  netSwing: netSweep(0), netHigh: netSweep(1), netLow: netSweep(-1),
  // 과일 줍기: 쪼그려 앉아 오른손으로 발 앞의 과일을 집고 → 일어나며 배 앞에서 한 번 내려다보고 (입 쪽으로 올리면 먹는 것처럼 보여서) →
  // 오른쪽 허리 주머니에 쏙 넣고 톡톡 두드린 뒤 제자리로
  pocket: {
    duration: 1.7, hitAt: 0.3,
    fn(u, P) {
      crouch(P, kf(u, [0, 0], [0.24, 1.2], [0.34, 1.15], [0.5, 0]));
      P['spine.rx'] += kf(u, [0, 0], [0.24, 0.08], [0.34, 0.06], [0.5, 0]);
      P['pelvis.pz'] = kf(u, [0, 0], [0.24, -0.03], [0.5, 0]);
      // 오른팔: 아래로 뻗어 집기 → 가슴 앞으로 들어 올려 보기 → 허리 옆 주머니로
      P['shoulderR.rx'] = kf(u, [0, 0], [0.24, -0.75], [0.34, -0.7], [0.5, -0.55], [0.6, -0.5], [0.72, 0.2], [0.9, 0.2], [1, 0]);
      P['shoulderR.rz'] = kf(u, [0, 0], [0.24, 0.2], [0.5, 0.35], [0.6, 0.3], [0.72, 0.25], [0.9, 0.25], [1, 0]);
      P['elbowR.rx'] = kf(u, [0, 0], [0.24, -0.15], [0.34, -0.3], [0.5, -1.05], [0.6, -1.05], [0.72, -0.55], [0.9, -0.55], [1, 0]);
      P['handR.rx'] = kf(u, [0.2, 0], [0.3, 0.45], [0.36, 0.2], [0.6, 0], [0.72, 0.35], [1, 0])
        + Math.sin((u - 0.74) * 2 * PI * 6) * 0.25 * kf(u, [0.73, 0], [0.76, 1], [0.86, 1], [0.9, 0]); // 톡톡
      // 왼손은 무릎을 짚었다가 편히
      P['shoulderL.rx'] = kf(u, [0, 0], [0.24, -0.6], [0.36, -0.5], [0.5, 0]);
      P['elbowL.rx'] = kf(u, [0, 0], [0.24, -0.45], [0.36, -0.4], [0.5, 0]);
      // 시선: 과일 → 손 안의 과일 → 주머니
      P['head.rx'] = kf(u, [0, 0], [0.24, -0.05], [0.5, 0.32], [0.6, 0.3], [0.72, 0.28], [0.9, 0.2], [1, 0]);
      P['head.ry'] = kf(u, [0.6, 0], [0.72, -0.4], [0.9, -0.35], [1, 0]);
      P['spine.ry'] = kf(u, [0.6, 0], [0.72, -0.15], [0.9, -0.12], [1, 0]);
      // 다 넣고 나면 기분 좋게 통
      P['root.py'] = kf(u, [0.88, 0], [0.93, 0.05], [0.98, 0]);
      P['root.sy'] = kf(u, [0.86, 0], [0.9, -0.04], [0.95, 0.03], [1, 0]);
    },
  },
  // 과일나무 흔들기: 나무 쪽으로 한 발 다가가 두 손을 앞으로 뻗어 줄기 가운데를 잡고,
  // 온몸으로 앞뒤로 흔들다가(처음엔 세게, 점점 약하게) 손을 놓고 제자리로 물러난다.
  // 나무와 부딪히는 원 때문에 줄기까지 거리가 있어, 몸(root)을 SHAKE.step 만큼 내밀어 손이 줄기 표면에 닿게 한다
  // (더 내밀면 손이 줄기 속으로 들어가 안 보인다. 흔들 때도 몸은 거의 그대로 두고 팔·상체만 움직인다)
  treeShake: {
    duration: 1.6, hitAt: 0.3,
    fn(u, P) {
      const hold = kf(u, [0, 0], [0.22, 1], [0.82, 1], [1, 0]); // 다가가 잡고 있는 정도
      const amp = kf(u, [0.28, 0], [0.34, 1], [0.62, 0.7], [0.8, 0]); // 흔드는 세기
      const wob = Math.sin((u - 0.28) * 2 * PI * 5.5) * amp; // 앞뒤로 흔들흔들
      // 한 발(왼발) 내딛고 몸을 앞으로
      P['root.pz'] = SHAKE.step * hold + wob * 0.012;
      crouch(P, 0.35 * hold);
      P['hipL.rx'] += -0.35 * hold;
      P['kneeL.rx'] += 0.15 * hold;
      P['hipR.rx'] += 0.25 * hold;
      P['footR.rx'] += -0.15 * hold;
      // 상체: 흔들 때 당겼다 밀며 앞뒤로
      P['spine.rx'] = 0.08 * hold + wob * 0.12;
      P['head.rx'] = -0.12 * hold - wob * 0.06;
      P['head.rz'] = wob * 0.05;
      // 두 팔을 앞으로 거의 수평까지 들어, 어깨 높이(줄기 가운데)에서 두 손을 모은다
      for (const [s, side] of [['R', -1], ['L', 1]]) {
        P[`shoulder${s}.rx`] = -1.35 * hold + wob * 0.12;
        P[`shoulder${s}.rz`] = side * -0.35 * hold; // 안쪽으로 모음 (팔이 몸 앞으로)
        P[`elbow${s}.rx`] = -0.35 * hold - wob * 0.1;
        P[`hand${s}.rx`] = 0.2 * hold;
      }
    },
  },
  // 도끼질: 야구 방망이처럼 수평으로 휘둘러 앞에 선 나무 옆구리를 찍는다. 도끼는 나무에 박혀 그 자리에서 부르르 떨며 멈춘다
  // (몽둥이처럼 나무를 지나쳐 돌아가지 않는다). chopAgain: 박힌 도끼를 뽑아 다시 뒤로 보냈다가 또 찍는, 이어 하는 도끼질
  chop: axeChop(false),
  chopAgain: axeChop(true),
  chopAgain2: axeChop(true), // 같은 동작을 연달아 다시 재생하려고 이름만 다르게 하나 더 둔다
  // 몽둥이 내리치기: 허리와 어깨를 오른쪽 뒤로 크게 감으며 몽둥이를 오른 어깨 너머 뒤로 보냈다가(예비 동작),
  // 머리 위를 넘겨 몸 앞으로 번개처럼 내리치고(가속), 관성으로 왼쪽 아래까지 더 내려간 뒤(잔여 동작) 부르르 되튐.
  // 두 손이 쥔 자리와 몽둥이 방향은 fx.grip 으로 직접 정한다 (몸통 기준이라 허리를 틀면 함께 돈다).
  // 내리친 뒤(0.68~)에는 왼손을 놓고 오른팔 값대로 제자리로 돌아온다.
  clubSmash: clubSwing(CLUB_STYLES.diagonal),
  clubSmash2: clubSwing(CLUB_STYLES.second), // 1타에 이어 치는 2타
  clubSmash3: clubSwing(CLUB_STYLES.homerun), // 2타에 이어 치는 3타: 야구 배트처럼 수평으로 크게
  clubSmash4: clubSwing(CLUB_STYLES.third), // 3타에 이어 치는 1타 (계속 누르면 2타 → 3타 → 4타 반복)
  // 목검(한손검) 3연타: 대각선 베기 → 가로 되베기 → 찌르기 (계속 누르면 1타부터 다시)
  swordSlash1: swordSwing('slash1'),
  swordSlash2: swordSwing('slash2'),
  swordSlash3: swordSwing('slash3'),
  swordSlash4: swordSwing('slash1b'), // 3타에 이어 치는 1타
  clubStrike: clubSwing(CLUB_STYLES.strike), // 강타(스킬): 몽둥이 3타를 더 크게
  swordStrike: swordSwing('strike'), // 강타(스킬): 목검 2타 사선 베기를 더 크게
  daggerStrike: daggerSwing('strike'), // 강타(스킬): 단검 4타(올려 베기)를 뛰어오르며 더 크게
  daggerStab1: daggerSwing('stab1'),
  daggerStab2: daggerSwing('stab2'),
  daggerStab3: daggerSwing('stab3'),
  daggerStab4: daggerSwing('stab1b'), // 4타에 이어 치는 1타
  daggerStab5: daggerSwing('stab4'), // 4타: 올려 베기
  // 공중 공격: 뛰어오른 도중에 누르면 그 높이 그대로 이어받아(재생기의 offset) 공중에서 수평으로 휘두른다.
  // 몸 높이는 점프 동작 그대로이고, 누른 순간(sec0)부터 0.38초 동안 휘두른다
  clubAir: {
    duration: 0.95, equip: 'club', rate: 36, rootRate: 120, hitAfter: 0.19, offset: 0.15,
    fn(u, P, fx, sec, sec0) {
      ACTIONS.jump.fn(u, P);
      const v = (sec - (sec0 || 0.15)) / 0.38;
      if (v < 0) return;
      twoHand(P, fx, v < 1.05);
      fx.grip = gripPath(v, [0, CLUB_READY_POS, CLUB_READY], [0.15, ...CLUB_SIDE], [0.3, BACK_R.pos, BACK_R.dir],
        [0.5, [-0.035, 0.135, 0.13], [-0.4, 0.15, 0.92], 'in'], [0.85, [-0.01, 0.13, 0.15], [0.2, 0.16, 0.97], 'out'], [1.05, [-0.01, 0.13, 0.15], [0.2, 0.16, 0.97]]);
      fx.trail = v > 0.3 && v < 0.85;
      // 휘두르기 직전에 허리를 오른쪽으로 깊이 감는다: 골반은 덜 돌고 상체가 더 돌아 몸이 꼬였다가 풀리며 휘두른다
      // (얕게 감으면 팔만 휘두르는 것처럼 보인다). 감는 쪽 어깨도 살짝 내려간다
      const tw = kf(v, [0, 0], [0.26, -1.4], [0.32, -1.4], [0.5, 0.2, 'in'], [0.85, 0.85, 'out'], [1.6, 0]);
      P['pelvis.ry'] = tw * 0.45;
      P['spine.ry'] = tw;
      P['spine.rz'] = kf(v, [0, 0], [0.3, -0.14], [0.55, 0.1], [1.3, 0]);
      P['head.ry'] = -tw * 0.9;
      // 다리: 한쪽(왼) 무릎을 앞으로 끌어올리고, 다른 쪽(오른)은 무릎을 굽힌 채 살짝 뒤로 늘어뜨린다 (두 다리를 곧게 뻗지 않는다).
      // 착지가 가까워지면(u 0.7~) 점프 동작의 착지 자세로 돌아가 무릎을 굽혀 받아 낸다
      const k = kf(v, [0, 0], [0.35, 1], [1.2, 1]) * (1 - sm(u, 0.62, 0.76));
      P['hipL.rx'] -= 0.85 * k;
      P['kneeL.rx'] += 0.8 * k;
      P['footL.rx'] += 0.15 * k;
      P['hipR.rx'] += 0.7 * k;
      P['kneeR.rx'] -= 0.1 * k;
      P['footR.rx'] += 0.25 * k;
      P['spine.rx'] += 0.08 * k;
    },
  },
  // 내리찍기: 더블 점프(공중제비) 도중에 누르면 몽둥이를 오른 어깨 위·뒤로 크게 치켜든 채 돌다가, 착지하는 순간
  // 대각선으로(오른쪽 위 → 왼쪽 앞 아래) 땅을 내리찍는다. 찍을 때는 두 팔을 앞으로 뻗어 몽둥이가 팔과 한 줄로 이어지고,
  // 무릎을 깊이 굽혀 몸 전체로 내리누른다 (손을 가슴 앞에 둔 채 몽둥이만 세우면 지팡이를 짚는 꼴이 된다).
  // 찍은 뒤에는 잠깐 웅크린 채 버텼다가 일어난다
  clubSlam: {
    // (rootRate: 몸 높이는 공중제비와 같은 빠르기로 따라가게 한다. 다르면 넘어오는 순간 높이가 툭 튄다)
    duration: 1.15, equip: 'club', rate: 36, rootRate: 18, hitAt: (0.74 * 0.85 + 0.02) / 1.15, offset: 0.2,
    fn(u, P, fx, sec, sec0) {
      const F = 0.85; // 공중제비 길이
      const TL = 0.74 * F; // 발이 땅에 닿는 때
      ACTIONS.flip.fn(Math.min(1, sec / F), P);
      const s0 = sec0 || 0.2;
      if (sec < s0) return;
      twoHand(P, fx, sec < TL + 0.3);
      const since = sec - TL - 0.02;
      const shake = since > 0 ? Math.sin(since * 55) * Math.exp(-since * 12) : 0;
      const g = sec < TL - 0.12
        // 치켜드는 길: 몸 앞에 세운 몽둥이를 오른쪽 옆으로 눕혔다가 어깨 너머로 넘긴다
        ? gripPath((sec - s0) / Math.max(0.08, TL - 0.12 - s0), [0, CLUB_READY_POS, CLUB_READY], [0.45, ...CLUB_SIDE], [1, ...CLUB_RAISE])
        : gripPath(sec, [TL - 0.12, ...CLUB_RAISE], [TL + 0.02, ...SLAM_HIT, 'in'], [TL + 0.16, ...SLAM_SWEEP, 'out'], [TL + 0.4, ...SLAM_SWEEP]);
      fx.grip = { pos: g.pos, dir: unit([g.dir[0], g.dir[1] + shake * 0.08, g.dir[2]]) };
      fx.trail = sec > TL - 0.12 && sec < TL + 0.12;
      // 치켜든 동안 허리를 오른쪽으로 감았다가, 찍으며 왼쪽으로 풀어 대각선으로 내리찍고, 찍은 뒤에도 허리가 왼쪽으로 더 돌아 나간다
      const tw = kf(sec, [s0, 0], [TL - 0.2, -0.85], [TL - 0.12, -0.85], [TL + 0.02, 0.25, 'in'], [TL + 0.16, 0.95, 'out'], [TL + 0.3, 0.9], [1.15, 0]);
      P['pelvis.ry'] = tw * 0.4;
      P['spine.ry'] = tw;
      P['head.ry'] = -tw * 0.97; // 몸을 틀어도 눈은 앞을 (덜 돌리면 치켜든 몽둥이가 머리에 걸린다)
      // 찍은 뒤: 왼발을 앞으로 내딛고 두 무릎을 깊이 굽혀 버텼다가 일어난다
      const k = kf(sec, [TL - 0.08, 0], [TL + 0.04, 1], [TL + 0.3, 1], [1.15, 0]);
      if (k > 0) {
        const land = kf(sec / F, [0.6, 0], [0.74, 0.3], [0.84, 0.42], [1, 0]); // 공중제비 착지 무릎
        legs(P, k, [-0.25, 1.25], [-1.05, 1.45], land);
        P['spine.rx'] = (P['spine.rx'] ?? 0) * (1 - k) + (0.85 + shake * 0.04) * k; // 찍으며 상체를 깊이 숙여 몸무게를 싣는다
        P['head.rx'] = -0.55 * P['spine.rx'];
        wideStance(P, 0.7 * k);
      }
      armsDown(P, kf(sec, [TL + 0.25, 0], [1.15, 1]));
    },
  },
  // 대시 공격: 달리다가 누르면 앞으로 뛰어들며 몽둥이를 오른 어깨 위·뒤로 대각선으로 치켜들었다가, 왼쪽 앞 아래로 땅을 내리찍는다
  // (앞으로 나아가는 것은 게임 쪽에서 움직여 준다). 찍을 때 두 팔을 앞으로 뻗고 왼발을 크게 내딛으며 무릎을 굽힌다
  clubDash: {
    duration: 0.62, hitAt: 0.48, equip: 'club', rate: 36, rootRate: 120, trail: [0.32, 0.62],
    fn(u, P, fx) {
      twoHand(P, fx, u < 0.76);
      // 찍은 자리에서 멈추지 않고 왼쪽 아래로 더 쓸고 나간다 (더블 점프 내리찍기와 같은 끝 자세)
      const g = gripPath(u, [0, CLUB_READY_POS, CLUB_READY], [0.15, ...CLUB_SIDE], [0.3, ...CLUB_RAISE], [0.48, ...SLAM_HIT, 'in'],
        [0.66, ...SLAM_SWEEP, 'out'], [1, ...SLAM_SWEEP]);
      const shake = u > 0.48 ? Math.sin((u - 0.48) * 36) * Math.exp(-(u - 0.48) * 14) : 0;
      fx.grip = { pos: g.pos, dir: unit([g.dir[0], g.dir[1] + shake * 0.06, g.dir[2]]) };
      // 뛰어드는 다리: 오른발로 박차고(뒤로 차고) 왼무릎을 앞으로 끌어올렸다가, 찍으며 왼발을 크게 내딛고 무릎을 굽힌다
      const k = kf(u, [0.32, 0], [0.5, 1, 'in'], [0.72, 1], [1, 0]);
      legs(P, 1, [kf(u, [0, 0.3], [0.3, 0.55], [0.48, 0.3], [1, 0]), kf(u, [0, 0.5], [0.3, 0.9], [0.48, 1.1], [1, 0.1])],
        [kf(u, [0, -0.4], [0.3, -0.85], [0.48, -1.2], [1, -0.1]), kf(u, [0, 0.5], [0.3, 1.0], [0.48, 1.6], [1, 0.15])]);
      wideStance(P, 0.5 * k);
      P['spine.rx'] = kf(u, [0, 0.15], [0.3, -0.15], [0.46, 0.55], [0.72, 0.58], [1, 0]) + shake * 0.04;
      P['head.rx'] = -0.55 * P['spine.rx'];
      // 내리치기 직전에 허리를 오른쪽으로 깊이 감고 잠깐 머문다 (몸이 꼬였다가 풀리며 내리친다). 감는 쪽 어깨도 살짝 내려간다.
      // 찍은 뒤에도 허리가 왼쪽으로 더 돌아 나간다
      const tw = kf(u, [0, 0], [0.26, -1.3], [0.32, -1.3], [0.48, 0.25, 'in'], [0.66, 0.95, 'out'], [0.76, 0.9], [1, 0]);
      P['pelvis.ry'] = tw * 0.4;
      P['spine.ry'] = tw;
      P['spine.rz'] = kf(u, [0, 0], [0.3, -0.14], [0.5, 0.1], [0.8, 0]);
      P['head.ry'] = -tw * 0.97;
      P['root.py'] = (P['root.py'] ?? 0) + kf(u, [0, 0], [0.26, 0.09], [0.46, 0]);
      armsDown(P, kf(u, [0.7, 0], [1, 1]));
    },
  },
  // ── 목검 공중·대시 공격 (한 손) ──
  // 점프 공격: 뛰어오른 높이를 그대로 이어받아, 공중에서 허리를 오른쪽으로 깊이 감았다가 왼쪽 앞으로 가로로 크게 벤다
  swordAir: {
    duration: 0.95, equip: 'woodSword', rate: 36, rootRate: 120, hitAfter: 0.19, offset: 0.15,
    fn(u, P, fx, sec, sec0) {
      ACTIONS.jump.fn(u, P);
      fx.carry = true;
      const v = (sec - (sec0 || 0.15)) / 0.38; // 휘두르기 시작부터 (0.5 = 타격)
      if (v < 0) return;
      if (v < 1.45) swordAim(fx, SWORD_AIR_KEYS, v, kf(v, ...SWORD_TILTS.air));
      fx.trail = v > 0.3 && v < 0.85;
      const tw = kf(v, [0, 0], [0.26, -1.3], [0.32, -1.3], [0.5, 0.2, 'in'], [0.85, 1.0, 'out'], [1.6, 0]);
      P['pelvis.ry'] = tw * 0.45;
      P['spine.ry'] = tw * 0.6;
      P['spine.rz'] = kf(v, [0, 0], [0.3, -0.14], [0.55, 0.1], [1.3, 0]);
      P['head.ry'] = -tw * 0.75;
      // 다리: 왼무릎을 앞으로 끌어올리고 오른다리는 굽힌 채 뒤로 늘어뜨렸다가, 착지가 가까워지면 점프 착지 자세로
      const k = kf(v, [0, 0], [0.35, 1], [1.2, 1]) * (1 - sm(u, 0.62, 0.76));
      P['hipL.rx'] -= 0.85 * k;
      P['kneeL.rx'] += 0.8 * k;
      P['footL.rx'] += 0.15 * k;
      P['hipR.rx'] += 0.7 * k;
      P['kneeR.rx'] -= 0.1 * k;
      P['footR.rx'] += 0.25 * k;
      P['spine.rx'] += 0.08 * k;
      const back = kf(v, [1.0, 0], [1.5, 1]);
      swordLeftArm(P, kf(v, [0, 0.6], [0.3, 1.2], [0.5, 0.9], [0.85, 0.4]), kf(v, [0, -0.3], [0.3, -0.55], [0.5, -0.15], [0.85, 0.15]),
        kf(v, [0, -0.5], [0.3, -0.75], [0.5, -1.2, 'in'], [0.85, -0.9]), back);
    },
  },
  // 더블 점프 공격: 공중제비를 돌며 칼을 머리 위 뒤로 치켜들었다가, 착지하는 순간 앞 아래로 곧게 내려베고 무릎을 깊이 굽혀 버틴다
  swordSlam: {
    duration: 1.15, equip: 'woodSword', rate: 36, rootRate: 18, hitAt: (0.74 * 0.85 + 0.02) / 1.15, offset: 0.2,
    fn(u, P, fx, sec, sec0) {
      const F = 0.85; // 공중제비 길이
      const TL = 0.74 * F; // 발이 땅에 닿는 때
      ACTIONS.flip.fn(Math.min(1, sec / F), P);
      fx.carry = true;
      const s0 = sec0 || 0.2;
      if (sec < s0) return;
      // 키 자세 시각은 초 단위: 치켜들기 → 착지하며 내려베기 → 조금 더 내려가 멈춤
      const keys = [{ ...SWORD_READY_KEY, u: s0 }, ...SWORD_SLAM_KEYS.map((k, i) => ({ ...k, u: i ? TL + k.u : Math.max(s0 + 0.08, TL + k.u) })), { ...SWORD_REST, u: TL + 0.6 }];
      // 돌아올 때는 팔꿈치를 뒤 아래쪽에 고정해, 팔을 아래로 내리며 살짝만 굽혀 평소 자세로 돌아온다
      // (가슴 높이 준비 자세를 거치면 팔꿈치가 접히며 손이 위로 감겨 올라갔다 내려온다)
      if (sec < TL + 0.6) swordAim(fx, keys, sec, kf(sec - TL, ...SWORD_TILTS.slam), sec > TL + 0.35 ? WRIST_ONE : null);
      fx.trail = sec > TL - 0.12 && sec < TL + 0.12;
      const tw = kf(sec, [s0, 0], [TL - 0.2, -0.6], [TL - 0.12, -0.6], [TL + 0.02, 0.15, 'in'], [TL + 0.16, 0.35, 'out'], [1.15, 0]);
      P['pelvis.ry'] = tw * 0.4;
      P['spine.ry'] = tw * 0.6;
      P['head.ry'] = -tw * 0.9;
      // 벤 뒤: 왼발을 앞으로 내딛고 두 무릎을 깊이 굽혀 버텼다가 일어난다
      const k = kf(sec, [TL - 0.08, 0], [TL + 0.04, 1], [TL + 0.3, 1], [1.15, 0]);
      if (k > 0) {
        const land = kf(sec / F, [0.6, 0], [0.74, 0.3], [0.84, 0.42], [1, 0]);
        legs(P, k, [-0.25, 1.25], [-1.05, 1.45], land);
        P['spine.rx'] = (P['spine.rx'] ?? 0) * (1 - k) + 0.75 * k; // 내려베며 상체를 깊이 숙여 몸무게를 싣는다
        P['head.rx'] = -0.55 * P['spine.rx'];
        wideStance(P, 0.7 * k);
      }
      const back = kf(sec, [TL + 0.35, 0], [1.15, 1]);
      swordLeftArm(P, kf(sec, [s0, 0.8], [TL - 0.12, 1.1], [TL + 0.02, 0.7], [TL + 0.3, 0.6]),
        kf(sec, [s0, -0.3], [TL - 0.12, -0.5], [TL + 0.02, 0.2], [TL + 0.3, 0.2]),
        kf(sec, [s0, -0.6], [TL - 0.12, -0.8], [TL + 0.02, -1.15, 'in'], [TL + 0.3, -1.0]), back);
    },
  },
  // 대시 공격: 달리다가 누르면 앞으로 뛰어들며, 허리를 오른쪽으로 감았다가 허리 높이에서 오른쪽 → 왼쪽으로 가로로 베고 지나간다
  // (앞으로 나아가는 것은 게임 쪽에서 움직여 준다)
  swordDash: {
    duration: 0.62, hitAt: 0.48, equip: 'woodSword', rate: 36, rootRate: 120, trail: [0.32, 0.66],
    fn(u, P, fx) {
      fx.carry = true;
      // 손목은 펴 둔다 (어깨·팔꿈치로만 칼 방향을 맞춘다)
      // (돌아갈 때는 손목 한계를 평소대로 풀어, 팔이 아래로 다 내려오기 전에 칼이 아래팔을 따라 위로 세워지지 않게 한다)
      if (u < 0.97) swordAim(fx, SWORD_DASH_KEYS, u, kf(u, ...SWORD_TILTS.dash), kf(u, [0.78, 0.15], [0.86, WRIST_ONE]));
      // 뛰어드는 다리: 오른발로 박차고 왼무릎을 끌어올렸다가, 베며 왼발을 크게 내딛고 무릎을 굽힌다
      const k = kf(u, [0.32, 0], [0.5, 1, 'in'], [0.72, 1], [1, 0]);
      legs(P, 1, [kf(u, [0, 0.3], [0.3, 0.55], [0.48, 0.3], [1, 0]), kf(u, [0, 0.5], [0.3, 0.9], [0.48, 1.1], [1, 0.1])],
        [kf(u, [0, -0.4], [0.3, -0.85], [0.48, -1.2], [1, -0.1]), kf(u, [0, 0.5], [0.3, 1.0], [0.48, 1.6], [1, 0.15])]);
      wideStance(P, 0.5 * k);
      P['spine.rx'] = kf(u, [0, 0.15], [0.3, 0.05], [0.48, 0.35], [0.72, 0.35], [1, 0]);
      P['head.rx'] = -0.55 * P['spine.rx'];
      const tw = kf(u, [0, 0], [0.26, -1.5], [0.32, -1.5], [0.48, 0.3, 'in'], [0.66, 1.1, 'out'], [0.78, 1.0], [1, 0]); // 당길 때 오른 어깨를 깊이 뒤로 뺀다
      P['pelvis.ry'] = tw * 0.4;
      P['spine.ry'] = tw * 0.6;
      P['spine.rz'] = kf(u, [0, 0], [0.3, -0.12], [0.5, 0.1], [0.8, 0]);
      P['head.ry'] = -tw * 0.75;
      P['root.py'] = (P['root.py'] ?? 0) + kf(u, [0, 0], [0.26, 0.08], [0.46, 0]);
      const back = kf(u, [0.78, 0], [1, 1]);
      swordLeftArm(P, kf(u, [0, 0.6], [0.3, 1.2], [0.48, 0.9], [0.66, 0.4]), kf(u, [0, -0.3], [0.3, -0.55], [0.48, -0.1], [0.66, 0.2]),
        kf(u, [0, -0.5], [0.3, -0.75], [0.48, -1.2, 'in'], [0.66, -0.95]), back);
    },
  },
  // ── 나무 단검 공중·대시 공격 (역수, 한 손) ──
  // 점프 공격: 뛰어오른 높이를 그대로 이어받아 공중에서 한 번 크게 대각선으로 벤다 (목검보다 짧고 빠르게)
  daggerAir: {
    duration: 0.95, equip: 'dagger', rate: 48, rootRate: 120, hitAfter: 0.15, offset: 0.15,
    fn(u, P, fx, sec, sec0) {
      ACTIONS.jump.fn(u, P);
      fx.carry = true;
      const v = (sec - (sec0 || 0.15)) / 0.3; // 휘두르기 시작부터 (0.5 = 타격)
      if (v < 0) return;
      // 오른팔 바탕 자세는 평소 대기 자세 (점프 동작의 팔 자세 대신): 벤 뒤 여기로 내린다
      P['shoulderR.rz'] = -ARM_REST;
      P['shoulderR.rx'] = -0.1;
      P['elbowR.rx'] = -0.08;
      if (v < 0.8) swordAim(fx, DAGGER_AIR_KEYS, v);
      else if (v < 1.45) fx.armSettle = sm(v, 0.8, 1.45); // 벤 끝 자세에서 어깨·팔꿈치·손목을 함께 내린다
      fx.trail = v > 0.25 && v < 0.8;
      const tw = kf(v, [0, 0], [0.25, -1.3], [0.5, 0.2, 'in'], [0.8, 1.35, 'out'], [1.6, 0]);
      P['pelvis.ry'] = tw * 0.45;
      P['spine.ry'] = tw * 0.6;
      P['head.ry'] = -tw * 0.75;
      // 다리: 두 무릎을 끌어올려 몸을 웅크렸다가, 착지가 가까워지면 점프 착지 자세로
      const k = kf(v, [0, 0], [0.3, 1], [1.2, 1]) * (1 - sm(u, 0.62, 0.76));
      for (const s of SIDES) { P[`hip${s}.rx`] -= 0.6 * k; P[`knee${s}.rx`] += 0.9 * k; }
      P['spine.rx'] += 0.25 * k * kf(v, [0, 0], [0.5, 1, 'in']);
      const pull = kf(v, [0, 0], [0.5, 1, 'in'], [0.75, 0.5], [1.3, 0]);
      swordLeftArm(P, 0.7 + pull * 0.3, -0.5 + pull * 0.4, -1.2 - pull * 0.2, kf(v, [0.8, 0], [1.3, 1]));
    },
  },
  // 점프 공격 2타: 점프 공격 1타를 벤 자세(왼쪽 옆구리 앞에 접은 팔)를 그대로 붙잡고, 일반 2타처럼 팔꿈치만 펴고 어깨만 살짝 돌리며
  // 오른쪽으로 되벤다 (equipment.js holdArm). 뛰어오른 높이는 1타에서 그대로 이어받고(길이가 점프와 같다), 벤 뒤에는 어깨·팔꿈치를 함께 내린다
  daggerAir2: {
    duration: 0.95, equip: 'dagger', rate: 48, rootRate: 120, hitAfter: 0.12, offset: 0.4,
    fn(u, P, fx, sec, sec0) {
      ACTIONS.jump.fn(u, P);
      fx.carry = true;
      const t = sec - (sec0 || 0.4); // 2타를 시작한 뒤 흐른 초
      P['shoulderR.rz'] = -ARM_REST;
      P['shoulderR.rx'] = -0.1;
      P['elbowR.rx'] = -0.08;
      if (t < 0.2) fx.armHold = { ext: kf(t, [0, 0], [0.12, 0.75, 'in'], [0.2, 1, 'out']), yaw: kf(t, [0, 0], [0.12, -0.08, 'in'], [0.2, -0.12, 'out']) };
      else if (t < 0.6) fx.armSettle = sm(t, 0.2, 0.6);
      fx.trail = t > 0.02 && t < 0.2;
      const tw = kf(t, [0, 1.35], [0.12, 0.1, 'in'], [0.2, -0.3, 'out'], [0.7, 0]);
      P['pelvis.ry'] = tw * 0.45;
      P['spine.ry'] = tw * 0.6;
      P['head.ry'] = -tw * 0.75;
      // 다리: 1타처럼 웅크린 채, 착지가 가까워지면 점프 착지 자세로
      const k = 1 - sm(u, 0.62, 0.76);
      for (const s of SIDES) { P[`hip${s}.rx`] -= 0.6 * k; P[`knee${s}.rx`] += 0.9 * k; }
      P['spine.rx'] += 0.25 * k;
      swordLeftArm(P, 1.0, -0.1, -1.4, kf(t, [0.25, 0], [0.7, 1]));
    },
  },
  // 더블 점프 공격: 공중제비 도중에 누르면 곧바로 찍지 않고, 남은 공중제비를 마저 돌며 잠깐 떠서 팔을 오른쪽 위 대각선으로 치켜든다.
  // 이어서 앞으로 기울며 앞 아래로 빠르게 내려가(앞으로 나아가는 것은 게임 쪽) 같은 대각선으로 내려찍으며 지나가는 길을 벤다. 착지하면 낮게 웅크려 버틴다
  daggerSlam: {
    duration: 1.2, equip: 'dagger', rate: 48, rootRate: 40, hitAfter: DIVE.raise + (DIVE.time + 0.02) / DIVE.rate, offset: 0.2,
    fn(u, P, fx, secRaw, sec0) {
      const F = 0.85; // 공중제비 길이
      const s0 = sec0 || 0.2;
      const sec = secRaw < s0 + DIVE.raise ? secRaw : s0 + DIVE.raise + (secRaw - s0 - DIVE.raise) * DIVE.rate; // 치켜든 뒤로는 DIVE.rate 배 빠르게
      const TD = s0 + DIVE.raise; // 치켜들기를 마치고 내려가기 시작하는 때
      const TL = TD + DIVE.time; // 발이 땅에 닿는 때 (찍는 순간)
      ACTIONS.flip.fn(Math.min(1, sec / F), P);
      fx.carry = true;
      if (sec < s0) return;
      // 누른 순간의 공중제비 높이·회전에서 이어 간다
      const P0 = {};
      ACTIONS.flip.fn(Math.min(1, s0 / F), P0);
      const ang0 = P0['root.rx'];
      for (const k in P) if (!k.startsWith('root.')) P[k] = 0; // 공중제비 자세는 버리고 새로
      // 몸: 치켜드는 동안 남은 공중제비를 마저 돌아 가슴을 살짝 젖힌 채 잠깐 떠 있다가, 앞으로 기울며 앞 아래로 내려가 착지한다
      const pitch = kf(sec, [s0, ang0], [s0 + 0.1, PI * 2 - 0.15, 'out'], [TD, PI * 2 - 0.1], [TL - 0.04, PI * 2 + 0.3, 'in'], [TL + 0.08, PI * 2]);
      P['root.rx'] = pitch;
      // 공중제비 높이에는 몸 가운데를 축으로 돌리느라 더한 높이(0.45 - 0.45·cos 회전각)가 들어 있다.
      // 이 몫은 누른 순간 값으로 붙잡지 않고 지금 회전각으로 다시 계산한다 (공중제비와 같이: 몸 가운데가 제자리에서 돈다).
      // 붙잡아 두면 몸을 세운 뒤에도 그만큼 높이 떠서, 거꾸로 돌던 순간에 누르면 훨씬 위에서 찍는다
      const comp0 = 0.45 - 0.45 * Math.cos(ang0);
      const base0 = P0['root.py'] - comp0; // 발 기준으로 떠 있는 높이
      const top = base0 + 0.04;
      const w = Math.min(1, Math.max(0, (sec - TD) / DIVE.time));
      const lift = sec < TD ? base0 + (top - base0) * sm(sec, s0, TD) : sec < TL ? top * (1 - EASE.in(w) * 0.6 - 0.4 * w) : 0;
      P['root.py'] = lift + 0.45 - 0.45 * Math.cos(pitch);
      P['root.pz'] = -0.45 * Math.sin(pitch);
      // 오른팔: 오른쪽 위 대각선으로 치켜들었다가, 같은 대각선을 따라 왼쪽 앞 아래로 내려찍는다 (3타와 같은 길). 찍은 뒤에는 1타처럼 어깨·팔꿈치를 함께 내린다
      P['shoulderR.rz'] = -ARM_REST;
      P['shoulderR.rx'] = -0.1;
      P['elbowR.rx'] = -0.08;
      // (치켜들 때 팔을 옆으로 들며 날을 위로 세웠다가 앞으로 넘긴다: 평소 자세에서 곧장 가면 날이 150도 가까이 돌며 주먹이 뒤집힌다)
      const keys = [{ ...DAGGER_READY, u: s0 }, dkey(s0 + DIVE.raise * 0.5, [-0.95, 0.1, 0.2], 0.2, [-0.2, 0.95, 0.1], [-0.3, -1, -0.3]),
        dkey(TD, [-0.7, 0.6, 0.3], 0.18, [0.3, -0.3, 0.9], [-1, -0.3, -0.2]),
        dkey(TL, [0.25, -0.3, 1], REACH, [0.4, -0.8, 0.45], [-0.6, -1, 0], 'in'), dkey(TL + 0.12, [0.5, -0.55, 0.7], 0.18, [0.45, -0.85, 0.3], [-0.5, -1, 0.1], 'out')];
      if (sec < TL + 0.12) {
        swordAim(fx, keys, sec);
        fx.oneHand.w = sm(sec, s0, s0 + 0.08); // 공중제비의 웅크린 팔에서 서서히 쥔다 (곧바로 쥐면 첫 장면에 팔이 튄다)
      } else if (sec < TL + 0.55) fx.armSettle = sm(sec, TL + 0.12, TL + 0.55);
      fx.trail = sec > TD - 0.03 && sec < TL + 0.12;
      // 다리: 치켜드는 동안 무릎을 끌어올려 웅크리고, 내려가는 동안 두 다리를 뒤로 굽혀 늘어뜨린다 → 착지하면 오른발을 앞에 두고 낮게 웅크려 버텼다가 일어난다
      const k = kf(sec, [TL - 0.04, 0], [TL + 0.04, 1], [TL + 0.4, 1], [TL + 0.75, 0]);
      if (sec < TD) {
        for (const s of SIDES) { P[`hip${s}.rx`] = -0.7; P[`knee${s}.rx`] = 1.2; P[`foot${s}.rx`] = 0.2; }
        P['spine.rx'] = -0.1;
      } else if (sec < TL) {
        for (const s of SIDES) { P[`hip${s}.rx`] = 0.35; P[`knee${s}.rx`] = 1.1; P[`foot${s}.rx`] = 0.3; }
        P['hipL.rx'] = -0.4;
        P['spine.rx'] = 0.35;
      } else {
        legs(P, k, [-0.85, 1.2], [0.3, 1.2], 0.3 * k);
        P['spine.rx'] = 0.4 * k;
        wideStance(P, 0.8 * k);
      }
      P['head.rx'] = -0.6 * (P['spine.rx'] ?? 0);
      const tw = kf(sec, [s0, 0], [TD, -0.7], [TL, 0.3, 'in'], [TL + 0.12, 0.6, 'out'], [TL + 0.75, 0]);
      P['pelvis.ry'] = tw * 0.4;
      P['spine.ry'] = tw * 0.6;
      P['head.ry'] = -tw * 0.8;
      swordLeftArm(P, 1.1, 0.55, -0.4, kf(sec, [TL + 0.35, 0], [TL + 0.75, 1])); // 왼팔은 뒤로 벌려 균형을 잡는다
    },
  },
  // 대시 공격: 달리다가 누르면 상체를 앞으로 깊이 숙이고 단검을 허리 뒤로 빼 낮게 달려들었다가, 닿는 순간 오른쪽 → 왼쪽으로 벤다
  // (앞으로 나아가는 것은 게임 쪽에서 움직여 준다: 벨 때까지 빠르게, 벤 뒤에 멈춘다)
  // (길이 0.87초: 달려들어 베기까지는 0.6초 동작 그대로이고(u), 벤 뒤 팔을 내리는 데만 시간을 더 준다)
  daggerDash: {
    duration: 0.87 / DASH_RATE, hitAt: 0.36 / 0.87, equip: 'dagger', rate: 48, rootRate: 120, trail: [0.288 / 0.87, 0.504 / 0.87],
    fn(u0, P, fx) {
      const sec = u0 * 0.87;
      const u = sec <= 0.504 ? sec / 0.6 : 0.84 + 0.16 * (sec - 0.504) / (0.87 - 0.504);
      fx.carry = true;
      P['shoulderR.rz'] = -ARM_REST; // 오른팔 바탕 자세는 평소 대기 자세 (벤 뒤 쥔 손을 놓으면 여기로 녹아든다)
      P['shoulderR.rx'] = -0.1;
      P['elbowR.rx'] = -0.08;
      if (u < 0.84) swordAim(fx, DAGGER_DASH_KEYS, u);
      else if (u < 0.99) fx.armSettle = sm(u, 0.84, 0.99); // 1타처럼 벤 끝 자세에서 어깨·팔꿈치·손목을 함께 내린다
      // 다리: 낮게 달려드는 걸음 (오른발로 박차고 왼무릎을 앞으로) → 벨 때 오른발을 크게 내딛고 무릎을 굽혀 멈춘다
      const step = kf(u, [0, 0], [0.5, 1], [0.6, 1]);
      const ph = Math.sin(step * PI * 2);
      const k = kf(u, [0.5, 0], [0.62, 1, 'in'], [0.8, 1], [1, 0]);
      const run = 1 - k;
      legs(P, 1, [kf(u, [0, 0.3], [0.5, 0.3 - 0.6 * ph], [0.62, -1.0], [1, 0]), kf(u, [0, 0.6], [0.5, 0.9], [0.62, 1.4], [1, 0.1])],
        [kf(u, [0, -0.4], [0.5, -0.4 + 0.6 * ph], [0.62, 0.35], [1, -0.05]), kf(u, [0, 0.8], [0.5, 1.1], [0.62, 1.3], [1, 0.1])]);
      wideStance(P, 0.6 * k);
      // 앞으로 깊이 숙인 채 달려들고, 벤 뒤 천천히 일어난다
      P['spine.rx'] = kf(u, [0, 0.2], [0.2, 0.75], [0.45, 0.65], [0.6, 0.45], [0.8, 0.4], [1, 0]); // 벨 때는 상체를 조금 세워 가슴 높이를 벤다
      P['head.rx'] = -0.7 * P['spine.rx'];
      P['root.py'] = (P['root.py'] ?? 0) - 0.04 * run * kf(u, [0, 0], [0.2, 1], [1, 1]);
      const tw = kf(u, [0, 0], [0.25, -0.8], [0.45, -1.3], [0.6, 0.2, 'in'], [0.84, 1.45, 'out'], [1, 0]);
      P['pelvis.ry'] = tw * 0.4;
      P['spine.ry'] = tw * 0.6;
      P['head.ry'] = -tw * 0.75;
      // 왼팔: 달려드는 동안 앞으로 내밀어 겨누고, 벨 때 뒤로 당긴다
      swordLeftArm(P, kf(u, [0, 0.6], [0.3, 0.5], [0.6, 0.9], [0.78, 0.8]), kf(u, [0, -0.3], [0.3, -0.9], [0.6, 0.2, 'in'], [0.78, 0.2]),
        kf(u, [0, -0.5], [0.3, -0.6], [0.6, -1.3], [0.78, -1.1]), kf(u, [0.8, 0], [1, 1]));
    },
  },
  // 대시 공격 2타: 대시로 왼쪽 어깨 뒤까지 감아 벤 자세(대시 0.5초 자세)를 그대로 이어받아, 일반 2타처럼 팔꿈치만 펴고 어깨만 살짝 돌리며
  // 오른쪽으로 되벤다 (equipment.js holdArm, 손목은 그대로). 숙인 몸은 그 자세에서 천천히 일으키고, 벤 뒤에는 어깨·팔꿈치를 함께 내린다
  daggerDash2: {
    duration: 0.65 / DASH_RATE, hitAt: 0.12 / 0.65, equip: 'dagger', rate: 48, rootRate: 120, trail: [0.02 / 0.65, 0.2 / 0.65],
    fn(u, P, fx) {
      const t = u * 0.65;
      // 몸: 대시 1타가 벤 끝 자세(0.5초)를 그대로 받아, 2타를 벤 뒤 서서히 평소 자세로 푼다
      const f0 = {};
      ACTIONS.daggerDash.fn(0.5 / 0.87, P, f0);
      const rest = 1 - sm(t, 0.22, 0.62);
      for (const k in P) P[k] *= rest;
      const tw = kf(t, [0, 1.45], [0.12, 0.1, 'in'], [0.2, -0.3, 'out'], [0.62, 0]);
      P['pelvis.ry'] = tw * 0.4;
      P['spine.ry'] = tw * 0.6;
      P['head.ry'] = -tw * 0.75;
      P['shoulderR.rz'] = -ARM_REST;
      P['shoulderR.rx'] = -0.1;
      P['elbowR.rx'] = -0.08;
      fx.carry = true;
      if (t < 0.2) {
        fx.oneHand = f0.oneHand; // 쥔 정도를 이어 둔다 (팔은 아래 붙잡기가 덮어쓴다)
        fx.armHold = { ext: kf(t, [0, 0], [0.12, 0.75, 'in'], [0.2, 1, 'out']), yaw: kf(t, [0, 0], [0.12, -0.08, 'in'], [0.2, -0.12, 'out']) };
      } else if (t < 0.6) fx.armSettle = sm(t, 0.2, 0.6);
    },
  },
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
          fx.grip = { pos: fx.grip.pos, dir: unit([Math.sin(sec * 40 + 1) * 0.03 * k, fx.grip.dir[1] - 0.1 * k + Math.sin(sec * 40) * 0.04 * k, fx.grip.dir[2]]) };
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
  bowShot: { duration: 1.7, hitAt: 0.66, equip: 'bow', fn: (u, P, fx) => bowPose(u, P, fx) },
  // 게임용 활 쏘기 두 조각: 누르고 있는 동안 시위를 당겨 그대로 버티고(bowAim), 떼면 놓아 쏜다(bowRelease)
  // bowShot 의 당기는 구간(0 → 0.6)과 놓는 구간(0.66 → 1)을 그대로 나눠 쓴다
  bowAim: { duration: 0.7, hold: true, equip: 'bow', fn: (u, P, fx) => bowPose(u * 0.6, P, fx) },
  bowRelease: { duration: 0.6, hitAt: 0.01, equip: 'bow', fn: (u, P, fx) => bowPose(0.66 + u * 0.34, P, fx) },
  // 점프 공격: 뛰어오른 높이를 이어받아, 공중에서 재빨리 당겨 대각선 아래로 쏜다
  bowAir: {
    duration: 0.95, equip: 'bow', rootRate: 120, hitAfter: 0.2, offset: 0.15,
    fn(u, P, fx, sec, sec0) {
      ACTIONS.jump.fn(u, P);
      bowDown(sec - (sec0 || 0.15), P, fx, BOW_PITCH.bowAir, 0.16, 0.2, 0.3);
    },
  },
  // 더블 점프 공격: 공중제비를 끝까지 돈 뒤, 떨어지면서 발밑 앞쪽을 향해 가파르게 쏘고 무릎을 굽혀 내려앉는다
  bowSlam: {
    duration: 1.15, equip: 'bow', rootRate: 60, hitAt: 0.62 / 1.15, offset: 0.2,
    fn(u, P, fx, sec) {
      const F = 0.85;
      ACTIONS.flip.fn(Math.min(1, sec / F), P);
      // 공중제비가 끝난 뒤에도 조금 더 떠 있다가(쏠 틈) 내려앉는다
      const ang = P['root.rx'];
      const h = 0.45;
      P['root.py'] = kf(sec, [0, 0.5], [0.22, 0.8], [0.6, 0.72], [0.85, 0]) + h - h * Math.cos(ang);
      const land = kf(sec, [0.75, 0], [0.86, 0.45], [0.98, 0.5], [1.15, 0]);
      if (sec > 0.7) crouch(P, land); // 공중에서는 공중제비의 웅크린 다리를 그대로 둔다
      bowDown(sec - 0.44, P, fx, BOW_PITCH.bowSlam, 0.14, 0.18, 0.35);
    },
  },
  // 강타(스킬) 두 조각: A를 누르고 있는 동안 다리를 낮춰 버티고 시위를 끝까지 당긴 채 부르르 떨며 기를 모으고(bowStrike),
  // 떼면 놓아 쏜다(bowStrikeShot: 놓는 순간 몸이 뒤로 살짝 밀린다). 다 모으기 전에 떼면 다 모은 뒤에 쏜다 (main.js)
  bowStrike: {
    duration: BOW_STRIKE.rel, hold: true, equip: 'bow',
    fn(u, P, fx, sec) {
      const { draw, rel, back } = BOW_STRIKE;
      bowPose(quickBow(Math.min(sec, draw), draw, rel, back), P, fx);
      crouch(P, kf(sec, [0, 0], [draw, 0.28], [rel, 0.34]));
      const k = sm(sec, 0, draw); // 당기기 시작하면 살짝 떨기 시작해, 놓을 때까지 같은 세기로 잔잔하게 떤다
      P['spine.rx'] = (P['spine.rx'] ?? 0) + Math.sin(sec * 61) * 0.006 * k;
      P['spine.rz'] = (P['spine.rz'] ?? 0) + Math.sin(sec * 47) * 0.005 * k;
    },
  },
  bowStrikeShot: {
    duration: BOW_STRIKE.back + 0.05, hitAt: 0.01, equip: 'bow',
    fn(u, P, fx, sec) {
      const { draw, rel, back } = BOW_STRIKE;
      bowPose(quickBow(rel + sec, draw, rel, back), P, fx);
      crouch(P, kf(sec, [0, 0.34], [0.1, 0.2], [back, 0]));
      P['spine.rx'] = (P['spine.rx'] ?? 0) - kf(sec, [0, 0], [0.08, 0.1], [back, 0]); // 놓으면 뒤로 밀린다
    },
  },
  // 달리기 공격: 달리던 쪽으로 미끄러지면서 뒤로 휙 돌아서(돌아서는 건 게임 쪽에서) 재빨리 쏜다
  bowBack: {
    duration: 0.8, equip: 'bow', rootRate: 120, hitAt: 0.3 / 0.8,
    fn(u, P, fx, sec) {
      bowPose(quickBow(sec, 0.22, 0.3, 0.4), P, fx);
      crouch(P, kf(sec, [0, 0.35], [0.3, 0.45], [0.55, 0.3], [0.8, 0]));
      P['root.py'] = kf(sec, [0, 0], [0.12, 0.06], [0.26, 0]); // 돌아서며 살짝 뜬다
      P['spine.rx'] = (P['spine.rx'] ?? 0) - kf(sec, [0, 0], [0.25, 0.12], [0.6, 0.05], [0.8, 0]); // 미끄러지는 쪽(뒤)으로 몸을 젖힌다
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
  // 일반 공격: 지팡이를 머리 오른쪽 위로 대각선으로 들어 끝에 에너지를 모았다가(끝이 점점 밝아지며 살짝 떨림) 몸 가운데 정면으로 찔러 에너지 볼을 날린다
  staffBolt: {
    duration: 0.95, hitAt: 0.76, equip: 'staff', // 쏘는 때: 관절이 따라와 완드가 앞으로 다 뻗은 뒤 (끝이 몸 가운데 정면)
    fn(u, P, fx) {
      const shake = Math.sin(u * 120) * 0.04 * sm(u, 0.3, 0.45) * (1 - sm(u, 0.58, 0.62)); // 모으는 동안 부르르
      P['shoulderR.rx'] = kf(u, [0, 0], [0.28, -1.6], [0.58, -1.65], [0.66, -1.4], [0.85, -1.4], [1, 0]) + shake;
      // 완드는 아래팔과 직각이라 팔을 들면 끝이 하늘을 향한다: 들 때는 손목을 조금 꺾어 대각선으로 들고,
      // 찌를 때는 손목을 아래로 더 꺾어 끝이 앞(살짝 아래)을 향하게. 손목을 옆으로는 꺾거나 비틀지 않는다
      P['handR.rx'] = kf(u, [0, 0], [0.28, 0.6], [0.58, 0.6], [0.66, 1.25], [0.85, 1.25], [1, 0]);
      // 어깨 옆 각도는 절대값: 쉴 때(-ARM_REST)에서 시작·끝난다. 들 때는 팔을 옆으로 벌려 지팡이가 머리 오른쪽 바깥에 서고(머리를 뚫지 않게),
      // 찌를 때는 앞으로 뻗은 팔을 몸 안쪽으로 밀어 지팡이 끝이 몸 가운데 정면에 오게 한다 (어깨 관절 자리는 그대로: 아래 shoulderIn = 0)
      P['shoulderR.rz'] = kf(u, [0, -ARM_REST], [0.28, -1.05], [0.58, -1.05], [0.66, 0.24], [0.85, 0.24], [1, -ARM_REST]);
      fx.shoulderIn = 0; // 팔을 들고 뻗는 동안 어깨 관절을 몸통 안쪽으로 옮기지 않는다 (villager.js followShoulders)
      P['shoulderL.rz'] = kf(u, [0, ARM_REST], [0.28, 0.8], [0.58, 0.8], [0.7, ARM_REST]); // 왼팔은 살짝 벌려 균형
      P['spine.rx'] = kf(u, [0, 0], [0.28, -0.12], [0.58, -0.14], [0.66, 0.2], [0.85, 0.15], [1, 0]); // 젖혔다가 앞으로
      fx.glow = kf(u, [0, 0.2], [0.28, 0.6], [0.58, 2], [0.74, 2], [0.82, 0.6], [1, 0]);
      fx.charge = kf(u, [0.3, 0], [0.58, 0.5], [0.74, 0.5], [0.76, 0]); // 끝에 모인 작은 기 (쏘는 순간 볼이 되어 날아간다)
    },
  },
  // 공격키를 꾹 누르고 있으면: 지팡이를 든 자세(staffBolt 의 BOLT_RAISED) 그대로 기를 모은다. 갈수록 끝의 빛 덩이가 커지고 더 세게 떨린다
  // (길이 BOLT.charge 동안 모으고 그 뒤로는 다 모은 자세 그대로. 공격키를 떼면 main.js 가 staffFire(덜 모음) / staffBig(다 모음) 으로 넘긴다)
  staffCharge: {
    duration: BOLT.charge, hold: true, equip: 'staff',
    fn(u, P, fx, sec) {
      ACTIONS.staffBolt.fn(BOLT_RAISED, P, fx);
      const k = 0.4 + 0.6 * u;
      P['shoulderR.rx'] += Math.sin(sec * 70) * 0.035 * k; // 모을수록 부르르
      P['spine.rx'] += Math.sin(sec * 53) * 0.015 * k;
      fx.glow = 2 + 1.2 * u;
      fx.charge = 0.5 + 0.5 * u * u * (BOLT.big * 2 - 1); // 볼 크기의 절반 → 다 모으면 큰 볼 크기
    },
  },
  // 강타(스킬) · 지팡이: A를 누르고 있는 동안 제자리에서 두 손으로 지팡이를 가슴 앞에 곧게 세워 쥐고, 눈을 감고 숨을 고르며 기를 모은다
  // (끝에 파란 기가 일렁이고, 둘레에서 파란 빛줄기가 끝으로 모여든다: main.js STRIKE_CHARGE). 떼거나 움직이거나 마나가 다 차면 main.js 가 끝낸다
  staffMeditate: {
    duration: 0.45, hold: true, equip: 'staff', expression: 'calm',
    fn(u, P, fx, sec) {
      const k = sm(u, 0, 1); // 처음 0.45초 동안 자세를 잡는다
      const br = Math.sin(sec * 2.6) * sm(sec, 0.3, 0.9); // 천천히 숨 쉬기
      crouch(P, 0.12 * k);
      // 위팔은 살짝 앞으로, 팔꿈치를 굽혀 아래팔이 앞으로 눕게: 아래팔과 직각인 지팡이가 곧게 선다. 두 손을 몸 가운데로 모은다
      P['shoulderR.rx'] = (-0.32 + br * 0.02) * k;
      P['elbowR.rx'] = -1.25 * k;
      P['handR.rx'] = -0.05 * k;
      P['shoulderR.rz'] = -ARM_REST + (ARM_REST - 0.12) * k;
      P['shoulderL.rx'] = (-0.3 + br * 0.02) * k;
      P['elbowL.rx'] = -1.3 * k;
      P['shoulderL.rz'] = ARM_REST - (ARM_REST - 0.14) * k;
      fx.shoulderIn = 0;
      P['spine.rx'] = (P['spine.rx'] ?? 0) + (0.04 + br * 0.02) * k;
      P['head.rx'] = (0.16 + br * 0.03) * k; // 고개를 살짝 숙인다
      fx.glow = (1.1 + 0.5 * Math.sin(sec * 5.2)) * k;
      fx.charge = (0.3 + 0.06 * Math.sin(sec * 5.2)) * sm(sec, 0.2, 0.6); // 끝에 작은 파란 기가 맥박처럼 일렁인다
    },
  },
  // 기를 모으던 자세에서 앞으로 찔러 쏘기: staffBolt 의 찌르기 부분만 (staffFire 보통 볼 · staffBig 다 모은 큰 볼)
  staffFire: fireFromRaised(1),
  staffBig: fireFromRaised(BOLT.big),
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
  // 화냄: 두 주먹을 허리 옆에 꽉 쥐고 발을 동동 구르며, 고개를 도리도리 (자꾸 맞으면). 발을 처음 구를 때 먼지
  angry: {
    duration: 1.5, hitAt: 0.2, expression: 'angry',
    fn(u, P) {
      const on = kf(u, [0, 0], [0.12, 1], [0.85, 1], [1, 0]);
      const s = Math.sin(u * PI * 2 * 4); // 동동 네 번
      const upR = Math.max(0, s) * on;
      const upL = Math.max(0, -s) * on;
      P['hipR.rx'] = -0.45 * upR;
      P['kneeR.rx'] = 0.85 * upR;
      P['footR.rx'] = -0.4 * upR;
      P['hipL.rx'] = -0.45 * upL;
      P['kneeL.rx'] = 0.85 * upL;
      P['footL.rx'] = -0.4 * upL;
      P['root.py'] = 0.015 * Math.abs(s) * on;
      // 주먹: 팔을 몸에 붙이고 팔꿈치를 굽혀 허리 옆에서 꽉 (위아래로 들썩)
      P['shoulderR.rz'] = -0.3 * on;
      P['shoulderL.rz'] = 0.3 * on;
      P['shoulderR.rx'] = P['shoulderL.rx'] = (-0.25 + 0.12 * s) * on;
      P['elbowR.rx'] = P['elbowL.rx'] = -1.25 * on;
      P['spine.rx'] = (0.14 + 0.05 * Math.abs(s)) * on;
      P['head.rx'] = 0.08 * on;
      P['head.ry'] = 0.22 * Math.sin(u * PI * 2 * 3) * on; // 도리도리
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
// 아파함: 맞아서 움찔하는 몸짓은 hit(깜짝)과 같고, 표정만 눈을 질끈 감고 입을 찡그린다 (몽둥이·잠자리채에 맞았을 때)
ACTIONS.hurt = { ...ACTIONS.hit, duration: 0.75, expression: 'hurt' };

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
  let off = 0;
  const wrap = (d) => Math.atan2(Math.sin(d), Math.cos(d));

  return {
    get action() { return name; },
    get progress() { return progress; },
    onEnd: null, // (이름, 다음 액션|null) — 일회성이 끝날 때 한 번
    // offset: 이 동작을 몇 초 지난 자리부터 이어서 재생할지 (뛰어오른 도중에 공중 공격으로 바꿀 때 높이가 그대로 이어지게)
    play(next, onHit, onComplete, offset = 0) {
      off = offset;
      name = ACTIONS[next] ? next : 'idle';
      start = null;
      hits = 0;
      done = false;
      cb = { onHit, onComplete };
    },
    update(rig, t, dt) {
      if (start === null) start = t - off;
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
        def.fn(u, target, fx, sec, off);
        // hitAfter: 이어받아 시작한 순간부터 몇 초 뒤가 타격인 동작 (공중 공격은 누른 때가 매번 다르다)
        const at = def.hitAfter != null ? [((off || def.offset || 0) + def.hitAfter) / def.duration] : [].concat(def.hitAt ?? []);
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
          // 공중제비 회전(root.rx)도 몸 위치처럼 rootRate 로: 공중제비 → 내리찍기로 넘어갈 때 밀려 있던 회전이 한 번에 따라잡아 튀지 않게
          cur[k] = THREE.MathUtils.lerp(c, c + wrap(goal - c), joint === 'root' ? aRoot : a);
          o.rotation[ch[1]] = cur[k];
        } else if (ch[0] === 'r') {
          cur[k] = THREE.MathUtils.lerp(c, goal, a);
          o.rotation[ch[1]] = cur[k];
        } else if (ch === 'sy') {
          cur[k] = THREE.MathUtils.lerp(c, goal, a);
          o.scale.y = o.scale.x * (1 + cur[k]); // 가로 크기(캐릭터 전체 배율)를 기준으로
        } else if (ch === 's') {
          cur[k] = THREE.MathUtils.lerp(c, goal, a);
          o.scale.setScalar(1 + cur[k]); // 관절 아래 통째로 (구를 때 큰 머리를 잠깐 줄인다)
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
