# Audit, round 3

Before-screenshots (round-2 build, WebKit-sized Chromium viewports 1180×740 and 820×1100): `qa/before3/`.
After: `qa/after3/`. Root causes were found by measuring, not guessing.

## A. What looked amateur
| Finding | Cause | Fix |
|---|---|---|
| Pink pill buttons with glow, pink backup banner | gradient/glow tokens in every theme | solid deep-ink primary button, white-glass secondary, 1 shadow; slim neutral notice |
| Clip-art cloud/moon/star stickers, floating decorations, splash with flying figures | `decor()` layer + keyframes (float / swing / drift) | all removed; static die-cut stickers from the user's drawings, photos melted in with mask + fog; **no infinite animation exists** (test) |
| Empty hero cards with one decoration | decoration instead of imagery | navy photo hero (waterfall silhouette), textures on subject headers / empty states, subject sticker standing on the card edge |
| Sidebar names truncated, meaningless grey dash bars | 236 px sidebar, `.mini-prog` bars | 260 px, 13.5 px, names wrap instead of truncating; real 18 px progress ring + count only when documents exist |
| "PDF" badge over the thumbnail text | tiny page thumbnails with a badge on top | real cover cards (tint, sticker, serif title, progress line), badge in a corner row above the title |

## B. Reader wasted space
Top bar + dock + pager ate the height while the sides stayed empty; Блоки had a sticky panel (~25% of the screen).
Landscape now has **no top bar and no dock**: two 64 px glass rails, stage = viewport − 16 px high and − 152 px wide (asserted).
Блоки: the sticky panel is gone (timer popover on the chip, list in a bottom sheet, plan = normal card).

## C. Zoom
No zoom control existed; PDF pages were 100% of the screen width (cropped margins not trimmed) and the book was scaled to a fixed 1.6 cap.
Now: − / % / + / по ширине in the rail (and in "Ещё" in portrait), pinch (Safari gesture events + two-pointer fallback), double tap, 60–300%, remembered per document and per mode.
Defaults: text column ≤ 760 px at 18 px, PDF fit-width capped at 900 px.

## D. Text selection (root causes)
1. **The stylesheet never applied PDF.js 6's span variables.** `TextLayer` only writes `--font-height`, `--scale-x`, `--rotate`; the official `pdf_viewer.css` rule turns them into `font-size` and `transform`. Without it every span inherited the page font (15 px) and no horizontal scale: measured line width 662 px vs 800 px in the PDF → "half a glyph inside, half outside". Fixed (rule added); test: selection box within 2 px of the PDF's own glyph box.
2. No `endOfContent` element and no `.selecting` class → a drag could jump across the page. Added (official trick).
3. Text layer box was rounded down by `--scale-round-*` (1 px). Now the container is set to the exact page size and rounding is 0.01 px.
4. iOS long-press selecting a whole page: a guard (touch/pen only) cuts a selection that covers >85% of a page's text or >2 pages back to the word under the finger. Tested with a synthetic whole-page selection.
5. One text layer per page, only for visible pages (render queue, ±100% viewport), selection handler debounced 80 ms and does no DOM work.

## E. Marks
Round 2 painted PDF highlights as DOM rectangles with CSS `mix-blend-mode: multiply`. WebKit drops blending inside transformed / `overflow:hidden` layers (the book sheet) → opaque lilac bands over the text. Now highlights and brush strokes are painted **into the page bitmap with canvas multiply** (reliable everywhere); rectangles are per line, ≈0.95 line height, in original page coordinates. Pixel tests in Обычный, Книга, Блоки at 100% and 200%: glyph pixels stay near-black, mark pixels are yellow.

## F. Блоки
* "Прочитала" was keyed by a block id derived from block index + reading speed: any re-split changed ids. Now stored by **units** (PDF page / paragraph hash) with write-through to IndexedDB, flush on `pagehide` / `visibilitychange`; legacy ids are migrated. Test: reload, leave and return, switch modes, undo/redo, counters unchanged.
* "Проверь себя" is a toggle with a countdown ring; tap the button or the blurred block to reveal; cleared on mode / route / visibility change (tests).
* PDF blocks are crops (content bounds) and pages with little text merge into neighbouring blocks.

## G. Performance
Backdrop blur only on rails, bars and popovers; `content-visibility: auto` on PDF block cards; page rendering is a one-at-a-time queue; canvas budget 9 MP per page; DPR capped at 2. Hidden page `/#perf` shows FPS and long tasks. In Chromium no long task above 50 ms during navigation (routing suite). Real iPad numbers are not available in the sandbox.
