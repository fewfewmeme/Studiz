// ADAPTATION ENGINE: ingest -> sniff -> adapter -> normalise to the Study Document Model -> validate (Fit Report) -> store.
// Renderers never see source HTML or CSS. Fallback chain on a HARD failure: normal -> safe (no source CSS) -> plain text.
import { getPurify, getMarked, getMammoth } from '../libs.js';
import { decodeBytes, countWordsIn, detectLang, wordsOf, textJoined } from './text.js';
import { adaptCss, adaptInlineStyle } from './css.js';
import { removeChrome } from './chrome.js';
import { extractDataImages, PLACEHOLDER } from './images.js';
import { findContentRoot, detectBlocks, finalizeBlocks, cleanTree, firstWords } from './structure.js';
import { fitReport } from './fit.js';
import { guessSubject } from './guess.js';
import { parseColor, hex, fixContrast } from './color.js';
import { PAPER } from './css.js';
import { tick } from '../util.js';
import { DEFAULTS } from '../../config.js';

export const ADAPTER_VERSION = 'a1';

// ---- sniff: by content, not only by extension ----
export function sniffKind(buf, name = '') {
  const b = new Uint8Array(buf.slice ? buf.slice(0, 4096) : buf);
  const ext = (/\.([^./\\]+)$/.exec(name) || [])[1]?.toLowerCase() || '';
  const ascii = String.fromCharCode(...b.subarray(0, 8));
  const isZip = b[0] === 0x50 && b[1] === 0x4B, isImg = (b[0] === 0xFF && b[1] === 0xD8) || (b[0] === 0x89 && b[1] === 0x50) || ascii.startsWith('GIF8') || (b[0] === 0x52 && b[8] === 0x57) || new TextDecoder('latin1').decode(b.subarray(4, 12)).startsWith('ftyp');
  if (ascii.startsWith('%PDF')) return 'pdf';
  // the extension promises a binary format but the content is something else: a damaged file, say so
  if (ext === 'pdf') return 'corrupt-pdf';
  if (ext === 'docx' && !isZip) return 'corrupt-docx';
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'].includes(ext) && !isImg) return 'corrupt-image';
  if (['exe', 'dll', 'zip', 'rar', '7z', 'dmg', 'apk', 'bin', 'iso', 'mp3', 'mp4', 'mov', 'avi', 'psd', 'key', 'numbers', 'pages'].includes(ext)) return 'unsupported';
  if (b[0] === 0x50 && b[1] === 0x4B) {
    const s = new TextDecoder('latin1').decode(b);
    if (/word\//.test(s) || ext === 'docx') return 'docx';
    if (/ppt\/|xl\/|\.pptx|\.xlsx/.test(s) || ['pptx', 'xlsx', 'ppt', 'xls', 'odt', 'ods', 'odp'].includes(ext)) return 'unsupported';
    return ext === 'docx' ? 'docx' : 'unsupported';
  }
  if (b[0] === 0xFF && b[1] === 0xD8) return 'image'; if (b[0] === 0x89 && b[1] === 0x50) return 'image';
  if (ascii.startsWith('GIF8') || (b[0] === 0x52 && b[8] === 0x57)) return 'image';
  if (new TextDecoder('latin1').decode(b.subarray(4, 12)).startsWith('ftyp')) return 'image';   // heic / heif
  if (['pptx', 'xlsx', 'ppt', 'xls', 'doc', 'odt', 'rtf'].includes(ext)) return 'unsupported';
  let ctrl = 0; for (const v of b.subarray(0, 4096)) if (v < 9 || (v > 13 && v < 32)) ctrl++;
  if (b.length > 8 && ctrl > b.length * 0.05) return 'unsupported';      // binary junk
  const head = decodeBytes(b.subarray(0, 4096)).trimStart().slice(0, 3000);
  if (/data-sdf\s*=/i.test(head)) return 'sdf';
  if (/^<(!doctype|html|head|body|article|section|div|main|h1|p)\b/i.test(head) || /<html[\s>]/i.test(head)) return 'html';
  if (ext === 'html' || ext === 'htm') return 'html';
  if (ext === 'md' || ext === 'markdown' || (/^#{1,3} \S/m.test(head) && !/<\w+[^>]*>/.test(head.slice(0, 200))) || /^\|.+\|\s*\n\|[-: |]+\|/m.test(head)) return 'md';
  return 'txt';
}

// ---- text / markdown -> HTML (then the same pipeline) ----
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function textToHtml(t) {
  const lines = t.replace(/\r\n?/g, '\n').split('\n');
  const out = []; let para = [];
  const flush = () => { if (para.length) { out.push(`<p>${esc(para.join(' ').replace(/\s+/g, ' ').trim())}</p>`); para = []; } };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l) { flush(); continue; }
    const prevBlank = i === 0 || !lines[i - 1].trim(), nextBlank = i === lines.length - 1 || !lines[i + 1].trim();
    const heading = prevBlank && nextBlank && l.length < 80 && (/^(\d+[.)]|[IVX]+\.|Глава|Раздел|Тема)\s/i.test(l) || (l === l.toUpperCase() && /[А-ЯA-Z]{3}/.test(l)) || (i === 0 && !/[.!?]$/.test(l)));
    if (heading) { flush(); out.push(`<h2>${esc(l)}</h2>`); continue; }
    if (/^[-*•]\s+/.test(l)) { flush(); out.push(`<ul><li>${esc(l.replace(/^[-*•]\s+/, ''))}</li></ul>`); continue; }
    para.push(l);
  }
  flush();
  return `<body>${out.join('\n').replace(/<\/ul>\s*<ul>/g, '')}`;
}
export async function toHtmlString(kind, buf, name) {
  if (kind === 'html' || kind === 'sdf') return decodeBytes(buf);
  if (kind === 'txt') return textToHtml(decodeBytes(buf));
  if (kind === 'md') {
    const { marked } = await getMarked();
    return '<body>' + marked.parse(decodeBytes(buf), { gfm: true, breaks: false }).replace(/<input[^>]*checked[^>]*>/gi, '☑ ').replace(/<input[^>]*type="checkbox"[^>]*>/gi, '☐ ');
  }
  if (kind === 'docx') {
    const mammoth = await getMammoth();
    let res; try { res = await mammoth.convertToHtml({ arrayBuffer: buf }); } catch { throw new Error('DOCX-файл повреждён или не является документом Word.'); }
    return '<body>' + res.value;
  }
  throw new Error('Этот тип файла пока не поддерживается.');
}

// ---- plain text view of a sanitised DOM, in document order (images kept) ----
function plainOf(srcBody) {
  const out = document.createElement('body');
  const push = (tag, txt) => { const e = document.createElement(tag); e.textContent = txt; out.append(e); };
  (function walk(n) {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) { const t = c.data.replace(/\s+/g, ' ').trim(); if (t && !c.parentElement.closest('p,li,td,th,pre,blockquote,summary,h1,h2,h3,h4,h5,h6,figcaption')) push('p', t); continue; }
      if (c.nodeType !== 1) continue;
      const tag = c.tagName;
      if (tag === 'IMG') { const f = document.createElement('figure'); f.append(c.cloneNode(true)); out.append(f); continue; }
      if (/^H[1-6]$/.test(tag)) { push(/^H[12]$/.test(tag) ? 'h2' : 'h3', c.textContent.replace(/\s+/g, ' ').trim()); for (const im of c.querySelectorAll('img')) { const f = document.createElement('figure'); f.append(im.cloneNode(true)); out.append(f); } continue; }
      if (/^(P|LI|TD|TH|PRE|BLOCKQUOTE|SUMMARY|FIGCAPTION|DT|DD)$/.test(tag)) { const t = c.textContent.replace(/\s+/g, ' ').trim(); if (t) push('p', t); for (const im of c.querySelectorAll('img')) { const f = document.createElement('figure'); f.append(im.cloneNode(true)); out.append(f); } continue; }
      walk(c);
    }
  })(srcBody);
  return out;
}

async function runPipeline(raw, { mode, docId, fileName, kind, wpm, onProgress, imagesPre }) {
  const scope = `.doc[data-doc="${docId}"]`;
  const step = (label, f) => onProgress?.(label, f);
  const { raw: r2, images } = imagesPre || await extractDataImages(raw, { onProgress: (n, t) => step(`Картинки ${n} / ${t}`, 0.1 + 0.2 * n / Math.max(1, t)) });
  await tick();
  step('Разбираю документ', 0.32);
  const doc = new DOMParser().parseFromString(r2, 'text/html');
  const cssText = [...doc.querySelectorAll('style')].map(s => s.textContent).join('\n');
  const meta = { title: '', subject: null, accent: null, lang: doc.documentElement.lang || '' };
  const sdfEl = doc.querySelector('[data-sdf]');
  meta.title = sdfEl?.getAttribute('data-title') || doc.querySelector('title')?.textContent.trim() || '';
  if (sdfEl) { meta.subject = sdfEl.getAttribute('data-subject'); meta.accent = sdfEl.getAttribute('data-accent'); }
  const chrome = removeChrome(doc, cssText);
  const rootEl = findContentRoot(doc);
  const srcText = textJoined(rootEl);
  const srcWords = countWordsIn(srcText);
  const srcImages = [...rootEl.querySelectorAll('img')].filter(i => i.getAttribute('src')).length;
  if (!meta.title) meta.title = rootEl.querySelector('h1')?.textContent.trim() || fileName;
  step('Очистка', 0.4);
  const DOMPurify = await getPurify();
  const clean = DOMPurify.sanitize(rootEl.innerHTML, { FORCE_BODY: true, FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'textarea', 'select', 'button', 'link', 'meta', 'base', 'title', 'noscript'], FORBID_ATTR: ['srcset', 'ping', 'formaction', 'onclick'], ALLOW_DATA_ATTR: true, ALLOW_UNKNOWN_PROTOCOLS: false });
  await tick();
  let d2 = new DOMParser().parseFromString(`<body>${clean}</body>`, 'text/html');
  const body = d2.body;
  // images: blobs, placeholders for anything that cannot be embedded (counted, never dropped)
  let imgCount = 0;
  for (const img of [...body.querySelectorAll('img')]) {
    const src = img.getAttribute('src') || '';
    const m = /^imgref-(.+)\.img$/.exec(src);
    if (m) { img.setAttribute('data-img-id', m[1]); img.removeAttribute('src'); imgCount++; }
    else if (/^data:image\//i.test(src)) imgCount++;
    else if (src) { img.setAttribute('data-blocked-src', '1'); img.setAttribute('src', PLACEHOLDER); if (!img.getAttribute('alt')) img.setAttribute('alt', 'картинка не встроена'); imgCount++; }
    else img.remove();
  }
  const used = new Set([...body.querySelectorAll('img[data-img-id]')].map(i => i.getAttribute('data-img-id')));
  const keepImages = images.filter(i => used.has(i.id));
  let adapted = { css: '', report: { rulesDropped: 0, colorsFixed: 0, darkBgDropped: 0, lightTextDropped: 0, vars: {} } };
  let content = body;
  if (mode === 'plain') content = plainOf(body);
  else {
    if (mode === 'normal') {
      adapted = adaptCss(cssText, scope);
      const vars = adapted.report.vars || {};
      for (const el of body.querySelectorAll('[style]')) { const s = adaptInlineStyle(el.getAttribute('style'), vars); if (s) el.setAttribute('style', s); else el.removeAttribute('style'); }
      for (const f of body.querySelectorAll('font[color]')) { const c = parseColor(f.getAttribute('color')); if (c) f.style.color = hex(fixContrast(c, PAPER)); f.removeAttribute('color'); }
    } else for (const el of body.querySelectorAll('[style]')) el.removeAttribute('style');
    for (const el of body.querySelectorAll('[bgcolor],[face],[size],[width],[height],[align],[valign],[border],[cellpadding],[cellspacing]')) for (const a of ['bgcolor', 'face', 'size', 'align', 'valign', 'border', 'cellpadding', 'cellspacing']) el.removeAttribute(a);
  }
  if (!meta.accent) { const v = adapted.report.vars || {}; meta.accent = v['--acc'] || v['--accent'] || v['--primary'] || v['--brand'] || null; }
  step('Делю на блоки', 0.5);
  const found = detectBlocks(content, { wpm });
  const ask = [];
  const blocks = await finalizeBlocks(found, { wpm, ask, report: {}, onProgress: (n, t) => step(`Адаптирую ${n} / ${t} блоков`, 0.5 + 0.4 * n / Math.max(1, t)), typography: mode !== 'plain' });
  // header + whatever sits after the last block
  const head = document.createElement('header'); head.className = 'lz-head';
  for (const n of found.head) head.append(n);
  cleanTree(head, { typography: mode !== 'plain' });
  const blockEls = new Set(found.blocks.map(b => b.el));
  const tail = document.createElement('div'); tail.className = 'lz-tail';
  if (found.mode === 'source') { let after = false; for (const n of [...content.childNodes]) { if (blockEls.has(n) || (n.contains && [...blockEls].some(e => n.contains(e)))) { after = true; continue; } if (after && (n.textContent || '').trim()) tail.append(n); } }
  const tailWords = wordsOf(tail);
  const headWords = wordsOf(head);
  const words = blocks.reduce((a, b) => a + b.words, 0) + headWords + tailWords;
  const text = [head.textContent, ...blocks.map(b => b.title)].join(' ');
  if (!meta.title || meta.title === fileName) meta.title = head.querySelector('h1')?.textContent.trim() || meta.title || fileName;
  const accent = meta.accent && parseColor(meta.accent) ? meta.accent : null;
  const css = (accent ? `${scope}{--doc-accent:${accent}}\n` : '') + adapted.css;
  const html = `${css ? `<style>${css}</style>` : ''}${headWords || head.querySelector('img') ? head.outerHTML : ''}${blocks.map(b => b.html).join('\n')}${tailWords ? tail.outerHTML : ''}`;
  const check = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const fixed = [...check.querySelectorAll('[style]')].filter(e => /position\s*:\s*(fixed|sticky)/i.test(e.getAttribute('style'))).length + (/position\s*:\s*(fixed|sticky)/i.test(css) ? 1 : 0);
  const outImgs = check.querySelectorAll('img').length;
  const rep = fitReport({ adapter: kind, adapterVersion: ADAPTER_VERSION, level: mode, structure: found.mode, srcWords, words, srcImages, images: outImgs, blocks, fixed, contrastViolations: 0, cssReport: adapted.report, chrome });
  meta.lang = meta.lang || detectLang(srcText);
  const subj = guessSubject(meta.title, srcText);
  const sdm = {
    meta: { title: meta.title, subject: meta.subject || subj.key, subjectConfidence: subj.confidence, accent, lang: meta.lang, words, minutes: Math.max(1, Math.round(words / wpm)), imageCount: outImgs },
    blocks: blocks.map(({ html: _h, ...b }) => b), toc: blocks.map(b => ({ id: b.id, title: b.title })), ask, selfcheck: ask.filter(a => a.a),
  };
  void firstWords; void text;
  return { html, images: keepImages, words, title: meta.title, sdm, report: rep };
}

// public entry. buf = ArrayBuffer of the source file.
export async function adaptSource({ kind, buf, fileName, docId, wpm = DEFAULTS.wpm, onProgress }) {
  onProgress?.('Читаю файл', 0.02);
  const raw = await toHtmlString(kind, buf, fileName);
  const imagesPre = await extractDataImages(raw, { onProgress: (n, t) => onProgress?.(`Картинки ${n} / ${t}`, 0.05 + 0.25 * n / Math.max(1, t)) });
  let last = null, firstHard = null;
  for (const mode of ['normal', 'safe', 'plain']) {
    let res;
    try { res = await runPipeline(raw, { mode, docId, fileName, kind, wpm, onProgress, imagesPre }); }
    catch (e) { if (mode === 'plain') throw e; firstHard = firstHard || `ошибка адаптера: ${e.message}`; continue; }
    if (firstHard) res.report.fallbackFrom = firstHard;
    last = res;
    if (res.report.ok) break;
    firstHard = firstHard || res.report.hard.join('; ');
    if (mode === 'plain') break;
  }
  if (!last) throw new Error('Не удалось адаптировать файл.');
  if (!last.words && !last.images.length) throw new Error('В файле нет текста и картинок.');
  return { ...last, adapter: kind, adapterVersion: ADAPTER_VERSION };
}
