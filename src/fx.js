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
        gl_PointSize = min(size * uScale / -mv.z, 220.0);
      }`,
    fragmentShader: `
      varying vec3 vColor; uniform float uIntensity;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = exp(-d * d * 4.0) * (1.0 - d) + exp(-d * d * 40.0) * 0.6;   // wide soft glow + bright core          // soft gaussian falloff
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
    for (let i = 0; i < p.count; i++) { const k = (p.getY(i) - 0.05) / (y - 0.1); cArr.set([cl.r, cl.g, cl.b, 0.3 * k * k], i * 4); }
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
  B(1.52, 0.3, 1.6, 0, 0.47, -0.2, 0x5fb8d8);                                               // windows
  B(2.4, 0.12, 1.2, 0, -0.1, 1.2, 0x1c2230); B(2.4, 0.12, 1.2, 0, -0.1, -1.4, 0x1c2230);   // thrust pods
  B(1.6, 0.08, 0.06, 0, 0.05, -2.12, 0xfff0d0); B(1.6, 0.1, 0.06, 0, 0.05, 2.12, 0xff2a3a); // head/tail strips
  B(1.9, 0.04, 4.0, 0, -0.3, 0, 0x38f0e6);                                                  // underglow
  const carMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const cars = new THREE.InstancedMesh(mergeGeometries(carParts), carMat, CARS);
  cars.instanceMatrix.setUsage(THREE.DynamicDrawUsage); cars.frustumCulled = false; cars.name = "FLYING_CARS";
  root.add(cars);
  const carState = Array.from({ length: CARS }, (_, i) => ({ lane: LANES[i % LANES.length], t: Math.random(), wob: Math.random() * 10, under: [0x38f0e6, 0xff4fa3, 0xb24cff, 0xffcf4a][i % 4] }));
  // light glows that follow the cars (2 per car: head + tail)
  const lightPos = new Float32Array(CARS * 2 * 3), lightCol = new Float32Array(CARS * 2 * 3), lightSize = new Float32Array(CARS * 2);
  for (let i = 0; i < CARS; i++) { lightCol.set([1, 0.95, 0.85], i * 6); lightCol.set([1, 0.15, 0.2], i * 6 + 3); lightSize[i * 2] = 7; lightSize[i * 2 + 1] = 5; }
  const lightGeo = new THREE.BufferGeometry();
  lightGeo.setAttribute("position", new THREE.BufferAttribute(lightPos, 3));
  lightGeo.setAttribute("color", new THREE.BufferAttribute(lightCol, 3));
  lightGeo.setAttribute("size", new THREE.BufferAttribute(lightSize, 1));
  const carLights = new THREE.Points(lightGeo, bloomMat);
  carLights.frustumCulled = false; root.add(carLights);
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

  function update(time, dt) {
    const t = time * 0.001, nightK = night();
    // bloom scales with screen size (bigger glow in the headset's wide view)
    bloomMat.uniforms.uScale.value = renderer.getSize(v).y * 1.5;
    bloomMat.uniforms.uIntensity.value = 1.25 * nightK + 0.15;
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
    lightGeo.attributes.position.needsUpdate = true;
  }
  return { update, bloom, cones, cars };
}
