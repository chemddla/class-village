// 테스트 서버 전용 외형 꾸미기 창: 고른 값만 담은 look 객체를 onChange 로 넘긴다
import { COLORS, LOOK_BASES, LOOK_OUTFITS } from '../../shared/world.js';
import { HAIRSTYLES, OUTFITS, HATS, NOSE_STYLES } from './villager/villager.js';
import { EYE_STYLES, MOUTH_STYLES } from './villager/textures.js';
import { HAIR_COLORS, lookFor } from './character.js';

const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;
const SKINS = ['#ffe2cc', '#ffd3b4', '#e3ad84', '#a8714f'];
const BASE_LABEL = { boy: '남자', girl: '여자' };
const TOGGLES = { glasses: '안경', crown: '왕관', backpack: '가방' };

export function createLookEditor({ panel, button, getColor, onChange }) {
  let look = {};
  const groups = [];
  const row = (title) => {
    const h = document.createElement('h3');
    h.textContent = title;
    const d = document.createElement('div');
    d.className = 'look-row';
    panel.append(h, d);
    return d;
  };
  const add = (parent, { label, color, patch, isOn }) => {
    const b = document.createElement('button');
    b.type = 'button';
    if (color) { b.className = 'swatch'; b.style.background = color; b.setAttribute('aria-label', label); } else b.textContent = label;
    b.onclick = () => { look = { ...look, ...(typeof patch === 'function' ? patch() : patch) }; refresh(); onChange(look); };
    groups.push({ b, isOn });
    parent.appendChild(b);
  };
  const cur = () => lookFor(getColor(), look);

  const bases = row('체형');
  for (const k of LOOK_BASES) add(bases, { label: BASE_LABEL[k], patch: { base: k }, isOn: () => (look.base ?? null) === k });
  const hairs = row('머리 모양');
  for (const [k, h] of Object.entries(HAIRSTYLES)) add(hairs, { label: h.label, patch: { hair: k }, isOn: () => cur().hair === k });
  const hc = row('머리색');
  for (const c of HAIR_COLORS) add(hc, { label: c, color: c, patch: { hairColor: c }, isOn: () => cur().hairColor === c });
  const top = row('윗옷');
  for (const c of COLORS.map(hex)) add(top, { label: c, color: c, patch: { top: c }, isOn: () => cur().top === c });
  const fit = row('옷');
  for (const [k, f] of Object.entries(OUTFITS)) if (LOOK_OUTFITS.includes(k)) add(fit, { label: f.label, patch: { outfit: k }, isOn: () => (cur().outfit ?? 'tee') === k });
  const hats = row('모자');
  for (const [k, h] of Object.entries(HATS)) add(hats, { label: h.label, patch: () => ({ hat: cur().hat === k ? 'none' : k }), isOn: () => cur().hat === k });
  const skin = row('피부');
  for (const c of SKINS) add(skin, { label: c, color: c, patch: { skin: c }, isOn: () => cur().skin === c });
  for (const [title, key, list] of [['눈', 'eyeStyle', EYE_STYLES], ['코', 'noseStyle', NOSE_STYLES], ['입', 'mouthStyle', MOUTH_STYLES]]) {
    const r = row(title);
    for (const [k, e] of Object.entries(list)) add(r, { label: e.label, patch: { [key]: k }, isOn: () => (cur()[key] ?? 'classic') === k });
  }
  const acc = row('소품');
  for (const [k, label] of Object.entries(TOGGLES)) add(acc, { label, patch: () => ({ [k]: !cur()[k] }), isOn: () => !!cur()[k] });

  function refresh() { for (const g of groups) g.b.classList.toggle('on', g.isOn()); }
  button.onclick = () => { panel.classList.toggle('hidden'); refresh(); };

  return {
    show(v) { button.classList.toggle('hidden', !v); if (!v) panel.classList.add('hidden'); },
    set(v) { look = v; refresh(); },
    get look() { return look; },
  };
}
