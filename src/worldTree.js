import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, createNoise2D } from './noise.js';
import { terrainHeight } from './terrain.js';
import { makeLeafClumpTexture, makeGlowSprite } from './textures.js';

// The world tree: a golden-barked oak about 190 m tall with a crown close to 300 m wide.
// Blue veins pulse from the root tips, up the trunk and out along every limb.

const rand = mulberry32(2024);
const noise = createNoise2D(77);
const R = (a, b) => a + (b - a) * rand();

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------------------
// Branch skeleton
// ---------------------------------------------------------------------------

function randomPerp(dir) {
  const a = Math.abs(dir.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0);
  const p = new THREE.Vector3().crossVectors(dir, a).normalize();
  return p.applyAxisAngle(dir, rand() * Math.PI * 2);
}

// Walk a sinuous path. `up` bends the branch toward the sky as it grows.
function walk(start, dir, length, steps, { up = 0.0, wander = 0.25, droop = 0 }) {
  const pts = [start.clone()];
  const d = dir.clone().normalize();
  const p = start.clone();
  const seg = length / steps;
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    d.add(randomPerp(d).multiplyScalar(wander * R(0.3, 1)));
    d.y += up * seg * 0.02 - droop * t * 0.1;
    d.normalize();
    p.addScaledVector(d, seg);
    pts.push(p.clone());
  }
  return pts;
}

function makeBranch(points, r0, r1, level, startDist, opts = {}) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.5);
  const length = curve.getLength();
  return { curve, length, r0, r1, level, startDist, ...opts };
}

function radiusAt(b, t) {
  const taper = b.r0 + (b.r1 - b.r0) * Math.pow(t, 0.85);
  if (b.flare) {
    // root flare and buttresses at the base of the trunk
    const m = t * b.length;
    return taper * (1 + 1.15 * Math.exp(-m / 9) + 0.25 * Math.exp(-m / 30));
  }
  return taper;
}

export function growSkeleton() {
  const groundY = terrainHeight(0, 0);
  const branches = [];
  const clumps = []; // {pos, size}
  const nodes = []; // glowing seed pods {pos, size}

  // trunk
  const trunkPts = walk(V(0, groundY - 8, 0), V(0.04, 1, 0.02), 92, 10, { up: 0, wander: 0.05 });
  const trunk = makeBranch(trunkPts, 13, 7.5, 0, 0, { flare: true, radial: 96, rings: 110 });
  branches.push(trunk);

  // central leaders that carry the crown higher
  const leaders = [];
  for (let i = 0; i < 2; i++) {
    const t = 0.93;
    const p = trunk.curve.getPointAt(t);
    const a = i * Math.PI + R(-0.3, 0.3);
    const dir = V(Math.cos(a) * 0.35, 1, Math.sin(a) * 0.35);
    const pts = walk(p, dir, R(70, 85), 8, { up: 0.3, wander: 0.12 });
    const b = makeBranch(pts, 6.2, 1.4, 1, trunk.length * t, { radial: 40, rings: 50 });
    branches.push(b);
    leaders.push(b);
  }

  // great limbs spreading from the upper trunk
  const limbs = [];
  const limbCount = 9;
  for (let i = 0; i < limbCount; i++) {
    const t = R(0.45, 0.95);
    const p = trunk.curve.getPointAt(t);
    const a = (i / limbCount) * Math.PI * 2 + R(-0.25, 0.25);
    const elev = R(0.35, 0.8);
    const dir = V(Math.cos(a), elev, Math.sin(a));
    const len = R(95, 135) * (1.1 - t * 0.3);
    const pts = walk(p, dir, len, 9, { up: 0.55, wander: 0.2, droop: 1.3 });
    const r0 = radiusAt(trunk, t) * R(0.5, 0.62);
    const b = makeBranch(pts, r0, 1.0, 1, trunk.length * t, { radial: 40, rings: 56 });
    branches.push(b);
    limbs.push(b);
  }

  // secondary and tertiary branches
  const addChildren = (parent, count, lenRange, level, tRange) => {
    const kids = [];
    for (let i = 0; i < count; i++) {
      const t = R(tRange[0], tRange[1]);
      const p = parent.curve.getPointAt(t);
      const tan = parent.curve.getTangentAt(t);
      const side = randomPerp(tan);
      side.y = Math.abs(side.y) * 0.6 + 0.15;
      const dir = tan.clone().multiplyScalar(R(0.5, 0.9)).add(side).normalize();
      const len = R(lenRange[0], lenRange[1]) * (1.15 - t * 0.35);
      const steps = level === 2 ? 6 : 4;
      const pts = walk(p, dir, len, steps, { up: 0.45, wander: 0.28, droop: 0.8 });
      const r0 = Math.max(0.25, radiusAt(parent, t) * R(0.5, 0.7));
      const b = makeBranch(pts, r0, 0.12, level, parent.startDist + parent.length * t, {
        radial: level === 2 ? 14 : 8,
        rings: level === 2 ? 18 : 8,
      });
      branches.push(b);
      kids.push(b);
    }
    return kids;
  };

  const level2 = [];
  for (const l of limbs) level2.push(...addChildren(l, 9, [34, 58], 2, [0.2, 0.97]));
  for (const l of leaders) level2.push(...addChildren(l, 6, [28, 44], 2, [0.2, 0.95]));
  const level3 = [];
  for (const b of level2) level3.push(...addChildren(b, 5, [12, 24], 3, [0.2, 0.95]));

  // Foliage clumps hug the outer branches
  const crownCenter = V(0, groundY + 125, 0);
  const pushClump = (p, size) => clumps.push({ pos: p, size });
  for (const b of level3) {
    const n = 7;
    for (let i = 0; i < n; i++) {
      const t = 0.3 + (i / (n - 1)) * 0.75;
      const p = b.curve.getPointAt(Math.min(1, t));
      p.add(V(R(-5, 5), R(-2, 5), R(-5, 5)));
      pushClump(p, R(6.5, 10));
    }
  }
  // limbs carry foliage along their outer half so no bare wood pokes out of the crown
  for (const b of [...limbs, ...leaders]) {
    for (let i = 0; i < 12; i++) {
      const p = b.curve.getPointAt(R(0.45, 1));
      p.add(V(R(-6, 6), R(0, 8), R(-6, 6)));
      pushClump(p, R(8, 12));
    }
  }
  for (const b of level2) {
    for (let i = 0; i < 4; i++) {
      const p = b.curve.getPointAt(R(0.55, 1));
      p.add(V(R(-7, 7), R(-2, 7), R(-7, 7)));
      pushClump(p, R(7, 11));
    }
    // glowing seed pods hang beneath the secondary branches
    for (let i = 0; i < 3; i++) {
      const p = b.curve.getPointAt(R(0.3, 0.9));
      p.y -= R(1.5, 4);
      nodes.push({ pos: p, size: R(0.5, 1.2) });
    }
  }
  for (const b of level3) {
    if (rand() < 0.35) {
      const p = b.curve.getPointAt(R(0.4, 1));
      p.y -= R(1, 2.5);
      nodes.push({ pos: p, size: R(0.35, 0.8) });
    }
  }

  // roots
  const roots = [];
  const rootCount = 13;
  for (let i = 0; i < rootCount; i++) {
    const a = (i / rootCount) * Math.PI * 2 + R(-0.2, 0.2);
    const reach = R(55, 110);
    const pts = [];
    const steps = 10;
    let wob = R(-0.2, 0.2);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      wob += R(-0.12, 0.12);
      const ang = a + wob * t;
      const r = 6 + t * reach;
      const x = Math.cos(ang) * r;
      const z = Math.sin(ang) * r;
      const g = terrainHeight(x, z);
      // arch out of the ground near the trunk, then sink beneath it
      const lift = (1 - t) * 9 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.6 + 0.2)), 0.6) - t * 2.5;
      pts.push(V(x, g + lift, z));
    }
    // root distances run negative so pulses travel inward toward the trunk
    const b = makeBranch(pts, R(5.5, 7.5), 0.6, 0, 0, { radial: 28, rings: 60, root: true });
    b.startDist = -b.length;
    roots.push(b);
    branches.push(b);
  }

  return { branches, clumps, nodes, crownCenter, groundY, trunk };
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

function tubeGeometry(b) {
  const rings = b.rings;
  const radial = b.radial;
  const frames = b.curve.computeFrenetFrames(rings, false);
  const meanR = (b.r0 + b.r1) * 0.5;
  // integer number of pattern cells around the branch keeps the texture seamless
  const period = Math.max(2, Math.round((2 * Math.PI * meanR) / 1.1));

  const count = (rings + 1) * (radial + 1);
  const pos = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const data = new Float32Array(count * 2); // period, level
  const P = new THREE.Vector3();
  const dir = new THREE.Vector3();
  let k = 0;
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    b.curve.getPointAt(t, P);
    const N = frames.normals[i];
    const B = frames.binormals[i];
    const r = radiusAt(b, t);
    const m = t * b.length;
    // buttress ridges on the trunk base, gnarly fluting elsewhere
    const butt = b.flare ? 0.55 * Math.exp(-m / 16) : 0;
    const flute = b.level <= 1 ? 0.06 : 0.03;
    for (let j = 0; j <= radial; j++) {
      const s = j / radial;
      const a = s * Math.PI * 2;
      let rr = r;
      rr *= 1 + flute * Math.sin(a * 11 + noise(m * 0.05, b.r0) * 3);
      if (butt > 0) rr *= 1 + butt * Math.pow(0.5 + 0.5 * Math.cos(a * 7 + 0.4 + noise(m * 0.02, 3) * 0.6), 3);
      if (b.root) rr *= 1 - 0.25 * Math.pow(Math.max(0, -Math.sin(a)), 2); // flattened underside
      dir.copy(N).multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a));
      pos[k * 3] = P.x + dir.x * rr;
      pos[k * 3 + 1] = P.y + dir.y * rr;
      pos[k * 3 + 2] = P.z + dir.z * rr;
      uv[k * 2] = s * period;
      uv[k * 2 + 1] = b.startDist + m;
      data[k * 2] = period;
      data[k * 2 + 1] = b.level + (b.root ? 0.5 : 0);
      k++;
    }
  }
  const idx = [];
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const c = a + radial + 1;
      idx.push(a, c, a + 1, a + 1, c, c + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aBark', new THREE.BufferAttribute(data, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // weld the normals along the seam
  const n = g.attributes.normal;
  for (let i = 0; i <= rings; i++) {
    const a = i * (radial + 1);
    const c = a + radial;
    const x = n.getX(a) + n.getX(c);
    const y = n.getY(a) + n.getY(c);
    const z = n.getZ(a) + n.getZ(c);
    const l = Math.hypot(x, y, z) || 1;
    n.setXYZ(a, x / l, y / l, z / l);
    n.setXYZ(c, x / l, y / l, z / l);
  }
  // end cap for the tips isn't needed: they taper to ~0.1 m
  return g;
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

const BARK_GLSL = /* glsl */ `
float phash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
// gradient noise that wraps every 'period' cells in x
vec2 pgrad(vec2 i) {
  float a = phash(i) * 6.2831853;
  return vec2(cos(a), sin(a));
}
float pnoise(vec2 p, float period) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float i0 = mod(i.x, period);
  float i1 = mod(i.x + 1.0, period);
  float a = dot(pgrad(vec2(i0, i.y)), f);
  float b = dot(pgrad(vec2(i1, i.y)), f - vec2(1.0, 0.0));
  float c = dot(pgrad(vec2(i0, i.y + 1.0)), f - vec2(0.0, 1.0));
  float d = dot(pgrad(vec2(i1, i.y + 1.0)), f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 0.7 + 0.5;
}
// fbm whose octaves fade out once they get smaller than a pixel.
// fw is the screen footprint of one unit of p along x and y.
float pfbm(vec2 p, float period, int oct, vec2 fw) {
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 5; i++) {
    if (i >= oct) break;
    float k = 1.0 - smoothstep(0.25, 0.6, max(fw.x, fw.y));
    s += a * mix(0.5, pnoise(p, period), k);
    n += a;
    p = vec2(p.x * 2.0, p.y * 2.0 + 13.7);
    fw *= 2.0;
    period *= 2.0;
    a *= 0.5;
  }
  return s / n;
}
float pnoiseAA(vec2 p, float period, vec2 fw) {
  return mix(0.5, pnoise(p, period), 1.0 - smoothstep(0.25, 0.6, max(fw.x, fw.y)));
}
`;

function makeBarkMaterial(uniforms) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.7,
    metalness: 0.0,
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec2 aBark;
        varying vec2 vBarkUv;
        varying vec2 vBark;
        varying vec3 vBarkWorld;`
      )
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
        vBarkUv = uv;
        vBark = aBark;`
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vBarkWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uGlow;
        uniform float uPulseSpeed;
        uniform float uDayBoost;
        varying vec2 vBarkUv;
        varying vec2 vBark;
        varying vec3 vBarkWorld;
        float gRough = 0.7;
        float gMetal = 0.0;
        float gH = 0.0;
        vec3 gEmit = vec3(0.0);
        ${BARK_GLSL}`
      )
      .replace(
        '#include <map_fragment>',
        `
        float period = vBark.x;
        float level = vBark.y;
        vec2 bp = vec2(vBarkUv.x, vBarkUv.y);
        float dist = length(vBarkWorld - cameraPosition);
        float fine = 1.0 - smoothstep(60.0, 400.0, dist);
        vec2 fwb = vec2(length(vec2(dFdx(bp.x), dFdy(bp.x))), length(vec2(dFdx(bp.y), dFdy(bp.y))));

        // furrowed oak bark: a network of deep furrows between flat plates
        float warp = pnoiseAA(vec2(bp.x, bp.y * 0.04), period, fwb * vec2(1.0, 0.04));
        float fur = pfbm(vec2(bp.x * 2.0, bp.y * 0.2 + warp * 3.0), period * 2.0, 4, fwb * vec2(2.0, 0.2));
        float ridgeL = 1.0 - abs(fur * 2.0 - 1.0);
        float fwr = fwidth(ridgeL);
        float furrow = smoothstep(0.78 - fwr, 0.97 + fwr, ridgeL) * (1.0 - smoothstep(0.3, 0.6, fwb.x * 2.0));
        float plate = pfbm(vec2(bp.x * 4.0, bp.y * 0.7 + warp), period * 4.0, 3, fwb * vec2(4.0, 0.7));
        float hcrack = smoothstep(0.8, 0.95, pnoiseAA(vec2(bp.x * 3.0, bp.y * 1.1), period * 3.0, fwb * vec2(3.0, 1.1))) * (1.0 - furrow);
        float h = 0.62 + (plate - 0.5) * 0.5 * (0.4 + 0.6 * fine) - furrow * 0.75 - hcrack * 0.25;

        // golden bark: warm gold plates, deep umber furrows
        vec3 crevice = vec3(0.022, 0.011, 0.004);
        vec3 body = vec3(0.15, 0.075, 0.02);
        vec3 crest = vec3(0.46, 0.25, 0.045);
        vec3 col = mix(crevice, body, smoothstep(0.05, 0.45, h));
        col = mix(col, crest, smoothstep(0.55, 0.8, h + (warp - 0.5) * 0.3));
        col *= 0.8 + 0.4 * pnoiseAA(vec2(bp.x, bp.y * 0.02 + 7.0), period, fwb * vec2(1.0, 0.02));
        // moss on the roots and lower trunk
        float mossN = pfbm(vec2(bp.x, bp.y * 0.1 + 5.0), period, 3, fwb * vec2(1.0, 0.1));
        float moss = smoothstep(0.52, 0.7, mossN) * (1.0 - smoothstep(0.0, 25.0, bp.y)) * step(level, 0.6);
        col = mix(col, vec3(0.035, 0.06, 0.015), moss * 0.85);

        // bioluminescent veins: meandering channels that run along each branch
        float nV = period <= 3.0 ? 1.0 : max(2.0, floor(period / 3.4 + 0.5));
        float meander = pfbm(vec2(bp.x, bp.y * 0.03), period, 3, fwb * vec2(1.0, 0.03)) - 0.5;
        float g = bp.x / period * nV + meander * 1.4;
        float dv = abs(fract(g + 0.5) - 0.5);
        float fwv = fwidth(g);
        float wV = 0.024;
        float vein = 1.0 - smoothstep(wV - fwv * 0.5, wV + fwv, dv);
        // fine capillaries branch off in patches
        float g2 = bp.x / period * nV * 3.0 + (pfbm(vec2(bp.x * 2.0, bp.y * 0.06 + 11.0), period * 2.0, 3, fwb * vec2(2.0, 0.06)) - 0.5) * 4.0;
        float dv2 = abs(fract(g2 + 0.5) - 0.5);
        float fwv2 = fwidth(g2);
        float capMask = smoothstep(0.5, 0.68, pnoiseAA(vec2(bp.x, bp.y * 0.05 + 3.0), period, fwb * vec2(1.0, 0.05)));
        float cap = (1.0 - smoothstep(0.03 - fwv2 * 0.5, 0.03 + fwv2, dv2)) * capMask;
        // soften lines that get thinner than a pixel so distant bark doesn't shimmer
        float aa = clamp(wV / max(fwv, 1e-4), 0.0, 1.0);
        float halo = (1.0 - smoothstep(0.0, 0.12, dv)) * 0.08 / uDayBoost;
        float rootDim = level > 0.25 && level < 0.75 ? 0.6 : 1.0;

        // pulses travel up from the root tips to the crown
        float s = vBarkUv.y;
        float wave = 0.5 + 0.5 * sin(s * 0.05 - uTime * uPulseSpeed + meander * 3.0);
        float pulse = 0.35 + 1.4 * pow(wave, 12.0) + 0.25 * pow(0.5 + 0.5 * sin(s * 0.012 - uTime * uPulseSpeed * 0.37), 4.0);
        vec3 veinCol = mix(vec3(0.05, 0.38, 1.0), vec3(0.3, 0.9, 1.0), pow(wave, 8.0));
        gEmit = veinCol * ((vein + cap * 0.5) * pulse * mix(0.6, 1.0, aa) * 2.0 + halo * pulse) * uGlow * uDayBoost * rootDim;

        // veins sit in shallow grooves of dark sap-wood
        float vm = max(vein, cap * 0.6);
        h = mix(h, 0.35, vm);
        gH = h;
        col = mix(col, vec3(0.01, 0.03, 0.05), vm * 0.85);

        diffuseColor.rgb = col;
        float crestMask = smoothstep(0.55, 0.85, h);
        gRough = mix(0.95, 0.68, crestMask) + moss * 0.03;
        gMetal = crestMask * 0.12;
        `
      )
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = gRough;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = gMetal;')
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          vec3 sx = dFdx(-vViewPosition);
          vec3 sy = dFdy(-vViewPosition);
          vec3 r1 = cross(sy, normal);
          vec3 r2 = cross(normal, sx);
          float det = dot(sx, r1);
          vec2 dh = vec2(dFdx(gH), dFdy(gH)) * 0.35 * clamp(vBark.x / 20.0, 0.12, 1.0) * (0.4 + 0.6 * fine);
          vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
          normal = normalize(abs(det) * normal - grad);
        }`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += gEmit;`
      );
  };
  return mat;
}

function makeLeafMaterial(uniforms, tex) {
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    alphaTest: 0.42,
    side: THREE.DoubleSide,
    vertexColors: true,
    roughness: 0.72,
    metalness: 0,
  });
  mat.alphaToCoverage = true;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uWind;
        attribute float aPhase;
        varying vec3 vLeafWorld;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float sway = sin(uTime * 1.3 + aPhase) * 0.35 + sin(uTime * 2.7 + aPhase * 1.7) * 0.15;
        transformed += vec3(sway, sway * 0.3, cos(uTime * 1.1 + aPhase) * 0.3) * uWind;`
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vLeafWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        varying vec3 vLeafWorld;`
      )
      // foliage keeps its outward normal on both faces
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        normal = normalize(vNormal);`
      )
      .replace(
        '#include <opaque_fragment>',
        `
        vec3 vdir = normalize(vLeafWorld - cameraPosition);
        float back = pow(max(dot(vdir, uSunDir), 0.0), 3.0);
        outgoingLight += diffuseColor.rgb * uSunColor * back * 0.9;
        #include <opaque_fragment>`
      );
  };
  return mat;
}

function leafGeometry(clumps, crownCenter) {
  const quadsPer = 5;
  const count = clumps.length * quadsPer * 4;
  const pos = new Float32Array(count * 3);
  const nrm = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const col = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  const idx = new Uint32Array(clumps.length * quadsPer * 6);
  const c = new THREE.Color();
  const n = new THREE.Vector3();
  const t1 = new THREE.Vector3();
  const t2 = new THREE.Vector3();
  const out = new THREE.Vector3();
  const v = new THREE.Vector3();
  let vi = 0;
  let ii = 0;
  let crownRadius = 1;
  for (const cl of clumps) crownRadius = Math.max(crownRadius, Math.hypot(cl.pos.x - crownCenter.x, cl.pos.z - crownCenter.z));
  for (const cl of clumps) {
    out.subVectors(cl.pos, crownCenter).normalize();
    out.y = out.y * 0.7 + 0.35;
    out.normalize();
    const ph = rand() * Math.PI * 2;
    const r = rand();
    if (r < 0.08) c.setHSL(0.12, 0.6, 0.5); // a few gold-tinged clumps echo the bark
    else c.setHSL(0.2 + rand() * 0.08, 0.3 + rand() * 0.25, 0.36 + rand() * 0.14);
    // crown-scale occlusion: clumps deep inside and underneath get less sky
    const rel = cl.pos.clone().sub(crownCenter);
    const depth = Math.min(1, Math.hypot(rel.x, rel.z * 1.0, rel.y * 1.6) / crownRadius);
    const ao = (0.22 + 0.78 * Math.pow(depth, 1.6)) * (0.65 + 0.35 * THREE.MathUtils.clamp(rel.y / 60 + 0.5, 0, 1));
    c.multiplyScalar(ao);
    const s = cl.size;
    for (let q = 0; q < quadsPer; q++) {
      n.set(R(-1, 1), R(-0.3, 1), R(-1, 1)).normalize();
      t1.crossVectors(n, Math.abs(n.y) > 0.9 ? V(1, 0, 0) : V(0, 1, 0)).normalize();
      t2.crossVectors(n, t1).normalize();
      const off = V(R(-0.3, 0.3), R(-0.2, 0.3), R(-0.3, 0.3)).multiplyScalar(s);
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      const base = vi;
      for (const [a, b] of corners) {
        v.copy(cl.pos).add(off).addScaledVector(t1, a * s).addScaledVector(t2, b * s);
        pos[vi * 3] = v.x; pos[vi * 3 + 1] = v.y; pos[vi * 3 + 2] = v.z;
        // blend a clump-sphere normal with the crown-scale outward direction
        const ln = V(a * 0.5, b * 0.5, 0.4).applyMatrix3(new THREE.Matrix3().set(t1.x, t2.x, n.x, t1.y, t2.y, n.y, t1.z, t2.z, n.z)).normalize();
        const fn = ln.multiplyScalar(0.45).addScaledVector(out, 0.75).normalize();
        nrm[vi * 3] = fn.x; nrm[vi * 3 + 1] = fn.y; nrm[vi * 3 + 2] = fn.z;
        uv[vi * 2] = (a + 1) / 2; uv[vi * 2 + 1] = (b + 1) / 2;
        const shade = 0.85 + rand() * 0.25;
        col[vi * 3] = c.r * shade; col[vi * 3 + 1] = c.g * shade; col[vi * 3 + 2] = c.b * shade;
        phase[vi] = ph;
        vi++;
      }
      idx[ii++] = base; idx[ii++] = base + 1; idx[ii++] = base + 2;
      idx[ii++] = base; idx[ii++] = base + 2; idx[ii++] = base + 3;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

export function createWorldTree(sharedUniforms) {
  const group = new THREE.Group();
  group.name = 'worldTree';
  const sk = growSkeleton();

  const uniforms = {
    uTime: sharedUniforms.uTime,
    uGlow: sharedUniforms.uGlow,
    uPulseSpeed: sharedUniforms.uPulseSpeed,
    uSunDir: sharedUniforms.uSunDir,
    uSunColor: sharedUniforms.uSunColor,
    uWind: sharedUniforms.uWind,
    uDayBoost: sharedUniforms.uDayBoost,
  };

  const barkGeo = mergeGeometries(sk.branches.map(tubeGeometry));
  const bark = new THREE.Mesh(barkGeo, makeBarkMaterial(uniforms));
  bark.castShadow = true;
  bark.receiveShadow = true;
  group.add(bark);

  const leaves = new THREE.Mesh(leafGeometry(sk.clumps, sk.crownCenter), makeLeafMaterial(uniforms, makeLeafClumpTexture(3)));
  leaves.castShadow = true;
  leaves.receiveShadow = true;
  group.add(leaves);

  // glowing seed pods
  const podGeo = new THREE.IcosahedronGeometry(1, 2);
  podGeo.scale(1, 1.5, 1);
  const podMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1.1, 2.6) });
  const pods = new THREE.InstancedMesh(podGeo, podMat, sk.nodes.length);
  const m = new THREE.Matrix4();
  const tint = new THREE.Color();
  sk.nodes.forEach((nd, i) => {
    m.makeScale(nd.size, nd.size, nd.size).setPosition(nd.pos);
    pods.setMatrixAt(i, m);
    tint.setScalar(0.5 + rand());
    pods.setColorAt(i, tint);
  });
  group.add(pods);

  // drifting spores around the crown
  const sporeCount = 1800;
  const sporePos = new Float32Array(sporeCount * 3);
  const sporeSeed = new Float32Array(sporeCount * 3);
  for (let i = 0; i < sporeCount; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * 170;
    sporeSeed[i * 3] = Math.cos(a) * r;
    sporeSeed[i * 3 + 1] = sk.groundY + 2 + rand() * 190;
    sporeSeed[i * 3 + 2] = Math.sin(a) * r;
  }
  sporePos.set(sporeSeed);
  const sporeGeo = new THREE.BufferGeometry();
  sporeGeo.setAttribute('position', new THREE.BufferAttribute(sporePos, 3));
  const sporeMat = new THREE.PointsMaterial({
    map: makeGlowSprite(),
    size: 0.7,
    sizeAttenuation: true,
    color: new THREE.Color(0.35, 1.0, 2.2),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
  });
  const spores = new THREE.Points(sporeGeo, sporeMat);
  spores.frustumCulled = false;
  group.add(spores);

  // blue light pooling around the trunk
  const glowLights = [];
  for (const [y, i] of [[14, 1], [70, 0.7]]) {
    const l = new THREE.PointLight(0x3fa8ff, 1, 0, 2);
    l.position.set(0, sk.groundY + y, 0);
    l.userData.base = i;
    group.add(l);
    glowLights.push(l);
  }

  const podBase = podMat.color.clone();
  const sporeBase = sporeMat.color.clone();
  function update(time, glow, night) {
    const beat = 0.65 + 0.35 * Math.pow(0.5 + 0.5 * Math.sin(time * 1.4), 3);
    const boost = sharedUniforms.uDayBoost.value;
    podMat.color.copy(podBase).multiplyScalar(beat * glow * boost);
    sporeMat.color.copy(sporeBase).multiplyScalar((0.25 + night * 0.35) * glow);
    sporeMat.size = 0.6 + night * 0.3;
    const p = sporeGeo.attributes.position.array;
    for (let i = 0; i < sporeCount; i++) {
      const i3 = i * 3;
      const ph = i * 0.37;
      p[i3] = sporeSeed[i3] + Math.sin(time * 0.21 + ph) * 6;
      p[i3 + 1] = sporeSeed[i3 + 1] + ((time * 1.5 + i * 7.3) % 40) - 20;
      p[i3 + 2] = sporeSeed[i3 + 2] + Math.cos(time * 0.17 + ph * 1.3) * 6;
    }
    sporeGeo.attributes.position.needsUpdate = true;
    for (const l of glowLights) l.intensity = l.userData.base * glow * beat * (3000 + night * 7000);
  }

  return { group, update, skeleton: sk };
}
