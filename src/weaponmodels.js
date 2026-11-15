// NEON GENESIS — weapon models (all original designs, built from simple shapes
// so they stay cheap on Quest). Every model is built with the GRIP at the
// origin and the barrel / blade pointing down -Z (the way a Quest controller
// points), so it can be dropped straight into the hand.
import * as THREE from "three";

export const WEAPONS = {
  p9:      { name: "Kasumi P9", kind: "gun", slot: "sidearm", ammo: "light", mag: 12, damage: 22, rate: 0.16, spread: 0.012, speed: 0, auto: false, color: 0x38f0e6, price: 0,
             desc: "Mika's old sidearm. Reliable, accurate, 12 rounds." },
  rattler: { name: "Rattler SMG", kind: "gun", slot: "sidearm", ammo: "light", mag: 30, damage: 11, rate: 0.075, spread: 0.035, auto: true, color: 0xff4fd8, price: 650,
             desc: "Hold the trigger and it never stops talking. 30 rounds." },
  breacher:{ name: "Breacher-6", kind: "gun", slot: "long", ammo: "shell", mag: 6, damage: 9, pellets: 8, rate: 0.75, spread: 0.09, auto: false, color: 0xff8a2a, price: 900,
             desc: "Pump shotgun. Eight pellets of bad news, up close." },
  longspike:{ name: "Longspike Rail", kind: "gun", slot: "long", ammo: "cell", mag: 4, damage: 95, rate: 0.9, spread: 0, charge: 0.7, pierce: true, color: 0x9ffcff, price: 1400,
             desc: "Hold the trigger to charge, let go to fire a rail slug straight through everything in a line." },
  katana:  { name: "Neon Edge", kind: "melee", slot: "blade", damage: 34, color: 0xff2a8a, price: 800,
             desc: "A mono-edged katana with a hard-light core. Swing fast, cut deep." },
  baton:   { name: "Tenkai Stun Baton", kind: "melee", slot: "blade", damage: 18, stun: 1.6, color: 0xff3a4a, price: 0,
             desc: "Taken off a Tenkai enforcer. Every hit stuns." },
  emp:     { name: "EMP Grenade", kind: "throw", slot: "grenade", damage: 60, radius: 4.5, color: 0x38f0e6, price: 120,
             desc: "Pull, throw, duck. Fries drones and drops enforcers in a 4.5 m blast." }
};
export const AMMO = {
  light: { name: "Light rounds", max: 240, pack: 30, price: 40 },
  shell: { name: "Shells", max: 48, pack: 12, price: 60 },
  cell:  { name: "Rail cells", max: 16, pack: 4, price: 90 }
};

const M = {};   // shared materials
function mats() {
  if (M.dark) return M;
  M.dark = new THREE.MeshStandardMaterial({ color: 0x1b1f27, metalness: 0.85, roughness: 0.32 });
  M.mid = new THREE.MeshStandardMaterial({ color: 0x3a414e, metalness: 0.9, roughness: 0.28 });
  M.light = new THREE.MeshStandardMaterial({ color: 0xc9ced8, metalness: 0.7, roughness: 0.25 });
  M.grip = new THREE.MeshStandardMaterial({ color: 0x14161b, metalness: 0.1, roughness: 0.85 });
  M.orange = new THREE.MeshStandardMaterial({ color: 0xd8641a, metalness: 0.5, roughness: 0.4 });
  M.red = new THREE.MeshStandardMaterial({ color: 0x8a1420, metalness: 0.6, roughness: 0.35 });
  M.wrap = new THREE.MeshStandardMaterial({ color: 0x2a1020, metalness: 0.1, roughness: 0.9 });
  return M;
}
const glowMat = (c, op = 1) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false, transparent: op < 1, opacity: op, depthWrite: op >= 1 });

export function buildWeaponModel(id) {
  const m = mats(), def = WEAPONS[id];
  const g = new THREE.Group(); g.name = "WEAPON_" + id;
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const me = new THREE.Mesh(geo, mat); me.position.set(x, y, z); me.rotation.set(rx, ry, rz); g.add(me); return me; };
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const C = (r1, r2, h, s = 12) => new THREE.CylinderGeometry(r1, r2, h, s);
  const glow = glowMat(def.color);
  g.userData.muzzle = new THREE.Object3D(); g.add(g.userData.muzzle);
  g.userData.magWell = new THREE.Object3D(); g.add(g.userData.magWell);

  if (id === "p9") {
    add(B(0.032, 0.11, 0.045), m.grip, 0, -0.035, 0.01, -0.25);              // grip
    add(B(0.034, 0.045, 0.2), m.dark, 0, 0.035, -0.06);                     // slide
    add(B(0.03, 0.02, 0.17), m.mid, 0, 0.004, -0.055);                       // frame
    add(B(0.004, 0.01, 0.17), glow, 0.0175, 0.04, -0.06);                    // side light
    add(B(0.004, 0.01, 0.17), glow, -0.0175, 0.04, -0.06);
    add(C(0.008, 0.008, 0.03), m.mid, 0, 0.03, -0.175, Math.PI / 2);        // barrel tip
    add(B(0.006, 0.012, 0.006), glow, 0, 0.064, -0.14);                       // front sight
    add(B(0.02, 0.012, 0.008), m.mid, 0, 0.064, 0.025);                      // rear sight
    add(new THREE.TorusGeometry(0.018, 0.004, 6, 12, Math.PI), m.mid, 0, -0.008, -0.03, 0, Math.PI / 2, Math.PI);   // trigger guard
    add(B(0.024, 0.018, 0.04), glow, 0, -0.095, 0.022, -0.25);                // mag base glow
    g.userData.muzzle.position.set(0, 0.03, -0.195); g.userData.magWell.position.set(0, -0.1, 0.02);
  } else if (id === "rattler") {
    add(B(0.032, 0.1, 0.04), m.grip, 0, -0.04, 0.03, -0.2);
    add(B(0.045, 0.065, 0.26), m.dark, 0, 0.03, -0.06);                      // body
    add(B(0.03, 0.15, 0.035), m.mid, 0, -0.06, -0.1, 0.12);                  // long mag in front of the grip
    add(B(0.004, 0.14, 0.03), glow, 0.0155, -0.06, -0.1, 0.12);
    add(C(0.012, 0.012, 0.09), m.mid, 0, 0.035, -0.23, Math.PI / 2);        // barrel shroud
    for (let i = 0; i < 4; i++) add(C(0.014, 0.014, 0.008), m.dark, 0, 0.035, -0.2 - i * 0.02, Math.PI / 2);
    add(B(0.05, 0.004, 0.2), glow, 0, 0.064, -0.06);                         // top strip
    add(B(0.02, 0.04, 0.12), m.mid, 0, 0.02, 0.12);                          // folded stock
    add(B(0.012, 0.02, 0.03), glow, 0, 0.077, -0.02);                        // optic
    g.userData.muzzle.position.set(0, 0.035, -0.28); g.userData.magWell.position.set(0, -0.14, -0.11);
  } else if (id === "breacher") {
    add(B(0.035, 0.11, 0.045), m.grip, 0, -0.045, 0.02, -0.3);
    add(B(0.05, 0.07, 0.28), m.dark, 0, 0.025, -0.05);                       // receiver
    add(C(0.017, 0.017, 0.42), m.mid, 0, 0.045, -0.36, Math.PI / 2);        // barrel
    add(C(0.015, 0.015, 0.38), m.dark, 0, 0.005, -0.33, Math.PI / 2);       // tube
    add(B(0.055, 0.05, 0.14), m.orange, 0, 0.01, -0.33);                     // pump
    for (let i = 0; i < 5; i++) add(B(0.058, 0.006, 0.01), m.dark, 0, 0.01, -0.28 - i * 0.025);
    add(B(0.04, 0.09, 0.2), m.orange, 0, -0.01, 0.17, 0.25);                 // stock
    add(B(0.004, 0.02, 0.24), glow, 0.026, 0.04, -0.05);
    for (let i = 0; i < 4; i++) add(C(0.009, 0.009, 0.03), m.red, -0.03, 0.02 - i * 0.022, 0.06, 0, 0, Math.PI / 2);   // side shell holder
    g.userData.muzzle.position.set(0, 0.045, -0.58); g.userData.magWell.position.set(0, -0.03, -0.02);
  } else if (id === "longspike") {
    add(B(0.035, 0.11, 0.045), m.grip, 0, -0.045, 0.02, -0.25);
    add(B(0.05, 0.08, 0.34), m.light, 0, 0.03, -0.08);                       // body
    add(B(0.02, 0.06, 0.6), m.dark, 0.016, 0.03, -0.5);                       // twin rails
    add(B(0.02, 0.06, 0.6), m.dark, -0.016, 0.03, -0.5);
    const core = add(B(0.008, 0.03, 0.58), glow, 0, 0.03, -0.5); g.userData.core = core;
    for (let i = 0; i < 6; i++) add(new THREE.TorusGeometry(0.036, 0.006, 6, 16), m.mid, 0, 0.03, -0.3 - i * 0.08);   // coils
    add(B(0.035, 0.1, 0.22), m.light, 0, -0.005, 0.18, 0.2);                 // stock
    add(C(0.02, 0.02, 0.14), m.dark, 0, 0.1, -0.08, Math.PI / 2);           // scope
    add(new THREE.CircleGeometry(0.016, 14), glowMat(0x9ffcff), 0, 0.1, -0.151);
    add(B(0.03, 0.05, 0.06), glow, 0, -0.02, 0.0);                           // cell
    g.userData.muzzle.position.set(0, 0.03, -0.82); g.userData.magWell.position.set(0, -0.05, 0.0);
  } else if (id === "katana") {
    add(C(0.016, 0.016, 0.26, 10), m.wrap, 0, 0, 0.02, Math.PI / 2);        // handle
    for (let i = 0; i < 6; i++) add(new THREE.TorusGeometry(0.017, 0.003, 4, 10), m.mid, 0, 0, -0.09 + i * 0.045, 0, 0, 0);
    add(C(0.05, 0.05, 0.012, 8), m.mid, 0, 0, -0.12, Math.PI / 2);          // guard
    add(B(0.008, 0.035, 0.82), m.light, 0, 0.004, -0.54);                    // blade
    const edge = add(B(0.01, 0.012, 0.84), glow, 0, -0.018, -0.54);           // glowing hard-light edge
    add(B(0.012, 0.01, 0.08), m.light, 0, 0.01, -0.97, 0.4);                 // tip
    add(B(0.012, 0.03, 0.8), glowMat(def.color, 0.45), 0, -0.002, -0.54);     // hard-light core along the blade
    add(B(0.009, 0.004, 0.78), glowMat(0xffffff), 0, 0.02, -0.54);            // bright spine line
    g.userData.edge = edge; g.userData.bladeLen = 1.0;
  } else if (id === "baton") {
    add(C(0.02, 0.02, 0.18, 10), m.grip, 0, 0, 0.02, Math.PI / 2);
    add(C(0.024, 0.024, 0.02, 10), m.mid, 0, 0, -0.08, Math.PI / 2);
    add(C(0.017, 0.015, 0.5, 10), m.dark, 0, 0, -0.34, Math.PI / 2);
    for (let i = 0; i < 4; i++) add(C(0.019, 0.019, 0.012, 10), glow, 0, 0, -0.18 - i * 0.1, Math.PI / 2);
    add(new THREE.SphereGeometry(0.024, 10, 8), glow, 0, 0, -0.6);
    g.userData.bladeLen = 0.62;
  } else if (id === "emp") {
    add(new THREE.SphereGeometry(0.035, 14, 10), m.dark, 0, 0, 0);
    add(new THREE.TorusGeometry(0.036, 0.006, 6, 18), glow, 0, 0, 0, Math.PI / 2);
    add(new THREE.TorusGeometry(0.036, 0.006, 6, 18), glow, 0, 0, 0);
    add(C(0.012, 0.012, 0.025), m.mid, 0, 0.042, 0);
    add(new THREE.TorusGeometry(0.01, 0.002, 4, 10), m.light, 0.012, 0.055, 0, 0, Math.PI / 2);   // pin ring
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return g;
}
