// Дни: the bottom parts (stubs) of closed receipts, newest first.
import { h } from '../util.js';
import { confirmDialog, toast } from '../ui.js';
import * as RS from '../receipt-store.js';
import { buildBottom, stampHalf, tearPolygon, PAPER_W } from '../receipt-ui.js';

export async function renderDays(root) {
  root.className = 'view days-view';
  const grid = h('div', { class: 'rc-grid' });
  root.replaceChildren(h('div', { class: 'content wide' }, h('header', { class: 'poster-panel' }, h('p', { class: 'eyebrow' }, 'Корешки закрытых чеков'), h('h1', { class: 'display' }, 'Дни')), grid));
  async function draw() {
    const days = await RS.getDays();
    if (!days.length) { grid.replaceChildren(h('div', { class: 'empty-card' }, h('h3', null, 'Пока пусто'), h('p', null, 'Когда закроете первый чек, его корешок появится здесь.'))); return; }
    grid.replaceChildren(...days.map(d => {
      const paper = buildBottom(d);
      const piece = h('div', { class: 'rc-piece bottom' }, paper);
      paper.append(stampHalf('bottom', d.sx ?? 0.5, PAPER_W));
      const item = h('div', { class: 'rc-item' }, h('div', { class: 'rc-sheet', style: { width: PAPER_W + 'px', borderRadius: '0' } }, piece),
        h('div', { class: 'actions' }, h('button', { class: 'btn btn-sm btn-danger-soft', type: 'button', onclick: async () => {
          if (!(await confirmDialog('Удалить этот день из списка? Минуты в общих итогах останутся.', { ok: 'Удалить', danger: true }))) return;
          await RS.deleteDay(d.id); toast('Удалено'); draw();
        } }, 'Удалить')));
      requestAnimationFrame(() => { piece.style.clipPath = tearPolygon('top', PAPER_W, piece.offsetHeight, [0, 0], 0, 0); });
      return item;
    }));
  }
  await draw();
}
