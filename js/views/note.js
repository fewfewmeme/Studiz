// «Текст»: type or paste a text into a subject. Markdown (**bold**, # headings, tables, lists) is rendered on paste; then the text can be
// edited: font, size, colour, photos with wrapping (left / right / none), size and rotation. Saved as an ordinary file of the subject.
import { h } from '../util.js';
import { SUBJECTS } from '../../config.js';
import { toast, confirmDialog } from '../ui.js';
import { icon } from '../icons.js';
import * as NS from '../note-store.js';
import { NOTE_FONTS, FONT_STACK, NOTE_COLORS, NOTE_SIZES, WRAPS, titleFromText } from '../note-core.js';

// a = 'new' -> b = subject, c = folder id or '-'; otherwise a = file id
export async function renderNote(root, a, b, c) {
  root.className = 'view note-view';
  let meta = null, subject = null, folderId = null, body = '';
  if (a === 'new') { subject = b; folderId = c && c !== '-' ? c : null; if (!SUBJECTS.find(s => s.key === subject)) { location.hash = '#/'; return; } }
  else { const n = await NS.getNote(a); if (!n) { location.hash = '#/'; return; } meta = n.meta; subject = meta.subject; folderId = meta.folderId; body = n.body; }
  const back = meta ? `#/file/${meta.id}` : `#/subject/${subject}${folderId ? '/' + folderId : ''}`;
  let dirty = false, saving = false, sel = null, img = null;

  const title = h('input', { class: 'input note-title', placeholder: 'Название (можно оставить пустым)', 'aria-label': 'Название', maxlength: 120, value: meta ? meta.name : '' });
  const ed = h('div', { class: 'note-ed paper', contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Текст', spellcheck: 'false', 'data-ph': 'Вставьте или напишите текст. **жирный**, # заголовки, | таблицы | станут оформлением.' });
  ed.innerHTML = body;
  const exec = (cmd, val) => { restoreSel(); ed.focus(); document.execCommand('styleWithCSS', false, true); document.execCommand(cmd, false, val); mark(); };
  const mark = () => { dirty = true; };
  const saveSel = () => { const s = getSelection(); if (s.rangeCount && ed.contains(s.anchorNode)) sel = s.getRangeAt(0).cloneRange(); };
  const restoreSel = () => { if (!sel) return; const s = getSelection(); s.removeAllRanges(); s.addRange(sel); };
  document.addEventListener('selectionchange', saveSel);
  ed.addEventListener('input', mark);

  // ---------- toolbar ----------
  const keep = e => e.preventDefault();      // buttons must not steal the selection
  const btn = (label, aria, fn, cls = '') => { const x = h('button', { class: 'btn btn-sm note-b ' + cls, type: 'button', 'aria-label': aria, title: aria }, label); x.addEventListener('pointerdown', keep); x.addEventListener('mousedown', keep); x.addEventListener('click', fn); return x; };
  const fontSel = h('select', { class: 'input note-sel', 'aria-label': 'Шрифт' }, ...NOTE_FONTS.map(([k, t]) => h('option', { value: k }, t)));
  fontSel.addEventListener('change', () => { const v = fontSel.value; exec('fontName', v ? FONT_STACK[v] : 'inherit'); fontSel.value = ''; });
  const sizeSel = h('select', { class: 'input note-sel', 'aria-label': 'Размер' }, h('option', { value: '' }, 'Размер'), ...NOTE_SIZES.map(n => h('option', { value: n }, n + ' px')));
  sizeSel.addEventListener('change', () => { const px = sizeSel.value; if (!px) return; exec('fontSize', '7'); ed.querySelectorAll('font[size="7"], [style*="xxx-large"]').forEach(el => { if (el.tagName === 'FONT') { const s = h('span'); s.append(...el.childNodes); el.replaceWith(s); el = s; } el.style.fontSize = px + 'px'; }); sizeSel.value = ''; });
  const colors = h('div', { class: 'note-colors', role: 'group', 'aria-label': 'Цвет текста' }, ...NOTE_COLORS.map(c => { const s = h('button', { class: 'note-sw', type: 'button', style: { background: c }, 'aria-label': 'Цвет ' + c }); s.addEventListener('pointerdown', keep); s.addEventListener('mousedown', keep); s.addEventListener('click', () => exec('foreColor', c)); return s; }));
  const hl = btn('🖍', 'Выделить маркером', () => exec('backColor', '#fff3a3'));
  const tools = h('div', { class: 'note-tools' },
    btn(h('b', null, 'Ж'), 'Жирный', () => exec('bold')), btn(h('i', null, 'К'), 'Курсив', () => exec('italic')), btn(h('u', null, 'Ч'), 'Подчёркнутый', () => exec('underline')), btn(h('s', null, 'З'), 'Зачёркнутый', () => exec('strikeThrough')), hl,
    btn('H1', 'Заголовок 1', () => exec('formatBlock', 'h1')), btn('H2', 'Заголовок 2', () => exec('formatBlock', 'h2')), btn('H3', 'Заголовок 3', () => exec('formatBlock', 'h3')), btn('Абзац', 'Обычный текст', () => exec('formatBlock', 'p')),
    btn('• список', 'Маркированный список', () => exec('insertUnorderedList')), btn('1. список', 'Нумерованный список', () => exec('insertOrderedList')),
    btn('по центру', 'Выровнять по центру', () => exec('justifyCenter')), btn('слева', 'Выровнять по левому краю', () => exec('justifyLeft')),
    btn('▦ таблица', 'Вставить таблицу 3×3', () => exec('insertHTML', '<table><thead><tr><th>Заголовок</th><th>Заголовок</th><th>Заголовок</th></tr></thead><tbody><tr><td><br></td><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td><td><br></td></tr></tbody></table><p><br></p>')),
    btn(h('span', { class: 'note-ic' }, icon('photo', 18), ' Фото'), 'Вставить фото', () => pick.click()),
    btn('📋 Вставить', 'Вставить из буфера', pasteBtn));
  const style = h('div', { class: 'note-tools' }, fontSel, sizeSel, colors, btn('сброс стиля', 'Убрать оформление выделенного', () => exec('removeFormat')));

  // ---------- paste: Markdown is rendered, formatted HTML is kept (cleaned), plain text becomes paragraphs ----------
  async function insertPasted(text, html) {
    const { looksLikeMarkdown } = await import('../note-core.js');
    let out;
    if (text && looksLikeMarkdown(text)) out = await NS.textToNoteHtml(text);
    else if (html && /<(b|strong|h[1-6]|table|ul|ol|em|i|span|p)\b/i.test(html)) out = await NS.sanitizeBody(html);
    else out = await NS.textToNoteHtml(text || '');
    restoreSel(); ed.focus(); document.execCommand('insertHTML', false, out); mark();
  }
  ed.addEventListener('paste', e => { const cd = e.clipboardData; const file = [...(cd?.files || [])].find(f => f.type.startsWith('image/')); e.preventDefault(); if (file) { addPhoto(file); return; } insertPasted(cd?.getData('text/plain') || '', cd?.getData('text/html') || '').catch(() => toast('Не удалось вставить', { error: true })); });
  async function pasteBtn() { try { const t = await navigator.clipboard.readText(); if (t) await insertPasted(t, ''); else toast('Буфер пуст'); } catch { toast('Нажмите и удерживайте в тексте → «Вставить» (Safari не даёт читать буфер кнопке)'); } }

  // ---------- photos: resize, insert, wrapping / size / rotation ----------
  const pick = h('input', { type: 'file', accept: 'image/*', hidden: true });
  pick.addEventListener('change', () => { const f = pick.files[0]; pick.value = ''; if (f) addPhoto(f); });
  async function addPhoto(file) {
    if (!file.type.startsWith('image/')) { toast('Это не картинка', { error: true }); return; }
    try {
      const bmp = await createImageBitmap(file), k = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
      const cv = h('canvas', { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) }); cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
      const png = file.type === 'image/png', url = cv.toDataURL(png ? 'image/png' : 'image/jpeg', 0.84);
      if (sel && !sel.collapsed) sel.collapse(false);      // a photo never replaces the selected text
      restoreSel(); ed.focus(); document.execCommand('insertHTML', false, `<img src="${url}" data-wrap="none" alt="" style="width:50%"><p><br></p>`); mark();
    } catch { toast('Не удалось открыть фото', { error: true }); }
  }
  const wrapBtns = WRAPS.map(([k, t]) => { const x = h('button', { class: 'btn btn-sm', type: 'button', 'data-w': k }, t); x.addEventListener('click', () => { if (!img) return; img.dataset.wrap = k; if (k === 'none') img.style.float = ''; mark(); syncBar(); }); return x; });
  const wRange = h('input', { type: 'range', min: 15, max: 100, step: 1, 'aria-label': 'Размер фото' });
  const rRange = h('input', { type: 'range', min: -180, max: 180, step: 1, 'aria-label': 'Поворот фото' });
  const rVal = h('span', { class: 'muted' }, '0°');
  const setRot = v => { if (!img) return; v = Math.max(-180, Math.min(180, v)); rRange.value = v; rVal.textContent = v + '°'; if (v) img.style.transform = `rotate(${v}deg)`; else img.style.removeProperty('transform'); mark(); };
  wRange.addEventListener('input', () => { if (img) { img.style.width = wRange.value + '%'; mark(); } });
  rRange.addEventListener('input', () => setRot(+rRange.value));
  const imgBar = h('div', { class: 'note-ctx', hidden: true },
    h('strong', null, 'Фото'), ...wrapBtns, h('label', null, 'Размер ', wRange), h('label', null, 'Поворот ', rRange, rVal),
    h('button', { class: 'btn btn-sm', type: 'button', onclick: () => setRot(+rRange.value - 15) }, '⟲ 15°'), h('button', { class: 'btn btn-sm', type: 'button', onclick: () => setRot(+rRange.value + 15) }, '⟳ 15°'),
    h('button', { class: 'btn btn-sm btn-danger', type: 'button', onclick: () => { img?.remove(); select(null); mark(); } }, 'Удалить фото'));
  const tblBar = h('div', { class: 'note-ctx', hidden: true }, h('strong', null, 'Таблица'),
    h('button', { class: 'btn btn-sm', type: 'button', onclick: () => tbl('addRow') }, '+ строка'), h('button', { class: 'btn btn-sm', type: 'button', onclick: () => tbl('addCol') }, '+ столбец'),
    h('button', { class: 'btn btn-sm', type: 'button', onclick: () => tbl('delRow') }, '− строка'), h('button', { class: 'btn btn-sm', type: 'button', onclick: () => tbl('delCol') }, '− столбец'),
    h('button', { class: 'btn btn-sm btn-danger', type: 'button', onclick: () => tbl('del') }, 'Удалить таблицу'));
  function tbl(op) {
    const cell = (getSelection().anchorNode?.parentElement || sel?.startContainer?.parentElement)?.closest?.('td,th'); if (!cell) return;
    const row = cell.parentElement, table = cell.closest('table'), ci = [...row.children].indexOf(cell);
    if (op === 'addRow') { const r = row.cloneNode(true); r.querySelectorAll('th,td').forEach(c => { c.innerHTML = '<br>'; if (c.tagName === 'TH') { const d = h('td'); d.innerHTML = '<br>'; c.replaceWith(d); } }); row.after(r); }
    else if (op === 'addCol') table.querySelectorAll('tr').forEach(r => { const c = r.children[ci]; const n = h(c?.tagName === 'TH' ? 'th' : 'td'); n.innerHTML = c?.tagName === 'TH' ? 'Заголовок' : '<br>'; c ? c.after(n) : r.append(n); });
    else if (op === 'delRow') { if (table.rows.length > 1) row.remove(); else table.remove(); }
    else if (op === 'delCol') table.querySelectorAll('tr').forEach(r => r.children[ci]?.remove());
    else table.remove();
    mark(); ctx();
  }
  function select(el) { img?.classList.remove('sel'); img = el; if (img) { img.classList.add('sel'); wRange.value = parseFloat(img.style.width) || 50; const m = /rotate\((-?[\d.]+)deg\)/.exec(img.style.transform || ''); const v = m ? Math.round(+m[1]) : 0; rRange.value = v; rVal.textContent = v + '°'; } syncBar(); }
  function syncBar() { imgBar.hidden = !img; wrapBtns.forEach(b => b.classList.toggle('btn-primary', !!img && (img.dataset.wrap || 'none') === b.dataset.w)); }
  function ctx() { const n = sel?.startContainer; tblBar.hidden = !(n && ed.contains(n) && (n.nodeType === 1 ? n : n.parentElement)?.closest('td,th')); }
  ed.addEventListener('click', e => { select(e.target.tagName === 'IMG' ? e.target : null); ctx(); });
  ed.addEventListener('keyup', ctx);

  // ---------- save / cancel ----------
  async function save() {
    if (saving) return; saving = true;
    try {
      ed.querySelectorAll('img.sel').forEach(i => i.classList.remove('sel'));
      const clean = await NS.sanitizeBody(ed.innerHTML);
      if (!clean.replace(/<[^>]+>/g, '').trim() && !/<img/i.test(clean)) { toast('Текст пустой', { error: true }); saving = false; return; }
      const name = title.value.trim() || (meta?.name && meta.ext === 'note' && !title.value ? meta.name : '') || titleFromText(clean);
      const m = meta ? await NS.updateNote(meta.id, { title: name, body: clean }) : await NS.createNote({ subject, folderId, title: name, body: clean });
      dirty = false; document.removeEventListener('selectionchange', saveSel);
      toast('Сохранено'); location.hash = `#/file/${m.id}`;
    } catch (e) { toast(e.message || 'Не удалось сохранить', { error: true }); saving = false; }
  }
  async function cancel() { if (dirty && !(await confirmDialog('Выйти без сохранения? Написанное пропадёт.', { ok: 'Выйти', danger: true }))) return; document.removeEventListener('selectionchange', saveSel); location.hash = back; }

  const subjName = SUBJECTS.find(s => s.key === subject)?.name || '';
  root.replaceChildren(h('div', { class: 'content wide note-wrap' },
    h('header', { class: 'note-head' }, h('div', { class: 'muted' }, subjName + (meta ? ' · правка' : ' · новый текст')), title,
      h('div', { class: 'note-actions' }, h('button', { class: 'btn', type: 'button', onclick: cancel }, 'Отмена'), h('button', { class: 'btn btn-primary', type: 'button', onclick: save }, 'Сохранить'))),
    h('div', { class: 'note-bar' }, tools, style, imgBar, tblBar), ed, pick));
  setTimeout(() => ed.focus(), 50);
  return () => document.removeEventListener('selectionchange', saveSel);
}
