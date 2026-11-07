// Persistent app shell: background, sidebar (wide screens), floating tab bar (portrait / phone). Never re-rendered on navigation.
import { SUBJECTS } from '../config.js';
import { h } from './util.js';
import * as db from './db.js';
import { icon } from './icons.js';
import { slotSticker, subjectSticker, stickerSrc, manifest } from './assets.js';
import { subjectStyle, ring } from './views/common.js';
import { customDialog } from './ui.js';
import { lastBackupAt, backupAgeText } from './backup.js';
import { BACKUP_REMINDER_DAYS } from '../config.js';

let els = {};

export function buildShell() {
  const bg = h('div', { class: 'bg', id: 'bg', 'aria-hidden': 'true' }, h('div', { class: 'bg-wall' }), h('div', { class: 'bg-veil' }));
  const subj = h('ul', { class: 'side-subjects' }, SUBJECTS.map(s => h('li', null,
    h('a', { class: 'side-link ' + subjectStyle(s.key).cls, href: `#/subject/${s.key}`, 'data-nav': 'subject-' + s.key },
      h('span', { class: 'side-av' }, subjectSticker(s.key)), h('span', { class: 'side-name' }, s.name), h('span', { class: 'side-meta', 'data-meta': s.key })))));
  const logoSrc = stickerSrc(manifest().slots?.logo);
  const sidebar = h('aside', { class: 'sidebar', id: 'sidebar', 'aria-label': 'Навигация' },
    h('a', { class: 'logo', href: '#/' }, h('span', { class: 'logo-mark' }, logoSrc ? h('img', { src: logoSrc, alt: '' }) : null), h('span', { class: 'logo-text' }, h('strong', null, 'Конспекты'), h('small', null, 'личная библиотека'))),
    h('nav', { class: 'side-nav' },
      navLink('home', '#/', 'home', 'Главная'),
      h('div', { class: 'side-label' }, 'Предметы'), subj,
      h('div', { class: 'side-label' }, 'Ещё'),
      navLink('search', '#/search', 'search', 'Поиск'),
      navLink('files', '#/files', 'folder', 'Файлы'),
      navLink('check', '#/check', 'receipt', 'Чек'),
      navLink('plan', '#/plan', 'list-check', 'План'),
      navLink('days', '#/days', 'book', 'Дни'),
      navLink('archive', '#/archive', 'download', 'Архив для Уголка'),
      navLink('settings', '#/settings', 'settings', 'Настройки')),
    h('div', { class: 'side-foot' }, h('a', { class: 'side-backup', id: 'side-backup', href: '#/settings' }, h('i', { class: 'dot' }), h('span', null, 'Копия: …'))));
  const tabbar = h('nav', { class: 'tabbar glass', id: 'tabbar', 'aria-label': 'Меню' },
    tab('home', '#/', 'home', 'Главная'),
    h('button', { class: 'tab', 'data-nav': 'subjects', type: 'button', onclick: openSubjects }, icon('book', 22), h('span', null, 'Предметы')),
    h('button', { class: 'tab', 'data-nav': 'more', type: 'button', onclick: openMore }, icon('more', 22), h('span', null, 'Ещё')));
  const view = h('main', { class: 'view-host', id: 'view', tabindex: '-1' });
  const shell = h('div', { class: 'shell', id: 'shell' }, sidebar, view, tabbar);
  document.getElementById('app').replaceChildren(bg, shell);
  els = { shell, sidebar, tabbar, view };
  return els;
}
function navLink(key, href, ic, label) { return h('a', { class: 'side-link', href, 'data-nav': key }, h('span', { class: 'side-ic' }, icon(ic, 19)), h('span', { class: 'side-name' }, label)); }
function tab(key, href, ic, label) { return h('a', { class: 'tab', href, 'data-nav': key }, icon(ic, 22), h('span', null, label)); }

function openMore() {
  const m = customDialog([h('h3', null, 'Ещё'), h('div', { class: 'modal-stack' },
    ...[['#/search', 'search', 'Поиск'], ['#/files', 'folder', 'Файлы, корзина, журнал'], ['#/check', 'receipt', 'Чек'], ['#/plan', 'list-check', 'План'], ['#/days', 'book', 'Дни'], ['#/archive', 'download', 'Архив для Уголка'], ['#/settings', 'settings', 'Настройки']].map(([href, ic, label]) => h('a', { class: 'btn', href, onclick: () => m.close() }, icon(ic, 18), h('span', null, label))))], { onBackdrop: () => m.close(), sheet: true });
}
function openSubjects() {
  const m = customDialog([
    h('h3', null, 'Предметы'),
    h('div', { class: 'sheet-grid' }, SUBJECTS.map(s => h('a', { class: 'sheet-item ' + subjectStyle(s.key).cls, href: `#/subject/${s.key}`, onclick: () => m.close() }, h('span', { class: 'side-av' }, subjectSticker(s.key)), h('span', null, s.name)))),
  ], { onBackdrop: () => m.close(), sheet: true });
}

export function setActiveNav(key, inReader) {
  els.shell?.classList.toggle('in-reader', !!inReader);
  document.querySelectorAll('[data-nav]').forEach(a => { const on = a.dataset.nav === key; a.classList.toggle('active', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
}

// per-subject count + progress ring (only when documents exist) and the backup line
export async function refreshShell() {
  const files = (await db.getAll('files')).filter(f => !f.deleted);
  for (const s of SUBJECTS) {
    const fs = files.filter(f => f.subject === s.key);
    const el = document.querySelector(`[data-meta="${s.key}"]`);
    if (!el) continue;
    if (!fs.length) { el.replaceChildren(); continue; }
    const p = fs.reduce((a, f) => a + (f.progress || 0), 0) / fs.length;
    el.replaceChildren(ring(p, 18), String(fs.length));
    el.setAttribute('aria-label', `${fs.length} файлов, прочитано ${Math.round(p * 100)}%`);
  }
  const t = await lastBackupAt();
  const b = document.getElementById('side-backup');
  if (b) {
    b.lastChild.textContent = backupAgeText(t);
    const stale = files.length > 0 && (!t || (Date.now() - t) / 86400000 > BACKUP_REMINDER_DAYS);
    b.classList.toggle('stale', stale);
  }
}
