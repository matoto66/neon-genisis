// NEON GENESIS — holo map (wrist menu MAP tab / PC map panel) + fast travel.
// Travel points unlock once you've been near them.
import * as THREE from "three";
import { state, saveGame } from "./state.js";

export const TRAVEL = [
  { id: "mika", name: "Mika's Repair", x: -6.5, y: 0, z: -4.8, always: true },
  { id: "sato", name: "Sato's Noodles", x: 14.5, y: 0, z: 10 },
  { id: "roof", name: "Capsule Hotel Roof", x: -14.5, y: 19, z: -11 },
  { id: "junction", name: "Ring Road Junction", x: 0, y: 0, z: -46 },
  { id: "clinic", name: "Second Skin Clinic", x: 8.5, y: 0, z: -75 },
  { id: "plaza", name: "Spire Plaza", x: 0, y: 0, z: -118 },
  { id: "docks", name: "Port 7 Gate", x: 41, y: 0, z: -46 }
];
const visited = () => (state.flags.travel ||= {});
export const isUnlocked = t => t.always || !!visited()[t.id];

/** Unlock travel points you walk past. Returns the newly found point, if any. */
export function discover(pos) {
  for (const t of TRAVEL) {
    if (isUnlocked(t)) continue;
    if (Math.hypot(pos.x - t.x, (pos.y - t.y) * 0.5, pos.z - t.z) < 10) { visited()[t.id] = true; saveGame(); return t; }
  }
  return null;
}

// World area shown on the map (x east, z south; north = -z is up).
const B = { minX: -50, maxX: 140, minZ: -150, maxZ: 48 };
const DISTRICTS = [
  { name: "THE SUMP", color: "rgba(255,140,60,0.16)", x0: -45, x1: 45, z0: -36, z1: 42 },
  { name: "RING ROAD", color: "rgba(255,79,163,0.14)", x0: -45, x1: 45, z0: -56, z1: -36 },
  { name: "NEON MILE", color: "rgba(178,76,255,0.16)", x0: -45, x1: 45, z0: -115, z1: -56 },
  { name: "SPIRE PLAZA", color: "rgba(56,240,230,0.14)", x0: -30, x1: 30, z0: -141, z1: -115 },
  { name: "THE DOCKS", color: "rgba(255,58,74,0.13)", x0: 46, x1: 137, z0: -81, z1: -11 }
];
const ROADS = [[-7.5, 7.5, -115, 42], [-45, 46, -52, -40], [46, 112, -52, -40], [-30, 30, -141, -115]];

export function drawMap(c, x0, y0, w, h, { player, yaw, objective, hover = -1 }) {
  const s = Math.min(w / (B.maxX - B.minX), h / (B.maxZ - B.minZ));
  const ox = x0 + (w - (B.maxX - B.minX) * s) / 2, oy = y0 + (h - (B.maxZ - B.minZ) * s) / 2;
  const P = (x, z) => [ox + (x - B.minX) * s, oy + (z - B.minZ) * s];
  c.save();
  c.fillStyle = "#050a16"; c.fillRect(x0, y0, w, h);
  // grid
  c.strokeStyle = "rgba(95,245,232,0.07)"; c.lineWidth = 1;
  for (let gx = -40; gx <= 140; gx += 20) { const [a] = P(gx, 0); c.beginPath(); c.moveTo(a, y0); c.lineTo(a, y0 + h); c.stroke(); }
  for (let gz = -140; gz <= 40; gz += 20) { const [, b] = P(0, gz); c.beginPath(); c.moveTo(x0, b); c.lineTo(x0 + w, b); c.stroke(); }
  // water east of the docks
  { const [a, b] = P(112, -150), [d, e] = P(140, 48); c.fillStyle = "rgba(30,70,120,0.35)"; c.fillRect(a, b, d - a, e - b); }
  for (const d of DISTRICTS) {
    const [a, b] = P(d.x0, d.z0), [e, f] = P(d.x1, d.z1);
    c.fillStyle = d.color; c.fillRect(a, b, e - a, f - b);
    c.fillStyle = "rgba(220,231,255,0.55)"; c.font = "bold 13px Arial"; c.textAlign = "left"; c.fillText(d.name, a + 4, b + 15);
  }
  c.fillStyle = "rgba(160,170,190,0.45)";
  for (const [a0, a1, b0, b1] of ROADS) { const [a, b] = P(a0, b0), [e, f] = P(a1, b1); c.fillRect(a, b, e - a, f - b); }
  // travel points
  TRAVEL.forEach((t, i) => {
    const [a, b] = P(t.x, t.z), on = isUnlocked(t);
    c.beginPath(); c.arc(a, b, i === hover ? 9 : 6, 0, Math.PI * 2);
    c.fillStyle = on ? (i === hover ? "#ffffff" : "#5ff5e8") : "#3a4458"; c.fill();
    c.strokeStyle = "#050a16"; c.lineWidth = 2; c.stroke();
  });
  // objective
  if (objective) {
    const [a, b] = P(objective.x, objective.z);
    c.fillStyle = "#ffcf4a"; c.beginPath();
    for (let k = 0; k < 10; k++) { const r = k % 2 ? 4 : 10, ang = -Math.PI / 2 + k * Math.PI / 5; c.lineTo(a + Math.cos(ang) * r, b + Math.sin(ang) * r); }
    c.closePath(); c.fill();
  }
  // you
  if (player) {
    const [a, b] = P(THREE.MathUtils.clamp(player.x, B.minX, B.maxX), THREE.MathUtils.clamp(player.z, B.minZ, B.maxZ));
    c.translate(a, b); c.rotate(-yaw);
    c.fillStyle = "#ff4fa3"; c.beginPath(); c.moveTo(0, -12); c.lineTo(8, 9); c.lineTo(0, 4); c.lineTo(-8, 9); c.closePath(); c.fill();
    c.strokeStyle = "#ffffff"; c.lineWidth = 2; c.stroke();
  }
  c.restore();
  c.strokeStyle = "#33445f"; c.lineWidth = 3; c.strokeRect(x0, y0, w, h);
}
