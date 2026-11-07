// Home: navy photo hero, "continue reading", subject cards, a slim backup notice.
import { SUBJECTS, RECENT_COUNT, BACKUP_REMINDER_DAYS } from '../../config.js';
import * as db from '../db.js';
import { h, nFiles, dateKey, fmtDateRu, plural } from '../util.js';
import { recentFiles } from '../library.js';
import { lastBackupAt, hasData, backupFlow } from '../backup.js';
import * as ST from '../study-store.js';
import { getLifetime } from '../receipt-store.js';
import { maybeEveningBanner } from '../receipt-banner.js';
import { icon } from '../icons.js';
import { heroImage, subjectSticker, subjectTexture } from '../assets.js';
import { docCard, subjectStyle, rotFor, subjectName, ring } from './common.js';
import { refreshShell } from '../shell.js';
import { ADAPTER_VERSION } from '../adapt/index.js';
import { readapt } from '../importer.js';
import { progressDialog, toast } from '../ui.js';

function greeting() {
  const hr = new Date().getHours();
  return (hr < 5 ? 'Доброй ночи' : hr < 12 ? 'Доброе утро' : hr < 18 ? 'Добрый день' : 'Добрый вечер') + ', Лиз';
}
// consecutive days with study, ending today (or yesterday): closed receipts (every day of their span) + the open one
export async function streakDays() {
  const life = await getLifetime(), days = new Set(life.days);
  const S = ST.state();
  if (S.dayStart != null) { const d = new Date(S.dayStart), end = new Date(); for (let i = 0; i < 40 && dateKey(d) <= dateKey(end); i++) { days.add(dateKey(d)); d.setDate(d.getDate() + 1); } }
  let n = 0; const d = new Date();
  if (!days.has(dateKey(d))) d.setDate(d.getDate() - 1);
  while (days.has(dateKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

export async function renderHome(root) {
  root.className = 'view home-view';
  root.replaceChildren(h('div', { class: 'content wide' }, h('div', { class: 'skel' })));
  await ST.initStudy();
  const [files, recent, last, any, life] = await Promise.all([db.getAll('files').then(a => a.filter(f => !f.deleted)), recentFiles(RECENT_COUNT), lastBackupAt(), hasData(), getLifetime()]);
  // the chips show the OPEN receipt (it accumulates until it is torn off)
  const tt = ST.totals(), mins = tt.totalMin, today = { fish: tt.rewards.fish, shrimp: tt.rewards.shrimp };
  const streak = await streakDays();
  const stat = (ic, value, label) => h('div', { class: 'stat' }, h('span', { class: 'stat-ic' }, ic), h('div', null, h('strong', null, value), h('small', null, label)));
  const img = heroImage();
  const cont = recent[0];
  const hero = h('section', { class: 'hero', 'data-vt-target': 'hero' },
    h('div', { class: 'hero-photo' + (img ? '' : ' duo'), style: img ? { backgroundImage: `url("${img.src}")`, backgroundPosition: img.pos } : {} }),
    h('div', { class: 'hero-fog' }),
    h('div', { class: 'hero-body' },
      h('p', { class: 'eyebrow' }, fmtDateRu(dateKey())),
      h('h1', { class: 'display' }, 'Библиотека'),
      h('p', { class: 'greet' }, greeting()),
      h('p', { class: 'sub' }, mins ? `Сегодня уже ${mins} ${plural(mins, 'минута', 'минуты', 'минут')} учёбы. Так держать.` : 'Выберите предмет и начните с одного маленького блока.'),
      h('div', { class: 'stats' },
        stat(icon('clock', 18), `${mins} мин`, 'сегодня'),
        stat(icon('flame', 18), String(streak), plural(streak, 'день подряд', 'дня подряд', 'дней подряд')),
        stat('🐟', String(today.fish), 'рыбки'),
        stat('🦐', String(today.shrimp), 'креветки')),
      h('div', { class: 'hero-actions' }, cont
        ? h('a', { class: 'btn btn-primary', href: `#/file/${cont.id}` }, icon('play', 16), h('span', null, 'Продолжить'))
        : h('a', { class: 'btn btn-primary', href: `#/subject/${SUBJECTS[0].key}` }, icon('book', 16), h('span', null, 'Выбрать предмет')))));

  const notice = h('div', { class: 'notice', hidden: true });
  const rcBanner = h('div', { class: 'rc-banner', hidden: true });
  maybeEveningBanner(rcBanner, () => { location.hash = '#/check'; }, () => !ST.isEmpty());
  if (any) {
    const days = last ? (Date.now() - last) / 86400000 : Infinity;
    if (days > BACKUP_REMINDER_DAYS) {
      notice.hidden = false;
      notice.append(icon('download', 18), h('span', null, last ? `Копию не делали больше ${BACKUP_REMINDER_DAYS} дней.` : 'Копии ещё нет: данные лежат только в этом браузере.'),
        h('button', { class: 'link-btn', onclick: async () => { if (await backupFlow()) { notice.hidden = true; refreshShell(); } } }, 'Сделать копию'));
    }
  }

  // «Продолжить»: the last document, exact position, progress ring
  let contCard = null;
  if (cont) {
    const modes = ['blocks', 'book', 'normal']; let where = '';
    const mode = cont.lastMode || 'normal', pos = await db.kvGet(`pos:${cont.id}:${mode}`, null);
    if (cont.type === 'pdf' && pos?.page) where = `стр. ${pos.page}`; else if (mode === 'book' && pos?.page != null) where = `стр. ${pos.page + 1}`; else if (cont.type === 'html') { const bk = await db.kvGet('bk:' + cont.id, {}); const n = Object.keys(bk.doneU || {}).length; where = n ? `прочитано блоков: ${n}` : ''; } void modes;
    contCard = h('a', { class: 'continue-card', href: `#/file/${cont.id}` }, ring(cont.progress || 0, 44), h('div', { class: 'cc-body' }, h('p', { class: 'eyebrow' }, 'Продолжить'), h('strong', null, cont.name), h('small', null, [subjectName(cont.subject), where, `${Math.round((cont.progress || 0) * 100)}%`].filter(Boolean).join(' · '))), icon('chevron-right', 22));
  }
  // new adapter version: offer a rebuild (marks and progress stay)
  const stale = files.filter(f => f.type === 'html' && f.adapterVersion && f.adapterVersion !== ADAPTER_VERSION);
  const rebuild = stale.length ? h('div', { class: 'notice' }, icon('sparkle', 18), h('span', null, 'Сайт научился лучше адаптировать документы.'), h('button', { class: 'link-btn', onclick: async () => { const p = progressDialog('Адаптирую заново'); let i = 0; for (const f of stale) { p.update(i++ / stale.length, f.name); try { await readapt(f.id); } catch { /* keep the old version */ } } p.close(); toast('Готово. Пометки остались.'); renderHome(root); } }, 'Пересобрать')) : null;
  const counts = {}, prog = {};
  for (const f of files) { counts[f.subject] = (counts[f.subject] || 0) + 1; prog[f.subject] = (prog[f.subject] || 0) + (f.progress || 0); }
  const grid = h('div', { class: 'subject-grid' }, SUBJECTS.map(s => {
    const n = counts[s.key] || 0, p = n ? prog[s.key] / n : 0, tex = subjectTexture(s.key);
    return h('a', { class: 'subject-card ' + subjectStyle(s.key).cls, style: { '--rot': rotFor(s.key) + 'deg', ...(tex ? { '--tex': `url("${tex}")` } : {}) }, href: `#/subject/${s.key}`, 'data-vt': 'subj-' + s.key },
      h('div', { class: 'sc-body' }, h('strong', null, s.name), h('small', null, nFiles(n) + (n ? ` · ${Math.round(p * 100)}% прочитано` : ''))),
      h('div', { class: 'sc-prog', 'aria-label': `Прочитано ${Math.round(p * 100)}%` }, h('i', { style: { width: Math.round(p * 100) + '%' } })),
      subjectSticker(s.key));
  }));

  const parts = [hero, rcBanner, contCard, rebuild, notice].filter(Boolean);
  if (recent.length) {
    parts.push(h('section', { 'aria-label': 'Продолжить читать' },
      h('div', { class: 'sec-head' }, h('h2', null, 'Продолжить читать')),
      h('div', { class: 'hscroll' }, recent.map(f => docCard(f, { subjectLine: true })))));
  }
  parts.push(h('section', { 'aria-label': 'Предметы' }, h('div', { class: 'sec-head' }, h('h2', null, 'Предметы')), grid));
  root.replaceChildren(h('div', { class: 'content wide' }, ...parts));
}
void subjectName;
