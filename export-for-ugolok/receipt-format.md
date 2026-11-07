# Receipt format — TOP PART (measured on the real site, for «Уголок Лиз»)

Everything below was **measured** on the running site (Playwright/Chromium, computed styles of the real Archive card) and read from `styles/receipt.css`, `js/receipt-ui.js`, `js/receipt-core.js`, `js/views/archive.js`. Numbers are CSS px.
The code in `receipt-render.html` is the reference implementation (it reproduces the site's card with a pixel difference of 0.0% of pixels over 16/255 levels at iPad landscape, see §12).
Fonts: the receipt uses **system fonts only** (no web font, no @font-face), so there is no `receipt-font.css`. Fish and shrimp are **emoji characters**, not images.

## 0. Important: two looks of the same card (a site quirk, not changed)
The receipt is designed as a monospace paper (`.rc` wrapper: `ui-monospace…`, 14px/20px, ink `#1b1b1b`) — that is how the live «Чек» page draws it.
**The Archive and Days cards are not wrapped in `.rc`**, so today they inherit the page font instead: Manrope 15px / 22.5px, ink `#0f1f38` (measured: `.rc-title` → `Manrope, -apple-system, BlinkMacSystemFo…`, `15px`, `22.5px`, `rgb(15, 31, 56)`; the card is then 447px tall instead of 413px).
`receipt-render.html` draws the **intended monospace look** by default (`const USE_RC_WRAPPER = true`); set it to `false` to reproduce what the Archive prints today (it then also needs the Manrope web font, which is not embedded).

## 1. Paper (top part)
| | iPad landscape (1180×820 @2x) | iPhone portrait (390×844 @3x) |
|---|---|---|
| `.rc-sheet` width × height | 326 × 413 (sample receipt, with exam block) | 326 × 413 |
| `.rc-paper` padding (top / right / bottom / left) | 18px / 20px / 0px / 20px | 18px / 20px / 0px / 20px |
| text column | 286 | 286 |
Width rule: `width: 326px; max-width: 100%` (it only shrinks if the container is narrower than 326px, e.g. a 320px phone). Height follows the content (the lifetime block «ВСЕГО ЗА ВСЁ ВРЕМЯ» is **not** in the code, so a code-only render has none).
- paper colour `rgb(255, 254, 251)` = `#fffefb`, flat (no texture, no gradient, no border)
- border radius `6px 6px 0px 0px` (top corners only; the bottom edge is the torn edge, §8)
- `.rc-sheet` (wrapper of the piece) box-shadow: `rgba(0, 0, 0, 0.06) 0px 2px 0px 0px, rgba(0, 0, 0, 0.4) 0px 16px 30px -20px` = `0 2px 0 rgba(0,0,0,.06), 0 16px 30px -20px rgba(0,0,0,.4)`, radius `6px 6px 0 0`
- `.rc-paper{position:relative; overflow:hidden}` (this is what cuts the stamp in half, §10)
- global rules the receipt relies on (from `styles/base.css`): `*{box-sizing:border-box}`, `html{text-size-adjust:100%}`, `body{font-weight:500; -webkit-font-smoothing:antialiased; font-variant-numeric:tabular-nums}`

## 2. Text styles (measured, inside `.rc`)
Font family for every style: `ui-monospace, "SF Mono", Menlo, Consolas, "Courier New", monospace` — on iPad this resolves to **SF Mono**. Base weight is **500** (inherited from `<body>`).
| style | size | weight | line-height | letter-spacing | colour | align | margin top / bottom |
|---|---|---|---|---|---|---|---|
| title `.rc-title` | `14px` | `800` | `20px` | `0.28px` | `rgb(27, 27, 27)` | center | `0px / 0px` |
| date `.rc-date` (subtitle) | `14px` | `500` | `20px` | `normal` | `rgb(27, 27, 27)` | center | `0px / 0px` |
| section header `.rc-h` | `14px` | `800` | `20px` | `normal` | `rgb(27, 27, 27)` | start | `2px / 0px` |
| row `.rc-row` (label + value) | `14px` | `500` | `20px` | `normal` | `rgb(27, 27, 27)` | start | `0px / 0px` |
| bold row `.rc-row.rc-bold` (ИТОГО) | `14px` | `800` | `20px` | `normal` | `rgb(27, 27, 27)` | start | `0px / 0px` |
| reward line under a row `.rc-sub` | `14px` | `500` | `20px` | `normal` | `rgb(85, 80, 74)` | right | `0px / 0px` |
| muted line `.rc-muted` («пока нет», exam subjects) | `12.5px` | `500` | `18px` | `normal` | `rgb(107, 102, 95)` | start | `0px / 0px` |
| exam block `.rc-exam` | `14px` | `500` | `20px` | `normal` | `rgb(27, 27, 27)` | start | `2px / 0px` |
| footer note `.rc-foot` | `12.5px` | `500` | `20px` | `normal` | `rgb(85, 80, 74)` | center | `8px / 16px` |
The title is 2 lines (wraps at 286px). `.rc-sub` is right-aligned with `min-height:20px`. `.rc-muted` is 12.5px/18px; `.rc-foot` is 12.5px (line-height inherits 20px).

## 3. Separators
Normal separator `.rc-sep`: `border-top: 1px dotted #1b1b1b; margin: 8px 0; height: 0` (measured `1px dotted rgb(27, 27, 27)`, margins 8px/8px, 286px wide). Dotted = the browser's dotted border (1px dots, 1px gaps at 1x).

## 4. Row layout
`.rc-row { display:flex; justify-content:space-between; gap:10px }` (measured `flex`, `space-between`, gap `10px`); left span `min-width:0`; right span `white-space:nowrap; text-align:right`. **No leader dots.** Long labels wrap, the value never wraps.
Number formatting: `minutesText(min)` — `210 → "3 ч 30 мин"`, `60 → "1 ч"`, `45 → "45 мин"`, `0 → "0 мин"`; subject rows are `"<N> мин"`; blocks are `"× <N>"`; rewards are `"🐟 7  🦐 3"` (emoji, one space, **two** spaces between the pair).
Zero rows are hidden: a subject row appears only if `s[k] > 0`; if there is none, one muted line `пока нет`; the exam block only if `ex > 0`; «Блоки по 5 мин» only if `b5 > 0`; «Блоки по 10 мин» only if `b10 > 0`; the reward line prints `—` when fish and shrimp are both 0; inside a reward line a zero part is omitted (`🐟 2` alone for the 5-min blocks).
Subject order (fixed): `an pa bx gi mi st fi fz` = Анатомия, Патанатомия, Биохимия, Гистология, Микробиология, Стоматология, Философия, Физиология.

## 5. Lines of the top part, in order (exact Russian text)
1. `ЧЕК УЧЁБЫ · БИБЛИОТЕКА КОНСПЕКТОВ` (bold, centred, letter-spacing .02em)
2. `Дата: <dateRangeRu(d1, d2)>` — `Дата: 6 ноября 2026 г.` or `Дата: 6–7 ноября 2026 г.` (`31 октября – 2 ноября 2026 г.` across months)
3. separator
4. `МИНУТЫ ПО ПРЕДМЕТАМ` (bold), then one row per subject `Анатомия … 40 мин`, or the muted line `пока нет`
5. only if `ex > 0`: row `Из них к экзамену:` … `30 мин`, under it a muted line with the exam subjects joined by `, ` (`Анатомия`)
6. separator
7. row `Общее время` … `35 мин`, then right-aligned `🐟 7  🦐 3` (or `—`)
8. only if `b5 > 0`: row `Блоки по 5 мин` … `× 2`, then `🐟 2`
9. only if `b10 > 0`: row `Блоки по 10 мин` … `× 1`, then `🐟 2  🦐 1`
10. separator
11. bold row `ИТОГО  <minutesText(g + 5·b5 + 10·b10)>` (two spaces) … `🐟 11  🦐 4` (or `—`)
12. *(only when the archive record carries `life`, never derivable from the code)* separator, `ВСЕГО ЗА ВСЁ ВРЕМЯ` (bold), rows `Минут`, `Дней с учёбой`, `Блоков`, `🐟 Рыбок`, `🦐 Креветок`
13. footer note `1 🐟 = 5 мин · 1 🦐 = 10 мин` (centred, 12.5px, colour `#55504a`)
Rewards: fish = `floor(g/5) + b5 + 2·b10`, shrimp = `floor(g/10) + b10`. The code is invalid if `f`/`sh` differ from this.

## 6. Fish and shrimp
Emoji characters `🐟` (U+1F41F) and `🦐` (U+1F990) in the text, rendered by the system emoji font (Apple Color Emoji on iPad). No images, no SVG.

## 7. Tear line (live «Чек» page only — it is not part of the archived top part)
```html
<div class="rc-tear" aria-hidden="true"><span class="rc-scissors">✂</span></div>
```
`.rc-tear { position:relative; height:2px; margin:0; background:repeating-linear-gradient(90deg, #1b1b1b 0 10px, transparent 10px 16px) }` → **dash 10px, gap 6px, thickness 2px, colour #1b1b1b**, 286px wide (measured 286×2).
`.rc-scissors { position:absolute; left:4px; top:-11px; font-size:15px; line-height:20px; background:#fffefb; padding:0 3px }` — the `✂` glyph sits 4px from the left, 11px above the line, on a paper-coloured backing (measured box 15.03×20).

## 8. Torn bottom edge of the archived top part
Applied once after layout as `clip-path` on `.rc-piece.top` (the wrapper of `.rc-paper`), at the piece's real height `H = piece.offsetHeight`:
`piece.style.clipPath = tearPolygon('bottom', PAPER_W, H, jagged(Math.round(PAPER_W / 6), seeded(payload.id)), 0, PAPER_W)`
Parameters: `PAPER_W = 326`, **54 points** (`round(326/6)`), spacing `326/53 = 6.15px`, notch depth **0 … 2.4px inward** (uniform random, 2 decimals), the whole width is torn (`a=0, b=326`). The random rule is a seeded LCG keyed by the receipt id, so a given receipt always has the same edge:
```js
// jagged torn edge. pts[i] = inward notch (0..2.4 px) at x = i * step. interval [a, b] in px is the torn part.
export function jagged(n, rnd = Math.random) { return Array.from({ length: n }, () => +(rnd() * 2.4).toFixed(2)); }
export function tearPolygon(edge, W, H, jag, a, b) {
  const step = W / (jag.length - 1), pts = [];
  const lo = Math.min(a, b), hi = Math.max(a, b);
  const y = x => (x >= lo && x <= hi ? jag[Math.min(jag.length - 1, Math.round(x / step))] : 0);
  if (edge === 'bottom') {      // top piece: its bottom edge, right -> left
    pts.push('0px 0px', `${W}px 0px`, `${W}px ${H}px`);
    for (let i = jag.length - 1; i >= 0; i--) { const x = i * step; pts.push(`${x.toFixed(1)}px ${(H - y(x)).toFixed(1)}px`); }
  } else {                      // bottom piece: its top edge (left -> right), then the zigzag bottom edge (right -> left)
    for (let i = 0; i < jag.length; i++) { const x = i * step; pts.push(`${x.toFixed(1)}px ${y(x).toFixed(1)}px`); }
    const teeth = Math.max(8, Math.round(W / TOOTH_W)), tw = W / teeth;
    pts.push(`${W}px ${(H - TOOTH_D).toFixed(1)}px`);
    for (let i = teeth; i >= 1; i--) { pts.push(`${((i - 0.5) * tw).toFixed(1)}px ${H}px`); pts.push(`${((i - 1) * tw).toFixed(1)}px ${(H - TOOTH_D).toFixed(1)}px`); }
  }
  return `polygon(${pts.join(',')})`;
}

function seeded(id) { let s = 0; for (const c of id) s = (s * 31 + c.charCodeAt(0)) >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
```
The polygon starts `0 0, 326 0, 326 H`, then walks the bottom edge right → left: `x = i·step`, `y = H − notch[i]`.

## 9. Zigzag clip-path of the bottom part (stub)
Teeth point down; tooth width ≈ 12px, depth 8px; `teeth = max(8, round(W/12))` (= 27 for W = 326, tooth width 12.07px). The stub is clipped with `tearPolygon('top', W, H, jag, a, b)` (its top edge is torn, its bottom edge is the zigzag below); `zigzagClip` is the plain helper:
```js
export const TOOTH_W = 12, TOOTH_D = 8;
// the zigzag bottom edge of the bottom part: tooth count follows the real width
export function applyZigzag(el, width = PAPER_W) { el.style.clipPath = zigzagClip(Math.max(8, Math.round(width / TOOTH_W)), TOOTH_D); }

// Bottom edge of the receipt: small triangles pointing DOWN. Use as clip-path on the bottom piece; teeth = round(width / 12).
export function zigzagClip(teeth = 28, depthPx = 8) {
  const p = ['0% 0%', '100% 0%', `100% calc(100% - ${depthPx}px)`];
  for (let i = teeth; i >= 1; i--) {
    p.push(`${((i - 0.5) / teeth) * 100}% 100%`);                       // tip
    p.push(`${((i - 1) / teeth) * 100}% calc(100% - ${depthPx}px)`);    // valley
  }
  return `polygon(${p.join(',')})`;
}

```
Inside `tearPolygon(edge !== 'bottom', …)` the same zigzag is written in px (tip at `(i-0.5)*tw, H`, valley at `(i-1)*tw, H-8`).

## 10. Stamp — upper half on the top part
```js
export const PAPER_W = 326, STAMP_RATIO = 0.46;
// one half of the stamp. half = 'top' (flower) | 'bottom' (cat). The piece must be position:relative; overflow:hidden.
export function stampHalf(half, sx, width = PAPER_W) {
  const d = Math.round(width * STAMP_RATIO), R = d / 2;
  const x = Math.min(Math.max(sx * width, R), width - R);
  const img = h('img', { class: 'rc-stamp-img', src: STAMP_SRC, alt: '', draggable: 'false', width: d, height: d });
  img.style.cssText = `left:${(x - R).toFixed(1)}px;${half === 'top' ? `bottom:${-R}px` : `top:${-R}px`}`;
  return img;
}
```
- diameter `d = round(326 × 0.46) = 150px` (image 450×450 px PNG, displayed at 150×150)
- x: centre = `sx × 326` clamped to `[R, 326 − R]` (R = 75) → CSS `left = x − R`; for `sx = 0.5`: `left: 88px` (measured `left: 88px; bottom: -75px;`)
- y: `bottom: −R` = `−75px` — the stamp's **centre lies exactly on the paper's bottom edge** (where the tear line was); `.rc-paper{overflow:hidden}` cuts away the lower half, so only the **upper half (flower, Japanese ring text)** is visible. The lower half (cat, French text) is drawn the same way on the stub (`top: −R`).
- `.rc-stamp-img { position:absolute; z-index:3; pointer-events:none; user-select:none }`; it is appended as the **last child** of `.rc-paper` and overlaps the last rows (the footer note) — as on the site.
- the picture itself: `stamp.png` (pink ink, soft edges, baked −2.5° tilt); `stamp.svg` is the vector source (text as outlines + SVG roughness filter); `stamp-top.svg` / `stamp-bottom.svg` embed the PNG clipped to y 0…200 / 200…400 of the 400×400 viewBox. The divider line of the stamp is at y = 200 (that is why no art offset is needed: **artOffsetY = 0**).

## 11. Ink animation
None. The stamp has no appearance animation or ink effect in the receipt (only a `drop-shadow` while it is being dragged on the live «Чек» page, which does not apply to the archive).

## 12. Verification of this spec
`receipt-render.html` was compared with the site's own card (same payload, same viewport, both pinned to (0,0), white page, Chromium; WebKit could not be installed in the sandbox):
| viewport | image px | pixels differing at all | differing by > 16/255 | > 48/255 | mean abs. diff |
|---|---|---|---|---|---|
| iPad landscape @2x | 652×826 | 3.462% | 0.0% | 0.0% | 0.121 |
| iPhone portrait @3x | 978×1239 | 3.306% | 0.002% | 0.0% | 0.183 |
The tiny remainder is the stamp: the export embeds a 64-colour copy of `assets/stamp.png` (49 KB instead of 286 KB).

## 13. The CSS rules (verbatim from `styles/receipt.css`)
```css
.rc { position: relative; width: 326px; max-width: 100%; flex: none; font-family: ui-monospace, "SF Mono", Menlo, Consolas, "Courier New", monospace; font-size: 14px; line-height: 20px; color: #1b1b1b; touch-action: pan-y; }
.rc-paper { position: relative; overflow: hidden; background: #fffefb; padding: 18px 20px 12px; }
.rc-top { border-radius: 6px 6px 0 0; padding-bottom: 0; }
.rc-title { font-weight: 800; text-align: center; letter-spacing: .02em; }
.rc-date { text-align: center; }
.rc-h { font-weight: 800; margin-top: 2px; }
.rc-row { display: flex; justify-content: space-between; gap: 10px; }
.rc-row .rc-l { min-width: 0; } .rc-row .rc-r { white-space: nowrap; text-align: right; }
.rc-sub { text-align: right; color: #55504a; min-height: 20px; }
.rc-muted { color: #6b665f; font-size: 12.5px; line-height: 18px; }
.rc-bold { font-weight: 800; }
.rc-exam { margin-top: 2px; }
.rc-foot { text-align: center; margin: 8px 0 16px; font-size: 12.5px; color: #55504a; }
.rc-sep { border-top: 1px dotted #1b1b1b; margin: 8px 0; height: 0; }
.rc-tear { position: relative; height: 2px; margin: 0; background: repeating-linear-gradient(90deg, #1b1b1b 0 10px, transparent 10px 16px); }
.rc-scissors { position: absolute; left: 4px; top: -11px; font-size: 15px; line-height: 20px; background: #fffefb; padding: 0 3px; }
.rc-piece { position: relative; }
.rc-piece.top { z-index: 2; box-shadow: none; }
.rc-piece.bottom { z-index: 1; margin-top: 0; }
.rc-sheet { position: relative; box-shadow: 0 2px 0 rgba(0, 0, 0, .06), 0 16px 30px -20px rgba(0, 0, 0, .4); border-radius: 6px 6px 0 0; }
.rc-stamp-img { position: absolute; z-index: 3; pointer-events: none; user-select: none; -webkit-user-select: none; }
.rc-banner { display: flex; flex-wrap: wrap; gap: var(--s2) var(--s3); align-items: center; padding: var(--s3) var(--s4); border-radius: var(--r-m); background: var(--panel-solid); border: 1px solid var(--line); margin-bottom: var(--s3); }
.rc-banner[hidden] { display: none; }
.rc-item { display: flex; flex-direction: column; gap: var(--s2); align-items: center; width: 326px; max-width: 100%; }
.rc-item .actions { display: flex; flex-wrap: wrap; gap: var(--s2); justify-content: center; }
```
