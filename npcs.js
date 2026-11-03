// NEON GENESIS — NPCs.
//
// Every character is built from ~6 meshes (body, glow details, two arms, two
// legs split at the knee) using merged, vertex-coloured geometry and two
// shared materials, so a crowd stays cheap on Quest. NPCs beyond ~40 m are
// hidden and not animated.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { skinify } from "./optimize.js";

const npcMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.66, metalness: 0.18 });
const npcGlowMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
const hologramMaterial = new THREE.MeshBasicMaterial({
  color: 0x5ff5ff, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false
});
const hitMaterial = new THREE.MeshBasicMaterial({ visible: false });

const _c = new THREE.Color();
function tinted(geo, hex) {
  _c.set(hex);
  const n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = _c.r; a[i * 3 + 1] = _c.g; a[i * 3 + 2] = _c.b; }
  geo.setAttribute("color", new THREE.BufferAttribute(a, 3));
  return geo;
}
// Collects coloured parts and merges them into one mesh.
class Parts {
  constructor() { this.list = []; }
  add(geo, hex, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
    if (sx !== 1 || sy !== 1 || sz !== 1) geo.scale(sx, sy, sz);
    if (rx) geo.rotateX(rx); if (rz) geo.rotateZ(rz); if (ry) geo.rotateY(ry);
    geo.translate(x, y, z);
    // strip uv/normal differences: keep position + normal + color only
    geo.deleteAttribute("uv");
    this.list.push(tinted(geo.index ? geo.toNonIndexed() : geo, hex));
    return this;
  }
  sphere(r, hex, x, y, z, sx = 1, sy = 1, sz = 1, seg = 12) { return this.add(new THREE.SphereGeometry(r, seg, Math.max(6, seg * 0.7 | 0)), hex, x, y, z, sx, sy, sz); }
  box(w, h, d, hex, x, y, z, rx = 0, ry = 0, rz = 0) { return this.add(new THREE.BoxGeometry(w, h, d), hex, x, y, z, 1, 1, 1, rx, ry, rz); }
  capsule(r, len, hex, x, y, z, rx = 0, rz = 0, sz = 1) { return this.add(new THREE.CapsuleGeometry(r, len, 3, 10), hex, x, y, z, 1, 1, sz, rx, 0, rz); }
  cyl(rt, rb, h, hex, x, y, z, seg = 12, sz = 1, rx = 0, rz = 0) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), hex, x, y, z, 1, 1, sz, rx, 0, rz); }
  mesh(material) {
    if (!this.list.length) return null;
    const g = mergeGeometries(this.list, false);
    this.list.forEach(p => p.dispose());
    g.computeBoundingSphere();
    return new THREE.Mesh(g, material);
  }
}

// ─── appearance generation ──────────────────────────────────────────────────
const SKIN = [0xf1c7a5, 0xe0ac86, 0xc68b62, 0xa86d47, 0x7c4a2d, 0x5a3420];
const HAIR = [0x111111, 0x2b1d14, 0x5a3a22, 0xc9c1b4, 0xd8d2c8, 0x38f0e6, 0xff4fa3, 0xb24cff, 0xffcf4a, 0x6aff9e];
const OUTFIT = [0x232a38, 0x35304a, 0x4a2430, 0x1f3a3a, 0x5a4a3a, 0x2c2c2c, 0x6a6f7a, 0x2a4a6a, 0x7a2a2a, 0x3d5a2a, 0xc0c4cc];
const GLOW = [0x38f0e6, 0xff4fa3, 0xb24cff, 0xffcf4a, 0x6aff9e, 0xff5a3c];

export function randomAppearance(rand) {
  const pick = arr => arr[Math.floor(rand() * arr.length)];
  const build = rand() < 0.5 ? "male" : "female";
  const hairStyles = build === "female" ? ["long", "bob", "bun", "ponytail", "short", "mohawk"] : ["short", "short", "buzz", "mohawk", "bald", "long", "spiky"];
  return {
    build, scale: 0.93 + rand() * 0.14,
    skin: pick(SKIN), hair: pick(hairStyles), hairColor: rand() < 0.25 ? pick(HAIR.slice(5)) : pick(HAIR.slice(0, 5)),
    top: pick(["jacket", "jacket", "hoodie", "coat", "tee", "vest"]), topColor: pick(OUTFIT), accent: pick(OUTFIT),
    pants: pick([0x1d2230, 0x262626, 0x2e3a4a, 0x3a2f28, 0x1f1f2a, 0x4a4a52]),
    shoes: pick([0x101010, 0xd8d8d8, 0x3a2a20, 0xff4fa3, 0x222a3a]),
    glow: pick(GLOW),
    hat: rand() < 0.22 ? pick(["cap", "beanie", "hood"]) : null,
    visor: rand() < 0.2, mask: rand() < 0.16, implants: rand() < 0.35, cyberArm: rand() < 0.15,
    backpack: rand() < 0.2, umbrella: rand() < 0.18, glasses: rand() < 0.12
  };
}

// Build a character. Returns a Group facing +Z with animatable pivots.
export function buildCharacter(a) {
  const root = new THREE.Group();
  const female = a.build === "female", kid = a.build === "kid", old = a.build === "old";
  const W = female ? 0.9 : 1;                 // width factor
  const sh = female ? 0.17 : 0.2;             // shoulder half-width
  const hipY = 0.93, chestY = 1.3, headY = 1.64;
  const body = new Parts(), glow = new Parts();
  const coatLong = a.top === "coat" || a.top === "labcoat";

  // pelvis & torso
  body.sphere(0.15, a.pants, 0, hipY + 0.02, 0, W * 1.05, 0.75, 0.8);
  body.cyl(sh + 0.02, female ? 0.13 : 0.15, 0.5, a.topColor, 0, 1.2, 0, 12, 0.68);
  body.sphere(sh + 0.02, a.topColor, 0, 1.42, 0, 1, 0.45, 0.68);
  if (female) body.sphere(0.075, a.topColor, 0, 1.3, 0.07, 2.0, 0.85, 0.9);
  // clothing styles
  if (a.top === "jacket" || a.top === "coat" || a.top === "labcoat") {
    body.box(0.022, 0.42, 0.02, a.accent, 0, 1.2, 0.115);                 // zipper / placket
    body.box(0.3 * W, 0.06, 0.2, a.accent, 0, 1.47, 0, 0.1);              // collar
  }
  if (coatLong) body.cyl(0.2, 0.27, 0.62, a.topColor, 0, 0.72, -0.01, 12, 0.72);
  if (a.top === "hoodie") body.sphere(0.13, a.topColor, 0, 1.56, -0.08, 1.15, 0.9, 0.9);
  if (a.top === "vest") { body.box(0.34 * W, 0.4, 0.2, a.accent, 0, 1.22, 0.01); }
  if (a.top === "apron") body.box(0.3, 0.6, 0.02, 0xe8e2d6, 0, 1.05, 0.12);
  if (a.top === "jumpsuit") body.add(new THREE.TorusGeometry(0.16, 0.035, 6, 14), a.topColor, 0, 0.98, 0, 1.0, 0.6, 0.75, Math.PI / 2);
  if (a.top === "tee") body.box(0.3 * W, 0.05, 0.19, a.accent, 0, 1.2, 0.012);
  // neck & head
  body.cyl(0.05, 0.055, 0.12, a.skin, 0, 1.52, 0, 8);
  body.sphere(0.115, a.skin, 0, headY, 0, 0.92, 1.1, 1.0);
  body.sphere(0.075, a.skin, 0, headY - 0.065, 0.025, 1.0, 0.75, 1.0);        // jaw
  for (const s of [-1, 1]) {
    body.sphere(0.014, 0x15171c, s * 0.042, headY + 0.015, 0.098, 1, 1, 0.6, 6);
    body.box(0.04, 0.008, 0.01, a.hairColor, s * 0.042, headY + 0.05, 0.1);   // brows
  }
  if (a.glasses) body.box(0.17, 0.035, 0.02, 0x0c0f16, 0, headY + 0.015, 0.11);
  if (old) { body.box(0.09, 0.03, 0.02, 0xd8d2c8, 0, headY - 0.04, 0.108); } // moustache
  // hair
  const hc = a.hairColor;
  switch (a.hair) {
    case "short": body.sphere(0.122, hc, 0, headY + 0.03, -0.012, 0.95, 0.85, 1.0); break;
    case "buzz": body.sphere(0.118, hc, 0, headY + 0.02, -0.006, 0.93, 0.9, 0.98); break;
    case "spiky": body.sphere(0.12, hc, 0, headY + 0.035, -0.01, 0.95, 0.85, 1.0);
      for (let i = 0; i < 6; i++) body.add(new THREE.ConeGeometry(0.03, 0.09, 5), hc, Math.sin(i) * 0.06, headY + 0.13, Math.cos(i * 2) * 0.05, 1, 1, 1, Math.cos(i) * 0.4, 0, Math.sin(i) * 0.4); break;
    case "long": body.sphere(0.125, hc, 0, headY + 0.03, -0.015, 0.97, 0.88, 1.0); body.box(0.22, 0.32, 0.08, hc, 0, headY - 0.13, -0.085); break;
    case "bob": body.sphere(0.13, hc, 0, headY + 0.01, -0.01, 1.0, 0.95, 1.02); break;
    case "bun": body.sphere(0.122, hc, 0, headY + 0.03, -0.012, 0.95, 0.85, 1.0); body.sphere(0.055, hc, 0, headY + 0.1, -0.1); break;
    case "ponytail": body.sphere(0.122, hc, 0, headY + 0.03, -0.012, 0.95, 0.85, 1.0); body.capsule(0.035, 0.2, hc, 0, headY - 0.06, -0.13, 0.25); break;
    case "mohawk": body.sphere(0.116, 0x2a2a2a, 0, headY + 0.02, -0.006, 0.93, 0.9, 0.98);
      glow.box(0.03, 0.08, 0.22, hc, 0, headY + 0.13, -0.01); break;
    case "white": body.sphere(0.12, 0xd8d2c8, 0, headY + 0.025, -0.02, 0.97, 0.8, 1.0); break;
    default: break; // bald
  }
  if (a.headband) body.cyl(0.123, 0.123, 0.03, a.headband, 0, headY + 0.05, 0, 14);
  if (a.goggles) { body.cyl(0.124, 0.124, 0.025, 0x2a2a2a, 0, headY + 0.1, 0, 14);
    for (const s of [-1, 1]) { body.cyl(0.035, 0.035, 0.03, 0x3a3a3a, s * 0.045, headY + 0.1, 0.105, 10, 1, Math.PI / 2); glow.cyl(0.026, 0.026, 0.005, a.glow, s * 0.045, headY + 0.1, 0.122, 10, 1, Math.PI / 2); } }
  switch (a.hat) {
    case "cap": body.sphere(0.128, a.accent, 0, headY + 0.05, -0.005, 0.98, 0.7, 1.0); body.box(0.15, 0.015, 0.12, a.accent, 0, headY + 0.055, 0.12); break;
    case "beanie": body.sphere(0.13, a.accent, 0, headY + 0.06, -0.005, 0.97, 0.9, 1.0); break;
    case "hood": body.sphere(0.145, a.topColor, 0, headY + 0.02, -0.02, 1.0, 1.05, 1.05); break;
    default: break;
  }
  if (a.visor) glow.box(0.2, 0.035, 0.03, a.glow, 0, headY + 0.015, 0.105);
  if (a.mask) { body.box(0.15, 0.075, 0.05, 0x15181f, 0, headY - 0.06, 0.085); glow.box(0.12, 0.008, 0.005, a.glow, 0, headY - 0.05, 0.112); }
  if (a.implants) { glow.box(0.004, 0.06, 0.03, a.glow, 0.108, headY + 0.01, 0.02); glow.box(0.004, 0.006, 0.05, a.glow, 0.108, headY + 0.045, 0.0); }
  if (a.backpack) { body.box(0.26, 0.34, 0.14, a.accent, 0, 1.22, -0.17); glow.box(0.2, 0.012, 0.005, a.glow, 0, 1.3, -0.243); }
  // glowing seam on the jacket (cyberpunk detail)
  glow.box(0.006, 0.3, 0.006, a.glow, sh * 0.6, 1.25, 0.12);
  if (a.umbrella) {
    body.cyl(0.008, 0.008, 1.0, 0x2a2a2a, 0.22, 1.65, 0.12, 5);
    const canopy = new THREE.ConeGeometry(0.55, 0.28, 12, 1, true);
    body.add(canopy, 0x1b2230, 0.22, 2.25, 0.12);
    glow.add(new THREE.TorusGeometry(0.55, 0.008, 4, 24), a.glow, 0.22, 2.12, 0.12, 1, 1, 1, Math.PI / 2);
  }

  // torso pivot: holds the body and arms so breathing moves them together
  const torso = new THREE.Group();
  root.add(torso);
  const bodyMesh = body.mesh(npcMaterial); bodyMesh.name = "NPC_BODY";
  torso.add(bodyMesh);
  const glowMesh = glow.mesh(npcGlowMaterial); if (glowMesh) torso.add(glowMesh);

  // arms (pivot at shoulder). Right arm is raised if holding an umbrella.
  const arms = [];
  for (const s of [-1, 1]) {
    const p = new Parts();
    const cyber = a.cyberArm && s < 0;
    const sleeve = cyber ? 0x8a93a3 : a.topColor;
    p.sphere(0.06, sleeve, 0, -0.01, 0);
    p.capsule(0.052, 0.22, sleeve, 0, -0.15, 0);
    p.capsule(0.045, 0.2, cyber ? 0x6a7383 : (a.top === "tee" || a.top === "vest" || a.top === "jumpsuit" ? a.skin : sleeve), 0, -0.4, 0.02);
    p.sphere(0.045, cyber ? 0x5a6373 : a.skin, 0, -0.56, 0.025, 0.8, 1.1, 0.65);
    if (coatLong || a.top === "labcoat") p.cyl(0.058, 0.06, 0.04, a.accent, 0, -0.29, 0.015, 10);
    const arm = p.mesh(npcMaterial);
    const pivot = new THREE.Group();
    pivot.position.set(s * (sh + 0.035), 1.43, 0);
    pivot.add(arm);
    if (cyber) {
      const g = new Parts(); g.box(0.008, 0.3, 0.008, a.glow, 0, -0.38, 0.05); g.box(0.008, 0.008, 0.008, a.glow, 0, -0.2, 0.055);
      pivot.add(g.mesh(npcGlowMaterial));
    }
    torso.add(pivot);
    arms.push(pivot);
  }
  // Merge all parts into 2 skinned meshes; the pivots above become bones.
  root.name = "NPC";
  skinify(root, { metalness: 0.18, roughness: 0.66 });
  for (const [i, pivot] of arms.entries()) pivot.rotation.z = (i ? 1 : -1) * 0.06;
  if (a.umbrella) { arms[1].rotation.x = -1.1; arms[1].rotation.z = 0.25; }

  // legs: thigh (pivot at hip) + shin with shoe (pivot at knee)
  const hips = [], knees = [];
  for (const s of [-1, 1]) {
    const thigh = new Parts();
    thigh.capsule(0.07, 0.33, a.pants, 0, -0.22, 0);
    const hip = new THREE.Group();
    hip.position.set(s * 0.085 * W, hipY, 0);
    hip.add(thigh.mesh(npcMaterial));
    const shin = new Parts();
    shin.capsule(0.056, 0.32, a.pants, 0, -0.2, 0);
    shin.sphere(0.06, a.shoes, 0, -0.43, 0.05, 0.9, 0.6, 1.6);
    const knee = new THREE.Group();
    knee.position.y = -0.44;
    knee.add(shin.mesh(npcMaterial));
    hip.add(knee);
    root.add(hip);
    hips.push(hip); knees.push(knee);
  }

  const s = (a.scale || 1) * (kid ? 0.72 : 1) * (old ? 0.96 : 1);
  root.scale.setScalar(s);
  root.userData.rig = { arms, hips, knees, body: torso, scale: s, hipY };
  return root;
}

// ─── text sprites for name tags, quest markers and speech ───────────────────
function textSprite(lines, { width = 512, height = 128, scale = 1, bg = "rgba(5,10,22,0.78)", border = "#38f0e6" } = {}) {
  const c = document.createElement("canvas"); c.width = width; c.height = height;
  const ctx = c.getContext("2d");
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(scale * width / height * 0.25, scale * 0.25, 1);
  sprite.userData.draw = (ls, opt = {}) => {
    ctx.clearRect(0, 0, width, height);
    if (bg) { ctx.fillStyle = bg; roundRect(ctx, 4, 4, width - 8, height - 8, 18); ctx.fill(); ctx.strokeStyle = opt.border || border; ctx.lineWidth = 4; ctx.stroke(); }
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const n = ls.length;
    ls.forEach((l, i) => {
      ctx.fillStyle = l.color || "#ffffff";
      ctx.font = `${l.weight || "bold"} ${l.size || 40}px Arial`;
      ctx.fillText(l.text, width / 2, height * (i + 0.5) / n + (n > 1 ? (i === 0 ? 4 : -4) : 0));
    });
    tex.needsUpdate = true;
  };
  sprite.userData.draw(lines);
  return sprite;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function wrapForBubble(text, max = 34) {
  const words = text.split(" "), lines = [];
  let line = "";
  for (const w of words) { if ((line + " " + w).trim().length > max) { lines.push(line.trim()); line = w; } else line += " " + w; }
  if (line.trim()) lines.push(line.trim());
  return lines.slice(0, 3);
}

// ─── the NPC system ─────────────────────────────────────────────────────────
export function createNPCSystem(parent, rand) {
  const group = new THREE.Group();
  group.name = "NPCS";
  parent.add(group);
  const npcs = [];
  const hitMeshes = [];
  const byId = {};
  const tmp = new THREE.Vector3();

  function addNPC(opts) {
    const appearance = opts.appearance || randomAppearance(rand);
    const model = buildCharacter(appearance);
    const holder = new THREE.Group();
    holder.add(model);
    holder.position.copy(opts.position);
    holder.rotation.y = opts.yaw || 0;
    group.add(holder);
    if (opts.hologram) model.traverse(o => { if (o.isMesh) o.material = hologramMaterial; });
    const npc = {
      id: opts.id || "npc" + npcs.length, name: opts.name || null, role: opts.role || "",
      holder, model, rig: model.userData.rig, mode: opts.mode || "idle",
      path: opts.path || null, pathIndex: 0, pathDir: 1, speed: opts.speed || (1.05 + rand() * 0.45),
      offset: opts.offset || 0, phase: rand() * 10, barks: opts.barks || null,
      faceTarget: opts.faceTarget || null, baseYaw: opts.yaw || 0, talkTo: opts.talkTo || null,
      interactive: opts.interactive !== false, named: !!opts.name, hologram: !!opts.hologram,
      paused: 0, bubbleTimer: 0, bubble: null, tag: null, marker: null, enabled: opts.enabled !== false, gesture: 0
    };
    holder.visible = npc.enabled;
    // invisible hit capsule for pointing/interaction
    if (npc.interactive) {
      const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.8, 8), hitMaterial);
      hit.position.y = 0.9 * npc.rig.scale;
      hit.userData.npc = npc;
      holder.add(hit);
      hitMeshes.push(hit);
      npc.hit = hit;
    }
    if (npc.named) {
      npc.tag = textSprite([{ text: npc.name.toUpperCase(), size: 44 }, { text: npc.role, size: 26, color: "#9fe9ff", weight: "normal" }], { scale: 0.9 });
      npc.tag.position.y = 2.15 * npc.rig.scale / model.scale.y * model.scale.y;
      npc.tag.position.y = 2.12;
      holder.add(npc.tag);
      npc.marker = textSprite([{ text: "!", size: 100, color: "#ffcf4a" }], { width: 128, height: 128, bg: null, scale: 1.1 });
      npc.marker.position.y = 2.55;
      npc.marker.visible = false;
      holder.add(npc.marker);
    }
    if (npc.mode === "sit") applySit(npc, opts.seatHeight || 0.46);
    if (npc.mode === "walk" && npc.path) {
      // start somewhere random along the path
      npc.pathIndex = Math.floor(rand() * (npc.path.length - 1));
      const a = npc.path[npc.pathIndex], b = npc.path[npc.pathIndex + 1];
      const t = rand();
      holder.position.set(a[0] + (b[0] - a[0]) * t, 0, a[1] + (b[1] - a[1]) * t);
    }
    npcs.push(npc);
    byId[npc.id] = npc;
    return npc;
  }

  function applySit(npc, seat) {
    const r = npc.rig;
    for (const h of r.hips) h.rotation.x = -1.5;
    for (const k of r.knees) k.rotation.x = 1.5;
    npc.model.position.y = seat - r.hipY * r.scale + 0.05;
    npc.model.position.z = -0.1;
  }

  function setMarker(id, kind) {
    const npc = byId[id];
    if (!npc?.marker) return;
    npc.marker.visible = !!kind;
    if (kind) npc.marker.userData.draw([{ text: kind, size: 100, color: kind === "?" ? "#5ff5e8" : "#ffcf4a" }]);
  }
  function setEnabled(id, on) {
    const npc = byId[id]; if (!npc) return;
    npc.enabled = on; npc.holder.visible = on;
  }
  function say(npc, text, seconds = 4) {
    if (!npc.bubble) {
      npc.bubble = textSprite([{ text: "" }], { width: 768, height: 192, scale: 1.0, border: "#ff6fe0" });
      npc.bubble.position.y = npc.named ? 2.75 : 2.25;
      npc.holder.add(npc.bubble);
    }
    const lines = wrapForBubble(text);
    npc.bubble.userData.draw(lines.map(t => ({ text: t, size: 40, weight: "bold" })));
    npc.bubble.visible = true;
    npc.bubbleTimer = seconds;
  }

  function animateWalk(npc, t, amount) {
    const r = npc.rig, ph = t * 7.2 + npc.phase, sw = Math.sin(ph) * 0.42 * amount;
    r.hips[0].rotation.x = sw; r.hips[1].rotation.x = -sw;
    r.knees[0].rotation.x = Math.max(0, Math.sin(ph + Math.PI)) * 0.7 * amount + 0.05;
    r.knees[1].rotation.x = Math.max(0, Math.sin(ph)) * 0.7 * amount + 0.05;
    if (!npc.model.userData.umbrella) { r.arms[0].rotation.x = -sw * 0.8; }
    if (r.arms[1].rotation.x > -1) r.arms[1].rotation.x = sw * 0.8;
    npc.model.position.y = Math.abs(Math.cos(ph)) * 0.03 * amount;
  }
  function animateIdle(npc, t) {
    const r = npc.rig, b = Math.sin(t * 1.6 + npc.phase);
    r.body.scale.set(1, 1 + b * 0.008, 1 + b * 0.012);
    r.arms[0].rotation.x = Math.sin(t * 0.9 + npc.phase) * 0.05;
    if (r.arms[1].rotation.x > -1) r.arms[1].rotation.x = Math.sin(t * 0.8 + npc.phase + 1) * 0.05;
    r.hips[0].rotation.x = r.hips[1].rotation.x = 0;
    r.knees[0].rotation.x = 0.03; r.knees[1].rotation.x = 0.03;
  }
  function animateTalk(npc, t) {
    animateIdle(npc, t);
    const g = Math.max(0, Math.sin(t * 1.7 + npc.phase));
    const arm = npc.rig.arms[Math.floor(t * 0.35 + npc.phase) % 2];
    arm.rotation.x = -0.4 - g * 0.6;
    arm.rotation.z = (arm === npc.rig.arms[0] ? -1 : 1) * (0.06 + g * 0.25);
  }

  const playerFlat = new THREE.Vector3();
  function update(time, dt, playerPos, activeTalkId) {
    const t = time * 0.001;
    playerFlat.set(playerPos.x, 0, playerPos.z);
    for (const npc of npcs) {
      if (!npc.enabled) continue;
      const h = npc.holder;
      const dx = h.position.x - playerPos.x, dz = h.position.z - playerPos.z;
      const dy = h.position.y - playerPos.y;
      const d2 = dx * dx + dz * dz + dy * dy * 4;
      const near = d2 < 36 * 36;
      h.visible = near;
      if (!near) continue;
      const dist = Math.sqrt(d2);
      if (npc.tag) npc.tag.visible = dist < 9 && !npc.hologram;
      if (npc.bubble && npc.bubble.visible) { npc.bubbleTimer -= dt; if (npc.bubbleTimer <= 0) npc.bubble.visible = false; }
      if (npc.hologram) { npc.model.traverse(o => { if (o.isMesh && o.material === hologramMaterial) o.visible = Math.random() > 0.02; }); hologramMaterial.opacity = 0.35 + Math.sin(t * 9) * 0.06; }

      if (npc.mode === "walk" && npc.path) {
        // pause if the player is right in front of them
        const blocked = dist < 1.0;
        if (!blocked) {
          const target = npc.path[npc.pathIndex + npc.pathDir] || npc.path[npc.pathIndex];
          tmp.set(target[0] + npc.offset - h.position.x, 0, target[1] - h.position.z);
          const len = tmp.length();
          if (len < 0.3) {
            npc.pathIndex += npc.pathDir;
            if (npc.pathIndex <= 0 || npc.pathIndex >= npc.path.length - 1) {
              const loop = npc.path[0][0] === npc.path[npc.path.length - 1][0] && npc.path[0][1] === npc.path[npc.path.length - 1][1];
              if (loop) npc.pathIndex = npc.pathDir > 0 ? 0 : npc.path.length - 1;
              else npc.pathDir *= -1;
            }
          } else {
            tmp.multiplyScalar(1 / len);
            h.position.x += tmp.x * npc.speed * dt;
            h.position.z += tmp.z * npc.speed * dt;
            const yaw = Math.atan2(tmp.x, tmp.z);
            h.rotation.y = dampAngle(h.rotation.y, yaw, 6, dt);
          }
        }
        if (dist < 30) animateWalk(npc, t, blocked ? 0 : 1);
        continue;
      }
      // static NPCs: named ones turn to face a nearby player
      let wantYaw = npc.baseYaw;
      if (npc.talkTo) { const o = byId[npc.talkTo]?.holder; if (o) wantYaw = Math.atan2(o.position.x - h.position.x, o.position.z - h.position.z); }
      if ((npc.named || npc.id === activeTalkId) && dist < 4.5 && npc.mode !== "sit") wantYaw = Math.atan2(-dx, -dz);
      h.rotation.y = dampAngle(h.rotation.y, wantYaw, 3, dt);
      if (dist > 26) continue;
      if (npc.mode === "talk" || npc.id === activeTalkId) animateTalk(npc, t);
      else if (npc.mode === "sit") { const b = Math.sin(t * 1.4 + npc.phase); npc.rig.body.scale.set(1, 1 + b * 0.008, 1); npc.rig.arms[0].rotation.x = -0.5 + b * 0.04; npc.rig.arms[1].rotation.x = -0.45; }
      else if (npc.mode === "lean") { animateIdle(npc, t); npc.model.rotation.x = -0.1; npc.rig.arms[0].rotation.x = 0.2; npc.rig.arms[1].rotation.x = -0.3; npc.rig.arms[1].rotation.z = 0.4; }
      else animateIdle(npc, t);
      // ambient chatter from crowd NPCs every so often
      if (npc.barks && !npc.named && dist < 6 && Math.random() < dt * 0.04) say(npc, npc.barks[Math.floor(Math.random() * npc.barks.length)], 3.5);
    }
  }

  return { group, npcs, hitMeshes, byId, addNPC, update, setMarker, setEnabled, say };
}

function dampAngle(a, b, lambda, dt) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * (1 - Math.exp(-lambda * dt));
}
