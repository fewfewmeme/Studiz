// Subject page: tinted hero, folders, document cards, upload card.
import { SUBJECTS, ACCEPT } from '../../config.js';
import { h, nFiles } from '../util.js';
import * as lib from '../library.js';
import { importFile, resetToOriginal, readapt, updateFromFile } from '../importer.js';
import { duplicateDialog } from './dupe.js';
import { guessSubject } from '../adapt/guess.js';
import { confirmDialog, promptDialog, alertDialog, progressDialog, menu, customDialog, toast, chooseDialog } from '../ui.js';
import * as db from '../db.js';
import { subjectStyle, docCard, docDetails, rotFor } from './common.js';
import { describeError } from '../db.js';
import { icon } from '../icons.js';
import { subjectSticker, slotSticker, subjectTexture, emptyArtUrl } from '../assets.js';
import { refreshShell } from '../shell.js';

export async function renderSubject(root, subject, folderId, onChanged) {
  root.className = 'view subject-view';
  const subj = SUBJECTS.find(s => s.key === subject);
  if (!subj) { location.hash = '#/'; return; }
  const path = folderId ? await lib.folderPath(folderId) : [];
  if (folderId && !path.length) { location.hash = `#/subject/${subject}`; return; }
  const st = subjectStyle(subject);
  const tex = subjectTexture(subject);

  const input = h('input', { type: 'file', multiple: true, accept: ACCEPT, hidden: true });
  const body = h('div', { class: 'subj-body' });
  const crumbs = h('nav', { class: 'crumbs', 'aria-label': 'Путь' },
    h('a', { href: '#/' }, 'Главная'), icon('chevron-right', 14), h('a', { href: `#/subject/${subject}` }, subj.name),
    path.map(p => [icon('chevron-right', 14), h('a', { href: `#/subject/${subject}/${p.id}` }, p.name)]));
  const title = path.length ? path[path.length - 1].name : subj.name;
  const hero = h('section', { class: `subj-hero ${st.cls}`, style: { '--rot': (rotFor(subject) - 1) + 'deg', ...(tex ? { '--tex': `url("${tex}")` } : {}) }, 'data-vt-target': 'subj-' + subject },
    h('div', { class: 'hero-tex' }),
    h('div', { class: 'hero-body' }, crumbs, h('h1', { class: 'display' }, title), h('p', { class: 'sub count' }, ''),
      h('div', { class: 'hero-actions' },
        h('button', { class: 'btn', onclick: newFolder }, icon('folder', 18), h('span', null, 'Папка')),
        h('button', { class: 'btn', onclick: () => { location.hash = `#/note/new/${subject}/${folderId || '-'}`; } }, icon('lines', 18), h('span', null, 'Вставить текст')),
        h('button', { class: 'btn btn-primary', onclick: () => input.click() }, icon('upload', 18), h('span', null, 'Добавить файлы')))),
    subjectSticker(subject));
  root.replaceChildren(h('div', { class: 'content wide' }, hero, body, input));

  input.addEventListener('change', async () => { const files = [...input.files]; input.value = ''; if (files.length) { await runImport(files, subject, folderId); refresh(); } });
  // drag & drop on desktop
  root.addEventListener('dragover', e => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); root.classList.add('dropping'); } });
  root.addEventListener('dragleave', e => { if (e.target === root) root.classList.remove('dropping'); });
  root.addEventListener('drop', async e => { if (!e.dataTransfer?.files?.length) return; e.preventDefault(); root.classList.remove('dropping'); await runImport([...e.dataTransfer.files], subject, folderId); refresh(); });

  async function newFolder() {
    const name = await promptDialog('Название папки', '', { ok: 'Создать' });
    if (!name) return;
    try { await lib.createFolder(subject, folderId, name); } catch (e) { toast(describeError(e), { error: true }); }
    refresh();
  }

  const SORTS = [['name', 'По названию'], ['opened', 'Недавно открытые'], ['added', 'Недавно добавленные'], ['progress', 'По прогрессу']];
  let sortKey = await db.kvGet('sort:' + subject, 'name');
  const cmp = { name: (a, b) => a.name.localeCompare(b.name, 'ru', { numeric: true }), opened: (a, b) => (b.opened || 0) - (a.opened || 0), added: (a, b) => (b.added || 0) - (a.added || 0), progress: (a, b) => (b.progress || 0) - (a.progress || 0) };
  async function refresh() {
    const { folders, files } = await lib.listFolder(subject, folderId);
    files.sort(cmp[sortKey] || cmp.name);
    hero.querySelector('.count').textContent = `${nFiles(files.length)}${folders.length ? ' · папок: ' + folders.length : ''}`;
    const parts = [];
    if (folders.length) {
      parts.push(h('div', { class: 'folder-grid' }, folders.map((f, i) => h('a', { class: 'folder-card ' + st.cls, href: `#/subject/${subject}/${f.id}` },
        h('span', { class: 'fc-ic' }, icon('folder', 20)), h('div', { class: 'fc-body' }, h('strong', null, f.name), h('small', null, nFiles(f.count))),
        h('button', { class: 'ibtn', 'aria-label': 'Действия с папкой', onclick: e => { e.preventDefault(); e.stopPropagation(); menu(e.currentTarget, [{ label: 'Переименовать', onClick: () => renameFolder(f) }, { label: 'Удалить', danger: true, onClick: () => removeFolder(f) }]); } }, icon('more'))))));
    }
    const upload = h('button', { class: 'upload-card', type: 'button', onclick: () => input.click() },
      h('span', { class: 'upload-ic' }, icon('upload', 28)), h('strong', null, 'Добавить файлы'), h('small', null, 'PDF, HTML, DOCX, TXT, MD, JPG, PNG — можно сразу несколько'));
    if (files.length > 1) parts.push(h('div', { class: 'sort-row', role: 'group', 'aria-label': 'Порядок' }, SORTS.map(([k, l]) => h('button', { class: 'chip' + (k === sortKey ? ' on' : ''), 'aria-pressed': String(k === sortKey), onclick: async () => { sortKey = k; await db.kvSet('sort:' + subject, k); refresh(); } }, l))));
    if (files.length) {
      parts.push(h('div', { class: 'doc-grid' }, files.map(f => { return docCard(f, { onMore: a => fileMenu(a, f), onRebuild: f.srcKind === 'docx' && f.engine !== 'dp' ? () => rebuildFile(f) : null }); }), upload));
    } else if (!folders.length) {
      parts.push(h('div', { class: 'empty-card ' + st.cls, style: (emptyArtUrl() || tex) ? { '--tex': `url("${emptyArtUrl() || tex}")` } : {} }, slotSticker('empty', 'empty-sticker'), h('h3', null, 'Здесь пока пусто'), h('p', null, 'Добавьте конспекты — и они появятся здесь карточками с обложкой и прогрессом.'), h('button', { class: 'btn btn-primary', onclick: () => input.click() }, icon('upload', 18), h('span', null, 'Добавить файлы'))));
    } else parts.push(h('div', { class: 'doc-grid' }, upload));
    body.replaceChildren(...parts);
    onChanged?.();
  }

  function fileMenu(a, f) {
    menu(a, [
      { label: 'Открыть', onClick: () => { location.hash = `#/file/${f.id}`; } },
      ...(f.note ? [{ label: 'Править текст', onClick: () => { location.hash = `#/note/${f.id}`; } }] : []),
      { label: 'Сведения', onClick: () => docDetails(f) },
      { label: 'Переименовать', onClick: () => renameFile(f) },
      { label: f.exam ? 'Снять «Экзамен»' : 'Отметить «Экзамен»', onClick: async () => { await lib.setExam(f.id, !f.exam); refresh(); } },
      { label: 'Переместить…', onClick: () => moveFile(f) },
      ...(f.type === 'html' && !f.raw && !f.note ? [{ label: 'Пересобрать', onClick: () => rebuildFile(f) }] : []),
      ...(f.note ? [] : [{ label: 'Сбросить к оригиналу', onClick: () => resetFile(f) }]),
      { label: 'Удалить', danger: true, onClick: () => removeFile(f) },
    ]);
  }
  async function renameFolder(f) { const name = await promptDialog('Новое название папки', f.name); if (name) { await lib.renameFolder(f.id, name); refresh(); } }
  async function removeFolder(f) {
    const s = await lib.folderStats(f.id);
    const extra = s.files || s.folders ? ` Вместе с ней будут удалены: файлов — ${s.files}, вложенных папок — ${s.folders}.` : '';
    if (await confirmDialog(`Удалить папку «${f.name}»?${extra} Это нельзя отменить.`, { ok: 'Удалить', danger: true })) { await lib.deleteFolder(f.id); refresh(); }
  }
  async function renameFile(f) { const name = await promptDialog('Новое название файла', f.name); if (name) { await lib.renameFile(f.id, name); refresh(); } }
  async function moveFile(f) {
    const dest = await pickDestination();
    if (!dest) return;
    await lib.moveFile(f.id, dest.subject, dest.folderId);
    toast('Файл перемещён'); refresh();
  }
  async function rebuildFile(f) {
    const p = progressDialog('Собираю документ заново');
    try { await readapt(f.id, { onProgress: (t, fr) => p.update(fr ?? 0, t) }); toast('Документ пересобран. Пометки остались.'); } catch (e) { await alertDialog(describeError(e), { title: 'Ошибка' }); }
    p.close(); refresh();
  }
  async function resetFile(f) {
    if (!await confirmDialog(`Сбросить «${f.name}» к оригиналу? Все пометки, заметки и фото будут потеряны.`, { ok: 'Сбросить', danger: true })) return;
    const p = progressDialog('Сбрасываем…');
    try { await resetToOriginal(f.id); toast('Файл возвращён к оригиналу'); } catch (e) { await alertDialog(describeError(e), { title: 'Ошибка' }); }
    p.close(); refresh();
  }
  async function removeFile(f) { await lib.trashFile(f.id); refresh(); refreshShell(); toast(`«${f.name}» в корзине на 30 дней`, { ms: 8000, action: { label: 'Вернуть', fn: async () => { await lib.restoreFile(f.id); refresh(); refreshShell(); } } }); }

  await refresh();
}

export async function runImport(files, subject, folderId) {
  const p = progressDialog('Добавляем файлы');
  const errors = []; let ok = 0, lastOpened = null; const results = [];
  for (let i = 0; i < files.length; i++) {
    p.update(i / files.length, `${i + 1} из ${files.length}: ${files[i].name}`);
    await new Promise(r => setTimeout(r, 0));
    try {
      let hash = null;
      { const buf = await files[i].arrayBuffer(); hash = await lib.sha256(buf); }
      const dup = await lib.findDuplicates({ name: files[i].name, hash });
      if (dup.live || dup.trashed) {
        p.close();
        const choice = await duplicateDialog(files[i], dup);
        if (choice === 'skip' || !choice) { results.push([files[i].name, 'пропущен']); continue; }
        if (choice === 'open') { lastOpened = dup.live.id; results.push([files[i].name, 'уже есть']); continue; }
        if (choice === 'update' || choice === 'restore-update') {
          const target = dup.live || dup.trashed;
          try {
            if (choice === 'restore-update') await lib.restoreFile(target.id);
            await updateFromFile(target.id, files[i]); ok++; lastOpened = target.id; results.push([files[i].name, 'обновлён']);
          } catch (e) { errors.push(`• ${files[i].name}: ${e.message || describeError(e)}`); }
          continue;
        }
      }
      const meta = await importFile(files[i], { subject, folderId, hash, onProgress: (t, fr) => p.update((i + (fr ?? 0)) / files.length, `${i + 1} из ${files.length}: ${files[i].name} — ${t}`) });
      ok++; results.push([meta.name, 'добавлен']);
      const g = meta.subjectGuess && guessSubject(meta.docTitle || meta.name, '');
      const best = meta.subjectGuess;
      if (best && best !== subject && (meta.subjectConfidence ?? 0) >= 0) {
        const sj = SUBJECTS.find(x => x.key === best);
        const confident = (meta.subjectConfidence ?? (await db.get('work', meta.id))?.sdm?.meta?.subjectConfidence ?? 0) > 0.5;
        if (sj && confident) {
          p.close();
          const mv = await chooseDialog(`Похоже, «${meta.name}» относится к предмету «${sj.name}». Положить туда?`, [{ label: `В «${sj.name}»`, value: 'move', primary: true }, { label: 'Оставить здесь', value: 'stay' }], { title: 'Какой предмет?' });
          if (mv === 'move') { await lib.moveFile(meta.id, sj.key, null); results[results.length - 1][1] = `в «${sj.name}»`; }
        }
      }
      void g;
    } catch (e) { errors.push(`• ${e.message || describeError(e)}`); }
  }
  p.update(1, 'Готово'); p.close();
  const summary = results.length > 1 || errors.length ? results.map(([n, st]) => `• ${n}: ${st}`).join('\n') : '';
  if (errors.length) await alertDialog((ok ? `Добавлено: ${ok}. ` : '') + 'Не получилось:\n' + errors.join('\n'), { title: 'Не все файлы добавлены' });
  else if (summary && files.length > 1) toast(`Добавлено файлов: ${ok}`);
  else if (results.length === 1 && results[0][1] === 'обновлён') toast('Обновлено');
  else toast(ok === 1 ? 'Файл добавлен' : `Добавлено файлов: ${ok}`);
  refreshShell();
  if (lastOpened && files.length === 1 && !errors.length) location.hash = '#/file/' + lastOpened;
  return { ok, errors, results };
}

async function pickDestination() {
  const treeFn = await lib.folderTree();
  return new Promise(resolve => {
    const done = v => { m.close(); resolve(v); };
    const rows = [];
    for (const s of SUBJECTS) {
      rows.push(h('button', { class: 'dest-row', onclick: () => done({ subject: s.key, folderId: null }) }, s.name));
      for (const f of treeFn(s.key)) rows.push(h('button', { class: 'dest-row', style: { paddingLeft: (16 + f.depth * 18) + 'px' }, onclick: () => done({ subject: s.key, folderId: f.folderId }) }, '📁 ' + f.name));
    }
    const m = customDialog([h('h3', null, 'Переместить в…'), h('div', { class: 'dest-list' }, rows), h('div', { class: 'modal-actions' }, h('button', { class: 'btn', onclick: () => done(null) }, 'Отмена'))], { onBackdrop: () => done(null) });
  });
}
