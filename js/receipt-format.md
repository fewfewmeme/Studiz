# Receipt format (top part) — pixel reference for Уголок Лиз

Everything below is what `styles/receipt.css` and `js/receipt-ui.js` of the library site use. Draw the top part with the same numbers and it matches pixel for pixel.
The data comes from `receipt-core.js` (`decodeReceipt(code)`), the layout from the list at the end.

## Paper
| What | Value |
|---|---|
| Width | **326 px** (`box-sizing: border-box`), height follows the content |
| Padding | top 18 px, sides 20 px, bottom 12 px → text column 286 px |
| Paper colour | `#fffefb` |
| Ink colour | `#1b1b1b` |
| Secondary ink | `#55504a` (reward line under a row, footer), `#6b665f` (muted lines) |
| Corner radius | 6 px on the top corners; the bottom edge of the top part is the (torn) tear edge, straight in the archive view |
| Shadow of the sheet | `0 2px 0 rgba(0,0,0,.06), 0 16px 30px -20px rgba(0,0,0,.4)` |

## Type
| What | Value |
|---|---|
| Font | `ui-monospace, "SF Mono", Menlo, Consolas, "Courier New", monospace` |
| Size / line height | **14 px / 20 px** (muted lines 12.5 px / 18 px) |
| Bold | weight 800 (title, section headings, ИТОГО row) |
| Title | `ЧЕК УЧЁБЫ · БИБЛИОТЕКА КОНСПЕКТОВ`, centred, bold, `letter-spacing: .02em` |
| Rows | flex, `justify-content: space-between`, gap 10 px; the right value never wraps |
| Emoji | 🐟 and 🦐 in the text, one space after the emoji, two spaces between the pair |

## Separators
* Ordinary separator: `border-top: 1px dotted #1b1b1b`, margin 8 px 0.
* **Tear line** (different on purpose): height 2 px, `repeating-linear-gradient(90deg, #1b1b1b 0 10px, transparent 10px 16px)` → dash 10 px, gap 6 px; scissors `✂` (15 px) at the left end, 4 px from the edge, 11 px above the line, on a paper-coloured backing with 3 px side padding.

## Zigzag (bottom edge of the BOTTOM part)
Teeth point DOWN. Tooth width ≈ 12 px (`teeth = round(width / 12)`), depth **8 px**. `zigzagClip(teeth, 8)` in `receipt-core.js` returns the `clip-path`.

## Stamp
Circle, diameter = **0.46 × paper width** (150 px on 326 px), centred on the tear line; centre x = `sx × width`, clamped to `[R, W − R]`. The top half belongs to the top part (flower), the bottom half to the bottom part (cat).

## Rows of the top part (in order)
1. Title.
2. `Дата: 6 ноября 2026 г.` (or `6–7 ноября 2026 г.` when `d1 ≠ d2`; `dateRangeRu(d1, d2)`), centred.
3. Dotted separator.
4. `МИНУТЫ ПО ПРЕДМЕТАМ` (bold), then one row per subject with minutes > 0 in this order: `an pa bx gi mi st fi fz` → `Анатомия … 45 мин`. Empty → muted `пока нет`.
5. If `ex > 0`: row `Из них к экзамену:` / `N мин`, under it a muted line with the exam subjects (`exs`).
6. Dotted separator.
7. Row `Общее время` / `minutesText(g)`; right-aligned secondary line `🐟 floor(g/5)  🦐 floor(g/10)` (`—` when both are 0).
8. If `b5 > 0`: row `Блоки по 5 мин` / `× b5`, secondary line `🐟 b5`.
9. If `b10 > 0`: row `Блоки по 10 мин` / `× b10`, secondary line `🐟 2·b10  🦐 b10`.
10. Dotted separator.
11. Bold row `ИТОГО  <minutesText(g + 5·b5 + 10·b10)>` / `🐟 f  🦐 sh`.
12. (Library site only, at tear time) dotted separator, `ВСЕГО ЗА ВСЁ ВРЕМЯ`, rows Минут / Дней с учёбой / Блоков / 🐟 Рыбок / 🦐 Креветок.
13. Footer: `1 🐟 = 5 мин · 1 🦐 = 10 мин`, centred, 12.5 px, secondary ink.

`minutesText(210) = "3 ч 30 мин"`, `minutesText(45) = "45 мин"`, `minutesText(60) = "1 ч"`.

## Code
`LIZ1.<base64url(JSON)>.<fnv1a hex>` — `decodeReceipt` checks format, checksum, field ranges and that `f` / `sh` equal `rewards(g, b5, b10)`.
