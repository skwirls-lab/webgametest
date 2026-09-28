// Environment pixel art: tileable textures (16 px per world unit) and prop sprites.
// Same ramp-and-top-left-light rules as the characters.
import { Pix, Mask, ramp, paint, dots, outline, hash2, PAL } from './pixel.js';

export const T = {
  grass: ramp('#b4dc78', '#8cc056', '#6aa040', '#4c7e32', '#315724'),
  leaf: ramp('#c4e27a', '#94c456', '#6ea23e', '#4d7c30', '#2f5222'),
  pine: ramp('#8cbc78', '#62975a', '#467842', '#305a32', '#1e3c22'),
  dirt: ramp('#ecd09a', '#d2ae74', '#b08a56', '#8a663e', '#5e4228'),
  stone: ramp('#d6d0c0', '#b0aa9a', '#8c8778', '#686458', '#45423a'),
  water: ramp('#d8f6f6', '#8fd6e6', '#58add0', '#3a84b0', '#245a86'),
  wood: PAL.wood,
  plaster: ramp('#fbf2dc', '#efe2c2', '#dccba4', '#b8a47c', '#8a7658'),
  beam: ramp('#8a6444', '#6c4a30', '#523622', '#3a2618', '#24170e'),
  roof: ramp('#ee9a74', '#d27556', '#ae5640', '#843c30', '#562424'),
  bark: ramp('#b08a66', '#8a6648', '#6a4c34', '#4c3424', '#302016'),
  flowerY: ramp('#fff4b0', '#ffe070', '#f0bc40', '#c89028', '#8a6018'),
  flowerP: ramp('#f6c8f0', '#e09ad8', '#bc6cb8', '#8c4a8c', '#5a2c5c'),
  flowerW: ramp('#ffffff', '#f4f0f4', '#dcd4e0', '#b0a6b8', '#7a7086'),
  glass: ramp('#fff8d0', '#ffe48a', '#f4c050', '#c8903a', '#8a5a28'),
  mushroom: ramp('#f6a08c', '#e06a58', '#c04840', '#8e3030', '#5c1c1e'),
};

// periodic value noise (wraps every `period` cells) for seamless tiles
function pnoise(x, y, cell, period, seed) {
  const gx = x / cell;
  const gy = y / cell;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const fx = gx - ix;
  const fy = gy - iy;
  const P = period / cell;
  const h = (a, b) => hash2(((a % P) + P) % P, ((b % P) + P) % P, seed);
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  return (h(ix, iy) * (1 - u) + h(ix + 1, iy) * u) * (1 - v) + (h(ix, iy + 1) * (1 - u) + h(ix + 1, iy + 1) * u) * v;
}

const S = 64; // tile texture size (4 world units)

function grassTop(seed = 1) {
  const P = new Pix(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = pnoise(x, y, 16, S, seed) * 0.6 + pnoise(x, y, 8, S, seed + 1) * 0.4;
    const t = n > 0.66 ? 1 : n < 0.36 ? 3 : 2;
    P.set(x, y, T.grass[t]);
  }
  // blades: a light tip over a dark root
  for (let i = 0; i < 150; i++) {
    const x = Math.floor(hash2(i, 1, seed) * S);
    const y = Math.floor(hash2(i, 2, seed) * S);
    P.set(x, y, T.grass[0]);
    P.set(x, (y + 1) % S, T.grass[hash2(i, 3, seed) > 0.5 ? 2 : 1]);
    P.set((x + 1) % S, (y + 1) % S, T.grass[3]);
  }
  // a few tiny flowers
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(hash2(i, 7, seed) * S);
    const y = Math.floor(hash2(i, 8, seed) * S);
    const r = [T.flowerW, T.flowerY, T.flowerP][i % 3];
    P.set(x, y, r[1]);
    P.set((x + 1) % S, y, r[2]);
    P.set(x, (y + 1) % S, r[3]);
  }
  return P;
}

function dirtTop(seed = 3) {
  const P = new Pix(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = pnoise(x, y, 16, S, seed) * 0.5 + pnoise(x, y, 4, S, seed + 1) * 0.5;
    P.set(x, y, T.dirt[n > 0.64 ? 1 : n < 0.34 ? 3 : 2]);
  }
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(hash2(i, 1, seed) * S);
    const y = Math.floor(hash2(i, 2, seed) * S);
    P.set(x, y, T.stone[1]);
    P.set((x + 1) % S, y, T.stone[2]);
    P.set(x, (y + 1) % S, T.dirt[4]);
    P.set((x + 1) % S, (y + 1) % S, T.dirt[4]);
  }
  return P;
}

function cobble(seed = 5) {
  const P = new Pix(S, S);
  // irregular stones on a staggered grid
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const row = Math.floor(y / 8);
    const off = row % 2 ? 5 : 0;
    const cx = ((x + off) % 10);
    const cy = y % 8;
    const edge = cx === 0 || cy === 0 || (cx === 9 && cy === 7);
    const n = pnoise(x, y, 8, S, seed);
    let t = n > 0.6 ? 1 : 2;
    if (cy === 1 || cx === 1) t = 1;
    if (cy === 7 || cx === 9) t = 3;
    P.set(x, y, edge ? T.stone[4] : T.stone[t]);
  }
  return P;
}

// cliff face; `lip` draws a grass overhang along the top edge
function cliff(seed = 7, lip = true) {
  const P = new Pix(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const band = Math.floor((y + Math.floor(pnoise(x, 0, 16, S, seed) * 5)) / 9);
    const bx = (x + band * 13) % 16;
    const joint = bx === 0 || (y + Math.floor(pnoise(x, 0, 16, S, seed) * 5)) % 9 === 0;
    const n = pnoise(x, y, 8, S, seed + 2);
    let t = n > 0.62 ? 1 : n < 0.3 ? 3 : 2;
    if (bx === 1) t = Math.max(1, t - 1);
    P.set(x, y, joint ? T.stone[4] : T.stone[t]);
  }
  if (lip) {
    for (let x = 0; x < S; x++) {
      const depth = 3 + Math.floor(hash2(x >> 1, 9, seed) * 4) + (x % 7 === 0 ? 3 : 0);
      for (let y = 0; y < depth; y++) P.set(x, y, T.grass[y === depth - 1 ? 4 : y === 0 ? 1 : 2 + (y > depth - 3 ? 1 : 0)]);
    }
  }
  return P;
}

function waterFrames(n = 4, seed = 9) {
  const frames = [];
  for (let f = 0; f < n; f++) {
    const P = new Pix(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const nn = pnoise(x, y, 16, S, seed);
      let t = nn > 0.55 ? 2 : 3;
      // travelling wave highlights
      const w = Math.sin(((x + y * 0.5) / S) * Math.PI * 4 + (f / n) * Math.PI * 2 + pnoise(x, y, 16, S, seed + 1) * 6);
      if (w > 0.93) t = 0;
      else if (w > 0.75) t = 1;
      P.set(x, y, T.water[t]);
    }
    frames.push(P);
  }
  return frames;
}

function planks(seed = 11) {
  const P = new Pix(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const px = x % 8;
    const grain = pnoise(x * 4, y, 8, S * 4, seed + (x >> 3));
    let t = grain > 0.6 ? 1 : grain < 0.35 ? 3 : 2;
    if (px === 0) t = 4;
    if (px === 1) t = Math.max(0, t - 1);
    P.set(x, y, T.wood[t]);
  }
  return P;
}

// cream plaster between dark timber beams (tudor style)
function timberWall(seed = 13) {
  const P = new Pix(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = pnoise(x, y, 8, S, seed);
    P.set(x, y, T.plaster[n > 0.65 ? 0 : n < 0.3 ? 2 : 1]);
  }
  const beam = (m) => paint(P, m, T.beam, { ink: false });
  const m = new Mask(S, S);
  m.rect(0, 0, 4, S).rect(30, 0, 4, S).rect(0, 0, S, 3).rect(0, 30, S, 4);
  beam(m);
  const d = new Mask(S, S);
  d.line(4, 30, 29, 4, 3).line(34, 4, 60, 30, 3);
  beam(d);
  return P;
}

function roof(seed = 15) {
  const P = new Pix(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const row = Math.floor(y / 6);
    const off = row % 2 ? 4 : 0;
    const tx = (x + off) % 8;
    const ty = y % 6;
    let t = 2;
    if (ty === 0) t = 1;
    if (ty >= 4) t = 3;
    if (ty === 5) t = 4;
    if (tx === 0) t = Math.min(4, t + 1);
    if (hash2(Math.floor((x + off) / 8), row, seed) > 0.8 && t < 3) t = Math.max(0, t - 1);
    P.set(x, y, T.roof[t]);
  }
  return P;
}

// ---------------------------------------------------------------------------
// sprites (drawn on transparent canvases, then outlined)
// ---------------------------------------------------------------------------

function clusters(P, m, rmp, seed) {
  // foliage: shaded blobs, each separated by ink lines, with leafy speckles
  paint(P, m, rmp);
  for (let y = 0; y < P.h; y++) for (let x = 0; x < P.w; x++) {
    if (!m.has(x, y)) continue;
    const r = hash2(x, y, seed);
    if (r > 0.95 && m.has(x - 1, y - 1) && m.has(x + 1, y + 1)) P.set(x, y, rmp[0]);
    else if (r < 0.03 && m.has(x, y + 1)) P.set(x, y, rmp[3]);
  }
}

function oak(seed = 21) {
  const P = new Pix(64, 88);
  // trunk with root flare
  const tr = new Mask(64, 88).poly([[27, 86], [37, 86], [35, 58], [34, 44], [30, 44], [29, 58]]).poly([[22, 87], [42, 87], [37, 80], [27, 80]]);
  paint(P, tr, T.bark);
  const br = new Mask(64, 88).line(32, 56, 22, 46, 2).line(33, 52, 44, 44, 2);
  paint(P, br, T.bark);
  // canopy in layered clusters, back to front
  const blobs = [
    [20, 40, 12, 9], [44, 40, 12, 9], [32, 34, 14, 11],
    [16, 28, 11, 9], [48, 28, 11, 9], [32, 20, 14, 11],
    [22, 14, 10, 8], [42, 14, 10, 8], [32, 44, 11, 7],
  ];
  blobs.forEach(([x, y, rx, ry], i) => {
    const m = new Mask(64, 88).ellipse(x, y, rx, ry, 0.35, seed + i).clean();
    clusters(P, m, T.leaf, seed + i);
  });
  outline(P);
  return P;
}

function pine(seed = 31) {
  const P = new Pix(48, 88);
  paint(P, new Mask(48, 88).rect(22, 70, 5, 17), T.bark);
  const tiers = 6;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const top = 4 + t * 52;
    const half = 6 + t * 16;
    const bot = top + 18;
    const m = new Mask(48, 88);
    // apex, then a jagged bottom edge from the right tip to the left tip
    const pts = [[24, top]];
    const steps = 8;
    for (let k = steps; k >= 0; k--) {
      const u = k / steps;
      pts.push([24 + half * u, bot - (k % 2 ? 3 : 0) - u * 3]);
    }
    for (let k = 1; k <= steps; k++) {
      const u = k / steps;
      pts.push([24 - half * u, bot - (k % 2 ? 3 : 0) - u * 3]);
    }
    m.poly(pts);
    clusters(P, m, T.pine, seed + i);
  }
  outline(P);
  return P;
}

function bush(seed = 41, berries = false) {
  const P = new Pix(32, 24);
  [[10, 15, 8, 7], [22, 15, 8, 7], [16, 10, 9, 7]].forEach(([x, y, rx, ry], i) => {
    clusters(P, new Mask(32, 24).ellipse(x, y, rx, ry, 0.3, seed + i).clean(), T.leaf, seed + i);
  });
  if (berries) {
    const pts = [];
    for (let i = 0; i < 7; i++) {
      const x = 6 + Math.floor(hash2(i, 1, seed) * 20);
      const y = 7 + Math.floor(hash2(i, 2, seed) * 11);
      pts.push([x, y, T.mushroom[1]], [x, y + 1, T.mushroom[3]]);
    }
    dots(P, pts);
  }
  outline(P);
  return P;
}

function flowers(seed = 51) {
  const P = new Pix(16, 16);
  const heads = [T.flowerY, T.flowerP, T.flowerW];
  for (let i = 0; i < 4; i++) {
    const x = 2 + Math.floor(hash2(i, 1, seed) * 12);
    const top = 5 + Math.floor(hash2(i, 2, seed) * 6);
    paint(P, new Mask(16, 16).line(x, top, x, 15), T.grass, { flat: true, tone: 1, ink: false });
    const h = heads[i % 3];
    dots(P, [[x, top - 1, h[1]], [x - 1, top, h[1]], [x + 1, top, h[2]], [x, top + 1, h[3]], [x, top, T.flowerY[2]]]);
  }
  outline(P);
  return P;
}

function tallGrass(seed = 61) {
  const P = new Pix(16, 16);
  for (let i = 0; i < 7; i++) {
    const x = 1 + Math.floor(hash2(i, 1, seed) * 14);
    const h = 6 + Math.floor(hash2(i, 2, seed) * 9);
    const lean = hash2(i, 3, seed) > 0.5 ? 1 : -1;
    const m = new Mask(16, 16).line(x, 15, x + lean, 15 - h);
    paint(P, m, T.grass, { flat: true, tone: i % 2 ? 1 : 2, ink: false });
    dots(P, [[x + lean, 15 - h, T.grass[0]]]);
  }
  outline(P);
  return P;
}

function lantern() {
  const P = new Pix(16, 44);
  paint(P, new Mask(16, 44).rect(7, 12, 3, 32), T.beam);
  paint(P, new Mask(16, 44).rect(4, 10, 9, 2), T.beam);
  paint(P, new Mask(16, 44).rect(5, 2, 7, 2), PAL.metal, { tone: 2 });
  paint(P, new Mask(16, 44).rect(5, 4, 7, 6), T.glass);
  dots(P, [[5, 4, PAL.metal[3]], [11, 4, PAL.metal[3]], [5, 9, PAL.metal[3]], [11, 9, PAL.metal[3]], [8, 1, PAL.metal[3]]]);
  outline(P);
  return P;
}

function barrel() {
  const P = new Pix(16, 20);
  paint(P, new Mask(16, 20).ellipse(8, 10, 6.5, 9), T.wood);
  paint(P, new Mask(16, 20).rect(2, 5, 13, 1).rect(2, 14, 13, 1), PAL.metal, { flat: true, tone: 2, ink: false });
  paint(P, new Mask(16, 20).ellipse(8, 2.5, 5.5, 1.6), T.wood, { tone: 1 });
  outline(P);
  return P;
}

function crate() {
  const P = new Pix(16, 16);
  paint(P, new Mask(16, 16).rect(1, 2, 14, 13), T.wood);
  paint(P, new Mask(16, 16).rect(1, 2, 14, 2).rect(1, 13, 14, 2).line(3, 12, 12, 4, 2), T.wood, { tone: 1 });
  outline(P);
  return P;
}

function sign() {
  const P = new Pix(20, 24);
  paint(P, new Mask(20, 24).rect(9, 10, 2, 14), T.beam);
  paint(P, new Mask(20, 24).rect(2, 3, 16, 9), T.wood);
  dots(P, [[5, 6, T.beam[3]], [6, 6, T.beam[3]], [7, 6, T.beam[3]], [9, 6, T.beam[3]], [10, 6, T.beam[3]], [12, 6, T.beam[3]], [13, 6, T.beam[3]], [14, 6, T.beam[3]], [5, 8, T.beam[3]], [6, 8, T.beam[3]], [8, 8, T.beam[3]], [9, 8, T.beam[3]], [10, 8, T.beam[3]]]);
  outline(P);
  return P;
}

function mushrooms(seed = 71) {
  const P = new Pix(16, 12);
  [[5, 6, 3.5], [11, 8, 2.6]].forEach(([x, y, r]) => {
    paint(P, new Mask(16, 12).rect(x - 1, y, 2, 12 - y), T.plaster);
    paint(P, new Mask(16, 12).ellipse(x, y, r, r * 0.7), T.mushroom);
    dots(P, [[x - 1, y - 1, T.flowerW[0]], [x + 1, y, T.flowerW[1]]]);
  });
  outline(P);
  return P;
}

function rock(seed = 81) {
  const P = new Pix(20, 14);
  paint(P, new Mask(20, 14).ellipse(10, 8, 8.5, 5.5, 0.3, seed).clean(), T.stone);
  outline(P);
  return P;
}

function door() {
  const P = new Pix(20, 32);
  paint(P, new Mask(20, 32).rect(1, 4, 18, 28).ellipse(10, 6, 9, 5), T.beam, { ink: false });
  const d = new Mask(20, 32).rect(3, 6, 14, 26).ellipse(10, 7, 7, 4);
  paint(P, d, T.wood);
  for (let x = 6; x < 17; x += 4) paint(P, new Mask(20, 32).rect(x, 6, 1, 26), T.wood, { flat: true, tone: 2, ink: false });
  dots(P, [[14, 19, PAL.metal[1]], [14, 20, PAL.metal[3]]]);
  return P;
}

function windowTex(lit = false) {
  const P = new Pix(16, 16);
  paint(P, new Mask(16, 16).rect(0, 0, 16, 16), T.beam, { ink: false });
  const g = lit ? T.glass : ramp('#bfe0ea', '#8cbccc', '#6a98ac', '#4c7488', '#324e60');
  paint(P, new Mask(16, 16).rect(2, 2, 12, 12), g, { ink: false });
  paint(P, new Mask(16, 16).rect(7, 2, 2, 12).rect(2, 7, 12, 2), T.beam, { flat: true, ink: false });
  if (!lit) dots(P, [[3, 3, [255, 255, 255, 255]], [4, 3, g[0]], [3, 4, g[0]], [10, 3, g[0]]]);
  return P;
}

function awning() {
  const P = new Pix(S, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < S; x++) {
    const red = Math.floor(x / 8) % 2 === 0;
    const r = red ? PAL.redCloth : T.plaster;
    P.set(x, y, r[y < 2 ? 1 : y > 12 ? 3 : 2]);
  }
  // scalloped hem
  for (let x = 0; x < S; x++) if (x % 8 === 0 || x % 8 === 7) { P.clear(x, 15); P.clear(x, 14); }
  return P;
}

export function buildTextures() {
  return {
    grass: grassTop(1),
    grass2: grassTop(2),
    dirt: dirtTop(3),
    cobble: cobble(5),
    cliff: cliff(7, true),
    rockface: cliff(8, false),
    water: waterFrames(4, 9),
    planks: planks(11),
    timber: timberWall(13),
    roof: roof(15),
    door: door(),
    window: windowTex(false),
    windowLit: windowTex(true),
    awning: awning(),
  };
}

export function buildProps() {
  return {
    oak: oak(21),
    oak2: oak(24),
    pine: pine(31),
    bush: bush(41),
    berryBush: bush(44, true),
    flowers: flowers(51),
    flowers2: flowers(55),
    tallGrass: tallGrass(61),
    lantern: lantern(),
    barrel: barrel(),
    crate: crate(),
    sign: sign(),
    mushrooms: mushrooms(71),
    rock: rock(81),
  };
}

// For the PNG export: one tileset sheet and one props sheet.
export function buildAllTiles() {
  const tex = buildTextures();
  const tiles = [tex.grass, tex.grass2, tex.dirt, tex.cobble, tex.cliff, tex.rockface, ...tex.water, tex.planks, tex.timber, tex.roof];
  const cols = 4;
  const sheet = new Pix(S * cols, S * Math.ceil(tiles.length / cols));
  tiles.forEach((t, i) => sheet.blit(t, (i % cols) * S, Math.floor(i / cols) * S));

  const props = buildProps();
  const list = Object.values(props);
  const pw = list.reduce((a, p) => a + p.w + 4, 4);
  const ph = Math.max(...list.map((p) => p.h)) + 8;
  const psheet = new Pix(pw, ph);
  let x = 4;
  for (const p of list) {
    psheet.blit(p, x, ph - 4 - p.h);
    x += p.w + 4;
  }
  return { tileset: sheet, props: psheet };
}
