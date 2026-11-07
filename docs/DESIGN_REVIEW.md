# Design review (round 3): picky art director, three passes

Method: screenshots at 1180×740, 820×1100, 1366×1024, 390×844 (`node tools/shots-after3.cjs` → `qa/after3/`), compared against the PART B principles one by one.

## Principles checklist
| # | Principle | Verdict |
|---|---|---|
| 1 | Imagery does the heavy lifting (hero, subject header, empty state, splash), photos melted in with mask + fog, never clip-art | Home hero = waterfall silhouette on navy; subject headers = texture + sticker; splash = camera wallpaper; empty state = sticker + texture. Missing file → quiet duotone gradient. ✔ |
| 2 | One hue family, accent < 10%, primary = solid ink, secondary = white glass, no glows | ✔ (accent only on selection, rings, progress, links) |
| 3 | Cormorant for titles/quotes, Manrope UI, tracking labels, tabular numbers, vendored fonts | ✔ (clock = Manrope 700 tabular) |
| 4 | Glass chrome only on small fixed layers | rails, bars, popovers, tab bar only ✔ |
| 5 | 8 px rhythm, radii 12/16/22/26, one icon family, no truncation where there is room | ✔ sidebar names fit |
| 6 | No floating / drifting / looping decoration | asserted by a test (`getAnimations()` has no infinite iteration) ✔ |

## Pass 1: what was still amateur → fixed
* Texture images in subject headers and cards ended in a **hard rectangular edge** (the mask spanned the whole card, the image only a part of it) → pseudo-elements now sit exactly on the image box with their own gradient mask.
* The reader desk used a tiled photo: **visible seams** every 520 px → one blurred, desaturated, non-repeating `desk.webp`, low opacity.
* «сохранено» was **clipped** inside the 64 px rail → stacked icon + 9 px label, reserved height (no layout jump).
* Document covers were **pale and empty** (tiny title, no structure) → spine stripe, 25 px serif title, texture rising from the bottom, sticker and progress line; badge in its own row above the title.
* Settings poster showed arbitrary pixels → crop moved to the sea + pixel cat, title on a navy gradient.
* Book cover: texture too heavy (brown patch) → opacity down.

## Pass 2
* Portrait Book: the pager strip hid behind the tool dock → pager sits above the dock.
* Landscape Book: width-limited by the rails (page 694 px of 740) → stage extends under the dimmed rails, page = viewport − 16 (asserted).
* Phone hero: photo was almost invisible and the stat chips wrapped awkwardly → lighter fog, smaller chips, 72% text column on tablets.
* Блоки sheet filters wrapped to two rows on a phone → 12.5 px labels, tighter padding.
* Desk still looked smoky in the corners → opacity lowered again.

## Pass 3 (what remains, honestly)
* The convex-hull die-cut of two stickers (сонный, с языком) is more angular than the originals.
* PDF Блоки cards of sparse pages are compact, but the first card of a scanned book shows a grey scanner border (kept: it is content).
* Apple Pencil feel, iOS selection handles and the real Safari chrome can only be judged on the iPad (see `KNOWN_ISSUES.md`).

## Master-spec review loops (picky designer)
**Loop 1 — what I disliked and fixed**
1. Blocks, dark theme: the block body had no paper (dark ink on wallpaper) — blocks/header/tail now sit on the paper card in every theme.
2. Block badge «1» and «Прочитала» button used the dark theme's light accent on a white head (contrast 1.06) — palette pinned to paper inside block heads/feet.
3. Book, landscape: the right page's text ran under the right rail — the spread now keeps 68 px on both sides.
4. Home title was the greeting; now «Библиотека» with the greeting as an italic line.
5. Document cards said only "~N мин чтения"; now «N блоков · ~M мин».
6. Subject cards had a bar without words; now «N файлов · X% прочитано».
7. Reading text size was 15 px in Chromium after Dynamic Type — applied only where `-apple-system-body` exists.
8. Tour dialog could block the first click in tests — skipped through `localStorage.noTour`.
9. QA probe false positives (hidden `<style>` text, book clones) — probe now measures what is visible.
10. Mode buttons are re-parented on rotation; the matrix now retries instead of crashing on the swap.

**Loop 2 — remaining dislikes (logged, not blocking)**
1. Home hero wallpaper crop on 390 px is tight around the stats row.
2. Book cover sticker overlaps the cover frame by a few px on 1000×700.
3. Timer chip in the 40 px strip is dense next to the 3-mode switch on 390 px.
4. Blocks plan card is tall on phones (5 chips wrap to 3 rows).
5. Settings page is long; no section anchors.
6. Trash rows have no thumbnails.
7. Search snippets do not show which block the hit is in.
8. Tour icons are generic.
9. «Копия» reminder wording is the same every week.
10. No WebKit run: iOS-only behaviour (long-press selection, gesture events, wake lock) is verified by synthetic events only.
