// Builds the receipt stamp: a PINK, hand-pressed looking round stamp, divided horizontally into two halves.
//   top half: flower + Japanese ring text;  bottom half: cat with a watering can + French ring text.
// Outputs assets/stamp.svg (vector, ring text converted to outlines, roughness filter inside) and assets/stamp.png (450x450, what the site shows).
//   npm i -D opentype.js @fontsource/noto-sans-jp playwright      (build-time only)
//   node tools/build-stamp.mjs
// The artwork is in tools/stamp-art.mjs (original drawing). Env: OPENTYPE, STAMP_FONT_JP, STAMP_FONT_LATIN override the paths.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { artSvg } from './stamp-art.mjs';
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INK = '#d63a78';                                   // stamp pink
const ot = require(process.env.OPENTYPE || 'opentype.js');
const fdir = path.join(root, 'node_modules/@fontsource/noto-sans-jp/files/');
const load = p => { const b = fs.readFileSync(p); return ot.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); };
const jp = load(process.env.STAMP_FONT_JP || fdir + 'noto-sans-jp-japanese-700-normal.woff');
const lat = load(process.env.STAMP_FONT_LATIN || fdir + 'noto-sans-jp-latin-700-normal.woff');
const f2 = n => (Math.round(n * 100) / 100).toString();
const glyphOf = c => { const g = lat.charToGlyph(c); return g.index ? { g, font: lat } : { g: jp.charToGlyph(c), font: jp }; };

// text on a circle, spread so that it fills `arcDeg` degrees exactly. bottom = reads left->right under the circle, glyph tops inward.
const cache = new Map();
// own path serializer: opentype.js toPathData(2) sometimes prints NaN for the first point
const pathD = p => p.commands.map(c => c.type + ({ M: [c.x, c.y], L: [c.x, c.y], Q: [c.x1, c.y1, c.x, c.y], C: [c.x1, c.y1, c.x2, c.y2, c.x, c.y], Z: [] }[c.type] || []).map(f2).join(' ')).join('');
function ringText(text, r, size, arcDeg, bottom) {
  const chars = [...text], gl = chars.map(glyphOf);
  const adv = gl.map(({ g, font }, i) => chars[i] === ' ' ? size * 0.55 : g.advanceWidth * size / font.unitsPerEm);
  const total = adv.reduce((a, b) => a + b, 0), arc = r * arcDeg * Math.PI / 180;
  const gap = (arc - total) / (chars.length - 1);
  if (gap < 0) throw new Error('ring text too long: ' + text);
  let s = 0, out = '';
  chars.forEach((c, i) => {
    const mid = s + adv[i] / 2, a = (mid - arc / 2) / r;
    const phi = bottom ? Math.PI / 2 - a : -Math.PI / 2 + a;
    const x = 200 + r * Math.cos(phi), y = 200 + r * Math.sin(phi), rot = (bottom ? phi - Math.PI / 2 : phi + Math.PI / 2) * 180 / Math.PI;
    const { g, font } = gl[i];
    if (!g.index) throw new Error('no glyph for ' + c);
    const key = c + size; if (!cache.has(key)) cache.set(key, pathD(g.getPath(0, 0, size)));   // (opentype.js returns NaN on a repeated getPath of the same glyph)
    const d = cache.get(key);
    if (d.includes('NaN')) throw new Error('NaN in glyph ' + c);
    if (d && c !== ' ') out += `<path transform="translate(${f2(x)} ${f2(y)}) rotate(${f2(rot)}) translate(${f2(-adv[i] / 2)} 0)" d="${d}"/>`;
    s += adv[i] + gap;
  });
  return out;
}
const TOP = ringText('リズ・よくべんきょうしました・はなまる', 157, 20, 150, false);     // "Liz studied well · gold star"
const BOT = ringText('LIZ A BIEN APPRIS · CONFIRMÉ PAR CLAUDE', 179, 17.5, 150, true);
// the filter: wobbly line, rough edge, uneven ink with speckles where the rubber did not press
const filter = `<filter id="press" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
<feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="2" seed="11" result="w1"/>
<feDisplacementMap in="SourceGraphic" in2="w1" scale="8" xChannelSelector="R" yChannelSelector="G" result="d1"/>
<feTurbulence type="fractalNoise" baseFrequency="0.45" numOctaves="3" seed="4" result="w2"/>
<feDisplacementMap in="d1" in2="w2" scale="4.2" xChannelSelector="G" yChannelSelector="B" result="d2"/>
<feTurbulence type="fractalNoise" baseFrequency="0.011 0.014" numOctaves="3" seed="23" result="dens"/>
<feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="8" result="grain"/>
<feComposite in="grain" in2="dens" operator="arithmetic" k1="0" k2="0.3" k3="0.7" result="mix"/>
<feColorMatrix in="mix" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -8 0 0 0 5.6" result="holes"/>
<feComposite in="d2" in2="holes" operator="in" result="inked"/>
<feGaussianBlur in="inked" stdDeviation="0.9" result="soft"/>
<feGaussianBlur in="inked" stdDeviation="2.6" result="bleed"/>
<feComponentTransfer in="bleed" result="bleedA"><feFuncA type="linear" slope="0.55"/></feComponentTransfer>
<feMerge result="body"><feMergeNode in="bleedA"/><feMergeNode in="soft"/></feMerge>
<feColorMatrix in="dens" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 -1.1 0 1.45" result="light"/>
<feComposite in="body" in2="light" operator="in"/>
</filter>`;
const ringStroke = `fill="none" stroke="${INK}"`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
<defs>${filter}</defs>
<g filter="url(#press)" transform="rotate(-2.5 200 200)">
<g ${ringStroke}><circle cx="200" cy="200" r="191" stroke-width="5.5"/><circle cx="200" cy="200" r="183.5" stroke-width="1.6"/><circle cx="200" cy="200" r="147" stroke-width="2.6"/>
<path d="M53,200 L17,200 M347,200 L383,200" stroke-width="2.2"/><path d="M60,200 H340" stroke-width="1.5" stroke-dasharray="2 6" stroke-linecap="round"/></g>
<g fill="${INK}"><path d="M30,200 l5,-5 l5,5 l-5,5 Z M360,200 l5,-5 l5,5 l-5,5 Z"/>${TOP}${BOT}</g>
${artSvg(INK)}
</g>
</svg>
`;
fs.writeFileSync(path.join(root, 'assets/stamp.svg'), svg);
console.log('assets/stamp.svg', (svg.length / 1024).toFixed(1), 'KB');
// PNG (transparent) from Chromium: what the site shows (the same pixels on every device)
const { chromium } = require('playwright');
const exe = process.env.CHROME || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const b = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {}); const page = await b.newPage({ viewport: { width: 450, height: 450 }, deviceScaleFactor: 1 });
await page.setContent(`<body style="margin:0;background:transparent"><img id=s src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width=450 height=450>`);
await page.waitForFunction(() => document.getElementById('s').complete);
await page.screenshot({ path: path.join(root, 'assets/stamp.png'), omitBackground: true });
await b.close();
console.log('assets/stamp.png', (fs.statSync(path.join(root, 'assets/stamp.png')).size / 1024).toFixed(1), 'KB');
