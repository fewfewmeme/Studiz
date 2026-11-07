// Settings: stored in kv['settings'], cached in memory.
import { DEFAULTS } from '../config.js';
import { kvGet, kvSet } from './db.js';

let cache = null;
const listeners = new Set();

export async function loadSettings() {
  const saved = await kvGet('settings', {});
  cache = { ...DEFAULTS, ...saved };
  cache.wpm = Math.min(DEFAULTS.wpmMax, Math.max(DEFAULTS.wpmMin, cache.wpm));
  return cache;
}
export function settings() { return cache || { ...DEFAULTS }; }

export async function setSetting(patch) {
  cache = { ...settings(), ...patch };
  const toSave = {};
  for (const k of Object.keys(DEFAULTS)) toSave[k] = cache[k];
  await kvSet('settings', toSave);
  listeners.forEach(f => f(cache, patch));
}
export function onSettings(fn) { listeners.add(fn); return () => listeners.delete(fn); }
