// Local, rule-based "what could the teacher ask" generator (no network, no keys). Up to 3 questions per block.
// input: { title, paras: [{ text, tag, lead (bold lead text), items (number of <li> that follow) }], subject }
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const clean = s => s.replace(/\s+/g, ' ').replace(/^[\d.)\s]+(?=[A-Za-zА-Яа-яЁё])/, '').replace(/[:.\s]+$/, '').trim();
const lowerFirst = s => (/^[A-ZА-ЯЁ]{2,}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));

const KIND_FORMS = { 'виды': 'виды', 'типы': 'типы', 'формы': 'формы', 'стадии': 'стадии', 'этапы': 'этапы', 'классификация': 'классификацию', 'классификации': 'классификацию', 'вид': 'виды', 'тип': 'типы' };
const KIND_RE = /(^|[\s(])(виды|типы|формы|стадии|этапы|классификаци[яи])\s+([а-яёa-z][а-яёa-z\-]*(?:\s+[а-яёa-z\-]+)?)/i;
const DEF_RE = /^([A-ZА-ЯЁ][^.:;!?—–]{1,60}?)\s+[—–-]\s+(?:это\s+)?([а-яёa-z].{12,})/;
const CMP_RE = [/([^,.;:]{3,50}?)\s+(?:отличается|отличаются)\s+от\s+([^,.;:]{3,50})/i, /([^,.;:]{3,50}?),?\s+в\s+отличие\s+от\s+([^,.;:]{3,50})/i, /([^,.;:]{3,50}?),?\s+по\s+сравнению\s+с\s+([^,.;:]{3,50})/i];

export function autoQuestions({ title = '', paras = [] } = {}) {
  const out = [], seen = new Set();
  const add = q => { const k = q.toLowerCase(); if (!seen.has(k) && out.length < 3) { seen.add(k); out.push(q); } };
  const head = clean(title);
  if (head && head.length > 2 && head.length < 90 && !/…$/.test(title)) add(`Что известно о ${lowerFirst(head)}?`);
  const sentences = [];
  for (const p of paras) {
    const t = (p.text || '').replace(/\s+/g, ' ').trim();
    if (!t) continue;
    // bold term + dash/colon: "**Term** — ..."
    if (p.lead && /^[\s]*[—–:-]/.test(t.slice(p.lead.length)) && p.lead.length < 60) add(`Что такое ${lowerFirst(clean(p.lead))}?`);
    // lead sentence ending with ":" followed by a list of 3+ items
    if (/:$/.test(t) && (p.items || 0) >= 3) add(`Перечислите: ${lowerFirst(clean(t))}`);
    for (const s of t.split(/(?<=[.!?])\s+/)) if (s.length > 12) sentences.push(s);
  }
  for (const s of sentences) { const m = DEF_RE.exec(s); if (m) add(`Что такое ${lowerFirst(clean(m[1]))}?`); }
  for (const s of sentences) {
    const m = KIND_RE.exec(s);
    if (m) { const w = KIND_FORMS[m[2].toLowerCase()] || m[2].toLowerCase(); add(`Назовите ${w} ${clean(m[3]).toLowerCase()}`); }
  }
  for (const s of sentences) for (const re of CMP_RE) { const m = re.exec(s); if (m) { add(`Чем отличаются ${lowerFirst(clean(m[1]))} и ${lowerFirst(clean(m[2]))}?`); break; } }
  return out.map(cap);
}
