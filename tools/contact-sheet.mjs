// Contact sheet of all webp files in a folder (dev helper): node tools/contact-sheet.mjs dir out.png [bg]
import { loadSharp } from './lib-image.mjs';
const sharp = await loadSharp();
import fs from 'fs';
const dir=process.argv[2], out=process.argv[3], names=fs.readdirSync(dir).filter(f=>f.endsWith('.webp')&&!f.includes('@2x')).sort();
const S=260, cols=4, rows=Math.ceil(names.length/cols);
const layers=[];
for(const [i,n] of names.entries()){ const b=await sharp(`${dir}/${n}`).resize(S-20,S-20,{fit:'inside'}).png().toBuffer(); layers.push({input:b,left:(i%cols)*S+10,top:Math.floor(i/cols)*S+10}); }
await sharp({create:{width:cols*S,height:rows*S,channels:3,background:{r:40,g:70,b:130}}}).composite(layers).png().toFile(out);
console.log(names.join(' '));
