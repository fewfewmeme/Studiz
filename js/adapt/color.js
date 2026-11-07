// Colour helpers: parsing, WCAG contrast and OKLCH re-lightening (semantic colours keep their hue and are darkened until readable).
const NAMED = { black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00', orange: '#ffa500', purple: '#800080', pink: '#ffc0cb', gray: '#808080', grey: '#808080', silver: '#c0c0c0', navy: '#000080', teal: '#008080', maroon: '#800000', lime: '#00ff00', aqua: '#00ffff', fuchsia: '#ff00ff', olive: '#808000', brown: '#a52a2a', transparent: 'rgba(0,0,0,0)' };
export function parseColor(v) {
  if (!v) return null;
  v = String(v).trim().toLowerCase();
  if (NAMED[v]) v = NAMED[v];
  let m = /^#([0-9a-f]{3,8})$/.exec(v);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map(c => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1];
  }
  m = /^rgba?\(\s*([\d.]+)(%?)[\s,]+([\d.]+)(%?)[\s,]+([\d.]+)(%?)(?:[\s,/]+([\d.]+)(%?))?\s*\)$/.exec(v);
  if (m) { const f = (x, p) => (p ? Math.round(+x * 2.55) : +x); return [f(m[1], m[2]), f(m[3], m[4]), f(m[5], m[6]), m[7] != null ? (m[8] ? +m[7] / 100 : +m[7]) : 1]; }
  m = /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:[\s,/]+([\d.]+)(%?))?\s*\)$/.exec(v);
  if (m) { const [r, g, b] = hsl2rgb(+m[1], +m[2] / 100, +m[3] / 100); return [r, g, b, m[4] != null ? (m[5] ? +m[4] / 100 : +m[4]) : 1]; }
  return null;
}
function hsl2rgb(h, s, l) { h = ((h % 360) + 360) % 360 / 360; if (!s) { const v = Math.round(l * 255); return [v, v, v]; } const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; const f = t => { t = (t + 1) % 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < .5) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; }; return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)]; }
export const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
export const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
export const hex = ([r, g, b]) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
// sRGB <-> OKLab/OKLCH
const toLin = v => { v /= 255; return v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
const fromLin = v => 255 * (v <= .0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - .055);
export function toOklch([r, g, b]) {
  const R = toLin(r), G = toLin(g), B = toLin(b);
  const l = Math.cbrt(.4122214708 * R + .5363325363 * G + .0514459929 * B), m = Math.cbrt(.2119034982 * R + .6806995451 * G + .1073969566 * B), s = Math.cbrt(.0883024619 * R + .2817188376 * G + .6299787005 * B);
  const L = .2104542553 * l + .793617785 * m - .0040720468 * s, A = 1.9779984951 * l - 2.428592205 * m + .4505937099 * s, Bb = .0259040371 * l + .7827717662 * m - .808675766 * s;
  return [L, Math.hypot(A, Bb), (Math.atan2(Bb, A) * 180 / Math.PI + 360) % 360];
}
export function fromOklch([L, C, H]) {
  const a = C * Math.cos(H * Math.PI / 180), b = C * Math.sin(H * Math.PI / 180);
  const l = Math.pow(L + .3963377774 * a + .2158037573 * b, 3), m = Math.pow(L - .1055613458 * a - .0638541728 * b, 3), s = Math.pow(L - .0894841775 * a - 1.291485548 * b, 3);
  const cl = v => Math.max(0, Math.min(1, v));
  return [fromLin(cl(4.0767416621 * l - 3.3077115913 * m + .2309699292 * s)), fromLin(cl(-1.2684380046 * l + 2.6097574011 * m - .3413193965 * s)), fromLin(cl(-.0041960863 * l - .7034186147 * m + 1.707614701 * s))];
}
// keep the hue, lower the lightness until the colour reads on `bg` (>= min)
export function fixContrast(rgb, bg, min = 4.5) {
  if (contrast(rgb, bg) >= min) return rgb;
  const [L, C, H] = toOklch(rgb);
  const dark = lum(bg) > .4;
  for (let i = 1; i <= 60; i++) {
    const L2 = dark ? L - i * 0.012 : L + i * 0.012;
    const out = fromOklch([Math.max(0, Math.min(1, L2)), C, H]);
    if (contrast(out, bg) >= min) return out.map(Math.round);
  }
  return dark ? [20, 28, 46] : [240, 244, 250];
}
