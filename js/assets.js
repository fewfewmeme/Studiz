// Asset slots: the UI reads assets/manifest.json; a missing file falls back to a quiet duotone gradient (never clip-art).
// Stickers are STATIC cut-outs (die-cut white outline baked into the file, shadow comes from CSS).
import { h } from './util.js';
import * as db from './db.js';

const BUILTIN = { version: 2, stickers: {}, subjectStickers: {}, subjectTextures: {}, wallpapers: { pool: {}, themeDefault: {} }, textures: {}, slots: {} };
let M = BUILTIN;
let userStickers = {};   // subject key -> sticker name, chosen in Settings
let userWall = null;     // chosen wallpaper name (null = theme default)

export async function loadAssets() {
  try {
    const r = await fetch('assets/manifest.json', { cache: 'no-cache' });
    if (r.ok) { const j = await r.json(); M = { ...BUILTIN, ...j, slots: { ...(j.slots || {}) } }; }
  } catch { M = BUILTIN; }
  try { userStickers = await db.kvGet('subjectStickers', {}); userWall = await db.kvGet('wallpaper', null); } catch { /* defaults */ }
  return M;
}
export const manifest = () => M;
export const stickerNames = () => (M.stickerPool?.length ? M.stickerPool : Object.keys(M.stickers || {}).filter(n => n.startsWith('cat-'))).filter(n => M.stickers?.[n]);

// ---- stickers ----
export function stickerSrc(name) { return M.stickers?.[name] || null; }
export function sticker2x(name) { return M.stickers2x?.[name] || null; }
export function subjectStickerName(key) { return userStickers[key] || M.subjectStickers?.[key] || 'cat-outline'; }
export async function setSubjectSticker(key, name) { userStickers = { ...userStickers, [key]: name }; await db.kvSet('subjectStickers', userStickers); }

// <img> with a duotone placeholder if the file is missing
export function stickerImg(name, cls = '') {
  const src = stickerSrc(name);
  const wrap = h('span', { class: 'sticker ' + cls, 'aria-hidden': 'true' });
  const fallback = () => { wrap.classList.add('sticker-missing'); wrap.replaceChildren(); };
  if (!src) { fallback(); return wrap; }
  const img = h('img', { src, alt: '', draggable: 'false', decoding: 'async' });
  const x2 = sticker2x(name);
  if (x2) img.srcset = `${src} 1x, ${x2} 2x`;
  img.addEventListener('error', fallback);
  wrap.append(img);
  return wrap;
}
export const subjectSticker = (key, cls = '') => stickerImg(subjectStickerName(key), cls);
export const slotSticker = (slotName, cls = '') => stickerImg(M.slots?.[slotName] || 'cat-outline', cls);

// ---- textures / images ----
const abs = p => (p ? new URL(p, document.baseURI).href : null);   // CSS custom properties resolve url() against the stylesheet, so pass absolute URLs
export function textureUrl(name) { return abs(M.textures?.[name]); }
export function subjectTexture(key) { return textureUrl(M.subjectTextures?.[key] || 'flowers'); }
export function deskTexture() { return textureUrl(M.slots?.desk || 'flowers'); }

// ---- wallpapers ----
export function wallpaperList() { return Object.entries(M.wallpapers?.pool || {}).map(([k, v]) => ({ key: k, ...v })); }
export function wallpaperChoice() { return userWall; }
export async function setWallpaperChoice(k) { userWall = k; await db.kvSet('wallpaper', k); }
export function wallpaperFor(theme) {
  const pool = M.wallpapers?.pool || {};
  const k = (userWall && pool[userWall]) ? userWall : (M.wallpapers?.themeDefault?.[theme] || Object.keys(pool)[0]);
  return pool[k] ? { key: k, ...pool[k] } : null;
}
export function heroImage() {
  const s = M.slots?.homeHero, pool = M.wallpapers?.pool || {};
  const w = pool[s?.image];
  return w ? { src: w.landscape || w.portrait, pos: s.pos || w.pos || '50% 40%' } : null;
}
export function splashImage() {
  const s = M.slots?.splash, w = (M.wallpapers?.pool || {})[s?.image];
  return w ? { portrait: w.portrait, landscape: w.landscape || w.portrait, pos: w.pos || '50% 40%', sticker: s.sticker } : null;
}
export const posterUrl = () => abs(M.slots?.settingsPoster);
export const checkPosterUrl = () => abs(M.slots?.checkPoster);
export const emptyArtUrl = () => textureUrl(M.slots?.emptyArt);
export const posterCropUrl = () => abs(M.slots?.settingsPosterCrop) || abs(M.slots?.settingsPoster);
