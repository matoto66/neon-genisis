// NEON GENESIS — NPCs.
//
// Every character is built from ~6 meshes (body, glow details, two arms, two
// legs split at the knee) using merged, vertex-coloured geometry and two
// shared materials, so a crowd stays cheap on Quest. NPCs beyond ~40 m are
// hidden and not animated.

import * as THREE from "three";
import { buildCharacter, randomAppearance } from "./character.js";
export { buildCharacter, randomAppearance };

const hologramMaterial = new THREE.MeshBasicMaterial({
  color: 0x5ff5ff, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false
});
const hitMaterial = new THREE.MeshBasicMaterial({ visible: false });

// ─── text sprites for name tags, quest markers and speech ───────────────────
function textSprite(lines, { width = 512, height = 128, scale = 1, bg = "rgba(5,10,22,0.78)", border = "#38f0e6" } = {}) {
  const c = document.createElement("canvas"); c.width = width; c.height = height;
  const ctx = c.getContext("2d");
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(scale * width / height * 0.25, scale * 0.25, 1);
  sprite.userData.draw = (ls, opt = {}) => {
    ctx.clearRect(0, 0, width, height);
    if (bg) { ctx.fillStyle = bg; roundRect(ctx, 4, 4, width - 8, height - 8, 18); ctx.fill(); ctx.strokeStyle = opt.border || border; ctx.lineWidth = 4; ctx.stroke(); }
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const n = ls.length;
    ls.forEach((l, i) => {
      ctx.fillStyle = l.color || "#ffffff";
      ctx.font = `${l.weight || "bold"} ${l.size || 40}px Arial`;
      ctx.fillText(l.text, width / 2, height * (i + 0.5) / n + (n > 1 ? (i === 0 ? 4 : -4) : 0));
    });
    tex.needsUpdate = true;
  };
  sprite.userData.draw(lines);
  return sprite;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function wrapForBubble(text, max = 34) {
  const words = text.split(" "), lines = [];
  let line = "";
  for (const w of words) { if ((line + " " + w).trim().length > max) { lines.push(line.trim()); line = w; } else line += " " + w; }
  if (line.trim()) lines.push(line.trim());
  return lines.slice(0, 3);
}

// ─── the NPC system ─────────────────────────────────────────────────────────
export function createNPCSystem(parent, rand) {
  const group = new THREE.Group();
  group.name = "NPCS";
  parent.add(group);
  const npcs = [];
  const hitMeshes = [];
  const byId = {};
  const tmp = new THREE.Vector3();

  function addNPC(opts) {
    const appearance = opts.appearance || randomAppearance(rand);
    const model = buildCharacter(appearance);
    const holder = new THREE.Group();
    holder.add(model);
    holder.position.copy(opts.position);
    holder.rotation.y = opts.yaw || 0;
    group.add(holder);
    if (opts.hologram) model.traverse(o => { if (o.isMesh) o.material = hologramMaterial; });
    const npc = {
      id: opts.id || "npc" + npcs.length, name: opts.name || null, role: opts.role || "",
      holder, model, rig: model.userData.rig, mode: opts.mode || "idle",
      path: opts.path || null, pathIndex: 0, pathDir: 1, speed: opts.speed || (1.05 + rand() * 0.45),
      offset: opts.offset || 0, phase: rand() * 10, barks: opts.barks || null,
      faceTarget: opts.faceTarget || null, baseYaw: opts.yaw || 0, talkTo: opts.talkTo || null,
      interactive: opts.interactive !== false, named: !!opts.name, hologram: !!opts.hologram,
      paused: 0, bubbleTimer: 0, bubble: null, tag: null, marker: null, enabled: opts.enabled !== false, gesture: 0
    };
    holder.visible = npc.enabled;
    // invisible hit capsule for pointing/interaction
    if (npc.interactive) {
      const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.8, 8), hitMaterial);
      hit.position.y = 0.9 * npc.rig.scale;
      hit.userData.npc = npc;
      holder.add(hit);
      hitMeshes.push(hit);
      npc.hit = hit;
    }
    if (npc.named) {
      npc.tag = textSprite([{ text: npc.name.toUpperCase(), size: 44 }, { text: npc.role, size: 26, color: "#9fe9ff", weight: "normal" }], { scale: 0.9 });
      npc.tag.position.y = 2.15 * npc.rig.scale / model.scale.y * model.scale.y;
      npc.tag.position.y = 2.12;
      holder.add(npc.tag);
      npc.marker = textSprite([{ text: "!", size: 100, color: "#ffcf4a" }], { width: 128, height: 128, bg: null, scale: 1.1 });
      npc.marker.position.y = 2.55;
      npc.marker.visible = false;
      holder.add(npc.marker);
    }
    if (npc.mode === "sit") applySit(npc, opts.seatHeight || 0.46);
    if (npc.mode === "walk" && npc.path) {
      // start somewhere random along the path
      npc.pathIndex = Math.floor(rand() * (npc.path.length - 1));
      const a = npc.path[npc.pathIndex], b = npc.path[npc.pathIndex + 1];
      const t = rand();
      holder.position.set(a[0] + (b[0] - a[0]) * t, 0, a[1] + (b[1] - a[1]) * t);
    }
    npcs.push(npc);
    byId[npc.id] = npc;
    return npc;
  }

  function applySit(npc, seat) {
    const r = npc.rig;
    for (const h of r.hips) h.rotation.x = -1.5;
    for (const k of r.knees) k.rotation.x = 1.5;
    npc.model.position.y = seat - r.hipY * r.scale + 0.05;
    npc.model.position.z = -0.1;
  }

  function setMarker(id, kind) {
    const npc = byId[id];
    if (!npc?.marker) return;
    npc.marker.visible = !!kind;
    if (kind) npc.marker.userData.draw([{ text: kind, size: 100, color: kind === "?" ? "#5ff5e8" : "#ffcf4a" }]);
  }
  function setEnabled(id, on) {
    const npc = byId[id]; if (!npc) return;
    npc.enabled = on; npc.holder.visible = on;
  }
  function say(npc, text, seconds = 4) {
    if (!npc.bubble) {
      npc.bubble = textSprite([{ text: "" }], { width: 768, height: 192, scale: 1.0, border: "#ff6fe0" });
      npc.bubble.position.y = npc.named ? 2.75 : 2.25;
      npc.holder.add(npc.bubble);
    }
    const lines = wrapForBubble(text);
    npc.bubble.userData.draw(lines.map(t => ({ text: t, size: 40, weight: "bold" })));
    npc.bubble.visible = true;
    npc.bubbleTimer = seconds;
  }

  function animateWalk(npc, t, amount) {
    const r = npc.rig, ph = t * 7.2 + npc.phase, sw = Math.sin(ph) * 0.42 * amount;
    r.hips[0].rotation.x = sw; r.hips[1].rotation.x = -sw;
    r.knees[0].rotation.x = Math.max(0, Math.sin(ph + Math.PI)) * 0.7 * amount + 0.05;
    r.knees[1].rotation.x = Math.max(0, Math.sin(ph)) * 0.7 * amount + 0.05;
    if (!npc.model.userData.umbrella) { r.arms[0].rotation.x = -sw * 0.8; }
    if (r.arms[1].rotation.x > -1) r.arms[1].rotation.x = sw * 0.8;
    npc.model.position.y = Math.abs(Math.cos(ph)) * 0.03 * amount;
    if (r.elbows) { r.elbows[0].rotation.x = -0.15 - Math.max(0, sw) * 0.5; if (r.arms[1].rotation.x > -1) r.elbows[1].rotation.x = -0.15 - Math.max(0, -sw) * 0.5; }
  }
  // Heads glance around on their own; `targetYaw` (local) overrides.
  function animateHead(npc, t, dt, targetYaw) {
    const head = npc.rig.head; if (!head) return;
    let yaw = targetYaw;
    if (yaw === null) { const k = Math.floor(t * 0.25 + npc.phase); yaw = Math.sin(k * 12.9898) * 0.6 * (Math.sin(k * 4.1) > 0.2 ? 1 : 0); }
    yaw = Math.max(-1.0, Math.min(1.0, yaw));
    head.rotation.y += (yaw - head.rotation.y) * (1 - Math.exp(-5 * dt));
    head.rotation.x = Math.sin(t * 0.7 + npc.phase) * 0.03;
  }
  function animateIdle(npc, t) {
    const r = npc.rig, b = Math.sin(t * 1.6 + npc.phase);
    r.body.scale.set(1, 1 + b * 0.008, 1 + b * 0.012);
    r.arms[0].rotation.x = Math.sin(t * 0.9 + npc.phase) * 0.05;
    if (r.arms[1].rotation.x > -1) r.arms[1].rotation.x = Math.sin(t * 0.8 + npc.phase + 1) * 0.05;
    r.hips[0].rotation.x = r.hips[1].rotation.x = 0;
    r.knees[0].rotation.x = 0.03; r.knees[1].rotation.x = 0.03;
  }
  function animateTalk(npc, t) {
    animateIdle(npc, t);
    const g = Math.max(0, Math.sin(t * 1.7 + npc.phase));
    const arm = npc.rig.arms[Math.floor(t * 0.35 + npc.phase) % 2];
    arm.rotation.x = -0.4 - g * 0.6;
    arm.rotation.z = (arm === npc.rig.arms[0] ? -1 : 1) * (0.06 + g * 0.25);
  }

  const playerFlat = new THREE.Vector3();
  function update(time, dt, playerPos, activeTalkId) {
    const t = time * 0.001;
    playerFlat.set(playerPos.x, 0, playerPos.z);
    for (const npc of npcs) {
      if (!npc.enabled) continue;
      const h = npc.holder;
      const dx = h.position.x - playerPos.x, dz = h.position.z - playerPos.z;
      const dy = h.position.y - playerPos.y;
      const d2 = dx * dx + dz * dz + dy * dy * 4;
      const near = d2 < 36 * 36;
      h.visible = near;
      if (!near) continue;
      const dist = Math.sqrt(d2);
      if (npc.tag) npc.tag.visible = dist < 9 && !npc.hologram;
      if (npc.bubble && npc.bubble.visible) { npc.bubbleTimer -= dt; if (npc.bubbleTimer <= 0) npc.bubble.visible = false; }
      if (npc.hologram) { npc.model.traverse(o => { if (o.isMesh && o.material === hologramMaterial) o.visible = Math.random() > 0.02; }); hologramMaterial.opacity = 0.35 + Math.sin(t * 9) * 0.06; }

      if (npc.mode === "walk" && npc.path) {
        // pause if the player is right in front of them
        const blocked = dist < 1.0;
        if (!blocked) {
          const target = npc.path[npc.pathIndex + npc.pathDir] || npc.path[npc.pathIndex];
          tmp.set(target[0] + npc.offset - h.position.x, 0, target[1] - h.position.z);
          const len = tmp.length();
          if (len < 0.3) {
            npc.pathIndex += npc.pathDir;
            if (npc.pathIndex <= 0 || npc.pathIndex >= npc.path.length - 1) {
              const loop = npc.path[0][0] === npc.path[npc.path.length - 1][0] && npc.path[0][1] === npc.path[npc.path.length - 1][1];
              if (loop) npc.pathIndex = npc.pathDir > 0 ? 0 : npc.path.length - 1;
              else npc.pathDir *= -1;
            }
          } else {
            tmp.multiplyScalar(1 / len);
            h.position.x += tmp.x * npc.speed * dt;
            h.position.z += tmp.z * npc.speed * dt;
            const yaw = Math.atan2(tmp.x, tmp.z);
            h.rotation.y = dampAngle(h.rotation.y, yaw, 6, dt);
          }
        }
        if (dist < 30) animateWalk(npc, t, blocked ? 0 : 1);
        continue;
      }
      // static NPCs: named ones turn to face a nearby player
      let wantYaw = npc.baseYaw;
      if (npc.talkTo) { const o = byId[npc.talkTo]?.holder; if (o) wantYaw = Math.atan2(o.position.x - h.position.x, o.position.z - h.position.z); }
      if ((npc.named || npc.id === activeTalkId) && dist < 4.5 && npc.mode !== "sit") wantYaw = Math.atan2(-dx, -dz);
      h.rotation.y = dampAngle(h.rotation.y, wantYaw, npc.mode === "sit" ? 0 : 3, dt);
      if (dist > 26) continue;
      // Look at the player with the head when close (even while seated).
      const toPlayer = Math.atan2(-dx, -dz);
      const localLook = Math.atan2(Math.sin(toPlayer - h.rotation.y), Math.cos(toPlayer - h.rotation.y));
      animateHead(npc, t, dt, dist < (npc.named ? 5 : 2.5) && Math.abs(localLook) < 1.8 ? localLook : null);
      if (npc.mode === "talk" || npc.id === activeTalkId) animateTalk(npc, t);
      else if (npc.mode === "sit") { const b = Math.sin(t * 1.4 + npc.phase); npc.rig.body.scale.set(1, 1 + b * 0.008, 1); npc.rig.arms[0].rotation.x = -0.5 + b * 0.04; npc.rig.arms[1].rotation.x = -0.45; }
      else if (npc.mode === "lean") { animateIdle(npc, t); npc.model.rotation.x = -0.1; npc.rig.arms[0].rotation.x = 0.2; npc.rig.arms[1].rotation.x = -0.3; npc.rig.arms[1].rotation.z = 0.4; }
      else animateIdle(npc, t);
      // ambient chatter from crowd NPCs every so often
      if (npc.barks && !npc.named && dist < 6 && Math.random() < dt * 0.04) say(npc, npc.barks[Math.floor(Math.random() * npc.barks.length)], 3.5);
    }
  }

  return { group, npcs, hitMeshes, byId, addNPC, update, setMarker, setEnabled, say };
}

function dampAngle(a, b, lambda, dt) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * (1 - Math.exp(-lambda * dt));
}
