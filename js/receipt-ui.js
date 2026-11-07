// DOM for the paper receipt: the top part (details), the bottom part (stub), the tear line, the stamp halves.
// The same builders draw the live receipt, the Archive (top parts) and Days (stubs); the numbers always come from a receipt payload.
import { h } from './util.js';
import { SUBJECTS, SUBJECT_NAME, dateRangeRu, minutesText, rewards } from './receipt-core.js';

export const PAPER_W = 326;        // px, see receipt-format.md
export const STAMP_RATIO = 0.46;   // stamp diameter / paper width
export const TOOTH_W = 12, TOOTH_D = 8;
export const STAMP_SRC = 'assets/stamp.svg';

const row = (left, right, cls = '') => h('div', { class: 'rc-row ' + cls }, h('span', { class: 'rc-l' }, left), h('span', { class: 'rc-r' }, right));
const sep = () => h('div', { class: 'rc-sep' });
const fs = (fish, shrimp) => [fish ? `🐟 ${fish}` : '', shrimp ? `🦐 ${shrimp}` : ''].filter(Boolean).join('  ');
export const tearLine = () => h('div', { class: 'rc-tear', 'aria-hidden': 'true' }, h('span', { class: 'rc-scissors' }, '✂'));

// payload (receipt-core) + optional lifetime {minutes, days:[…], blocks, fish, shrimp}
export function buildTop(p, life = null) {
  const r = rewards(p.g, p.b5, p.b10), blockMin = p.b5 * 5 + p.b10 * 10;
  const rows = SUBJECTS.filter(k => (p.s || {})[k] > 0).map(k => row(SUBJECT_NAME[k], `${p.s[k]} мин`));
  const exNames = (p.exs || []).map(k => SUBJECT_NAME[k]).filter(Boolean).join(', ');
  const top = h('div', { class: 'rc-top rc-paper' },
    h('div', { class: 'rc-title' }, 'ЧЕК УЧЁБЫ · БИБЛИОТЕКА КОНСПЕКТОВ'),
    h('div', { class: 'rc-date' }, 'Дата: ' + dateRangeRu(p.d1, p.d2)),
    sep(),
    h('div', { class: 'rc-h' }, 'МИНУТЫ ПО ПРЕДМЕТАМ'),
    ...(rows.length ? rows : [h('div', { class: 'rc-muted' }, 'пока нет')]),
    p.ex > 0 ? h('div', { class: 'rc-exam' }, row('Из них к экзамену:', `${p.ex} мин`), exNames ? h('div', { class: 'rc-muted' }, exNames) : null) : null,
    sep(),
    row('Общее время', minutesText(p.g)), h('div', { class: 'rc-sub' }, fs(r.fishGeneral, r.shrimpGeneral) || '—'),
    p.b5 ? row('Блоки по 5 мин', `× ${p.b5}`) : null, p.b5 ? h('div', { class: 'rc-sub' }, fs(r.fishB5, 0)) : null,
    p.b10 ? row('Блоки по 10 мин', `× ${p.b10}`) : null, p.b10 ? h('div', { class: 'rc-sub' }, fs(r.fishB10, r.shrimpB10)) : null,
    sep(),
    row('ИТОГО  ' + minutesText(p.g + blockMin), fs(r.fish, r.shrimp) || '—', 'rc-bold'),
    life ? h('div', { class: 'rc-life' },
      sep(), h('div', { class: 'rc-h' }, 'ВСЕГО ЗА ВСЁ ВРЕМЯ'),
      row('Минут', String(life.minutes)), row('Дней с учёбой', String(life.days?.length ?? life.days ?? 0)), row('Блоков', String(life.blocks)),
      row('🐟 Рыбок', String(life.fish)), row('🦐 Креветок', String(life.shrimp))) : null,
    h('div', { class: 'rc-foot' }, '1 🐟 = 5 мин · 1 🦐 = 10 мин'));
  return top;
}
// the stub: d = {d1, d2, minutes, fish, shrimp} (the Days record has exactly these)
export function buildBottom(d) {
  return h('div', { class: 'rc-bottom rc-paper' },
    h('div', { class: 'rc-date' }, 'Дата: ' + dateRangeRu(d.d1, d.d2)),
    row('Время за день', minutesText(d.minutes), 'rc-bold'),
    row('Рыбки / креветки', fs(d.fish, d.shrimp) || '—'));
}

// the zigzag bottom edge of the bottom part: tooth count follows the real width
export function applyZigzag(el, width = PAPER_W) { el.style.clipPath = zigzagClip(Math.max(8, Math.round(width / TOOTH_W)), TOOTH_D); }

// one half of the stamp. half = 'top' (flower) | 'bottom' (cat). The piece must be position:relative; overflow:hidden.
export function stampHalf(half, sx, width = PAPER_W) {
  const d = Math.round(width * STAMP_RATIO), R = d / 2;
  const x = Math.min(Math.max(sx * width, R), width - R);
  const img = h('img', { class: 'rc-stamp-img', src: STAMP_SRC, alt: '', draggable: 'false', width: d, height: d });
  img.style.cssText = `left:${(x - R).toFixed(1)}px;${half === 'top' ? `bottom:${-R}px` : `top:${-R}px`}`;
  return img;
}

// jagged torn edge. pts[i] = inward notch (0..2.4 px) at x = i * step. interval [a, b] in px is the torn part.
export function jagged(n, rnd = Math.random) { return Array.from({ length: n }, () => +(rnd() * 2.4).toFixed(2)); }
export function tearPolygon(edge, W, H, jag, a, b) {
  const step = W / (jag.length - 1), pts = [];
  const lo = Math.min(a, b), hi = Math.max(a, b);
  const y = x => (x >= lo && x <= hi ? jag[Math.min(jag.length - 1, Math.round(x / step))] : 0);
  if (edge === 'bottom') {      // top piece: its bottom edge, right -> left
    pts.push('0px 0px', `${W}px 0px`, `${W}px ${H}px`);
    for (let i = jag.length - 1; i >= 0; i--) { const x = i * step; pts.push(`${x.toFixed(1)}px ${(H - y(x)).toFixed(1)}px`); }
  } else {                      // bottom piece: its top edge (left -> right), then the zigzag bottom edge (right -> left)
    for (let i = 0; i < jag.length; i++) { const x = i * step; pts.push(`${x.toFixed(1)}px ${y(x).toFixed(1)}px`); }
    const teeth = Math.max(8, Math.round(W / TOOTH_W)), tw = W / teeth;
    pts.push(`${W}px ${(H - TOOTH_D).toFixed(1)}px`);
    for (let i = teeth; i >= 1; i--) { pts.push(`${((i - 0.5) * tw).toFixed(1)}px ${H}px`); pts.push(`${((i - 1) * tw).toFixed(1)}px ${(H - TOOTH_D).toFixed(1)}px`); }
  }
  return `polygon(${pts.join(',')})`;
}
