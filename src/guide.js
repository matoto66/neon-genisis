// NEON GENESIS — objective guide.
//
// Two styles (chosen in Settings):
//   "beam"  the tall light beam over the objective (original)
//   "path"  a floating dotted line at waist height that follows the streets
//           and alleys from you to the objective, flowing toward it
//
// The path is found on a small hand-placed street network (nodes on the road
// centre lines, alleys, the freight lift and the rooftop) with Dijkstra.

import * as THREE from "three";

const SETTINGS_KEY = "neon-genesis-settings";
export const guideSettings = { guide: "beam" };
try { Object.assign(guideSettings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}")); } catch {}
export function setGuideStyle(style) {
  guideSettings.guide = style === "path" ? "path" : "beam";
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(guideSettings)); } catch {}
}

// Street network as polylines of [x, y, z]. Points closer than 0.6 m merge.
const ROOF = 19;
const NETWORK = [
  // main avenue (north-south)
  [[0, 0, 40], [0, 0, 28], [0, 0, 18], [0, 0, 10], [0, 0, 1], [0, 0, -4.8], [0, 0, -10], [0, 0, -19], [0, 0, -26], [0, 0, -34],
   [0, 0, -46], [0, 0, -58], [0, 0, -66], [0, 0, -75], [0, 0, -86], [0, 0, -94], [0, 0, -104], [0, 0, -112], [0, 0, -120], [0, 0, -128], [0, 0, -136]],
  // ring road (east-west)
  [[-43, 0, -46], [-30, 0, -46], [-18, 0, -46], [0, 0, -46], [18, 0, -46], [30, 0, -46], [43, 0, -46]],
  [[-43, 0, -46], [-43.6, 0, -39]],                                  // west end (data shard)
  // Mika's Repair (door faces the avenue)
  [[0, 0, -4.8], [-9.6, 0, -4.8], [-12.4, 0, -4.8]],
  // Sato's stall + market lot
  [[0, 0, 10], [9.5, 0, 10], [15.6, 0, 10], [15.6, 0, 5.8]],
  // Lantern Alley (west)
  [[0, 0, 10], [-9.5, 0, 9.6], [-17, 0, 9.6], [-23, 0, 9.0]],
  // Drain Alley (east)
  [[0, 0, -10], [9.5, 0, -10], [17, 0, -10], [22.6, 0, -9.0], [25.4, 0, -8.6]],
  // Rust Alley → freight lift
  [[0, 0, -26], [-9.5, 0, -26], [-21.8, 0, -26]],
  // rooftop (reached by the lift)
  [[-23.6, ROOF, -9.2], [-21, ROOF, -10.6], [-17, ROOF, -11.2], [-14.5, ROOF, -11.4], [-13, ROOF, -16], [-12.8, ROOF, -21.5]],
  // Neon Mile shops and alleys
  [[0, 0, -66], [-9.6, 0, -66]],                                      // pylon 1
  [[0, 0, -75], [9.5, 0, -75], [13.2, 0, -75]],                       // Second Skin clinic
  [[0, 0, -86], [-9.6, 0, -86], [-14, 0, -85.2], [-21, 0, -86], [-26.4, 0, -86]],  // Shimmer Alley shrine
  [[0, 0, -94], [9.6, 0, -94]],                                       // pylon 2
  [[0, 0, -104], [9.6, 0, -104], [14, 0, -103.2], [22, 0, -104.2], [27.6, 0, -104]],  // east alley
  [[0, 0, -112], [-9.8, 0, -112]],                                    // junction by the plaza
  // Spire Plaza
  [[0, 0, -120], [-20, 0, -123], [-20, 0, -130], [-8, 0, -136], [0, 0, -136]],
  [[0, 0, -120], [20, 0, -123], [20, 0, -130], [8, 0, -136], [0, 0, -136]],
  [[0, 0, -120], [0, 0, -123.4]]
];
// The freight lift links the alley to the roof.
const LIFT = { ground: [-21.8, 0, -26], roof: [-23.6, ROOF, -9.2] };

function buildGraph() {
  const nodes = [], edges = [];
  const idOf = p => {
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (Math.abs(n.y - p[1]) < 1 && Math.hypot(n.x - p[0], n.z - p[2]) < 0.6) return i;
    }
    nodes.push(new THREE.Vector3(p[0], p[1], p[2]));
    edges.push([]);
    return nodes.length - 1;
  };
  const link = (a, b, lift = false) => {
    const w = lift ? 6 : nodes[a].distanceTo(nodes[b]);
    edges[a].push({ to: b, w, lift }); edges[b].push({ to: a, w, lift });
  };
  for (const line of NETWORK) for (let i = 1; i < line.length; i++) link(idOf(line[i - 1]), idOf(line[i]));
  link(idOf(LIFT.ground), idOf(LIFT.roof), true);
  return { nodes, edges };
}

export function createGuide(parent) {
  const { nodes, edges } = buildGraph();
  const MAX_DOTS = 160, SPACING = 0.75, HEIGHT = 1.0;
  const dotGeo = new THREE.SphereGeometry(0.045, 8, 6);
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false });
  const dots = new THREE.InstancedMesh(dotGeo, dotMat, MAX_DOTS);
  dots.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  dots.setColorAt(0, new THREE.Color());
  dots.frustumCulled = false;
  dots.count = 0;
  dots.name = "GUIDE_PATH";
  parent.add(dots);
  // end marker: a small spinning diamond over the objective
  const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.18), new THREE.MeshBasicMaterial({ color: 0xffcf4a }));
  marker.visible = false;
  parent.add(marker);

  let path = [];               // array of Vector3 (ground level), with .lift flags
  let lastFrom = new THREE.Vector3(1e9, 0, 0), lastTo = new THREE.Vector3(1e9, 0, 0);
  const tmpM = new THREE.Matrix4(), tmpC = new THREE.Color(), tmpP = new THREE.Vector3();
  let color = new THREE.Color(0xffcf4a);

  function nearestNode(p) {
    let best = -1, bd = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (Math.abs(n.y - p.y) > 4) continue;              // stay on the same level
      const d = (n.x - p.x) ** 2 + (n.z - p.z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  function findPath(from, to) {
    const s = nearestNode(from), t = nearestNode(to);
    if (s < 0 || t < 0) return [from.clone(), to.clone()];
    const dist = new Array(nodes.length).fill(Infinity), prev = new Array(nodes.length).fill(-1), done = new Uint8Array(nodes.length);
    dist[s] = 0;
    for (;;) {
      let u = -1, bd = Infinity;
      for (let i = 0; i < nodes.length; i++) if (!done[i] && dist[i] < bd) { bd = dist[i]; u = i; }
      if (u < 0 || u === t) break;
      done[u] = 1;
      for (const e of edges[u]) if (dist[u] + e.w < dist[e.to]) { dist[e.to] = dist[u] + e.w; prev[e.to] = u; }
    }
    const ids = [];
    for (let v = t; v >= 0; v = prev[v]) ids.unshift(v);
    const pts = [from.clone()];
    // skip the first node if it is behind us (already closer to the second)
    let start = 0;
    if (ids.length > 1 && from.distanceTo(nodes[ids[1]]) < nodes[ids[0]].distanceTo(nodes[ids[1]])) start = 1;
    for (let i = start; i < ids.length; i++) pts.push(nodes[ids[i]].clone());
    pts.push(to.clone());
    return pts;
  }

  // Lay dots along the path up to MAX_DOTS; the lift hop is drawn as a gap.
  function layout(time) {
    let count = 0, carry = 0;
    const flow = (time * 0.0012) % 1;
    for (let i = 1; i < path.length && count < MAX_DOTS; i++) {
      const a = path[i - 1], b = path[i];
      if (Math.abs(a.y - b.y) > 4) { carry = 0; continue; }   // lift: no dots through the building
      const len = a.distanceTo(b);
      for (let d = carry; d < len && count < MAX_DOTS; d += SPACING) {
        tmpP.lerpVectors(a, b, d / len);
        const k = count + 0;
        const wave = 0.5 + 0.5 * Math.sin((k * 0.35 - time * 0.006));
        const y = tmpP.y + HEIGHT + Math.sin(time * 0.003 + k * 0.5) * 0.04;
        const s = 0.75 + wave * 0.55;
        tmpM.makeScale(s, s, s).setPosition(tmpP.x, y, tmpP.z);
        dots.setMatrixAt(count, tmpM);
        tmpC.copy(color).multiplyScalar(0.45 + wave * 0.75);
        dots.setColorAt(count, tmpC);
        count++;
      }
      carry = (carry + SPACING - (len % SPACING)) % SPACING;
    }
    dots.count = count;
    dots.instanceMatrix.needsUpdate = true;
    if (dots.instanceColor) dots.instanceColor.needsUpdate = true;
  }

  /** Call every frame. target = Vector3 or null. */
  function update(time, playerPos, target, mainMission) {
    const on = guideSettings.guide === "path" && !!target;
    dots.visible = on; marker.visible = on;
    if (!on) return;
    color.set(mainMission ? 0xffcf4a : 0x5ff5e8);
    marker.material.color.copy(color);
    if (playerPos.distanceToSquared(lastFrom) > 0.8 || target.distanceToSquared(lastTo) > 0.1) {
      lastFrom.copy(playerPos); lastTo.copy(target);
      const from = new THREE.Vector3(playerPos.x, playerPos.y, playerPos.z);
      const to = new THREE.Vector3(target.x, target.y, target.z);
      path = findPath(from, to);
      // trim the first metre so dots don't start inside your body
      if (path.length > 1) { const a = path[0], b = path[1], l = a.distanceTo(b); if (l > 1.2) a.lerp(b, 1 / l); }
    }
    layout(time);
    marker.position.set(target.x, target.y + 2.3 + Math.sin(time * 0.003) * 0.08, target.z);
    marker.rotation.y = time * 0.002;
  }
  return { update, findPath, nodes };
}
