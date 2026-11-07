// Photo -> app wallpaper: 2560 + 1280 px webp, a tiny blurred placeholder and an automatic veil strength so text stays readable.
//   node tools/make-wallpaper.mjs photo.jpg [--name sea] [--ink "#26212b"] [--out assets/wallpapers]
// Wallpapers are used ONLY behind translucent panels, never behind reading text. The veil makes the darkest 10% of the photo
// light enough that the panel ink keeps a contrast of at least 4.5:1.
import fs from 'node:fs';
import path from 'node:path';
import { loadSharp, arg, parseHex, contrast } from './lib-image.mjs';

const input = process.argv[2];
if (!input || input.startsWith('--')) { console.error('Usage: node tools/make-wallpaper.mjs photo.jpg [--name sea] [--ink "#26212b"]'); process.exit(1); }
const sharp = await loadSharp();
const name = arg('name', path.basename(input).replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '-').toLowerCase());
const ink = parseHex(arg('ink', '#26212b'));
const outDir = arg('out', 'assets/wallpapers');
fs.mkdirSync(outDir, { recursive: true });

const src = sharp(input).rotate();
await src.clone().resize({ width: 2560, height: 1600, fit: 'cover' }).webp({ quality: 80 }).toFile(path.join(outDir, `${name}-2560.webp`));
await src.clone().resize({ width: 1280, height: 800, fit: 'cover' }).webp({ quality: 78 }).toFile(path.join(outDir, `${name}-1280.webp`));
const tiny = await src.clone().resize(24, 15, { fit: 'cover' }).blur(1).webp({ quality: 50 }).toBuffer();

// darkest-decile colour of the photo
const { data } = await src.clone().resize(64, 40, { fit: 'cover' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const px = []; for (let i = 0; i < data.length; i += 3) px.push([data[i], data[i + 1], data[i + 2]]);
const lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
px.sort((a, b) => lum(a) - lum(b));
const dark = px[Math.floor(px.length * 0.1)];
let veil = 0;
for (; veil <= 0.95; veil += 0.05) {
  const blended = dark.map(v => v * (1 - veil) + 255 * veil);
  if (contrast(ink, blended) >= 4.5) break;
}
veil = Math.min(0.95, Math.round(veil * 100) / 100);
const info = { name, files: { 2560: `${outDir}/${name}-2560.webp`, 1280: `${outDir}/${name}-1280.webp` }, placeholder: 'data:image/webp;base64,' + tiny.toString('base64'), veil, inkContrastAfterVeil: Math.round(contrast(ink, dark.map(v => v * (1 - veil) + 255 * veil)) * 10) / 10 };
fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(info, null, 2));
console.log(`written ${outDir}/${name}-2560.webp, ${name}-1280.webp, ${name}.json`);
console.log(`veil strength: ${veil} (contrast of the panel ink on the darkest part: ${info.inkContrastAfterVeil}:1)`);
console.log(`add to assets/manifest.json:  "wallpapers": { "<theme>": "${outDir}/${name}-1280.webp" }  and put  --veil: rgba(255,255,255,${veil})  into the theme file`);
