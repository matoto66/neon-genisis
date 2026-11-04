// NEON GENESIS — gameplay layer: missions, dialogue, cyberware shop,
// interactables, pickups, objective beacons, HUD toasts and fades.
//
// One system serves both VR and desktop:
//   VR      point either controller at something + pull the trigger
//   Desktop look at it (centre dot) + press F or click; 1-4 picks options

import * as THREE from "three";
import { CHARACTERS, MISSIONS, DIALOGUE, CYBERWARE, CONSUMABLES, PICKUPS, AMBIENT_BARKS, entryFor } from "./story.js";
import { state, saveGame, creditMultiplier, effectiveStrength, slotCount, isActive, toggleInstall, addXP, level, XP_REWARDS } from "./state.js";
import { createNPCSystem } from "./npcs.js";
import { createGuide, guideSettings } from "./guide.js";

const PANEL_W = 1024, PANEL_H = 768;
const SPEAKER_COLORS = { mika: "#38f0e6", sato: "#ffcf7a", rei: "#ff4f6d", doc: "#ff6fe0", pip: "#9fff6a", lulu: "#ff4fa3", whisper: "#ffcf8a", ishida: "#8fd8ff" };

function mulberry32(seed) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function wrapText(ctx, text, maxWidth) {
  const out = [];
  for (const para of String(text).split("\n")) {
    if (!para) { out.push(""); continue; }
    let line = "";
    for (const word of para.split(" ")) {
      const test = line ? line + " " + word : word;
      if (ctx.measureText(test).width > maxWidth && line) { out.push(line); line = word; } else line = test;
    }
    out.push(line);
  }
  return out;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

export function createGame(ctx) {
  const { scene, cityWorld, camera, player, renderer, city, core, mika, door, blockers, onStateChange, isInCity } = ctx;
  const audio = ctx.audio || { play() {}, speak() {}, setMood() {} };
  const rand = mulberry32(99);
  const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), headPos = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  const hud = {
    root: document.querySelector("#hud"), title: document.querySelector("#objective-title"),
    text: document.querySelector("#objective-text"), dist: document.querySelector("#objective-distance"),
    district: document.querySelector("#district-name"), prompt: document.querySelector("#interact-prompt"),
    toasts: document.querySelector("#toasts")
  };

  // ════════════════════════════════════════════════════════════════════════
  // NPCs
  // ════════════════════════════════════════════════════════════════════════
  const npcSys = createNPCSystem(cityWorld, rand);
  const A = city.anchors;
  const named = {
    mika: { position: mika.position, yaw: mika.yaw },
    sato: { position: A.sato, yaw: -Math.PI / 2 },
    rei: { position: new THREE.Vector3(-14.5, 19, -12.25), yaw: 0, mode: "sit", seatHeight: 0.45 },
    doc: { position: A.doc, yaw: -Math.PI / 2 },
    pip: { position: new THREE.Vector3(-16, 0, 10.6), yaw: Math.PI / 2 },
    lulu: { position: A.lulu, yaw: Math.PI / 2 },
    whisper: { position: new THREE.Vector3(-27.3, 0, -85), yaw: Math.PI / 2 },
    ishida: { position: A.ishida, yaw: 0, hologram: true, scale: 1.55 }
  };
  for (const [id, n] of Object.entries(named)) {
    const c = CHARACTERS[id];
    const appearance = { ...c.appearance };
    if (n.scale) appearance.scale = n.scale;
    npcSys.addNPC({ id, name: c.name, role: c.role, appearance, position: n.position.clone(), yaw: n.yaw,
      mode: n.mode || "idle", seatHeight: n.seatHeight, hologram: n.hologram, enabled: id !== "ishida" });
  }
  // crowd walkers on every sidewalk
  city.sidewalkPaths.forEach((path, i) => {
    const count = path.length > 2 ? 2 : 2;
    for (let k = 0; k < count; k++) npcSys.addNPC({ mode: "walk", path, offset: (rand() - 0.5) * 0.4, barks: AMBIENT_BARKS, position: new THREE.Vector3() });
  });
  // static citizens: talking pairs, leaners, diners, vendors
  const pair = (x1, z1, x2, z2) => {
    const a = npcSys.addNPC({ mode: "talk", position: new THREE.Vector3(x1, 0, z1), barks: AMBIENT_BARKS });
    const b = npcSys.addNPC({ mode: "talk", position: new THREE.Vector3(x2, 0, z2), barks: AMBIENT_BARKS });
    a.talkTo = b.id; b.talkTo = a.id;
  };
  pair(-10.3, 33.6, -10.3, 34.7); pair(10.2, 24, 10.2, 25.1); pair(-10.2, -66.8, -10.2, -65.4 - 0.3);
  pair(3, -121, 4, -121.6); pair(10.2, -79.5, 10.2, -80.6); pair(-30, -46.4, -31, -46.0 + 0.0);
  npcSys.addNPC({ mode: "lean", position: new THREE.Vector3(-12, 0, -24.45), yaw: Math.PI, barks: AMBIENT_BARKS });
  npcSys.addNPC({ mode: "lean", position: new THREE.Vector3(12.5, 0, -8.45), yaw: Math.PI, barks: AMBIENT_BARKS });
  npcSys.addNPC({ mode: "lean", position: new THREE.Vector3(-18, 0, -88 + 0.45), yaw: 0, barks: AMBIENT_BARKS });
  for (const s of A.satoStools.slice(0, 2)) npcSys.addNPC({ mode: "sit", position: s.clone().setX(s.x - 0.25), yaw: Math.PI / 2, seatHeight: 0.74, barks: AMBIENT_BARKS });
  npcSys.addNPC({ mode: "sit", position: A.lotBench.clone().setZ(A.lotBench.z + 0.2), yaw: 0, seatHeight: 0.48, barks: AMBIENT_BARKS });
  for (let i = 0; i < 6; i++) {
    const side = i % 2 ? 1 : -1;
    if (i === 0) continue; // Lulu stands at the first stall
    npcSys.addNPC({ mode: "idle", position: new THREE.Vector3(side * 11.0, 0, -61 - i * 7.5), yaw: side > 0 ? -Math.PI / 2 : Math.PI / 2, barks: ["Fresh dumplings!", "Chrome polish, two for one!", "Umbrellas! You need an umbrella!", "Best skewers in the Mile!"] });
  }

  // ════════════════════════════════════════════════════════════════════════
  // Interactables & pickups
  // ════════════════════════════════════════════════════════════════════════
  const interactables = [];
  const hitTargets = [];   // meshes the interaction ray tests
  const hitMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
  function addInteractable(rec) {
    rec.hit.userData.interactable = rec;
    interactables.push(rec);
    hitTargets.push(rec.hit);
    return rec;
  }
  const glowM = (c) => new THREE.MeshBasicMaterial({ color: c });
  const capGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.2, 10);
  const capMat = new THREE.MeshStandardMaterial({ color: 0x2a4aa0, metalness: 0.7, roughness: 0.3 });
  const shardGeo = new THREE.OctahedronGeometry(0.13);
  const shardMat = new THREE.MeshBasicMaterial({ color: 0xc58bff });
  const haloTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d");
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, "rgba(255,255,255,0.9)"); g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g; x.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); return t; })();
  const halo = (color, size) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); s.scale.set(size, size, 1); return s; };

  const pickups = [];
  for (const p of PICKUPS) {
    const group = new THREE.Group();
    group.position.set(...p.pos);
    const model = new THREE.Group();
    group.add(model);
    if (p.type === "capacitor") {
      model.add(new THREE.Mesh(capGeo, capMat));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.012, 6, 16), glowM(0x5ff5ff)); ring.rotation.x = Math.PI / 2; model.add(ring);
      model.add(halo(0x5ff5ff, 0.6));
    } else if (p.type === "shard") {
      model.add(new THREE.Mesh(shardGeo, shardMat)); model.add(halo(0xc58bff, 0.7));
    } else if (p.type === "drone") {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.3), new THREE.MeshStandardMaterial({ color: 0xffcf4a, metalness: 0.5, roughness: 0.4 }));
      model.add(body);
      for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.01, 10), new THREE.MeshStandardMaterial({ color: 0x222222 })); r.position.set(x, 0.05, z); model.add(r); }
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), glowM(0x6aff9e)); eye.position.set(0, 0, 0.16); model.add(eye);
      model.rotation.z = 0.5; model.add(halo(0x6aff9e, 0.5));
    }
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), hitMat);
    group.add(hit);
    cityWorld.add(group);
    const rec = { id: p.id, def: p, kind: "pickup", object: group, model, hit, range: 3.0,
      label: { capacitor: "Salvage Capacitor", shard: "GENESIS Data Shard", drone: "Bolt (Pip's drone)" }[p.type], verb: "GRAB",
      enabled: () => !state.collected.includes(p.id) && (!p.mission || state.missions[p.mission]?.status === "active"),
      use: () => collectPickup(rec) };
    addInteractable(rec);
    pickups.push(rec);
  }
  function collectPickup(rec) {
    const p = rec.def;
    if (p.needsStrength && effectiveStrength() < p.needsStrength) {
      toast(`Too heavy to shift the dumpster. Needs STRENGTH ${p.needsStrength} (or Kinetic Tendons).`, "warn");
      return;
    }
    state.collected.push(p.id);
    audio.play(p.type === "shard" ? "shard" : "pickup");
    if (p.type === "shard") awardXP(XP_REWARDS.shard);
    if (p.credits) give(p.credits, rec.label);
    else toast(`Picked up: ${rec.label}`);
    saveGame();
    emit("collect", p.type);
  }

  // Tenkai sensor pylons (mission m4) and junction boxes (side job s2)
  const pylonMat = new THREE.MeshStandardMaterial({ color: 0xe8ecf4, metalness: 0.6, roughness: 0.3 });
  A.pylons.forEach((pos, i) => {
    const id = "pylon" + i;
    const group = new THREE.Group(); group.position.copy(pos);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 2.6, 8), pylonMat); pole.position.y = 1.3; group.add(pole);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), glowM(0xff2a3a)); eye.position.y = 2.55; group.add(eye);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.02, 6, 20), glowM(0xff2a3a)); ring.position.y = 2.55; ring.rotation.x = Math.PI / 2; group.add(ring);
    const jammer = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.12), glowM(0x6aff9e)); jammer.position.set(0, 1.35, 0.14); jammer.visible = false; group.add(jammer);
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 2.8, 8), hitMat); hit.position.y = 1.4; group.add(hit);
    cityWorld.add(group);
    city.colliders.push({ minX: pos.x - 0.2, maxX: pos.x + 0.2, minZ: pos.z - 0.2, maxZ: pos.z + 0.2, minY: 0, maxY: 2.7 });
    const rec = addInteractable({ id, kind: "pylon", object: group, hit, range: 3.0, label: "Tenkai Sensor Pylon", verb: "PLANT JAMMER",
      enabled: () => state.missions.m4?.status === "active" && state.missions.m4.step === 0 && !state.collected.includes(id),
      alwaysVisible: true,
      use: () => { state.collected.push(id); saveGame(); audio.play("jammer"); toast("Jammer planted."); emit("interact", "pylon"); } });
    rec.refresh = () => { const done = state.collected.includes(id); eye.material.color.set(done ? 0x6aff9e : 0xff2a3a); ring.material.color.set(done ? 0x6aff9e : 0xff2a3a); jammer.visible = done; };
    rec.eye = eye;
  });
  A.junctions.forEach(([pos, yaw], i) => {
    const id = "junction" + i;
    const group = new THREE.Group(); group.position.copy(pos); group.rotation.y = yaw;
    group.add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.22), new THREE.MeshStandardMaterial({ color: 0x5a6070, metalness: 0.6, roughness: 0.4 })));
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.02), glowM(0xff8a2a)); lamp.position.set(0, 0.25, 0.12); group.add(lamp);
    const sparks = halo(0xffb04a, 0.8); sparks.position.set(0.15, -0.1, 0.2); group.add(sparks);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.6), hitMat); group.add(hit);
    cityWorld.add(group);
    const rec = addInteractable({ id, kind: "junction", object: group, hit, range: 2.8, label: "Shorting Junction Box", verb: "RESET",
      enabled: () => state.missions.s2?.status === "active" && state.missions.s2.step === 0 && !state.collected.includes(id),
      alwaysVisible: true,
      use: () => { state.collected.push(id); saveGame(); audio.play("spark"); toast("Junction box reset."); emit("interact", "junction"); } });
    rec.update = (t) => { const done = state.collected.includes(id); sparks.visible = !done && Math.sin(t * 0.03 + i) > 0.3; lamp.material.color.set(done ? 0x6aff9e : (Math.sin(t * 0.02) > 0 ? 0xff8a2a : 0x401a08)); };
  });

  // Genesis Core
  const coreHit = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), hitMat);
  coreHit.position.y = 1.08;
  core.group.add(coreHit);
  addInteractable({ id: "genesis_core", kind: "core", object: core.group, hit: coreHit, range: 3.0, label: "Genesis Core", verb: "TOUCH", alwaysVisible: true,
    enabled: () => true,
    use: () => {
      const waking = state.missions.m2?.status === "active" && state.missions.m2.step === 0;
      coreFlare();
      if (waking) { emit("interact", "genesis_core"); openDialogue("core_wake"); }
      else openDialogue("core_idle");
    } });

  // Mika's door (desktop players can't twist a handle, so F toggles it)
  if (door) addInteractable({ id: "mika_door", kind: "door", object: door.object, hit: door.hit, range: 3.0, label: "Mika's Repair door", verb: "OPEN / CLOSE",
    alwaysVisible: true, enabled: () => true, desktopOnly: true, use: () => { audio.play("door"); door.toggle(); } });

  // Freight lift between Rust Alley and the hotel roof
  const liftDefs = [
    { id: "lift_up", at: A.liftGround, to: new THREE.Vector3(A.liftRoof.x, A.liftRoof.y, A.liftRoof.z + 1.4), label: "Freight Lift · Roof" },
    { id: "lift_down", at: A.liftRoof, to: new THREE.Vector3(A.liftGround.x + 1.6, 0, A.liftGround.z), label: "Freight Lift · Street" }
  ];
  for (const L of liftDefs) {
    const group = new THREE.Group(); group.position.copy(L.at);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.2, 1.8), hitMat); hit.position.y = 1.1; group.add(hit);
    const label = textPlate(L.label, "#ffb02e"); label.position.y = 2.6; group.add(label);
    cityWorld.add(group);
    addInteractable({ id: L.id, kind: "lift", object: group, hit, range: 3.2, label: L.label, verb: "RIDE", alwaysVisible: true, enabled: () => true,
      use: () => teleport(L.to, L.id === "lift_up" ? "ROOFTOPS · THE SUMP" : null) });
  }
  function textPlate(text, color) {
    const c = document.createElement("canvas"); c.width = 512; c.height = 96; const x = c.getContext("2d");
    x.fillStyle = "rgba(5,10,22,0.85)"; roundRect(x, 4, 4, 504, 88, 14); x.fill(); x.strokeStyle = color; x.lineWidth = 4; x.stroke();
    x.fillStyle = "#fff"; x.font = "bold 40px Arial"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(text, 256, 50);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false })); s.scale.set(1.6, 0.3, 1); return s;
  }

  // NPCs are interactable too
  for (const hit of npcSys.hitMeshes) {
    const npc = hit.userData.npc;
    addInteractable({ id: "npc:" + npc.id, kind: "npc", npc, object: npc.holder, hit, range: npc.id === "ishida" ? 6 : 3.4,
      label: npc.name || "Citizen", verb: "TALK", alwaysVisible: true, enabled: () => npc.enabled && npc.holder.visible,
      use: () => talkTo(npc) });
  }

  // ════════════════════════════════════════════════════════════════════════
  // Mission engine
  // ════════════════════════════════════════════════════════════════════════
  const typeOf = id => PICKUPS.find(p => p.id === id)?.type || id.replace(/\d+$/, "");
  const count = type => state.collected.filter(id => typeOf(id) === type).length;
  const status = id => state.missions[id]?.status;
  const stepOf = id => state.missions[id]?.step ?? -1;
  function currentStep(id) { const m = state.missions[id]; return m && m.status === "active" ? MISSIONS[id].steps[m.step] : null; }

  function startMission(id) {
    if (state.missions[id]) return;
    const def = MISSIONS[id];
    state.missions[id] = { status: "active", step: 0 };
    if (def.kind === "main" || !state.tracked || status(state.tracked) !== "active") state.tracked = id;
    toast(`${def.kind === "main" ? `CHAPTER ${def.chapter} · NEW MISSION` : "NEW SIDE JOB"}: ${def.title}`, "mission");
    checkAutoStep(id);
    changed();
  }
  function completeStep(id) {
    const m = state.missions[id];
    if (!m || m.status !== "active") return;
    m.step++;
    const def = MISSIONS[id];
    if (m.step >= def.steps.length) return finishMission(id);
    toast(`OBJECTIVE: ${def.steps[m.step].text}`, "objective");
    checkAutoStep(id);
    changed();
  }
  function finishMission(id) {
    const def = MISSIONS[id], m = state.missions[id];
    m.status = "done";
    const credits = Math.round((def.reward.credits || 0) * creditMultiplier());
    if (credits) state.credits += credits;
    const levels = addXP(def.kind === "main" ? XP_REWARDS.main : XP_REWARDS.side);
    toast(`MISSION COMPLETE: ${def.title}${credits ? ` · +$${credits}` : ""}`, "complete");
    if (levels) toast(`LEVEL UP! +${levels} LEVEL${levels > 1 ? "S" : ""} · NOW LEVEL ${level()} · +${levels} ATTRIBUTE POINT${levels > 1 ? "S" : ""}`, "chapter");
    if (state.tracked === id) state.tracked = null;
    if (def.next) startMission(def.next);
    if (!state.tracked) state.tracked = Object.keys(state.missions).find(k => status(k) === "active") || null;
    changed();
  }
  function checkAutoStep(id) {
    const step = currentStep(id);
    if (!step?.done) return;
    if (step.done.count && count(step.done.collect || step.done.interact) >= step.done.count) completeStep(id);
    else if (step.done.buy && state.installed.length > 0) completeStep(id);
  }
  function emit(type, key) {
    for (const id of Object.keys(state.missions)) {
      const step = currentStep(id);
      if (!step?.done) continue;
      const want = step.done[type];
      if (want === undefined) continue;
      if (type === "buy" || want === key) {
        if (step.done.count) {
          const n = count(key);
          if (n >= step.done.count) completeStep(id);
          else toast(`${MISSIONS[id].title}: ${n} / ${step.done.count}`, "objective");
        } else completeStep(id);
      }
    }
    changed();
  }
  // Small XP (enemies, shards). Quests give their levels in finishMission.
  function awardXP(n) {
    const levels = addXP(n);
    if (levels) toast(`LEVEL UP! NOW LEVEL ${level()} · +${levels} ATTRIBUTE POINT${levels > 1 ? "S" : ""} (Y MENU)`, "chapter");
    changed();
  }
  function give(n, why) {
    const amount = Math.round(n * creditMultiplier());
    state.credits += amount;
    toast(`+$${amount}${why ? " · " + why : ""}`, "credits");
    changed();
  }
  function changed() {
    saveGame();
    refreshWorld();
    onStateChange?.();
    updateHUD();
  }
  function trackedMission() {
    if (state.tracked && status(state.tracked) === "active") return state.tracked;
    const ids = Object.keys(state.missions).filter(k => status(k) === "active");
    return ids.find(k => MISSIONS[k].kind === "main") || ids[0] || null;
  }
  function refreshWorld() {
    for (const rec of interactables) rec.refresh?.();
    npcSys.setEnabled("ishida", status("m6") === "active" && stepOf("m6") === 1);
    // quest markers: "!" when a character has something for you
    for (const id of Object.keys(CHARACTERS)) {
      let mark = null;
      for (const mid of Object.keys(state.missions)) if (currentStep(mid)?.target?.npc === id && !currentStep(mid).done) mark = "!";
      if (["pip", "lulu", "whisper"].includes(id) && !state.missions[{ pip: "s1", lulu: "s2", whisper: "s3" }[id]]) mark = "?";
      npcSys.setMarker(id, mark);
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // Dialogue / shop panel (a physical board that appears in front of you)
  // ════════════════════════════════════════════════════════════════════════
  const panelCanvas = document.createElement("canvas");
  panelCanvas.width = PANEL_W; panelCanvas.height = PANEL_H;
  const pctx = panelCanvas.getContext("2d");
  const panelTex = new THREE.CanvasTexture(panelCanvas);
  panelTex.colorSpace = THREE.SRGBColorSpace;
  panelTex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.72),
    new THREE.MeshBasicMaterial({ map: panelTex, transparent: true, depthTest: false, depthWrite: false, fog: false }));
  panel.renderOrder = 10000;
  panel.visible = false;
  panel.name = "DIALOGUE_PANEL";
  scene.add(panel);
  let panelState = null;      // { mode: "dialogue"|"shop", node, data, buttons: [{x,y,w,h,act}] }
  let hoverIndex = -1;
  let talkingTo = null;

  const api = {
    state, flag: k => state.flags[k], setFlag: (k, v) => { state.flags[k] = v; saveGame(); },
    status, step: stepOf, count, startMission, completeStep, give: n => give(n),
    spend: n => { state.credits = Math.max(0, state.credits - n); changed(); },
    openShop: () => { pendingShop = true; },
    get name() { return (ctx.getName?.() || "").trim(); }, bark: () => AMBIENT_BARKS[Math.floor(Math.random() * AMBIENT_BARKS.length)],
    coreFlare: () => coreFlare(), toast: (t, k) => toast(t, k), finale: () => { finaleMood = 90; }
  };
  let pendingShop = false;

  function placePanel(distance = 1.05) {
    camera.getWorldPosition(headPos);
    camera.getWorldDirection(tmpV); tmpV.y = 0;
    if (tmpV.lengthSq() < 1e-4) tmpV.set(0, 0, -1);
    tmpV.normalize();
    panel.position.copy(headPos).addScaledVector(tmpV, distance);
    panel.position.y = headPos.y - 0.1;
    panel.lookAt(headPos.x, panel.position.y, headPos.z);
  }
  function openDialogue(nodeId, npc = null) {
    const fn = DIALOGUE[nodeId];
    if (!fn) return closePanel();
    const node = fn(api);
    const options = node.options.filter(o => !o.if || o.if(api));
    if (!panel.visible) { placePanel(); audio.play("open"); }
    const voice = CHARACTERS[node.speaker] ? node.speaker : (/GENESIS/.test(node.speaker) ? "GENESIS" : "narrator");
    audio.speak(voice, node.text);
    panelState = { mode: "dialogue", node, options, nodeId };
    talkingTo = npc || talkingTo;
    panel.visible = true;
    hoverIndex = -1;
    drawPanel();
    onPanelOpen();
  }
  function choose(index) {
    if (!panelState) return;
    audio.play("click");
    if (panelState.mode === "shop") return shopClick(index);
    const opt = panelState.options[index];
    if (!opt) return;
    pendingShop = false;
    opt.do?.(api);
    if (pendingShop) { pendingShop = false; return openShop(); }
    if (opt.to) openDialogue(opt.to);
    else closePanel();
  }
  function closePanel() {
    if (panel.visible) audio.play("close");
    panel.visible = false;
    panelState = null;
    talkingTo = null;
    onPanelClose();
  }
  function onPanelOpen() {
    if (!renderer.xr.isPresenting && document.pointerLockElement) document.exitPointerLock?.();
    document.body.classList.add("dialogue-open");
  }
  function onPanelClose() { document.body.classList.remove("dialogue-open"); }

  function drawPanel() {
    const c = pctx, s = panelState;
    c.clearRect(0, 0, PANEL_W, PANEL_H);
    c.fillStyle = "rgba(6,10,24,0.94)"; roundRect(c, 6, 6, PANEL_W - 12, PANEL_H - 12, 26); c.fill();
    const accent = s.mode === "shop" ? "#ff6fe0" : (SPEAKER_COLORS[s.node?.speaker] || (s.node?.narration ? "#c58bff" : "#38f0e6"));
    c.strokeStyle = accent; c.lineWidth = 5; c.stroke();
    c.fillStyle = accent; c.fillRect(40, 96, 120, 4);
    s.buttons = [];
    if (s.mode === "shop") return drawShop(accent);
    const sp = CHARACTERS[s.node.speaker];
    c.fillStyle = accent; c.font = "bold 40px Arial"; c.textBaseline = "alphabetic";
    const title = sp ? sp.name.toUpperCase() : s.node.speaker;
    c.fillText(title, 40, 70);
    if (sp) { const w = c.measureText(title).width; c.fillStyle = "#8ea3bf"; c.font = "24px Arial"; c.fillText(sp.role, 40 + w + 22, 68); }
    c.fillStyle = "#eef6ff"; c.font = s.node.narration ? "italic 31px Arial" : "31px Arial";
    const lines = wrapText(c, s.node.text, PANEL_W - 90);
    lines.slice(0, 9).forEach((l, i) => c.fillText(l, 44, 150 + i * 40));
    const n = s.options.length, bh = 64, gap = 12;
    const top = PANEL_H - 32 - n * (bh + gap) + gap;
    s.options.forEach((o, i) => {
      const y = top + i * (bh + gap), hov = i === hoverIndex;
      c.fillStyle = hov ? "rgba(56,240,230,0.28)" : "rgba(30,44,70,0.92)"; roundRect(c, 40, y, PANEL_W - 80, bh, 14); c.fill();
      c.strokeStyle = hov ? "#5ff5e8" : "#33445f"; c.lineWidth = 3; c.stroke();
      c.fillStyle = "#ffcf4a"; c.font = "bold 28px Arial"; c.fillText(String(i + 1), 62, y + 42);
      c.fillStyle = "#ffffff"; c.font = "bold 28px Arial"; c.fillText(o.text, 100, y + 42);
      s.buttons.push({ x: 40, y, w: PANEL_W - 80, h: bh, index: i });
    });
    panelTex.needsUpdate = true;
  }

  // shop board
  function openShop() {
    if (!panel.visible) placePanel();
    panelState = { mode: "shop", cat: "chrome", items: shopItems("chrome"), message: "" };
    panel.visible = true; hoverIndex = -1;
    drawPanel(); onPanelOpen();
  }
  // TEST MODE: everything at Second Skin costs $0. Set to false to restore prices.
  const FREE_SHOP = true;
  const priceOf = item => FREE_SHOP ? 0 : item.price;
  const priceLabel = item => FREE_SHOP ? "GET · FREE" : `BUY $${item.price}`;

  // Shop tabs keep each page to a handful of readable rows.
  const SHOP_TABS = [{ id: "supplies", label: "SUPPLIES" }, { id: "chrome", label: "CHROME" }, { id: "combat", label: "COMBAT" }];
  function shopItems(cat) {
    if (cat === "supplies") return Object.keys(CONSUMABLES);
    return Object.keys(CYBERWARE).filter(id => (CYBERWARE[id].cat || "chrome") === cat);
  }
  function drawShop(accent) {
    const c = pctx, s = panelState;
    c.fillStyle = accent; c.font = "bold 36px Arial"; c.fillText("SECOND SKIN · CYBERWARE", 40, 64);
    c.fillStyle = "#ffffff"; c.font = "bold 26px Arial";
    c.fillText(`$${state.credits.toLocaleString()}`, 760, 50);
    c.fillStyle = "#8ea3bf"; c.font = "20px Arial";
    c.fillText(`SLOTS ${state.installed.length}/${slotCount()} · COMPATIBILITY ${state.character.compatibility}`, 700, 80);
    SHOP_TABS.forEach((t, k) => {
      const x = 40 + k * 205, on = s.cat === t.id, hov = hoverIndex === 100 + k;
      c.fillStyle = on ? "#a0287a" : hov ? "rgba(255,111,224,0.2)" : "rgba(22,32,54,0.9)"; roundRect(c, x, 96, 195, 44, 10); c.fill();
      c.fillStyle = "#ffffff"; c.font = "bold 20px Arial"; c.textAlign = "center"; c.fillText(t.label, x + 97, 125); c.textAlign = "left";
      s.buttons.push({ x, y: 96, w: 195, h: 44, index: 100 + k });
    });
    const rowH = 76;
    s.items.forEach((id, i) => {
      const consumable = CONSUMABLES[id];
      const w = consumable ? { ...consumable, slot: "Consumable", req: 0 } : CYBERWARE[id], y = 152 + i * rowH;
      if (consumable) {
        const hov = i === hoverIndex, have = state.items?.[id] || 0;
        c.fillStyle = hov ? "rgba(255,111,224,0.16)" : "rgba(40,22,48,0.9)"; roundRect(c, 32, y, PANEL_W - 64, rowH - 6, 12); c.fill();
        c.fillStyle = "#ffffff"; c.font = "bold 25px Arial"; c.fillText(`${w.name}  ·  YOU HAVE ${have}`, 50, y + 30);
        c.fillStyle = "#b8c4d8"; c.font = "18px Arial"; c.fillText(w.desc, 50, y + 56);
        c.fillStyle = have >= w.max ? "#56607a" : state.credits >= priceOf(w) ? "#a0287a" : "#56607a"; roundRect(c, PANEL_W - 230, y + 8, 180, rowH - 22, 10); c.fill();
        c.fillStyle = "#ffffff"; c.font = "bold 20px Arial"; c.textAlign = "center"; c.fillText(have >= w.max ? "FULL" : priceLabel(w), PANEL_W - 140, y + rowH / 2 + 2); c.textAlign = "left";
        s.buttons.push({ x: 32, y, w: PANEL_W - 64, h: rowH - 6, index: i });
        return;
      }
      const owned = state.owned.includes(id), installed = state.installed.includes(id);
      const lockedReq = w.req > state.character.compatibility;
      const hov = i === hoverIndex;
      c.fillStyle = hov ? "rgba(255,111,224,0.16)" : "rgba(22,32,54,0.9)"; roundRect(c, 32, y, PANEL_W - 64, rowH - 6, 12); c.fill();
      c.fillStyle = w.locked ? "#7d8aa3" : "#ffffff"; c.font = "bold 25px Arial"; c.fillText(w.name, 50, y + 30);
      const nameW = c.measureText(w.name).width;
      c.fillStyle = "#9fe9ff"; c.font = "17px Arial"; c.fillText(`${w.slot.toUpperCase()} · NEEDS COMPAT ${w.req}`, 50 + Math.max(240, nameW + 30), y + 30);
      c.fillStyle = "#b8c4d8"; c.font = "18px Arial";
      const desc = w.desc.length > 84 ? w.desc.slice(0, 82) + "…" : w.desc;
      c.fillText(desc, 50, y + 56);
      let label, col;
      if (w.locked) { label = "LOCKED"; col = "#56607a"; }
      else if (installed) { label = "INSTALLED"; col = "#2a8a6a"; }
      else if (owned) { label = "INSTALL"; col = "#2a6a8a"; }
      else if (lockedReq) { label = `COMPAT ${w.req}`; col = "#56607a"; }
      else { label = priceLabel(w); col = state.credits >= priceOf(w) ? "#a0287a" : "#56607a"; }
      c.fillStyle = col; roundRect(c, PANEL_W - 230, y + 8, 180, rowH - 22, 10); c.fill();
      c.fillStyle = "#ffffff"; c.font = "bold 20px Arial"; c.textAlign = "center"; c.fillText(label, PANEL_W - 140, y + rowH / 2 + 2); c.textAlign = "left";
      s.buttons.push({ x: 32, y, w: PANEL_W - 64, h: rowH - 6, index: i });
    });
    const ly = PANEL_H - 74, li = s.items.length;
    const hov = hoverIndex === li;
    c.fillStyle = hov ? "rgba(56,240,230,0.28)" : "rgba(30,44,70,0.92)"; roundRect(c, 40, ly, 300, 54, 12); c.fill();
    c.fillStyle = "#ffffff"; c.font = "bold 26px Arial"; c.fillText("LEAVE", 150, ly + 36);
    s.buttons.push({ x: 40, y: ly, w: 300, h: 54, index: li });
    if (s.message) { c.fillStyle = "#ffcf4a"; c.font = "bold 22px Arial"; c.fillText(s.message, 370, ly + 36); }
    panelTex.needsUpdate = true;
  }
  function shopClick(index) {
    const s = panelState;
    if (index >= 100) { s.cat = SHOP_TABS[index - 100].id; s.items = shopItems(s.cat); s.message = ""; return drawPanel(); }
    if (index === s.items.length) return closePanel();
    const id = s.items[index];
    if (CONSUMABLES[id]) {
      const cdef = CONSUMABLES[id]; state.items = state.items || {};
      const have = state.items[id] || 0;
      if (have >= cdef.max) s.message = `You can only carry ${cdef.max}.`;
      else if (state.credits < priceOf(cdef)) s.message = "Not enough credits.";
      else { state.credits -= priceOf(cdef); state.items[id] = have + 1; s.message = `Bought a ${cdef.name}. You have ${have + 1}.`; }
      changed(); drawPanel(); return;
    }
    const w = CYBERWARE[id];
    if (!w) return;
    if (w.locked) s.message = "Not for sale. Not yet.";
    else if (state.owned.includes(id)) {
      const r = toggleInstall(id);
      s.message = r === "installed" ? `${w.name} installed.` : r === "removed" ? `${w.name} removed.` : "No free slots. Remove something or raise COMPATIBILITY.";
      if (r === "installed") emit("buy", id);
    } else if (w.req > state.character.compatibility) s.message = `Your body can't take it yet: COMPATIBILITY ${w.req} needed.`;
    else if (state.credits < priceOf(w)) s.message = "Not enough credits.";
    else {
      state.credits -= priceOf(w);
      state.owned.push(id);
      const r = toggleInstall(id);
      s.message = r === "installed" ? `Installed ${w.name}.` : `Bought ${w.name}. No free slot — install it from your menu.`;
      toast(`Cyberware acquired: ${w.name}`, "credits");
      emit("buy", id);
    }
    changed();
    drawPanel();
  }

  function panelHit(ray) {
    if (!panel.visible) return null;
    raycaster.ray.copy(ray);
    const hit = raycaster.intersectObject(panel, false)[0];
    if (!hit?.uv) return { hit: null, index: -1 };
    const x = hit.uv.x * PANEL_W, y = (1 - hit.uv.y) * PANEL_H;
    const b = panelState?.buttons?.find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
    return { hit, index: b ? b.index : -1 };
  }
  function setHover(i) { if (i !== hoverIndex) { hoverIndex = i; if (i >= 0) audio.play("hover"); if (panelState) drawPanel(); } }

  function talkTo(npc) {
    if (!npc.named) { const line = AMBIENT_BARKS[Math.floor(Math.random() * AMBIENT_BARKS.length)]; npcSys.say(npc, line); audio.speak("citizen", line); return; }
    const node = entryFor(npc.id, api);
    if (node) openDialogue(node, npc);
  }

  // ════════════════════════════════════════════════════════════════════════
  // Beacons, toasts, fades
  // ════════════════════════════════════════════════════════════════════════
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffcf4a, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.35, 70, 10, 1, true), beaconMat);
  beacon.visible = false; beacon.name = "OBJECTIVE_BEACON";
  cityWorld.add(beacon);
  const beaconRing = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.04, 6, 32), new THREE.MeshBasicMaterial({ color: 0xffcf4a, fog: false }));
  beaconRing.rotation.x = Math.PI / 2; beacon.add(beaconRing); beaconRing.position.y = -34.9;
  const guide = createGuide(cityWorld);
  const distLabel = textPlate("", "#ffcf4a"); distLabel.visible = false; cityWorld.add(distLabel);
  let lastDistText = "";
  const shardBeaconMat = new THREE.MeshBasicMaterial({ color: 0xc58bff, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const shardBeacons = pickups.filter(p => p.def.type === "shard").map(p => {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.15, 40, 6, 1, true), shardBeaconMat);
    b.position.copy(p.object.position); b.position.y += 20; b.visible = false; cityWorld.add(b); return { b, p };
  });

  function objectivePosition() {
    const id = trackedMission();
    const step = id && currentStep(id);
    if (!step?.target) return null;
    const t = step.target;
    player.getWorldPosition(tmpV2);
    if (t.npc) {
      const npc = npcSys.byId[t.npc];
      if (!npc) return null;
      // The beam points at the lift; the path guide routes through it instead.
      if (t.via && guideSettings.guide !== "path" && npc.holder.position.y > 10 && tmpV2.y < 10) return A[t.via];
      return npc.holder.position;
    }
    if (t.anchor) return A[t.anchor];
    if (t.object === "genesis_core") return core.group.getWorldPosition(tmpV);
    const nearestOf = list => { let best = null, bd = Infinity; for (const r of list) { const d = r.object.position.distanceToSquared(tmpV2); if (d < bd) { bd = d; best = r.object.position; } } return best; };
    if (t.object) return nearestOf(interactables.filter(r => r.kind === t.object && r.enabled()));
    if (t.pickup) return nearestOf(pickups.filter(r => r.def.type === t.pickup && r.enabled()));
    return null;
  }

  // VR toast: a small board just below your line of sight.
  const toastCanvas = document.createElement("canvas"); toastCanvas.width = 1024; toastCanvas.height = 160;
  const tctx = toastCanvas.getContext("2d");
  const toastTex = new THREE.CanvasTexture(toastCanvas); toastTex.colorSpace = THREE.SRGBColorSpace;
  const toastMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.1), new THREE.MeshBasicMaterial({ map: toastTex, transparent: true, depthTest: false, depthWrite: false, fog: false }));
  toastMesh.position.set(0, -0.27, -0.95); toastMesh.rotation.x = -0.25; toastMesh.renderOrder = 10001; toastMesh.visible = false;
  camera.add(toastMesh);
  const toastQueue = [];
  let toastTimer = 0;
  const TOAST_COLORS = { chapter: "#c58bff", mission: "#ffcf4a", objective: "#5ff5e8", complete: "#6aff9e", credits: "#ff6fe0", warn: "#ff8a5a", info: "#9fe9ff", district: "#ffffff" };
  let lastToastSound = 0;
  const TOAST_SOUNDS = { mission: "mission", objective: "objective", complete: "complete", credits: "credits", warn: "warn", district: "district", chapter: "chapter" };
  function toast(text, kind = "info") {
    toastQueue.push({ text, kind });
    const nowMs = performance.now();
    if (TOAST_SOUNDS[kind] && (nowMs - lastToastSound > 900 || kind === "complete" || kind === "chapter")) { audio.play(TOAST_SOUNDS[kind]); lastToastSound = nowMs; }
    if (hud.toasts) {
      const el = document.createElement("div");
      el.className = "toast toast-" + kind; el.textContent = text;
      hud.toasts.appendChild(el);
      setTimeout(() => el.classList.add("out"), 4200);
      setTimeout(() => el.remove(), 5000);
      while (hud.toasts.children.length > 4) hud.toasts.firstChild.remove();
    }
  }
  function drawToast({ text, kind }) {
    const c = tctx; c.clearRect(0, 0, 1024, 160);
    c.fillStyle = "rgba(6,10,24,0.88)"; roundRect(c, 4, 4, 1016, 152, 22); c.fill();
    c.strokeStyle = TOAST_COLORS[kind] || "#5ff5e8"; c.lineWidth = 5; c.stroke();
    c.fillStyle = "#ffffff"; c.font = "bold 34px Arial"; c.textAlign = "center"; c.textBaseline = "middle";
    const lines = wrapText(c, text, 960).slice(0, 2);
    lines.forEach((l, i) => c.fillText(l, 512, lines.length === 1 ? 80 : 56 + i * 48));
    c.textAlign = "left";
    toastTex.needsUpdate = true;
  }
  function updateToasts(dt) {
    if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) toastMesh.visible = false; return; }
    const next = toastQueue.shift();
    if (!next) return;
    drawToast(next);
    toastMesh.visible = renderer.xr.isPresenting;
    toastTimer = next.kind === "district" ? 2.2 : 3.4;
  }

  // Fade-to-black sphere around the head: used for lifts and story moments.
  const fadeMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false, depthWrite: false, fog: false });
  const fade = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8), fadeMat);
  fade.renderOrder = 9999; fade.visible = false;
  camera.add(fade);
  let fadeAnim = null;
  function fadeTo(target, seconds, done) { fade.visible = true; fadeAnim = { from: fadeMat.opacity, to: target, t: 0, d: seconds, done }; }
  function updateFade(dt) {
    if (!fadeAnim) return;
    fadeAnim.t += dt;
    const k = Math.min(1, fadeAnim.t / fadeAnim.d);
    fadeMat.opacity = fadeAnim.from + (fadeAnim.to - fadeAnim.from) * k;
    if (k >= 1) { const done = fadeAnim.done; fadeAnim = null; if (fadeMat.opacity <= 0.001) fade.visible = false; done?.(); }
  }
  function teleport(to, district) {
    if (fadeAnim) return;
    audio.play("lift");
    fadeTo(1, 0.35, () => {
      player.position.copy(to);
      ctx.onTeleport?.();
      if (district) toast(district, "district");
      setTimeout(() => fadeTo(0, 0.45), 150);
    });
  }
  function coreFlare() {
    core.flare?.();
    audio.play("flare");
    fadeMat.color.set(0x9ffcff);
    fadeTo(0.55, 0.12, () => fadeTo(0, 0.9, () => fadeMat.color.set(0x000000)));
  }

  // ════════════════════════════════════════════════════════════════════════
  // Pointing & input
  // ════════════════════════════════════════════════════════════════════════
  const promptCanvas = document.createElement("canvas"); promptCanvas.width = 512; promptCanvas.height = 112;
  const prctx = promptCanvas.getContext("2d");
  const promptTex = new THREE.CanvasTexture(promptCanvas); promptTex.colorSpace = THREE.SRGBColorSpace;
  const promptSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: promptTex, transparent: true, depthTest: false, depthWrite: false, fog: false }));
  promptSprite.scale.set(0.5, 0.11, 1); promptSprite.renderOrder = 3200; promptSprite.visible = false;
  scene.add(promptSprite);
  let promptKey = "";
  function drawPrompt(rec, vr) {
    const key = rec.id + vr;
    if (key === promptKey) return;
    promptKey = key;
    const c = prctx; c.clearRect(0, 0, 512, 112);
    c.fillStyle = "rgba(6,10,24,0.9)"; roundRect(c, 4, 4, 504, 104, 18); c.fill(); c.strokeStyle = "#5ff5e8"; c.lineWidth = 4; c.stroke();
    c.textAlign = "center"; c.fillStyle = "#ffcf4a"; c.font = "bold 28px Arial"; c.fillText(`TRIGGER · ${rec.verb}`, 256, 44);
    c.fillStyle = "#ffffff"; c.font = "bold 30px Arial"; c.fillText(rec.label, 256, 86);
    promptTex.needsUpdate = true;
  }

  // Returns the interactable a ray points at (respecting walls & range).
  function pick(ray, originIsHead) {
    raycaster.ray.copy(ray);
    raycaster.far = 7;
    const targets = hitTargets.filter(h => { const r = h.userData.interactable; return r.enabled() && h.parent?.visible !== false && (!r.desktopOnly || !renderer.xr.isPresenting); });
    const hits = raycaster.intersectObjects(blockers ? targets.concat(blockers) : targets, false);
    const first = hits[0];
    if (!first || !first.object.userData.interactable) return null;
    const rec = first.object.userData.interactable;
    if (first.distance > rec.range + (originIsHead ? 0.6 : 0)) return null;
    return { rec, point: first.point, distance: first.distance };
  }

  let vrHover = new Map();     // controller -> {rec} or {panelIndex}
  let desktopHover = null;
  const ctrlRay = new THREE.Ray();
  const ctrlMatrix = new THREE.Matrix4();
  function rayFromController(controller) {
    ctrlMatrix.identity().extractRotation(controller.matrixWorld);
    ctrlRay.origin.setFromMatrixPosition(controller.matrixWorld);
    ctrlRay.direction.set(0, 0, -1).applyMatrix4(ctrlMatrix);
    return ctrlRay;
  }
  const centerNDC = new THREE.Vector2(0, 0);
  const mouseNDC = new THREE.Vector2();
  let mouseKnown = false;
  window.addEventListener("mousemove", e => { mouseNDC.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); mouseKnown = true; });
  function desktopRay(useMouse) {
    raycaster.setFromCamera(useMouse && mouseKnown ? mouseNDC : centerNDC, camera);
    return raycaster.ray.clone();
  }

  function updatePointing(controllers) {
    promptSprite.visible = false;
    let vrPrompt = null;
    if (renderer.xr.isPresenting) {
      for (const controller of controllers) {
        if (!controller.userData.handedness) continue;
        const ray = rayFromController(controller);
        if (panel.visible) {
          const r = panelHit(ray);
          vrHover.set(controller, { panelIndex: r?.index ?? -1, point: r?.hit?.point });
          if (controller.userData.handedness === "right" || r?.index >= 0) setHover(r?.index ?? -1);
          continue;
        }
        const p = pick(ray, false);
        vrHover.set(controller, p);
        if (p && (!vrPrompt || controller.userData.handedness === "right")) vrPrompt = p;
      }
      if (vrPrompt) {
        drawPrompt(vrPrompt.rec, true);
        camera.getWorldPosition(headPos);
        promptSprite.position.copy(vrPrompt.point).lerp(headPos, 0.25);
        promptSprite.position.y += 0.18;
        promptSprite.visible = true;
      }
      return;
    }
    // desktop
    if (panel.visible) { const r = panelHit(desktopRay(!document.pointerLockElement)); setHover(r?.index ?? -1); desktopHover = null; }
    else desktopHover = isInCity() ? pick(desktopRay(false), true) : null;
    if (hud.prompt) {
      if (desktopHover) { hud.prompt.innerHTML = `<kbd>F</kbd> ${desktopHover.rec.verb} · ${desktopHover.rec.label}`; hud.prompt.hidden = false; }
      else hud.prompt.hidden = true;
    }
  }
  // Pointer info for the existing cyan cursor dot in main.js
  function cursorPoint(controller) { const h = vrHover.get(controller); return h?.point || null; }

  function onTrigger(controller) {
    if (!isInCity()) return false;
    const h = vrHover.get(controller);
    if (panel.visible) { if (h?.panelIndex >= 0) choose(h.panelIndex); return true; }
    if (h?.rec) { h.rec.use(); return true; }
    return false;
  }
  function desktopInteract() {
    if (!isInCity()) return false;
    if (panel.visible) { if (hoverIndex >= 0) choose(hoverIndex); return true; }
    if (desktopHover) { desktopHover.rec.use(); return true; }
    return false;
  }
  function desktopClick() {
    if (!panel.visible) return false;
    const r = panelHit(desktopRay(!document.pointerLockElement));
    if (r?.index >= 0) choose(r.index);
    return true;
  }
  function handleKey(code) {
    if (!panel.visible) return false;
    const m = /^Digit([1-9])$/.exec(code) || /^Numpad([1-9])$/.exec(code);
    if (m) { choose(Number(m[1]) - 1); return true; }
    if (code === "Escape" && panelState?.mode === "shop") { closePanel(); return true; }
    return false;
  }

  // ════════════════════════════════════════════════════════════════════════
  // HUD & per-frame update
  // ════════════════════════════════════════════════════════════════════════
  const MAIN_IDS = Object.keys(MISSIONS).filter(k => MISSIONS[k].kind === "main");
  const partOf = id => MAIN_IDS.indexOf(id) + 1;
  let lastDistrict = "";
  function updateHUD(dist) {
    const id = trackedMission();
    if (!hud.root) return;
    if (id) {
      const def = MISSIONS[id], step = currentStep(id);
      hud.title.textContent = `${def.kind === "main" ? `CH.1 · PART ${partOf(id)}/${MAIN_IDS.length}` : "SIDE JOB"} · ${def.title}`;
      let txt = step?.text || "";
      if (step?.done?.count) txt += ` (${count(step.done.collect || step.done.interact)}/${step.done.count})`;
      hud.text.textContent = txt;
    } else {
      const s = objectiveSummary();
      hud.title.textContent = s.title;
      hud.text.textContent = s.text;
    }
    if (hud.dist) hud.dist.textContent = dist != null ? `${Math.round(dist)} m` : "";
  }
  function objectiveSummary() {
    const id = trackedMission();
    if (!id) {
      if (state.flags.chapter1_done) {
        const sides = ["s1", "s2", "s3"].filter(k => status(k) !== "done").length;
        return { title: "CHAPTER 1 COMPLETE · CHAPTER 2 COMING SOON",
          text: sides ? `You've finished the story so far. ${sides} side job${sides > 1 ? "s" : ""} left: find Pip, Lulu or Whisper.` : "You've finished everything in this version. Chapter 2 is coming soon." };
      }
      return { title: "EXPLORE", text: "Talk to people around the city." };
    }
    const step = currentStep(id);
    let txt = step?.text || "";
    if (step?.done?.count) txt += ` (${count(step.done.collect || step.done.interact)}/${step.done.count})`;
    return { title: MISSIONS[id].title, text: txt, chapter: MISSIONS[id].chapter, kind: MISSIONS[id].kind };
  }

  let hudTimer = 0;
  let finaleMood = 0;   // seconds left of the finale music cue
  function update(time, dt, controllers, worldTime = time, worldDt = dt) {
    if (!isInCity()) { promptSprite.visible = false; return; }
    player.getWorldPosition(tmpV2);
    camera.getWorldPosition(headPos);
    npcSys.update(worldTime, worldDt, headPos.clone().setY(tmpV2.y), talkingTo?.id);
    // pickups bob & spin, only shown when relevant
    for (const r of interactables) {
      if (r.kind === "pickup") {
        const on = r.enabled(); r.object.visible = on;
        if (on && r.object.position.distanceToSquared(tmpV2) < 1600) { r.model.rotation.y = time * 0.002; r.model.position.y = Math.sin(time * 0.003 + r.object.position.x) * 0.05; }
      }
      r.update?.(time);
    }
    // visit objectives
    for (const id of Object.keys(state.missions)) {
      const step = currentStep(id);
      if (step?.done?.visit && A[step.done.visit] && A[step.done.visit].distanceTo(tmpV2) < 9) completeStep(id);
    }
    // objective beacon
    const target = objectivePosition();
    let dist = null;
    if (target) {
      dist = Math.hypot(target.x - tmpV2.x, target.z - tmpV2.z);
      const sameLevel = Math.abs(target.y - tmpV2.y) < 5;
      beacon.visible = guideSettings.guide !== "path" && (dist > 3.5 || !sameLevel);
      beacon.position.set(target.x, target.y + 35, target.z);
      const main = MISSIONS[trackedMission()]?.kind === "main";
      beaconMat.color.set(main ? 0xffcf4a : 0x5ff5e8); beaconRing.material.color.copy(beaconMat.color);
      beaconMat.opacity = 0.22 + Math.sin(time * 0.004) * 0.08;
      // Wayfinder optic: floating distance read-out above the target
      distLabel.visible = isActive("wayfinder") && (dist > 3.5 || !sameLevel);
      if (distLabel.visible) {
        const txt = `${Math.round(dist)} m`;
        if (txt !== lastDistText) { lastDistText = txt; const c = distLabel.material.map.image.getContext("2d"); c.clearRect(0, 0, 512, 96); c.fillStyle = "rgba(5,10,22,0.85)"; roundRect(c, 4, 4, 504, 88, 14); c.fill(); c.strokeStyle = "#ffcf4a"; c.lineWidth = 4; c.stroke(); c.fillStyle = "#fff"; c.font = "bold 48px Arial"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(txt, 256, 50); distLabel.material.map.needsUpdate = true; }
        distLabel.position.set(target.x, target.y + 3.4, target.z);
        const s = THREE.MathUtils.clamp(dist * 0.05, 0.8, 4); distLabel.scale.set(1.6 * s, 0.3 * s, 1);
      }
    } else { beacon.visible = false; distLabel.visible = false; }
    guide.update(time, tmpV2, target && (Math.hypot(target.x - tmpV2.x, target.z - tmpV2.z) > 2.2 || Math.abs(target.y - tmpV2.y) > 4) ? target : null, MISSIONS[trackedMission()]?.kind === "main");
    for (const { b, p } of shardBeacons) b.visible = isActive("wayfinder") && p.enabled();
    // district name toast when you cross into a new area
    const district = city.districtAt(tmpV2.z, tmpV2.y, tmpV2.x);
    if (district !== lastDistrict) { if (lastDistrict) toast(district, "district"); lastDistrict = district; if (hud.district) hud.district.textContent = district; }
    audio.setMood(finaleMood > 0 ? "finale" : ({ "THE SUMP": "sump", "RING ROAD": "ring", "NEON MILE": "mile", "SPIRE PLAZA": "plaza", "THE DOCKS": "plaza" }[district] || "roof"));
    if (finaleMood > 0) finaleMood -= dt;
    updatePointing(controllers);
    updateToasts(dt);
    updateFade(dt);
    hudTimer -= dt;
    if (hudTimer <= 0) { hudTimer = 0.25; updateHUD(isActive("wayfinder") ? dist : null); }
    if (panel.visible && talkingTo) { // close if you walk/teleport away
      if (talkingTo.holder.position.distanceTo(tmpV2) > 8 && Math.abs(talkingTo.holder.position.y - tmpV2.y) < 5) closePanel();
    }
  }

  function beginSession() {
    lastDistrict = "";
    refreshWorld();
    updateHUD();
    if (!state.introSeen) {
      state.introSeen = true; saveGame();
      fadeMat.opacity = 1; fade.visible = true;
      setTimeout(() => { fadeTo(0, 1.6); openDialogue("intro"); }, 400);
    } else {
      const s = objectiveSummary();
      toast(`${s.title.toUpperCase()} · ${s.text}`, "objective");
    }
  }
  function onExit() { closePanel(); promptSprite.visible = false; toastMesh.visible = false; fade.visible = false; fadeMat.opacity = 0; fadeAnim = null; }

  refreshWorld();

  return {
    update, onTrigger, desktopInteract, desktopClick, handleKey, cursorPoint, beginSession, onExit,
    isPanelOpen: () => panel.visible, closePanel, objectiveSummary, toast, npcSys, openShop, give: (n, why) => give(n, why), awardXP: n => awardXP(n),
    debug: { startMission, completeStep, emit, openDialogue, state, interactables, choose, objectivePosition }
  };
}
