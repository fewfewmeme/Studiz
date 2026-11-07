// Splitting a document into study blocks of about N minutes.
// Order: by headings first (h1-h3 / PDF outline), then big sections are split at block boundaries and small neighbours merged.
import { countWords } from '../util.js';
import { DEFAULTS } from '../../config.js';
import { splitParts, blockSeconds } from '../parts.js';

const INLINE = new Set(['A', 'ABBR', 'B', 'BDI', 'BDO', 'BR', 'CITE', 'CODE', 'DATA', 'DFN', 'EM', 'FONT', 'I', 'KBD', 'LABEL', 'MARK', 'Q', 'S', 'SAMP', 'SMALL', 'SPAN', 'STRIKE', 'STRONG', 'SUB', 'SUP', 'TIME', 'TT', 'U', 'VAR', 'WBR', 'DEL', 'INS', 'BUTTON']);
const CONTAINERS = new Set(['DIV', 'SECTION', 'ARTICLE', 'MAIN', 'HEADER', 'FOOTER', 'ASIDE', 'NAV', 'CENTER', 'BODY']);
const SKIP = new Set(['STYLE', 'SCRIPT', 'TEMPLATE']);

export function headingLevel(el) {
  if (/^H[1-6]$/.test(el.tagName)) return Number(el.tagName[1]);
  if (el.tagName === 'P' || el.tagName === 'DIV') {
    const kids = [...el.childNodes].filter(n => n.nodeType === 1 || (n.nodeType === 3 && n.data.trim()));
    if (kids.length === 1 && kids[0].nodeType === 1 && /^(B|STRONG)$/.test(kids[0].tagName)) { const w = countWords(el.textContent); if (w > 0 && w <= 12) return 4; }
  }
  return 0;
}

// Leaf blocks of a document root. Loose inline runs are wrapped in <div class="loose-run"> (text itself is unchanged).
export function collectLeaves(root) {
  const out = [];
  const isInline = n => n.nodeType === 3 || (n.nodeType === 1 && INLINE.has(n.tagName));
  const walk = el => {
    let run = [];
    const flush = () => {
      if (run.some(n => (n.nodeType === 3 ? n.data.trim() : (n.textContent.trim() || n.querySelector?.('img'))))) {
        const w = document.createElement('div'); w.className = 'loose-run';
        run[0].parentNode.insertBefore(w, run[0]); run.forEach(n => w.appendChild(n)); out.push(w);
      }
      run = [];
    };
    for (const ch of [...el.childNodes]) {
      if (ch.nodeType === 8) continue;
      if (ch.nodeType === 1 && (SKIP.has(ch.tagName) || ch.hasAttribute('data-skip'))) continue;
      if (isInline(ch)) { run.push(ch); continue; }
      flush();
      if (CONTAINERS.has(ch.tagName) && [...ch.children].some(c => !INLINE.has(c.tagName) && !SKIP.has(c.tagName))) walk(ch);
      else out.push(ch);
    }
    flush();
  };
  walk(root);
  return out.map(el => {
    const words = countWords(el.textContent || '');
    const images = el.tagName === 'IMG' ? 1 : el.querySelectorAll('img').length;
    return { el, words, images, level: headingLevel(el), text: (el.textContent || '').trim() };
  });
}

export function hashStr(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }

// items: [{words, images, level, text, ...}] -> blocks [{start,end,sec,words,title,id}]
export function makeBlocks(items, { minutes, wpm }) {
  const target = minutes * 60;
  const sec = items.map(i => blockSeconds(i.words, i.images, wpm, DEFAULTS.imageSeconds));
  // 1. sections at h1-h3
  const sections = [];
  let s0 = 0;
  items.forEach((it, i) => { if (i > s0 && it.level >= 1 && it.level <= 3) { sections.push([s0, i]); s0 = i; } });
  if (items.length) sections.push([s0, items.length]);
  // 2. split big sections
  let blocks = [];
  for (const [a, b] of sections) {
    const total = sec.slice(a, b).reduce((x, y) => x + y, 0);
    if (total <= 1.4 * target) { blocks.push({ start: a, end: b }); continue; }
    const parts = splitParts(items.slice(a, b).map((it, k) => ({ sec: sec[a + k], heading: it.level > 0 })), { targetSec: target, preferHeadingAt: .6, maxRatio: 1.4 });
    parts.forEach(p => blocks.push({ start: a + p.start, end: a + p.end }));
  }
  const secOf = bl => sec.slice(bl.start, bl.end).reduce((x, y) => x + y, 0);
  // 3. merge small neighbours
  const merged = [];
  for (const bl of blocks) {
    const last = merged[merged.length - 1];
    if (last && secOf(last) < 0.5 * target && secOf(bl) < 0.5 * target && secOf(last) + secOf(bl) <= 1.4 * target) last.end = bl.end;
    else merged.push({ ...bl });
  }
  let lastTitle = '';
  return merged.map((bl, i) => {
    const slice = items.slice(bl.start, bl.end);
    const hd = slice.find(x => x.level > 0 && x.level <= 4);
    if (hd) lastTitle = hd.text.slice(0, 90);
    const first = slice.find(x => x.text);
    const title = hd ? hd.text.slice(0, 90) : (lastTitle ? lastTitle : first ? first.text.split(/\s+/).slice(0, 7).join(' ') + '…' : '—');
    const words = slice.reduce((x, y) => x + y.words, 0);
    const key = (first?.text || '').split(/\s+/).slice(0, 6).join(' ');
    return { start: bl.start, end: bl.end, sec: secOf(bl), words, title, id: hashStr(key + '|' + i), n: i + 1 };
  });
}
