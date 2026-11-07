// Text decoding and cleaning.
export function decodeBytes(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let enc = 'utf-8', start = 0;
  if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) start = 3;
  else if (bytes[0] === 0xFF && bytes[1] === 0xFE) { enc = 'utf-16le'; start = 2; }
  else if (bytes[0] === 0xFE && bytes[1] === 0xFF) { enc = 'utf-16be'; start = 2; }
  const slice = start ? bytes.subarray(start) : bytes;
  let text;
  try { text = new TextDecoder(enc, { fatal: true }).decode(slice); }
  catch {
    const head = new TextDecoder('latin1').decode(bytes.subarray(0, 4096));
    const m = /charset\s*=\s*["']?([\w-]+)/i.exec(head);
    let label = m ? m[1].toLowerCase() : 'windows-1251';
    if (label === 'utf-8' || label === 'utf8') label = 'windows-1251';
    try { text = new TextDecoder(label).decode(slice); } catch { text = new TextDecoder('windows-1251').decode(slice); }
  }
  return repairMojibake(text.replace(/^﻿/, ''));
}
// UTF-8 text that was read as Latin-1 / cp1251 ("РџСЂРёРІРµС‚", "Ð¿Ñ€Ð¸Ð²ÐµÑ‚") -> original
export function repairMojibake(s) {
  const sample = s.slice(0, 20000);
  const bad1 = (sample.match(/[ÐÑ][\u0080-¿Ѐ-ӿ]/g) || []).length;
  const bad2 = (sample.match(/[РС][\u0080-¿‘-›Ђ-Џђ-џ]/g) || []).length;
  const cyr = (sample.match(/[А-яЁё]/g) || []).length;
  try {
    if (bad1 > 8 && bad1 > cyr / 4) { const b = Uint8Array.from(s, c => c.charCodeAt(0) & 255); return new TextDecoder('utf-8', { fatal: true }).decode(b); }
    if (bad2 > 12 && bad2 > cyr / 3) { const enc = new Map(); for (let i = 0x80; i < 256; i++) { const ch = new TextDecoder('windows-1251').decode(Uint8Array.of(i)); enc.set(ch, i); } const b = Uint8Array.from(s, c => (c.charCodeAt(0) < 128 ? c.charCodeAt(0) : enc.get(c) ?? 63)); return new TextDecoder('utf-8', { fatal: true }).decode(b); }
  } catch { /* not repairable: keep as decoded */ }
  return s;
}
// invisible junk; Latin terms and numbers are never touched
export function cleanText(s) {
  return s.replace(/[­​‌‍⁠﻿]/g, '').replace(/ {2,}/g, ' ').replace(/[ \t]{3,}/g, '  ');
}
// very light typographic care: short Russian prepositions stay with the next word, spaced hyphen -> en dash
export function typo(s) {
  return s.replace(/(^|[\s(«])(а|в|и|к|о|с|у|на|по|за|из|от|до|не|ни|но|я)\s+(?=[А-Яа-яЁё])/g, '$1$2 ').replace(/ [-–] (?=\S)/g, ' – ');
}
export function detectLang(text) {
  const t = text.slice(0, 5000), cyr = (t.match(/[А-Яа-яЁё]/g) || []).length, lat = (t.match(/[A-Za-z]/g) || []).length;
  return cyr > lat ? 'ru' : (lat > 20 ? 'en' : 'ru');
}
export const WORD_RE = /[\p{L}\p{N}]+/gu;
export const countWordsIn = s => (s.match(WORD_RE) || []).length;
// text of an element with a space at every element boundary (textContent glues "<td>a</td><td>b</td>" into "ab")
export function textJoined(el) {
  const w = (el.ownerDocument || document).createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const out = []; while (w.nextNode()) { const p = w.currentNode.parentElement; if (p && /^(STYLE|SCRIPT)$/.test(p.tagName)) continue; out.push(w.currentNode.data); }
  return out.join(' ');
}
export const wordsOf = el => countWordsIn(textJoined(el));
