// PDF margin trimming: find the content bounds of every page (low-resolution render, non-white bounding box,
// stray scanner noise ignored) and derive one document-wide crop. Annotations always stay in ORIGINAL page coordinates;
// the crop is only a window over the page, so toggling it never moves a mark.
import * as db from '../db.js';

const SCAN_W = 180, WHITE = 236, PAD_PT = 24;

// bounds of one rendered canvas as fractions [l, t, r, b] or null for an empty page. Rows/columns need >= `minCount`
// dark pixels and two neighbours in a row, so single specks and hairlines do not count.
export function boundsOfPixels(data, w, h, minCount = 2) {
  const rows = new Uint16Array(h), cols = new Uint16Array(w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (data[i + 3] > 10 && Math.min(data[i], data[i + 1], data[i + 2]) < WHITE) { rows[y]++; cols[x]++; } }
  const first = (arr, n) => { for (let i = 0; i + 1 < n; i++) if (arr[i] >= minCount && arr[i + 1] >= minCount) return i; return -1; };
  const last = (arr, n) => { for (let i = n - 1; i > 0; i--) if (arr[i] >= minCount && arr[i - 1] >= minCount) return i; return -1; };
  const t = first(rows, h), b = last(rows, h), l = first(cols, w), r = last(cols, w);
  if (t < 0 || l < 0 || b <= t || r <= l) return null;
  return [l / w, t / h, (r + 1) / w, (b + 1) / h];
}

async function pageBounds(pdf, n) {
  const page = await pdf.getPage(n);
  const base = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: SCAN_W / base.width });
  const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, canvas: c, viewport: vp }).promise;
  const img = ctx.getImageData(0, 0, c.width, c.height);
  page.cleanup?.();
  return { box: boundsOfPixels(img.data, c.width, c.height), wPt: base.width, hPt: base.height };
}

const quantile = (arr, q) => { const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.max(0, Math.round(q * (a.length - 1))))]; };

// Per-page bounds are cached in kv; the document crop is a robust union (3% / 97% quantiles) + 24 pt padding.
export async function loadBounds(doc, onProgress) {
  const key = `pdfbounds:${doc.meta.id}`;
  const cached = await db.kvGet(key, null);
  if (cached && cached.v === 1 && cached.n === doc.numPages) return cached;
  const pages = [];
  let wPt = 0, hPt = 0;
  for (let n = 1; n <= doc.numPages; n++) {
    try { const r = await pageBounds(doc.pdf, n); pages.push(r.box); wPt = r.wPt; hPt = r.hPt; } catch { pages.push(null); }
    if (n % 4 === 0) { onProgress?.(n / doc.numPages, `${n} из ${doc.numPages}`); await new Promise(r => setTimeout(r, 0)); }
  }
  const rec = { v: 1, n: doc.numPages, pages, wPt, hPt };
  await db.kvSet(key, rec).catch(() => {});
  return rec;
}

// doc-wide crop {l,t,r,b} (fractions of the page) or null if there is nothing worth cutting
export function docCrop(rec) {
  if (!rec) return null;
  const ok = rec.pages.filter(Boolean);
  if (!ok.length) return null;
  const px = PAD_PT / (rec.wPt || 595), py = PAD_PT / (rec.hPt || 842);
  const q = ok.length >= 12 ? [0.03, 0.97] : [0, 1];
  const l = Math.max(0, quantile(ok.map(b => b[0]), q[0]) - px), t = Math.max(0, quantile(ok.map(b => b[1]), q[0]) - py);
  const r = Math.min(1, quantile(ok.map(b => b[2]), q[1]) + px), b = Math.min(1, quantile(ok.map(b => b[3]), q[1]) + py);
  if (r - l >= 0.94 && b - t >= 0.94) return null;     // nothing to gain
  if (r - l < 0.2 || b - t < 0.1) return null;          // implausible
  return { l, t, r, b };
}
// crop used for ONE page in blocks: horizontal like the document, vertical from the page's own bounds (compact cards)
export function pageCrop(rec, base, n) {
  const own = rec?.pages?.[n - 1];
  if (!own) return base;
  const py = PAD_PT / (rec.hPt || 842);
  const t = Math.max(0, own[1] - py), b = Math.min(1, own[3] + py);
  return { l: base?.l ?? 0, r: base?.r ?? 1, t, b: Math.max(b, t + 0.05) };
}
