// NEON GENESIS — street radios. Each one plays its own station and can only
// be heard when you're standing right next to it.
import * as THREE from "three";

export const RADIO_SPOTS = [
  { x: 19.45, y: 1.12, z: 11.7, ry: -Math.PI / 2, station: 0, crate: false, label: "Sato's radio" },      // on Sato's counter
  { x: -10.35, y: 0, z: 20.5, ry: Math.PI / 2, station: 1, crate: true, label: "street radio (west)" },
  { x: 10.35, y: 0, z: -19.5, ry: -Math.PI / 2, station: 2, crate: true, label: "street radio (east)" }
];

export function buildRadios(parent, city) {
  const out = [];
  const body = new THREE.MeshStandardMaterial({ color: 0x3a2f2a, roughness: 0.6, metalness: 0.2 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xb8bcc6, roughness: 0.3, metalness: 0.8 });
  const grille = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.9 });
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x4a5a3a, roughness: 0.8 });
  for (const s of RADIO_SPOTS) {
    const g = new THREE.Group(); g.name = "RADIO";
    g.position.set(s.x, s.y + (s.crate ? 0.62 : 0), s.z); g.rotation.y = s.ry;
    const glowCol = [0xffb02e, 0xff4fa3, 0x38f0e6][s.station];
    const add = (geo, m, x, y, z) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); g.add(me); return me; };
    add(new THREE.BoxGeometry(0.46, 0.24, 0.14), body, 0, 0.12, 0);
    for (const sx of [-0.13, 0.13]) { add(new THREE.CylinderGeometry(0.07, 0.07, 0.01, 18), grille, sx, 0.12, 0.071).rotation.x = Math.PI / 2; add(new THREE.TorusGeometry(0.07, 0.006, 6, 18), trim, sx, 0.12, 0.073); }
    add(new THREE.BoxGeometry(0.1, 0.05, 0.01), new THREE.MeshBasicMaterial({ color: glowCol }), 0, 0.17, 0.072);    // tuning dial
    add(new THREE.BoxGeometry(0.003, 0.045, 0.012), new THREE.MeshBasicMaterial({ color: 0xffffff }), 0.012, 0.17, 0.074);
    add(new THREE.CylinderGeometry(0.004, 0.004, 0.32, 5), trim, 0.18, 0.4, -0.03).rotation.z = -0.3;               // antenna
    add(new THREE.BoxGeometry(0.34, 0.02, 0.02), trim, 0, 0.26, 0);                                                  // handle
    for (const sx of [-0.1, 0.1]) add(new THREE.BoxGeometry(0.02, 0.04, 0.02), trim, sx, 0.25, 0);
    if (s.crate) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.5), crateMat); c.position.set(s.x, 0.3, s.z); c.rotation.y = s.ry; parent.add(c);
      city.colliders.push({ minX: s.x - 0.32, maxX: s.x + 0.32, minZ: s.z - 0.3, maxZ: s.z + 0.3, minY: 0, maxY: 0.62 });
    }
    // little music notes that drift up while it plays
    const note = new THREE.Sprite(new THREE.SpriteMaterial({ map: noteTexture(glowCol), transparent: true, depthWrite: false, toneMapped: false }));
    note.scale.set(0.12, 0.12, 1); g.add(note);
    parent.add(g);
    out.push({ group: g, spot: s, note });
  }
  function update(time) {
    const t = time * 0.001;
    for (const r of out) { const k = (t * 0.5 + r.spot.station * 0.33) % 1; r.note.position.set(Math.sin(k * 9) * 0.08, 0.3 + k * 0.45, 0); r.note.material.opacity = Math.sin(k * Math.PI) * 0.9; }
  }
  return { radios: out, update };
}
function noteTexture(hex) {
  const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d");
  x.fillStyle = "#" + new THREE.Color(hex).getHexString(); x.font = "bold 52px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("♪", 32, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
