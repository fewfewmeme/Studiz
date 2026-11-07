// App icons (apple-touch, PWA, maskable) from the "appIcon" sticker on a deep-navy tile.   node tools/make-icons.mjs [sticker.webp]
import { loadSharp } from './lib-image.mjs';
const sharp = await loadSharp();
const src = process.argv[2] || 'assets/stickers/cat-hehe@2x.webp';
async function icon(size, inner, file, round = 0) {
  const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><defs><radialGradient id="g" cx="30%" cy="20%" r="95%"><stop offset="0" stop-color="#1c4a8f"/><stop offset=".55" stop-color="#0b2a55"/><stop offset="1" stop-color="#00172f"/></radialGradient></defs><rect width="100%" height="100%" rx="${round}" fill="url(#g)"/></svg>`);
  const st = await sharp(src).resize({ width: inner, height: inner, fit: 'inside' }).toBuffer();
  await sharp(bg).composite([{ input: st, gravity: 'centre' }]).png().toFile(file);
}
await icon(180, 134, 'icons/apple-touch-icon.png');
await icon(192, 144, 'icons/icon-192.png', 40);
await icon(512, 384, 'icons/icon-512.png', 110);
await icon(512, 300, 'icons/icon-maskable-512.png');
console.log('icons written');
