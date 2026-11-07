// Line-art sticker cut-out: ink mask -> closed silhouette -> white die-cut outline (rebuilt by dilation).
// Works on RGB buffers (no external deps besides sharp for decode/encode).

// squared euclidean distance to the nearest "on" pixel (Felzenszwalb), w*h Float32
export function dist2(mask, w, h) {
  const INF = 1e12, out = new Float32Array(w * h);
  const f = new Float64Array(Math.max(w, h)), d = new Float64Array(Math.max(w, h)), v = new Int32Array(Math.max(w, h)), z = new Float64Array(Math.max(w, h) + 1);
  const dt1 = (n) => {
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < n; q++) {
      let s;
      while (true) { s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); if (s <= z[k] && k > 0) k--; else break; }
      if (s <= z[k]) { v[k] = q; z[k] = -INF; z[k + 1] = INF; } else { k++; v[k] = q; z[k] = s; z[k + 1] = INF; }
    }
    k = 0;
    for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
  };
  for (let i = 0; i < w * h; i++) out[i] = mask[i] ? 0 : INF;
  for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) f[y] = out[y * w + x]; dt1(h); for (let y = 0; y < h; y++) out[y * w + x] = d[y]; }
  for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) f[x] = out[y * w + x]; dt1(w); for (let x = 0; x < w; x++) out[y * w + x] = d[x]; }
  return out;
}
export const dilate = (mask, w, h, r) => { const d = dist2(mask, w, h), o = new Uint8Array(w * h), r2 = r * r; for (let i = 0; i < w * h; i++) o[i] = d[i] <= r2 ? 1 : 0; return o; };
export const erode = (mask, w, h, r) => { const inv = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) inv[i] = mask[i] ? 0 : 1; const d = dist2(inv, w, h), o = new Uint8Array(w * h), r2 = r * r; for (let i = 0; i < w * h; i++) o[i] = d[i] > r2 ? 1 : 0; return o; };

export function fillHoles(mask, w, h) {
  const out = new Uint8Array(w * h).fill(1), stack = [];
  const push = (x, y) => { if (x >= 0 && y >= 0 && x < w && y < h && !mask[y * w + x] && out[y * w + x]) { out[y * w + x] = 0; stack.push(x, y); } };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) { const y = stack.pop(), x = stack.pop(); push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1); }
  return out;
}

// convex hull of "on" pixels (monotone chain) rasterised back to a mask
export function hullMask(mask, w, h) {
  const pts = [];
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x++) if (mask[y * w + x]) pts.push([x, y]);
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = []; for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  const up = []; for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  const poly = lo.slice(0, -1).concat(up.slice(0, -1));
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const xs = [];
    for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0])); }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.ceil(xs[k]); x <= Math.floor(xs[k + 1]); x++) out[y * w + x] = 1;
  }
  return out;
}

// rgb: Buffer w*h*3. Returns {rgba, w, h}
export function inkSticker(rgb, w, h, { outline = 8, close = 34, hull = 0, inkThreshold = 16 } = {}) {
  const ink = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) { const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2]; ink[i] = (b - r > inkThreshold || (r + g + b) / 3 < 150) ? 1 : 0; }
  // drop specks (isolated tiny ink, e.g. JPEG noise): keep pixels that have ink within 3 px on either side
  let sil;
  if (hull) {
    // hull of the ink blended with a closing so that a thin stray line does not stretch the shape
    sil = hullMask(dilate(ink, w, h, 2), w, h);
    if (hull === 2) { const c = erode(dilate(ink, w, h, close), w, h, close); sil = fillHoles(c, w, h); }
  } else {
    const closed = dilate(ink, w, h, close);
    sil = erode(fillHoles(closed, w, h), w, h, close);
    for (let i = 0; i < w * h; i++) if (ink[i]) sil[i] = 1;
  }
  const cutMask = outline > 0 ? dilate(sil, w, h, outline) : sil;
  // soft alpha from the distance field (anti-aliased ~1.5 px edge)
  const dOut = dist2(cutMask, w, h), inv = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) inv[i] = cutMask[i] ? 0 : 1;
  const dIn = dist2(inv, w, h);
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const sd = cutMask[i] ? Math.sqrt(dIn[i]) : -Math.sqrt(dOut[i]);   // + inside, - outside
    const a = Math.max(0, Math.min(1, 0.5 + sd / 1.4));
    // inside the silhouette keep the artwork, in the ring use pure white
    const keep = sil[i];
    const r = keep ? rgb[i * 3] : 255, g = keep ? rgb[i * 3 + 1] : 255, b = keep ? rgb[i * 3 + 2] : 255;
    rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = Math.round(a * 255);
  }
  return { rgba, w, h, cutMask };
}

// ---- colour artwork on a (near) white background ----
// foreground = everything that is not connected-to-the-border near-white; holes filled
export function fgFromWhite(rgb, w, h, white = 238) {
  const near = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) near[i] = Math.min(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]) >= white ? 1 : 0;
  const bg = new Uint8Array(w * h), st = [];
  const push = (x, y) => { if (x >= 0 && y >= 0 && x < w && y < h && near[y * w + x] && !bg[y * w + x]) { bg[y * w + x] = 1; st.push(x, y); } };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); } for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (st.length) { const y = st.pop(), x = st.pop(); push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1); }
  const fg = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) fg[i] = bg[i] ? 0 : 1;
  return fg;
}
// connected components of a mask (4-neighbour), returns [{mask, size, bbox}] largest first
export function components(mask, w, h) {
  const lab = new Int32Array(w * h), out = []; let n = 0;
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || lab[s]) continue;
    n++; const st = [s]; lab[s] = n; let size = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
    while (st.length) { const i = st.pop(); size++; const x = i % w, y = (i / w) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const j of [i + 1, i - 1, i + w, i - w]) if (j >= 0 && j < w * h && mask[j] && !lab[j] && Math.abs((j % w) - x) <= 1) { lab[j] = n; st.push(j); } }
    out.push({ id: n, size, bbox: [x0, y0, x1, y1] });
  }
  out.sort((a, b) => b.size - a.size);
  return out.map(c => ({ ...c, mask: Uint8Array.from(lab, v => (v === c.id ? 1 : 0)) }));
}
// die-cut a silhouette: keeps the artwork inside, adds a white outline of `outline` px (0 = keep the artwork's own outline), soft alpha
export function dieCut(rgb, w, h, sil, outline = 8) {
  const cut = outline > 0 ? dilate(sil, w, h, outline) : sil;
  const dOut = dist2(cut, w, h), inv = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) inv[i] = cut[i] ? 0 : 1;
  const dIn = dist2(inv, w, h), rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const sd = cut[i] ? Math.sqrt(dIn[i]) : -Math.sqrt(dOut[i]), a = Math.max(0, Math.min(1, 0.5 + sd / 1.4)), keep = sil[i];
    rgba[i * 4] = keep ? rgb[i * 3] : 255; rgba[i * 4 + 1] = keep ? rgb[i * 3 + 1] : 255; rgba[i * 4 + 2] = keep ? rgb[i * 3 + 2] : 255; rgba[i * 4 + 3] = Math.round(a * 255);
  }
  return rgba;
}
