// Все настраиваемые правила приложения — в одном месте.

export const APP_NAME = 'Библиотека конспектов';

// Предметы (ключ используется в адресах и в базе, не меняйте ключи у существующих)
export const SUBJECTS = [
  { key: 'anatomy', name: 'Анатомия' },
  { key: 'patanatomy', name: 'Патанатомия' },
  { key: 'biochem', name: 'Биохимия' },
  { key: 'histology', name: 'Гистология' },
  { key: 'microbio', name: 'Микробиология' },
  { key: 'dentistry', name: 'Стоматология' },
  { key: 'philosophy', name: 'Философия' },
  { key: 'physiology', name: 'Физиология' },
];

// Награды в «Чеке»
export const REWARDS = {
  fishEveryMinutes: 5,   // 1 🐟 за каждые полные N минут активной учёбы за день
  shrimpPerPart: 1,      // 🦐 за каждую часть, отмеченную «Прочитала»
};

// Активное время учёбы
export const ACTIVITY_TIMEOUT_SEC = 90;  // после последнего действия время идёт ещё столько секунд

// Режим «По частям»
export const PART_LENGTHS = [3, 5, 10, 15];
export const DEFAULTS = {
  partMinutes: 5,
  pace: 'normal',            // «Мой темп»: slow ×1.4 / normal ×1 / fast ×0.75
  wpm: 130,                 // слов в минуту
  imageSeconds: 20,         // секунд на картинку
  emptyPdfPageSeconds: 60,  // страница PDF без текста
  partPreferHeadingAt: 0.6, // граница на заголовке, если часть набрала ≥ 60% цели
  partMaxRatio: 1.4,        // часть не длиннее 140% цели
  bookFontPx: 18,
  zoomMin: 0.6, zoomMax: 3,
  chime: false,             // soft chime at the end of a phase (off by default)
  trimMargins: true,        // crop PDF page margins (default for every document)
  defaultMarkColor: 1, defaultMarkerMode: false,
  bookFontMin: 12,
  bookFontMax: 32,
  autosaveMs: 1500,
  drawWithFinger: false,    // false: only Apple Pencil / mouse draw, fingers scroll
  theme: 'cyan',
  bookCover: true,
  docDark: false,            // dark background for documents (the light paper becomes black; colours and pictures are kept)
  wpmMin: 90, wpmMax: 200,
};
// Marker colours (same as --mark-1..6 in styles/tokens.css)
export const MARK_COLORS = ['#ffe58a', '#ffc9d9', '#cdeccf', '#cfe6fb', '#e6d6fb', '#f3d2b8'];
export const MARK_NAMES = ['жёлтый', 'розовый', 'зелёный', 'голубой', 'сиреневый', 'персиковый'];
export const BRUSH_COLORS = ['#ffcf33', '#ff8fb1', '#7fd18a', '#6fb7f2', '#b995f0', '#f0a66b'];   // richer, shown at 55% opacity
export const PALETTE_NAMES = MARK_NAMES;
export const PEN_COLORS = ['#151d2e', '#3b5ba9', '#1f7ba1', '#2f9e75', '#d6246e', '#e8833a'];
export const PEN_WIDTHS = [2.2, 4.2, 8];        // units of 1000 across the page width
export const BRUSH_WIDTHS = [14, 24, 38];
export const ERASER_SIZES = [0.012, 0.022, 0.04];   // fraction of page width
export const UL_STYLES = [['solid', 'Прямое'], ['wavy', 'Волна'], ['dashed', 'Пунктир'], ['double', 'Двойное']];
export const THEMES = [['cyan', 'Цианотипия'], ['deep', 'Глубина'], ['ice', 'Лёд'], ['sky', 'Небо'], ['lilac', 'Сирень'], ['rose', 'Роза']];

// Blocks mode
export const BLOCK_PLANS = [{ id: 'all', label: 'Все блоки', study: 0, rest: 0 }, { id: 'key', label: 'Только важное', study: 0, rest: 0, onlyKey: true }];   // a block is 5 or 10 minutes, chosen when it starts (see study-timer.js)
export const REST_TIPS = ['Попей воды', 'Закрой глаза и подыши', 'Встань и потянись', 'Посмотри в окно', 'Ляг и полежи', 'Пройдись по комнате', 'Разомни шею и плечи'];

export const BACKUP_REMINDER_DAYS = 5;
export const RECENT_COUNT = 5;
export const ACCEPT = '.pdf,.html,.htm,.docx,.txt,.md,.markdown,.jpg,.jpeg,.png,.heic,.heif,.webp,application/pdf,text/html,text/plain,text/markdown,image/jpeg,image/png,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const LARGE_DATA_IMAGE_BYTES = 2048;  // data:-картинки больше этого выносятся в отдельные записи
export const DB_NAME = 'konspekty';
export const DB_VERSION = 2;
export const SCHEMA_VERSION = 2;   // data model version (see js/migrate.js)
