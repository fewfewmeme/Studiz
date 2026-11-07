// The reader screen. Landscape: NO top bar, NO bottom dock — two slim glass rails (left: back, modes, zoom, timer; right: tools)
// and the document uses the rest. Portrait/phone: one 44 px top bar that hides on scroll + a slim tool dock.
import * as db from '../db.js';
import { uid } from '../db.js';
import { h, debounce, clamp, fmtDur } from '../util.js';
import { MARK_COLORS, MARK_NAMES, PEN_COLORS, PEN_WIDTHS, ERASER_SIZES, UL_STYLES } from '../../config.js';
import { settings, setSetting } from '../settings.js';
import { ping } from '../study.js';
import { AnnoStore } from '../anno/store.js';
import { Tools } from './tools.js';
import { icon } from '../icons.js';
import { toast, alertDialog, customDialog } from '../ui.js';
import { subjectName } from '../views/common.js';
import { backupFlow } from '../backup.js';
import { applyTheme } from '../theme.js';
import { subjectSticker, subjectTexture, deskTexture } from '../assets.js';
import { resetPageZoom } from '../viewport.js';
import * as ST from '../study-store.js';

const rgbHex = c => { const m = String(c).match(/[\d.]+/g); return m ? '#' + [0, 1, 2].map(i => Math.round(+m[i]).toString(16).padStart(2, '0')).join('') : '#ffffff'; };
const MODES = [['orig', 'Оригинал', 'app-window'], ['normal', 'Обычный', 'lines'], ['book', 'Книга', 'book-open'], ['blocks', 'Блоки', 'blocks']];

export async function renderReader(root, id) {
  root.className = 'view reader-view';
  const meta = await db.get('files', id);
  if (!meta) {
    root.append(h('main', { class: 'content' }, h('div', { class: 'empty-card' }, h('h3', null, 'Файл не найден'), h('a', { class: 'btn btn-primary', href: '#/' }, 'На главную'))));
    return;
  }
  const backHref = `#/subject/${meta.subject}${meta.folderId ? '/' + meta.folderId : ''}`;
  await ST.initStudy();
  const tools = await new Tools(id).load();
  const store = await AnnoStore.open(id);

  // ---------------- DOM ----------------
  const stage = h('div', { class: 'rd-stage' });
  const popLayer = h('div', { class: 'pop-layer' });
  const saved = h('span', { class: 'saved-ind', 'aria-live': 'polite' }, icon('check', 12), h('span', null, 'сохранено'));
  const chipRing = h('span', { class: 'chip-ring' });
  const chipText = h('span', { class: 'chip-text' }, '');
  const chipIcon = h('span', { class: 'chip-clock' }, icon('clock', 20));
  const timeEl = h('button', { class: 'timer-chip idle', type: 'button', 'aria-label': 'Таймер блока', title: 'Таймер блока' }, chipIcon, chipRing, chipText);
  let switchMode = () => {};
  const modeBtns = MODES.map(([m, label, ic]) => h('button', { class: 'seg-btn', hidden: m === 'orig' ? true : null, 'data-mode': m, 'aria-pressed': 'false', 'aria-label': label, title: label, onclick: () => switchMode(m) }, icon(ic, 20)));
  const modes = h('div', { class: 'segmented rd-modes', role: 'group', 'aria-label': 'Режим чтения', style: { '--n': MODES.length, '--i': 0 } }, h('span', { class: 'seg-thumb' }), ...modeBtns);
  const backBtn = h('a', { class: 'ibtn rd-back', href: backHref, 'aria-label': 'Назад' }, icon('chevron-left'));
  const listBtn = h('button', { class: 'ibtn rd-list', type: 'button', 'aria-label': 'Список блоков', hidden: true }, icon('list-check', 20));
  const zoomOut = h('button', { class: 'ibtn sm', 'aria-label': 'Мельче', type: 'button' }, icon('minus', 18));
  const zoomIn = h('button', { class: 'ibtn sm', 'aria-label': 'Крупнее', type: 'button' }, icon('plus', 18));
  const zoomPct = h('button', { class: 'zoom-pct', type: 'button', 'aria-label': 'Сбросить (75%)', title: 'Сбросить (75%)' }, '75%');
  const zoomFit = h('button', { class: 'ibtn sm', 'aria-label': 'По ширине', title: 'По ширине', type: 'button' }, icon('fit', 18));
  const zoomGroup = h('div', { class: 'rd-zoom', role: 'group', 'aria-label': 'Масштаб' }, zoomIn, zoomPct, zoomOut, zoomFit);
  const readBtn = h('button', { class: 'ibtn rd-read', type: 'button', 'aria-label': 'Прочитала', title: 'Прочитала', 'aria-pressed': 'false', hidden: true }, icon('check', 20));
  const examBtn = h('button', { class: 'ibtn exam-btn', type: 'button', 'aria-label': 'Экзамен', title: 'Файл к экзамену: время считается отдельно', 'aria-pressed': String(!!meta.exam) }, icon('star', 20));
  const timerHint = h('div', { class: 'timer-hint', role: 'status', hidden: true }, 'Таймер на паузе — нажми, чтобы продолжить');
  const focusBtn = h('button', { class: 'ibtn', type: 'button', 'aria-label': 'Режим фокуса', title: 'Режим фокуса', 'aria-pressed': 'false' }, icon('focus', 20));
  const examBadge = h('span', { class: 'exam-badge', hidden: !meta.exam }, 'Экзамен');
  const title = h('div', { class: 'rd-title' }, h('strong', { title: meta.name }, meta.name), h('small', null, subjectName(meta.subject), examBadge));
  const railL = h('div', { class: 'rail rail-l glass', 'aria-label': 'Панель чтения' });
  const railR = h('div', { class: 'rail rail-r glass', role: 'toolbar', 'aria-label': 'Инструменты' });
  const top = h('header', { class: 'rd-top glass' });
  const dockEl = h('nav', { class: 'dock glass', role: 'toolbar', 'aria-label': 'Инструменты' });
  const pill = h('div', { class: 'pill glass', role: 'toolbar', 'aria-label': 'Действия с выделенным' });
  const label = h('div', { class: 'rd-label' }, meta.name);
  const progress = h('div', { class: 'rd-progress', 'aria-hidden': 'true' }, h('i'));
  const edgeL = h('button', { class: 'rd-edge edge-l', type: 'button', 'aria-label': 'Показать панель' }), edgeR = h('button', { class: 'rd-edge edge-r', type: 'button', 'aria-label': 'Показать панель' });
  const reader = h('div', { class: 'reader' }, stage, progress, label, railL, railR, top, dockEl, pill, edgeL, edgeR, popLayer, timerHint);
  root.append(reader);
  document.documentElement.classList.add('reader-open');
  { const dt = deskTexture(); if (dt) reader.style.setProperty('--desk-img', `url("${dt}")`); }
  stage.append(h('div', { class: 'rd-loading', 'aria-label': 'Загрузка' }));

  const initP = (async () => {
    // ---------------- ctx shared with documents ----------------
    let metaChain = Promise.resolve();
    const patchMeta = patch => (metaChain = metaChain.then(() => db.modify('files', id, f => (f ? { ...f, ...patch } : undefined))).catch(() => {}));
    const savePos = (m, o) => { db.kvSet(`pos:${id}:${m}`, o).catch(() => {}); };
    const saveProgress = debounce(r => patchMeta({ progress: clamp(r, 0, 1) }), 800);
    const progressFn = r => { progress.firstChild.style.width = (clamp(r, 0, 1) * 100).toFixed(1) + '%'; saveProgress(r); };
    let doc = null, unanchored = [], moreBtn = null, pointerDown = false;
    const ctx = {
      meta, stage, store, tools, root: reader, touch: ping, savePos, progress: progressFn,
      toggleChrome: () => setFocus(!reader.classList.contains('focus')),
      markTap: (ids, rect) => markPopover(ids, rect),
      onZoom: z => { zoomPct.textContent = Math.round(z * 100) + '%'; },
      onUnanchored: list => { unanchored = list || []; moreBtn?.classList.toggle('badge', unanchored.length > 0); },
      pop: { open: (...a) => openPop(...a), close: () => closePop(), el: () => pop?.el },
      chipEl: () => timeEl, root: reader, switchMode: m => switchMode(m), getSettings: () => settings(),
      wake: () => wake(), onSelection: () => updateSel(), onPointer: d => { pointerDown = !!d; },
      onTheme: t => { try { const k = t.bg + '|' + t.accent; if (meta.docTheme?.k !== k) { meta.docTheme = { k, bg: t.bg, ink: t.ink, accent: t.accent }; patchMeta({ docTheme: meta.docTheme }); } document.querySelector('meta[name=theme-color]')?.setAttribute('content', rgbHex(t.bg)); } catch { /* cosmetic */ }
        reader.style.setProperty('--doc-bg', t.bg); reader.style.setProperty('--doc-ink', t.ink); reader.style.setProperty('--doc-accent', t.accent); reader.classList.toggle('doc-dark', !!t.dark); },
      onFrameScroll: top => frameScroll(top),
      rewardCard: r => showRewardCard(r),
      chip: { set: (text, frac) => { chipOverride = text == null ? null : { text, frac }; paintChip(); } },
      coverFace: () => {
        const tex = subjectTexture(meta.subject);
        return h('div', { class: 'cover-face sj-' + meta.subject, style: tex ? { '--tex': `url("${tex}")` } : {} },
          h('p', { class: 'cf-eyebrow' }, subjectName(meta.subject)), h('h2', { class: 'cf-title' }, meta.name), subjectSticker(meta.subject, 'cf-sticker'));
      },
      addText: (layer, p) => {
        const rec0 = { type: 'text', page: layer.page, x: clamp(p[0] - 0.02, 0, 0.66), y: Math.max(0, p[1] - 0.01), w: 0.34, fs: 0.03, color: PEN_COLORS[0], html: '' };
        const anc = layer.anchorOf?.(rec0); if (anc) rec0.anc = anc;
        const r = store.add(rec0);
        tools.set({ tool: 'none' });
        layer.render(); layer.focusObj(r.id); setTimeout(() => layer.focusObj(r.id), 40);
      },
      addPhotoTo: async (layer, file, scroller) => {
        if (!file.type.startsWith('image/')) { toast('Это не картинка', { error: true }); return; }
        try {
          const buf = await file.arrayBuffer(), blob = new Blob([buf], { type: file.type });
          const dims = await new Promise((res, rej) => { const u = URL.createObjectURL(blob), im = new Image(); im.onload = () => { res({ w: im.naturalWidth, h: im.naturalHeight }); URL.revokeObjectURL(u); }; im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('Не удалось прочитать картинку')); }; im.src = u; });
          const key = uid(); await db.put('images', { id: key, fileId: id, blob, mime: file.type });
          const w = 0.4; let y;
          if (scroller && layer.over.parentElement?.classList.contains('doc-wrap')) { const lr = layer.over.getBoundingClientRect(); y = Math.max(0, (scroller.getBoundingClientRect().top + scroller.clientHeight / 2 - lr.top) / lr.width - (w * dims.h / dims.w) / 2); }
          else y = Math.max(0, (layer.H / layer.W) / 2 - (w * dims.h / dims.w) / 2);
          const rec1 = { type: 'photo', blobKey: key, page: layer.page, x: 0.3, y, w, h: null, rot: 0 };
          const anc = layer.anchorOf?.(rec1); if (anc) rec1.anc = anc;
          store.add(rec1);
        } catch (e) { toast(db.describeError(e), { error: true }); }
      },
    };

    try {
      if (meta.type === 'html' || meta.conv) { const mod = await import('./framedoc.js'); doc = new mod.FrameDoc(ctx); }
      else { const mod = await import('./pdfdoc.js'); doc = new mod.PdfDoc(ctx); }
      await doc.load();
      if (doc.views?.includes('orig')) { modeBtns[0].hidden = false; }
      modes.style.setProperty('--n', modeBtns.filter(b => !b.hidden).length);
    } catch (e) {
      stage.replaceChildren(h('div', { class: 'empty-card err-state' }, h('h3', null, 'Не удалось открыть файл'), h('p', null, e.message || String(e)), h('div', { class: 'actions' }, h('a', { class: 'btn btn-primary', href: backHref }, 'Назад к файлам'), h('button', { class: 'btn', onclick: () => window.__copyCrash?.(e) }, 'Скопировать отчёт об ошибке'))));
      modes.hidden = true; return;
    }

    // ---------------- popovers ----------------
    let pop = null;
    const closePop = () => { if (pop) { pop.el.classList.add('out'); const e = pop.el; setTimeout(() => e.remove(), 140); pop.onClose?.(); pop = null; } };
    // side: 'up' (above a dock button), 'left' / 'right' (beside a rail)
    function openPop(anchor, content, { onClose, side, cls = '' } = {}) {
      closePop();
      const land = reader.classList.contains('land');
      side = side || (anchor.closest?.('.rail-r') ? 'left' : anchor.closest?.('.rail-l') ? 'right' : 'up');
      const el = h('div', { class: 'popover glass ' + cls + (land ? ' land' : ''), role: 'dialog' }, content);
      popLayer.append(el);
      const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : anchor;
      const w = el.offsetWidth, hh = el.offsetHeight;
      let left, topPos;
      if (side === 'left') { left = r.left - w - 12; topPos = r.top + r.height / 2 - hh / 2; el.style.transformOrigin = '100% 50%'; }
      else if (side === 'right') { left = r.right + 12; topPos = r.top + r.height / 2 - hh / 2; el.style.transformOrigin = '0 50%'; }
      else { left = r.left + r.width / 2 - w / 2; topPos = r.top - hh - 10; if (topPos < 8) topPos = r.bottom + 10; }
      left = clamp(left, 8, innerWidth - w - 8); topPos = clamp(topPos, 8, innerHeight - hh - 8);
      el.style.left = left + 'px'; el.style.top = topPos + 'px';
      pop = { el, onClose, anchor };
      return pop;
    }
    const onDocDownClose = e => { if (pop && !e.target.closest('.popover') && !e.target.closest('.rail, .dock, .pill, .rd-top')) closePop(); };
    document.addEventListener('pointerdown', onDocDownClose, true);

    const swatches = (cur, onPick, names = MARK_NAMES, vars = true) => h('div', { class: 'swatches' }, MARK_COLORS.map((c, i) => h('button', {
      class: 'sw' + (cur === i + 1 ? ' on' : ''), style: { background: vars ? `var(--mark-${i + 1})` : c }, 'aria-label': names[i], 'aria-pressed': String(cur === i + 1), onclick: () => onPick(i + 1) })));
    const inkSwatches = (cur, onPick) => h('div', { class: 'swatches' }, PEN_COLORS.map((c, i) => h('button', { class: 'sw ink' + (cur === i ? ' on' : ''), style: { background: c }, 'aria-label': 'Цвет ' + (i + 1), onclick: () => onPick(i) })));
    const sw = (label, on, fn, desc) => h('label', { class: 'switch-row' }, h('span', null, h('strong', null, label), desc ? h('small', null, desc) : null), h('input', { type: 'checkbox', checked: on || null, onchange: e => fn(e.target.checked) }));
    const row = (ic, label, fn) => h('button', { class: 'menu-row', onclick: () => { closePop(); fn(); } }, icon(ic, 20), h('span', null, label));
    const hlProps = () => ({ color: tools.markColorToken() });
    const ulProps = () => ({ color: tools.ulInk(), ulStyle: tools.ulStyle });

    function markerPop(anchor, applyNow) {
      const body = h('div', { class: 'pop-body' });
      const draw = () => body.replaceChildren(
        h('div', { class: 'pop-title' }, 'Маркер'),
        swatches(tools.color, c => { tools.set({ color: c }); draw(); if (applyNow && doc.hasSelection()) { doc.applyTextMark('hl', hlProps()); closePop(); } }),
        sw('Режим маркера', tools.markerMode, v => tools.set({ markerMode: v }), 'Выделил текст — он сразу закрашен'),
        doc.caps().draw ? sw('Кисть', tools.brush, v => { tools.set({ brush: v }); }, 'Рисовать маркером по листу (для сканов)') : null);
      draw(); openPop(anchor, body);
    }
    function underlinePop(anchor, applyNow) {
      const body = h('div', { class: 'pop-body' });
      const draw = () => body.replaceChildren(
        h('div', { class: 'pop-title' }, 'Подчёркивание'),
        h('div', { class: 'ul-styles' }, UL_STYLES.map(([k, l]) => h('button', { class: 'ul-style' + (tools.ulStyle === k ? ' on' : ''), onclick: () => { tools.set({ ulStyle: k }); draw(); if (applyNow && doc.hasSelection()) { doc.applyTextMark('ul', ulProps()); closePop(); } } }, h('span', { style: { textDecoration: 'underline', textDecorationStyle: k, textDecorationColor: tools.ulInk(), textUnderlineOffset: '4px', textDecorationThickness: '2px' } }, 'Текст'), h('small', null, l)))),
        inkSwatches(tools.ulColor, i => { tools.set({ ulColor: i }); draw(); }));
      draw(); openPop(anchor, body);
    }
    function penPop(anchor) {
      const body = h('div', { class: 'pop-body' });
      const draw = () => body.replaceChildren(
        h('div', { class: 'pop-title' }, 'Ручка'), inkSwatches(tools.penIdx, i => { tools.set({ penIdx: i }); draw(); }),
        h('div', { class: 'widths' }, PEN_WIDTHS.map((w, i) => h('button', { class: 'wbtn' + (tools.penW === i ? ' on' : ''), 'aria-label': 'Толщина ' + (i + 1), onclick: () => { tools.set({ penW: i }); draw(); } }, h('i', { style: { height: 2 + i * 2.5 + 'px', background: tools.penColor() } })))),
        sw('Рисовать пальцем', settings().drawWithFinger, v => setSetting({ drawWithFinger: v }), 'Выключено: рисует только Apple Pencil, пальцем — прокрутка'));
      draw(); openPop(anchor, body);
    }
    function eraserPop(anchor) {
      const body = h('div', { class: 'pop-body' });
      const draw = () => body.replaceChildren(h('div', { class: 'pop-title' }, 'Ластик'), h('div', { class: 'widths' }, ERASER_SIZES.map((s, i) => h('button', { class: 'wbtn' + (tools.eraserIdx === i ? ' on' : ''), 'aria-label': 'Размер ' + (i + 1), onclick: () => { tools.set({ eraserIdx: i }); draw(); } }, h('i', { class: 'round', style: { width: 8 + i * 6 + 'px', height: 8 + i * 6 + 'px' } })))), h('p', { class: 'muted' }, 'Стирает штрих целиком. Нажмите на пометку, чтобы убрать её.'));
      draw(); openPop(anchor, body);
    }
    // ---------- reading comfort (size / weight / family / width) — shared by the «Ещё» menu and the Оригинал sheet ----------
    function comfortBody(close) {
      const st = doc.cfgState || {};
      const seg = (label, cur, opts, fn) => h('div', { class: 'cmf-row' }, h('span', { class: 'cmf-l' }, label), h('div', { class: 'segmented cmf-seg' }, ...opts.map(([v, t]) => h('button', { class: 'seg-btn txt' + (cur === v ? ' on' : ''), type: 'button', 'aria-pressed': String(cur === v), onclick: e => { fn(v); e.currentTarget.parentElement.querySelectorAll('.seg-btn').forEach(b => { b.classList.remove('on'); b.setAttribute('aria-pressed', 'false'); }); e.currentTarget.classList.add('on'); e.currentTarget.setAttribute('aria-pressed', 'true'); } }, t))));
      const pct = h('strong', { class: 'cmf-pct' }, Math.round((doc.zoomValue?.() || 0.75) * 100) + '%');
      const upd = () => { pct.textContent = Math.round(doc.zoomValue() * 100) + '%'; };
      const zr = h('div', { class: 'cmf-row' }, h('span', { class: 'cmf-l' }, 'Размер текста'), h('div', { class: 'cmf-zoom' }, h('button', { class: 'ibtn sm', type: 'button', 'aria-label': 'Мельче', onclick: () => { doc.zoomStep(-1); upd(); } }, icon('minus', 18)), pct, h('button', { class: 'ibtn sm', type: 'button', 'aria-label': 'Крупнее', onclick: () => { doc.zoomStep(1); upd(); } }, icon('plus', 18)), h('button', { class: 'btn btn-sm btn-quiet', type: 'button', onclick: () => { doc.resetZoom(); upd(); } }, 'Сбросить (75%)')));
      return h('div', { class: 'pop-body cmf' }, h('div', { class: 'pop-title' }, 'Текст'), zr,
        seg('Насыщенность', st.weight || 'file', [['file', 'Как в файле'], ['lighter', 'Светлее']], v => doc.setFont({ weight: v })),
        seg('Шрифт', st.family || 'file', [['file', 'Как в файле'], ['sans', 'Без засечек'], ['serif', 'С засечками']], v => doc.setFont({ family: v })),
        mode !== 'book' && mode !== 'orig' ? seg('Ширина', st.width || 'wide', [['wide', 'На весь экран'], ['original', 'Как в файле']], v => doc.setWidth(v)) : null,
        close ? h('div', { class: 'pop-actions' }, h('button', { class: 'btn', type: 'button', onclick: close }, 'Готово')) : null);
    }
    // ---------- «Оригинал»: the file fills the screen; one small handle opens a sheet ----------
    const origHandle = h('button', { class: 'orig-handle glass', type: 'button', 'aria-label': 'Меню чтения', hidden: true }, icon('menu', 20));
    reader.append(origHandle);
    let handleT = null;
    const showHandle = () => { origHandle.classList.add('show'); clearTimeout(handleT); handleT = setTimeout(() => { if (!pop) origHandle.classList.remove('show'); }, 2000); };
    origHandle.addEventListener('click', () => (pop ? closePop() : origSheet()));
    function origSheet() {
      const views = h('div', { class: 'segmented cmf-seg' }, ...doc.views.map(v => h('button', { class: 'seg-btn txt' + (v === mode ? ' on' : ''), type: 'button', onclick: () => { closePop(); switchMode(v); } }, MODES.find(x => x[0] === v)[1])));
      const body = h('div', { class: 'pop-body cmf orig-sheet' }, h('div', { class: 'pop-title' }, meta.name),
        h('a', { class: 'menu-row', href: backHref }, icon('chevron-left', 20), h('span', null, 'Назад к файлам')),
        h('div', { class: 'cmf-row' }, h('span', { class: 'cmf-l' }, 'Вид'), views),
        comfortBody(null),
        row('bookmark', 'Закладка здесь', () => addBookmark()), row('download', 'Сделать копию', () => backupFlow()),
        h('div', { class: 'menu-row static' }, icon('clock', 20), h('span', null, 'Блок'), h('span', { class: 'spacer' }), h('strong', { class: 'orig-block-time' }, chipOverride ? chipOverride.text : 'не идёт')));
      openPop(origHandle, body, { side: 'right', cls: 'orig-pop' });
    }
    function morePop(anchor) {
      const rows = [];
      const caps = doc.caps();
      if (doc.engine) rows.push(row('list', 'Оглавление и закладки', () => doc.engine.openToc()));
      if (caps.zoom && !reader.classList.contains('land')) rows.push(h('div', { class: 'menu-row static' }, icon('search', 20), h('span', null, 'Масштаб'), h('span', { class: 'spacer' }),
        h('button', { class: 'ibtn sm', 'aria-label': 'Мельче', onclick: () => doc.zoomBy(0.85) }, icon('minus', 18)), h('span', { class: 'zoom-pct static' }, Math.round((doc.zoomValue?.() || 1) * 100) + '%'), h('button', { class: 'ibtn sm', 'aria-label': 'Крупнее', onclick: () => doc.zoomBy(1.18) }, icon('plus', 18)), h('button', { class: 'ibtn sm', 'aria-label': 'По ширине', onclick: () => { doc.fitWidth(); closePop(); } }, icon('fit', 18))));
      if (doc.kind === 'pdf' && doc.hasTrim) rows.push(sw('Обрезать поля', doc.trimOn, async v => { await doc.setTrim(v); await switchMode(mode, true); }, 'Показывать только область с текстом'));
      if (doc.cfgState) rows.push(row('lines', 'Текст: размер, шрифт, ширина', () => setTimeout(() => openPop(anchor, comfortBody(closePop), { side: anchor.closest?.('.rail-r') ? 'left' : 'up' }), 30)));
      rows.push(sw('Экзамен', !!meta.exam, v => toggleExam(v), 'Время в этом файле считается и отдельно «к экзамену»'));
      rows.push(row('bookmark', 'Закладки', () => bookmarksDialog()), row('bookmark', 'Добавить закладку здесь', () => addBookmark()));
      if (unanchored.length) rows.push(row('info', `Не удалось привязать (${unanchored.length})`, () => unanchoredDialog()));
      rows.push(row('download', 'Печать / сохранить как PDF', () => printDoc()));
      if (doc.kind !== 'image') rows.push(sw('Обложка', settings().bookCover, async v => { await setSetting({ bookCover: v }); if (mode === 'book') await switchMode(mode, true); }, 'Слева на первом развороте; выключено — первая страница по центру'));
      if (!reader.classList.contains('land')) rows.push(row('focus', 'Режим фокуса', () => setFocus(true)));
      if (document.fullscreenEnabled) rows.push(row('fullscreen', 'На весь экран', () => { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.(); }));
      rows.push(sw('Рисовать пальцем', settings().drawWithFinger, v => setSetting({ drawWithFinger: v })));
      openPop(anchor, h('div', { class: 'pop-body menu' }, h('div', { class: 'pop-title' }, 'Ещё'), ...rows));
    }

    // ---------- bookmarks (per document, all modes) ----------
    const bmKey = 'bmk:' + id;
    async function addBookmark() {
      const list = await db.kvGet(bmKey, []);
      let bm = null;
      if (doc.kind === 'html') { const b = await doc.currentBlock?.(); if (b) bm = { kind: 'block', ref: b.id, title: b.title }; }
      else { const pg = doc.engine ? doc.engine.firstPageOfView() + 1 : (doc.currentView?.(doc.scrollHost)?.n || 1); bm = { kind: 'page', ref: pg, title: 'стр. ' + pg }; }
      if (!bm) { toast('Здесь закладку поставить нельзя'); return; }
      if (list.some(x => x.kind === bm.kind && x.ref === bm.ref)) { toast('Закладка здесь уже есть'); return; }
      list.push({ ...bm, id: uid().slice(0, 8), ts: Date.now() }); await db.kvSet(bmKey, list); toast('Закладка добавлена: ' + bm.title);
    }
    async function bookmarksDialog() {
      const draw = async () => {
        const list = await db.kvGet(bmKey, []);
        body.replaceChildren(...(list.length ? list.map(b => h('div', { class: 'trash-item' }, h('button', { class: 'menu-row', style: { flex: 1 }, onclick: async () => { m.close(); await doc.jumpTo?.(b); } }, icon('bookmark', 20), h('span', null, b.title)), h('button', { class: 'ibtn sm', 'aria-label': 'Убрать закладку', onclick: async () => { await db.kvSet(bmKey, list.filter(x => x.id !== b.id)); draw(); } }, icon('x', 16)))) : [h('p', { class: 'muted' }, 'Закладок пока нет. Откройте меню «Ещё» → «Добавить закладку здесь».')]));
      };
      const body = h('div', { class: 'bm-list' });
      const m = customDialog([h('h3', null, 'Закладки'), body, h('div', { class: 'modal-actions' }, h('button', { class: 'btn', onclick: () => m.close() }, 'Закрыть'))], { onBackdrop: () => m.close() });
      draw();
    }
    // marks whose text can no longer be found (the document changed) are never dropped silently
    function unanchoredDialog() {
      const body = h('div', null);
      const draw = () => {
        const list = unanchored.filter(x => store.get(x.id));
        body.replaceChildren(...(list.length ? list.map(x => h('div', { class: 'trash-item' }, h('div', null, h('strong', null, '«' + (x.anchor?.quote || '').slice(0, 90) + '»'), h('small', null, ({ hl: 'маркер', ul: 'подчёркивание', strike: 'зачёркивание', note: 'заметка' })[x.type] || 'пометка')), h('button', { class: 'btn btn-sm btn-danger-soft', onclick: () => { store.remove(x.id); draw(); } }, 'Убрать'))) : [h('p', { class: 'muted' }, 'Все пометки на месте.')]));
      };
      const m = customDialog([h('h3', null, 'Не удалось привязать'), h('p', { class: 'muted' }, 'Этого текста в новой версии документа больше нет. Пометки сохранены; можно убрать лишние.'), body, h('div', { class: 'modal-actions' }, h('button', { class: 'btn', onclick: () => m.close() }, 'Закрыть'))], { onBackdrop: () => m.close() });
      draw();
    }
    // print / "save as PDF": the document with her marks (print stylesheet in reader.css)
    async function printDoc() {
      if (doc.print) { closePop(); doc.print(); return; }
      if (mode !== 'normal') await switchMode('normal');
      closePop(); setTimeout(() => window.print(), 400);
    }

    function markPopover(ids, rect) {
      const recs = ids.map(i => store.get(i)).filter(Boolean);
      if (!recs.length) return;
      const main = recs[recs.length - 1];
      const body = h('div', { class: 'pop-body' });
      const draw = () => {
        const cur = store.get(main.id) || main;
        const parts = [h('div', { class: 'pop-title' }, ({ hl: 'Маркер', ul: 'Подчёркивание', strike: 'Зачёркивание', note: 'Заметка', bold: 'Жирный' })[cur.type] || 'Пометка')];
        if (cur.type === 'hl') parts.push(swatches(Number(/^m(\d)$/.exec(cur.color || '')?.[1]) || 0, c => { store.update(cur.id, { color: 'm' + c }); draw(); }));
        if (cur.type === 'ul') parts.push(h('div', { class: 'ul-styles' }, UL_STYLES.map(([k, l]) => h('button', { class: 'ul-style' + ((cur.ulStyle || 'solid') === k ? ' on' : ''), onclick: () => { store.update(cur.id, { ulStyle: k }); draw(); } }, h('span', { style: { textDecoration: 'underline', textDecorationStyle: k, textUnderlineOffset: '4px', textDecorationThickness: '2px' } }, 'Текст'), h('small', null, l)))));
        const note = h('textarea', { class: 'input', rows: 3, placeholder: 'Заметка к этому месту…', 'aria-label': 'Заметка' });
        note.value = cur.note || '';
        note.addEventListener('change', () => store.update(cur.id, { note: note.value.trim() }));
        if (cur.type === 'note' || cur.note) parts.push(note);
        else parts.push(h('button', { class: 'btn btn-quiet', onclick: () => { store.update(cur.id, { note: ' ' }); draw(); } }, icon('note', 16), h('span', null, 'Добавить заметку')));
        parts.push(h('div', { class: 'pop-actions' }, h('button', { class: 'btn btn-danger-soft', onclick: () => { store.transaction(() => recs.forEach(r => store.remove(r.id)), 'unmark'); closePop(); } }, icon('trash', 16), h('span', null, 'Убрать')), h('button', { class: 'btn', onclick: closePop }, 'Готово')));
        body.replaceChildren(...parts);
      };
      draw(); openPop(rect, body, { side: 'up' });
    }

    // ---------------- tools (right rail / dock) ----------------
    const items = [
      { id: 'marker', ic: 'marker', label: 'Выделить', tool: 'marker', pop: a => markerPop(a, true) },
      { id: 'underline', ic: 'underline', label: 'Подчеркнуть', tool: 'underline', pop: a => underlinePop(a, true) },
      { id: 'pen', ic: 'pen', label: 'Ручка', tool: 'pen', need: 'draw', pop: penPop },
      { id: 'eraser', ic: 'eraser', label: 'Ластик', tool: 'eraser', pop: eraserPop },
      { id: 'text', ic: 'text', label: 'Текст', tool: 'text', need: 'text' },
      { id: 'photo', ic: 'photo', label: 'Фото', need: 'photo', action: () => pickPhoto() },
    ];
    const dockBtns = {};
    const dbtn = (it, extra) => h('button', { class: 'dbtn' + (extra ? ' ' + extra : ''), 'data-id': it.id, 'aria-label': it.label, 'data-tip': it.label, 'aria-pressed': 'false', type: 'button' }, icon(it.ic, 22), h('span', null, it.label));
    items.forEach(it => {
      const b = dbtn(it); dockBtns[it.id] = b;
      b.addEventListener('click', () => {
        const caps = doc.caps();
        if (it.need && !caps[it.need]) { toast(it.need === 'photo' ? 'Фото можно добавлять в обычном режиме и в PDF' : 'Рисовать можно в обычном режиме и в PDF'); return; }
        if (it.action) { it.action(); return; }
        if (tools.tool === it.tool) { if (pop && pop.anchor === b) { closePop(); } else if (it.pop && !pop) { it.pop(b); } else { closePop(); tools.set({ tool: 'none' }); } return; }
        tools.set({ tool: it.tool });
        if (it.pop) it.pop(b); else closePop();
      });
    });
    const undoBtn = dbtn({ id: 'undo', ic: 'undo', label: 'Отмена' }, 'small');
    const redoBtn = dbtn({ id: 'redo', ic: 'redo', label: 'Повтор' }, 'small');
    moreBtn = dbtn({ id: 'more', ic: 'more', label: 'Ещё' }, 'small');
    const press = b => b.animate?.([{ transform: 'scale(1)' }, { transform: 'scale(.86)' }, { transform: 'scale(1)' }], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
    undoBtn.addEventListener('click', () => { store.undo(); press(undoBtn); });
    redoBtn.addEventListener('click', () => { store.redo(); press(redoBtn); });
    moreBtn.addEventListener('click', () => (pop && pop.anchor === moreBtn ? closePop() : morePop(moreBtn)));
    const moreSep = h('span', { class: 'dsep' });
    const toolEls = [...Object.values(dockBtns), h('span', { class: 'dsep' }), undoBtn, redoBtn, moreSep, moreBtn];

    function refreshDock() {
      const caps = doc.caps();
      for (const it of items) {
        const b = dockBtns[it.id];
        b.classList.toggle('on', !!it.tool && tools.tool === it.tool);
        b.setAttribute('aria-pressed', String(!!it.tool && tools.tool === it.tool));
        b.classList.toggle('na', !!it.need && !caps[it.need]);
      }
      dockBtns.marker.classList.toggle('brush', tools.tool === 'marker' && tools.brush);
      dockBtns.marker.style.setProperty('--c', `var(--mark-${tools.color})`);
      undoBtn.disabled = !store.canUndo; redoBtn.disabled = !store.canRedo;
      undoBtn.classList.toggle('dis', !store.canUndo); redoBtn.classList.toggle('dis', !store.canRedo);
      for (const k of ['pen', 'eraser', 'text', 'brush']) stage.classList.toggle('tool-' + k, tools.drawTool() === k);
      stage.classList.toggle('is-drawing', tools.drawing());
      stage.classList.toggle('finger-draw', !!settings().drawWithFinger);
      dockBtns.pen.style.setProperty('--c', tools.penColor());
      zoomGroup.hidden = !caps.zoom;
    }
    tools.onChange(refreshDock);
    const offStore = store.onChange((kind, ids, e) => {
      if (kind === 'state') {
        if (store.state === 'saved' && reader.dataset.dirty) { saved.classList.add('show'); clearTimeout(saved._t); saved._t = setTimeout(() => saved.classList.remove('show'), 1600); delete reader.dataset.dirty; }
        if (store.state === 'dirty' || store.state === 'saving') reader.dataset.dirty = '1';
        if (store.state === 'error') toast('Не удалось сохранить пометки: ' + db.describeError(e), { error: true });
        return;
      }
      refreshDock();
    });

    function pickPhoto() {
      const inp = h('input', { type: 'file', accept: 'image/*' });
      inp.addEventListener('change', () => { const f = inp.files[0]; if (f) doc.addPhoto(f); });
      inp.click();
    }

    // zoom buttons
    zoomOut.addEventListener('click', () => doc.zoomBy(0.85));
    zoomIn.addEventListener('click', () => doc.zoomBy(1.18));
    zoomPct.addEventListener('click', () => (doc.resetZoom ? doc.resetZoom() : doc.setZoom(1)));
    zoomFit.addEventListener('click', () => doc.fitWidth());

    // ---------------- selection pill ----------------
    const pBtn = (ic, label, fn, cls = '') => { const b = h('button', { class: 'pbtn ' + cls, 'aria-label': label, type: 'button' }, icon(ic, 22), h('span', null, label)); b.addEventListener('click', fn); return b; };
    const markBtn = pBtn('marker', 'Маркер', () => { doc.applyTextMark('hl', hlProps()); }, 'main');
    markBtn.append(h('i', { class: 'cdot' }));
    const markChev = h('button', { class: 'pchev', 'aria-label': 'Цвет маркера', type: 'button', onclick: e => markerPop(e.currentTarget, true) }, icon('chevron-up', 16));
    const ulBtn = pBtn('underline', 'Линия', () => { doc.applyTextMark('ul', ulProps()); });
    const ulChev = h('button', { class: 'pchev', 'aria-label': 'Стиль подчёркивания', type: 'button', onclick: e => underlinePop(e.currentTarget, true) }, icon('chevron-up', 16));
    const strikeBtn = pBtn('strike', 'Зачеркнуть', () => { doc.applyTextMark('strike', { color: '#5d6a80' }); });
    const noteBtn = pBtn('note', 'Заметка', () => { const snap = doc.snapshot(); const ta = h('textarea', { class: 'input', rows: 3, placeholder: 'Текст заметки', 'aria-label': 'Текст заметки' }); const save = h('button', { class: 'btn btn-primary', onclick: () => { const t = ta.value.trim(); if (!t) return; doc.applyTextMark('note', { note: t }, snap); closePop(); } }, 'Сохранить'); openPop(noteBtn, h('div', { class: 'pop-body' }, h('div', { class: 'pop-title' }, 'Заметка'), ta, h('div', { class: 'pop-actions' }, save)), { side: 'up' }); setTimeout(() => ta.focus(), 50); });
    const copyBtn = pBtn('copy', 'Копировать', async () => { const t = doc.selectionText(); try { await navigator.clipboard.writeText(t); toast('Скопировано'); } catch { document.execCommand?.('copy'); toast('Скопировано'); } });
    const clearBtn = pBtn('trash', 'Убрать', () => { const n = doc.removeMarksInSelection(); if (!n) toast('В выделенном нет пометок'); });
    pill.append(h('div', { class: 'pgrp' }, markBtn, markChev), h('div', { class: 'pgrp' }, ulBtn, ulChev), strikeBtn, noteBtn, copyBtn, clearBtn);

    // never steal the text selection: capture pointerdown inside rails / pill / popovers
    const onDocDownKeepSel = e => {
      if (!e.target.closest?.('.rail, .dock, .pill, .popover, .rd-top')) return;
      if (e.target.closest('textarea, input')) return;
      e.preventDefault();
    };
    document.addEventListener('pointerdown', onDocDownKeepSel, true);

    const dn = () => { pointerDown = true; }, up = () => { pointerDown = false; };
    stage.addEventListener('pointerdown', dn); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
    let autoT = null;
    const updateSel = debounce(() => {
      const has = !!(doc && doc.hasSelection());
      const drawing = tools.drawing();
      pill.classList.toggle('show', has && !drawing);
      reader.classList.toggle('sel-active', has && !drawing);
      markBtn.style.setProperty('--c', `var(--mark-${tools.color})`);
      clearTimeout(autoT);
      if (has && !drawing) {
        const auto = tools.tool === 'underline' ? 'ul' : (tools.tool === 'marker' && tools.markerMode && !tools.brush ? 'hl' : null);
        if (auto) autoT = setTimeout(() => { if (!pointerDown && doc.hasSelection()) doc.applyTextMark(auto, auto === 'hl' ? hlProps() : ulProps()); else if (pointerDown) updateSel(); }, 420);
      }
    }, 80);
    document.addEventListener('selectionchange', updateSel);

    // keyboard shortcuts
    const onKey = e => {
      if (e.target.closest?.('input, textarea, [contenteditable="true"]')) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? store.redo() : store.undo(); }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); store.redo(); }
      else if (mod && (e.key === '+' || e.key === '=')) { e.preventDefault(); doc.zoomBy(1.18); }
      else if (mod && e.key === '-') { e.preventDefault(); doc.zoomBy(0.85); }
      else if (!mod && !e.altKey && ['m', 'u', 'p', 'e', 'z'].includes(e.key.toLowerCase())) { const k = e.key.toLowerCase(); if (k === 'z') store.undo(); else { const t = { m: 'marker', u: 'underline', p: 'pen', e: 'eraser' }[k]; tools.set({ tool: tools.tool === t ? 'none' : t }); } }
      else if (e.key === 'Escape') { closePop(); if (reader.classList.contains('focus')) setFocus(false); else if (tools.tool !== 'none') tools.set({ tool: 'none' }); }
    };
    document.addEventListener('keydown', onKey);

    // two-finger tap = undo
    const touches = new Map();
    stage.addEventListener('pointerdown', e => { if (e.pointerType !== 'touch') return; touches.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), moved: false }); });
    stage.addEventListener('pointermove', e => { const t = touches.get(e.pointerId); if (t && Math.hypot(e.clientX - t.x, e.clientY - t.y) > 12) t.moved = true; });
    stage.addEventListener('pointerup', e => {
      const t = touches.get(e.pointerId); if (!t) return;
      const other = [...touches.entries()].find(([k]) => k !== e.pointerId);
      if (other && !t.moved && !other[1].moved && performance.now() - t.t < 260 && Math.abs(t.t - other[1].t) < 120) { touches.clear(); store.undo(); toast('Отменено'); return; }
      touches.delete(e.pointerId);
    });
    stage.addEventListener('pointercancel', e => touches.delete(e.pointerId));

    // ---------------- layout: landscape rails / portrait bar + dock ----------------
    let mode = null, destroyed = false;
    const dockWrap = null; void dockWrap;
    function layout() {
      const land = innerWidth > innerHeight;
      reader.classList.toggle('land', land); reader.classList.toggle('port', !land);
      reader.classList.toggle('compact', innerHeight < 520);
      closePop();
      const blocks = mode === 'blocks';
      if (land) {
        railL.replaceChildren(backBtn, modes, zoomGroup, listBtn, readBtn, h('span', { class: 'spacer' }), saved, timeEl, examBtn, focusBtn);
        railR.replaceChildren(...toolEls);
        top.replaceChildren(); dockEl.replaceChildren();
      } else {
        top.replaceChildren(backBtn, title, modes, listBtn, readBtn, saved, timeEl, moreBtn);
        dockEl.replaceChildren(...toolEls.filter(e => e !== moreBtn && e !== moreSep));
        railL.replaceChildren(); railR.replaceChildren();
      }
      listBtn.hidden = !blocks;
      refreshDock();
      doc?.relayoutInsets?.();
    }
    // The reader is position:fixed with all four insets 0, so it IS the layout viewport. visualViewport.height shrinks when Safari's page zoom
    // is above 1 (and Safari keeps that zoom across reloads): sizing from it left a strip under the controls and a cut-off right page.
    // So nothing is sized from it; a zoomed page is brought back to 1 instead.
    const fitViewport = () => { resetPageZoom(); };
    const onResize = debounce(() => { fitViewport(); layout(); }, 120);
    addEventListener('resize', onResize); addEventListener('orientationchange', onResize); window.visualViewport?.addEventListener('resize', onResize);
    fitViewport();

    // idle dimming of the rails + focus mode
    let dimT = null;
    const wake = () => { if (mode === 'orig') showHandle(); reader.classList.remove('dim'); clearTimeout(dimT); dimT = setTimeout(() => { if (!pop) reader.classList.add('dim'); }, 3000); };
    const setFocus = on => { reader.classList.toggle('focus', !!on); focusBtn.setAttribute('aria-pressed', String(!!on)); closePop(); wake(); };
    focusBtn.addEventListener('click', () => setFocus(!reader.classList.contains('focus')));
    edgeL.addEventListener('click', () => setFocus(false)); edgeR.addEventListener('click', () => setFocus(false));
    for (const ev of ['pointerdown', 'pointermove', 'keydown']) reader.addEventListener(ev, wake, { passive: true });
    reader.addEventListener('scroll', wake, { capture: true, passive: true });
    wake();
    let labelT = null;
    const showLabel = () => { label.classList.add('show'); clearTimeout(labelT); labelT = setTimeout(() => label.classList.remove('show'), 2000); };
    railL.addEventListener('click', e => { if (e.target === railL) showLabel(); });
    showLabel();
    // long-press tooltip for icon-only buttons
    let tipT = null, tipEl = null;
    const hideTip = () => { clearTimeout(tipT); tipEl?.remove(); tipEl = null; };
    reader.addEventListener('pointerdown', e => { const b = e.target.closest?.('[data-tip], [title].ibtn, .seg-btn'); if (!b) return; tipT = setTimeout(() => { const r = b.getBoundingClientRect(); tipEl = h('div', { class: 'rd-tip' }, b.dataset.tip || b.getAttribute('aria-label') || b.title); popLayer.append(tipEl); const w = tipEl.offsetWidth; tipEl.style.top = r.top + r.height / 2 - 14 + 'px'; tipEl.style.left = (r.left > innerWidth / 2 ? r.left - w - 10 : r.right + 10) + 'px'; }, 450); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) reader.addEventListener(ev, hideTip);

    // top bar hides on scroll down (portrait), returns on scroll up or a tap on the top edge
    const lastTop = new WeakMap();
    stage.addEventListener('scroll', e => {
      const t = e.target; if (!t.classList?.contains('rd-scroll')) return;
      const prev = lastTop.get(t) ?? 0, d = t.scrollTop - prev;
      if (Math.abs(d) > 14) { reader.classList.toggle('bar-off', d > 0 && t.scrollTop > 80 && !tools.drawing() && !chipOverride && reader.classList.contains('port')); lastTop.set(t, t.scrollTop); }
    }, true);
    stage.addEventListener('pointerup', e => { if (reader.classList.contains('bar-off') && e.clientY < 28 && Math.abs(e.clientX - (e.target.__x ?? e.clientX)) < 40) reader.classList.remove('bar-off'); });
    const topZone = h('div', { class: 'rd-topzone' }); topZone.addEventListener('click', () => reader.classList.remove('bar-off')); reader.append(topZone);

    // a small still card after a completed block (nothing flies): «+1 рыбка», on every second block also «+1 креветка»
    let rewardEl = null, rewardT = null;
    function showRewardCard({ fish = 0, shrimp = 0 }) {
      rewardEl?.remove(); clearTimeout(rewardT);
      const lines = []; if (fish) lines.push('+' + fish + ' рыбка'); if (shrimp) lines.push('+' + shrimp + ' креветка');
      rewardEl = h('div', { class: 'reward-card glass', role: 'status' }, ...lines.map(t => h('div', null, (t.includes('рыб') ? '🐟 ' : '🦐 ') + t)));
      reader.append(rewardEl); rewardT = setTimeout(() => { rewardEl?.remove(); rewardEl = null; }, 2000);
    }
    // ---------------- chip (block timer only) ----------------
    let chipOverride = null;
    const R = 8, C = 2 * Math.PI * R;
    chipRing.innerHTML = `<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="${R}" class="ring-bg"/><circle cx="10" cy="10" r="${R}" class="ring-fg" stroke-dasharray="${C}" stroke-dashoffset="${C}" transform="rotate(-90 10 10)"/></svg>`;
    const ringFg = chipRing.querySelector('.ring-fg');
    let chipIconState = '';
    function paintChip() {
      if (chipOverride) {   // a block countdown is running
        chipText.textContent = chipOverride.text; ringFg.setAttribute('stroke-dashoffset', String(C * (1 - clamp(chipOverride.frac ?? 0, 0, 1)))); timeEl.classList.add('run'); timeEl.classList.remove('idle', 'gen', 'paused'); timerHint.hidden = true; return;
      }
      // the general study timer: minutes of the open receipt; tap = pause / continue
      const gs = ST.state(), inBlocks = mode === 'blocks', paused = gs.paused || inBlocks;
      timeEl.classList.remove('run', 'idle'); timeEl.classList.add('gen'); timeEl.classList.toggle('paused', paused);
      chipText.textContent = Math.floor(ST.elapsedMs() / 60000) + ' мин';
      const ic = paused ? 'pause' : 'clock'; if (ic !== chipIconState) { chipIconState = ic; chipIcon.replaceChildren(icon(ic, 20)); }
      const label = inBlocks ? 'Таймер блока (общее время на паузе)' : paused ? 'Общий таймер на паузе: нажмите, чтобы продолжить' : 'Общий таймер идёт: нажмите, чтобы поставить на паузу';
      if (timeEl.getAttribute('aria-label') !== label) { timeEl.setAttribute('aria-label', label); timeEl.title = label; }
      timerHint.hidden = !(gs.paused && gs.pausedBy === 'auto' && !inBlocks && gs.subj);
    }
    timerHint.addEventListener('click', () => { if (ST.state().paused) { ST.togglePause(); paintChip(); } });
    const offST = ST.subscribe(k => { if (k === 'tick' || k === 'change' || k === 'visible' || k === 'hidden') paintChip(); });
    // exam flag of this file (also in the file card menu)
    const syncExam = () => { examBtn.classList.toggle('on', !!meta.exam); examBtn.setAttribute('aria-pressed', String(!!meta.exam)); examBadge.hidden = !meta.exam; };
    async function toggleExam(v = !meta.exam) { meta.exam = !!v; await patchMeta({ exam: meta.exam }); ST.setExam(meta.exam); syncExam(); toast(meta.exam ? 'Файл отмечен «Экзамен»' : 'Отметка «Экзамен» снята'); }
    examBtn.addEventListener('click', () => toggleExam()); syncExam();
    timeEl.addEventListener('click', () => {
      if (pop && pop.anchor === timeEl) { closePop(); return; }
      if (mode === 'blocks' && doc.blocks) { doc.blocks.openTimerPop(timeEl); return; }
      ST.togglePause(); paintChip();
    });
    listBtn.addEventListener('click', () => doc.blocks?.openList());

    // ---------------- «Прочитала» in the rail: the block under the reading position ----------------
    async function refreshRead() {
      const can = !!doc.currentBlock && mode !== 'orig' && (doc.kind === 'html' || mode === 'blocks');
      readBtn.hidden = !can;
      if (!can) return;
      const b = await doc.currentBlock();
      readBtn.classList.toggle('on', !!b?.done); readBtn.setAttribute('aria-pressed', String(!!b?.done));
      readBtn.title = b ? `Прочитала: ${b.title}` : 'Прочитала';
    }
    readBtn.addEventListener('click', async () => {
      const b = await doc.currentBlock?.(); if (!b) return;
      const done = await doc.toggleBlockRead(b);
      toast(done ? `Блок «${b.title}» отмечен` : 'Отметка снята'); refreshRead();
    });
    stage.addEventListener('scroll', debounce(() => refreshRead(), 400), { capture: true, passive: true });
    const frameScroll = (() => { let prev = 0; const rr = debounce(() => refreshRead(), 400); return top => { const d = top - prev; if (Math.abs(d) > 14) { reader.classList.toggle('bar-off', d > 0 && top > 80 && !tools.drawing() && !chipOverride && reader.classList.contains('port')); prev = top; } rr(); wake(); }; })();
    tools.onChange(() => doc.pushTool?.());

    // ---------------- modes ----------------
    switchMode = async (m, force = false) => {
      if (m === mode && !force) return;
      const prev = mode; mode = m;
      modeBtns.forEach(b => { const on = b.dataset.mode === m; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
      modes.style.setProperty('--i', modeBtns.filter(b => !b.hidden).findIndex(b => b.dataset.mode === m));
      reader.dataset.mode = m;
      closePop(); ping();
      try {
        await patchMeta({ lastMode: m });
        const pos = await db.kvGet(`pos:${id}:${m}`, null);
        stage.classList.add('swap');
        await doc.setMode(m, pos);
        stage.classList.remove('swap');
        layout(); refreshRead();
        if (mode === m) ST.openFile(meta, m);   // a newer mode switch may have overtaken this one
        paintChip();
        origHandle.hidden = m !== 'orig'; if (m === 'orig') { showHandle(); if (!(await db.kvGet('hint:orig', false))) { db.kvSet('hint:orig', true); toast('В этом виде работает собственная панель маркера файла', { ms: 6000 }); } }
        if (!doc.caps().draw && tools.drawing()) tools.set({ tool: 'none' });
        if (m !== 'blocks') chipOverride = null;
      } catch (e) {
        if (destroyed) return;
        mode = prev;
        stage.classList.remove('swap');
        await alertDialog('Не удалось открыть в этом режиме: ' + (e.message || e), { title: 'Ошибка' });
      }
    };

    // study time + recent
    patchMeta({ opened: Date.now() });
    paintChip();

    layout();
    const first = doc.views ? (doc.views.includes(meta.lastMode) ? meta.lastMode : doc.defaultView) : (meta.lastMode === 'parts' ? 'normal' : (meta.lastMode === 'blocks' || meta.lastMode === 'book' ? meta.lastMode : 'normal'));
    await switchMode(first, true);

    const flushAll = () => { store.flush(); doc.blocks?.flushNow?.(); doc.flushNow?.(); };
    const onVis = () => { if (document.visibilityState === 'hidden') flushAll(); };
    document.addEventListener('visibilitychange', onVis); addEventListener('pagehide', flushAll);
    window.__reader = { store, tools, doc: () => doc, switchMode, el: reader, openPop, closePop, setFocus, layout };   // handle for tests/debugging

    return async () => {
      destroyed = true;
      document.removeEventListener('selectionchange', updateSel); document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVis); removeEventListener('pagehide', flushAll); removeEventListener('resize', onResize); removeEventListener('orientationchange', onResize); window.visualViewport?.removeEventListener('resize', onResize);
      document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up);
      document.removeEventListener('pointerdown', onDocDownClose, true); document.removeEventListener('pointerdown', onDocDownKeepSel, true);
      offStore(); offST(); ST.leaveFile(); closePop(); saveProgress.flush(); clearTimeout(dimT); clearTimeout(labelT); hideTip();
      clearTimeout(autoT);
      try { doc.unmount(); } catch { /* ignore */ }
      await store.flush();
      doc.destroy();
      delete window.__reader;
      applyTheme();
    };
  })();
  return async () => { try { const c = await initP.catch(() => null); if (c) await c(); } finally { document.documentElement.classList.remove('reader-open'); } };
}
