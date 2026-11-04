// NEON GENESIS — city of Neo Kasumi.
//
// Everything static in the city is batched: buildings, props, glow strips and
// signs are merged into a handful of meshes so the Quest draws ~40 objects
// instead of hundreds. Collision is a list of simple boxes (cheap to test every
// frame) and walkable rooftops are "floor zones".
//
// World layout (player spawns at 0,0,7 looking toward -Z / north):
//   THE SUMP     z  42 → -36   poor district, Mika's shop, Sato's noodle stand
//   RING ROAD    z -36 → -56   cross street, holographic koi above the junction
//   NEON MILE    z -56 → -115  commercial towers, Second Skin clinic
//   SPIRE PLAZA  z -115 → -141 Tenkai Spire landmark at the north end

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// ─── small helpers ──────────────────────────────────────────────────────────
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const _color = new THREE.Color();
function colorize(geo, hex) {
  _color.set(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = _color.r; arr[i * 3 + 1] = _color.g; arr[i * 3 + 2] = _color.b; }
  geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return geo;
}
function place(geo, x, y, z, ry = 0, rx = 0, rz = 0) {
  if (rx) geo.rotateX(rx);
  if (rz) geo.rotateZ(rz);
  if (ry) geo.rotateY(ry);
  geo.translate(x, y, z);
  return geo;
}
// A batch collects geometries and merges them into one mesh (one draw call).
class Batch {
  constructor(material, name) { this.material = material; this.name = name; this.geos = []; }
  add(geo) { this.geos.push(geo); return geo; }
  box(w, h, d, x, y, z, hex, ry = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (hex !== undefined) colorize(g, hex);
    return this.add(place(g, x, y, z, ry));
  }
  cyl(rt, rb, h, seg, x, y, z, hex, rx = 0, rz = 0) {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg);
    if (hex !== undefined) colorize(g, hex);
    return this.add(place(g, x, y, z, 0, rx, rz));
  }
  sphere(r, x, y, z, hex, ws = 10, hs = 8) {
    const g = new THREE.SphereGeometry(r, ws, hs);
    if (hex !== undefined) colorize(g, hex);
    return this.add(place(g, x, y, z));
  }
  plane(w, h, x, y, z, hex, ry = 0, rx = 0) {
    const g = new THREE.PlaneGeometry(w, h);
    if (hex !== undefined) colorize(g, hex);
    return this.add(place(g, x, y, z, ry, rx));
  }
  build(parent) {
    if (!this.geos.length) return null;
    // Guard: every part in a batch must share the same attributes.
    const keys = g => Object.keys(g.attributes).sort().join(",") + (g.index ? "|i" : "|n");
    const want = keys(this.geos[0]);
    const bad = this.geos.filter(g => keys(g) !== want);
    if (bad.length) console.warn(`Batch ${this.name}: ${bad.length} mismatched parts (${keys(bad[0])} vs ${want})`,
      JSON.stringify(bad.slice(0, 12).map(g => { g.computeBoundingBox(); const c = g.boundingBox.getCenter(new THREE.Vector3()); return [c.x.toFixed(1), c.y.toFixed(1), c.z.toFixed(1)]; })));
    const merged = mergeGeometries(this.geos.filter(g => keys(g) === want), false);
    this.geos.forEach(g => g.dispose());
    this.geos = [];
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, this.material);
    mesh.name = this.name;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    parent.add(mesh);
    return mesh;
  }
}

function canvasTexture(w, h, painter, { repeat = false, aniso = 4, renderer } = {}) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  painter(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = renderer ? Math.min(aniso, renderer.capabilities.getMaxAnisotropy()) : 1;
  return t;
}

// ─── building facade textures ───────────────────────────────────────────────
// Each texture is 8 columns × 8 floors of windows. The diffuse map is the wall
// and glass; the emissive map holds only the lit windows, so windows glow at
// night without any real lights.
const FACADE_STYLES = {
  sump: { cellW: 1.6, cellH: 3.0, lit: 0.34, wall: "#8c8a86", panel: "#76736e",
    glass: "#151c24", lights: ["#ffc46b", "#ffdca0", "#9ee8ff", "#ff8f5e", "#c9ff9e"], blinds: 0.5 },
  mile: { cellW: 1.4, cellH: 3.4, lit: 0.55, wall: "#6c7488", panel: "#59617a",
    glass: "#0e1626", lights: ["#7af7ff", "#c58bff", "#ff6fb5", "#ffffff", "#8fb6ff"], blinds: 0.25, bands: true },
  back: { cellW: 1.8, cellH: 3.6, lit: 0.3, wall: "#53596a", panel: "#474d5e",
    glass: "#0d1320", lights: ["#7af7ff", "#ffcf88", "#c58bff", "#ff7fb8"], blinds: 0.2 }
};
function makeFacadeTextures(style, seed, renderer) {
  const s = FACADE_STYLES[style];
  const rand = mulberry32(seed);
  const W = 512, H = 1024, cw = W / 8, ch = H / 8;
  const lit = [];
  for (let i = 0; i < 64; i++) lit.push(rand() < s.lit ? s.lights[Math.floor(rand() * s.lights.length)] : null);
  const diffuse = canvasTexture(W, H, (ctx) => {
    ctx.fillStyle = s.wall; ctx.fillRect(0, 0, W, H);
    // concrete panel noise
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = `rgba(0,0,0,${rand() * 0.08})`;
      ctx.fillRect(rand() * W, rand() * H, 2 + rand() * 18, 2 + rand() * 18);
    }
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const x = c * cw, y = r * ch;
      ctx.fillStyle = s.panel; ctx.fillRect(x, y + ch - 10, cw, 10); // floor slab line
      if (s.bands) { ctx.fillStyle = "#2c3346"; ctx.fillRect(x, y + ch - 16, cw, 6); }
      ctx.fillStyle = s.glass; ctx.fillRect(x + 9, y + 22, cw - 18, ch - 44);
      ctx.fillStyle = "rgba(120,160,220,0.10)";
      ctx.fillRect(x + 9, y + 22, (cw - 18) * 0.4, ch - 44);
      ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 2;
      ctx.strokeRect(x + 9, y + 22, cw - 18, ch - 44);
      // grime streaks below windows (Sump)
      if (style === "sump" && rand() < 0.5) {
        ctx.fillStyle = "rgba(30,25,20,0.25)";
        ctx.fillRect(x + 12 + rand() * 20, y + ch - 22, 3, 18 + rand() * 30);
      }
    }
    ctx.fillStyle = s.panel; ctx.fillRect(0, 0, 12, 12); // dark corner sampled by roofs
  }, { repeat: true, renderer });
  const emissive = canvasTexture(W, H, (ctx) => {
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const col = lit[r * 8 + c];
      if (!col) continue;
      const x = c * cw + 9, y = r * ch + 22, w = cw - 18, h = ch - 44;
      const g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, col); g.addColorStop(1, "rgba(0,0,0,0.55)");
      ctx.globalAlpha = 0.55 + rand() * 0.45;
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
      if (rand() < s.blinds) { // blinds / curtains / a silhouette
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        const kind = rand();
        if (kind < 0.4) for (let b = 0; b < h; b += 7) ctx.fillRect(x, y + b, w, 3);
        else if (kind < 0.75) ctx.fillRect(x, y, w * (0.3 + rand() * 0.4), h);
        else { ctx.beginPath(); ctx.arc(x + w / 2, y + h * 0.45, 7, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(x + w / 2 - 9, y + h * 0.55, 18, h * 0.45); }
      }
    }
  }, { repeat: true, renderer });
  return { diffuse, emissive, cellW: s.cellW, cellH: s.cellH };
}

// Box geometry with UVs scaled so windows keep a constant real-world size.
function buildingGeometry(x0, x1, z0, z1, y0, h, tex, rand) {
  const w = x1 - x0, d = z1 - z0;
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const tileW = tex.cellW * 8, tileH = tex.cellH * 8;
  const ou = Math.floor(rand() * 8) / 8, ov = Math.floor(rand() * 8) / 8;
  for (let f = 0; f < 6; f++) {
    const fw = f < 2 ? d : w;
    for (let i = 0; i < 4; i++) {
      const idx = f * 4 + i;
      if (f === 2 || f === 3) { uv.setXY(idx, 0.008, 0.995); continue; }
      uv.setXY(idx, uv.getX(idx) * fw / tileW + ou, uv.getY(idx) * h / tileH + ov);
    }
  }
  g.translate((x0 + x1) / 2, y0 + h / 2, (z0 + z1) / 2);
  return g;
}

// ─── signage ────────────────────────────────────────────────────────────────
// All sign art is original. Vertical signs stack kanji/katakana; horizontal
// signs mix Japanese with English. Fonts fall back to the system CJK font.
const JP_FONT = `"Noto Sans JP","Noto Sans CJK JP","Hiragino Sans","Yu Gothic","Meiryo",sans-serif`;
function paintSign(ctx, w, h, d) {
  ctx.fillStyle = d.bg || "#060a14"; ctx.fillRect(0, 0, w, h);
  ctx.shadowColor = d.color; ctx.shadowBlur = 18;
  ctx.strokeStyle = d.color; ctx.lineWidth = 8;
  ctx.strokeRect(10, 10, w - 20, h - 20);
  ctx.fillStyle = d.color; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  if (d.vertical) {
    const chars = [...d.jp];
    const step = (h - 120) / chars.length;
    const size = Math.min(w * 0.72, step * 0.86);
    ctx.font = `900 ${size}px ${JP_FONT}`;
    chars.forEach((c, i) => ctx.fillText(c, w / 2, 50 + step * (i + 0.5)));
    if (d.en) { ctx.shadowBlur = 8; ctx.font = `bold ${w * 0.17}px Arial`; ctx.fillStyle = d.sub || "#ffffff"; ctx.fillText(d.en, w / 2, h - 38); }
  } else {
    ctx.font = `900 ${h * 0.42}px ${JP_FONT}`;
    ctx.fillText(d.jp, w / 2, h * (d.en ? 0.4 : 0.52));
    if (d.en) { ctx.shadowBlur = 8; ctx.font = `bold ${h * 0.2}px Arial`; ctx.fillStyle = d.sub || "#ffffff"; ctx.fillText(d.en, w / 2, h * 0.78); }
  }
  ctx.shadowBlur = 0;
}
const SIGN_DESIGNS = {
  ramen:   { jp: "ラーメン", en: "RAMEN", color: "#ff5b4f", vertical: true },
  pawn:    { jp: "質屋", en: "PAWN", color: "#ffcf4a", vertical: true },
  laundry: { jp: "洗濯", en: "LAUNDRY", color: "#6ff7ff", vertical: true },
  capsule: { jp: "カプセル", en: "CAPSULE", color: "#c58bff", vertical: true },
  meds:    { jp: "薬", en: "MEDS 24H", color: "#7dff9e", vertical: true },
  sake:    { jp: "酒場", en: "BAR", color: "#ff7fb8", vertical: true },
  cyber:   { jp: "電脳", en: "CYBER", color: "#38f0e6", vertical: true },
  karaoke: { jp: "カラオケ", en: "KARAOKE", color: "#ff4fa3", vertical: true },
  hotel:   { jp: "ホテル", en: "HOTEL", color: "#8fb6ff", vertical: true },
  sushi:   { jp: "寿司", en: "SUSHI", color: "#ffa64f", vertical: true },
  mirai:   { jp: "未来", en: "MIRAI", color: "#b24cff", vertical: true },
  moon:    { jp: "月光", en: "GEKKO", color: "#e6f3ff", vertical: true },
  market:  { jp: "夜市", en: "NIGHT MARKET", color: "#ff4f6d" },
  skin:    { jp: "第二の皮膚", en: "SECOND SKIN · CLINIC", color: "#ff6fe0" },
  ringroad:{ jp: "環状線", en: "RING ROAD", color: "#ffe36b" },
  closed:  { jp: "立入禁止", en: "NO ENTRY", color: "#ffb02e" },
  sump:    { jp: "下層区", en: "THE SUMP", color: "#9fffb0" },
  mile:    { jp: "ネオン街", en: "NEON MILE", color: "#38f0e6" },
  arcade:  { jp: "ゲーセン", en: "ARCADE", color: "#5cff7a" },
  noodle:  { jp: "佐藤", en: "SATO'S", color: "#ffd27a" }
};

export function buildCity(scene, renderer) {
  const root = new THREE.Group();
  root.name = "NEO_KASUMI";
  scene.add(root);
  const rand = mulberry32(2077);
  const colliders = [];
  const floors = [];
  const anchors = {};          // named positions used by story/NPC code
  const animated = [];         // objects updated every frame
  const sidewalkPaths = [];    // polylines for walking NPCs

  const addCollider = (minX, maxX, minZ, maxZ, minY = 0, maxY = 60) =>
    colliders.push({ minX, maxX, minZ, maxZ, minY, maxY });

  // ── lights: two global lights + a few local "key" lights only ──────────
  root.add(new THREE.HemisphereLight(0x8fa8ff, 0x2a1834, 1.55));
  const moon = new THREE.DirectionalLight(0x9fc4ff, 1.15);
  moon.position.set(-30, 60, 20);
  root.add(moon);

  // ── materials ───────────────────────────────────────────────────────────
  const facade = {};
  const facadeMats = {};
  for (const [style, tint, seed] of [["sump", 0xa69c8e, 11], ["mile", 0x7b88a8, 23], ["back", 0x6a7186, 37]]) {
    facade[style] = makeFacadeTextures(style, seed, renderer);
    facadeMats[style] = new THREE.MeshStandardMaterial({
      color: tint, map: facade[style].diffuse, emissive: 0xffffff,
      emissiveMap: facade[style].emissive, emissiveIntensity: style === "back" ? 0.85 : 1.05,
      roughness: style === "mile" ? 0.45 : 0.85, metalness: style === "mile" ? 0.55 : 0.2
    });
  }
  const storefrontTex = canvasTexture(512, 128, (ctx, w, h) => {
    // rolling shutters, lit shop windows and doors repeated along the street
    const r = mulberry32(5);
    for (let i = 0; i < 4; i++) {
      const x = i * 128;
      const kind = r();
      if (kind < 0.45) { // metal shutter
        ctx.fillStyle = "#3b3f46"; ctx.fillRect(x, 0, 128, h);
        ctx.fillStyle = "#2a2d33"; for (let y = 8; y < h; y += 7) ctx.fillRect(x, y, 128, 3);
        ctx.fillStyle = ["#ff4fa3", "#38f0e6", "#ffcf4a"][i % 3]; ctx.globalAlpha = 0.35;
        ctx.fillRect(x + 20 + r() * 40, 30 + r() * 40, 30 + r() * 40, 6); ctx.globalAlpha = 1; // tag
      } else { // lit shop window
        ctx.fillStyle = "#1a1f2a"; ctx.fillRect(x, 0, 128, h);
        const g = ctx.createLinearGradient(0, 18, 0, h);
        g.addColorStop(0, ["#ffe3b0", "#bff6ff", "#ffc0e8"][i % 3]); g.addColorStop(1, "#4a3a2a");
        ctx.fillStyle = g; ctx.fillRect(x + 8, 18, 112, h - 26);
        ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fillRect(x + 8, 70, 112, 4);
        for (let k = 0; k < 6; k++) ctx.fillRect(x + 14 + k * 18, 76 + r() * 8, 10, 20 + r() * 12);
      }
      ctx.fillStyle = "#11141a"; ctx.fillRect(x, 0, 128, 14); ctx.fillRect(x, 0, 6, h);
    }
  }, { repeat: true, renderer });
  const storefrontMat = new THREE.MeshStandardMaterial({
    map: storefrontTex, emissive: 0xffffff, emissiveMap: storefrontTex, emissiveIntensity: 0.55,
    roughness: 0.6, metalness: 0.3
  });

  const asphaltTex = canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = "#1a1d24"; ctx.fillRect(0, 0, w, h);
    const r = mulberry32(9);
    for (let i = 0; i < 6000; i++) { const v = 20 + r() * 30; ctx.fillStyle = `rgb(${v},${v},${v + 6})`; ctx.fillRect(r() * w, r() * h, 2, 2); }
    for (let i = 0; i < 14; i++) { // cracks & patch repairs
      ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.lineWidth = 1 + r() * 2; ctx.beginPath();
      let x = r() * w, y = r() * h; ctx.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 60; y += (r() - 0.5) * 60; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(10,12,16,0.5)"; ctx.fillRect(r() * w, r() * h, 90, 60);
  }, { repeat: true, aniso: 8, renderer });
  asphaltTex.repeat.set(4, 30);
  const roadMat = new THREE.MeshStandardMaterial({ map: asphaltTex, color: 0xa8aec0, roughness: 0.38, metalness: 0.3 });
  const tileTex = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#4a4f5a"; ctx.fillRect(0, 0, w, h);
    const r = mulberry32(3);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const v = 64 + r() * 22; ctx.fillStyle = `rgb(${v},${v + 2},${v + 8})`;
      ctx.fillRect(x * 64 + 2, y * 64 + 2, 60, 60);
    }
    ctx.fillStyle = "rgba(200,200,90,0.5)"; ctx.fillRect(0, 0, 4, h); // tactile strip edge
  }, { repeat: true, aniso: 8, renderer });
  const sidewalkMat = new THREE.MeshStandardMaterial({ map: tileTex, color: 0x9aa0ad, roughness: 0.7, metalness: 0.15 });

  const propMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.45 });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const beaconMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  const props = new Batch(propMat, "CITY_PROPS");
  const glow = new Batch(glowMat, "CITY_NEON");
  const beacons = new Batch(beaconMat, "CITY_LANDMARK_LIGHTS");
  const buildings = { sump: new Batch(facadeMats.sump, "SUMP_BUILDINGS"), mile: new Batch(facadeMats.mile, "MILE_BUILDINGS"), back: new Batch(facadeMats.back, "SKYLINE") };
  const storefronts = new Batch(storefrontMat, "STOREFRONTS");
  const roads = new Batch(roadMat, "ROADS");
  const walks = new Batch(sidewalkMat, "SIDEWALKS");

  // Soft additive "light pools" replace real point lights under lamps & signs.
  const poolTex = canvasTexture(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, "rgba(255,255,255,0.9)"); g.addColorStop(0.4, "rgba(255,255,255,0.35)"); g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  });
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, vertexColors: true, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const pools = new Batch(poolMat, "LIGHT_POOLS");
  const pool = (x, z, r, hex, y = 0.1, intensity = 0.55) => {
    const c = new THREE.Color(hex).multiplyScalar(intensity);
    pools.plane(r * 2, r * 2, x, y, z, c.getHex(), 0, -Math.PI / 2);
  };
  // Mirror-like puddles: very smooth metal reflects the neon environment map.
  const puddleMat = new THREE.MeshStandardMaterial({ color: 0x3a4660, roughness: 0.08, metalness: 0.9, envMapIntensity: 2.6,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const puddles = new Batch(puddleMat, "PUDDLES");
  const puddle = (x, z, sx, sz) => {
    const g = new THREE.CircleGeometry(1, 18); g.scale(sx, sz, 1);
    puddles.add(place(g, x, 0.035, z, rand() * Math.PI, -Math.PI / 2));
  };

  // ── building helper ─────────────────────────────────────────────────────
  const BAND_H = 3.8;
  function building(x0, x1, z0, z1, h, style, opts = {}) {
    const { collide = true, band = true, roof = true, y0 = 0 } = opts;
    buildings[style].add(buildingGeometry(x0, x1, z0, z1, y0, h, facade[style], rand));
    if (band && style !== "back") {
      // storefront band around the ground floor, UVs scaled per metre
      const g = new THREE.BoxGeometry(x1 - x0 + 0.16, BAND_H, z1 - z0 + 0.16);
      const uv = g.attributes.uv;
      for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
        const idx = f * 4 + i, fw = f < 2 ? z1 - z0 : x1 - x0;
        if (f === 2 || f === 3) uv.setXY(idx, 0.01, 0.99);
        else uv.setXY(idx, uv.getX(idx) * fw / 14 + rand(), uv.getY(idx));
      }
      g.translate((x0 + x1) / 2, BAND_H / 2, (z0 + z1) / 2);
      storefronts.add(g);
      // awning lip above the storefronts
      props.box(x1 - x0 + 0.5, 0.18, z1 - z0 + 0.5, (x0 + x1) / 2, BAND_H + 0.09, (z0 + z1) / 2, style === "sump" ? 0x2b2622 : 0x1d2433);
    }
    if (roof) {
      props.box(x1 - x0 + 0.3, 0.35, z1 - z0 + 0.3, (x0 + x1) / 2, y0 + h + 0.17, (z0 + z1) / 2, 0x23262e);
      const n = Math.floor((x1 - x0) * (z1 - z0) / 70) + 1;
      for (let i = 0; i < n; i++) { // rooftop clutter: AC units, tanks, antennas
        const x = x0 + 1.5 + rand() * (x1 - x0 - 3), z = z0 + 1.5 + rand() * (z1 - z0 - 3), y = y0 + h + 0.35;
        const k = rand();
        if (k < 0.45) props.box(1.6, 1.0, 1.2, x, y + 0.5, z, 0x5a6070);
        else if (k < 0.75) { props.cyl(0.9, 0.9, 1.8, 10, x, y + 0.9, z, 0x4b4038); props.cyl(0.95, 0.95, 0.12, 10, x, y + 1.85, z, 0x2e2925); }
        else { props.cyl(0.05, 0.08, 6, 5, x, y + 3, z, 0x8a90a0); glow.sphere(0.12, x, y + 6.05, z, 0xff2a3a, 6, 4); }
      }
      if (h > 35) beacons.sphere(0.35, (x0 + x1) / 2, y0 + h + 0.8, (z0 + z1) / 2, 0xff3040, 6, 4); // aviation light
    }
    if (collide) addCollider(x0, x1, z0, z1, y0, y0 + h);
  }

  // Neon trim: vertical strips on the street-facing corners of a building.
  function cornerNeon(x, z0, z1, h, hex, side) {
    const fx = x + side * 0.12;
    glow.box(0.12, h - BAND_H - 1, 0.12, fx, BAND_H + (h - BAND_H - 1) / 2, z0 + 0.15, hex);
    glow.box(0.12, h - BAND_H - 1, 0.12, fx, BAND_H + (h - BAND_H - 1) / 2, z1 - 0.15, hex);
    glow.box(0.1, 0.1, z1 - z0 - 0.3, fx, h - 0.6, (z0 + z1) / 2, hex);
  }

  // Signs are grouped by design so each design is a single merged mesh.
  const signBatches = {};
  const signTextures = {};
  function signMaterial(key) {
    if (!signTextures[key]) {
      const d = SIGN_DESIGNS[key];
      const [w, h] = d.vertical ? [128, 512] : [512, 128];
      signTextures[key] = canvasTexture(w, h, (ctx) => paintSign(ctx, w, h, d), { renderer });
      signBatches[key] = new Batch(new THREE.MeshBasicMaterial({ map: signTextures[key], side: THREE.DoubleSide }), "SIGN_" + key);
    }
    return signBatches[key];
  }
  // Vertical blade sign sticking out from a facade at x=faceX (side=+1 means street is +X).
  function bladeSign(key, faceX, z, y, side, scale = 1) {
    const b = signMaterial(key);
    const g = new THREE.PlaneGeometry(1.1 * scale, 4.4 * scale);
    b.add(place(g, faceX + side * 0.75 * scale, y, z, Math.PI / 2));
    props.box(0.08, 0.08, 1.4 * scale, faceX + side * 0.7 * scale, y + 2.25 * scale, z, 0x30343c, Math.PI / 2);
    pool(faceX + side * 1.3, z, 2.2, new THREE.Color(SIGN_DESIGNS[key].color).getHex(), 0.11, 0.35);
  }
  // Flat sign mounted on a facade facing direction ry (0 = faces +Z).
  function flatSign(key, x, y, z, w, ry, glowPool = true) {
    const b = signMaterial(key);
    const d = SIGN_DESIGNS[key];
    const h = d.vertical ? w * 4 : w / 4;
    b.add(place(new THREE.PlaneGeometry(w, h), x, y, z, ry));
    if (glowPool && y < 8) {
      const nx = Math.sin(ry), nz = Math.cos(ry);
      pool(x + nx * 2, z + nz * 2, 2.6, new THREE.Color(d.color).getHex(), 0.11, 0.3);
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // STREETS
  // ════════════════════════════════════════════════════════════════════════
  // Avenue (runs north-south) and the Ring Road (east-west).
  roads.plane(15, 157, 0, 0.0, -36.5, undefined, 0, -Math.PI / 2);
  { const g = new THREE.PlaneGeometry(90, 12); g.attributes.uv.array.forEach((v, i, a) => { a[i] = i % 2 === 0 ? v * 6 : v * 0.8; });
    roads.add(place(g, 0, 0.004, -46, 0, -Math.PI / 2)); }
  roads.plane(60, 26, 0, 0.0, -128, undefined, 0, -Math.PI / 2); // plaza base
  const swH = 0.08;
  for (const side of [-1, 1]) {
    // avenue sidewalks, broken by the Ring Road
    walks.box(3.5, swH, 78.5, side * 9.25, swH / 2, 2.75);
    walks.box(3.5, swH, 59.5, side * 9.25, swH / 2, -85.25);
    // ring road sidewalks (south z -38.25, north z -53.75)
    walks.box(37.5, swH, 3.5, side * 26.25, swH / 2, -38.25);
    walks.box(37.5, swH, 3.5, side * 26.25, swH / 2, -53.75);
    // curbs
    props.box(0.18, 0.14, 78.5, side * 7.55, 0.07, 2.75, 0x8c919c);
    props.box(0.18, 0.14, 59.5, side * 7.55, 0.07, -85.25, 0x8c919c);
    props.box(37.5, 0.14, 0.18, side * 26.25, 0.07, -40.05, 0x8c919c);
    props.box(37.5, 0.14, 0.18, side * 26.25, 0.07, -51.95, 0x8c919c);
  }
  // plaza paving
  walks.box(60, swH, 26, 0, swH / 2, -128);
  // lane dashes and crosswalks
  for (let z = 40; z > -112; z -= 7) if (z > -36 || z < -56) props.box(0.14, 0.012, 3.2, 0, 0.012, z, 0xc9b56a);
  for (let x = -42; x < 42; x += 7) if (Math.abs(x) > 9) props.box(3.2, 0.012, 0.14, x, 0.012, -46, 0xc9b56a);
  for (const zc of [-37.4, -54.6]) for (let x = -6.6; x <= 6.6; x += 1.1) props.box(0.6, 0.013, 1.9, x, 0.013, zc, 0xd9dde6);
  for (const xc of [-8.4, 8.4]) for (let z = -41; z >= -51; z -= 1.1) props.box(1.9, 0.013, 0.6, xc, 0.013, z, 0xd9dde6);

  // Map edges: barriers at the street ends.
  props.box(22, 1.2, 0.8, 0, 0.6, 42.6, 0x6b6f78);
  for (let x = -10; x <= 10; x += 2) props.box(1, 0.25, 0.82, x, 0.95, 42.6, x % 4 === 0 ? 0xffb02e : 0x15171c);
  flatSign("closed", 0, 2.6, 42.2, 4, Math.PI);
  addCollider(-11, 11, 42.2, 43.5, 0, 3);
  // West end stays closed; the east end opens onto THE DOCKS (docks.js).
  props.box(0.8, 1.2, 19, -45.4, 0.6, -46, 0x6b6f78);
  flatSign("closed", -45, 2.6, -46, 4, Math.PI / 2);
  addCollider(-46.5, -45, -56, -36, 0, 3);
  addCollider(45, 46.5, -56, -52.2, 0, 8); addCollider(45, 46.5, -39.8, -36, 0, 8);   // corners beside the road

  // ════════════════════════════════════════════════════════════════════════
  // THE SUMP (z 42 → -36.5) — low, grimy, warm windows, laundry & cables
  // ════════════════════════════════════════════════════════════════════════
  // West frontage (x -26 → -11)
  building(-26, -11, 12, 42, 16, "sump");
  building(-26, -11, -2.6, 7, 11, "sump");
  building(-26, -14.2, -7.0, -2.6, 8, "sump", { band: false });  // Mika's building, above/behind her shop
  props.box(3.1, 4.6, 4.4, -12.65, 5.4, -4.8, 0x2a2724);           // upper storey over the shop front
  addCollider(-14.3, -14.15, -7.0, -2.6, 0, 8);
  building(-26, -11, -24, -7.0, 19, "sump");                         // capsule hotel (rooftop hideout)
  building(-26, -11, -36.5, -28, 13, "sump");
  // West back row (x -45 → -26)
  building(-45, -26, 12, 42, 24, "sump", { band: false });
  building(-45, -26, -10, 12, 30, "back", { band: false });
  building(-45, -26, -36.5, -10, 22, "sump", { band: false });
  // East frontage (x 11 → 26)
  building(11, 26, 16, 42, 13, "sump");
  building(11, 26, -8, 4, 15, "sump");
  building(11, 26, -36.5, -12, 22, "sump");
  // East back row
  building(26, 45, 16, 42, 18, "sump", { band: false });
  building(24, 45, 4, 16, 20, "sump", { band: false });
  building(26, 45, -12, 4, 28, "back", { band: false });
  building(26, 45, -36.5, -12, 24, "sump", { band: false });

  // Sump signage (blade signs face the avenue)
  bladeSign("laundry", -11, 3.0, 6.8, 1);
  bladeSign("capsule", -11, -15, 8.5, 1, 1.2);
  bladeSign("meds", -11, -31, 6.5, 1);
  bladeSign("sake", -11, 25, 7, 1);
  bladeSign("pawn", 11, -2, 7, -1);
  bladeSign("ramen", 11, 20, 6.5, -1);
  bladeSign("karaoke", 11, -24, 9, -1, 1.2);
  flatSign("sump", -11.1, 12, 30, 5, Math.PI / 2);
  flatSign("arcade", 11.1, 10, -30, 5, -Math.PI / 2);

  // Sump street furniture
  const sumpLamps = [];
  for (let z = 36; z > -34; z -= 13) for (const side of [-1, 1]) sumpLamps.push([side * 8.1, z]);
  for (const [x, z] of sumpLamps) {
    props.cyl(0.06, 0.09, 4.6, 6, x, 2.3, z, 0x3a3f48);
    props.box(0.9, 0.07, 0.07, x - Math.sign(x) * 0.4, 4.55, z, 0x3a3f48);
    glow.box(0.45, 0.06, 0.2, x - Math.sign(x) * 0.7, 4.48, z, 0xffd9a0);
    pool(x - Math.sign(x) * 0.9, z, 3.4, 0xffb46a, 0.1, 0.5);
  }
  // overhead power cables across the avenue, sagging between facades
  const cablePts = [];
  for (let z = 30; z > -34; z -= 4.5) {
    const y0 = 7 + rand() * 4, sag = 1 + rand() * 1.5, zz = z + (rand() - 0.5) * 2;
    let prev = null;
    for (let i = 0; i <= 10; i++) {
      const t = i / 10, p = new THREE.Vector3(-11 + 22 * t, y0 - Math.sin(t * Math.PI) * sag, zz + (rand() - 0.5) * 0.2);
      if (prev) cablePts.push(prev, p);
      prev = p;
    }
  }
  const cables = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(cablePts),
    new THREE.LineBasicMaterial({ color: 0x0a0b0e }));
  cables.name = "CABLES";
  root.add(cables);
  // paper lanterns strung across the Sump (warm, Japanese street feel)
  for (let z = 22; z > -30; z -= 9) for (let i = 1; i < 8; i++) {
    const x = -11 + i * 2.75, y = 6.2 - Math.sin(i / 8 * Math.PI) * 0.9;
    glow.sphere(0.22, x, y, z, i % 2 ? 0xff5a3c : 0xffb35a, 8, 6);
  }
  // crates, trash bags, vending machines, AC units on facades
  const sumpClutter = [[-10.4, 20], [-10.3, 9], [-10.5, -18], [10.4, -10], [10.3, 1], [10.5, 30], [-10.4, -33]];
  for (const [x, z] of sumpClutter) {
    props.box(0.8, 0.6, 0.8, x, 0.38, z, 0x5c4a35);
    props.box(0.6, 0.45, 0.6, x, 0.9, z + 0.1, 0x6b5a40, 0.4);
    props.sphere(0.35, x, 0.35, z + 0.9, 0x111316, 8, 6);
    addCollider(x - 0.45, x + 0.45, z - 0.45, z + 1.3, 0, 1.2);
  }
  const vending = [[-10.5, -0.5, 0x38f0e6], [10.5, 13.5, 0xff4fa3], [-10.5, 15, 0xffcf4a], [10.5, -14, 0x7dff9e]];
  for (const [x, z, c] of vending) {
    const s = Math.sign(x);
    props.box(0.8, 1.9, 0.9, x, 0.95, z, 0x2c3140);
    glow.box(0.04, 1.3, 0.7, x - s * 0.42, 1.1, z, c);
    pool(x - s * 1.2, z, 1.6, c, 0.1, 0.45);
    addCollider(x - 0.45, x + 0.45, z - 0.5, z + 0.5, 0, 2);
  }
  const sumpGap = (side, z) => side < 0
    ? (z > 6.5 && z < 12.5) || (z > -7.5 && z < -2) || (z > -28.5 && z < -23.5)
    : (z > 3.5 && z < 16.5) || (z > -12.5 && z < -7.5);
  for (let z = 38; z > -34; z -= 5.5) for (const side of [-1, 1]) {
    if (rand() < 0.45 || sumpGap(side, z)) continue;
    const y = 5 + Math.floor(rand() * 3) * 3;
    props.box(0.5, 0.6, 0.9, side * 11.35, y, z, 0x8a8e96);
  }
  // laundry lines in Lantern Alley
  for (let x = -24; x < -12; x += 3.2) {
    props.box(0.02, 0.02, 5, x, 6.5, 9.5, 0x222222);
    for (let k = 0; k < 4; k++) props.plane(0.5, 0.7, x, 6.1, 7.6 + k * 1.2,
      [0xd9d4c8, 0x7a95c9, 0xc96b6b, 0x9fbf8a][(k + Math.abs(Math.round(x))) % 4], Math.PI / 2);
  }
  // puddles
  for (let i = 0; i < 22; i++) puddle(-6 + rand() * 12, 38 - rand() * 72, 0.8 + rand() * 1.6, 0.5 + rand() * 1.1);
  puddle(-18, 9.5, 1.6, 0.9); puddle(-20, -26, 1.4, 0.8); puddle(18, -10, 1.2, 0.8);

  // Lantern Alley (z 7 → 12, west): dead-end with dumpster & graffiti
  props.box(2.0, 1.3, 1.1, -24.7, 0.65, 10.8, 0x2f5a3a);
  props.box(2.1, 0.12, 1.2, -24.7, 1.35, 10.8, 0x1d3a26);
  addCollider(-25.8, -23.6, 10.2, 11.5, 0, 1.4);
  glow.box(0.05, 0.3, 3.2, -25.95, 2.6, 9.5, 0x5cff7a);  // graffiti neon tag
  glow.box(0.05, 0.9, 0.3, -25.95, 2.2, 8.4, 0xff4fa3);
  pool(-23, 9.5, 2.5, 0x5cff7a, 0.1, 0.4);
  anchors.lanternAlley = new THREE.Vector3(-18, 0, 9.5);

  // Drain Alley (z -12 → -8, east): steam vent and a hidden spot behind a dumpster
  props.box(1.1, 1.3, 2.0, 24.4, 0.65, -10.8, 0x4a3a5a);
  props.box(1.2, 0.12, 2.1, 24.4, 1.35, -10.8, 0x2e2238);
  addCollider(23.8, 25.0, -11.9, -9.7, 0, 1.4);
  props.cyl(0.35, 0.35, 0.1, 12, 17, 0.06, -10, 0x22262e);
  anchors.drainVent = new THREE.Vector3(17, 0, -10);
  anchors.drainHidden = new THREE.Vector3(25.4, 0, -8.6);

  // Rust Alley (z -28 → -24, west): freight lift up to the capsule hotel roof
  anchors.liftGround = new THREE.Vector3(-23.6, 0, -26);
  props.box(1.8, 0.12, 1.8, -23.6, 0.06, -26, 0x2b3038);
  glow.box(1.6, 0.03, 0.06, -23.6, 0.13, -25.15, 0xffb02e);
  glow.box(1.6, 0.03, 0.06, -23.6, 0.13, -26.85, 0xffb02e);
  for (const dz of [-0.95, 0.95]) props.box(0.12, 4.5, 0.12, -24.55, 2.25, -26 + dz, 0x555a63);
  props.box(0.3, 1.2, 0.5, -22.4, 0.6, -27.4, 0x3a3f48);  // control post
  glow.box(0.02, 0.3, 0.3, -22.24, 1.05, -27.4, 0x5ff5e8);
  pool(-23.6, -26, 2.2, 0xffb02e, 0.1, 0.45);
  addCollider(-22.6, -22.2, -27.7, -27.1, 0, 1.3);

  // Rooftop hideout on the capsule hotel (y = 19): Rei's place
  const RY = 19;
  floors.push({ minX: -26, maxX: -11, minZ: -24, maxZ: -7.0, y: RY });
  // railings (collide only at roof height)
  const rail = (x0, x1, z0, z1) => {
    props.box(Math.max(0.08, x1 - x0), 0.08, Math.max(0.08, z1 - z0), (x0 + x1) / 2, RY + 1.05, (z0 + z1) / 2, 0x7a808c);
    glow.box(Math.max(0.04, x1 - x0), 0.03, Math.max(0.04, z1 - z0), (x0 + x1) / 2, RY + 0.4, (z0 + z1) / 2, 0x38f0e6);
    addCollider(Math.min(x0, x1) - 0.05, Math.max(x0, x1) + 0.05, Math.min(z0, z1) - 0.05, Math.max(z0, z1) + 0.05, RY, RY + 1.2);
  };
  rail(-25.8, -11.2, -7.2, -7.2); rail(-25.8, -11.2, -23.8, -23.8);
  rail(-25.8, -25.8, -23.8, -7.2); rail(-11.2, -11.2, -23.8, -7.2);
  for (let x = -25.5; x <= -11.5; x += 2) props.box(0.06, 1.05, 0.06, x, RY + 0.53, -7.2, 0x7a808c);
  // tarp shelter, couch, crates, fire barrel, antenna array, string lights
  props.box(5, 0.05, 4, -14.5, RY + 2.6, -11, 0x2a4a6a, 0);
  for (const [px, pz] of [[-16.9, -9.1], [-12.1, -9.1], [-16.9, -12.9], [-12.1, -12.9]]) props.cyl(0.04, 0.04, 2.6, 5, px, RY + 1.3, pz, 0x555a63);
  props.box(2.2, 0.45, 0.9, -14.5, RY + 0.22, -12.3, 0x6a2a3a);
  props.box(2.2, 0.6, 0.25, -14.5, RY + 0.5, -12.75, 0x5a2232);
  props.box(1.0, 0.7, 1.0, -17.5, RY + 0.35, -10, 0x5c4a35);
  props.cyl(0.32, 0.32, 0.9, 10, -12.5, RY + 0.45, -15, 0x3c3530);
  glow.sphere(0.24, -12.5, RY + 0.95, -15, 0xff7a2a, 8, 6);
  addCollider(-15.7, -13.3, -13, -11.8, RY, RY + 1);
  addCollider(-18.1, -16.9, -10.6, -9.4, RY, RY + 1);
  addCollider(-12.9, -12.1, -15.4, -14.6, RY, RY + 1);
  for (let i = 0; i < 4; i++) { const x = -24 + i * 1.3; props.cyl(0.04, 0.06, 4 + i, 5, x, RY + (4 + i) / 2, -21.5, 0x8a90a0); glow.sphere(0.1, x, RY + 4 + i, -21.5, 0xff2a3a, 6, 4); }
  for (let i = 0; i < 12; i++) glow.sphere(0.07, -17 + i * 0.45, RY + 2.5 - Math.sin(i / 11 * Math.PI) * 0.3, -9, [0xffcf4a, 0xff4fa3, 0x38f0e6][i % 3], 6, 4);
  anchors.liftRoof = new THREE.Vector3(-23.6, RY, -9.2);
  props.box(1.8, 0.12, 1.8, -23.6, RY + 0.06, -9.2, 0x2b3038);
  glow.box(1.6, 0.03, 0.06, -23.6, RY + 0.13, -8.35, 0xffb02e);
  glow.box(1.6, 0.03, 0.06, -23.6, RY + 0.13, -10.05, 0xffb02e);
  anchors.rooftop = new THREE.Vector3(-14.5, RY, -11);

  // Sato's noodle stand in the market lot (x 11 → 24, z 4 → 16), counter faces the avenue
  {
    const sx = 18;
    props.box(2.2, 1.05, 4.2, sx + 0.2, 0.52, 10, 0x6b4a32);           // counter
    props.box(2.5, 0.08, 4.5, sx + 0.1, 1.08, 10, 0x8a6a48);           // counter top
    props.box(0.1, 2.6, 4.6, sx + 2.2, 1.3, 10, 0x4a3324);             // back wall of stall
    props.box(3.4, 0.14, 5.4, sx + 0.8, 2.75, 10, 0x8c2a24, 0);        // roof
    props.box(3.6, 0.1, 5.6, sx + 0.8, 2.86, 10, 0x2a1a14);
    for (const dz of [-2.2, 2.2]) for (const dx of [-0.8, 2.15]) props.cyl(0.06, 0.06, 2.7, 6, sx + dx, 1.35, 10 + dz, 0x3a2a20);
    signMaterial("noodle").add(place(new THREE.PlaneGeometry(3.2, 0.8), sx - 0.85, 2.3, 10, -Math.PI / 2));
    // noren curtain strips
    for (let i = 0; i < 5; i++) props.plane(0.7, 0.6, sx - 0.9, 1.75, 8.2 + i * 0.9, 0xd8452f, -Math.PI / 2);
    for (const dz of [-1.5, 0, 1.5]) { props.cyl(0.22, 0.22, 0.06, 10, sx - 1.1, 0.72, 10 + dz, 0x9c3a2a); props.cyl(0.04, 0.04, 0.7, 5, sx - 1.1, 0.36, 10 + dz, 0x333333); }
    for (const dz of [-2.4, 2.4]) glow.sphere(0.28, sx - 0.95, 2.35, 10 + dz, 0xff5a3c, 10, 8);
    props.box(0.5, 0.35, 0.5, sx + 1.4, 1.28, 9.2, 0x9aa0aa);       // stock pot
    addCollider(sx - 0.95, sx + 2.3, 7.7, 12.3, 0, 2.6);
    pool(sx - 2.2, 10, 3.6, 0xffa24a, 0.1, 0.6);
    const satoLight = new THREE.PointLight(0xffa860, 6, 9, 1.6);
    satoLight.position.set(sx - 1.5, 2.4, 10);
    root.add(satoLight);
    anchors.sato = new THREE.Vector3(sx + 1.6, 0, 10.6);
    anchors.satoStools = [new THREE.Vector3(sx - 1.1, 0, 8.5), new THREE.Vector3(sx - 1.1, 0, 10), new THREE.Vector3(sx - 1.1, 0, 11.5)];
    // benches & a broken scooter in the lot
    props.box(2, 0.12, 0.5, 14, 0.45, 5.2, 0x5a4636); props.box(2, 0.45, 0.08, 14, 0.25, 5.2, 0x2a2a2a);
    addCollider(12.9, 15.1, 4.9, 5.5, 0, 0.6);
    props.box(1.4, 0.5, 0.45, 22.5, 0.35, 14.5, 0x9c2f2f, 0.5);
    anchors.lotBench = new THREE.Vector3(14, 0, 5.2);
  }
  sidewalkPaths.push([[-9.2, 40], [-9.2, -36]], [[9.2, 40], [9.2, -36]], [[-8.6, 30], [-8.6, -30]], [[8.6, -30], [8.6, 30]]);
  anchors.spawn = new THREE.Vector3(0, 0, 7);

  // ════════════════════════════════════════════════════════════════════════
  // RING ROAD (z -36.5 → -55.5)
  // ════════════════════════════════════════════════════════════════════════
  // overhead gantry with traffic signs and a scrolling marquee
  for (const x of [-8.4, 8.4]) props.box(0.4, 7.5, 0.4, x, 3.75, -47, 0x3a3f48);
  props.box(17.2, 0.6, 0.5, 0, 7.6, -47, 0x2a2f38);
  flatSign("ringroad", 0, 8.75, -46.72, 5.6, 0, false);
  flatSign("ringroad", 0, 8.75, -47.28, 5.6, Math.PI, false);
  addCollider(-8.65, -8.15, -47.25, -46.75, 0, 8); addCollider(8.15, 8.65, -47.25, -46.75, 0, 8);
  const marqueeTex = canvasTexture(1024, 64, (ctx, w, h) => {
    ctx.fillStyle = "#050811"; ctx.fillRect(0, 0, w, h);
    ctx.font = `bold 40px ${JP_FONT}`; ctx.fillStyle = "#ffcf4a"; ctx.textBaseline = "middle";
    ctx.shadowColor = "#ffcf4a"; ctx.shadowBlur = 10;
    ctx.fillText("TENKAI DYNAMICS · 明日を創る · CURFEW 02:00 · 環状線 RING ROAD · 安全第一 · ", 10, h / 2);
  }, { repeat: true, renderer });
  marqueeTex.repeat.set(1.6, 1);
  const marquee = new THREE.Mesh(new THREE.PlaneGeometry(16, 0.9), new THREE.MeshBasicMaterial({ map: marqueeTex, side: THREE.DoubleSide }));
  marquee.position.set(0, 7.1, -46.7);
  root.add(marquee);
  animated.push(t => { marqueeTex.offset.x = (t * 0.00006) % 1; });
  for (const z of [-38.3, -53.7]) for (let x = -40; x <= 40; x += 13) if (Math.abs(x) > 12) {
    props.cyl(0.06, 0.09, 4.6, 6, x, 2.3, z, 0x3a3f48);
    glow.box(0.2, 0.06, 0.45, x, 4.48, z + (z > -46 ? -0.5 : 0.5), 0xbff6ff);
    pool(x, z + (z > -46 ? -1 : 1), 3.2, 0x8fd8ff, 0.1, 0.4);
  }
  sidewalkPaths.push([[-42, -38.3], [42, -38.3]], [[42, -53.7], [-42, -53.7]]);
  // Holographic koi circling above the junction — a landmark visible from both districts.
  const koi = new THREE.Group();
  koi.name = "HOLO_KOI";
  const fishShape = new THREE.Shape();
  fishShape.moveTo(2.4, 0); fishShape.quadraticCurveTo(1.2, 1.05, -0.8, 0.5);
  fishShape.lineTo(-2.0, 0.95); fishShape.lineTo(-1.7, 0); fishShape.lineTo(-2.0, -0.95);
  fishShape.lineTo(-0.8, -0.5); fishShape.quadraticCurveTo(1.2, -1.05, 2.4, 0);
  const koiMat = new THREE.MeshBasicMaterial({ color: 0xff8a3c, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const koiMat2 = koiMat.clone(); koiMat2.color.set(0xffffff); koiMat2.opacity = 0.35;
  const koiBody = new THREE.Mesh(new THREE.ShapeGeometry(fishShape), koiMat);
  koiBody.rotation.x = -Math.PI / 2;
  const koiSpot = new THREE.Mesh(new THREE.CircleGeometry(0.45, 12), koiMat2);
  koiSpot.rotation.x = -Math.PI / 2; koiSpot.position.set(0.6, 0.02, 0.1);
  const koiFin = new THREE.Mesh(new THREE.ShapeGeometry(fishShape), koiMat2);
  koiFin.scale.set(0.5, 0.5, 0.5); koiFin.position.set(0.3, 0, 0);
  koi.add(koiBody, koiSpot, koiFin);
  koi.scale.setScalar(1.6);
  root.add(koi);
  animated.push(t => {
    const a = t * 0.00018;
    koi.position.set(Math.cos(a) * 9, 13 + Math.sin(t * 0.0009) * 0.8, -46 + Math.sin(a) * 6);
    koi.rotation.y = -a - Math.PI / 2 + 0.3;
    koi.rotation.z = Math.sin(t * 0.004) * 0.15;
    koiFin.rotation.x = Math.sin(t * 0.006) * 0.9;
  });
  anchors.junction = new THREE.Vector3(0, 0, -46);

  // ════════════════════════════════════════════════════════════════════════
  // NEON MILE (z -55.5 → -115) — towers, glass, holograms, night market
  // ════════════════════════════════════════════════════════════════════════
  building(-26, -11, -84, -55.5, 48, "mile");
  building(-45, -26, -84, -55.5, 62, "mile", { band: false });
  building(-45, -30, -88, -84, 40, "mile", { band: false });
  building(-26, -11, -115, -88, 64, "mile");
  building(-45, -26, -115, -88, 56, "mile", { band: false });
  building(11, 26, -72, -55.5, 52, "mile");
  building(26, 45, -72, -55.5, 40, "mile", { band: false });
  // Second Skin clinic: storefront interior x 11 → 16.5, z -78 → -72
  building(11, 26, -78, -72, 10, "mile", { collide: false, band: false, y0: 4, roof: true });
  building(16.5, 26, -78, -72, 4, "mile", { band: false, roof: false });
  building(11, 26, -102, -78, 38, "mile");
  building(26, 45, -102, -72, 44, "mile", { band: false });
  building(30, 45, -106, -102, 36, "mile", { band: false });
  building(11, 26, -115, -106, 60, "mile");
  building(26, 45, -115, -106, 50, "mile", { band: false });
  // plaza flanks
  building(-45, -30, -141, -115, 70, "mile", { band: false });
  building(30, 45, -141, -115, 66, "mile", { band: false });
  // Mile neon corner trims
  cornerNeon(-11, -84, -55.5, 48, 0x38f0e6, 1);
  cornerNeon(-11, -115, -88, 64, 0xb24cff, 1);
  cornerNeon(11, -72, -55.5, 52, 0xff4fa3, -1);
  cornerNeon(11, -102, -78, 38, 0x38f0e6, -1);
  cornerNeon(11, -115, -106, 60, 0xb24cff, -1);
  // Mile signage
  bladeSign("cyber", -11, -60, 9, 1, 1.4);
  bladeSign("hotel", -11, -76, 14, 1, 1.6);
  bladeSign("mirai", -11, -95, 12, 1, 1.6);
  bladeSign("sushi", -11, -108, 7, 1);
  bladeSign("karaoke", 11, -62, 10, -1, 1.4);
  bladeSign("moon", 11, -90, 13, -1, 1.6);
  bladeSign("cyber", 11, -110, 9, -1, 1.2);
  flatSign("mile", -11.1, 18, -70, 7, Math.PI / 2, false);
  flatSign("market", 0, 7.3, -56.6, 9, 0, false);
  for (const x of [-4.8, 4.8]) { props.box(0.3, 7.6, 0.3, x, 3.8, -56.6, 0xb0262f); addCollider(x - 0.2, x + 0.2, -56.8, -56.4, 0, 8); } // torii-style market gate
  props.box(11, 0.4, 0.5, 0, 8.3, -56.6, 0xb0262f); props.box(12, 0.25, 0.6, 0, 8.7, -56.6, 0x1a1414);
  // holographic billboards (scrolling vertical ad bands)
  const adTex = canvasTexture(256, 1024, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#1b0b2e"); g.addColorStop(0.5, "#082a3a"); g.addColorStop(1, "#1b0b2e");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.textAlign = "center"; ctx.shadowBlur = 16;
    const items = [["新しい自分", "#ff6fe0"], ["NEW YOU", "#ffffff"], ["天界", "#38f0e6"], ["UPGRADE", "#ffcf4a"], ["夢", "#c58bff"], ["TODAY", "#ffffff"]];
    items.forEach(([t, c], i) => { ctx.shadowColor = c; ctx.fillStyle = c; ctx.font = `900 ${t.length > 4 ? 46 : 110}px ${JP_FONT}`; ctx.fillText(t, w / 2, 120 + i * 165); });
  }, { repeat: true, renderer });
  const adMat = new THREE.MeshBasicMaterial({ map: adTex, transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const [x, z, ry] of [[-11.2, -66, Math.PI / 2], [11.2, -96, -Math.PI / 2], [-11.2, -102, Math.PI / 2]]) {
    const ad = new THREE.Mesh(new THREE.PlaneGeometry(5, 18), adMat);
    ad.position.set(x, 22, z); ad.rotation.y = ry;
    root.add(ad);
  }
  animated.push(t => { adTex.offset.y = (t * 0.00004) % 1; adMat.opacity = 0.8 + (Math.sin(t * 0.03) > 0.97 ? -0.5 : 0.1); });

  // Night-market stalls along the Mile sidewalks
  const stallColors = [0xff4f6d, 0x38f0e6, 0xffcf4a, 0xb24cff];
  for (let i = 0; i < 6; i++) {
    const side = i % 2 ? 1 : -1, z = -61 - i * 7.5, x = side * 10.4;
    props.box(1.2, 0.9, 2.2, x, 0.45, z, 0x4a3a2a);
    props.box(1.6, 0.06, 2.6, x - side * 0.1, 2.3, z, stallColors[i % 4]);
    for (const dz of [-1.1, 1.1]) props.cyl(0.03, 0.03, 2.3, 5, x - side * 0.65, 1.15, z + dz, 0x333333);
    glow.box(0.04, 0.12, 2.4, x - side * 0.85, 2.18, z, stallColors[(i + 1) % 4]);
    for (let k = 0; k < 4; k++) props.box(0.25, 0.2, 0.25, x, 1.0, z - 0.75 + k * 0.5, [0xd84a3a, 0x3ad87a, 0xd8c23a, 0x9a5ad8][k]);
    pool(x - side * 1.5, z, 2.4, stallColors[i % 4], 0.1, 0.5);
    addCollider(x - 0.65, x + 0.65, z - 1.15, z + 1.15, 0, 2.3);
  }
  // lantern strings across the Mile
  for (let z = -60; z > -112; z -= 8) for (let i = 1; i < 10; i++) {
    const x = -11 + i * 2.2, y = 9 - Math.sin(i / 10 * Math.PI) * 1.2;
    glow.sphere(0.2, x, y, z, i % 3 === 0 ? 0xffffff : 0xff3a4a, 8, 6);
  }
  // Mile lamps: tall cyan poles
  for (let z = -60; z > -114; z -= 12) for (const side of [-1, 1]) {
    const x = side * 8.1;
    props.cyl(0.07, 0.1, 6, 6, x, 3, z, 0x2a3240);
    glow.box(0.1, 1.6, 0.1, x, 5.3, z, side > 0 ? 0xb24cff : 0x38f0e6);
    pool(x, z, 3.6, side > 0 ? 0xb24cff : 0x38f0e6, 0.1, 0.45);
  }
  for (let i = 0; i < 26; i++) puddle(-6 + rand() * 12, -58 - rand() * 56, 0.8 + rand() * 1.8, 0.5 + rand() * 1.0);
  sidewalkPaths.push([[-9.1, -57], [-9.1, -114]], [[9.1, -114], [9.1, -57]], [[-8.6, -114], [-8.6, -57]], [[8.6, -57], [8.6, -114]]);

  // Second Skin clinic interior (open front at x = 11, facing the avenue)
  {
    const wallMat = 0x1c2230, cx0 = 11, cx1 = 16.5, cz0 = -78, cz1 = -72;
    props.box(cx1 - cx0, 4, 0.2, (cx0 + cx1) / 2, 2, cz0 + 0.1, wallMat);
    props.box(cx1 - cx0, 4, 0.2, (cx0 + cx1) / 2, 2, cz1 - 0.1, wallMat);
    props.box(0.2, 4, cz1 - cz0, cx1 - 0.1, 2, (cz0 + cz1) / 2, 0x241c30);
    props.box(cx1 - cx0, 0.05, cz1 - cz0, (cx0 + cx1) / 2, 0.03, (cz0 + cz1) / 2, 0xd8dce6);  // clean white floor
    props.box(cx1 - cx0, 0.15, cz1 - cz0, (cx0 + cx1) / 2, 3.95, (cz0 + cz1) / 2, 0xe8ecf4); // ceiling
    glow.box(3.8, 0.04, 0.12, 13.8, 3.85, -75, 0xffffff);
    // glass front with a door gap in the middle (z -75.9 → -74.1)
    props.box(0.12, 3.5, 2.0, cx0 + 0.06, 1.75, cz0 + 1.1, 0x1c3348);
    props.box(0.12, 3.5, 2.0, cx0 + 0.06, 1.75, cz1 - 1.1, 0x1c3348);
    for (const z of [cz0 + 0.1, cz0 + 2.1, cz1 - 2.1, cz1 - 0.1]) glow.box(0.05, 3.5, 0.05, cx0 - 0.02, 1.75, z, 0xff6fe0);
    glow.box(0.05, 0.05, cz1 - cz0, cx0 - 0.02, 3.5, (cz0 + cz1) / 2, 0xff6fe0);
    props.box(0.14, 0.5, cz1 - cz0, cx0 + 0.06, 3.75, (cz0 + cz1) / 2, 0x1a1a24);
    addCollider(cx0, cx0 + 0.2, cz0, cz0 + 2.1, 0, 4);
    addCollider(cx0, cx0 + 0.2, cz1 - 2.1, cz1, 0, 4);
    addCollider(cx0, cx1, cz0, cz0 + 0.25, 0, 4); addCollider(cx0, cx1, cz1 - 0.25, cz1, 0, 4);
    addCollider(cx1 - 0.25, cx1 + 0.2, cz0, cz1, 0, 4);
    // counter, display cases with glowing implants, surgery chair
    props.box(0.7, 1.05, 2.6, 15.0, 0.52, -75, 0xf0f2f8);
    glow.box(0.02, 0.06, 2.6, 14.64, 0.95, -75, 0xff6fe0);
    addCollider(14.6, 15.4, -76.35, -73.65, 0, 1.1);
    for (const z of [-77.3, -72.7]) {
      props.box(1.6, 1.0, 0.5, 13.2, 0.5, z, 0xe6e9f0);
      props.box(1.6, 0.6, 0.5, 13.2, 1.3, z, 0x9fdcff);
      for (let k = 0; k < 3; k++) glow.sphere(0.07, 12.7 + k * 0.5, 1.2, z, [0xff6fe0, 0x38f0e6, 0xffcf4a][k], 8, 6);
      addCollider(12.35, 14.05, z - 0.3, z + 0.3, 0, 1.7);
    }
    props.box(0.7, 0.5, 1.8, 16.0, 0.6, -76.6, 0x3a3a48); props.box(0.7, 0.9, 0.2, 16.0, 1.1, -77.45, 0x3a3a48);
    signMaterial("skin").add(place(new THREE.PlaneGeometry(5.4, 1.35), cx0 - 0.05, 4.7, (cz0 + cz1) / 2, -Math.PI / 2));
    pool(9.5, -75, 3, 0xff6fe0, 0.1, 0.55);
    const clinicLight = new THREE.PointLight(0xffd6f4, 5, 8, 1.6);
    clinicLight.position.set(13.5, 3.2, -75);
    root.add(clinicLight);
    anchors.doc = new THREE.Vector3(15.8, 0, -75.3);
    anchors.clinicDoor = new THREE.Vector3(10, 0, -75);
  }

  // Shimmer Alley (z -88 → -84, west) → small hidden shrine with a torii gate
  {
    const ax = -27.8, az = -86;
    for (const dz of [-1.3, 1.3]) props.cyl(0.12, 0.14, 2.8, 8, ax + 1.2, 1.4, az + dz, 0xc8282f);
    props.box(0.3, 0.2, 3.4, ax + 1.2, 2.75, az, 0xc8282f); props.box(0.4, 0.15, 3.8, ax + 1.2, 3.0, az, 0x1a1414);
    props.box(0.9, 0.9, 0.9, ax - 1.4, 0.45, az, 0x5a5a5a);
    props.box(0.7, 0.6, 0.6, ax - 1.4, 1.2, az, 0x6a5a40);
    glow.sphere(0.12, ax - 1.1, 1.2, az - 0.25, 0xffcf8a, 6, 4); glow.sphere(0.12, ax - 1.1, 1.2, az + 0.25, 0xffcf8a, 6, 4);
    for (let i = 0; i < 8; i++) glow.sphere(0.05, ax - 1.5 + rand() * 0.4, 0.95, az - 0.4 + rand() * 0.8, 0xffa040, 4, 3);
    addCollider(ax - 1.9, ax - 0.9, az - 0.5, az + 0.5, 0, 1.6);
    pool(ax, az, 2.6, 0xffb060, 0.1, 0.5);
    glow.box(0.05, 0.25, 2.5, -29.95, 3.0, -86, 0xb24cff);
    anchors.shrine = new THREE.Vector3(ax, 0, az);
  }
  // East alley (z -106 → -102)
  props.box(1.2, 1.2, 1.2, 29.2, 0.6, -103, 0x3a3f48);
  addCollider(28.6, 29.8, -103.6, -102.4, 0, 1.2);
  glow.box(0.04, 2.4, 0.06, 29.95, 2.2, -104.5, 0xff4fa3);
  anchors.eastAlley = new THREE.Vector3(28.5, 0, -104.6);
  pool(27, -104, 2.4, 0xff4fa3, 0.1, 0.35);

  // ════════════════════════════════════════════════════════════════════════
  // SPIRE PLAZA & TENKAI SPIRE (landmark)
  // ════════════════════════════════════════════════════════════════════════
  building(-30, 30, -170, -141, 12, "mile", { band: false });
  buildings.mile.add(buildingGeometry(-14, 14, -168, -146, 12, 170, facade.mile, rand));
  buildings.mile.add(buildingGeometry(-9, 9, -164, -150, 182, 40, facade.mile, rand));
  for (const [x, z] of [[-14, -146], [14, -146], [-14, -168], [14, -168]]) beacons.box(0.35, 170, 0.35, x, 97, z, 0x38f0e6);
  beacons.box(28.4, 0.4, 0.4, 0, 182, -146, 0x38f0e6);
  for (let y = 30; y < 180; y += 25) beacons.box(28.4, 0.25, 0.25, 0, y, -145.85, 0xb24cff);
  beacons.cyl(0.25, 0.25, 30, 6, 0, 237, -157, 0xff3040);
  glow.box(20, 0.5, 0.3, 0, 10, -140.8, 0x38f0e6);
  glow.box(4, 7, 0.2, 0, 3.5, -140.85, 0x9fe9ff);  // grand entrance (sealed)
  { const sign = canvasTexture(1024, 256, (ctx, w, h) => {
      ctx.fillStyle = "rgba(0,0,0,0)"; ctx.clearRect(0, 0, w, h);
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.shadowColor = "#38f0e6"; ctx.shadowBlur = 24;
      ctx.fillStyle = "#e9ffff"; ctx.font = `900 120px ${JP_FONT}`; ctx.fillText("天界", w * 0.28, h / 2);
      ctx.font = "bold 84px Arial"; ctx.fillText("TENKAI", w * 0.68, h / 2);
    }, { renderer });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(24, 6), new THREE.MeshBasicMaterial({ map: sign, transparent: true, fog: false, depthWrite: false }));
    m.position.set(0, 150, -145.6);
    root.add(m);
  }
  // Giant holographic orb above the plaza — the city's skyline landmark.
  const orb = new THREE.Group();
  orb.position.set(0, 34, -128);
  const orbMat = new THREE.MeshBasicMaterial({ color: 0x38f0e6, wireframe: true, transparent: true, opacity: 0.45, fog: false, blending: THREE.AdditiveBlending, depthWrite: false });
  const orbCore = new THREE.Mesh(new THREE.IcosahedronGeometry(7, 1), orbMat);
  const orbRingMat = new THREE.MeshBasicMaterial({ color: 0xb24cff, transparent: true, opacity: 0.6, fog: false, blending: THREE.AdditiveBlending, depthWrite: false });
  const orbRing1 = new THREE.Mesh(new THREE.TorusGeometry(10, 0.12, 6, 64), orbRingMat);
  const orbRing2 = new THREE.Mesh(new THREE.TorusGeometry(12, 0.08, 6, 64), orbRingMat);
  orbRing1.rotation.x = Math.PI / 2.4; orbRing2.rotation.x = Math.PI / 1.7;
  orb.add(orbCore, orbRing1, orbRing2);
  root.add(orb);
  animated.push(t => { orbCore.rotation.y = t * 0.00012; orbCore.rotation.x = t * 0.00005; orbRing1.rotation.z = t * 0.0002; orbRing2.rotation.z = -t * 0.00016; });
  // projector column under the orb
  glow.cyl(1.4, 1.8, 0.6, 16, 0, 0.3, -128, 0x1a2a3a);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0x38f0e6, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.4, 34, 16, 1, true), beamMat);
  beam.position.set(0, 17, -128);
  root.add(beam);
  addCollider(-1.8, 1.8, -129.8, -126.2, 0, 1);
  pool(0, -128, 7, 0x38f0e6, 0.1, 0.5);
  // plaza benches + planters with glowing trees
  for (const [x, z] of [[-14, -121], [14, -121], [-14, -135], [14, -135]]) {
    props.box(3, 0.6, 3, x, 0.3, z, 0x2a3240);
    props.cyl(0.12, 0.18, 2.4, 6, x, 1.8, z, 0x3a2a24);
    for (let k = 0; k < 7; k++) glow.sphere(0.38 + rand() * 0.2, x + (rand() - 0.5) * 1.6, 3.1 + rand() * 0.9, z + (rand() - 0.5) * 1.6, [0xff8ad8, 0xffb3e6, 0xd860b0][k % 3], 8, 6);
    addCollider(x - 1.5, x + 1.5, z - 1.5, z + 1.5, 0, 1);
    pool(x, z, 3.2, 0xff8ad8, 0.1, 0.4);
  }
  anchors.plaza = new THREE.Vector3(0, 0, -122);
  anchors.ishida = new THREE.Vector3(0, 0, -124.5);
  sidewalkPaths.push([[-24, -118], [24, -118], [24, -138], [-24, -138], [-24, -118]]);

  // Story points of interest in the Mile
  anchors.pylons = [new THREE.Vector3(-9.8, 0, -66), new THREE.Vector3(9.8, 0, -94), new THREE.Vector3(-20, 0, -131)];
  // junction boxes are wall-mounted: [position, facing yaw]
  anchors.junctions = [[new THREE.Vector3(-14, 1.3, -84.12), Math.PI], [new THREE.Vector3(14, 1.3, -102.12), Math.PI], [new THREE.Vector3(-10.88, 1.3, -112), Math.PI / 2]];
  anchors.lulu = new THREE.Vector3(-9.6, 0, -58.4);

  // ════════════════════════════════════════════════════════════════════════
  // BACKDROP SKYLINE (no collision) — fills the horizon beyond the map
  // ════════════════════════════════════════════════════════════════════════
  const skyline = (x0, x1, z0, z1, count, hMin, hMax) => {
    for (let i = 0; i < count; i++) {
      const w = 8 + rand() * 12, d = 8 + rand() * 12;
      const x = x0 + rand() * (x1 - x0), z = z0 + rand() * (z1 - z0);
      const h = hMin + rand() * (hMax - hMin);
      building(x - w / 2, x + w / 2, z - d / 2, z + d / 2, h, "back", { collide: false, band: false, roof: h < 80 });
      if (rand() < 0.35) glow.box(0.25, h * 0.8, 0.25, x - w / 2 - 0.1, h * 0.45, z + d / 2 + 0.1, [0x38f0e6, 0xb24cff, 0xff4fa3][i % 3]);
    }
  };
  skyline(-110, -52, 60, -200, 22, 30, 120);
  skyline(52, 110, 60, 12, 10, 30, 120);
  skyline(52, 110, -88, -200, 12, 30, 120);
  skyline(-60, 60, 50, 95, 10, 25, 70);
  skyline(-90, 90, -175, -230, 12, 60, 160);

  // ── sky dome: deep night with city light glow at the horizon ────────────
  const skyGeo = new THREE.SphereGeometry(520, 32, 16);
  const sc = [], top = new THREE.Color(0x02030a), mid = new THREE.Color(0x0b0a1c), hor = new THREE.Color(0x2a1236);
  const pos = skyGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 520;
    const c = y > 0.25 ? mid.clone().lerp(top, Math.min(1, (y - 0.25) / 0.6)) : hor.clone().lerp(mid, Math.max(0, y / 0.25));
    sc.push(c.r, c.g, c.b);
  }
  skyGeo.setAttribute("color", new THREE.Float32BufferAttribute(sc, 3));
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.name = "SKY";
  sky.renderOrder = -10;
  root.add(sky);

  // ── rain: short streaks that follow the player ──────────────────────────
  const RAIN = 650, RW = 26, RH = 16;
  const rainPos = new Float32Array(RAIN * 6);
  const rainSeed = new Float32Array(RAIN * 3);
  for (let i = 0; i < RAIN; i++) { rainSeed[i * 3] = rand() * RW - RW / 2; rainSeed[i * 3 + 1] = rand() * RH; rainSeed[i * 3 + 2] = rand() * RW - RW / 2; }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0x9fb8d8, transparent: true, opacity: 0.28 }));
  rain.frustumCulled = false;
  rain.name = "RAIN";
  root.add(rain);
  let rainFall = 0;
  function updateRain(dt, px, py, pz) {
    rainFall = (rainFall + dt * 14) % RH;
    for (let i = 0; i < RAIN; i++) {
      const x = px + rainSeed[i * 3], z = pz + rainSeed[i * 3 + 2];
      let y = rainSeed[i * 3 + 1] - rainFall; if (y < 0) y += RH;
      y += py - 2;
      const o = i * 6;
      rainPos[o] = x; rainPos[o + 1] = y; rainPos[o + 2] = z;
      rainPos[o + 3] = x + 0.03; rainPos[o + 4] = y + 0.45; rainPos[o + 5] = z + 0.02;
    }
    rainGeo.attributes.position.needsUpdate = true;
  }

  // ── steam vents (tiny particle columns) ─────────────────────────────────
  const steamTex = canvasTexture(64, 64, (ctx, w, h) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,0.5)"); g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  });
  const vents = [[17, -10], [-4.5, 18], [5.5, -22], [-3, -80], [4, -104]];
  const STEAM = 18;
  const steamPos = new Float32Array(vents.length * STEAM * 3);
  const steamGeo = new THREE.BufferGeometry();
  steamGeo.setAttribute("position", new THREE.BufferAttribute(steamPos, 3));
  const steam = new THREE.Points(steamGeo, new THREE.PointsMaterial({ map: steamTex, size: 1.4, transparent: true, opacity: 0.35, depthWrite: false, color: 0xb8c4d8 }));
  steam.frustumCulled = false;
  root.add(steam);
  vents.forEach(([x, z]) => { if (x !== 17) props.cyl(0.4, 0.4, 0.05, 10, x, 0.03, z, 0x1a1d24); });
  animated.push(t => {
    let k = 0;
    for (let v = 0; v < vents.length; v++) for (let i = 0; i < STEAM; i++) {
      const life = ((t * 0.0004 + i / STEAM) % 1);
      steamPos[k++] = vents[v][0] + Math.sin(i * 12.9 + t * 0.001) * 0.3 * life;
      steamPos[k++] = 0.1 + life * 3.2;
      steamPos[k++] = vents[v][1] + Math.cos(i * 7.3) * 0.3 * life;
    }
    steamGeo.attributes.position.needsUpdate = true;
  });

  // ── build all batches ───────────────────────────────────────────────────
  for (const b of Object.values(buildings)) b.build(root);
  storefronts.build(root); roads.build(root); walks.build(root);
  props.build(root); glow.build(root); beacons.build(root);
  pools.build(root); puddles.build(root);
  for (const b of Object.values(signBatches)) b.build(root);

  // ── queries used by movement & story code ───────────────────────────────
  function collides(x, z, feetY, r) {
    for (let i = 0; i < colliders.length; i++) {
      const b = colliders[i];
      if (b.maxY <= feetY + 0.35 || b.minY >= feetY + 1.7) continue;
      const cx = x < b.minX ? b.minX : (x > b.maxX ? b.maxX : x);
      const cz = z < b.minZ ? b.minZ : (z > b.maxZ ? b.maxZ : z);
      const dx = x - cx, dz = z - cz;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }
  function groundAt(x, z, currentY) {
    let g = 0;
    for (const f of floors) {
      if (x >= f.minX && x <= f.maxX && z >= f.minZ && z <= f.maxZ && f.y <= currentY + 0.4 && f.y > g) g = f.y;
    }
    return g;
  }
  function districtAt(z, y = 0, x = 0) {
    if (y > 10) return "ROOFTOPS · THE SUMP";
    if (x > 45.5) return "THE DOCKS";
    if (z > -36.5) return "THE SUMP";
    if (z > -55.5) return "RING ROAD";
    if (z > -115) return "NEON MILE";
    return "SPIRE PLAZA";
  }

  // Fog colour & density drift between districts.
  const fogSump = new THREE.Color(0x1a1826), fogMile = new THREE.Color(0x1a0f2c);
  const fogTmp = new THREE.Color();
  function applyAtmosphere(sceneRef, z) {
    const t = THREE.MathUtils.clamp((-z - 20) / 50, 0, 1);
    fogTmp.copy(fogSump).lerp(fogMile, t);
    if (!sceneRef.fog) sceneRef.fog = new THREE.Fog(fogTmp, 14, 150);
    sceneRef.fog.color.copy(fogTmp);
    sceneRef.fog.near = THREE.MathUtils.lerp(10, 18, t);
    sceneRef.fog.far = THREE.MathUtils.lerp(120, 165, t);
    sceneRef.background = fogTmp;
  }

  function update(time, dt, playerPos) {
    for (const fn of animated) fn(time, dt);
    if (playerPos) updateRain(dt, playerPos.x, playerPos.y, playerPos.z);
  }

  return { root, colliders, floors, anchors, sidewalkPaths, collides, groundAt, districtAt, applyAtmosphere, update };
}

// A small dark "neon city" environment map so metal & glass pick up coloured
// reflections. Generated once at start-up (cheap: one PMREM pass).
export function createNeonEnvironment(renderer) {
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x05060c);
  const add = (w, h, x, y, z, color, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.rotation.y = ry; envScene.add(m);
  };
  add(4, 14, -9, 2, -6, 0x2ad8d0, Math.PI / 3);
  add(4, 12, 9, 1, -5, 0xb24cff, -Math.PI / 3);
  add(3, 10, 8, 0, 7, 0xff4fa3, -Math.PI * 0.7);
  add(5, 8, -8, -1, 7, 0x3a4cff, Math.PI * 0.7);
  add(20, 20, 0, 12, 0, 0x141a2e, 0);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: 0x0a0c14 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -6; envScene.add(floor);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(envScene, 0.04);
  pmrem.dispose();
  return rt.texture;
}
