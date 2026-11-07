// Photo -> cut-out sticker (webp with alpha).
//   node tools/make-sticker.mjs photo.jpg [--name cat] [--outline 8] [--no-outline] [--no-shadow] [--out assets/stickers]
// Background removal: uses @imgly/background-removal-node when it is installed (best result),
// otherwise a corner-colour flood fill with a feathered edge (pure JS). Output: <name>.webp (max 480 px) and <name>@2x.webp.
import fs from 'node:fs';
import path from 'node:path';
import { loadSharp, arg } from './lib-image.mjs';

const input = process.argv[2];
if (!input || input.startsWith('--')) { console.error('Usage: node tools/make-sticker.mjs photo.jpg [--name cat] [--outline 8] [--no-outline] [--no-shadow]'); process.exit(1); }
const sharp = await loadSharp();
const name = arg('name', path.basename(input).replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '-').toLowerCase());
const outline = arg('no-outline', false) ? 0 : Number(arg('outline', 8));
const shadow = !arg('no-shadow', false);
const outDir = arg('out', 'assets/stickers');
fs.mkdirSync(outDir, { recursive: true });

// 1. alpha cut-out -------------------------------------------------------
async function cutWithLibrary(file) {
  try {
    const mod = await import('@imgly/background-removal-node');
    const blob = await mod.removeBackground(file);
    return Buffer.from(await blob.arrayBuffer());
  } catch { return null; }
}
async function cutByFloodFill(file) {
  const { data, info } = await sharp(file).rotate().resize({ width: 900, height: 900, fit: 'inside', withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const px = (x, y) => (y * w + x) * 4;
  // reference colour = median of the four corners (5x5 patches)
  const samples = [];
  for (const [cx, cy] of [[2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3]]) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const i = px(cx + dx, cy + dy); samples.push([data[i], data[i + 1], data[i + 2]]); }
  const med = k => samples.map(s => s[k]).sort((a, b) => a - b)[samples.length >> 1];
  const ref = [med(0), med(1), med(2)];
  const dist = i => Math.hypot(data[i] - ref[0], data[i + 1] - ref[1], data[i + 2] - ref[2]);
  const TH = 46;
  const bg = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) { stack.push([x, 0], [x, h - 1]); }
  for (let y = 0; y < h; y++) { stack.push([0, y], [w - 1, y]); }
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h || bg[y * w + x]) continue;
    if (dist(px(x, y)) > TH) continue;
    bg[y * w + x] = 1;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  const alpha = Buffer.alloc(w * h);
  for (let i = 0; i < w * h; i++) alpha[i] = bg[i] ? 0 : 255;
  // feather the edge
  const softR = await sharp(alpha, { raw: { width: w, height: h, channels: 1 } }).blur(1.6).raw().toBuffer({ resolveWithObject: true });
  const soft = softR.data, sc = softR.info.channels;
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { out[i * 4] = data[i * 4]; out[i * 4 + 1] = data[i * 4 + 1]; out[i * 4 + 2] = data[i * 4 + 2]; out[i * 4 + 3] = soft[i * sc]; }
  return sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}
const ink = arg('ink', false);
async function cutByInk(file) {
  const { inkSticker } = await import('./lib-ink.mjs');
  const { data, info } = await sharp(file).rotate().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const res = inkSticker(data, info.width, info.height, { outline: Number(arg('outline', 8)), close: Number(arg('close', 34)), hull: Number(arg('hull', 0)) });
  return sharp(res.rgba, { raw: { width: res.w, height: res.h, channels: 4 } }).png().toBuffer();
}
let cut = ink ? await cutByInk(input) : await cutWithLibrary(input);
console.log(cut ? 'background removed with @imgly/background-removal-node' : 'background removed with the flood-fill fallback (install @imgly/background-removal-node for better edges)');
if (!cut) cut = await cutByFloodFill(input);

const cOutline = ink ? 0 : outline, cShadow = ink ? false : shadow;   // ink mode already has the die-cut outline and no baked shadow
// 2. trim, cOutline, cShadow, resize ---------------------------------------
async function compose(buf, maxSide) {
  let img = sharp(buf).trim({ threshold: 5 }).ensureAlpha();
  const meta = await img.toBuffer({ resolveWithObject: true });
  const scale = Math.min(1, (maxSide - 2 * (cOutline + (ink ? 2 : 14))) / Math.max(meta.info.width, meta.info.height));
  const base = await sharp(meta.data).resize(Math.max(1, Math.round(meta.info.width * scale)), Math.max(1, Math.round(meta.info.height * scale))).toBuffer({ resolveWithObject: true });
  const pad = Math.round(cOutline * scale + (ink ? 2 : 14));
  const W = base.info.width + pad * 2, H = base.info.height + pad * 2;
  const sub = await sharp(base.data).extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const layers = [];
  const alphaOf = await sharp(sub).extractChannel(3).toBuffer();
  if (cShadow) {
    const sh = await sharp(alphaOf).blur(Math.max(2, 6 * scale)).linear(0.35, 0).toBuffer();
    const shRgba = await sharp({ create: { width: W, height: H, channels: 3, background: { r: 72, g: 44, b: 96 } } }).joinChannel(sh).png().toBuffer();
    layers.push({ input: shRgba, top: Math.round(4 * scale), left: 0 });
  }
  if (cOutline > 0) {
    const grown = await sharp(alphaOf).blur(Math.max(0.5, cOutline * scale * 0.6)).threshold(24).blur(1).toBuffer();
    const white = await sharp({ create: { width: W, height: H, channels: 3, background: { r: 255, g: 255, b: 255 } } }).joinChannel(grown).png().toBuffer();
    layers.push({ input: white, top: 0, left: 0 });
  }
  layers.push({ input: sub, top: 0, left: 0 });
  return sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(layers).webp({ quality: 88, alphaQuality: 92 }).toBuffer();
}
fs.writeFileSync(path.join(outDir, `${name}.webp`), await compose(cut, 480));
fs.writeFileSync(path.join(outDir, `${name}@2x.webp`), await compose(cut, 960));
console.log(`written: ${outDir}/${name}.webp and ${name}@2x.webp`);
console.log(`add to assets/manifest.json:  "stickers": { "${name}": "${outDir}/${name}.webp" }  and use it in "slots" / "decor" lists`);
