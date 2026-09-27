import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Water } from 'three/addons/objects/Water.js';

import { createTerrain, terrainHeight, LAKE, WATER_LEVEL } from './terrain.js';
import { createSky } from './sky.js';
import { createWorldTree } from './worldTree.js';
import { createForest } from './forest.js';
import { makeWaterNormals } from './textures.js';

const params = new URLSearchParams(location.search);
const hash = location.hash.replace('#', '');
const QUALITY = hash === 'low' || params.get('q') === 'low' ? 'low' : 'high';
const START_HOURS = params.has('t') ? parseFloat(params.get('t')) : 17.4;
const CAPTURE = params.has('capture');

const loading = document.getElementById('loading');
const loadingStep = document.getElementById('loading-step');
const tick = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
async function step(label, fn) {
  if (loadingStep) loadingStep.textContent = label;
  await tick();
  return fn();
}

async function init() {
  const canvas = document.getElementById('scene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: CAPTURE });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY === 'high' ? 1.5 : 1));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x9fb4c8, 0.00011);

  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 60000);

  const shared = {
    uTime: { value: 0 },
    uGlow: { value: 1 },
    uPulseSpeed: { value: 1.6 },
    uWind: { value: 1 },
    uDayBoost: { value: 1 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color(1, 1, 1) },
  };

  const terrain = await step('Raising the valley', () => createTerrain());
  scene.add(terrain);

  const tree = await step('Growing the world tree', () => createWorldTree(shared));
  scene.add(tree.group);
  const groundY = tree.skeleton.groundY;
  const focus = new THREE.Vector3(0, groundY + 95, 0);

  const forest = await step('Planting the forest', () => createForest(shared, QUALITY));
  scene.add(forest);

  const water = await step('Filling the lake', () => {
    const geo = new THREE.PlaneGeometry(1500, 1300, 1, 1);
    const w = new Water(geo, {
      textureWidth: QUALITY === 'high' ? 1024 : 512,
      textureHeight: QUALITY === 'high' ? 1024 : 512,
      waterNormals: makeWaterNormals(),
      sunDirection: new THREE.Vector3(0, 1, 0),
      sunColor: 0xffffff,
      waterColor: 0x0b2a2e,
      distortionScale: 2.2,
      fog: true,
    });
    w.rotation.x = -Math.PI / 2;
    w.position.set(LAKE.x, WATER_LEVEL, LAKE.z);
    w.material.uniforms.size.value = 6;
    return w;
  });
  scene.add(water);

  const sky = await step('Lighting the sky', () => createSky(renderer, scene, focus));

  // camera
  camera.position.set(-265, groundY + 14, 400);
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(focus);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 70;
  controls.maxDistance = 3200;
  controls.maxPolarAngle = Math.PI * 0.53;
  controls.autoRotateSpeed = 0.25;
  controls.update();

  // post-processing
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.6, 0.55, 1.0);
  composer.addPass(bloom);
  const grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uVignette: { value: 0.32 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float uTime; uniform float uVignette; varying vec2 vUv;
      float h(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      void main(){
        vec4 c = texture2D(tDiffuse, vUv);
        vec2 d = vUv - 0.5;
        float v = 1.0 - dot(d, d) * uVignette * 2.2;
        c.rgb *= v;
        c.rgb += (h(vUv * 1000.0 + uTime) - 0.5) / 255.0 * 1.5;
        gl_FragColor = c;
      }`,
  });
  composer.addPass(new OutputPass());
  composer.addPass(grade);

  // ---------------------------------------------------------------------
  // time of day
  // ---------------------------------------------------------------------
  const ui = {
    slider: document.getElementById('time'),
    readout: document.getElementById('time-readout'),
    phase: document.getElementById('time-phase'),
    glow: document.getElementById('glow'),
    lapse: document.getElementById('lapse'),
    orbit: document.getElementById('orbit'),
    presets: document.querySelectorAll('[data-hours]'),
    hide: document.getElementById('hide-ui'),
    panel: document.getElementById('panel'),
  };

  let hours = START_HOURS;
  let pendingHours = hours;
  let lastApplied = -1;
  let lastApplyTime = 0;

  function phaseName(h) {
    if (h < 4.8 || h >= 20.6) return 'Night';
    if (h < 5.8) return 'Blue hour';
    if (h < 7.2) return 'Sunrise';
    if (h < 10.5) return 'Morning';
    if (h < 14.5) return 'Midday';
    if (h < 17.0) return 'Afternoon';
    if (h < 18.4) return 'Golden hour';
    if (h < 19.4) return 'Sunset';
    return 'Dusk';
  }
  function fmt(h) {
    const hh = Math.floor(h);
    const mm = Math.floor((h - hh) * 60);
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  function applyTime(h) {
    const st = sky.setTime(h);
    lastApplied = h;
    renderer.toneMappingExposure = st.exposure;
    scene.fog.color.copy(st.fogColor).multiplyScalar(0.62);
    // thicker haze at twilight and night
    scene.fog.density = 0.00012 + (1 - st.day) * 0.00005;
    shared.uSunDir.value.copy(st.sunDir);
    shared.uSunColor.value.copy(st.lightColor);
    water.material.uniforms.sunDirection.value.copy(st.sunDir.y > -0.02 ? st.sunDir : new THREE.Vector3(0, 1, 0));
    water.material.uniforms.sunColor.value.copy(st.lightColor);
    water.material.uniforms.waterColor.value.setRGB(0.03, 0.1, 0.11).multiplyScalar(0.15 + 0.85 * st.day);
    // bloom only what outshines the sky at the horizon: the sun, the veins, the pods
    const skyLum = st.fogColor.r * 0.2126 + st.fogColor.g * 0.7152 + st.fogColor.b * 0.0722;
    bloom.threshold = Math.max(0.35, skyLum * 1.25);
    shared.uDayBoost.value = THREE.MathUtils.clamp(skyLum * 0.55, 1, 2);
    bloom.strength = 0.4 + st.night * 0.2;
    // how bright the tree's veins read against the ambient light
    tree.nightFactor = st.night;
    tree.dayFactor = st.day;
    ui.readout.textContent = fmt(st.hours);
    ui.phase.textContent = phaseName(st.hours);
    ui.slider.value = st.hours.toFixed(2);
    document.documentElement.style.setProperty('--sky-tint', st.night > 0.5 ? '0' : '1');
  }

  ui.slider.addEventListener('input', () => {
    pendingHours = parseFloat(ui.slider.value);
    ui.readout.textContent = fmt(pendingHours);
    ui.phase.textContent = phaseName(pendingHours);
  });
  ui.presets.forEach((b) =>
    b.addEventListener('click', () => {
      animateTo(parseFloat(b.dataset.hours));
    })
  );
  let tween = null;
  function animateTo(target) {
    let delta = target - hours;
    if (delta > 12) delta -= 24;
    if (delta < -12) delta += 24;
    tween = { from: hours, delta, t: 0, dur: 2.2 };
    ui.lapse.checked = false;
  }
  ui.glow.addEventListener('input', () => (shared.uGlow.value = parseFloat(ui.glow.value)));
  ui.orbit.addEventListener('change', () => (controls.autoRotate = ui.orbit.checked));
  ui.hide.addEventListener('click', () => document.body.classList.toggle('ui-hidden'));
  const qBtn = document.getElementById('quality');
  qBtn.textContent = QUALITY === 'low' ? 'Full quality' : 'Performance mode';
  qBtn.addEventListener('click', () => {
    location.hash = QUALITY === 'low' ? 'high' : 'low';
    location.reload();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'h' || e.key === 'H') document.body.classList.toggle('ui-hidden');
  });

  applyTime(hours);

  // ---------------------------------------------------------------------
  // loop
  // ---------------------------------------------------------------------
  const timer = new THREE.Timer();
  let elapsed = 0;

  function frame() {
    timer.update();
    const dt = Math.min(timer.getDelta(), 0.1);
    elapsed += dt;

    if (tween) {
      tween.t += dt / tween.dur;
      const k = tween.t >= 1 ? 1 : 0.5 - 0.5 * Math.cos(Math.PI * tween.t);
      pendingHours = (tween.from + tween.delta * k + 24) % 24;
      if (tween.t >= 1) tween = null;
    } else if (ui.lapse.checked) {
      pendingHours = (pendingHours + dt * (1 / 6)) % 24; // one hour every six seconds
    }
    hours = pendingHours;
    const now = performance.now();
    if (Math.abs(hours - lastApplied) > 0.004 && now - lastApplyTime > 60) {
      applyTime(hours);
      lastApplyTime = now;
    }

    shared.uTime.value = elapsed;
    sky.update(elapsed);
    tree.update(elapsed, shared.uGlow.value, tree.nightFactor ?? 0);
    water.material.uniforms.time.value = elapsed * 0.5;
    grade.uniforms.uTime.value = elapsed % 10;

    controls.update();
    // keep the camera above ground and water
    const gy = Math.max(terrainHeight(camera.position.x, camera.position.z), WATER_LEVEL) + 4;
    if (camera.position.y < gy) camera.position.y = gy;

    composer.render();
    if (!CAPTURE) requestAnimationFrame(frame);
  }

  function onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
  }
  window.addEventListener('resize', onResize);

  if (CAPTURE) {
    window.__debug = { scene, renderer, sky, shared, camera };
    // deterministic single frames for screenshots
    window.__renderAt = (h, t = 4, cam) => {
      if (cam) {
        camera.position.set(...cam.pos);
        controls.target.set(...cam.target);
      }
      pendingHours = h;
      hours = h;
      applyTime(h);
      elapsed = t;
      shared.uTime.value = t;
      sky.update(t);
      tree.update(t, shared.uGlow.value, tree.nightFactor ?? 0);
      water.material.uniforms.time.value = t * 0.5;
      controls.update();
      composer.render();
      return true;
    };
  }

  loading.classList.add('done');
  setTimeout(() => loading.remove(), 1200);
  frame();
  window.__ready = true;
}

init().catch((err) => {
  console.error(err);
  if (loadingStep) loadingStep.textContent = `Something went wrong: ${err.message}`;
});
