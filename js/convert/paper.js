// "Studiem paper": the default stylesheet for documents that have none of their own (PDF text, DOCX, Markdown, TXT, photos).
export const PAPER_CSS = `
html{background:#fbfaf7}
body{margin:0;background:#fbfaf7;color:#1c2330;font:17px/1.65 "Manrope",system-ui,-apple-system,sans-serif;font-weight:500}
.paper{max-width:760px;margin:0 auto;padding:36px 28px 80px}
h1,h2,h3,h4{font-family:"Cormorant","Cormorant Garamond",Georgia,serif;font-weight:600;color:#14203a;line-height:1.2;letter-spacing:0}
h1{font-size:2.1em;margin:.2em 0 .5em}h2{font-size:1.6em;margin:1.6em 0 .5em}h3{font-size:1.3em;margin:1.4em 0 .4em}h4{font-size:1.1em;margin:1.2em 0 .3em;font-family:inherit;font-weight:700}
p{margin:.8em 0}ul,ol{padding-left:1.4em}li{margin:.25em 0}
table{border-collapse:collapse;width:100%;margin:1em 0;font-size:.92em}th,td{border:1px solid #c9d1de;padding:7px 9px;text-align:left;vertical-align:top}th{background:#eef2f8}
blockquote,.callout{margin:1em 0;padding:10px 16px;border-left:4px solid #6f8fd6;background:#eef3fc;border-radius:0 10px 10px 0}
pre,code{font-family:ui-monospace,Menlo,monospace;font-size:.88em}pre{background:#f1f3f7;padding:12px 14px;border-radius:10px;white-space:pre-wrap}
img{max-width:100%;height:auto;border-radius:6px}figure{margin:1em 0}figcaption{font-size:.88em;color:#58637a}
hr{border:0;border-top:1px solid #d9deea;margin:2em 0}
.pdf-page{display:block;width:100%;height:auto;margin:0 auto 14px;border-radius:4px;box-shadow:0 0 0 1px #d9deea}
.pages{max-width:980px;margin:0 auto;padding:20px 14px 80px}
`;
export function wrapPaper(bodyHtml, { title = '', layout = '', lang = 'ru', pages = false } = {}) {
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"><title>${esc(title)}</title><meta name="studiem:title" content="${esc(title)}">` +
    (layout ? `<meta name="studiem:layout" content="${layout}">` : '') + `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${PAPER_CSS}</style></head><body><main class="${pages ? 'pages' : 'paper'}">${bodyHtml}</main></body></html>`;
}
