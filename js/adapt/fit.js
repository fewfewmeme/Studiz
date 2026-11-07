// Fit Report: numbers that decide whether an adaptation is acceptable (HARD failures trigger the next fallback).
export function fitReport(r) {
  const retention = r.srcWords ? r.words / r.srcWords : 1;
  const avg = r.blocks.length ? r.blocks.reduce((a, b) => a + b.words, 0) / r.blocks.length : 0;
  const rep = {
    adapter: r.adapter, adapterVersion: r.adapterVersion, level: r.level, structure: r.structure,
    srcWords: r.srcWords, words: r.words, textRetention: Math.round(retention * 1000) / 10,
    srcImages: r.srcImages, images: r.images, blocks: r.blocks.length, avgWords: Math.round(avg),
    untitled: r.blocks.filter(b => !b.title).length, fixedOrSticky: r.fixed, contrastViolations: r.contrastViolations,
    colorsFixed: r.cssReport?.colorsFixed || 0, darkBgDropped: r.cssReport?.darkBgDropped || 0, rulesDropped: r.cssReport?.rulesDropped || 0,
    chrome: r.chrome, notes: r.notes || [],
  };
  const hard = [];
  if (retention < 0.97) hard.push(`потеряно текста: осталось ${rep.textRetention}% (нужно не меньше 97%)`);
  if (rep.images !== rep.srcImages) hard.push(`картинок было ${rep.srcImages}, стало ${rep.images}`);
  if (!rep.blocks) hard.push('нет ни одного блока');
  if (rep.fixedOrSticky) hard.push('остались «прилипающие» элементы');
  if (rep.contrastViolations) hard.push(`слабый контраст: ${rep.contrastViolations}`);
  if (rep.untitled) hard.push('есть блоки без названия');
  rep.hard = hard; rep.ok = hard.length === 0;
  rep.warnings = [];
  if (avg && (avg < 80 || avg > 900)) rep.warnings.push(`средний блок ${rep.avgWords} слов (хорошо 80–900)`);
  return rep;
}
export function reportText(rep, name = '') {
  const l = [`Отчёт об адаптации: ${name}`, `Режим: ${({ normal: 'обычный', safe: 'упрощённый', plain: 'только текст' })[rep.level] || rep.level} (адаптер ${rep.adapter} ${rep.adapterVersion}, разбиение: ${rep.structure})`,
    `Текст: ${rep.words} из ${rep.srcWords} слов (${rep.textRetention}%)`, `Картинки: ${rep.images} из ${rep.srcImages}`, `Блоков: ${rep.blocks}, в среднем ${rep.avgWords} слов`,
    `Контраст: исправлено цветов ${rep.colorsFixed}, тёмных фонов убрано ${rep.darkBgDropped}; нарушений ${rep.contrastViolations}`,
    `Убрано лишнего: ${JSON.stringify(rep.chrome)}`, `Правил CSS отброшено: ${rep.rulesDropped}`];
  if (rep.hard?.length) l.push('Проблемы: ' + rep.hard.join('; '));
  if (rep.warnings?.length) l.push('Замечания: ' + rep.warnings.join('; '));
  if (rep.fallbackFrom) l.push('Предыдущая попытка: ' + rep.fallbackFrom);
  return l.join('\n');
}
