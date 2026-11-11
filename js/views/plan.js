// План: the week as calm cards in the app's own look. Each day has a to-do list; a task is a small dot + text. Tap a task for its menu
// (done / edit / attach a file / delete). A task linked to a file counts the reading time; after enough reading the plan quietly asks «выполнено?».
import { h } from '../util.js';
import { SUBJECTS } from '../../config.js';
import * as db from '../db.js';
import * as P from '../plan-store.js';
import { toast, customDialog, menu, promptDialog } from '../ui.js';
import { icon } from '../icons.js';
import * as ST from '../study-store.js';
import { dateRangeRu } from '../receipt-core.js';

const subjName = k => SUBJECTS.find(s => s.key === k)?.name || '';
const SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const sjClass = k => (k ? 'sj-' + k : '');

export async function renderPlan(root) {
  root.className = 'view plan-view';
  let offset = 0;                                  // weeks from the current one
  let selSubj = {};                                // date -> subject chosen in the add row of that day
  const content = h('div', { class: 'content plan-wrap' });
  root.replaceChildren(content);

  async function draw(opts = {}) {
    const [tt, items, files] = await Promise.all([P.getTimetable(), P.getItems(), db.getAll('files').then(a => a.filter(f => !f.deleted))]);
    const start = P.weekStart(); start.setDate(start.getDate() + offset * 7);
    const end = new Date(start); end.setDate(end.getDate() + 6);
    const startYmd = P.ymd(start), wk = await P.getWeek(startYmd), today = P.ymd(new Date());
    const dnum = i => { const d = new Date(start); d.setDate(d.getDate() + i); return d; };

    // ---- header ----
    const seg = h('div', { class: 'plan-seg', role: 'group', 'aria-label': 'Неделя' },
      h('button', { type: 'button', 'aria-label': 'Прошлая неделя', onclick: () => { offset--; draw(); } }, icon('chevron-left', 18)),
      h('button', { type: 'button', class: offset === 0 ? 'on' : '', onclick: () => { offset = 0; draw(); } }, 'Сегодня'),
      h('button', { type: 'button', 'aria-label': 'Следующая неделя', onclick: () => { offset++; draw(); } }, icon('chevron-right', 18)));
    const hero = h('header', { class: 'plan-hero' },
      h('div', { class: 'plan-hero-text' }, h('p', { class: 'eyebrow' }, offset === 0 ? 'Эта неделя' : offset < 0 ? 'Прошедшая неделя' : 'Следующая неделя'), h('h1', { class: 'display' }, dateRangeRu(startYmd, P.ymd(end)).replace(/ \d{4} г\.$/, ''))),
      h('div', { class: 'plan-hero-tools' }, seg,
        h('button', { class: 'plan-ghost', type: 'button', onclick: () => timetableDialog(tt) }, icon('lines', 16), 'Расписание'),
        h('button', { class: 'plan-ghost', type: 'button', title: 'Минуты, которые я учила не на сайте', onclick: () => outsideDialog(tt) }, icon('timer', 16), 'Минуты вне сайта')),
      h('img', { class: 'plan-cat', src: 'assets/plan-cat.png', alt: '', draggable: 'false' }));

    // ---- week strip ----
    const strip = h('nav', { class: 'plan-strip', 'aria-label': 'Дни недели' }, ...SHORT.map((n, i) => {
      const d = dnum(i), date = P.ymd(d), mine = items.filter(x => x.date === date), done = mine.filter(x => x.done).length;
      const b = h('button', { type: 'button', class: 'plan-chip' + (date === today ? ' today' : '') + (wk.mark[i] ? ' marked' : '') },
        h('span', { class: 'pc-w' }, n), h('span', { class: 'pc-d' }, String(d.getDate())),
        h('span', { class: 'pc-dots', 'aria-hidden': 'true' }, ...Array.from({ length: Math.min(mine.length, 4) }, (_, k) => h('i', { class: k < done ? 'on' : '' }))));
      b.addEventListener('click', () => content.querySelector(`[data-date="${date}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      return b;
    }));

    // ---- day cards ----
    const dayCard = i => {
      const d = dnum(i), date = P.ymd(d), mine = items.filter(x => x.date === date);
      const dayTT = tt[i] || [];
      const card = h('section', { class: 'plan-day' + (date === today ? ' today' : '') + (date < today ? ' past' : ''), 'data-date': date },
        h('header', { class: 'pd-head' },
          h('div', null, h('h2', null, P.DAYS[i]), h('small', null, `${d.getDate()} ${['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'][d.getMonth()]}`), date === today ? h('span', { class: 'pd-today' }, 'сегодня') : null),
          (() => { const m = h('button', { class: 'pd-mark' + (wk.mark[i] ? ' on' : ''), type: 'button', 'aria-label': 'Отметить день', 'aria-pressed': String(!!wk.mark[i]), title: 'Отметить день' }, icon('star', 16)); m.addEventListener('click', async () => { wk.mark[i] = !wk.mark[i]; m.classList.toggle('on', wk.mark[i]); m.setAttribute('aria-pressed', String(wk.mark[i])); await P.setWeek(startYmd, { mark: wk.mark }); strip.children[i].classList.toggle('marked', wk.mark[i]); }); return m; })()),
        dayTT.length ? h('div', { class: 'pd-subjects' }, ...dayTT.map(k => h('span', { class: 'plan-pill ' + sjClass(k) }, subjName(k)))) : null,
        h('div', { class: 'pd-list' }, ...mine.map(it => itemRow(it, files)), !mine.length ? h('p', { class: 'pd-empty' }, 'Пока ничего не запланировано') : null),
        addRow(date, dayTT),
        (() => { const inp = h('input', { class: 'pd-note', placeholder: 'Заметка дня', 'aria-label': 'Заметка ' + SHORT[i], maxlength: 120 }); inp.value = wk.notes[i]; inp.addEventListener('change', () => { wk.notes[i] = inp.value; P.setWeek(startYmd, { notes: wk.notes }); }); return inp; })());
      return card;
    };
    const motiv = h('textarea', { 'aria-label': 'Мотивация недели', placeholder: 'Что для тебя главное на этой неделе?', rows: 4 }); motiv.value = wk.motiv;
    const fit = () => { motiv.style.height = 'auto'; motiv.style.height = Math.max(96, motiv.scrollHeight) + 'px'; };
    motiv.addEventListener('input', fit); motiv.addEventListener('change', () => P.setWeek(startYmd, { motiv: motiv.value }));
    const motivCard = h('section', { class: 'plan-day plan-motiv' }, h('header', { class: 'pd-head' }, h('div', null, h('h2', null, 'Мотивация недели'))), motiv);

    content.replaceChildren(hero, strip, h('div', { class: 'plan-grid' }, ...[0, 1, 2, 3, 4, 5, 6].map(dayCard), motivCard));
    requestAnimationFrame(fit);
    if (opts.focus) content.querySelector(`[data-date="${opts.focus}"] .plan-new`)?.focus();
    if (opts.scrollToday && offset === 0 && innerWidth < 1000) content.querySelector('.plan-day.today')?.scrollIntoView({ block: 'start' });
  }

  // ---- one task: a small dot, the text (tap = menu), a quiet line with subject / file / reading progress ----
  function itemRow(it, files) {
    const f = it.fileId ? files.find(x => x.id === it.fileId) : null, mins = Math.floor(it.fileMs / 60000);
    const dot = h('button', { class: 'plan-dot' + (it.done ? ' on' : ''), type: 'button', role: 'checkbox', 'aria-checked': String(!!it.done), 'aria-label': 'Сделано' });
    dot.addEventListener('click', async () => { await P.updateItem(it.id, { done: !it.done }); draw(); });
    const text = h('button', { class: 'plan-text' + (it.done ? ' done' : ''), type: 'button', 'aria-haspopup': 'menu' }, it.text);
    text.addEventListener('click', () => itemMenu(text, it, f, files));
    const meta = [];
    if (it.subj) meta.push(h('span', { class: 'plan-pill sm ' + sjClass(it.subj) }, subjName(it.subj)));
    if (f) meta.push(h('a', { class: 'plan-file', href: '#/file/' + f.id, title: f.name }, icon('lines', 13), f.name.length > 26 ? f.name.slice(0, 25) + '…' : f.name));
    if (f && !it.done) {
      if (mins >= P.FILE_MIN_FOR_PROMPT) { const ok = h('button', { class: 'plan-ask', type: 'button' }, `Прочитано ${mins} мин · выполнено?`, h('b', null, '✓')); ok.addEventListener('click', async () => { await P.updateItem(it.id, { done: true }); toast('Отмечено выполненным'); draw(); }); meta.push(ok); }
      else if (mins > 0) meta.push(h('span', { class: 'plan-prog' }, `в файле ${mins} из ${P.FILE_MIN_FOR_PROMPT} мин`));
    }
    return h('div', { class: 'plan-item' + (it.done ? ' done' : '') + (f && !it.done && mins >= P.FILE_MIN_FOR_PROMPT ? ' ask' : ''), 'data-id': it.id }, dot, h('div', { class: 'pi-body' }, text, meta.length ? h('div', { class: 'pi-meta' }, ...meta) : null));
  }
  function itemMenu(anchor, it, f, files) {
    menu(anchor, [
      { label: it.done ? 'Вернуть в работу' : 'Отметить выполненным', onClick: async () => { await P.updateItem(it.id, { done: !it.done }); draw(); } },
      { label: 'Изменить текст', onClick: async () => { const t = await promptDialog('Задача', it.text, { multiline: false }); if (t) { await P.updateItem(it.id, { text: t.slice(0, 300) }); draw(); } } },
      ...(f ? [{ label: 'Открыть файл', onClick: () => { location.hash = '#/file/' + f.id; } }] : []),
      { label: f ? 'Другой файл…' : 'Привязать файл…', onClick: () => linkDialog(it, files) },
      ...(f ? [{ label: 'Убрать файл', onClick: async () => { await P.updateItem(it.id, { fileId: null, fileMs: 0 }); draw(); } }] : []),
      { label: 'Удалить', danger: true, onClick: async () => { await P.removeItem(it.id); draw(); } },
    ]);
  }
  // add row: one quiet input per day; while it is focused the subject chips appear (optional)
  function addRow(date, dayTT) {
    const input = h('input', { class: 'plan-new', placeholder: 'Добавить задачу', 'aria-label': 'Новая задача на ' + date, enterkeyhint: 'done', maxlength: 300 });
    const order = [...dayTT, ...SUBJECTS.map(s => s.key).filter(k => !dayTT.includes(k))];
    // the subject is chosen with a small button inside the input line (a menu): nothing appears or disappears, so the layout never shifts under a finger
    const subjBtn = h('button', { class: 'pa-subj', type: 'button', 'aria-label': 'Предмет задачи', 'aria-haspopup': 'menu' });
    const paintSubj = () => { const k = selSubj[date] || null; subjBtn.className = 'pa-subj ' + sjClass(k) + (k ? ' set' : ''); subjBtn.textContent = k ? subjName(k) : 'предмет'; };
    paintSubj();
    subjBtn.addEventListener('pointerdown', e => e.preventDefault());
    subjBtn.addEventListener('click', () => { input.blur(); menu(subjBtn, [{ label: 'Без предмета', onClick: () => { selSubj[date] = null; paintSubj(); input.focus(); } }, ...order.map(k => ({ label: subjName(k), onClick: () => { selSubj[date] = k; paintSubj(); input.focus(); } }))]); });
    const add = async () => { const text = input.value.trim(); if (!text) return; input.value = ''; await P.addItem({ date, subj: selSubj[date] || null, text, fileId: null }); draw({ focus: date }); };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    const go = h('button', { class: 'plan-go', type: 'button', 'aria-label': 'Добавить' }, icon('check', 16)); go.addEventListener('pointerdown', e => e.preventDefault()); go.addEventListener('click', add);
    return h('div', { class: 'plan-add' }, h('div', { class: 'pa-line' }, h('span', { class: 'pa-plus', 'aria-hidden': 'true' }, '+'), input, subjBtn, go));
  }
  // attach a file: choose the subject, then the file
  function linkDialog(it, files) {
    let sub = it.subj || files.find(f => f.id === it.fileId)?.subject || SUBJECTS.find(s => files.some(f => f.subject === s.key))?.key || SUBJECTS[0].key;
    const list = h('div', { class: 'modal-stack plan-files' });
    const chips = SUBJECTS.map(s => { const b = h('button', { class: 'plan-pill ' + sjClass(s.key) + (s.key === sub ? ' on' : ''), type: 'button', 'data-k': s.key }, s.name); b.addEventListener('click', () => { sub = s.key; chips.forEach(x => x.classList.toggle('on', x === b)); paint(); }); return b; });
    function paint() {
      const fs = files.filter(f => f.subject === sub).sort((a, b) => (b.opened || 0) - (a.opened || 0) || (b.added || 0) - (a.added || 0));
      list.replaceChildren(...(fs.length ? fs.slice(0, 80).map(f => h('button', { class: 'btn', type: 'button', onclick: async () => { await P.updateItem(it.id, { fileId: f.id, ...(it.subj ? {} : { subj: f.subject }) }); m.close(); toast('Файл привязан'); draw(); } }, f.name.slice(0, 60))) : [h('p', { class: 'muted' }, 'В этом предмете пока нет файлов')]));
    }
    const m = customDialog([h('h3', null, 'Привязать файл'), h('p', { class: 'muted' }, it.text), h('div', { class: 'chips', style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } }, ...chips), list,
      h('div', { class: 'modal-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'Закрыть'))], { onBackdrop: () => m.close() });
    paint();
  }
  // minutes studied away from the site: a small dialog, nothing on the receipt page. They join the open receipt as that subject's time.
  function outsideDialog(tt) {
    const todaySubj = tt[P.weekday(new Date())] || [];
    let subj = todaySubj[0] || null, mins = 30;
    const subjChips = SUBJECTS.map(s => {
      const b = h('button', { class: 'chip' + (s.key === subj ? ' on' : ''), type: 'button', 'aria-pressed': String(s.key === subj) }, s.name);
      b.dataset.key = s.key; return b;
    });
    const num = h('input', { class: 'input', type: 'number', inputmode: 'numeric', min: 1, max: 600, value: mins, 'aria-label': 'Минут', style: { width: '90px' } });
    const minChips = [10, 15, 30, 45, 60, 90].map(n => { const b = h('button', { class: 'chip' + (n === mins ? ' on' : ''), type: 'button' }, n + ' мин'); b.dataset.n = n; return b; });
    const sync = () => {
      subjChips.forEach(b => { b.classList.toggle('on', b.dataset.key === subj); b.setAttribute('aria-pressed', String(b.dataset.key === subj)); });
      minChips.forEach(b => b.classList.toggle('on', Number(b.dataset.n) === mins));
    };
    subjChips.forEach(b => b.addEventListener('click', () => { subj = b.dataset.key; sync(); }));
    minChips.forEach(b => b.addEventListener('click', () => { mins = Number(b.dataset.n); num.value = mins; sync(); }));
    num.addEventListener('input', () => { mins = Math.round(Number(num.value)) || 0; sync(); });
    const m = customDialog([h('h3', null, 'Минуты вне сайта'),
      h('p', { class: 'muted' }, 'Сколько ты училась не на сайте. Время попадёт в открытый чек как время этого предмета (не как «к экзамену»).'),
      h('div', { class: 'chips', style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } }, ...subjChips),
      h('div', { class: 'chips', style: { display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', marginTop: '10px' } }, ...minChips, num),
      h('div', { class: 'modal-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'Отмена'),
        h('button', { class: 'btn btn-primary', type: 'button', onclick: async () => {
          if (!subj) { toast('Выбери предмет', { error: true }); return; }
          if (!(mins >= 1 && mins <= 600)) { toast('Минут: от 1 до 600', { error: true }); return; }
          await ST.initStudy();
          const done = ST.addManualMinutes(subj, mins); m.close();
          if (done > 0) toast(`+${done} мин · ${subjName(subj)}`, { action: { label: 'Отменить', fn: () => { ST.addManualMinutes(subj, -done); toast('Отменено'); } }, ms: 6000 });
        } }, 'Добавить'))], { onBackdrop: () => m.close() });
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
  await draw({ scrollToday: true });
}
