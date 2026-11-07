// «Файлы»: every document of every subject (with size and dates), the Корзина (30 days) and the Журнал (what happened to which file).
import { h, fmtBytes } from '../util.js';
import * as db from '../db.js';
import * as lib from '../library.js';
import { SUBJECTS } from '../../config.js';
import { icon } from '../icons.js';
import { toast, menu, confirmDialog, chooseDialog } from '../ui.js';
import { readJournal, KIND_RU } from '../journal.js';
import { refreshShell } from '../shell.js';
import { subjectName, typeBadge } from './common.js';

const fmt = ts => new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtT = ts => new Date(ts).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export async function renderFiles(root, tab = 'all') {
  root.className = 'view files-view';
  const body = h('div', { class: 'files-body' });
  const tabs = [['all', 'Все файлы'], ['trash', 'Корзина'], ['log', 'Журнал']];
  const seg = h('div', { class: 'segmented files-tabs', role: 'tablist' }, ...tabs.map(([k, l]) => h('button', { class: 'seg-btn txt' + (k === tab ? ' on' : ''), role: 'tab', 'aria-selected': String(k === tab), type: 'button', 'data-tab': k, onclick: () => { history.replaceState(null, '', '#/files/' + k); renderFiles(root, k); } }, l)));
  root.replaceChildren(h('div', { class: 'content narrow' }, h('header', { class: 'page-head' }, h('p', { class: 'eyebrow' }, 'Библиотека'), h('h1', { class: 'display' }, 'Файлы')), seg, body));
  if (tab === 'trash') await drawTrash(body, root);
  else if (tab === 'log') await drawLog(body);
  else await drawAll(body, root);
}

async function folderName(f) { if (!f.folderId) return ''; return (await lib.folderPath(f.folderId)).map(x => x.name).join(' / '); }

async function drawAll(body, root) {
  const files = (await lib.liveFiles()).sort((a, b) => (b.updatedAt || b.added || 0) - (a.updatedAt || a.added || 0));
  if (!files.length) { body.replaceChildren(h('p', { class: 'muted' }, 'Файлов пока нет. Откройте предмет и нажмите «Добавить файлы».')); return; }
  const rows = [];
  for (const f of files) {
    const fo = await folderName(f);
    const more = h('button', { class: 'ibtn sm', type: 'button', 'aria-label': 'Действия', onclick: e => { e.preventDefault(); e.stopPropagation(); menu(e.currentTarget, [
      { label: 'Открыть', onClick: () => { location.hash = '#/file/' + f.id; } },
      { label: f.exam ? 'Снять «Экзамен»' : 'Отметить «Экзамен»', onClick: async () => { await lib.setExam(f.id, !f.exam); renderFiles(root); } },
      { label: 'Показать в предмете', onClick: () => { location.hash = `#/subject/${f.subject}${f.folderId ? '/' + f.folderId : ''}`; } },
      { label: 'В корзину', danger: true, onClick: async () => { await lib.trashFile(f.id); refreshShell(); toast(`«${f.name}» в корзине на 30 дней`, { ms: 7000, action: { label: 'Вернуть', fn: async () => { await lib.restoreFile(f.id); refreshShell(); renderFiles(root, 'all'); } } }); renderFiles(root, 'all'); } },
    ]); } }, icon('more'));
    rows.push(h('a', { class: 'file-row', href: '#/file/' + f.id, 'data-id': f.id },
      h('span', { class: 'si-badge' }, typeBadge(f)),
      h('div', { class: 'fr-body' }, h('strong', null, f.name, f.exam ? h('span', { class: 'exam-badge' }, 'Экзамен') : null), h('small', { class: 'muted' }, [subjectName(f.subject), fo, f.size ? fmtBytes(f.size) : '', (f.updatedAt ? 'обновлён ' : 'добавлен ') + fmt(f.updatedAt || f.added)].filter(Boolean).join(' · '))), more));
  }
  body.replaceChildren(h('p', { class: 'muted files-count' }, `Всего: ${files.length}`), h('div', { class: 'file-list' }, ...rows));
}

async function drawTrash(body, root) {
  const list = await lib.trashList();
  if (!list.length) { body.replaceChildren(h('p', { class: 'muted' }, 'Корзина пуста. Удалённые документы лежат здесь 30 дней, потом исчезают.')); return; }
  const left = f => Math.max(0, Math.ceil(lib.TRASH_DAYS - (Date.now() - f.deleted) / 86400000));
  body.replaceChildren(h('div', { class: 'file-list' }, ...list.map(f => h('div', { class: 'file-row', 'data-id': f.id },
    h('span', { class: 'si-badge' }, typeBadge(f)),
    h('div', { class: 'fr-body' }, h('strong', null, f.name), h('small', { class: 'muted' }, `${subjectName(f.subject)} · удалён ${fmt(f.deleted)} · осталось ${left(f)} дн.`)),
    h('button', { class: 'btn btn-sm', type: 'button', onclick: async () => { await lib.restoreFile(f.id); refreshShell(); toast('Восстановлено'); renderFiles(root, 'trash'); } }, 'Восстановить'),
    h('button', { class: 'btn btn-sm btn-danger-soft', type: 'button', onclick: async () => { if (await confirmDialog(`Удалить «${f.name}» навсегда? Это нельзя отменить.`, { ok: 'Удалить', danger: true })) { await lib.deleteFile(f.id); refreshShell(); renderFiles(root, 'trash'); } } }, 'Навсегда')))));
}

async function drawLog(body) {
  const list = await readJournal();
  if (!list.length) { body.replaceChildren(h('p', { class: 'muted' }, 'Журнал пока пуст. Здесь появится, что и когда происходило с файлами.')); return; }
  body.replaceChildren(h('div', { class: 'log-list' }, ...list.slice(0, 300).map(e => h('div', { class: 'log-row' }, h('span', { class: 'log-k k-' + e.kind }, KIND_RU[e.kind] || e.kind), h('span', { class: 'log-n' }, e.name || ''), h('small', { class: 'muted' }, [e.detail, fmtT(e.ts)].filter(Boolean).join(' · '))))));
}
void SUBJECTS; void db; void chooseDialog;
