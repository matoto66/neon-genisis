// NEON GENESIS — character creator data: the player's look, option lists,
// presets, randomizer and saving. Used by both the PC start page and the VR
// character terminal (main.js draws them).

import { OPTIONS, SKIN_TONES, HAIR_COLORS, EYE_COLORS, CLOTH_COLORS, GLOW_COLORS } from "./character.js";

import { lookKey } from "./worlds.js";

export const DEFAULT_LOOK = {
  name: "", build: "male", scale: 1.0, skin: 0xe0ac86, faceShape: "oval", eyes: 0x3a2414, facialHair: "none",
  hair: "short", hairColor: 0x111111, hairGlow: false, hat: "cap", hatColor: 0x15171c,
  top: "jacket", topColor: 0x2a2f3a, accent: 0xc0283c, shirt: 0x15171c, pantsStyle: "slim", pants: 0x15171c,
  shoesStyle: "sneakers", shoes: 0xd8dce6, extra: "none", cyberArm: "none", faceTech: "none", glow: 0x38f0e6
};

// Names offered in VR, where typing isn't practical.
export const HANDLES = ["", "NOVA", "KAITO", "RIN", "JUNO", "HEX", "SORA", "VEX", "AKIRA", "ZERO", "MIRA", "DAX", "KENJI", "LYRA", "ROOK", "YUKI"];

const C = (key, label, palette) => ({ key, label, type: "color", options: palette });
const P = (key, label, options) => ({ key, label, type: "choice", options });
export const TABS = [
  { id: "identity", label: "IDENTITY", fields: [
    { key: "name", label: "NAME", type: "text", options: HANDLES },
    P("build", "BODY TYPE", OPTIONS.build),
    P("scale", "HEIGHT", [0.92, 0.96, 1.0, 1.04, 1.08]),
    { key: "preset", label: "STYLE PRESET", type: "preset" }
  ] },
  { id: "face", label: "FACE", fields: [
    C("skin", "SKIN TONE", SKIN_TONES), P("faceShape", "FACE SHAPE", OPTIONS.faceShape),
    C("eyes", "EYE COLOUR", EYE_COLORS), P("facialHair", "FACIAL HAIR", OPTIONS.facialHair)
  ] },
  { id: "hair", label: "HAIR", fields: [
    P("hair", "HAIRSTYLE", OPTIONS.hair), C("hairColor", "HAIR COLOUR", HAIR_COLORS),
    P("hairGlow", "NEON TIPS", [false, true]), P("hat", "HEADWEAR", OPTIONS.hat), C("hatColor", "HEADWEAR COLOUR", CLOTH_COLORS)
  ] },
  { id: "outfit", label: "OUTFIT", fields: [
    P("top", "JACKET / TOP", OPTIONS.top), C("topColor", "TOP COLOUR", CLOTH_COLORS), C("accent", "TRIM COLOUR", CLOTH_COLORS),
    C("shirt", "SHIRT COLOUR", CLOTH_COLORS), P("pantsStyle", "PANTS", OPTIONS.pantsStyle), C("pants", "PANTS COLOUR", CLOTH_COLORS),
    P("shoesStyle", "SHOES", OPTIONS.shoesStyle), C("shoes", "SHOE COLOUR", CLOTH_COLORS), P("extra", "ACCESSORY", OPTIONS.extra)
  ] },
  { id: "chrome", label: "CYBERWARE", fields: [
    P("cyberArm", "CYBER ARM", OPTIONS.cyberArm), P("faceTech", "FACE TECH", OPTIONS.faceTech), C("glow", "NEON COLOUR", GLOW_COLORS)
  ] }
];

// Original style presets — a quick starting point the player can then tweak.
export const PRESETS = [
  { name: "STREET RAT", look: { hair: "spiky", hairColor: 0xffcf4a, hat: "none", top: "hoodie", topColor: 0x3d5a2a, accent: 0xffcf4a, shirt: 0x15171c, pantsStyle: "baggy", pants: 0x2a4a8a, shoesStyle: "high-tops", shoes: 0xc0283c, extra: "backpack", faceTech: "none", glow: 0x6aff9e } },
  { name: "NETRUNNER", look: { hair: "undercut", hairColor: 0xb24cff, hairGlow: true, hat: "none", top: "coat", topColor: 0x15171c, accent: 0xb24cff, shirt: 0x2a2f3a, pantsStyle: "slim", pants: 0x15171c, shoesStyle: "boots", shoes: 0x15171c, faceTech: "visor", cyberArm: "left", glow: 0xb24cff } },
  { name: "CORPO", look: { hair: "swept", hairColor: 0x111111, hat: "none", top: "coat", topColor: 0xd8dce6, accent: 0x2a2f3a, shirt: 0x15171c, pantsStyle: "slim", pants: 0x2a2f3a, shoesStyle: "boots", shoes: 0x15171c, faceTech: "glasses", extra: "none", cyberArm: "none", glow: 0x4c9dff } },
  { name: "RONIN", look: { hair: "ponytail", hairColor: 0x2b1d14, hat: "none", top: "bomber", topColor: 0x7a2a2a, accent: 0x15171c, shirt: 0x15171c, pantsStyle: "cargo", pants: 0x15171c, shoesStyle: "boots", shoes: 0x5a4a3a, extra: "scarf", faceTech: "face lines", cyberArm: "right", glow: 0xff3a4a } },
  { name: "MECHANIC", look: { hair: "bob", hairColor: 0x38f0e6, hat: "none", top: "jumpsuit", topColor: 0xd8742a, accent: 0x2a2f3a, shirt: 0x2a2f3a, pantsStyle: "cargo", pants: 0xd8742a, shoesStyle: "boots", shoes: 0x15171c, extra: "shoulder pad", faceTech: "goggles", cyberArm: "left", glow: 0x38f0e6 } },
  { name: "CHROME PUNK", look: { hair: "mohawk", hairColor: 0xff4fa3, hairGlow: true, hat: "none", top: "vest", topColor: 0x15171c, accent: 0xff4fa3, shirt: 0x15171c, pantsStyle: "slim", pants: 0x15171c, shoesStyle: "boots", shoes: 0x15171c, extra: "chain", faceTech: "mask", cyberArm: "both", glow: 0xff4fa3 } }
];

export const look = { ...DEFAULT_LOOK };
export let presetIndex = -1;

// ── load, including migration from the original 4-option creator ──────────
const OLD_COLOURS = { Black: 0x15171c, White: 0xd8dce6, Yellow: 0xc49a25, Cyan: 0x147f89, Purple: 0x5a3a8a, Red: 0xc0283c };
const OLD_HATS = { "Baseball Cap": "cap", "Beanie": "beanie", "Bucket Hat": "bucket", "Tech Helmet": "helmet" };
export function loadLook() {
  try {
    Object.assign(look, DEFAULT_LOOK);
    presetIndex = -1;
    const saved = JSON.parse(localStorage.getItem(lookKey()) || "null");
    if (!saved) return;
    if (saved.bodyType && !saved.build) {          // old format
      look.build = saved.bodyType === "Female" ? "female" : "male";
      look.hat = OLD_HATS[saved.hatStyle] || "cap";
      look.hatColor = OLD_COLOURS[saved.hatColour] ?? look.hatColor;
      look.topColor = OLD_COLOURS[saved.jacketColour] ?? look.topColor;
      if (look.build === "female") look.hair = "ponytail";
      return saveLook();
    }
    for (const k of Object.keys(DEFAULT_LOOK)) if (saved[k] !== undefined && typeof saved[k] === typeof DEFAULT_LOOK[k]) look[k] = saved[k];
    look.name = String(look.name).slice(0, 16);
  } catch {}
}
export function saveLook() { try { localStorage.setItem(lookKey(), JSON.stringify(look)); } catch {} }

export function cycle(field, dir = 1) {
  if (field.type === "preset") return applyPreset((presetIndex + dir + PRESETS.length) % PRESETS.length);
  const opts = field.options;
  let i = opts.indexOf(look[field.key]);
  if (i < 0) i = 0;
  look[field.key] = opts[(i + dir + opts.length) % opts.length];
  saveLook();
}
export function setValue(key, value) { look[key] = value; saveLook(); }
export function applyPreset(i) {
  presetIndex = i;
  Object.assign(look, PRESETS[i].look);
  saveLook();
}
export function randomize() {
  const r = arr => arr[Math.floor(Math.random() * arr.length)];
  for (const tab of TABS) for (const f of tab.fields) {
    if (f.type === "choice" || f.type === "color") look[f.key] = r(f.options);
  }
  if (look.build === "female" && Math.random() < 0.8) look.facialHair = "none";
  if (Math.random() < 0.55) look.hat = "none";
  if (Math.random() < 0.4) look.cyberArm = "none";
  presetIndex = -1;
  saveLook();
}

// Display text for a field's current value.
const COLOUR_NAMES = new Map([
  [0x15171c, "JET"], [0x2a2f3a, "GUNMETAL"], [0x6a6f7a, "STEEL"], [0xd8dce6, "WHITE"], [0x7a2a2a, "OXBLOOD"], [0xc0283c, "RED"],
  [0xd8742a, "ORANGE"], [0xc49a25, "GOLD"], [0x3d5a2a, "OLIVE"], [0x147f89, "TEAL"], [0x2a4a8a, "NAVY"], [0x5a3a8a, "VIOLET"],
  [0xb0307a, "MAGENTA"], [0x5a4a3a, "TAN"], [0x38f0e6, "CYAN"], [0xff4fa3, "PINK"], [0xb24cff, "PURPLE"], [0xffcf4a, "AMBER"],
  [0x6aff9e, "LIME"], [0xff3a4a, "RED"], [0x4c9dff, "BLUE"], [0xffffff, "WHITE"], [0x111111, "BLACK"], [0x2b1d14, "DARK BROWN"],
  [0x5a3a22, "BROWN"], [0x8c5a2b, "AUBURN"], [0xc9a26b, "BLONDE"], [0xd8d2c8, "SILVER"], [0x8a1f2a, "CRIMSON"], [0x3a2414, "DARK BROWN"],
  [0x6b4a2a, "HAZEL"], [0x3c6e4a, "GREEN"], [0x3a6fa8, "BLUE"], [0x8a8f96, "GREY"], [0xd8202a, "RED"]
]);
export function valueText(field) {
  const v = look[field.key];
  if (field.type === "preset") return presetIndex >= 0 ? PRESETS[presetIndex].name : "CUSTOM";
  if (field.type === "text") return v ? v : "—";
  if (field.type === "color") return COLOUR_NAMES.get(v) || (field.key === "skin" ? `TONE ${SKIN_TONES.indexOf(v) + 1}` : "CUSTOM");
  if (field.key === "scale") return { 0.92: "SHORT", 0.96: "BELOW AVG", 1: "AVERAGE", 1.04: "TALL", 1.08: "VERY TALL" }[v] || "AVERAGE";
  if (typeof v === "boolean") return v ? "ON" : "OFF";
  return String(v).toUpperCase();
}
export const hexCss = v => "#" + v.toString(16).padStart(6, "0");
