// NEON GENESIS — weapons.
//
// VR (holsters ride on your body, following where you face):
//   RIGHT HIP     sidearm (Kasumi P9 / Rattler SMG)   squeeze grip there to draw
//   CHEST         long gun (Breacher-6 / Longspike)    squeeze grip at your chest
//   LEFT SHOULDER blade (Neon Edge / Stun Baton)       reach to the top of your left shoulder
//   BELT BUCKLE   EMP grenade                          grab, throw, it pops after a short fuse
//   Let go of grip and the weapon snaps back to its holster.
//   TRIGGER fires. RELOAD: touch the bottom of the gun's grip with your other hand.
//   Longspike: hold the trigger to charge, let go to fire.
//   Blades: swing. Faster swing = harder hit. The katana knocks enemy bolts back.
// PC: 1 sidearm · 2 long gun · 3 blade (press again to put away) · 4 throw EMP
//     left click fire / swing · R reload.
import * as THREE from "three";
import { WEAPONS, AMMO, buildWeaponModel } from "./weaponmodels.js";
import { state, saveGame, effectiveStrength } from "./state.js";

export { WEAPONS, AMMO };
const SLOTS = ["sidearm", "long", "blade", "grenade"];

export function createWeapons({ root, scene, camera, player, renderer, city, game, combat, audio, haptic, getPCHand }) {
  const W = (state.weapons ||= { owned: [], ammo: { light: 0, shell: 0, cell: 0 }, mags: {}, loadout: { sidearm: null, long: null, blade: null }, grenades: 0 });
  W.ammo ||= { light: 0, shell: 0, cell: 0 }; W.mags ||= {}; W.loadout ||= {}; W.owned ||= [];
  W.racked = {};        // racking removed: guns reload themselves
  W.upgrades ||= {};    // weapon id → mod tier 0..3 (bought at Rook's)

  // ── weapon mods (Rook's MODS tab) ─────────────────────────────────────
  // Each tier adds damage and one perk. Guns: T1 bigger mag, T2 faster fire,
  // T3 tighter spread + extra mag. Blade: more damage per tier.
  const MOD_IDS = ["p9", "seeker", "rattler", "breacher", "longspike", "katana"];
  const MOD_COST = [300, 600, 1000];
  const MOD_NAMES = ["STOCK", "TUNED", "CUSTOM", "BLACK-MARKET"];
  const MOD_DMG = [1, 1.15, 1.3, 1.5];
  const defCache = new Map();
  function tierOf(id) { return Math.max(0, Math.min(3, W.upgrades[id] | 0)); }
  function defFor(id) {
    const base = WEAPONS[id], t = tierOf(id);
    if (!base || !t) return base;
    const key = id + t; if (defCache.has(key)) return defCache.get(key);
    const d = { ...base, damage: base.damage * MOD_DMG[t] };
    if (base.kind === "gun") {
      if (t >= 1 && base.mag) d.mag = Math.round(base.mag * (t >= 3 ? 1.5 : 1.25));
      if (t >= 2) { d.rate = base.rate * 0.85; if (base.charge) d.charge = base.charge * 0.85; }
      if (t >= 3 && base.spread) d.spread = base.spread * 0.6;
    }
    defCache.set(key, d); return d;
  }
  function modPerk(id, t) {
    const g = WEAPONS[id].kind === "gun";
    if (!g) return `+${Math.round((MOD_DMG[t] - 1) * 100)}% damage`;
    return [`+15% damage · bigger mag`, `+30% damage · bigger mag · 15% faster fire`, `+50% damage · +50% mag · faster fire · tighter spread`][t - 1];
  }
  // AMMO IS INFINITE: magazines always refill when you reload — you just have to reload.
  // Guns with a slide/pump that run dry also need it racked after the new mag goes in.
  const RACKS = { p9: "slide", seeker: "slide", rattler: "handle", breacher: "pump" };
  const sfx = n => audio?.play(n);
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), headP = new THREE.Vector3(), q1 = new THREE.Quaternion();

  // ── holsters on your body (VR) ────────────────────────────────────────
  const HOLSTER = {
    // tucked in against your body; grab radius is generous so you don't have to be exact
    sidearm: { at: new THREE.Vector3(0.2, -0.72, 0.0), r: 0.27, dir: new THREE.Vector3(0, -1, 0.15) },
    long:    { at: new THREE.Vector3(0.0, -0.36, -0.13), r: 0.24, dir: new THREE.Vector3(-0.55, 0.8, 0.1) },
    blade:   { at: new THREE.Vector3(-0.2, -0.12, -0.0), r: 0.2, dir: new THREE.Vector3(0.25, -0.55, 0.8) },
    grenade: { at: new THREE.Vector3(-0.02, -0.62, -0.19), r: 0.15, dir: new THREE.Vector3(0, 0, -1) }
  };
  const body = new THREE.Group(); body.name = "WEAPON_HOLSTERS"; scene.add(body);
  const holsterModels = {};       // slot → { id, model: marker }  (weapons stay invisible on your body; a small tag shows where they are)
  function equippedIn(slot) { return slot === "grenade" ? (W.grenades > 0 ? "emp" : null) : W.loadout[slot] || null; }
  function refreshHolsters() {
    // drop anything a save names that doesn't exist (old or hand-edited saves)
    W.owned = W.owned.filter(id => WEAPONS[id]);
    for (const k of ["sidearm", "long", "blade"]) if (W.loadout[k] && !W.owned.includes(W.loadout[k])) W.loadout[k] = null;
    defCache.clear();
    for (const slot of SLOTS) {
      const id = equippedIn(slot), cur = holsterModels[slot];
      if (cur?.id === id) continue;
      if (cur) body.remove(cur.model);
      if (!id) { delete holsterModels[slot]; continue; }
      const m = holsterMarker(id, slot);
      m.position.copy(HOLSTER[slot].at);
      m.visible = false;
      body.add(m); holsterModels[slot] = { id, model: m };
    }
  }
  function holsterMarker(id, slot) {
    const def = WEAPONS[id], col = "#" + new THREE.Color(def.color).getHexString();
    const c = document.createElement("canvas"); c.width = 256; c.height = 128; const x = c.getContext("2d");
    x.strokeStyle = col; x.lineWidth = 8; x.beginPath(); x.arc(64, 64, 44, 0, Math.PI * 2); x.stroke();
    x.fillStyle = col; x.beginPath(); x.arc(64, 64, 14, 0, Math.PI * 2); x.fill();
    x.font = "bold 40px Arial"; x.textBaseline = "middle"; x.fillText(def.short || def.name.split(" ")[0].toUpperCase(), 120, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    sp.scale.set(0.12, 0.06, 1); sp.renderOrder = 960; sp.center.set(0.25, 0.5);
    return sp;
  }
  refreshHolsters();
  let bodyYaw = 0;
  if (state.missions?.m2?.status === "done" && !W.owned.includes("p9")) {
    W.owned.push("p9"); W.loadout.sidearm ||= "p9"; W.mags.p9 = 12; saveGame(); refreshHolsters();
    setTimeout(() => game.toast("Mika left you her Kasumi P9 · it's on your right hip", "objective"), 4000);
  }
  function placeBody(dt) {
    camera.getWorldPosition(headP);
    camera.getWorldDirection(v1); v1.y = 0;
    if (v1.lengthSq() > 1e-4) { const want = Math.atan2(-v1.x, -v1.z); const d = Math.atan2(Math.sin(want - bodyYaw), Math.cos(want - bodyYaw)); bodyYaw += d * (Math.abs(d) > 0.6 ? 1 : 1 - Math.exp(-4 * dt)); }
    body.position.copy(headP); body.rotation.set(0, bodyYaw, 0);
  }
  const toBody = (p, out) => body.worldToLocal(out.copy(p));

  // ── held weapons ──────────────────────────────────────────────────────
  // held: side → { id, slot, model, cd, charge, reloadT, hist, kick, display }
  const held = new Map();
  const handState = new Map();          // side → { prevGrip, prevTrig }
  function ammoDisplay(model) {
    const c = document.createElement("canvas"); c.width = 128; c.height = 64;
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.025), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }));
    m.position.set(0, 0.075, 0.035); m.rotation.x = -0.55; model.add(m);
    let key = "";
    return {
      draw(id, reloading) {
        const def = WEAPONS[id], mag = W.mags[id] ?? 0, needRack = W.racked[id] === false && mag > 0;
        const k = `${mag}|${reloading}|${needRack}`; if (k === key) return; key = k;
        const x = c.getContext("2d"); x.clearRect(0, 0, 128, 64);
        x.fillStyle = "rgba(4,8,18,0.8)"; x.fillRect(0, 0, 128, 64);
        x.textAlign = "center"; x.textBaseline = "middle";
        if (needRack) { x.fillStyle = "#ffcf4a"; x.font = "bold 30px Arial"; x.fillText(RACKS[id] === "pump" ? "PUMP ◂" : "RACK ◂", 64, 34); }
        else if (mag === 0) { x.fillStyle = "#ff3a4a"; x.font = "bold 30px Arial"; x.fillText("RELOAD", 64, 34); }
        else {
          x.fillStyle = reloading ? "#ffcf4a" : "#" + new THREE.Color(def.color).getHexString();
          x.font = "bold 38px Arial"; x.fillText(`${mag}`, 46, 34);
          x.fillStyle = "#c8d4ea"; x.font = "bold 26px Arial"; x.fillText("/∞", 100, 36);
        }
        t.needsUpdate = true;
      }
    };
  }
  function draw(side, slot, hostObj, pc = false) {
    const id = equippedIn(slot); if (!id) return null;
    const def = defFor(id);
    const model = buildWeaponModel(id);
    if (pc) {
      if (def.kind === "melee") { model.position.set(0.3, -0.32, -0.55); model.rotation.set(0.95, 0.35, -0.25); }
      else if (def.kind === "throw") { model.position.set(0.25, -0.25, -0.5); }
      else { model.position.set(0.21, -0.22, -0.5); if (def.slot === "long") { model.position.set(0.24, -0.27, -0.5); model.scale.setScalar(0.85); } }
    } else {
      model.position.set(0, -0.012, -0.075);
      if (def.kind === "melee") model.rotation.x = 0.85;
      if (def.kind === "throw") model.position.set(0, 0, -0.085);
    }
    hostObj.add(model);
    const h = { id, slot, def, model, cd: 0, charge: 0, reloadT: 0, kick: 0, hist: [], pc, host: hostObj, display: def.kind === "gun" ? ammoDisplay(model) : null, swingT: 0, hitCd: new Map() };
    if (W.mags[id] === undefined && def.mag) W.mags[id] = def.mag;
    const sl = model.userData.slide; if (sl) sl.userData.home = sl.position.z;
    held.set(side, h);
    sfx("draw");
    return h;
  }
  function holster(side, silent) {
    const h = held.get(side); if (!h) return;
    h.host.remove(h.model); held.delete(side);
    if (!silent) sfx("holster");
  }

  // ── shooting ──────────────────────────────────────────────────────────
  const tracers = Array.from({ length: 24 }, () => {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    l.frustumCulled = false; l.visible = false; root.add(l); return { l, t: 0 };
  });
  let tn = 0;
  function tracer(a, b, color, life = 0.07) {
    const tr = tracers[tn = (tn + 1) % tracers.length];
    const p = tr.l.geometry.attributes.position; p.setXYZ(0, a.x, a.y, a.z); p.setXYZ(1, b.x, b.y, b.z); p.needsUpdate = true;
    tr.l.material.color.set(color); tr.l.material.opacity = 1; tr.l.visible = true; tr.t = life; tr.life = life;
  }
  // first wall (or the ground) along a ray
  function wallDistance(o, d, max) {
    for (let s = 0.4; s < max; s += 0.35) {
      const x = o.x + d.x * s, y = o.y + d.y * s, z = o.z + d.z * s;
      if (y < 0.02 || city.collides(x, z, y - 1, 0.02)) return s;
    }
    return max;
  }
  // closest distance between the ray and a vertical segment (people) or a point (drones)
  function rayVsEnemy(o, d, e, out) {
    combat.hitCenter(e, v3);
    if (e.human) {
      const s = e.type === "sergeant" ? 1.24 : 1.08;
      const bottom = e.group.position.y + 0.25, top = e.group.position.y + 1.72 * s;
      // solve in the horizontal plane, then check the height at that point
      const dx = d.x, dz = d.z, len2 = dx * dx + dz * dz;
      const t = len2 > 1e-6 ? ((v3.x - o.x) * dx + (v3.z - o.z) * dz) / len2 : 0;
      if (t < 0) return null;
      const px = o.x + dx * t, pz = o.z + dz * t, py = o.y + d.y * t;
      const r = e.def.radius * 0.85;
      if (Math.hypot(px - v3.x, pz - v3.z) > r || py < bottom || py > top + 0.05) return null;
      out.set(px, py, pz);
      return { t, head: py > top - 0.3 };
    }
    const toC = v2.subVectors(v3, o), t = toC.dot(d);
    if (t < 0) return null;
    const closest = v1.copy(o).addScaledVector(d, t);
    if (closest.distanceTo(v3) > e.def.radius + 0.12) return null;
    out.copy(closest); return { t, head: false };
  }
  function shootRay(o, d, def, dmgScale = 1) {
    const max = 70, wall = wallDistance(o, d, max);
    const hits = [];
    for (const e of combat.enemies) {
      if (e.dead || e.cine) continue;
      const at = new THREE.Vector3(); const h = rayVsEnemy(o, d, e, at);
      if (h && h.t < wall) hits.push({ e, at, ...h });
    }
    hits.sort((a, b) => a.t - b.t);
    // a citizen standing in the way takes the shot instead (or as well, for the rail)
    const civ = game.npcSys?.rayHit(o, d, Math.min(wall, def.pierce ? wall : hits[0]?.t ?? wall));
    if (civ) {
      game.npcSys.hurt(civ.npc, def.damage * dmgScale, d);
      combat.burst(civ.at, 0xff3a4a, 10, 2);
      if (!def.pierce) return civ.at;
    }
    const list = def.pierce ? hits : hits.slice(0, 1);
    for (const h of list) {
      const dmg = def.damage * dmgScale * (h.head ? 1.8 : 1);
      combat.damageEnemy(h.e, dmg, d, { stun: def.pierce ? 0.6 : def.pellets ? 0.12 : 0.08, color: h.head ? 0xffffff : def.color });
      if (h.head && !h.e.dead) game.toast?.("HEADSHOT", "credits");
    }
    const end = list.length && !def.pierce ? list[0].at : v1.copy(o).addScaledVector(d, wall).clone();
    if (!list.length || def.pierce) { combat.burst(end, 0xffcf8a, 6, 1.6); }
    game.npcSys?.startle(end, 7);
    return end;
  }
  // ── smart-link: lock on to the enemy closest to where you point, rounds steer onto it
  const reticleTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 128; const x = c.getContext("2d");
    x.strokeStyle = "#7dff9a"; x.lineWidth = 7;
    for (let k = 0; k < 4; k++) { x.beginPath(); x.arc(64, 64, 48, k * Math.PI / 2 + 0.25, k * Math.PI / 2 + Math.PI / 2 - 0.25); x.stroke(); }
    x.fillStyle = "#7dff9a"; x.beginPath(); x.arc(64, 64, 7, 0, Math.PI * 2); x.fill();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const reticle = new THREE.Sprite(new THREE.SpriteMaterial({ map: reticleTex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
  reticle.renderOrder = 970; reticle.visible = false; root.add(reticle);
  function findLock(o, d) {
    let best = null, bestA = 0.42;                 // ~24° cone
    for (const e of combat.enemies) {
      if (e.dead || e.cine) continue;
      const c = combat.hitCenter(e, new THREE.Vector3()), to = c.clone().sub(o), dist = to.length();
      if (dist > 32 || dist < 0.5) continue;
      const a = to.normalize().angleTo(d);
      if (a < bestA && wallDistance(o, to, dist) >= dist - 0.3) { bestA = a; best = e; }
    }
    return best;
  }
  const smartRounds = [];
  const roundGeo = new THREE.CapsuleGeometry(0.012, 0.09, 3, 6), roundMat = new THREE.MeshBasicMaterial({ color: 0x9dffb5, toneMapped: false });
  function fireSmart(h, origin, dir, muzzlePos) {
    const m = new THREE.Mesh(roundGeo, roundMat); m.position.copy(muzzlePos); root.add(m);
    smartRounds.push({ m, vel: dir.clone().multiplyScalar(34), target: h.lock && !h.lock.dead ? h.lock : null, life: 1.6, dmg: h.def.damage, prev: muzzlePos.clone() });
  }
  function updateSmart(dt) {
    for (let i = smartRounds.length - 1; i >= 0; i--) {
      const r = smartRounds[i]; r.life -= dt;
      if (r.target && !r.target.dead) {
        const want = combat.hitCenter(r.target, v3).sub(r.m.position).normalize().multiplyScalar(34);
        r.vel.lerp(want, 1 - Math.exp(-9 * dt));        // steer onto the locked target
      }
      r.prev.copy(r.m.position); r.m.position.addScaledVector(r.vel, dt);
      r.m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v1.copy(r.vel).normalize());
      tracer(r.prev, r.m.position, 0x7dff9a, 0.12);
      let hit = r.life <= 0 || r.m.position.y < 0.02 || city.collides(r.m.position.x, r.m.position.z, r.m.position.y - 1, 0.02);
      if (!hit) { const n = game.npcSys?.at(r.m.position, 0.05); if (n) { game.npcSys.hurt(n, r.dmg, v1.copy(r.vel).normalize()); hit = true; } }
      if (!hit) for (const e of combat.enemies) {
        if (e.dead || e.cine) continue;
        const c = combat.hitCenter(e, v3);
        const near = e.human ? Math.hypot(r.m.position.x - c.x, r.m.position.z - c.z) < e.def.radius * 0.9 && r.m.position.y > e.group.position.y + 0.2 && r.m.position.y < e.group.position.y + 2 : r.m.position.distanceTo(c) < e.def.radius + 0.14;
        if (near) { combat.damageEnemy(e, r.dmg, v1.copy(r.vel).normalize(), { stun: 0.1, color: 0x7dff9a }); hit = true; break; }
      }
      if (hit) { combat.burst(r.m.position, 0x7dff9a, 8, 1.8); game.npcSys?.startle(r.m.position, 6); root.remove(r.m); smartRounds.splice(i, 1); }
    }
  }
  function fire(h, origin, dir, muzzlePos, side) {
    const def = h.def;
    if ((W.mags[h.id] || 0) <= 0) { startReload(h); return; }
    W.mags[h.id]--;
    if (W.mags[h.id] === 0) h.autoReload = def.rate + 0.05;              // empty → reloads itself right after this shot
    if (def.smart) {
      fireSmart(h, origin, dir, muzzlePos);
      combat.flash(muzzlePos, 0x7dff9a, 0.4); sfx("smart"); haptic?.(side, 0.45, 40);
      h.kick = 0.12; h.cd = def.rate; saveGameSoon(); return;
    }
    const shots = def.pellets || 1;
    for (let i = 0; i < shots; i++) {
      const d = dir.clone();
      if (def.spread) { d.x += (Math.random() - 0.5) * def.spread * 2; d.y += (Math.random() - 0.5) * def.spread * 2; d.z += (Math.random() - 0.5) * def.spread * 2; d.normalize(); }
      const end = shootRay(origin, d, def, h.chargeScale || 1);
      tracer(muzzlePos, end, def.pierce ? 0x9ffcff : def.color, def.pierce ? 0.25 : 0.06);
    }
    combat.flash(muzzlePos, def.pierce ? 0x9ffcff : 0xffd27a, def.pierce ? 1.1 : def.pellets ? 0.9 : 0.45);
    sfx(h.id === "p9" || h.id === "seeker" ? "pistol" : h.id === "rattler" ? "smg" : h.id === "breacher" ? "shotgun" : "rail");
    haptic?.(side, def.pierce || def.pellets ? 1 : 0.55, def.pierce ? 140 : 50);
    h.kick = def.pierce ? 0.35 : def.pellets ? 0.28 : def.auto ? 0.06 : 0.14;
    h.cd = def.rate;
    saveGameSoon();
  }
  let saveT = 0; const saveGameSoon = () => { saveT = 1.5; };
  let hintAt = -1e9;
  function emptyHint(h) { if (h) startReload(h); }

  // step 1: a fresh magazine (always full — ammo is infinite)
  function startReload(h) {
    const def = h.def; if (def.kind !== "gun" || h.reloadT > 0) return false;
    if ((W.mags[h.id] || 0) >= def.mag) return false;
    h.reloadT = def.pellets ? 0.9 : def.pierce ? 0.9 : def.auto ? 0.8 : 0.65; sfx("reload"); return true;
  }
  function finishReload(h) { W.mags[h.id] = h.def.mag; W.racked[h.id] = true; h.pull = RACKS[h.id] === "pump" ? 0.07 : RACKS[h.id] === "handle" ? 0.05 : 0.035; if (RACKS[h.id]) sfx(RACKS[h.id] === "pump" ? "pump" : "rack"); saveGameSoon(); }
  // step 2 (only after running dry): rack the slide / pump
  function rack(h, side) {
    W.racked[h.id] = true; saveGameSoon();
    sfx(RACKS[h.id] === "pump" ? "pump" : "rack"); haptic?.(side, 0.7, 60);
  }

  // ── melee ─────────────────────────────────────────────────────────────
  const segClosest = (a, b, p, out) => { const ab = v2.subVectors(b, a), t = THREE.MathUtils.clamp(v3.subVectors(p, a).dot(ab) / Math.max(1e-6, ab.lengthSq()), 0, 1); return out.copy(a).addScaledVector(ab, t); };
  function meleeHits(h, base, tip, speed, dirMove, side) {
    const def = h.def;
    for (const [e, t] of h.hitCd) { if (t - performance.now() < 0) h.hitCd.delete(e); }
    for (const e of combat.enemies) {
      if (e.dead || e.cine || h.hitCd.has(e)) continue;
      const c = combat.hitCenter(e, new THREE.Vector3());
      const r = e.human ? e.def.radius * 0.9 : e.def.radius + 0.12;
      let hit = false;
      if (e.human) {
        // sample along the blade against the body column
        for (let k = 0; k <= 4 && !hit; k++) { const p = v1.copy(base).lerp(tip, k / 4); if (Math.hypot(p.x - c.x, p.z - c.z) < r && p.y > e.group.position.y + 0.2 && p.y < e.group.position.y + 1.95) hit = true; }
      } else hit = segClosest(base, tip, c, v1).distanceTo(c) < r;
      if (!hit) continue;
      h.hitCd.set(e, performance.now() + 380);
      const dmg = def.damage * THREE.MathUtils.clamp(speed / 5, 0.6, 1.8) * (1 + 0.12 * effectiveStrength());
      if (!e.aware) combat.takedown(e, dirMove);
      else if (combat.isWindingUp(e)) combat.counter(e, dmg, dirMove);
      else combat.damageEnemy(e, dmg, dirMove, { stun: def.stun || 0.25, color: def.color });
      sfx(h.id === "baton" ? "batonHit" : "slice");
      haptic?.(side, 1, 90);
    }
    // citizens caught by the swing
    for (let k = 1; k <= 4; k++) {
      const p = v1.copy(base).lerp(tip, k / 4), n = game.npcSys?.at(p, 0.05);
      if (n && !h.hitCd.has(n)) { h.hitCd.set(n, performance.now() + 500); game.npcSys.hurt(n, def.damage * THREE.MathUtils.clamp(speed / 5, 0.6, 1.8), dirMove); sfx(h.id === "baton" ? "batonHit" : "slice"); break; }
    }
    // katana: knock enemy bolts back
    if (h.id === "katana") for (const b of combat.bolts) {
      if (b.friendly) continue;
      if (segClosest(base, tip, b.mesh.position, v1).distanceTo(b.mesh.position) > 0.16) continue;
      b.friendly = true; b.damage = 24; b.life = 2;
      b.vel.multiplyScalar(-1.6);
      b.mesh.material = combat.mat.pulseBolt; b.mesh.children[0]?.material?.color?.set(0xff4fd8);
      combat.burst(b.mesh.position, 0xff4fd8, 14, 2.5); sfx("slice"); haptic?.(side, 0.8, 60);
      game.toast("DEFLECTED", "credits");
    }
  }

  // ── grenades ──────────────────────────────────────────────────────────
  const live = [];
  function throwGrenade(from, vel) {
    if (W.grenades <= 0) return;
    W.grenades--; saveGameSoon(); refreshHolsters();
    const m = buildWeaponModel("emp"); m.position.copy(from); root.add(m);
    live.push({ m, vel: vel.clone(), fuse: 1.5 });
    sfx("draw");
  }
  function blast(at) {
    sfx("empBlast");
    combat.flash(at, 0x38f0e6, 4.5); combat.burst(at, 0x38f0e6, 60, 7, 2); combat.burst(at, 0xffffff, 24, 4);
    for (const e of combat.enemies) {
      if (e.dead) continue;
      const c = combat.hitCenter(e, new THREE.Vector3()), d = c.distanceTo(at);
      if (d > WEAPONS.emp.radius) continue;
      const k = 1 - d / WEAPONS.emp.radius;
      combat.damageEnemy(e, WEAPONS.emp.damage * (0.4 + 0.6 * k) * (e.human ? 1 : 1.8), c.sub(at).normalize(), { stun: 2.5, color: 0x38f0e6 });
    }
    game.npcSys?.startle(at, 12);
    for (const n of game.npcSys?.npcs || []) { if (n.holder.position.distanceTo(at) < WEAPONS.emp.radius) game.npcSys.hurt(n, 30, n.holder.position.clone().sub(at).setY(0).normalize()); }
    camera.getWorldPosition(headP); if (headP.distanceTo(at) < 3) combat.debugHurt?.(8);
  }

  // ── per frame ─────────────────────────────────────────────────────────
  const prevTip = new Map(), prevHand = new Map();
  function update(time, dt, hands, opts = {}) {
    const vr = renderer.xr.isPresenting, showBody = vr || window.__showHolsters;
    body.visible = !!showBody;
    if (showBody) { placeBody(dt); refreshHolsters(); }
    // fade tracers
    for (const tr of tracers) if (tr.t > 0) { tr.t -= dt; tr.l.material.opacity = Math.max(0, tr.t / tr.life); if (tr.t <= 0) tr.l.visible = false; }
    // grenades in flight
    for (let i = live.length - 1; i >= 0; i--) {
      const g = live[i]; g.fuse -= dt;
      g.vel.y -= 9.8 * dt; g.m.position.addScaledVector(g.vel, dt); g.m.rotation.x += dt * 8;
      const ground = city.surfaceAt ? city.surfaceAt(g.m.position.x, g.m.position.z, g.m.position.y + 0.3) : 0;
      if (g.m.position.y < ground + 0.04) { g.m.position.y = ground + 0.04; g.vel.y *= -0.35; g.vel.x *= 0.6; g.vel.z *= 0.6; }
      if (city.collides(g.m.position.x, g.m.position.z, g.m.position.y - 1, 0.05)) { g.vel.x *= -0.4; g.vel.z *= -0.4; }
      if (g.fuse <= 0) { blast(g.m.position.clone()); root.remove(g.m); live.splice(i, 1); }
    }
    if (saveT > 0 && (saveT -= dt) <= 0) saveGame();
    updateSmart(dt);
    // smart-link lock-on for whichever hand holds the Seeker
    let locked = null;
    for (const [, h] of held) {
      if (!h.def.smart) continue;
      if (h.pc) { camera.getWorldPosition(v1); camera.getWorldDirection(v2); }
      else { h.model.userData.muzzle.getWorldPosition(v1); h.model.getWorldDirection(v2).negate(); }
      const e = findLock(v1.clone(), v2.clone());
      if (e !== h.lock && e) sfx("click");
      h.lock = e; if (e) locked = e;
    }
    reticle.visible = !!locked;
    if (locked) { combat.hitCenter(locked, reticle.position); camera.getWorldPosition(v1); const d = reticle.position.distanceTo(v1); reticle.scale.setScalar(0.06 * d + 0.25); reticle.material.rotation += dt * 2; }
    if (vr) updateVR(hands, dt); else updatePC(dt, opts);
    // per-weapon timers, recoil, ammo display
    for (const [side, h] of held) {
      h.cd = Math.max(0, h.cd - dt);
      if (h.autoReload > 0 && (h.autoReload -= dt) <= 0) { h.autoReload = 0; startReload(h); }
      if (h.reloadT > 0 && (h.reloadT -= dt) <= 0) { h.reloadT = 0; finishReload(h); sfx("click"); haptic?.(side, 0.4, 40); }
      // slide / pump: locked back when empty, follows your hand while you rack it, springs home
      const sl = h.model.userData.slide;
      if (sl) {
        const travel = RACKS[h.id] === "pump" ? 0.07 : RACKS[h.id] === "handle" ? 0.05 : 0.035;
        const want = h.reloadT > 0 ? travel : h.pull != null ? h.pull : 0;    // slide sits back while reloading, snaps home after
        h.pull = h.pull != null ? Math.max(0, h.pull - dt * 0.6) || null : null;
        sl.position.z = sl.userData.home + Math.min(travel, want);
      }
      h.kick = Math.max(0, h.kick - dt * 3);
      const baseX = h.pc ? (h.def.kind === "melee" ? 0.95 : 0) : (h.def.kind === "melee" ? 0.85 : 0);
      if (h.def.kind === "gun") h.model.rotation.x = baseX + h.kick;
      if (h.reloadT > 0) h.model.rotation.z = Math.sin(h.reloadT * 14) * 0.12; else if (h.def.kind === "gun") h.model.rotation.z = 0;
      if (h.def.pierce && h.model.userData.core) h.model.userData.core.scale.y = 1 + h.charge * 1.5, h.model.userData.core.material.color.setHex(h.charge >= h.def.charge ? 0xffffff : h.def.color);
      h.display?.draw(h.id, h.reloadT > 0);
    }
  }
  function updateVR(hands, dt) {
    // holsters stay hidden until a free hand comes near one (keeps your view clean when you look down)
    const near = new Map();          // slot → 0..1 how close a free hand is
    for (const hd of hands) {
      if (!hd.controller || held.has(hd.side)) continue;
      hd.controller.getWorldPosition(v1); toBody(v1, v2);
      const st = handState.get(hd.side) || {};
      const inNow = new Set();
      for (const slot of SLOTS) {
        if (!equippedIn(slot) || [...held.values()].some(h => h.slot === slot)) continue;
        const d = v2.distanceTo(HOLSTER[slot].at), r = HOLSTER[slot].r;
        if (d < r * 1.8) near.set(slot, Math.max(near.get(slot) || 0, d < r ? 1 : 0.45));
        if (d < r) { inNow.add(slot); if (!st.inZone?.has(slot)) haptic?.(hd.side, 0.15, 18); }     // little tick when you can grab
      }
      st.inZone = inNow;
    }
    for (const slot of SLOTS) {
      const hm = holsterModels[slot]; if (!hm) continue;
      const k = near.get(slot) || (window.__showHolsters ? 1 : 0);
      hm.model.visible = k > 0; hm.model.material.opacity = k;
    }
    for (const hd of hands) {
      if (!hd.object || !hd.controller) continue;
      const side = hd.side;
      let st = handState.get(side); if (!st) { st = { prevGrip: 0, prevTrig: 0, hist: [] }; handState.set(side, st); }
      hd.controller.getWorldPosition(v1);
      const palm = v1.clone();
      st.hist.push([palm.clone(), dt]); if (st.hist.length > 5) st.hist.shift();
      const grabbing = hd.grip > 0.7 && st.prevGrip <= 0.5, letGo = hd.grip < 0.35 && st.prevGrip >= 0.35;
      st.prevGrip = hd.grip;
      let h = held.get(side);
      hd.busy = !!h;
      if (!h && grabbing && !game.isPanelOpen()) {
        const local = toBody(palm, v2);
        let best = null, bd = 1e9;
        for (const slot of SLOTS) { if (!equippedIn(slot)) continue; const other = [...held.values()].find(x => x.slot === slot); if (other) continue; const d = local.distanceTo(HOLSTER[slot].at); if (d < HOLSTER[slot].r && d < bd) { bd = d; best = slot; } }
        if (best) { h = draw(side, best, hd.controller); hd.busy = true; haptic?.(side, 0.5, 50); }
      }
      if (!h) { st.prevTrig = hd.trigger; continue; }
      if (letGo) {
        if (h.def.kind === "throw") {
          // throw with the hand's motion
          let vel = new THREE.Vector3();
          if (st.hist.length > 2) { const [a] = st.hist[0], tot = st.hist.slice(1).reduce((s, x) => s + x[1], 0); vel.subVectors(palm, a).divideScalar(Math.max(tot, 1e-3)).multiplyScalar(1.25); }
          holster(side, true); throwGrenade(palm, vel);
        } else holster(side);
        st.prevTrig = hd.trigger; continue;
      }
      // trigger
      const down = hd.trigger > 0.6, pressed = down && st.prevTrig <= 0.6, released = !down && st.prevTrig > 0.6;
      st.prevTrig = hd.trigger;
      if (h.def.kind === "gun" && h.reloadT <= 0) {
        h.model.userData.muzzle.getWorldPosition(v1);
        const dir = h.model.getWorldDirection(v2).negate().clone();
        if (h.def.charge) {
          if (pressed && (W.mags[h.id] || 0) > 0 && h.cd <= 0) { h.charging = true; h.charge = 0; sfx("railCharge"); }
          if (h.charging && down) { h.charge = Math.min(h.def.charge, h.charge + dt); if (h.charge >= h.def.charge) haptic?.(side, 0.15, 20); }
          if (h.charging && released) { h.charging = false; h.chargeScale = 0.35 + 0.65 * (h.charge / h.def.charge); fire(h, v1.clone(), dir, v1.clone(), side); h.charge = 0; }
          if (pressed && (W.mags[h.id] || 0) <= 0) { emptyHint(h); }
        } else if (h.cd <= 0 && (pressed || (h.def.auto && down))) fire(h, v1.clone(), dir, v1.clone(), side);
      }
      // melee swings
      if (h.def.kind === "melee") {
        const base = h.model.getWorldPosition(new THREE.Vector3());
        const tip = h.model.localToWorld(new THREE.Vector3(0, 0, -(h.model.userData.bladeLen || 0.8)));
        const prev = prevTip.get(side);
        if (prev) {
          const speed = tip.distanceTo(prev) / Math.max(dt, 1e-3);
          if (speed > 2.2) meleeHits(h, base, tip, speed, v1.subVectors(tip, prev).normalize().clone(), side);
        }
        prevTip.set(side, tip);
      }
    }
  }

  // ── PC ────────────────────────────────────────────────────────────────
  let pcDown = false, pcSwing = 0;
  function updatePC(dt, opts) {
    // VR models left in hands when leaving VR
    for (const [side, h] of held) if (!h.pc) holster(side, true);
    const h = held.get("pc"); if (!h) return;
    const hand = getPCHand?.(); if (hand) hand.visible = false;
    if (game.isPanelOpen()) return;
    camera.getWorldPosition(v1); camera.getWorldDirection(v2);
    if (h.def.kind === "gun" && h.reloadT <= 0) {
      h.model.userData.muzzle.getWorldPosition(v3);
      if (h.def.charge) {
        if (pcDown && !h.charging && h.cd <= 0) { if ((W.mags[h.id] || 0) > 0) { h.charging = true; h.charge = 0; sfx("railCharge"); } else { sfx("dryFire"); emptyHint(h); pcDown = false; } }
        if (h.charging && pcDown) h.charge = Math.min(h.def.charge, h.charge + dt);
        if (h.charging && !pcDown) { h.charging = false; h.chargeScale = 0.35 + 0.65 * (h.charge / h.def.charge); fire(h, v1.clone(), v2.clone(), v3.clone(), "right"); h.charge = 0; }
      } else if (pcDown && h.cd <= 0) { fire(h, v1.clone(), v2.clone(), v3.clone(), "right"); if (!h.def.auto) pcDown = false; }
    }
    if (h.def.kind === "melee") {
      if (pcDown && pcSwing <= 0) { pcSwing = 0.32; pcDown = false; pcMelee(h); }
      if (pcSwing > 0) { pcSwing -= dt; const k = 1 - pcSwing / 0.32; h.model.rotation.set(0.95 - Math.sin(k * Math.PI) * 1.4, 0.35 + Math.sin(k * Math.PI) * 0.9, -0.25 - Math.sin(k * Math.PI) * 0.8); }
      else h.model.rotation.set(0.95, 0.35, -0.25);
    }
  }
  function pcMelee(h) {
    camera.getWorldPosition(v1); camera.getWorldDirection(v2);
    sfx(h.id === "baton" ? "batonHit" : "slice");
    let best = null, bd = 1e9;
    for (const e of combat.enemies) {
      if (e.dead || e.cine) continue;
      const c = combat.hitCenter(e, new THREE.Vector3()); const to = c.clone().sub(v1); const d = to.length();
      if (d > 2.6 + e.def.radius) continue;
      if (to.normalize().dot(v2) < 0.55) continue;
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) {
      const p = v1.clone().addScaledVector(v2, 1.4); p.y -= 0.4;
      const n = game.npcSys?.at(p, 0.6); if (n) game.npcSys.hurt(n, h.def.damage * 1.2, v2.clone());
      return;
    }
    const dmg = h.def.damage * 1.2 * (1 + 0.12 * effectiveStrength());
    if (!best.aware) combat.takedown(best, v2.clone());
    else if (combat.isWindingUp(best)) combat.counter(best, dmg, v2.clone());
    else combat.damageEnemy(best, dmg, v2.clone(), { stun: h.def.stun || 0.3, color: h.def.color });
  }
  function pcEquip(slot) {
    const cur = held.get("pc");
    if (slot === "grenade") { pcThrow(); return true; }
    if (cur) { const same = cur.slot === slot; holster("pc"); const hand = getPCHand?.(); if (hand) hand.visible = true; if (same) return true; }
    if (!equippedIn(slot)) { game.toast(slot === "sidearm" ? "No sidearm yet." : slot === "long" ? "No long gun yet — Rook sells them." : "No blade yet.", "warn"); return true; }
    draw("pc", slot, camera, true);
    return true;
  }
  function pcThrow() {
    if (W.grenades <= 0) { game.toast("No EMP grenades. Rook sells them.", "warn"); return; }
    camera.getWorldPosition(v1); camera.getWorldDirection(v2);
    throwGrenade(v1.clone().addScaledVector(v2, 0.4), v2.clone().multiplyScalar(11).add(new THREE.Vector3(0, 3, 0)));
  }

  // ── inventory & Rook's store ──────────────────────────────────────────
  function give(id, ammo = 0, equip) {
    const def = WEAPONS[id]; if (!def) return;
    if (id === "emp") { W.grenades = Math.min(6, W.grenades + Math.max(1, ammo || 1)); refreshHolsters(); saveGame(); return; }
    if (!W.owned.includes(id)) W.owned.push(id);
    if (equip ?? !W.loadout[def.slot]) W.loadout[def.slot] = id;      // a dropped baton won't replace the katana you chose
    if (def.mag && W.mags[id] === undefined) W.mags[id] = def.mag;
    refreshHolsters(); saveGame();
    game.toast(`WEAPON ACQUIRED · ${def.name.toUpperCase()}`, "chapter");
  }
  function addAmmo() {}      // ammo is infinite now
  // TEST MODE: everything at Rook's is free. Set to false to restore prices.
  const FREE_ARMS = false;
  const cost = p => FREE_ARMS ? 0 : p;
  const buyLabel = p => FREE_ARMS ? "GET · FREE" : `BUY $${p}`;
  const where = { sidearm: "RIGHT HIP", long: "CHEST", blade: "LEFT SHOULDER", grenade: "BELT" };
  const store = {
    title: "ROOK'S · THINGS THAT GO BANG", accent: "#ffb02e", tabColor: "#a8641a",
    tabs: [{ id: "guns", label: "GUNS" }, { id: "blades", label: "BLADES & EMP" }, { id: "mods", label: "MODS" }],
    subtitle: () => `HIP ${WEAPONS[W.loadout.sidearm]?.name || "—"} · CHEST ${WEAPONS[W.loadout.long]?.name || "—"}`,
    rows(cat) {
      const can = p => state.credits >= cost(p) ? "#a8641a" : "#56607a";
      if (cat === "mods") return MOD_IDS.map(id => {
        const d = WEAPONS[id], t = tierOf(id), owned = W.owned.includes(id), next = t + 1;
        let label, col;
        if (!owned) { label = "NOT OWNED"; col = "#56607a"; }
        else if (t >= 3) { label = "MAXED"; col = "#2a8a6a"; }
        else { label = `${MOD_NAMES[next]} $${MOD_COST[t]}`; col = can(MOD_COST[t]); }
        return { id: "mod:" + id, name: d.name, color: "#" + new THREE.Color(d.color).getHexString(), tag: `MOD ${t}/3 · ${MOD_NAMES[t]}`,
          desc: !owned ? "Buy it first, then Rook can work on it." : t >= 3 ? "Nothing left to bolt on. It's a monster." : `Next: ${modPerk(id, next)}`, label, buttonColor: col };
      });
      if (cat === "ammo") return Object.entries(AMMO).map(([k, a]) => ({ id: "ammo:" + k, name: `${a.name} ×${a.pack}`, tag: `YOU HAVE ${W.ammo[k] || 0} / ${a.max}`, desc: k === "light" ? "Fits the Kasumi P9 and the Rattler." : k === "shell" ? "Breacher-6 shells." : "Longspike rail cells.", label: (W.ammo[k] || 0) >= a.max ? "FULL" : buyLabel(a.price), buttonColor: (W.ammo[k] || 0) >= a.max ? "#56607a" : can(a.price) }));
      const ids = cat === "guns" ? ["p9", "seeker", "rattler", "breacher", "longspike"] : ["katana", "baton", "emp"];
      return ids.map(id => {
        const d = WEAPONS[id], owned = W.owned.includes(id), equipped = W.loadout[d.slot] === id;
        let label, col;
        if (id === "emp") { label = W.grenades >= 6 ? "FULL" : buyLabel(d.price); col = W.grenades >= 6 ? "#56607a" : can(d.price); }
        else if (equipped) { label = "EQUIPPED"; col = "#2a8a6a"; }
        else if (owned) { label = "EQUIP"; col = "#2a6a8a"; }
        else if (!d.price && !FREE_ARMS) { label = "NOT FOR SALE"; col = "#56607a"; }
        else { label = buyLabel(d.price); col = can(d.price); }
        return { id, name: d.name, color: "#" + new THREE.Color(d.color).getHexString(), tag: id === "emp" ? `${where.grenade} · YOU HAVE ${W.grenades}` : `${where[d.slot]}`, desc: d.desc, label, buttonColor: col };
      });
    },
    click(id) {
      if (id.startsWith("mod:")) {
        const wid = id.slice(4), t = tierOf(wid);
        if (!W.owned.includes(wid)) return "Buy it first.";
        if (t >= 3) return "Already black-market spec.";
        if (state.credits < MOD_COST[t]) return "Not enough credits.";
        state.credits -= MOD_COST[t]; W.upgrades[wid] = t + 1; defCache.clear();
        // re-arm anything you're holding so the new stats apply right away
        for (const h of held.values()) if (h.id === wid) h.def = defFor(wid);
        saveGame(); audio?.play("credits");
        return `${WEAPONS[wid].name}: ${MOD_NAMES[t + 1]} mod installed.`;
      }
      if (id.startsWith("ammo:")) {
        const k = id.slice(5), a = AMMO[k];
        if ((W.ammo[k] || 0) >= a.max) return "Can't carry more.";
        if (state.credits < cost(a.price)) return "Not enough credits.";
        state.credits -= cost(a.price); addAmmo(k, a.pack); saveGame(); return `+${a.pack} ${a.name.toLowerCase()}.`;
      }
      const d = WEAPONS[id];
      if (id === "emp") { if (W.grenades >= 6) return "Six is plenty."; if (state.credits < cost(d.price)) return "Not enough credits."; state.credits -= cost(d.price); W.grenades++; refreshHolsters(); saveGame(); return `EMP grenade. You have ${W.grenades}.`; }
      if (W.owned.includes(id)) { W.loadout[d.slot] = id; for (const [s, h] of held) if (h.slot === d.slot) holster(s, true); refreshHolsters(); saveGame(); return `${d.name} equipped (${where[d.slot].toLowerCase()}).`; }
      if (!d.price && !FREE_ARMS) return id === "baton" ? "Take one off a Tenkai enforcer." : "Not for sale.";
      if (state.credits < cost(d.price)) return "Not enough credits.";
      state.credits -= cost(d.price); give(id, d.ammo ? AMMO[d.ammo].pack * 2 : 0, true); return `${d.name} is yours. It's on your ${where[d.slot].toLowerCase()}.`;
    }
  };

  return {
    update, give, addAmmo, store, refreshHolsters,
    heldDef: side => held.get(side)?.def || null,
    isHolding: side => held.has(side) || (side === "right" && held.has("pc")),
    get pcHolding() { return held.has("pc"); },
    pcEquip, pcThrow, pcTrigger(down) { pcDown = down; }, pcReload() { const h = held.get("pc"); if (h) startReload(h); },
    owns: id => W.owned.includes(id), state: W,
    onKill(e) {
      // Tenkai drop a little ammo for whatever you carry
      // (ammo is infinite — nothing to drop)
    },
    holsterAll() { for (const s of [...held.keys()]) holster(s, true); const hand = getPCHand?.(); if (hand) hand.visible = true; }
  };
}

// Rook's stall in the Neon Mile east back lane: a crate counter and a lit gun rack.
export function buildRookStall(root, city) {
  const g = new THREE.Group(); g.name = "ROOK_STALL";
  const wx = 30.95, z = -97.6;
  const crate = new THREE.MeshStandardMaterial({ color: 0x3d3226, roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x15171c, metalness: 0.6, roughness: 0.4 });
  const amber = new THREE.MeshBasicMaterial({ color: 0xffb02e, toneMapped: false });
  const box = (w, h, d, x, y, zz, m) => { const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); me.position.set(x, y, zz); g.add(me); return me; };
  // counter of stacked crates in front of Rook
  box(0.8, 0.95, 2.2, 29.1, 0.475, z, crate); box(0.82, 0.05, 2.24, 29.1, 0.97, z, dark);
  box(0.02, 0.03, 2.2, 28.69, 0.95, z, amber);
  city.colliders.push({ minX: 28.65, maxX: 29.55, minZ: z - 1.15, maxZ: z + 1.15, minY: 0, maxY: 1 });
  // rack board on the wall
  box(0.04, 1.3, 2.6, wx - 0.02, 1.85, z, dark);
  box(0.02, 0.025, 2.6, wx - 0.05, 2.52, z, amber); box(0.02, 0.025, 2.6, wx - 0.05, 1.18, z, amber);
  const lamp = new THREE.PointLight(0xffb02e, 5, 5, 2); lamp.position.set(29.6, 2.6, z); g.add(lamp);
  // weapons on the rack (side-on, barrels pointing along the lane)
  const rack = [["breacher", 2.25, -0.55], ["longspike", 2.25, 0.62], ["p9", 1.68, -0.85], ["rattler", 1.68, -0.15], ["katana", 1.5, 0.75]];
  for (const [id, y, dz] of rack) {
    const m = buildWeaponModel(id);
    // side faces the lane (-x), barrel points along the wall (+z)
    m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1)));
    m.position.set(wx - 0.08, y, z + dz);
    g.add(m);
  }
  // little neon sign
  const c = document.createElement("canvas"); c.width = 512; c.height = 128; const x = c.getContext("2d");
  x.fillStyle = "#ffb02e"; x.font = "900 80px Arial"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("ROOK'S", 256, 68);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.35), new THREE.MeshBasicMaterial({ map: t, transparent: true, toneMapped: false }));
  sign.position.set(wx - 0.06, 2.85, z); sign.rotation.y = -Math.PI / 2; g.add(sign);
  root.add(g);
  return g;
}
