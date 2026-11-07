// Подготовка HTML: очистка DOMPurify, вынос больших data:-картинок, ограничение стилей областью документа.
import { LARGE_DATA_IMAGE_BYTES } from '../config.js';
import { getPurify } from './libs.js';
import { base64ToBlob, countWords, tick } from './util.js';
import { uid } from './db.js';

export const DOC_CLASS = 'doc';

// Декодирование байтов HTML с учётом <meta charset>
export function decodeText(buf) {
  const bytes = new Uint8Array(buf);
  let text = new TextDecoder('utf-8').decode(bytes);
  if (text.includes('�')) {
    const head = new TextDecoder('latin1').decode(bytes.subarray(0, 4096));
    const m = /charset\s*=\s*["']?([\w-]+)/i.exec(head);
    const label = m ? m[1].toLowerCase() : 'windows-1251';
    try { text = new TextDecoder(label).decode(bytes); } catch { text = new TextDecoder('windows-1251').decode(bytes); }
  }
  return text.replace(/^﻿/, '');
}

// ---- Ограничение CSS областью .doc ----
function splitTopLevel(sel) {
  const out = []; let depth = 0, cur = '', q = null;
  for (const ch of sel) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}
function scopeSelector(sel, prefix) {
  let s = sel.trim();
  if (!s) return '';
  let changed = false, attached = false;
  for (let i = 0; i < 3; i++) {
    const m = /^(html|body|:root)(?![\w-])/i.exec(s);
    if (!m) break;
    changed = true;
    let rest = s.slice(m[0].length);
    attached = rest.length > 0 && !/^[\s>+~]/.test(rest);   // body.dark, body:hover
    s = rest.trimStart();
    s = s.replace(/^[>+~]\s*/, '');
  }
  if (!changed) return `${prefix} ${s}`;
  if (!s) return prefix;
  return attached ? `${prefix}${s}` : `${prefix} ${s}`;
}
function scopeRules(rules, prefix) {
  let out = '';
  for (const r of rules) {
    const t = r.type;
    if (t === 1) {
      const sels = splitTopLevel(r.selectorText).map(s => scopeSelector(s, prefix)).filter(Boolean).join(',');
      out += `${sels}{${r.style.cssText}}`;
    } else if (t === 4) {
      out += `@media ${r.media.mediaText}{${scopeRules(r.cssRules, prefix)}}`;
    } else if (t === 12) {
      out += `@supports ${r.conditionText}{${scopeRules(r.cssRules, prefix)}}`;
    } else {
      out += r.cssText;
    }
  }
  return out;
}
export function neutralizeCssUrls(css) {
  return css
    .replace(/@import[^;]*;?/gi, '')
    .replace(/url\(\s*(['"]?)\s*(https?:)?\/\/[^)]*\)/gi, 'url("data:,")')
    .replace(/url\(\s*(['"]?)\s*https?:[^)]*\)/gi, 'url("data:,")');
}
export function scopeCss(css, prefix = '.' + DOC_CLASS) {
  css = neutralizeCssUrls(css);
  try {
    const d = document.implementation.createHTMLDocument('');
    const st = d.createElement('style');
    st.textContent = css;
    d.head.append(st);
    return scopeRules(st.sheet.cssRules, prefix);
  } catch {
    return '';   // непонятный CSS лучше выбросить, чем сломать весь интерфейс
  }
}

// ---- Основная подготовка ----
// Возвращает { html, images:[{id, blob, mime}], words, title }
export async function prepareHtml(raw, { onStep } = {}) {
  const images = [];
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(raw);
  const title = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : '';

  // 1. Выносим большие data:-картинки до разбора (так очистка работает быстро на 5 МБ)
  raw = raw.replace(/data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)/gi, (m, mime, b64, offset, whole) => {
    const approxBytes = b64.length * 0.75;
    if (approxBytes < LARGE_DATA_IMAGE_BYTES) return m;
    const before = whole.slice(Math.max(0, offset - 8), offset);
    if (/url\(\s*["']?$/i.test(before)) return m;   // фон в CSS не трогаем
    try {
      const id = uid();
      images.push({ id, blob: base64ToBlob(b64.replace(/\s+/g, ''), mime.toLowerCase()), mime });
      return `imgref-${id}.img`;
    } catch { return m; }
  });
  await tick();
  onStep?.('Очистка');

  // 2. Очистка
  const DOMPurify = await getPurify();
  const clean = DOMPurify.sanitize(raw, {
    FORCE_BODY: true,
    ADD_TAGS: ['style'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'frame', 'frameset', 'form', 'input', 'textarea', 'select', 'link', 'meta', 'base', 'title', 'applet', 'noscript'],
    FORBID_ATTR: ['srcset', 'ping', 'formaction'],
    ADD_ATTR: ['target'],
    ALLOW_DATA_ATTR: true,
    ALLOW_UNKNOWN_PROTOCOLS: false,
  });
  await tick();

  // 3. Разбор и доработка
  const doc = new DOMParser().parseFromString(`<body>${clean}</body>`, 'text/html');
  const body = doc.body;
  const used = new Set(images.map(i => i.id));
  for (const img of body.querySelectorAll('img')) {
    const src = img.getAttribute('src') || '';
    const m = /^imgref-(.+)\.img$/.exec(src);
    if (m && used.has(m[1])) {
      img.setAttribute('data-img-id', m[1]);
      img.removeAttribute('src');
    } else if (/^https?:|^\/\//i.test(src)) {
      img.setAttribute('data-blocked-src', '1');
      img.removeAttribute('src');
      if (!img.getAttribute('alt')) img.setAttribute('alt', '[внешняя картинка недоступна без интернета]');
    }
    img.removeAttribute('loading');
  }
  // картинки, которых нет в тексте (на случай совпадений) — не храним
  const usedNow = new Set([...body.querySelectorAll('img[data-img-id]')].map(i => i.getAttribute('data-img-id')));
  const keep = images.filter(i => usedNow.has(i.id));

  for (const st of body.querySelectorAll('style')) st.textContent = scopeCss(st.textContent || '');
  for (const el of body.querySelectorAll('[style]')) {
    const s = el.getAttribute('style');
    if (/url\(/i.test(s)) el.setAttribute('style', neutralizeCssUrls(s));
  }
  for (const a of body.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href') || '';
    if (/^https?:/i.test(href)) { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer'); }
  }
  for (const t of body.querySelectorAll('title')) t.remove();

  const textClone = body.cloneNode(true);
  textClone.querySelectorAll('style').forEach(s => s.remove());
  const words = countWords(textClone.textContent || '');
  return { html: body.innerHTML, images: keep, words, title };
}

export function textToHtml(text) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return text.replace(/\r\n?/g, '\n').split(/\n{2,}/).map(p => p.trim() ? `<p>${esc(p.trim()).replace(/\n/g, '<br>')}</p>` : '').join('\n');
}

// ---- Light "paper": imported documents are always shown on light paper ----
// Dark artifacts (dark body background + light text) would break marks, so light text colours and dark
// backgrounds are dropped at render time (the stored document is not changed).
function lum(c) { return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255; }
function colorOf(v) {
  if (!v) return null;
  const m = /(#[0-9a-f]{3,8}\b|rgba?\([^)]*\))/i.exec(v);
  if (!m) return null;
  const s = m[1];
  if (s[0] === '#') {
    let x = s.slice(1); if (x.length === 3) x = x.split('').map(ch => ch + ch).join('');
    if (x.length < 6) return null;
    return [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16), 1];
  }
  const n = s.match(/[\d.]+/g).map(Number);
  return [n[0], n[1], n[2], n.length > 3 ? n[3] : 1];
}
function lightenStyle(st) {
  let changed = false;
  const col = colorOf(st.getPropertyValue('color'));
  if (col && lum(col) > 0.62) { st.removeProperty('color'); changed = true; }
  for (const p of ['background-color', 'background']) {
    const v = st.getPropertyValue(p);
    if (!v || /gradient|url\(/i.test(v)) continue;
    const c = colorOf(v);
    if (c && c[3] > 0.5 && lum(c) < 0.4) { st.removeProperty(p); changed = true; }
  }
  return changed;
}
function lightenRules(rules) {
  let out = '';
  for (const r of rules) {
    if (r.type === 1) { lightenStyle(r.style); out += `${r.selectorText}{${r.style.cssText}}`; }
    else if (r.type === 4) out += `@media ${r.media.mediaText}{${lightenRules(r.cssRules)}}`;
    else if (r.type === 12) out += `@supports ${r.conditionText}{${lightenRules(r.cssRules)}}`;
    else out += r.cssText;
  }
  return out;
}
export function lightenDoc(root) {
  try {
    for (const st of root.querySelectorAll('style')) {
      const d = document.implementation.createHTMLDocument('');
      const el = d.createElement('style'); el.textContent = st.textContent; d.head.append(el);
      st.textContent = lightenRules(el.sheet.cssRules);
    }
    for (const el of root.querySelectorAll('[style]')) lightenStyle(el.style);
    for (const el of root.querySelectorAll('font[color]')) { const c = colorOf(el.getAttribute('color')); if (c && lum(c) > 0.62) el.removeAttribute('color'); }
    for (const el of root.querySelectorAll('[bgcolor]')) { const c = colorOf(el.getAttribute('bgcolor')); if (c && lum(c) < 0.4) el.removeAttribute('bgcolor'); }
  } catch { /* never break a document because of colour clean-up */ }
}
