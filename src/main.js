import * as THREE from "three";
import { VRButton } from "three/addons/webxr/VRButton.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { buildCity, createNeonEnvironment } from "./city.js";
import { createGame } from "./quests.js";
import { skinify, mergeStatic } from "./optimize.js";
import { createAudio } from "./audio.js";
import { buildCharacter } from "./character.js";
import * as creator from "./creator.js";
import { guideSettings, setGuideStyle } from "./guide.js";
import { createIntro } from "./intro.js";
import * as worlds from "./worlds.js";
import { buildDocks } from "./docks.js";
import { createCombat, makeZone } from "./combat.js";
import { createCityFX } from "./fx.js";
import { comfort, createComfort, applyPicture } from "./comfort.js";
import { buildRadios } from "./radio.js";
import { createGear } from "./gear.js";
import { TRAVEL, isUnlocked, discover, drawMap } from "./map.js";
import { createArcade } from "./arcade.js";
import { CYBERWARE } from "./story.js";
import {
  state, loadGame, saveGame, resetGame, pointsLeft, changeStat, gradeNames, maxHealth, slotCount,
  isActive, toggleInstall, moveSpeed, turnSpeed, jumpVelocity as jumpPower, totalPoints, MAX_STAT,
  gradeName, level, xpIntoLevel, XP_PER_LEVEL
} from "./state.js";

loadGame();
const DEBUG = new URLSearchParams(location.search).has("debug");
let game = null; // gameplay layer (missions, NPCs, dialogue) — created below
const scene = new THREE.Scene();
const menuBackground = new THREE.Color(0x080b18);
const menuFog = new THREE.Fog(0x080b18, 28, 145);
scene.background = menuBackground;
scene.fog = menuFog;

const player = new THREE.Group();
scene.add(player);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 700);
camera.rotation.order = "YXZ";
// First-person view: the camera sits at eye height inside the character.
camera.position.set(0, 1.65, 0);
camera.rotation.set(0, 0, 0);
player.add(camera);
player.position.set(0, 0, 7);
// Procedural sound (music, ambience, voices). Starts on the first click.
const audio = createAudio(camera);
function startAudio() { audio.init(); if (!isInCity) audio.setMood("menu"); }
window.addEventListener("pointerdown", startAudio, { capture: true });
window.addEventListener("keydown", startAudio, { capture: true });

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
// Fixed foveated rendering: renders the edges of each eye at lower resolution
// on Quest, a large GPU saving you can't see through the lenses.
renderer.xr.setFoveation(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
// Filmic tone mapping: richer, more realistic light and colour (as in films and modern games).
renderer.toneMapping = THREE.ACESFilmicToneMapping;
applyPicture(renderer);        // VIVID picture mode unless switched to STANDARD in Settings
renderer.toneMappingExposure = 1.2;
document.body.appendChild(renderer.domElement);

const gameUI = document.querySelector("#game-ui");
const vrButton = VRButton.createButton(renderer, {
  requiredFeatures: ["local-floor"],
  optionalFeatures: ["bounded-floor", "dom-overlay"],
  domOverlay: { root: gameUI }
});
vrButton.textContent = "ENTER VR";
document.querySelector("#start-actions").appendChild(vrButton);
vrButton.id = "VRButton";
vrButton.textContent = "ENTER VR";

// Release any desktop pointer lock before the browser starts an immersive session.
// Capture phase runs before the VRButton's own click handler.
vrButton.addEventListener("click", () => {
  if (document.pointerLockElement) document.exitPointerLock?.();
}, true);

const startScreen = document.querySelector("#start-screen");
const startStatus = document.querySelector("#start-status");
// The player's look lives in creator.js (saved on this device; older saves
// from the 4-option creator are converted automatically).
creator.loadLook();
const appearance = creator.look;
setTimeout(() => document.querySelector("#wip-label")?.classList.add("faded"), 20000);

// The city of Neo Kasumi (districts, collision, signage, props, rain) is
// built in city.js as a handful of merged meshes for Quest performance.
const city = buildCity(scene, renderer);
// THE DOCKS: new waterfront district east of the Ring Road (docks.js).
const docks = buildDocks(city.root, city);
// Neon bloom halos, lamp beams, flying cars and searchlights (fx.js).
const cityFX = createCityFX(city.root, city, renderer);
const comfortSys = createComfort({ renderer, camera });
const radios = buildRadios(city.root, city);
let lastTurnRate = 0;
let travelCheck = 0;
// A small neon environment map gives metal, glass and wet streets coloured
// reflections without any extra real-time lights.
scene.environment = createNeonEnvironment(renderer);
scene.environmentIntensity = 0.6;

// Keep the city as a separate world. The title screen renders a different
// environment until the player explicitly chooses PLAY.
const cityWorld = new THREE.Group();
cityWorld.name = "CITY_WORLD";
for (const child of [...scene.children]) {
  if (child !== player) cityWorld.attach(child);
}
scene.add(cityWorld);
cityWorld.visible = false;
// Story intro (holographic slides). Created after the city is grouped so it
// stays a separate world. See intro.js.
const intro = createIntro({ scene, camera, renderer, getLook: () => appearance });

// SECTOR 09 — Mika's repair shop entrance. This is a real 3D doorway in the
// city, built from lightweight Three.js geometry so it works on Quest.
const mikaShop = new THREE.Group();
mikaShop.name = "MIKAS_REPAIR_SHOP";
// Ground-floor storefront on the west side of the Sump's main street, facing
// the road (+X). Local +Z is the shop front, so rotating by 90° turns it.
mikaShop.position.set(-11, 0, -4.8);
mikaShop.rotation.y = Math.PI / 2;
cityWorld.add(mikaShop);

const shopWallMaterial = new THREE.MeshStandardMaterial({
  color: 0x182436, roughness: 0.84, metalness: 0.42
});
const shopTrimMaterial = new THREE.MeshStandardMaterial({
  color: 0x26384b, roughness: 0.46, metalness: 0.72
});
const shopNeonMaterial = new THREE.MeshStandardMaterial({
  color: 0x38e8dc, emissive: 0x087d78, emissiveIntensity: 1.1,
  metalness: 0.35, roughness: 0.28
});
const shopRedMaterial = new THREE.MeshStandardMaterial({
  color: 0xff426c, emissive: 0x8e092a, emissiveIntensity: 0.8,
  metalness: 0.45, roughness: 0.3
});
const addShopBox = (parent, w, h, d, material, x, y, z) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
};

// A shallow workshop shell with an open doorway.
addShopBox(mikaShop, 1.34, 3.05, 0.28, shopWallMaterial, -1.55, 1.525, 0);
addShopBox(mikaShop, 1.34, 3.05, 0.28, shopWallMaterial, 1.55, 1.525, 0);
addShopBox(mikaShop, 1.76, 0.52, 0.28, shopWallMaterial, 0, 2.79, 0);
addShopBox(mikaShop, 4.2, 0.18, 3.2, shopWallMaterial, 0, 0.02, -1.45);
addShopBox(mikaShop, 0.20, 2.9, 3.1, shopWallMaterial, -2.08, 1.48, -1.48);
addShopBox(mikaShop, 0.20, 2.9, 3.1, shopWallMaterial, 2.08, 1.48, -1.48);
addShopBox(mikaShop, 4.2, 0.18, 0.20, shopWallMaterial, 0, 2.95, -1.45);
addShopBox(mikaShop, 4.2, 0.18, 0.20, shopWallMaterial, 0, 0.12, -2.95);
// Back wall and roof close the workshop (previously open at the back).
addShopBox(mikaShop, 4.36, 3.05, 0.2, shopWallMaterial, 0, 1.525, -3.05);
addShopBox(mikaShop, 4.4, 0.16, 3.4, shopWallMaterial, 0, 3.06, -1.5);
const mikaShopBlockers = [];
mikaShop.traverse(o => { if (o.isMesh) mikaShopBlockers.push(o); });

// Workshop interior: workbench, pegboard, parts shelves, screens and lamps.
const benchMat = new THREE.MeshStandardMaterial({ color: 0x3a3430, roughness: 0.7, metalness: 0.4 });
const partMat = new THREE.MeshStandardMaterial({ color: 0x7d8796, roughness: 0.4, metalness: 0.85 });
const crateMat = new THREE.MeshStandardMaterial({ color: 0x5c4a35, roughness: 0.85 });
const screenMat = new THREE.MeshBasicMaterial({ color: 0x1fd6c9 });
const warnMat = new THREE.MeshBasicMaterial({ color: 0xffb02e });
addShopBox(mikaShop, 0.75, 0.08, 1.9, benchMat, -1.55, 0.92, -1.75);                 // bench top
for (const z of [-0.9, -2.6]) addShopBox(mikaShop, 0.65, 0.9, 0.08, benchMat, -1.55, 0.45, z);
addShopBox(mikaShop, 0.05, 1.2, 1.9, new THREE.MeshStandardMaterial({ color: 0x2a3038, roughness: 0.8 }), -1.95, 1.75, -1.75); // pegboard
for (let i = 0; i < 6; i++) addShopBox(mikaShop, 0.04, 0.25 + (i % 3) * 0.1, 0.05, partMat, -1.9, 1.6 + (i % 2) * 0.35, -1.0 - i * 0.28);
addShopBox(mikaShop, 0.35, 0.22, 0.3, partMat, -1.5, 1.07, -1.3);                    // vice
addShopBox(mikaShop, 0.5, 0.32, 0.03, screenMat, -1.75, 1.3, -2.35).rotation.y = 0.5; // diagnostic screen
addShopBox(mikaShop, 0.12, 0.12, 0.6, partMat, -1.4, 1.02, -2.0).rotation.z = 0.3;   // spare robotic forearm
for (let i = 0; i < 4; i++) {                                                         // shelves on the back wall
  addShopBox(mikaShop, 1.7, 0.05, 0.35, benchMat, 0.9, 0.7 + i * 0.6, -2.75);
  for (let k = 0; k < 3; k++) addShopBox(mikaShop, 0.32, 0.25, 0.28, k % 2 ? crateMat : partMat, 0.35 + k * 0.55, 0.86 + i * 0.6, -2.75);
}
addShopBox(mikaShop, 0.03, 0.03, 3.0, warnMat, 2.0, 2.85, -1.5);                     // hazard trim
const mikaLamp = addShopBox(mikaShop, 0.5, 0.05, 0.2, new THREE.MeshBasicMaterial({ color: 0xfff2d6 }), -1.4, 2.6, -1.75);
// Extra interior colliders (local shop coordinates): bench, shelves, core stand.
const shopInteriorBoxes = [
  { minX: -1.98, maxX: -1.15, minZ: -2.75, maxZ: -0.75 },
  { minX: -0.1, maxX: 1.98, minZ: -2.98, maxZ: -2.55 },
  { minX: -0.62, maxX: 0.62, minZ: -2.25, maxZ: -1.0 }
];

for (const x of [-0.82, 0.82]) {
  addShopBox(mikaShop, 0.09, 2.72, 0.12, shopTrimMaterial, x, 1.36, 0.16);
  addShopBox(mikaShop, 0.035, 2.66, 0.025, shopNeonMaterial, x, 1.36, 0.232);
}
addShopBox(mikaShop, 1.78, 0.09, 0.12, shopTrimMaterial, 0, 2.68, 0.16);
addShopBox(mikaShop, 1.66, 0.025, 0.025, shopRedMaterial, 0, 2.68, 0.232);

// Door leaf pivots on its left edge. Trigger interaction toggles its target angle.
const shopDoorHinge = new THREE.Group();
shopDoorHinge.position.set(-0.76, 0.12, 0.19);
mikaShop.add(shopDoorHinge);
const shopDoorLeaf = new THREE.Group();
shopDoorLeaf.name = "MIKA_SHOP_DOOR";
shopDoorHinge.add(shopDoorLeaf);
addShopBox(shopDoorLeaf, 1.48, 2.52, 0.13, shopTrimMaterial, 0.74, 1.26, 0);
addShopBox(shopDoorLeaf, 1.30, 2.30, 0.025, shopWallMaterial, 0.74, 1.26, 0.078);
addShopBox(shopDoorLeaf, 0.82, 0.055, 0.018, shopRedMaterial, 0.74, 1.87, 0.098);
addShopBox(shopDoorLeaf, 0.82, 0.035, 0.018, shopNeonMaterial, 0.74, 0.62, 0.098);
addShopBox(shopDoorLeaf, 0.045, 0.22, 0.06, shopNeonMaterial, 1.27, 1.25, 0.13);
const shopDoorHandle = new THREE.Mesh(
  new THREE.SphereGeometry(0.045, 12, 10),
  new THREE.MeshStandardMaterial({ color: 0xd8e8f3, metalness: 0.9, roughness: 0.2 })
);
shopDoorHandle.position.set(1.27, 1.25, 0.15);
shopDoorLeaf.add(shopDoorHandle);
let shopDoorTarget = 0;
shopDoorLeaf.traverse(o => { if (o.isMesh) mikaShopBlockers.push(o); });
// Invisible, slightly thicker box over the door so desktop players can aim F at it.
const shopDoorAim = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.5, 0.3), new THREE.MeshBasicMaterial({ visible: false }));
shopDoorAim.position.set(0.74, 1.26, 0.05);
shopDoorLeaf.add(shopDoorAim);
const shopDoorHitObjects = [shopDoorLeaf];
shopDoorLeaf.traverse(object => {
  if (object.isMesh) shopDoorHitObjects.push(object);
});

// Simple player-radius collision against the workshop's actual wall pieces.
// Coordinates are local to Mika's shop. The doorway stays open only when the
// hinged door has swung far enough to clear the player's shoulder width.
const SHOP_PLAYER_RADIUS = 0.31;
const shopWallBoxes = [
  { minX: -2.22, maxX: -0.88, minZ: -0.14, maxZ: 0.14 }, // front left wall
  { minX:  0.88, maxX:  2.22, minZ: -0.14, maxZ: 0.14 }, // front right wall
  { minX: -2.18, maxX: -1.98, minZ: -3.03, maxZ: 0.07 }, // left side wall
  { minX:  1.98, maxX:  2.18, minZ: -3.03, maxZ: 0.07 }  // right side wall
];
function playerOverlapsShopBox(worldX, worldZ, box) {
  // Convert the world position into the shop's rotated local space.
  const ox = worldX - mikaShop.position.x;
  const oz = worldZ - mikaShop.position.z;
  const c = Math.cos(mikaShop.rotation.y), s = Math.sin(mikaShop.rotation.y);
  const localX = ox * c - oz * s;
  const localZ = ox * s + oz * c;
  const closestX = THREE.MathUtils.clamp(localX, box.minX, box.maxX);
  const closestZ = THREE.MathUtils.clamp(localZ, box.minZ, box.maxZ);
  const dx = localX - closestX;
  const dz = localZ - closestZ;
  return dx * dx + dz * dz < SHOP_PLAYER_RADIUS * SHOP_PLAYER_RADIUS;
}
function collidesWithMikaShop(worldX, worldZ) {
  if (shopWallBoxes.some(box => playerOverlapsShopBox(worldX, worldZ, box))) {
    return true;
  }
  if (shopInteriorBoxes.some(box => playerOverlapsShopBox(worldX, worldZ, box))) return true;
  // back wall
  if (playerOverlapsShopBox(worldX, worldZ, { minX: -2.18, maxX: 2.18, minZ: -3.15, maxZ: -2.95 })) return true;
  // The closed door fills the doorway. Once it is opened past 0.92 radians,
  // its leaf is considered clear of the walking path.
  if (shopDoorHinge.rotation.y > -0.92 && shopDoorHinge.rotation.y < 0.5) {
    const doorBox = { minX: -0.78, maxX: 0.75, minZ: 0.10, maxZ: 0.28 };
    if (playerOverlapsShopBox(worldX, worldZ, doorBox)) return true;
  }
  return false;
}

// 3D sign above the entrance.
const signCanvas = document.createElement("canvas");
signCanvas.width = 512;
signCanvas.height = 128;
const signContext = signCanvas.getContext("2d");
signContext.fillStyle = "#071321";
signContext.fillRect(0, 0, 512, 128);
signContext.strokeStyle = "#38e8dc";
signContext.lineWidth = 6;
signContext.strokeRect(5, 5, 502, 118);
signContext.fillStyle = "#eafaff";
signContext.font = "bold 48px Arial";
signContext.textAlign = "center";
signContext.fillText("MIKA'S REPAIR", 256, 78);
const signTexture = new THREE.CanvasTexture(signCanvas);
signTexture.colorSpace = THREE.SRGBColorSpace;
const shopSign = new THREE.Mesh(
  new THREE.PlaneGeometry(2.5, 0.62),
  new THREE.MeshBasicMaterial({ map: signTexture, transparent: true })
);
shopSign.position.set(0, 3.38, 0.18);
mikaShop.add(shopSign);

const hintCanvas = document.createElement("canvas");
hintCanvas.width = 512;
hintCanvas.height = 96;
const hintContext = hintCanvas.getContext("2d");
hintContext.fillStyle = "rgba(4,10,22,0.9)";
hintContext.fillRect(0, 0, 512, 96);
hintContext.strokeStyle = "#5ff5e8";
hintContext.lineWidth = 4;
hintContext.strokeRect(3, 3, 506, 90);
hintContext.fillStyle = "#f0fdff";
hintContext.font = "bold 30px Arial";
hintContext.textAlign = "center";
hintContext.fillText("GRAB HANDLE + TWIST  ·  PC: F", 256, 59);
const hintTexture = new THREE.CanvasTexture(hintCanvas);
hintTexture.colorSpace = THREE.SRGBColorSpace;
const shopHint = new THREE.Mesh(
  new THREE.PlaneGeometry(2.0, 0.38),
  new THREE.MeshBasicMaterial({ map: hintTexture, transparent: true })
);
shopHint.position.set(0, 3.88, 0.18);
mikaShop.add(shopHint);

const shopLight = new THREE.PointLight(0x31e9dd, 3.2, 8);
shopLight.position.set(0, 2.4, 1.0);
mikaShop.add(shopLight);

// Genesis Core display stand. The uploaded Blockbench model is loaded as a
// glTF asset and presented inside Mika's workshop; pickup behavior comes later.
const genesisCoreDisplay = new THREE.Group();
genesisCoreDisplay.name = "GENESIS_CORE_DISPLAY";
genesisCoreDisplay.position.set(0, 0, -1.62);
mikaShop.add(genesisCoreDisplay);

const coreStandMaterial = new THREE.MeshStandardMaterial({
  color: 0x182538, metalness: 0.88, roughness: 0.3
});
const coreStandGlow = new THREE.MeshStandardMaterial({
  color: 0x35e9e0, emissive: 0x087b78, emissiveIntensity: 1.15,
  metalness: 0.6, roughness: 0.25
});
const coreStandBase = new THREE.Mesh(
  new THREE.CylinderGeometry(0.68, 0.78, 0.48, 32),
  coreStandMaterial
);
coreStandBase.position.y = 0.24;
genesisCoreDisplay.add(coreStandBase);
const coreStandTop = new THREE.Mesh(
  new THREE.CylinderGeometry(0.72, 0.72, 0.07, 32),
  coreStandGlow
);
coreStandTop.position.y = 0.49;
genesisCoreDisplay.add(coreStandTop);
const coreDisplayRing = new THREE.Mesh(
  new THREE.TorusGeometry(0.57, 0.018, 8, 48),
  new THREE.MeshBasicMaterial({ color: 0x39f4e7 })
);
coreDisplayRing.rotation.x = Math.PI / 2;
coreDisplayRing.position.y = 0.54;
genesisCoreDisplay.add(coreDisplayRing);

// Display atmosphere: a soft light, a holographic projection cone, two slow
// orbit rings and drifting energy motes around the core.
const coreLight = new THREE.PointLight(0x38f0e6, 9, 6, 1.4);
coreLight.position.set(0, 1.25, 0.2);
genesisCoreDisplay.add(coreLight);
const coreBeamMat = new THREE.MeshBasicMaterial({ color: 0x38f0e6, transparent: true, opacity: 0.1,
  blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const coreBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.6, 1.5, 24, 1, true), coreBeamMat);
coreBeam.position.y = 1.3;
genesisCoreDisplay.add(coreBeam);
const coreOrbitMat = new THREE.MeshBasicMaterial({ color: 0x8ffcff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
const coreOrbitA = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.008, 6, 64), coreOrbitMat);
const coreOrbitB = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.006, 6, 64), coreOrbitMat);
coreOrbitA.position.y = coreOrbitB.position.y = 1.15;
genesisCoreDisplay.add(coreOrbitA, coreOrbitB);
const MOTES = 36;
const motePositions = new Float32Array(MOTES * 3);
const moteGeometry = new THREE.BufferGeometry();
moteGeometry.setAttribute("position", new THREE.BufferAttribute(motePositions, 3));
const coreMotes = new THREE.Points(moteGeometry, new THREE.PointsMaterial({ color: 0x9ffcff, size: 0.025,
  transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
coreMotes.frustumCulled = false;
genesisCoreDisplay.add(coreMotes);
// Hazard-striped floor ring and a small plaque in front of the stand.
const corePlaqueCanvas = document.createElement("canvas");
corePlaqueCanvas.width = 512; corePlaqueCanvas.height = 128;
{
  const c = corePlaqueCanvas.getContext("2d");
  c.fillStyle = "#0a1220"; c.fillRect(0, 0, 512, 128);
  c.strokeStyle = "#38f0e6"; c.lineWidth = 4; c.strokeRect(4, 4, 504, 120);
  c.fillStyle = "#9ffcff"; c.font = "bold 40px Arial"; c.textAlign = "center"; c.fillText("GENESIS CORE", 256, 58);
  c.fillStyle = "#6f8aa8"; c.font = "22px Arial"; c.fillText("SALVAGE LOT 0-71 · DO NOT TOUCH (MIKA)", 256, 98);
}
const corePlaqueTexture = new THREE.CanvasTexture(corePlaqueCanvas);
corePlaqueTexture.colorSpace = THREE.SRGBColorSpace;
const corePlaque = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.15), new THREE.MeshBasicMaterial({ map: corePlaqueTexture }));
corePlaque.position.set(0, 0.3, 0.79);
corePlaque.rotation.x = -0.35;
genesisCoreDisplay.add(corePlaque);
let coreFlareTime = -10;
function flareGenesisCore() { coreFlareTime = performance.now(); }
function animateGenesisCore(time) {
  const flare = Math.max(0, 1 - (performance.now() - coreFlareTime) / 1800);
  coreLight.intensity = 9 + Math.sin(time * 0.003) * 1.5 + flare * 40;
  coreBeamMat.opacity = 0.08 + Math.sin(time * 0.002) * 0.03 + flare * 0.35;
  coreOrbitA.rotation.set(Math.PI / 2 + Math.sin(time * 0.0007) * 0.4, time * 0.0009, 0);
  coreOrbitB.rotation.set(Math.PI / 2.6, -time * 0.0006, Math.cos(time * 0.0005) * 0.3);
  const s = 1 + flare * 0.5;
  coreOrbitA.scale.setScalar(s); coreOrbitB.scale.setScalar(s);
  for (let i = 0; i < MOTES; i++) {
    const a = time * 0.0004 * (1 + (i % 5) * 0.2) + i * 1.7;
    const r = 0.35 + (i % 7) * 0.06 + flare * 0.4;
    motePositions[i * 3] = Math.cos(a) * r;
    motePositions[i * 3 + 1] = 0.75 + ((time * 0.00015 + i * 0.13) % 1) * 1.1;
    motePositions[i * 3 + 2] = Math.sin(a) * r;
  }
  moteGeometry.attributes.position.needsUpdate = true;
}

// Genesis Core v2: a detailed model (genesis_core_v2.glb, built by
// tools/build_genesis_core.html). If it fails to load, the original
// Blockbench model (Genisis_ core.gltf, kept as a backup) is used instead.
let genesisCoreModel = null;
let genesisCoreParts = null;
const CORE_BASE_Y = 0.52;
// Animated plasma shader for the energy sphere: swirling noise + bright rim.
const coreEnergyUniforms = { uTime: { value: 0 }, uFlare: { value: 0 } };
const coreEnergyMaterial = new THREE.ShaderMaterial({
  uniforms: coreEnergyUniforms,
  vertexShader: `
    varying vec3 vPos; varying vec3 vNormal; varying vec3 vView;
    uniform float uTime;
    void main() {
      vPos = position;
      vec3 p = position * (1.0 + 0.04 * sin(uTime * 3.0 + position.y * 40.0));
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      vNormal = normalize(normalMatrix * normal);
      vView = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    varying vec3 vPos; varying vec3 vNormal; varying vec3 vView;
    uniform float uTime; uniform float uFlare;
    float hash(vec3 p) { return fract(sin(dot(p, vec3(17.1, 113.3, 41.7))) * 43758.5453); }
    float noise(vec3 p) {
      vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                 mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
    }
    void main() {
      vec3 p = normalize(vPos) * 3.0;
      float n = noise(p + vec3(0.0, uTime * 0.9, uTime * 0.4)) * 0.6 + noise(p * 2.3 - uTime * 0.7) * 0.4;
      float veins = smoothstep(0.42, 0.5, n) - smoothstep(0.5, 0.58, n);
      float rim = pow(1.0 - max(dot(vNormal, vView), 0.0), 2.2);
      vec3 deep = vec3(0.02, 0.35, 0.55), cyan = vec3(0.25, 0.95, 0.92), violet = vec3(0.7, 0.35, 1.0);
      vec3 col = mix(deep, cyan, smoothstep(0.25, 0.85, n)) * 0.9 + violet * veins * 1.4 + cyan * rim * 0.9;
      col *= 1.0 + uFlare * 2.0;
      gl_FragColor = vec4(col, 1.0);
    }`
});
function prepareGenesisCore(model, isV2) {
  model.traverse(object => {
    if (!object.isMesh) return;
    const name = object.name.toLowerCase();
    const materialName = (object.material?.name || "").toLowerCase();
    if (name.includes("energy") || materialName.includes("energy")) {
      object.material = coreEnergyMaterial;
    } else if (object.material?.emissive && (name.startsWith("glow") || materialName.startsWith("glow"))) {
      object.material.emissiveIntensity = 1.8;
    } else if (materialName.includes("glass")) {
      object.material.opacity = 0.08;
      object.material.depthWrite = false;
    }
  });
  if (isV2) {
    genesisCoreParts = {
      outer: model.getObjectByName("ring_outer"),
      inner: model.getObjectByName("ring_inner"),
      crown: model.getObjectByName("crown")
    };
  }
}
const genesisCoreLoader = new GLTFLoader();
function loadOriginalGenesisCore() {
  genesisCoreLoader.load(new URL("../Genisis_%20core.gltf", import.meta.url).href, gltf => {
    genesisCoreModel = gltf.scene;
    genesisCoreModel.name = "GENESIS_CORE_BLOCKBENCH_MODEL";
    genesisCoreModel.scale.setScalar(1.25);
    genesisCoreModel.position.set(0, CORE_BASE_Y, 0);
    // The energy lens was built on the model's -Z face; turn it to the entrance.
    genesisCoreModel.rotation.y = Math.PI;
    prepareGenesisCore(genesisCoreModel, false);
    genesisCoreDisplay.add(genesisCoreModel);
  }, undefined, error => console.error("Could not load the Genesis Core model:", error));
}
genesisCoreLoader.load(
  new URL("../genesis_core_v2.glb", import.meta.url).href,
  gltf => {
    genesisCoreModel = gltf.scene;
    genesisCoreModel.name = "GENESIS_CORE_V2";
    genesisCoreModel.position.set(0, CORE_BASE_Y, 0);
    genesisCoreModel.scale.setScalar(1.15);
    prepareGenesisCore(genesisCoreModel, true);
    genesisCoreDisplay.add(genesisCoreModel);
    // The v2 model has its own gyroscope rings, so retire the old floating ones
    // and the projection cone that hid the model's detail.
    coreOrbitA.visible = coreOrbitB.visible = false;
    coreBeam.visible = false;
  },
  undefined,
  error => { console.warn("Genesis Core v2 failed to load, using the original model.", error); loadOriginalGenesisCore(); }
);

// Main-menu showcase world: a dark neon armory stage with a distant skyline.
const mainMenuWorld = new THREE.Group();
mainMenuWorld.name = "MAIN_MENU_WORLD";
scene.add(mainMenuWorld);

mainMenuWorld.add(new THREE.HemisphereLight(0x9ab9ff, 0x100b22, 1.8));
const menuKeyLight = new THREE.PointLight(0x4cefe4, 32, 20);
menuKeyLight.position.set(-3, 5, 4);
mainMenuWorld.add(menuKeyLight);
const menuRimLight = new THREE.PointLight(0xb34bff, 28, 18);
menuRimLight.position.set(4, 3, -1);
mainMenuWorld.add(menuRimLight);

const menuFloor = new THREE.Mesh(
  new THREE.PlaneGeometry(90, 90),
  new THREE.MeshStandardMaterial({ color: 0x070b18, roughness: 0.72, metalness: 0.32 })
);
menuFloor.rotation.x = -Math.PI / 2;
menuFloor.position.y = -0.035;
mainMenuWorld.add(menuFloor);

const skylineMaterials = [
  new THREE.MeshStandardMaterial({ color: 0x10182b, roughness: 0.8, metalness: 0.35 }),
  new THREE.MeshStandardMaterial({ color: 0x17132a, roughness: 0.8, metalness: 0.4 }),
  new THREE.MeshStandardMaterial({ color: 0x0d202a, roughness: 0.8, metalness: 0.35 })
];
const skylineGlowMaterials = [
  new THREE.MeshBasicMaterial({ color: 0x24cfc9 }),
  new THREE.MeshBasicMaterial({ color: 0x9c45e9 }),
  new THREE.MeshBasicMaterial({ color: 0xff4f9a })
];
for (let i = 0; i < 17; i++) {
  const x = (i - 8) * 3.1;
  const width = 1.8 + (i % 3) * 0.45;
  const height = 7 + ((i * 7) % 9);
  const tower = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, 2.3),
    skylineMaterials[i % skylineMaterials.length]
  );
  tower.position.set(x, height / 2 - 0.1, -10 - (i % 4) * 1.8);
  mainMenuWorld.add(tower);
  for (let band = 0; band < 3; band++) {
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.82, 0.035, 0.045),
      skylineGlowMaterials[(i + band) % skylineGlowMaterials.length]
    );
    strip.position.set(x, 1.5 + band * 1.25, -8.82 - (i % 4) * 1.8);
    mainMenuWorld.add(strip);
  }
}

// These are fictional, non-functional sci-fi display props: bold shapes,
// glowing energy details and no realistic firing or mechanical systems.
function createCyberpunkDisplayProp(primaryHex, glowHex, length, variant) {
  // Stylized, non-functional energy display props with layered armor and light channels.
  const prop = new THREE.Group();
  prop.scale.setScalar(length / 2.65);

  const shell = new THREE.MeshStandardMaterial({ color: primaryHex, metalness: 0.88, roughness: 0.24 });
  const armor = new THREE.MeshStandardMaterial({
    color: variant === 1 ? 0x35475b : 0x46334f, metalness: 0.78, roughness: 0.3
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0b1220, metalness: 0.9, roughness: 0.22 });
  const inset = new THREE.MeshStandardMaterial({ color: 0x18263a, metalness: 0.82, roughness: 0.32 });
  const glow = new THREE.MeshStandardMaterial({
    color: glowHex, emissive: glowHex, emissiveIntensity: 1.65, metalness: 0.42, roughness: 0.2
  });
  const trim = new THREE.MeshStandardMaterial({ color: 0x9aabc0, metalness: 0.9, roughness: 0.22 });

  const addBox = (w, h, d, x, y, z, material, rz = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.rotation.z = rz;
    prop.add(mesh);
    return mesh;
  };

  // Faceted, bevelled main shell instead of a stack of plain rectangles.
  const hullShape = new THREE.Shape();
  hullShape.moveTo(-1.28, -0.16);
  hullShape.lineTo(-1.13, -0.28);
  hullShape.lineTo(-0.77, -0.25);
  hullShape.lineTo(-0.55, -0.15);
  hullShape.lineTo(-0.32, -0.29);
  hullShape.lineTo(0.02, -0.27);
  hullShape.lineTo(0.18, -0.16);
  hullShape.lineTo(0.96, -0.14);
  hullShape.lineTo(1.23, -0.06);
  hullShape.lineTo(1.29, 0.05);
  hullShape.lineTo(1.08, 0.14);
  hullShape.lineTo(0.32, 0.17);
  hullShape.lineTo(0.12, 0.29);
  hullShape.lineTo(-0.57, 0.27);
  hullShape.lineTo(-0.78, 0.17);
  hullShape.lineTo(-1.17, 0.19);
  hullShape.closePath();
  const hullGeometry = new THREE.ExtrudeGeometry(hullShape, {
    depth: 0.42, bevelEnabled: true, bevelSegments: 3,
    steps: 1, bevelSize: 0.045, bevelThickness: 0.04, curveSegments: 5
  });
  hullGeometry.translate(0, 0, -0.21);
  prop.add(new THREE.Mesh(hullGeometry, shell));

  // Raised top spine and faceted side armor add depth and metallic highlights.
  addBox(1.34, 0.075, 0.48, -0.02, 0.245, 0, armor, -0.015);
  addBox(0.62, 0.055, 0.52, -0.34, 0.31, 0, dark, 0.02);
  addBox(0.58, 0.055, 0.42, 0.40, 0.215, 0, trim, -0.015);
  addBox(0.48, 0.035, 0.44, 0.39, 0.255, 0, glow, -0.015);

  const sidePlateShape = new THREE.Shape();
  sidePlateShape.moveTo(-0.88, -0.075);
  sidePlateShape.lineTo(-0.68, -0.15);
  sidePlateShape.lineTo(0.66, -0.12);
  sidePlateShape.lineTo(0.88, -0.015);
  sidePlateShape.lineTo(0.70, 0.105);
  sidePlateShape.lineTo(-0.65, 0.11);
  sidePlateShape.lineTo(-0.88, 0.035);
  sidePlateShape.closePath();
  const plateGeometry = new THREE.ExtrudeGeometry(sidePlateShape, {
    depth: 0.035, bevelEnabled: true, bevelSegments: 2,
    steps: 1, bevelSize: 0.018, bevelThickness: 0.012
  });
  plateGeometry.translate(0, 0, -0.0175);
  const plateMaterial = armor.clone();
  plateMaterial.side = THREE.DoubleSide;
  for (const side of [-1, 1]) {
    const plate = new THREE.Mesh(plateGeometry, plateMaterial);
    plate.position.set(0, 0, side * 0.225);
    prop.add(plate);

    // Recessed energy channel, inset panels and tiny status lights.
    addBox(1.18, 0.035, 0.025, 0, 0.018, side * 0.253, glow);
    addBox(0.54, 0.026, 0.028, -0.40, -0.085, side * 0.254, inset);
    addBox(0.34, 0.025, 0.03, 0.43, -0.075, side * 0.254, dark);
    for (let i = 0; i < 4; i++) {
      addBox(0.105, 0.018, 0.028, -0.52 + i * 0.13, -0.12, side * 0.258, trim, -0.08);
    }
    const statusLight = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), glow);
    statusLight.position.set(0.72, 0.055, side * 0.265);
    prop.add(statusLight);
  }

  // A luminous energy aperture, intentionally not a functional barrel.
  const emitterHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.19, 0.22, 12), dark);
  emitterHousing.rotation.z = -Math.PI / 2;
  emitterHousing.position.set(1.25, 0.005, 0);
  prop.add(emitterHousing);
  const emitterRing = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.035, 10, 24), glow);
  emitterRing.rotation.y = Math.PI / 2;
  emitterRing.position.set(1.38, 0.005, 0);
  prop.add(emitterRing);
  const emitterCore = new THREE.Mesh(
    new THREE.CircleGeometry(0.105, 20),
    new THREE.MeshBasicMaterial({ color: glowHex })
  );
  emitterCore.position.set(1.391, 0.005, 0);
  emitterCore.rotation.y = Math.PI / 2;
  prop.add(emitterCore);

  // Underside shell and layered fins finish the rear silhouette.
  addBox(0.34, 0.36, 0.34, -0.47, -0.31, 0, dark, 0.12);
  addBox(0.42, 0.075, 0.42, -0.55, -0.43, 0, armor, 0.12);
  addBox(0.27, 0.08, 0.49, -0.90, 0.22, 0, dark, -0.08);
  addBox(0.22, 0.045, 0.53, -0.96, 0.27, 0, glow, -0.08);
  addBox(0.24, 0.07, 0.46, 0.02, 0.37, 0, trim, 0.02);

  // Decorative fasteners: purely cosmetic surface details.
  for (const side of [-1, 1]) {
    for (const x of [-0.72, 0.72]) {
      const fastener = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 6), trim);
      fastener.position.set(x, 0.02, side * 0.27);
      prop.add(fastener);
    }
  }
  return prop;
}

const menuPlatform = new THREE.Mesh(
  new THREE.CylinderGeometry(1.9, 2.08, 0.22, 64),
  new THREE.MeshStandardMaterial({ color: 0x111a2b, metalness: 0.88, roughness: 0.25 })
);
menuPlatform.position.set(0, 0.02, 2.4);
mainMenuWorld.add(menuPlatform);

const platformRing = new THREE.Mesh(
  new THREE.TorusGeometry(1.92, 0.035, 10, 96),
  new THREE.MeshBasicMaterial({ color: 0x42f4e8 })
);
platformRing.rotation.x = Math.PI / 2;
platformRing.position.set(0, 0.15, 2.4);
mainMenuWorld.add(platformRing);

const platformRingInner = new THREE.Mesh(
  new THREE.TorusGeometry(1.52, 0.018, 8, 96),
  new THREE.MeshBasicMaterial({ color: 0xa64cff })
);
platformRingInner.rotation.x = Math.PI / 2;
platformRingInner.position.set(0, 0.16, 2.4);
mainMenuWorld.add(platformRingInner);

const crossedProps = new THREE.Group();
crossedProps.name = "CROSSED_CYBERPUNK_PROPS";
crossedProps.position.set(0, 1.72, 2.4);
mainMenuWorld.add(crossedProps);

const displayPropA = createCyberpunkDisplayProp(0x25364c, 0x27e8df, 2.65, 1);
displayPropA.rotation.z = Math.PI * 0.245;
displayPropA.position.set(0, 0.025, -0.13);
crossedProps.add(displayPropA);

const displayPropB = createCyberpunkDisplayProp(0x30233f, 0xff4c9c, 2.4, 2);
displayPropB.rotation.z = -Math.PI * 0.245;
displayPropB.position.set(0, -0.015, 0.13);
crossedProps.add(displayPropB);

const showcaseLight = new THREE.PointLight(0x43dfe6, 8, 7);
showcaseLight.position.set(0, 2.2, 2.2);
mainMenuWorld.add(showcaseLight);

// Character, credits, cyberware and story progress live in state.js and are
// saved automatically on this device. `character` is the live stats object.
const character = state.character;

function updateCharacterUI() {
  document.querySelector("#points-left").textContent = pointsLeft();
  document.querySelector("#points-total").textContent = totalPoints();
  document.querySelector("#strength-value").textContent = character.strength;
  document.querySelector("#health-value").textContent = character.health;
  document.querySelector("#compatibility-value").textContent = character.compatibility;
  document.querySelector("#max-health").textContent = maxHealth();
  document.querySelector("#cyber-grade").textContent = gradeName(character.compatibility);
  // level + XP bar (PC HUD and character panel)
  for (const id of ["#xp-level", "#char-level"]) { const el = document.querySelector(id); if (el) el.textContent = `LV ${level()}`; }
  const xpFill = document.querySelector("#xp-fill"); if (xpFill) xpFill.style.width = `${xpIntoLevel() / XP_PER_LEVEL * 100}%`;
  const xpText = document.querySelector("#xp-text"); if (xpText) xpText.textContent = `${xpIntoLevel()} / ${XP_PER_LEVEL} XP`;
  document.querySelector("#credits").textContent = "$" + state.credits.toLocaleString();
  document.querySelector("#shop-credits").textContent = "$" + state.credits.toLocaleString();
  document.querySelectorAll("[data-stat][data-change]").forEach(button => {
    const stat = button.dataset.stat;
    const change = Number(button.dataset.change);
    button.disabled = change > 0 ? (pointsLeft() <= 0 || character[stat] >= MAX_STAT) : character[stat] <= 0;
  });
  // Cyberware list in the desktop menu
  const list = document.querySelector("#cyberware-list");
  if (list) {
    document.querySelector("#slot-count").textContent = `${state.installed.length} / ${slotCount()}`;
    list.innerHTML = "";
    const owned = Object.keys(CYBERWARE).filter(id => state.owned.includes(id));
    if (!owned.length) list.innerHTML = '<p class="panel-note">No cyberware yet. Doc Anaya runs the Second Skin clinic in Neon Mile.</p>';
    for (const id of owned) {
      const w = CYBERWARE[id];
      const row = document.createElement("div");
      row.className = "ware-row";
      const installed = state.installed.includes(id);
      const inactive = installed && !isActive(id);
      row.innerHTML = `<div><strong>${w.name}</strong><p>${w.desc}${inactive ? " <em>(needs COMPATIBILITY " + w.req + ")</em>" : ""}</p></div>`;
      const btn = document.createElement("button");
      btn.className = "ui-button" + (installed ? " accent" : "");
      btn.textContent = installed ? "REMOVE" : "INSTALL";
      btn.addEventListener("click", () => { const r = toggleInstall(id); if (r === "no-slots") game?.toast("No free slots. Raise COMPATIBILITY or remove something.", "warn"); updateCharacterUI(); });
      row.appendChild(btn);
      list.appendChild(row);
    }
  }
  const obj = game?.objectiveSummary();
  if (obj) {
    document.querySelector("#menu-objective-title").textContent = obj.title;
    document.querySelector("#menu-objective-text").textContent = obj.text;
  }
  if (vrMenu?.visible) drawVRMenu();
}

document.querySelectorAll("[data-stat][data-change]").forEach(button => {
  button.addEventListener("click", () => {
    changeStat(button.dataset.stat, Number(button.dataset.change));
    updateCharacterUI();
  });
});

// Controls shown on the Settings page (PC menu and VR wrist menu).
const CONTROLS_VR = [
  ["Move", "Left stick"], ["Sprint", "Click left stick"], ["Turn", "Right stick"], ["Jump", "A"],
  ["Interact / talk / grab", "Point + trigger"], ["Dialogue choice", "Point + trigger"],
  ["Make a fist / punch", "Squeeze grip + swing"], ["Palm blast (needs Pulse Emitter)", "Trigger, open hand"],
  ["Guard", "Both fists up at face"], ["Med patch", "X"], ["Chrono Spike (cyberware)", "B"],
  ["Menu", "Y"], ["Mika's door", "Grab handle + twist"],
  ["Pick up / throw", "Grip near it, swing, let go"], ["Stash in backpack", "Let go over your shoulder"], ["Open backpack", "Grip over your shoulder"],
  ["Med patch (hip)", "Grip at hip, press to arm"], ["Eat food", "Hold it to your mouth"], ["Optic Scan", "Hand to temple + trigger"], ["Tether Line", "Aim at anchor + trigger"]
];
const CONTROLS_PC = [
  ["Move", "W A S D"], ["Sprint", "Hold Shift"], ["Look", "Mouse (click to lock)"], ["Jump", "Space"],
  ["Interact / talk", "F or click"], ["Dialogue choice", "1 - 4"], ["Punch", "Left click"], ["Palm blast (Pulse Emitter)", "Right click"],
  ["Guard", "Hold C"], ["Med patch", "Q"], ["Chrono Spike", "V"], ["Menu", "E"], ["Mute sound", "M"],
  ["Pick up / take", "F"], ["Throw what you're holding", "Left click"], ["Backpack", "I"], ["Optic Scan", "R"], ["Tether Line", "G"]
];
const characterPanel = document.querySelector("#character-panel");
const shopPanel = document.querySelector("#shop-panel");
const settingsPanel = document.querySelector("#settings-panel");
const mapPanel = document.querySelector("#map-panel");
function showPanel(panel) {
  const wasOpen = !panel.hidden;
  characterPanel.hidden = true;
  shopPanel.hidden = true;
  settingsPanel.hidden = true;
  if (mapPanel) mapPanel.hidden = true;
  if (panel === mapPanel && wasOpen === false) setTimeout(drawPCMap, 0);
  if (!wasOpen) panel.hidden = false;
}

function openGameMenu() {
  gameUI.classList.remove("menu-closed");
  gameUI.classList.add("menu-open");
  if (!renderer.xr.isPresenting && document.pointerLockElement === renderer.domElement) {
    document.exitPointerLock?.();
  }
}
function closeGameMenu() {
  gameUI.classList.remove("menu-open");
  gameUI.classList.add("menu-closed");
  characterPanel.hidden = true;
  shopPanel.hidden = true;
  settingsPanel.hidden = true;
  if (!renderer.xr.isPresenting) renderer.domElement.requestPointerLock?.();
}
function toggleGameMenu() {
  if (gameUI.classList.contains("menu-open")) closeGameMenu();
  else openGameMenu();
}
document.addEventListener("keydown", event => {
  if (intro.active && !renderer.xr.isPresenting) {
    if (["Space", "Enter", "KeyF", "ArrowRight"].includes(event.code)) { event.preventDefault(); intro.next(); }
    if (event.code === "Escape") intro.skip();
    return;
  }
  if (game && isInCity && !renderer.xr.isPresenting) {
    if (game.handleKey(event.code)) { event.preventDefault(); return; }
    if (event.code === "KeyF" && !gameUI.classList.contains("menu-open")) { event.preventDefault(); game.desktopInteract(); return; }
    if (event.code === "KeyQ") { combat.useMedPatch(); return; }
    if (event.code === "KeyV") { combat.useChrono(); return; }
    if (arcade.active && (event.code === "KeyF" || event.code === "Escape")) { arcade.stop(); return; }
    if (event.code === "KeyR") { gear.toggleScan(); return; }
    if (event.code === "KeyG") { gear.desktopTether(); return; }
    if (event.code === "KeyI") { gear.openBackpack(); return; }
  }
  if (event.code === "KeyE" && !renderer.xr.isPresenting) {
    event.preventDefault();
    toggleGameMenu();
  }
  if (event.code === "Escape" && gameUI.classList.contains("menu-open")) closeGameMenu();
});
document.querySelector("#character-toggle").addEventListener("click", () => showPanel(characterPanel));
document.querySelector("#shop-toggle").addEventListener("click", () => showPanel(shopPanel));
document.querySelector("#settings-toggle").addEventListener("click", () => showPanel(settingsPanel));
document.querySelector("#map-toggle")?.addEventListener("click", () => showPanel(mapPanel));
function drawPCMap() {
  const cv = document.querySelector("#map-canvas"); if (!cv) return;
  camera.getWorldDirection(cameraDirection);
  drawMap(cv.getContext("2d"), 0, 0, cv.width, cv.height, { player: player.position, yaw: -Math.atan2(cameraDirection.x, -cameraDirection.z), objective: game?.debug.objectivePosition?.() });
  const list = document.querySelector("#travel-list");
  list.innerHTML = TRAVEL.map((t, i) => `<button type="button" class="ui-button" data-travel="${i}" ${isUnlocked(t) ? "" : "disabled"}>${isUnlocked(t) ? t.name : "??? · not found yet"}</button>`).join("");
  list.querySelectorAll("[data-travel]").forEach(b => b.addEventListener("click", () => fastTravel(TRAVEL[+b.dataset.travel])));
}
// Settings: objective guide style + the controls list (same data as the VR menu).
function updateSettingsUI() {
  document.querySelectorAll("[data-guide]").forEach(b => b.classList.toggle("on", b.dataset.guide === guideSettings.guide));
  const note = document.querySelector("#guide-note");
  if (note) note.textContent = guideSettings.guide === "path" ? "A dotted line floats along the streets to your objective." : "A tall light beam stands over your objective.";
  document.querySelectorAll("[data-comfort]").forEach(b => {
    const [k, v] = b.dataset.comfort.split(":");
    b.classList.toggle("on", v ? comfort[k] === v : !!comfort[k]);
    if (!v) b.textContent = (k === "vignette" ? "VIGNETTE" : "SEATED MODE") + (comfort[k] ? " · ON" : " · OFF");
  });
  if (vrMenu?.visible) drawVRMenu();
}
document.querySelectorAll("[data-comfort]").forEach(b => b.addEventListener("click", () => {
  const [k, v] = b.dataset.comfort.split(":");
  if (k === "picture") comfortSys.setPicture(v, scene); else if (k === "turn") comfortSys.setTurn(v); else if (k === "vignette") comfortSys.setVignette(!comfort.vignette); else comfortSys.setSeated(!comfort.seated);
  updateSettingsUI();
}));
document.querySelectorAll("[data-guide]").forEach(b => b.addEventListener("click", () => { setGuideStyle(b.dataset.guide); updateSettingsUI(); }));
function replayIntro() {
  if (!isInCity || intro.active) return;
  closeGameMenu();
  setVRMenuOpen(false);
  game.closePanel();
  if (document.pointerLockElement) document.exitPointerLock?.();
  intro.play(() => {}, [cityWorld]);
}
document.querySelector("#replay-intro")?.addEventListener("click", replayIntro);
for (const [id, list] of [["#controls-vr", CONTROLS_VR], ["#controls-pc", CONTROLS_PC]]) {
  const el = document.querySelector(id);
  if (el) el.innerHTML = list.map(([a, k]) => `<div class="control-row"><span>${a}</span><kbd>${k}</kbd></div>`).join("");
}
document.querySelectorAll("[data-close]").forEach(button => {
  button.addEventListener("click", () => { document.getElementById(button.dataset.close).hidden = true; });
});
// (updateCharacterUI runs once the game systems exist, further below.)

// A true 3D menu for immersive VR. The normal HTML menu remains for desktop,
// because browser DOM overlays are not consistently displayed in Quest VR.
const vrMenu = new THREE.Group();
vrMenu.visible = false;
scene.add(vrMenu);
// These values are replaced with hand-relative placement when the left
// controller connects. The menu is deliberately compact, like a wrist display.
vrMenu.position.set(0, 1.2, 0);
vrMenu.scale.set(0.00062, 0.00062, 0.00062);

const vrMenuCanvas = document.createElement("canvas");
vrMenuCanvas.width = 1024;
vrMenuCanvas.height = 768;
const vrMenuContext = vrMenuCanvas.getContext("2d");
const vrMenuTexture = new THREE.CanvasTexture(vrMenuCanvas);
vrMenuTexture.colorSpace = THREE.SRGBColorSpace;
const vrMenuMaterial = new THREE.MeshBasicMaterial({
  map: vrMenuTexture, transparent: true, side: THREE.DoubleSide, depthTest: false
});
const vrMenuPanel = new THREE.Mesh(new THREE.PlaneGeometry(1024, 768), vrMenuMaterial);
vrMenu.add(vrMenuPanel);
vrMenuPanel.position.z = 0;
vrMenuPanel.renderOrder = 1000;

// World-anchored VR character terminal. Each option is its own 3D card,
// inspired by diegetic spatial menus rather than one large flat splash screen.
const vrStart = new THREE.Group();
vrStart.visible = false;
scene.add(vrStart);
const vrStartTargets = [];
let vrStartReady = false;
let vrStartHovered = null;
let isInCity = false;

// PLAY: a brand-new story first shows the holographic story intro.
function startCity() {
  creator.saveLook();
  worlds.touch();
  if (!state.introSeen && !intro.active) {
    startScreen.classList.add("hidden");
    vrStart.visible = false;
    characterPreview.visible = false;
    vrStartReady = true;
    vrCursor.visible = false;
    intro.play(enterCity, [mainMenuWorld, cityWorld]);
    return;
  }
  enterCity();
}
function enterCity() {
  isInCity = true;
  cityWorld.visible = true;
  mainMenuWorld.visible = false;
  vrStart.visible = false;
  characterPreview.visible = false;
  vrStartReady = true;
  vrStartHovered = null;
  vrMenu.visible = false;
  vrCursor.visible = false;
  startScreen.classList.add("hidden");
  gameUI.classList.add("menu-closed");
  gameUI.classList.remove("menu-open");
  characterPanel.hidden = true;
  shopPanel.hidden = true;
  player.position.set(0, 0, 7);
  player.rotation.set(0, 0, 0);
  // Desktop: you look straight down the street toward Mika's shop and the
  // Spire. In VR the headset decides where you look.
  jumpVelocity = 0;
  previousJumpButton = false;
  shopDoorTarget = 0;
  activeDoorGrab = null;
  shopDoorHinge.rotation.y = 0;
  // First-person on PC and Quest. Hide the head to avoid seeing inside it,
  // but keep the torso and legs visible when the player looks down.
  camera.position.set(0, 1.65, 0);
  pitch = 0;
  camera.rotation.set(0, 0, 0);
  if (playableAvatar) {
    // First-person gameplay shows hands only, not the full body or limbs.
    playableAvatar.root.visible = false;
  }
  if (firstPersonHands) firstPersonHands.visible = !renderer.xr.isPresenting;
  startStatus.textContent = "City loaded. Welcome to Neon Genesis.";
  document.body.classList.add("in-city");
  startAudio();
  city.applyAtmosphere(scene, player.position.z);
  updateCharacterUI();
  game.beginSession();
}

// 3D character preview: the same model is shown on desktop and beside the VR editor.
const characterPreview = new THREE.Group();
characterPreview.name = "LIVE_CHARACTER_PREVIEW";
mainMenuWorld.add(characterPreview);
characterPreview.position.set(1.7, 0, 3.2);

const previewBase = new THREE.Mesh(
  new THREE.CylinderGeometry(0.48, 0.54, 0.12, 40),
  new THREE.MeshStandardMaterial({ color: 0x111b2c, metalness: 0.88, roughness: 0.25 })
);
previewBase.position.y = 0.06;
characterPreview.add(previewBase);
const previewBaseRing = new THREE.Mesh(
  new THREE.TorusGeometry(0.49, 0.018, 8, 48),
  new THREE.MeshBasicMaterial({ color: 0x42f4e8 })
);
previewBaseRing.rotation.x = Math.PI / 2;
previewBaseRing.position.y = 0.125;
characterPreview.add(previewBaseRing);
const previewKeyLight = new THREE.PointLight(0xbffaf5, 9, 5, 1.4);
previewKeyLight.position.set(-0.6, 1.9, 1.5);
const previewFaceLight = new THREE.PointLight(0xffe8d8, 3.5, 2.6, 1.6);
previewFaceLight.position.set(0.3, 1.75, 0.9);
characterPreview.add(previewFaceLight);
characterPreview.add(previewKeyLight);
const previewRimLight = new THREE.PointLight(0xa54dff, 5, 3.5, 1.4);
previewRimLight.position.set(0.9, 1.55, -0.8);
characterPreview.add(previewRimLight);

let avatarModel = null;
let playableAvatar = null;

function disposeAvatarRig(rigRoot) {
  if (!rigRoot) return;
  rigRoot.traverse(object => {
    object.geometry?.dispose();
    if (Array.isArray(object.material)) object.material.forEach(material => material.dispose());
    else object.material?.dispose();
  });
  rigRoot.parent?.remove(rigRoot);
}

// Live preview of the player's character on the menu stage / beside the VR terminal.
let previewRig = null;
function updateCharacterPreview() {
  if (avatarModel) disposeAvatarRig(avatarModel);
  avatarModel = buildCharacter({ ...appearance, umbrella: false });
  avatarModel.name = "PLAYER_AVATAR_PREVIEW";
  avatarModel.position.y = 0.12;
  previewRig = avatarModel.userData.rig;
  characterPreview.add(avatarModel);
}

function createRobotHand(parent, side = 1) {
  const hand = new THREE.Group();
  hand.name = "CYBERNETIC_HAND";
  parent.add(hand);

  // Accents follow the outfit and glow colour chosen in the character creator.
  const jacketHex = appearance.topColor ?? 0x30394a;
  const glowHex = appearance.glow ?? 0x38f0e6;

  const alloy = new THREE.MeshStandardMaterial({ color: 0x9aa8b8, metalness: 0.88, roughness: 0.26 });
  const darkAlloy = new THREE.MeshStandardMaterial({ color: 0x1a2533, metalness: 0.82, roughness: 0.3 });
  const gunmetal = new THREE.MeshStandardMaterial({ color: 0x3a4454, metalness: 0.85, roughness: 0.3 });
  const jacketAccent = new THREE.MeshStandardMaterial({ color: jacketHex, metalness: 0.6, roughness: 0.34 });
  const jointMaterial = new THREE.MeshStandardMaterial({ color: 0x0a0f18, metalness: 0.74, roughness: 0.26 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x2a2f38, metalness: 0.1, roughness: 0.85 });
  const glow = new THREE.MeshBasicMaterial({ color: glowHex });
  const red = new THREE.MeshBasicMaterial({ color: 0xf02c49 });

  const add = (node, geometry, material, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz);
    node.add(mesh);
    return mesh;
  };
  const ring = (node, r, t, x, y, z, m, rx = Math.PI / 2) => add(node, new THREE.TorusGeometry(r, t, 6, 24), m, x, y, z, rx);
  const plate = (node, pts, depth, m, z) => {
    const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) sh.lineTo(p[0], p[1]); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.003, bevelThickness: 0.003 });
    g.translate(0, 0, z); return add(node, g, m, 0, 0, 0);
  };
  const tube = (node, pts, r, m) => add(node, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))), 16, r, 6, false), m, 0, 0, 0);

  // ── palm: rounded core, layered back armour, glowing reactor ──────────
  add(hand, new THREE.SphereGeometry(0.074, 24, 18), darkAlloy, 0, -0.004, 0).scale.set(0.92, 1.22, 0.56);
  plate(hand, [[-0.05, -0.056], [-0.062, -0.018], [-0.052, 0.046], [-0.028, 0.064], [0.028, 0.064], [0.052, 0.046], [0.062, -0.018], [0.05, -0.056]], 0.01, gunmetal, 0.03);
  plate(hand, [[-0.04, -0.03], [-0.046, 0.03], [-0.02, 0.054], [0.02, 0.054], [0.046, 0.03], [0.04, -0.03], [0.0, -0.046]], 0.008, alloy, 0.043);
  plate(hand, [[-0.02, -0.05], [0.02, -0.05], [0.026, -0.036], [-0.026, -0.036]], 0.006, jacketAccent, 0.044);
  // reactor on the back of the hand
  add(hand, new THREE.CylinderGeometry(0.019, 0.022, 0.01, 6), jointMaterial, 0, 0.006, 0.058, Math.PI / 2);
  // the reactor shows your health (green → yellow → red), so it keeps its own material
  const coreMat = new THREE.MeshBasicMaterial({ color: 0x6aff9e, toneMapped: false });
  add(hand, new THREE.CylinderGeometry(0.011, 0.011, 0.004, 6), coreMat, 0, 0.006, 0.064, Math.PI / 2).userData.keep = true;
  ring(hand, 0.017, 0.0018, 0, 0.006, 0.063, coreMat, 0).userData.keep = true;
  // light channels from the reactor toward each knuckle
  for (const x of [-0.042, -0.015, 0.015, 0.042]) add(hand, new THREE.BoxGeometry(0.0026, 0.026, 0.002), glow, x * 0.75, 0.036, 0.057, 0, 0, -x * 4);
  for (const s of [-1, 1]) add(hand, new THREE.BoxGeometry(0.003, 0.05, 0.002), red, s * 0.044, -0.014, 0.054, 0, 0, s * 0.12);
  // palm side: grip pads + the GEN-0 pulse emitter the palm blast fires from
  add(hand, new THREE.SphereGeometry(0.05, 18, 12), rubber, 0, 0.006, -0.03).scale.set(0.95, 0.95, 0.18);
  add(hand, new THREE.CylinderGeometry(0.016, 0.016, 0.006, 16), jointMaterial, 0, -0.004, -0.04, Math.PI / 2);
  add(hand, new THREE.CylinderGeometry(0.009, 0.009, 0.003, 16), glow, 0, -0.004, -0.044, Math.PI / 2);
  ring(hand, 0.014, 0.0016, 0, -0.004, -0.044, glow, 0);
  for (const s of [-1, 1]) add(hand, new THREE.SphereGeometry(0.018, 12, 8), rubber, s * 0.032, -0.04, -0.022).scale.set(1, 1.2, 0.5);
  // side actuators
  for (const s of [-1, 1]) {
    add(hand, new THREE.CylinderGeometry(0.009, 0.009, 0.072, 10), jointMaterial, s * 0.069, 0.004, -0.008, 0, 0, s * -0.08);
    add(hand, new THREE.BoxGeometry(0.008, 0.05, 0.006), glow, s * 0.07, 0.004, 0.008);
  }

  // ── wrist: bearing, cuff with LED bands, pistons and cables ──────────
  const wrist = new THREE.Group(); wrist.position.set(0, -0.078, 0); hand.add(wrist);
  add(wrist, new THREE.CylinderGeometry(0.05, 0.056, 0.04, 20), jointMaterial, 0, -0.006, 0);
  add(wrist, new THREE.CylinderGeometry(0.051, 0.054, 0.05, 8), jacketAccent, 0, -0.045, 0);
  ring(wrist, 0.052, 0.0028, 0, -0.026, 0, glow);
  ring(wrist, 0.055, 0.0028, 0, -0.066, 0, glow);
  add(wrist, new THREE.BoxGeometry(0.04, 0.032, 0.01), alloy, 0, -0.046, 0.051);
  add(wrist, new THREE.BoxGeometry(0.024, 0.004, 0.003), red, 0, -0.04, 0.057);
  add(wrist, new THREE.BoxGeometry(0.024, 0.004, 0.003), glow, 0, -0.052, 0.057);
  for (const s of [-1, 1]) {
    add(wrist, new THREE.CylinderGeometry(0.005, 0.005, 0.05, 8), alloy, s * 0.04, -0.015, -0.03);
    add(wrist, new THREE.CylinderGeometry(0.007, 0.007, 0.024, 8), jointMaterial, s * 0.04, -0.045, -0.03);
    tube(wrist, [[s * 0.03, 0.03, 0.045], [s * 0.04, -0.01, 0.06], [s * 0.035, -0.05, 0.066]], 0.003, darkAlloy);
  }

  // ── fingers: knuckle guards, 3 armoured links, glowing tip pads ──────
  const fingerJoints = [], fingerRoots = [];
  const fingerXs = [-0.043, -0.015, 0.015, 0.043];
  const fingerLengths = [[0.041, 0.033, 0.025], [0.047, 0.036, 0.027], [0.048, 0.037, 0.028], [0.040, 0.032, 0.024]].map(f => f.map(v => v * 1.18));
  const fingerRadii = [0.0105, 0.0115, 0.0112, 0.0100];
  for (let index = 0; index < 4; index++) {
    const fingerRoot = new THREE.Group();
    fingerRoot.position.set(fingerXs[index], 0.052, 0.005);
    fingerRoot.rotation.z = (index - 1.5) * -0.04;          // slight natural splay
    hand.add(fingerRoot); fingerRoots.push(fingerRoot);
    // knuckle guard with a glow slit
    add(hand, new THREE.BoxGeometry(0.024, 0.016, 0.02), gunmetal, fingerXs[index], 0.056, 0.03);
    add(hand, new THREE.BoxGeometry(0.014, 0.003, 0.002), glow, fingerXs[index], 0.058, 0.041);
    let seg = fingerRoot;
    for (let segment = 0; segment < 3; segment++) {
      const length = fingerLengths[index][segment], radius = fingerRadii[index] * (1 - segment * 0.15);
      add(seg, new THREE.SphereGeometry(radius * 1.08, 14, 10), jointMaterial, 0, 0, 0);
      add(seg, new THREE.CapsuleGeometry(radius * 0.76, length * 0.78, 4, 10), darkAlloy, 0, length * 0.48, 0).scale.z = 0.82;
      // hex-section armour shell on top of each link
      const shell = add(seg, new THREE.CylinderGeometry(radius * 0.95, radius * 1.05, length * 0.62, 6, 1, false, -Math.PI / 2, Math.PI), segment === 1 ? jacketAccent : alloy, 0, length * 0.5, 0.0015);
      shell.scale.z = 0.95;
      add(seg, new THREE.BoxGeometry(radius * 0.45, length * 0.4, 0.002), glow, 0, length * 0.5, radius * 0.98);
      add(seg, new THREE.BoxGeometry(radius * 1.2, 0.0025, radius * 0.4), red, 0, length * 0.82, radius * 0.75);
      const next = new THREE.Group(); next.position.y = length * 0.92; seg.add(next);
      add(next, new THREE.SphereGeometry(radius * 0.92, 14, 10), jointMaterial, 0, 0, 0);
      ring(next, radius * 0.95, 0.0016, 0, 0, 0, glow, 0).rotation.y = Math.PI / 2;    // glowing joint ring
      fingerJoints.push({ pivot: next, finger: index, segment });
      seg = next;
    }
    add(seg, new THREE.SphereGeometry(fingerRadii[index] * 0.68, 12, 10), alloy, 0, 0.008, 0);
    add(seg, new THREE.SphereGeometry(fingerRadii[index] * 0.5, 10, 8), glow, 0, 0.006, -fingerRadii[index] * 0.35).scale.set(1, 1.3, 0.5); // tip pad
  }

  // ── thumb: 3 links ───────────────────────────────────────────────────
  const thumbRoot = new THREE.Group();
  thumbRoot.position.set(-side * 0.057, -0.035, 0.004);
  thumbRoot.rotation.z = side * 0.78;
  hand.add(thumbRoot);
  add(thumbRoot, new THREE.SphereGeometry(0.015, 14, 12), jointMaterial, 0, 0, 0);
  add(thumbRoot, new THREE.CapsuleGeometry(0.0105, 0.03, 4, 10), darkAlloy, 0, 0.018, 0);
  add(thumbRoot, new THREE.CylinderGeometry(0.011, 0.012, 0.024, 6, 1, false, -Math.PI / 2, Math.PI), gunmetal, 0, 0.02, 0.002);
  add(thumbRoot, new THREE.BoxGeometry(0.004, 0.018, 0.002), glow, 0, 0.02, 0.012);
  const thumbMid = new THREE.Group(); thumbMid.position.y = 0.036; thumbRoot.add(thumbMid);
  add(thumbMid, new THREE.SphereGeometry(0.0115, 12, 10), jointMaterial, 0, 0, 0);
  ring(thumbMid, 0.011, 0.0016, 0, 0, 0, glow, 0).rotation.y = Math.PI / 2;
  add(thumbMid, new THREE.CapsuleGeometry(0.009, 0.022, 4, 10), darkAlloy, 0, 0.014, 0);
  add(thumbMid, new THREE.BoxGeometry(0.015, 0.018, 0.008), jacketAccent, 0, 0.014, 0.007);
  const thumbTipPivot = new THREE.Group(); thumbTipPivot.position.y = 0.03; thumbMid.add(thumbTipPivot);
  add(thumbTipPivot, new THREE.SphereGeometry(0.0095, 12, 10), jointMaterial, 0, 0, 0);
  add(thumbTipPivot, new THREE.CapsuleGeometry(0.0082, 0.018, 4, 10), alloy, 0, 0.012, 0);
  add(thumbTipPivot, new THREE.BoxGeometry(0.004, 0.016, 0.003), red, 0, 0.012, 0.009);
  add(thumbTipPivot, new THREE.SphereGeometry(0.0055, 10, 8), glow, 0, 0.02, -0.004).scale.set(1, 1.3, 0.5);

  hand.userData.fingerRoots = fingerRoots;
  hand.userData.fingerJoints = fingerJoints;
  hand.userData.thumbRoot = thumbRoot;
  hand.userData.thumbMid = thumbMid;
  hand.userData.thumbTipPivot = thumbTipPivot;
  hand.userData.side = side;
  // index finger sits next to the thumb
  const indexFinger = side > 0 ? 0 : 3;
  const CURL = [1.45, 1.55, 1.1];
  // Per-finger pose: index (trigger), others (grip), thumb (0 = up, 1 = down on the buttons / wrapped)
  hand.userData.setPose = (indexCurl, otherCurl, thumbCurl) => {
    for (const j of fingerJoints) {
      const c = THREE.MathUtils.clamp(j.finger === indexFinger ? indexCurl : otherCurl, 0, 1);
      j.pivot.rotation.x = -c * CURL[j.segment];
    }
    const t = THREE.MathUtils.clamp(thumbCurl, 0, 1);
    thumbRoot.rotation.z = side * (0.78 - t * 0.75);
    thumbRoot.rotation.x = -t * 0.55;
    thumbMid.rotation.x = -t * 0.45;
    thumbTipPivot.rotation.x = -t * 0.8;
  };
  // grip 0 = open hand, 1 = closed fist
  hand.userData.setGrip = amount => hand.userData.setPose(amount, amount, amount);
  hand.userData.setGrip(0.08);
  hand.userData.pose = { index: 0.08, other: 0.08, thumb: 0.08 };
  // ~170 parts → 2 GPU-skinned meshes. Finger joints stay animatable as bones.
  const { meshes } = skinify(hand, { metalness: 0.82, roughness: 0.28, frustumCulled: false, keep: m => !!m.userData.keep });
  hand.userData.setCore = (color, k = 1) => coreMat.color.copy(color).multiplyScalar(k);
  // Own glow material per hand so it can brighten on touch and flash on hits.
  const glowMesh = meshes.find(m => m.material.isMeshBasicMaterial);
  if (glowMesh) { glowMesh.material = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }); hand.userData.glowMaterial = glowMesh.material; }
  hand.userData.glowLevel = 0.8; hand.userData.flashT = 0; hand.userData.flashColor = new THREE.Color(1, 1, 1);
  hand.userData.flash = (hex = 0xffffff, strength = 1) => { hand.userData.flashT = strength; hand.userData.flashColor.set(hex); };
  return hand;
}

let firstPersonHands = null;
function rebuildFirstPersonHands() {
  if (firstPersonHands) disposeAvatarRig(firstPersonHands);
  firstPersonHands = new THREE.Group();
  firstPersonHands.name = "FIRST_PERSON_HANDS";
  camera.add(firstPersonHands);

  for (const side of [-1, 1]) {
    const hand = createRobotHand(firstPersonHands, side);
    hand.position.set(side * 0.31, -0.43, -0.72);
    // Keep fingers upright and the armored palm facing the camera.
    hand.rotation.set(0, 0, side * 0.12);
    hand.scale.setScalar(1.12);
  }

  firstPersonHands.visible = isInCity && !renderer.xr.isPresenting;
}
// First-person play shows only the robotic hands (no visible body), so the
// "playable avatar" is just the hands now.
function rebuildPlayableAvatar() {
  rebuildFirstPersonHands();
}
updateCharacterPreview();
rebuildPlayableAvatar();

function updateAvatarHeightFromHeadset(xrFrame, delta) {
  if (!playableAvatar) return;

  let targetScale = 1;
  if (renderer.xr.isPresenting && isInCity && xrFrame) {
    try {
      // The app requests local-floor, so this is the tracked headset height
      // above the calibrated floor rather than its height above the player's
      // changing camera position.
      const referenceSpace = renderer.xr.getReferenceSpace();
      const viewerPose = referenceSpace ? xrFrame.getViewerPose(referenceSpace) : null;
      const headHeight = viewerPose?.transform?.position?.y;
      if (Number.isFinite(headHeight)) {
        // The avatar's eye line is about 1.75 m above its feet. Scale only
        // vertically, keeping the feet planted while matching the user's
        // standing, crouching, or lowered headset position.
        targetScale = THREE.MathUtils.clamp(headHeight / 1.75, 0.64, 1.18);
      }
    } catch {
      // Keep the last smooth height if a tracked pose is briefly unavailable.
      targetScale = playableAvatar.root.scale.y || 1;
    }
  }

  const currentScale = playableAvatar.root.scale.y || 1;
  const smoothScale = THREE.MathUtils.damp(currentScale, targetScale, 9, delta);
  playableAvatar.root.scale.set(1, smoothScale, 1);
}

function animateRobotHandJoints(hand, elapsed, phaseOffset = 0, input = 0) {
  if (!hand?.userData?.setPose) return;
  const u = hand.userData, dt = 1 / 72;
  // input: a number (desktop: 0 open … 1 fist) or VR controller state
  const vr = typeof input === "object" && input !== null;
  const idle = 0.06 + Math.sin(elapsed * 1.35 + phaseOffset) * 0.04;      // gentle breathing motion
  let tIndex, tOther, tThumb;
  if (vr) {
    const { trigger = 0, triggerTouch = false, grip = 0, thumbTouch = false, holding = false } = input;
    // Index: straight (pointing) when your finger is off the trigger, resting when touching, curling as you pull.
    tIndex = trigger > 0.03 ? 0.3 + trigger * 0.7 : triggerTouch ? 0.22 : 0.0;
    // Middle/ring/pinky follow the grip.
    tOther = Math.max(grip, idle * 1.4);
    // Thumb lies down when it's on the stick or buttons, lifts (thumbs-up) when it isn't.
    tThumb = thumbTouch ? 0.55 + grip * 0.45 : grip * 0.25;
    if (holding) { tIndex = Math.max(tIndex, 0.95); tOther = 1; tThumb = 1; }   // wrap around what you're holding
  } else {
    const g = input || 0;
    tIndex = Math.max(g, idle); tOther = Math.max(g, idle * 1.2); tThumb = Math.max(g, idle * 0.5);
  }
  const p = u.pose;
  p.index = THREE.MathUtils.damp(p.index, tIndex, 20, dt);
  p.other = THREE.MathUtils.damp(p.other, tOther, 18, dt);
  p.thumb = THREE.MathUtils.damp(p.thumb, tThumb, 16, dt);
  u.gripSmooth = p.other;
  u.setPose(p.index, p.other, p.thumb);
  // glow: brighter when touching / pointing at something, flashes on hits
  if (u.glowMaterial) {
    const target = vr && (input.hover || input.holding) ? 1.35 : 0.8;
    u.glowLevel = THREE.MathUtils.damp(u.glowLevel, target, 8, dt);
    u.flashT = Math.max(0, u.flashT - dt * 3);
    const k = u.glowLevel + u.flashT * 1.6;
    u.glowMaterial.color.setScalar(k).lerp(u.flashColor.clone().multiplyScalar(k), Math.min(1, u.flashT));
  }
}

function animatePlayableAvatar(amount, elapsed) {
  const blend = THREE.MathUtils.clamp(amount, 0, 1);
  const phase = elapsed * 8.4;
  if (firstPersonHands) {
    firstPersonHands.position.y = -Math.abs(Math.sin(phase * 2)) * 0.012 * blend;
    firstPersonHands.rotation.z = Math.sin(phase) * 0.025 * blend;
    // PC: fists while guarding (C) or during a jab.
    firstPersonHands.children.forEach((hand, index) =>
      animateRobotHandJoints(hand, elapsed, index * Math.PI, keys.KeyC || (index === 1 && desktopJab > 0) ? 1 : 0)
    );
  }
}

function setCharacterPreviewLocation(parent, x, y, z, scale = 1, yaw = 0) {
  parent.add(characterPreview);
  characterPreview.position.set(x, y, z);
  characterPreview.rotation.set(0, yaw, 0);
  characterPreview.scale.setScalar(scale);
  characterPreview.visible = true;
}
updateCharacterPreview();

const terminalMetal = new THREE.MeshStandardMaterial({
  color: 0x111d2b, metalness: 0.82, roughness: 0.34, envMapIntensity: 0.25
});
const terminalGlow = new THREE.MeshStandardMaterial({
  color: 0x183c45, emissive: 0x0c6970, emissiveIntensity: 1.1,
  metalness: 0.55, roughness: 0.28
});
const terminalButton = new THREE.MeshStandardMaterial({
  color: 0x12313a, emissive: 0x087b7b, emissiveIntensity: 1.5,
  metalness: 0.48, roughness: 0.3
});

function makeTerminalLabel(width, height, painter, resolutionScale = 2, logicalWidth = 1024) {
  // Draw at a higher pixel resolution while keeping the same physical mesh size.
  const logicalHeight = Math.max(64, Math.round(logicalWidth * height / width));
  const canvas = document.createElement("canvas");
  canvas.width = logicalWidth * resolutionScale;
  canvas.height = logicalHeight * resolutionScale;
  const ctx = canvas.getContext("2d");
  ctx.scale(resolutionScale, resolutionScale);
  ctx.logicalWidth = logicalWidth;
  ctx.logicalHeight = logicalHeight;
  painter(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const material = new THREE.MeshBasicMaterial({
    map: texture, transparent: true, side: THREE.DoubleSide, depthWrite: false
  });
  const label = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  label.position.z = 0.032;
  label.renderOrder = 1200;
  return { label, texture, canvas };
}

function addTerminalCard({ x, y, width, height, action, labelPainter, button = false, res = 2, logicalWidth = 1024 }) {
  const group = new THREE.Group();
  group.position.set(x, y, 0);
  vrStart.add(group);
  const backing = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, 0.055),
    button ? terminalButton.clone() : terminalMetal.clone()
  );
  group.add(backing);
  const edge = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.025, 0.012, 0.018),
    terminalGlow
  );
  edge.position.set(0, height / 2 - 0.006, 0.034);
  group.add(edge);
  const { label, texture, canvas } = makeTerminalLabel(width * 0.96, height * 0.88, labelPainter, res, logicalWidth);
  group.add(label);
  if (action) {
    backing.userData.action = action;
    backing.userData.baseEmissive = button ? 0x087b7b : 0x0c252c;
    vrStartTargets.push(backing);
  }
  group.userData.refresh = () => {
    const ctx = canvas.getContext("2d");
    ctx.setTransform(res, 0, 0, res, 0, 0);
    ctx.clearRect(0, 0, ctx.logicalWidth, ctx.logicalHeight);
    labelPainter(ctx);
    texture.needsUpdate = true;
  };
  return group;
}

// ── VR character creator: one clean, flat panel drawn like the website ──
// (Replaces the old grid of 3D boxes.) Everything is painted on a single
// high-resolution canvas; pointing + trigger is mapped to buttons via UV.
let creatorTab = 0;
let vrWorldsOpen = false;
document.querySelector("#play-button").addEventListener("click", startCity);
const VRC_W = 1600, VRC_H = 1200;
const vrcCanvas = document.createElement("canvas");
vrcCanvas.width = VRC_W; vrcCanvas.height = VRC_H;
const vrc = vrcCanvas.getContext("2d");
const vrcTexture = new THREE.CanvasTexture(vrcCanvas);
vrcTexture.colorSpace = THREE.SRGBColorSpace;
vrcTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
const vrcPanel = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.05),
  new THREE.MeshBasicMaterial({ map: vrcTexture, transparent: true, depthWrite: false }));
vrcPanel.position.set(0, 0.15, 0);
vrcPanel.renderOrder = 1200;
vrStart.add(vrcPanel);
vrStartTargets.push(vrcPanel);
let vrcButtons = [];
let vrcHover = -1;
const rr = (x, y, w, h, r) => { vrc.beginPath(); vrc.moveTo(x + r, y); vrc.arcTo(x + w, y, x + w, y + h, r); vrc.arcTo(x + w, y + h, x, y + h, r); vrc.arcTo(x, y + h, x, y, r); vrc.arcTo(x, y, x + w, y, r); vrc.closePath(); };
const txt = (t, x, y, size, color, align = "left", weight = "bold") => { vrc.fillStyle = color; vrc.font = `${weight} ${size}px Inter, Arial, sans-serif`; vrc.textAlign = align; vrc.textBaseline = "middle"; vrc.fillText(t, x, y); };
function vrcButton(x, y, w, h, act) { vrcButtons.push({ x, y, w, h, act }); return vrcButtons.length - 1 === vrcHover; }

function drawVRCreator() {
  vrcButtons = [];
  vrc.clearRect(0, 0, VRC_W, VRC_H);
  // card background, like the website's start card
  rr(8, 8, VRC_W - 16, VRC_H - 16, 40);
  vrc.fillStyle = "rgba(7,13,29,0.94)"; vrc.fill();
  vrc.lineWidth = 4; vrc.strokeStyle = "rgba(95,245,232,0.55)"; vrc.stroke();
  txt("WORLD · " + (worlds.activeWorld()?.name || ""), 70, 78, 26, "#5ff5e8", "left", "800");
  txt("CREATE YOUR CHARACTER", 70, 128, 52, "#ffffff", "left", "800");
  txt(appearance.name ? appearance.name.toUpperCase() : "UNNAMED RUNNER", VRC_W - 70, 128, 34, "#ffcf70", "right", "800");
  // tabs
  const vrTabs = [{ label: "WORLDS" }, ...creator.TABS];
  const tabW = (VRC_W - 140 - 5 * 14) / 6;
  vrTabs.forEach((t, ti) => {
    const i = ti - 1;
    const x = 70 + ti * (tabW + 14), y = 180, on = ti === 0 ? vrWorldsOpen : (!vrWorldsOpen && i === creatorTab);
    const hov = vrcButton(x, y, tabW, 76, () => { if (ti === 0) { vrWorldsOpen = true; return; } vrWorldsOpen = false; creatorTab = i; applyCreatorFocus(); renderDesktopCreator(); });
    rr(x, y, tabW, 76, 16);
    vrc.fillStyle = on ? "#0f6f74" : hov ? "rgba(39,75,103,0.95)" : "rgba(12,22,40,0.95)"; vrc.fill();
    vrc.lineWidth = 3; vrc.strokeStyle = on ? "#5ff5e8" : "rgba(95,245,232,0.25)"; vrc.stroke();
    txt(t.label, x + tabW / 2, y + 39, 28, on ? "#ffffff" : "#9fb2cc", "center", "800");
  });
  if (vrWorldsOpen) drawVRWorlds(); else drawVRFields();
  drawVRBottom();
}
// WORLDS page: pick a save slot or make a new one (rename/delete on PC).
function drawVRWorlds() {
  const list = worlds.worldList(), active = worlds.activeWorld()?.id;
  const colW = (VRC_W - 140 - 30) / 2, rowH = 118;
  list.forEach((w, k) => {
    const x = 70 + (k % 2) * (colW + 30), y = 290 + Math.floor(k / 2) * (rowH + 14), on = w.id === active;
    const hov = vrcButton(x, y, colW, rowH, () => switchWorld(w.id));
    rr(x, y, colW, rowH, 18);
    vrc.fillStyle = on ? "rgba(15,111,116,0.85)" : hov ? "rgba(39,75,103,0.95)" : "rgba(20,36,61,0.75)"; vrc.fill();
    if (on) { vrc.lineWidth = 4; vrc.strokeStyle = "#5ff5e8"; vrc.stroke(); }
    txt((on ? "● " : "") + w.name, x + 26, y + 44, 36, "#ffffff", "left", "800");
    txt(worlds.summary(w.id), x + 26, y + 88, 26, on ? "#c9fffb" : "#9fb2cc", "left", "700");
  });
  if (worlds.canCreate()) {
    const k = list.length, x = 70 + (k % 2) * (colW + 30), y = 290 + Math.floor(k / 2) * (rowH + 14);
    const hov = vrcButton(x, y, colW, rowH, () => newWorld());
    rr(x, y, colW, rowH, 18); vrc.fillStyle = hov ? "rgba(255,207,112,0.22)" : "rgba(40,30,10,0.5)"; vrc.fill();
    vrc.lineWidth = 3; vrc.setLineDash([12, 10]); vrc.strokeStyle = "#ffcf70"; vrc.stroke(); vrc.setLineDash([]);
    txt("+  NEW WORLD", x + colW / 2, y + rowH / 2 + 2, 38, "#ffcf70", "center", "800");
  }
}
function drawVRFields() {
  // fields: two columns
  const fields = creator.TABS[creatorTab].fields;
  const colW = (VRC_W - 140 - 30) / 2, rowH = 132, top = 290;
  fields.forEach((f, idx) => {
    const col = fields.length > 4 ? idx % 2 : 0;
    const row = fields.length > 4 ? Math.floor(idx / 2) : idx;
    const w = fields.length > 4 ? colW : VRC_W - 140;
    const x = 70 + col * (colW + 30), y = top + row * (rowH + 14);
    rr(x, y, w, rowH, 18); vrc.fillStyle = "rgba(20,36,61,0.75)"; vrc.fill();
    txt(f.label, x + 24, y + 32, 26, "#5ff5e8", "left", "800");
    if (f.type === "color") {
      txt(creator.valueText(f), x + w - 24, y + 32, 24, "#dce7ff", "right", "700");
      const n = f.options.length, size = Math.min(54, (w - 48 - (n - 1) * 8) / n);
      f.options.forEach((c, k) => {
        const sx = x + 24 + k * (size + 8), sy = y + 62;
        const hov = vrcButton(sx - 3, sy - 3, size + 6, size + 6, () => creator.setValue(f.key, c));
        vrc.beginPath(); vrc.arc(sx + size / 2, sy + size / 2, size / 2, 0, Math.PI * 2);
        vrc.fillStyle = creator.hexCss(c); vrc.fill();
        const on = appearance[f.key] === c;
        vrc.lineWidth = on ? 6 : hov ? 4 : 2; vrc.strokeStyle = on ? "#ffffff" : hov ? "#5ff5e8" : "rgba(255,255,255,0.2)"; vrc.stroke();
      });
    } else if (f.type === "preset") {
      let cx = x + 24, cy = y + 62;
      creator.PRESETS.forEach((p, k) => {
        vrc.font = "800 24px Inter, Arial, sans-serif";
        const cw = vrc.measureText(p.name).width + 40;
        if (cx + cw > x + w - 20) { cx = x + 24; cy += 0; }
        const hov = vrcButton(cx, cy, cw, 52, () => creator.applyPreset(k));
        rr(cx, cy, cw, 52, 26); const on = creator.presetIndex === k;
        vrc.fillStyle = on || hov ? "rgba(255,207,112,0.22)" : "rgba(40,30,10,0.5)"; vrc.fill();
        vrc.lineWidth = 2; vrc.strokeStyle = on ? "#ffcf70" : "rgba(255,207,112,0.4)"; vrc.stroke();
        txt(p.name, cx + cw / 2, cy + 27, 24, on ? "#ffffff" : "#ffcf70", "center", "800");
        cx += cw + 10;
      });
    } else {
      // stepper: ‹ value ›  (name cycles through a list of handles in VR)
      const field = f.type === "text" ? { ...f, type: "choice" } : f;
      const by = y + 58, bh = 60;
      const hl = vrcButton(x + 24, by, 80, bh, () => creator.cycle(field, -1));
      const hr = vrcButton(x + w - 104, by, 80, bh, () => creator.cycle(field, 1));
      for (const [bx, hov, ch] of [[x + 24, hl, "‹"], [x + w - 104, hr, "›"]]) {
        rr(bx, by, 80, bh, 14); vrc.fillStyle = hov ? "rgba(39,75,103,0.95)" : "#101c33"; vrc.fill();
        vrc.lineWidth = 2; vrc.strokeStyle = "rgba(95,245,232,0.45)"; vrc.stroke();
        txt(ch, bx + 40, by + bh / 2 + 2, 48, "#ffcf70", "center", "700");
      }
      txt(f.type === "text" ? (appearance.name || "NO NAME").toUpperCase() : creator.valueText(f), x + w / 2, by + bh / 2 + 2, 36, "#ffffff", "center", "800");
    }
  });
}
function drawVRBottom() {
  const by = VRC_H - 140;
  const hRand = vrcButton(70, by, 520, 92, () => creator.randomize());
  rr(70, by, 520, 92, 20); vrc.fillStyle = hRand ? "rgba(39,75,103,0.95)" : "rgba(7,13,29,0.95)"; vrc.fill();
  vrc.lineWidth = 3; vrc.strokeStyle = "rgba(95,245,232,0.5)"; vrc.stroke();
  txt("⟳  RANDOMIZE", 330, by + 47, 36, "#ffffff", "center", "800");
  const hPlay = vrcButton(VRC_W - 590, by, 520, 92, () => startCity());
  rr(VRC_W - 590, by, 520, 92, 20);
  const g = vrc.createLinearGradient(VRC_W - 590, 0, VRC_W - 70, 0); g.addColorStop(0, "#0b7778"); g.addColorStop(1, "#164b6c");
  vrc.fillStyle = g; vrc.fill(); if (hPlay) { vrc.lineWidth = 5; vrc.strokeStyle = "#5ff5e8"; vrc.stroke(); }
  txt("PLAY  ▶", VRC_W - 330, by + 47, 42, "#ffffff", "center", "800");
  txt("Point and pull the trigger", VRC_W / 2, by + 47, 24, "#6f82a0", "center", "600");
  vrcTexture.needsUpdate = true;
}
function vrcIndexAt(uv) {
  if (!uv) return -1;
  const x = uv.x * VRC_W, y = (1 - uv.y) * VRC_H;
  return vrcButtons.findIndex(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
}
vrcPanel.userData.action = hit => {
  const i = vrcIndexAt(hit?.uv);
  if (i < 0) return;
  const before = creator.TABS[creatorTab].id, act = vrcButtons[i].act;
  act();
  if (act.toString().includes("startCity") || act.toString().includes("World")) { drawVRCreator(); return; }
  onLookChanged();
  if (creator.TABS[creatorTab].id !== before) refreshVRCreator();
};
vrcPanel.userData.hover = hit => { const i = vrcIndexAt(hit?.uv); if (i !== vrcHover) { vrcHover = i; drawVRCreator(); } };
function refreshVRCreator() { drawVRCreator(); }
// Any change: rebuild the preview, re-tint the hands, update both UIs.
function onLookChanged() {
  creator.saveLook();
  updateCharacterPreview();
  rebuildPlayableAvatar();
  refreshVRCreator();
  renderDesktopCreator();
  audio.play("click");
}

// ── Worlds (save slots) ─────────────────────────────────────────────────
// Switching loads that world's progress and character without reloading.
function refreshAfterWorldChange() {
  loadGame();
  creator.loadLook();
  updateCharacterPreview();
  rebuildPlayableAvatar();
  updateCharacterUI();
  renderDesktopCreator();
  renderWorlds();
  drawVRCreator();
  startStatus.textContent = state.introSeen
    ? `World "${worlds.activeWorld().name}" loaded. You'll continue where you left off.`
    : `World "${worlds.activeWorld().name}" is a fresh story.`;
}
function switchWorld(id) { if (worlds.selectWorld(id)) refreshAfterWorldChange(); }
function newWorld(name) { if (worlds.createWorld(name)) refreshAfterWorldChange(); }
const worldsRoot = document.querySelector("#worlds");
let worldsOpen = false;
function renderWorlds() {
  if (!worldsRoot) return;
  const active = worlds.activeWorld();
  const rows = worlds.worldList().map(w => `
    <div class="world-row${w.id === active.id ? " on" : ""}">
      <button type="button" class="world-pick" data-world="${w.id}"><strong>${w.name}</strong><span>${worlds.summary(w.id)}</span></button>
      <button type="button" class="world-icon" data-rename="${w.id}" title="Rename" aria-label="Rename ${w.name}">✎</button>
      <button type="button" class="world-icon danger" data-delete="${w.id}" title="Delete" aria-label="Delete ${w.name}">🗑</button>
    </div>`).join("");
  worldsRoot.innerHTML = `
    <div class="world-current">
      <div><span class="small-label">WORLD</span><strong>${active.name}</strong><em>${worlds.summary(active.id)}</em></div>
      <button type="button" class="ui-button" data-toggle-worlds>${worldsOpen ? "CLOSE" : "CHANGE / NEW"}</button>
    </div>
    ${worldsOpen ? `<div class="world-list">${rows}
      ${worlds.canCreate() ? `<form class="world-new"><input id="new-world-name" maxlength="20" placeholder="New world name"><button type="submit" class="ui-button accent">+ NEW WORLD</button></form>` : `<p class="panel-note">You have the maximum of 8 worlds. Delete one to make another.</p>`}
    </div>` : ""}`;
}
worldsRoot?.addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.toggleWorlds !== undefined) { worldsOpen = !worldsOpen; renderWorlds(); return; }
  if (b.dataset.world) { switchWorld(b.dataset.world); return; }
  if (b.dataset.rename) {
    const w = worlds.worldList().find(x => x.id === b.dataset.rename);
    const name = prompt("Rename world:", w.name);
    if (name) { worlds.renameWorld(w.id, name); renderWorlds(); drawVRCreator(); }
    return;
  }
  if (b.dataset.delete) {
    if (worlds.worldList().length <= 1) { alert("You need at least one world."); return; }
    const w = worlds.worldList().find(x => x.id === b.dataset.delete);
    if (!confirm(`Delete "${w.name}" and all of its progress? This can't be undone.`)) return;
    const wasActive = w.id === worlds.activeWorld().id;
    worlds.deleteWorld(w.id);
    if (wasActive) refreshAfterWorldChange(); else renderWorlds();
  }
});
worldsRoot?.addEventListener("submit", e => {
  e.preventDefault();
  newWorld(document.querySelector("#new-world-name")?.value);
  worldsOpen = true;
  renderWorlds();
});
renderWorlds();

// ── PC character creator (HTML) ─────────────────────────────────────────
const creatorRoot = document.querySelector("#creator");
function renderDesktopCreator() {
  if (!creatorRoot) return;
  const tab = creator.TABS[creatorTab];
  const tabs = creator.TABS.map((t, i) => `<button type="button" class="creator-tab${i === creatorTab ? " active" : ""}" data-tab="${i}">${t.label}</button>`).join("");
  const rows = tab.fields.map((f, idx) => {
    if (f.type === "text") return `<label class="creator-row"><span>${f.label}</span><input id="creator-name" maxlength="16" placeholder="Type a name" value="${(appearance.name || "").replace(/"/g, "&quot;")}"></label>`;
    if (f.type === "color") return `<div class="creator-row"><span>${f.label} <em>${creator.valueText(f)}</em></span><div class="swatches">${f.options.map(c => `<button type="button" class="swatch${appearance[f.key] === c ? " on" : ""}" style="background:${creator.hexCss(c)}" data-field="${idx}" data-value="${c}" aria-label="${f.label}"></button>`).join("")}</div></div>`;
    if (f.type === "preset") return `<div class="creator-row"><span>${f.label}</span><div class="chips">${creator.PRESETS.map((p, i) => `<button type="button" class="chip${creator.presetIndex === i ? " on" : ""}" data-preset="${i}">${p.name}</button>`).join("")}</div></div>`;
    return `<div class="creator-row"><span>${f.label}</span><div class="stepper"><button type="button" data-field="${idx}" data-dir="-1" aria-label="Previous">‹</button><strong>${creator.valueText(f)}</strong><button type="button" data-field="${idx}" data-dir="1" aria-label="Next">›</button></div></div>`;
  }).join("");
  creatorRoot.innerHTML = `<div class="creator-tabs">${tabs}</div><div class="creator-fields">${rows}</div>
    <div class="creator-tools"><button type="button" class="ui-button" data-random>⟳ RANDOMIZE</button><span class="creator-hint">Drag the character to rotate</span></div>`;
}
creatorRoot?.addEventListener("click", event => {
  const b = event.target.closest("button");
  if (!b) return;
  const fields = creator.TABS[creatorTab].fields;
  if (b.dataset.tab !== undefined) { creatorTab = Number(b.dataset.tab); renderDesktopCreator(); refreshVRCreator(); applyCreatorFocus(); audio.play("click"); return; }
  if (b.dataset.random !== undefined) { creator.randomize(); return onLookChanged(); }
  if (b.dataset.preset !== undefined) { creator.applyPreset(Number(b.dataset.preset)); return onLookChanged(); }
  const field = fields[Number(b.dataset.field)];
  if (!field) return;
  if (b.dataset.value !== undefined) creator.setValue(field.key, Number(b.dataset.value));
  else creator.cycle(field, Number(b.dataset.dir));
  onLookChanged();
});
creatorRoot?.addEventListener("input", event => {
  if (event.target.id !== "creator-name") return;
  creator.setValue("name", event.target.value.replace(/[<>]/g, "").slice(0, 16));
  drawVRCreator();
});
// Drag on the empty part of the start screen to spin the preview.
let previewDrag = null, previewSpin = 0;
startScreen.addEventListener("pointerdown", e => { if (e.target === startScreen || e.target.classList.contains("start-brand")) previewDrag = e.clientX; });
window.addEventListener("pointermove", e => { if (previewDrag !== null) { previewSpin += (e.clientX - previewDrag) * 0.01; previewDrag = e.clientX; } });
window.addEventListener("pointerup", () => { previewDrag = null; });
// Face and hair tabs zoom the PC camera in on the character's face.
const MENU_VIEWS = { body: { x: 0.95, y: 0, z: 5.7, pitch: -0.1 }, face: { x: 1.4, y: 0.12, z: 4.6, pitch: 0.0 } };
let menuView = MENU_VIEWS.body;
function applyCreatorFocus() { menuView = ["face", "hair"].includes(creator.TABS[creatorTab].id) ? MENU_VIEWS.face : MENU_VIEWS.body; }
function updateMenuCamera(delta, time) {
  if (isInCity || renderer.xr.isPresenting || intro.active) return;
  const k = 1 - Math.exp(-4 * delta);
  player.position.x += (menuView.x - player.position.x) * k;
  player.position.y += (menuView.y - player.position.y) * k;
  player.position.z += (menuView.z - player.position.z) * k;
  pitch += (menuView.pitch - pitch) * k;
  camera.rotation.x = pitch;
  player.rotation.y += (0 - player.rotation.y) * k;
  if (characterPreview.parent === mainMenuWorld) characterPreview.rotation.y = previewSpin + Math.sin(time * 0.0004) * 0.25;
  if (previewRig?.head) { previewRig.head.rotation.y = Math.sin(time * 0.0007) * 0.35; previewRig.body.scale.y = 1 + Math.sin(time * 0.0016) * 0.006; }
}
renderDesktopCreator();

let vrSessionIntroActive = false;
function showVRIntro() {
  if (vrSessionIntroActive) return;
  vrSessionIntroActive = true;
  startScreen.classList.add("hidden");
  isInCity = false;
  cityWorld.visible = false;
  mainMenuWorld.visible = true;
  vrStartReady = false;
  // Place the ENTIRE character-selection rectangle from the fixed player
  // spawn transform. Do not read headset position, pitch, roll, or yaw here.
  const spawnPosition = new THREE.Vector3();
  const spawnRotation = new THREE.Quaternion();
  player.getWorldPosition(spawnPosition);
  player.getWorldQuaternion(spawnRotation);

  // Use the player's horizontal forward (-Z), not Object3D.getWorldDirection
  // which points along +Z for a normal Group. This stays level at any head pose.
  const flatForward = new THREE.Vector3(0, 0, -1).applyQuaternion(spawnRotation);
  flatForward.y = 0;
  if (flatForward.lengthSq() < 0.0001) flatForward.set(0, 0, -1);
  flatForward.normalize();

  const menuYaw = Math.atan2(flatForward.x, -flatForward.z);
  const MENU_HEIGHT_ABOVE_FLOOR = 1.20;
  // A little extra distance gives the side-by-side character and editor room in the Quest view.
  const MENU_DISTANCE_FROM_SPAWN = 1.75;

  // One world-space position and yaw for the root rectangle. Every card,
  // border, rail and PLAY button is a child of vrStart and shares this plane.
  vrStart.position.set(
    spawnPosition.x + flatForward.x * MENU_DISTANCE_FROM_SPAWN,
    spawnPosition.y + MENU_HEIGHT_ABOVE_FLOOR,
    spawnPosition.z + flatForward.z * MENU_DISTANCE_FROM_SPAWN
  );
  vrStart.rotation.set(0, menuYaw, 0);
  vrStart.scale.setScalar(1);
  vrStart.visible = true;

  // Parent the avatar to the starting menu so it always stays beside it,
  // never beside the player's moving body or room-scale headset position.
  // Local +Z is the menu's front, so a small +Z offset brings the model
  // slightly toward the player while keeping it beside the right edge.
  vrStart.updateMatrixWorld(true);
  const avatarLocalX = 1.12;
  const avatarLocalZ = 0.24;
  const towardPlayerLocal = new THREE.Vector3(
    -avatarLocalX, 0, MENU_DISTANCE_FROM_SPAWN - avatarLocalZ
  ).normalize();
  const characterYaw = Math.atan2(towardPlayerLocal.x, towardPlayerLocal.z);
  setCharacterPreviewLocation(
    vrStart, avatarLocalX, -MENU_HEIGHT_ABOVE_FLOOR, avatarLocalZ, 0.78, characterYaw
  );
  refreshVRCreator();
}
renderer.xr.addEventListener("sessionstart", () => {
  // Use the real tracked headset pose. Keep the body below the camera and
  // show virtual hands attached to the Touch controllers.
  camera.position.set(0, 1.65, 0);
  camera.rotation.set(0, 0, 0);
  pitch = 0;
  if (firstPersonHands) firstPersonHands.visible = false;
  if (playableAvatar) {
    // Keep the body hidden in VR as well; the controller-mounted hands are
    // the only player parts shown during first-person play.
    playableAvatar.root.visible = false;
  }
  vrSessionIntroActive = false;
});
renderer.xr.addEventListener("sessionend", () => {
  game?.onExit();
  audio.setMood("menu");
  document.body.classList.remove("in-city");
  scene.fog = menuFog;
  scene.background = menuBackground;
  vrSessionIntroActive = false;
  vrStart.visible = false;
  vrStartReady = false;
  vrStartHovered = null;
  isInCity = false;
  cityWorld.visible = false;
  mainMenuWorld.visible = true;
  setCharacterPreviewLocation(mainMenuWorld, 1.7, 0, 3.2, 1, 0);
  if (playableAvatar) {
    playableAvatar.root.visible = false;
    playableAvatar.head.visible = false;
    for (const hand of playableAvatar.handGroups) hand.visible = false;
  }
  camera.position.set(0, 1.65, 0);
  pitch = 0;
  camera.rotation.set(0, 0, 0);
  if (firstPersonHands) firstPersonHands.visible = false;
  startScreen.classList.remove("hidden");
});

function activateVRStartAtController(controller) {
  if (!vrStart.visible) return false;
  vrMenuRaycaster.setFromXRController(controller);
  const hit = vrMenuRaycaster.intersectObjects(vrStartTargets.filter(t => t.parent?.visible !== false), false)[0];
  if (hit?.object?.userData?.action && hit.object.parent?.visible !== false) { audio.play("click"); hit.object.userData.action(hit); }
  return true;
}
const vrMenuRaycaster = new THREE.Raycaster();
const vrMenuPointer = new THREE.Vector3();

let activeDoorGrab = null;
const doorGrabForward = new THREE.Vector3();
function getControllerYaw(controller) {
  controller.getWorldDirection(doorGrabForward);
  doorGrabForward.y = 0;
  if (doorGrabForward.lengthSq() < 0.0001) return 0;
  doorGrabForward.normalize();
  return Math.atan2(doorGrabForward.x, -doorGrabForward.z);
}
function wrapAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}
function beginDoorGrab(controller) {
  if (!isInCity || vrMenu.visible || !renderer.xr.isPresenting) return false;
  vrMenuRaycaster.setFromXRController(controller);
  vrMenuRaycaster.far = Infinity;
  // The trigger only grabs the actual handle, not the whole door panel.
  const hit = vrMenuRaycaster.intersectObject(shopDoorHandle, false)[0];
  if (!hit || hit.distance > 3.5) return false;
  audio.play("door");
  activeDoorGrab = {
    controller,
    startYaw: getControllerYaw(controller),
    startDoorAngle: shopDoorHinge.rotation.y
  };
  shopDoorTarget = shopDoorHinge.rotation.y;
  return true;
}
function updateDoorGrab() {
  if (!activeDoorGrab) return;
  const currentYaw = getControllerYaw(activeDoorGrab.controller);
  const twist = wrapAngle(currentYaw - activeDoorGrab.startYaw);
  // Twist left/right to swing the hinged door. Clamp before it turns through
  // the frame, and keep the handle attached to the moving door.
  // Outward (negative) swings fully open; inward stops at 0.55 rad so the
  // leaf can't pass through the Genesis Core display behind it.
  shopDoorTarget = THREE.MathUtils.clamp(
    activeDoorGrab.startDoorAngle + twist,
    -1.48,
    0.55
  );
}
function endDoorGrab(controller) {
  if (activeDoorGrab?.controller !== controller) return;
  activeDoorGrab = null;
  // Leave the door where the player released it.
  shopDoorTarget = shopDoorHinge.rotation.y;
}
const vrControllerRays = [];
const vrCursor = new THREE.Mesh(
  new THREE.SphereGeometry(0.018, 12, 12),
  new THREE.MeshBasicMaterial({ color: 0x5ff5e8, depthTest: false })
);
vrCursor.visible = false;
scene.add(vrCursor);

for (let i = 0; i < 2; i++) {
  const controller = renderer.xr.getController(i);
  const trackedHand = new THREE.Group();
  trackedHand.name = "TRACKED_VIRTUAL_HAND";
  trackedHand.position.set(0, -0.025, -0.085);
  // The hand's fingers point down the controller's forward (-Z) direction.
  const robotHand = createRobotHand(trackedHand, 1);
  // The controller points down -Z. This keeps fingers pointing along the
  // controller while turning the armored palm toward the player instead of up.
  // Hand fingers are built along local +Y. Rotate that axis onto the
  // controller's forward -Z ray so fingertips point away from the player.
  robotHand.rotation.set(-Math.PI / 2, 0, 0);
  robotHand.scale.setScalar(1.0);
  trackedHand.userData.robotHand = robotHand;
  controller.add(trackedHand);
  const rayLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -3)]),
    new THREE.LineBasicMaterial({ color: 0x5ff5e8, depthTest: false })
  );
  rayLine.visible = false;
  controller.add(rayLine);
  controller.addEventListener("connected", event => {
    controller.userData.handedness = event.data.handedness;
    // Mirror the thumb so it sits on the inside edge of each hand.
    trackedHand.scale.x = event.data.handedness === "left" ? -1 : 1;
    if (event.data.handedness === "left") {
      // Attach the small menu to the left hand so it follows the hand,
      // rather than staying behind at the player's original spawn position.
      controller.add(vrMenu);
      vrMenu.position.set(0.18, 0.08, -0.28);
      vrMenu.rotation.set(-0.28, 0.12, 0);
    }
  });
  controller.addEventListener("disconnected", () => {
    controller.userData.handedness = undefined;
  });
  controller.addEventListener("selectstart", () => {
    if (intro.active) { intro.triggerDown(); return; }
    if (!isInCity || vrMenu.visible || vrStart.visible) return;
    // Physical door handle first, then NPCs / pickups / dialogue buttons.
    if (game?.isPanelOpen()) { game.onTrigger(controller); return; }
    if (arcade.active) return;                                          // trigger = fire on the cabinet
    if (gear.onTrigger(controller, robotHandOf(controller))) return;     // scan gesture / tether
    if (beginDoorGrab(controller)) return;
    if (game?.onTrigger(controller)) return;
    // Nothing to interact with: an open hand fires the GEN-0 palm pulse.
    const grip = getGamepad(controller.userData.handedness)?.buttons?.[1]?.value || 0;
    if (grip < 0.4 && combat && !intro.active) { const hand = robotHandOf(controller); if (combat.firePulse(hand || controller, controller)) haptic(controller.userData.handedness, 0.6, 50); }
  });
  controller.addEventListener("selectend", () => {
    if (intro.active) { intro.triggerUp(); return; }
    endDoorGrab(controller);
  });
  controller.addEventListener("select", () => {
    if (intro.active) return;
    if (controller.userData.handedness === "right") {
      if (vrStart.visible) activateVRStartAtController(controller);
      else if (vrMenu.visible) activateVRMenuAtController(controller);
    }
  });
  // Keep XR controllers in the same moving/turning space as the player camera.
  player.add(controller);
  vrControllerRays.push({ controller, rayLine });
}

let vrMenuPage = "character";
const VR_WARE_TOP = 200, VR_WARE_ROW = 76;
const VR_TABS = [{ id: "character", label: "CHARACTER" }, { id: "cyberware", label: "CYBERWARE" }, { id: "map", label: "MAP" }, { id: "settings", label: "SETTINGS" }];
const VR_TAB_W = 222, VR_TAB_STEP = 232;
let vrMapHover = -1;
function drawVRMenu() {
  const ctx = vrMenuContext;
  ctx.clearRect(0, 0, 1024, 768);
  ctx.fillStyle = "rgba(5, 10, 25, 0.96)";
  ctx.fillRect(0, 0, 1024, 768);
  ctx.strokeStyle = "#5ff5e8";
  ctx.lineWidth = 5;
  ctx.strokeRect(5, 5, 1014, 758);
  ctx.fillStyle = "#5ff5e8";
  ctx.font = "bold 28px Arial";
  ctx.fillText("NEON GENESIS  /  " + (city.districtAt(player.position.z, player.position.y, player.position.x)), 54, 58);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 25px Arial";
  ctx.fillText("CREDITS  $" + state.credits.toLocaleString(), 760, 58);
  VR_TABS.forEach((t, i) => {
    const x = 50 + i * VR_TAB_STEP;
    ctx.fillStyle = vrMenuPage === t.id ? "#0f5f66" : "#14243d";
    ctx.fillRect(x, 92, VR_TAB_W, 66);
    ctx.strokeStyle = vrMenuPage === t.id ? "#5ff5e8" : "#33445f";
    ctx.lineWidth = 4;
    ctx.strokeRect(x, 92, VR_TAB_W, 66);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 25px Arial";
    ctx.textAlign = "center";
    ctx.fillText(t.label, x + VR_TAB_W / 2, 134);
    ctx.textAlign = "left";
  });

  if (vrMenuPage === "character") {
    ctx.fillStyle = "#aab6cf";
    ctx.font = "24px Arial";
    ctx.fillStyle = "#ffcf4a"; ctx.font = "bold 26px Arial";
    ctx.fillText(`LEVEL ${level()}`, 60, 190);
    ctx.fillStyle = "#1c2433"; ctx.fillRect(200, 172, 520, 22);
    ctx.fillStyle = "#ffcf4a"; ctx.fillRect(200, 172, 520 * xpIntoLevel() / XP_PER_LEVEL, 22);
    ctx.fillStyle = "#ffffff"; ctx.font = "bold 18px Arial"; ctx.fillText(`${xpIntoLevel()} / ${XP_PER_LEVEL} XP`, 740, 190);
    ctx.fillStyle = "#aab6cf"; ctx.font = "21px Arial";
    ctx.fillText(`Points to spend: ${pointsLeft()} (of ${totalPoints()})   ·   MAX HEALTH ${maxHealth()}   ·   GRADE ${gradeName(character.compatibility)}`, 60, 225);
    const rows = [
      ["STRENGTH", "Faster movement, lets you shift heavy objects", "strength"],
      ["HEALTH", "Adds 25 maximum health per point", "health"],
      ["CYBERWARE COMPATIBILITY", "More cyberware slots and higher-grade chrome", "compatibility"]
    ];
    rows.forEach((row, i) => {
      const y = 280 + i * 125;
      ctx.fillStyle = "#13233b";
      ctx.fillRect(55, y - 40, 914, 108);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 27px Arial";
      ctx.fillText(row[0], 80, y);
      ctx.fillStyle = "#aab6cf";
      ctx.font = "20px Arial";
      ctx.fillText(row[1], 80, y + 34);
      ctx.fillStyle = "#5ff5e8";
      ctx.font = "bold 34px Arial";
      ctx.fillText(String(character[row[2]]), 720, y + 15);
      ctx.fillStyle = "#20465a";
      ctx.fillRect(790, y - 25, 70, 62);
      ctx.fillRect(880, y - 25, 70, 62);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 38px Arial";
      ctx.fillText("−", 811, y + 18);
      ctx.fillText("+", 902, y + 18);
    });
  } else if (vrMenuPage === "map") {
    camera.getWorldDirection(cameraDirection);
    drawMap(ctx, 50, 170, 520, 470, { player: player.position, yaw: -Math.atan2(cameraDirection.x, -cameraDirection.z), objective: game?.debug.objectivePosition?.(), hover: vrMapHover });
    ctx.fillStyle = "#5ff5e8"; ctx.font = "bold 22px Arial"; ctx.fillText("FAST TRAVEL", 590, 196);
    ctx.fillStyle = "#aab6cf"; ctx.font = "16px Arial"; ctx.fillText("Visit a place once to unlock it.", 760, 196);
    TRAVEL.forEach((t, i) => {
      const y = 212 + i * 61, on = isUnlocked(t), hov = i === vrMapHover;
      ctx.fillStyle = hov && on ? "#0f6f74" : "#13233b"; ctx.fillRect(590, y, 380, 52);
      ctx.strokeStyle = on ? (hov ? "#5ff5e8" : "#33445f") : "#222a38"; ctx.lineWidth = 2; ctx.strokeRect(590, y, 380, 52);
      ctx.fillStyle = on ? "#ffffff" : "#56607a"; ctx.font = "bold 21px Arial"; ctx.fillText(on ? t.name : "??? · not found yet", 606, y + 33);
      if (on) { ctx.fillStyle = "#ffcf4a"; ctx.font = "bold 18px Arial"; ctx.textAlign = "right"; ctx.fillText("GO ▸", 955, y + 33); ctx.textAlign = "left"; }
    });
  } else if (vrMenuPage === "settings") {
    const btn = (x, y, w, h, label, on, accent = "#5ff5e8") => {
      ctx.fillStyle = on ? "#0f6f74" : "#20465a"; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = on ? accent : "#33445f"; ctx.lineWidth = 3; ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = "#ffffff"; ctx.font = "bold 21px Arial"; ctx.textAlign = "center"; ctx.fillText((on ? "● " : "") + label, x + w / 2, y + h / 2 + 8); ctx.textAlign = "left";
    };
    const row = (y, label) => { ctx.fillStyle = "#ffffff"; ctx.font = "bold 22px Arial"; ctx.fillText(label, 60, y); };
    row(206, "OBJECTIVE GUIDE"); btn(330, 176, 300, 46, "SKY BEAM", guideSettings.guide === "beam"); btn(650, 176, 300, 46, "PATH LINE", guideSettings.guide === "path");
    row(262, "TURNING"); btn(330, 232, 300, 46, "SMOOTH", comfort.turn === "smooth"); btn(650, 232, 300, 46, "SNAP 30°", comfort.turn === "snap");
    row(318, "COMFORT"); btn(330, 288, 300, 46, "VIGNETTE " + (comfort.vignette ? "ON" : "OFF"), comfort.vignette); btn(650, 288, 300, 46, "SEATED " + (comfort.seated ? "ON" : "OFF"), comfort.seated);
    row(374, "HEIGHT / STORY"); btn(330, 344, 300, 46, "↕ RESET HEIGHT", false, "#ffcf4a"); btn(650, 344, 300, 46, "▶ REPLAY INTRO", false, "#b24cff");
    row(430, "PICTURE"); btn(330, 400, 300, 46, "STANDARD", comfort.picture === "standard"); btn(650, 400, 300, 46, "VIVID", comfort.picture === "vivid", "#ff4fa3");
    ctx.fillStyle = "#5ff5e8"; ctx.font = "bold 18px Arial"; ctx.fillText("QUEST CONTROLS", 60, 474);
    ctx.fillStyle = "#aab6cf"; ctx.font = "14px Arial"; ctx.fillText("Settings are saved on this headset. Reset height: stand (or sit) normally, then press it.", 240, 474);
    CONTROLS_VR.forEach(([action, key], i) => {
      const col = i % 2, r = Math.floor(i / 2), x = 60 + col * 460, y = 494 + r * 15.5;
      ctx.fillStyle = "#dce7ff"; ctx.font = "14px Arial"; ctx.fillText(action, x, y);
      ctx.fillStyle = "#ffcf4a"; ctx.font = "bold 14px Arial"; ctx.textAlign = "right"; ctx.fillText(key, x + 440, y); ctx.textAlign = "left";
    });
  } else {
    ctx.fillStyle = "#aab6cf";
    ctx.font = "24px Arial";
    ctx.fillText(`Slots used ${state.installed.length} / ${slotCount()}  ·  Buy more chrome from Doc Anaya (Neon Mile)`, 60, 185);
    const owned = Object.keys(CYBERWARE).filter(id => state.owned.includes(id));
    if (!owned.length) {
      ctx.fillStyle = "#ffffff";
      ctx.font = "26px Arial";
      ctx.fillText("No cyberware installed yet. Your arm implant is stock GEN-0.", 60, 260);
    }
    owned.forEach((id, i) => {
      const w = CYBERWARE[id], y = VR_WARE_TOP + i * VR_WARE_ROW;
      const installed = state.installed.includes(id);
      ctx.fillStyle = "#13233b"; ctx.fillRect(55, y, 914, VR_WARE_ROW - 8);
      ctx.fillStyle = installed ? (isActive(id) ? "#6aff9e" : "#ffb02e") : "#ffffff";
      ctx.font = "bold 25px Arial"; ctx.fillText(w.name, 78, y + 30);
      ctx.fillStyle = "#aab6cf"; ctx.font = "18px Arial";
      ctx.fillText(w.desc.length > 70 ? w.desc.slice(0, 68) + "…" : w.desc, 78, y + 56);
      ctx.fillStyle = installed ? "#5a2a3a" : "#20465a"; ctx.fillRect(790, y + 10, 165, 48);
      ctx.fillStyle = "#ffffff"; ctx.font = "bold 22px Arial"; ctx.fillText(installed ? "REMOVE" : "INSTALL", 822, y + 42);
    });
  }
  // Current objective strip
  const obj = game?.objectiveSummary();
  ctx.fillStyle = "#1a1530"; ctx.fillRect(50, 650, 924, 80);
  ctx.fillStyle = "#ffcf4a"; ctx.font = "bold 22px Arial";
  ctx.fillText("OBJECTIVE · " + (obj?.title || "EXPLORE").toUpperCase(), 70, 682);
  ctx.fillStyle = "#ffffff"; ctx.font = "21px Arial";
  const text = obj?.text || "";
  ctx.fillText(text.length > 80 ? text.slice(0, 78) + "…" : text, 70, 714);
  ctx.fillStyle = "#ff789d";
  ctx.font = "bold 20px Arial";
  ctx.fillText("Y · CLOSE", 870, 682);
  vrMenuTexture.needsUpdate = true;
}

function setVRMenuOpen(open) {
  vrMenu.visible = open;
  vrMenuPage = "character";
  if (open) drawVRMenu();
  vrCursor.visible = false;
  for (const item of vrControllerRays) {
    item.rayLine.visible = open && item.controller.userData.handedness === "right";
  }
}
function activateVRMenuAtController(controller) {
  if (!renderer.xr.isPresenting || !vrMenu.visible) return;
  audio.play("click");
  vrMenuRaycaster.setFromXRController(controller);
  vrMenuRaycaster.far = Infinity;
  const hit = vrMenuRaycaster.intersectObject(vrMenuPanel, false)[0];
  if (!hit?.uv) return;
  const x = hit.uv.x * 1024;
  const y = (1 - hit.uv.y) * 768;
  if (y >= 92 && y <= 158) {
    const i = Math.floor((x - 50) / VR_TAB_STEP);
    if (i >= 0 && i < VR_TABS.length && x - 50 - i * VR_TAB_STEP <= VR_TAB_W) vrMenuPage = VR_TABS[i].id;
  } else if (vrMenuPage === "map") {
    const i = Math.floor((y - 212) / 61);
    if (x >= 590 && x <= 970 && i >= 0 && i < TRAVEL.length && y - 212 - i * 61 <= 52) { fastTravel(TRAVEL[i]); return; }
  } else if (vrMenuPage === "settings") {
    const left = x >= 330 && x <= 630, right = x >= 650 && x <= 950;
    if (y >= 176 && y <= 222 && (left || right)) setGuideStyle(left ? "beam" : "path");
    else if (y >= 232 && y <= 278 && (left || right)) comfortSys.setTurn(left ? "smooth" : "snap");
    else if (y >= 288 && y <= 334 && left) comfortSys.setVignette(!comfort.vignette);
    else if (y >= 288 && y <= 334 && right) comfortSys.setSeated(!comfort.seated);
    else if (y >= 344 && y <= 390 && left) { if (comfortSys.resetHeight()) game.toast("Height reset", "objective"); }
    else if (y >= 344 && y <= 390 && right) { replayIntro(); return; }
    else if (y >= 400 && y <= 446 && (left || right)) comfortSys.setPicture(left ? "standard" : "vivid", scene);
    updateSettingsUI();
  } else if (vrMenuPage === "character") {
    for (let i = 0; i < 3; i++) {
      const rowY = 280 + i * 125;
      if (y >= rowY - 40 && y <= rowY + 68 && x >= 780 && x <= 965) {
        changeStat(["strength", "health", "compatibility"][i], x < 875 ? -1 : 1);
        updateCharacterUI();
        break;
      }
    }
  } else {
    const owned = Object.keys(CYBERWARE).filter(id => state.owned.includes(id));
    const i = Math.floor((y - VR_WARE_TOP) / VR_WARE_ROW);
    if (i >= 0 && i < owned.length && x >= 780 && x <= 965) {
      if (toggleInstall(owned[i]) === "no-slots") game?.toast("No free slots. Raise COMPATIBILITY or remove something.", "warn");
      updateCharacterUI();
    }
  }
  drawVRMenu();
}
function fastTravel(t) {
  if (!isUnlocked(t)) return;
  if (combat.inFight) { game.toast("Can't fast travel in the middle of a fight.", "warn"); return; }
  setVRMenuOpen(false); closeGameMenu(); game.closePanel();
  game.teleport(new THREE.Vector3(t.x, t.y, t.z), t.name.toUpperCase());
}
function updateVRMenuPointer() {
  if (!renderer.xr.isPresenting) {
    vrCursor.visible = false;
    return;
  }
  // Match the controller by handedness, not by inputSources array position.
  // Quest can reorder that array, which previously left the pointer at spawn.
  const rightItem = vrControllerRays.find(item =>
    item.controller.userData.handedness === "right"
  );
  if (!rightItem) {
    vrCursor.visible = false;
    return;
  }
  // The laser pointer only appears while a menu or panel is open (start screen,
  // wrist menu, dialogue, shop). In the world you just use your hands.
  const menuOpen = vrStart.visible || vrMenu.visible || !!game?.isPanelOpen();
  rightItem.rayLine.visible = menuOpen;
  for (const it of vrControllerRays) if (it !== rightItem) it.rayLine.visible = false;
  vrMenuRaycaster.setFromXRController(rightItem.controller);
  const startHit = vrStart.visible
    ? vrMenuRaycaster.intersectObjects(vrStartTargets.filter(t => t.parent?.visible !== false), false)[0]
    : null;
  const menuHit = !vrStart.visible && vrMenu.visible
    ? vrMenuRaycaster.intersectObject(vrMenuPanel, false)[0]
    : null;
  const doorHit = isInCity && !vrMenu.visible
    ? vrMenuRaycaster.intersectObjects(shopDoorHitObjects, false)[0]
    : null;
  const gamePoint = !vrStart.visible && !vrMenu.visible ? game?.cursorPoint(rightItem.controller) : null;
  const hit = startHit || menuHit || (doorHit && doorHit.distance <= 3.5 ? doorHit : null) || (gamePoint ? { point: gamePoint } : null);
  if (vrMenuPage === "map" && vrMenu.visible) {
    let hv = -1;
    if (menuHit?.uv) { const mx = menuHit.uv.x * 1024, my = (1 - menuHit.uv.y) * 768, i = Math.floor((my - 212) / 61); if (mx >= 590 && mx <= 970 && i >= 0 && i < TRAVEL.length && my - 212 - i * 61 <= 52) hv = i; }
    if (hv !== vrMapHover) { vrMapHover = hv; drawVRMenu(); }
  }
  vrcPanel.userData.hover(startHit?.object === vrcPanel ? startHit : null);
  rightItem.rayLine.material.color.set(hit ? 0x5ff5e8 : 0x8793a8);
  if (hit && menuOpen) {
    vrCursor.position.copy(hit.point).addScaledVector(vrMenuRaycaster.ray.direction, -0.025);
    vrCursor.renderOrder = 2000;
    vrCursor.visible = true;
  } else {
    vrCursor.visible = false;
  }
}

// Mouse-look supports pointer lock and click-and-drag fallback.
let pitch = 0;
let dragging = false;
let lastX = 0;
let lastY = 0;
const minPitch = -1.42;
const maxPitch = 1.15;
function rotateView(dx, dy) {
  const sensitivity = 0.0022;
  player.rotation.y -= dx * sensitivity;
  pitch = THREE.MathUtils.clamp(pitch - dy * sensitivity, minPitch, maxPitch);
  camera.rotation.x = pitch;
}
const isQuestBrowser = /OculusBrowser|Quest/i.test(navigator.userAgent);
renderer.domElement.addEventListener("click", () => {
  // Quest Browser uses its own hand/controller cursor; do not capture it.
  if (!isQuestBrowser && !renderer.xr.isPresenting && !game?.isPanelOpen() &&
      document.pointerLockElement !== renderer.domElement) {
    try {
      const request = renderer.domElement.requestPointerLock?.();
      if (request?.catch) request.catch(() => {});
    } catch {}
  }
});
renderer.domElement.addEventListener("mousedown", event => {
  if (renderer.xr.isPresenting || event.button !== 0) return;
  dragging = true;
  lastX = event.clientX;
  lastY = event.clientY;
});
window.addEventListener("mouseup", () => { dragging = false; });
document.addEventListener("mousemove", event => {
  if (renderer.xr.isPresenting) return;
  if (document.pointerLockElement === renderer.domElement) {
    rotateView(event.movementX, event.movementY);
  } else if (dragging) {
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    rotateView(dx, dy);
  }
});

const keys = {};
window.addEventListener("keydown", event => {
  keys[event.code] = true;
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) event.preventDefault();
});
window.addEventListener("keyup", event => { keys[event.code] = false; });
window.addEventListener("blur", () => { for (const key of Object.keys(keys)) keys[key] = false; });

let previousMenuButton = false;
let previousXButton = false;
let previousBButton = false;
let desktopJab = 0;
let uiToneTimer = 0;
function keepUIUntoned() {
  scene.traverse(o => {
    for (const m of [].concat(o.material || [])) {
      if (m.userData.toneChecked) continue;
      m.userData.toneChecked = true;
      // canvas-drawn UI: sprites, overlays and transparent text panels
      if (m.map?.isCanvasTexture && (o.isSprite || m.depthTest === false || m.transparent)) { m.toneMapped = false; m.needsUpdate = true; }
    }
  });
}
let previousJumpButton = false;
let jumpVelocity = 0;
const clock = new THREE.Clock();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const movement = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);
const cameraDirection = new THREE.Vector3();

function getLeftStick() {
  const session = renderer.xr.getSession();
  if (!session) return { x: 0, y: 0 };
  for (const source of session.inputSources) {
    if (source.handedness !== "left" || !source.gamepad) continue;
    const axes = source.gamepad.axes;
    if (axes.length >= 4) return { x: axes[2] || 0, y: axes[3] || 0 };
    if (axes.length >= 2) return { x: axes[0] || 0, y: axes[1] || 0 };
  }
  return { x: 0, y: 0 };
}

function getRightStickAndMenuButton() {
  const session = renderer.xr.getSession();
  if (!session) return { x: 0, y: 0 };
  for (const source of session.inputSources) {
    if (source.handedness !== "right" || !source.gamepad) continue;
    const axes = source.gamepad.axes;
    const x = axes.length >= 4 ? axes[2] : axes[0];
    const y = axes.length >= 4 ? axes[3] : axes[1];
    return {
      x: Math.abs(x || 0) > 0.15 ? x : 0,
      y: Math.abs(y || 0) > 0.15 ? y : 0
    };
  }
  return { x: 0, y: 0 };
}

function getLeftYButton() {
  const session = renderer.xr.getSession();
  if (!session) return false;
  const leftSource = Array.from(session.inputSources).find(source =>
    source.handedness === "left" && source.gamepad
  );
  // Quest Touch: Y is the left controller's secondary face button.
  return !!leftSource?.gamepad?.buttons[5]?.pressed;
}

function getGamepad(handedness) {
  const session = renderer.xr.getSession();
  if (!session) return null;
  for (const source of session.inputSources) if (source.handedness === handedness && source.gamepad) return source.gamepad;
  return null;
}
// Controller vibration on hits, blocks and pickups.
function haptic(side, intensity = 0.5, ms = 60) {
  for (const h of side === "both" ? ["left", "right"] : [side]) {
    const pad = getGamepad(h);
    try { pad?.hapticActuators?.[0]?.pulse?.(intensity, ms); } catch {}
  }
}
const robotHandOf = controller => controller.children.find(c => c.name === "TRACKED_VIRTUAL_HAND")?.userData?.robotHand || null;
function getRightAButton() {
  const session = renderer.xr.getSession();
  if (!session) return false;
  const rightSource = Array.from(session.inputSources).find(source =>
    source.handedness === "right" && source.gamepad
  );
  // WebXR's standard Quest Touch mapping places the primary right face
  // button (A) at index 4; index 3 is the thumbstick click.
  return !!rightSource?.gamepad?.buttons[4]?.pressed;
}

const headWorld = new THREE.Vector3();
const headAfterTurn = new THREE.Vector3();
const PLAYER_RADIUS = 0.31;
// Smooth turning pivots around your head, not the centre of your play space,
// so turning while standing off-centre doesn't swing you sideways.
function turnAroundHead(angle) {
  if (!angle) return;
  camera.getWorldPosition(headWorld);
  player.rotation.y += angle;
  player.updateMatrixWorld(true);
  camera.getWorldPosition(headAfterTurn);
  player.position.x += headWorld.x - headAfterTurn.x;
  player.position.z += headWorld.z - headAfterTurn.z;
}
function blocked(x, z) {
  return city.collides(x, z, player.position.y, PLAYER_RADIUS) || collidesWithMikaShop(x, z);
}

let sprinting = false;
let previousSprintButton = false;
let wasGrounded = true;
function getLeftStickClick() {
  const session = renderer.xr.getSession();
  if (!session) return false;
  for (const source of session.inputSources) {
    // xr-standard mapping: button 3 is the thumbstick press.
    if (source.handedness === "left" && source.gamepad) return !!source.gamepad.buttons[3]?.pressed;
  }
  return false;
}
function movePlayer(delta) {
  let stickX = 0;
  let stickY = 0;
  let jumpPressed = false;
  if (renderer.xr.isPresenting) {
    const stick = getLeftStick();
    const look = getRightStickAndMenuButton();
    const yPressed = getLeftYButton();
    stickX = Math.abs(stick.x) > 0.12 ? stick.x : 0;
    stickY = Math.abs(stick.y) > 0.12 ? stick.y : 0;
    if (yPressed && !previousMenuButton) { setVRMenuOpen(!vrMenu.visible); audio.play(vrMenu.visible ? "open" : "close"); }
    previousMenuButton = yPressed;
    jumpPressed = getRightAButton();
    // Sprint: click the left stick to start running; it stops when you let go of the stick.
    const sprintButton = getLeftStickClick();
    if (sprintButton && !previousSprintButton) sprinting = !sprinting;
    previousSprintButton = sprintButton;
    if (Math.hypot(stickX, stickY) < 0.25) sprinting = false;
    // Smooth horizontal turning; headset tracking still controls natural up/down looking.
    { const t = comfortSys.turnAmount(look.x, turnSpeed(), delta); turnAroundHead(t); lastTurnRate = delta > 0 ? t / delta : 0; }
  } else {
    stickX = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    stickY = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
    jumpPressed = !!keys.Space;
    sprinting = !!(keys.ShiftLeft || keys.ShiftRight) && (stickX !== 0 || stickY !== 0);
  }
  if (game?.isPanelOpen()) { stickX = 0; stickY = 0; jumpPressed = false; }

  // Head offset inside the play space (room-scale): collisions are tested
  // where your head actually is, so you can't lean or step through walls
  // with the stick.
  camera.getWorldPosition(headWorld);
  const offX = renderer.xr.isPresenting ? headWorld.x - player.position.x : 0;
  const offZ = renderer.xr.isPresenting ? headWorld.z - player.position.z : 0;

  // Jumping and gravity, with walkable rooftops from city.js.
  const ground = city.groundAt(player.position.x + offX, player.position.z + offZ, player.position.y);
  if (jumpPressed && !previousJumpButton && player.position.y <= ground + 0.001) { jumpVelocity = jumpPower(); audio.play("jump"); }
  previousJumpButton = jumpPressed;
  jumpVelocity -= 11.5 * delta;
  player.position.y += jumpVelocity * delta;
  let grounded = false;
  if (player.position.y < ground) {
    if (!wasGrounded && jumpVelocity < -2) audio.play("land");
    player.position.y = ground;
    jumpVelocity = 0;
    grounded = true;
  } else grounded = player.position.y <= ground + 0.001;
  wasGrounded = grounded;

  camera.getWorldDirection(cameraDirection);
  forward.set(cameraDirection.x, 0, cameraDirection.z);
  if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
  forward.normalize();
  right.crossVectors(forward, up).normalize();
  movement.set(0, 0, 0);
  movement.addScaledVector(forward, -stickY);
  movement.addScaledVector(right, stickX);
  const movementAmount = Math.min(1, movement.length());
  if (movement.lengthSq() > 1) movement.normalize();
  if (movementAmount < 0.1) sprinting = false;
  const step = movement.multiplyScalar(moveSpeed() * (sprinting ? 1.65 : 1) * delta);

  // Resolve each axis separately so the player slides along walls instead of
  // sticking to them.
  if (step.x && !blocked(player.position.x + offX + step.x, player.position.z + offZ)) player.position.x += step.x;
  if (step.z && !blocked(player.position.x + offX, player.position.z + offZ + step.z)) player.position.z += step.z;
  // Footsteps: wet street, rooftop gravel, or clinic tile.
  const surface = player.position.y > 10 ? "roof" : (player.position.x > 11 && player.position.z < -72 && player.position.z > -78) ? "tile" : "street";
  audio.footsteps(delta, grounded ? movementAmount : 0, sprinting, surface);
  return movementAmount;
}

startStatus.textContent = state.introSeen
  ? "Save found — you'll continue where you left off. Y opens the menu in VR, E on PC."
  : "City systems are ready. Y opens the menu in VR, E on PC.";

// Merge the workshop's static pieces (walls, bench, shelves…) by material.
// The door, Genesis Core display and signs keep their own meshes.
const mergedShop = mergeStatic(mikaShop, [shopDoorHinge, genesisCoreDisplay, shopSign, shopHint]);
mikaShopBlockers.length = 0;
mikaShopBlockers.push(...mergedShop);
shopDoorLeaf.traverse(o => { if (o.isMesh && o !== shopDoorAim) mikaShopBlockers.push(o); });

// ── gameplay layer: NPCs, missions, dialogue, shop ────────────────────────
mikaShop.updateMatrixWorld(true);
game = createGame({
  scene, cityWorld, camera, player, renderer, city,
  core: { group: genesisCoreDisplay, flare: flareGenesisCore },
  mika: { position: new THREE.Vector3(1.35, 0, -0.85).applyMatrix4(mikaShop.matrixWorld), yaw: Math.PI / 2 },
  door: {
    object: shopDoorLeaf, hit: shopDoorAim,
    toggle: () => { shopDoorTarget = Math.abs(shopDoorHinge.rotation.y) > 0.5 ? 0 : -1.4; }
  },
  blockers: mikaShopBlockers,
  onStateChange: () => updateCharacterUI(),
  isInCity: () => isInCity,
  onTeleport: () => { jumpVelocity = 0; },
  getName: () => appearance.name,
  audio
});
// 3D sound sources placed in the world.
{
  const at = (x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); cityWorld.add(o); return o; };
  const A = city.anchors;
  audio.attachLoop(at(A.sato.x - 1.6, 1.2, A.sato.z), "sizzle", { refDistance: 1.5, maxDistance: 14 });
  audio.attachLoop(genesisCoreDisplay, "core", { refDistance: 0.8, maxDistance: 9, volume: 0.9 });
  audio.attachLoop(at(0, 1.5, -66), "crowd", { refDistance: 4, maxDistance: 30 });
  audio.attachLoop(at(0, 1.5, -122), "crowd", { refDistance: 4, maxDistance: 26, volume: 0.6 });
  audio.attachLoop(at(9.5, 4.5, -75), "neon", { refDistance: 1.5, maxDistance: 10 });
  audio.attachLoop(at(17, 0.5, -10), "vent", { refDistance: 1.2, maxDistance: 10 });
  audio.attachLoop(game.npcSys.byId.ishida.holder, "hologram", { refDistance: 2, maxDistance: 18 });
  // radios: only audible within a few steps
  for (const r of radios.radios) audio.attachLoop(r.group, "radio:" + r.spot.station, { refDistance: 0.7, maxDistance: 4.5, volume: 1.6 });
}
document.addEventListener("keydown", event => {
  if (event.code === "KeyM" && !renderer.xr.isPresenting) game.toast(audio.toggleMute() ? "Sound muted (M)" : "Sound on (M)");
});
updateSettingsUI();
updateCharacterUI();

// ── combat ─────────────────────────────────────────────────────────────
const combat = createCombat({
  root: cityWorld, camera, player, renderer, city, game, haptic, audio,
  zones: [makeZone({
    min: { x: 47, z: -81 }, max: { x: 137, z: -11 },
    wave: ["scav", "scav", "scav", "sentry", "sentry", "enforcer", "enforcer"],
    spawnPoints: docks.spawnPoints,
    alert: "TENKAI PATROL AHEAD · SNEAK UP FOR A SILENT TAKEDOWN", clearedText: "PORT 7 CLEARED", reward: 150
  })]
});
const gear = createGear({ root: cityWorld, scene, camera, player, renderer, city, combat, game, audio, haptic,
  mikaBench: { position: mikaShop.localToWorld(new THREE.Vector3(-1.55, 0.92, -1.75)) } });
const arcade = createArcade({ root: cityWorld, scene, game, audio, player, camera, position: new THREE.Vector3(10.45, 0, -28), yaw: -Math.PI / 2 });
city.colliders.push({ minX: 9.95, maxX: 11, minZ: -28.5, maxZ: -27.5, minY: 0, maxY: 2.1 });
let arcadeFire = false;
const hpFill = document.querySelector("#hp-fill"), hpText = document.querySelector("#hp-text"), hpWrap = document.querySelector("#hp-bar");
let lastHpText = "";
// PC punches that miss enemies can still spook people standing right there.
function startleInFront() {
  camera.getWorldPosition(headWorld); camera.getWorldDirection(cameraDirection);
  const at = headWorld.clone().addScaledVector(cameraDirection, 0.9);
  if (game.npcSys.npcs.some(n => n.enabled && n.holder.visible && !n.hologram && Math.hypot(n.holder.position.x - at.x, n.holder.position.z - at.z) < 0.8)) game.npcSys.startle(at, 2.5);
}
function updateHealthHUD() {
  if (!hpWrap) return;
  const max = maxHealth(), text = `${Math.ceil(combat.hp)} / ${max}${isActive("pulse_capacitor") ? ` · PULSE ${Math.floor(combat.energy * 3)}` : ""} · ✚ ${state.items?.med_patch || 0}${combat.guarding ? " · GUARD" : ""}`;
  hpWrap.hidden = !(combat.inFight || combat.hp < max - 0.5);
  if (text === lastHpText) return;
  lastHpText = text;
  hpFill.style.width = `${Math.max(0, combat.hp / max) * 100}%`;
  hpFill.style.background = combat.hp / max > 0.5 ? "#6aff9e" : combat.hp / max > 0.25 ? "#ffcf4a" : "#ff3a4a";
  hpText.textContent = text;
}

document.querySelector("#reset-button")?.addEventListener("click", () => {
  if (!confirm(`Restart the story in "${worlds.activeWorld().name}"? This world's progress will be erased (your other worlds are kept).`)) return;
  resetGame();
  location.reload();
});

renderer.domElement.addEventListener("contextmenu", e => e.preventDefault());
renderer.domElement.addEventListener("mousedown", event => {
  if (intro.active && !renderer.xr.isPresenting && event.button === 0) { intro.next(); return; }
  if (!renderer.xr.isPresenting && isInCity && document.pointerLockElement === renderer.domElement && !game.isPanelOpen()) {
    if (event.button === 2) { combat.firePulse(camera); return; }
    if (arcade.active) { if (event.button === 0) arcadeFire = true; return; }
    if (event.button === 0 && gear.desktopThrow()) return;
    if (event.button === 0 && !game.desktopInteract()) { desktopJab = 1; if (!combat.desktopPunch()) startleInFront(); return; }
    if (event.button === 0) return;
  }
  if (renderer.xr.isPresenting || event.button !== 0 || !isInCity) return;
  if (game.isPanelOpen()) game.desktopClick();
  else if (document.pointerLockElement === renderer.domElement) game.desktopInteract();
});

// Developer hook: open the page with ?debug to drive the game from the console.
if (DEBUG) {
  window.__NEON = {
    game, state, city, player, camera, renderer, startCity, THREE, scene,
    setTone(on, exposure = 1.15) { renderer.toneMapping = on ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping; renderer.toneMappingExposure = exposure; scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => m.needsUpdate = true); }); }, audio,
    previewVRTerminal() { startScreen.classList.add("hidden"); vrSessionIntroActive = false; vrStartReady = false; player.position.set(0, 0, 7); player.rotation.set(0, 0, 0); menuView = { x: 0, y: 0, z: 7, pitch: -0.02 }; showVRIntro(); vrSessionIntroActive = false; },
    vrTab(i) { creatorTab = i; refreshVRCreator(); },
    intro, replayIntro, worlds, get combat() { return combat; }, docks, cityFX, get gear() { return gear; }, get arcade() { return arcade; }, comfortSys, drawVRMenu: () => drawVRMenu(), switchWorld, newWorld, vrWorlds() { vrWorldsOpen = true; drawVRCreator(); },
    wristMenu(page) { vrMenuPage = page; drawVRMenu(); return vrMenuCanvas.toDataURL(); },
    vrClick(u, v) { vrcPanel.userData.hover({ uv: { x: u, y: v } }); vrcPanel.userData.action({ uv: { x: u, y: v } }); return { tab: creator.TABS[creatorTab].id, look: { ...creator.look }, inCity: isInCity }; },
    teleport(x, y, z, yaw = 0, pitchValue = 0) {
      player.position.set(x, y, z); player.rotation.set(0, yaw, 0);
      pitch = pitchValue; camera.rotation.x = pitchValue; jumpVelocity = 0;
    },
    stats() { const i = renderer.info; return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs?.length }; }
  };
}
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
let worldTime = 0;
renderer.setAnimationLoop((time, xrFrame) => {
  const delta = Math.min(clock.getDelta(), 0.05);
  // World clock: runs at Chrono Spike speed so the whole city slows down (you don't)
  const worldScale = combat?.timeScale ?? 1, worldDelta = delta * worldScale;
  worldTime += worldDelta * 1000;
  // Initialize only after this frame has updated Three.js' tracked XR camera.
  const needsVRIntro = renderer.xr.isPresenting && !vrSessionIntroActive && !vrStartReady;
  lastTurnRate = 0;
  const movementAmount = isInCity && !intro.active && !gear.tethering && !arcade.active ? movePlayer(delta) : 0;
  comfortSys.update(delta, xrFrame, movementAmount, lastTurnRate);
  intro.update(time, delta);
  updateAvatarHeightFromHeadset(xrFrame, delta);
  animatePlayableAvatar(movementAmount, time * 0.001);
  const combatHands = [];
  for (let handIndex = 0; handIndex < vrControllerRays.length; handIndex++) {
    const controller = vrControllerRays[handIndex].controller;
    const robotHand = robotHandOf(controller);
    const side = controller.userData.handedness;
    const pad = side ? getGamepad(side) : null, bt = pad?.buttons || [];
    const grip = bt[1]?.value || 0;
    const hover = !!(isInCity && !game?.isPanelOpen() && game?.cursorPoint(controller));
    if (hover && !controller.userData.wasHover) haptic(side, 0.15, 20);          // little tick when you touch something
    controller.userData.wasHover = hover;
    const handInput = {
      trigger: bt[0]?.value || 0, triggerTouch: !!bt[0]?.touched, grip,
      thumbTouch: !!(bt[3]?.touched || bt[4]?.touched || bt[5]?.touched || bt[6]?.touched || bt[3]?.pressed || bt[4]?.pressed || bt[5]?.pressed),
      hover, holding: activeDoorGrab?.controller === controller
    };
    animateRobotHandJoints(robotHand, time * 0.001, handIndex * Math.PI, handInput);
    if (side && robotHand) combatHands.push({ side, object: robotHand, grip, controller });
  }
  if (renderer.xr.isPresenting) {
    const xPressed = !!getGamepad("left")?.buttons?.[4]?.pressed;   // X: med patch
    if (xPressed && !previousXButton && isInCity) combat.useMedPatch();
    previousXButton = xPressed;
    const bPressed = !!getGamepad("right")?.buttons?.[5]?.pressed;  // B: Chrono Spike
    if (bPressed && !previousBButton && isInCity) combat.useChrono();
    previousBButton = bPressed;
  }
  if (desktopJab > 0) {
    desktopJab = Math.max(0, desktopJab - delta * 4);
    const r = firstPersonHands?.children[1];
    if (r) { r.userData.setGrip?.(1); r.position.z = -0.72 - Math.sin(desktopJab * Math.PI) * 0.35; }
  }
  // Menus, dialogue boards and labels skip tone mapping so text stays crisp.
  if ((uiToneTimer -= delta) <= 0) { uiToneTimer = 1.5; keepUIUntoned(); }
  if (isInCity && !intro.active && combat) {
    combat.update(time, delta, combatHands, renderer.xr.isPresenting ? {} : { desktop: { guard: !!keys.KeyC } });
    docks.update(worldTime);
    cityFX.update(worldTime, worldDelta);
    if ((travelCheck -= delta) <= 0) { travelCheck = 0.5; const found = discover(player.position); if (found) game.toast(`FAST TRAVEL UNLOCKED · ${found.name}`, "objective"); }
    {
      let ax = 0, fire = false, back = false;
      if (renderer.xr.isPresenting) { const st = getLeftStick(); ax = Math.abs(st.x) > 0.15 ? st.x : 0; back = st.y > 0.75; fire = !!(getGamepad("right")?.buttons?.[0]?.pressed || getGamepad("left")?.buttons?.[0]?.pressed); }
      else { ax = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0); fire = !!keys.Space || arcadeFire; }
      arcadeFire = false;
      arcade.update(time, delta, { x: ax, fire, back });
    }
    gear.update(time, delta, renderer.xr.isPresenting ? combatHands : (firstPersonHands?.children || []).map(o => ({ object: o })), worldDelta);
    radios.update(worldTime);
    updateHealthHUD();
  }
  updateDoorGrab();
  shopDoorHinge.rotation.y = THREE.MathUtils.damp(
    shopDoorHinge.rotation.y, shopDoorTarget, 7.5, delta
  );
  const indoorsAtMika = Math.abs(player.position.x - mikaShop.position.x + 1.5) < 1.6 && Math.abs(player.position.z - mikaShop.position.z) < 2.2;
  audio.update(delta, { inCity: isInCity, district: city.districtAt(player.position.z, player.position.y, player.position.x), indoors: indoorsAtMika, height: player.position.y });
  if (isInCity) {
    city.applyAtmosphere(scene, player.position.z);
    city.update(worldTime, worldDelta, player.position);   // rain, holograms, signs all slow in Chrono Spike
    animateGenesisCore(time);
    game.update(time, delta, vrControllerRays.map(item => item.controller), worldTime, worldDelta);
  }
  updateVRMenuPointer();
  updateMenuCamera(delta, time);
  if (genesisCoreModel) {
    const flare = Math.max(0, 1 - (performance.now() - coreFlareTime) / 1800);
    coreEnergyUniforms.uTime.value = time * 0.001;
    coreEnergyUniforms.uFlare.value = flare;
    if (genesisCoreParts) {
      genesisCoreModel.rotation.y = Math.sin(time * 0.00035) * 0.25;
      genesisCoreModel.position.y = CORE_BASE_Y + Math.sin(time * 0.0012) * 0.012;
      if (genesisCoreParts.outer) genesisCoreParts.outer.rotation.z = time * 0.0006 * (1 + flare * 6);
      if (genesisCoreParts.inner) genesisCoreParts.inner.rotation.z = -time * 0.0009 * (1 + flare * 6);
      if (genesisCoreParts.crown) { genesisCoreParts.crown.rotation.y = time * 0.002; genesisCoreParts.crown.scale.setScalar(1 + Math.sin(time * 0.004) * 0.08 + flare * 0.6); }
    } else {
      genesisCoreModel.rotation.y = Math.PI + Math.sin(time * 0.00045) * 0.08;
      genesisCoreModel.position.y = CORE_BASE_Y + Math.sin(time * 0.0015) * 0.025;
    }
  }
  coreDisplayRing.rotation.z = time * 0.00035;
  crossedProps.rotation.y = time * 0.00022;
  crossedProps.position.y = 1.72 + Math.sin(time * 0.0012) * 0.045;
  platformRing.rotation.y = time * 0.00018;
  platformRingInner.rotation.y = -time * 0.00024;
  renderer.render(scene, camera);
  if (needsVRIntro && renderer.xr.isPresenting) showVRIntro();
});
