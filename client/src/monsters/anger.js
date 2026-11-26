// 몬스터가 화났을 때 머리 위에 뜨는 빨간 '화남 표시'(네 귀퉁이가 꺾인 핏대 모양). 세 몬스터가 함께 쓴다
import * as THREE from 'three';
import { canvasTexture } from '../villager/textures.js';

const PI = Math.PI;

// 가운데 쪽으로 오목한 꺾쇠 네 개가 X 자로 놓인 모양: 짙은 테두리를 먼저 굵게, 그 위에 빨간 선
const angerTex = () => canvasTexture('monsterAnger', 128, 128, (g, w, h) => {
  g.translate(w / 2, h / 2);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const path = () => {
    g.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = (i * PI) / 2; // 꺾쇠를 위·아래·좌·우에 두어 틈이 X 자가 되게
      const c = Math.cos(a), s = Math.sin(a);
      const p = (x, y) => [x * c - y * s, x * s + y * c]; // 돌린 자리
      g.moveTo(...p(-27, -38));
      g.quadraticCurveTo(...p(0, -6), ...p(27, -38));
    }
  };
  path();
  g.strokeStyle = '#4a2018';
  g.lineWidth = 22;
  g.stroke();
  path();
  g.strokeStyle = '#ff3b30';
  g.lineWidth = 11;
  g.stroke();
});

// 머리 위에 붙일 화남 표시 (크기 1 기준, scale 로 키움)
export function angerMark() {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: angerTex(), transparent: true, depthWrite: false }));
  s.visible = false;
  s.renderOrder = 2;
  return s;
}

// 화남 표시 크기: 팍 튀어나왔다가 콩닥콩닥 뛴다 (u: 나타난 뒤 흐른 시간, t: 전체 시간)
export const angerPulse = (u, t) => {
  const pop = u < 0 ? 0 : Math.min(1, u / 0.14);
  const over = pop < 1 ? pop * 1.35 : 1 + 0.35 * Math.exp(-10 * (u - 0.14)) * Math.cos(30 * (u - 0.14));
  return over * (1 + 0.12 * Math.max(0, Math.sin(t * 9)));
};
