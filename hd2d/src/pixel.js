// Tiny pixel-art toolkit. Pure JS (no DOM), so the same code draws sprites in
// the browser and exports PNG sprite sheets from Node.
//
// Art rules shared by every asset, which is what keeps the style consistent:
//  - every colour comes from a 5-tone ramp (highlight, light, base, shade, dark)
//  - light always comes from the top-left
//  - parts drawn over other parts get a dark "ink" line where they meet
//  - silhouettes get a selective outline: a darkened version of the edge colour

export function hex(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}
export const ramp = (...hs) => hs.map(hex);

// Shared palette. Ramps run light -> dark.
export const PAL = {
  grayFur: ramp('#e4e3e8', '#bdbbc3', '#96939e', '#6e6a77', '#474350'),
  cream: ramp('#fff6e4', '#f1e0bf', '#dbc49c', '#b39c77', '#806d52'),
  leather: ramp('#d49a5c', '#b07540', '#8b5730', '#653d22', '#402515'),
  darkLeather: ramp('#86603f', '#68482e', '#4d3522', '#342317', '#20150d'),
  cloak: ramp('#9cbc62', '#739a45', '#557a33', '#3c5a25', '#253b17'),
  metal: ramp('#f6f8fc', '#cfd4de', '#9aa2b2', '#6c7384', '#434857'),
  wood: ramp('#e6b876', '#c29050', '#9a6a38', '#704a26', '#4a2e17'),
  nose: ramp('#f6c0c0', '#e39196', '#bd6570', '#8e4450', '#5c2a33'),
  earPink: ramp('#f6d0cc', '#e3aca8', '#c38884', '#9a6664', '#6a4444'),
  eye: ramp('#ffffff', '#6a5d66', '#2a2127', '#1b1419', '#0e0a0d'),
  feather: ramp('#ffffff', '#f0ece4', '#d8d0c4', '#b0a698', '#7c7266'),
  redFeather: ramp('#f08a70', '#d05a44', '#a83c30', '#7c2822', '#501816'),
  // NPC palettes
  brownFur: ramp('#e0b48a', '#c2926a', '#9e714e', '#775236', '#4f3422'),
  chipFur: ramp('#f4c27e', '#dd9d58', '#b9773a', '#8a5426', '#5a3417'),
  robe: ramp('#8f9fd0', '#6c7cb4', '#515e93', '#3b4570', '#262d4c'),
  apron: ramp('#f2e6c8', '#dccda6', '#bfae84', '#968662', '#665a42'),
  trousers: ramp('#a39a6e', '#817852', '#635c3d', '#46412b', '#2d2a1b'),
  redCloth: ramp('#e87e6a', '#c85848', '#a03c34', '#762826', '#4c1818'),
};

export class Pix {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.d = new Uint8ClampedArray(w * h * 4);
    this.owner = new Int16Array(w * h).fill(-1); // which layer painted each pixel
    this.layerCount = 0;
  }
  idx(x, y) {
    return (y * this.w + x) * 4;
  }
  inside(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  alpha(x, y) {
    return this.inside(x, y) ? this.d[this.idx(x, y) + 3] : 0;
  }
  get(x, y) {
    const i = this.idx(x, y);
    return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]];
  }
  set(x, y, c) {
    if (!this.inside(x, y) || !c) return;
    const i = this.idx(x, y);
    this.d[i] = c[0];
    this.d[i + 1] = c[1];
    this.d[i + 2] = c[2];
    this.d[i + 3] = c[3] ?? 255;
  }
  clear(x, y) {
    if (!this.inside(x, y)) return;
    this.d.fill(0, this.idx(x, y), this.idx(x, y) + 4);
    this.owner[y * this.w + x] = -1;
  }
  // copy another Pix into this one at (ox, oy), optionally mirrored
  blit(src, ox, oy, flip = false) {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const sx = flip ? src.w - 1 - x : x;
        const i = src.idx(sx, y);
        if (src.d[i + 3] === 0) continue;
        this.set(ox + x, oy + y, [src.d[i], src.d[i + 1], src.d[i + 2], src.d[i + 3]]);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Masks: boolean shapes that get shaded with a ramp and composited.
// ---------------------------------------------------------------------------

export class Mask {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.m = new Uint8Array(w * h);
  }
  has(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h && this.m[y * this.w + x] === 1;
  }
  put(x, y, v = 1) {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.m[y * this.w + x] = v;
  }
  ellipse(cx, cy, rx, ry, rough = 0, seed = 1) {
    for (let y = Math.floor(cy - ry - 2); y <= Math.ceil(cy + ry + 2); y++) {
      for (let x = Math.floor(cx - rx - 2); x <= Math.ceil(cx + rx + 2); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        let t = 1;
        if (rough) t += (hash2(x, y, seed) - 0.5) * rough;
        if (dx * dx + dy * dy <= t) this.put(x, y);
      }
    }
    return this;
  }
  rect(x0, y0, w, h) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.put(x, y);
    return this;
  }
  poly(pts) {
    let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
    for (const [x, y] of pts) {
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      for (let x = Math.floor(minX); x <= Math.ceil(maxX); x++) {
        if (pointInPoly(x + 0.5, y + 0.5, pts)) this.put(x, y);
      }
    }
    return this;
  }
  line(x0, y0, x1, y1, thick = 1) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 + 1;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      if (thick <= 1) this.put(x, y);
      else this.ellipse(x + 0.5, y + 0.5, thick / 2, thick / 2);
    }
    return this;
  }
  // drop stray pixels that have fewer than two 4-neighbours (cleans rough edges)
  clean() {
    const kill = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (!this.has(x, y)) continue;
      const n = this.has(x + 1, y) + this.has(x - 1, y) + this.has(x, y + 1) + this.has(x, y - 1);
      if (n < 2) kill.push([x, y]);
    }
    for (const [x, y] of kill) this.put(x, y, 0);
    return this;
  }
  cut(other) {
    for (let i = 0; i < this.m.length; i++) if (other.m[i]) this.m[i] = 0;
    return this;
  }
  shift(dx, dy) {
    const out = new Mask(this.w, this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.m[y * this.w + x]) out.put(x + dx, y + dy);
    return out;
  }
}

function pointInPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function hash2(x, y, s = 1) {
  let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Paint a mask with a ramp using top-left lighting.
// opts.flat: single colour; opts.ink: dark line where the part overlaps earlier parts;
// opts.tone: shift the whole ramp (+1 darker)
export function paint(pix, mask, rmp, opts = {}) {
  const { flat = false, ink = true, tone = 0, soft = false } = opts;
  const layer = pix.layerCount++;
  const R = (i) => rmp[Math.max(0, Math.min(4, i + tone))];
  for (let y = 0; y < mask.h; y++) {
    for (let x = 0; x < mask.w; x++) {
      if (!mask.has(x, y)) continue;
      let c;
      if (flat) c = R(2);
      else {
        const up = !mask.has(x, y - 1);
        const left = !mask.has(x - 1, y);
        const down = !mask.has(x, y + 1);
        const right = !mask.has(x + 1, y);
        const down2 = !mask.has(x, y + 2);
        const right2 = !mask.has(x + 2, y);
        if (down || (right && !left)) c = R(soft ? 3 : 3);
        else if (down2 || (right2 && !soft)) c = R(soft ? 2 : 3);
        else if (up || left) c = R(1);
        else c = R(2);
        if (down && right) c = R(4);
      }
      // ink where this part sits on top of a different part
      if (ink) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (!mask.has(nx, ny) && pix.alpha(nx, ny) > 0 && pix.owner[ny * pix.w + nx] !== layer) {
            c = R(4);
            break;
          }
        }
      }
      pix.set(x, y, c);
      pix.owner[y * pix.w + x] = layer;
    }
  }
}

// Put single pixels with explicit colours: pts = [[x, y, color], ...]
export function dots(pix, pts) {
  const layer = pix.layerCount++;
  for (const [x, y, c] of pts) {
    pix.set(x, y, c);
    if (pix.inside(x, y)) pix.owner[y * pix.w + x] = layer;
  }
}

// Selective outline around the whole silhouette: a darkened copy of the edge colour.
export function outline(pix, strength = 0.38) {
  const add = [];
  for (let y = 0; y < pix.h; y++) {
    for (let x = 0; x < pix.w; x++) {
      if (pix.alpha(x, y) > 0) continue;
      let best = null;
      let lum = 1e9;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (pix.alpha(x + dx, y + dy) === 0) continue;
        const c = pix.get(x + dx, y + dy);
        const l = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
        if (l < lum) { lum = l; best = c; }
      }
      if (best) add.push([x, y, [best[0] * strength * 0.9 + 6, best[1] * strength * 0.85 + 4, best[2] * strength + 10, 255]]);
    }
  }
  for (const [x, y, c] of add) pix.set(x, y, c);
}

// Nearest-neighbour upscale for previews.
export function scale(pix, k) {
  const out = new Pix(pix.w * k, pix.h * k);
  for (let y = 0; y < out.h; y++) {
    for (let x = 0; x < out.w; x++) {
      const i = pix.idx(Math.floor(x / k), Math.floor(y / k));
      const o = out.idx(x, y);
      out.d[o] = pix.d[i]; out.d[o + 1] = pix.d[i + 1]; out.d[o + 2] = pix.d[i + 2]; out.d[o + 3] = pix.d[i + 3];
    }
  }
  return out;
}
