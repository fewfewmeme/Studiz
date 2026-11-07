// Receipt-like card shown after a study block: Cormorant numerals, still fish / shrimp illustrations. Nothing flies or moves.
import { h, dateKey, plural } from '../util.js';
import { dayReport } from '../study.js';
import { customDialog } from '../ui.js';

const FISH = '<svg viewBox="0 0 64 40" width="56" height="35" aria-hidden="true"><path d="M6 20C14 8 30 6 42 16c4-4 10-8 16-8-2 6-2 12 0 18-6 0-12-4-16-8C30 28 14 28 6 20z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="17" cy="18" r="1.6" fill="currentColor"/><path d="M26 14c3 4 3 8 0 12" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>';
const SHRIMP = '<svg viewBox="0 0 64 48" width="56" height="42" aria-hidden="true"><path d="M10 36C6 22 16 8 34 8c10 0 18 6 20 14-6-4-12-4-18 0 4 2 6 6 4 10-4 6-14 8-22 4-3-1-6-1-8 0z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M48 18c4-6 10-8 14-8M44 14c2-6 6-9 10-10" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><circle cx="40" cy="16" r="1.4" fill="currentColor"/></svg>';
const svg = s => { const d = document.createElement('span'); d.className = 'chk-ill'; d.innerHTML = s; return d; };

export async function showSessionCheck() {
  const d = await dayReport(dateKey());
  const mins = Math.floor(d.totalSec / 60);
  const col = (ill, n, label) => h('div', { class: 'chk-col' }, ill, h('strong', { class: 'chk-num' }, String(n)), h('small', null, label));
  const m = customDialog([
    h('p', { class: 'eyebrow' }, 'Чек учёбы'),
    h('div', { class: 'chk-card' },
      col(null, mins, plural(mins, 'минута', 'минуты', 'минут')),
      col(svg(FISH), d.fish, plural(d.fish, 'рыбка', 'рыбки', 'рыбок')),
      col(svg(SHRIMP), d.shrimp, plural(d.shrimp, 'креветка', 'креветки', 'креветок'))),
    h('p', { class: 'muted' }, 'Так за сегодня. Рыбка — за каждые 5 минут учёбы, креветка — за каждый прочитанный блок.'),
    h('div', { class: 'modal-actions' }, h('a', { class: 'btn', href: '#/check', onclick: () => m.close() }, 'Весь чек'), h('button', { class: 'btn btn-primary', onclick: () => m.close() }, 'Хорошо')),
  ], { onBackdrop: () => m.close() });
  return m;
}
