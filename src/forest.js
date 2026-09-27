import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, createNoise2D, fbm } from './noise.js';
import { terrainHeight, lakeFactor, MEADOW_RADIUS } from './terrain.js';
import { makeFirBranchTexture, makeFirSilhouetteTexture, makeLeafClumpTexture, makeGrassTexture } from './textures.js';

const rand = mulberry32(99);
const R = (a, b) => a + (b - a) * rand();
const density = createNoise2D(5);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Foliage cards keep an outward normal on both faces, sway in the wind
// and glow a little when the sun shines through them.
function foliageMaterial(tex, uniforms, { windScale = 1, alphaTest = 0.45 } = {}) {
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    alphaTest,
    side: THREE.DoubleSide,
    roughness: 0.8,
    metalness: 0,
  });
  mat.alphaToCoverage = true;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uWind = uniforms.uWind;
    shader.uniforms.uSunDir = uniforms.uSunDir;
    shader.uniforms.uSunColor = uniforms.uSunColor;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uWind;
        varying vec3 vFolWorld;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = instanceMatrix[3].xyz;
        #else
          vec3 ip = vec3(0.0);
        #endif
        float ph = ip.x * 0.013 + ip.z * 0.017;
        float bend = position.y * position.y;
        transformed.x += sin(uTime * 0.9 + ph) * bend * 0.015 * uWind * ${windScale.toFixed(2)};
        transformed.z += cos(uTime * 0.7 + ph * 1.3) * bend * 0.01 * uWind * ${windScale.toFixed(2)};`
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        #ifdef USE_INSTANCING
          vFolWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vFolWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        varying vec3 vFolWorld;`
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        normal = normalize(vNormal);`
      )
      .replace(
        '#include <opaque_fragment>',
        `
        vec3 vdir = normalize(vFolWorld - cameraPosition);
        float back = pow(max(dot(vdir, uSunDir), 0.0), 3.0);
        outgoingLight += diffuseColor.rgb * uSunColor * back * 0.6;
        #include <opaque_fragment>`
      );
  };
  return mat;
}

function quad(p0, along, side, len, wid, normalFn) {
  // quad from p0 extending `len` along `along`, `wid` wide along `side`
  const g = new THREE.BufferGeometry();
  const a = p0.clone().addScaledVector(side, -wid / 2);
  const b = p0.clone().addScaledVector(side, wid / 2);
  const c = b.clone().addScaledVector(along, len);
  const d = a.clone().addScaledVector(along, len);
  const pts = [a, b, c, d];
  const pos = new Float32Array(12);
  const nrm = new Float32Array(12);
  pts.forEach((p, i) => {
    pos.set([p.x, p.y, p.z], i * 3);
    const n = normalFn(p);
    nrm.set([n.x, n.y, n.z], i * 3);
  });
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

// Fir, 1 unit tall.
function firGeometry() {
  const cards = [];
  const whorls = 9;
  for (let w = 0; w < whorls; w++) {
    const t = w / (whorls - 1);
    const y = 0.14 + t * 0.8;
    const radius = 0.26 * Math.pow(1 - t * 0.92, 1.05) + 0.02;
    const n = t > 0.8 ? 3 : 5;
    const off = rand() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = off + (i / n) * Math.PI * 2 + R(-0.2, 0.2);
      const droop = R(0.15, 0.4);
      const along = V(Math.cos(a) * Math.cos(droop), -Math.sin(droop), Math.sin(a) * Math.cos(droop));
      const roll = R(0.5, 1.2);
      const flat = V(-Math.sin(a), 0, Math.cos(a));
      const side = flat.clone().applyAxisAngle(along, roll);
      const base = V(0, y, 0);
      cards.push(
        quad(base, along, side, radius, radius * 0.8, (p) => V(p.x * 2.2, 0.8 + (p.y - y) * 2, p.z * 2.2).normalize())
      );
    }
  }
  // spire
  for (let i = 0; i < 2; i++) {
    const a = i * Math.PI * 0.5;
    const side = V(Math.cos(a), 0, Math.sin(a));
    cards.push(quad(V(0, 0.82, 0), V(0, 1, 0), side, 0.2, 0.07, (p) => V(p.x * 3, 1, p.z * 3).normalize()));
  }
  return mergeGeometries(cards);
}

// Three crossed vertical planes carrying a whole-fir silhouette; they give
// distant firs their solid conical mass.
function firCoreGeometry() {
  const planes = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI;
    const side = V(Math.cos(a), 0, Math.sin(a));
    planes.push(quad(V(0, 0.02, 0), V(0, 1, 0), side, 1.0, 0.56, (p) => V(p.x * 1.5, 0.6, p.z * 1.5).normalize()));
  }
  return mergeGeometries(planes);
}

// Broadleaf tree, 1 unit tall.
function broadleafGeometry() {
  const cards = [];
  const center = V(0, 0.56, 0);
  for (let i = 0; i < 26; i++) {
    const dir = V(R(-1, 1), R(-0.6, 1), R(-1, 1)).normalize();
    const p = center.clone().add(V(dir.x * 0.3, dir.y * 0.25, dir.z * 0.3));
    const n = dir.clone();
    const t1 = new THREE.Vector3().crossVectors(n, V(0, 1, 0.01)).normalize();
    const t2 = new THREE.Vector3().crossVectors(n, t1).normalize();
    const s = R(0.2, 0.3);
    const start = p.clone().addScaledVector(t2, -s / 2);
    cards.push(quad(start, t2, t1, s, s, (q) => q.clone().sub(center).normalize().add(V(0, 0.4, 0)).normalize()));
  }
  return mergeGeometries(cards);
}

function trunkGeometry(topR, botR, height) {
  const g = new THREE.CylinderGeometry(topR, botR, height, 6, 1, true);
  g.translate(0, height / 2, 0);
  return g;
}

function slopeAt(x, z) {
  const e = 4;
  const hx = terrainHeight(x + e, z) - terrainHeight(x - e, z);
  const hz = terrainHeight(x, z + e) - terrainHeight(x, z - e);
  return Math.hypot(hx, hz) / (2 * e);
}

function scatter(count, { minR, maxR, accept }) {
  const out = [];
  let guard = count * 40;
  while (out.length < count && guard-- > 0) {
    // bias samples toward the valley near the camera
    const a = rand() * Math.PI * 2;
    const r = minR + (maxR - minR) * Math.pow(rand(), 1.3);
    const x = Math.cos(a) * r * 1.3;
    const z = Math.sin(a) * r;
    const y = terrainHeight(x, z);
    if (accept(x, y, z)) out.push({ x, y, z });
  }
  return out;
}

export function createForest(uniforms, quality = 'high') {
  const group = new THREE.Group();
  group.name = 'forest';
  const scale = quality === 'high' ? 1 : 0.45;

  const forestOk = (x, y, z, dens) => {
    if (y < 2.5 || y > 1000) return false;
    if (lakeFactor(x, z) < 1.25) return false;
    const rc = Math.hypot(x, z);
    if (rc < MEADOW_RADIUS * 1.35) return false;
    if (slopeAt(x, z) > 0.75) return false;
    const d = fbm(density, x * 0.0016, z * 0.0016, 3) * 0.5 + 0.5;
    const edge = Math.min(1, (rc - MEADOW_RADIUS * 1.35) / 180);
    return rand() < Math.pow(d, dens) * edge * 1.4;
  };

  const barkMat = new THREE.MeshStandardMaterial({ color: 0x2a1f16, roughness: 0.95 });
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const col = new THREE.Color();

  // firs: near trees cast shadows, far ones don't (saves a shadow pass over thousands)
  const firs = scatter(Math.floor(20000 * scale), {
    minR: 200,
    maxR: 3200,
    accept: (x, y, z) => forestOk(x, y, z, 1.3),
  });
  const firBranchMat = foliageMaterial(makeFirBranchTexture(5), uniforms, { windScale: 0.6 });
  const firCoreMat = foliageMaterial(makeFirSilhouetteTexture(12), uniforms, { windScale: 0.6, alphaTest: 0.5 });
  const firBranchGeo = firGeometry();
  const firCoreGeo = firCoreGeometry();
  const firTrunkGeo = trunkGeometry(0.004, 0.022, 0.9);
  const nearR = 900;
  const firSets = [firs.filter((t) => Math.hypot(t.x, t.z) < nearR), firs.filter((t) => Math.hypot(t.x, t.z) >= nearR)];
  firSets.forEach((set, k) => {
    const near = k === 0;
    const branches = new THREE.InstancedMesh(firBranchGeo, firBranchMat, set.length);
    const core = new THREE.InstancedMesh(firCoreGeo, firCoreMat, set.length);
    const trunks = new THREE.InstancedMesh(firTrunkGeo, barkMat, set.length);
    set.forEach((t, i) => {
      const h = R(20, 38) * (t.y > 700 ? 0.7 : 1);
      q.setFromAxisAngle(V(0, 1, 0), rand() * Math.PI * 2);
      s.set(h * R(0.85, 1.15), h, h * R(0.85, 1.15));
      p.set(t.x, t.y - 0.5, t.z);
      m.compose(p, q, s);
      branches.setMatrixAt(i, m);
      core.setMatrixAt(i, m);
      trunks.setMatrixAt(i, m);
      col.setHSL(0.27 + R(-0.03, 0.04), R(0.3, 0.5), R(0.3, 0.42));
      branches.setColorAt(i, col.clone().multiplyScalar(2.2));
      core.setColorAt(i, col.multiplyScalar(2.0));
    });
    for (const mesh of [branches, core, trunks]) {
      mesh.castShadow = near;
      mesh.receiveShadow = near;
    }
    group.add(branches, core, trunks);
  });

  // broadleaf trees, more common at lower elevations and near the meadow
  const broad = scatter(Math.floor(8000 * scale), {
    minR: 200,
    maxR: 2400,
    accept: (x, y, z) => y < 400 && forestOk(x, y, z, 1.1),
  });
  const leafTex = makeLeafClumpTexture(8, 256);
  const broadFol = new THREE.InstancedMesh(broadleafGeometry(), foliageMaterial(leafTex, uniforms, { windScale: 1 }), broad.length);
  const broadTrunk = new THREE.InstancedMesh(trunkGeometry(0.012, 0.035, 0.6), barkMat, broad.length);
  broad.forEach((t, i) => {
    const h = R(14, 26);
    q.setFromAxisAngle(V(0, 1, 0), rand() * Math.PI * 2);
    s.set(h * R(0.9, 1.3), h, h * R(0.9, 1.3));
    p.set(t.x, t.y - 0.4, t.z);
    m.compose(p, q, s);
    broadFol.setMatrixAt(i, m);
    broadTrunk.setMatrixAt(i, m);
    col.setHSL(0.24 + R(-0.04, 0.05), R(0.2, 0.4), R(0.25, 0.38));
    broadFol.setColorAt(i, col.multiplyScalar(1.2));
  });
  broadFol.castShadow = broadFol.receiveShadow = true;
  broadTrunk.castShadow = true;
  group.add(broadFol, broadTrunk);

  // meadow grass around the world tree
  const grassCount = Math.floor(42000 * scale);
  const tuft = mergeGeometries([0, 1, 2].map((i) => {
    const g = new THREE.PlaneGeometry(1, 1);
    g.translate(0, 0.5, 0);
    g.rotateY((i / 3) * Math.PI);
    return g;
  }));
  // point grass normals up so tufts shade like the ground under them
  const gn = tuft.attributes.normal;
  for (let i = 0; i < gn.count; i++) gn.setXYZ(i, 0, 1, 0);
  const grass = new THREE.InstancedMesh(tuft, foliageMaterial(makeGrassTexture(9), uniforms, { windScale: 3, alphaTest: 0.5 }), grassCount);
  let gi = 0;
  let guard = grassCount * 6;
  while (gi < grassCount && guard-- > 0) {
    const a = rand() * Math.PI * 2;
    const r = 18 + Math.sqrt(rand()) * (MEADOW_RADIUS * 1.6);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (lakeFactor(x, z) < 1.1) continue;
    const y = terrainHeight(x, z);
    if (y < 1.5) continue;
    const h = R(0.9, 1.8);
    q.setFromAxisAngle(V(0, 1, 0), rand() * Math.PI);
    s.set(h * R(1.2, 2.0), h, h * R(1.2, 2.0));
    p.set(x, y - 0.1, z);
    m.compose(p, q, s);
    grass.setMatrixAt(gi, m);
    col.setHSL(0.21 + R(-0.03, 0.04), R(0.3, 0.5), R(0.4, 0.55));
    grass.setColorAt(gi, col.multiplyScalar(1.5));
    gi++;
  }
  grass.count = gi;
  grass.receiveShadow = true;
  group.add(grass);

  // boulders along the shore and meadow edge
  const rockNoise = createNoise2D(41);
  const rockGeos = [0, 1, 2].map((k) => {
    const g = new THREE.IcosahedronGeometry(1, 4);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const v = V(pos.getX(i), pos.getY(i), pos.getZ(i));
      const n = fbm(rockNoise, v.x * 1.3 + k * 10, v.z * 1.3 + v.y * 1.1, 4) * 0.35;
      v.multiplyScalar(1 + n);
      v.y *= 0.62;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  });
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x5b5750, roughness: 0.9, flatShading: false });
  rockGeos.forEach((g, k) => {
    const n = 60;
    const rocks = new THREE.InstancedMesh(g, rockMat, n);
    for (let i = 0; i < n; i++) {
      let x;
      let z;
      if (rand() < 0.55) {
        // shoreline
        const a = rand() * Math.PI * 2;
        x = -520 + Math.cos(a) * R(390, 520);
        z = 420 + Math.sin(a) * R(300, 420);
      } else {
        const a = rand() * Math.PI * 2;
        const r = R(MEADOW_RADIUS * 0.7, MEADOW_RADIUS * 2.4);
        x = Math.cos(a) * r;
        z = Math.sin(a) * r;
      }
      const y = terrainHeight(x, z);
      const sz = R(1.5, 6);
      q.setFromEuler(new THREE.Euler(R(-0.2, 0.2), rand() * Math.PI * 2, R(-0.2, 0.2)));
      s.set(sz * R(0.8, 1.5), sz, sz * R(0.8, 1.5));
      p.set(x, y - sz * 0.25, z);
      m.compose(p, q, s);
      rocks.setMatrixAt(i, m);
      col.setHSL(0.08, R(0.05, 0.12), R(0.35, 0.55));
      rocks.setColorAt(i, col.multiplyScalar(1.6));
    }
    rocks.castShadow = rocks.receiveShadow = true;
    group.add(rocks);
  });

  return group;
}
