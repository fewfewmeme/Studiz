// Мелкие помощники.

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; } }
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  append(el, children);
  return el;
}
function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const tick = () => new Promise(r => setTimeout(r, 0));
export const raf = () => new Promise(r => requestAnimationFrame(() => r()));
export const sleep = ms => new Promise(r => setTimeout(r, ms));

export function debounce(fn, ms) {
  let t = null;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => { t = null; fn(...a); }, ms); };
  d.flush = (...a) => { if (t) { clearTimeout(t); t = null; fn(...a); } };
  d.cancel = () => { clearTimeout(t); t = null; };
  d.pending = () => t !== null;
  return d;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function fmtBytes(n) {
  if (n == null) return '—';
  if (n < 1024) return n + ' Б';
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' КБ';
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' МБ';
  return (n / 1024 / 1024 / 1024).toFixed(2) + ' ГБ';
}

export function pad2(n) { return String(n).padStart(2, '0'); }
export function dateKey(d = new Date()) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
export function fmtDateRu(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}
export function fmtDur(sec) {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${pad2(s)}`;
}
export function fmtMin(sec) { return Math.floor(sec / 60); }

// Русское склонение: plural(5, 'файл', 'файла', 'файлов')
export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
export const nFiles = n => `${n} ${plural(n, 'файл', 'файла', 'файлов')}`;

export function baseName(name) { return name.replace(/\.[^./\\]+$/, ''); }
export function extOf(name) { const m = /\.([^./\\]+)$/.exec(name); return m ? m[1].toLowerCase() : ''; }

export function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// Подсчёт слов
export function countWords(text) {
  const m = text.match(/[\p{L}\p{N}]+/gu);
  return m ? m.length : 0;
}

// Загрузка классических скриптов (UMD) один раз
const loaded = new Map();
export function loadScript(src) {
  if (loaded.has(src)) return loaded.get(src);
  const p = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = new URL(src, document.baseURI).href;
    s.onload = resolve;
    s.onerror = () => { loaded.delete(src); reject(new Error('Не удалось загрузить модуль ' + src)); };
    document.head.append(s);
  });
  loaded.set(src, p);
  return p;
}

export function base64ToBlob(b64, mime) {
  const bin = atob(b64);
  const n = bin.length;
  const arr = new Uint8Array(n);
  for (let i = 0; i < n; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export function blobToDataUrl(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}

export function onceVisibleSizes(el) { const r = el.getBoundingClientRect(); return { w: r.width, h: r.height }; }
