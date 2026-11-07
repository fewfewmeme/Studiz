# Формат конспекта для сайта «Студием» (раунд 7)

Любой HTML-файл открывается **как есть**: свои шрифты, цвета, врезки и таблицы сохраняются. Сайт показывает файл в собственной защищённой рамке и меняет только раскладку (лента, книга, блоки), масштаб и пометки. Файлы в этом формате дают лучший результат в «Книге» и «Блоках».

## Правила (скопируйте целиком в чат с ИИ)

```
Сделай конспект как один самодостаточный HTML-файл для моего сайта «Студием». Правила:
1. Один файл .html. Собственные CSS и шрифты можно — сайт их НЕ трогает, файл выглядит так, как ты его сделал.
2. В <head> добавь: <meta name="studiem:title" content="Название"> , <meta name="studiem:subject" content="anatomy|patanatomy|biochem|histology|microbio|dentistry|philosophy|physiology"> , <meta name="studiem:accent" content="#3b5ba9">.
3. Блоки (необязательно): <section class="blk" data-part="КТ 1" data-lab="Название блока" data-num="1">. Один блок ≈ 5 минут чтения (150–900 слов). Если блоков нет — сайт сам разобьёт текст по заголовкам.
4. Части (контрольные точки, темы): заголовок <h2 class="part">КОНТРОЛЬНАЯ ТОЧКА 1</h2> или data-part на блоках. В режиме «Книга» новая часть начинается с левой страницы.
5. Ничего не загружай из интернета, кроме шрифтов (Google Fonts можно: Golos Text, Manrope, PT Serif, Cormorant, Lora, Inter, Source Serif 4, Playfair Display — они встроены в сайт). Картинки — только встроенные (data:image/...;base64).
6. Светлая/тёмная тема — через :root[data-theme="dark"]. Не используй position: fixed, кроме одной верхней панели с class="bar" (сайт её скроет в режимах чтения).
7. Таблицы — обычные <table>; ширину можно не задавать, сайт не даст им обрезаться. Язык — русский, латинские термины не переводить.
8. Скрипты можно (в режиме «Оригинал» они работают), но весь текст и картинки должны быть уже в HTML, а не создаваться скриптом.

Пример:
<!DOCTYPE html><html lang="ru" data-theme="light"><head><meta charset="utf-8"><title>Сердце</title>
<meta name="studiem:title" content="Сердце: клапаны"><meta name="studiem:subject" content="anatomy"><meta name="studiem:accent" content="#3b5ba9">
<link href="https://fonts.googleapis.com/css2?family=PT+Serif&display=swap" rel="stylesheet">
<style>:root{--bg:#fbf6ee;--ink:#2b2622}:root[data-theme=dark]{--bg:#14171c;--ink:#e8e8e8}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.65 "PT Serif",serif}.wrap{max-width:860px;margin:0 auto;padding:30px}
h2.part{color:#7a2e3a;border-left:6px solid #d98fa0;padding-left:12px}.lat{color:#b23a6a;font-style:italic}.callout{background:#fff3bf;padding:10px 14px;border-radius:10px}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #8a6f4d;padding:6px 8px}</style></head><body><div class="wrap">
<h1>Сердце</h1>
<h2 class="part">КОНТРОЛЬНАЯ ТОЧКА 1. Клапаны</h2>
<section class="blk" data-part="КТ 1" data-lab="Строение клапанов" data-num="1"><h3>Строение клапанов</h3>
<p>В сердце четыре клапана: митральный, трёхстворчатый и два полулунных — <span class="lat">valva mitralis</span>.</p>
<div class="callout"><b>Спросят:</b> чем отличается митральный клапан от трёхстворчатого?</div>
<table><tr><th>Клапан</th><th>Где</th></tr><tr><td>Митральный</td><td>слева</td></tr></table>
<figure><img src="data:image/png;base64,..." alt="Схема клапанов"><figcaption>Рис. 1</figcaption></figure></section>
</div></body></html>
```

## Что сайт делает с файлом
- **Оригинал** (только для файлов-приложений со скриптами): файл работает на весь экран со своими скриптами, его `localStorage` сохраняется в копию.
- **Обычный / Книга / Блоки**: скрипты файла не запускаются, его панели скрываются, а текст, картинки и стили остаются теми же. Масштаб по умолчанию 75 %, шаги 50–200 % одни для всех файлов.
- **Блоки**: берутся `section.blk`; если их нет — по заголовкам; время блока = слова/110 + 0,6 мин на картинку + 0,5 на таблицу.
- Файл без блоков и без частей — нормально.
- Ничего не уходит в интернет: рамка работает без сети (CSP `default-src 'none'`), шрифты встроены.
