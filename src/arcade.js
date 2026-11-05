// NEON GENESIS — "GRID DEFENDER", a playable arcade cabinet outside the Sump arcade.
// VR: left stick moves, trigger fires, pull the stick back (or step away) to quit.
// PC: A/D move, Space or click fires, F/Esc quits.
import * as THREE from "three";
import { state, saveGame } from "./state.js";

const W = 256, H = 320;

export function createArcade({ root, scene, game, audio, player, camera, position, yaw }) {
  // ── the cabinet ────────────────────────────────────────────────────────
  const cab = new THREE.Group(); cab.name = "ARCADE_CABINET";
  cab.position.copy(position); cab.rotation.y = yaw; root.add(cab);
  const shell = new THREE.MeshStandardMaterial({ color: 0x1a1030, roughness: 0.5, metalness: 0.4 });
  const neonA = new THREE.MeshBasicMaterial({ color: 0xff4fa3 }), neonB = new THREE.MeshBasicMaterial({ color: 0x38f0e6 });
  const add = (geo, m, x, y, z, rx = 0) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.rotation.x = rx; cab.add(me); return me; };
  add(new THREE.BoxGeometry(0.8, 1.9, 0.75), shell, 0, 0.95, -0.1);
  add(new THREE.BoxGeometry(0.84, 0.32, 0.5), shell, 0, 1.02, 0.36, -0.35);                // control deck
  add(new THREE.BoxGeometry(0.84, 0.26, 0.2), neonA, 0, 1.95, 0.2);                       // marquee
  for (const sx of [-0.42, 0.42]) add(new THREE.BoxGeometry(0.02, 1.9, 0.02), neonB, sx, 0.95, 0.28);
  add(new THREE.CylinderGeometry(0.015, 0.015, 0.1, 8), new THREE.MeshStandardMaterial({ color: 0x222222 }), -0.15, 1.2, 0.45);
  add(new THREE.SphereGeometry(0.035, 10, 8), neonA, -0.15, 1.26, 0.45);
  for (const [bx, m] of [[0.08, neonB], [0.2, neonA]]) add(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 12), m, bx, 1.17, 0.43, -0.35);
  // marquee text
  { const c = document.createElement("canvas"); c.width = 512; c.height = 128; const x = c.getContext("2d");
    x.fillStyle = "#12061e"; x.fillRect(0, 0, 512, 128); x.fillStyle = "#ffffff"; x.font = "900 62px Arial"; x.textAlign = "center"; x.fillText("GRID DEFENDER", 256, 86);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    add(new THREE.PlaneGeometry(0.78, 0.2), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }), 0, 1.95, 0.305); }
  // screen
  const sc = document.createElement("canvas"); sc.width = W; sc.height = H;
  const ctx = sc.getContext("2d");
  const tex = new THREE.CanvasTexture(sc); tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter;
  const screen = add(new THREE.PlaneGeometry(0.6, 0.75), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), 0, 1.5, 0.285, -0.12);
  const hit = add(new THREE.BoxGeometry(0.9, 2, 0.9), new THREE.MeshBasicMaterial({ visible: false }), 0, 1, 0.1);

  // ── game state ─────────────────────────────────────────────────────────
  let active = false, g = null, attract = 0, quitHold = 0;
  const high = () => state.flags.arcadeHigh || 0;
  function newGame() { g = { x: W / 2, shots: [], foes: [], bursts: [], score: 0, lives: 3, t: 0, spawn: 1, cool: 0, over: 0, level: 1 }; }
  function start() {
    if (active) return;
    active = true; newGame(); audio.play("arcade");
    game.toast("GRID DEFENDER · stick/A-D to move, trigger/Space to fire, pull stick back or F to quit", "objective");
  }
  function stop() {
    if (!active) return;
    active = false;
    if (g && g.score > 0) finish();
    g = null;
  }
  function finish() {
    const best = g.score > high();
    if (best) { state.flags.arcadeHigh = g.score; saveGame(); }
    const pay = Math.min(100, Math.floor(g.score / 50) * 5);
    if (pay > 0) game.give(pay, best ? "new arcade high score" : "arcade tokens");
    else if (best) game.toast(`New high score: ${g.score}`, "credits");
  }
  game.addInteractable({ id: "arcade", kind: "arcade", object: cab, hit, range: 2.6, label: "GRID DEFENDER", verb: "PLAY", alwaysVisible: true,
    enabled: () => !active, use: start });

  // ── simulation ─────────────────────────────────────────────────────────
  function step(dt, input) {
    if (!g) return;
    g.t += dt;
    if (g.over > 0) { g.over -= dt; if (g.over <= 0) { finish(); newGame(); } return; }
    g.x = THREE.MathUtils.clamp(g.x + input.x * 170 * dt, 14, W - 14);
    g.cool -= dt;
    if (input.fire && g.cool <= 0) { g.shots.push({ x: g.x, y: H - 40 }); g.cool = 0.22; audio.play("arcade"); }
    g.spawn -= dt;
    g.level = 1 + Math.floor(g.score / 200);
    if (g.spawn <= 0) { g.spawn = Math.max(0.35, 1.2 - g.level * 0.1); g.foes.push({ x: 20 + Math.random() * (W - 40), y: -10, vx: (Math.random() - 0.5) * 40, vy: 28 + g.level * 7 + Math.random() * 15, kind: Math.random() < 0.2 ? 1 : 0 }); }
    for (const s of g.shots) s.y -= 300 * dt;
    g.shots = g.shots.filter(s => s.y > -10);
    for (const f of g.foes) {
      f.y += f.vy * dt; f.x += f.vx * dt; if (f.x < 12 || f.x > W - 12) f.vx *= -1;
      for (const s of g.shots) if (!s.dead && Math.abs(s.x - f.x) < 11 && Math.abs(s.y - f.y) < 11) { s.dead = true; f.dead = true; g.score += f.kind ? 50 : 20; g.bursts.push({ x: f.x, y: f.y, t: 0, c: f.kind ? "#ffcf4a" : "#ff4fa3" }); audio.play("arcadeHit"); }
      if (!f.dead && f.y > H - 30) { f.dead = true; g.lives--; g.bursts.push({ x: f.x, y: H - 30, t: 0, c: "#ff3a4a" }); audio.play("thud"); if (g.lives <= 0) { g.over = 3; audio.play("arcadeOver"); } }
    }
    g.foes = g.foes.filter(f => !f.dead); g.shots = g.shots.filter(s => !s.dead);
    for (const b of g.bursts) b.t += dt; g.bursts = g.bursts.filter(b => b.t < 0.4);
  }
  function draw(t) {
    ctx.fillStyle = "#04020c"; ctx.fillRect(0, 0, W, H);
    // perspective grid floor
    ctx.strokeStyle = "rgba(178,76,255,0.35)"; ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) { const y = H - 30 + ((i + (t * 2) % 1) ** 2) * 2; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    for (let i = -6; i <= 6; i++) { ctx.beginPath(); ctx.moveTo(W / 2 + i * 12, H - 30); ctx.lineTo(W / 2 + i * 50, H); ctx.stroke(); }
    // stars
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    for (let i = 0; i < 30; i++) ctx.fillRect((i * 97) % W, ((i * 53 + t * 20 * (1 + i % 3)) % (H - 40)), 1, 1);
    ctx.textAlign = "center";
    if (!g) {
      attract += 0.016;
      ctx.fillStyle = "#ff4fa3"; ctx.font = "bold 26px monospace"; ctx.fillText("GRID", W / 2, 110); ctx.fillStyle = "#38f0e6"; ctx.fillText("DEFENDER", W / 2, 140);
      if (Math.sin(t * 4) > 0) { ctx.fillStyle = "#ffffff"; ctx.font = "bold 14px monospace"; ctx.fillText("INSERT CHROME", W / 2, 200); }
      ctx.fillStyle = "#ffcf4a"; ctx.font = "12px monospace"; ctx.fillText(`HIGH ${high()}`, W / 2, 240);
    } else {
      for (const f of g.foes) { ctx.fillStyle = f.kind ? "#ffcf4a" : "#ff4fa3"; ctx.fillRect(f.x - 8, f.y - 4, 16, 8); ctx.fillRect(f.x - 3, f.y - 8, 6, 16); ctx.fillStyle = "#fff"; ctx.fillRect(f.x - 1, f.y - 1, 2, 2); }
      ctx.fillStyle = "#38f0e6"; for (const s of g.shots) ctx.fillRect(s.x - 1, s.y - 6, 2, 10);
      for (const b of g.bursts) { ctx.strokeStyle = b.c; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(b.x, b.y, 4 + b.t * 50, 0, Math.PI * 2); ctx.stroke(); }
      // ship
      ctx.fillStyle = "#38f0e6"; ctx.beginPath(); ctx.moveTo(g.x, H - 46); ctx.lineTo(g.x + 11, H - 30); ctx.lineTo(g.x - 11, H - 30); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#ffffff"; ctx.font = "bold 14px monospace"; ctx.textAlign = "left"; ctx.fillText(`${g.score}`, 8, 18);
      ctx.textAlign = "right"; ctx.fillStyle = "#ff4fa3"; ctx.fillText("♥".repeat(Math.max(0, g.lives)), W - 8, 18);
      ctx.textAlign = "center"; ctx.fillStyle = "#ffcf4a"; ctx.font = "11px monospace"; ctx.fillText(`HIGH ${Math.max(high(), g.score)}`, W / 2, 18);
      if (g.over > 0) { ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(0, 120, W, 80); ctx.fillStyle = "#ff3a4a"; ctx.font = "bold 24px monospace"; ctx.fillText("GAME OVER", W / 2, 160); ctx.fillStyle = "#fff"; ctx.font = "12px monospace"; ctx.fillText("payout at the counter", W / 2, 182); }
    }
    // scanlines
    ctx.fillStyle = "rgba(0,0,0,0.25)"; for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
    tex.needsUpdate = true;
  }

  let drawT = 0;
  const v = new THREE.Vector3();
  function update(time, dt, input) {
    const t = time * 0.001;
    // only redraw when someone's nearby
    const near = player.position.distanceTo(cab.position) < 14;
    if (active) {
      step(dt, input);
      // quit: pull the stick back, or walk/lean away from the cabinet
      if (input.back) quitHold += dt; else quitHold = 0;
      camera.getWorldPosition(v);
      if (quitHold > 0.5 || input.quit || Math.hypot(v.x - cab.position.x, v.z - cab.position.z) > 2.6) { stop(); audio.play("close"); }
    }
    if (near && (drawT -= dt) <= 0) { drawT = active ? 1 / 30 : 0.25; draw(t); }
  }
  return { update, start, stop, get active() { return active; }, cabinet: cab };
}
