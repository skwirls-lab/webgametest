import * as THREE from 'three';
import { createNoise2D, fbm, ridged, smoothstep, lerp, GLSL_NOISE } from './noise.js';

// Units are meters. The world tree stands at the origin on a meadow,
// a lake sits to the south-west and a ring of mountains closes the valley.
export const WORLD_SIZE = 16000;
export const WATER_LEVEL = 0;
export const LAKE = { x: -520, z: 420, r: 340 };
export const MEADOW_RADIUS = 210;

const n1 = createNoise2D(11);
const n2 = createNoise2D(23);
const n3 = createNoise2D(37);

export function lakeFactor(x, z) {
  const dx = x - LAKE.x;
  const dz = z - LAKE.z;
  const ang = Math.atan2(dz, dx);
  // wobbly shoreline, stretched along the valley
  const wob = 1 + 0.18 * n3(Math.cos(ang) * 1.3 + 5, Math.sin(ang) * 1.3 + 5) + 0.08 * Math.sin(ang * 3.0 + 1.0);
  const d = Math.sqrt((dx * dx) / 1.6 + dz * dz * 1.1) / wob;
  return d / LAKE.r; // < 1 inside the lake
}

export function terrainHeight(x, z) {
  // valley runs roughly along the x axis
  const ex = x / 1.35;
  const ez = z;
  const r = Math.sqrt(ex * ex + ez * ez) + n1(x * 0.00035, z * 0.00035) * 600;

  // rolling valley floor
  let h = 14 + fbm(n2, x * 0.0012, z * 0.0012, 4) * 22 + fbm(n1, x * 0.006, z * 0.006, 3) * 2.5;

  // foothills and mountains
  const m = smoothstep(1500, 5200, r);
  const foothill = smoothstep(900, 2600, r);
  const ridge = ridged(n1, x * 0.00026 + 3.1, z * 0.00026 - 7.7, 7);
  const bulk = fbm(n3, x * 0.00014, z * 0.00014, 3) * 0.5 + 0.5;
  h += foothill * (fbm(n2, x * 0.0008 + 9, z * 0.0008, 5) * 0.5 + 0.5) * 190;
  h += Math.pow(m, 1.5) * (ridge * 1500 + bulk * 520);

  // gentle meadow plateau around the tree
  const rc = Math.sqrt(x * x + z * z);
  const meadow = 1 - smoothstep(MEADOW_RADIUS * 0.6, MEADOW_RADIUS * 1.8, rc);
  h = lerp(h, 16 + fbm(n1, x * 0.01, z * 0.01, 2) * 1.2, meadow);

  // lake basin
  const lf = lakeFactor(x, z);
  const basin = 1 - smoothstep(0.55, 1.35, lf);
  h = lerp(h, -16, basin);

  return h;
}

// Grid that is dense near the tree and coarse near the horizon.
function warp(u, half) {
  return half * (0.2 * u + 0.8 * u * u * u);
}

export function createTerrain() {
  const segs = 640;
  const half = WORLD_SIZE / 2;
  const verts = (segs + 1) * (segs + 1);
  const pos = new Float32Array(verts * 3);
  let k = 0;
  for (let j = 0; j <= segs; j++) {
    const v = (j / segs) * 2 - 1;
    const z = warp(v, half);
    for (let i = 0; i <= segs; i++) {
      const u = (i / segs) * 2 - 1;
      const x = warp(u, half);
      pos[k++] = x;
      pos[k++] = terrainHeight(x, z);
      pos[k++] = z;
    }
  }
  const index = new Uint32Array(segs * segs * 6);
  k = 0;
  for (let j = 0; j < segs; j++) {
    for (let i = 0; i < segs; i++) {
      const a = j * (segs + 1) + i;
      const b = a + 1;
      const c = a + segs + 1;
      const d = c + 1;
      index[k++] = a; index[k++] = c; index[k++] = b;
      index[k++] = b; index[k++] = c; index[k++] = d;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;')
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWNrm = normalize(mat3(modelMatrix) * objectNormal);`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWPos;
        varying vec3 vWNrm;
        float gRough = 0.95;
        float gBump = 0.0;
        ${GLSL_NOISE}`
      )
      .replace(
        '#include <map_fragment>',
        `
        vec3 wp = vWPos;
        vec3 wn = normalize(vWNrm);
        float slope = 1.0 - wn.y;
        float dist = length(wp - cameraPosition);
        float detailFade = 1.0 - smoothstep(250.0, 1800.0, dist);

        float nLarge = fbm3(wp.xz * 0.0025);
        float nMid = fbm3(wp.xz * 0.03);
        float nFine = vnoise(wp.xz * 0.6) * detailFade;
        float nGrain = vnoise(wp.xz * 3.1) * (1.0 - smoothstep(20.0, 160.0, dist));

        // grass: lush and dry patches
        vec3 grassLush = vec3(0.045, 0.085, 0.018);
        vec3 grassDry  = vec3(0.12, 0.13, 0.035);
        vec3 grass = mix(grassLush, grassDry, smoothstep(0.35, 0.75, nLarge + nMid * 0.3));
        grass *= 0.8 + 0.4 * nFine + 0.25 * nGrain;

        // canopy cover on distant slopes (reads as forest from afar)
        float forest = smoothstep(0.42, 0.58, fbm3(wp.xz * 0.0012 + 4.0)) * smoothstep(60.0, 200.0, wp.y) * (1.0 - smoothstep(800.0, 1100.0, wp.y + nLarge * 250.0));
        forest *= 1.0 - smoothstep(0.35, 0.55, slope);
        vec3 canopy = vec3(0.018, 0.036, 0.016) * (0.7 + 0.6 * vnoise(wp.xz * 0.08));

        // exposed rock
        float rockN = fbm3(wp.xz * 0.02 + wp.y * 0.01);
        vec3 rock = mix(vec3(0.075, 0.07, 0.065), vec3(0.24, 0.22, 0.2), rockN);
        rock *= 0.75 + 0.5 * vnoise(vec2(wp.x + wp.z, wp.y) * 0.15);
        float rockMask = smoothstep(0.28, 0.46, slope + (nMid - 0.5) * 0.18);
        rockMask = max(rockMask, smoothstep(950.0, 1400.0, wp.y + nLarge * 400.0) * 0.8);

        // snow caps
        float snowLine = 1250.0 + (nLarge - 0.5) * 500.0;
        float snow = smoothstep(snowLine, snowLine + 200.0, wp.y) * (1.0 - smoothstep(0.45, 0.7, slope));
        vec3 snowC = vec3(0.82, 0.86, 0.92) * (0.9 + 0.1 * nMid);

        // shore mud and lake bed
        float shore = 1.0 - smoothstep(0.4, 3.5 + nMid * 2.0, wp.y);
        vec3 mud = mix(vec3(0.11, 0.085, 0.055), vec3(0.2, 0.17, 0.12), nFine);
        vec3 bed = vec3(0.05, 0.05, 0.035);

        vec3 col = grass;
        col = mix(col, canopy, forest);
        col = mix(col, rock, rockMask);
        col = mix(col, mud, shore);
        col = mix(col, bed, 1.0 - smoothstep(-3.0, 0.0, wp.y));
        col = mix(col, snowC, snow);

        diffuseColor.rgb = col;
        gRough = mix(mix(0.92, 0.8, rockMask), 0.55, snow);
        gRough = mix(gRough, 0.45, shore * 0.6);
        gBump = (nFine * 0.6 + nGrain * 0.25) * (0.3 + rockMask * 1.2) + rockN * rockMask * 2.0 * detailFade;
        `
      )
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = gRough;')
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        normal = perturbNormalH(-vViewPosition, normal, gBump * 0.35);`
      );
  };

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}
