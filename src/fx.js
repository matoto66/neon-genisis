// NEON GENESIS — city atmosphere effects (cheap enough for Quest).
//
//  • Neon bloom: a soft glow halo on every neon light, sign, lamp and lantern
//    — one Points draw call with per-light size and colour (fake bloom; real
//    post-processing bloom is too expensive in VR).
//  • Lamp light beams: soft volumetric cones under street lamps (one mesh).
//  • Flying cars: traffic in sky lanes with head/tail-light glows (instanced).
//  • Searchlights sweeping from the Tenkai Spire.
// Everything fades with daylight via city.dayNight.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export function createCityFX(root, city, renderer) {
  const night = () => 1 - city.dayNight.day / 0.62 * 0.8;

  // ── neon bloom halos ────────────────────────────────────────────────────
  const pts = city.glowPoints.concat((city.extraGlow || []));
  const n = pts.length;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
  const c = new THREE.Color();
  pts.forEach(([x, y, z, hex, s], i) => { pos.set([x, y, z], i * 3); c.set(hex); col.set([c.r, c.g, c.b], i * 3); size[i] = s; });
  const bloomGeo = new THREE.BufferGeometry();
  bloomGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  bloomGeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  bloomGeo.setAttribute("size", new THREE.BufferAttribute(size, 1));
  const bloomMat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 1 }, uIntensity: { value: 1 } },
    vertexShader: `
      attribute float size; attribute vec3 color; varying vec3 vColor; uniform float uScale;
      void main() {
        vColor = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = min(size * uScale / -mv.z, 140.0);
      }`,
    fragmentShader: `
      varying vec3 vColor; uniform float uIntensity;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = exp(-d * d * 4.5) * (1.0 - d) * 0.75 + exp(-d * d * 40.0) * 0.25;   // soft glow, gentle core          // soft gaussian falloff
        if (a <= 0.003) discard;
        gl_FragColor = vec4(vColor * a * uIntensity, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false
  });
  const bloom = new THREE.Points(bloomGeo, bloomMat);
  bloom.name = "NEON_BLOOM"; bloom.frustumCulled = false; bloom.renderOrder = 5;
  root.add(bloom);

  // ── lamp light beams ───────────────────────────────────────────────────
  const coneParts = [];
  for (const [x, y, z, hex] of city.lampCones) {
    const g = new THREE.CylinderGeometry(0.12, 1.5, y - 0.1, 16, 1, true);
    g.translate(x, (y - 0.1) / 2 + 0.05, z);
    // vertex alpha: bright at the lamp, fading to nothing at the ground
    const cl = new THREE.Color(hex), p = g.attributes.position, cArr = new Float32Array(p.count * 4);
    for (let i = 0; i < p.count; i++) { const k = (p.getY(i) - 0.05) / (y - 0.1); cArr.set([cl.r, cl.g, cl.b, 0.14 * k * k], i * 4); }
    g.setAttribute("color", new THREE.BufferAttribute(cArr, 4));
    g.deleteAttribute("uv"); g.deleteAttribute("normal");
    coneParts.push(g);
  }
  const coneMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, fog: false });
  const cones = coneParts.length ? new THREE.Mesh(mergeGeometries(coneParts), coneMat) : null;
  if (cones) { cones.name = "LAMP_BEAMS"; root.add(cones); }

  // ── flying cars ────────────────────────────────────────────────────────
  // Lanes: along the avenue, along the Ring Road, and a high crossing lane.
  const LANES = [
    { a: [ -4, 26, 60], b: [ -4, 26, -170], speed: 16 }, { a: [ 4, 30, -170], b: [ 4, 30, 60], speed: 14 },
    { a: [ -2, 44, 60], b: [ -2, 44, -170], speed: 20 }, { a: [ 3, 52, -170], b: [ 3, 52, 60], speed: 22 },
    { a: [-120, 24, -44], b: [140, 24, -44], speed: 15 }, { a: [140, 34, -48], b: [-120, 34, -48], speed: 18 },
    { a: [-120, 64, -90], b: [140, 70, 10], speed: 26 }, { a: [140, 58, -130], b: [-120, 62, -20], speed: 24 }
  ];
  const CARS = 34;
  const carParts = [];
  const add = (geo, hex) => { const g = geo.toNonIndexed(); g.deleteAttribute("uv"); const cc = new THREE.Color(hex), a = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < a.length; i += 3) a.set([cc.r, cc.g, cc.b], i); g.setAttribute("color", new THREE.BufferAttribute(a, 3)); carParts.push(g); };
  const B = (w, h, d, x, y, z, hex) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); add(g, hex); };
  B(1.9, 0.55, 4.2, 0, 0, 0, 0x14161c); B(1.5, 0.45, 2.0, 0, 0.45, -0.2, 0x1c2230);      // body + cabin
  B(1.52, 0.3, 1.6, 0, 0.47, -0.2, 0x2a5a6e);                                               // windows (tinted)
  B(2.4, 0.12, 1.2, 0, -0.1, 1.2, 0x1c2230); B(2.4, 0.12, 1.2, 0, -0.1, -1.4, 0x1c2230);   // thrust pods
  B(1.6, 0.08, 0.06, 0, 0.05, -2.12, 0x14161c); B(1.6, 0.1, 0.06, 0, 0.05, 2.12, 0x14161c); // no head/tail lights
  B(1.9, 0.04, 4.0, 0, -0.3, 0, 0x1c2230);                                                  // (underglow removed)
  const carMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const cars = new THREE.InstancedMesh(mergeGeometries(carParts), carMat, CARS);
  cars.instanceMatrix.setUsage(THREE.DynamicDrawUsage); cars.frustumCulled = false; cars.name = "FLYING_CARS";
  root.add(cars);
  const carState = Array.from({ length: CARS }, (_, i) => ({ lane: LANES[i % LANES.length], t: Math.random(), wob: Math.random() * 10, under: [0x38f0e6, 0xff4fa3, 0xb24cff, 0xffcf4a][i % 4] }));
  // light glows that follow the cars (2 per car: head + tail)
  const lightPos = new Float32Array(CARS * 2 * 3), lightCol = new Float32Array(CARS * 2 * 3), lightSize = new Float32Array(CARS * 2);
  for (let i = 0; i < CARS; i++) { lightCol.set([1, 0.95, 0.85], i * 6); lightCol.set([1, 0.15, 0.2], i * 6 + 3); lightSize[i * 2] = 2.6; lightSize[i * 2 + 1] = 2.2; }
  const lightGeo = new THREE.BufferGeometry();
  lightGeo.setAttribute("position", new THREE.BufferAttribute(lightPos, 3));
  lightGeo.setAttribute("color", new THREE.BufferAttribute(lightCol, 3));
  lightGeo.setAttribute("size", new THREE.BufferAttribute(lightSize, 1));
  const carLightMat = bloomMat.clone(); carLightMat.uniforms = { uScale: bloomMat.uniforms.uScale, uIntensity: { value: 0.4 } };
  const carLights = new THREE.Points(lightGeo, carLightMat);
  carLights.frustumCulled = false; carLights.visible = false;   // car lights removed
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), dir = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(1, 1, 1);
  const A = new THREE.Vector3(), Bv = new THREE.Vector3();

  // ── searchlights from the Spire ────────────────────────────────────────
  const beamGeo = new THREE.CylinderGeometry(0.6, 9, 260, 20, 1, true);
  beamGeo.translate(0, 130, 0);
  { const p = beamGeo.attributes.position, a = new Float32Array(p.count * 4);
    for (let i = 0; i < p.count; i++) { const k = 1 - p.getY(i) / 260; a.set([0.75, 0.95, 1, 0.2 * k], i * 4); }
    beamGeo.setAttribute("color", new THREE.BufferAttribute(a, 4)); }
  const searchMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, fog: false });
  const search = [0, 1, 2].map(i => { const m = new THREE.Mesh(beamGeo, searchMat); m.position.set(0, 222, -157); m.userData.phase = i * 2.1; root.add(m); return m; });


  // ══════════════════════════════════════════════════════════════════════
  // GRAPHICS UPGRADE (inspired by wet-neon city art: reflections on asphalt,
  // layered skyline, sky-high holo ads, light-pollution haze, street steam)
  // ══════════════════════════════════════════════════════════════════════
  const nightUniform = { value: 1 }, timeUniform = { value: 0 };

  // ── wet-street neon reflections ───────────────────────────────────────
  // Each sign casts a coloured streak on the ground that always stretches
  // toward the viewer — the "neon on wet asphalt" look, done in the vertex
  // shader so it costs one draw call.
  {
    const src = pts.filter(([x, y, z, , s]) => s >= 1.4 && y > 1.8 && y < 16 && z < 44 && z > -150 && Math.abs(x) < 46);
    const N = src.length, V = N * 4;
    const center = new Float32Array(V * 3), corner = new Float32Array(V * 2), rc = new Float32Array(V * 3), dims = new Float32Array(V * 2);
    const idx = [];
    src.forEach(([x, y, z, hex, s], i) => {
      c.set(hex);
      const gy = city.groundAt(x, z, 0.5) + 0.025;
      const len = Math.min(14, 3 + y * 0.9), wid = Math.min(2.4, 0.5 + s * 0.28);
      [[-1, 0], [1, 0], [1, 1], [-1, 1]].forEach(([cx, cy], k) => {
        const j = i * 4 + k;
        center.set([x, gy, z], j * 3); corner.set([cx, cy], j * 2); rc.set([c.r, c.g, c.b], j * 3); dims.set([wid, len], j * 2);
      });
      const b = i * 4; idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(center, 3));
    g.setAttribute("corner", new THREE.BufferAttribute(corner, 2));
    g.setAttribute("rcolor", new THREE.BufferAttribute(rc, 3));
    g.setAttribute("dims", new THREE.BufferAttribute(dims, 2));
    g.setIndex(idx);
    const m = new THREE.ShaderMaterial({
      uniforms: { uNight: nightUniform, uTime: timeUniform },
      vertexShader: `
        attribute vec2 corner; attribute vec3 rcolor; attribute vec2 dims;
        varying vec3 vC; varying vec2 vUv; varying float vSeed;
        void main() {
          vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
          vec2 d = cameraPosition.xz - wp.xz; float dl = max(length(d), 0.001); d /= dl;
          float len = min(dims.y, dl * 0.85);                 // never reaches past the viewer
          vec2 pe = vec2(-d.y, d.x);
          wp.xz += d * corner.y * len + pe * corner.x * dims.x * (1.0 - corner.y * 0.45);
          vC = rcolor; vUv = corner; vSeed = position.x * 1.7 + position.z * 0.31;
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: `
        varying vec3 vC; varying vec2 vUv; varying float vSeed; uniform float uNight; uniform float uTime;
        void main() {
          float across = 1.0 - abs(vUv.x); across *= across;
          float along = (1.0 - vUv.y) * smoothstep(0.0, 0.08, vUv.y);
          float ripple = 0.75 + 0.25 * sin(vUv.y * 38.0 - uTime * 2.2 + vSeed) * sin(vUv.y * 13.0 + vSeed * 2.0);
          float a = across * along * ripple * (0.8 * uNight + 0.08);
          gl_FragColor = vec4(vC * a, 1.0);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
    });
    const refl = new THREE.Mesh(g, m); refl.name = "WET_REFLECTIONS"; refl.frustumCulled = false; refl.renderOrder = 2;
    root.add(refl);
  }

  // ── street steam from manholes ────────────────────────────────────────
  const steamSpots = [[2.5, 22], [-3, -8], [3.5, -30], [-2, -70], [2.8, -96], [-20, -46], [24, -45.5]];
  {
    // manhole covers
    const parts = [];
    for (const [x, z] of steamSpots) {
      const d = new THREE.CylinderGeometry(0.42, 0.42, 0.02, 18); d.translate(x, 0.01, z);
      d.deleteAttribute("uv"); const a = new Float32Array(d.attributes.position.count * 3).fill(0.11); d.setAttribute("color", new THREE.BufferAttribute(a, 3)); parts.push(d);
      const r = new THREE.TorusGeometry(0.36, 0.025, 4, 18); r.rotateX(Math.PI / 2); r.translate(x, 0.022, z);
      r.deleteAttribute("uv"); const b2 = new Float32Array(r.attributes.position.count * 3).fill(0.22); r.setAttribute("color", new THREE.BufferAttribute(b2, 3)); parts.push(r);
    }
    const mh = new THREE.Mesh(mergeGeometries(parts.map(p => p.toNonIndexed())), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.8 }));
    mh.name = "MANHOLES"; root.add(mh);
  }
  const PUFFS = 14, steamN = steamSpots.length * PUFFS;
  const steamPos = new Float32Array(steamN * 3), steamSeed = new Float32Array(steamN);
  for (let i = 0; i < steamN; i++) { const [x, z] = steamSpots[Math.floor(i / PUFFS)]; steamPos.set([x, 0, z], i * 3); steamSeed[i] = (i % PUFFS) / PUFFS + Math.random() * 0.05; }
  const steamGeo = new THREE.BufferGeometry();
  steamGeo.setAttribute("position", new THREE.BufferAttribute(steamPos, 3));
  steamGeo.setAttribute("seed", new THREE.BufferAttribute(steamSeed, 1));
  const steamMat = new THREE.ShaderMaterial({
    uniforms: { uTime: timeUniform, uScale: { value: 1 }, uNight: nightUniform },
    vertexShader: `
      attribute float seed; uniform float uTime; uniform float uScale; varying float vLife;
      void main() {
        float life = fract(uTime * 0.12 + seed); vLife = life;
        vec3 p = position;
        p.y += life * 3.6; p.x += sin(seed * 40.0 + uTime * 0.7) * life * 0.9; p.z += cos(seed * 31.0 + uTime * 0.5) * life * 0.7;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = min((0.5 + life * 1.8) * uScale / -mv.z, 120.0);
      }`,
    fragmentShader: `
      varying float vLife; uniform float uNight;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.0, d) * sin(vLife * 3.14159) * 0.06;
        vec3 col = mix(vec3(0.85, 0.88, 0.95), vec3(0.62, 0.5, 0.85), uNight);
        gl_FragColor = vec4(col, a);
      }`,
    transparent: true, depthWrite: false, toneMapped: false
  });
  const steam = new THREE.Points(steamGeo, steamMat); steam.frustumCulled = false; steam.name = "STEAM"; root.add(steam);

  // ── glowing curb lines on the Neon Mile ───────────────────────────────
  {
    const parts = [];
    const strip = (w, d, x, z, hex) => { const g = new THREE.BoxGeometry(w, 0.02, d); g.translate(x, 0.155, z); g.deleteAttribute("uv"); g.deleteAttribute("normal"); c.set(hex); const a = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < a.length; i += 3) a.set([c.r, c.g, c.b], i); g.setAttribute("color", new THREE.BufferAttribute(a, 3)); parts.push(g.toNonIndexed()); };
    strip(0.05, 59.5, -7.55, -85.25, 0x38f0e6); strip(0.05, 59.5, 7.55, -85.25, 0xff4fa3);
    const curbs = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
    curbs.name = "CURB_NEON"; root.add(curbs);
  }

  // ── sky: far megastructures (layered skyline silhouettes) ─────────────
  const winTex = (() => {
    const cv = document.createElement("canvas"); cv.width = 128; cv.height = 512; const x = cv.getContext("2d");
    x.fillStyle = "#05060b"; x.fillRect(0, 0, 128, 512);
    for (let r = 0; r < 128; r++) for (let k = 0; k < 16; k++) {
      if (Math.random() < 0.28) { x.fillStyle = ["#ffcf8a", "#7fe8ff", "#ff7ac0", "#ffe9c4"][(Math.random() * 4) | 0]; x.globalAlpha = 0.35 + Math.random() * 0.65; x.fillRect(k * 8 + 2, r * 4 + 1, 4, 2); }
    }
    x.globalAlpha = 1;
    // vertical accent strips
    x.fillStyle = "#ff3d8b"; x.fillRect(0, 0, 3, 512); x.fillStyle = "#38f0e6"; x.fillRect(125, 0, 3, 512);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  })();
  const megaMat = new THREE.MeshBasicMaterial({ map: winTex, fog: false, toneMapped: false, color: 0xffffff });
  const megaParts = [], beacons = [];
  const MEGAS = [ [-260, -120, 46, 340], [-210, -330, 60, 420], [-60, -380, 70, 520], [140, -360, 54, 460], [280, -170, 48, 380],
                  [300, 60, 40, 300], [-300, 90, 44, 320], [90, 300, 50, 280], [-150, 290, 46, 300] ];
  for (const [x, z, w, h] of MEGAS) {
    // stepped tower: base block, mid block, spire
    for (const [fw, fy, fh] of [[1, 0, 0.55], [0.72, 0.55, 0.32], [0.4, 0.87, 0.13]]) {
      const g = new THREE.BoxGeometry(w * fw, h * fh, w * fw * 0.8); g.translate(x, -20 + h * fy + h * fh / 2, z);
      const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w * fw / 12, uv.getY(i) * h * fh / 48);
      megaParts.push(g);
    }
    beacons.push([x, -20 + h + 2, z, 0xff2030, 9], [x - w * 0.36, -20 + h * 0.55 + 1, z, 0xff2030, 6], [x + w * 0.36, -20 + h * 0.55 + 1, z, 0xff2030, 6]);
  }
  const megas = new THREE.Mesh(mergeGeometries(megaParts), megaMat); megas.name = "MEGASTRUCTURES"; megas.frustumCulled = false; root.add(megas);

  // ── sky: light-pollution haze ring around the horizon ─────────────────
  const hazeMat = new THREE.ShaderMaterial({
    uniforms: { uNight: nightUniform, uTime: timeUniform },
    vertexShader: `varying vec2 vUv; varying vec3 vP; void main(){ vUv = uv; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      varying vec2 vUv; varying vec3 vP; uniform float uNight; uniform float uTime;
      void main(){
        float h = vUv.y;
        float band = smoothstep(0.0, 0.18, h) * (1.0 - smoothstep(0.25, 1.0, h));
        float ang = atan(vP.z, vP.x);
        float n = 0.6 + 0.4 * sin(ang * 7.0 + uTime * 0.03) * sin(ang * 3.0 - uTime * 0.02 + h * 4.0);
        vec3 night = mix(vec3(0.95, 0.28, 0.6), vec3(0.45, 0.2, 0.95), 0.5 + 0.5 * sin(ang * 2.0));
        night = mix(night, vec3(1.0, 0.55, 0.3), smoothstep(0.35, 0.0, h) * 0.5);
        vec3 day = vec3(0.75, 0.72, 0.7);
        vec3 col = mix(day, night, uNight);
        gl_FragColor = vec4(col, band * n * mix(0.18, 0.42, uNight));
      }`,
    transparent: true, depthWrite: false, side: THREE.BackSide, fog: false, toneMapped: false
  });
  const haze = new THREE.Mesh(new THREE.CylinderGeometry(420, 420, 220, 48, 1, true), hazeMat);
  haze.position.set(0, 80, -50); haze.name = "CITY_HAZE"; haze.renderOrder = -1; root.add(haze);

  // ── sky: giant holographic ads ────────────────────────────────────────
  const AD_ART = [
    { brand: "NEURO·BLISS", sub: "DREAM IN 8K", c1: "#ff3d8b", c2: "#7a2cff", icon: "eye" },
    { brand: "TENKAI AIR", sub: "THE SKY IS YOURS", c1: "#38f0e6", c2: "#1a5cff", icon: "wing" },
    { brand: "KIRA RAMEN", sub: "24H · FLY-THRU", c1: "#ffb02e", c2: "#ff3d3d", icon: "bowl" },
    { brand: "SYNTH//SOUL", sub: "UPGRADE YOUR HEART", c1: "#b24cff", c2: "#ff4fa3", icon: "heart" }
  ];
  const adTex = (ad) => {
    const cv = document.createElement("canvas"); cv.width = 256; cv.height = 512; const x = cv.getContext("2d");
    const gr = x.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, ad.c2); gr.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = gr; x.globalAlpha = 0.55; x.fillRect(0, 0, 256, 512); x.globalAlpha = 1;
    x.strokeStyle = ad.c1; x.lineWidth = 6; x.strokeRect(8, 8, 240, 496);
    x.save(); x.translate(128, 190); x.strokeStyle = ad.c1; x.fillStyle = ad.c1; x.lineWidth = 9;
    if (ad.icon === "eye") { x.beginPath(); x.ellipse(0, 0, 90, 46, 0, 0, Math.PI * 2); x.stroke(); x.beginPath(); x.arc(0, 0, 26, 0, Math.PI * 2); x.fill(); }
    if (ad.icon === "wing") { for (let k = 0; k < 4; k++) { x.beginPath(); x.moveTo(-90, 30 - k * 10); x.quadraticCurveTo(0, -80 + k * 22, 90, 30 - k * 10); x.stroke(); } }
    if (ad.icon === "bowl") { x.beginPath(); x.arc(0, 0, 80, 0, Math.PI); x.closePath(); x.stroke(); for (let k = -1; k <= 1; k++) { x.beginPath(); x.moveTo(k * 26, -12); x.bezierCurveTo(k * 26 + 18, -40, k * 26 - 18, -60, k * 26, -92); x.stroke(); } }
    if (ad.icon === "heart") { x.beginPath(); x.moveTo(0, 60); x.bezierCurveTo(-110, -10, -60, -100, 0, -40); x.bezierCurveTo(60, -100, 110, -10, 0, 60); x.stroke(); x.beginPath(); x.moveTo(-70, 0); x.lineTo(-25, 0); x.lineTo(-10, -30); x.lineTo(8, 30); x.lineTo(22, 0); x.lineTo(70, 0); x.stroke(); }
    x.restore();
    x.fillStyle = "#ffffff"; x.textAlign = "center"; x.font = "bold 34px sans-serif"; x.fillText(ad.brand, 128, 350);
    x.fillStyle = ad.c1; x.font = "bold 20px sans-serif"; x.fillText(ad.sub, 128, 390);
    for (let k = 0; k < 6; k++) { x.fillStyle = ad.c1; x.globalAlpha = 0.5; x.fillRect(40 + k * 32, 430, 20, 6); }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  const holoVS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
  const holoFS = `
    varying vec2 vUv; uniform sampler2D map; uniform float uNight; uniform float uTime; uniform float uSeed;
    void main(){
      vec2 uv = vUv;
      float glitch = step(0.985, fract(sin(floor(uTime * 6.0 + uSeed) * 91.7) * 4375.5));
      uv.x += glitch * 0.03 * sin(uv.y * 80.0);
      vec4 t = texture2D(map, uv);
      float scan = 0.78 + 0.22 * sin(uv.y * 420.0 - uTime * 4.0);
      float flick = 0.9 + 0.1 * sin(uTime * 13.0 + uSeed * 7.0);
      float edge = smoothstep(0.0, 0.04, uv.x) * smoothstep(1.0, 0.96, uv.x) * smoothstep(0.0, 0.03, uv.y) * smoothstep(1.0, 0.97, uv.y);
      float a = max(max(t.r, t.g), t.b) * scan * flick * edge * mix(0.35, 0.95, uNight);
      gl_FragColor = vec4(t.rgb * a, 1.0);
    }`;
  const ads = [];
  const ADS = [ [0, 50, 47, 22, 44, 0], [-49, 58, -46, 22, 44, 2], [110, 70, -46, 30, 60, 1], [-40, 120, -215, 40, 80, 3] ];   // placed down the street sightlines so they clear the rooftops
  for (const [x, y, z, w, h, k] of ADS) {
    const mat = new THREE.ShaderMaterial({ uniforms: { map: { value: adTex(AD_ART[k]) }, uNight: nightUniform, uTime: timeUniform, uSeed: { value: k * 3.1 } },
      vertexShader: holoVS, fragmentShader: holoFS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z); m.lookAt(Math.abs(x) > 40 ? 0 : x, y - 25, Math.abs(x) > 40 ? z : (z > 0 ? 0 : -46)); m.name = "SKY_AD"; root.add(m); ads.push(m);
  }

  // ── sky: advertising blimp with a scrolling screen ────────────────────
  const blimp = new THREE.Group(); blimp.name = "AD_BLIMP";
  {
    const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 14), new THREE.MeshStandardMaterial({ color: 0x1a1d26, roughness: 0.5, metalness: 0.4 }));
    hull.scale.set(9, 7, 26); blimp.add(hull);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.4, 7, 5), hull.material); fin.position.set(0, 3, -23); blimp.add(fin);
    const fin2 = fin.clone(); fin2.rotation.z = Math.PI / 2; fin2.position.set(0, 0, -23); blimp.add(fin2);
    const cv = document.createElement("canvas"); cv.width = 1024; cv.height = 128; const x = cv.getContext("2d");
    x.fillStyle = "#000"; x.fillRect(0, 0, 1024, 128); x.font = "bold 80px sans-serif"; x.textBaseline = "middle";
    const words = [["TENKAI", "#38f0e6"], ["◆", "#ff4fa3"], ["LIVE BRIGHTER", "#ffffff"], ["◆", "#ff4fa3"], ["GENESIS SOON", "#ffb02e"], ["◆", "#ff4fa3"]];
    let px = 20; for (const [w, col] of words) { x.fillStyle = col; x.fillText(w, px, 66); px += x.measureText(w).width + 30; }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping; tex.repeat.set(1, 1);
    const scrMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, fog: false, side: THREE.DoubleSide });
    for (const side of [-1, 1]) {
      const scr = new THREE.Mesh(new THREE.CylinderGeometry(9.15, 9.15, 30, 24, 1, true, side > 0 ? Math.PI * 0.32 : Math.PI * 1.32, Math.PI * 0.36), scrMat);
      scr.rotation.x = Math.PI / 2; scr.scale.set(1, 1, 7 / 9); blimp.add(scr);
    }
    blimp.userData.tex = tex;
    hull.material.fog = false; scrMat.fog = false;
  }
  root.add(blimp);
  const blimpLights = new Float32Array(3 * 3);
  const blGeo = new THREE.BufferGeometry();
  blGeo.setAttribute("position", new THREE.BufferAttribute(blimpLights, 3));
  blGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array([1, 0.15, 0.2, 0.2, 1, 0.4, 1, 1, 1]), 3));
  blGeo.setAttribute("size", new THREE.BufferAttribute(new Float32Array([8, 8, 6]), 1));
  const blPts = new THREE.Points(blGeo, bloomMat); blPts.frustumCulled = false; root.add(blPts);

  // beacons on the megastructures (blinking red) share the bloom shader
  const bcGeo = new THREE.BufferGeometry();
  const bcPos = new Float32Array(beacons.length * 3), bcCol = new Float32Array(beacons.length * 3), bcSize = new Float32Array(beacons.length);
  beacons.forEach(([x, y, z, hex, s], i) => { bcPos.set([x, y, z], i * 3); c.set(hex); bcCol.set([c.r, c.g, c.b], i * 3); bcSize[i] = s * 3; });
  bcGeo.setAttribute("position", new THREE.BufferAttribute(bcPos, 3));
  bcGeo.setAttribute("color", new THREE.BufferAttribute(bcCol, 3));
  bcGeo.setAttribute("size", new THREE.BufferAttribute(bcSize, 1));
  const bcMat = bloomMat.clone(); bcMat.uniforms = { uScale: bloomMat.uniforms.uScale, uIntensity: { value: 1 } };
  const bcPts = new THREE.Points(bcGeo, bcMat); bcPts.frustumCulled = false; root.add(bcPts);

  function update(time, dt) {
    const t = time * 0.001, nightK = night();
    // bloom scales with screen size (bigger glow in the headset's wide view)
    bloomMat.uniforms.uScale.value = renderer.getSize(v).y * 1.5;
    bloomMat.uniforms.uIntensity.value = 0.9 * nightK + 0.1;
    carLightMat.uniforms.uIntensity.value = 0.35 * nightK + 0.05;
    coneMat.opacity = nightK;
    searchMat.opacity = nightK;
    for (const s of search) { const p = t * 0.25 + s.userData.phase; s.rotation.set(0.55 + Math.sin(p * 1.3) * 0.25, p, 0); }
    // cars
    for (let i = 0; i < CARS; i++) {
      const cs = carState[i], L = cs.lane;
      A.fromArray(L.a); Bv.fromArray(L.b);
      const len = A.distanceTo(Bv);
      cs.t = (cs.t + dt * L.speed / len) % 1;
      v.lerpVectors(A, Bv, cs.t); v.y += Math.sin(t * 0.8 + cs.wob) * 0.6;
      dir.subVectors(Bv, A).normalize();
      q.setFromRotationMatrix(m4.lookAt(dir, new THREE.Vector3(0, 0, 0), up));
      m4.compose(v, q, sc); cars.setMatrixAt(i, m4);
      // head light in front (+dir), tail behind
      lightPos.set([v.x + dir.x * 2.3, v.y + 0.05, v.z + dir.z * 2.3], i * 6);
      lightPos.set([v.x - dir.x * 2.3, v.y + 0.05, v.z - dir.z * 2.3], i * 6 + 3);
    }
    cars.instanceMatrix.needsUpdate = true;
    // upgrade bits
    nightUniform.value = nightK; timeUniform.value = t;
    steamMat.uniforms.uScale.value = bloomMat.uniforms.uScale.value;
    bcMat.uniforms.uIntensity.value = (0.5 + 0.5 * nightK) * (Math.sin(t * 2.4) > 0.2 ? 1 : 0.15);
    megaMat.color.setScalar(0.35 + 0.65 * nightK);
    { const a = t * 0.018; blimp.position.set(Math.cos(a) * 120, 92 + Math.sin(t * 0.3) * 2, -60 + Math.sin(a) * 120);
      blimp.rotation.set(0, -a, 0); blimp.userData.tex.offset.x = (t * 0.04) % 1;
      const fwd = new THREE.Vector3(Math.sin(-a), 0, Math.cos(-a));
      blimpLights.set([blimp.position.x - fwd.x * 27, blimp.position.y + 3, blimp.position.z - fwd.z * 27], 0);
      blimpLights.set([blimp.position.x + fwd.x * 26, blimp.position.y, blimp.position.z + fwd.z * 26], 3);
      blimpLights.set([blimp.position.x, blimp.position.y - 7.2, blimp.position.z], 6);
      blGeo.attributes.position.needsUpdate = true; }
    lightGeo.attributes.position.needsUpdate = true;
  }
  return { update, bloom, cones, cars, blimp, ads };
}
