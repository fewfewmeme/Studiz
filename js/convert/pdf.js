// PDF -> HTML. A portrait text PDF is reflowed (headings by font size, headers/footers dropped, de-hyphenated); scanned, slide
// (landscape) or image-bearing pages become page images. One rendering path afterwards: the same sandboxed frame.
import { openPdf } from '../libs.js';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const med = a => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };

async function pageImage(page, targetW = 1400, q = 0.85) {
  const v0 = page.getViewport({ scale: 1 }), scale = Math.min(3, targetW / v0.width), v = page.getViewport({ scale });
  const c = document.createElement('canvas'); c.width = Math.round(v.width); c.height = Math.round(v.height);
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: v }).promise;
  let url = c.toDataURL('image/webp', q); if (!url.startsWith('data:image/webp')) url = c.toDataURL('image/jpeg', q);
  return { url, w: c.width, h: c.height };
}
// per-page learning-time metrics (pdf.js): image area, drawn paths (diagrams, handwriting), formula hints, the largest text line as a title
async function pageMetrics(page, info, OPS) {
  const m = { imgFrac: 0, pathOps: 0, formula: 0, title: '', words: 0 };
  const items = info.items;
  m.words = items.reduce((a, it) => a + (it.str.trim() ? it.str.trim().split(/\s+/).length : 0), 0);
  try {
    const ops = await page.getOperatorList(), fa = ops.fnArray, aa = ops.argsArray;
    let ctm = [1, 0, 0, 1, 0, 0]; const stack = []; let area = 0;
    const mul = (a, b) => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]];
    const PATH = new Set([OPS.moveTo, OPS.lineTo, OPS.curveTo, OPS.curveTo2, OPS.curveTo3, OPS.rectangle, OPS.closePath].filter(x => x != null));
    for (let i = 0; i < fa.length; i++) {
      const f = fa[i];
      if (f === OPS.save) stack.push(ctm.slice()); else if (f === OPS.restore) ctm = stack.pop() || ctm;
      else if (f === OPS.transform) ctm = mul(aa[i], ctm);
      else if (f === OPS.paintImageXObject || f === OPS.paintInlineImageXObject || f === OPS.paintImageMaskXObject) area += Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2]);
      else if (f === OPS.constructPath) m.pathOps += Array.isArray(aa[i] && aa[i][0]) ? aa[i][0].length : 1;
      else if (PATH.has(f)) m.pathOps++;
    }
    m.imgFrac = Math.min(1, area / Math.max(1, info.w * info.h));
  } catch { /* metrics are a hint */ }
  const texts = items.filter(it => it.str.trim());
  const single = texts.filter(it => it.str.trim().length === 1).length, arrows = texts.reduce((a, it) => a + (it.str.match(/[→⇄↔⇌⟶±≈═]/g) || []).length, 0);
  m.formula = (texts.length && single / texts.length > 0.3) || arrows >= 3 ? 1 : 0;
  const sizes = texts.map(it => Math.abs(it.transform[3]) || it.height).filter(v => v > 4), md = sizes.length ? sizes.slice().sort((a, b) => a - b)[sizes.length >> 1] : 0;
  const big = texts.filter(it => (Math.abs(it.transform[3]) || it.height) >= md * 1.3 && it.str.trim().length >= 3).sort((a, b) => b.transform[5] - a.transform[5])[0];
  if (big) m.title = big.str.trim().replace(/\s+/g, ' ').slice(0, 70);
  m.min = Math.min(8, Math.max(1.5, 0.6 + m.words / 70 + m.imgFrac * 3 + Math.min(m.pathOps / 300, 3) + m.formula * 1.5));
  return m;
}
async function hasImages(page, OPS) {
  try { const ops = await page.getOperatorList(); return ops.fnArray.some(f => f === OPS.paintImageXObject || f === OPS.paintInlineImageXObject || f === OPS.paintImageMaskXObject); } catch { return false; }
}
const norm = t => t.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().toLowerCase();

export async function pdfToHtml(buf, { onProgress, title = '' } = {}) {
  const pdf = await openPdf(buf.slice(0));
  const pdfjs = await import('../../vendor/pdfjs/pdf.min.mjs'); const OPS = pdfjs.OPS;
  const n = pdf.numPages, pages = [];
  let landscape = 0, textPages = 0;
  for (let i = 1; i <= n; i++) {
    onProgress?.(`Страница ${i} / ${n}`, 0.05 + 0.5 * i / n);
    const page = await pdf.getPage(i), v = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const items = tc.items.filter(it => it.str && it.str.trim() !== '' || it.hasEOL);
    const chars = items.reduce((a, it) => a + it.str.length, 0);
    const info = { i, page, w: v.width, h: v.height, items, chars, imgs: await hasImages(page, OPS) };
    if (v.width / v.height > 1.15) landscape++;
    if (chars > 80) textPages++;
    pages.push(info);
  }
  const slides = landscape > n * 0.5, scanned = textPages < n * 0.4;
  let body = '', layout = '', words = 0;
  if (slides || scanned) {
    layout = slides ? 'pages-landscape' : 'pages';
    for (const p of pages) { onProgress?.(`Картинка страницы ${p.i} / ${n}`, 0.55 + 0.4 * p.i / n); const im = await pageImage(p.page), pm = await pageMetrics(p.page, p, OPS); body += `<img class="pdf-page" alt="Страница ${p.i}" src="${im.url}" width="${im.w}" height="${im.h}" data-page="${p.i}" data-pm="${pm.min.toFixed(2)}"${pm.title ? ` data-pt="${pm.title.replace(/"/g, '&quot;')}"` : ''}>\n`; words += Math.round(p.chars / 6); }
  } else {
    layout = 'text';
    // body font size = median over all text; headers/footers = text that repeats near the page edges
    const sizes = []; pages.forEach(p => p.items.forEach(it => { const s = Math.abs(it.transform[3]) || it.height; if (s > 4) for (let k = 0; k < Math.min(10, it.str.length); k++) sizes.push(s); }));
    const base = med(sizes) || 11;
    const edge = new Map();
    pages.forEach(p => { const seen = new Set(); p.items.forEach(it => { const y = it.transform[5]; if (y > p.h * 0.93 || y < p.h * 0.07) { const k = norm(it.str); if (k && !seen.has(k)) { seen.add(k); edge.set(k, (edge.get(k) || 0) + 1); } } }); });
    const repeated = new Set([...edge].filter(([, c]) => c >= Math.max(2, n * 0.3)).map(([k]) => k));
    const out = []; let para = [], list = null, lastBottom = null, lastSize = base, leftMin = 1e9;
    pages.forEach(p => p.items.forEach(it => { if (it.str.trim()) leftMin = Math.min(leftMin, it.transform[4]); }));
    const flushPara = () => { if (para.length) { const t = para.join(' ').replace(/\s+/g, ' ').trim(); if (t) { out.push(`<p>${esc(t)}</p>`); words += t.split(' ').length; } para = []; } };
    const flushList = () => { if (list) { out.push('<ul>' + list.map(x => `<li>${esc(x)}</li>`).join('') + '</ul>'); list = null; } };
    for (const p of pages) {
      onProgress?.(`Текст страницы ${p.i} / ${n}`, 0.55 + 0.4 * p.i / n);
      // lines by y
      const rows = []; p.items.forEach(it => { if (!it.str.trim()) return; const y = it.transform[5], s = Math.abs(it.transform[3]) || it.height; let r = rows.find(r => Math.abs(r.y - y) < Math.max(2, s * 0.35)); if (!r) { r = { y, s, parts: [], x: it.transform[4] }; rows.push(r); } r.parts.push(it); r.s = Math.max(r.s, s); r.x = Math.min(r.x, it.transform[4]); });
      rows.sort((a, b) => b.y - a.y);
      for (const r of rows) {
        r.parts.sort((a, b) => a.transform[4] - b.transform[4]);
        let t = ''; r.parts.forEach((it, k) => { const prev = r.parts[k - 1]; t += (prev && it.transform[4] - (prev.transform[4] + prev.width) > r.s * 0.2 ? ' ' : '') + it.str; });
        t = t.replace(/\s+/g, ' ').trim(); if (!t) continue;
        const k = norm(t); if ((repeated.has(k) && (r.y > p.h * 0.93 || r.y < p.h * 0.07)) || /^\d{1,4}$/.test(t) || /^[-–—]\s*\d+\s*[-–—]$/.test(t)) continue;
        const ratio = r.s / base;
        if (ratio >= 1.25 && t.length < 160) { flushPara(); flushList(); out.push(ratio >= 1.7 ? `<h2>${esc(t)}</h2>` : ratio >= 1.4 ? `<h3>${esc(t)}</h3>` : `<h4>${esc(t)}</h4>`); words += t.split(' ').length; lastBottom = null; continue; }
        const bullet = /^([•●▪◦·\-–—*]|\d{1,2}[.)])\s+/.exec(t);
        if (bullet) { flushPara(); (list ||= []).push(t.slice(bullet[0].length)); lastBottom = r.y; lastSize = r.s; continue; }
        const gap = lastBottom == null ? 0 : lastBottom - r.y, newPara = lastBottom != null && (gap > lastSize * 1.9 || (r.x > leftMin + base * 1.2 && /[.!?…:]$/.test(para[para.length - 1] || '')));
        if (list && !(r.x > leftMin + base * 0.8)) flushList();
        if (list) { list[list.length - 1] += ' ' + t; lastBottom = r.y; continue; }
        if (newPara) flushPara();
        // de-hyphenate
        if (para.length && /[а-яёa-z]-$/i.test(para[para.length - 1]) && /^[а-яёa-z]/.test(t)) para[para.length - 1] = para[para.length - 1].slice(0, -1) + t; else para.push(t);
        lastBottom = r.y; lastSize = r.s;
      }
      flushPara(); flushList();
      // pages with figures: the page itself follows as a picture so no image is ever lost
      if (p.imgs) { const im = await pageImage(p.page, 1100, 0.82); out.push(`<figure><img class="pdf-page" alt="Рисунок, страница ${p.i}" src="${im.url}" width="${im.w}" height="${im.h}" data-page="${p.i}"><figcaption>Страница ${p.i}</figcaption></figure>`); }
      lastBottom = null;
    }
    body = out.join('\n');
    if (!words) { layout = 'pages'; body = ''; for (const p of pages) { const im = await pageImage(p.page); body += `<img class="pdf-page" alt="Страница ${p.i}" src="${im.url}" width="${im.w}" height="${im.h}" data-page="${p.i}">\n`; } }
  }
  pdf.destroy?.();
  void title;
  return { body, layout, words, pages: n, pagesLayout: layout.startsWith('pages') };
}
