# Known issues and remaining imperfections (round 3)

Round 3 specifics first; the older list follows and still applies where not contradicted.

## Round 3
- **No WebKit/iPad in the sandbox.** Safari gesture events (pinch), long-press selection handles, the iOS callout and the wake lock are exercised with synthetic events only. The selection guard and pinch have a two-path design for that reason.
- Very high PDF zoom (300%) lowers the canvas resolution to stay under the 9 MP budget; text is slightly soft there until a tiled renderer exists.
- Drawings made on **HTML** documents follow their text in Книга/Блоки but are read-only there and approximate (placed by the nearest character, scaled by the font-size ratio); in Книга the page-turn animation copy does not include them.
- PDF margin trimming uses one document-wide crop (3%/97% quantiles); a figure that sticks far into the margin of a single page can be cut — switch «Обрезать поля» off for that file.
- Backup is built in memory; a library of hundreds of MB may fail on a small iPad.
- Safari can still evict site data in rare cases; `persist()` is requested but iOS decides. Hence the 5-day reminder.
- The jellyfish poster was not supplied; Settings uses the beach-cat poster.


Honest list after the final self-review (screenshots in `qa/after/`).

## Not verified on real hardware
- **WebKit / Safari / iPad were not available in the sandbox** (the browser download hosts are blocked). Everything was run in Chromium with touch emulation at 1180×820, 820×1180, 1366×1024, 1024×768 and 390×844. The suite supports `WEBKIT=1`. First things to test on the iPad are listed in the final report.
- Apple Pencil pressure, palm behaviour, the iOS selection menu overlapping the bottom pill and Safari's own back-swipe near the book edge are untested.
- The View Transitions API (Safari 18+) path was exercised in Chromium only; the cross-fade fallback is tested separately.

## Reader
- Free drawing, text boxes and photos on **HTML** documents work only in "Обычный" (documented decision); in Book/Blocks the tools are dimmed with a hint.
- During the leaf animation the turning page is a visual copy of the text slice; at the very first frame the copy can differ by a pixel from the live column (paragraph spacing at slice starts, text justified differently by the browser).
- A page that starts with an image and no text can show that image on the previous page's turning leaf (the animation only; the settled page is always correct).
- Marks, notes and photos on a PDF page are tied to the page geometry; if a PDF has pages of very different sizes in a book spread, the page boxes keep the first page's proportions.
- The table of contents has no thumbnails (heading list only).
- Pen strokes are smoothed but not predicted (no latency compensation on iPad).
- When a drawing tool is active and finger drawing is off, finger scrolling is emulated (no inertia).
- A very long selection across many pages of a PDF creates one record per page.

## Blocks
- Block ids are derived from the first words + index; if a document is re-imported with different text, "done" marks do not carry over.
- Wake Lock is released when the tab is hidden and re-acquired on return; on iPad it needs iOS 16.4+.
- The chime needs one tap on the page before the first phase ends (browser audio policy).

## Data
- Annotation history (undo) is not stored across reloads (only the result is).
- Large backups (hundreds of MB) are built in memory and may fail on small iPads.
- The legacy `marks` store is intentionally kept after migration (extra safety), so it takes a little space.

## Design
- Shippori Mincho is vendored as a Latin subset only; Japanese text falls back to the system Mincho.
- The wallpapers and stickers are generated placeholders until real photos arrive.
- Theme «Роза» changes the UI font to Nunito; Comfortaa is vendored but not used yet.
- On phones the reader's top bar uses two rows (title/timer + mode switch) and is taller than on iPad.

## Accessibility
- All icon buttons have labels; contrast of main text on panels is ≥ 4.5:1 in all three themes (checked by the suite); muted captions (`--ink3`) are decorative and may be lower.
- The page-turn and floating decorations switch to fades / stop when "reduce motion" is on.
