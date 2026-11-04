// NEON GENESIS — player state & saving (localStorage, this device only).
// Save format v2 keeps the original { character, credits } fields so older
// saves load without losing anything.

import { CYBERWARE } from "./story.js";

import { saveKey } from "./worlds.js";
export const MAX_STAT = 10;
export const BASE_POINTS = 3;
export const gradeNames = ["BASIC", "STANDARD", "ADVANCED", "ELITE", "PROTOTYPE", "GENESIS"];
export const gradeName = c => gradeNames[Math.min(c, 5)] + (c > 5 ? ` +${c - 5}` : "");

// ── XP & levels ── 10 XP per level. Main quest = +5 levels, side job = +1 level,
// enemies and data shards give a little XP. Each level = 1 attribute point.
export const XP_PER_LEVEL = 10;
export const XP_REWARDS = { main: 50, side: 10, scav: 1, sentry: 2, enforcer: 3, shard: 3 };

export const state = {
  version: 2,
  character: { strength: 0, health: 0, compatibility: 0 },
  bonusPoints: 0,              // (old) replaced by levels
  xp: 0,                       // total experience; level = 1 + xp / 10
  credits: 500,
  missions: {},                // id -> { status: "active"|"done", step, progress }
  flags: {},                   // story choices & facts
  owned: [],                   // cyberware ids bought
  installed: [],               // cyberware ids installed (limited by slots)
  collected: [],               // pickup ids already taken
  items: {},                   // consumables, e.g. { med_patch: 2 }
  introSeen: false,
  tracked: null
};

// Fresh defaults (mutated in place so other modules keep their references).
export function resetState() {
  Object.assign(state.character, { strength: 0, health: 0, compatibility: 0 });
  Object.assign(state, { bonusPoints: 0, xp: 0, credits: 500, missions: {}, flags: {}, owned: [], installed: [], collected: [], items: {}, introSeen: false, tracked: null });
}

export function loadGame() {
  resetState();
  try {
    const saved = JSON.parse(localStorage.getItem(saveKey()) || "null");
    if (!saved) return false;
    if (Number.isInteger(saved.credits) && saved.credits >= 0) state.credits = saved.credits;
    if (saved.missions && typeof saved.missions === "object") state.missions = saved.missions;
    if (saved.flags && typeof saved.flags === "object") state.flags = saved.flags;
    // Chapters 1-3 were merged into Chapter 1; old saves used "chapter3_done".
    if (state.flags.chapter3_done) { state.flags.chapter1_done = true; delete state.flags.chapter3_done; }
    for (const key of ["owned", "installed", "collected"]) {
      if (Array.isArray(saved[key])) state[key] = saved[key].filter(v => typeof v === "string");
    }
    state.owned = state.owned.filter(id => CYBERWARE[id]);
    state.installed = state.installed.filter(id => state.owned.includes(id));
    if (saved.items && typeof saved.items === "object") state.items = { med_patch: Math.max(0, Math.min(9, saved.items.med_patch | 0)) };
    state.introSeen = !!saved.introSeen;
    // XP: older saves didn't have it, so work it out from what they've done.
    if (Number.isInteger(saved.xp) && saved.xp >= 0) state.xp = saved.xp;
    else {
      for (const [id, m] of Object.entries(state.missions)) if (m?.status === "done") state.xp += id.startsWith("m") ? XP_REWARDS.main : XP_REWARDS.side;
      state.xp += state.collected.filter(id => id.startsWith("shard")).length * XP_REWARDS.shard;
    }
    const c = saved.character;
    if (c) {
      const values = [c.strength, c.health, c.compatibility];
      if (values.every(v => Number.isInteger(v) && v >= 0 && v <= MAX_STAT) && values.reduce((a, b) => a + b, 0) <= totalPoints()) {
        Object.assign(state.character, { strength: c.strength, health: c.health, compatibility: c.compatibility });
      }
    }
    state.tracked = typeof saved.tracked === "string" ? saved.tracked : null;
    return true;
  } catch { return false; }
}

export function saveGame() {
  try { localStorage.setItem(saveKey(), JSON.stringify(state)); } catch {}
}

export function resetGame() {
  try { localStorage.removeItem(saveKey()); } catch {}
}

export const level = () => 1 + Math.floor(state.xp / XP_PER_LEVEL);
export const xpIntoLevel = () => state.xp % XP_PER_LEVEL;
/** Adds XP, saves, and returns how many levels were gained. */
export function addXP(n) { const before = level(); state.xp += Math.max(0, n | 0); saveGame(); return level() - before; }
export const totalPoints = () => BASE_POINTS + level() - 1;
export const pointsLeft = () => totalPoints() - state.character.strength - state.character.health - state.character.compatibility;

export function changeStat(stat, change) {
  const c = state.character;
  if (change > 0 && pointsLeft() > 0 && c[stat] < MAX_STAT) c[stat]++;
  if (change < 0 && c[stat] > 0) c[stat]--;
  saveGame();
}

// Cyberware works only while installed AND supported by your compatibility.
export const slotCount = () => 2 + state.character.compatibility;
export const isActive = id => state.installed.includes(id) && (CYBERWARE[id]?.req ?? 99) <= state.character.compatibility;
export const effectiveStrength = () => state.character.strength + (isActive("kinetic_tendons") ? 1 : 0);
export const maxHealth = () => 100 + state.character.health * 25 + (isActive("subdermal_weave") ? 40 : 0);
export const moveSpeed = () => (3.2 + Math.min(5, state.character.strength) * 0.18) *
  (isActive("kinetic_tendons") ? 1.15 : 1) * (isActive("reflex_lattice") ? 1.1 : 1);
export const turnSpeed = () => 2.2 * (isActive("reflex_lattice") ? 1.25 : 1);
export const jumpVelocity = () => 4.4 * (isActive("hydraulic_calves") ? 1.22 : 1);
export const creditMultiplier = () => isActive("neural_bridge") ? 1.2 : 1;

export function toggleInstall(id) {
  if (!state.owned.includes(id)) return "not-owned";
  if (state.installed.includes(id)) { state.installed = state.installed.filter(x => x !== id); saveGame(); return "removed"; }
  if (state.installed.length >= slotCount()) return "no-slots";
  state.installed.push(id); saveGame(); return "installed";
}
