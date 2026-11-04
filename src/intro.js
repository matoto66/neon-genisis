// NEON GENESIS — story intro: holographic slides (~45 seconds).
//
// You stand in a dark holographic space. Six beats tell the backstory, each
// with a floating panel and a glowing hologram above it. Nothing moves the
// player, so it stays comfortable in VR.
//
// Controls: trigger / Space / click = next beat, hold trigger or Escape = skip.

import * as THREE from "three";
import { buildCharacter } from "./character.js";

const BEATS = [
  { kicker: "NEO KASUMI · 2087", title: "A CITY THAT NEVER GOES DARK", holo: "city",
    text: "Forty million people stacked into towers of glass and neon. Rich districts float above the clouds. Everyone else lives below them." },
  { kicker: "BEFORE", title: "GENESIS", holo: "orb",
    text: "For twenty years the city's power grid was run by GENESIS, an AI that shared the light fairly. Even the poorest district, the Sump, never went dark." },
  { kicker: "NINE YEARS AGO", title: "THE QUIET", holo: "shatter",
    text: "One night Tenkai Dynamics shut GENESIS down. They called it a malfunction. The city went silent for an hour. People still call it “the Quiet.”" },
  { kicker: "NOW", title: "TENKAI OWNS THE GRID", holo: "spire",
    text: "Tenkai sells power by the hour from their Spire. The rich glow. The Sump flickers, rots, and survives on scrap and favours." },
  { kicker: "YOU", title: "THEY CALL YOU STATIC", holo: "you",
    text: "A nobody from the Sump with $500, a cheap arm implant that won't stop buzzing, and no memory of last night." },
  { kicker: "TONIGHT", title: "SOMETHING WOKE UP", holo: "core",
    text: "Mika the mechanic found a piece of GENESIS on a scrap barge. When you walked into her shop, it flickered. Find out why — before Tenkai does." }
];
const BEAT_SECONDS = 7.2;

export function createIntro({ scene, camera, renderer, getLook }) {
  const root = new THREE.Group();
  root.name = "STORY_INTRO";
  root.visible = false;
  scene.add(root);

  // ── holographic space: floor rings, grid and drifting particles ─────────
  const holo = (color, opacity = 0.6) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const space = new THREE.Group();
  root.add(space);
  for (let i = 1; i <= 6; i++) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(i * 1.6, i * 1.6 + 0.02, 96), holo(i % 2 ? 0x38f0e6 : 0xb24cff, 0.35 - i * 0.04));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01; space.add(ring);
  }
  const grid = new THREE.GridHelper(40, 40, 0x1a4a5a, 0x0d2230);
  grid.material.transparent = true; grid.material.opacity = 0.5; space.add(grid);
  const P = 400, pPos = new Float32Array(P * 3);
  for (let i = 0; i < P; i++) { const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 14; pPos[i * 3] = Math.cos(a) * r; pPos[i * 3 + 1] = Math.random() * 8; pPos[i * 3 + 2] = Math.sin(a) * r; }
  const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ color: 0x7ffcff, size: 0.04, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
  space.add(particles);

  // ── the story panel ─────────────────────────────────────────────────────
  const W = 1600, H = 820;
  const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const panelMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.82), panelMat);
  panel.renderOrder = 50;
  const stage = new THREE.Group();          // panel + hologram, placed in front of the player
  stage.add(panel);
  root.add(stage);
  const wrap = (text, maxW) => {
    const words = text.split(" "), lines = []; let line = "";
    for (const w of words) { const t = line ? line + " " + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
    if (line) lines.push(line); return lines;
  };
  function drawPanel(i, reveal) {
    const b = BEATS[i];
    ctx.clearRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "rgba(6,12,28,0.92)"); g.addColorStop(1, "rgba(10,6,26,0.92)");
    ctx.beginPath(); ctx.roundRect(8, 8, W - 16, H - 16, 36); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = "rgba(95,245,232,0.6)"; ctx.stroke();
    ctx.fillStyle = "#38f0e6"; ctx.fillRect(80, 186, 160, 5);
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#5ff5e8"; ctx.font = "800 34px Inter, Arial, sans-serif"; ctx.fillText(b.kicker, 80, 84);
    ctx.fillStyle = "#ffffff"; ctx.font = "900 70px Inter, Arial, sans-serif"; ctx.fillText(b.title, 80, 160);
    ctx.font = "500 50px Inter, Arial, sans-serif"; ctx.fillStyle = "#e3ecff";
    // typewriter reveal of the body text
    const shown = b.text.slice(0, Math.floor(b.text.length * reveal));
    wrap(shown, W - 160).slice(0, 6).forEach((l, k) => ctx.fillText(l, 80, 280 + k * 72));
    // progress dots + hint
    BEATS.forEach((_, k) => { ctx.beginPath(); ctx.arc(80 + k * 34, H - 70, k === i ? 10 : 7, 0, Math.PI * 2); ctx.fillStyle = k <= i ? "#ffcf4a" : "rgba(255,255,255,0.25)"; ctx.fill(); });
    ctx.textAlign = "right"; ctx.fillStyle = "#7f93ab"; ctx.font = "600 28px Inter, Arial, sans-serif";
    ctx.fillText(renderer.xr.isPresenting ? "TRIGGER: NEXT   ·   HOLD TRIGGER: SKIP" : "SPACE / CLICK: NEXT   ·   ESC: SKIP", W - 80, H - 60);
    ctx.textAlign = "left";
    tex.needsUpdate = true;
  }

  // ── holograms (one per beat), floating above the panel ─────────────────
  const holos = {};
  const holoGroup = new THREE.Group(); holoGroup.position.set(0, 0.72, -0.35); holoGroup.scale.setScalar(0.75); stage.add(holoGroup);
  { // city skyline
    const g = new THREE.Group();
    const m = holo(0x38f0e6, 0.5), mw = new THREE.MeshBasicMaterial({ color: 0x38f0e6, wireframe: true, transparent: true, opacity: 0.35 });
    for (let i = 0; i < 22; i++) {
      const h = 0.15 + Math.random() * 0.75, w = 0.06 + Math.random() * 0.08;
      const x = (Math.random() - 0.5) * 1.6, z = (Math.random() - 0.5) * 0.5;
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), i % 3 ? mw : m); box.position.set(x, h / 2 - 0.35, z); g.add(box);
    }
    holos.city = g;
  }
  { const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), new THREE.MeshBasicMaterial({ color: 0x38f0e6, wireframe: true, transparent: true, opacity: 0.8 })));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 14), holo(0x9ffcff, 0.8)));
    const r1 = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.006, 6, 64), holo(0xb24cff, 0.8)); r1.rotation.x = 1.2; g.add(r1);
    const r2 = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.005, 6, 64), holo(0x38f0e6, 0.6)); r2.rotation.x = 1.9; g.add(r2);
    g.userData.rings = [r1, r2];
    holos.orb = g; }
  { const g = new THREE.Group(); // shattered orb: fragments drifting apart, flickering red
    const shardMat = new THREE.MeshBasicMaterial({ color: 0xff3a4a, wireframe: true, transparent: true, opacity: 0.8 });
    g.userData.frags = [];
    for (let i = 0; i < 14; i++) {
      const f = new THREE.Mesh(new THREE.TetrahedronGeometry(0.05 + Math.random() * 0.07), shardMat);
      const d = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      f.userData.dir = d; g.add(f); g.userData.frags.push(f);
    }
    g.userData.mat = shardMat;
    holos.shatter = g; }
  { const g = new THREE.Group(); // the Tenkai Spire
    const m = new THREE.MeshBasicMaterial({ color: 0xb24cff, wireframe: true, transparent: true, opacity: 0.6 });
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.16, 0.95, 6, 6), m); t.position.y = 0.05; g.add(t);
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.25, 6), holo(0xff4fa3, 0.8)); top.position.y = 0.65; g.add(top);
    for (let i = 0; i < 5; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2 + i * 0.12, 0.004, 4, 48), holo(0xff4fa3, 0.4)); ring.rotation.x = Math.PI / 2; ring.position.y = -0.4; ring.userData.i = i; g.add(ring); }
    holos.spire = g; }
  { const g = new THREE.Group(); g.userData.dynamic = true; holos.you = g; }       // filled with the player's character
  { const g = new THREE.Group();
    const cage = new THREE.MeshBasicMaterial({ color: 0x38f0e6, wireframe: true, transparent: true, opacity: 0.55 });
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.6, 8, 3, true), cage));
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 14), holo(0x9ffcff, 0.9)); g.add(core);
    for (let i = 0; i < 2; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.22 + i * 0.05, 0.006, 6, 48), holo(i ? 0xb24cff : 0x38f0e6, 0.8)); r.rotation.x = 1 + i; g.add(r); }
    g.userData.core = core;
    holos.core = g; }
  for (const g of Object.values(holos)) { g.visible = false; holoGroup.add(g); }
  const youMat = new THREE.MeshBasicMaterial({ color: 0x5ff5ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });

  // ── state & control ─────────────────────────────────────────────────────
  let active = false, beat = 0, beatTime = 0, fade = 0, onDone = null, holdStart = 0, prevBackground = null, hidden = [];
  const fadeMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 1, side: THREE.BackSide, depthTest: false, depthWrite: false, fog: false });
  const fadeSphere = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), fadeMat);
  fadeSphere.renderOrder = 9999; fadeSphere.visible = false;
  camera.add(fadeSphere);
  let ending = false;

  function setBeat(i) {
    beat = i; beatTime = 0;
    for (const [k, g] of Object.entries(holos)) g.visible = k === BEATS[i].holo;
    const g = holos[BEATS[i].holo];
    g.scale.setScalar(0.01);
    if (g.userData.dynamic) {
      g.clear();
      const ch = buildCharacter({ ...getLook(), umbrella: false });
      ch.traverse(o => { if (o.isMesh) o.material = youMat; });
      ch.position.y = -0.55; ch.scale.multiplyScalar(0.55);
      g.add(ch);
    }
    drawPanel(i, 0);
  }

  /** Start the intro. Places the stage in front of where the player looks. */
  function play(done, worldsToHide) {
    active = true; ending = false; onDone = done;
    hidden = worldsToHide.filter(w => w.visible);
    hidden.forEach(w => { w.visible = false; });
    prevBackground = { bg: scene.background, fog: scene.fog };
    scene.background = new THREE.Color(0x02030a);
    scene.fog = null;
    const head = new THREE.Vector3(), dir = new THREE.Vector3();
    camera.getWorldPosition(head); camera.getWorldDirection(dir); dir.y = 0;
    if (dir.lengthSq() < 1e-4) dir.set(0, 0, -1); dir.normalize();
    const floorY = camera.parent.getWorldPosition(new THREE.Vector3()).y;
    root.position.set(head.x, floorY, head.z);
    root.visible = true;
    const eye = THREE.MathUtils.clamp(head.y - floorY, 1.0, 2.0);
    const dist = renderer.xr.isPresenting ? 1.9 : 1.45;
    stage.position.set(dir.x * dist, eye - 0.25, dir.z * dist);
    root.updateMatrixWorld(true);
    // lookAt takes WORLD coordinates: face the player's head.
    stage.lookAt(head.x, floorY + eye - 0.25, head.z);
    fadeMat.opacity = 1; fadeSphere.visible = true; fade = 1;
    setBeat(0);
  }
  function next() { if (!active || ending) return; if (beat < BEATS.length - 1) setBeat(beat + 1); else finish(); }
  function finish() {
    if (ending) return;
    ending = true;
  }
  function cleanup() {
    active = false; root.visible = false;
    hidden.forEach(w => { w.visible = true; });
    scene.background = prevBackground.bg; scene.fog = prevBackground.fog;
    const done = onDone; onDone = null;
    done?.();
    // fade back in from black over the city
    fade = 1; fadeMat.opacity = 1; fadeSphere.visible = true; fadeOutAfter = true;
  }
  let fadeOutAfter = false;

  let lastNow = 0;
  function update(time) {
    // Real elapsed time (not the frame-clamped delta) so fades and beats keep
    // pace even if the frame rate dips.
    const nowMs = performance.now();
    const dt = lastNow ? Math.min(0.25, (nowMs - lastNow) / 1000) : 0.016;
    lastNow = nowMs;
    if (fadeOutAfter) { fade = Math.max(0, fade - dt * 1.2); fadeMat.opacity = fade; if (fade <= 0) { fadeOutAfter = false; fadeSphere.visible = false; } }
    if (!active) return;
    const t = time * 0.001;
    if (ending) {
      fade = Math.min(1, fade + dt * 1.6); fadeMat.opacity = fade;
      if (fade >= 1) cleanup();
      return;
    }
    if (holdStart && performance.now() - holdStart > 900) { holdStart = 0; finish(); return; }
    if (fade > 0) { fade = Math.max(0, fade - dt * 1.5); fadeMat.opacity = fade; fadeSphere.visible = fade > 0; }
    beatTime += dt;
    const reveal = Math.min(1, beatTime / 2.4);
    if (reveal < 1 || Math.floor(beatTime * 10) % 5 === 0) drawPanel(beat, reveal);
    if (beatTime > BEAT_SECONDS) next();
    // hologram animation
    const g = holos[BEATS[beat].holo];
    const s = Math.min(1, beatTime * 2.2); g.scale.setScalar(1 - Math.pow(1 - s, 3));
    g.rotation.y = t * 0.35;
    g.position.y = Math.sin(t * 1.4) * 0.03;
    if (g.userData.rings) { g.userData.rings[0].rotation.z = t; g.userData.rings[1].rotation.z = -t * 0.7; }
    if (g.userData.frags) {
      const k = Math.min(1, beatTime / 3);
      g.userData.frags.forEach((f, i) => { f.position.copy(f.userData.dir).multiplyScalar(0.05 + k * 0.45); f.rotation.set(t * (1 + i * 0.1), t, 0); });
      g.userData.mat.opacity = Math.random() < 0.08 ? 0.15 : 0.8 * (1 - k * 0.5);
    }
    if (BEATS[beat].holo === "spire") g.children.forEach(c => { if (c.userData.i !== undefined) { const p = (t * 0.4 + c.userData.i / 5) % 1; c.scale.setScalar(0.4 + p * 1.4); c.material.opacity = 0.5 * (1 - p); } });
    if (g.userData.core) g.userData.core.scale.setScalar(1 + Math.sin(t * 6) * 0.08 + (beatTime < 1.2 ? (1.2 - beatTime) * 0.8 : 0));
    particles.rotation.y = t * 0.02;
    panelMat.opacity = Math.min(1, beatTime * 3);
  }

  // input helpers called from main.js
  // Tap = next beat; holding the trigger for ~1 second skips the intro.
  function triggerDown() { if (active) holdStart = performance.now(); }
  function triggerUp() { if (active && holdStart) next(); holdStart = 0; }

  return { play, next, skip: finish, update, triggerDown, triggerUp, get active() { return active; } };
}
