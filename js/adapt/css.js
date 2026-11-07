// Source CSS -> safe, scoped CSS.
//  * every selector is prefixed with the document scope; html/body/:root map to the scope itself;
//  * dark-mode rules (prefers-color-scheme: dark, [data-theme=dark], .dark) are dropped: reading paper is always light, so a
//    document can never turn dark because the iPad is in dark mode;
//  * only "meaning" declarations survive (colour, weight, style, decoration, highlight background, bottom border): layout, boxes,
//    positions, fixed/sticky, sizes, outlines, animations, fonts are dropped, so the site's own typography and layout rule;
//  * colours are classified: dark backgrounds are dropped, light text is dropped, every remaining text colour is re-lightened
//    (OKLCH, hue kept) until it has >= 4.5:1 on its background.
import { parseColor, contrast, fixContrast, hex, lum } from './color.js';

export const PAPER = [253, 253, 252];
const KEEP = new Set(['color', 'background-color', 'background', 'font-weight', 'font-style', 'font-variant', 'font-variant-caps', 'text-decoration', 'text-decoration-line', 'text-decoration-color', 'text-decoration-style', 'text-decoration-thickness', 'text-underline-offset', 'text-transform', 'letter-spacing', 'vertical-align', 'border-bottom', 'border-bottom-color', 'border-bottom-style', 'border-bottom-width']);
const DARK_SEL = /\[data-(?:theme|mode|bs-theme)\s*=\s*["']?(?:dark|night)["']?\]|(?:^|[\s.#>+~(])(?:dark|night|dark-mode|dark-theme)(?![\w-])/i;
const CHROME_SEL = /(?:^|[\s>+~,(\[])[#.](?:bar|topbar|toolbar|tools|uhl|lb|slb|lightbox|modal|overlay|theme|themebtn|toggle|btn|reset|timer|sidebar|nav|menu)(?![\w-])|(?:^|[\s>+~,(])(?:button|input|select|textarea|nav|aside\.side)(?![\w-])|:hover|:active|:focus|:checked/i;

export function neutralizeCssUrls(css) {
  return css.replace(/@import[^;]*;?/gi, '').replace(/url\(\s*(['"]?)\s*(?:https?:)?\/\/[^)]*\)/gi, 'url("data:,")').replace(/url\(\s*(['"]?)\s*https?:[^)]*\)/gi, 'url("data:,")');
}
export function splitTopLevel(str, sep) {
  const out = []; let depth = 0, cur = '', q = null;
  for (const ch of str) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (ch === sep && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}
export const parseDecls = text => splitTopLevel(text, ';').map(d => { const i = d.indexOf(':'); return i < 0 ? null : [d.slice(0, i).trim().toLowerCase(), d.slice(i + 1).trim()]; }).filter(Boolean);

function mapSelector(sel, scope) {
  let s = sel.trim();
  if (!s || DARK_SEL.test(s) || CHROME_SEL.test(s)) return null;
  s = s.replace(/\[data-(?:theme|mode)\s*=\s*["']?light["']?\]/gi, '').replace(/:not\(\s*\[data-(?:theme|mode)\s*=\s*["']?(?:light|dark)["']?\]\s*\)/gi, '');
  let root = false;
  for (let i = 0; i < 3; i++) {
    const m = /^(html|body|:root)(?![\w-])/i.exec(s);
    if (!m) break;
    root = true; s = s.slice(m[0].length).replace(/^\s*[>+~]?\s*/, '');
  }
  if (!s) return { sel: scope, root: true };
  if (s.startsWith('.') || s.startsWith('[') || s.startsWith(':')) { if (root && !/^\s/.test(sel.slice(0, 20))) { /* body.cls -> scope.cls is wrong for a descendant doc: use descendant form */ } }
  return { sel: `${scope} ${s}`, root: false };
}

const resolveVars = (v, vars, depth = 0) => (depth > 4 ? v : v.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/g, (m, name, fb) => (vars[name] != null ? resolveVars(vars[name], vars, depth + 1) : (fb ?? m))));

// filter declarations of one rule. ctxBg = colour the text sits on (paper by default)
function filterDecls(decls, { isRoot, vars, report }) {
  const out = [];
  let bg = null;
  const bgDecl = decls.find(([p]) => p === 'background-color' || p === 'background');
  if (bgDecl && !/url\(|gradient/i.test(bgDecl[1])) { const c = parseColor(resolveVars(bgDecl[1].replace(/!important/i, ''), vars).split(/\s+/).find(x => parseColor(resolveVars(x, vars))) || ''); if (c && c[3] > 0.5) bg = c; }
  const bgFinal = bg && lum(bg) >= 0.4 ? bg : PAPER;     // a dark background is dropped, so the text sits on paper
  for (const [p, vRaw] of decls) {
    if (p.startsWith('--')) { if (!/url\(/i.test(vRaw)) out.push(`${p}:${vRaw}`); continue; }
    if (isRoot && p !== 'color') continue;
    if (!KEEP.has(p)) continue;
    let v = vRaw.replace(/\s*!important/i, '');
    if (/url\(|gradient|expression|javascript/i.test(v)) continue;
    if (p === 'background' || p === 'background-color') {
      const token = resolveVars(v, vars).split(/\s+(?![^(]*\))/).find(x => parseColor(x));
      const c = token && parseColor(token);
      if (!c || c[3] < 0.5) continue;
      if (lum(c) < 0.4) { report.darkBgDropped++; continue; }      // dark surface -> site paper
      out.push(`background-color:${v}`); continue;
    }
    if (p === 'color' || p === 'text-decoration-color') {
      const c = parseColor(resolveVars(v, vars));
      if (!c) { out.push(`${p}:${v}`); continue; }
      if (lum(c) > 0.62 && contrast(c, bgFinal) < 3 && p === 'color') { report.lightTextDropped++; continue; }   // light-on-dark leftover
      const fixed = fixContrast(c, bgFinal, 4.5);
      if (fixed !== c) report.colorsFixed++;
      out.push(`${p}:${fixed === c ? v : hex(fixed)}`); continue;
    }
    if (p.startsWith('border-bottom') ) { if (/\b(none|0)\b/.test(v) && p === 'border-bottom') continue; out.push(`${p}:${v}`); continue; }
    out.push(`${p}:${v}`);
  }
  return out;
}

function walk(rules, ctx) {
  let css = '';
  for (const r of rules) {
    if (r.type === 1) {
      const sels = splitTopLevel(r.selectorText, ',').map(s => mapSelector(s, ctx.scope)).filter(Boolean);
      if (!sels.length) { ctx.report.rulesDropped++; continue; }
      const decls = filterDecls(parseDecls(r.style.cssText), { isRoot: sels.every(s => s.root), vars: ctx.vars, report: ctx.report });
      if (!decls.length) continue;
      css += `${[...new Set(sels.map(s => s.sel))].join(',')}{${decls.join(';')}}\n`;
    } else if (r.type === 4) {
      const mt = r.media.mediaText;
      if (/prefers-color-scheme\s*:\s*dark|print|forced-colors|prefers-contrast/i.test(mt)) { ctx.report.rulesDropped++; continue; }
      if (/prefers-color-scheme\s*:\s*light/i.test(mt)) { css += walk(r.cssRules, ctx); continue; }
      ctx.report.rulesDropped++;   // width-based media only re-lays the source page out: the site is fluid already
    } else if (r.type === 12) { css += walk(r.cssRules, ctx); }
    else ctx.report.rulesDropped++;   // @font-face, @keyframes, @page, @import, @namespace ...
  }
  return css;
}
// collect light-theme custom properties declared on :root / html / body so var() colours can be judged
function collectVars(rules, vars) {
  for (const r of rules) {
    if (r.type === 1) {
      const sels = splitTopLevel(r.selectorText, ',');
      if (sels.some(s => /^(html|body|:root)(?![\w-])/i.test(s.trim()) && !DARK_SEL.test(s))) for (const [p, v] of parseDecls(r.style.cssText)) if (p.startsWith('--')) vars[p] = v;
    } else if (r.type === 4 && !/prefers-color-scheme\s*:\s*dark|print/i.test(r.media.mediaText)) collectVars(r.cssRules, vars);
  }
}
export function adaptCss(cssText, scope) {
  const report = { rulesDropped: 0, colorsFixed: 0, darkBgDropped: 0, lightTextDropped: 0 };
  let css = '';
  try {
    const d = document.implementation.createHTMLDocument('');
    const st = d.createElement('style'); st.textContent = neutralizeCssUrls(cssText); d.head.append(st);
    const vars = {}; collectVars(st.sheet.cssRules, vars);
    css = walk(st.sheet.cssRules, { scope, vars, report });
    report.vars = vars;
  } catch { css = ''; report.failed = true; }
  return { css, report };
}
// inline style="" -> only meaning declarations, with contrast fixed
export function adaptInlineStyle(style, vars = {}) {
  const report = { darkBgDropped: 0, lightTextDropped: 0, colorsFixed: 0 };
  const decls = filterDecls(parseDecls(style), { isRoot: false, vars, report });
  return decls.join(';');
}
