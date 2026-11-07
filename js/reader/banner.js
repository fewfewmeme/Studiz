// Slim banner shown when a document had to be adapted in a simplified way (Fit Report did not pass the normal path).
import { h } from '../util.js';
import { customDialog, toast } from '../ui.js';
import { reportText } from '../adapt/fit.js';

export function adaptBanner(report, name) {
  if (!report || report.level === 'normal') return null;
  const txt = reportText(report, name);
  const copy = async () => { try { await navigator.clipboard.writeText(txt); toast('Отчёт скопирован. Его можно вставить в чат с Claude.'); } catch { toast('Не получилось скопировать', { error: true }); } };
  const more = () => { const m = customDialog([h('h3', null, 'Как адаптирован документ'), h('pre', { class: 'fit-report' }, txt), h('div', { class: 'modal-actions' }, h('button', { class: 'btn', onclick: copy }, 'Скопировать отчёт'), h('button', { class: 'btn btn-primary', onclick: () => m.close() }, 'Закрыть'))], { onBackdrop: () => m.close() }); };
  return h('div', { class: 'lz-banner notice' }, h('span', null, report.level === 'plain' ? 'Адаптировала только текст: исходное оформление не подошло.' : 'Адаптировала в упрощённом виде.'),
    h('button', { class: 'link-btn', onclick: more }, 'Подробнее'), h('button', { class: 'link-btn', onclick: copy }, 'Скопировать отчёт'));
}
