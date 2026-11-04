// NEON GENESIS — character builder shared by NPCs and the player creator.
//
// buildCharacter(appearance) returns a Group facing +Z with pivots for
// animation (head, arms with elbows, hips, knees). All parts are merged into
// two GPU-skinned meshes (solid + glow) per character, so even detailed
// characters cost only 2 draw calls.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { skinify } from "./optimize.js";

const _c = new THREE.Color();
function tinted(geo, hex) {
  _c.set(hex);
  const n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = _c.r; a[i * 3 + 1] = _c.g; a[i * 3 + 2] = _c.b; }
  geo.setAttribute("color", new THREE.BufferAttribute(a, 3));
  return geo;
}
// A bag of coloured parts attached to one pivot.
class Parts {
  constructor(pivot, glow = false) { this.pivot = pivot; this.glow = glow; this.list = []; }
  add(geo, hex, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
    if (sx !== 1 || sy !== 1 || sz !== 1) geo.scale(sx, sy, sz);
    if (rx) geo.rotateX(rx); if (rz) geo.rotateZ(rz); if (ry) geo.rotateY(ry);
    geo.translate(x, y, z);
    if (geo.attributes.uv) geo.deleteAttribute("uv");
    this.list.push(tinted(geo.index ? geo.toNonIndexed() : geo, hex));
    return this;
  }
  sphere(r, hex, x, y, z, sx = 1, sy = 1, sz = 1, seg = 14) { return this.add(new THREE.SphereGeometry(r, seg, Math.max(8, seg * 0.75 | 0)), hex, x, y, z, sx, sy, sz); }
  partial(r, hex, x, y, z, sx, sy, sz, phiS, phiL, thS, thL, rx = 0) { return this.add(new THREE.SphereGeometry(r, 18, 12, phiS, phiL, thS, thL), hex, x, y, z, sx, sy, sz, rx); }
  box(w, h, d, hex, x, y, z, rx = 0, ry = 0, rz = 0) { return this.add(new THREE.BoxGeometry(w, h, d), hex, x, y, z, 1, 1, 1, rx, ry, rz); }
  capsule(r, len, hex, x, y, z, rx = 0, rz = 0, sx = 1, sz = 1) { return this.add(new THREE.CapsuleGeometry(r, len, 4, 12), hex, x, y, z, sx, 1, sz, rx, 0, rz); }
  cyl(rt, rb, h, hex, x, y, z, seg = 14, sz = 1, rx = 0, rz = 0) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), hex, x, y, z, 1, 1, sz, rx, 0, rz); }
  torus(r, t, hex, x, y, z, rx = Math.PI / 2, sx = 1, sz = 1) { return this.add(new THREE.TorusGeometry(r, t, 6, 20), hex, x, y, z, sx, 1, sz, rx); }
  lathe(points, hex, sz = 1) { return this.add(new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), 20), hex, 0, 0, 0, 1, 1, sz); }
  tube(points, r, hex) { return this.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), 16, r, 5, false), hex); }
  // Turn the collected parts into a mesh under the pivot (skinify merges later).
  commit(solidMat, glowMat) {
    if (!this.list.length) return null;
    const g = mergeGeometries(this.list, false);
    this.list.forEach(p => p.dispose());
    const m = new THREE.Mesh(g, this.glow ? glowMat : solidMat);
    this.pivot.add(m);
    return m;
  }
}
const solidMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.15 });
const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });

// ─── palettes & options (also used by the character creator) ───────────────
export const SKIN_TONES = [0xf6d3b8, 0xeec1a0, 0xe0ac86, 0xc98e66, 0xa86d47, 0x8a5634, 0x6b3f24, 0x4f2c19];
export const HAIR_COLORS = [0x111111, 0x2b1d14, 0x5a3a22, 0x8c5a2b, 0xc9a26b, 0xd8d2c8, 0x8a1f2a, 0x38f0e6, 0xff4fa3, 0xb24cff, 0xffcf4a, 0x6aff9e, 0x4c7dff];
export const EYE_COLORS = [0x3a2414, 0x6b4a2a, 0x3c6e4a, 0x3a6fa8, 0x8a8f96, 0x38f0e6, 0xff4fa3, 0xffcf4a, 0xd8202a];
export const CLOTH_COLORS = [0x15171c, 0x2a2f3a, 0x6a6f7a, 0xd8dce6, 0x7a2a2a, 0xc0283c, 0xd8742a, 0xc49a25, 0x3d5a2a, 0x147f89, 0x2a4a8a, 0x5a3a8a, 0xb0307a, 0x5a4a3a];
export const GLOW_COLORS = [0x38f0e6, 0xff4fa3, 0xb24cff, 0xffcf4a, 0x6aff9e, 0xff3a4a, 0x4c9dff, 0xffffff];
export const OPTIONS = {
  build: ["male", "female"],
  faceShape: ["oval", "angular", "round", "narrow"],
  facialHair: ["none", "stubble", "moustache", "goatee", "beard"],
  hair: ["short", "buzz", "spiky", "undercut", "swept", "long", "bob", "bun", "ponytail", "twintails", "mohawk", "bald"],
  hat: ["none", "cap", "beanie", "hood", "bucket", "helmet"],
  top: ["jacket", "bomber", "hoodie", "coat", "tee", "vest", "jumpsuit"],
  pantsStyle: ["slim", "cargo", "baggy"],
  shoesStyle: ["sneakers", "boots", "high-tops"],
  cyberArm: ["none", "left", "right", "both"],
  faceTech: ["none", "visor", "mask", "glasses", "goggles", "face lines"],
  extra: ["none", "scarf", "backpack", "chain", "shoulder pad"]
};
// Glowing cyberware worn by citizens (any combination).
export const IMPLANTS = ["spine", "temple", "eye", "jaw", "chest", "tattoo", "sleeve lights"];

export function randomAppearance(rand) {
  const pick = arr => arr[Math.floor(rand() * arr.length)];
  const build = rand() < 0.5 ? "male" : "female";
  const fem = ["long", "bob", "bun", "ponytail", "twintails", "swept", "short", "mohawk", "undercut"];
  const masc = ["short", "short", "buzz", "spiky", "undercut", "swept", "mohawk", "bald", "long"];
  return {
    build, scale: 0.94 + rand() * 0.12,
    skin: pick(SKIN_TONES), faceShape: pick(OPTIONS.faceShape), eyes: rand() < 0.2 ? pick(EYE_COLORS.slice(5)) : pick(EYE_COLORS.slice(0, 5)),
    facialHair: build === "male" && rand() < 0.35 ? pick(OPTIONS.facialHair.slice(1)) : "none",
    hair: pick(build === "female" ? fem : masc), hairColor: rand() < 0.25 ? pick(HAIR_COLORS.slice(7)) : pick(HAIR_COLORS.slice(0, 7)), hairGlow: rand() < 0.12,
    hat: rand() < 0.2 ? pick(["cap", "beanie", "hood", "bucket"]) : "none", hatColor: pick(CLOTH_COLORS),
    top: pick(["jacket", "jacket", "bomber", "hoodie", "coat", "tee", "vest"]), topColor: pick(CLOTH_COLORS), accent: pick(CLOTH_COLORS), shirt: pick(CLOTH_COLORS),
    pantsStyle: pick(OPTIONS.pantsStyle), pants: pick([0x1d2230, 0x262626, 0x2e3a4a, 0x3a2f28, 0x1f1f2a, 0x4a4a52, 0x3d4a2a]),
    shoesStyle: pick(OPTIONS.shoesStyle), shoes: pick([0x101010, 0xd8d8d8, 0x3a2a20, 0xff4fa3, 0x222a3a, 0xc0283c]),
    glow: pick(GLOW_COLORS),
    cyberArm: rand() < 0.2 ? pick(["left", "right", "left", "right", "both"]) : "none",
    implants: (() => { const out = []; const n = rand() < 0.25 ? 0 : rand() < 0.6 ? 1 : rand() < 0.8 ? 2 : 3; while (out.length < n) { const k = pick(IMPLANTS); if (!out.includes(k)) out.push(k); } return out; })(),
    faceTech: rand() < 0.35 ? pick(OPTIONS.faceTech.slice(1)) : "none",
    extra: rand() < 0.3 ? pick(OPTIONS.extra.slice(1)) : "none",
    umbrella: rand() < 0.18
  };
}

// Legacy appearance fields (used by older NPC definitions) → new schema.
function normalize(a) {
  const n = { ...a };
  n.hat = n.hat || "none";
  if (!n.faceTech || n.faceTech === "none") n.faceTech = a.visor ? "visor" : a.mask ? "mask" : a.goggles ? "goggles" : a.glasses ? "glasses" : a.implants ? "face lines" : "none";
  if (n.cyberArm === true) n.cyberArm = "left";
  if (!n.cyberArm || n.cyberArm === false) n.cyberArm = "none";
  if (!n.extra || n.extra === "none") n.extra = a.backpack ? "backpack" : "none";
  n.eyes = n.eyes ?? 0x3a2414;
  n.faceShape = n.faceShape || "oval";
  n.facialHair = n.facialHair || "none";
  n.shirt = n.shirt ?? 0x1a1d24;
  n.hatColor = n.hatColor ?? n.accent;
  n.pantsStyle = n.pantsStyle || "slim";
  n.shoesStyle = n.shoesStyle || "sneakers";
  n.implants = Array.isArray(a.implants) ? a.implants : a.implants === true ? ["temple", "spine"] : [];
  if (n.hair === "white") { n.hair = "swept"; n.hairColor = 0xd8d2c8; }
  return n;
}

export function buildCharacter(input) {
  const a = normalize(input);
  const root = new THREE.Group();
  root.name = "CHARACTER";
  const female = a.build === "female", kid = a.build === "kid", old = a.build === "old";
  const W = female ? 0.9 : 1;
  const sh = female ? 0.175 : 0.205;            // shoulder half-width
  const hipY = 0.94, headY = 1.665;
  const darker = hex => _c.set(hex).multiplyScalar(0.62).getHex();
  const lighter = hex => _c.set(hex).lerp(new THREE.Color(0xffffff), 0.25).getHex();

  // pivots (become bones)
  const torso = new THREE.Group(); root.add(torso);
  const head = new THREE.Group(); head.position.set(0, 1.55, 0); torso.add(head);
  const body = new Parts(torso), bodyGlow = new Parts(torso, true);
  const H = new Parts(head), HG = new Parts(head, true);
  const hy = headY - 1.55; // head centre inside the head pivot

  // ── torso: lathe silhouette, inner shirt, open jacket front, belt ──────
  const profile = female
    ? [[0.15, 0.9], [0.185, 0.97], [0.16, 1.07], [0.165, 1.16], [0.19, 1.3], [0.2, 1.4], [0.17, 1.47], [0.07, 1.52]]
    : [[0.165, 0.9], [0.19, 0.97], [0.18, 1.07], [0.19, 1.18], [0.215, 1.32], [0.225, 1.41], [0.18, 1.48], [0.07, 1.53]];
  const tc = a.top === "tee" || a.top === "vest" ? a.shirt : a.topColor;
  body.lathe(profile, a.top === "tee" ? a.topColor : tc, 0.7);
  if (female) body.sphere(0.07, a.top === "tee" ? a.topColor : tc, 0, 1.31, 0.075, 2.05, 0.85, 0.9);
  const open = ["jacket", "coat", "bomber", "labcoat"].includes(a.top);
  if (open) {
    body.box(0.12, 0.42, 0.02, a.shirt, 0, 1.24, 0.122);                               // inner shirt
    for (const s of [-1, 1]) {
      body.box(0.045, 0.17, 0.014, darker(a.topColor), s * 0.07, 1.38, 0.13, 0.12, 0, s * 0.35);  // lapels
      body.box(0.095, 0.12, 0.015, darker(a.topColor), s * 0.12, 1.07, 0.123);                       // pockets
    }
    body.box(0.005, 0.44, 0.01, a.accent, -0.062, 1.22, 0.135);
    body.box(0.005, 0.44, 0.01, a.accent, 0.062, 1.22, 0.135);
  }
  if (a.top === "bomber") { body.torus(0.165, 0.025, a.accent, 0, 0.95, 0, Math.PI / 2, 1, 0.72); body.torus(0.09, 0.02, a.accent, 0, 1.5, 0); }
  if (a.top === "hoodie") { body.sphere(0.13, a.topColor, 0, 1.55, -0.09, 1.2, 0.85, 0.9); body.box(0.2, 0.1, 0.02, darker(a.topColor), 0, 1.08, 0.13); for (const s of [-1, 1]) body.capsule(0.006, 0.12, a.accent, s * 0.035, 1.38, 0.135); }
  if (a.top === "vest") { for (const s of [-1, 1]) body.box(0.13, 0.42, 0.04, a.topColor, s * 0.095, 1.24, 0.06); body.box(0.25, 0.04, 0.2, a.accent, 0, 1.46, 0); }
  if (a.top === "tee") body.box(0.12, 0.08, 0.01, a.accent, 0, 1.3, 0.143);
  if (a.top === "jumpsuit") { body.box(0.012, 0.45, 0.012, a.accent, 0, 1.2, 0.14); body.box(0.1, 0.07, 0.01, a.accent, 0.1, 1.33, 0.142); }
  if (a.top === "apron") body.box(0.3, 0.62, 0.015, 0xe8e2d6, 0, 1.05, 0.135);
  if (["coat", "labcoat"].includes(a.top)) body.lathe([[0.2, 0.42], [0.23, 0.6], [0.205, 0.8], [0.19, 0.95]], a.topColor, 0.74);
  // ── detail pass: shoulders, hems, seams, zips, back panel ─────────────
  const has = k => a.implants.includes(k);
  body.sphere(0.085, tc, 0, 1.47, -0.02, W * 1.9, 0.5, 0.95);                                 // trapezius / shoulder line
  if (["jacket", "bomber", "hoodie", "coat", "jumpsuit"].includes(a.top)) {
    body.lathe([[0.16 * W, 0.88], [0.178 * W, 0.92], [0.185 * W, 0.99]], tc, 0.72);           // jacket hem covers the belt line
    body.torus(0.162 * W, 0.008, darker(tc), 0, 0.885, 0, Math.PI / 2, 1, 0.72);              // hem band
    body.box(0.2 * W, 0.3, 0.012, darker(tc), 0, 1.25, -0.13);                                // back yoke panel
    bodyGlow.box(0.16 * W, 0.012, 0.004, a.glow, 0, 1.36, -0.138);                            // back LED stripe
    bodyGlow.box(0.012, 0.18, 0.004, a.glow, 0, 1.22, -0.138);
    for (const s of [-1, 1]) body.box(0.004, 0.4, 0.008, darker(tc), s * 0.15 * W, 1.2, 0.105, 0, 0, s * 0.08);  // side seams
  }
  if (a.top === "jacket" || a.top === "bomber") {
    for (const s of [-1, 1]) body.box(0.07, 0.09, 0.018, tc, s * 0.06, 1.53, 0.05, -0.35, 0, s * 0.3);         // stand-up collar
    body.box(0.012, 0.018, 0.006, 0xc8ccd6, 0.062, 1.42, 0.14);                                                  // zip pull
  }
  if (a.top === "hoodie") body.box(0.008, 0.44, 0.008, 0x9aa2b0, 0, 1.22, 0.142);                                // zip
  if (a.top === "tee" || a.top === "vest") body.torus(0.06, 0.008, darker(a.top === "tee" ? a.topColor : tc), 0, 1.49, 0.03, Math.PI / 2.3);
  // ── glowing cyberware on the body ─────────────────────────────────────
  if (has("chest")) {
    body.cyl(0.046, 0.05, 0.014, 0x2a3140, 0, 1.31, 0.136, 14, 1, Math.PI / 2);
    bodyGlow.cyl(0.03, 0.03, 0.004, a.glow, 0, 1.31, 0.144, 14, 1, Math.PI / 2);
    bodyGlow.torus(0.042, 0.005, a.glow, 0, 1.31, 0.145, 0);
    for (const s of [-1, 1]) bodyGlow.box(0.07, 0.006, 0.004, a.glow, s * 0.08, 1.34, 0.137, 0, 0, s * 0.4);
  }
  if (has("spine")) for (let k = 0; k < 4; k++) { body.box(0.05, 0.03, 0.018, 0x6a7383, 0, 1.46 - k * 0.07, -0.135); bodyGlow.box(0.03, 0.012, 0.006, a.glow, 0, 1.46 - k * 0.07, -0.147); }

  // collar + belt
  body.cyl(0.075, 0.1, 0.06, darker(tc), 0, 1.5, 0);
  body.torus(0.172, 0.018, 0x1a1a1e, 0, 0.955, 0, Math.PI / 2, W * 1.02, 0.74);
  body.box(0.05, 0.035, 0.01, 0xb8c0cc, 0, 0.955, 0.13);
  body.box(0.06, 0.07, 0.045, darker(a.pants), sh * 0.75, 0.94, 0.06);                     // belt pouch
  bodyGlow.box(0.02, 0.006, 0.004, a.glow, sh * 0.75, 0.95, 0.084);
  // pelvis
  body.sphere(0.155, a.pants, 0, hipY + 0.01, 0, W * 1.08, 0.7, 0.78);
  // glow seam / neon piping on the jacket
  bodyGlow.box(0.006, 0.34, 0.006, a.glow, sh * 0.62, 1.24, 0.12);
  if (a.top === "bomber" || a.top === "jacket") bodyGlow.box(0.006, 0.34, 0.006, a.glow, -sh * 0.62, 1.24, 0.12);
  // extras
  if (a.extra === "scarf") { body.torus(0.1, 0.035, a.accent, 0, 1.49, 0.01); body.box(0.06, 0.2, 0.02, a.accent, 0.05, 1.37, 0.13, 0, 0, -0.15); }
  if (a.extra === "backpack") { body.box(0.25, 0.33, 0.13, a.accent, 0, 1.24, -0.18); body.box(0.2, 0.1, 0.05, darker(a.accent), 0, 1.13, -0.255); bodyGlow.box(0.18, 0.01, 0.005, a.glow, 0, 1.35, -0.25); }
  if (a.extra === "chain") body.torus(0.09, 0.006, 0xd8c070, 0, 1.4, 0.09, Math.PI / 2.6);
  if (a.extra === "shoulder pad") { body.sphere(0.09, 0x6a7383, -sh - 0.02, 1.47, 0, 1.2, 0.55, 1.1); bodyGlow.box(0.1, 0.008, 0.008, a.glow, -sh - 0.02, 1.46, 0.085); }
  if (a.umbrella) { body.cyl(0.008, 0.008, 1.0, 0x2a2a2a, 0.24, 1.65, 0.16, 5); body.add(new THREE.ConeGeometry(0.55, 0.26, 14, 1, true), 0x1b2230, 0.24, 2.25, 0.16); bodyGlow.torus(0.55, 0.007, a.glow, 0.24, 2.12, 0.16); }

  // ── head ──────────────────────────────────────────────────────────────
  const shape = { oval: [0.92, 1.1, 1.0, 1.0], angular: [0.9, 1.12, 0.98, 1.15], round: [0.98, 1.04, 1.02, 0.9], narrow: [0.85, 1.15, 0.96, 1.0] }[a.faceShape];
  H.cyl(0.048, 0.055, 0.12, a.skin, 0, 0.0, 0, 10);                                        // neck
  H.sphere(0.112, a.skin, 0, hy, 0, shape[0], shape[1], shape[2], 18);                   // skull
  H.sphere(0.08, a.skin, 0, hy - 0.06, 0.028, shape[0] * 1.02, 0.72 * shape[3], 1.0, 14); // jaw
  for (const s of [-1, 1]) {
    H.sphere(0.024, a.skin, s * 0.104, hy - 0.005, -0.005, 0.5, 1.1, 0.8, 8);            // ears
    H.sphere(0.017, 0xf3efe8, s * 0.04, hy + 0.012, 0.093, 1.3, 0.85, 0.6, 10);          // eye white
    H.cyl(0.0105, 0.0105, 0.004, a.eyes, s * 0.04, hy + 0.012, 0.1035, 12, 1, Math.PI / 2); // iris
    H.cyl(0.0048, 0.0048, 0.005, 0x06070a, s * 0.04, hy + 0.012, 0.1052, 8, 1, Math.PI / 2); // pupil
    H.box(0.042, 0.007, 0.01, darker(a.hairColor === 0xd8d2c8 ? 0x8a8070 : a.hairColor), s * 0.042, hy + 0.043, 0.099, 0, 0, s * -0.12); // brows
    H.box(0.036, 0.004, 0.008, darker(a.skin), s * 0.04, hy + 0.027, 0.1, 0, 0, s * -0.06); // eyelid line
  }
  H.add(new THREE.ConeGeometry(0.014, 0.04, 4), a.skin, 0, hy - 0.012, 0.108, 1, 1, 0.8, -0.3, Math.PI / 4); // nose
  const lip = _c.set(a.skin).lerp(new THREE.Color(female ? 0xa83a4a : 0x8a4a42), female ? 0.5 : 0.35).getHex();
  H.box(0.042, 0.009, 0.012, lip, 0, hy - 0.055, 0.1);
  H.box(0.036, 0.008, 0.012, lip, 0, hy - 0.065, 0.098);
  if (old) for (const s of [-1, 1]) H.box(0.03, 0.003, 0.004, darker(a.skin), s * 0.035, hy + 0.06, 0.102);
  // facial hair
  const fh = darker(a.hairColor === 0xd8d2c8 ? 0xb8b0a0 : a.hairColor);
  if (a.facialHair === "stubble") H.partial(0.083, _c.set(a.skin).lerp(new THREE.Color(fh), 0.35).getHex(), 0, hy - 0.058, 0.03, shape[0] * 1.04, 0.74, 1.03, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55);
  if (a.facialHair === "moustache" || a.facialHair === "goatee" || a.facialHair === "beard") H.box(0.06, 0.014, 0.014, fh, 0, hy - 0.044, 0.104);
  if (a.facialHair === "goatee") H.sphere(0.022, fh, 0, hy - 0.098, 0.085, 1, 1.3, 0.8, 8);
  if (a.facialHair === "beard") H.partial(0.087, fh, 0, hy - 0.06, 0.03, shape[0] * 1.05, 0.8, 1.05, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.58);

  // ── hair ──────────────────────────────────────────────────────────────
  const hc = a.hairColor, R = 0.118, sx = shape[0] * 1.02, sz = shape[2] * 1.03;
  const cap = (tl = 0.55, lift = 0.012, sc = 1) => H.partial(R * sc, hc, 0, hy + lift, -0.006, sx, shape[1] * 0.95, sz, 0, Math.PI * 2, 0, Math.PI * tl, -0.32);
  const fringe = () => { for (let i = -2; i <= 2; i++) H.capsule(0.017, 0.05, hc, i * 0.024, hy + 0.072, 0.088 - Math.abs(i) * 0.008, 0.9, i * 0.25); };
  switch (a.hair) {
    case "short": cap(0.52); fringe(); break;
    case "buzz": cap(0.5, 0.004, 0.97); break;
    case "spiky": cap(0.5); for (let i = 0; i < 9; i++) { const ang = i / 9 * Math.PI * 2; H.add(new THREE.ConeGeometry(0.028, 0.1, 5), hc, Math.sin(ang) * 0.06, hy + 0.11, Math.cos(ang) * 0.05 - 0.01, 1, 1, 1, Math.cos(ang) * 0.5, 0, -Math.sin(ang) * 0.5); } break;
    case "undercut": cap(0.38, 0.03, 1.02); H.partial(R, darker(hc), 0, hy, -0.006, sx * 0.99, shape[1] * 0.93, sz * 0.99, 0, Math.PI * 2, Math.PI * 0.3, Math.PI * 0.25, -0.3); H.box(0.16, 0.05, 0.12, hc, 0.02, hy + 0.105, 0.03, -0.3, 0, -0.25); break;
    case "swept": cap(0.52); H.capsule(0.04, 0.14, hc, 0.01, hy + 0.1, 0.03, 1.4, -0.4, 1.3, 1); break;
    case "long": cap(0.6); fringe(); H.box(0.21, 0.32, 0.07, hc, 0, hy - 0.12, -0.075); for (const s of [-1, 1]) H.box(0.04, 0.24, 0.06, hc, s * 0.098, hy - 0.08, 0.0); break;
    case "bob": cap(0.62, 0.01, 1.07); fringe(); break;
    case "bun": cap(0.52); fringe(); H.sphere(0.05, hc, 0, hy + 0.1, -0.1); break;
    case "ponytail": cap(0.52); fringe(); H.capsule(0.032, 0.22, hc, 0, hy - 0.05, -0.135, 0.25); break;
    case "twintails": cap(0.55); fringe(); for (const s of [-1, 1]) H.capsule(0.03, 0.2, hc, s * 0.115, hy - 0.06, -0.06, 0.1, s * -0.25); break;
    case "mohawk": cap(0.5, 0.002, 0.96); H.box(0.032, 0.09, 0.22, a.hairGlow ? 0x111111 : hc, 0, hy + 0.13, -0.01); if (a.hairGlow) HG.box(0.034, 0.03, 0.22, hc, 0, hy + 0.165, -0.01); break;
    default: break;
  }
  if (a.hairGlow && a.hair !== "mohawk" && a.hair !== "bald") HG.box(0.02, 0.008, 0.08, a.glow, 0.05, hy + 0.1, 0.03, 0, 0, -0.3);
  if (a.headband) H.cyl(0.123, 0.123, 0.028, a.headband, 0, hy + 0.05, 0, 16);
  // hats
  const hatC = a.hatColor;
  if (a.hat === "cap") { H.partial(0.125, hatC, 0, hy + 0.03, -0.004, sx, 0.8, sz, 0, Math.PI * 2, 0, Math.PI * 0.5); H.box(0.15, 0.012, 0.11, darker(hatC), 0, hy + 0.035, 0.115, 0.15); HG.box(0.02, 0.02, 0.005, a.glow, 0, hy + 0.08, 0.118); }
  if (a.hat === "beanie") { H.partial(0.13, hatC, 0, hy + 0.035, -0.004, sx, 0.95, sz, 0, Math.PI * 2, 0, Math.PI * 0.55); H.torus(0.12, 0.016, darker(hatC), 0, hy + 0.035, 0, Math.PI / 2, sx, sz); }
  if (a.hat === "hood") H.partial(0.15, a.topColor, 0, hy + 0.0, -0.02, 1.0, 1.1, 1.05, 0, Math.PI * 2, 0, Math.PI * 0.62, -0.35);
  if (a.hat === "bucket") { H.cyl(0.11, 0.125, 0.09, hatC, 0, hy + 0.09, -0.005, 16); H.cyl(0.19, 0.19, 0.012, darker(hatC), 0, hy + 0.045, -0.005, 20); }
  if (a.hat === "helmet") { H.partial(0.135, 0x2a3140, 0, hy + 0.01, -0.006, 1.0, 1.0, 1.02, 0, Math.PI * 2, 0, Math.PI * 0.55); HG.box(0.2, 0.025, 0.02, a.glow, 0, hy + 0.06, 0.12); for (const s of [-1, 1]) H.cyl(0.03, 0.03, 0.03, 0x6a7383, s * 0.12, hy, 0, 10, 1, 0, Math.PI / 2); }
  // head cyberware
  if (has("temple")) for (const s of [-1, 1]) { H.cyl(0.018, 0.018, 0.012, 0x8a93a3, s * 0.103, hy + 0.03, 0.035, 12, 1, 0, Math.PI / 2); HG.cyl(0.012, 0.012, 0.004, a.glow, s * 0.11, hy + 0.03, 0.035, 10, 1, 0, Math.PI / 2); HG.box(0.003, 0.004, 0.05, a.glow, s * 0.108, hy + 0.055, 0.0); }
  if (has("eye")) { H.torus(0.021, 0.004, 0x8a93a3, 0.04, hy + 0.012, 0.104, 0); HG.cyl(0.0115, 0.0115, 0.003, a.glow, 0.04, hy + 0.012, 0.108, 12, 1, Math.PI / 2); HG.box(0.022, 0.002, 0.003, a.glow, 0.068, hy + 0.0, 0.094, 0, 0.5, -0.4); }
  if (has("jaw")) { H.box(0.012, 0.07, 0.09, 0x8a93a3, -0.088, hy - 0.06, 0.03, 0, 0.12, 0.12); HG.box(0.003, 0.05, 0.004, a.glow, -0.095, hy - 0.06, 0.07, 0, 0.3, 0.12); }
  if (has("tattoo")) { for (let k = 0; k < 3; k++) HG.box(0.003, 0.028 - k * 0.006, 0.003, a.glow, -0.06 - k * 0.008, hy - 0.025 - k * 0.012, 0.09 - k * 0.006, 0, -0.4, 0.2); HG.box(0.04, 0.003, 0.003, a.glow, 0.045, -0.02, 0.045, 0, 0.5, 0.3); }
  if (has("spine")) for (let k = 0; k < 2; k++) { H.box(0.04, 0.024, 0.016, 0x6a7383, 0, 0.03 - k * 0.04, -0.05); HG.box(0.024, 0.009, 0.005, a.glow, 0, 0.03 - k * 0.04, -0.059); }
  // face tech
  switch (a.faceTech) {
    case "visor": H.box(0.2, 0.04, 0.03, 0x0c0f16, 0, hy + 0.015, 0.105); HG.box(0.18, 0.012, 0.005, a.glow, 0, hy + 0.015, 0.122); break;
    case "mask": H.box(0.13, 0.07, 0.05, 0x15181f, 0, hy - 0.055, 0.09); HG.box(0.1, 0.007, 0.005, a.glow, 0, hy - 0.045, 0.117); for (const s of [-1, 1]) H.cyl(0.018, 0.018, 0.02, 0x2a2f3a, s * 0.05, hy - 0.065, 0.11, 8, 1, Math.PI / 2); break;
    case "glasses": for (const s of [-1, 1]) H.torus(0.02, 0.003, 0x0c0f16, s * 0.04, hy + 0.012, 0.108, 0); H.box(0.02, 0.003, 0.003, 0x0c0f16, 0, hy + 0.015, 0.11); break;
    case "goggles": H.cyl(0.124, 0.124, 0.022, 0x2a2a2a, 0, hy + 0.095, 0, 16); for (const s of [-1, 1]) { H.cyl(0.032, 0.032, 0.03, 0x3a3a3a, s * 0.045, hy + 0.095, 0.1, 10, 1, Math.PI / 2); HG.cyl(0.024, 0.024, 0.004, a.glow, s * 0.045, hy + 0.095, 0.116, 10, 1, Math.PI / 2); } break;
    case "face lines": for (const s of [-1, 1]) { HG.box(0.003, 0.05, 0.004, a.glow, s * 0.07, hy - 0.025, 0.088, 0, s * 0.5); HG.box(0.025, 0.003, 0.004, a.glow, s * 0.08, hy - 0.05, 0.08, 0, s * 0.6); } HG.box(0.004, 0.06, 0.03, a.glow, 0.106, hy + 0.01, 0.02); break;
    default: break;
  }

  // ── arms: shoulder → elbow pivots, sleeves, hands with fingers ─────────
  const arms = [], elbows = [];
  const sleeveless = a.top === "vest" || a.top === "tee";
  for (const s of [-1, 1]) {
    const cyber = a.cyberArm === "both" || (a.cyberArm === "left" && s < 0) || (a.cyberArm === "right" && s > 0);
    const shoulder = new THREE.Group(); shoulder.position.set(s * (sh + 0.035), 1.44, 0); torso.add(shoulder);
    const elbow = new THREE.Group(); elbow.position.y = -0.28; shoulder.add(elbow);
    const U = new Parts(shoulder), F = new Parts(elbow), UG = new Parts(shoulder, true), FG = new Parts(elbow, true);
    const upper = cyber ? 0x8a93a3 : sleeveless ? (a.top === "tee" ? a.topColor : a.skin) : a.topColor;
    U.sphere(0.054, cyber ? 0x5a6373 : (sleeveless && a.top === "vest" ? a.skin : a.top === "tee" ? a.topColor : a.topColor), 0, -0.01, 0);
    U.capsule(0.052, 0.2, upper, 0, -0.14, 0);
    if (a.top === "tee" && !cyber) U.capsule(0.045, 0.12, a.skin, 0, -0.2, 0);
    const fore = cyber ? 0x6a7383 : sleeveless ? a.skin : a.topColor;
    F.sphere(0.047, fore, 0, 0, 0);
    F.capsule(0.044, 0.19, fore, 0, -0.13, 0.005);
    if (!sleeveless && !cyber) { F.cyl(0.05, 0.05, 0.035, a.accent, 0, -0.235, 0.005, 12); U.box(0.004, 0.22, 0.008, darker(a.topColor), 0, -0.14, 0.052); }
    if (has("sleeve lights") && !cyber) { UG.box(0.012, 0.22, 0.012, a.glow, s * 0.048, -0.14, 0.015); FG.box(0.012, 0.18, 0.012, a.glow, s * 0.043, -0.12, 0.015); FG.torus(0.053, 0.007, a.glow, 0, -0.218, 0.005); UG.torus(0.056, 0.006, a.glow, 0, -0.02, 0); }
    if (has("tattoo") && !cyber) { FG.box(0.007, 0.1, 0.006, a.glow, 0, -0.19, 0.045); FG.box(0.04, 0.007, 0.006, a.glow, 0, -0.16, 0.046); FG.box(0.03, 0.007, 0.006, a.glow, 0, -0.21, 0.046); }
    const handC = cyber ? 0x5a6373 : a.skin;
    F.sphere(0.044, handC, 0, -0.3, 0.01, 0.75, 1.0, 0.5, 10);                             // palm
    for (let k = 0; k < 4; k++) F.capsule(0.0095, 0.045, handC, (k - 1.5) * 0.017, -0.36, 0.012 + Math.abs(k - 1.5) * -0.003, 0.15);
    F.capsule(0.011, 0.04, handC, -s * 0.03, -0.31, 0.03, 0.5, s * 0.7);                    // thumb
    if (cyber) {
      UG.box(0.008, 0.18, 0.008, a.glow, 0, -0.15, 0.05); FG.box(0.008, 0.16, 0.008, a.glow, 0, -0.13, 0.045); FG.torus(0.047, 0.004, a.glow, 0, -0.03, 0);
      for (let k = 0; k < 3; k++) U.torus(0.054, 0.006, 0x3a4250, 0, -0.06 - k * 0.06, 0);
      U.sphere(0.064, 0x8a93a3, 0, 0.0, 0, 1.05, 0.7, 1.05);                                   // shoulder cap plate
      UG.box(0.05, 0.006, 0.006, a.glow, 0, 0.03, 0.055);
      for (const q of [-1, 1]) { U.cyl(0.008, 0.008, 0.2, 0x2a2f3a, q * 0.05, -0.15, -0.02, 6); F.cyl(0.007, 0.007, 0.16, 0xb8c0cc, q * 0.045, -0.12, -0.02, 6); }  // pistons
      F.box(0.07, 0.09, 0.02, 0x8a93a3, 0, -0.13, 0.04);                                         // forearm plate
      for (let k = 0; k < 4; k++) FG.sphere(0.006, a.glow, (k - 1.5) * 0.017, -0.335, 0.025, 1, 1, 1, 6);  // glowing knuckles
    }
    U.commit(solidMat, glowMat); UG.commit(solidMat, glowMat); F.commit(solidMat, glowMat); FG.commit(solidMat, glowMat);
    arms.push(shoulder); elbows.push(elbow);
  }

  // ── legs: hip → knee pivots, pants styles, shoes ───────────────────────
  const hips = [], knees = [];
  const pw = a.pantsStyle === "baggy" ? 1.22 : a.pantsStyle === "cargo" ? 1.1 : 1;
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(s * 0.088 * W, hipY, 0); root.add(hip);
    const knee = new THREE.Group(); knee.position.y = -0.43; hip.add(knee);
    const T = new Parts(hip), S = new Parts(knee), GL = new Parts(knee, true);
    T.capsule(0.07, 0.32, a.pants, 0, -0.21, 0, 0, 0, pw, pw);
    if (a.pantsStyle === "cargo") { T.box(0.03, 0.12, 0.1, darker(a.pants), s * 0.08, -0.24, 0.01); T.torus(0.075 * pw, 0.006, 0x1a1a1e, 0, -0.32, 0, Math.PI / 2); }
    T.box(0.004, 0.36, 0.006, darker(a.pants), s * 0.068 * pw, -0.2, 0);                        // outer seam
    S.box(0.075 * pw, 0.03, 0.02, darker(a.pants), 0, -0.02, 0.055 * pw);                          // knee seam
    S.sphere(0.062 * pw, a.pants, 0, 0, 0);
    S.capsule(0.055, 0.3, a.pants, 0, -0.19, 0, 0, 0, pw, pw);
    const boots = a.shoesStyle === "boots", high = a.shoesStyle === "high-tops";
    if (boots || high) S.cyl(0.062, 0.066, boots ? 0.16 : 0.1, a.shoes, 0, -0.36, 0.01, 12);
    S.sphere(0.06, a.shoes, 0, -0.425, 0.045, 0.95, 0.62, 1.65, 12);                        // shoe upper
    S.box(0.12, 0.025, 0.25, boots ? 0x1a1a1a : 0xe8e8e8, 0, -0.455, 0.05);                 // sole
    if (!boots) { S.box(0.07, 0.006, 0.05, lighter(a.shoes), 0, -0.405, 0.12); S.box(0.122, 0.018, 0.06, lighter(a.shoes), 0, -0.44, 0.15); S.box(0.004, 0.02, 0.12, a.accent, s * 0.058, -0.425, 0.05); }   // laces, toe cap, side stripe
    else { for (let k = 0; k < 2; k++) S.box(0.13, 0.014, 0.13, 0x2a2a2a, 0, -0.33 - k * 0.05, 0.01); S.box(0.012, 0.016, 0.01, 0xb8c0cc, s * 0.066, -0.33, 0.04); }   // boot straps + buckle
    if (a.shoesStyle === "high-tops" || has("sleeve lights")) GL.box(0.125, 0.006, 0.255, a.glow, 0, -0.466, 0.05);              // glowing sole strip
    T.commit(solidMat, glowMat); S.commit(solidMat, glowMat); GL.commit(solidMat, glowMat);
    hips.push(hip); knees.push(knee);
  }

  body.commit(solidMat, glowMat); bodyGlow.commit(solidMat, glowMat);
  H.commit(solidMat, glowMat); HG.commit(solidMat, glowMat);

  // relaxed arms
  arms[0].rotation.z = -0.07; arms[1].rotation.z = 0.07;
  elbows[0].rotation.x = elbows[1].rotation.x = -0.12;
  skinify(root, { metalness: 0.15, roughness: 0.6 });
  if (a.umbrella) { arms[1].rotation.x = -1.0; arms[1].rotation.z = 0.25; elbows[1].rotation.x = -0.6; }

  const scale = (a.scale || 1) * (kid ? 0.72 : 1) * (old ? 0.96 : 1);
  root.scale.setScalar(scale);
  root.userData.rig = { arms, elbows, hips, knees, body: torso, head, scale, hipY };
  root.userData.appearance = a;
  return root;
}
