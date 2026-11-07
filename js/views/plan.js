// План: the weekly timetable (entered once) and, under each day, my own to-do list. Items belong to a subject or to the day in general.
// No pop-ups, no auto-prompts: I tick items myself. A linked file opens by tapping the item; after ≥ 30 min in it a quiet «отметить?» button shows.
import { h } from '../util.js';
import { SUBJECTS } from '../../config.js';
import * as db from '../db.js';
import * as P from '../plan-store.js';
import { toast, customDialog } from '../ui.js';

const subjName = k => SUBJECTS.find(s => s.key === k)?.name || '';

export async function renderPlan(root) {
  root.className = 'view plan-view';
  let offset = 0;                                  // weeks from the current one
  const content = h('div', { class: 'content wide' });
  root.replaceChildren(content);

  const SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  async function draw() {
    const [tt, items, files] = await Promise.all([P.getTimetable(), P.getItems(), db.getAll('files').then(a => a.filter(f => !f.deleted))]);
    const start = P.weekStart(); start.setDate(start.getDate() + offset * 7);
    const end = new Date(start); end.setDate(end.getDate() + 6);
    const wk = await P.getWeek(P.ymd(start));
    const today = P.ymd(new Date());
    const dm = d => `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
    const cell = i => {
      const d = new Date(start); d.setDate(d.getDate() + i); const date = P.ymd(d);
      const mine = items.filter(x => x.date === date);
      const subjects = [...new Set([...(tt[i] || []), ...mine.map(x => x.subj).filter(Boolean)])];
      const groups = [...subjects.map(k => [k, subjName(k)]), [null, subjects.length ? 'На день' : '']];
      return h('section', { class: 'plan-cell' + (date === today ? ' today' : ''), 'data-date': date, style: { '--o': i + 1 } },
        h('h2', null, P.DAYS[i], h('small', null, dm(d))),
        ...groups.map(([k, label]) => h('div', { class: 'plan-group' }, label ? h('p', { class: 'plan-sub' }, label) : null, ...mine.filter(x => (x.subj || null) === k).map(it => itemRow(it, files)), addRow(date, k))));
    };
    const marks = h('div', { class: 'plan-marks', 'aria-label': 'Отметки недели' }, ...SHORT.map((n, i) => {
      const box = h('input', { type: 'checkbox', checked: wk.mark[i] || null, 'aria-label': 'Отметка ' + n });
      box.addEventListener('change', () => { wk.mark[i] = box.checked; P.setWeek(P.ymd(start), { mark: wk.mark }); });
      return h('label', null, box, h('span', null, n));
    }));
    const motiv = h('textarea', { 'aria-label': 'Мотивация недели', placeholder: '' }); motiv.value = wk.motiv;
    motiv.addEventListener('change', () => P.setWeek(P.ymd(start), { motiv: motiv.value }));
    const notes = h('section', { class: 'plan-cell plan-notes-cell', style: { '--o': 8 } },
      h('div', { class: 'rows' }, ...SHORT.map((n, i) => { const inp = h('input', { 'aria-label': 'Заметка ' + n, maxlength: 120 }); inp.value = wk.notes[i]; inp.addEventListener('change', () => { wk.notes[i] = inp.value; P.setWeek(P.ymd(start), { notes: wk.notes }); }); return h('label', null, n); })),
      h('img', { class: 'plan-cat', src: 'assets/plan-cat.png', alt: '', draggable: 'false' }));
    // the short note lines sit next to the weekday labels
    const rows = notes.querySelector('.rows');
    rows.replaceChildren(...SHORT.map((n, i) => { const inp = h('input', { 'aria-label': 'Заметка ' + n, maxlength: 120 }); inp.value = wk.notes[i]; inp.addEventListener('change', () => { wk.notes[i] = inp.value; P.setWeek(P.ymd(start), { notes: wk.notes }); }); return h('label', null, h('span', null, n), inp); }));
    const order = [0, 3, 1, 4, 2, 5];      // left column Пн Вт Ср, right column Чт Пт Сб (two per row)
    content.replaceChildren(h('div', { class: 'plan-sheet plan-dots' },
      h('header', { class: 'plan-head' }, h('h1', null, `Эта неделя ${dm(start)} – ${dm(end)}`),
        h('div', { class: 'plan-nav' },
          h('button', { class: 'btn btn-sm', type: 'button', onclick: () => { offset--; draw(); } }, '←'),
          h('button', { class: 'btn btn-sm', type: 'button', onclick: () => { offset = 0; draw(); } }, 'Сегодня'),
          h('button', { class: 'btn btn-sm', type: 'button', onclick: () => { offset++; draw(); } }, '→'),
          h('button', { class: 'btn btn-sm', type: 'button', onclick: () => timetableDialog(tt) }, 'Расписание'))),
      h('div', { class: 'plan-top' }, marks, h('div', { class: 'plan-motiv' }, h('h2', null, 'Мотивация недели'), motiv)),
      h('div', { class: 'plan-body' }, ...order.map(cell), notes, cell(6))));
  }

  function itemRow(it, files) {
    const f = it.fileId ? files.find(x => x.id === it.fileId) : null;
    const box = h('input', { type: 'checkbox', checked: it.done || null, 'aria-label': 'Сделано' });
    box.addEventListener('change', async () => { await P.updateItem(it.id, { done: box.checked }); draw(); });
    const title = f ? h('a', { href: '#/file/' + f.id, class: 'plan-text' + (it.done ? ' done' : '') }, it.text) : h('span', { class: 'plan-text' + (it.done ? ' done' : '') }, it.text);
    const mins = Math.floor(it.fileMs / 60000);
    const quiet = f && !it.done && mins >= P.FILE_MIN_FOR_PROMPT ? h('button', { class: 'btn btn-quiet btn-sm', type: 'button', onclick: async () => { await P.updateItem(it.id, { done: true }); draw(); } }, 'отметить?') : null;
    return h('div', { class: 'plan-item' }, box, title, f ? h('small', { class: 'muted' }, '· ' + f.name.slice(0, 24)) : null, quiet,
      h('span', { class: 'spacer', style: { flex: 1 } }), h('button', { class: 'ibtn sm plan-clip', type: 'button', 'aria-label': 'Прикрепить файл', title: 'Файл к пункту', onclick: () => linkDialog(it, files) }, '📎'), h('button', { class: 'ibtn sm', type: 'button', 'aria-label': 'Удалить пункт', onclick: async () => { await P.removeItem(it.id); draw(); } }, '×'));
  }
  // one quiet input per group: type and press Enter (or leave the field); a file is linked with the little clip on the item itself
  function addRow(date, subj) {
    const input = h('input', { class: 'input plan-new', placeholder: '+', 'aria-label': 'Новый пункт' });
    const add = async () => { const text = input.value.trim(); if (!text) return; input.value = ''; await P.addItem({ date, subj, text, fileId: null }); draw(); };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
    input.addEventListener('change', add);
    return h('div', { class: 'plan-add' }, input);
  }
  function linkDialog(it, files) {
    const list = files.filter(f => !it.subj || f.subject === it.subj);
    const m = customDialog([h('h3', null, 'Файл к пункту'), h('p', { class: 'muted' }, it.text),
      h('div', { class: 'modal-stack' }, ...(list.length ? list : files).slice(0, 60).map(f => h('button', { class: 'btn', type: 'button', onclick: async () => { await P.updateItem(it.id, { fileId: f.id }); m.close(); draw(); } }, f.name.slice(0, 50)))),
      h('div', { class: 'modal-actions' }, it.fileId ? h('button', { class: 'btn', type: 'button', onclick: async () => { await P.updateItem(it.id, { fileId: null, fileMs: 0 }); m.close(); draw(); } }, 'Убрать файл') : null, h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'Закрыть'))], { onBackdrop: () => m.close() });
  }
  function timetableDialog(tt) {
    const cur = JSON.parse(JSON.stringify(tt));
    const rows = P.DAYS.map((name, i) => h('div', { class: 'plan-tt-row' }, h('strong', null, name),
      h('div', { class: 'chips', style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } }, ...SUBJECTS.map(s => {
        const b = h('button', { class: 'chip' + (cur[i].includes(s.key) ? ' on' : ''), type: 'button', 'aria-pressed': String(cur[i].includes(s.key)) }, s.name);
        b.addEventListener('click', () => { cur[i] = cur[i].includes(s.key) ? cur[i].filter(x => x !== s.key) : [...cur[i], s.key]; b.classList.toggle('on'); b.setAttribute('aria-pressed', String(cur[i].includes(s.key))); });
        return b;
      }))));
    const m = customDialog([h('h3', null, 'Расписание на неделю'), h('p', { class: 'muted' }, 'Вводится один раз; предметы остаются до конца года.'), ...rows,
      h('div', { class: 'modal-actions' }, h('button', { class: 'btn', onclick: () => m.close() }, 'Отмена'), h('button', { class: 'btn btn-primary', onclick: async () => { await P.setTimetable(cur); m.close(); toast('Расписание сохранено'); draw(); } }, 'Сохранить'))], { onBackdrop: () => m.close() });
  }
  await draw();
}
