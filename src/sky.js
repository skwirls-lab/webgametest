import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mulberry32, smoothstep, lerp } from './noise.js';
import { makeGlowSprite } from './textures.js';

// Sun path: rises in the east (+x), peaks to the south (+z) and sets in the west (-x).
const TILT = THREE.MathUtils.degToRad(38);

export function sunDirection(hours, target = new THREE.Vector3()) {
  const th = ((hours - 6) / 12) * Math.PI;
  return target.set(Math.cos(th), Math.sin(th) * Math.cos(TILT), Math.sin(th) * Math.sin(TILT)).normalize();
}

// Colour of direct light after passing through the atmosphere.
function transmittance(elev, out) {
  const e = Math.max(elev, -0.02);
  const deg = THREE.MathUtils.radToDeg(Math.asin(Math.max(0, e)));
  const airmass = 1 / (Math.max(0, e) + 0.15 * Math.pow(93.885 - deg, -1.253));
  const k = [0.045, 0.1, 0.22];
  return out.setRGB(Math.exp(-k[0] * airmass), Math.exp(-k[1] * airmass), Math.exp(-k[2] * airmass));
}

export function createSky(renderer, scene, focus) {
  const group = new THREE.Group();
  group.name = 'sky';

  const sky = new Sky();
  sky.scale.setScalar(30000);
  const su = sky.material.uniforms;
  su.turbidity.value = 5;
  su.rayleigh.value = 1.6;
  su.mieCoefficient.value = 0.004;
  su.mieDirectionalG.value = 0.82;
  su.cloudCoverage.value = 0.34;
  su.cloudDensity.value = 0.45;
  su.cloudElevation.value = 0.55;
  su.cloudScale.value = 0.00022;
  su.cloudSpeed.value = 0.00003;
  group.add(sky);

  // stars
  const rand = mulberry32(8);
  const starCount = 5000;
  const starPos = new Float32Array(starCount * 3);
  const starCol = new Float32Array(starCount * 3);
  const c = new THREE.Color();
  for (let i = 0; i < starCount; i++) {
    // concentrate some stars in a band for a faint milky way
    let v = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize();
    if (i % 3 === 0) {
      const a = rand() * Math.PI * 2;
      v = new THREE.Vector3(Math.cos(a), (rand() - 0.5) * 0.25, Math.sin(a)).applyAxisAngle(new THREE.Vector3(1, 0, 0.3).normalize(), 1.1).normalize();
    }
    if (v.y < -0.05) v.y = -v.y;
    starPos.set([v.x * 25000, v.y * 25000, v.z * 25000], i * 3);
    const mag = Math.pow(rand(), 6);
    c.setHSL(0.58 + (rand() - 0.5) * 0.2, 0.4, 0.5).multiplyScalar(0.4 + mag * 5);
    starCol.set([c.r, c.g, c.b], i * 3);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(starCol, 3));
  const starMat = new THREE.PointsMaterial({
    size: 2.2,
    sizeAttenuation: false,
    vertexColors: true,
    map: makeGlowSprite(32),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  stars.renderOrder = -1;
  group.add(stars);

  // moon
  const moonMat = new THREE.SpriteMaterial({ map: makeGlowSprite(128), color: new THREE.Color(3, 3.2, 3.6), fog: false, depthWrite: false });
  const moon = new THREE.Sprite(moonMat);
  moon.scale.setScalar(900);
  group.add(moon);

  scene.add(group);

  // lights
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera;
  sc.left = -430; sc.right = 430; sc.top = 430; sc.bottom = -430;
  sc.near = 10; sc.far = 5000;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  sun.target.position.copy(focus);
  scene.add(sun, sun.target);

  const hemi = new THREE.HemisphereLight(0x9fb8e8, 0x2a2418, 0.2);
  scene.add(hemi);

  // environment lighting from the sky
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = new Sky();
  envSky.scale.setScalar(1000);
  envSky.material.uniforms = sky.material.uniforms; // shares uniforms
  envScene.add(envSky);
  let envRT = null;

  // horizon colour probe for the fog
  const probeRT = new THREE.WebGLRenderTarget(8, 8, { type: THREE.FloatType });
  const probeCam = new THREE.PerspectiveCamera(60, 1, 1, 5000);
  const probeBuf = new Float32Array(8 * 8 * 4);

  const state = {
    hours: 12,
    sunDir: new THREE.Vector3(),
    sunColor: new THREE.Color(),
    lightColor: new THREE.Color(),
    day: 1,
    night: 0,
    exposure: 0.5,
    fogColor: new THREE.Color(),
  };

  function probeHorizon() {
    const acc = new THREE.Color(0, 0, 0);
    const prevTarget = renderer.getRenderTarget();
    const prevTM = renderer.toneMapping;
    renderer.toneMapping = THREE.NoToneMapping;
    // sample the horizon away from the sun so its glare doesn't whiten the haze
    const sunAz = Math.atan2(state.sunDir.z, state.sunDir.x);
    for (let k = 0; k < 4; k++) {
      const a = sunAz + Math.PI * (0.5 + k / 3);
      probeCam.position.set(0, 0, 0);
      probeCam.lookAt(Math.cos(a), 0.06, Math.sin(a));
      renderer.setRenderTarget(probeRT);
      renderer.render(envScene, probeCam);
      renderer.readRenderTargetPixels(probeRT, 0, 0, 8, 8, probeBuf);
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < 64; i++) {
        r += probeBuf[i * 4]; g += probeBuf[i * 4 + 1]; b += probeBuf[i * 4 + 2];
      }
      acc.r += r / 64; acc.g += g / 64; acc.b += b / 64;
    }
    renderer.setRenderTarget(prevTarget);
    renderer.toneMapping = prevTM;
    return acc.multiplyScalar(0.25);
  }

  function setTime(hours) {
    state.hours = ((hours % 24) + 24) % 24;
    const d = sunDirection(state.hours, state.sunDir);
    su.sunPosition.value.copy(d).multiplyScalar(10000);
    const e = d.y;
    state.day = smoothstep(-0.06, 0.2, e);
    state.night = 1 - smoothstep(-0.2, 0.0, e);
    const twilight = Math.max(0, 1 - Math.abs(e - 0.02) / 0.14);

    su.rayleigh.value = lerp(1.25, 2.6, twilight);
    su.turbidity.value = lerp(3.2, 7, twilight);

    transmittance(e, state.sunColor);
    const sunI = 3.6 * smoothstep(-0.03, 0.12, e);
    const moonDir = new THREE.Vector3(-d.x, Math.max(0.25, -d.y * 0.8 + 0.15), -d.z + 0.3).normalize();
    const moonI = 0.35 * state.night;

    if (sunI >= moonI) {
      sun.position.copy(focus).addScaledVector(d, 2500);
      sun.color.copy(state.sunColor);
      sun.intensity = sunI;
      state.lightColor.copy(state.sunColor).multiplyScalar(sunI / 3.6);
    } else {
      sun.position.copy(focus).addScaledVector(moonDir, 2500);
      sun.color.setRGB(0.6, 0.72, 1.0);
      sun.intensity = moonI;
      state.lightColor.setRGB(0.05, 0.07, 0.12);
    }
    moon.position.copy(moonDir).multiplyScalar(20000);
    moonMat.opacity = state.night;
    moon.visible = state.night > 0.01;

    starMat.opacity = Math.pow(state.night, 1.5);
    stars.visible = state.night > 0.01;

    hemi.intensity = 0.12 + state.night * 0.5;
    hemi.color.setRGB(lerp(0.62, 0.25, state.night), lerp(0.72, 0.35, state.night), lerp(0.9, 0.65, state.night));

    // exposure: bright days, lifted nights
    state.exposure = lerp(1.35, 0.27, state.day) + twilight * 0.18;

    // regenerate sky lighting
    if (envRT) envRT.dispose();
    envRT = pmrem.fromScene(envScene, 0, 1, 5000);
    scene.environment = envRT.texture;
    scene.environmentIntensity = lerp(1.0, 0.6, state.night);

    const hz = probeHorizon();
    // keep a floor so night fog doesn't turn pitch black
    state.fogColor.setRGB(Math.max(hz.r, 0.0035), Math.max(hz.g, 0.0045), Math.max(hz.b, 0.009));
    return state;
  }

  function update(elapsed) {
    su.time.value = elapsed;
  }

  return { setTime, update, state, sun, sky };
}
