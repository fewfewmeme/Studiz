// Library-wide search: titles + text, offline (IndexedDB). Snippets with the query highlighted.
import { h, debounce, escapeHtml } from '../util.js';
import { searchLibrary } from '../library.js';
import { icon } from '../icons.js';
import { subjectName, subjectStyle, typeBadge } from './common.js';

export async function renderSearch(root, initial = '') {
  root.className = 'view search-view';
  const input = h('input', { type: 'search', class: 'input search-input', placeholder: 'Поиск по всем конспектам', 'aria-label': 'Поиск', value: initial, autocomplete: 'off' });
  const list = h('div', { class: 'search-list' });
  const status = h('p', { class: 'muted' }, 'Введите хотя бы две буквы.');
  let token = 0;
  const hl = (text, q) => { let html = escapeHtml(text); for (const t of q.toLowerCase().split(/\s+/).filter(x => x.length > 1)) html = html.replace(new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'), '<mark>$1</mark>'); return html; };
  const run = async () => {
    const q = input.value.trim(), my = ++token;
    history.replaceState(null, '', '#/search/' + encodeURIComponent(q));
    if (q.length < 2) { list.replaceChildren(); status.textContent = 'Введите хотя бы две буквы.'; return; }
    status.textContent = 'Ищу…';
    const res = await searchLibrary(q, { onProgress: f => { if (my === token) status.textContent = `Ищу… ${Math.round(f * 100)}%`; } });
    if (my !== token) return;
    status.textContent = res.length ? `Найдено документов: ${res.length}` : 'Ничего не нашлось. Попробуйте другое слово.';
    list.replaceChildren(...res.map(r => {
      const a = h('a', { class: 'search-item ' + subjectStyle(r.file.subject).cls, href: `#/file/${r.file.id}` },
        h('span', { class: 'si-badge' }, typeBadge(r.file)), h('div', { class: 'si-body' }, h('strong', { html: hl(r.file.name, q) }), h('small', null, subjectName(r.file.subject)), r.snippet ? h('p', { class: 'si-snip', html: hl(r.snippet, q) }) : null));
      return a;
    }));
  };
  input.addEventListener('input', debounce(run, 250));
  root.replaceChildren(h('div', { class: 'content narrow' }, h('header', { class: 'page-head' }, h('p', { class: 'eyebrow' }, 'Библиотека'), h('h1', { class: 'display' }, 'Поиск')), h('div', { class: 'search-bar' }, icon('search', 20), input), status, list));
  if (initial) run(); setTimeout(() => input.focus({ preventScroll: true }), 50);
}
