// The village diorama: a tile grid turned into 3D blocks, houses and upright sprites.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hash2 } from './pixel.js';
import { buildTextures, buildProps } from './tiles.js';

export const MAP_W = 40;
export const MAP_D = 30;
export const PX = 16; // pixels per world unit, shared by every texture and sprite

// ---------------------------------------------------------------------------
// textures
// ---------------------------------------------------------------------------

export function pixToTexture(pix, repeat = false) {
  const c = document.createElement('canvas');
  c.width = pix.w;
  c.height = pix.h;
  const ctx = c.getContext('2d');
  ctx.putImageData(new ImageData(new Uint8ClampedArray(pix.d), pix.w, pix.h), 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ---------------------------------------------------------------------------
// layout
// ---------------------------------------------------------------------------

function buildLayout() {
  const ground = []; // per cell: 'grass' | 'dirt' | 'cobble' | 'water' | 'bridge'
  const height = [];
  for (let x = 0; x < MAP_W; x++) {
    ground.push(new Array(MAP_D).fill('grass'));
    height.push(new Array(MAP_D).fill(1));
  }
  const set = (x, z, g, h) => {
    if (x < 0 || z < 0 || x >= MAP_W || z >= MAP_D) return;
    if (g) ground[x][z] = g;
    if (h !== undefined) height[x][z] = h;
  };
  const fill = (x0, z0, w, d, g, h) => {
    for (let x = x0; x < x0 + w; x++) for (let z = z0; z < z0 + d; z++) set(x, z, g, h);
  };

  // wooded ridge along the back
  for (let x = 0; x < MAP_W; x++) {
    const depth = 4 + Math.round(Math.sin(x * 0.45) * 0.8 + hash2(x, 1, 3) * 0.6);
    for (let z = 0; z < depth; z++) set(x, z, 'grass', 2);
  }
  // stream across the front
  const stream = [];
  for (let x = 0; x < MAP_W; x++) {
    const zc = 22 + Math.round(Math.sin(x * 0.3 + 1) * 0.9);
    stream.push(zc);
    set(x, zc, 'water', 0);
    set(x, zc + 1, 'water', 0);
  }
  // village square
  fill(14, 10, 12, 9, 'cobble');
  // paths
  fill(19, 4, 2, 6, 'dirt');
  for (let z = 19; z < MAP_D; z++) fill(19, z, 2, 1, ground[19][z] === 'water' ? 'bridge' : 'dirt');
  for (let x = 26; x < MAP_W; x++) fill(x, 14 + (x > 32 ? 1 : 0), 1, 2, 'dirt');
  fill(8, 10, 2, 2, 'dirt');
  fill(10, 11, 4, 2, 'dirt');
  fill(30, 10, 2, 2, 'dirt');
  fill(26, 11, 4, 2, 'dirt');
  fill(8, 18, 2, 2, 'dirt');
  fill(10, 17, 4, 2, 'dirt');
  // bridge cells stay at ground height for walking
  for (let z = 0; z < MAP_D; z++) for (const x of [19, 20]) if (ground[x][z] === 'bridge') height[x][z] = 0;

  return { ground, height, stream };
}

export const HOUSES = [
  { x: 5, z: 6, w: 7, d: 4, wall: 2.6, roof: 2.4, windows: [1.4, 5.6] },
  { x: 28, z: 6, w: 6, d: 4, wall: 2.6, roof: 2.2, windows: [1.2] },
  { x: 6, z: 14, w: 6, d: 4, wall: 2.4, roof: 2.0, windows: [4.6] },
];
export const WELL = { x: 16.5, z: 12.5 };
export const STALL = { x: 23, z: 15.5 };

// ---------------------------------------------------------------------------
// meshes
// ---------------------------------------------------------------------------

function quad(a, b, c, d, uvs) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...d], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs.flat(), 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeVertexNormals();
  return g;
}

const TILE_UV = 1 / 4; // a 64 px texture spans 4 units

function terrainMeshes(layout, mats) {
  const { ground, height } = layout;
  const tops = { grass: [], dirt: [], cobble: [] };
  const sides = { cliff: [], rockface: [] };
  const water = [];
  const hAt = (x, z) => (x < 0 || z < 0 || x >= MAP_W || z >= MAP_D ? null : ground[x][z] === 'water' || ground[x][z] === 'bridge' ? 0.3 : height[x][z]);
  for (let x = 0; x < MAP_W; x++) {
    for (let z = 0; z < MAP_D; z++) {
      const g = ground[x][z];
      const h = hAt(x, z);
      if (g === 'water' || g === 'bridge') {
        water.push(quad([x, 0.72, z + 1], [x + 1, 0.72, z + 1], [x + 1, 0.72, z], [x, 0.72, z], [[x * TILE_UV, -(z + 1) * TILE_UV], [(x + 1) * TILE_UV, -(z + 1) * TILE_UV], [(x + 1) * TILE_UV, -z * TILE_UV], [x * TILE_UV, -z * TILE_UV]]));
      } else {
        const u0 = x * TILE_UV, u1 = (x + 1) * TILE_UV, v0 = -(z + 1) * TILE_UV, v1 = -z * TILE_UV;
        tops[g].push(quad([x, h, z + 1], [x + 1, h, z + 1], [x + 1, h, z], [x, h, z], [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]));
      }
      // side walls toward lower neighbours (only the ones the camera can see: +z, -x, +x)
      const sideType = g === 'grass' ? 'cliff' : 'rockface';
      const edges = [
        [0, 1, [x, z + 1], [x + 1, z + 1]],
        [-1, 0, [x, z], [x, z + 1]],
        [1, 0, [x + 1, z + 1], [x + 1, z]],
        [0, -1, [x + 1, z], [x, z]],
      ];
      for (const [dx, dz, p0, p1] of edges) {
        const nh = hAt(x + dx, z + dz);
        const bottom = nh === null ? -1 : nh;
        if (bottom >= h) continue;
        const along0 = dx === 0 ? p0[0] : p0[1];
        const along1 = dx === 0 ? p1[0] : p1[1];
        const vt = 1; // texture top (grass lip) sits at the cliff top
        const vb = 1 - (h - bottom) * TILE_UV;
        sides[sideType].push(
          quad([p0[0], bottom, p0[1]], [p1[0], bottom, p1[1]], [p1[0], h, p1[1]], [p0[0], h, p0[1]], [
            [along0 * TILE_UV, vb], [along1 * TILE_UV, vb], [along1 * TILE_UV, vt], [along0 * TILE_UV, vt],
          ])
        );
      }
    }
  }
  const out = [];
  for (const [k, list] of Object.entries(tops)) {
    if (!list.length) continue;
    const m = new THREE.Mesh(mergeGeometries(list), mats[k]);
    m.receiveShadow = true;
    out.push(m);
  }
  for (const [k, list] of Object.entries(sides)) {
    if (!list.length) continue;
    const m = new THREE.Mesh(mergeGeometries(list), mats[k]);
    m.receiveShadow = true;
    m.castShadow = true;
    out.push(m);
  }
  // river bed
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(MAP_W, MAP_D).rotateX(-Math.PI / 2).translate(MAP_W / 2, 0.3, MAP_D / 2), new THREE.MeshStandardMaterial({ color: 0x3a5a4a, roughness: 1 }));
  out.push(bed);
  const waterMesh = new THREE.Mesh(mergeGeometries(water), mats.water);
  waterMesh.receiveShadow = true;
  out.push(waterMesh);
  return out;
}

// box with world-scaled UVs on every face
function box(x0, y0, z0, x1, y1, z1, mat, { cast = true } = {}) {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  const uv = g.attributes.uv;
  const pos = g.attributes.position;
  const nrm = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const px = pos.getX(i) + (x0 + x1) / 2;
    const py = pos.getY(i) + (y0 + y1) / 2;
    const pz = pos.getZ(i) + (z0 + z1) / 2;
    const nx = Math.abs(nrm.getX(i));
    const ny = Math.abs(nrm.getY(i));
    if (ny > 0.5) uv.setXY(i, px * TILE_UV, -pz * TILE_UV);
    else if (nx > 0.5) uv.setXY(i, pz * TILE_UV, py * TILE_UV);
    else uv.setXY(i, px * TILE_UV, py * TILE_UV);
  }
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

function house(h, mats, texs, lights) {
  const grp = new THREE.Group();
  const base = 1;
  const x0 = h.x, x1 = h.x + h.w, z0 = h.z, z1 = h.z + h.d;
  // stone footing, timber walls
  grp.add(box(x0, base, z0, x1, base + 0.5, z1, mats.rockface));
  grp.add(box(x0 + 0.05, base + 0.5, z0 + 0.05, x1 - 0.05, base + h.wall, z1 - 0.05, mats.timber));
  // gabled roof along x with overhang
  const oh = 0.45;
  const top = base + h.wall;
  const peak = top + h.roof;
  const zm = (z0 + z1) / 2;
  const rx0 = x0 - oh, rx1 = x1 + oh, rz0 = z0 - oh, rz1 = z1 + oh;
  const slope = Math.hypot(zm - rz0, h.roof + 0.3) * TILE_UV;
  const front = quad([rx0, top - 0.3, rz1], [rx1, top - 0.3, rz1], [rx1, peak, zm], [rx0, peak, zm], [[rx0 * TILE_UV, 0], [rx1 * TILE_UV, 0], [rx1 * TILE_UV, slope], [rx0 * TILE_UV, slope]]);
  const back = quad([rx1, top - 0.3, rz0], [rx0, top - 0.3, rz0], [rx0, peak, zm], [rx1, peak, zm], [[rx1 * TILE_UV, 0], [rx0 * TILE_UV, 0], [rx0 * TILE_UV, slope], [rx1 * TILE_UV, slope]]);
  const roofMesh = new THREE.Mesh(mergeGeometries([front, back]), mats.roof);
  roofMesh.castShadow = true;
  roofMesh.receiveShadow = true;
  grp.add(roofMesh);
  // gable ends
  for (const [x, flip] of [[x0 + 0.05, true], [x1 - 0.05, false]]) {
    const g = new THREE.BufferGeometry();
    const pts = flip ? [x, top, z1, x, top, z0, x, peak - 0.1, zm] : [x, top, z0, x, top, z1, x, peak - 0.1, zm];
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const uvs = flip ? [z1 * TILE_UV, top * TILE_UV, z0 * TILE_UV, top * TILE_UV, zm * TILE_UV, peak * TILE_UV] : [z0 * TILE_UV, top * TILE_UV, z1 * TILE_UV, top * TILE_UV, zm * TILE_UV, peak * TILE_UV];
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mats.timber);
    m.castShadow = true;
    grp.add(m);
  }
  // chimney
  grp.add(box(x1 - 1.6, top + 0.6, zm - 0.9, x1 - 0.9, peak + 0.6, zm - 0.2, mats.cobble));
  // door and windows on the front wall
  const doorMat = new THREE.MeshStandardMaterial({ map: texs.door, alphaTest: 0.5, roughness: 1 });
  const door = new THREE.Mesh(new THREE.PlaneGeometry(20 / PX, 32 / PX), doorMat);
  door.position.set(x0 + h.w / 2, base + 0.5 + 1.0 - 0.02, z1 - 0.03 + 0.02);
  grp.add(door);
  for (const wx of h.windows) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mats.window);
    win.position.set(x0 + wx, base + 1.7, z1 - 0.02);
    grp.add(win);
    const l = new THREE.PointLight(0xffb45a, 0, 6, 2);
    l.position.set(x0 + wx, base + 1.7, z1 + 0.6);
    grp.add(l);
    lights.windows.push(l);
  }
  return grp;
}

function well(mats) {
  const g = new THREE.Group();
  const { x, z } = WELL;
  const ring = new THREE.CylinderGeometry(0.95, 1.0, 0.9, 16, 1, true);
  const ringMesh = new THREE.Mesh(ring, mats.cobble);
  ringMesh.position.set(x, 1.45, z);
  ringMesh.castShadow = ringMesh.receiveShadow = true;
  g.add(ringMesh);
  const cap = new THREE.Mesh(new THREE.RingGeometry(0.75, 1.0, 16).rotateX(-Math.PI / 2), mats.cobble);
  cap.position.set(x, 1.9, z);
  g.add(cap);
  const w = new THREE.Mesh(new THREE.CircleGeometry(0.76, 16).rotateX(-Math.PI / 2), mats.water);
  w.position.set(x, 1.6, z);
  g.add(w);
  for (const dx of [-0.95, 0.95]) g.add(box(x + dx - 0.1, 1.9, z - 0.1, x + dx + 0.1, 3.4, z + 0.1, mats.planks));
  // little roof
  const r1 = box(x - 1.3, 3.3, z - 0.75, x + 1.3, 3.45, z + 0.05, mats.roof);
  r1.rotation.x = 0;
  g.add(r1);
  g.add(box(x - 1.3, 3.3, z - 0.05, x + 1.3, 3.45, z + 0.75, mats.roof));
  g.add(box(x - 0.9, 2.7, z - 0.05, x + 0.9, 2.8, z + 0.05, mats.planks));
  return g;
}

function stall(mats) {
  const g = new THREE.Group();
  const { x, z } = STALL;
  g.add(box(x - 1.4, 1, z - 0.5, x + 1.4, 1.9, z + 0.3, mats.planks));
  for (const dx of [-1.35, 1.25]) g.add(box(x + dx, 1, z - 0.6, x + dx + 0.12, 3.3, z - 0.48, mats.planks));
  const aw = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.3), mats.awning);
  aw.rotation.x = -Math.PI / 2 + 0.55;
  aw.position.set(x, 3.2, z - 0.1);
  aw.castShadow = true;
  g.add(aw);
  return g;
}

function bridge(layout, mats) {
  const g = new THREE.Group();
  const { ground } = layout;
  let zmin = 99, zmax = -1;
  for (let z = 0; z < MAP_D; z++) if (ground[19][z] === 'bridge') { zmin = Math.min(zmin, z); zmax = Math.max(zmax, z); }
  if (zmax < 0) return g;
  g.add(box(18.8, 0.85, zmin - 0.2, 21.2, 1.02, zmax + 1.2, mats.planks));
  for (const x of [18.8, 21.05]) {
    g.add(box(x, 1.02, zmin - 0.2, x + 0.15, 1.7, zmin - 0.05, mats.planks));
    g.add(box(x, 1.02, zmax + 1.05, x + 0.15, 1.7, zmax + 1.2, mats.planks));
    g.add(box(x, 1.55, zmin - 0.2, x + 0.15, 1.68, zmax + 1.2, mats.planks));
  }
  return g;
}

// ---------------------------------------------------------------------------
// sprites
// ---------------------------------------------------------------------------

// Upright sprite with its feet at (x, y, z). Normals lean toward the camera so
// sprites light like the ground they stand on.
export function spriteGeometry(wPx, hPx) {
  const g = new THREE.PlaneGeometry(wPx / PX, hPx / PX);
  g.translate(0, hPx / PX / 2, 0);
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 0.55, 0.83);
  return g;
}

export function spriteMaterial(tex, extra = {}) {
  const m = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, roughness: 1, metalness: 0, side: THREE.DoubleSide, ...extra });
  m.shadowSide = THREE.DoubleSide;
  return m;
}

function scatterProps(layout, props, solid) {
  const { ground, height } = layout;
  const items = [];
  const taken = new Set();
  const key = (x, z) => x + ',' + z;
  const free = (x, z, pad = 0) => {
    for (let dx = -pad; dx <= pad; dx++) for (let dz = -pad; dz <= pad; dz++) {
      const X = x + dx, Z = z + dz;
      if (X < 0 || Z < 0 || X >= MAP_W || Z >= MAP_D) return false;
      if (ground[X][Z] !== 'grass' || solid[X][Z] || taken.has(key(X, Z))) return false;
    }
    return true;
  };
  const place = (name, x, z, { solidCell = false, jitter = 0.3 } = {}) => {
    const jx = (hash2(x, z, 7) - 0.5) * jitter;
    const jz = (hash2(x, z, 8) - 0.5) * jitter * 0.5;
    items.push({ name, x: x + 0.5 + jx, z: z + 0.5 + jz, y: height[x][z] });
    taken.add(key(x, z));
    if (solidCell) solid[x][z] = true;
  };

  // pines on the ridge
  for (let x = 0; x < MAP_W; x++) for (let z = 0; z < 4; z++) {
    if (height[x][z] === 2 && hash2(x, z, 11) > (z === 0 ? 0.2 : 0.55) && !taken.has(key(x, z))) place(hash2(x, z, 12) > 0.35 ? 'pine' : 'oak2', x, z, { solidCell: true, jitter: 0.6 });
  }
  // woods framing the sides and front
  for (let x = 0; x < MAP_W; x++) for (let z = 4; z < MAP_D; z++) {
    const side = x < 3 || x > MAP_W - 4;
    const front = z > MAP_D - 4;
    if ((!side && !front) || !free(x, z)) continue;
    // trees frame the sides; the front edge stays low so it never hides the player
    if (side && hash2(x, z, 13) > 0.45) place(hash2(x, z, 14) > 0.5 ? 'oak' : hash2(x, z, 15) > 0.5 ? 'pine' : 'oak2', x, z, { solidCell: true, jitter: 0.5 });
    else if (front && hash2(x, z, 16) > 0.55) place(hash2(x, z, 17) > 0.6 ? 'bush' : 'tallGrass', x, z, { solidCell: true, jitter: 0.5 });
  }
  // a few trees inside the village
  for (const [x, z] of [[13, 7], [26, 8], [4, 12], [35, 11], [13, 20], [27, 19], [34, 19], [24, 5], [15, 5], [9, 25], [31, 25]]) if (free(x, z)) place('oak', x, z, { solidCell: true });
  // undergrowth
  for (let x = 1; x < MAP_W - 1; x++) for (let z = 4; z < MAP_D - 1; z++) {
    if (!free(x, z)) continue;
    const r = hash2(x, z, 21);
    if (r > 0.93) place(hash2(x, z, 22) > 0.5 ? 'bush' : 'berryBush', x, z, { solidCell: true });
    else if (r > 0.86) place(hash2(x, z, 23) > 0.5 ? 'flowers' : 'flowers2', x, z);
    else if (r > 0.82) place('tallGrass', x, z, { jitter: 0.8 });
    else if (r > 0.776) place('mushrooms', x, z);
    else if (r > 0.75) place('rock', x, z, { solidCell: true });
  }
  // grass tufts along the stream bank
  layout.stream.forEach((zc, x) => {
    if (free(x, zc - 1) && hash2(x, zc, 31) > 0.4) place('tallGrass', x, zc - 1, { jitter: 0.6 });
    if (free(x, zc + 2) && hash2(x, zc, 32) > 0.5) place(hash2(x, zc, 33) > 0.5 ? 'rock' : 'tallGrass', x, zc + 2, { jitter: 0.6 });
  });
  return items;
}

// ---------------------------------------------------------------------------
// assembly
// ---------------------------------------------------------------------------

export function createWorld(scene) {
  const layout = buildLayout();
  const tex = buildTextures();
  const propPix = buildProps();

  const t = (p) => pixToTexture(p, true);
  const waterFrames = tex.water.map((p) => t(p));
  const std = (map, extra = {}) => new THREE.MeshStandardMaterial({ map, roughness: 1, metalness: 0, ...extra });
  const mats = {
    grass: std(t(tex.grass)),
    dirt: std(t(tex.dirt)),
    cobble: std(t(tex.cobble)),
    cliff: std(t(tex.cliff)),
    rockface: std(t(tex.rockface)),
    planks: std(t(tex.planks)),
    timber: std(t(tex.timber)),
    roof: std(t(tex.roof)),
    water: std(waterFrames[0], { roughness: 0.25, metalness: 0.0, emissive: new THREE.Color(0x0a2a3a) }),
    window: std(pixToTexture(tex.window), { emissiveMap: pixToTexture(tex.windowLit), emissive: new THREE.Color(0, 0, 0) }),
    awning: std(pixToTexture(tex.awning), { side: THREE.DoubleSide, alphaTest: 0.5 }),
  };
  const texs = { door: pixToTexture(tex.door) };

  // collision grid
  const solid = [];
  for (let x = 0; x < MAP_W; x++) {
    solid.push([]);
    for (let z = 0; z < MAP_D; z++) {
      const g = layout.ground[x][z];
      solid[x].push(g === 'water' || layout.height[x][z] > 1);
    }
  }
  for (const h of HOUSES) for (let x = h.x; x < h.x + h.w; x++) for (let z = h.z; z < h.z + h.d; z++) solid[x][z] = true;
  for (let x = 15; x <= 17; x++) for (let z = 11; z <= 13; z++) solid[x][z] = true; // well
  for (let x = 21; x <= 24; x++) solid[x][15] = true; // stall counter

  const lights = { windows: [], lanterns: [] };
  const group = new THREE.Group();
  for (const m of terrainMeshes(layout, mats)) group.add(m);
  for (const h of HOUSES) group.add(house(h, mats, texs, lights));
  group.add(well(mats));
  group.add(stall(mats));
  group.add(bridge(layout, mats));

  // props
  const propTex = {};
  const propMat = {};
  const propGeo = {};
  for (const [name, pix] of Object.entries(propPix)) {
    propTex[name] = pixToTexture(pix);
    propMat[name] = spriteMaterial(propTex[name], name === 'lantern' ? { emissiveMap: propTex[name], emissive: new THREE.Color(0, 0, 0) } : {});
    propGeo[name] = spriteGeometry(pix.w, pix.h);
  }
  const items = scatterProps(layout, propPix, solid);
  // hand-placed village props
  const hand = [
    ['lantern', 14.2, 10.3], ['lantern', 25.8, 10.3], ['lantern', 14.2, 18.7], ['lantern', 25.8, 18.7],
    ['lantern', 18.6, 20.4], ['lantern', 21.4, 20.4],
    ['barrel', 21.2, 14.6], ['barrel', 25.0, 15.2], ['crate', 24.9, 16.3], ['crate', 25.6, 16.0],
    ['barrel', 12.3, 10.4], ['crate', 27.3, 10.6], ['sign', 21.6, 9.0], ['barrel', 34.4, 10.4],
  ];
  for (const [name, x, z] of hand) {
    items.push({ name, x, z, y: 1 });
    if (name !== 'sign') solid[Math.floor(x)][Math.floor(z)] = true;
  }
  const sprites = [];
  for (const it of items) {
    const m = new THREE.Mesh(propGeo[it.name], propMat[it.name]);
    m.position.set(it.x, it.y, it.z);
    m.castShadow = !['tallGrass', 'flowers', 'flowers2', 'mushrooms'].includes(it.name);
    m.receiveShadow = true;
    group.add(m);
    sprites.push(m);
    if (it.name === 'lantern') {
      const l = new THREE.PointLight(0xffa850, 0, 9, 1.6);
      l.position.set(it.x, it.y + 2.3, it.z + 0.3);
      group.add(l);
      lights.lanterns.push(l);
    }
  }

  scene.add(group);

  let waterFrame = 0;
  function update(time, night) {
    const f = Math.floor(time * 3) % waterFrames.length;
    if (f !== waterFrame) {
      waterFrame = f;
      mats.water.map = waterFrames[f];
    }
    mats.window.emissive.setScalar(night * 1.6);
    propMat.lantern.emissive.setScalar(night * 1.4 + 0.15);
    for (const l of lights.lanterns) l.intensity = night * 9;
    for (const l of lights.windows) l.intensity = night * 4;
  }

  return { group, layout, solid, update, lights, mats, items };
}

export function isBlocked(world, x, z, r = 0.3) {
  for (const [dx, dz] of [[-r, -r * 0.5], [r, -r * 0.5], [-r, r * 0.5], [r, r * 0.5]]) {
    const cx = Math.floor(x + dx);
    const cz = Math.floor(z + dz);
    if (cx < 0 || cz < 0 || cx >= MAP_W || cz >= MAP_D) return true;
    if (world.solid[cx][cz]) return true;
  }
  return false;
}
