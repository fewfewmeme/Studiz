// Ленивая загрузка сторонних библиотек из vendor/ (никаких внешних запросов).
import { loadScript } from './util.js';

const base = new URL('../vendor/', import.meta.url).href;

let pdfjsP = null;
export function getPdfjs() {
  if (!pdfjsP) {
    pdfjsP = import('../vendor/pdfjs/pdf.min.mjs').then(m => {
      m.GlobalWorkerOptions.workerSrc = base + 'pdfjs/pdf.worker.min.mjs';
      return m;
    }).catch(e => { pdfjsP = null; throw e; });
  }
  return pdfjsP;
}

export async function openPdf(data) {
  const pdfjs = await getPdfjs();
  const task = pdfjs.getDocument({
    data,
    cMapUrl: base + 'pdfjs/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: base + 'pdfjs/standard_fonts/',
    wasmUrl: base + 'pdfjs/wasm/',
    isEvalSupported: false,
    enableXfa: false,
  });
  return task.promise;
}

export async function getJSZip() {
  await loadScript('vendor/jszip.min.js');
  return window.JSZip;
}
export async function getMammoth() {
  await loadScript('vendor/mammoth.browser.min.js');
  return window.mammoth;
}
let markedP = null;
export function getMarked() { return (markedP ||= import('../vendor/marked.esm.js')); }
let purifyP = null;
export async function getPurify() {
  purifyP ||= import('../vendor/purify.es.mjs').then(m => m.default);
  return purifyP;
}

// DOCX rendering that keeps Word's own look (pinned 0.3.5, self-hosted); needs JSZip
let dpP = null;
export async function getDocxPreview() {
  if (!dpP) dpP = getJSZip().then(() => loadScript('vendor/docx-preview/docx-preview.min.js')).then(() => window.docx).catch(e => { dpP = null; throw e; });
  return dpP;
}
