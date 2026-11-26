// 깍깍이: 까치 몬스터 (공격형 깡패). 늘 반쯤 감은 눈으로 째려보고, 비둘기보다 높이·멀리 날아다님
// 몸(makeMagpie·makeKkakkak)과 동작(KKAK_MOTIONS)은 몬스터 시안 화면(monsters.html?set=magpie, kkakkak, kkakkakWith)과 게임이 함께 쓴다
// 게임에서는 createKkakkak() 의 root 를 장면에 넣고 매 프레임 update(dt), 동작은 play('walk') 처럼 바꾼다 (구구와 같은 방식)
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { syncToon } from '../villager/toon.js';
import { canvasTexture } from '../villager/textures.js';
import { bump } from './haaknyang.js';
import { angerMark, angerPulse } from './anger.js';
import { makePigeon, STAND_Y, gease, gseg, poseSmoother } from './gugu.js';

const PI = Math.PI;
const mat = (color, rough = 0.6) => new THREE.MeshStandardMaterial({ color, roughness: rough });
function mesh(geo, m, parent, name = '부품') {
  const o = new THREE.Mesh(geo, m);
  o.name = name;
  o.castShadow = true;
  parent.add(o);
  return o;
}
const ball = (r, n = 32) => new THREE.SphereGeometry(r, n, Math.round(n * 0.75));

// ── 까치 몸 ──
// 사진 속 까치처럼: 머리·가슴·등·꽁지 밑은 검정, 배·옆구리·어깨는 흰색, 날개는 파랗게 빛나고 날개깃 끝은 검정,
// 꽁지는 길고 청록에서 보랏빛으로, 부리·다리는 검정. 흰 무늬는 전부 몸·날개 그림에 칠해서 이음매 없이
export function makeMagpie({ fat = 1, len = 1, neckH = 1, wing = 1.1, tail = 2.4, iris = '#4a3426', sheen = '#2f5fae' } = {}) {
  const P = makePigeon({ grey: '#1c1e26', wingC: sheen, tipC: '#14161c', neck: '#1c1e26', neck2: '#1c1e26', fat, wing, eye: 'dot', len, neckH, backLine: [[-0.0353, 0.0185], [-0.0236, 0.0226], [-0.0127, 0.0258], [0, 0.0288], [0.0127, 0.0314], [0.021, 0.0334], [0.0255, 0.035]], napeFill: 0.15, shoulderIn: 0.003,
    pied: '#f4f2ee', tailC: ['#1d5560', '#3b2c6e'], legC: '#1a1b20' });
  P.g.getObjectByName('코').visible = false; // 비둘기 부리 위 흰 혹은 없음
  const BEAK = mat('#17181c', 0.4);
  P.beak.geometry = new THREE.ConeGeometry(0.0052, 0.019, 12).rotateX(PI / 2).translate(0, -0.0015, 0.024); // 길고 단단한 윗부리
  P.beak.material = BEAK;
  P.jaw = new THREE.Group(); // 아랫부리: 깍깍 벌린다
  P.jaw.position.set(0, -0.0045, 0.015);
  P.head.add(P.jaw);
  mesh(new THREE.ConeGeometry(0.0034, 0.015, 10).rotateX(PI / 2).translate(0, 0, 0.0075), BEAK, P.jaw, '부리');
  // ── 까치 날개·꽁지: 비둘기의 통판 대신 깃털을 한 장씩 ──
  // 깃털 한 장: 뿌리(z=0)에서 뒤(-z)로 len 만큼 뻗은 납작한 타원. 그림은 위쪽이 뿌리, 아래쪽이 깃 끝
  const featherGeo = (len, wid, th = 0.0011) => ball(1, 18).rotateX(PI / 2).scale(wid / 2, th, len / 2).translate(0, 0, -len / 2);
  const fMat = (key, stops) => new THREE.MeshStandardMaterial({ roughness: 0.5, map: canvasTexture(`magpieFeather:${key}`, 8, 128, (g2, w, h) => {
    const gr = g2.createLinearGradient(0, 0, 0, h);
    stops.forEach(([o, c]) => gr.addColorStop(o, c));
    g2.fillStyle = gr;
    g2.fillRect(0, 0, w, h);
  }) });
  const PRIM = fMat('prim', [[0, '#f4f2ee'], [0.6, '#f4f2ee'], [0.72, '#15171d'], [1, '#15171d']]); // 첫째날개깃: 흰 깃에 검은 끝
  const SEC = fMat(`sec:${sheen}`, [[0, sheen], [0.65, sheen], [1, '#18223f']]); // 둘째날개깃: 파랗게 빛나고 끝은 짙게
  const TAILM = fMat('tail', [[0, '#1d5560'], [0.4, '#2a4a8a'], [0.82, '#3b2c6e'], [1, '#15171d']]); // 꽁지: 청록 → 파랑 → 보라, 끝은 검게
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const W = wing;
  // 덮깃: 날개 위쪽(앞 가장자리 ~ 깃 뿌리)을 덮는 매끈한 판 하나. 찍은 점을 지나는 둥근 윤곽을 두툼하게 뽑아 모서리를 둥글린다
  // 어깨에서 날개 끝까지 한 장으로 만들고 팔·손 두 뼈에 나눠 붙여(스키닝), 손목에서 꺾여도 이음매 없이 부드럽게 휜다
  const covertGeo = (pts, s) => {
    const P2 = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(s * x * W, z * W, 0)), true, 'centripetal').getPoints(64).slice(0, -1);
    let geo = new THREE.ExtrudeGeometry(new THREE.Shape(P2.map((v) => new THREE.Vector2(v.x, v.y))),
      { depth: 0.0004, bevelEnabled: true, bevelThickness: 0.0013, bevelSize: 0.0018, bevelSegments: 5, curveSegments: 4 }).rotateX(PI / 2);
    geo.deleteAttribute('uv');
    geo.deleteAttribute('normal');
    geo = mergeVertices(geo); // 모서리를 이어 붙여 매끈한 그늘
    geo.computeBoundingBox();
    const bb = geo.boundingBox, pos = geo.attributes.position, uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) { // u: 뿌리 0 → 바깥 1, v: 뒤 0 → 앞 1
      const u = (pos.getX(i) - bb.min.x) / (bb.max.x - bb.min.x);
      uv[i * 2] = s > 0 ? u : 1 - u;
      uv[i * 2 + 1] = (pos.getZ(i) - bb.min.z) / (bb.max.z - bb.min.z);
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    return geo;
  };
  // 팔 덮깃 그림: 짙은 남색 바탕에 뿌리 쪽 흰 어깨깃이 흐릿하게 번짐 (그림 위쪽이 앞 가장자리, 왼쪽이 뿌리)
  const COV_ARM = new THREE.MeshStandardMaterial({ roughness: 0.5, map: canvasTexture('magpieCovertArm', 64, 32, (g2, w, h) => {
    const gr = g2.createLinearGradient(0, h, 0, 0); // 앞 가장자리는 검푸르고 뒤로 갈수록 둘째날개깃과 같은 파랑 → 한 판으로 이어져 보임
    gr.addColorStop(0, sheen);
    gr.addColorStop(0.45, '#22346a');
    gr.addColorStop(1, '#161b2e');
    g2.fillStyle = gr;
    g2.fillRect(0, 0, w, h);
    const tip = g2.createLinearGradient(0, 0, w, 0); // 손 쪽 가는 앞선은 바깥 첫째날개깃의 검은 깃처럼
    tip.addColorStop(0.5, 'rgba(21,23,29,0)');
    tip.addColorStop(0.68, '#15171d');
    g2.fillStyle = tip;
    g2.fillRect(0, 0, w, h);
    g2.filter = 'blur(3px)';
    g2.fillStyle = '#f4f2ee';
    g2.beginPath(); g2.ellipse(w * 0.13, h * 0.45, w * 0.17, h * 0.5, 0, 0, PI * 2); g2.fill(); // 덮깃이 날개 끝까지 길어져 뿌리 쪽에만
    g2.filter = 'none';
  }) });
  P.wings.forEach(([arm, s, hand]) => {
    [arm, hand].forEach((o) => o.children.forEach((m) => { if (m.isMesh) m.visible = false; })); // 비둘기 날개판은 숨김
    // 팔: 짙은 남색 덮깃 + 뿌리의 흰 어깨깃 + 뒤로 나란한 파란 둘째날개깃
    // 덮깃 한 장 (팔 자리 기준, 손은 x 0.035 부터): 앞 가장자리는 어깨에서 날개 끝까지 한 줄로 둥글게
    const cgeo = covertGeo([[-0.004, 0.0045], [0.01, 0.0105], [0.025, 0.013], [0.04, 0.0115], [0.055, 0.0095], [0.07, 0.0065], [0.082, 0.003], [0.089, 0.0004],
      [0.084, -0.0006], [0.07, 0.0012], [0.058, -0.0005], [0.05, -0.0045], [0.044, -0.007], [0.03, -0.009], [0.012, -0.0095], [0, -0.008], [-0.005, 0.0]], s);
    const cpos = cgeo.attributes.position, si = [], sw = [];
    for (let i = 0; i < cpos.count; i++) { // 손목(x 0.035) 앞뒤로 팔 뼈 → 손 뼈로 스르르 넘어감
      const k = gease(THREE.MathUtils.clamp((Math.abs(cpos.getX(i)) / W - 0.029) / 0.012, 0, 1));
      si.push(0, 1, 0, 0);
      sw.push(1 - k, k, 0, 0);
    }
    cgeo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    cgeo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    const armBone = new THREE.Bone(), handBone = new THREE.Bone();
    arm.add(armBone);
    hand.add(handBone);
    const cv = new THREE.SkinnedMesh(cgeo, COV_ARM);
    cv.name = '날개';
    cv.castShadow = true;
    cv.position.y = 0.0012; // 깃털 뿌리 위에 얹힘
    arm.add(cv);
    P.g.updateMatrixWorld(true);
    cv.bind(new THREE.Skeleton([armBone, handBone]));
    // 몸통 옆에서 손목까지 빈틈없이 늘어서, 뒷가장자리가 첫째날개깃까지 한 줄로 이어짐 (넓적한 까치 날개)
    arm.userData.secs = [0, 1, 2, 3, 4, 5, 6].map((i) => {
      const f = mesh(featherGeo((0.034 - i * 0.0008) * W, 0.0095 * W), SEC, arm, '날개');
      f.position.set(s * (0.002 + i * 0.0053) * W, -0.0004 * i, 0.002 * W);
      f.userData.spread = i * 0.055; // 바깥 깃일수록 살짝 바깥으로 → 첫째날개깃 부채로 이어짐
      return f;
    });
    // 손: 손가락처럼 갈라진 첫째날개깃 6장. 가운데가 제일 길어 끝이 둥근 까치 날개
    hand.userData.prims = [0.034, 0.042, 0.046, 0.046, 0.042, 0.036].map((len, i) => {
      const f = mesh(featherGeo(len * W, 0.0085 * W), PRIM, hand, '날개');
      f.position.set(s * (0.002 + i * 0.0022) * W, -0.0003 * i, 0.003 + i * 0.0006); // 바깥 깃일수록 앞으로: 맨 바깥 깃이 앞 가장자리를 이어감
      f.userData.spread = 0.45 + i * 0.22; // 안쪽(뒤로) → 바깥쪽(옆으로) 부채꼴, 맨 바깥 깃은 덮깃 앞선과 한 줄
      P.probes.push([f, V(0, 0, -len * W), 0.0025]);
      return f;
    });
  });
  // 꽁지: 가운데가 제일 길고 바깥으로 갈수록 짧아지는 깃 9장 (계단 꽁지). tailBob 은 날갯짓 따라 까딱
  P.tail.children.forEach((m) => { if (m.isMesh) m.visible = false; });
  P.tailBob = new THREE.Group();
  P.tail.add(P.tailBob);
  const TL = [0.12, 0.104, 0.088, 0.072, 0.056].map((l) => l * tail / 2.9);
  P.tailF = [];
  TL.forEach((len, i) => [-1, 1].forEach((s) => {
    if (i === 0 && s > 0) return; // 가운데 깃은 한 장
    const f = mesh(featherGeo(len, 0.0085, 0.0012), TAILM, P.tailBob, '꼬리');
    f.position.set(s * i * 0.0012, -i * 0.0006, 0.004 - i * 0.001); // 가운데 깃이 맨 위
    f.userData.fan = s * i;
    P.tailF.push(f);
  }));
  P.probes.push([P.tailF[0], V(0, 0, -TL[0]), 0.0025], [P.tailF[1], V(0, 0, -TL[1]), 0.0025], [P.tailF[2], V(0, 0, -TL[1]), 0.0025]);
  // 깃 펴고 접기: 동작이 날개·꽁지 뼈만 움직이면 여기서 깃털을 따라 맞춘다
  //  - 날개를 뒤로 접을수록(foldWings·sweep) 첫째날개깃 부채를 오므려 팔 방향으로 겹침, P.open 으로 손가락깃 벌림 조절
  //  - 꽁지 부채: 비둘기 동작처럼 P.tail.scale.x 를 키우거나 P.tailFan 을 주면 깃을 옆으로 벌림
  P.open = 1;
  P.tailFan = 0;
  const shapeFeathers = () => {
    P.wings.forEach(([arm, s, hand]) => {
      const fold = P.wingFold > 0 ? P.wingFold : THREE.MathUtils.clamp((s * arm.rotation.y) / 1.45, 0, 1);
      // 접으면 둘째날개깃도 팔 방향(뒤)으로 눕혀 기와처럼 겹침 (아래로 늘어지지 않게)
      arm.userData.secs.forEach((f, i) => (f.rotation.y = -s * THREE.MathUtils.lerp(f.userData.spread, 1.38 + i * 0.03, fold)));
      hand.userData.prims.forEach((f, i) => {
        const open = 0.95 + (f.userData.spread - 0.95) * P.open;
        f.rotation.y = -s * THREE.MathUtils.lerp(open, 1.5 + (i - 2.5) * 0.02, fold);
      });
    });
    const k = Math.max(0, P.tail.scale.x - 1) + P.tailFan;
    P.tail.scale.x = 1;
    P.tailF.forEach((f) => (f.rotation.y = -f.userData.fan * (0.03 + 0.1 * k)));
  };
  // 땅에서 날개 접기 (k: 0 그대로 ~ 1 접음): 실제 까치처럼 날개를 세워 몸통 옆구리에 착 붙인다
  // 날개 끝은 뒤로, 앞 가장자리(덮깃·흰 어깨깃)는 위로, 둘째날개깃은 옆구리를 덮으며 아래로. 손은 펴서 첫째날개깃이 꽁지 위로 겹쳐 뻗음
  P.wingFold = 0;
  const FOLD_Q = {}, ID_Q = new THREE.Quaternion(), foldAt = new THREE.Vector3();
  const FOLD_LEAN = 0.3, FOLD_YAW = 0.22;
  [-1, 1].forEach((s) => (FOLD_Q[s] = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(0, 0, -s), V(-s, 0, 0), V(0, 1, 0)))));
  P.foldWings = (k) => {
    P.wings.forEach(([w, s, h]) => {
      w.quaternion.slerp(FOLD_Q[s], k);
      // 몸통 가장 넓은 곳 + 덮깃 두께만큼 바깥 (몸을 뚫지 않게), 높이는 날개 윗선이 등선보다 낮게 (옆에서 볼 때 등선이 매끈하게)
      w.position.lerp(foldAt.set(s * (0.034 * fat + 0.0015), 0.031 * fat * 0.72 - 0.0165 * W, 0.016 * len), k);
      w.rotateX(s * FOLD_LEAN * k); // 윗가장자리를 몸 쪽으로 기울여 둥근 옆구리에 붙임 (앞에서 볼 때 귀처럼 벌어지지 않게)
      w.rotateZ(s * FOLD_YAW * k); // 날개 끝은 안쪽으로 모아 꽁지 위에 얹음 (뒤에서 볼 때 V 자로 벌어지지 않게)
      h.quaternion.slerp(ID_Q, k);
    });
    P.wingFold = k;
  };
  const keep = P.keepAbove, plant = P.plant;
  P.keepAbove = (h) => { shapeFeathers(); keep(h); };
  P.plant = (h, k) => { shapeFeathers(); plant(h, k); };
  // 까치 날갯짓: 내려칠 때 손가락깃을 쫙 벌리고 올릴 때 모음, 긴 꽁지는 날갯짓 반대로 까딱
  const flap = P.flap;
  P.flap = (t, speed = 14, amp = 0.9, base = 0.2) => {
    const a = flap(t, speed, amp, base);
    P.open = 0.65 + 0.35 * Math.max(0, -Math.sin(t * speed + 0.5));
    P.tailBob.rotation.x = Math.sin(t * speed - 0.6) * 0.06 * amp;
    return a;
  };
  // 눈은 튀어나오지 않게 머리에 그린 것처럼: 머리 겉면과 같은 둥근 곡면 조각(구의 뚜껑)을 머리 표면에 딱 붙여서 겹겹이 칠함
  // 납작한 판은 가장자리가 머리 곡면에서 떠서 튀어나와 보이므로, 머리와 거의 같은 반지름 R 의 곡면으로 만든다. 외곽선 없음
  // 눈썹도 검은 선으로 그려서 안쪽으로 내리깐다 (성난 눈)
  const R = 0.016; // 눈 자리의 머리 겉면 곡률 반지름쯤
  const cap = (r, out) => new THREE.SphereGeometry(R + out, 24, 6, 0, PI * 2, 0, Math.asin(r / R)).rotateX(PI / 2).translate(0, 0, -R); // 꼭대기가 z=out
  const paint = (geo, color, e, name = '눈') => { const m = mesh(geo, mat(color, 0.4), e, name); m.userData.noOutline = true; return m; };
  P.brows = P.eyes.map((e, i) => {
    const s = i ? 1 : -1;
    e.position.x = s * 0.0136; // 눈 가운데를 머리 겉면 위로 (원래 자리는 겉면보다 1mm 바깥)
    e.children.forEach((p) => (p.visible = false)); // makePigeon 의 둥근 눈동자는 숨김
    paint(cap(0.0056, 0.0002), iris, e);
    paint(cap(0.0032, 0.0004), '#0b0b0d', e).position.x = s * 0.0006;
    paint(cap(0.0011, 0.0006), '#ffffff', e).position.set(s * 0.0012, 0.0016, 0);
    const b = paint(cap(0.0045, 0.0004).scale(1, 0.22, 1), '#0e0f13', e, '눈썹');
    b.position.set(s * 0.0012, 0.0066, -0.0012); // 눈에서 떨어진 만큼 머리가 휘어 들어가니 그만큼 안으로
    b.rotation.z = s * 0.55;
    return b;
  });
  P.mark = angerMark();
  P.mark.position.set(0.012, 0.03, -0.004);
  P.head.add(P.mark);
  P.angry = (t, on = 1) => { P.mark.visible = on > 0; P.mark.scale.setScalar(0.022 * angerPulse(on ? t % 10 : -1, t)); };
  return P;
}
export const caw = (P, t, rate = 1.6) => { const k = bump(t % rate, 0, 0.25); P.jaw.rotation.x = k * 0.55; P.head.rotation.x -= k * 0.3; return k; };

// ── 깍깍이 ──
// 기본 체형: 몸통은 짧고 살짝 통통, 목은 짧아 머리가 어깨에 얹힘 (몸 모양 자체로). size: 전체 크기
export const KK_BODY = { fat: 0.92, len: 0.55, neckH: 0.72, wing: 1.35, tail: 2.9, size: 0.72 }; // 체형 시안의 '꼬마' (작고 동글동글)
export function makeKkakkak(look = {}) {
  const { size, ...shape } = { ...KK_BODY, ...look };
  const P = makeMagpie(shape);
  // 전체 크기는 고르게 (목덜미가 꺾이지 않게). reset 이 크기를 되돌리니 매번 다시
  P.slim = () => P.body.scale.setScalar(size);
  P.slim();
  P.tailBob.scale.z = 1.1; // 몸은 작아도 꽁지는 길게
  P.brows.forEach((b, i) => { b.rotation.z = (i ? 1 : -1) * 0.75; b.position.y = 0.0052; }); // 더 내리깐 눈썹
  P.glare =(k = 0.45) => P.blink(k); // 째려보는 반쯤 뜬 눈
  return P;
}
// 매 프레임 처음 자세로 되돌린 뒤 동작을 얹는다 (구구 동작 시안과 같은 방식이라 구구 동작도 그대로 빌려 씀)
export const kReset = (P, t) => {
  P.reset(); P.slim(); P.angry(t, 0);
  P.wingFold = 0; P.open = 1; P.tailFan = 0; P.tailBob.rotation.x = 0; // 깃털 상태도 처음으로
};
// 동작 목록: { name, desc, update(P, t, X), extra(P) → X }. 매 프레임 kReset 한 뒤 update 를 부름 (시안 화면·게임이 같이 씀)
export const KKAK_MOTIONS = [];
const kmotion = (name, desc, update, extra) => KKAK_MOTIONS.push({ name, desc, update, extra });
// 땅에 선 자세: 날개 접고 몸은 수평에 가깝게 (까치는 비둘기보다 꼿꼿하지 않고 꽁지를 들고 섬)
// 날갯짓 위상: 빠르기가 바뀌는 동작은 sin(t × 빠르기) 로 하면 t 가 클수록 박자가 미친 듯이 빨라지고 바뀌는 순간 툭 튐.
// 빠르기를 시간에 따라 쌓아(적분) 위상을 만든다. period 마다 같은 빠르기 곡선이 되풀이 → 지난 바퀴 몫을 더해 이어 붙임. P.flap(위상, 1, …) 로 씀
export const kPhase = (t, period, speed, n = 48) => {
  const I = (to) => { let sum = 0; const h = to / n; for (let i = 0; i < n; i++) sum += speed((i + 0.5) * h) * h; return sum; };
  return Math.floor(t / period) * I(period) + I(t % period);
};
export const kStand = (P, fold = 1) => { P.foldWings(fold); P.fly.position.y = STAND_Y; P.body.rotation.x = 0.05; };

// ── 게임에 쓸 동작 ──
kmotion('대기', '파닥파닥 몇 번 치고 날개 반쯤 접어 쓱 미끄러짐, 꽁지 길게 끌며 물결', (P, t) => {
  const c = t % 2.4;
  const gl = gease(gseg(c, 1.1, 1.3)) * (1 - gease(gseg(c, 2.1, 2.3))); // 미끄러지는 동안
  P.flap(t, 18, 0.95 * (1 - gl), 0.2);
  P.wings.forEach(([w, s, h]) => { w.rotation.z = THREE.MathUtils.lerp(w.rotation.z, s * 0.1, gl); h.rotation.z = THREE.MathUtils.lerp(h.rotation.z, -s * 0.1, gl); });
  P.sweep(gl * 0.35); // 까치는 날개를 반쯤 뒤로 당긴 채 미끄러짐
  P.open = THREE.MathUtils.lerp(P.open, 0.5, gl);
  P.fly.position.y += (c < 1.2 ? c / 1.2 : 1 - (c - 1.2) / 1.2) * 0.012; // 파닥일 땐 오르고 미끄러질 땐 내려감
  P.head.rotation.y = Math.sin(t * 1.3) > 0 ? 0.4 : -0.4; // 고개 휙휙 두리번
  P.glare();
});

kmotion('이동', '빠르게 파닥파닥, 잠깐씩 날개 접고 쑥, 꽁지는 곧게', (P, t) => {
  const c = t % 1.6;
  const shut = bump(c, 1.1, 1.5); // 잠깐 날개 접고 쑥
  P.flap(t, 22, 1.0 * (1 - shut), 0.1);
  P.sweep(shut * 0.9);
  P.open *= 1 - shut;
  P.body.rotation.x = 0.15;
  P.head.position.z += 0.005;
  P.head.rotation.x = -0.15;
  P.fly.position.y += -shut * 0.01 + Math.sin(t * 22) * 0.002 * (1 - shut);
  P.fly.position.z += shut * 0.012; // 날개 접을 때 앞으로 쑥 (실제 이동은 게임이 맡음, 시안에서 뒤로 순간이동하지 않게 제자리)
  P.glare();
});

kmotion('깡총걷기', '두 발 모아 깡총깡총, 서면 꽁지 까딱, 돌아서 다시', (P, t) => {
  const c = t % 3.2;
  const d = Math.floor(t / 3.2) % 2 ? -1 : 1; // 한 번 가고 나면 돌아서 되돌아옴 (제자리로 순간이동하지 않게)
  kStand(P);
  P.fly.rotation.y = (d > 0 ? 0 : PI) + gease(gseg(c, 2.8, 3.2)) * PI; // 서 있다 끝에 휙 돌아섬
  let hop = 0;
  if (c < 2) {
    const ph = (c * 2.5) % 1; // 한 번 뛰는 동안 0→1
    hop = Math.sin(ph * PI);
    P.fly.position.z = d * ((c / 2) * 0.06 - 0.03); // 앞으로 깡총
    P.feet.forEach((f) => (f.rotation.x = hop * 0.7)); // 뜬 동안 두 발을 같이 뒤로
    P.tail.rotation.x = bump(ph, 0.75, 1) * 0.35; // 내려앉을 때마다 꽁지 까딱
    P.body.rotation.x -= hop * 0.15;
  } else {
    P.fly.position.z = d * 0.03;
    P.head.rotation.y = Math.sign(Math.sin(c * 5)) * 0.5 * (1 - gseg(c, 2.6, 2.8)); // 고개 휙휙, 돌아서기 전엔 앞으로
    P.tail.rotation.x = bump(c, 2.3, 2.6) * 0.4;
  }
  P.plant(0);
  P.fly.position.y += hop * 0.02;
  P.glare();
});

kmotion('서서 깍깍', '서서 꽁지 까딱까딱, 고개 휙휙, 깍깍깍', (P, t) => {
  const c = t % 3;
  kStand(P);
  P.tail.rotation.x = Math.max(0, Math.sin(t * 7)) * 0.3;
  P.head.rotation.y = c < 1.5 ? 0.5 : -0.5;
  if (c > 1.8) { // 깍깍깍: 부리 벌릴 때마다 몸이 들썩, 꽁지도 같이 튐 (끝에서 뚝 끊기지 않게 잦아듦)
    const k = Math.abs(Math.sin(c * 14)) * (1 - gease(gseg(c, 2.75, 2.95)));
    P.jaw.rotation.x = k * 0.5;
    P.body.rotation.x -= k * 0.08;
    P.tail.rotation.x += k * 0.2;
  }
  P.plant(0);
  P.glare();
});

kmotion('발견!', '목 쭉, 꽁지 번쩍, 한쪽 눈으로 보며 깍깍깍 경보', (P, t) => {
  const c = t % 2.6;
  const k = gease(gseg(c, 0.1, 0.3)) * (1 - gease(gseg(c, 2.2, 2.5)));
  kStand(P, 1 - k * 0.3);
  P.body.rotation.x -= k * 0.3; // 몸을 세움
  P.neck.scale.y *= 1 + k * 0.3;
  P.head.position.y += k * 0.008;
  P.head.rotation.y = k * 0.8;
  P.tail.rotation.x = k * 0.6;
  const ch = Math.abs(Math.sin(c * 16)) * gease(gseg(c, 0.55, 0.7)) * (1 - gease(gseg(c, 1.95, 2.15))); // 깍깍 시작·끝은 스르르
  P.jaw.rotation.x = ch * 0.5;
  P.wings.forEach(([w, s]) => (w.rotation.z += s * ch * 0.15)); // 깍 할 때마다 날개 들썩
  P.plant(0);
  P.angry(t, k > 0.5 ? 1 : 0);
});

kmotion('화남!', '고개 낮춰 노려보며 날개 반쯤 펴 부르르, 꽁지 부채', (P, t) => {
  const c = t % 3.2;
  const k = gease(gseg(c, 0.15, 0.4)) * (1 - gease(gseg(c, 2.8, 3.1)));
  kStand(P, 1 - k * 0.6);
  P.wings.forEach(([w, s]) => (w.rotation.z += s * k * (0.3 + Math.sin(t * 40) * 0.05)));
  P.body.rotation.x += k * 0.3; // 앞으로 숙여 들이받을 자세
  P.head.rotation.x = -k * 0.25; // 고개는 들어 노려봄
  P.tail.rotation.x = k * 0.5;
  P.tail.scale.x = 1 + k * 0.9;
  P.neck.scale.multiplyScalar(1 + k * 0.25);
  P.jaw.rotation.x = k * (0.3 + Math.abs(Math.sin(t * 12)) * 0.2);
  P.fly.position.x = Math.sin(t * 45) * 0.001 * k; // 부르르
  P.plant(0);
  P.glare(0.55);
  P.angry(t, k > 0.1 ? 1 : 0);
});

kmotion('공격 (할퀴기)', '솟구쳤다 발톱 내밀고 덮쳐 할퀴고 콕콕', (P, t) => {
  const c = t % 2.6;
  const up = gease(gseg(c, 0.1, 0.5)), dive = gease(gseg(c, 0.5, 0.75)), back = gease(gseg(c, 1.8, 2.5));
  const hit = c > 0.75 && c < 1.8;
  const hk = gease(gseg(c, 0.68, 0.85)) * (1 - gease(gseg(c, 1.7, 1.95))); // 할퀴는 자세로 들어가고 나오는 정도 (뚝 꺾이지 않게)
  P.fly.position.y += up * 0.04 - dive * 0.1 + back * 0.06;
  P.fly.position.z = dive * 0.05 * (1 - back);
  const ph = kPhase(t, 2.6, (x) => (x < 0.75 ? 18 : x < 1.8 ? 26 : 18 + 8 * gease(gseg(x, 1.8, 2.5))));
  if (c > 0.5 && c <= 0.75) { P.glide(0.2); P.sweep(0.8 * (1 - gseg(c, 0.68, 0.75))); } // 날개 접고 쑥
  else if (hit) P.flap(ph, 1, 0.7 + 0.3 * (1 - hk), 0.2 + 0.4 * hk); // 날개 높이 들고 버둥
  else P.flap(ph, 1, 1.0, 0.2);
  const air = -up * 0.3 * (1 - dive) + dive * 0.4 * (1 - back);
  P.body.rotation.x = THREE.MathUtils.lerp(air, -0.6, hk); // 덮칠 땐 몸 세워 발을 앞으로
  const scratch = Math.sin((c - 0.75) * 24) * hk;
  P.feet.forEach((f, i) => (f.rotation.x = THREE.MathUtils.lerp(1.3, -0.6 + (i ? scratch : -scratch) * 0.4, hk))); // 두 발 번갈아 할퀴기
  const peck = hit ? Math.max(0, Math.sin((c - 0.75) * 15)) * hk : 0;
  P.head.rotation.x = hk * 0.3 + peck * 0.5;
  P.head.position.z += peck * 0.008;
  P.tail.scale.x = 1 + hk * 0.6;
  P.tail.rotation.x = -hk * 0.3;
  P.glare(hit ? 0 : 0.45);
  P.angry(t, hit ? 1 : 0);
});

// 깃털 몇 장: 까치는 검은 깃·흰 깃이 섞여 펑. 얇은 깃 모양(가운데 깃대, 끝이 뾰족)에 외곽선 없이,
// 펑 튀어 나간 뒤 나뭇잎처럼 좌우로 흔들리며 천천히 내려앉다가 작아지며 사라짐
const KFEATHER = (() => {
  const g = ball(1, 14).scale(0.0026, 0.0003, 0.0075);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { // 뿌리 쪽(-z)은 좁고 끝(+z)은 둥글게, 살짝 휘게
    const t = p.getZ(i) / 0.0075;
    p.setX(i, p.getX(i) * (0.55 + 0.45 * (t + 1) / 2));
    p.setY(i, p.getY(i) + 0.0012 * t * t);
  }
  g.computeVertexNormals();
  return g;
})();
const KQUILL = new THREE.CylinderGeometry(0.0002, 0.00022, 0.0135, 5).rotateX(PI / 2).translate(0, 0.0004, -0.0024); // 깃대: 뿌리 쪽만 살짝 삐져나옴
export const kPuff = (P, n = 6) => {
  const fs = [];
  for (let i = 0; i < n; i++) {
    const f = mesh(KFEATHER, mat(i % 2 ? '#f4f2ee' : '#1c1e26', 0.8), P.g, '깃털');
    f.userData.noOutline = true;
    const q = mesh(KQUILL, mat(i % 2 ? '#d8d4cc' : '#2c2f3a', 0.8), f, '깃털');
    q.userData.noOutline = true;
    f.visible = false;
    fs.push(f);
  }
  return (u, at) => fs.forEach((f, i) => {
    f.visible = u > 0 && u < 1.8;
    if (!f.visible) return;
    const a = (i / n) * PI * 2 + 0.4;
    const out = 1 - Math.exp(-u * 7); // 펑
    const sway = Math.sin(u * 6 + i * 1.7) * Math.min(1, u * 2); // 떨어지며 좌우로 살랑
    f.position.set(
      at.x + Math.cos(a) * 0.045 * out + sway * 0.006,
      Math.max(0.002, at.y + 0.025 * out - Math.max(0, u - 0.25) * 0.035),
      at.z + Math.sin(a) * 0.045 * out,
    );
    f.rotation.set(0.5 + sway * 0.5, a + u * 1.5, sway * 0.7);
    f.scale.setScalar(1.3 * (1 - gease(gseg(u, 1.3, 1.8)))); // 작아지며 사라짐 (툭 꺼지지 않게)
  });
};

kmotion('맞음', '깍! 비명, 검고 흰 깃털 펑, 꽁지 쫙 펴지며 뒤로 튕김', (P, t, X) => {
  const c = t % 1.6;
  const k = c > 0.1 ? Math.exp(-(c - 0.1) * 5) : 0;
  P.fly.position.z = -k * 0.05;
  P.fly.position.y += k * 0.02;
  P.body.rotation.x = -k * 0.9;
  P.body.rotation.z = Math.sin(c * 30) * k * 0.3;
  P.wings.forEach(([w, s, h], i) => { // 엇박자로 허우적
    w.rotation.z = s * (0.3 + Math.sin(t * 34 + i * 2) * (0.4 + k));
    h.rotation.z = s * Math.sin(t * 34 + i * 2 - 1) * 0.5;
  });
  P.tailFan = k * 1.5;
  P.tail.rotation.x = k * 0.5;
  P.jaw.rotation.x = k * 0.6; // 깍!
  P.head.rotation.x = -k * 0.4;
  P.feet.forEach((f) => (f.rotation.x = 1.3 - k * 1.2));
  P.blink(c > 0.1 && c < 0.7 ? 1 : 0);
  X.puff(c - 0.1, P.fly.position);
}, (P) => ({ puff: kPuff(P) }));

kmotion('쓰러짐', '비틀비틀 퍼덕이다 툭 떨어져 옆으로 픽, 꽁지 펼친 채 발만 파르르', (P, t, X) => {
  const c = t % 4;
  const fall = gseg(c, 0.6, 1.1);
  const land = c > 1.1;
  const lie = gease(gseg(c, 1.0, 1.3));
  if (!land) {
    P.flap(kPhase(t, 4, (x) => 12 + x * 10), 1, 0.9 - fall * 0.5, 0.2); // 점점 다급하게
    P.body.rotation.z = Math.sin(c * 9) * 0.3 * (1 - fall); // 비틀비틀
  }
  if (lie > 0) {
    P.foldWings(lie);
    P.wings.forEach(([w, s]) => { if (s > 0) w.rotation.x -= 0.6 * lie; }); // 위쪽 날개는 힘없이 반쯤 벌어짐
  }
  P.fly.position.y = land ? 0.03 + bump(c, 1.1, 1.3) * 0.01 : 0.13 - 0.1 * fall * fall;
  P.body.rotation.z += lie * PI / 2; // 옆으로 픽
  P.tailFan = lie * 1.2;
  P.blink(gseg(c, 0.5, 1.1));
  P.feet.forEach((f, i) => (f.rotation.x = land ? 0.3 + Math.sin(t * 22 + i) * 0.35 * Math.max(0, 1 - (c - 1.3) * 1.2) : 1.3));
  X.puff(c - 1.1, new THREE.Vector3(0, 0.02, 0));
  P.fly.scale.setScalar(gease(gseg(c, 0, 0.2)) * (1 - gease(gseg(c, 3.4, 3.85)))); // 쓰러진 뒤 스르르 사라졌다 다시 (누운 채 공중으로 순간이동하지 않게)
}, (P) => ({ puff: kPuff(P, 4) }));

kmotion('등장', '꽁지 쫙 펴고 활공해 내려와 퍼덕 브레이크, 깡총 착지 후 꽁지 까딱', (P, t) => {
  const c = t % 2.8;
  if (c < 1.35) { // 공중: 활공 → 브레이크
    const k = gseg(c, 0, 0.9);
    const brake = bump(c, 0.7, 1.35);
    P.fly.scale.setScalar(gease(gseg(c, 0, 0.2))); // 스르르 나타남
    if (c < 0.7) P.glide(0.25);
    else { const r = gease(gseg(c, 0.7, 0.85)); P.flap(t, 24, 1.1 * r, 0.25 + 0.1 * r); } // 활공 자세에서 스르르 퍼덕이기 시작
    P.fly.position.y += (1 - gease(k)) * 0.22 - gease(gseg(c, 0.9, 1.35)) * 0.08;
    P.fly.position.z = (1 - gease(k)) * -0.1;
    P.body.rotation.x = 0.1 * (1 - k) - brake * 0.7; // 몸 세워 브레이크
    P.tailFan = c < 0.7 ? 1 : 1 + brake;
    P.tail.rotation.x = brake * 0.5;
    P.feet.forEach((f) => (f.rotation.x = 1.3 - gseg(c, 0.7, 1.1) * 1.6)); // 발 앞으로 쭉
  } else { // 땅: 날개 착 접고 깡총, 꽁지 까딱
    const f = gease(gseg(c, 1.35, 1.65));
    P.flap(t, 24, 1.1 * (1 - f), 0.35 * (1 - f)); // 브레이크 날갯짓이 잦아들며 접힘 (뚝 바뀌지 않게)
    kStand(P, f);
    P.tailFan = 1 - gease(gseg(c, 1.35, 1.8));
    P.feet.forEach((fo) => (fo.rotation.x = -0.3 * (1 - f)));
    P.tail.rotation.x = bump(c, 1.95, 2.25) * 0.5;
    P.fly.scale.setScalar(1 - gease(gseg(c, 2.55, 2.8))); // 다시 내려오기 전에 스르르 사라짐
    P.plant(0);
    P.fly.position.y += bump(c, 1.6, 1.9) * 0.012;
  }
  P.glare();
});

// 모양 보기용: 날개를 활짝 편 채 가만히 (날개 윤곽·깃 배치 확인)
kmotion('날개 펼침', '모양 보기용: 날개 활짝 편 채 멈춤', (P) => {
  P.glide(0.05);
  P.open = 1;
  P.fly.position.y = 0.14;
});

// ── 성격 (깡패) 동작 ──

kmotion('텃세', '내 구역 위를 빙빙 돌며 깍! 깍!', (P, t) => {
  P.flap(t, 12, 0.8);
  P.fly.rotation.y = -t * 1.4;
  P.fly.position.set(-Math.sin(t * 1.4) * 0.04, 0.17 + Math.sin(t * 2.8) * 0.01, -Math.cos(t * 1.4) * 0.04);
  P.body.rotation.z = 0.35;
  P.head.rotation.set(0, 0, -0.2);
  P.glare(caw(P, t, 0.7) > 0.3 ? 0 : 0.45); // 깍 할 때만 눈을 부릅뜸
  P.angry(t, 1);
});

kmotion('째려보기', '공중에 멈춰 턱 들고 위아래로 훑어봄', (P, t) => {
  const c = t % 4;
  P.flap(t, 10, 0.75);
  P.fly.position.y = 0.15 + Math.sin(t * 10) * 0.003;
  P.body.rotation.x = -0.15; // 가슴 쭉
  const scan = gease(gseg(c, 0.6, 1.6)) * (1 - gease(gseg(c, 2.2, 3.2))); // 위에서 아래로 훑었다 다시
  P.head.rotation.set(-0.35 + scan * 0.6, Math.sin(t * 0.7) * 0.15, 0.25); // 고개 삐딱
  P.jaw.rotation.x = 0;
  P.glare(0.55);
  P.angry(t, 0);
});

kmotion('시비걸기', '코앞까지 와서 고개 들이밀며 깍깍', (P, t) => {
  const c = t % 3;
  const near = gease(gseg(c, 0.2, 0.6)) * (1 - gease(gseg(c, 2.3, 2.9)));
  P.flap(t, 14, 0.7, 0.3);
  P.fly.position.set(0, 0.15, -0.03 + near * 0.06);
  const jab = c > 0.7 && c < 2.2 ? Math.max(0, Math.sin((c - 0.7) * 12)) : 0; // 고개를 툭툭 내밈
  P.head.position.z += jab * 0.012;
  P.head.rotation.set(-0.1 - jab * 0.15, 0, Math.sin(c * 6) * 0.15);
  P.jaw.rotation.x = jab * 0.5;
  P.neck.scale.multiplyScalar(1 + near * 0.2);
  P.glare(jab > 0.5 ? 0.1 : 0.5);
  P.angry(t, near > 0.5 ? 1 : 0);
});

kmotion('어깨빵', '어깨 흔들며 건들건들 날기', (P, t) => {
  P.flap(t, 9, 0.7);
  const sw = Math.sin(t * 3);
  P.fly.position.set(sw * 0.02, 0.15 + Math.abs(Math.cos(t * 3)) * 0.01, 0);
  P.body.rotation.set(-0.1, sw * 0.25, sw * 0.4); // 몸을 좌우로 크게 기울이며 건들
  P.wings.forEach(([w, s]) => (w.rotation.x = s * sw * 0.25)); // 어깨를 번갈아 들썩
  P.head.rotation.set(-0.15, -sw * 0.3, -sw * 0.3); // 고개는 반대로 까딱
  P.tail.rotation.y = -sw * 0.3;
  P.jaw.rotation.x = 0;
  P.glare(0.5);
  P.angry(t, 0);
});

kmotion('쫓아내기', '와다다 쫓아가 쪼고 의기양양 복귀', (P, t) => {
  const c = t % 3.4;
  const out = gease(gseg(c, 0.4, 0.8)), back = gease(gseg(c, 1.9, 3));
  const k = out * (1 - back);
  P.flap(kPhase(t, 3.4, (x) => 12 + 14 * gease(gseg(x, 0.4, 0.8)) * (1 - gease(gseg(x, 1.9, 3)))), 1, 0.9 - k * 0.4);
  P.sweep(k * 0.6);
  P.fly.position.set(0, 0.14 - k * 0.04, -0.04 + k * 0.09);
  const peck = c > 0.8 && c < 1.9 ? Math.max(0, Math.sin((c - 0.8) * 20)) : 0;
  P.body.rotation.set(k * 0.35 - back * (1 - back) * 1.2, 0, 0); // 돌아갈 땐 가슴 쭉 펴고 으스댐
  P.head.rotation.set(peck * 0.5 - back * 0.3, 0, 0);
  P.jaw.rotation.x = c > 1.9 ? Math.abs(Math.sin(c * 16)) * 0.4 : 0; // 돌아가며 깍깍 비웃음
  P.glare(k > 0.3 ? 0 : 0.5);
  P.angry(t, k > 0.2 ? 1 : 0);
});

// ── 게임용 깍깍이: 깡총깡총 다니며 깍깍, 사람을 보면 화내고 쫓아와 덮쳐 쪼기. 비둘기보다 높이·멀리 날아다님 ──
// 구구(createGugu)와 같은 모양: play(동작) · update(dt) · setAir(나들이 높이·자세) · setMood('angry')
const FOOT = new Set(['발', '발가락', '발톱']);
export const KKAK_STATES = {
  idle: { label: '대기 (꽁지 까딱, 째려보기)', loop: true },
  walk: { label: '깡총걷기', loop: true },
  peck: { label: '땅 콕콕', dur: 2.0 },
  caw: { label: '서서 깍깍 (특기)', dur: 3.0 },
  notice: { label: '발견! (깍깍깍 경보)', dur: 2.4 },
  angry: { label: '화남! (날개 반쯤 펴 부르르)', dur: 1.6 },
  attack: { label: '공격 (뛰어올라 덮쳐 쪼기)', dur: 1.5 },
  hit: { label: '맞음 (깃털 펑)', dur: 1.0 },
  die: { label: '쓰러짐', dur: 3.4 },
  spawn: { label: '등장 (활공해 내려앉음)', dur: 2.3 },
  air: { label: '날기 (나들이)', loop: true },
  perch: { label: '앉아 쉬기 (나무·머리 위)', loop: true },
  jab: { label: '콕! (괴롭힐 때 한 번 쪼기, 땅·공중)', dur: 0.55 },
};
export const KKAK_STRIKE = 0.47; // 공격에서 부리·발톱이 닿는 순간 (초) — 다른 몬스터와 같음
export const KKAK_JAB = 0.3; // 콕!(jab)에서 부리가 닿는 순간 (초)
const FLY_Y = 0.13; // makePigeon 의 fly 기본 높이 (공중)

export function createKkakkak({ onDone = null, outlineScale = 1 } = {}) {
  const P = makeKkakkak();
  const root = P.g;
  root.name = '깍깍이';
  const M = Object.fromEntries(KKAK_MOTIONS.map((m) => [m.name, m]));
  const X = { 맞음: M['맞음'].extra(P), 쓰러짐: M['쓰러짐'].extra(P) };
  root.traverse((o) => { if (o.isMesh) o.userData.outlineWidth = FOOT.has(o.name) ? 0.0012 : 0.002; });
  const smooth = poseSmoother([root]); // 동작이 바뀌어도 자세가 툭 튀지 않게
  const run = (name, c) => M[name].update(P, c, X[name] ?? {});

  let state = 'idle';
  let u = 0, t = 0;
  let mood = false; // 화난 채로 (쫓아오는 중): 화남 표시 + 부릅뜬 눈
  let lift = 0, move = 0, brake = 0, shake = 0, down = 0; // 나들이 자세 (구구와 같음)
  // 동작이 바뀌면 바로 전 자세에서 XF 초 동안 스르르 넘어감 (날다 내려앉자마자 화남 같은 데서 몸이 툭 꺾이지 않게) — 맞음은 바로
  let XF = 0.18;
  const parts = [];
  root.traverse((o) => { if (o !== root) parts.push(o); });
  let snap = null, snapT = 0;
  const q = new THREE.Quaternion();
  function play(name) {
    if (!KKAK_STATES[name] && name !== 'gone') return;
    snap = name === 'hit' ? null : parts.map((o) => [o.position.clone(), o.quaternion.clone(), o.scale.clone()]);
    snapT = 0;
    XF = state === 'air' && name !== 'jab' ? 0.3 : 0.18; // 날다 내려앉을 땐 키 차이가 커서 더 천천히
    state = name;
    u = 0;
  }

  function update(dt) {
    t += dt;
    u += dt;
    kReset(P, t);
    if (state === 'idle') { // 서서 꽁지 까딱, 고개 휙휙 두리번 (화나 있으면 노려봄)
      kStand(P);
      P.tail.rotation.x = Math.max(0, Math.sin(t * 7)) * 0.3 * (t % 5 < 2 ? 1 : 0.3);
      P.head.rotation.y = mood ? 0 : Math.sin(t * 0.8) > 0 ? 0.45 : -0.45;
      P.plant(0);
    } else if (state === 'walk') { // 두 발 모아 깡총깡총 (앞으로 가는 건 게임이 정함)
      kStand(P);
      const ph = (t * 2.5) % 1, hop = Math.sin(ph * PI);
      P.feet.forEach((f) => (f.rotation.x = hop * 0.7));
      P.tail.rotation.x = bump(ph, 0.75, 1) * 0.35;
      P.body.rotation.x -= hop * 0.15;
      P.plant(0);
      P.fly.position.y += hop * 0.016;
    } else if (state === 'peck') { // 땅을 콕콕 쪼고 고개 들어 두리번
      kStand(P);
      const peck = u < 1.3 ? Math.max(0, Math.sin(u * PI * 3)) * (1 - gease(gseg(u, 1.1, 1.3))) : 0;
      P.body.rotation.x += peck * 0.6;
      P.head.rotation.x = peck * 0.6;
      P.tail.rotation.x = peck * 0.4;
      P.head.rotation.y = bump(u, 1.4, 2.0) * 0.5;
      P.plant(0);
    } else if (state === 'caw') {
      run('서서 깍깍', 1.2 + Math.min(u, 1.75)); // 고개 휙 → 깍깍깍 (시안 1.2~2.95초)
    } else if (state === 'notice') {
      run('발견!', Math.min(u, 2.5));
    } else if (state === 'angry') {
      run('화남!', Math.min(u * 2, 2.6)); // 빨리 부르르 (쫓기 시작하면 걷기로 바뀜)
    } else if (state === 'attack') { // 웅크렸다 폴짝 뛰어 발톱 내밀고 덮쳐 콕! → 사뿐 내려앉음
      const crouch = bump(u, 0, 0.3);
      const open = gease(gseg(u, 0.16, 0.34)) * (1 - gease(gseg(u, 0.85, 1.1)));
      const jump = Math.sin(gseg(u, 0.22, 0.95) * PI);
      const hk = gease(gseg(u, 0.32, 0.45)) * (1 - gease(gseg(u, 0.7, 0.9))); // 덮치는 자세
      const peck = bump(u, 0.4, 0.56);
      P.flap(t, 26, 1.0 * open, 0.3 * open);
      kStand(P, 1 - open);
      P.fly.position.y += jump * 0.05 - crouch * 0.006;
      P.fly.position.z = jump * 0.03; // 앞으로 덮침 (끝나면 제자리)
      P.body.rotation.x = 0.05 + crouch * 0.2 - hk * 0.65;
      P.feet.forEach((f, i) => (f.rotation.x = kLerp(open * 0.6, -0.6 + (i ? 1 : -1) * Math.sin(u * 30) * 0.3, hk)));
      P.head.rotation.x = -crouch * 0.3 + hk * 0.3 + peck * 0.5;
      P.head.position.z += peck * 0.01;
      P.jaw.rotation.x = bump(u, 0.1, 0.35) * 0.5; // 덤비기 전에 깍!
      P.tailFan = hk;
      P.tail.rotation.x = -hk * 0.3;
      if (u < 0.3 || u > 1.0) P.plant(0, u < 0.3 ? 1 : gseg(u, 1.0, 1.2));
    } else if (state === 'hit') {
      P.fly.position.y = STAND_Y;
      run('맞음', u * 1.6);
    } else if (state === 'die') { // 퍼덕이다 툭 떨어져 옆으로 픽 → 발 파르르 → 스르르 작아짐
      const c = Math.min(u, 3.0);
      run('쓰러짐', 0.2 + c);
      if (u < 0.3) { // 접은 날개를 펴며 퍼덕이기 시작, 발도 스르르 접음 (툭 바뀌지 않게)
        const k = gease(gseg(u, 0, 0.3));
        P.foldWings(1 - k);
        P.feet.forEach((f) => (f.rotation.x *= k));
      }
      if (c < 1.0) P.fly.position.y -= (FLY_Y - STAND_Y) * (1 - gseg(c, 0.4, 0.9)); // 공중이 아니라 선 자리에서 쓰러짐
      P.fly.scale.setScalar(Math.max(0.0001, 1 - gease(gseg(u, 3.0, 3.4))));
    } else if (state === 'spawn') {
      run('등장', Math.min(u, 2.3));
    } else if (state === 'air') { // 짝! 날아올라 파닥파닥. 멀리 날 땐 까치답게 파닥이다 날개 접고 쑥 (물결 비행)
      const clap = bump(u, 0, 0.22);
      if (u < 0.22) {
        P.wings.forEach(([w, s, h]) => { w.rotation.z = s * clap * 1.5; h.rotation.z = s * clap * 0.4; });
        P.foldWings(1 - gease(gseg(u, 0, 0.12)));
      } else {
        const b = t % 1.1, shut = bump(b, 0.7, 1.08) * move * (1 - brake); // 앞으로 날 때만
        const r = gease(gseg(u, 0.22, 0.4)); // 짝 뒤로 날갯짓이 스르르 시작
        P.flap(t, 20 + brake * 6, (1.0 + brake * 0.1) * (1 - shut) * r, (0.2 + brake * 0.1) * r);
        P.sweep(shut * 0.9);
        P.open *= 1 - shut;
        P.fly.position.y -= shut * 0.008;
      }
      P.fly.position.y = STAND_Y + lift + clap * 0.012 + (P.fly.position.y - FLY_Y) + Math.sin(t * 20) * 0.003 * (1 - brake);
      P.body.rotation.x = 0.15 * move - brake * 0.6;
      P.tailFan = brake;
      P.tail.rotation.x = -brake * 0.4;
      P.feet.forEach((f) => (f.rotation.x = u < 0.22 ? -0.2 : 1.3 - brake * 1.6));
      P.head.rotation.x = 0.4 * down;
      P.head.rotation.y = -0.5 * down;
    } else if (state === 'perch') { // 앉아서 꽁지 까딱, 가끔 깍깍. 자리가 들썩이면 날개로 버팀
      kStand(P);
      P.fly.position.y = STAND_Y + lift;
      const ch = Math.abs(Math.sin(t * 14)) * bump(t % 6, 3.5, 4.4);
      P.jaw.rotation.x = ch * 0.5;
      P.tail.rotation.x = Math.max(0, Math.sin(t * 7)) * 0.3 * (1 - shake) + ch * 0.2;
      P.head.rotation.y = (Math.sin(t * 0.8) > 0 ? 0.45 : -0.45) * (1 - shake);
      if (shake > 0) {
        P.body.rotation.z = Math.sin(t * 16) * 0.18 * shake;
        P.wings.forEach(([w, s]) => (w.rotation.z += s * Math.abs(Math.sin(t * 20)) * 0.4 * shake));
      } else P.head.rotation.x = 0.4 * down;
      P.plant(lift);
    } else if (state === 'jab') { // 콕! 땅에선 앞으로 내지르고, 떠 있으면(setAir) 몸을 숙여 아래로 내리찍음
      const wind = gease(gseg(u, 0, 0.18)) * (1 - gease(gseg(u, 0.18, 0.26))); // 고개 뒤로 젖혀 힘 모음
      const hit = gease(gseg(u, 0.2, 0.3)) * (1 - gease(gseg(u, 0.34, 0.55)));
      if (lift > 0.01) {
        P.flap(t, 18, 1, 0.3);
        P.fly.position.y = STAND_Y + lift + wind * 0.008 - hit * 0.01;
        P.body.rotation.x = -0.25 + hit * 0.75 - wind * 0.2;
        P.head.rotation.x = hit * 0.5 - wind * 0.3;
        P.tailFan = 0.6;
        P.tail.rotation.x = -0.3 + hit * 0.5;
        P.feet.forEach((f) => (f.rotation.x = -0.2 + hit * 0.3));
      } else {
        kStand(P);
        P.body.rotation.x += hit * 0.2 - wind * 0.15;
        P.head.rotation.x = hit * 0.15 - wind * 0.2;
        P.fly.position.z = hit * 0.008 - wind * 0.004;
        P.tail.rotation.x = hit * 0.3;
        P.jaw.rotation.x = wind * 0.3;
        P.plant(0);
      }
      P.head.position.z += hit * 0.012;
    } else if (state === 'gone') {
      P.fly.scale.setScalar(0.0001);
    }
    // 늘 반쯤 뜬 눈으로 째려봄 (맞음·발견처럼 동작이 눈을 정하는 건 그대로), 화난 채면 화남 표시
    if (['idle', 'walk', 'peck', 'attack', 'air', 'perch', 'spawn', 'jab'].includes(state)) P.glare(mood ? 0.6 : 0.45);
    if (mood && state !== 'gone' && state !== 'die') P.angry(t, 1);
    smooth(t);
    if (snap) { // 다듬기(smooth) 뒤에 섞어야 다듬기가 옛 움직임을 이어 붙이지 않음
      snapT += dt;
      const k = gease(Math.min(1, snapT / XF));
      parts.forEach((o, i) => {
        const [p0, q0, s0] = snap[i];
        o.position.lerpVectors(p0, o.position, k);
        o.quaternion.copy(q.slerpQuaternions(q0, o.quaternion, k));
        o.scale.lerpVectors(s0, o.scale, k);
      });
      if (k >= 1) snap = null;
    }
    P.keepAbove(0);

    const S = KKAK_STATES[state];
    if (S && !S.loop && u >= S.dur) {
      const ended = state;
      const inAir = ended === 'jab' && lift > 0.01;
      play(ended === 'die' ? 'gone' : inAir ? 'air' : 'idle');
      if (inAir) u = 0.5; // 떠서 쪼았으면 짝! 없이 그대로 파닥임
      onDone?.(ended);
    }
    syncToon(root, true, outlineScale);
  }

  return {
    root,
    play,
    update,
    setMood(m) { mood = m === 'angry'; },
    setAir(h, mv = 0, br = 0, sh = 0, dn = 0) { lift = h; move = mv; brake = br; shake = sh; down = dn; },
    get state() { return state; },
    get time() { return u; },
  };
}
const kLerp = THREE.MathUtils.lerp;
