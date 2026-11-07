// Shared helpers for views: subjects, covers, document cards.
import { SUBJECTS } from '../../config.js';
import * as db from '../db.js';
import { h, plural } from '../util.js';
import { settings } from '../settings.js';
import { icon } from '../icons.js';
import { subjectSticker, subjectTexture } from '../assets.js';
import { customDialog } from '../ui.js';
import { fmtBytes } from '../util.js';
import { openPdf } from '../libs.js';

export const subjectName = key => (SUBJECTS.find(s => s.key === key) || { name: key }).name;
export const subjectStyle = key => ({ cls: 'sj-' + key });
export const rotFor = id => (([...String(id)].reduce((a, c) => a + c.charCodeAt(0), 0) % 7) - 3);

export const TYPE_LABEL = { pdf: 'PDF', html: 'HTML', image: 'IMG' };
export const typeBadge = f => (f.note ? 'ТЕКСТ' : f.type === 'html' ? ((f.ext || 'html') === 'htm' ? 'HTML' : (f.ext || 'html').toUpperCase()) : TYPE_LABEL[f.type] || (f.ext || '').toUpperCase());
export function fileInfo(f) {
  if (f.type === 'pdf') return `${f.pages} ${plural(f.pages, 'страница', 'страницы', 'страниц')}`;
  if (f.type === 'image') return 'изображение';
  const bl = f.blockCount ? `${f.blockCount} ${plural(f.blockCount, 'блок', 'блока', 'блоков')} · ` : '';
  return `${bl}~${Math.max(1, Math.round((f.words || 0) / settings().wpm))} мин`;
}
export function relTime(ts) {
  if (!ts) return 'не открывался';
  const d = (Date.now() - ts) / 1000;
  if (d < 90) return 'только что';
  if (d < 3600) return `${Math.round(d / 60)} мин назад`;
  if (d < 86400) return `${Math.round(d / 3600)} ч назад`;
  const days = Math.round(d / 86400);
  if (days === 1) return 'вчера';
  if (days < 30) return `${days} ${plural(days, 'день', 'дня', 'дней')} назад`;
  return new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

// ---- covers (first page / excerpt), generated lazily and stored in the file record ----
const coverUrls = new Map();
async function makePdfCover(id) {
  const rec = await db.get('docs', id);
  const pdf = await openPdf(await rec.original.arrayBuffer());
  const page = await pdf.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: 360 / base.width });
  const c = document.createElement('canvas'); c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
  await page.render({ canvasContext: c.getContext('2d'), canvas: c, viewport: vp }).promise;
  pdf.destroy?.();
  return new Promise(res => c.toBlob(res, 'image/jpeg', 0.72));
}
async function makeImageCover(id) {
  const rec = await db.get('docs', id);
  const bmp = await createImageBitmap(rec.original);
  const k = 360 / bmp.width, c = document.createElement('canvas'); c.width = 360; c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise(res => c.toBlob(res, 'image/jpeg', 0.72));
}
async function makeExcerpt(id) {
  const w = await db.get('work', id);
  const t = (w?.html || '').slice(0, 60000).replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  return t.slice(0, 220);
}
export async function ensureCover(meta) {
  if (coverUrls.has(meta.id)) return coverUrls.get(meta.id);
  let out = { url: null, excerpt: meta.excerpt || '' };
  try {
    if (meta.cover instanceof Blob) out.url = URL.createObjectURL(meta.cover);
    else if (meta.type === 'pdf' || meta.type === 'image') {
      const blob = await (meta.type === 'pdf' ? makePdfCover(meta.id) : makeImageCover(meta.id));
      if (blob) { out.url = URL.createObjectURL(blob); db.modify('files', meta.id, f => (f ? { ...f, cover: blob } : undefined)).catch(() => {}); }
    } else if (!meta.excerpt) {
      out.excerpt = await makeExcerpt(meta.id);
      db.modify('files', meta.id, f => (f ? { ...f, excerpt: out.excerpt } : undefined)).catch(() => {});
    }
  } catch { /* the card simply has no thumbnail */ }
  coverUrls.set(meta.id, out);
  return out;
}

export function ring(p, size = 34) {
  const R = size / 2 - 3, C = 2 * Math.PI * R;
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('width', size); s.setAttribute('height', size); s.setAttribute('viewBox', `0 0 ${size} ${size}`); s.setAttribute('class', 'ring');
  s.innerHTML = `<circle cx="${size / 2}" cy="${size / 2}" r="${R}" class="ring-bg"/><circle cx="${size / 2}" cy="${size / 2}" r="${R}" class="ring-fg" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - Math.max(0, Math.min(1, p || 0)))}" transform="rotate(-90 ${size / 2} ${size / 2})"/>`;
  return s;
}

// A document cover card: subject tint, the subject sticker (static), the title in serif, a thin progress line and a
// file-type badge in a corner (never over text). The first-page thumbnail lives only in the details sheet.
export function docCard(f, { onMore, subjectLine = false, onRebuild = null } = {}) {
  const tex = subjectTexture(f.subject);
  const pct = Math.max(0, Math.min(1, f.progress || 0));
  const cover = h('div', { class: 'cover', style: { '--rot': rotFor(f.id) + 'deg', ...(tex ? { '--tex': `url("${tex}")` } : {}), ...(f.docTheme?.accent ? { '--doc-accent': f.docTheme.accent } : {}) } },
    h('div', { class: 'cover-top' }, h('span', { class: 'cover-type' }, typeBadge(f)), f.exam ? h('span', { class: 'exam-badge' }, 'Экзамен') : null),
    h('div', { class: 'doc-title', title: f.name }, f.name),
    subjectSticker(f.subject),
    h('i', { class: 'cover-prog', 'aria-label': `Прочитано ${Math.round(pct * 100)}%` }, h('b', { style: { width: Math.round(pct * 100) + '%' } })));
  const card = h('a', { class: 'doc-card ' + subjectStyle(f.subject).cls, href: `#/file/${f.id}`, 'data-vt': 'doc-' + f.id },
    cover,
    h('div', { class: 'doc-meta' }, h('span', { class: 'muted' }, subjectLine ? subjectName(f.subject) + ' · ' : '', fileInfo(f)), h('span', { class: 'muted' }, relTime(f.opened))));
  if (onRebuild) card.append(h('button', { class: 'rebuild-chip', type: 'button', title: 'Собрать Word-файл заново: цвета и оформление как в Word', onclick: e => { e.preventDefault(); e.stopPropagation(); onRebuild(); } }, 'Пересобрать'));
  if (onMore) {
    const more = h('button', { class: 'ibtn doc-more', 'aria-label': 'Действия с файлом', type: 'button' }, icon('more'));
    more.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); onMore(more); });
    card.append(more);
  }
  return card;
}

// Details sheet: the only place with a (small) first-page thumbnail.
export async function docDetails(f) {
  const thumb = h('div', { class: 'det-thumb' });
  const rec = await db.get('docs', f.id).catch(() => null);
  const size = rec?.original?.size;
  const body = h('div', { class: 'det-rows' },
    h('div', { class: 'det-row' }, h('span', { class: 'muted' }, 'Предмет'), h('strong', null, subjectName(f.subject))),
    h('div', { class: 'det-row' }, h('span', { class: 'muted' }, 'Тип'), h('strong', null, typeBadge(f))),
    h('div', { class: 'det-row' }, h('span', { class: 'muted' }, 'Объём'), h('strong', null, fileInfo(f))),
    size ? h('div', { class: 'det-row' }, h('span', { class: 'muted' }, 'Размер файла'), h('strong', null, fmtBytes(size))) : null,
    h('div', { class: 'det-row' }, h('span', { class: 'muted' }, 'Прочитано'), h('strong', null, Math.round((f.progress || 0) * 100) + '%')),
    h('div', { class: 'det-row' }, h('span', { class: 'muted' }, 'Открывали'), h('strong', null, relTime(f.opened))));
  const m = customDialog([h('h3', null, f.name), h('div', { class: 'det-top' }, thumb, body), h('div', { class: 'modal-actions' }, h('button', { class: 'btn', onclick: () => m.close() }, 'Закрыть'))], { onBackdrop: () => m.close() });
  ensureCover(f).then(c => { if (c.url) thumb.append(h('img', { src: c.url, alt: '' })); else thumb.append(h('div', { class: 'cover-text' }, c.excerpt || '')); });
  return m;
}
