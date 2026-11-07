# PROGRESS (resume point after any interruption)

Spec: MASTER SPEC (sections 0–11). Baseline = round-3 code (rails, canvas marks, trim, Блоки, backup, themes).

## Audit of the baseline against the master spec
| Area | State |
|---|---|
| 2 Visual bar, themes, stickers, no looping motion | done in round 3 (keep) |
| 3 Home «Продолжить» card w/ ring, library search, sort, trash, auto-guess sheet, update toast, offline indicator, tour | **missing** |
| 4 Reader layout: rails/portrait strip | rails done; «Прочитала» in rail, 40 px strip with timer, 36 px book pill: **adjust** |
| 5 Book / Blocks | Book = multicol + logical page (kept, tuned); Blocks must use source `section.blk` as-is: **adjust** |
| 6 Timer modes, Чек illustrations, history | timer endAt-based done; modes (секундомер, 25), Чек page w/ history: **adjust** |
| 7 Annotations | text/PDF marks done; image-region anchors, unanchored list, double-tap underline: **adds** |
| 8 Adaptation engine (SDM, adapters, CSS scoping, fit report, fallbacks, re-adapt, updates) | **missing (main work)** |
| 9 Data safety/offline/perf | backup, persist, SW done; internal backup before schema change, weekly reminder done |
| 10 Extras | none except resume position |

## Phases
- [x] P1 adaptation engine + fixtures + tests (`js/adapt/*`, `tests/t-adapt.cjs`, 24 fixtures)
- [x] P2 reader/layout adjustments (rail «Прочитала», 40 px strip, timer modes, Чек history)
- [x] P3 library features (search, sort, trash, guess sheet, update detection, toast, offline pill, Continue card, Home title)
- [x] P4 annotations adds (persisted undo, unanchored list, double-tap underline, image strokes)
- [x] P5 extras (bookmarks, print, shortcuts, tour, error report, dynamic type, reading font)
- [~] P6 quality gate: `tools/qa-matrix.cjs` → `docs/qa/final/MATRIX.md`; FINAL-REPORT.md, DOCUMENT-FORMAT.md

Test status: `node tests/run.cjs` (core, annotations, book, blocks, routing, migration, visual, round3, adapt, master) — all green at last run.

Environment notes: no WebKit in the sandbox (Chromium + touch emulation is used, logged in DECISIONS.md); her real files are not attached → synthetic fixtures with the described structure.


## Round 7 — final document architecture (current)
- [x] R7-1 sandboxed frame per document, runtime, storage shim, CSP, fonts, Оригинал / Обычный, zoom steps, width, tables, font comfort, theme sync
- [x] R7-2 Книга (columns in the file's own body, cover, parts on left pages, clean breaks, instant turn, «Блокнот» for landscape PDFs)
- [x] R7-3 Блоки (section.blk / headings / pages, study-time model, bars, Начать / Прочитала / Проверь себя / Спросят · N)
- [x] R7-4 marks in the runtime (marker, underline, strike, notes, photo notes, pen, eraser), same anchors in all views
- [x] R7-5 library: duplicates by hash/title, update, «Файлы» / «Корзина» / «Журнал», storage-loss banner; converters for PDF / DOCX / MD / TXT / photos
- [~] R7-6 gate: `tests/t-r7.cjs`, `t-r7b.cjs`, `t-r7c.cjs` (+ core, routing, migration, master); screenshots in `docs/qa/round7/`; FINAL-REPORT section; push
Run: `node tests/run.cjs` (core routing migration master r7 r7b r7c). Old reader tests: `tests/legacy/` (not run).


## Round 9 — study rewards, book zoom, block cutting, pinch, no regressions
- [x] R9-0 regression net: `tests/regression` (8 fixtures x views), baseline from the pre-round commit, `tests/t-reg.cjs`
- [x] R9-1 no general timer; rewards only for blocks (Блоки + Оригинал) — `tests/t-r9a.cjs`
- [x] R9-2 zoom (glyph ratio at 50/75/150 %, Книга frame constant, 3–4× text at 50 %) — `tests/t-r9b.cjs`
- [x] R9-3 pinch without the site sliding — `tests/t-r9c.cjs`
- [x] R9-4 block estimator + cutter, split/merge, pace — `tests/t-r9d.cjs`
- [x] R9-5 DOCX via docx-preview, «Пересобрать» — `tests/t-r9e.cjs`
- [~] R9-6 final regression at 1180x820 and 820x1100 (once), designer pass, report, push
