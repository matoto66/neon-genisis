// NEON GENESIS — detailed street props built with CSG (tools/build_props.html →
// assets/props_v2.glb). Each prop type becomes a few InstancedMeshes, so all
// the vending machines / AC units / lamps / dumpsters cost a handful of draw calls.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export function loadProps3D(root, city, version, onReady) {
  new GLTFLoader().load(`assets/props_v2.glb?v=${version}`, gltf => {
    const models = {};
    gltf.scene.updateMatrixWorld(true);
    for (const g of gltf.scene.children) models[g.name] = g;
    const byType = {};
    for (const s of city.propSpots) (byType[s.type] ||= []).push(s);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    for (const [type, spots] of Object.entries(byType)) {
      const model = models[type];
      if (!model) { console.warn("missing prop model", type); continue; }
      // merge every part that shares a material into one geometry (in model space),
      // so a prop costs one draw call per material instead of one per part
      const groups = new Map(), inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
      model.traverse(o => {
        if (!o.isMesh) return;
        const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
        g.applyMatrix4(new THREE.Matrix4().copy(inv).multiply(o.matrixWorld));
        for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k);
        if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        if (!g.attributes.normal) g.computeVertexNormals();
        const key = o.material.uuid;
        (groups.get(key) || groups.set(key, { mat: o.material, geos: [] }).get(key)).geos.push(g);
      });
      for (const { mat, geos } of groups.values()) {
        const geo = (geos.length > 1 && mergeGeometries(geos)) || geos[0];
        const inst = new THREE.InstancedMesh(geo, mat, spots.length);
        spots.forEach((s, i) => { m4.compose(new THREE.Vector3(s.x, s.y, s.z), q.setFromAxisAngle(up, s.ry || 0), one); inst.setMatrixAt(i, m4); });
        inst.computeBoundingSphere(); inst.name = "PROP_" + type;
        root.add(inst);
      }
    }
    onReady?.(models);
  }, undefined, e => console.warn("props_v2.glb failed to load", e));
}
