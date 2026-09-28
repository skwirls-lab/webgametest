import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

import { createWorld, isBlocked, pixToTexture, spriteGeometry, spriteMaterial, MAP_W, MAP_D, WELL } from './world.js';
import { CAST, buildSheet, FRAME_W, FRAME_H, DIRS, WALK_FRAMES } from './rodents.js';

const params = new URLSearchParams(location.search);
const CAPTURE = params.has('capture');

// ---------------------------------------------------------------------------
// renderer, scene, camera
// ---------------------------------------------------------------------------

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: CAPTURE });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9cc4e4);
scene.fog = new THREE.Fog(0x9cc4e4, 34, 70);

const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.5, 200);
const PITCH = THREE.MathUtils.degToRad(38);
const DIST = 30;

const sun = new THREE.DirectionalLight(0xffffff, 2.5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120 });
sun.shadow.bias = -0.0008;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xbcd6ff, 0x6a7a4a, 1.0);
scene.add(hemi);

const world = createWorld(scene);

// ---------------------------------------------------------------------------
// characters
// ---------------------------------------------------------------------------

const blobTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(20,24,30,0.55)');
  gr.addColorStop(0.6, 'rgba(20,24,30,0.3)');
  gr.addColorStop(1, 'rgba(20,24,30,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();

function makeCharacter(key, x, z, dir = 'down') {
  const spec = CAST[key];
  const tex = pixToTexture(buildSheet(spec));
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.repeat.set(1 / WALK_FRAMES, 1 / DIRS.length);
  const mesh = new THREE.Mesh(spriteGeometry(FRAME_W, FRAME_H), spriteMaterial(tex));
  mesh.castShadow = true;
  // a flat sprite would shadow itself; characters rely on the blob shadow instead
  mesh.receiveShadow = false;
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
  scene.add(mesh, blob);
  const ch = { key, spec, tex, mesh, blob, x, z, dir, frame: 0, animT: 0, moving: false };
  placeCharacter(ch);
  return ch;
}

function groundY(x, z) {
  const cx = Math.floor(x);
  const cz = Math.floor(z);
  if (cx < 0 || cz < 0 || cx >= MAP_W || cz >= MAP_D) return 1;
  return world.layout.ground[cx][cz] === 'bridge' ? 1.02 : world.layout.height[cx][cz];
}

function placeCharacter(ch) {
  const y = groundY(ch.x, ch.z);
  ch.mesh.position.set(ch.x, y, ch.z);
  ch.blob.position.set(ch.x, y + 0.02, ch.z + 0.05);
  const row = DIRS.indexOf(ch.dir);
  ch.tex.offset.set(ch.frame / WALK_FRAMES, 1 - (row + 1) / DIRS.length);
}

const player = makeCharacter('archer', 20, 20.5, 'up');
const npcs = [
  { ch: makeCharacter('elder', 18.6, 14.6, 'down'), name: 'Mouse Elder', lines: [
    'Ah, there you are, young archer. Mind the well. The bucket rope frayed again this morning.',
    'The wood past the stream has gone restless. Birds quiet, and tracks where no tracks should be.',
    'Keep those daggers close, and your wits closer.',
  ] },
  { ch: makeCharacter('merchant', 21.4, 16.6, 'down'), name: 'Chipmunk Merchant', lines: [
    'Arrows, bowstrings, a sack of roasted acorns? Best prices this side of the ridge!',
    'Fresh fletching, goose not pigeon. You can tell by the shine.',
  ] },
  { ch: null, name: 'Signpost', at: [21.6, 9.4], lines: ['Village Square. (Your town’s name goes here.)'] },
];
for (const n of npcs) if (n.ch) world.solid[Math.floor(n.ch.x)][Math.floor(n.ch.z)] = true;

// ---------------------------------------------------------------------------
// particles: pollen by day, fireflies by night
// ---------------------------------------------------------------------------

const glowTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.3, 'rgba(255,255,255,0.6)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
})();
const MOTES = 260;
const motePos = new Float32Array(MOTES * 3);
const moteSeed = [];
for (let i = 0; i < MOTES; i++) {
  moteSeed.push([Math.random() * MAP_W, 1.3 + Math.random() * 3.5, 4 + Math.random() * (MAP_D - 5), Math.random() * 10]);
}
const moteGeo = new THREE.BufferGeometry();
moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
const moteMat = new THREE.PointsMaterial({ map: glowTex, size: 0.22, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xfff2c0 });
const motes = new THREE.Points(moteGeo, moteMat);
motes.frustumCulled = false;
scene.add(motes);

function updateMotes(t, night) {
  for (let i = 0; i < MOTES; i++) {
    const [x, y, z, s] = moteSeed[i];
    motePos[i * 3] = x + Math.sin(t * 0.3 + s) * 1.2;
    motePos[i * 3 + 1] = y + Math.sin(t * 0.7 + s * 2) * 0.4;
    motePos[i * 3 + 2] = z + Math.cos(t * 0.25 + s) * 1.0;
  }
  moteGeo.attributes.position.needsUpdate = true;
  // fireflies blink green-gold at night, pollen drifts pale by day
  moteMat.color.setRGB(1, 0.95 - night * 0.05, 0.75 - night * 0.45).multiplyScalar(0.5 + night * 2.2 * (0.6 + 0.4 * Math.sin(t * 3)));
  moteMat.size = 0.16 + night * 0.12;
}

// ---------------------------------------------------------------------------
// times of day
// ---------------------------------------------------------------------------

const PRESETS = {
  morning: { sun: [0.98, 0.94, 0.86], sunI: 2.4, dir: [-0.45, 0.85, 0.6], sky: 0xc4ddff, ground: 0x6e7c50, hemiI: 1.05, bg: 0xa8cbe6, night: 0, exposure: 1.0, bloom: 0.25 },
  golden: { sun: [1.0, 0.7, 0.42], sunI: 2.9, dir: [-0.85, 0.42, 0.5], sky: 0xf2b88e, ground: 0x5c4a36, hemiI: 0.8, bg: 0xe6ae86, night: 0.15, exposure: 1.02, bloom: 0.35 },
  night: { sun: [0.55, 0.66, 1.0], sunI: 0.55, dir: [0.35, 0.9, 0.45], sky: 0x40548a, ground: 0x181c28, hemiI: 0.55, bg: 0x121a2e, night: 1, exposure: 1.15, bloom: 0.6 },
};
const tod = { from: PRESETS.golden, to: PRESETS.golden, t: 1, current: 'golden' };
const lerp = (a, b, t) => a + (b - a) * t;
const cA = new THREE.Color();
const cB = new THREE.Color();
let night = 0;

function applyTod(k) {
  const A = tod.from;
  const B = tod.to;
  const mixc = (a, b) => cA.set(a).lerp(cB.set(b), k).clone();
  sun.color.setRGB(lerp(A.sun[0], B.sun[0], k), lerp(A.sun[1], B.sun[1], k), lerp(A.sun[2], B.sun[2], k));
  sun.intensity = lerp(A.sunI, B.sunI, k);
  const d = new THREE.Vector3(lerp(A.dir[0], B.dir[0], k), lerp(A.dir[1], B.dir[1], k), lerp(A.dir[2], B.dir[2], k)).normalize();
  sun.userData.dir = d;
  hemi.color.copy(mixc(A.sky, B.sky));
  hemi.groundColor.copy(mixc(A.ground, B.ground));
  hemi.intensity = lerp(A.hemiI, B.hemiI, k);
  const bg = mixc(A.bg, B.bg);
  scene.background.copy(bg);
  scene.fog.color.copy(bg);
  night = lerp(A.night, B.night, k);
  renderer.toneMappingExposure = lerp(A.exposure, B.exposure, k);
  bloom.strength = lerp(A.bloom, B.bloom, k);
  document.querySelectorAll('[data-tod]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.tod === tod.current ? 'true' : 'false'));
}

function setTod(name, instant = false) {
  tod.from = { ...currentTodSnapshot() };
  tod.to = PRESETS[name];
  tod.current = name;
  tod.t = instant ? 1 : 0;
  if (instant) tod.from = PRESETS[name];
}
function currentTodSnapshot() {
  const k = tod.t;
  const A = tod.from;
  const B = tod.to;
  const out = {};
  for (const key of Object.keys(B)) {
    const a = A[key];
    const b = B[key];
    if (Array.isArray(b)) out[key] = b.map((v, i) => lerp(a[i], v, k));
    else if (key === 'sky' || key === 'ground' || key === 'bg') out[key] = cA.set(a).lerp(cB.set(b), k).getHex();
    else out[key] = lerp(a, b, k);
  }
  return out;
}

// ---------------------------------------------------------------------------
// post-processing: tilt-shift blur, bloom, grade
// ---------------------------------------------------------------------------

const size = renderer.getDrawingBufferSize(new THREE.Vector2());
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));

const tiltShader = {
  uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2(1, 0) }, uRes: { value: new THREE.Vector2(size.x, size.y) }, uFocus: { value: 0.46 }, uBand: { value: 0.13 }, uMax: { value: 3.2 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 uDir; uniform vec2 uRes; uniform float uFocus; uniform float uBand; uniform float uMax;
    varying vec2 vUv;
    void main(){
      float d = abs(vUv.y - uFocus);
      // stronger blur toward the top (distance) than the bottom (foreground)
      float k = smoothstep(uBand, uBand + 0.32, d) * (vUv.y > uFocus ? 1.0 : 0.75);
      float r = uMax * k * (uRes.y / 720.0);
      vec4 acc = vec4(0.0); float wsum = 0.0;
      for (int i = -6; i <= 6; i++) {
        float f = float(i) / 6.0;
        float w = exp(-f * f * 2.0);
        acc += texture2D(tDiffuse, vUv + uDir * f * r / uRes) * w;
        wsum += w;
      }
      gl_FragColor = acc / wsum;
    }`,
};
const tiltH = new ShaderPass(tiltShader);
const tiltV = new ShaderPass(tiltShader);
tiltV.uniforms.uDir.value.set(0, 1);
composer.addPass(tiltH);
composer.addPass(tiltV);
const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.3, 0.45, 0.82);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uNight: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uNight; varying vec2 vUv;
    float h(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      // gentle S-curve and saturation for the storybook look
      c.rgb = mix(c.rgb, c.rgb * c.rgb * (3.0 - 2.0 * c.rgb), 0.35);
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(l), c.rgb, 1.12);
      // cool shadows at night
      c.rgb = mix(c.rgb, c.rgb * vec3(0.85, 0.95, 1.2), uNight * (1.0 - l) * 0.5);
      vec2 d = vUv - 0.5;
      c.rgb *= 1.0 - dot(d, d) * 0.9;
      c.rgb += (h(vUv * 900.0 + uTime) - 0.5) / 255.0 * 2.0;
      gl_FragColor = c;
    }`,
});
composer.addPass(grade);

// ---------------------------------------------------------------------------
// input
// ---------------------------------------------------------------------------

const keys = new Set();
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
  if (k === 'e' || k === ' ' || k === 'enter') interact();
  else keys.add(k);
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

// hold a pointer to walk toward it; tap an NPC to talk
let pointer = null;
const ray = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1);
canvas.addEventListener('pointerdown', (e) => {
  if (dialog.open) { interact(); return; }
  pointer = { x: e.clientX, y: e.clientY };
  const near = nearestTalker();
  if (near) {
    const p = worldToScreen(talkerPos(near), 1.6);
    if (Math.hypot(p.x - e.clientX, p.y - e.clientY) < 70) { interact(); pointer = null; }
  }
});
canvas.addEventListener('pointermove', (e) => { if (pointer) pointer = { x: e.clientX, y: e.clientY }; });
window.addEventListener('pointerup', () => (pointer = null));

function pointerDirection() {
  if (!pointer) return null;
  const ndc = new THREE.Vector2((pointer.x / window.innerWidth) * 2 - 1, -(pointer.y / window.innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = new THREE.Vector3();
  if (!ray.ray.intersectPlane(groundPlane, hit)) return null;
  const dx = hit.x - player.x;
  const dz = hit.z - player.z;
  const l = Math.hypot(dx, dz);
  return l < 0.3 ? null : [dx / l, dz / l];
}

// ---------------------------------------------------------------------------
// dialogue
// ---------------------------------------------------------------------------

const ui = {
  box: document.getElementById('dialog'),
  name: document.getElementById('dialog-name'),
  text: document.getElementById('dialog-text'),
  prompt: document.getElementById('prompt'),
};
const dialog = { open: false, npc: null, line: 0, shown: 0 };

const talkerPos = (n) => (n.ch ? { x: n.ch.x, z: n.ch.z, y: groundY(n.ch.x, n.ch.z) } : { x: n.at[0], z: n.at[1], y: 1 });
function nearestTalker() {
  let best = null;
  let bd = 2.1;
  for (const n of npcs) {
    const p = talkerPos(n);
    const d = Math.hypot(p.x - player.x, p.z - player.z);
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}

function faceToward(ch, x, z) {
  const dx = x - ch.x;
  const dz = z - ch.z;
  ch.dir = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'right' : 'left') : dz > 0 ? 'down' : 'up';
  ch.frame = 0;
  placeCharacter(ch);
}

function interact() {
  if (dialog.open) {
    const full = dialog.npc.lines[dialog.line];
    if (dialog.shown < full.length) { dialog.shown = full.length; return; }
    dialog.line++;
    dialog.shown = 0;
    if (dialog.line >= dialog.npc.lines.length) closeDialog();
    return;
  }
  const n = nearestTalker();
  if (!n) return;
  openDialog(n);
}
function openDialog(n, line = 0) {
  dialog.open = true;
  dialog.npc = n;
  dialog.line = line;
  dialog.shown = 0;
  ui.box.hidden = false;
  ui.name.textContent = n.name;
  const p = talkerPos(n);
  if (n.ch) faceToward(n.ch, player.x, player.z);
  faceToward(player, p.x, p.z);
}
function closeDialog() {
  dialog.open = false;
  ui.box.hidden = true;
  for (const n of npcs) if (n.ch) { n.ch.dir = 'down'; placeCharacter(n.ch); }
}

function worldToScreen(p, lift = 0) {
  const v = new THREE.Vector3(p.x, p.y + lift, p.z).project(camera);
  return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
}

// ---------------------------------------------------------------------------
// loop
// ---------------------------------------------------------------------------

const camTarget = new THREE.Vector3(player.x, 1.4, player.z);
function updateCamera(snap = false) {
  const tx = THREE.MathUtils.clamp(player.x, 13, MAP_W - 13);
  const tz = THREE.MathUtils.clamp(player.z, 8, MAP_D - 9);
  const goal = new THREE.Vector3(tx, 1.4, tz);
  if (snap) camTarget.copy(goal);
  else camTarget.lerp(goal, 0.08);
  camera.position.set(camTarget.x, camTarget.y + Math.sin(PITCH) * DIST, camTarget.z + Math.cos(PITCH) * DIST);
  camera.lookAt(camTarget);
  // keep the shadow box around the view
  const d = sun.userData.dir || new THREE.Vector3(-0.5, 0.8, 0.5).normalize();
  sun.target.position.copy(camTarget);
  sun.position.copy(camTarget).addScaledVector(d, 50);
}

function step(dt) {
  let mx = 0;
  let mz = 0;
  if (!dialog.open) {
    if (keys.has('arrowleft') || keys.has('a')) mx -= 1;
    if (keys.has('arrowright') || keys.has('d')) mx += 1;
    if (keys.has('arrowup') || keys.has('w')) mz -= 1;
    if (keys.has('arrowdown') || keys.has('s')) mz += 1;
    const pd = pointerDirection();
    if (pd && !mx && !mz) [mx, mz] = pd;
  }
  const len = Math.hypot(mx, mz);
  player.moving = len > 0.01;
  if (player.moving) {
    mx /= len;
    mz /= len;
    const speed = 4.4;
    const nx = player.x + mx * speed * dt;
    const nz = player.z + mz * speed * dt;
    if (!isBlocked(world, nx, player.z)) player.x = nx;
    if (!isBlocked(world, player.x, nz)) player.z = nz;
    player.dir = Math.abs(mx) > Math.abs(mz) ? (mx > 0 ? 'right' : 'left') : mz > 0 ? 'down' : 'up';
    player.animT += dt * 8;
    player.frame = Math.floor(player.animT) % WALK_FRAMES;
  } else {
    player.animT = 0;
    player.frame = 0;
  }
  placeCharacter(player);

  // prompt bubble
  const n = !dialog.open && nearestTalker();
  if (n) {
    const p = worldToScreen(talkerPos(n), n.ch ? 2.9 : 1.9);
    ui.prompt.hidden = false;
    ui.prompt.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
  } else ui.prompt.hidden = true;

  // typewriter
  if (dialog.open) {
    const full = dialog.npc.lines[dialog.line];
    dialog.shown = Math.min(full.length, dialog.shown + dt * 45);
    ui.text.textContent = full.slice(0, Math.floor(dialog.shown));
    ui.box.classList.toggle('done', dialog.shown >= full.length);
  }
}

// idle NPC breathing: tiny bob every couple of seconds
function idleNPCs(t) {
  for (const n of npcs) {
    if (!n.ch) continue;
    const ch = n.ch;
    ch.frame = Math.sin(t * 1.4 + ch.x) > 0.85 ? 1 : 0;
    placeCharacter(ch);
  }
}

document.querySelectorAll('[data-tod]').forEach((b) => b.addEventListener('click', () => setTod(b.dataset.tod)));
const hudToggle = document.getElementById('hud-toggle');
if (hudToggle) hudToggle.addEventListener('click', () => document.body.classList.toggle('hud-hidden'));

setTod(params.get('tod') || 'golden', true);
applyTod(1);
updateCamera(true);

const timer = new THREE.Timer();
let elapsed = 0;
function frame() {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.05);
  elapsed += dt;
  if (tod.t < 1) {
    tod.t = Math.min(1, tod.t + dt / 1.5);
    applyTod(tod.t * tod.t * (3 - 2 * tod.t));
  }
  step(dt);
  idleNPCs(elapsed);
  updateCamera();
  world.update(elapsed, night);
  updateMotes(elapsed, night);
  grade.uniforms.uTime.value = elapsed % 10;
  grade.uniforms.uNight.value = night;
  composer.render();
  if (!CAPTURE) requestAnimationFrame(frame);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  const s = renderer.getDrawingBufferSize(new THREE.Vector2());
  tiltH.uniforms.uRes.value.copy(s);
  tiltV.uniforms.uRes.value.copy(s);
});

if (CAPTURE) {
  // deterministic frames for screenshots
  window.__renderAt = (o = {}) => {
    if (o.tod) { setTod(o.tod, true); applyTod(1); }
    if (o.player) { player.x = o.player[0]; player.z = o.player[1]; }
    if (o.dir) player.dir = o.dir;
    player.frame = o.frame ?? 0;
    placeCharacter(player);
    if (o.talk !== undefined) openDialog(npcs[o.talk], o.line || 0);
    else if (dialog.open) closeDialog();
    if (o.talk !== undefined) { dialog.shown = 999; ui.text.textContent = dialog.npc.lines[dialog.line]; ui.box.classList.add('done'); }
    for (let i = 0; i < 3; i++) updateCamera(true);
    const t = o.t ?? 4;
    world.update(t, night);
    updateMotes(t, night);
    grade.uniforms.uNight.value = night;
    step(0);
    if (o.talk !== undefined) ui.text.textContent = dialog.npc.lines[dialog.line];
    composer.render();
    return true;
  };
}

window.__game = { player, npcs, dialog };
document.getElementById('loading')?.remove();
frame();
window.__ready = true;
