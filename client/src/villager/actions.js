// 액션 상태 머신: 액션 함수가 매 프레임 관절 목표값을 내놓고, 현재값은 lerp로 부드럽게 따라간다.
// 키 형식 '관절.축' — r?=회전(라디안), p?=쉬는 자리에서 옮긴 거리. 빠진 키는 0(기본 자세)으로 돌아간다.
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
  SIDES.forEach((s, i) => {
    const p = ph + i * PI;
    const hip = -Math.sin(p) * swing;
    const knee = bend + Math.max(0, Math.cos(p)) * lift;
    P[`hip${s}.rx`] = hip;
    P[`knee${s}.rx`] = knee;
    P[`foot${s}.rx`] = -(hip + knee) * 0.65;
  });
}

export const ACTIONS = {
  idle(t, P) {
    const b = Math.sin(t * 2.2);
    P['pelvis.py'] = b * 0.004;
    P['spine.rx'] = b * 0.015;
    P['head.rx'] = -b * 0.012;
    P['head.ry'] = Math.sin(t * 0.8) * 0.05;
    P['shoulderR.rz'] = -0.14 - b * 0.02;
    P['shoulderL.rz'] = 0.14 + b * 0.02;
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
    P['pelvis.py'] = -0.012 + Math.abs(Math.cos(ph)) * 0.016;
    P['pelvis.ry'] = sw * 0.08;
    P['spine.rx'] = 0.06;
    P['spine.ry'] = -sw * 0.12;
    P['head.rx'] = -0.02;
    P['head.ry'] = sw * 0.05;
    P['head.rz'] = sw * 0.03;
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
    P['pelvis.py'] = -0.02 + Math.abs(Math.cos(ph)) * 0.035;
    P['pelvis.ry'] = sw * 0.1;
    P['spine.rx'] = 0.28; // 상체를 앞으로
    P['spine.ry'] = -sw * 0.15;
    P['head.rx'] = -0.18; // 고개는 앞을 보도록 되돌림
  },

  jump(t, P) {
    // 1.4초 주기: 웅크림 → 도약(만세) → 착지 웅크림 → 회복
    const u = (t % 1.4) / 1.4;
    const air = u > 0.22 && u < 0.72 ? Math.sin((PI * (u - 0.22)) / 0.5) : 0;
    let c = 0;
    if (u < 0.22) c = sm(u, 0, 0.22);
    else if (u < 0.3) c = 1 - sm(u, 0.22, 0.3);
    else if (u > 0.72) c = u < 0.8 ? 0.7 * sm(u, 0.72, 0.8) : 0.7 * (1 - sm(u, 0.8, 1));
    crouch(P, c);
    P['root.py'] = air * 0.22;
    for (const s of SIDES) { // 공중에서 무릎을 살짝 접음
      P[`hip${s}.rx`] -= 0.35 * air;
      P[`knee${s}.rx`] += 0.6 * air;
    }
    const up = sm(u, 0.2, 0.32) * (1 - sm(u, 0.72, 0.85));
    armsUp(P, 0.15 + up * 2.35, 0.1 * up);
    // 웅크릴 때는 팔을 뒤로 젖혀 반동
    P['shoulderR.rx'] = P['shoulderL.rx'] = (u < 0.3 ? 0.7 * c : 0) - 0.4 * up;
    P['head.rx'] = -0.12 * up;
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
    P['pelvis.py'] = -0.006 + Math.sin(t * 2.2) * 0.004;
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

// 낚시 3단계 (연속 시퀀스에서도 같은 함수를 재사용)
const fishCast = (u, P, fx) => {
  P['shoulderR.rx'] = kf(u, [0, -0.3], [0.4, -2.4], [0.62, -0.5], [1, -0.55]);
  P['shoulderR.rz'] = kf(u, [0, 0.15], [0.4, -0.75], [0.62, 0.15]);
  P['elbowR.rx'] = -0.35;
  P['handR.rx'] = kf(u, [0.4, 0], [0.62, 0.45]);
  P['shoulderL.rx'] = kf(u, [0, 0], [0.62, -0.5], [1, -0.6]);
  P['elbowL.rx'] = -0.6;
  P['spine.rx'] = kf(u, [0, 0], [0.4, -0.12], [0.62, 0.16], [1, 0.05]);
  P['spine.ry'] = kf(u, [0, 0], [0.4, -0.25], [0.62, 0.1], [1, 0]);
  P['hipL.rx'] = kf(u, [0.3, 0], [0.62, -0.3], [1, -0.15]);
  fx.bobber = u > 0.62 ? 'water' : 'hang';
};
const fishWait = (t, P, fx) => {
  const b = Math.sin(t * 2.2);
  P['shoulderR.rx'] = -0.55 + Math.sin(t * 1.4) * 0.03;
  P['shoulderR.rz'] = 0.15;
  P['elbowR.rx'] = -0.35;
  P['handR.rx'] = 0.45;
  P['shoulderL.rx'] = -0.6;
  P['elbowL.rx'] = -0.6;
  P['spine.rx'] = 0.05 + b * 0.01;
  P['pelvis.py'] = b * 0.004;
  P['hipL.rx'] = -0.15;
  P['head.rx'] = 0.08;
  fx.bobber = 'water';
};
const fishCatch = (u, P, fx) => {
  P['shoulderR.rx'] = kf(u, [0, -0.55], [0.3, -2.4], [0.7, -2.3], [1, -0.4]);
  P['handR.rx'] = kf(u, [0, 0.45], [0.3, 0]);
  P['shoulderR.rz'] = kf(u, [0, 0.15], [0.3, -0.65], [0.7, -0.6], [1, 0]);
  P['elbowR.rx'] = kf(u, [0, -0.35], [0.3, -0.1]);
  P['shoulderL.rx'] = kf(u, [0, -0.6], [0.3, -2.1], [1, -0.3]);
  P['shoulderL.rz'] = kf(u, [0, 0], [0.3, 0.75], [1, 0.2]);
  P['spine.rx'] = kf(u, [0, 0.05], [0.3, -0.22], [1, 0]);
  P['root.py'] = kf(u, [0.25, 0], [0.4, 0.05], [0.55, 0]);
  P['head.rx'] = kf(u, [0, 0.08], [0.35, -0.25], [1, 0]);
  fx.bobber = u < 0.3 ? 'water' : 'hang';
};

Object.assign(ACTIONS, {
  // 생활
  gather: {
    duration: 1.8, hitAt: 0.5,
    fn(u, P) {
      crouch(P, kf(u, [0, 0], [0.3, 1.25], [0.65, 1.25], [0.9, 0]));
      P['spine.rx'] += kf(u, [0, 0], [0.3, 0.4], [0.65, 0.4], [0.9, 0]);
      P['head.rx'] = kf(u, [0, 0], [0.3, 0.3], [0.7, 0.1], [0.9, 0]);
      P['shoulderR.rx'] = kf(u, [0, 0], [0.32, -0.95], [0.5, -0.8], [0.75, -1.5], [1, 0]);
      P['shoulderR.rz'] = kf(u, [0, 0], [0.32, 0.25], [0.75, 0.3], [1, 0]);
      P['elbowR.rx'] = kf(u, [0.5, -0.1], [0.75, -1.1], [1, 0]);
      P['shoulderL.rx'] = kf(u, [0, 0], [0.3, -0.3], [0.75, -0.6], [1, 0]);
      P['elbowL.rx'] = kf(u, [0.5, 0], [0.75, -0.9], [1, 0]);
    },
  },
  chop: {
    duration: 1.3, hitAt: 0.55, equip: 'axe',
    fn(u, P) {
      // 오른쪽 어깨 위로 도끼를 넘겼다가(머리 옆) 앞으로 내려찍음, 왼손은 앞에서 거듦
      crouch(P, kf(u, [0.45, 0], [0.56, 0.45], [0.75, 0.4], [1, 0]));
      P['shoulderR.rx'] = kf(u, [0, 0], [0.42, -1.7], [0.55, -0.55], [0.75, -0.6], [1, 0]);
      P['shoulderR.rz'] = kf(u, [0, 0], [0.42, -1.2], [0.55, 0.3], [0.75, 0.3], [1, 0]);
      P['shoulderL.rx'] = kf(u, [0, 0], [0.42, -1.2], [0.55, -0.5], [0.75, -0.55], [1, 0]);
      P['shoulderL.rz'] = kf(u, [0, 0], [0.42, -0.2], [0.55, -0.35], [1, 0]);
      P['elbowR.rx'] = kf(u, [0, 0], [0.42, -0.25], [0.55, -0.1], [1, 0]);
      P['elbowL.rx'] = kf(u, [0, 0], [0.42, -0.9], [0.55, -0.2], [1, 0]);
      P['spine.rx'] += kf(u, [0, 0], [0.42, -0.15], [0.55, 0.4], [0.75, 0.35], [1, 0]);
      P['spine.ry'] = kf(u, [0, 0], [0.42, -0.2], [0.55, 0.12], [1, 0]);
      P['hipL.rx'] -= kf(u, [0, 0], [0.42, 0.25], [1, 0]);
    },
  },
  fishCast: { duration: 1.2, hitAt: 0.62, equip: 'rod', next: 'fishWait', fn: fishCast },
  fishWait: { loop: fishWait, equip: 'rod' },
  fishCatch: { duration: 1.1, hitAt: 0.3, equip: 'rod', expression: 'grin', fn: fishCatch },
  // 던지기 → 입질 대기 → 낚아채기를 한 번에 (5초)
  fish: {
    duration: 5, hitAt: 0.84, equip: 'rod',
    fn(u, P, fx, sec) {
      if (u < 0.24) fishCast(u / 0.24, P, fx);
      else if (u < 0.78) {
        fishWait(sec, P, fx);
        if (u > 0.66) P['shoulderR.rx'] += Math.sin(sec * 40) * 0.04; // 입질: 낚싯대가 파르르
      } else fishCatch((u - 0.78) / 0.22, P, fx);
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
        if (ch === 'ry') {
          // 세로축 회전(제자리 한 바퀴 등)은 가까운 쪽으로 돌도록 각도 차를 -π~π로 감는다
          cur[k] = THREE.MathUtils.lerp(c, c + wrap(goal - c), a);
          o.rotation.y = cur[k];
        } else if (ch[0] === 'r') {
          cur[k] = THREE.MathUtils.lerp(c, goal, a);
          o.rotation[ch[1]] = cur[k];
        } else {
          cur[k] = THREE.MathUtils.lerp(c, goal, a);
          o.position[ch[1]] = o.userData.rest[ch[1]] + cur[k];
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
