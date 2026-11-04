// NEON GENESIS — worlds (save slots).
//
// Each world is a separate playthrough with its own name, story progress,
// credits, cyberware AND character look. Everything stays on this device.
//
// Storage:  neon-genesis-worlds            → { active, list: [{ id, name, created, lastPlayed }] }
//           neon-genesis-save:<id>         → story/progress save for that world
//           neon-genesis-appearance:<id>   → character look for that world
// The very first time this runs, an existing single save is moved into a
// world called "MY WORLD" so nobody loses progress.

const INDEX_KEY = "neon-genesis-worlds";
const MAX_WORLDS = 8;
let index = { active: null, list: [] };

const read = k => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const remove = k => { try { localStorage.removeItem(k); } catch {} };
const newId = () => "w" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
const saveIndex = () => write(INDEX_KEY, JSON.stringify(index));

function load() {
  try { const parsed = JSON.parse(read(INDEX_KEY) || "null"); if (parsed?.list?.length) index = parsed; } catch {}
  if (!index.list.length) {
    // First run with worlds: wrap the existing save (if any) into world #1.
    const id = newId();
    index = { active: id, list: [{ id, name: "MY WORLD", created: Date.now(), lastPlayed: Date.now() }] };
    const oldSave = read("neon-genesis-save"), oldLook = read("neon-genesis-appearance");
    if (oldSave) write("neon-genesis-save:" + id, oldSave);
    if (oldLook) write("neon-genesis-appearance:" + id, oldLook);
    saveIndex();
  }
  if (!index.list.some(w => w.id === index.active)) { index.active = index.list[0].id; saveIndex(); }
}
load();

export const activeWorld = () => index.list.find(w => w.id === index.active);
export const worldList = () => index.list.slice().sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
export const saveKey = () => "neon-genesis-save:" + index.active;
export const lookKey = () => "neon-genesis-appearance:" + index.active;
export const canCreate = () => index.list.length < MAX_WORLDS;

const cleanName = n => String(n || "").replace(/[<>]/g, "").trim().toUpperCase().slice(0, 20);

export function createWorld(name) {
  if (!canCreate()) return null;
  const id = newId();
  const w = { id, name: cleanName(name) || `WORLD ${index.list.length + 1}`, created: Date.now(), lastPlayed: Date.now() };
  // New worlds start with the current character look so you don't rebuild it.
  const look = read(lookKey());
  if (look) write("neon-genesis-appearance:" + id, look);
  index.list.push(w);
  index.active = id;
  saveIndex();
  return w;
}
export function selectWorld(id) {
  if (!index.list.some(w => w.id === id)) return false;
  index.active = id;
  touch();
  return true;
}
export function renameWorld(id, name) {
  const w = index.list.find(x => x.id === id);
  if (w && cleanName(name)) { w.name = cleanName(name); saveIndex(); }
}
export function deleteWorld(id) {
  if (index.list.length <= 1) return false;            // always keep at least one
  index.list = index.list.filter(w => w.id !== id);
  remove("neon-genesis-save:" + id); remove("neon-genesis-appearance:" + id);
  if (index.active === id) index.active = worldList()[0].id;
  saveIndex();
  return true;
}
export function touch() { const w = activeWorld(); if (w) w.lastPlayed = Date.now(); saveIndex(); }

// Short progress line for a world, read straight from its save.
export function summary(id) {
  try {
    const s = JSON.parse(read("neon-genesis-save:" + id) || "null");
    if (!s) return "NEW · NOT STARTED";
    const mains = ["m1", "m2", "m3", "m4", "m5", "m6"];
    const done = mains.filter(m => s.missions?.[m]?.status === "done").length;
    const part = s.flags?.chapter1_done || s.flags?.chapter3_done ? "CHAPTER 1 COMPLETE" : `PART ${Math.min(6, done + 1)}/6`;
    return `${part} · $${(s.credits ?? 500).toLocaleString()}`;
  } catch { return ""; }
}
