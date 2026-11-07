// Hidden debugging page: /#perf — FPS and long-task counters (start it, then use the app in another tab/route and come back).
import { h } from './util.js';

const state = window.__perf || (window.__perf = { long: [], frames: 0, t0: performance.now(), worst: 0, obs: null, raf: 0, running: false, fps: 0, last: performance.now(), dt: [] });
export function startPerf() {
  if (state.running) return;
  state.running = true; state.t0 = performance.now(); state.frames = 0; state.long = []; state.worst = 0;
  try { state.obs = new PerformanceObserver(list => { for (const e of list.getEntries()) state.long.push({ at: Math.round(e.startTime), ms: Math.round(e.duration) }); }); state.obs.observe({ entryTypes: ['longtask'] }); } catch { /* longtask unsupported (Safari) */ }
  const loop = t => { const d = t - state.last; state.last = t; state.frames++; if (d > state.worst) state.worst = d; state.dt.push(d); if (state.dt.length > 120) state.dt.shift(); state.raf = requestAnimationFrame(loop); };
  state.raf = requestAnimationFrame(loop);
}
export function stopPerf() { state.running = false; cancelAnimationFrame(state.raf); state.obs?.disconnect(); }

export async function renderPerf(root) {
  root.className = 'view perf-view';
  startPerf();
  const out = h('pre', { class: 'perf-out' });
  const draw = () => {
    const sec = (performance.now() - state.t0) / 1000, avg = state.dt.length ? state.dt.reduce((a, b) => a + b, 0) / state.dt.length : 0;
    const over50 = state.long.filter(l => l.ms > 50);
    out.textContent = [`FPS (последние 120 кадров): ${avg ? (1000 / avg).toFixed(1) : '—'}`, `Худший кадр: ${state.worst.toFixed(1)} мс`, `Кадров всего: ${state.frames} за ${sec.toFixed(0)} с`, `Долгих задач (>50 мс): ${over50.length}`, ...over50.slice(-12).map(l => `  ${l.at} мс: ${l.ms} мс`), '', 'Память: ' + (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) + ' МБ' : 'нет данных')].join('\n');
  };
  draw();
  const t = setInterval(draw, 500);
  root.replaceChildren(h('div', { class: 'content narrow' }, h('h1', { class: 'display' }, 'Производительность'), h('p', { class: 'muted' }, 'Счётчики работают, пока открыта эта страница или другой экран приложения.'), out,
    h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: () => { stopPerf(); state.dt = []; startPerf(); } }, 'Сбросить'), h('a', { class: 'btn btn-primary', href: '#/' }, 'На главную'))));
  return () => clearInterval(t);
}
