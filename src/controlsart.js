// NEON GENESIS — Quest controller diagram (wrist menu CONTROLS tab + PC settings).
// Draws both Touch controllers with every button labelled, plus the
// hand-gesture moves (backpack, hip med patch, scan…) underneath.

const LEFT = [
  ["stick", "Thumbstick", "Move · click = Sprint"],
  ["y", "Y", "Wrist menu"],
  ["x", "X", "Med patch"],
  ["trigger", "Trigger", "Interact · Palm blast"],
  ["grip", "Grip", "Make a fist · Grab"]
];
const RIGHT = [
  ["stick", "Thumbstick", "Turn"],
  ["b", "B", "Chrono Spike (press again to end)"],
  ["a", "A", "Jump"],
  ["trigger", "Trigger", "Interact · Palm blast · Tether"],
  ["grip", "Grip", "Make a fist · Grab"]
];
export const GESTURES = [
  ["Punch", "Squeeze grip and swing — faster swing, more damage"],
  ["Guard", "Hold both fists up in front of your face"],
  ["Put in backpack", "Reach behind your shoulder and let go of the item"],
  ["Open backpack", "Reach behind your shoulder and squeeze grip"],
  ["Med patch", "Squeeze grip at your hip, press it to your other arm"],
  ["Eat food", "Hold it up to your mouth"],
  ["Optic Scan", "Hand to the side of your head + pull trigger"],
  ["Pick up / throw", "Grip near something, swing, let go"],
  ["Hover scooter", "Push a Power Cell into its back bay, trigger to ride, A to hop off"]
];

export function drawControllerDiagram(c, x0, y0, w, h, opts = {}) {
  const half = w / 2, top = y0 + 6, ctrlH = Math.min(h * 0.58, 290);
  const accent = opts.accent || "#5ff5e8";
  c.save();
  c.textBaseline = "middle";
  [["LEFT", LEFT, x0, false], ["RIGHT", RIGHT, x0 + half, true]].forEach(([name, items, hx, right]) => {
    const s = ctrlH / 290, cx = hx + 95, cy = top + ctrlH * 0.42 + 26 * s;
    // title
    c.fillStyle = accent; c.font = `bold ${Math.round(18 * s + 4)}px Arial`; c.textAlign = "left";
    c.fillText(`${name} CONTROLLER`, hx + 10, top + 10);
    // tracking ring
    c.strokeStyle = "#7f8aa3"; c.lineWidth = 10 * s;
    c.beginPath(); c.ellipse(cx + (right ? 18 : -18) * s, cy - 70 * s, 62 * s, 40 * s, right ? 0.5 : -0.5, 0, Math.PI * 2); c.stroke();
    // body + face plate
    c.fillStyle = "#26304a"; c.strokeStyle = "#9aa6c0"; c.lineWidth = 3;
    c.beginPath(); c.ellipse(cx, cy - 10 * s, 48 * s, 44 * s, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(cx - 26 * s, cy + 22 * s); c.quadraticCurveTo(cx - 34 * s, cy + 120 * s, cx - 14 * s, cy + 140 * s); c.lineTo(cx + 18 * s, cy + 140 * s); c.quadraticCurveTo(cx + 34 * s, cy + 110 * s, cx + 28 * s, cy + 22 * s); c.closePath(); c.fill(); c.stroke();
    // parts: position of each item on the drawing
    const P = {
      stick: [cx + (right ? -16 : 16) * s, cy - 18 * s, 15 * s],
      y: [cx + (right ? 22 : -22) * s, cy - 30 * s, 10 * s], b: [cx + (right ? 22 : -22) * s, cy - 30 * s, 10 * s],
      x: [cx + (right ? 20 : -20) * s, cy + 2 * s, 10 * s], a: [cx + (right ? 20 : -20) * s, cy + 2 * s, 10 * s],
      trigger: [cx + 4 * s, cy + 46 * s, 9 * s], grip: [cx + (right ? 28 : -28) * s, cy + 92 * s, 10 * s]
    };
    // draw buttons
    for (const [k, [px, py, r]] of Object.entries(P)) {
      if (!items.some(i => i[0] === k)) continue;
      c.fillStyle = k === "stick" ? "#0e1424" : k === "trigger" ? "#ff4fa3" : k === "grip" ? "#ffcf4a" : "#dce7ff";
      c.beginPath(); c.arc(px, py, r, 0, Math.PI * 2); c.fill();
      c.strokeStyle = "#ffffff"; c.lineWidth = 2; c.stroke();
      if (k.length === 1) { c.fillStyle = "#0e1424"; c.font = `bold ${Math.round(12 * s + 3)}px Arial`; c.textAlign = "center"; c.fillText(k.toUpperCase(), px, py + 1); }
    }
    // labels with leader lines
    const lx = hx + 200 * Math.max(0.75, s), lw = half - (lx - hx) - 8;
    items.forEach(([k, label, what], i) => {
      const ly = top + 40 * s + i * (ctrlH - 50 * s) / items.length + 10;
      const [px, py] = P[k];
      c.strokeStyle = "rgba(95,245,232,0.55)"; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(px, py); c.lineTo(lx - 10, ly); c.stroke();
      c.fillStyle = "#ffcf4a"; c.font = `bold ${Math.round(14 * s + 4)}px Arial`; c.textAlign = "left";
      c.fillText(label, lx, ly - 9 * s);
      c.fillStyle = "#e6eeff"; c.font = `${Math.round(13 * s + 3)}px Arial`;
      wrap(c, what, lx, ly + 10 * s, lw, 15 * s + 3);
    });
  });
  // gestures
  const gy = top + ctrlH + 14;
  c.fillStyle = accent; c.font = "bold 18px Arial"; c.textAlign = "left";
  c.fillText("HAND MOVES", x0 + 10, gy);
  const rowH = Math.max(18, (y0 + h - gy - 14) / Math.ceil(GESTURES.length / 2));
  GESTURES.forEach(([k, v], i) => {
    const gx = x0 + 10 + (i % 2) * half, yy = gy + 22 + Math.floor(i / 2) * rowH;
    c.fillStyle = "#ffcf4a"; c.font = "bold 15px Arial"; c.fillText(k, gx, yy);
    c.fillStyle = "#dce7ff"; c.font = "14px Arial"; wrap(c, v, gx + 140, yy, half - 160, 16);
  });
  c.restore();
}
function wrap(c, text, x, y, maxW, lh) {
  const words = text.split(" "); let line = "", yy = y;
  for (const wd of words) { const t = line ? line + " " + wd : wd; if (c.measureText(t).width > maxW && line) { c.fillText(line, x, yy); line = wd; yy += lh; } else line = t; }
  if (line) c.fillText(line, x, yy);
}
