// Splash overlay shown once per session: a wallpaper photo, a serif title and one quiet button. Nothing floats.
import { APP_NAME } from '../config.js';
import { h } from './util.js';
import { splashImage } from './assets.js';

export function renderSplash(root, onEnter) {
  let startY = null, startT = 0, done = false;
  const enter = () => { if (!done) { done = true; onEnter(); } };
  const img = splashImage();
  const style = {};
  if (img) { style['--splash-p'] = `url("${new URL(img.portrait, document.baseURI).href}")`; style['--splash-l'] = `url("${new URL(img.landscape, document.baseURI).href}")`; style['--splash-pos'] = img.pos; }
  const el = h('main', { class: 'splash', tabindex: '0', role: 'button', 'aria-label': 'Открыть библиотеку', style },
    h('div', { class: 'splash-card' },
      h('p', { class: 'eyebrow' }, 'Личная библиотека'),
      h('h1', { class: 'display' }, APP_NAME),
      h('p', { class: 'splash-hint' }, 'Тихое место для учёбы'),
      h('button', { class: 'btn btn-primary', onclick: enter }, 'Открыть')));
  el.addEventListener('pointerdown', e => { startY = e.clientY; startT = Date.now(); });
  el.addEventListener('pointerup', e => {
    if (startY == null) return;
    const dy = startY - e.clientY, dt = Date.now() - startT;
    startY = null;
    if (dy > 50 || (Math.abs(dy) < 10 && dt < 500)) enter();
  });
  el.addEventListener('keydown', e => { if (['Enter', ' ', 'ArrowUp'].includes(e.key)) { e.preventDefault(); enter(); } });
  root.append(el);
  setTimeout(() => el.focus({ preventScroll: true }), 0);
}
