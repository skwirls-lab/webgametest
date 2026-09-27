import * as THREE from 'three';
import { mulberry32 } from './noise.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toTexture(c, { srgb = true, repeat = false } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

function leafPath(ctx, len, wid, lobes) {
  // Oak-like lobed leaf pointing up the +y axis from the origin.
  ctx.beginPath();
  ctx.moveTo(0, 0);
  const steps = lobes * 2;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const w = Math.sin(Math.PI * Math.pow(t, 0.8)) * wid * (s % 2 ? 1 : 0.62);
    ctx.lineTo(w, -t * len);
  }
  for (let s = steps; s >= 0; s--) {
    const t = s / steps;
    const w = Math.sin(Math.PI * Math.pow(t, 0.8)) * wid * (s % 2 ? 1 : 0.62);
    ctx.lineTo(-w, -t * len);
  }
  ctx.closePath();
}

// A dense clump of leaves on twigs, used by the world tree and broadleaf trees.
export function makeLeafClumpTexture(seed = 3, size = 512) {
  const rand = mulberry32(seed);
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  const cx = size / 2;
  const cy = size / 2;

  // twigs
  ctx.strokeStyle = '#3b2a17';
  ctx.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const a = rand() * Math.PI * 2;
    ctx.lineWidth = 2 + rand() * 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy + size * 0.25);
    ctx.quadraticCurveTo(cx + Math.cos(a) * size * 0.15, cy, cx + Math.cos(a) * size * 0.38, cy + Math.sin(a) * size * 0.38);
    ctx.stroke();
  }

  // shadowed inner foliage so clumps stay solid when mipmapped
  const inner = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.36);
  inner.addColorStop(0, 'hsl(95, 35%, 10%)');
  inner.addColorStop(0.8, 'hsl(95, 35%, 12%)');
  inner.addColorStop(1, 'hsla(95, 35%, 12%, 0)');
  ctx.fillStyle = inner;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.36, 0, Math.PI * 2);
  ctx.fill();
  const leaves = 420;
  for (let i = 0; i < leaves; i++) {
    // denser in the middle, ragged at the edge
    const r = Math.pow(rand(), 0.65) * size * 0.43;
    const a = rand() * Math.PI * 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r * 0.92;
    const depth = r / (size * 0.43);
    const len = size * (0.05 + rand() * 0.035);
    const wid = len * (0.32 + rand() * 0.12);
    const shade = 0.55 + rand() * 0.45 - depth * 0.05;
    const hue = 78 + rand() * 30;
    const sat = 38 + rand() * 25;
    const light = (22 + shade * 34) | 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a + Math.PI / 2 + (rand() - 0.5) * 1.6);
    leafPath(ctx, len, wid, 3 + ((rand() * 2) | 0));
    const g = ctx.createLinearGradient(-wid, 0, wid, -len);
    g.addColorStop(0, `hsl(${hue},${sat}%,${light - 8}%)`);
    g.addColorStop(1, `hsl(${hue - 6},${sat + 6}%,${light + 6}%)`);
    ctx.fillStyle = g;
    ctx.fill();
    // midrib
    ctx.strokeStyle = `hsla(${hue - 10},30%,${light + 14}%,0.55)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -len * 0.92);
    ctx.stroke();
    ctx.restore();
  }
  return toTexture(c);
}

// A drooping fir branch with needles, used on conifers.
export function makeFirBranchTexture(seed = 5, w = 256, h = 512) {
  const rand = mulberry32(seed);
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  ctx.lineCap = 'round';
  const midX = w / 2;
  // main stem from bottom (trunk side) to top (tip)
  ctx.strokeStyle = '#3a2c1c';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(midX, h);
  ctx.quadraticCurveTo(midX + 6, h * 0.5, midX, 8);
  ctx.stroke();

  const side = (y0, dir, len, lw) => {
    // side twig
    const x1 = midX + dir * len;
    const y1 = y0 - len * 0.55;
    ctx.strokeStyle = '#3e2f1d';
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(midX, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    // needles
    const n = Math.floor(len / 2.2);
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const px = midX + dir * len * t;
      const py = y0 - len * 0.55 * t;
      const nl = 9 + rand() * 7 * (1 - t * 0.5);
      for (const s of [-1, 1]) {
        const ang = Math.atan2(-0.55, dir) + s * (0.9 + rand() * 0.3);
        const l = 28 + rand() * 30;
        ctx.strokeStyle = `hsl(${118 + rand() * 30},${30 + rand() * 25}%,${l * 0.6}%)`;
        ctx.lineWidth = 1.4 + rand() * 0.8;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(ang) * nl, py + Math.sin(ang) * nl);
        ctx.stroke();
      }
    }
  };
  // dense shadowed needle mass behind the sprays keeps distant trees solid
  ctx.fillStyle = 'hsl(135, 30%, 9%)';
  ctx.beginPath();
  ctx.moveTo(midX - w * 0.1, h);
  ctx.quadraticCurveTo(midX - w * 0.46, h * 0.55, midX, 20);
  ctx.quadraticCurveTo(midX + w * 0.46, h * 0.55, midX + w * 0.1, h);
  ctx.closePath();
  ctx.fill();
  for (let y = h - 20; y > 30; y -= 14 + rand() * 10) {
    const t = 1 - y / h; // 0 at base, 1 at tip
    const len = (w * 0.44) * (1 - t * 0.75) * (0.75 + rand() * 0.35);
    side(y, -1, len, 2.2);
    side(y - 6, 1, len, 2.2);
  }
  return toTexture(c);
}

// Tuft of grass blades.
export function makeGrassTexture(seed = 9, w = 256, h = 256) {
  const rand = mulberry32(seed);
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  for (let i = 0; i < 70; i++) {
    const x0 = w * 0.1 + rand() * w * 0.8;
    const hgt = h * (0.45 + rand() * 0.55);
    const bend = (rand() - 0.5) * w * 0.35;
    const bw = 2.5 + rand() * 3.5;
    const l = 20 + rand() * 30;
    const hue = 70 + rand() * 30;
    const g = ctx.createLinearGradient(0, h, 0, h - hgt);
    g.addColorStop(0, `hsl(${hue},40%,${l * 0.45}%)`);
    g.addColorStop(1, `hsl(${hue - 8},45%,${l + 10}%)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x0 - bw, h);
    ctx.quadraticCurveTo(x0 + bend * 0.4, h - hgt * 0.55, x0 + bend, h - hgt);
    ctx.quadraticCurveTo(x0 + bend * 0.4 + bw * 0.6, h - hgt * 0.55, x0 + bw, h);
    ctx.closePath();
    ctx.fill();
  }
  return toTexture(c);
}

// Tileable normal map for the lake surface, built from integer-frequency waves.
export function makeWaterNormals(size = 256, seed = 17) {
  const rand = mulberry32(seed);
  const waves = [];
  for (let i = 0; i < 48; i++) {
    const f = 1 + Math.floor(Math.pow(rand(), 2) * 22);
    const a = rand() * Math.PI * 2;
    const kx = Math.round(Math.cos(a) * f);
    const ky = Math.round(Math.sin(a) * f);
    if (kx === 0 && ky === 0) continue;
    waves.push({ kx, ky, amp: 1 / Math.pow(Math.hypot(kx, ky), 1.3), ph: rand() * Math.PI * 2 });
  }
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let dx = 0;
      let dy = 0;
      const u = x / size;
      const v = y / size;
      for (const w of waves) {
        const c = Math.cos(2 * Math.PI * (w.kx * u + w.ky * v) + w.ph) * w.amp * 2 * Math.PI;
        dx += c * w.kx;
        dy += c * w.ky;
      }
      const s = 0.06;
      let nx = -dx * s;
      let ny = -dy * s;
      let nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const i = (y * size + x) * 4;
      data[i] = (nx * 0.5 + 0.5) * 255;
      data[i + 1] = (ny * 0.5 + 0.5) * 255;
      data[i + 2] = (nz * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

// Soft round sprite for spores, fireflies and stars.
export function makeGlowSprite(size = 64) {
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return toTexture(c);
}

// Whole-fir silhouette for the crossed core planes: layered drooping sprays.
export function makeFirSilhouetteTexture(seed = 12, w = 256, h = 512) {
  const rand = mulberry32(seed);
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const mid = w / 2;
  ctx.fillStyle = '#2b1f14';
  ctx.fillRect(mid - 4, h * 0.2, 8, h * 0.8);
  const layers = 22;
  for (let i = 0; i < layers; i++) {
    const t = i / (layers - 1); // 0 bottom, 1 top
    const y = h * (0.97 - t * 0.9);
    const half = (w * 0.47) * Math.pow(1 - t, 0.95) + 6;
    const droop = 18 + (1 - t) * 30;
    for (const dir of [-1, 1]) {
      // spray outline
      const light = 10 + rand() * 8 + t * 6;
      ctx.fillStyle = `hsl(${128 + rand() * 20}, ${28 + rand() * 12}%, ${light}%)`;
      ctx.beginPath();
      ctx.moveTo(mid, y - droop * 0.9);
      const steps = 10;
      for (let k = 0; k <= steps; k++) {
        const u = k / steps;
        const x = mid + dir * half * u;
        const yy = y - droop * 0.9 + droop * u * u + (k % 2 ? -6 : 5) * (0.5 + rand());
        ctx.lineTo(x, yy);
      }
      ctx.lineTo(mid + dir * half * 0.2, y + 10);
      ctx.closePath();
      ctx.fill();
      // needle tips catching light
      ctx.strokeStyle = `hsla(${110 + rand() * 25}, 35%, ${22 + rand() * 12}%, 0.8)`;
      ctx.lineWidth = 1.2;
      for (let k = 0; k < 18; k++) {
        const u = rand();
        const x = mid + dir * half * u;
        const yy = y - droop * 0.9 + droop * u * u;
        ctx.beginPath();
        ctx.moveTo(x, yy);
        ctx.lineTo(x + dir * (4 + rand() * 6), yy + 3 + rand() * 6);
        ctx.stroke();
      }
    }
  }
  return toTexture(c);
}
