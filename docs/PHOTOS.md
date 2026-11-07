# Where each photo went (say "swap X" and name the slot)

Originals are untouched in `assets/originals/`; `node tools/build-assets.mjs` rebuilds every derivative; `assets/manifest.json` maps slots to files.

| Original | Type | Result | Used for |
|---|---|---|---|
| cat-hehe.jpg | sticker | `stickers/cat-hehe(.@2x).webp` | Анатомия; **app icon / apple-touch-icon**; splash-free |
| cat-cheeks.jpg | sticker | `cat-cheeks` | Патанатомия |
| cat-sleepy.jpg | sticker | `cat-sleepy` | Биохимия; error state |
| cat-limit.jpg ("im seriously at my frickin limit") | sticker | `cat-limit` | Гистология |
| cat-tongue.jpg | sticker | `cat-tongue` | Микробиология |
| cat-lying.jpg | sticker | `cat-lying` | Стоматология |
| cat-outline.jpg | sticker | `cat-outline` | Философия; **empty-state figure** |
| cat-scribble.jpg | sticker | `cat-scribble` | Физиология |
| ornament-chrome-star.jpg | ornament (cut out, no outline) | `stickers/chrome-star.webp` | logo mark in the sidebar |
| wallpaper-waterfall.jpg | wallpaper | `wallpapers/waterfall-736.webp` | **Home hero** (navy card, mask + fog); default wallpaper for Цианотипия, Лёд, Сирень, Роза |
| wallpaper-camera.jpg | wallpaper | `wallpapers/camera-1080.webp` | **Splash**; default wallpaper for Глубина, Небо |
| texture-eye-wash.jpg | texture | `textures/eye-wash.webp` | subject headers / cards / covers (Патанатомия, Микробиология, Физиология) |
| texture-handshake.jpg | texture | `textures/handshake.webp` | Гистология, Стоматология |
| texture-cyanotype-flowers.jpg | texture | `textures/flowers.webp`, `textures/desk.webp` (blurred) | Анатомия, Биохимия, Философия, **reader desk**, book cover paper |
| poster-beach-cat.jpg | poster | `posters/beach-cat.webp` | **Settings header** panel (cropped, text not the focus) |

Cut-out: ink mask → closing + hole fill → white die-cut outline rebuilt by dilation (8 px) → anti-aliased alpha, no baked shadow (CSS adds it). Sleepy and tongue use a convex hull because their drawings are open.
Subject → sticker assignment follows the sidebar order; change it in Настройки → «Обложки предметов».
Wallpapers sit only behind translucent panels under a veil (`--veil`), never behind reading text. Missing files fall back to a quiet duotone gradient.
Not supplied yet: the jellyfish poster.


## Batch 2 (12 more images)
| Original | Type | Result | Used for |
|---|---|---|---|
| (flowers, sent again) | duplicate of texture-cyanotype-flowers.jpg | — | not added twice |
| texture-swirls.jpg | texture + wallpaper | `textures/swirls.webp`, wallpaper «Туман» (`fog-p/-l`) | subject cards (Микробиология), **default wallpaper of «Лёд»**; landscape-friendly (iPad) |
| texture-coral.jpg | texture + wallpaper | `textures/coral.webp`, wallpaper «Коралл» | Биохимия cards; wallpaper pool |
| texture-sparkles.jpg | texture + wallpaper | `textures/sparkles.webp`, wallpaper «Блики» | Стоматология cards; **default wallpaper of «Небо»**; portrait crop for iPhone |
| wallpaper-portrait-girl.jpg | wallpaper (landscape face) | wallpaper «Портрет» (iPad landscape crop + 9:16 crop) | wallpaper pool only |
| wallpaper-child-blue.jpg | wallpaper (blue grain illustration) | wallpaper «Свет» | **default wallpaper of «Сирень»** |
| poster-jellyfish.jpg | poster | `posters/jellyfish.webp` (crop on the jellyfish, poster text out of frame) | **Settings header** |
| poster-constellation.jpg | poster | `posters/constellation.webp` (stars and lines, without the handwritten word), `textures/window.webp` (night window) | **Чек header**; Философия cards |
| illustration-cat-circle.jpg | illustration | `textures/cat-circle.webp` | background of the **empty subject** card |
| stickers-chibi-trio.jpg | 3 stickers on one sheet | `chibi-ink`, `chibi-wolf`, `chibi-ghost` (split by connected components, white die-cut rebuilt) | sticker pool; `chibi-ghost` = error state |
| sticker-star-girl.jpg | sticker (own light-blue outline kept) | `star-girl` | sticker pool; **empty-state figure** |
| sticker-syringe-cat.jpg | sticker (own outline kept) | `syringe-cat` | sticker pool; **Чек header** figure |
The beach-cat poster stays in `assets/posters/` as a spare. iPad vs iPhone: every wallpaper has a 16:10 crop (iPad landscape) and a 9:16 crop (iPhone / portrait), chosen automatically by orientation.

**Jellyfish poster (sent again):** whole poster `posters/jellyfish-full.webp` = Settings panel on tablets (left, uncropped) and phone wallpaper «Медуза» (vertical, in Settings → Фон); text-free crop `posters/jellyfish.webp` = Settings header on phones; landscape crop for iPad wallpaper.
