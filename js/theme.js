// Theme switching: a theme is a CSS variable set (styles/themes/*.css) + a wallpaper behind a veil.
import { THEMES } from '../config.js';
import { settings, setSetting } from './settings.js';
import { wallpaperFor } from './assets.js';

const THEME_COLOR = { cyan: '#eef2f6', deep: '#00172f', ice: '#f1f4f7', sky: '#eaf3fb', lilac: '#f2f0f8', rose: '#f7eff2' };
export const LEGACY_THEME = { night: 'deep' };

export function applyTheme(name = settings().theme) {
  name = LEGACY_THEME[name] || name;
  if (!THEMES.some(t => t[0] === name)) name = 'cyan';
  const root = document.documentElement;
  root.dataset.theme = name;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', THEME_COLOR[name]);
  applyWallpaper(name);
  root.dataset.readfont = settings().readFont || 'sans';
  dynamicType();
  try { localStorage.setItem('theme', name); } catch { /* ignore */ }
}
export function applyWallpaper(name = document.documentElement.dataset.theme) {
  const root = document.documentElement;
  const w = wallpaperFor(name);
  const portrait = matchMedia('(orientation: portrait)').matches;
  const url = w ? (portrait ? w.portrait : w.landscape) || w.portrait : null;
  root.style.setProperty('--wall', url ? `url("${new URL(url, document.baseURI).href}")` : 'none');
  root.style.setProperty('--wall-pos', w?.pos || '50% 40%');
}
export async function setTheme(name) { await setSetting({ theme: name }); applyTheme(name); }
matchMedia('(orientation: portrait)').addEventListener?.('change', () => applyWallpaper());
// Dynamic Type: on iOS the system text size scales the reading text (probe = -apple-system-body); other browsers stay at 1
export function dynamicType() {
  try {
    if (!CSS.supports('font: -apple-system-body')) { document.documentElement.style.setProperty('--dt', '1'); return; }
    const probe = document.createElement('span'); probe.style.cssText = 'position:absolute;visibility:hidden;font:-apple-system-body';
    document.body.append(probe); const px = parseFloat(getComputedStyle(probe).fontSize); probe.remove();
    const k = px / 17;
    document.documentElement.style.setProperty('--dt', String(Math.max(0.85, Math.min(1.7, k || 1))));
  } catch { /* default */ }
}
