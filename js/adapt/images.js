// Images: NEVER dropped. Data-URIs go to a blob store; quality is kept (no re-compression of web-sized images; only a long edge
// above 2400 px is scaled down to WebP q86 - and only if that is really smaller). Remote images become a tidy placeholder.
import { uid } from '../db.js';
import { base64ToBlob, tick } from '../util.js';

export const MAX_EDGE = 2400;
export const PLACEHOLDER = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="120" viewBox="0 0 640 120"><rect width="640" height="120" rx="12" fill="#eef2f6" stroke="#9cb2c1" stroke-dasharray="6 6"/><text x="320" y="66" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#46597a">картинка не встроена</text></svg>');

// width/height from the header bytes (no decoding)
export function imageSize(b) {
  try {
    if (b[0] === 0x89 && b[1] === 0x50) return { w: (b[16] << 24 | b[17] << 16 | b[18] << 8 | b[19]) >>> 0, h: (b[20] << 24 | b[21] << 16 | b[22] << 8 | b[23]) >>> 0 };
    if (b[0] === 0xFF && b[1] === 0xD8) {
      let i = 2;
      while (i < b.length - 9) {
        if (b[i] !== 0xFF) { i++; continue; }
        const m = b[i + 1];
        if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { h: b[i + 5] << 8 | b[i + 6], w: b[i + 7] << 8 | b[i + 8] };
        i += 2 + (b[i + 2] << 8 | b[i + 3]);
      }
    }
    if (b[0] === 0x47 && b[1] === 0x49) return { w: b[6] | b[7] << 8, h: b[8] | b[9] << 8 };
    if (b[0] === 0x52 && b[8] === 0x57 && b[12] === 0x56) { // WEBP
      if (b[15] === 0x20) return { w: (b[26] | b[27] << 8) & 0x3fff, h: (b[28] | b[29] << 8) & 0x3fff };
      if (b[15] === 0x4C) { const v = b[21] | b[22] << 8 | b[23] << 16 | b[24] << 24; return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 }; }
    }
  } catch { /* unknown */ }
  return null;
}
export async function downscaleIfHuge(blob, bytes) {
  const sz = imageSize(bytes);
  if (!sz || Math.max(sz.w, sz.h) <= MAX_EDGE || /svg|gif/.test(blob.type)) return blob;
  try {
    const bm = await createImageBitmap(blob);
    const k = MAX_EDGE / Math.max(bm.width, bm.height), w = Math.round(bm.width * k), h = Math.round(bm.height * k);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(bm, 0, 0, w, h); bm.close?.();
    const out = await new Promise(res => c.toBlob(res, 'image/webp', 0.86));
    return out && out.size < blob.size ? out : blob;
  } catch { return blob; }
}
// raw source text -> text with `imgref-<id>.img` placeholders + blobs
export async function extractDataImages(raw, { minBytes = 2048, onProgress } = {}) {
  const images = [], jobs = [];
  raw = raw.replace(/data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)/gi, (m, mime, b64, offset, whole) => {
    if (b64.length * 0.75 < minBytes) return m;
    if (/url\(\s*["']?$/i.test(whole.slice(Math.max(0, offset - 8), offset))) return m;   // CSS backgrounds stay
    const id = uid();
    jobs.push({ id, mime: mime.toLowerCase(), b64: b64.replace(/\s+/g, '') });
    return `imgref-${id}.img`;
  });
  let n = 0;
  for (const j of jobs) {
    try {
      let blob = base64ToBlob(j.b64, j.mime);
      if (/jpeg|png|webp/.test(j.mime) && blob.size > 200000) blob = await downscaleIfHuge(blob, new Uint8Array(await blob.slice(0, 65536).arrayBuffer()));
      images.push({ id: j.id, blob, mime: blob.type || j.mime });
    } catch { /* an undecodable image keeps its placeholder id; reported by the fit check */ }
    if (++n % 8 === 0) { onProgress?.(n, jobs.length); await tick(); }
  }
  return { raw, images };
}
