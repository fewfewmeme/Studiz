// Архив для Уголка: the top parts of closed receipts with their codes (paste a code into Уголок Лиз).
import { h } from '../util.js';
import { confirmDialog, toast } from '../ui.js';
import * as RS from '../receipt-store.js';
import { buildTop, stampHalf, jagged, tearPolygon, PAPER_W } from '../receipt-ui.js';

// «Копировать код»: Clipboard API, with a textarea + execCommand fallback for Safari / insecure contexts
export async function copyText(text) {
  try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; } } catch { /* fall through */ }
  const ta = h('textarea', { value: text, readonly: true, style: { position: 'fixed', left: '0', top: '0', opacity: '0', fontSize: '16px' } });
  document.body.append(ta); ta.focus(); ta.select(); ta.setSelectionRange(0, text.length);
  let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove(); return ok;
}

export async function renderArchive(root) {
  root.className = 'view archive-view';
  const grid = h('div', { class: 'rc-grid' });
  root.replaceChildren(h('div', { class: 'content wide' }, h('header', { class: 'poster-panel' }, h('p', { class: 'eyebrow' }, 'Для приложения «Уголок Лиз»'), h('h1', { class: 'display' }, 'Архив для Уголка')), grid));
  async function draw() {
    const list = await RS.getArchive();
    if (!list.length) { grid.replaceChildren(h('div', { class: 'empty-card' }, h('h3', null, 'Пока пусто'), h('p', null, 'Верхняя часть чека с кодом появится здесь, когда вы оторвёте чек.'))); return; }
    grid.replaceChildren(...list.map(rec => {
      const paper = buildTop(rec.payload, rec.life || null);
      const piece = h('div', { class: 'rc-piece top' }, paper);
      paper.append(stampHalf('top', rec.payload.sx ?? 0.5, PAPER_W));
      const copyBtn = h('button', { class: 'btn btn-primary btn-sm', type: 'button' }, 'Копировать код');
      copyBtn.addEventListener('click', async () => {
        const ok = await copyText(rec.code);
        copyBtn.textContent = ok ? 'Скопировано' : 'Не получилось — выделите код ниже'; setTimeout(() => { copyBtn.textContent = 'Копировать код'; }, 1800);
      });
      const moved = h('label', { class: 'switch-row' }, h('span', null, 'Перенесено в Уголок'), h('input', { type: 'checkbox', checked: rec.moved || null, onchange: async e => { await RS.setMoved(rec.id, e.target.checked); item.classList.toggle('rc-moved', e.target.checked); } }));
      const code = h('code', { class: 'rc-code', style: { fontSize: '11px', wordBreak: 'break-all', userSelect: 'all', WebkitUserSelect: 'all', maxWidth: PAPER_W + 'px' } }, rec.code);
      const item = h('div', { class: 'rc-item' + (rec.moved ? ' rc-moved' : '') }, h('div', { class: 'rc-sheet', style: { width: PAPER_W + 'px' } }, piece), h('div', { class: 'actions' }, copyBtn, h('button', { class: 'btn btn-sm btn-danger-soft', type: 'button', onclick: async () => {
        if (!(await confirmDialog('Удалить эту верхнюю часть из архива? Код уже не восстановить.', { ok: 'Удалить', danger: true }))) return; await RS.deleteArchive(rec.id); toast('Удалено'); draw();
      } }, 'Удалить')), moved, code);
      // the torn bottom edge, drawn once at the real height
      requestAnimationFrame(() => { const H = piece.offsetHeight, jag = jagged(Math.round(PAPER_W / 6), seeded(rec.id)); piece.style.clipPath = tearPolygon('bottom', PAPER_W, H, jag, 0, PAPER_W); });
      return item;
    }));
  }
  await draw();
}
function seeded(id) { let s = 0; for (const c of id) s = (s * 31 + c.charCodeAt(0)) >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
