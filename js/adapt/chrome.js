// Dead UI removal: scripts, toolbars, sticky/fixed bars, lightboxes, theme toggles, timers, buttons. The site draws its own
// per-block buttons. Detection = known ids/classes + CSSOM (rules with position fixed/sticky) + "button cluster with no text".
import { countWordsIn } from './text.js';
import { splitTopLevel, parseDecls } from './css.js';

const CHROME_TOKEN = /^(bar|topbar|toolbar|tools|uhl|lb|slb|lightbox|modal|overlay|theme|themebtn|theme-toggle|reset|timer|scrolltop|back-to-top|toc-toggle|progressbar|noprint|no-print|cookie|banner)$/i;
const DEAD_TAGS = 'script,noscript,link,meta,iframe,frame,frameset,object,embed,applet,audio,video,source,track,form,button,input,select,textarea,dialog,template,base,datalist,option';

export function fixedSelectors(cssText) {
  const out = [];
  try {
    const d = document.implementation.createHTMLDocument('');
    const st = d.createElement('style'); st.textContent = cssText; d.head.append(st);
    const walk = rules => { for (const r of rules) { if (r.type === 1) { if (parseDecls(r.style.cssText).some(([p, v]) => p === 'position' && /fixed|sticky/i.test(v))) out.push(...splitTopLevel(r.selectorText, ',')); } else if (r.cssRules) walk(r.cssRules); } };
    walk(st.sheet.cssRules);
  } catch { /* no css */ }
  return out;
}
export function removeChrome(doc, cssText) {
  const stats = { byId: 0, byCss: 0, clusters: 0, tags: 0 };
  const kill = (el, k) => { if (el.isConnected && el !== doc.body && el.tagName !== 'HTML') { el.remove(); stats[k]++; } };
  for (const el of [...doc.querySelectorAll('[id], [class]')]) {
    if (!el.isConnected) continue;
    const toks = [el.id, ...(el.getAttribute('class') || '').split(/\s+/)].filter(Boolean);
    if (toks.some(t => CHROME_TOKEN.test(t)) && countWordsIn(el.textContent || '') < 160) kill(el, 'byId');
  }
  for (const sel of fixedSelectors(cssText)) {
    const s = sel.trim().replace(/::?[\w-]+(\([^)]*\))?/g, '');
    if (!s || /^(html|body|\*)$/i.test(s)) continue;
    let list = []; try { list = [...doc.querySelectorAll(s)]; } catch { continue; }
    for (const el of list) if (countWordsIn(el.textContent || '') < 160) kill(el, 'byCss');
  }
  for (const el of [...doc.querySelectorAll('[style]')]) { if (/position\s*:\s*(fixed|sticky)/i.test(el.getAttribute('style')) && countWordsIn(el.textContent || '') < 160) kill(el, 'byCss'); else if (/display\s*:\s*none/i.test(el.getAttribute('style'))) kill(el, 'byCss'); }
  for (const el of [...doc.querySelectorAll('div,nav,header,p,span')]) {
    if (!el.isConnected) continue;
    const bs = el.querySelectorAll('button, [role=button]');
    if (bs.length >= 3 && countWordsIn(el.textContent || '') < 24 + bs.length * 3) kill(el, 'clusters');
  }
  stats.tags = doc.querySelectorAll(DEAD_TAGS).length;
  doc.querySelectorAll(DEAD_TAGS).forEach(e => e.remove());
  doc.querySelectorAll('[hidden]').forEach(e => e.remove());
  // wrappers emptied by the removal
  for (let pass = 0; pass < 3; pass++) for (const el of [...doc.body.querySelectorAll('div,span,p,section,header,nav,aside,ul')]) { if (el.isConnected && !el.textContent.trim() && !el.querySelector('img,svg,table,figure,canvas,hr,details,li')) el.remove(); }
  return stats;
}
