// Settings: look (themes, wallpapers, subject stickers), install as an app, reading, storage and backups.
import { PART_LENGTHS, DEFAULTS, THEMES, SUBJECTS, MARK_COLORS, MARK_NAMES } from '../../config.js';
import { h, fmtBytes } from '../util.js';
import { settings, setSetting } from '../settings.js';
import { backupFlow, restoreFlow, lastBackupAt, backupAgeText } from '../backup.js';
import { setTheme, applyTheme } from '../theme.js';
import { icon } from '../icons.js';
import { refreshShell } from '../shell.js';
import { stickerNames, stickerImg, subjectStickerName, setSubjectSticker, wallpaperList, wallpaperChoice, setWallpaperChoice, posterUrl, posterCropUrl } from '../assets.js';
import { subjectStyle } from './common.js';
import { toast, progressDialog, confirmDialog } from '../ui.js';
import * as lib from '../library.js';
import * as db from '../db.js';
import { readapt } from '../importer.js';
import { FORMAT_RULES } from '../adapt/format-rules.js';
import { resetViewState } from '../viewstate.js';

const PREVIEW = { cyan: ['#eef2f6', '#3b5ba9', '#00172f'], deep: ['#00172f', '#51c8fa', '#003056'], ice: ['#f1f4f7', '#4a78b0', '#0b2340'], sky: ['#eaf3fb', '#2f78b7', '#07305a'], lilac: ['#f2f0f8', '#6e58b4', '#1b1745'], rose: ['#f7eff2', '#b0486e', '#3a1727'] };
const isStandalone = () => window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

export async function renderSettings(root) {
  root.className = 'view settings-view';
  const s = settings();
  const card = (title, ...kids) => h('section', { class: 'card' }, h('h2', { class: 'card-title' }, title), ...kids);
  const pressed = (btns, on) => btns.forEach(b => { b.classList.toggle('on', b === on); b.setAttribute('aria-pressed', String(b === on)); });

  // ---- look ----
  const themeCards = THEMES.map(([k, label]) => h('button', { class: 'theme-card' + (s.theme === k ? ' on' : ''), 'aria-pressed': String(s.theme === k), onclick: async e => { await setTheme(k); pressed(themeCards, e.currentTarget); drawWalls(); } },
    h('span', { class: 'theme-prev' }, PREVIEW[k].map(c => h('i', { style: { background: c } }))), h('strong', null, label)));
  const wallBox = h('div', { class: 'wall-grid' });
  const drawWalls = () => {
    const cur = wallpaperChoice();
    const items = [h('button', { class: 'wall-card' + (!cur ? ' on' : ''), style: { background: 'var(--bg-grad)' }, onclick: async () => { await setWallpaperChoice(null); applyTheme(); drawWalls(); } }, h('span', null, 'Как в теме'))];
    for (const w of wallpaperList()) items.push(h('button', { class: 'wall-card' + (cur === w.key ? ' on' : ''), style: { backgroundImage: `url("${w.portrait}")` }, onclick: async () => { await setWallpaperChoice(w.key); applyTheme(); drawWalls(); } }, h('span', null, w.title || w.key)));
    wallBox.replaceChildren(...items);
  };
  drawWalls();
  const pickBox = h('div', { class: 'sticker-pool', hidden: true });
  let pickFor = null;
  const subjChips = SUBJECTS.map(sj => {
    const chip = h('button', { class: 'chip', 'aria-pressed': 'false', onclick: () => { pickFor = sj.key; subjChips.forEach(c => { c.classList.toggle('on', c === chip); c.setAttribute('aria-pressed', String(c === chip)); }); drawPool(); } }, stickerImg(subjectStickerName(sj.key)), sj.name);
    chip.dataset.subj = sj.key;
    return chip;
  });
  const drawPool = () => {
    pickBox.hidden = !pickFor;
    if (!pickFor) return;
    const cur = subjectStickerName(pickFor);
    pickBox.className = 'sticker-pool ' + subjectStyle(pickFor).cls;
    pickBox.replaceChildren(...stickerNames().map(n => h('button', { class: 'pool-item' + (n === cur ? ' on' : ''), 'aria-label': n, 'aria-pressed': String(n === cur), onclick: async () => {
      await setSubjectSticker(pickFor, n);
      const chip = subjChips.find(c => c.dataset.subj === pickFor); chip.firstChild.replaceWith(stickerImg(n));
      drawPool(); refreshShell(); toast('Обложка изменена');
    } }, stickerImg(n))));
  };

  // ---- install ----
  const install = card('Установить на экран «Домой»',
    h('p', { class: 'muted' }, isStandalone() ? 'Приложение уже открыто с экрана «Домой»: панелей Safari нет, места для чтения больше.' : 'Так исчезнут панели Safari и документ займёт почти весь экран:'),
    isStandalone() ? null : h('ol', { class: 'install-steps' },
      h('li', null, 'Нажмите «Поделиться» ', icon('share', 16), ' в Safari.'),
      h('li', null, 'Выберите «На экран „Домой“» и нажмите «Добавить».'),
      h('li', null, 'Откройте «Конспекты» с экрана «Домой».')));

  // ---- reading ----
  const partBtns = PART_LENGTHS.map(m => h('button', { class: 'seg-btn' + (s.partMinutes === m ? ' on' : ''), 'aria-pressed': String(s.partMinutes === m), onclick: async e => { await setSetting({ partMinutes: m }); pressed(partBtns, e.currentTarget); } }, `${m} мин`));
  const wpmVal = h('strong', null, String(s.wpm));
  const wpm = h('input', { type: 'range', min: DEFAULTS.wpmMin, max: DEFAULTS.wpmMax, step: 5, value: s.wpm, 'aria-label': 'Слов в минуту' });
  wpm.addEventListener('input', () => { wpmVal.textContent = wpm.value; });
  wpm.addEventListener('change', () => setSetting({ wpm: Number(wpm.value) }));
  const toggle = (label, desc, key) => { const i = h('input', { type: 'checkbox' }); i.checked = !!settings()[key]; i.addEventListener('change', () => setSetting({ [key]: i.checked })); return h('label', { class: 'switch-row' }, h('span', null, h('strong', null, label), h('small', null, desc)), i); };
  const markSw = MARK_COLORS.map((c, i) => h('button', { class: 'sw' + ((s.defaultMarkColor || 1) === i + 1 ? ' on' : ''), style: { background: c }, 'aria-label': MARK_NAMES[i], 'aria-pressed': String((s.defaultMarkColor || 1) === i + 1), onclick: async e => { await setSetting({ defaultMarkColor: i + 1 }); markSw.forEach(b => { b.classList.toggle('on', b === e.currentTarget); b.setAttribute('aria-pressed', String(b === e.currentTarget)); }); } }));

  // ---- storage ----
  const storage = h('p', { class: 'muted' }, 'Считаем…'), meter = h('div', { class: 'storage-meter' }, h('i', { style: { width: '0%' } })), persist = h('p', { class: 'muted', id: 'persist-state' }, '');
  const showStorage = async () => {
    try {
      if (navigator.storage?.estimate) { const { usage, quota } = await navigator.storage.estimate(); storage.textContent = `Занято: ${fmtBytes(usage)}` + (quota ? `. Свободно для сайта: ${fmtBytes(Math.max(0, quota - usage))}` : ''); if (quota) meter.firstChild.style.width = Math.max(1, Math.min(100, usage / quota * 100)) + '%'; }
      else storage.textContent = 'Браузер не сообщает занятое место.';
      if (navigator.storage?.persisted) persist.textContent = (await navigator.storage.persisted()) ? 'Защита от автоматической очистки: включена.' : 'Защита от автоматической очистки: выключена. Safari может стереть данные сайта, который не открывали около недели. Делайте копии.';
    } catch { storage.textContent = 'Не удалось узнать занятое место.'; }
  };
  showStorage();
  const askPersist = h('button', { class: 'btn btn-sm', onclick: async () => { try { const ok = await navigator.storage?.persist?.(); toast(ok ? 'Хранилище защищено' : 'Браузер не дал защиту (она может появиться после установки на экран «Домой»)'); } catch { toast('Не получилось запросить защиту', { error: true }); } showStorage(); } }, 'Защитить хранилище');
  navigator.storage?.persist?.().then(showStorage).catch(() => {});
  const lastBk = h('p', { class: 'muted' }, '');
  const showLast = async () => { const t = await lastBackupAt(); lastBk.textContent = t ? `${backupAgeText(t)} (${new Date(t).toLocaleString('ru-RU')})` : 'Копию ещё не делали.'; refreshShell(); };
  showLast();
  const fileIn = h('input', { type: 'file', accept: '.zip,application/zip', hidden: true });
  fileIn.addEventListener('change', async () => { const f = fileIn.files[0]; fileIn.value = ''; if (f && await restoreFlow(f)) { refreshShell(); location.hash = '#/'; } });

  const trashBox = h('div', { class: 'trash-list' });
  const drawTrash = async () => {
    const list = await lib.trashList();
    trashBox.replaceChildren(...(list.length ? list.map(f => h('div', { class: 'trash-item' }, h('div', null, h('strong', null, f.name), h('small', null, `удалён ${new Date(f.deleted).toLocaleDateString('ru-RU')} · исчезнет через ${Math.max(0, lib.TRASH_DAYS - Math.floor((Date.now() - f.deleted) / 86400000))} дн.`)),
      h('button', { class: 'btn btn-sm', onclick: async () => { await lib.restoreFile(f.id); drawTrash(); refreshShell(); } }, 'Вернуть'),
      h('button', { class: 'btn btn-sm btn-danger-soft', onclick: async () => { if (await confirmDialog(`Удалить «${f.name}» навсегда? Это нельзя отменить.`, { ok: 'Удалить', danger: true })) { await lib.deleteFile(f.id); drawTrash(); } } }, 'Навсегда'))) : [h('p', { class: 'muted' }, 'Корзина пуста. Удалённые документы лежат здесь 30 дней.')]));
  };
  drawTrash();
  const trashCard = () => card('Корзина', trashBox);
  const rebuildCard = () => card('Адаптация документов', h('p', { class: 'muted' }, 'Если сайт научился лучше адаптировать файлы, документы можно пересобрать из оригиналов. Пометки, прогресс и закладки остаются.'),
    h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: async () => {
      const files = (await lib.liveFiles()).filter(f => f.type === 'html' && !f.note); if (!files.length) { toast('Пересобирать пока нечего'); return; }
      const p = progressDialog('Адаптирую заново'); let i = 0, err = 0;
      for (const f of files) { p.update(i / files.length, `${i + 1} из ${files.length}: ${f.name}`); try { await readapt(f.id); } catch { err++; } i++; await new Promise(r => setTimeout(r, 0)); }
      p.close(); toast(err ? `Пересобрано ${files.length - err}, не получилось: ${err}` : `Пересобрано документов: ${files.length}`);
    } }, 'Пересобрать все документы')));
  const poster = posterUrl();
  root.replaceChildren(h('div', { class: 'content narrow' },
    h('header', { class: 'poster-panel split', style: poster ? { '--poster': `url("${poster}")`, '--poster-crop': `url("${posterCropUrl()}")` } : {} }, h('p', { class: 'eyebrow' }, 'Конспекты'), h('h1', { class: 'display' }, 'Настройки')),
    card('Оформление', h('div', { class: 'theme-grid' }, themeCards), h('p', { class: 'eyebrow mt' }, 'Фон'), wallBox),
    card('Обложки предметов', h('p', { class: 'muted' }, 'Нажмите предмет и выберите другую наклейку.'), h('div', { class: 'subj-pick' }, subjChips), pickBox),
    install,
    card('Мой темп (режим «Блоки»)', h('p', { class: 'muted' }, 'Время блока считается по заучиванию (около 70 слов в минуту), а не по беглому чтению. Если вы запоминаете медленнее или быстрее, поправьте темп.'),
      h('div', { class: 'segmented flat pace-seg', role: 'group', 'aria-label': 'Мой темп' }, ...[['slow', 'Медленно ×1.4'], ['normal', 'Обычно ×1'], ['fast', 'Быстро ×0.75']].map(([k, l]) => h('button', { class: 'seg-btn' + ((s.pace || 'normal') === k ? ' on' : ''), type: 'button', 'aria-pressed': String((s.pace || 'normal') === k), onclick: async e => { await setSetting({ pace: k }); e.currentTarget.parentElement.querySelectorAll('.seg-btn').forEach(b => { b.classList.remove('on'); b.setAttribute('aria-pressed', 'false'); }); e.currentTarget.classList.add('on'); e.currentTarget.setAttribute('aria-pressed', 'true'); } }, l))),
      h('p', { class: 'muted' }, 'Изменения действуют при следующем открытии документа. На каждом блоке есть «Разделить» и «Объединить со следующим».')),
    card('Чтение и рисование', h('p', { class: 'eyebrow' }, 'Шрифт текста'), h('div', { class: 'segmented flat' }, ...[['sans', 'Manrope'], ['serif', 'С засечками']].map(([k, l]) => h('button', { class: 'seg-btn' + ((s.readFont || 'sans') === k ? ' on' : ''), onclick: async e => { await setSetting({ readFont: k }); applyTheme(); e.currentTarget.parentElement.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('on', b === e.currentTarget)); } }, l))), toggle('Обложка в книге', 'Слева на первом развороте — обложка; выключено: первая страница по центру', 'bookCover'), toggle('Обрезать поля PDF по умолчанию', 'Показывать только область с текстом (в каждом документе можно переключить)', 'trimMargins'), toggle('Тихий сигнал в конце блока', 'Мягкий звук, когда время вышло (по умолчанию выключено)', 'chime'), toggle('Рисовать пальцем', 'Выключено: рисует только Apple Pencil, пальцем — прокрутка', 'drawWithFinger'),
      toggle('Режим маркера по умолчанию', 'Выделил текст — он сразу закрашен', 'defaultMarkerMode'), h('p', { class: 'eyebrow' }, 'Цвет маркера по умолчанию'), h('div', { class: 'swatches' }, markSw)),
    card('Хранилище', storage, meter, persist, h('div', { class: 'actions' }, askPersist)),
    card('Резервная копия', lastBk,
      h('div', { class: 'actions' }, h('button', { class: 'btn btn-primary', onclick: async () => { await backupFlow(); showLast(); } }, icon('download', 18), h('span', null, 'Сделать копию')), h('button', { class: 'btn', onclick: () => fileIn.click() }, 'Восстановить из копии')),
      h('p', { class: 'muted' }, 'Копия — один ZIP-файл: документы, пометки, прогресс блоков, настройки. Сохраните его в «Файлы» или iCloud Drive.')),
    card('Подсказки', h('p', { class: 'muted' }, 'Три короткие карточки о том, как всё устроено.'), h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: () => import('./tour.js').then(m => m.maybeTour(true)) }, 'Показать подсказки'))),
    card('Новые файлы', h('p', { class: 'muted' }, 'Если делаете конспекты с помощью Claude, отдайте ему правила: тогда файл откроется без потерь — блоки, цвета, вопросы для «Спросят».'), h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: async () => { try { await navigator.clipboard.writeText(FORMAT_RULES); toast('Правила скопированы. Вставьте их в чат.'); } catch { toast('Не получилось скопировать', { error: true }); } } }, icon('copy', 18), h('span', null, 'Скопировать правила для новых файлов')))),
    card('Если читалка ведёт себя странно', h('p', { class: 'muted' }, 'Сбрасывает только вид: масштаб, положение в тексте, ширину и шрифт каждого файла, а также кэш сайта. Файлы, пометки, закладки, чеки и копии не трогаются.'),
      h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: async () => {
        if (!(await confirmDialog('Сбросить вид читалки и кэш сайта? Файлы и пометки останутся.', { ok: 'Сбросить' }))) return;
        const r = await resetViewState(); toast(`Готово: сброшено видов ${r.views}, очищено кэшей ${r.caches}. Страница перезагрузится.`); setTimeout(() => location.reload(), 900);
      } }, 'Сбросить вид читалки'))),
    trashCard(), rebuildCard(),
    card('О приложении', h('p', { class: 'muted' }, 'Все данные хранятся только на этом устройстве. Сайт ничего не отправляет в интернет.')),
    fileIn));
}
