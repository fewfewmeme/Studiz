// ===== «Блоки»: a header bar above and an action row below every block; the file's own content is untouched =====
var BL = { els: {}, state: { done: {}, flame: {}, bm: {}, active: null, dim: false, keyIds: [], onlyKey: false, plans: [], planId: '', qn: {} }, recall: {}, plan: null };
function mix(a, b, t) { return [0, 1, 2].map(function (i) { return Math.round(a[i] + (b[i] - a[i]) * t); }); }
function rgbOf(c) { var m = String(c).match(/[\d.]+/g) || [255, 255, 255]; return [+m[0], +m[1], +m[2]]; }
function rgbS(a) { return 'rgb(' + a.join(',') + ')'; }
function blocksCss() {
  var t = themeNow(), bg = rgbOf(t.bg), ink = rgbOf(t.ink);
  // neutral bars derived from the document's own colours: a slightly shifted background, the document ink, a hairline
  var dark = t.dark, bg2 = mix(bg, dark ? [255, 255, 255] : [0, 0, 0], dark ? .08 : .045), line = mix(bg, ink, .22);
  var fg = rgbS(ink);
  css('lz-blocks-css',
    ':root{--lz-bg:' + t.bg + ';--lz-ink:' + fg + ';--lz-bg2:' + rgbS(bg2) + ';--lz-line:' + rgbS(line) + '}' +
    '.lz-bh,.lz-bf,.lz-plan{font:500 calc(var(--u)*14)/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;color:var(--lz-ink);letter-spacing:0;text-align:left;text-transform:none;-webkit-text-size-adjust:none}' +
    '.lz-bh{display:flex;align-items:center;gap:calc(var(--u)*12);margin:calc(var(--u)*26) 0 calc(var(--u)*10);padding:calc(var(--u)*10) calc(var(--u)*12) calc(var(--u)*10) calc(var(--u)*14);border-radius:calc(var(--u)*16);background:var(--lz-bg2);border:calc(var(--u)*1) solid var(--lz-line);min-height:calc(var(--u)*56)}' +
    '.lz-bn{flex:none;width:calc(var(--u)*32);height:calc(var(--u)*32);border-radius:50%;background:var(--lz-ink);color:var(--lz-bg);display:grid;place-items:center;font-weight:700;font-size:calc(var(--u)*14)}' +
    '.lz-bt{flex:1;min-width:0}.lz-bt b{display:block;font-weight:700;font-size:calc(var(--u)*15);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lz-bt small{display:block;opacity:.75;font-size:calc(var(--u)*12.5);margin-top:calc(var(--u)*1)}' +
    '.lz-ib{flex:none;width:calc(var(--u)*44);height:calc(var(--u)*44);border-radius:calc(var(--u)*12);border:0;background:transparent;color:var(--lz-ink);cursor:pointer;display:grid;place-items:center;font-size:calc(var(--u)*20);opacity:.7}.lz-ib.on{opacity:1;background:var(--lz-ink);color:var(--lz-bg)}' +
    '.lz-bf{display:flex;flex-wrap:wrap;gap:calc(var(--u)*8);margin:calc(var(--u)*12) 0 calc(var(--u)*26);padding:calc(var(--u)*10);border-radius:calc(var(--u)*16);background:var(--lz-bg2);border:calc(var(--u)*1) solid var(--lz-line)}' +
    '.lz-btn{min-height:calc(var(--u)*44);padding:0 calc(var(--u)*16);border-radius:calc(var(--u)*12);border:calc(var(--u)*1) solid var(--lz-line);background:var(--lz-bg);color:var(--lz-ink);font:700 calc(var(--u)*14)/1 -apple-system,system-ui,sans-serif;cursor:pointer;display:inline-flex;align-items:center;gap:calc(var(--u)*8)}' +
    '.lz-btn.pri{background:var(--lz-ink);color:var(--lz-bg);border-color:transparent}.lz-btn.on{background:var(--lz-ink);color:var(--lz-bg);border-color:transparent}.lz-btn:disabled{opacity:.55}' +
    '.lz-plan{margin:0 0 calc(var(--u)*22);padding:calc(var(--u)*16) calc(var(--u)*18);border-radius:calc(var(--u)*18);background:var(--lz-bg2);border:calc(var(--u)*1) solid var(--lz-line)}.lz-plan h3{margin:0 0 calc(var(--u)*4);font-weight:700;font-size:calc(var(--u)*20);line-height:1.25;font-family:inherit;color:var(--lz-ink);letter-spacing:0}.lz-plan p{margin:0 0 calc(var(--u)*12);opacity:.8}' +
    '.lz-chips{display:flex;flex-wrap:wrap;gap:calc(var(--u)*8)}.lz-chip{min-height:calc(var(--u)*44);padding:0 calc(var(--u)*16);border-radius:calc(var(--u)*22);border:calc(var(--u)*1) solid var(--lz-line);background:var(--lz-bg);color:var(--lz-ink);font:700 calc(var(--u)*14) -apple-system,system-ui,sans-serif;cursor:pointer}.lz-chip.on{background:var(--lz-ink);color:var(--lz-bg);border-color:transparent}' +
    '.lz-done{opacity:.62}.lz-dim{opacity:.38}.lz-active{outline:calc(var(--u)*2) solid var(--lz-ink);outline-offset:calc(var(--u)*6);border-radius:calc(var(--u)*6)}.lz-hide{display:none!important}' +
    '.lz-blur{filter:blur(calc(var(--u)*7));-webkit-user-select:none;user-select:none;cursor:pointer;transition:filter .2s}' +
    '.lz-spacer{flex:1}.lz-btn.quiet{background:transparent;border-color:transparent;opacity:.8;font-weight:600}.lz-rest{margin:0 0 calc(var(--u)*18);padding:calc(var(--u)*14) calc(var(--u)*16);border-radius:calc(var(--u)*16);background:var(--lz-bg2);border:calc(var(--u)*1) solid var(--lz-line);font:600 calc(var(--u)*15) -apple-system,system-ui,sans-serif;color:var(--lz-ink)}');
}
// «Разделить» / «Объединить со следующим»: kept as text offsets (the parent stores them); the blocks are cut again at once
function saveEdits() { post('bkedits', { edits: EDITS }); }
function rebuildBlocks() {
  clearRecalls(); D.querySelectorAll('.lz-bh,.lz-bf,.lz-plan,.lz-rest').forEach(function (e) { e.remove(); });
  D.querySelectorAll('[data-bl]').forEach(function (e) { e.removeAttribute('data-bl'); });
  SEGS = null; dropIndex(); setupBlocks();
  post('blocksinfo', { blocks: segments().map(function (s) { return { id: s.id, title: s.title, min: Math.round(s.min * 10) / 10, words: s.words, part: s.part }; }) });
}
function splitBlock(id) {
  var s = segments().filter(function (x) { return x.id === id; })[0]; if (!s) return;
  var ls = s.leaves, tot = 0, cum = [], i; for (i = 0; i < ls.length; i++) { tot += minutesOf([ls[i]]).min; cum.push(tot); }
  var cut = -1; for (i = 1; i < ls.length; i++) { if (isHeading(ls[i - 1]) && i < ls.length - 1 && cut < 0 && cum[i - 1] < tot / 2) continue; if (cum[i - 1] >= tot / 2) { cut = i; break; } }
  if (cut < 1) cut = Math.min(ls.length - 1, Math.max(1, Math.floor(ls.length / 2)));
  while (cut < ls.length - 1 && isHeading(ls[cut - 1])) cut++;
  if (ls.length < 2 || cut >= ls.length) { post('toast', { text: 'Этот блок нельзя разделить: в нём один неделимый элемент (абзац, таблица или рисунок).' }); return; }
  var off = offsetAt(ls[cut]); EDITS.merges = (EDITS.merges || []).filter(function (o) { return o !== off; });
  if ((EDITS.splits || []).indexOf(off) < 0) (EDITS.splits = EDITS.splits || []).push(off);
  saveEdits(); rebuildBlocks();
}
function mergeBlock(id) {
  var list = segments(), i = -1; list.forEach(function (x, k) { if (x.id === id) i = k; });
  if (i < 0 || i >= list.length - 1) { post('toast', { text: 'Это последний блок: объединять не с чем.' }); return; }
  var off = offsetAt(list[i + 1].leaves[0]);
  if ((EDITS.splits || []).indexOf(off) >= 0) EDITS.splits = EDITS.splits.filter(function (o) { return o !== off; });
  else if ((EDITS.merges || []).indexOf(off) < 0) (EDITS.merges = EDITS.merges || []).push(off);
  saveEdits(); rebuildBlocks();
}
var TERM_SEL = 'b,strong,mark,.t,.tm,.hl,.key,.lat,.term,[data-t],[data-term],span[style*="background"],span[style*="color"]';
function blockItems(s) {
  var items = [], seen = {};
  var add = function (kind, t) { t = (t || '').replace(/\s+/g, ' ').trim(); if (t.length < 3 || t.length > 400 || seen[t.toLowerCase()]) return; seen[t.toLowerCase()] = 1; items.push({ kind: kind, text: t }); };
  s.leaves.forEach(function (l) {
    var q = l.querySelectorAll('.ask,.tk,.q,.qa,.question,aside[data-kind=ask],[data-kind=ask],[data-kind=key],.callout,.note,.tip,.warn,.important,.key-box,.box');
    if (l.matches && l.matches('.ask,.tk,.q,.qa,.callout,.note,.tip,.warn,.important,.box')) add('callout', l.innerText || l.textContent);
    q.forEach(function (e) { var t = (e.innerText || e.textContent || ''); var low = t.toLowerCase(); add(/спросят|вопрос|\?/.test(low) ? 'ask' : /важно|запомн|ключев|не забуд|внимани/.test(low) ? 'key' : 'callout', t); });
    l.querySelectorAll('p,li').forEach(function (p) { var t = (p.textContent || '').trim(); if (/^(спросят|вопрос|важно|запомни|запомнить|ключевое)\b/i.test(t)) add('ask', t); });
  });
  var terms = 0;
  s.leaves.forEach(function (l) { l.querySelectorAll(TERM_SEL).forEach(function (e) { if (isOwn(e) || e.closest('.lzm') && false) return; var t = (e.textContent || '').trim(); if (terms < 14 && t.length >= 3 && t.length <= 60) { terms++; add('term', t); } }); });
  return items;
}
function parasOf(s) {
  var out = [];
  s.leaves.forEach(function (l) {
    var kids = l.matches && l.matches('section,div,article') ? [].slice.call(l.children) : [l];
    kids.forEach(function (c, i) {
      if (isOwn(c) || /^(UL|OL)$/.test(c.tagName) || (c.querySelector && c.querySelector('table,figure,img'))) return;
      var nx = kids[i + 1], lead = c.firstElementChild && /^(B|STRONG)$/.test(c.firstElementChild.tagName) ? c.firstElementChild.textContent.trim() : '';
      out.push({ text: (c.textContent || '').replace(/\s+/g, ' ').trim(), tag: c.tagName, lead: lead, items: nx && /^(UL|OL)$/.test(nx.tagName) ? nx.children.length : 0 });
    });
  });
  return out;
}
function setupBlocks() {
  blocksCss();
  var segs = segments(); BL.els = {};
  var firstLeaf = segs.length ? segs[0].leaves[0] : null;
  BL.plan = ownEl('div', 'lz-plan'); BL.rest = ownEl('div', 'lz-rest'); BL.rest.hidden = true;
  if (firstLeaf) { firstLeaf.parentNode.insertBefore(BL.plan, firstLeaf); firstLeaf.parentNode.insertBefore(BL.rest, firstLeaf); }
  segs.forEach(function (s, i) {
    var head = ownEl('div', 'lz-bh'); head.setAttribute('data-b', s.id);
    head.innerHTML = '<span class="lz-bn">' + (i + 1) + '</span><div class="lz-bt"><b></b><small></small></div><button class="lz-ib bm" type="button" aria-label="Закладка" aria-pressed="false">☆</button><button class="lz-ib fl" type="button" aria-label="Важное" aria-pressed="false">★</button>';
    head.querySelector('b').textContent = s.title; var pgs = 0; s.leaves.forEach(function (l) { pgs += l.matches && l.matches('img.pdf-page') ? 1 : l.querySelectorAll('img.pdf-page').length; });
    head.querySelector('small').textContent = '~' + Math.max(1, Math.round(s.min)) + ' мин · ' + (pgs && s.words < 30 ? pgs + ' стр.' : s.words + ' слов');
    var foot = ownEl('div', 'lz-bf'); foot.setAttribute('data-b', s.id);
    foot.innerHTML = '<button class="lz-btn pri st" type="button">▶ Начать</button><button class="lz-btn rd" type="button" aria-pressed="false">✓ Прочитала</button><button class="lz-btn rc" type="button" aria-pressed="false">Проверь себя</button><button class="lz-btn ak" type="button">Спросят</button><span class="lz-spacer"></span><button class="lz-btn quiet sp" type="button">Разделить</button><button class="lz-btn quiet mg" type="button">Объединить со следующим</button>';
    var first = s.leaves[0], last = s.leaves[s.leaves.length - 1];
    first.parentNode.insertBefore(head, first); last.parentNode.insertBefore(foot, last.nextSibling);
    s.leaves.forEach(function (l) { l.setAttribute('data-bl', s.id); });
    BL.els[s.id] = { seg: s, head: head, foot: foot, items: null };
  });
  D.addEventListener('click', blocksClick, true);
  fixTables(); applyBlockState();
  // «Спросят · N»: the items are collected in idle slices so the first screen is never waiting for them
  var todo = segs.slice(), slice = function () { var t0 = performance.now(); while (todo.length && performance.now() - t0 < 12) { var sg = todo.shift(); var b = BL.els[sg.id]; b.items = blockItems(sg); BL.state.qn[sg.id] = b.items.length; } applyBlockState(); if (todo.length) setTimeout(slice, 16); else post('qcount', { n: segs.length }); };
  setTimeout(slice, 30);
  document.addEventListener('visibilitychange', function () { if (document.hidden) clearRecalls(); });
}
function blocksClick(e) {
  var t = e.target; if (!t || !t.closest) return;
  var recallHit = t.closest('.lz-blur'); if (recallHit) { var rid = recallHit.getAttribute('data-bl') || (recallHit.closest('[data-bl]') || {}).getAttribute && recallHit.closest('[data-bl]').getAttribute('data-bl'); e.preventDefault(); e.stopPropagation(); if (rid) endRecall(rid); else clearRecalls(); return; }
  var chip = t.closest('.lz-chip'); if (chip) { post('block', { ev: chip.getAttribute('data-ev') || 'plan', id: chip.getAttribute('data-id') }); return; }
  var host = t.closest('.lz-bh, .lz-bf'); if (!host) return; var id = host.getAttribute('data-b'), b = BL.els[id]; if (!b) return;
  var btn = t.closest('button'); if (!btn) return;
  e.preventDefault();
  if (btn.classList.contains('st')) post('block', { ev: 'start', id: id });
  else if (btn.classList.contains('rd')) { var on = !BL.state.done[id]; if (on) BL.state.done[id] = Date.now(); else delete BL.state.done[id]; applyBlockState(); var r = btn.getBoundingClientRect(), d = toDev(r); post('block', { ev: 'read', id: id, on: on, rect: { left: d.left, top: d.top, width: d.width, height: d.height } }); }
  else if (btn.classList.contains('rc')) { if (BL.recall[id]) endRecall(id); else startRecall(id); }
  else if (btn.classList.contains('ak')) { if (!b.items) { b.items = blockItems(b.seg); BL.state.qn[id] = b.items.length; } post('block', { ev: 'ask', id: id, title: b.seg.title, items: b.items, paras: parasOf(b.seg) }); }
  else if (btn.classList.contains('sp')) splitBlock(id);
  else if (btn.classList.contains('mg')) mergeBlock(id);
  else if (btn.classList.contains('bm')) { BL.state.bm[id] = !BL.state.bm[id]; if (!BL.state.bm[id]) delete BL.state.bm[id]; applyBlockState(); post('block', { ev: 'bm', id: id, title: b.seg.title }); }
  else if (btn.classList.contains('fl')) { BL.state.flame[id] = !BL.state.flame[id]; if (!BL.state.flame[id]) delete BL.state.flame[id]; applyBlockState(); post('block', { ev: 'flame', id: id }); }
}
// «Проверь себя»: blur over the block's key terms, auto-reveals after 20 s, cleared on any change — it can never stay stuck
function startRecall(id) {
  var b = BL.els[id]; if (!b) return; clearRecalls();
  var n = 0, els = []; b.seg.leaves.forEach(function (l) { var nodes = l.matches(TERM_SEL) ? [l] : []; l.querySelectorAll(TERM_SEL).forEach(function (e) { nodes.push(e); }); nodes.forEach(function (e) { if (!isOwn(e) && !e.closest('.lz-blur')) { e.classList.add('lz-blur'); e.setAttribute('data-bl', id); els.push(e); n++; } }); });
  if (!n) { b.seg.leaves.forEach(function (l) { l.classList.add('lz-blur'); els.push(l); }); }
  var btn = b.foot.querySelector('.rc'), left = 20; btn.classList.add('on'); btn.setAttribute('aria-pressed', 'true'); btn.textContent = 'Показать (' + left + ')';
  var rec = { els: els, btn: btn, t: setInterval(function () { left--; if (left <= 0) endRecall(id); else btn.textContent = 'Показать (' + left + ')'; }, 1000) };
  BL.recall[id] = rec;
}
function endRecall(id) {
  var r = BL.recall[id]; if (!r) { D.querySelectorAll('.lz-blur').forEach(function (e) { e.classList.remove('lz-blur'); }); return; }
  clearInterval(r.t); r.els.forEach(function (e) { e.classList.remove('lz-blur'); }); r.btn.classList.remove('on'); r.btn.setAttribute('aria-pressed', 'false'); r.btn.textContent = 'Проверь себя'; delete BL.recall[id];
}
function clearRecalls() { Object.keys(BL.recall).forEach(endRecall); D.querySelectorAll('.lz-blur').forEach(function (e) { e.classList.remove('lz-blur'); }); }
function applyBlockState() {
  var st = BL.state, only = st.onlyKey, key = {}; (st.keyIds || []).forEach(function (i) { key[i] = 1; });
  var segs = segments(), left = 0, mins = 0;
  segs.forEach(function (s, i) {
    var b = BL.els[s.id]; if (!b) return;
    var done = !!st.done[s.id], show = !only || key[s.id] || st.flame[s.id], act = st.active === s.id, dim = !!st.active && st.dim && !act;
    if (show && !done) { left++; mins += s.min; }
    s.leaves.concat([b.head, b.foot]).forEach(function (e) { e.classList.toggle('lz-hide', !show); e.classList.toggle('lz-done', done); e.classList.toggle('lz-dim', dim); });
    b.head.classList.toggle('lz-active', false);
    b.head.querySelector('.lz-bn').textContent = done ? '✓' : String(i + 1);
    var bm = b.head.querySelector('.bm'), fl = b.head.querySelector('.fl'); bm.classList.toggle('on', !!st.bm[s.id]); bm.setAttribute('aria-pressed', String(!!st.bm[s.id])); bm.textContent = st.bm[s.id] ? '★' : '☆'; fl.classList.toggle('on', !!st.flame[s.id]); fl.setAttribute('aria-pressed', String(!!st.flame[s.id])); fl.textContent = '⚑';
    var rd = b.foot.querySelector('.rd'); rd.classList.toggle('on', done); rd.setAttribute('aria-pressed', String(done)); rd.textContent = done ? '✓ Прочитано' : '✓ Прочитала';
    var sb = b.foot.querySelector('.st'); sb.textContent = act ? '● Идёт' : '▶ Начать'; sb.disabled = act;
    b.foot.querySelector('.ak').textContent = st.qn[s.id] != null ? 'Спросят · ' + st.qn[s.id] : 'Спросят';
    b.head.style.outline = act ? '2px solid var(--lz-ink)' : '';
  });
  if (BL.plan) {
    var plans = st.plans || [];
    BL.plan.innerHTML = '<h3></h3><p>Блок — кусочек документа на 2–7 минут заучивания. Время идёт только внутри блока.</p><div class="lz-chips"></div>';
    var mm = Math.round(mins), word = function (n, a, b, c) { n = Math.abs(n) % 100; var m = n % 10; return n > 10 && n < 20 ? c : m > 1 && m < 5 ? b : m === 1 ? a : c; };
    BL.plan.querySelector('h3').textContent = 'Сегодня: ' + left + ' ' + word(left, 'блок', 'блока', 'блоков') + ' ~ ' + (st.planMins != null ? st.planMins(left) : mm) + ' мин';
    var box = BL.plan.querySelector('.lz-chips');
    plans.forEach(function (p) { var c = D.createElement('button'); c.type = 'button'; c.className = 'lz-chip' + (p.id === st.planId ? ' on' : ''); c.setAttribute('data-id', p.id); c.setAttribute('data-ev', 'plan'); c.textContent = p.label; box.appendChild(c); });
  }
  if (BL.rest) { BL.rest.hidden = !st.restText; BL.rest.textContent = st.restText || ''; }
}
H.blockState = function (m) {
  var st = BL.state; for (var k in m.state) st[k] = m.state[k];
  if (m.state && m.state.plans && m.state.planStudy != null) { var ps = m.state.planStudy; st.planMins = function (n) { return n * ps; }; } else st.planMins = null;
  applyBlockState();
};
H.blockScroll = function (m) { var b = BL.els[m.id]; if (b) b.head.scrollIntoView({ behavior: m.smooth ? 'smooth' : 'auto', block: 'start' }); };
function layoutBlocks() { fixTables(); }
