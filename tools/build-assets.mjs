// Rebuilds every derivative in assets/ from assets/originals/ (originals are never modified).
//   node tools/build-assets.mjs
// Sticker-type  -> assets/stickers/<name>.webp (+@2x)   (ink mode of make-sticker: flood/closing + rebuilt 8px white die-cut)
// Wallpaper     -> assets/wallpapers/<name>-<w>.webp
// Texture       -> assets/textures/<name>.webp          (+ duotone variant recoloured by CSS filter in the app)
// Poster        -> assets/posters/<name>.webp
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { loadSharp } from './lib-image.mjs';
const sharp = await loadSharp();
const O = 'assets/originals/';
const stick = (name, extra = []) => execFileSync('node', ['tools/make-sticker.mjs', `${O}cat-${name}.jpg`, '--ink', '--name', `cat-${name}`, '--out', 'assets/stickers', ...extra], { stdio: 'ignore' });
stick('hehe', ['--close', '75']); stick('cheeks', ['--close', '55']); stick('sleepy', ['--hull', '1']); stick('limit'); stick('tongue', ['--hull', '1']);
stick('lying'); stick('outline'); stick('scribble');

// chrome star: near-white background becomes transparent with a soft ramp
{
  const { data, info } = await sharp(O + 'ornament-chrome-star.jpg').removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < info.width * info.height; i++) {
    const m = Math.min(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]);
    const a = Math.max(0, Math.min(1, (252 - m) / 22));
    out[i * 4] = data[i * 3]; out[i * 4 + 1] = data[i * 3 + 1]; out[i * 4 + 2] = data[i * 3 + 2]; out[i * 4 + 3] = Math.round(a * 255);
  }
  const png = await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).trim({ threshold: 4 }).png().toBuffer();
  await sharp(png).resize({ width: 640, height: 640, fit: 'inside' }).webp({ quality: 90, alphaQuality: 95 }).toFile('assets/stickers/chrome-star.webp');
  await sharp(png).resize({ width: 192, height: 192, fit: 'inside' }).webp({ quality: 90 }).toFile('assets/stickers/chrome-star-s.webp');
}

// wallpapers (vertical photos; landscape crops use object-position in CSS)
await sharp(O + 'wallpaper-camera.jpg').resize({ width: 1080 }).webp({ quality: 76 }).toFile('assets/wallpapers/camera-1080.webp');
await sharp(O + 'wallpaper-camera.jpg').resize({ width: 540 }).webp({ quality: 72 }).toFile('assets/wallpapers/camera-540.webp');
await sharp(O + 'wallpaper-waterfall.jpg').resize({ width: 736 }).webp({ quality: 78 }).toFile('assets/wallpapers/waterfall-736.webp');
await sharp(O + 'wallpaper-waterfall.jpg').resize({ width: 400 }).webp({ quality: 72 }).toFile('assets/wallpapers/waterfall-400.webp');

// textures (kept light: they sit under fog/veil at low opacity)
await sharp(O + 'texture-eye-wash.jpg').resize({ width: 731 }).webp({ quality: 74 }).toFile('assets/textures/eye-wash.webp');
await sharp(O + 'texture-handshake.jpg').resize({ width: 584 }).webp({ quality: 74 }).toFile('assets/textures/handshake.webp');
await sharp(O + 'texture-cyanotype-flowers.jpg').resize({ width: 735 }).webp({ quality: 76 }).toFile('assets/textures/flowers.webp');
// calm desk behind the reader: the flowers wash, heavily blurred and desaturated
await sharp(O + 'texture-cyanotype-flowers.jpg').resize({ width: 900 }).blur(14).modulate({ saturation: 0.55, brightness: 1.05 }).webp({ quality: 60 }).toFile('assets/textures/desk.webp');
// poster
await sharp(O + 'poster-beach-cat.jpg').resize({ width: 1080 }).webp({ quality: 76 }).toFile('assets/posters/beach-cat.webp');
// ---- batch 2 ----
import { fgFromWhite, components, dieCut, dilate, fillHoles, erode } from './lib-ink.mjs';
const rawOf = async f => { const { data, info } = await sharp(f).removeAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, w: info.width, h: info.height }; };
const writeSticker = async (rgba, w, h, name) => {
  const png = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).trim({ threshold: 4 }).png().toBuffer();
  await sharp(png).resize({ width: 480, height: 480, fit: 'inside' }).webp({ quality: 88, alphaQuality: 92 }).toFile(`assets/stickers/${name}.webp`);
  await sharp(png).resize({ width: 960, height: 960, fit: 'inside', withoutEnlargement: true }).webp({ quality: 88, alphaQuality: 92 }).toFile(`assets/stickers/${name}@2x.webp`);
};
{ // three creatures on one sheet -> three stickers with a rebuilt white die-cut outline
  const { data, w, h } = await rawOf(O + 'stickers-chibi-trio.jpg');
  const fg = fgFromWhite(data, w, h, 236);
  const merged = dilate(fg, w, h, 5);
  const comps = components(merged, w, h).filter(c => c.size > 8000).slice(0, 3).sort((a, b) => a.bbox[0] - b.bbox[0]);
  const names = ['chibi-ink', 'chibi-wolf', 'chibi-ghost'];
  for (const [i, c] of comps.entries()) {
    const own = new Uint8Array(w * h); for (let k = 0; k < w * h; k++) own[k] = c.mask[k] && fg[k] ? 1 : 0;
    const sil = fillHoles(erode(dilate(own, w, h, 3), w, h, 3), w, h);
    await writeSticker(dieCut(data, w, h, sil, 9), w, h, names[i]);
  }
}
for (const [src, name] of [['sticker-star-girl.jpg', 'star-girl'], ['sticker-syringe-cat.jpg', 'syringe-cat']]) { // already die-cut with a light-blue outline: keep it, only remove the background
  const { data, w, h } = await rawOf(O + src);
  const sil = fillHoles(fgFromWhite(data, w, h, 242), w, h);
  await writeSticker(dieCut(data, w, h, sil, 0), w, h, name);
}
// wallpapers: a portrait (9:16) and a landscape (16:10) crop around a focus point; they only sit behind a veil
const crops = async (file, name, fx, fy, title) => {
  const m = await sharp(file).metadata();
  const cropTo = async (ar, out, width) => {
    let cw = m.width, ch = Math.round(cw / ar); if (ch > m.height) { ch = m.height; cw = Math.round(ch * ar); }
    const left = Math.max(0, Math.min(m.width - cw, Math.round(fx * m.width - cw / 2))), top = Math.max(0, Math.min(m.height - ch, Math.round(fy * m.height - ch / 2)));
    await sharp(file).extract({ left, top, width: cw, height: ch }).resize({ width: Math.min(width, cw) }).webp({ quality: 72 }).toFile(out);
  };
  await cropTo(9 / 16, `assets/wallpapers/${name}-p.webp`, 900); await cropTo(16 / 10, `assets/wallpapers/${name}-l.webp`, 1600);
};
await crops(O + 'texture-swirls.jpg', 'fog', 0.5, 0.5); await crops(O + 'texture-coral.jpg', 'coral', 0.55, 0.5);
await crops(O + 'wallpaper-portrait-girl.jpg', 'portrait', 0.5, 0.45); await crops(O + 'wallpaper-child-blue.jpg', 'child', 0.5, 0.5); await crops(O + 'texture-sparkles.jpg', 'sparkles', 0.5, 0.5);
// textures
await sharp(O + 'texture-swirls.jpg').resize({ width: 1000 }).webp({ quality: 72 }).toFile('assets/textures/swirls.webp');
await sharp(O + 'texture-coral.jpg').resize({ width: 1000 }).webp({ quality: 72 }).toFile('assets/textures/coral.webp');
await sharp(O + 'texture-sparkles.jpg').resize({ width: 900 }).webp({ quality: 70 }).toFile('assets/textures/sparkles.webp');
await sharp(O + 'poster-constellation.jpg').extract({ left: 0, top: 600, width: 1000, height: 600 }).resize({ width: 900 }).webp({ quality: 74 }).toFile('assets/textures/window.webp');   // night window + stars (the typography is in the upper half)
// posters: crops that leave the poster text out of focus
await sharp(O + 'poster-jellyfish.jpg').webp({ quality: 82 }).toFile('assets/posters/jellyfish-full.webp');   // the whole poster: phone wallpaper + Settings panel
await sharp(O + 'poster-jellyfish.jpg').extract({ left: 300, top: 60, width: 435, height: 560 }).resize({ width: 1200 }).webp({ quality: 74 }).toFile('assets/wallpapers/jellyfish-l.webp');
await sharp(O + 'poster-jellyfish.jpg').extract({ left: 330, top: 120, width: 405, height: 640 }).resize({ width: 800 }).webp({ quality: 76 }).toFile('assets/posters/jellyfish.webp');
await sharp(O + 'poster-constellation.jpg').extract({ left: 0, top: 80, width: 1000, height: 480 }).resize({ width: 1000 }).webp({ quality: 74 }).toFile('assets/posters/constellation.webp');   // the stars and lines without the handwritten word
await sharp(O + 'illustration-cat-circle.jpg').resize({ width: 900 }).webp({ quality: 74 }).toFile('assets/textures/cat-circle.webp');
console.log(fs.readdirSync('assets/stickers').filter(f => f.startsWith('cat-') || f.startsWith('chrome')).join(' '));
