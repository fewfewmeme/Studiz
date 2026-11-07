// «Текст» (заметка): pure helpers, no DOM. A note is pasted / typed text kept as HTML in the same document format as every other file,
// so the reader (modes, marks, blocks, timer) treats it like any file. Allowed inline styles are whitelisted here.

export const NOTE_FONTS = [
  ['', 'Как в документе'],
  ['sans', 'Без засечек'],
  ['serif', 'С засечками'],
  ['hand', 'Рукописный'],
  ['mono', 'Моноширинный'],
];
export const FONT_STACK = {
  sans: '"Manrope",system-ui,-apple-system,sans-serif',
  serif: 'Georgia,"Times New Roman",serif',
  hand: '"Segoe Print","Bradley Hand","Noteworthy","Comic Sans MS",cursive',
  mono: 'ui-monospace,Menlo,monospace',
};
export const NOTE_COLORS = ['#1c2330', '#c0392b', '#d35400', '#b7950b', '#1e8449', '#1f6fb2', '#6c3fb5', '#c2185b', '#7f8c8d'];
export const NOTE_SIZES = [14, 16, 18, 20, 24, 30, 38];
export const WRAPS = [['left', 'Слева от текста'], ['right', 'Справа от текста'], ['none', 'Без обтекания']];

// does this plain text look like Markdown that was copied as raw text (so it must be rendered)?
export function looksLikeMarkdown(t) {
  const s = String(t || '');
  if (/\*\*[^*\n]+\*\*/.test(s) || /(^|\s)__[^_\n]+__(\s|$)/.test(s)) return true;           // **bold**
  if (/^\s{0,3}#{1,6}\s+\S/m.test(s)) return true;                                           // # heading
  if (/^\s*\|.+\|\s*\n\s*\|\s*:?-{2,}/m.test(s)) return true;                                // | table |
  if (/^\s*([-*+]|\d+[.)])\s+\S/m.test(s) && /\n/.test(s.trim())) return true;               // lists
  if (/(^|[^*])\*[^*\s][^*\n]*\*([^*]|$)/.test(s) || /`[^`\n]+`/.test(s)) return true;       // *italic*, `code`
  if (/^>\s+\S/m.test(s) || /^\s*---+\s*$/m.test(s)) return true;
  return false;
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// plain text without Markdown: blank line = paragraph, single newline = line break
export function plainToHtml(t) {
  return String(t).replace(/\r\n?/g, '\n').split(/\n{2,}/).map(p => p.trim()).filter(Boolean).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('\n');
}

// ---- inline style whitelist ----
const OK = {
  'color': v => /^(#[0-9a-f]{3,8}|rgba?\(\s*[\d.\s,%]+\)|[a-z]{3,20})$/i.test(v),
  'background-color': v => /^(#[0-9a-f]{3,8}|rgba?\(\s*[\d.\s,%]+\)|[a-z]{3,20})$/i.test(v),
  'font-size': v => /^(\d{1,3}(\.\d+)?(px|pt|em|rem|%)|xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large)$/i.test(v),
  'font-family': v => /^[\w\s,"'.-]{1,160}$/.test(v) && !/url|expression|\\/i.test(v),
  'font-weight': v => /^(normal|bold|[1-9]00)$/.test(v),
  'font-style': v => /^(normal|italic)$/.test(v),
  'text-decoration': v => /^(none|underline|line-through|underline line-through|line-through underline)$/.test(v),
  'text-decoration-line': v => /^(none|underline|line-through)$/.test(v),
  'text-align': v => /^(left|right|center|justify)$/.test(v),
  'float': v => /^(left|right|none)$/.test(v),
  'display': v => /^(block|inline|inline-block)$/.test(v),
  'width': v => /^\d{1,4}(\.\d+)?(px|%)$/.test(v),
  'margin': v => /^[\d.\s]+(px|em|%)?(\s+[\d.-]+(px|em|%)?){0,3}$|^auto$|^0 auto$/.test(v),
  'transform': v => /^rotate\(-?\d{1,3}(\.\d+)?deg\)$/.test(v),
};
export function cleanStyle(style) {
  const out = [];
  for (const decl of String(style || '').split(';')) {
    const i = decl.indexOf(':'); if (i < 0) continue;
    const k = decl.slice(0, i).trim().toLowerCase(), v = decl.slice(i + 1).trim();
    if (OK[k] && v && OK[k](v)) out.push(`${k}:${v}`);
  }
  return out.join(';');
}

// the image rules live in the document, so the reader shows the same wrapping as the editor
export const NOTE_CSS = `
.paper img[data-wrap]{height:auto;max-width:100%;transform-origin:center}
.paper img[data-wrap="left"]{float:left;margin:.3em 1em .6em 0}
.paper img[data-wrap="right"]{float:right;margin:.3em 0 .6em 1em}
.paper img[data-wrap="none"]{display:block;float:none;margin:1em auto}
.paper::after{content:"";display:block;clear:both}
.paper table{display:table}
`;
export function buildNoteDoc(bodyHtml, title, wrapPaper) {
  const html = wrapPaper(bodyHtml, { title, layout: 'text' });
  return html.replace('</style></head>', NOTE_CSS + '</style></head>');
}
export const countWordsHtml = html => (String(html).replace(/<img[^>]*>/gi, ' ').replace(/<[^>]+>/g, ' ').match(/[\p{L}\p{N}]+/gu) || []).length;
export const titleFromText = (html, fallback = 'Текст') => {
  const m = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(html) || /<p[^>]*>([\s\S]*?)<\/p>/i.exec(html);
  const t = m ? m[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim() : '';
  return t ? t.slice(0, 60) : fallback;
};
