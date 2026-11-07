# Decisions (round 2)

One line per decision taken without asking the user.

## Data and migration
- IndexedDB version 1 → 2; new stores `annotations` (index `docId`) and `snapshots`; the old `marks` store is kept untouched as an extra safety net.
- Migration runs once (`kv.schemaVersion`), takes an internal snapshot first (only records it changes: HTML `work` copies that had marks, the `marks` records), keeps the three newest snapshots.
- v1 HTML marks (`span.ann`) become annotation records with text anchors; the stored document text stays byte-identical; v1 bold marks are kept as type `bold` (no UI button, only migrated).
- v1 page marks keep their geometry; `yu:'h'` flags "y is normalised by page height" so legacy data renders exactly; new data uses y in units of page width.
- v1 text-editing of HTML ("Править текст") is dropped: documents are immutable in v2 (text edits made in v1 stay in the stored text); notes, text boxes and photos replace it.
- Restoring a v1 backup ZIP runs the migration scan again, so old copies keep working; backups are now format 2.
- Internal snapshots are not included in ZIP backups (they would duplicate large documents).

## Annotations and drawing
- Annotations are data; HTML marks are painted into the DOM from the data on every render (unwrap → segment → wrap), never stored in the document.
- Overlaps are computed in JS as a multiply of the colours of a segment; PDF/canvas marks use CSS `mix-blend-mode: multiply` per rectangle.
- Brush: one `<g>` per colour at opacity 0.55 + `mix-blend-mode: multiply`, richer brush colours (`BRUSH_COLORS`) so 55% opacity looks like the pastel mark colours.
- Pen is pressure-aware (filled outline); finger drawing is off by default ("Рисовать пальцем" setting); with it off, fingers scroll the page manually (no inertia) while a drawing tool is active.
- Free drawing, text boxes and photos on HTML documents exist only in the "Обычный" mode (a reflowing book/blocks layout has no stable coordinates); marks, notes and eraser-on-marks work in all modes.
- Undo history lives while the document is open (depth 100), survives mode switches, is cleared on leaving the document; an empty text box never leaves history noise (`cancelAdd`).
- "Underline" tool = auto-apply on selection end; "Marker" tool auto-applies only when "Режим маркера" is on.
- Two-finger tap = undo (touch only).
- `strike` and `note` marks on PDFs are stored with rectangles like highlights (dotted underline + small chip for notes).

## Reader and book
- Logical page 1000×1400 (HTML), the PDF's own aspect for PDFs; scaled by CSS transform; spread when stage width > height×1.08 and ≥ 720 px.
- Book font size is stored as steps (`bookFontStep`, ±8% each); the base size depends on device class (phone vs tablet), so page counts are deterministic for a size class.
- Page turn: real 3D leaf; leaf faces are cheap clones of the page's own text slice (Range.cloneContents + shallow ancestor clones), the live flow stays a single multicol DOM.
- PDF book: cover on the right (setting "Обложка"), pages virtualised through bitmap cache (±2 pages).
- Bookmarks are stored by text offset (HTML) or page (PDF); long-press on a page's top corner toggles a dog-ear.
- TOC thumbnails were not built; the TOC is a list of headings with page numbers.
- Tall tables in the book are scaled with CSS `zoom`.
- Imported documents are lightened at render time: light text colours and dark backgrounds from the document's own CSS are dropped (paper is always light); the stored HTML is not changed.

## Blocks mode
- Blocks: split at h1–h3, big sections split at block boundaries (140% cap), small neighbours merged; block id = hash(first words + index).
- State in `kv`: `bk:<doc>` (done/flame/ask/plan/filter) and `bkt:<doc>` (timer with `endAt`).
- Timer works from timestamps (no accumulated ticks), restores after reload, uses Screen Wake Lock when available, chime through WebAudio unlocked on first tap, `document.title` shows the clock.
- Rewards unchanged in `config.js`: 1 fish per 5 active minutes (day), 1 shrimp per block marked read (one per block per day).
- "Только важное" = blocks with marks or a flame flag; plans 5/5, 10/5 change only the timer lengths.
- Plan card, filters, notes ("Спросят") and recall blur (20 s) are inside the document flow; for PDFs each block is a card with its pages.

## Design system
- Themes: `ice` (default), `rose`, `night`; stored in settings; the first paint colour comes from `localStorage.theme` in an inline script (no white flash).
- Documents always on light paper in every theme.
- Fonts vendored as woff2 (Latin + Cyrillic): Manrope, Nunito, Comfortaa (rose UI font is Nunito; Comfortaa is vendored for display use), Cormorant Garamond, Shippori Mincho (Latin subset only — Japanese glyphs would add megabytes).
- Icons: one inline-SVG icon module (`js/icons.js`), 1.7 px stroke, instead of an SVG `<use>` sprite sheet.
- Navigation: sidebar from 1000 px width, floating tab bar below; reader hides both.
- View Transitions API when available (shared-element names set on the tapped card and the destination hero), WAAPI cross-fade fallback, nothing when reduced motion is requested.
- The splash (from round 1) stays as a once-per-session overlay.
- Toasts sit at the bottom above the dock/tab bar.
- Greeting uses the name "Лиз" (taken from the brief).

## Assets
- Placeholder art is original SVG (generated by `tools/gen-placeholder-art.mjs`), no copyrighted characters; `assets/manifest.json` is the single place that maps slots to files.
- A missing sticker file falls back to a generated coloured circle.

## Service worker
- New version installs with `skipWaiting`, the page reloads once on `controllerchange` (only if there was a previous controller) and shows the "Обновлено" toast on the next start (`kv.appVersion`).
- The cache lists every file under `js/`, `styles/`, `vendor/`, `icons/`, `assets/` (including fonts and manifest).

## Testing
- WebKit could not be installed in the sandbox (download hosts blocked); all tests ran in Chromium with touch emulation at the five required sizes. `WEBKIT=1 node tests/run.cjs` runs them in WebKit where available.


# Decisions (round 3)

## Design
- Default theme «Цианотипия» (`cyan`); old default `ice` and `night` migrate once (`kv.themeV3`): ice → cyan, night → deep; «Лёд», «Небо», «Сирень», «Роза» kept (calmer, no neon). Palette checked with `tools/palette.mjs` against the supplied photos.
- Primary button = solid ink (white in «Глубина»), secondary = white glass with hairline; accent used for selection, rings and progress only.
- Subject colours are 8 cool pastel pairs (`--st` tint, `--si` ink) in `tokens.css`, with dark variants for «Глубина».
- All looping motion removed (decor layer, koi, float/swing/drift); stickers are static with ±3° rotation derived from the id and a CSS drop shadow. Route fade / press scale / popover rise / page turn / progress remain.
- Emoji only in reward counters (🐟 🦐); rest tips and chrome are text/icons.
- Icons: one family, 1.6 px stroke.

## Reader layout
- Landscape = `innerWidth > innerHeight`: rails (64 px, 12 px inset, radius 22), stage inset 8 / 76 px. Book mode extends the stage under the dimmed rails (it is height-limited, page height = viewport − 16).
- Portrait/phone: 44 px top bar that hides on scroll (not while a block timer runs), slim 48 px pill dock (chosen over a pencil FAB: tools stay one tap away and nothing sits permanently over the text).
- Controls are created once and re-parented between rails and bar when the orientation changes (single set of `[data-mode]` buttons).
- Rails dim to 40% after 3 s; focus mode hides them; the edge strips restore them; the document title is a 2-second label.
- Zoom 60–300% per document and mode (`kv zoom:<id>:<mode>`); in Normal 100% = column ≤ 760 px / PDF page ≤ 900 px; «по ширине» toggles between 100% and the full stage width; double tap = same; pinch via Safari gesture events with a two-pointer fallback; live CSS transform, crisp re-render on release.
- Canvas pixel budget per PDF page 9 MP (iPad limit 16.7 MP); beyond that the DPR is lowered.

## PDF
- Margin trimming: per page low-res scan (180 px), rows/columns need ≥2 dark pixels and a neighbour (noise ignored), document crop = 3%/97% quantiles + 24 pt padding, cached in `kv pdfbounds:<id>`, toggle `kv trim:<id>` (default from Settings). The crop is a window over the original page (`.pg` window / `.pg-inner` original), so annotations never move. Blocks crop vertically per page. Book keeps pages page-shaped (ratio ≥ 1.2).
- Highlights/brush are painted into the canvas with multiply; underline/strike/notes stay DOM.
- A selection created by touch/pen that swallows a page is reduced to a word (guard), mouse is untouched.

## Book
- Two-page spread always has `base = -1`: first spread = cover (left) + page 1 (right); with «Обложка» off the first page is centred alone. Blank slots at the end are endpaper. Edge stacks grow with the pages read. Pager is a 28 px glass strip.

## Drawings in reflowing modes
- HTML pen/brush/text/photo records made in Normal carry `anc` (nearest character offset + its box). In Книга/Блоки they are re-placed relative to that character and scaled by the font-size ratio (read-only overlay). PDFs use the same normalized page coordinates everywhere.

## Блоки
- "Прочитала" by units (PDF page / paragraph hash), legacy block ids migrated; the global Undo/Redo covers it (`AnnoStore.pushExternal`).
- Auto questions: `js/reader/questions.js`, rule-based, local; user-written or edited questions are flagged `auto:false` and never overwritten by «Обновить».
- Timer logic unchanged (endAt, wake lock, chime); chip shows the block clock while a block runs; the flying shrimp lands on the chip.

## Data safety
- `navigator.storage.persist()` requested at boot and from Settings (result shown), used/free storage meter, backup = one ZIP through the share sheet, restore shows a preview and offers merge (default) or replace (needs a second confirmation), reminder after 5 days as a slim notice on Home + sidebar footer "Копия: N дней назад".

## Testing
- WebKit cannot be installed in the sandbox; Chromium with touch emulation at 1180×740, 820×1100, 1366×1024, 390×844 stands in for Safari. Safari-only paths (gesture events, long-press selection, wake lock) are covered by synthetic events and are listed in `KNOWN_ISSUES.md`.

## Master spec (consolidated) — decisions taken autonomously
- **Her 12 real files were not attached.** Synthetic fixtures with the described structure (`tests/fixtures/adapt/app-*.html`: self-contained mini-apps with `section.blk`, tickets `.tk/.q/.qa`, base64 images, dark-mode CSS, 100vh shells) plus hostile fixtures (3-column, 30-column table, absolute slides, dark-only, Google Docs / Notion / Word exports, remote images, 100vh shell). Her real notes are never committed; `/fixtures-private/` is in `.gitignore`.
- **Engine:** `js/adapt/*`, one pipeline for all HTML. Adapter version `a1` stored per file; Home offers «Пересобрать» when it changes. Marks and progress survive a rebuild (anchors are text-based, block ids are `hash(title|index)`).
- **Reading paper is always light.** Dark-mode rules of the source (`prefers-color-scheme: dark`, `[data-theme=dark]`) are dropped and colours are re-computed in OKLCH until contrast ≥ 4.5:1; the app theme only changes the frame around the paper. Chosen because pen marks, highlights and images are designed for a light page.
- **Blocks = the source's `section.blk` as-is** when present, otherwise headings, otherwise time slices. No sticky panel, the timer lives in the rail/strip chip.
- **PDF stays a page document** (PDF.js canvas + text layer); no text-reflow adapter for PDF — reflow loses figures and tables, which breaks «images never lost». Scans/photos are shown as page images.
- **Photo-set adapter:** images imported together become separate image documents (no merge into one document); skipped because the manual «собрать в PDF» flow was not requested by any scenario.
- **«Как в оригинале» iframe fallback skipped.** An iframe would bring back the source's scripts and layout (the main cause of earlier failures) and break marks; the fallback chain is normal → safe (CSS dropped) → plain text.
- **Zoom** is a CSS font-size variable (not a transform) in HTML modes so the text stays crisp and re-flows; pinch is reserved for images (lightbox).
- **Stats page merged into «Чек»** (history of days with fish/shrimp, streak on Home) instead of a separate route: one place for "how did I do".
- **Sidebar 236 px kept** (spec says «compact split-view» only below 700 px; below 700 px the bar becomes 3 tabs).
- **Soft delete** with a toast «Вернуть» (no confirmation dialog), trash in Settings, 30-day purge at boot. Folders still ask for confirmation because they delete many files at once.
- **Tour** once on first launch (3 cards, skippable); tests pre-set `localStorage.noTour`.
- **Dynamic Type** only where the browser supports `-apple-system-body` (Safari); other browsers keep 17 px.
- **Testing:** Chromium only (WebKit not installable here); `tools/qa-matrix.cjs` runs fixtures × modes × light/dark × 4 viewports with programmatic checks; results in `docs/qa/final/MATRIX.md`.

## Round 7 — final document architecture (replaces the restyle engine for opening/rendering)
- **Every HTML document lives in its own sandboxed iframe** (`sandbox="allow-scripts allow-modals allow-popups allow-popups-to-escape-sandbox"`, no `allow-same-origin`), built by `js/frame/build.js` from the RAW file (the stored Blob never changes) + a prelude: CSP meta, storage shim, reader runtime (`js/frame/rt/*.js`, plain script, concatenated at load). The site never extracts, scopes or rewrites a document's CSS again. `js/adapt/*` stays only as the text→HTML helper for Word/Markdown/TXT (`toHtmlString`) and the subject guess.
- **Raw store = the existing `docs` store** (`original` Blob) instead of a new `raw` store: no schema bump, backups already contain it. `docState` = kv `ds:<id>`, reading settings = kv `fz:<id>`, position = kv `fpos:<id>`, journal = kv `journal` — all in the backup because kv is.
- **Blob URL first, `srcdoc` fallback** after 6 s without `ready` (WebKit refusing Blob URLs). Which one was used is `FrameHost.mode`.
- **Reading views don't run the file's scripts** via the policy itself (`script-src 'nonce-…'`; only our two prelude scripts carry the nonce) plus a regex strip of `<script>` — no DOMParser pass, so a 13 MB file opens in < 1.5 s. «Оригинал» uses `script-src 'unsafe-inline'`.
- **Fonts are embedded as data: URIs** (not `font-src <origin>`): a sandboxed opaque-origin frame is not controlled by the service worker, so data URIs are the only offline-safe way. Families bundled (OFL, from @fontsource): Golos Text, Manrope, PT Serif, PT Sans, Cormorant, Lora, Source Serif 4, Playfair Display, Inter (`assets/fonts/doc`, 1.1 MB). Remote `<link>`/`@import`/`@font-face url(http…)` are removed; the families they asked for are served from the bundle.
- **View switch = reload of the frame** (one mounted view at a time, position carried as a text anchor {offset, quote, block}).
- **Zoom** = CSS `zoom` on the root, one list `[50…200]`, default 75, single source of truth in `FrameDoc.cfgState.zoom[mode]`; runtime UI sizes use `--u` (device px) so tap targets stay ≥ 44 px at any zoom. «По ширине» switches width to «как в файле» and picks the nearest step that fills the reading area.
- **Width 'wide'** removes the wrapper's own `max-width` (found by content share, not by class name) and sets 24 px side padding. Tables wider than their box get a scroll box with an edge fade (Обычный/Блоки); in Книга: font −10 %/−20 %, then `overflow-wrap:anywhere`, then zoom ≥ 0.72 on that table only. Global `overflow-wrap:break-word` (not `anywhere`: `anywhere` shrinks table min-content and breaks words mid-column).
- **Блоки** segmentation lives in the runtime (`40-seg.js`): `section.blk` as they are, else heading hierarchy + study-time model (words/110 + 0.6/img + 0.5/table + 0.3/formula + 0.8/diagram; target 5, cap 7, merge < 2 min), PDF page documents in chunks of ≤ 6 pages. Bars (header above, actions below) are SIBLINGS of the file's own nodes (not wrappers) so the file's `>` selectors keep working; the header of the document is never block #1; titles come from ONE heading.
- **Книга**: the file's own `body` becomes the CSS-columns container (`column-width`, `column-fill:auto`, fixed height); a turn is one `translate3d` on `body` (280 ms) + a shade animation, no relayout. Parts start on a left page via `break-before:column` + a 1 px spacer column when parity is wrong; a heading left at the bottom of a column is moved (`lz-brk`, ≤ 3 passes). Paper, gutter, running heads and numerals are drawn INSIDE the frame (a frame cannot paint outside itself); the desk is the parent's. Landscape PDFs (slides) use «Блокнот»: one narrow page with two slides stacked, vertical slide-up turn.
- **Marks**: text marks are anchored by quote/prefix/suffix + offset, painted by cutting every text node at every mark boundary once; pen strokes are anchored to the nearest character (offset + em-relative geometry) and drawn on one viewport canvas, so they follow reflow in every view. Text notes: the «Текст» tool attaches a note to a tapped word; photo notes are compressed to ≤ 640 px JPEG and attached to the selection/top word. Not ported from the old reader: double-tap word underline, brush (marker drawing) — the pen covers freehand.
- **Converters** (`js/convert/*`): PDF with text and portrait pages → reflowed HTML (headings by font size, repeated headers/footers and page numbers dropped, de-hyphenation, bullets); pages that carry figures also get a page picture so no image is lost; landscape/scan PDFs → page images (WebP q85, 1400 px). DOCX/Markdown/TXT → sanitized HTML. Everything gets the «Studiem paper» stylesheet and goes through the same frame. Old PDFs without `conv` still open in the legacy PDF.js reader until «Пересобрать».
- **Library**: duplicates compare SHA-256 first, then the title, only against live documents; a trash-only match asks «Восстановить и обновить» instead of claiming a new version; every question names the subject, folder and date and shows the card. `#/files` (Все файлы · Корзина · Журнал). Storage-eviction banner: a `localStorage` marker that outlives an empty library.
- **Testing**: WebKit is still not installable in this sandbox (`playwright install webkit` fails), so the gate runs in Chromium (touch emulation); `tests/t-r7*.cjs` cover security, fidelity (computed styles + pixel diff against the raw file, same fonts), zoom steps, Книга geometry/perf, Блоки actions, marks across views, library flows, converters and a 13 MB file at 1000×700, 1180×820 and 820×1100. The old reader tests (SDM `.doc`, book engine, blocks view) moved to `tests/legacy/` (not run): they exercised code that no longer renders documents.
- **Not done / simplified in Round 7 (logged on purpose):** the Книга page map is not persisted in IndexedDB (a layout takes ~100–150 ms, the page count is identical after reload — tested); white-margin auto-trim of PDF page images is not applied (pages are shown whole); double-tap word underline and the marker «brush» of the old reader are gone (the pen replaces freehand drawing); photo sets are separate documents; the iframe «как в оригинале» fallback is unnecessary now (everything is already the original).
- **Page turn performance:** no relayout, no View Transitions, composited `translate3d` only; the parent's glass panels become solid while a page turns (`.reader.turning`); images of the next spread are decoded in advance; `?perf=1` in the address shows p95 frame time, turn time and layout count inside the frame.

## Round 9
- **No general timer.** `js/study.js` no longer ticks. Time and rewards exist only for blocks: a block counts when its timer reached the block's target (its own estimate) or «Прочитала/Выучила» was pressed after ≥ 50 % of it; 3 min without any action or a hidden page pause the block timer (any action resumes it); the same block counts once per day (`completions` key `file|block|date`). Rewards: 1 рыбка per counted block, +1 креветка on every second block of the day (day report: fish = blocks, shrimp = floor(blocks/2)). Credited minutes = real elapsed block time. The rail chip is an empty clock until a block runs; a counted block shows a still «+1 рыбка» card for 2 s (nothing flies).
- **Block timer length = the block's estimate**, not a fixed 5/10/25 minutes. The old presets became rest lengths («Отдых 5 / 10 мин», «Без отдыха») + «Секундомер» + «Только важное».
- **Оригинал**: the frame reports clicks on the file's own start/done buttons (`/Начать|Старт|▶/` start, `/Выучила|Прочитала|Готово|✓/` or `.dn` done) inside `section.blk`; the parent runs the same block timer for that block (blocks come from `section.blk`).
- **Zoom**: the page-picture documents (PDF slides, scans) now scale with the zoom (75 % = fill the reading width, 150 % = twice, scroll sideways; zoom steps stay one list). Книга: the page frame never changes (geometry in device px), only the content scale; repagination is debounced 250 ms; a page-picture document in Книга keeps pictures within the sheet (smaller zoom = more slides on a sheet, larger zoom is capped by the sheet width — documented exception for the 150 % glyph test).
- **Regression net** (`tests/regression`, `tests/t-reg.cjs`): 8 fixtures x all views, baseline recorded before Round 9 (`baseline-1000x700.json`, `baseline/*.jpg`); the other two viewports are recorded once at the end from the pre-round commit (git worktree) and compared once.
- **Block estimator (Round 9):** `minutes = (words/70 + keyTerms×0.15 + latinTerms×0.05 + images×0.75 + tableRows×0.25 + formulas×0.6 + diagrams×1.0) × pace` (pace: slow ×1.4 / normal ×1 / fast ×0.75, Settings «Мой темп», applied when the document opens). PDF page pictures: `pageMinutes = 0.6 + words/70 + imageAreaFraction×3 + min(pathOps/300, 3) + formulaHint×1.5`, clamped 1.5–8 (computed at conversion with pdf.js: CTM-tracked image area, path operators from the operator list, single-letter/arrow ratio as the formula hint), stored as `data-pm` (+ the largest text line as `data-pt`). Cutting: blocks start at h2/h3 (part headings, tickets; h1/h4 when there are no h2/h3); sections < 2 min merge with the next one under the same parent heading (else the previous, else a neighbour while ≤ 7.5 min); sections > 7 min are cut at element boundaries into ~5 min pieces (a heavy element keeps its heading and stands alone, a trailing piece < 2 min is merged back); pages: ≤ 3 pages and ≤ 7 min per block, a page above 7 min is alone. Files that already have `section.blk` keep them exactly (a stated time «выучить ~7 мин» / `data-min` wins). Block ids are `hash(title | text offset of the first element)` — stable when other blocks are split or merged; the user's «Разделить» / «Объединить со следующим» are stored as text offsets (kv `bkedit:<id>`).
- **DOCX (Round 9):** `docx-preview` 0.3.5 (self-hosted in `vendor/docx-preview`) renders the file in the page at import time (`breakPages:false`, `ignoreWidth`, base64 images); its generated CSS + HTML are stored as the converted document and shown in the usual frame, so colours, shading, borders, tables, images and numbering come from Word. Fonts: Calibri→Carlito, Cambria→Caladea (Latin) + Tinos (Cyrillic, because Caladea has none), Times New Roman→Tinos, Arial→Arimo, embedded as data URIs only when the file's CSS names them. Word's heading styles / large bold paragraphs get `data-h` so blocks, the book and parts see them. mammoth extracts the plain text (search). VML/DrawingML shapes, text boxes, SmartArt are detected from `document.xml`; then a visible note says «Часть схем из Word не отображается. Сохрани файл как PDF и загрузи PDF — будет точь-в-точь» (never a silent drop). Word files imported earlier get a «Пересобрать» chip on their card.
- **Regression net baseline:** recorded from the last Round-7 commit in a git worktree (`git worktree add /tmp/base 3fbcf14`), so Round 9 is compared with what shipped, not with itself.
