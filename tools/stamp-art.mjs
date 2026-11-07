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
  // ---- cat sitting upright, holding the watering can in its front paws (idea of the owner's sketch, own drawing) ----
  const cat = `<g>
<path d="M293,313 C308,314 315,298 308,288 C304,282 297,286 301,293" ${S(3.6)}/>
<path d="M309,306 l7,-2 M310,296 l6,-2" ${S(2.4)}/>
<path d="M232,268 C222,280 216,298 220,316 C223,326 232,332 246,334 C262,336 280,330 290,320" ${S(3.2)}/>
<path d="M276,268 C288,280 296,296 292,310" ${S(3.2)}/>
<path d="M283,286 l10,3 M286,298 l9,2 M284,310 l9,1" ${S(3.4)}/>
<path d="M226,284 l9,1 M224,298 l8,1" ${S(3)}/>
<g transform="translate(-20 11)">
<path d="M243,214 L244,190 L262,206 M290,206 L306,190 L309,216" ${S(3)}/>
<path d="M246,196 l6,6 l-8,2 Z M303,196 l-6,6 l8,2 Z" ${F}/>
<path d="M241,230 C240,208 258,202 275,202 C292,202 310,208 309,230 C310,250 293,264 275,264 C257,264 240,250 241,230 Z" ${S(3.2)}/>
<path d="M266,204 l0,9 M275,203 l0,10 M284,204 l0,9 M245,226 l8,2 M305,226 l-8,2" ${S(3.4)}/>
<ellipse cx="260" cy="233" rx="3.6" ry="4.8" ${F}/><ellipse cx="291" cy="233" rx="3.6" ry="4.8" ${F}/>
<path d="M271,243 l8,0 l-4,5 Z" ${F}/>
<path d="M275,248 l0,3 M275,251 c-3,4 -8,3 -9,-1 M275,251 c3,4 8,3 9,-1" ${S(2)}/>
<path d="M243,242 l-17,-3 M243,248 l-18,4 M244,253 l-15,8 M308,242 l17,-3 M308,248 l18,4 M307,253 l15,8" ${S(1.8)}/></g></g>`;
  // the can in the paws: rose + spout to the left, handle on the right, two paws on its top edge
  const can = `<g>
<path d="M226,295 L262,295 C265,295 267,297 267,300 L269,326 C269,329 267,331 264,331 L228,331 C225,331 223,329 223,326 L224,300 C224,297 225,295 226,295 Z" ${S(3)}/>
<path d="M224,304 L268,304" ${S(1.8)}/>
<path d="M225,318 L268,318" ${S(1.6)} stroke-dasharray="1 5"/>
<path d="M224,311 L204,289" ${S(3)}/><path d="M224,321 L211,301" ${S(3)}/>
<path d="M198,283 L211,289 L206,301 L194,295 Z" ${F}/>
<path d="M266,299 C282,298 284,320 268,326" ${S(3)}/>
<path d="M224,285 C216,286 216,300 226,300 C236,300 238,290 232,285 Z M262,285 C254,284 252,298 262,298 C272,298 273,288 268,285 Z" ${S(2.8)}/>
<path d="M221,292 l5,2 M229,290 l1,5 M259,291 l5,2 M266,290 l1,5" ${S(1.8)}/></g>`;
  const water = `<g ${S(2.2)}><path d="M192,304 q-1,5 0,9 M199,306 q0,6 1,10 M185,303 q-1,4 -1,8"/></g>`;
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
  return `<g transform="translate(-14 0)">${stem}${flower}</g><g transform="translate(4 0)">${sprout}</g>${ground}${extras}${cat}${can}${water}${sparkle}`;
}
