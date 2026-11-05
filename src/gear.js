// NEON GENESIS — hands-on gear:
//  • street junk you can grab and throw (cans, bottles, boxes, cones, bowls)
//  • finds you stash in your backpack (reach over your shoulder and let go)
//  • med patch on your hip (grab it, press it to your other arm)
//  • food: bring it to your mouth to eat
//  • Optic Scan: hand to your temple + trigger (R on PC)
//  • Tether Line (crafted at Mika's): aim at a glowing anchor + trigger (G on PC)
//  • health shown by the glowing core on the back of your hands
import * as THREE from "three";
import { ITEMS, RECIPES } from "./story.js";
import { state, saveGame, maxHealth } from "./state.js";

const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), q1 = new THREE.Quaternion();

export function createGear({ root, scene, camera, player, renderer, city, combat, game, audio, haptic, mikaBench }) {
  const objects = [];
  const npcSys = game.npcSys;

  // ── meshes for each kind of object ─────────────────────────────────────
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.3, ...o });
  const SHAPES = {
    can:    { r: 0.04, make: () => { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.12, 12), M([0xff4fa3, 0x38f0e6, 0xffcf4a][Math.floor(Math.random() * 3)], { metalness: 0.8, roughness: 0.25 }))); return g; } },
    bottle: { r: 0.045, breakable: true, make: () => { const g = new THREE.Group(); const b = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.18, 10), M(0x2a6a3a, { transparent: true, opacity: 0.8, roughness: 0.1 })); g.add(b); const n = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.03, 0.09, 8), b.material); n.position.y = 0.13; g.add(n); return g; } },
    box:    { r: 0.16, make: () => { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.24, 0.26), M(0x8a6a48, { metalness: 0, roughness: 0.9 }))); const t = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.03, 0.06), M(0xd8c070, { metalness: 0 })); t.position.y = 0.12; g.add(t); return g; } },
    cone:   { r: 0.14, make: () => { const g = new THREE.Group(); const c = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.42, 14), M(0xff6a1a, { metalness: 0 })); c.position.y = 0.05; g.add(c); const s = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.095, 0.06, 14), new THREE.MeshBasicMaterial({ color: 0xffffff })); s.position.y = 0.04; g.add(s); const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.3), M(0x1a1a1a)); b.position.y = -0.15; g.add(b); return g; } },
    bowl:   { r: 0.08, make: () => { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.SphereGeometry(0.08, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M(0x9c3a2a, { side: THREE.DoubleSide, metalness: 0.1 }))); const s = new THREE.Mesh(new THREE.CircleGeometry(0.07, 14), M(0xd8b06a, { metalness: 0 })); s.rotation.x = -Math.PI / 2; s.position.y = -0.015; g.add(s); return g; } },
    patch:  { r: 0.04, make: () => { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.012, 0.06), M(0xf0f0f0, { metalness: 0 }))); const c = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.014, 0.012), new THREE.MeshBasicMaterial({ color: 0xff4fa3 })); g.add(c); const c2 = c.clone(); c2.rotation.y = Math.PI / 2; g.add(c2); return g; } }
  };
  // finds: small glowing objects (soft glow, no outlines)
  function makeFind(itemId) {
    const def = ITEMS[itemId], g = new THREE.Group();
    const glowM = new THREE.MeshBasicMaterial({ color: def.color });
    if (itemId === "scrap") { g.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.11), M(0x8a93a3, { metalness: 0.9 }))); const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.022, 0.012), glowM); b.position.z = 0.03; g.add(b); }
    else if (itemId === "circuit") { g.add(new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.01, 0.09), M(0x1a5a2a, { metalness: 0.2 }))); for (let i = 0; i < 3; i++) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.012, 0.004), glowM); t.position.z = -0.025 + i * 0.025; g.add(t); } }
    else if (itemId === "cell") { g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 12), M(0x2a2f3a, { metalness: 0.8 }))); const r = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.031, 0.03, 12), glowM); g.add(r); }
    else if (itemId === "noodles") { g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.1, 14), M(0xf0e8d8, { metalness: 0 }))); const l = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.012, 14), glowM); l.position.y = 0.05; g.add(l); }
    else if (itemId === "neuro_cola") { g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.12, 12), M(0xff4fa3, { metalness: 0.85, roughness: 0.2 }))); const l = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.02, 12), new THREE.MeshBasicMaterial({ color: 0xffffff })); g.add(l); }
    else { g.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.006, 0.04), M(0x15171c))); const c = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.008, 0.03), glowM); g.add(c); }
    // soft glow under it so it's findable without UI clutter
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color: def.color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5, toneMapped: false }));
    halo.scale.setScalar(0.45); g.add(halo); g.userData.halo = halo;
    return g;
  }
  let _halo = null;
  function haloTex() {
    if (_halo) return _halo;
    const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d");
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "rgba(255,255,255,0.9)"); gr.addColorStop(0.4, "rgba(255,255,255,0.25)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64); _halo = new THREE.CanvasTexture(c); return _halo;
  }

  // ── placing objects in the world ───────────────────────────────────────
  const PROPS = [
    ["bowl", 16.9, 1.13, 8.6], ["bowl", 16.9, 1.13, 11.4], ["can", 13.4, 0.52, 5.3], ["bottle", 14.7, 0.52, 5.2], ["box", 22.0, 0.12, 13.2],
    ["cone", 7.0, 0.21, 30], ["cone", -7.0, 0.21, -6], ["can", -9.6, 0.12, 14], ["bottle", -9.8, 0.12, -1], ["box", 9.8, 0.2, 2],
    ["can", 9.5, 0.12, -27], ["bottle", -9.5, 0.12, -30], ["cone", 7.2, 0.21, -40], ["cone", -7.2, 0.21, -52], ["box", 20, 0.2, -38.6],
    ["can", -22, 0.12, -53.5], ["bottle", 30, 0.12, -53.6], ["box", -30, 0.2, -38.4], ["can", -9.5, 0.12, -64], ["bottle", 9.6, 0.12, -70],
    ["box", -9.8, 0.2, -88], ["can", 9.6, 0.12, -98], ["cone", 0, 0.21, -112], ["bottle", -12, 0.12, -120], ["can", 14, 0.12, -126],
    ["box", 52, 0.12, -40], ["box", 66, 0.12, -50], ["bottle", 74, 0.06, -44], ["can", 90, 0.06, -50], ["cone", 47.5, 0.21, -42]
  ];
  // spots where finds turn up (the item type is rolled each time it respawns)
  const FIND_SPOTS = [
    [-17.5, 0.05, 9.0], [-23.6, 0.05, -24.5], [16.8, 0.05, -9.2], [24.5, 0.05, 14.8], [-12.6, 19.05, -20], [-24.5, 19.05, -9],
    [-10.4, 0.05, 31], [10.3, 0.05, -33], [-40, 0.05, -40], [38, 0.05, -52.5], [-10.3, 0.05, -60], [28, 0.05, -104],
    [-10.2, 0.05, -100], [24, 0.05, -130], [-26, 0.05, -134], [58, 5.25, -30], [80, 7.85, -64], [62, 9.05, 0],
    [100, 0.05, -66], [132, 1.0, -36], [72, 0.05, -20], [110, 0.05, -40]
  ];
  const FIND_WEIGHTS = [["scrap", 5], ["circuit", 3], ["cell", 3], ["noodles", 2], ["neuro_cola", 2], ["data_chip", 2]];
  const rollFind = () => { let r = Math.random() * FIND_WEIGHTS.reduce((a, [, w]) => a + w, 0); for (const [id, w] of FIND_WEIGHTS) { r -= w; if (r <= 0) return id; } return "scrap"; };
  const RESPAWN_MS = 8 * 60 * 1000;
  const findsLog = () => (state.flags.finds ||= {});

  function addObject(kind, type, x, y, z, itemId) {
    const mesh = kind === "find" ? makeFind(itemId) : SHAPES[type].make();
    mesh.position.set(x, y, z); mesh.rotation.y = Math.random() * Math.PI * 2;
    mesh.traverse(o => { if (o.isMesh) o.castShadow = false; });
    root.add(mesh);
    const r = kind === "find" ? 0.07 : SHAPES[type].r;
    const o = { id: kind + objects.length, kind, type, itemId, mesh, r, home: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(), spin: new THREE.Vector3(), held: null, resting: true, movedAt: 0, hidden: false };
    // PC: look at it and press F
    const hit = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.16, r * 1.6), 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    mesh.add(hit);
    o.rec = game.addInteractable({ id: o.id, kind: "gear", object: mesh, hit, range: 2.6, desktopOnly: true,
      get label() { return o.kind === "find" ? ITEMS[o.itemId].name : ({ can: "Empty can", bottle: "Bottle", box: "Cardboard box", cone: "Traffic cone", bowl: "Noodle bowl" })[o.type]; },
      get verb() { return o.kind === "find" ? "TAKE" : "PICK UP"; },
      enabled: () => !o.hidden && !o.held,
      use: () => desktopTake(o) });
    objects.push(o);
    return o;
  }
  for (const [type, x, y, z] of PROPS) addObject("prop", type, x, y, z);
  FIND_SPOTS.forEach(([x, y, z], i) => {
    const o = addObject("find", null, x, y, z, rollFind());
    o.spot = "f" + i;
    const takenAt = findsLog()[o.spot];
    if (takenAt && Date.now() - takenAt < RESPAWN_MS) hide(o);
  });
  function hide(o) { o.hidden = true; o.mesh.visible = false; o.held = null; }
  function respawnFind(o) {
    // swap the mesh for a newly rolled item
    const itemId = rollFind();
    root.remove(o.mesh);
    const mesh = makeFind(itemId); mesh.position.copy(o.home); root.add(mesh);
    const hit = o.rec.hit; mesh.add(hit);
    o.mesh = mesh; o.rec.object = mesh; o.itemId = itemId; o.hidden = false; o.vel.set(0, 0, 0); o.resting = true;
  }

  // ── storing, eating, using ─────────────────────────────────────────────
  function stash(o) {
    const def = ITEMS[o.itemId]; state.items = state.items || {};
    const have = state.items[o.itemId] || 0;
    if (have >= def.max) { game.toast(`Backpack full of ${def.name}.`, "warn"); return false; }
    state.items[o.itemId] = have + 1;
    findsLog()[o.spot] = Date.now(); saveGame();
    hide(o);
    audio.play("pickup");
    game.toast(`+1 ${def.name} · backpack (${have + 1})`, "credits");
    return true;
  }
  function eat(itemId, fromBackpack) {
    const def = ITEMS[itemId];
    combat.heal?.(def.heal);
    audio.play("eat");
    game.toast(`${def.name}: +${def.heal} HP`, "credits");
    if (fromBackpack) { state.items[itemId]--; saveGame(); }
  }
  function desktopTake(o) {
    if (o.kind === "find") return stash(o);
    // carry it in front of the camera; left click throws, F again drops
    if (pcHeld) drop(pcHeld);
    pcHeld = o; o.held = { pc: true }; o.resting = false;
    audio.play("click");
    return true;
  }
  let pcHeld = null;
  function drop(o) { o.held = null; o.vel.set(0, 0, 0); o.resting = false; if (pcHeld === o) pcHeld = null; }
  function desktopThrow() {
    if (!pcHeld) return false;
    const o = pcHeld; pcHeld = null; o.held = null;
    camera.getWorldDirection(v1);
    o.vel.copy(v1).multiplyScalar(13).add(v2.set(0, 2, 0)); o.spin.set(Math.random() * 8, Math.random() * 8, 0);
    o.thrownAt = performance.now(); o.resting = false;
    audio.play("whoosh");
    return true;
  }

  // ── backpack board (shoulder grab in VR, I on PC) ───────────────────────
  function openBackpack() {
    game.openBoard({
      title: "BACKPACK", accent: "#ffcf4a",
      subtitle: () => "Finds from around the city. Take materials to Mika's workbench to build gear.",
      rows: () => {
        const ids = Object.keys(ITEMS).filter(id => state.items?.[id] > 0);
        if (!ids.length) return [{ title: "Empty", desc: "Look for small glowing things around the streets, rooftops and the docks.", dim: true }];
        return ids.map(id => {
          const d = ITEMS[id], n = state.items[id];
          if (d.kind === "food") return { title: `${d.name}  ×${n}`, desc: d.desc, label: "EAT", color: "#2a8a6a", onClick: () => { eat(id, true); return `Ate ${d.name}.`; } };
          if (d.kind === "valuable") return { title: `${d.name}  ×${n}`, desc: d.desc, label: `SELL $${d.value}`, color: "#a0287a", onClick: () => { state.items[id]--; game.give(d.value, "fenced data"); saveGame(); return `Sold for $${d.value}.`; } };
          return { title: `${d.name}  ×${n}`, desc: d.desc };
        });
      }
    });
  }

  // ── Mika's workbench ───────────────────────────────────────────────────
  if (mikaBench) {
    const hit = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 0.9), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.copy(mikaBench.position); scene.add(hit);
    const plate = game.textPlate("WORKBENCH · CRAFT", "#ffcf4a"); plate.position.copy(mikaBench.position); plate.position.y += 0.75; plate.scale.multiplyScalar(0.6); scene.add(plate);
    game.addInteractable({ id: "mika_bench", kind: "bench", object: hit, hit, range: 2.8, label: "Mika's Workbench", verb: "CRAFT", alwaysVisible: true, enabled: () => true, use: openCrafting });
  }
  const has = needs => Object.entries(needs).every(([k, n]) => (state.items?.[k] || 0) >= n);
  const needText = needs => Object.entries(needs).map(([k, n]) => `${n} ${ITEMS[k].name}${(state.items?.[k] || 0) < n ? ` (have ${state.items?.[k] || 0})` : ""}`).join(" · ");
  function openCrafting() {
    game.openBoard({
      title: "MIKA'S WORKBENCH", accent: "#38f0e6",
      subtitle: () => "\"Bring me junk, I'll bring you gear.\" — Mika",
      rows: () => RECIPES.map(r => {
        const done = r.once && state.flags["craft_" + r.id];
        const ok = !done && has(r.needs);
        return { title: r.name + (done ? "  ✓ BUILT" : ""), desc: done ? r.desc : `${r.desc}  Needs: ${needText(r.needs)}`, dim: done,
          label: done ? "BUILT" : ok ? "BUILD" : "MISSING", color: done ? "#2a8a6a" : ok ? "#a0287a" : "#56607a",
          onClick: () => {
            if (done) return "Already built.";
            if (!has(r.needs)) return "Not enough materials.";
            for (const [k, n] of Object.entries(r.needs)) state.items[k] -= n;
            if (r.id === "patch") state.items.med_patch = Math.min(9, (state.items.med_patch || 0) + 1);
            else state.flags["craft_" + r.id] = true;
            saveGame(); audio.play("buy");
            game.toast(`Built: ${r.name}`, "complete");
            return `Built ${r.name}.`;
          } };
      })
    });
  }

  // ── Optic Scan ─────────────────────────────────────────────────────────
  const scanGroup = new THREE.Group(); scanGroup.name = "OPTIC_SCAN"; scene.add(scanGroup);
  const markers = [];
  function marker() {
    const c = document.createElement("canvas"); c.width = 512; c.height = 160;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    s.renderOrder = 60; s.center.set(0.5, 0.15);
    s.userData.draw = (title, sub, col) => {
      const key = title + sub + col; if (s.userData.key === key) return; s.userData.key = key;
      const x = c.getContext("2d"); x.clearRect(0, 0, 512, 160);
      x.strokeStyle = col; x.lineWidth = 6; x.beginPath(); x.moveTo(256, 150); x.lineTo(236, 120); x.lineTo(276, 120); x.closePath(); x.stroke();
      x.fillStyle = "rgba(4,8,18,0.82)"; x.fillRect(56, 6, 400, 104); x.strokeStyle = col; x.lineWidth = 3; x.strokeRect(56, 6, 400, 104);
      x.fillStyle = col; x.font = "bold 38px Arial"; x.textAlign = "center"; x.fillText(title, 256, 50);
      x.fillStyle = "#dce7ff"; x.font = "26px Arial"; x.fillText(sub, 256, 92);
      tex.needsUpdate = true;
    };
    scanGroup.add(s); markers.push(s); return s;
  }
  // screen tint while scanning
  const scanMat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uA: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform float uT; uniform float uA;
      void main(){ float d = length(vUv - 0.5) * 2.0; float edge = smoothstep(0.35, 0.95, d);
        float scan = 0.5 + 0.5 * sin(vUv.y * 300.0 - uT * 6.0); float sweep = smoothstep(0.04, 0.0, abs(fract(uT * 0.35) - vUv.y));
        gl_FragColor = vec4(0.2, 0.95, 0.9, (edge * 0.55 + scan * 0.05 + sweep * 0.3) * uA); }`,
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending
  });
  const scanPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), scanMat);
  scanPlane.position.z = -0.13; scanPlane.renderOrder = 9998; scanPlane.visible = false; scanPlane.frustumCulled = false; camera.add(scanPlane);
  let scanT = 0;
  const scanDuration = () => (state.flags.craft_optics ? 14 : 9);
  const scanRange = () => (state.flags.craft_optics ? 80 : 40);
  function toggleScan() {
    if (scanT > 0) { scanT = 0; scanPlane.visible = false; markers.forEach(m => (m.visible = false)); audio.play("close"); return; }
    scanT = scanDuration(); audio.play("scan"); game.toast("OPTIC SCAN", "objective");
  }
  function scanTargets() {
    const out = [], R = scanRange();
    camera.getWorldPosition(v3);
    for (const e of combat.enemies) {
      if (e.dead) continue;
      const p = e.group.getWorldPosition(v1.clone()); p.y += e.type === "enforcer" ? 2.3 : 0.6;
      const d = p.distanceTo(v3); if (d > R) continue;
      out.push([p, ({ scav: "SCAV DRONE", sentry: "SENTRY DRONE", enforcer: "TENKAI ENFORCER" })[e.type], `${Math.ceil(e.hp)} HP · ${e.aware ? "HOSTILE" : "UNAWARE"} · ${d.toFixed(0)} m`, "#ff4a5a"]);
    }
    for (const o of objects) {
      if (o.kind !== "find" || o.hidden) continue;
      const d = o.mesh.position.distanceTo(v3); if (d > R) continue;
      out.push([o.mesh.position.clone().add(v1.set(0, 0.35, 0)), ITEMS[o.itemId].name.toUpperCase(), `${ITEMS[o.itemId].kind.toUpperCase()} · ${d.toFixed(0)} m`, "#" + new THREE.Color(ITEMS[o.itemId].color).getHexString()]);
    }
    for (const p of tetherPoints) {
      const d = p.distanceTo(v3); if (d > R) continue;
      out.push([p.clone().add(v1.set(0, 0.8, 0)), "TETHER ANCHOR", state.flags.craft_tether ? `${d.toFixed(0)} m` : "NEEDS TETHER LINE", "#ffcf4a"]);
    }
    for (const n of npcSys.npcs) {
      if (!n.enabled || !n.holder.visible || n.hologram) continue;
      const d = n.holder.position.distanceTo(v3); if (d > 14) continue;
      const p = n.holder.position.clone(); p.y += 2.05;
      out.push([p, n.name ? n.name.toUpperCase() : citizenId(n), n.name ? n.role : ["NO RECORD", "CURFEW FLAG ×1", "TENKAI EMPLOYEE", "UNREGISTERED CHROME", "DEBT: OVERDUE"][(n.phase * 10 | 0) % 5], "#9fe9ff"]);
    }
    return out.sort((a, b) => a[0].distanceTo(v3) - b[0].distanceTo(v3)).slice(0, 18);
  }
  const citizenId = n => "CITIZEN #" + String(Math.floor(n.phase * 100000)).padStart(5, "0");

  // ── Tether Line ────────────────────────────────────────────────────────
  const tetherPoints = (city.tetherPoints || []).slice();
  tetherPoints.push(new THREE.Vector3(-11.4, 19, -15), new THREE.Vector3(-18.5, 19, -23.4), new THREE.Vector3(-11.4, 19, -9));
  const anchorMat = new THREE.MeshBasicMaterial({ color: 0xffcf4a, toneMapped: false });
  const anchorGeo = new THREE.OctahedronGeometry(0.22);
  const anchorMeshes = tetherPoints.map(p => { const m = new THREE.Mesh(anchorGeo, anchorMat.clone()); m.position.copy(p).add(v1.set(0, 0.45, 0)); root.add(m); return m; });
  const rope = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xffcf4a, toneMapped: false }));
  rope.frustumCulled = false; rope.visible = false; scene.add(rope);
  let tether = null, aimed = null;
  const fa = new THREE.Vector3();
  function findAnchor(origin, dir) {
    let best = null, bestDot = Math.cos(THREE.MathUtils.degToRad(8));
    tetherPoints.forEach((p, i) => {
      fa.copy(anchorMeshes[i].position).sub(origin); const d = fa.length();
      if (d > 38 || d < 2) return;
      const dot = fa.normalize().dot(dir);
      if (dot > bestDot) { bestDot = dot; best = i; }
    });
    return best;
  }
  function fireTether(i, fromObj) {
    if (i === null || !state.flags.craft_tether || tether) return false;
    tether = { i, from: fromObj, t: 0, start: player.position.clone(), end: tetherPoints[i].clone() };
    audio.play("whoosh"); haptic?.("both", 0.5, 120);
    return true;
  }

  // ── VR hands: grab, stash, hip patch, eat, scan gesture ────────────────
  const handState = new Map();
  function headFrame() {
    camera.getWorldPosition(v3);
    camera.getWorldQuaternion(q1);
    return { head: v3.clone(), q: q1.clone() };
  }
  function toHeadLocal(p, hf) { return v1.copy(p).sub(hf.head).applyQuaternion(q1.copy(hf.q).invert()); }
  function inBackpackZone(p, hf) { const l = toHeadLocal(p, hf); return l.z > 0.02 && l.y > -0.45 && l.y < 0.35 && Math.hypot(l.x, l.z) < 0.5; }
  function inHipZone(p, hf) { const l = v1.copy(p).sub(hf.head); const yaw = new THREE.Euler().setFromQuaternion(hf.q, "YXZ").y; l.applyAxisAngle(v2.set(0, 1, 0), -yaw); return l.y < -0.5 && l.y > -1.05 && Math.abs(l.x) > 0.08 && Math.abs(l.x) < 0.42 && Math.abs(l.z) < 0.32; }
  function nearMouth(p, hf) { const l = toHeadLocal(p, hf); return l.z < 0.02 && l.z > -0.2 && l.y < -0.03 && l.y > -0.2 && Math.abs(l.x) < 0.1; }
  function nearTemple(p, hf) { const l = toHeadLocal(p, hf); return Math.abs(l.x) > 0.04 && Math.abs(l.x) < 0.22 && l.y > -0.08 && l.y < 0.15 && l.z > -0.12 && l.z < 0.12; }

  /** called on trigger press in VR before anything else; returns true if used */
  function onTrigger(controller, hand) {
    if (!hand) return false;
    const hf = headFrame();
    hand.getWorldPosition(v2);
    if (nearTemple(v2, hf)) { toggleScan(); haptic?.(controller.userData.handedness, 0.4, 60); return true; }
    if (state.flags.craft_tether) {
      controller.getWorldPosition(v2); controller.getWorldDirection(v3).negate();
      const i = findAnchor(v2, v3);
      if (i !== null) return fireTether(i, hand);
    }
    return false;
  }

  function updateHands(hands, dt) {
    const hf = headFrame();
    for (const h of hands) {
      if (!h.object) continue;
      let st = handState.get(h.object);
      if (!st) { st = { prevGrip: 0, held: null, hist: [], mouthT: 0 }; handState.set(h.object, st); }
      h.object.getWorldPosition(v2);
      const palm = v2.clone();
      st.hist.push([palm.clone(), dt]); if (st.hist.length > 5) st.hist.shift();
      const grabbing = h.grip > 0.7 && st.prevGrip <= 0.5;
      const letGo = h.grip < 0.35 && st.prevGrip >= 0.35;
      st.prevGrip = h.grip;
      if (grabbing && !st.held && !game.isPanelOpen()) {
        let best = null, bd = 1e9;
        for (const o of objects) { if (o.hidden || o.held) continue; const d = o.mesh.position.distanceTo(palm) - o.r; if (d < 0.14 && d < bd) { bd = d; best = o; } }
        if (best) { best.held = { hand: h.object }; best.resting = false; st.held = best; haptic?.(h.side, 0.35, 40); audio.play("click"); }
        else if (inBackpackZone(palm, hf)) { openBackpack(); haptic?.(h.side, 0.4, 60); }
        else if (inHipZone(palm, hf)) {
          if ((state.items?.med_patch || 0) > 0) { const p = addTempPatch(); p.held = { hand: h.object }; st.held = p; haptic?.(h.side, 0.35, 40); }

        }
      }
      if (st.held) {
        const o = st.held;
        // hold it in the palm
        o.mesh.position.copy(h.object.localToWorld(v1.set(0, 0.02, -0.06)));
        h.object.getWorldQuaternion(o.mesh.quaternion);
        if (o.kind === "find" && ITEMS[o.itemId]?.kind === "food" && nearMouth(palm, hf)) {
          st.mouthT += dt;
          if (st.mouthT > 0.35) { eat(o.itemId, false); findsLog()[o.spot] = Date.now(); saveGame(); hide(o); st.held = null; st.mouthT = 0; haptic?.(h.side, 0.5, 80); continue; }
        } else st.mouthT = 0;
        if (letGo) {
          st.held = null; o.held = null;
          if (o.type === "patch") {
            // pressed against the other arm or your chest = applied
            const other = hands.find(x => x !== h && x.object);
            const onArm = other && other.object.getWorldPosition(v3).distanceTo(palm) < 0.22;
            const l = toHeadLocal(palm, hf);
            const onChest = l.y < -0.2 && l.y > -0.65 && Math.abs(l.x) < 0.25 && l.z > -0.35;
            if (onArm || onChest) { combat.useMedPatch(); haptic?.("both", 0.5, 80); }
            removeTempPatch(o);
            continue;
          }
          if (o.kind === "find" && inBackpackZone(palm, hf)) { if (!stash(o)) throwFrom(o, st); continue; }
          throwFrom(o, st);
        }
      }
      // punching near people scares them
      if (st.hist.length > 1 && h.grip > 0.6) {
        const [a] = st.hist[st.hist.length - 2];
        const speed = a.distanceTo(palm) / Math.max(dt, 1e-3);
        if (speed > 3.5) for (const n of npcSys.npcs) if (n.enabled && n.holder.visible && !n.hologram && Math.hypot(n.holder.position.x - palm.x, n.holder.position.z - palm.z) < 0.75) { npcSys.startle(palm, 2.5); break; }
      }
    }
  }
  function throwFrom(o, st) {
    // average recent hand velocity
    if (st.hist.length > 1) {
      const [a] = st.hist[0], [b] = st.hist[st.hist.length - 1];
      const time = st.hist.slice(1).reduce((s, [, d]) => s + d, 0) || 0.016;
      o.vel.subVectors(b, a).divideScalar(time).multiplyScalar(1.35);
      if (o.vel.length() > 25) o.vel.setLength(25);
    } else o.vel.set(0, 0, 0);
    o.spin.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
    o.resting = false; o.thrownAt = performance.now();
    if (o.vel.length() > 3) audio.play("whoosh");
  }
  const temps = [];
  function addTempPatch() {
    const mesh = SHAPES.patch.make(); root.add(mesh);
    const o = { id: "patch", kind: "temp", type: "patch", mesh, r: 0.04, vel: new THREE.Vector3(), spin: new THREE.Vector3(), held: null, resting: true };
    temps.push(o); return o;
  }
  function removeTempPatch(o) { root.remove(o.mesh); temps.splice(temps.indexOf(o), 1); }

  // ── physics for thrown / dropped things ────────────────────────────────
  function stepObject(o, dt) {
    if (o.held || o.resting || o.hidden) return;
    o.vel.y -= 9.8 * dt;
    const p = o.mesh.position, old = v1.copy(p);
    p.addScaledVector(o.vel, dt);
    o.mesh.rotation.x += o.spin.x * dt; o.mesh.rotation.y += o.spin.y * dt; o.mesh.rotation.z += o.spin.z * dt;
    if (city.collides(p.x, p.z, p.y - 0.4, o.r)) { p.x = old.x; p.z = old.z; o.vel.x *= -0.4; o.vel.z *= -0.4; impact(o, o.vel.length()); }
    const speed = o.vel.length();
    if (speed > 3) {
      if (combat.hitEnemyAt(p, o.r + 0.1, Math.min(30, speed * 2.2) * (o.type === "box" || o.type === "cone" ? 1.2 : 1), v2.copy(o.vel).normalize())) { o.vel.multiplyScalar(-0.25); impact(o, speed, true); }
      else for (const n of npcSys.npcs) if (n.enabled && n.holder.visible && !n.hologram && Math.hypot(n.holder.position.x - p.x, n.holder.position.z - p.z) < 0.45 && p.y < 2) { npcSys.startle(p, 3); o.vel.multiplyScalar(-0.2); break; }
    }
    const ground = city.groundAt(p.x, p.z, p.y + 0.3) + (o.type === "cone" ? 0.2 : o.type === "box" ? 0.12 : o.r * 0.6);
    if (p.y < ground) {
      p.y = ground;
      if (o.vel.y < -2.5) impact(o, -o.vel.y);
      o.vel.y = -o.vel.y * 0.3; o.vel.x *= 0.7; o.vel.z *= 0.7; o.spin.multiplyScalar(0.6);
      if (o.vel.length() < 0.35) { o.vel.set(0, 0, 0); o.resting = true; o.movedAt = performance.now(); if (o.type === "cone") o.mesh.rotation.set(Math.PI / 2, o.mesh.rotation.y, 0); }
    }
    if (p.y < -5) { p.copy(o.home); o.vel.set(0, 0, 0); o.resting = true; }
  }
  function impact(o, speed, enemy) {
    if (speed < 2) return;
    if (SHAPES[o.type]?.breakable && speed > 6) { audio.play("glass"); o.mesh.visible = false; o.hidden = true; o.brokeAt = performance.now(); return; }
    audio.play(enemy ? "punchLight" : "thud");
  }

  // ── health glow on the back of your hands ──────────────────────────────
  const hpColor = new THREE.Color();
  function updateHandHealth(hands, t) {
    const f = Math.max(0, Math.min(1, combat.hp / maxHealth()));
    hpColor.setHSL(0.33 * f, 1, 0.5);
    const pulse = f < 0.3 ? 0.6 + 0.4 * Math.sin(t * 8) : 1;
    for (const h of hands) h.object?.userData?.setCore?.(hpColor, pulse);
  }

  // ── per frame ──────────────────────────────────────────────────────────
  const tmpQ = new THREE.Quaternion();
  function update(time, dt, hands, worldDt = dt) {
    const t = time * 0.001;
    if (renderer.xr.isPresenting) updateHands(hands, dt);
    // PC carried object
    if (pcHeld) {
      pcHeld.mesh.position.copy(camera.localToWorld(v1.set(0.22, -0.22, -0.55)));
      camera.getWorldQuaternion(pcHeld.mesh.quaternion);
    }
    for (const o of objects) {
      stepObject(o, worldDt);
      if (o.kind === "find" && !o.hidden && !o.held) { o.mesh.userData.halo.material.opacity = 0.35 + Math.sin(t * 2.5 + o.home.x) * 0.15; if (o.resting) o.mesh.rotation.y += dt * 0.6; }
      // respawn: finds after a while, junk once you're far away
      if (o.kind === "find" && o.hidden && Date.now() - (findsLog()[o.spot] || 0) > RESPAWN_MS) respawnFind(o);
      if (o.kind === "prop" && !o.held && (o.hidden ? performance.now() - o.brokeAt > 90000 : o.resting && o.mesh.position.distanceToSquared(o.home) > 1 && performance.now() - o.movedAt > 120000) && player.position.distanceTo(o.home) > 25) {
        o.mesh.position.copy(o.home); o.mesh.rotation.set(0, Math.random() * 6, 0); o.hidden = false; o.mesh.visible = true; o.vel.set(0, 0, 0); o.resting = true;
      }
    }
    // tether
    const canTether = state.flags.craft_tether;
    anchorMeshes.forEach((m, i) => { m.visible = canTether || scanT > 0; m.rotation.y = t * 1.5; m.material.color.setHex(aimed === i ? 0xffffff : 0xffcf4a); m.scale.setScalar(aimed === i ? 1.5 : 1 + Math.sin(t * 3 + i) * 0.1); });
    aimed = null;
    if (canTether && !tether) {
      if (renderer.xr.isPresenting) { for (const h of hands) { if (!h.controller) continue; h.controller.getWorldPosition(v1); h.controller.getWorldDirection(v2).negate(); const i = findAnchor(v1, v2); if (i !== null) { aimed = i; break; } } }
      else { camera.getWorldPosition(v1); camera.getWorldDirection(v2); aimed = findAnchor(v1, v2); }
    }
    if (tether) {
      tether.t += dt;
      const dur = Math.max(0.5, tether.start.distanceTo(tether.end) / 18);
      const k = Math.min(1, tether.t / dur), e = k * k * (3 - 2 * k);
      player.position.lerpVectors(tether.start, tether.end, e); player.position.y += Math.sin(k * Math.PI) * 1.5;
      if (k >= 1) { player.position.y = city.groundAt(player.position.x, player.position.z, player.position.y + 0.5); tether = null; rope.visible = false; audio.play("land"); }
      else {
        rope.visible = true; const pts = rope.geometry.attributes.position;
        (tether.from || camera).getWorldPosition(v1); pts.setXYZ(0, v1.x, v1.y, v1.z);
        v2.copy(anchorMeshes[tether.i].position); pts.setXYZ(1, v2.x, v2.y, v2.z); pts.needsUpdate = true;
      }
    }
    // scan
    if (scanT > 0) {
      scanT -= dt;
      scanMat.uniforms.uT.value = t; scanMat.uniforms.uA.value = Math.min(1, scanT * 2, (scanDuration() - scanT) * 4);
      scanPlane.visible = true;
      const list = scanTargets();
      while (markers.length < list.length) marker();
      markers.forEach((m, i) => {
        const tgt = list[i]; m.visible = !!tgt; if (!tgt) return;
        m.position.copy(tgt[0]); m.userData.draw(tgt[1], tgt[2], tgt[3]);
        const d = tgt[0].distanceTo(v3.setFromMatrixPosition(camera.matrixWorld));
        m.scale.set(1, 0.3125, 1).multiplyScalar(Math.max(0.55, d * 0.1));
      });
      if (scanT <= 0) { scanPlane.visible = false; markers.forEach(m => (m.visible = false)); }
    }
    updateHandHealth(hands, t);
  }
  return {
    update, onTrigger, desktopThrow, toggleScan, openBackpack, openCrafting,
    desktopTether() { camera.getWorldPosition(v1); camera.getWorldDirection(v2); const i = findAnchor(v1, v2); if (i === null) { game.toast(state.flags.craft_tether ? "Aim at a glowing anchor." : "Build a Tether Line at Mika's workbench first.", "warn"); return false; } return fireTether(i, null); },
    get tethering() { return !!tether; }, get scanT() { return scanT; }, debugTargets: () => scanTargets(), get holding() { return !!pcHeld; }, objects, tetherPoints
  };
}
