// Structure -> blocks, semantic extraction, text cleaning, table/image care.
import { cleanText, typo, countWordsIn, wordsOf, textJoined } from './text.js';
import { hashStr } from '../reader/split.js';
import { tick } from '../util.js';

const BLOCK_SEL = 'section.blk, [data-sec].blk, section[data-lab], section[data-sec]';
const KINDS = [
  ['ask', /^\s*(спросят|вопрос|билет|ticket|q\.|\?)/i, /[💬❓❔]/u],
  ['key', /^\s*(важно|запомни|ключевое|главное|ключ)/i, /[🔑⭐★]/u],
  ['warn', /^\s*(ошибка|осторожно|внимание|не путать|ловушка)/i, /[⚠❗🚫]/u],
  ['tip', /^\s*(совет|подсказка|лайфхак)/i, /[💡]/u],
  ['mnemo', /^\s*(мнемо|мнемоника|запоминалка)/i, /[🧠]/u],
  ['example', /^\s*(пример|клиника|случай|задача)/i, /[🩺📌]/u],
  ['summary', /^\s*(итог|вывод|резюме|кратко|коротко)/i, /[✅]/u],
];
const CLS_KIND = /\b(ask|tip|warn|warning|note|important|mnemo|key|summary|example|callout|alert)\b/i;
const TERM = { t: 'act', tm: 'inh', lat: 'latin', key: 'key', hl: 'ask', enz: 'key', lbl: 'key' };

export function findContentRoot(doc) {
  return doc.querySelector('[data-sdf]') || doc.querySelector('main') || doc.querySelector('.wrap') || doc.querySelector('article') || doc.body;
}
const capFirst = t => t.charAt(0).toUpperCase() + t.slice(1);
const text = el => (el.textContent || '').replace(/\s+/g, ' ').trim();
const words = el => wordsOf(el);
export const firstWords = (s, n = 7) => s.split(/\s+/).slice(0, n).join(' ') + (s.split(/\s+/).length > n ? '…' : '');

// ---- semantic pass over a block element ----
export function annotateSemantics(el, ask, blockIdx) {
  for (const s of el.querySelectorAll('span,b,strong,em,i,mark')) for (const c of s.classList) if (TERM[c]) { s.setAttribute('data-t', TERM[c]); break; }
  // tickets / Q&A
  for (const tk of el.querySelectorAll('.tk, .ticket, .qa-block, .qa-pair')) {
    const q = tk.querySelector('.q, .question'), a = tk.querySelector('.qa, .a, .ans, .answer');
    if (q) { ask.push({ block: blockIdx, q: capFirst(text(q).replace(/^(вопрос\s*\d*[:.)]?\s*)/i, '')), a: a ? text(a).replace(/^(ответ[:.]?\s*)/i, '') : '' }); tk.setAttribute('data-kind', 'ask'); tk.classList.add('lz-callout'); }
  }
  for (const c of el.querySelectorAll('p,div,blockquote,aside,li,.card')) {
    if (c.querySelector('p,div,table,ul,ol,figure') && c.tagName !== 'ASIDE' && !c.classList.contains('card')) continue;
    if (c.closest('[data-kind]') && c.closest('[data-kind]') !== c) continue;
    const t = text(c); if (!t || words(c) > 90) continue;
    let kind = c.getAttribute('data-kind') || null;
    if (!kind) { const cm = CLS_KIND.exec(c.className || ''); if (cm) kind = ({ warning: 'warn', alert: 'warn', note: 'tip', important: 'key', callout: 'tip' })[cm[1].toLowerCase()] || cm[1].toLowerCase(); }
    if (!kind) for (const [k, re, em] of KINDS) { if (re.test(t) || em.test(t.slice(0, 3))) { kind = k; break; } }
    if (kind && !c.matches('li') && (c.tagName !== 'P' || KINDS.some(k => k[0] === kind))) {
      c.setAttribute('data-kind', kind); c.classList.add('lz-callout', 'lz-' + kind);
      if (kind === 'ask' && !c.matches('.tk,.ticket')) ask.push({ block: blockIdx, q: t.replace(/^(спросят|вопрос)[:.\s]*/i, ''), a: '' });
    }
  }
}

// ---- cleaning ----
export function cleanTree(root, { typography = true } = {}) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) {
    if (n.parentElement?.closest('pre,code,kbd,samp,.lat,[data-t=latin],i,em')) { n.data = cleanText(n.data); continue; }
    n.data = cleanText(n.data);
    if (typography) n.data = typo(n.data);
  }
  for (const br of [...root.querySelectorAll('br + br + br')]) br.remove();
  for (const p of [...root.querySelectorAll('p')]) if (!p.textContent.replace(/ /g, '').trim() && !p.querySelector('img,svg')) p.remove();
  // duplicate consecutive headings
  const hs = [...root.querySelectorAll('h1,h2,h3,h4')];
  for (let i = 1; i < hs.length; i++) if (hs[i].previousElementSibling === hs[i - 1] && text(hs[i]) === text(hs[i - 1])) hs[i].remove();
}
export function careImagesAndTables(root, report) {
  for (const img of root.querySelectorAll('img')) {
    img.setAttribute('loading', 'lazy'); img.setAttribute('decoding', 'async');
    if (!img.getAttribute('alt')) { const cap = img.closest('figure')?.querySelector('figcaption'); img.setAttribute('alt', cap ? text(cap) : 'Иллюстрация'); }
    img.removeAttribute('width'); img.removeAttribute('height'); img.removeAttribute('style');
  }
  for (const t of root.querySelectorAll('table')) {
    t.removeAttribute('width'); t.removeAttribute('style'); t.removeAttribute('height');
    if (!t.parentElement?.classList.contains('lz-table')) { const w = document.createElement('div'); w.className = 'lz-table'; t.replaceWith(w); w.append(t); }
    report.tables = (report.tables || 0) + 1;
  }
  for (const d of root.querySelectorAll('details')) d.removeAttribute('open');   // Normal/Blocks keep them native; Book expands them at render time
}

// ---- blocks ----
function titleFor(el, idx) {
  const lab = el.getAttribute?.('data-lab'); if (lab && lab.trim()) return lab.trim();
  const h = el.querySelector?.('h1,h2,h3,h4,h5'); if (h && text(h)) return text(h).slice(0, 120);
  const t = text(el); return t ? firstWords(t, 7) : `Раздел ${idx + 1}`;
}
const emojiOf = el => { const n = (el.getAttribute?.('data-num') || '').trim(); return n && !/^[\d.\s]+$/.test(n) && n.length <= 8 ? n : ''; };
const hasMedia = el => !!el.querySelector('img,svg,table,figure');

// unwrap pure layout wrappers (div/section/article/header around block children) so headings and paragraphs sit side by side
const WRAP = /^(DIV|SECTION|ARTICLE|MAIN|HEADER|FOOTER|CENTER|FORM|SPAN|FIGURE_)$/;
const BLOCKY = /^(P|H[1-6]|UL|OL|TABLE|FIGURE|DETAILS|PRE|BLOCKQUOTE|DIV|SECTION|ARTICLE|HR|ASIDE|DL)$/;
export function flatten(root) {
  for (let pass = 0; pass < 6; pass++) {
    let changed = false;
    for (const el of [...root.children]) {
      if (!WRAP.test(el.tagName) || el.matches(BLOCK_SEL) || el.getAttribute('data-kind') || el.classList.contains('lz-table') || el.classList.contains('card')) continue;
      const hasBlock = [...el.children].some(c => BLOCKY.test(c.tagName));
      const directText = [...el.childNodes].some(n => n.nodeType === 3 && n.data.trim());
      if (hasBlock && !directText) { el.replaceWith(...el.childNodes); changed = true; }
    }
    if (!changed) break;
  }
}
export function detectBlocks(root, { wpm = 130, onProgress } = {}) {
  if (!root.querySelector(BLOCK_SEL)) flatten(root);
  const srcBlocks = [...root.querySelectorAll(BLOCK_SEL)].filter(el => !el.parentElement?.closest(BLOCK_SEL));
  let mode = 'source', blocks = [], head = [];
  if (srcBlocks.length) {
    const first = srcBlocks[0];
    // everything before the first block (title, intro) is the document header, never block #1
    for (const n of [...root.childNodes]) { if (n === first || n.contains?.(first)) break; head.push(n); }
    blocks = srcBlocks.map(el => ({ el, source: true }));
  } else {
    const kids = [...root.childNodes].filter(n => n.nodeType === 1 || (n.nodeType === 3 && n.data.trim()));
    const cnt = t => root.querySelectorAll(t).length;
    const level = cnt('h1') >= 2 ? 'H1' : cnt('h2') >= 2 ? 'H2' : cnt('h3') >= 2 ? 'H3' : cnt('h2') === 1 && cnt('h1') === 1 ? 'H2' : null;
    const sections = []; let cur = null; const lead = [];
    for (const n of kids) {
      if (level && n.nodeType === 1 && (n.tagName === level || (level === 'H2' && n.tagName === 'H1'))) { cur = { nodes: [n] }; sections.push(cur); }
      else if (cur) cur.nodes.push(n); else lead.push(n);
    }
    if (sections.length >= 2) {
      mode = 'heading';
      const leadWords = lead.reduce((a, n) => a + countWordsIn(textJoined(n.nodeType === 1 ? n : n.parentNode ? Object.assign(document.createElement('i'), { textContent: n.data }) : n)), 0);
      if (lead.some(n => n.nodeType === 1 && /^H1$/.test(n.tagName)) || leadWords >= 40) {
        const h1 = lead.find(n => n.nodeType === 1 && n.tagName === 'H1');
        head = h1 ? [h1] : []; const rest = lead.filter(n => n !== h1);
        if (rest.length && leadWords >= 40) sections.unshift({ nodes: rest, lead: true }); else if (rest.length) sections[0].nodes.unshift(...rest);
      } else if (lead.length) sections[0].nodes.unshift(...lead);
      blocks = sections.map(s => { const el = document.createElement('section'); s.nodes.forEach(n => el.append(n)); return { el, source: false, lead: s.lead }; });
    } else {
      mode = 'time';
      const all = kids; const target = wpm * 5; const secs = []; let acc = [], w = 0;
      const flush = () => { if (acc.length) { secs.push(acc); acc = []; w = 0; } };
      for (const n of all) { const nw = countWordsIn(textJoined(n.nodeType === 1 ? n : n.parentNode ? Object.assign(document.createElement('i'), { textContent: n.data }) : n)); acc.push(n); w += nw; if (w >= target && n.nodeType === 1 && !/^(TABLE|FIGURE|UL|OL|DETAILS)$/.test(n.tagName)) flush(); }
      flush();
      blocks = secs.map(nodes => { const el = document.createElement('section'); nodes.forEach(n => el.append(n)); return { el, source: false }; });
    }
  }
  // merge tiny blocks without media into the previous one; split huge ones at paragraph boundaries (never source blocks)
  if (mode !== 'source') {
    const merged = [];
    for (const b of blocks) {
      const small = words(b.el) < 40 && !hasMedia(b.el);
      if (small && merged.length) { const last = merged[merged.length - 1]; while (b.el.firstChild) last.el.append(b.el.firstChild); }
      else merged.push(b);
    }
    const out = [];
    for (const b of merged) {
      if (words(b.el) <= 900) { out.push(b); continue; }
      let el = document.createElement('section'), w = 0; const parts = [];
      for (const n of [...b.el.childNodes]) { const nw = countWordsIn(textJoined(n.nodeType === 1 ? n : n.parentNode ? Object.assign(document.createElement('i'), { textContent: n.data }) : n)); if (w + nw > 650 && w > 0 && !/^H[1-6]$/.test(n.tagName || '')) { parts.push(el); el = document.createElement('section'); w = 0; } el.append(n); w += nw; }
      parts.push(el);
      parts.forEach((p, i) => out.push({ el: p, source: false, firstTitle: i === 0 ? null : titleFor(b.el, 0) + ' (продолжение)' }));
    }
    blocks = out;
  }
  const seen = new Map();
  return { mode, head, blocks: blocks.map((b, i) => {
    let title = b.firstTitle || (b.lead ? 'Введение' : titleFor(b.el, i));
    const k = title.toLowerCase(); const n = (seen.get(k) || 0) + 1; seen.set(k, n); if (n > 1) title += ` (${n})`;
    onProgress?.(i + 1, blocks.length);
    return { el: b.el, source: b.source, title, emoji: emojiOf(b.el), idx: i };
  }) };
}

// finalise block elements: class/id/data, semantics, cleaning; returns sdm blocks
export async function finalizeBlocks(found, { wpm, ask, report, onProgress, typography = true }) {
  const out = []; let n = 0;
  for (const b of found.blocks) {
    const id = hashStr(b.title + '|' + b.idx);
    const el = b.el;
    for (const a of [...el.getAttributeNames()]) if (!/^(data-lab|data-num|data-sec|data-img)$/.test(a)) el.removeAttribute(a);
    el.className = 'lz-sec blk'; el.id = 'lz-' + id; el.setAttribute('data-lz-id', id); el.setAttribute('data-lab', b.title); if (b.emoji) el.setAttribute('data-num', b.emoji);
    annotateSemantics(el, ask, b.idx);
    careImagesAndTables(el, report);
    cleanTree(el, { typography });
    const w = words(el), imgs = [...el.querySelectorAll('img[data-img-id]')].map(i => i.getAttribute('data-img-id'));
    out.push({ id, title: b.title, emoji: b.emoji, kind: found.mode, html: el.outerHTML, words: w, minutes: Math.max(1, Math.round(w / wpm)), images: imgs, source: b.source });
    if (++n % 6 === 0) { onProgress?.(n, found.blocks.length); await tick(); }
  }
  return out;
}
