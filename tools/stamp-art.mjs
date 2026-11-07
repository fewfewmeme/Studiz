// Own line artwork for the stamp (original drawing, inspired by the idea of the owner's sketch: a tall flower on top,
// a striped cat with a watering can at the bottom, a sprout). Coordinates: 400x400 stamp space, inner disc r = 150 at (200,200).
// All strokes use the ink colour passed in; the hand-pressed look (wobble, uneven ink) is added by the filter in build-stamp.mjs.
export function artSvg(ink) {
  const S = (w = 3) => `fill="none" stroke="${ink}" stroke-width="${(w*1.12).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"`;
  const F = `fill="${ink}" stroke="none"`;
  // ---- flower: 12 round petals, a spiral centre, bent stem with two leaves ----
  let petals = '';
  const fx = 158, fy = 106, pr = 15, orad = 26;
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6 + 0.12, cx = fx + Math.cos(a) * orad, cy = fy + Math.sin(a) * orad;
    petals += `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${pr}" ry="${pr * 0.78}" transform="rotate(${(a * 180 / Math.PI).toFixed(0)} ${cx.toFixed(1)} ${cy.toFixed(1)})" ${S(2.6)}/>`;
  }
  const flower = `<g>${petals}
<path d="M${fx - 1},${fy + 1} c2,-5 9,-5 10,0 c1,6 -6,10 -12,7 c-8,-4 -6,-15 3,-17 c10,-2 17,6 15,15" ${S(2.6)}/>
<path d="M${fx - 9},${fy - 12} c4,-3 8,-3 12,-1 M${fx - 14},${fy + 3} c1,5 4,9 8,10" ${S(2)}/></g>`;
  const stem = `<g>
<path d="M158,134 C161,170 154,205 158,242 C161,285 156,312 159,336" ${S(3.4)}/>
<path d="M156,200 C140,196 128,184 126,170 C142,170 154,181 156,200 Z" ${S(2.8)}/>
<path d="M126,170 C135,178 145,188 156,200" ${S(1.6)}/>
<path d="M160,262 C178,258 190,246 192,232 C176,232 163,243 160,262 Z" ${S(2.8)}/>
<path d="M192,232 C182,242 172,252 160,262" ${S(1.6)}/></g>`;
  // ---- sprout (right of the stem, under the spout) ----
  const sprout = `<g>
<path d="M176,338 C176,330 175,323 173,317" ${S(3)}/>
<path d="M175,321 C184,321 190,314 190,307 C182,306 175,312 175,321 Z" ${S(2.6)}/></g>`;
  // ---- watering can (rose points left-up, handle on the right, held by the cat) ----
  const can = `<g>
<path d="M205,285 L228,285 C231,285 233,287 233,290 L235,317 C235,320 233,322 230,322 L206,322 C203,322 201,320 201,317 L202,290 C202,287 203,285 205,285 Z" ${S(3)}/>
<path d="M202,294 L233,294" ${S(1.8)}/>
<path d="M203,310 L234,310" ${S(1.6)} stroke-dasharray="1 5"/>
<path d="M203,304 L184,282" ${S(3)}/><path d="M203,313 L190,293" ${S(3)}/>
<path d="M177,276 L190,282 L186,294 L174,288 Z" ${F}/>
<path d="M231,289 C250,287 253,310 235,319" ${S(3)}/></g>`;
  const water = `<g ${S(2.2)}><path d="M173,299 q-1,5 0,9 M180,300 q0,6 1,10 M167,298 q-1,4 -1,8"/></g>`;
  // ---- cat (drawn in an earlier layout, then moved left by 22 so that it stays inside the ring) ----
  const cat = `<g transform="translate(-22 0)">
<path d="M298,331 C318,331 327,313 319,301 C314,295 306,298 310,305" ${S(3.6)}/>
<path d="M318,320 l6,-3 M321,309 l6,-1" ${S(2.4)}/>
<path d="M246,282 C234,296 233,318 244,332 C262,339 284,336 298,327 C312,314 312,294 300,282" ${S(3.2)}/>
<path d="M293,296 l11,2 M295,308 l12,2 M293,319 l10,1 M262,302 l8,0 M260,313 l9,0" ${S(3.4)}/>
<path d="M240,306 C231,306 229,318 238,321 C247,323 252,310 244,306" ${S(3)}/>
<path d="M236,310 l5,-1 M237,316 l5,-1" ${S(1.8)}/>
<g transform="translate(0 16)">
<path d="M243,214 L244,190 L262,206 M290,206 L306,190 L309,216" ${S(3)}/>
<path d="M246,196 l6,6 l-8,2 Z M303,196 l-6,6 l8,2 Z" ${F}/>
<path d="M241,230 C240,208 258,202 275,202 C292,202 310,208 309,230 C310,250 293,264 275,264 C257,264 240,250 241,230 Z" ${S(3.2)}/>
<path d="M266,204 l0,9 M275,203 l0,10 M284,204 l0,9 M245,226 l8,2 M305,226 l-8,2" ${S(3.4)}/>
<ellipse cx="260" cy="233" rx="3.6" ry="4.8" ${F}/><ellipse cx="291" cy="233" rx="3.6" ry="4.8" ${F}/>
<path d="M271,243 l8,0 l-4,5 Z" ${F}/>
<path d="M275,248 l0,3 M275,251 c-3,4 -8,3 -9,-1 M275,251 c3,4 8,3 9,-1" ${S(2)}/>
<path d="M243,242 l-17,-3 M243,248 l-18,4 M244,253 l-15,8 M308,242 l17,-3 M308,248 l18,4 M307,253 l15,8" ${S(1.8)}/></g></g>`;
  const ground = `<g ${F}><circle cx="214" cy="341" r="1.6"/><circle cx="232" cy="344" r="1.4"/><circle cx="138" cy="344" r="1.5"/><circle cx="124" cy="339" r="1.3"/><circle cx="196" cy="339" r="1.3"/></g>`;
  const sparkle = `<g ${S(2)}><path d="M112,150 l0,10 M107,155 l10,0"/><path d="M232,200 l0,0"/><path d="M296,172 l0,7 M292.5,175.5 l7,0"/><path d="M124,262 l0,7 M120.5,265.5 l7,0"/></g>`;
  // butterfly (upper right), small bud and grass (left) to fill the halves the way a real stamp is filled
  const extras = `<g>
<path d="M255,140 C243,126 234,137 242,148 C246,154 252,151 255,146 C252,158 243,166 248,171 C254,175 258,160 255,146" ${S(2.6)}/>
<path d="M255,146 C262,126 280,128 274,141 C271,148 262,149 257,147 C266,156 272,164 266,169 C260,172 256,158 255,146" ${S(2.6)}/>
<path d="M255,140 C253,132 250,128 246,126 M256,140 C258,132 261,128 265,126" ${S(1.8)}/>
<circle cx="265" cy="140" r="2.6" ${F}/><circle cx="244" cy="141" r="2.2" ${F}/>
<path d="M118,332 C116,322 118,306 112,292" ${S(3)}/>
<path d="M112,292 C104,288 101,280 104,274 C110,275 113,283 112,292 Z M112,292 C118,286 126,285 130,288 C127,294 120,296 112,292 Z M112,292 C108,284 112,276 118,274 C121,280 118,288 112,292 Z" ${S(2.4)}/>
<path d="M104,330 C105,322 104,316 101,311 M134,330 C133,323 135,317 139,312 M124,333 C125,327 127,324 130,322" ${S(2.4)}/>
<path d="M236,160 c-6,-7 -12,2 -6,7 c4,3 6,5 6,5 c0,0 2,-2 6,-5 c6,-5 0,-14 -6,-7 Z" ${S(2)} transform="translate(60 -6) scale(.8)"/></g>`;
  return `<g transform="translate(-14 0)">${stem}${flower}</g><g transform="translate(-8 0)">${sprout}</g>${ground}${extras}${cat}<g transform="translate(-14 0)">${can}${water}</g>${sparkle}`;
}
