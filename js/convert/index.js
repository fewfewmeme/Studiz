// Everything that is not HTML becomes clean HTML first (with the "Studiem paper" stylesheet), then goes through the same frame.
import { wrapPaper } from './paper.js';
import { pdfToHtml } from './pdf.js';
import { toHtmlString } from '../adapt/index.js';
import { getPurify, getDocxPreview, getMammoth, getJSZip } from '../libs.js';

const firstHeading = html => { const m = /<h[12][^>]*>([\s\S]*?)<\/h[12]>/i.exec(html); const t = m ? m[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim() : ''; return t && t.length <= 90 ? t : ''; };
const countWords = html => { const t = html.replace(/<img[^>]*>/gi, ' ').replace(/<[^>]+>/g, ' '); return (t.match(/[\p{L}\p{N}]+/gu) || []).length; };

// ---- DOCX: docx-preview keeps Word's own look (its generated CSS, colours, shading, borders, tables, images); mammoth only gives the plain text ----
const LOSS_RE = /<wps:wsp|<v:shape|<w:pict|<dgm:|<w:txbxContent|<mc:AlternateContent/;
export const DOCX_NOTE = 'Часть схем из Word не отображается. Сохрани файл как PDF и загрузи PDF — будет точь-в-точь';
async function docxToFrame(buf, name, onProgress) {
  onProgress?.('Читаю Word-файл', 0.1);
  const dp = await getDocxPreview();
  const host = document.createElement('div'), styles = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-99999px;top:0;width:900px;visibility:hidden'; document.body.append(host, styles);
  try {
    await dp.renderAsync(new Blob([buf]), host, styles, { className: 'docx', inWrapper: false, breakPages: false, ignoreWidth: true, ignoreHeight: true, ignoreLastRenderedPageBreak: true, renderHeaders: false, renderFooters: false, renderFootnotes: true, renderEndnotes: true, useBase64URL: true, experimental: false });
    onProgress?.('Собираю документ', 0.7);
    // headings of a Word file are styled paragraphs: tell the reader which ones are headings (data-h) so blocks and the book can use them
    const body = host.querySelector('section.docx, article') || host;
    const sizes = [...host.querySelectorAll('p')].map(p => parseFloat(p.style.fontSize || getComputedStyle(p).fontSize) || 0).filter(v => v > 0);
    const bodySize = sizes.sort((a, b) => a - b)[sizes.length >> 1] || 11;
    host.querySelectorAll('p').forEach(p => {
      const cls = p.className || '', m = /heading[_-]?(\d)/i.exec(cls) || /title/i.test(cls) && ['', '1'];
      let lvl = m ? Math.min(3, +m[1] || 1) : 0;
      if (!lvl) {
        const t = (p.textContent || '').trim(); if (!t || t.length > 90 || p.querySelector('img,table')) return;
        const runs = [...p.querySelectorAll('span')].filter(r => r.textContent.trim()); if (!runs.length) return;
        const fs = parseFloat(runs[0].style.fontSize || getComputedStyle(runs[0]).fontSize) || 0, bold = /bold|[6-9]00/.test(runs[0].style.fontWeight || getComputedStyle(runs[0]).fontWeight);
        if (fs >= bodySize * 1.35 || (bold && fs >= bodySize * 1.15 && t.length < 60)) lvl = fs >= bodySize * 2 ? 1 : fs >= bodySize * 1.5 ? 2 : 3;
      }
      if (lvl) p.setAttribute('data-h', String(lvl));
    });
    void body;
    const css = [...styles.querySelectorAll('style')].map(x => x.textContent).join('\n');
    // shapes / text boxes / SmartArt that docx-preview cannot draw: say so, never drop silently
    let loss = false; try { const JSZip = await getJSZip(); const z = await JSZip.loadAsync(buf); const xml = await z.file('word/document.xml').async('string'); loss = LOSS_RE.test(xml); } catch { /* ignore */ }
    let plain = ''; try { const mm = await getMammoth(); plain = (await mm.extractRawText({ arrayBuffer: buf })).value.replace(/\s+/g, ' ').trim(); } catch { plain = (host.textContent || '').replace(/\s+/g, ' ').trim(); }
    const note = loss ? `<div class="lz-docx-note" data-skip="1" style="margin:12px 0;padding:10px 14px;border-radius:10px;background:#fff3cd;border:1px solid #e0c36a;color:#4a3b00;font:600 14px/1.4 -apple-system,system-ui,sans-serif">${DOCX_NOTE}</div>` : '';
    const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    const html = `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>${esc(name)}</title><meta name="studiem:title" content="${esc(name)}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:#fff}body{color:#000}.dx{max-width:860px;margin:0 auto;padding:24px 18px 80px}.dx section.docx{display:block!important;min-height:0!important;height:auto!important;width:auto!important;padding:0!important;margin:0!important;box-shadow:none!important}</style><style>${css}</style></head><body><main class="dx">${note}${host.innerHTML}</main></body></html>`;
    const words = ((host.textContent || '').match(/[\p{L}\p{N}]+/gu) || []).length;
    return { html, words, pages: 0, layout: 'text', plain, loss, engine: 'dp' };
  } finally { host.remove(); styles.remove(); }
}
export async function convertToFrame({ kind, buf, name, onProgress }) {
  if (kind === 'docx') return docxToFrame(buf, name, onProgress);
  if (kind === 'pdf') {
    const r = await pdfToHtml(buf, { onProgress, title: name });
    return { html: wrapPaper(r.body, { title: (!r.pagesLayout && firstHeading(r.body)) || name, layout: r.layout, pages: r.pagesLayout }), words: r.words, pages: r.pages, layout: r.layout };
  }
  if (kind === 'image') {
    const mime = /^\x89PNG/.test(String.fromCharCode(...new Uint8Array(buf, 0, 4))) ? 'image/png' : 'image/jpeg';
    const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(new Blob([buf], { type: mime })); });
    return { html: wrapPaper(`<img class="pdf-page" alt="${name}" src="${url}">`, { title: name, layout: 'pages', pages: true }), words: 0, pages: 1, layout: 'pages' };
  }
  onProgress?.('Читаю файл', 0.1);
  const raw = await toHtmlString(kind, buf, name);
  const purify = await getPurify();
  const clean = purify.sanitize(raw.replace(/^<body>/i, ''), { ALLOWED_URI_REGEXP: /^(?:data:image\/|#|mailto:|https?:)/i, FORBID_TAGS: ['style', 'script', 'form', 'input', 'button', 'iframe'], FORBID_ATTR: ['style', 'class', 'onclick'] });
  return { html: wrapPaper(clean, { title: firstHeading(clean) || name }), words: countWords(clean), pages: 0, layout: 'text' };
}
