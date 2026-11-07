// Builds the HTML of a sandboxed reading frame: the file's own HTML (never restyled) + a prelude (CSP, storage shim, reader runtime).
import { DOC_FONTS } from './fonts.js';

const RT = ['10-core', '20-layout', '@anchor', '30-anno', '40-seg', '60-blocks', '70-book', '75-pinch', '90-boot'];
let rtCache = null, shimCache = null;
async function text(url) { const r = await fetch(url); if (!r.ok) throw new Error('runtime: ' + url); return r.text(); }
export async function runtimeSource() {
  if (rtCache) return rtCache;
  const base = new URL('./rt/', import.meta.url);
  const parts = await Promise.all(RT.map(async n => {
    if (n === '@anchor') return (await text(new URL('../anno/anchor.js', import.meta.url))).replace(/^export\s+/gm, '');
    try { return await text(new URL(n + '.js', base)); } catch { return ''; }
  }));
  shimCache = await text(new URL('00-shim.js', base));
  rtCache = "(function(){'use strict';\n" + parts.join('\n') + '\n})();';
  return rtCache;
}
export async function shimSource() { await runtimeSource(); return shimCache; }

const b64Cache = new Map();
async function fontFile(file) {
  if (b64Cache.has(file)) return b64Cache.get(file);
  const buf = new Uint8Array(await (await fetch(new URL('../../assets/fonts/doc/' + file, import.meta.url))).arrayBuffer());
  let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  const v = 'data:font/woff2;base64,' + btoa(s); b64Cache.set(file, v); return v;
}
export function familiesIn(text) { return Object.keys(DOC_FONTS).filter(f => new RegExp(f.replace(/ /g, '[ +]'), 'i').test(text)); }
export async function fontCss(families) {
  let out = '';
  for (const fam of families) for (const f of DOC_FONTS[fam] || []) out += `@font-face{font-family:"${fam}";font-style:${f.s};font-weight:${f.w};font-display:swap;src:url(${await fontFile(f.f)}) format("woff2");unicode-range:${f.r}}\n`;
  return out;
}

const esc = s => s.replace(/<\//g, '<\\/').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
// Оригинал: the file's own inline scripts run. Reading views: only OUR scripts (carrying the nonce) run — the file's scripts and on*= handlers are blocked by the policy itself.
const csp = nonce => `default-src 'none'; script-src ${nonce ? `'nonce-${nonce}'` : "'unsafe-inline'"}; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data: ${location.origin}; connect-src 'none'; form-action 'none'`;
const newNonce = () => { const a = new Uint8Array(12); crypto.getRandomValues(a); return btoa(String.fromCharCode(...a)).replace(/[^A-Za-z0-9]/g, 'x'); };

// remote fonts and imports never load (the sandbox has no network); Google-Fonts families come from the bundled copies
function stripRemote(raw) {
  return raw
    .replace(/<link\b[^>]*\bhref=["']?https?:[^>]*>/gi, m => (/rel=["']?stylesheet|rel=["']?preload|rel=["']?preconnect|rel=["']?dns-prefetch/i.test(m) ? '' : m))
    .replace(/@import\s+url\([^)]*\)\s*[^;{]*;?/gi, '')
    .replace(/@import\s+["'][^"']+["']\s*[^;{]*;?/gi, '')
    .replace(/@font-face\s*\{[^}]*https?:[^}]*\}/gi, '');
}

export async function frameHtml(rawText, { view, cfg, extraCss = '' }) {
  const runtime = await runtimeSource(), shim = shimCache;
  rawText = stripRemote(rawText);
  const reading = view !== 'orig', nonce = reading ? newNonce() : '';
  if (reading) rawText = rawText.replace(/<script\b[\s\S]*?<\/script\s*>/gi, '').replace(/<meta[^>]+http-equiv=["']?(refresh|content-security-policy)[^>]*>/gi, '');
  const fams = familiesIn(rawText);
  const fonts = await fontCss(fams);
  const sn = nonce ? ` nonce="${nonce}"` : '';
  const prelude = `<meta http-equiv="Content-Security-Policy" content="${csp(nonce)}"><meta name="format-detection" content="telephone=no,date=no,address=no,email=no"><meta name="color-scheme" content="light dark">` +
    `<script${sn}>window.__LZ=${esc(JSON.stringify(cfg))};</script><script${sn}>${esc(shim)}</script>` +
    (fonts || extraCss ? `<style id="lz-docfonts">${fonts}${extraCss}</style>` : '') +
    `<script${sn}>${esc(runtime)}</script>`;
  let m = /<head\b[^>]*>/i.exec(rawText);
  if (m) return rawText.slice(0, m.index + m[0].length) + prelude + rawText.slice(m.index + m[0].length);
  m = /<html\b[^>]*>/i.exec(rawText);
  if (m) return rawText.slice(0, m.index + m[0].length) + '<head>' + prelude + '</head>' + rawText.slice(m.index + m[0].length);
  return '<!DOCTYPE html><html><head><meta charset="utf-8">' + prelude + '</head><body>' + rawText + '</body></html>';
}
