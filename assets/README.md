# Assets: your photos

Everything is described in `docs/PHOTOS.md` (which photo went where). Originals live in `assets/originals/` and are never modified.

* `node tools/build-assets.mjs` rebuilds stickers, wallpapers, textures and the poster from the originals (`npm i --no-save sharp` once).
* New cat sticker: `node tools/make-sticker.mjs photo.jpg --ink --name cat-x` (line-art on a near-white background; `--hull 1` for open drawings, `--close N` to close gaps). Add it to `stickers` in `assets/manifest.json`; it then appears in Settings → Обложки предметов.
* New wallpaper: add the file and an entry in `wallpapers.pool`; choose it in Settings → Оформление.
* Slots (`assets/manifest.json` → `slots`): logo, empty, error, splash, homeHero, desk, settingsPoster, appIcon.
* App icons: `node tools/make-icons.mjs`. Theme from a photo: `node tools/palette.mjs photo.jpg --name x --write`.
* After any change run `node tools/build-sw.mjs` (offline cache version).
