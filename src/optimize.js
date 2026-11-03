// NEON GENESIS — draw-call optimisation helpers.
//
// skinify(): turns a hierarchy built from many small meshes (e.g. a robotic
// hand with ~115 parts, or an NPC with separate limbs) into just two GPU-skinned
// meshes. The existing pivot Groups are reused as the skeleton's bones, so the
// animation code that rotates finger joints or legs keeps working unchanged.
//
// mergeStatic(): merges non-moving meshes that share a material into one mesh.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const solidCache = new Map();
const glowCache = new Map();
function solidMaterial(metalness, roughness) {
  const key = `${metalness.toFixed(1)}|${roughness.toFixed(1)}`;
  if (!solidCache.has(key)) solidCache.set(key, new THREE.MeshStandardMaterial({ vertexColors: true, metalness, roughness }));
  return solidCache.get(key);
}
function glowMaterial(hologram) {
  const key = hologram ? "holo" : "basic";
  if (!glowCache.has(key)) glowCache.set(key, new THREE.MeshBasicMaterial({ vertexColors: true }));
  return glowCache.get(key);
}

const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _c = new THREE.Color();
function isGlow(material) {
  if (material.isMeshBasicMaterial) return true;
  return (material.emissiveIntensity || 0) > 0.5 && material.emissive && material.emissive.getHex() !== 0;
}

/**
 * @param {THREE.Object3D} root   model root (its Groups become bones)
 * @param {object} opts
 *   metalness/roughness  shading of the merged solid mesh
 *   keep(mesh)           return true to leave a mesh untouched (e.g. hit boxes, sprites)
 */
export function skinify(root, { metalness = 0.75, roughness = 0.3, keep = () => false, frustumCulled = true } = {}) {
  root.updateMatrixWorld(true);
  _inv.copy(root.matrixWorld).invert();
  const bones = [];
  const boneIndex = new Map();
  const indexOf = obj => {
    if (!boneIndex.has(obj)) { boneIndex.set(obj, bones.length); bones.push(obj); }
    return boneIndex.get(obj);
  };
  indexOf(root);
  const parts = { solid: [], glow: [] };
  const meshes = [];
  root.traverse(o => { if (o.isMesh && !o.isSkinnedMesh && !keep(o)) meshes.push(o); });
  for (const mesh of meshes) {
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    // the mesh is bound to the nearest non-mesh ancestor (its pivot)
    let bone = mesh.parent;
    while (bone && bone.isMesh) bone = bone.parent;
    const bi = indexOf(bone);
    let g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (!["position", "normal", "color"].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    _m.multiplyMatrices(_inv, mesh.matrixWorld);
    g.applyMatrix4(_m);
    const n = g.attributes.position.count;
    if (!g.attributes.color) {
      _c.copy(mat.color || _c.set(0xffffff));
      if (isGlow(mat) && mat.isMeshStandardMaterial) _c.lerp(mat.emissive, 0.25).multiplyScalar(1.15);
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    }
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { si[i * 4] = bi; sw[i * 4] = 1; }
    g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(sw, 4));
    parts[isGlow(mat) ? "glow" : "solid"].push(g);
    mesh.parent.remove(mesh);
  }
  const skeleton = new THREE.Skeleton(bones);
  const out = [];
  for (const kind of ["solid", "glow"]) {
    if (!parts[kind].length) continue;
    const geo = mergeGeometries(parts[kind], false);
    parts[kind].forEach(p => p.dispose());
    const mesh = new THREE.SkinnedMesh(geo, kind === "solid" ? solidMaterial(metalness, roughness) : glowMaterial());
    mesh.name = root.name + "_" + kind.toUpperCase();
    mesh.frustumCulled = frustumCulled;
    root.add(mesh);
    mesh.bind(skeleton, root.matrixWorld.clone());
    mesh.bindMode = THREE.AttachedBindMode;
    out.push(mesh);
  }
  // bind() captured the current (rest) pose; refresh after later pose edits
  return { meshes: out, skeleton };
}

/** Merge static meshes under `group` that share a material (skipping `exclude` subtrees). */
export function mergeStatic(group, exclude = []) {
  group.updateMatrixWorld(true);
  _inv.copy(group.matrixWorld).invert();
  const skip = new Set();
  for (const e of exclude) e.traverse(o => skip.add(o));
  const byMat = new Map();
  const meshes = [];
  group.traverse(o => { if (o.isMesh && !skip.has(o) && !Array.isArray(o.material) && o.material.visible !== false) meshes.push(o); });
  for (const mesh of meshes) {
    let g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    _m.multiplyMatrices(_inv, mesh.matrixWorld);
    g.applyMatrix4(_m);
    if (!byMat.has(mesh.material)) byMat.set(mesh.material, []);
    byMat.get(mesh.material).push(g);
    mesh.parent.remove(mesh);
  }
  const merged = [];
  for (const [mat, geos] of byMat) {
    const m = new THREE.Mesh(mergeGeometries(geos, false), mat);
    geos.forEach(g => g.dispose());
    m.name = group.name + "_MERGED";
    group.add(m);
    merged.push(m);
  }
  return merged;
}
