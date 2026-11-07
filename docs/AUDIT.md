# Audit of version 1 (screenshots in `qa/before/`)

Environment note: WebKit could not be installed in the dev sandbox (download host blocked, HTTP 403), so the audit
and all tests ran in Chromium with iPad/iPhone viewport + touch emulation at 1180x820, 820x1180, 1366x1024, 1024x768, 390x844.
The harness supports `WEBKIT=1` for a machine where WebKit is available.

## Functional flaws

1. **Undo/redo dead.** Root cause found: in `MarksStore` strokes, text edits and moves were added with `silent=true`, which skipped the
   change listeners, so the toolbar never re-enabled the buttons. HTML documents had no undo at all.
2. **Highlighter washes out text.** PDF highlights were multiplied, but the freehand "Кисть" used a semi-transparent stroke
   per segment, overlapping strokes got darker/muddy and colours were dull. HTML marks lived inside the DOM.
3. **Toolbar overloaded.** 5 swatches + U/S/B + clear + note + 4 tools + photo + undo/redo + zoom all on one row, no hierarchy.
4. **Book mode.** Page size equals the window, so margins/page counts change on every resize ("стр. 3–4 / 20" jumps);
   no spine, no page edges, no believable turn (plain rotate), tables/images are clipped, header/footer missing.
5. **"По частям"** is only the document cut into chunks with a list; no timer flow, no rest, no progress, no purpose.
6. **Look & feel.** Plain white boxes, no depth, no motion, no sidebar, hard route switches (the whole screen is replaced), white flash.
7. **Robustness.**
   - annotations are baked into the document DOM (`span.ann`), so they break with re-render, are not shared by modes
     and any text edit moves them;
   - touch targets under 44 px in places (`.tb-w`, small links), no `dvh` fallback for iPad Safari toolbars on some screens;
   - imported documents with own CSS were scoped, but dark artifact backgrounds leaked into the "paper" and made marks unreadable
     (see `qa/before/820x1180-html-book.png`);
   - no loading skeletons, empty states are plain text, error toasts overlapped the toolbar;
   - the "saved" state is invisible.

## What stays from v1 (works and is covered by tests)
Import pipeline (DOMPurify, base64 → Blob extraction, CSS scoping), IndexedDB layout, offline service worker, backup/restore, receipt.
