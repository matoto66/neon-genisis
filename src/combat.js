// NEON GENESIS — combat (VR first).
//
// VR controls (the conventions used by Quest melee games):
//   GRIP (squeeze)          make a fist — the robot fingers curl closed
//   swing a fist            punch: damage scales with how fast your hand moves
//   TRIGGER with open hand  GEN-0 palm pulse (ranged energy shot, 3 charges)
//   both fists up at face   guard: blocks most incoming damage
//   X (left controller)     use a med patch
// PC fallback: left click punch, right click pulse, hold C guard, Q med patch.
//
// Enemies: scav drones (rush you), sentry drones (keep distance, shoot slow
// glowing bolts you can dodge or punch back), Tenkai enforcers (baton melee
// with a visible wind-up). Fights are triggered by encounter zones (the Docks).

import * as THREE from "three";
import { buildCharacter } from "./character.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { state, saveGame, maxHealth, effectiveStrength, isActive, XP_REWARDS } from "./state.js";

const ENEMY_TYPES = {
  scav:     { hp: 18, speed: 3.4, radius: 0.24, damage: 8, reward: 15, hover: 1.4 },
  sentry:   { hp: 34, speed: 2.4, radius: 0.3, damage: 12, reward: 25, hover: 2.6 },
  enforcer: { hp: 70, speed: 2.1, radius: 0.42, damage: 18, reward: 40 }
};
const ENFORCER_LOOK = {
  build: "male", scale: 1.08, skin: 0xc98e66, faceShape: "angular", eyes: 0x3a2414, facialHair: "none", hair: "buzz", hairColor: 0x111111,
  hat: "helmet", hatColor: 0x15171c, top: "coat", topColor: 0x101218, accent: 0x2a2f3a, shirt: 0x15171c, pantsStyle: "cargo", pants: 0x101218,
  shoesStyle: "boots", shoes: 0x101010, extra: "shoulder pad", cyberArm: "right", faceTech: "visor", glow: 0xff3a4a
};

export function createCombat({ root, camera, player, renderer, city, game, zones, haptic, audio }) {
  const sfx = name => audio?.play(name);
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), head = new THREE.Vector3(), torso = new THREE.Vector3();
  const enemies = [], bolts = [];
  let hp = maxHealth(), energy = 1, regenDelay = 0, guarding = false, dead = false, hurtFlash = 0;
  if (!state.items) state.items = {};

  // ── shared assets ───────────────────────────────────────────────────────
  const mat = {
    hull: new THREE.MeshStandardMaterial({ color: 0x1c222d, metalness: 0.9, roughness: 0.3 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x8a93a3, metalness: 1, roughness: 0.25 }),
    rotor: new THREE.MeshBasicMaterial({ color: 0x9fe9ff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }),
    enemyBolt: new THREE.MeshBasicMaterial({ color: 0xff4a5a }),
    pulseBolt: new THREE.MeshBasicMaterial({ color: 0x9ffcff }),
    baton: new THREE.MeshBasicMaterial({ color: 0xff3a4a })
  };
  const geo = {
    droneBody: new THREE.SphereGeometry(1, 18, 12), ring: new THREE.TorusGeometry(1.15, 0.08, 6, 28),
    eye: new THREE.SphereGeometry(0.32, 12, 10), rotor: new THREE.CircleGeometry(0.55, 16), arm: new THREE.BoxGeometry(1.9, 0.1, 0.18),
    bolt: new THREE.SphereGeometry(0.09, 10, 8), pulse: new THREE.CapsuleGeometry(0.05, 0.35, 4, 8)
  };
  const haloTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d");
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.3, "rgba(255,255,255,0.5)"); g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const halo = (color, size) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); s.scale.setScalar(size); return s; };

  // ── particles: sparks, explosions (one Points object, pooled) ───────────
  const PN = 400;
  const pPos = new Float32Array(PN * 3), pCol = new Float32Array(PN * 3), pVel = new Float32Array(PN * 3), pLife = new Float32Array(PN);
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute("color", new THREE.BufferAttribute(pCol, 3));
  const sparks = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.06, map: haloTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  sparks.frustumCulled = false; sparks.name = "COMBAT_SPARKS";
  root.add(sparks);
  let pNext = 0;
  const _col = new THREE.Color();
  function burst(at, color, count = 16, speed = 3, up = 1) {
    _col.set(color);
    for (let i = 0; i < count; i++) {
      const k = pNext = (pNext + 1) % PN;
      pPos[k * 3] = at.x; pPos[k * 3 + 1] = at.y; pPos[k * 3 + 2] = at.z;
      const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI - Math.PI / 2, v = speed * (0.4 + Math.random() * 0.8);
      pVel[k * 3] = Math.cos(a) * Math.cos(b) * v; pVel[k * 3 + 1] = Math.sin(b) * v + up; pVel[k * 3 + 2] = Math.sin(a) * Math.cos(b) * v;
      pLife[k] = 0.35 + Math.random() * 0.5;
      pCol[k * 3] = _col.r; pCol[k * 3 + 1] = _col.g; pCol[k * 3 + 2] = _col.b;
    }
  }
  // impact flashes
  const flashes = Array.from({ length: 8 }, () => { const s = halo(0xffffff, 1); s.visible = false; root.add(s); return { s, t: 0 }; });
  let flashNext = 0;
  function flash(at, color, size = 0.8) { const f = flashes[flashNext = (flashNext + 1) % flashes.length]; f.s.position.copy(at); f.s.material.color.set(color); f.s.scale.setScalar(size); f.s.visible = true; f.t = 0.18; }

  // ── player feedback: red damage vignette, black fade, wrist HUD ─────────
  // Red glow around the edges of your view (clear in the middle).
  const vigTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 256; const x = c.getContext("2d");
    const g = x.createRadialGradient(128, 128, 60, 128, 128, 128); g.addColorStop(0, "rgba(255,16,48,0)"); g.addColorStop(0.65, "rgba(255,16,48,0.35)"); g.addColorStop(1, "rgba(255,16,48,1)");
    x.fillStyle = g; x.fillRect(0, 0, 256, 256); return new THREE.CanvasTexture(c); })();
  const vigMat = new THREE.MeshBasicMaterial({ map: vigTex, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false });
  const vignette = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), vigMat);
  vignette.position.z = -0.3;
  vignette.renderOrder = 9990; vignette.visible = false; camera.add(vignette);
  const fadeMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false, depthWrite: false, fog: false });
  const fade = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), fadeMat);
  fade.renderOrder = 9995; fade.visible = false; camera.add(fade);
  // Wrist display: health, pulse charge and med patches on the left forearm.
  const wristCanvas = document.createElement("canvas"); wristCanvas.width = 512; wristCanvas.height = 160;
  const wctx = wristCanvas.getContext("2d");
  const wristTex = new THREE.CanvasTexture(wristCanvas); wristTex.colorSpace = THREE.SRGBColorSpace;
  const wrist = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.05), new THREE.MeshBasicMaterial({ map: wristTex, transparent: true, depthWrite: false }));
  wrist.renderOrder = 900; wrist.visible = false;
  let wristParent = null, lastWristKey = "";
  function drawWrist() {
    const pulseOn = isActive("pulse_capacitor");
    const max = maxHealth(), key = `${Math.ceil(hp)}|${max}|${Math.floor(energy * 3)}|${state.items.med_patch || 0}|${guarding}|${pulseOn}`;
    if (key === lastWristKey) return; lastWristKey = key;
    const c = wctx; c.clearRect(0, 0, 512, 160);
    c.fillStyle = "rgba(5,10,22,0.88)"; c.beginPath(); c.roundRect(4, 4, 504, 152, 22); c.fill();
    c.strokeStyle = guarding ? "#9fe9ff" : "#5ff5e8"; c.lineWidth = 4; c.stroke();
    const f = Math.max(0, hp / max);
    c.fillStyle = "#1c2433"; c.fillRect(24, 26, 464, 38);
    c.fillStyle = f > 0.5 ? "#6aff9e" : f > 0.25 ? "#ffcf4a" : "#ff3a4a"; c.fillRect(24, 26, 464 * f, 38);
    c.fillStyle = "#fff"; c.font = "bold 28px Arial"; c.textBaseline = "middle"; c.fillText(`HP ${Math.ceil(hp)} / ${max}`, 34, 46);
    if (pulseOn) {
      for (let i = 0; i < 3; i++) { c.fillStyle = energy * 3 >= i + 1 ? "#38f0e6" : "#1c3a44"; c.fillRect(24 + i * 92, 86, 84, 44); }
      c.fillStyle = "#9fe9ff"; c.font = "bold 22px Arial"; c.fillText("PULSE", 310, 108);
    } else { c.fillStyle = "#6f82a0"; c.font = "bold 22px Arial"; c.fillText(guarding ? "GUARDING" : "FISTS", 34, 108); }
    c.fillStyle = "#ff8ad8"; c.font = "bold 26px Arial"; c.fillText(`✚ ${state.items.med_patch || 0}`, 412, 108);
    wristTex.needsUpdate = true;
  }
  // Worn like a watch on the left forearm: attached to the controller (not the
  // mirrored hand model), lying on top of the wrist, reading along the arm.
  const watchQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
  function attachWrist(handObject, controller) {
    const host = controller || handObject;
    if (wristParent === host) return;
    wristParent = host;
    host.add(wrist);
    if (controller) { wrist.position.set(0, 0.035, 0.07); wrist.quaternion.copy(watchQ); }
    else { wrist.position.set(0, -0.12, 0.05); wrist.rotation.set(-0.3, 0, 0); }
  }

  // Edge Fins: a hard-light blade on the back of each wrist, shown while you make a fist.
  const bladeMat = new THREE.MeshBasicMaterial({ color: 0xff4fd8, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const bladeGeo = (() => { const sh = new THREE.Shape(); sh.moveTo(-0.012, 0); sh.lineTo(0.012, 0); sh.lineTo(0.004, 0.42); sh.lineTo(-0.004, 0.46); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.006, bevelEnabled: false }); g.translate(0, 0, -0.003); return g; })();
  function bladeFor(hand) {
    if (!hand.userData.blade) {
      const b = new THREE.Group();
      const m = new THREE.Mesh(bladeGeo, bladeMat); b.add(m);
      const g = halo(0xff4fd8, 0.18); g.position.y = 0.2; g.scale.set(0.12, 0.5, 1); b.add(g);
      b.position.set(0, 0.02, 0.05); b.visible = false; hand.add(b);
      hand.userData.blade = b;
    }
    return hand.userData.blade;
  }
  // Chrono Spike: cyan wash over your view while time is slowed.
  const tintMat = new THREE.MeshBasicMaterial({ color: 0x38f0e6, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false, toneMapped: false, map: vigTex });
  const tint = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), tintMat);
  tint.position.z = -0.31; tint.renderOrder = 9989; tint.visible = false; camera.add(tint);
  let chronoT = 0, chronoCd = 0;
  const CHRONO_TIME = 20, CHRONO_COOLDOWN = 5, CHRONO_SCALE = 0.05;      // the world runs at 5% speed: almost frozen, still moving
  // Effect 1: a shockwave sphere that ripples out from you (and back in when time resumes).
  const waveMat = new THREE.MeshBasicMaterial({ color: 0x7ffcff, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, wireframe: true, toneMapped: false });
  const wave = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 3), waveMat);
  wave.visible = false; root.add(wave);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x38f0e6, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 64), ringMat);
  ring.rotation.x = -Math.PI / 2; ring.visible = false; root.add(ring);
  let waveT = -1, waveOut = true;
  function startWave(out) { waveT = 0; waveOut = out; head.setFromMatrixPosition(camera.matrixWorld); wave.position.copy(head); ring.position.set(head.x, player.position.y + 0.05, head.z); }
  // Effect 2: scanlines + a cyan/magenta "chromatic" edge over your view while slowed.
  const scanTex = (() => { const c = document.createElement("canvas"); c.width = 4; c.height = 256; const x = c.getContext("2d");
    for (let y = 0; y < 256; y += 4) { x.fillStyle = "rgba(160,255,250,0.55)"; x.fillRect(0, y, 4, 1); } const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(60, 3); return t; })();
  const scanMat = new THREE.MeshBasicMaterial({ map: scanTex, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false, toneMapped: false, blending: THREE.AdditiveBlending });
  const scan = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), scanMat);
  scan.position.z = -0.305; scan.renderOrder = 9988; scan.visible = false; camera.add(scan);
  const fringeMat = new THREE.MeshBasicMaterial({ map: vigTex, color: 0xff4fd8, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false, toneMapped: false, blending: THREE.AdditiveBlending });
  const fringe = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.25), fringeMat);
  fringe.position.set(0.012, 0, -0.32); fringe.renderOrder = 9987; fringe.visible = false; camera.add(fringe);
  // Effect 3: frozen enemies leave fading cyan afterimages.
  const ghosts = [];
  function updateChronoFx(dt, t) {
    if (waveT >= 0) {
      waveT += dt;
      const k = Math.min(1, waveT / (waveOut ? 0.7 : 0.45));
      const r = waveOut ? 0.3 + k * 22 : 22 * (1 - k) + 0.3;
      wave.scale.setScalar(r); ring.scale.setScalar(r);
      wave.visible = ring.visible = true;
      waveMat.opacity = 0.55 * (1 - k); ringMat.opacity = 0.9 * (1 - k);
      if (k >= 1) { waveT = -1; wave.visible = ring.visible = false; }
    }
    const on = chronoT > 0;
    const ending = on && chronoT < 0.6;
    scanTex.offset.y = (scanTex.offset.y + dt * 0.02) % 1;
    scanMat.opacity = on ? (ending ? 0.08 + Math.random() * 0.12 : 0.1 + Math.sin(t * 3) * 0.02) : Math.max(0, scanMat.opacity - dt * 0.6);
    fringeMat.opacity = on ? 0.32 + Math.sin(t * 2.2) * 0.06 : Math.max(0, fringeMat.opacity - dt * 0.8);
    scan.visible = scanMat.opacity > 0.005; fringe.visible = fringeMat.opacity > 0.005;
    // afterimages: every 0.15 s copy each living enemy's silhouette as a fading hologram
    if (on && (ghostTimer -= dt) <= 0) {
      ghostTimer = 0.15;
      for (const e of enemies) {
        if (e.dead || ghosts.length > 40) continue;
        const g = cloneSkinned(e.group);   // own skeleton, so the afterimage stays frozen in place
        g.traverse(o => { if (o.isMesh || o.isSprite) { o.material = ghostMat.clone(); } });
        root.add(g); ghosts.push({ g, life: 0.9 });
      }
    }
    for (let i = ghosts.length - 1; i >= 0; i--) {
      const gh = ghosts[i]; gh.life -= dt;
      gh.g.traverse(o => { if (o.material) o.material.opacity = Math.max(0, gh.life) * 0.35; });
      if (gh.life <= 0) { root.remove(gh.g); ghosts.splice(i, 1); }
    }
  }
  let ghostTimer = 0;
  const ghostMat = new THREE.MeshBasicMaterial({ color: 0x5ff5ff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  function useChrono() {
    if (!isActive("chrono_spike") || dead) return false;
    if (chronoT > 0) { chronoT = 0.0001; return true; }       // press again to end it early
    if (chronoCd > 0) { game.toast(`Chrono Spike recharging (${Math.ceil(chronoCd)} s)`); return false; }
    chronoT = CHRONO_TIME; chronoCd = 0;
    sfx("chronoOn");
    head.setFromMatrixPosition(camera.matrixWorld); burst(head, 0x38f0e6, 30, 3, 0);
    startWave(true);
    game.toast("CHRONO SPIKE", "objective");
    haptic?.("both", 0.6, 200);
    return true;
  }

  // ── enemies ─────────────────────────────────────────────────────────────
  function makeDrone(type) {
    const g = new THREE.Group();
    const scale = type === "scav" ? 0.16 : 0.22;
    const body = new THREE.Mesh(geo.droneBody, mat.hull); body.scale.set(1, 0.7, 1); g.add(body);
    const eyeMat = new THREE.MeshBasicMaterial({ color: type === "scav" ? 0xffb02e : 0xff3a4a });
    const eye = new THREE.Mesh(geo.eye, eyeMat); eye.position.set(0, 0, 0.85); g.add(eye);
    const ring = new THREE.Mesh(geo.ring, eyeMat); ring.rotation.x = Math.PI / 2; g.add(ring);
    const arm = new THREE.Mesh(geo.arm, mat.trim); g.add(arm);
    const rotors = [];
    for (const s of [-1, 1]) { const r = new THREE.Mesh(geo.rotor, mat.rotor); r.rotation.x = -Math.PI / 2; r.position.set(s * 1.0, 0.18, 0); g.add(r); rotors.push(r); }
    const glow = halo(eyeMat.color.getHex(), 2.4); glow.position.z = 0.85; g.add(glow);
    g.scale.setScalar(scale);
    return { group: g, eyeMat, rotors, glow };
  }
  function makeEnforcer() {
    const model = buildCharacter(ENFORCER_LOOK);
    const rig = model.userData.rig;
    const baton = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.62, 8), mat.baton.clone());
    baton.position.set(0, -0.33, 0.28); baton.rotation.x = Math.PI / 2;
    rig.elbows[1].add(baton);
    const g = new THREE.Group(); g.add(model);
    return { group: g, rig, baton };
  }
  // health bar sprite above enemies
  function makeBar() {
    const c = document.createElement("canvas"); c.width = 128; c.height = 16;
    const t = new THREE.CanvasTexture(c);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false })); s.scale.set(0.6, 0.075, 1);
    s.userData.draw = f => { const x = c.getContext("2d"); x.clearRect(0, 0, 128, 16); x.fillStyle = "rgba(0,0,0,0.6)"; x.fillRect(0, 0, 128, 16); x.fillStyle = f > 0.4 ? "#ff8a3a" : "#ff2a3a"; x.fillRect(2, 2, 124 * f, 12); t.needsUpdate = true; };
    s.visible = false; return s;
  }
  // warning icons above enemies: ? (suspicious), ! (spotted you), ⚠ (about to attack — counter it!)
  const iconMats = {};
  for (const [k, col] of [["?", "#ffcf4a"], ["!", "#ff3a4a"], ["⚠", "#ff3a4a"]]) {
    const c = document.createElement("canvas"); c.width = c.height = 128; const x = c.getContext("2d");
    x.fillStyle = "rgba(0,0,0,0.55)"; x.beginPath(); x.arc(64, 64, 54, 0, Math.PI * 2); x.fill();
    x.strokeStyle = col; x.lineWidth = 8; x.stroke();
    x.fillStyle = col; x.font = "900 76px Arial"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(k, 64, 70);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    iconMats[k] = new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
  }
  function setIcon(e, k) {
    if (e.iconKind === k) return;
    e.iconKind = k; e.icon.visible = !!k;
    if (k) e.icon.material = iconMats[k];
  }
  const punchBoost = () => (state.flags.craft_knuckle ? 1.15 : 1);
  function spawn(type, pos) {
    const def = ENEMY_TYPES[type];
    const e = { type, def, hp: def.hp, pos: pos.clone(), vel: new THREE.Vector3(), state: "idle", t: 0, cooldown: 1 + Math.random() * 2,
      stun: 0, windup: 0, hitCd: [0, 0], dead: false, deadT: 0, phase: Math.random() * 10,
      aware: false, suspicion: 0, spottedT: 0, home: pos.clone(), wanderT: Math.random() * 6 };
    if (type === "enforcer") Object.assign(e, makeEnforcer()); else Object.assign(e, makeDrone(type));
    e.icon = new THREE.Sprite(iconMats["?"]); e.icon.visible = false; e.icon.renderOrder = 50;
    e.icon.scale.setScalar(0.42 / e.group.scale.x);
    e.bar = makeBar(); e.bar.position.y = type === "enforcer" ? 2.25 : 0.55; e.group.add(e.bar);
    if (type !== "enforcer") e.bar.position.y = 2.6;           // drone bars are in the scaled group
    e.icon.position.y = e.bar.position.y + (type === "enforcer" ? 0.35 : 0.9); e.group.add(e.icon);
    e.group.position.copy(pos);
    if (def.hover) e.group.position.y = def.hover;
    root.add(e.group);
    enemies.push(e);
    return e;
  }
  function hitCenter(e, out) {
    out.copy(e.group.position);
    if (e.type === "enforcer") out.y += 1.25;
    return out;
  }
  function damageEnemy(e, amount, dir, { stun = 0, color = 0xffcf4a } = {}) {
    if (e.dead) return;
    e.hp -= amount;
    hitCenter(e, tmp);
    burst(tmp, color, 14 + Math.min(20, amount), 3.5);
    flash(tmp, color, 0.6 + amount * 0.02);
    if (dir) e.vel.addScaledVector(dir, e.type === "enforcer" ? 1.5 : 5);
    e.stun = Math.max(e.stun, stun, e.type === "enforcer" && amount > 22 ? 0.5 : 0);
    e.windup = 0;
    e.bar.visible = true; e.bar.userData.draw(Math.max(0, e.hp / e.def.hp));
    e.state = "chase";
    if (!e.aware) alertEnemy(e);
    if (e.hp <= 0) kill(e);
  }
  function alertEnemy(e) {
    if (e.aware) return;
    if (!enemies.some(o => o !== e && !o.dead && o.aware)) game.toast("SPOTTED! TENKAI SECURITY ALERTED", "warn");
    e.aware = true; e.spottedT = 1.2; e.suspicion = 1;
    sfx("enemyShot");
    for (const o of enemies) if (o !== e && !o.dead && !o.aware && o.group.position.distanceTo(e.group.position) < 10) o.suspicion = Math.max(o.suspicion, 0.85);
  }
  /** Silent takedown on an enemy that hasn't noticed you. */
  function takedown(e, dir) {
    damageEnemy(e, 9999, dir, { color: 0x9fe9ff });
    sfx("punchHeavy");
    game.toast("SILENT TAKEDOWN", "complete");
    game.awardXP?.(2);
  }
  /** Counter: hit an enemy while its warning icon is showing. */
  function isWindingUp(e) {
    if (e.type === "enforcer") return e.windup > 0;
    const d = e.group.position.distanceTo(player.position);
    return e.type === "scav" ? e.cooldown < 0.6 && d < 5 : e.cooldown < 0.6 && d < 18;
  }
  function counter(e, dmg, dir, hand) {
    damageEnemy(e, dmg * 1.6, dir, { stun: 1.6, color: 0xffffff });
    e.cooldown = 2.2;
    sfx("punchHeavy"); sfx("arcHit");
    game.toast("COUNTER!", "credits");
    if (hand) hand.userData?.flash?.(0xffffff, 1.5);
  }
  /** Thrown objects: damage the first enemy within `radius` of `pos`. */
  function hitEnemyAt(pos, radius, dmg, dir) {
    for (const e of enemies) {
      if (e.dead) continue;
      hitCenter(e, tmp);
      const dy = e.type === "enforcer" ? Math.max(0, Math.abs(pos.y - tmp.y) - 0.6) : pos.y - tmp.y;
      if (Math.hypot(pos.x - tmp.x, dy, pos.z - tmp.z) < e.def.radius + radius) {
        if (!e.aware && dmg > 8) { takedown(e, dir); return true; }
        damageEnemy(e, dmg, dir, { stun: 0.8, color: 0xffcf4a }); sfx("punchLight"); return true;
      }
    }
    return false;
  }
  function kill(e) {
    e.dead = true; e.deadT = 0; e.bar.visible = false; setIcon(e, null);
    hitCenter(e, tmp);
    sfx(e.type === "enforcer" ? "enforcerDown" : "droneDown");
    if (e.type === "enforcer") { burst(tmp, 0xff3a4a, 20, 2); }
    else { burst(tmp, 0xffb02e, 40, 6, 2); burst(tmp, 0xffffff, 16, 3); flash(tmp, 0xffcf4a, 2.2); }
    game.give(e.def.reward, "Tenkai salvage");
    game.awardXP?.(XP_REWARDS[e.type] || 1);
  }

  // ── bolts (enemy shots and the player's palm pulse) ─────────────────────
  function fireBolt(from, dir, friendly, damage, speed) {
    const mesh = new THREE.Mesh(friendly ? geo.pulse : geo.bolt, friendly ? mat.pulseBolt : mat.enemyBolt);
    if (friendly) mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const glow = halo(friendly ? 0x5ff5ff : 0xff3a4a, friendly ? 0.55 : 0.7); mesh.add(glow);
    mesh.position.copy(from);
    root.add(mesh);
    bolts.push({ mesh, vel: dir.clone().multiplyScalar(speed), friendly, damage, life: friendly ? 1.4 : 4 });
    sfx(friendly ? "blaster" : "enemyShot");
  }

  // ── player damage, healing, death ───────────────────────────────────────
  function hurt(amount, from) {
    if (dead) return;
    const reduction = guarding ? (isActive("aegis_plating") ? 0.9 : 0.7) : 0;
    const dmg = amount * (1 - reduction);
    hp -= dmg; regenDelay = 6; hurtFlash = Math.min(1, hurtFlash + (guarding ? 0.15 : 0.6));
    haptic?.("both", guarding ? 0.4 : 0.9, guarding ? 60 : 160);
    sfx(guarding ? "block" : "hurt");
    if (guarding) { head.setFromMatrixPosition(camera.matrixWorld); camera.getWorldDirection(tmp); tmp.multiplyScalar(0.45).add(head); burst(tmp, 0x9fe9ff, 18, 2.5, 0); flash(tmp, 0x9fe9ff, 0.9); }
    if (hp <= 0) die();
  }
  function useMedPatch() {
    if (dead) return false;
    if (!(state.items.med_patch > 0)) { game.toast("No med patches. Doc Anaya sells them at Second Skin.", "warn"); return false; }
    if (hp >= maxHealth()) { game.toast("Already at full health."); return false; }
    state.items.med_patch--; saveGame();
    hp = Math.min(maxHealth(), hp + 50);
    head.setFromMatrixPosition(camera.matrixWorld); burst(head.clone().setY(head.y - 0.5), 0x6aff9e, 30, 1.5, 1);
    game.toast("Med patch: +50 HP", "complete");
    sfx("heal");
    haptic?.("left", 0.5, 120);
    return true;
  }
  let deathT = 0, deathStart = 0;
  function die() {
    dead = true; deathT = 0; hp = 0; deathStart = performance.now();
    game.toast("FLATLINED", "warn");
  }
  function updateDeath() {
    deathT = (performance.now() - deathStart) / 1000;    // real time, not frame time
    fade.visible = true; fadeMat.opacity = Math.min(1, deathT / 0.8);
    if (deathT > 1.6 && dead) {
      // Doc patches you up at the edge of the fight; it costs you.
      const lost = Math.floor(state.credits * 0.1);
      state.credits -= lost; saveGame();
      for (const e of enemies) despawn(e);
      enemies.length = 0;
      player.position.copy(city.anchors.docksRespawn || new THREE.Vector3(0, 0, 7));
      hp = maxHealth(); energy = 1; dead = false; deathT = 0;
      for (const z of zones) { z.active = false; z.cooldown = 5; }
      game.toast(`Doc Anaya patched you up. Lost $${lost}.`, "warn");
      revive = 1;
    }
  }
  let revive = 0;
  function despawn(e) { root.remove(e.group); }

  // ── per-frame ───────────────────────────────────────────────────────────
  const prevHand = new Map();          // hand object → previous position in player space
  const handVel = new THREE.Vector3(), handPos = new THREE.Vector3(), localPos = new THREE.Vector3();

  /**
   * hands: [{ side, object (robot hand), grip 0..1, controller }]
   */
  function update(time, dt, hands, { desktop } = {}) {
    if (dt <= 0) return;
    const t = time * 0.001;
    head.setFromMatrixPosition(camera.matrixWorld);
    torso.copy(head); torso.y -= 0.5;

    // particles & flashes
    for (let k = 0; k < PN; k++) {
      if (pLife[k] <= 0) { if (pPos[k * 3 + 1] > -50) pPos[k * 3 + 1] = -100; continue; }
      const pdt = dt * (chronoT > 0 ? CHRONO_SCALE * 3 : 1);
      pLife[k] -= pdt;
      pVel[k * 3 + 1] -= 6 * pdt;
      pPos[k * 3] += pVel[k * 3] * pdt; pPos[k * 3 + 1] += pVel[k * 3 + 1] * pdt; pPos[k * 3 + 2] += pVel[k * 3 + 2] * pdt;
    }
    pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
    for (const f of flashes) if (f.t > 0) { f.t -= dt; f.s.material.opacity = Math.max(0, f.t / 0.18); if (f.t <= 0) f.s.visible = false; }

    // fades & vignette
    if (dead) updateDeath();
    else if (revive > 0) { revive = Math.max(0, revive - dt * 0.8); fadeMat.opacity = revive; fade.visible = revive > 0; }
    hurtFlash = Math.max(0, hurtFlash - dt * 1.8);
    const low = hp / maxHealth() < 0.3 ? 0.18 + Math.sin(t * 5) * 0.08 : 0;
    vigMat.opacity = Math.min(0.9, hurtFlash * 0.8 + low * 2);
    vignette.visible = vigMat.opacity > 0.01;

    // zones: start fights when you walk in
    for (const z of zones) {
      z.cooldown = Math.max(0, (z.cooldown || 0) - dt);
      const inside = z.contains(player.position);
      if (inside && !z.active && z.cooldown <= 0 && !z.cleared) {
        z.active = true; z.enemies = [];
        const pts = z.spawnPoints.filter(p => p.distanceTo(player.position) > 12).sort(() => Math.random() - 0.5);
        z.wave.forEach((type, i) => z.enemies.push(spawn(type, pts[i % pts.length].clone().add(new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5)))));
        game.toast(z.alert, "warn");
      }
      if (z.active && !inside && player.position.distanceTo(z.center) > z.leash) {   // you ran away: they reset
        z.enemies.forEach(e => { if (!e.dead) despawn(e); });
        z.enemies.forEach(e => { const i = enemies.indexOf(e); if (i >= 0) enemies.splice(i, 1); });
        z.active = false; z.cooldown = 8;
      }
      if (z.active && z.enemies.every(e => e.dead)) {
        z.active = false; z.cleared = true; z.cooldown = 60;
        game.toast(z.clearedText, "complete");
        if (z.reward) game.give(z.reward, "area cleared");
        setTimeout(() => { z.cleared = false; }, 60000);       // the area can be fought again later
      }
    }

    // regen & energy
    regenDelay -= dt;
    const inFight = enemies.some(e => !e.dead && e.group.position.distanceTo(player.position) < 25);
    if (regenDelay <= 0 && !inFight) hp = Math.min(maxHealth(), hp + dt * 6);
    energy = Math.min(1, energy + dt * 0.3);

    // ── hands: fists, punches, guard ───────────────────────────────────
    player.updateMatrixWorld();
    let fistsUp = 0;
    const arc = isActive("arc_knuckles");
    for (const h of hands) {
      if (!h.object) continue;
      h.object.getWorldPosition(handPos);
      localPos.copy(handPos); player.worldToLocal(localPos);
      const prev = prevHand.get(h.object);
      if (prev) handVel.subVectors(localPos, prev).divideScalar(dt); else handVel.set(0, 0, 0);
      prevHand.set(h.object, localPos.clone());
      const speed = handVel.length();
      // fist near the face counts toward a guard
      const toHead = handPos.distanceTo(head);
      if (h.grip > 0.6 && toHead < 0.42) fistsUp++;
      if (h.side === "left") attachWrist(h.object, h.controller);
      const blades = isActive("edge_fins") && h.grip > 0.6;
      const bladeObj = bladeFor(h.object);
      if (bladeObj.visible !== blades) sfx(blades ? "bladeOut" : "bladeIn");
      bladeObj.visible = blades;
      if (h.grip < 0.6 || speed < 2.0) continue;
      // world-space punch direction
      const dir = handVel.clone().transformDirection(player.matrixWorld);
      for (const e of enemies) {
        if (e.dead) continue;
        const si = h.side === "left" ? 0 : 1;
        if (e.hitCd[si] > 0) continue;
        hitCenter(e, tmp);
        const reach = e.def.radius + 0.14 + (e.type === "enforcer" ? 0.15 : 0) + (blades ? 0.3 : 0);
        const dy = e.type === "enforcer" ? Math.max(0, Math.abs(handPos.y - tmp.y) - 0.45) : 0;   // tall hit capsule for people
        tmp2.set(handPos.x - tmp.x, 0, handPos.z - tmp.z);
        if (Math.hypot(tmp2.length(), dy, e.type === "enforcer" ? 0 : handPos.y - tmp.y) > reach) continue;
        const dmg = (6 + Math.min(speed, 7) * 3.2) * (1 + 0.15 * effectiveStrength()) * (arc ? 1.5 : 1) * (blades ? 1.4 : 1) * punchBoost();
        e.hitCd[si] = 0.35;
        if (!e.aware) { takedown(e, dir); haptic?.(h.side, 1, 120); h.object.userData?.flash?.(0x9fe9ff, 1.5); continue; }
        if (isWindingUp(e)) { counter(e, dmg, dir, h.object); haptic?.(h.side, 1, 120); continue; }
        damageEnemy(e, dmg, dir, { stun: arc ? 1.0 : 0.15, color: blades ? 0xff4fd8 : arc ? 0x5ff5ff : 0xffcf4a });
        e.hitCd[si] = 0.35;
        sfx(blades ? "slice" : dmg > 25 ? "punchHeavy" : "punchLight");
        if (arc && !blades) sfx("arcHit");
        haptic?.(h.side, Math.min(1, 0.4 + speed * 0.1), 70);
        h.object.userData?.flash?.(blades ? 0xff4fd8 : arc ? 0x5ff5ff : 0xffcf4a, 1);
      }
      // punch enemy bolts back where they came from
      for (const b of bolts) {
        if (b.friendly || b.mesh.position.distanceTo(handPos) > 0.25) continue;
        b.friendly = true; b.damage = 20; b.life = 2;
        b.vel.copy(dir).normalize().multiplyScalar(14);
        b.mesh.material = mat.pulseBolt; b.mesh.children[0].material.color.set(0x5ff5ff);
        burst(handPos, 0x9fe9ff, 12, 2.5);
        haptic?.(h.side, 0.7, 60);
        h.object.userData?.flash?.(0x9fe9ff, 1);
      }
    }
    for (const e of enemies) { e.hitCd[0] -= dt; e.hitCd[1] -= dt; }
    guarding = desktop ? !!desktop.guard : fistsUp >= 2;

    // Chrono Spike: enemies and their shots run at quarter speed.
    const wasSlow = chronoT > 0;
    chronoT = Math.max(0, chronoT - dt); chronoCd = Math.max(0, chronoCd - dt);
    if (wasSlow && chronoT <= 0) { startWave(false); haptic?.("both", 0.4, 120); sfx("chronoOff"); chronoCd = CHRONO_COOLDOWN; }   // time snaps back
    const edt = dt * (chronoT > 0 ? CHRONO_SCALE : 1);
    tintMat.opacity = chronoT > 0 ? 0.26 + Math.sin(t * 6) * 0.04 : Math.max(0, tintMat.opacity - dt);
    updateChronoFx(dt, t);
    tint.visible = tintMat.opacity > 0.01;
    // ── enemies think and move ─────────────────────────────────────────
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      const g = e.group;
      if (e.dead) {
        e.deadT += edt;
        if (e.type === "enforcer") { g.rotation.x = Math.max(-Math.PI / 2, -e.deadT * 3); g.position.y = Math.min(0, -(e.deadT - 1.5) * 0.6); }
        else { e.vel.y -= 9.8 * edt; g.position.addScaledVector(e.vel, edt); g.rotation.z += edt * 6; if (g.position.y < 0.15) { g.position.y = 0.15; e.vel.set(0, 0, 0); } }
        if (e.deadT > 3.5) { despawn(e); enemies.splice(i, 1); }
        continue;
      }
      e.t += edt; e.cooldown -= edt;
      const toP = tmp.subVectors(player.position, g.position); toP.y = 0;
      const dist = toP.length(); toP.normalize();
      // knockback decays
      g.position.addScaledVector(e.vel, edt); e.vel.multiplyScalar(Math.exp(-4 * edt));
      if (e.stun > 0) { e.stun -= edt; g.rotation.z = Math.sin(t * 30) * 0.15; continue; } else g.rotation.z = 0;
      if (dist > 30 || dead) continue;
      // ── awareness: unaware enemies wander near home; spot you up close or in front of them
      if (!e.aware) {
        const fwdX = Math.sin(g.rotation.y), fwdZ = Math.cos(g.rotation.y);
        const facing = fwdX * toP.x + fwdZ * toP.z;
        const sees = dist < 3.2 || (dist < 13 && facing > 0.45);
        e.suspicion = Math.max(0, e.suspicion + (sees ? (dist < 3.2 ? 1.6 : 0.9 - dist * 0.04) : -0.25) * edt);
        if (e.suspicion >= 1) alertEnemy(e);
        else {
          setIcon(e, e.suspicion > 0.12 ? "?" : null);
          e.wanderT -= edt;
          if (e.wanderT <= 0) { e.wanderT = 3 + Math.random() * 4; e.wanderYaw = Math.random() * Math.PI * 2; }
          const back = tmp2.subVectors(e.home, g.position).setY(0);
          const wantYaw = e.suspicion > 0.3 ? Math.atan2(toP.x, toP.z) : back.length() > 4 ? Math.atan2(back.x, back.z) : (e.wanderYaw ?? g.rotation.y);
          g.rotation.y += Math.atan2(Math.sin(wantYaw - g.rotation.y), Math.cos(wantYaw - g.rotation.y)) * (1 - Math.exp(-2.5 * edt));
          if (e.suspicion < 0.3) step(e, tmp2.set(Math.sin(g.rotation.y), 0, Math.cos(g.rotation.y)), e.def.speed * 0.25 * edt);
          if (e.def.hover) g.position.y = e.def.hover + Math.sin(t * 2 + e.phase) * 0.12;
          if (e.type === "enforcer") { const ph = t * 4 + e.phase, sw = Math.sin(ph) * 0.25 * (e.suspicion < 0.3 ? 1 : 0); e.rig.hips[0].rotation.x = sw; e.rig.hips[1].rotation.x = -sw; e.rig.arms[0].rotation.x = -sw * 0.5; }
          continue;
        }
      }
      e.spottedT = Math.max(0, e.spottedT - edt);
      setIcon(e, e.spottedT > 0 ? "!" : isWindingUp(e) && (e.type !== "sentry" || e.cooldown < 0.6) ? "⚠" : null);
      const faceYaw = Math.atan2(toP.x, toP.z);
      g.rotation.y += Math.atan2(Math.sin(faceYaw - g.rotation.y), Math.cos(faceYaw - g.rotation.y)) * (1 - Math.exp(-6 * edt));

      if (e.type === "scav") {
        // rush in, ram, back off
        const want = e.cooldown > 0 ? 3.5 : 0.5;
        const move = dist > want ? 1 : -0.6;
        step(e, toP, e.def.speed * move * edt);
        g.position.y = e.def.hover + Math.sin(t * 4 + e.phase) * 0.1 + (head.y - 1.65) * 0.3;
        if (dist < 0.9 && e.cooldown <= 0 && Math.abs(g.position.y - torso.y) < 0.9) { hurt(e.def.damage); e.cooldown = 1.6; e.vel.addScaledVector(toP, -6); burst(g.position, 0xffb02e, 10, 2); }
      } else if (e.type === "sentry") {
        // keep 5-8 m away, strafe, shoot slow bolts with a visible charge-up
        const strafe = new THREE.Vector3(-toP.z, 0, toP.x).multiplyScalar(Math.sin(t * 0.7 + e.phase));
        const dir = dist < 5 ? toP.clone().negate() : dist > 8 ? toP.clone() : strafe;
        step(e, dir, e.def.speed * edt);
        g.position.y = e.def.hover + Math.sin(t * 2 + e.phase) * 0.15;
        const charging = e.cooldown < 0.6 && dist < 18;
        e.eyeMat.color.setHex(charging ? 0xffffff : 0xff3a4a); e.glow.scale.setScalar(charging ? 3.4 : 2.4);
        if (e.cooldown <= 0 && dist < 18) {
          tmp2.copy(head).sub(g.position).normalize();
          fireBolt(g.position.clone().addScaledVector(tmp2, 0.3), tmp2, false, e.def.damage, 7);
          e.cooldown = 2.2 + Math.random();
        }
      } else {
        // enforcer: walk up, wind up the baton (glows), swing
        const r = e.rig;
        if (e.windup > 0) {
          e.windup -= edt;
          r.arms[1].rotation.x = -2.4 * (1 - e.windup / 0.7); r.elbows[1].rotation.x = -0.8;
          e.baton.material.color.setHex(Math.sin(t * 40) > 0 ? 0xffffff : 0xff3a4a);
          if (e.windup <= 0) {
            r.arms[1].rotation.x = 0.6;
            if (dist < 1.7) hurt(e.def.damage);
            e.cooldown = 1.4;
            e.baton.material.color.setHex(0xff3a4a);
          }
        } else if (dist > 1.3) {
          step(e, toP, e.def.speed * edt);
          const ph = t * 7.5 + e.phase, sw = Math.sin(ph) * 0.45;
          r.hips[0].rotation.x = sw; r.hips[1].rotation.x = -sw;
          r.knees[0].rotation.x = Math.max(0, -sw) * 0.8; r.knees[1].rotation.x = Math.max(0, sw) * 0.8;
          r.arms[0].rotation.x = -sw * 0.6; r.arms[1].rotation.x = sw * 0.4 - 0.3;
        } else {
          r.hips[0].rotation.x = r.hips[1].rotation.x = 0; r.knees[0].rotation.x = r.knees[1].rotation.x = 0.1;
          if (e.cooldown <= 0) e.windup = 0.7;
        }
      }
      // keep enemies from stacking up
      for (const o of enemies) if (o !== e && !o.dead) { const d = g.position.distanceTo(o.group.position); if (d < 0.9 && d > 0.001) g.position.addScaledVector(tmp2.subVectors(g.position, o.group.position).setY(0).normalize(), (0.9 - d) * 0.5); }
    }

    // ── bolts ─────────────────────────────────────────────────────────
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      const bdt = b.friendly ? dt : edt;
      b.life -= bdt;
      b.mesh.position.addScaledVector(b.vel, bdt);
      let hit = b.life <= 0 || b.mesh.position.y < 0.05 || city.collides(b.mesh.position.x, b.mesh.position.z, b.mesh.position.y - 1, 0.05);
      if (!hit && b.friendly) {
        for (const e of enemies) {
          if (e.dead) continue;
          hitCenter(e, tmp);
          const r = e.def.radius + 0.12 + (e.type === "enforcer" ? 0.2 : 0);
          const dy = e.type === "enforcer" ? Math.max(0, Math.abs(b.mesh.position.y - tmp.y) - 0.5) : b.mesh.position.y - tmp.y;
          if (Math.hypot(b.mesh.position.x - tmp.x, dy, b.mesh.position.z - tmp.z) < r) { damageEnemy(e, b.damage, b.vel.clone().normalize(), { stun: 0.25, color: 0x5ff5ff }); hit = true; break; }
        }
      } else if (!hit && !dead) {
        if (b.mesh.position.distanceTo(head) < 0.28 || b.mesh.position.distanceTo(torso) < 0.32) { hurt(b.damage); hit = true; }
      }
      if (hit) { burst(b.mesh.position, b.friendly ? 0x5ff5ff : 0xff4a5a, 10, 2); root.remove(b.mesh); bolts.splice(i, 1); }
    }

    // rotors spin
    for (const e of enemies) if (e.rotors) for (const r of e.rotors) r.rotation.z += dt * 40;

    // wrist HUD only while relevant (in a fight, hurt, or recently used)
    wrist.visible = !!wristParent && (inFight || hp < maxHealth() - 0.5);
    if (wrist.visible) drawWrist();
  }
  function step(e, dir, amount) {
    const g = e.group.position;
    const nx = g.x + dir.x * amount, nz = g.z + dir.z * amount;
    const ground = e.type === "enforcer";
    if (!ground || !city.collides(nx, g.z, 0, 0.35)) g.x = nx;
    if (!ground || !city.collides(g.x, nz, 0, 0.35)) g.z = nz;
  }

  /** Palm pulse from a controller (or the camera on PC). Returns true if fired. */
  let lockedHintAt = 0;
  function firePulse(originObject, forwardFrom) {
    // The palm blast is cyberware: fists only until you buy the Pulse Emitter.
    if (!isActive("pulse_capacitor")) {
      if (performance.now() - lockedHintAt > 15000 && enemies.some(e => !e.dead)) { lockedHintAt = performance.now(); game.toast("Palm blast locked: buy the Pulse Emitter from Doc Anaya.", "warn"); }
      return false;
    }
    if (dead || energy < 0.33) { if (!dead) game.toast("Pulse recharging…"); return false; }
    energy -= 0.33;
    const from = new THREE.Vector3(), dir = new THREE.Vector3(0, 0, -1);
    originObject.getWorldPosition(from);
    dir.applyQuaternion((forwardFrom || originObject).getWorldQuaternion(new THREE.Quaternion())).normalize();
    from.addScaledVector(dir, 0.12);
    fireBolt(from, dir, true, 16, 22);
    originObject.userData?.flash?.(0x5ff5ff, 1.2);
    flash(from, 0x5ff5ff, 0.5);
    return true;
  }
  /** PC punch: a short jab straight ahead from the camera. */
  function desktopPunch() {
    head.setFromMatrixPosition(camera.matrixWorld);
    camera.getWorldDirection(tmp);
    const at = head.clone().addScaledVector(tmp, 1.0);
    for (const e of enemies) {
      if (e.dead) continue;
      hitCenter(e, tmp2);
      if (tmp2.distanceTo(at) < e.def.radius + 0.7) {
        const dmg = 16 * (1 + 0.15 * effectiveStrength()) * (isActive("arc_knuckles") ? 1.5 : 1) * punchBoost();
        if (!e.aware) takedown(e, tmp.clone());
        else if (isWindingUp(e)) counter(e, dmg, tmp.clone());
        else damageEnemy(e, dmg, tmp.clone(), { stun: 0.3 });
        return true;
      }
    }
    return false;
  }

  return {
    update, firePulse, desktopPunch, useMedPatch, spawn, useChrono, hitEnemyAt, alertEnemy,
    get hp() { return hp; }, get energy() { return energy; }, get guarding() { return guarding; }, get dead() { return dead; },
    get timeScale() { return chronoT > 0 ? CHRONO_SCALE : 1; },
    get inFight() { return enemies.some(e => !e.dead && e.group.position.distanceTo(player.position) < 25); },
    enemies, resetHealth() { hp = maxHealth(); }, debugHurt(n) { hurt(n); }, heal(n) { if (!dead) hp = Math.min(maxHealth(), hp + n); }
  };
}

/** An encounter zone: walk in and a wave spawns. */
export function makeZone({ min, max, wave, spawnPoints, alert, clearedText, reward = 0, leash = 45 }) {
  const center = new THREE.Vector3((min.x + max.x) / 2, 0, (min.z + max.z) / 2);
  return { wave, spawnPoints, alert, clearedText, reward, leash, center, active: false, cleared: false, cooldown: 0, enemies: [],
    contains: p => p.x >= min.x && p.x <= max.x && p.z >= min.z && p.z <= max.z };
}
