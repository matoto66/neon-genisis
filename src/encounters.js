// NEON GENESIS — story fights and their intro cutscenes.
//
// When a mission reaches a "fight" step and you're in the right place, a short
// VR-safe cutscene plays (your head stays free, nothing moves your view):
//   • letterbox bars slide in, the world slows, a warning sting plays
//   • the enemies arrive: drones drop out of the sky on red search beams,
//     a Tenkai dropship flies in and lowers its squad on light-cables
//   • a big holo title card names who you're fighting
//   • "FIGHT!" — time snaps back and they come for you
// Pull the trigger (or click) after a second to skip it.
import * as THREE from "three";

export const FIGHTS = {
  m2_ambush: {
    mission: "m2", step: 2, center: [1.5, 0, -4], trigger: p => p.x > -10.4 && p.z > -16 && p.z < 8, respawn: [-12.5, 0, -4.8],
    title: "TENKAI SCAV SWARM", sub: "The Core's ping led them straight to Mika's Repair", color: "#ffb02e", arrive: "drop",
    wave: [["scav", 4, -7], ["scav", -2, -9], ["scav", 5, 3], ["sentry", 1, -13]]
  },
  m4_squad: {
    mission: "m4", step: 1, center: "player", trigger: p => p.z < -56 && p.z > -116 && Math.abs(p.x) < 36 && p.y < 3, respawn: "center",
    title: "TENKAI RESPONSE TEAM", sub: "The jammers tripped a silent alarm", color: "#ff3a4a", arrive: "dropship",
    wave: [["enforcer", 3, -5], ["enforcer", -3, -6], ["gunner", 0, -10], ["sentry", 4, -11]]
  },
  m6_boss: {
    mission: "m6", step: 2, center: "plaza", trigger: p => p.z < -110 && Math.abs(p.x) < 32 && p.y < 3, respawn: "center",
    title: "SGT. KAGE OKABE", sub: "Tenkai Security · \"Alive is optional.\"", color: "#ff2a3a", arrive: "dropship", boss: true,
    wave: [["sergeant", 0, -7], ["gunner", -5, -9], ["gunner", 5, -9], ["sentry", -3, -12], ["sentry", 3, -12]]
  }
};

const FALLBACK = { m4_squad: new THREE.Vector3(0, 0, -80) };     // where to send you if the fight hasn't started yet

export function createEncounters({ root, scene, camera, player, renderer, city, game, combat, audio, haptic, weapons }) {
  const sfx = n => audio?.play(n);
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), head = new THREE.Vector3();
  const runs = {};      // id → { phase: "intro"|"fight"|"done", enemies, center, t }
  const custom = {};    // non-story fights started by other systems (e.g. the cyberpsycho hunt)
  const defOf = id => FIGHTS[id] || custom[id];
  let cut = null;       // the cutscene currently playing

  // ── letterbox + title card ────────────────────────────────────────────
  const barMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.92, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
  const bars = [1, -1].map(s => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.16), barMat); m.position.set(0, s * 0.31, -0.35); m.renderOrder = 9980; m.visible = false; camera.add(m); return { m, s }; });
  const cardCanvas = document.createElement("canvas"); cardCanvas.width = 1024; cardCanvas.height = 400;
  const cardTex = new THREE.CanvasTexture(cardCanvas); cardTex.colorSpace = THREE.SRGBColorSpace;
  const card = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.94), new THREE.MeshBasicMaterial({ map: cardTex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false, side: THREE.DoubleSide }));
  card.renderOrder = 9970; card.visible = false; scene.add(card);
  function drawCard(f, counts, t) {
    const c = cardCanvas.getContext("2d"); c.clearRect(0, 0, 1024, 400);
    const col = f.color;
    c.fillStyle = "rgba(6,4,10,0.82)"; c.beginPath(); c.roundRect(10, 40, 1004, 320, 26); c.fill();
    c.strokeStyle = col; c.lineWidth = 6; c.stroke();
    // hazard stripes
    c.save(); c.beginPath(); c.rect(10, 40, 1004, 34); c.clip();
    for (let x = -60 + (t * 120) % 60; x < 1060; x += 60) { c.fillStyle = col; c.beginPath(); c.moveTo(x, 40); c.lineTo(x + 30, 40); c.lineTo(x + 4, 74); c.lineTo(x - 26, 74); c.fill(); }
    c.restore();
    c.textAlign = "center"; c.textBaseline = "middle";
    c.fillStyle = "#ffffff"; c.font = "bold 30px Arial"; c.fillText(f.boss ? "⚠  BOSS FIGHT  ⚠" : "⚠  HOSTILES INBOUND  ⚠", 512, 112);
    let fs = 84; c.font = `900 ${fs}px Arial`; while (c.measureText(f.title).width > 940 && fs > 40) { fs -= 4; c.font = `900 ${fs}px Arial`; }
    c.fillStyle = col; c.fillText(f.title, 512, 190);
    c.fillStyle = "#e8eefc"; c.font = "italic 32px Arial"; c.fillText(f.sub, 512, 254);
    c.fillStyle = "#c8d4ea"; c.font = "bold 28px Arial"; c.fillText(counts, 512, 316);
    cardTex.needsUpdate = true;
  }

  // ── the dropship ──────────────────────────────────────────────────────
  function makeDropship() {
    const g = new THREE.Group(); g.name = "TENKAI_DROPSHIP";
    const hull = new THREE.MeshStandardMaterial({ color: 0x15181f, metalness: 0.9, roughness: 0.3 });
    const red = new THREE.MeshBasicMaterial({ color: 0xff3a4a, toneMapped: false });
    const add = (geo, m, x, y, z) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); g.add(me); return me; };
    add(new THREE.BoxGeometry(3.2, 1.3, 7), hull, 0, 0, 0);
    add(new THREE.BoxGeometry(2.4, 0.9, 2.2), hull, 0, 0.45, -3.6).rotation.x = 0.35;
    add(new THREE.BoxGeometry(9, 0.25, 2.2), hull, 0, 0.2, 0.6);
    for (const x of [-4.2, 4.2]) { add(new THREE.CylinderGeometry(0.9, 0.9, 0.5, 16), hull, x, 0.1, 0.6); add(new THREE.CircleGeometry(0.8, 16), red, x, -0.16, 0.6).rotation.x = Math.PI / 2; }
    add(new THREE.BoxGeometry(3.25, 0.08, 0.08), red, 0, -0.2, -3.5); add(new THREE.BoxGeometry(0.08, 0.08, 6.8), red, 1.62, -0.2, 0); add(new THREE.BoxGeometry(0.08, 0.08, 6.8), red, -1.62, -0.2, 0);
    const beam = new THREE.Mesh(new THREE.ConeGeometry(4, 14, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xff3a4a, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    beam.position.y = -7; g.add(beam); g.userData.beam = beam;
    const lamp = new THREE.PointLight(0xff3a4a, 30, 30, 2); lamp.position.y = -1.5; g.add(lamp);
    g.visible = false; root.add(g);
    return g;
  }
  const ship = makeDropship();
  const cableMat = new THREE.MeshBasicMaterial({ color: 0xff3a4a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const searchMat = new THREE.MeshBasicMaterial({ color: 0xff5a3a, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });

  // a free standing spot near (x, z)
  function freeSpot(x, z) {
    for (let r = 0; r < 6; r += 0.5) for (let a = 0; a < 12; a++) {
      const px = x + Math.cos(a / 12 * Math.PI * 2) * r, pz = z + Math.sin(a / 12 * Math.PI * 2) * r;
      const gy = city.surfaceAt(px, pz, 0.5);
      if (gy < 0.3 && !city.collides(px, pz, gy, 0.5)) return new THREE.Vector3(px, gy, pz);
      if (r === 0) break;
    }
    return new THREE.Vector3(x, 0, z);
  }
  function centerOf(f, id) {
    if (runs[id]?.center) return runs[id].center;
    if (Array.isArray(f.center)) return new THREE.Vector3(...f.center);
    if (f.center === "player") return player.position.clone();
    return city.anchors[f.center]?.clone() || player.position.clone();
  }

  function start(id) {
    const f = defOf(id);
    const center = centerOf(f, id).clone(); center.y = 0;
    // face the squad toward where you are looking, so the cutscene happens in front of you
    camera.getWorldPosition(head);
    camera.getWorldDirection(v1); v1.y = 0; if (v1.lengthSq() < 1e-4) v1.set(0, 0, -1); v1.normalize();
    const fwd = v1.clone(), right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const base = f.center === "player" || f.center === "plaza" ? new THREE.Vector3(head.x, 0, head.z) : center;
    const enemies = f.wave.map(([type, ox, oz]) => {
      const want = base.clone().addScaledVector(right, ox).addScaledVector(fwd, -oz);
      const spot = freeSpot(want.x, want.z);
      const e = combat.spawn(type, spot);
      e.cine = true; e.final = e.group.position.clone();
      e.group.rotation.y = Math.atan2(head.x - spot.x, head.z - spot.z);
      if (f.arrive === "drop" || !e.human) {
        e.group.position.y += 14 + Math.random() * 4;
        const cone = new THREE.Mesh(new THREE.ConeGeometry(1.2, 8, 16, 1, true), searchMat); cone.position.y = -4; e.cone = cone; root.add(cone);
      } else { e.group.position.y = 12; e.group.visible = false; }
      return e;
    });
    const shipFrom = base.clone().addScaledVector(fwd, 70).add(new THREE.Vector3(0, 14, 0)).addScaledVector(right, -25);
    const shipAt = base.clone().addScaledVector(fwd, 13).add(new THREE.Vector3(0, 8.5, 0));
    runs[id] = { phase: "intro", enemies, center: base.clone(), t: 0 };
    const counts = Object.entries(f.wave.reduce((m, [t]) => (m[t] = (m[t] || 0) + 1, m), {})).map(([t, n]) => `${n}× ${t === "scav" ? "SCAV DRONE" : t === "sentry" ? "SENTRY DRONE" : t === "psycho" ? "CYBERPSYCHO" : t.toUpperCase()}`).join("  ·  ");
    cut = { id, f, t: 0, skipAfter: 1.2, dur: f.arrive === "dropship" ? 5.2 : 4.2, counts, fwd, right, shipFrom, shipAt, base };
    // place the title card in front of you
    card.position.copy(head).addScaledVector(fwd, 4.2); card.position.y = head.y + 1.15;      // above the action, not on top of it
    card.lookAt(head.x, card.position.y, head.z); card.visible = false; card.scale.setScalar(0.01);
    if (f.arrive === "dropship") { ship.visible = true; ship.position.copy(shipFrom); ship.lookAt(shipAt.x, shipFrom.y, shipAt.z); }
    sfx("sting"); haptic?.("both", 0.6, 250);
    weapons?.holsterAll?.();
    game.toast(f.boss ? "BOSS FIGHT" : "AMBUSH", "warn");
  }
  function endCutscene() {
    const { id, f } = cut, run = runs[id];
    for (const e of run.enemies) {
      e.cine = false; e.group.visible = true;
      e.group.position.copy(e.final); if (e.def.hover) e.group.position.y = e.def.hover;
      if (e.cone) { root.remove(e.cone); e.cone = null; }
      if (e.cable) { root.remove(e.cable); e.cable = null; }
      combat.alertEnemy(e); e.spottedT = 0.6;
    }
    for (const b of bars) b.m.visible = false;
    card.visible = false;
    run.phase = "fight";
    cut = null;
    game.toast(f.boss ? "TAKE HIM DOWN!" : "FIGHT!", "chapter");
    const hint = weapons?.owns("p9") && !weapons?.state?.hinted;
    if (hint) { weapons.state.hinted = true; setTimeout(() => game.toast(renderer.xr.isPresenting ? "DRAW: squeeze grip at your right hip · TRIGGER fires" : "Press 1 to draw the P9 · click to fire · R reloads", "objective"), 1500); }
  }
  function updateCutscene(dt) {
    const c = cut; c.t += dt;
    const k = c.t, run = runs[c.id];
    // bars slide in / out
    const barIn = Math.min(1, k / 0.4) * (k > c.dur - 0.35 ? Math.max(0, (c.dur - k) / 0.35) : 1);
    for (const b of bars) { b.m.visible = barIn > 0.01; b.m.position.y = b.s * (0.39 - 0.08 * barIn); }
    // title card pops in
    if (k > 0.7) {
      card.visible = true;
      const s = Math.min(1, (k - 0.7) / 0.25); card.scale.setScalar(0.6 + 0.4 * (1 - Math.pow(1 - s, 3)));
      card.material.opacity = k > c.dur - 0.4 ? Math.max(0, (c.dur - k) / 0.4) : 1;
      drawCard(c.f, c.counts, k);
    }
    // arrivals
    if (c.f.arrive === "dropship") {
      const fly = THREE.MathUtils.smoothstep(k, 0, 1.8);
      ship.position.lerpVectors(c.shipFrom, c.shipAt, fly);
      ship.position.y += Math.sin(k * 2) * 0.15;
      ship.userData.beam.material.opacity = 0.08 + Math.sin(k * 6) * 0.03;
      if (k > c.dur - 1.0) { const away = (k - (c.dur - 1.0)) / 1.0; ship.position.y += away * away * 30; ship.position.addScaledVector(c.right, away * away * 40); }
    }
    run.enemies.forEach((e, i) => {
      const delay = 0.5 + i * 0.35, dropT = THREE.MathUtils.clamp((k - delay) / 1.4, 0, 1);
      const ease = 1 - Math.pow(1 - dropT, 3);
      if (c.f.arrive === "dropship" && e.human) {
        if (k < 1.7) return;
        e.group.visible = true;
        const d = THREE.MathUtils.clamp((k - 1.7 - i * 0.3) / 1.2, 0, 1);
        const from = ship.position.clone().addScaledVector(c.right, (i - 1) * 0.9); from.y -= 1;
        e.group.position.lerpVectors(from, e.final, 1 - Math.pow(1 - d, 2));
        if (!e.cable) { e.cable = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1, 6), cableMat); root.add(e.cable); }
        const top = from, bot = e.group.position.clone(); bot.y += 1.8;
        e.cable.position.lerpVectors(top, bot, 0.5); e.cable.scale.y = Math.max(0.01, top.distanceTo(bot)); e.cable.visible = d < 1;
        if (d >= 1 && !e.landed) { e.landed = true; combat.burst(e.final.clone().setY(0.1), 0xff3a4a, 16, 2.5); sfx("punchHeavy"); }
      } else {
        const hover = e.def.hover || 0;
        e.group.position.y = THREE.MathUtils.lerp(e.final.y + hover + 16, e.final.y + hover, ease);
        if (e.cone) { e.cone.position.set(e.group.position.x, e.group.position.y - 4, e.group.position.z); e.cone.material.opacity = 0.16 * (1 - dropT * 0.5); }
        if (e.rotors) for (const r of e.rotors) r.rotation.z += dt * 40;
      }
    });
    if (k > c.dur) endCutscene();
  }

  // ── per frame ─────────────────────────────────────────────────────────
  function stepActive(f) { const m = game.debug?.state?.missions?.[f.mission] || null; return m && m.status === "active" && m.step === f.step; }
  function update(dt) {
    if (cut) updateCutscene(dt);
    else if (ship.visible) ship.visible = false;
    // custom fights: start as soon as nothing else is going on, finish when everyone's down
    for (const [id, f] of Object.entries(custom)) {
      const run = runs[id];
      if (!run || run.phase === "waiting") { if (!cut && !game.isPanelOpen() && !combat.dead && !(f.when && !f.when())) start(id); continue; }
      if (run.phase === "fight" && run.enemies.every(e => e.dead)) { run.phase = "done"; delete custom[id]; delete runs[id]; f.onClear?.(); }
    }
    for (const [id, f] of Object.entries(FIGHTS)) {
      const run = runs[id];
      if (!stepActive(f)) { if (run && run.phase !== "done") reset(id); continue; }
      if (!run || run.phase === "waiting") {
        if (cut || game.isPanelOpen() || combat.dead) continue;
        const c = centerOf(f, id);
        const inArea = f.trigger ? f.trigger(player.position) : player.position.distanceTo(c) < (f.radius || 12);
        if (inArea) start(id);
      } else if (run.phase === "fight") {
        if (run.enemies.every(e => e.dead)) {
          run.phase = "done";
          game.toast(f.boss ? "SGT. OKABE IS DOWN" : "AREA SECURED", "complete");
          if (id === "m4_squad" && !weapons?.owns("baton")) setTimeout(() => weapons?.give("baton"), 1200);
          if (f.boss) game.give?.(400, "Okabe's bounty");
          game.emit("fight", id);
        }
      }
    }
  }
  function reset(id) {
    const run = runs[id]; if (!run) return;
    for (const e of run.enemies) { if (e.cone) root.remove(e.cone); if (e.cable) root.remove(e.cable); if (!e.dead) combat.despawn(e); }
    if (cut?.id === id) { cut = null; for (const b of bars) b.m.visible = false; card.visible = false; }
    runs[id] = { phase: "waiting", center: run.center };
  }
  // dying mid-fight: wake up next to the fight, the squad regroups and comes again
  function onRespawn() {
    for (const [id, f] of Object.entries(custom)) { if (runs[id]) reset(id); delete runs[id]; delete custom[id]; f.onFail?.(); }
    for (const [id, f] of Object.entries(FIGHTS)) {
      const run = runs[id];
      if (!run || run.phase === "done" || run.phase === "waiting") continue;
      const c = f.respawn === "center" ? run.center.clone() : new THREE.Vector3(...f.respawn);
      reset(id);
      const spot = freeSpot(c.x + 4, c.z + 4);
      return spot;
    }
    return null;
  }
  combat.hooks.onRespawn = onRespawn;

  return {
    update, start, reset,
    startCustom(id, def) { if (custom[id]) return false; custom[id] = def; return true; },
    cancelCustom(id) { if (runs[id]) reset(id); delete runs[id]; delete custom[id]; },
    customEnemies(id) { return runs[id]?.enemies || []; },
    get storyFightActive() { return Object.keys(FIGHTS).some(id => runs[id] && (runs[id].phase === "intro" || runs[id].phase === "fight")); },
    get cutscene() { return !!cut; },
    skip() { if (cut && cut.t > cut.skipAfter) { cut.t = cut.dur + 0.01; endCutscene(); return true; } return !!cut; },
    fightPos(id) { const run = runs[id]; if (run && (run.phase === "intro" || run.phase === "fight")) return null; if (run?.center) return run.center; const f = FIGHTS[id]; return !f ? null : f.center !== "player" ? centerOf(f, id) : (FALLBACK[id] || null); },
    debugRuns: runs,
    debugAdvance(sec) { for (let t = 0; t < sec && cut; t += 1 / 30) updateCutscene(1 / 30); },
    get debugCut() { return cut; }
  };
}
