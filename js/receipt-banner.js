// Around 22:30, once per evening, a quiet inline banner (never a modal): «Закрыть чек за сегодня?»
import { h } from './util.js';
import * as db from './db.js';

const KEY = 'rcBannerDay';
export const isEvening = (d = new Date()) => d.getHours() > 22 || (d.getHours() === 22 && d.getMinutes() >= 30);
const day = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

// el: an empty container, onClose: scroll to the stamp / tear step, hasData(): is there anything on the open receipt
export async function maybeEveningBanner(el, onClose, hasData) {
  if (!isEvening() || !hasData()) { el.hidden = true; return; }
  let seen = null; try { seen = await db.kvGet(KEY, null); } catch { /* ignore */ }
  if (seen === day()) { el.hidden = true; return; }
  const later = async () => { el.hidden = true; try { await db.kvSet(KEY, day()); } catch { /* ignore */ } };
  el.replaceChildren(h('strong', null, 'Закрыть чек за сегодня?'),
    h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: async () => { await later(); onClose?.(); } }, 'Закрыть'),
    h('button', { class: 'btn btn-quiet btn-sm', type: 'button', onclick: later }, 'Позже'));
  el.hidden = false;
}
