// Диалоги, уведомления, прогресс. Без нативных alert/confirm/prompt (они плохо работают в «приложении» на iPad).
import { h } from './util.js';

let layer = null;
function getLayer() {
  if (!layer) { layer = h('div', { class: 'ui-layer' }); document.body.append(layer); }
  return layer;
}

function modal(content, { onBackdrop, sheet } = {}) {
  const back = h('div', { class: 'modal-back' + (sheet ? ' sheet' : ''), role: 'dialog', 'aria-modal': 'true' });
  const box = h('div', { class: 'modal' }, content);
  back.append(box);
  back.addEventListener('pointerdown', e => { if (e.target === back && onBackdrop) onBackdrop(); });
  getLayer().append(back);
  return { back, box, close: () => back.remove() };
}

export function confirmDialog(text, { ok = 'Да', cancel = 'Отмена', danger = false, title = '' } = {}) {
  return new Promise(resolve => {
    const done = v => { m.close(); resolve(v); };
    const m = modal([
      title && h('h3', null, title),
      h('p', { class: 'modal-text' }, text),
      h('div', { class: 'modal-actions' },
        h('button', { class: 'btn', onclick: () => done(false) }, cancel),
        h('button', { class: 'btn ' + (danger ? 'btn-danger' : 'btn-primary'), onclick: () => done(true) }, ok)),
    ], { onBackdrop: () => done(false) });
  });
}

export function alertDialog(text, { title = '', ok = 'Понятно' } = {}) {
  return new Promise(resolve => {
    const done = () => { m.close(); resolve(); };
    const m = modal([
      title && h('h3', null, title),
      h('p', { class: 'modal-text' }, text),
      h('div', { class: 'modal-actions' }, h('button', { class: 'btn btn-primary', onclick: done }, ok)),
    ], { onBackdrop: done });
  });
}

export function promptDialog(title, value = '', { ok = 'Готово', multiline = false, placeholder = '', extra = null } = {}) {
  return new Promise(resolve => {
    const input = multiline
      ? h('textarea', { class: 'input', rows: 5, placeholder })
      : h('input', { class: 'input', type: 'text', placeholder });
    input.value = value;
    const done = v => { m.close(); resolve(v); };
    const submit = () => { const v = input.value.trim(); if (v || multiline) done(input.value.trim()); };
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !multiline) { e.preventDefault(); submit(); } });
    const m = modal([
      h('h3', null, title),
      input,
      extra,
      h('div', { class: 'modal-actions' },
        h('button', { class: 'btn', onclick: () => done(null) }, 'Отмена'),
        h('button', { class: 'btn btn-primary', onclick: submit }, ok)),
    ], { onBackdrop: () => done(null) });
    setTimeout(() => { input.focus(); input.select?.(); }, 30);
  });
}

// Выбор из вариантов: options = [{label, value, danger}]
export function chooseDialog(text, options, { title = '' } = {}) {
  return new Promise(resolve => {
    const done = v => { m.close(); resolve(v); };
    const m = modal([
      title && h('h3', null, title),
      text && h('p', { class: 'modal-text' }, text),
      h('div', { class: 'modal-stack' },
        options.map(o => h('button', { class: 'btn ' + (o.danger ? 'btn-danger' : o.primary ? 'btn-primary' : ''), onclick: () => done(o.value) }, o.label)),
        h('button', { class: 'btn btn-quiet', onclick: () => done(null) }, 'Отмена')),
    ], { onBackdrop: () => done(null) });
  });
}

// Произвольное содержимое; возвращает {close, box}
export function customDialog(content, opts) { return modal(content, opts); }

export function toast(text, { error = false, ms = 3500, action = null } = {}) {
  const t = h('div', { class: 'toast' + (error ? ' toast-error' : ''), role: 'status' }, text, action ? h('button', { class: 'toast-act', type: 'button', onclick: () => { t.remove(); action.fn(); } }, action.label) : null);
  getLayer().append(t);
  setTimeout(() => t.remove(), ms);
  return t;
}

// Окно прогресса: p.update(доля 0..1, текст); p.close()
export function progressDialog(title) {
  const bar = h('div', { class: 'progress-bar' });
  const fill = h('div', { class: 'progress-fill' });
  bar.append(fill);
  const label = h('div', { class: 'progress-label' }, '');
  const m = modal([h('h3', null, title), bar, label]);
  return {
    update(frac, text) {
      fill.style.width = Math.round(Math.max(0, Math.min(1, frac)) * 100) + '%';
      if (text != null) label.textContent = text;
    },
    close: m.close,
  };
}

// Всплывающее меню у кнопки: items = [{label, onClick, danger}]
// Placement follows the VISUAL viewport (the on-screen keyboard shrinks it): the list always gets a max-height and scrolls, opens below or above
// whichever side has more room, and on touch screens a long list becomes a bottom sheet above the keyboard (never cut off by the screen edge).
export function menu(anchor, items) {
  const back = h('div', { class: 'menu-back' });
  const list = h('div', { class: 'menu', role: 'menu' },
    items.map(it => h('button', {
      class: 'menu-item' + (it.danger ? ' danger' : ''), role: 'menuitem',
      onclick: () => { close(); it.onClick(); },
    }, it.label)));
  back.append(list);
  const vv = window.visualViewport, coarse = matchMedia('(pointer: coarse)').matches;
  const close = () => { vv?.removeEventListener('resize', place); vv?.removeEventListener('scroll', place); removeEventListener('orientationchange', close); back.remove(); };
  back.addEventListener('pointerdown', e => { if (e.target === back) close(); });
  addEventListener('orientationchange', close);
  function place() {
    const vt = vv ? vv.offsetTop : 0, vh = vv ? vv.height : innerHeight, vw = vv ? vv.width : innerWidth, vl = vv ? vv.offsetLeft : 0, m = 8;
    const r = anchor.getBoundingClientRect();
    list.style.maxHeight = ''; list.style.overflowY = 'auto';
    if (coarse && items.length > 6) {      // bottom sheet above the keyboard
      back.classList.add('sheet');
      Object.assign(list.style, { left: vl + 'px', right: 'auto', width: vw + 'px', top: 'auto', bottom: (innerHeight - (vt + vh)) + 'px', maxHeight: Math.round(Math.min(vh * 0.55, 420)) + 'px', borderRadius: 'var(--r-l) var(--r-l) 0 0' });
      return;
    }
    const need = Math.min(list.scrollHeight, 320);
    const below = vt + vh - r.bottom - m, above = r.top - vt - m, up = below < need && above > below;
    const room = Math.max(140, Math.floor(up ? above : below));
    list.style.maxHeight = room + 'px';
    const lh = Math.min(list.scrollHeight, room), lw = list.offsetWidth;
    list.style.left = Math.max(vl + m, Math.min(vl + vw - lw - m, r.right - lw)) + 'px';
    list.style.top = (up ? Math.max(vt + m, r.top - lh - 4) : Math.min(r.bottom + 4, vt + vh - lh - m)) + 'px';
  }
  getLayer().append(back);
  place();
  vv?.addEventListener('resize', place); vv?.addEventListener('scroll', place);
  return close;
}
