// One-time "Как это работает": three skippable cards.
import { h } from '../util.js';
import * as db from '../db.js';
import { customDialog } from '../ui.js';
import { icon } from '../icons.js';

const CARDS = [
  ['book', 'Добавьте конспекты', 'В любом предмете нажмите «Добавить файлы»: HTML, PDF, Word, Markdown, текст или фотографии. Сайт сам подгонит их под экран, ничего не потеряв.'],
  ['blocks', 'Три способа читать', 'Значки слева: «Обычный» — лента, «Книга» — разворот с листаньем, «Блоки» — кусочки по пять минут с таймером. Пометки видны во всех трёх.'],
  ['receipt', 'Копия и чек', 'Каждый вечер нажимайте «Сделать копию» в настройках — данные лежат только на этом устройстве. А «Чек» покажет, сколько вы сегодня выучили.'],
];
export async function maybeTour(force = false) {
  try { if (!force && localStorage.getItem('noTour')) return; } catch (e) { /* ignore */ }
  if (!force && await db.kvGet('tourDone', false)) return;
  let i = 0;
  const done = async () => { await db.kvSet('tourDone', true); m.close(); };
  const body = h('div', { class: 'tour-body' });
  const draw = () => {
    const [ic, t, p] = CARDS[i];
    body.replaceChildren(h('span', { class: 'tour-ic' }, icon(ic, 28)), h('h3', null, t), h('p', { class: 'modal-text' }, p),
      h('div', { class: 'tour-dots', 'aria-hidden': 'true' }, CARDS.map((_, k) => h('i', { class: k === i ? 'on' : '' }))),
      h('div', { class: 'modal-actions' }, h('button', { class: 'btn btn-quiet', onclick: done }, 'Пропустить'), h('button', { class: 'btn btn-primary', onclick: () => (i < CARDS.length - 1 ? (i++, draw()) : done()) }, i < CARDS.length - 1 ? 'Дальше' : 'Понятно')));
  };
  const m = customDialog([body], { onBackdrop: () => {} });
  draw();
}
