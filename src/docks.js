// NEON GENESIS — THE DOCKS (east of the Ring Road, x 46 → 112).
//
// A waterfront district built for combat: stacked shipping containers for
// cover, a Tenkai checkpoint gate, gantry cranes, a warehouse, and the scrap
// barge where Mika found the Genesis Core. Static parts are merged into a few
// meshes (vertex colours), like the rest of the city.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const _c = new THREE.Color();
function colored(geo, hex) {
  _c.set(hex);
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g.attributes.uv) g.deleteAttribute("uv");
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = _c.r; a[i * 3 + 1] = _c.g; a[i * 3 + 2] = _c.b; }
  g.setAttribute("color", new THREE.BufferAttribute(a, 3));
  return g;
}

export function buildDocks(root, city) {
  const tetherPoints = city.tetherPoints || (city.tetherPoints = []);
  const solid = [], glow = [];
  const box = (list, w, h, d, x, y, z, hex, ry = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); g.translate(x, y, z); list.push(colored(g, hex)); };
  const cyl = (list, r, h, x, y, z, hex, seg = 10) => { const g = new THREE.CylinderGeometry(r, r, h, seg); g.translate(x, y, z); list.push(colored(g, hex)); };
  const col = (minX, maxX, minZ, maxZ, maxY = 8, minY = 0) => city.colliders.push({ minX, maxX, minZ, maxZ, minY, maxY });
  const rand = (() => { let s = 4242; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; })();

  // ── ground: road continues into a concrete yard, then wooden piers ───────
  box(solid, 66, 0.1, 12, 79, -0.047, -46, 0x23262d);                      // road into the yard (top at +0.003)
  box(solid, 64, 0.2, 70, 80, -0.12, -46, 0x3a3d44);                       // concrete yard (top at -0.02)
  for (let x = 50; x < 112; x += 4) box(solid, 0.08, 0.02, 70, x, -0.012, -46, 0x2e3138);  // slab seams (just above the yard)
  box(solid, 12, 0.3, 26, 118, -0.15, -30, 0x4a3a2c);                      // north pier (timber)
  box(solid, 12, 0.3, 26, 118, -0.15, -66, 0x4a3a2c);                      // south pier
  for (const pz of [-30, -66]) for (let z = pz - 12.5; z < pz + 12.5; z += 1.2) box(solid, 11.8, 0.02, 0.06, 118, 0.012, z, 0x2a2018);  // plank gaps (only on the piers)
  // yellow safety lines and hazard edge
  for (let z = -80; z <= -12; z += 4) box(glow, 0.12, 0.02, 2, 111.7, 0.02, z, 0xffb02e);
  // bollards along the edge
  for (let z = -78; z <= -14; z += 6) cyl(solid, 0.18, 0.6, 111.5, 0.3, z, 0x15171c);

  // ── water (animated shimmer, reflects the neon environment) ─────────────
  const waterTex = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 256; const x = c.getContext("2d");
    x.fillStyle = "#05080f"; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 260; i++) { x.fillStyle = `rgba(${80 + rand() * 120},${120 + rand() * 120},255,${0.05 + rand() * 0.12})`; x.fillRect(rand() * 256, rand() * 256, 6 + rand() * 30, 1.5); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(20, 20); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const water = new THREE.Mesh(new THREE.PlaneGeometry(520, 520), new THREE.MeshStandardMaterial({
    color: 0x0a1424, map: waterTex, emissive: 0x1a3a6a, emissiveMap: waterTex, emissiveIntensity: 0.9, metalness: 0.9, roughness: 0.15
  }));
  water.rotation.x = -Math.PI / 2; water.position.set(300, -1.4, -46); water.name = "DOCKS_WATER";
  root.add(water);
  // keep the player out of the water: edges of the yard and piers
  // yard edge (open only where the two piers join)
  col(112, 113, -53, -43, 3); col(112, 113, -17, -11, 3); col(112, 113, -81, -79, 3);
  // pier sides
  col(112, 124, -43.6, -43, 3); col(112, 124, -17, -16.4, 3);              // north pier
  col(112, 124, -79.6, -79, 3); col(112, 124, -53, -52.4, 3);              // south pier
  // pier ends (north pier has a gap for the barge gangway)
  col(124, 125, -79, -53, 3); col(124, 125, -43, -35.5, 3); col(124, 125, -32.5, -17, 3);
  col(46, 112, -81.5, -80.5, 3); col(46, 112, -11.5, -10.5, 3);           // yard north/south edge fences
  for (let x = 47; x < 112; x += 3) { box(solid, 0.08, 2.4, 0.08, x, 1.2, -81, 0x6a6f7a); box(solid, 0.08, 2.4, 0.08, x, 1.2, -11, 0x6a6f7a); }
  box(solid, 65, 0.06, 0.06, 79, 2.3, -81, 0x6a6f7a); box(solid, 65, 0.06, 0.06, 79, 2.3, -11, 0x6a6f7a);
  box(solid, 65, 0.04, 0.04, 79, 1.2, -81, 0x6a6f7a); box(solid, 65, 0.04, 0.04, 79, 1.2, -11, 0x6a6f7a);

  // ── Tenkai checkpoint gate at the yard entrance (x ≈ 50) ────────────────
  for (const z of [-52.5, -39.5]) { box(solid, 1.2, 4.2, 1.2, 50, 2.1, z, 0xe8ecf4); box(glow, 0.06, 3.6, 1.24, 50.62, 2.1, z, 0xff3a4a); col(49.4, 50.6, z - 0.6, z + 0.6, 4.5); }
  box(solid, 1.4, 0.6, 14.4, 50, 4.5, -46, 0xe8ecf4); box(glow, 0.06, 0.2, 14, 50.72, 4.5, -46, 0xff3a4a);
  box(solid, 3, 2.6, 2.4, 52.5, 1.3, -55.5, 0x2a2f3a); box(glow, 0.04, 0.8, 1.8, 51, 1.8, -55.5, 0x9fe9ff); col(51, 54, -56.7, -54.3, 3);   // guard booth
  box(solid, 0.15, 0.15, 6, 50.5, 1.0, -43, 0xffb02e);                      // raised boom (open)

  // ── shipping container stacks (cover) ──────────────────────────────────
  const CONTAINER = [0xb0262f, 0x2a6a8a, 0xd8742a, 0x3d5a2a, 0x5a3a8a, 0x8a8f96, 0x147f89];
  const stack = (x, z, levels, ry = 0) => {
    for (let l = 0; l < levels; l++) {
      const hex = CONTAINER[Math.floor(rand() * CONTAINER.length)];
      const w = ry ? 2.5 : 6.1, d = ry ? 6.1 : 2.5;
      box(solid, w, 2.6, d, x, 1.3 + l * 2.6, z, hex);
      // corrugation ribs on the long sides
      for (let k = -2.7; k <= 2.7; k += 0.45) box(solid, ry ? 2.56 : 0.06, 2.4, ry ? 0.06 : 2.56, ry ? x : x + k, 1.3 + l * 2.6, ry ? z + k : z, _c.set(hex).multiplyScalar(0.75).getHex());
    }
    col(x - (ry ? 1.25 : 3.05), x + (ry ? 1.25 : 3.05), z - (ry ? 3.05 : 1.25), z + (ry ? 3.05 : 1.25), levels * 2.6);
    floorsPush(city, x - (ry ? 1.25 : 3.05), x + (ry ? 1.25 : 3.05), z - (ry ? 3.05 : 1.25), z + (ry ? 3.05 : 1.25), levels * 2.6);   // walkable tops (Tether Line)
    tetherPoints.push(new THREE.Vector3(x, levels * 2.6, z));
  };
  [[60, -30, 2], [60, -62, 1], [68, -24, 3, 1], [70, -38, 1], [70, -56, 2, 1], [78, -30, 1, 1], [80, -64, 3], [86, -44, 1],
   [92, -26, 2], [94, -58, 1, 1], [100, -38, 2, 1], [102, -70, 2], [58, -72, 2], [88, -16, 2]].forEach(([x, z, l, r]) => stack(x, z, l, r ? Math.PI / 2 : 0));

  // ── gantry cranes over the piers ───────────────────────────────────────
  for (const z of [-30, -66]) {
    for (const dz of [-5, 5]) for (const x of [108, 124]) { box(solid, 0.6, 22, 0.6, x, 11, z + dz, 0xd8a52a); }
    box(solid, 17, 1.2, 1.2, 116, 22, z - 5, 0xd8a52a); box(solid, 17, 1.2, 1.2, 116, 22, z + 5, 0xd8a52a);
    box(solid, 1.4, 1.4, 34, 116, 23.2, z, 0xc49a25);                       // boom over the water
    box(solid, 3, 2, 3, 116, 21, z + 8, 0x2a2f3a); box(glow, 0.3, 0.3, 0.3, 116, 24.2, z + 16.5, 0xff3a4a);
    col(107.6, 108.4, z - 5.4, z - 4.6, 22); col(107.6, 108.4, z + 4.6, z + 5.4, 22);
  }

  // ── warehouse (south-west) with a big Tenkai logo wall ──────────────────
  box(solid, 18, 9, 16, 62, 4.5, -2, 0x2c3140); col(53, 71, -10, 6, 9);
  floorsPush(city, 53, 71, -10, 6, 9); tetherPoints.push(new THREE.Vector3(62, 9, -9.2), new THREE.Vector3(70.2, 9, -2));
  box(glow, 10, 0.4, 0.1, 62, 7.6, -10.06, 0xff3a4a);
  box(solid, 8, 6, 0.1, 62, 3, -10.05, 0x15171c);                           // shutter

  // ── the scrap barge (where the core came from), moored at the north pier ─
  const barge = [];
  box(barge, 9, 2.2, 26, 132, -0.4, -30, 0x3a3028);
  box(barge, 9.4, 0.3, 26.4, 132, 0.55, -30, 0x2a2420);
  for (let i = 0; i < 9; i++) box(barge, 1 + rand() * 2, 0.6 + rand() * 1.4, 1 + rand() * 2, 129 + rand() * 6, 1.2, -40 + rand() * 20, [0x6a5a48, 0x4a4f58, 0x7a3a2a][i % 3]);
  box(barge, 3, 2.4, 3, 132, 2.1, -18.5, 0x4a4f58);                          // wheelhouse
  solid.push(...barge);
  box(glow, 2.6, 0.5, 0.06, 132, 2.6, -16.97, 0x9fe9ff);
  floorsPush(city, 127.5, 136.5, -42.5, -17.5, 0.7);
  col(127.2, 127.6, -43, -35, 2.5); col(127.2, 127.6, -33, -17, 2.5); col(136.4, 136.8, -43, -17, 2.5); col(127.2, 136.8, -43.2, -42.8, 2.5); col(127.2, 136.8, -17.2, -16.8, 2.5);
  // gangway from the north pier to the barge
  box(solid, 4, 0.12, 1.6, 126, 0.3, -34, 0x6a6f7a);
  floorsPush(city, 124, 127.6, -34.8, -33.2, 0.35);

  // ── floodlights (cheap fake light pools) and signs ──────────────────────
  const poolMat = new THREE.MeshBasicMaterial({ color: 0xffd9a8, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const [x, z] of [[56, -46], [76, -46], [96, -46], [116, -30], [116, -66], [84, -20], [84, -72]]) {
    cyl(solid, 0.12, 9, x + 2.5, 4.5, z + 2.5, 0x3a3f48, 6);
    box(glow, 1.2, 0.3, 0.6, x + 2.5, 9, z + 2.5, 0xfff2d6);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(6, 24), poolMat); pool.rotation.x = -Math.PI / 2; pool.position.set(x, 0.03, z); root.add(pool);
  }
  // neon "DOCKS" arch sign over the checkpoint
  const signC = document.createElement("canvas"); signC.width = 512; signC.height = 128;
  { const x = signC.getContext("2d"); x.fillStyle = "#060a14"; x.fillRect(0, 0, 512, 128); x.strokeStyle = "#ff3a4a"; x.lineWidth = 6; x.strokeRect(6, 6, 500, 116);
    x.fillStyle = "#ffffff"; x.font = "900 54px Arial"; x.textAlign = "center"; x.fillText("TENKAI PORT 7", 256, 66); x.fillStyle = "#ff8a9a"; x.font = "bold 26px Arial"; x.fillText("港湾 · AUTHORISED ENTRY ONLY", 256, 104); }
  const signT = new THREE.CanvasTexture(signC); signT.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.75), new THREE.MeshBasicMaterial({ map: signT, side: THREE.DoubleSide }));
  sign.position.set(49.2, 5.9, -46); sign.rotation.y = -Math.PI / 2; root.add(sign);

  // ── fill the edges: ground strip between city and yard, plus warehouse
  //    rows beyond the north/south fences so you never see off the map
  box(solid, 6, 0.1, 140, 46, -0.07, -46, 0x2a2d34);                       // strip x 43 → 49
  box(solid, 70, 0.2, 40, 80, -0.12, -101, 0x34373e); box(solid, 70, 0.2, 40, 80, -0.12, 9, 0x34373e);   // lots behind the fences
  for (const [zc, side] of [[-92, -1], [0, 1]]) for (let x = 52; x < 112; x += 15) {
    const h = 9 + rand() * 9, w = 13, d = 12;
    box(solid, w, h, d, x + 6.5, h / 2, zc + side * 2, [0x2c3140, 0x33303a, 0x2a3236][Math.floor(rand() * 3)]);
    box(solid, w + 0.4, 0.3, d + 0.4, x + 6.5, h + 0.15, zc + side * 2, 0x1c1f26);                        // roof lip
    box(glow, w * 0.7, 0.12, 0.08, x + 6.5, h - 1.2, zc + side * 2 - side * (d / 2 + 0.05), [0x38f0e6, 0xff4fa3, 0xffb02e][Math.floor(rand() * 3)]);  // light strip facing the yard
    for (let k = 0; k < 3; k++) box(solid, 3, 4, 0.1, x + 2 + k * 4.5, 2, zc + side * 2 - side * (d / 2 + 0.05), 0x15181e);   // loading doors
    col(x, x + 13, zc + side * 2 - d / 2, zc + side * 2 + d / 2, h);
  }
  // ── far shore skyline across the water ─────────────────────────────────
  for (let i = 0; i < 18; i++) { const h = 20 + rand() * 70, w = 8 + rand() * 10; box(solid, w, h, w, 210 + rand() * 40, h / 2 - 1.4, -150 + i * 16 + rand() * 6, 0x141824); box(glow, 0.3, h * 0.7, 0.3, 200 + rand() * 30, h * 0.35, -150 + i * 16, [0x38f0e6, 0xb24cff, 0xff4fa3][i % 3]); }

  // ── merge ───────────────────────────────────────────────────────────────
  const solidMesh = new THREE.Mesh(mergeGeometries(solid, false), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.35 }));
  const glowMesh = new THREE.Mesh(mergeGeometries(glow, false), new THREE.MeshBasicMaterial({ vertexColors: true }));
  solidMesh.name = "DOCKS"; glowMesh.name = "DOCKS_GLOW";
  root.add(solidMesh, glowMesh);

  city.anchors.docksGate = new THREE.Vector3(46, 0, -46);
  city.anchors.docksRespawn = new THREE.Vector3(40, 0, -46);
  city.anchors.barge = new THREE.Vector3(132, 0.95, -30);
  return {
    update(time) { waterTex.offset.set(time * 0.00002, time * 0.00004); },
    // Points the enemy spawner uses (on open ground between the containers).
    spawnPoints: [[56, -46], [64, -40], [74, -50], [84, -36], [90, -54], [98, -46], [106, -32], [106, -62], [76, -22], [82, -70]].map(([x, z]) => new THREE.Vector3(x, 0, z))
  };
}

function floorsPush(city, minX, maxX, minZ, maxZ, y) { city.floors.push({ minX, maxX, minZ, maxZ, y }); }
