// Entry point: boot, migration, persistent shell, hash router with view transitions, service worker.
import { openDB, describeError } from './db.js';
import * as db from './db.js';
import { loadSettings, settings, setSetting } from './settings.js';
import { h } from './util.js';
import { toast } from './ui.js';
import { migrateIfNeeded } from './migrate.js';
import { loadAssets } from './assets.js';
import { applyTheme } from './theme.js';
import { buildShell, setActiveNav, refreshShell } from './shell.js';
import { renderSplash } from './splash.js';
import { renderHome } from './views/home.js';
import { renderSubject } from './views/subject.js';
import { renderSettings } from './views/settings.js';
import { renderCheck } from './check.js';
import { APP_VERSION } from './version.js';
import { watchPageZoom } from './viewport.js';
import { initStudy } from './study-store.js';

let viewEl = null;
let cleanup = null;
let token = 0;
let pendingVT = null;
window.__nav = { count: 0, kind: null };
// Safari must never zoom or shift the site: pinch gestures and two-finger moves are cancelled at the shell (a document zooms only its own content)
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
for (const ev of ['touchstart', 'touchmove']) document.addEventListener(ev, e => { if (e.touches && e.touches.length > 1 && e.cancelable) e.preventDefault(); }, { passive: false });

// remember which card was tapped: it becomes the shared element of the next transition
document.addEventListener('click', e => {
  const a = e.target.closest?.('[data-vt]');
  if (a && a.tagName === 'A') { pendingVT = { name: a.dataset.vt, el: a }; a.style.viewTransitionName = 'vt-' + a.dataset.vt.replace(/[^\w-]/g, ''); }
}, true);

function parse() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  return parts;
}
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

async function renderRoute(parts, my) {
  if (cleanup) { try { await cleanup(); } catch { /* ignore */ } cleanup = null; }
  if (my !== token) return;
  const root = h('div', { class: 'view' });
  viewEl.replaceChildren(root);
  viewEl.scrollTop = 0;
  const head = parts[0];
  let inReader = false, nav = 'home';
  try {
    let res;
    switch (head) {
      case undefined: case 'subjects': res = await renderHome(root); nav = 'home'; break;
      case 'subject': res = await renderSubject(root, parts[1], parts[2], refreshShell); nav = 'subject-' + parts[1]; break;
      case 'file': { const { renderReader } = await import('./reader/reader.js'); inReader = true; nav = ''; res = await renderReader(root, parts[1]); break; }
      case 'files': { const { renderFiles } = await import('./views/files.js'); res = await renderFiles(root, parts[1] || 'all'); nav = 'files'; break; }
      case 'check': res = await renderCheck(root); nav = 'check'; break;
      case 'note': { const { renderNote } = await import('./views/note.js'); inReader = false; nav = ''; res = await renderNote(root, parts[1], parts[2], parts[3]); break; }
      case 'plan': { const { renderPlan } = await import('./views/plan.js'); res = await renderPlan(root); nav = 'plan'; break; }
      case 'days': { const { renderDays } = await import('./views/days.js'); res = await renderDays(root); nav = 'days'; break; }
      case 'archive': { const { renderArchive } = await import('./views/archive.js'); res = await renderArchive(root); nav = 'archive'; break; }
      case 'settings': res = await renderSettings(root); nav = 'settings'; break;
      case 'search': { const { renderSearch } = await import('./views/search.js'); res = await renderSearch(root, parts[1] || ''); nav = 'search'; break; }
      case 'perf': { const { renderPerf } = await import('./perf.js'); res = await renderPerf(root); nav = ''; break; }
      default: location.hash = '#/'; return;
    }
    if (typeof res === 'function') { if (my === token) cleanup = res; else res(); }
  } catch (e) {
    root.replaceChildren(h('div', { class: 'content narrow' }, h('div', { class: 'empty-card err-state' }, h('h3', null, 'Не удалось открыть экран'), h('p', null, String(e?.message || e)), h('div', { class: 'actions' }, h('a', { class: 'btn btn-primary', href: '#/' }, 'На главную'), h('button', { class: 'btn', onclick: () => copyCrash(e) }, 'Скопировать отчёт об ошибке')))));
  }
  setActiveNav(nav, inReader);
  // shared element: the destination hero takes over the name of the tapped card
  if (pendingVT) {
    const t = viewEl.querySelector(`[data-vt-target="${pendingVT.name}"]`);
    if (t) t.style.viewTransitionName = 'vt-' + pendingVT.name.replace(/[^\w-]/g, '');
    else pendingVT.el.style.viewTransitionName = '';
  }
}

async function route() {
  const my = ++token;
  const parts = parse();
  window.__nav.count++;
  if (document.startViewTransition && !reduceMotion()) {
    window.__nav.kind = 'view-transition';
    const t = document.startViewTransition(() => renderRoute(parts, my));
    t.ready.catch(() => {}); t.updateCallbackDone.catch(() => {});
    try { await t.finished; } catch { /* interrupted by the next navigation */ }
  } else {
    window.__nav.kind = 'fallback';
    if (!reduceMotion() && viewEl.firstChild) await viewEl.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(8px)' }], { duration: 130, easing: 'ease-in' }).finished.catch(() => {});
    await renderRoute(parts, my);
    if (!reduceMotion()) viewEl.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 280, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
  if (pendingVT) { pendingVT.el.style.viewTransitionName = ''; viewEl.querySelectorAll('[data-vt-target]').forEach(x => { x.style.viewTransitionName = ''; }); pendingVT = null; }
}

export async function copyCrash(e) {
  const txt = ['Отчёт об ошибке — Конспекты', `Версия: ${APP_VERSION}`, `Адрес: ${location.hash}`, `Браузер: ${navigator.userAgent}`, `Экран: ${innerWidth}×${innerHeight}`, `Ошибка: ${e?.message || e}`, `Стек: ${(e?.stack || '').split('\n').slice(0, 8).join('\n')}`].join('\n');
  try { await navigator.clipboard.writeText(txt); toast('Отчёт скопирован. Его можно вставить в чат с Claude.'); } catch { toast('Не получилось скопировать', { error: true }); }
}
window.__copyCrash = copyCrash;
function showFatal(msg) {
  document.getElementById('app').replaceChildren(h('main', { class: 'content narrow' }, h('div', { class: 'empty-card err-state' }, h('h3', null, 'Не удалось запустить приложение'), h('p', null, msg))));
}

// A new site version WAITS: a toast offers «Обновить» (never while reading); otherwise it applies on the next open.
async function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  try {
    const reg = await navigator.serviceWorker.register('sw.js');
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading && window.__swUpdating) { reloading = true; location.reload(); } });
    const offer = () => {
      if (!reg.waiting || !navigator.serviceWorker.controller) return;
      if (location.hash.startsWith('#/file/')) { addEventListener('hashchange', function once() { if (!location.hash.startsWith('#/file/')) { removeEventListener('hashchange', once); offer(); } }); return; }
      toast('Есть новая версия сайта', { ms: 20000, action: { label: 'Обновить', fn: () => { window.__swUpdating = true; reg.waiting.postMessage('skipWaiting'); } } });
    };
    if (reg.waiting) offer();
    reg.addEventListener('updatefound', () => { const w = reg.installing; w?.addEventListener('statechange', () => { if (w.state === 'installed') offer(); }); });
  } catch { /* works without offline mode too */ }
}

// The browser may evict site storage (Safari after weeks of not visiting). A marker that survived while the library is empty means «data loss».
async function checkStorageLoss() {
  try {
    const n = await db.count('files'); let had = false;
    try { had = localStorage.getItem('hadFiles') === '1'; if (n > 0) localStorage.setItem('hadFiles', '1'); } catch { /* ignore */ }
    if (n === 0 && had) {
      const input = h('input', { type: 'file', accept: '.zip,application/zip', hidden: true });
      input.addEventListener('change', async () => { if (input.files[0]) { const { restoreFlow } = await import('./backup.js'); await restoreFlow(input.files[0]); banner.remove(); refreshShell(); route(); } });
      const banner = h('div', { class: 'lost-banner', role: 'alert' }, h('strong', null, 'Похоже, браузер очистил хранилище сайта.'), h('span', null, ' Файлы и пометки пропали из этого устройства, но их можно вернуть из копии.'), h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => input.click() }, 'Восстановить из копии'), h('button', { class: 'btn btn-quiet btn-sm', type: 'button', onclick: () => { try { localStorage.removeItem('hadFiles'); } catch { /* ignore */ } banner.remove(); } }, 'Это не так'), input);
      document.body.append(banner);
    }
  } catch { /* ignore */ }
}

async function boot() {
  document.documentElement.classList.remove('reader-open');   // never start with a leftover scroll lock
  watchPageZoom();
  try { await openDB(); } catch (e) { showFatal('Не удалось открыть базу данных браузера. Возможно, включён приватный режим. Откройте сайт в обычной вкладке.'); return; }
  await loadSettings();
  try { if (!(await db.kvGet('themeV3', false))) { const t = settings().theme; await setSetting({ theme: t === 'night' ? 'deep' : t === 'ice' ? 'cyan' : t }); await db.kvSet('themeV3', true); } } catch { /* keep the stored theme */ }
  let mig = null;
  try { mig = await migrateIfNeeded(); } catch (e) { showFatal('Не удалось обновить данные до новой версии. Ваши файлы не тронуты (копия лежит внутри приложения). ' + describeError(e)); return; }
  await loadAssets();
  try { await initStudy(); } catch { /* the timer starts empty */ }
  applyTheme();
  const { view } = buildShell();
  viewEl = view;
  applyTheme();
  refreshShell();
  try { navigator.storage?.persist?.(); } catch { /* ignore */ }
  checkStorageLoss();
  window.addEventListener('hashchange', route);
  window.addEventListener('unhandledrejection', e => { e.preventDefault(); toast('Что-то пошло не так: ' + (e.reason?.message || 'ошибка'), { error: true, action: { label: 'Отчёт', fn: () => copyCrash(e.reason) } }); });
  window.addEventListener('error', e => { if (e.message && !/ResizeObserver/.test(e.message)) toast('Что-то пошло не так', { error: true, action: { label: 'Отчёт', fn: () => copyCrash(e.error || e.message) } }); });

  // first screen without a transition (no white flash), then the splash overlay on a fresh start
  token++;
  window.__nav.count++;
  await renderRoute(parse(), token);
  document.documentElement.classList.add('ready');
  let showSplash = false;
  try { showSplash = !location.hash.replace('#', '').replace('/', '') && !sessionStorage.getItem('splashed'); } catch { /* ignore */ }
  if (showSplash) {
    const ov = h('div', { class: 'splash-overlay' });
    document.body.append(ov);
    renderSplash(ov, () => { try { sessionStorage.setItem('splashed', '1'); } catch { /* ignore */ } ov.classList.add('leave'); setTimeout(() => ov.remove(), 500); });
  }

  registerSW();
  { const go = () => import('./views/tour.js').then(m => m.maybeTour()).catch(() => {}); if (showSplash) { const iv = setInterval(() => { if (!document.querySelector('.splash-overlay')) { clearInterval(iv); setTimeout(go, 600); } }, 400); } else setTimeout(go, 800); }
  import('./library.js').then(l => l.purgeTrash()).catch(() => {});
  { const pill = h('div', { class: 'offline-pill', hidden: navigator.onLine !== false, role: 'status' }, 'Без интернета — всё работает'); document.body.append(pill); const upd = () => { pill.hidden = navigator.onLine !== false; }; addEventListener('online', upd); addEventListener('offline', upd); }
  // "Обновлено" toast after an update
  try {
    const prev = await db.kvGet('appVersion', null);
    if (prev && prev !== APP_VERSION) toast('Обновлено до новой версии', { ms: 4200 });
    if (prev !== APP_VERSION) await db.kvSet('appVersion', APP_VERSION);
    if (mig?.migrated && (mig.html || mig.pages)) toast('Данные переведены на новую версию. Копия сохранена внутри приложения.', { ms: 5200 });
  } catch { /* ignore */ }
}
boot();
