// NEON GENESIS — detailed street props built with CSG (tools/build_props.html →
// assets/props_v2.glb). Each prop type becomes a few InstancedMeshes, so all
// the vending machines / AC units / lamps / dumpsters cost a handful of draw calls.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

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
      model.traverse(o => {
        if (!o.isMesh) return;
        const local = new THREE.Matrix4().copy(model.matrixWorld).invert().multiply(o.matrixWorld);
        const inst = new THREE.InstancedMesh(o.geometry, o.material, spots.length);
        spots.forEach((s, i) => { m4.compose(new THREE.Vector3(s.x, s.y, s.z), q.setFromAxisAngle(up, s.ry || 0), one).multiply(local); inst.setMatrixAt(i, m4); });
        inst.computeBoundingSphere(); inst.name = "PROP_" + type;
        root.add(inst);
      });
    }
    onReady?.(models);
  }, undefined, e => console.warn("props_v2.glb failed to load", e));
}
