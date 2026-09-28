// Exports every generated sprite sheet and tileset as PNG files.
//   node hd2d/tools/export.mjs            -> hd2d/assets/*.png (native size)
//   node hd2d/tools/export.mjs --preview  -> also writes enlarged previews
import fs from 'node:fs';
import path from 'node:path';
import { encodePNG } from './png.mjs';
import { Pix, scale } from '../src/pixel.js';
import { CAST, buildSheet } from '../src/rodents.js';

const here = path.dirname(new URL(import.meta.url).pathname);
const outDir = process.env.OUT || path.join(here, '../assets');
fs.mkdirSync(outDir, { recursive: true });
const preview = process.argv.includes('--preview');

function onBackdrop(pix, k) {
  // enlarged copy on a soft two-tone checkerboard for viewing
  const big = scale(pix, k);
  const out = new Pix(big.w, big.h);
  for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) {
    const c = ((x >> 4) + (y >> 4)) & 1 ? [214, 222, 206, 255] : [228, 234, 220, 255];
    out.set(x, y, c);
  }
  out.blit(big, 0, 0);
  return out;
}

const write = (name, pix) => fs.writeFileSync(path.join(outDir, name), encodePNG(pix));

const extra = await import('../src/tiles.js').catch(() => null);
for (const [key, spec] of Object.entries(CAST)) {
  const sheet = buildSheet(spec);
  write(`${key}_walk.png`, sheet);
  if (preview) write(`${key}_walk_preview.png`, onBackdrop(sheet, 6));
}
if (extra) {
  for (const [name, pix] of Object.entries(extra.buildAllTiles())) {
    write(`${name}.png`, pix);
    if (preview) write(`${name}_preview.png`, onBackdrop(pix, 4));
  }
}
console.log('exported to', outDir);
