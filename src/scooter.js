// NEON GENESIS — the hover scooter in the lot by Sato's.
// It's dead until you put a Power Cell in its battery bay:
//   • VR: grab a Power Cell out of your backpack and push it into the glowing
//     bay at the back of the deck — or just point at the scooter + trigger
//   • PC: look at it and press F
// Then point/press again to RIDE. A (VR) / F (PC) hops off.
// One cell runs it for a while; when it's flat you'll need another.
import * as THREE from "three";
import { ITEMS } from "./story.js";
import { state, saveGame } from "./state.js";

const RANGE_PER_CELL = 900;      // metres of riding per Power Cell
export const SCOOTER_SPEED = 2.3;   // × walking speed

export function createScooter({ root, scene, camera, player, renderer, city, game, audio, haptic, gear }) {
  const save = () => (state.flags.scooter ||= { x: 22.6, y: 0, z: 14.6, yaw: 0.5, charge: 0 });
  const s = save();

  // ── model: low deck, tall stem with a holo display, hover pads instead of wheels
  const g = new THREE.Group(); g.name = "SCOOTER";
  const body = new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 0.35, metalness: 0.7 });
  const paint = new THREE.MeshStandardMaterial({ color: 0x9c2f3a, roughness: 0.3, metalness: 0.5 });
  const grip = new THREE.MeshStandardMaterial({ color: 0x111216, roughness: 0.9 });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x38f0e6, toneMapped: false });
  const padMat = new THREE.MeshBasicMaterial({ color: 0x38f0e6, toneMapped: false, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
  const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.rotation.set(rx, ry, rz); g.add(me); return me; };
  // (scooter faces +z in its own space)
  add(new THREE.BoxGeometry(0.34, 0.07, 1.1), paint, 0, 0.2, 0);                       // deck
  add(new THREE.BoxGeometry(0.3, 0.012, 0.95), grip, 0, 0.24, -0.02);                  // grip tape
  const strips = [-0.17, 0.17].map(x => add(new THREE.BoxGeometry(0.012, 0.02, 1.0), glowMat, x, 0.2, 0));   // side light strips
  add(new THREE.BoxGeometry(0.28, 0.1, 0.22), body, 0, 0.2, 0.62);                    // nose
  add(new THREE.CylinderGeometry(0.035, 0.035, 0.95, 10), body, 0, 0.68, 0.66, -0.18); // stem
  add(new THREE.CylinderGeometry(0.022, 0.022, 0.56, 8), grip, 0, 1.12, 0.74, 0, 0, Math.PI / 2);   // handlebar
  const screen = add(new THREE.BoxGeometry(0.14, 0.07, 0.01), glowMat, 0, 1.02, 0.745, -0.5);       // little display
  add(new THREE.BoxGeometry(0.2, 0.1, 0.16), body, 0, 0.21, -0.62);                    // tail / battery bay housing
  // battery bay (open slot at the back of the deck)
  const bay = add(new THREE.BoxGeometry(0.1, 0.06, 0.1), new THREE.MeshBasicMaterial({ color: 0x331018, toneMapped: false }), 0, 0.27, -0.6);
  const cellIn = add(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 12), new THREE.MeshBasicMaterial({ color: 0xffcf4a, toneMapped: false }), 0, 0.28, -0.6, Math.PI / 2);
  // hover pads (front + back) with glow discs underneath
  const pads = [];
  for (const z of [0.55, -0.5]) {
    add(new THREE.CylinderGeometry(0.13, 0.15, 0.08, 16), body, 0, 0.12, z);
    const d = add(new THREE.CircleGeometry(0.2, 20), padMat, 0, 0.075, z, -Math.PI / 2); pads.push(d);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = false; });
  root.add(g);
  const lamp = new THREE.PointLight(0x38f0e6, 0, 3, 2); lamp.position.set(0, 0.1, 0); g.add(lamp);

  // label floating above it when parked
  let plate = null, plateKey = "";
  function setPlate() {
    const key = powered() ? (s.charge > 0 ? "ok" : "flat") : "dead";
    if (key === plateKey) return; plateKey = key;
    if (plate) g.remove(plate);
    plate = game.textPlate(key === "ok" ? "HOVER SCOOTER" : "SCOOTER · NEEDS POWER CELL", key === "ok" ? "#38f0e6" : "#ffcf4a");
    plate.position.set(0, 1.55, 0.3); plate.scale.multiplyScalar(0.5); g.add(plate);
  }

  // invisible hit box for pointing / PC look
  const hit = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.3, 1.5), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.set(0, 0.6, 0); g.add(hit);
  const powered = () => s.charge > 0;
  const cells = () => state.items?.cell || 0;
  let riding = false;

  game.addInteractable({ id: "scooter", kind: "scooter", object: g, hit, range: 3,
    get label() { return powered() ? `Hover Scooter · ${Math.ceil(s.charge * 100)}% charge` : `Dead Scooter · Power Cells: ${cells()}`; },
    get verb() { return powered() ? "RIDE" : "INSERT POWER CELL"; },
    enabled: () => !riding,
    use: () => (powered() ? mount() : insertFromBackpack()) });

  function charge(fromWhere) {
    s.charge = 1; saveGame();
    audio.play("jammer"); haptic?.("both", 0.6, 120);
    game.toast(`Power Cell in · scooter charged (${fromWhere})`, "complete");
    flash = 1;
  }
  function insertFromBackpack() {
    if (cells() < 1) { game.toast(`Needs a ${ITEMS.cell.name}. Look for small yellow glowing finds — Optic Scan helps.`, "warn"); audio.play("warn"); return false; }
    state.items.cell -= 1; charge(`${state.items.cell} left`);
    return true;
  }

  function mount() {
    if (!powered()) return false;
    riding = true; audio.play("whoosh"); haptic?.("both", 0.4, 80);
    // step onto it
    player.position.x = g.position.x; player.position.z = g.position.z;
    game.toast(renderer.xr.isPresenting ? "RIDING · stick to move · A to hop off" : "RIDING · WASD to move · F to hop off", "objective");
    return true;
  }
  function dismount(reason) {
    if (!riding) return false;
    riding = false;
    // park it beside you so you don't stand inside it
    camera.getWorldPosition(v1);
    g.position.x = v1.x + Math.sin(g.rotation.y + Math.PI / 2) * 0.6;
    g.position.z = v1.z + Math.cos(g.rotation.y + Math.PI / 2) * 0.6;
    if (city.collides(g.position.x, g.position.z, player.position.y, 0.3)) { g.position.x = v1.x; g.position.z = v1.z; }
    g.position.y = city.surfaceAt(g.position.x, g.position.z, player.position.y + 0.5);
    Object.assign(s, { x: g.position.x, y: g.position.y, z: g.position.z, yaw: g.rotation.y }); saveGame();
    audio.play("land");
    if (reason) game.toast(reason, "warn");
    return true;
  }

  g.position.set(s.x, s.y, s.z); g.rotation.y = s.yaw;
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), last = new THREE.Vector3();
  let flash = 0, lastValid = false;

  function update(time, dt) {
    const t = time * 0.001;
    setPlate();
    if (plate) plate.visible = !riding;
    // physical insert in VR: a held Power Cell pushed into the bay
    if (!riding && renderer.xr.isPresenting && s.charge < 0.999) {
      bay.getWorldPosition(v1);
      for (const o of gear.objects) {
        if (o.held?.hand && o.kind === "find" && o.itemId === "cell" && o.mesh.position.distanceTo(v1) < 0.22) { gear.consume(o); charge("slotted in"); break; }
      }
    }
    if (riding) {
      // the scooter rides under you, facing the way you move (or look)
      camera.getWorldPosition(v1);
      const moved = v2.set(v1.x - last.x, 0, v1.z - last.z);
      const sp = lastValid ? moved.length() / Math.max(dt, 1e-3) : 0;
      if (sp > 0.6) g.rotation.y = dampAngle(g.rotation.y, Math.atan2(moved.x, moved.z), 8, dt);
      else { camera.getWorldDirection(v2); g.rotation.y = dampAngle(g.rotation.y, Math.atan2(v2.x, v2.z), 2, dt); }
      g.position.set(v1.x, player.position.y, v1.z);
      g.position.y = city.surfaceAt(v1.x, v1.z, player.position.y + 0.5);
      g.rotation.z = THREE.MathUtils.damp(g.rotation.z, 0, 6, dt);
      if (lastValid && sp < 40) { s.charge = Math.max(0, s.charge - (sp * dt) / RANGE_PER_CELL); }
      if (s.charge <= 0) dismount("Scooter's out of power. Find another Power Cell.");
      lastValid = true; last.copy(v1);
    } else lastValid = false;
    // hover bob + pad glow (only when it has power)
    const on = powered();
    const bob = on ? 0.04 + Math.sin(t * 3) * 0.015 : 0;
    g.children.forEach(c => { if (c !== plate && c !== hit) c.position.y = (c.userData.baseY ??= c.position.y) + bob; });
    pads.forEach(p => { p.visible = on; p.material.opacity = 0.45 + Math.sin(t * 9) * 0.1 + (riding ? 0.2 : 0); });
    const col = on ? (s.charge < 0.2 ? (Math.sin(t * 6) > 0 ? 0xff3a4a : 0x401018) : 0x38f0e6) : 0x1a2226;
    glowMat.color.setHex(col);
    lamp.intensity = on ? (riding ? 2.2 : 1.2) : 0;
    bay.material.color.setHex(on ? 0x2a2a18 : (Math.sin(t * 4) > 0 ? 0xffcf4a : 0x553a10));   // dead: bay blinks to show where the cell goes
    cellIn.visible = on;
    if (flash > 0) { flash -= dt; lamp.intensity += flash * 6; }
  }
  function dampAngle(a, b, k, dt) { const d = Math.atan2(Math.sin(b - a), Math.cos(b - a)); return a + d * (1 - Math.exp(-k * dt)); }

  return {
    update, mount, dismount,
    get riding() { return riding; },
    get charge() { return s.charge; },
    speedMult: () => (riding ? SCOOTER_SPEED : 1),
    scanTarget: () => [g.position.clone().add(v2.set(0, 1.2, 0)), "HOVER SCOOTER", powered() ? `${Math.ceil(s.charge * 100)}% CHARGE` : "NEEDS POWER CELL", "#38f0e6"],
    group: g
  };
}
