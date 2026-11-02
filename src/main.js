import * as THREE from "three";
import { VRButton } from "three/addons/webxr/VRButton.js";

const status = document.querySelector("#status");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x080b18);
scene.fog = new THREE.Fog(0x080b18, 28, 145);

const player = new THREE.Group();
scene.add(player);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 150);
camera.rotation.order = "YXZ";
// First-person view: the camera sits at eye height inside the character.
camera.position.set(0, 1.65, 0);
camera.rotation.set(0, 0, 0);
player.add(camera);
player.position.set(0, 0, 7);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
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
const appearance = { bodyType: "Male", hatStyle: "Baseball Cap", hatColour: "Black", jacketColour: "Black" };
try {
  const savedAppearance = JSON.parse(localStorage.getItem("neon-genesis-appearance") || "null");
  if (savedAppearance) {
    Object.assign(appearance, savedAppearance);
  }
} catch {}
delete appearance.hairStyle;
delete appearance.hairColour;
for (const [id, key] of [["body-type","bodyType"],["hat-style","hatStyle"],["hat-colour","hatColour"],["jacket-colour","jacketColour"]]) {
  const field = document.getElementById(id);
  field.value = String(appearance[key]);
  field.addEventListener("change", () => {
    appearance[key] = field.value;
    try { localStorage.setItem("neon-genesis-appearance", JSON.stringify(appearance)); } catch {}
    updateCharacterPreview();
    rebuildPlayableAvatar();
    startStatus.textContent = "Appearance saved.";
  });
}
setTimeout(() => document.querySelector("#wip-label")?.classList.add("faded"), 20000);

scene.add(new THREE.HemisphereLight(0x9bb8ff, 0x171020, 1.35));
const moonLight = new THREE.DirectionalLight(0x8cbcff, 1.4);
moonLight.position.set(-5, 24, 8);
scene.add(moonLight);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(180, 180),
  new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.9, metalness: 0.25 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.03;
scene.add(floor);

// The old editor-style ground grid is intentionally removed; the street
// surface, sidewalks and road markings now define the city floor.

// Procedural city blocks: varied towers, lit windows on every side, and a
// broad street corridor so the player is surrounded by the city at spawn.
// Efficient city construction: window panes are batched into a few instanced
// meshes so the Quest does not have to draw thousands of separate objects.
const windowBatches = { cyan: [], purple: [], dark: [] };
const windowGeometry = new THREE.PlaneGeometry(0.58, 0.86);
const windowDummy = new THREE.Object3D();
function queueWindow(kind, x, y, z, rotationY) {
  windowDummy.position.set(x, y, z);
  windowDummy.rotation.set(0, rotationY, 0);
  windowDummy.updateMatrix();
  windowBatches[kind].push(windowDummy.matrix.clone());
}

function makeBuilding(x, z, width, height, depth, color, signColor, seed = 1) {
  const building = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color, roughness: 0.86, metalness: 0.42 })
  );
  building.position.set(x, height / 2, z);
  scene.add(building);

  // Roof lip and narrow facade ribs give the towers more architectural depth.
  const roofLip = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.22, 0.18, depth + 0.22),
    new THREE.MeshStandardMaterial({ color: 0x30384a, roughness: 0.58, metalness: 0.7 })
  );
  roofLip.position.set(x, height + 0.08, z);
  scene.add(roofLip);

  let n = seed >>> 0;
  const random = () => { n = (n * 1664525 + 1013904223) >>> 0; return n / 4294967296; };
  const addFacadeWindows = (count, spacing, positionFor, rotationY) => {
    for (let row = 1.35; row < height - 1; row += 1.75) {
      for (let col = 0; col < count; col++) {
        const roll = random();
        const kind = roll < 0.26 ? "dark" : (roll < 0.68 ? "cyan" : "purple");
        const p = positionFor(col, spacing, row);
        queueWindow(kind, p.x, p.y, p.z, rotationY);
      }
    }
  };
  const frontCount = Math.max(2, Math.floor(width / 1.15));
  const sideCount = Math.max(2, Math.floor(depth / 1.15));
  addFacadeWindows(frontCount, 1.15, (col, spacing, y) => ({
    x: x - (frontCount - 1) * spacing / 2 + col * spacing,
    y, z: z + depth / 2 + 0.025
  }), 0);
  addFacadeWindows(frontCount, 1.15, (col, spacing, y) => ({
    x: x + (frontCount - 1) * spacing / 2 - col * spacing,
    y, z: z - depth / 2 - 0.025
  }), Math.PI);
  addFacadeWindows(sideCount, 1.15, (col, spacing, y) => ({
    x: x + width / 2 + 0.025,
    y, z: z + (sideCount - 1) * spacing / 2 - col * spacing
  }), Math.PI / 2);
  addFacadeWindows(sideCount, 1.15, (col, spacing, y) => ({
    x: x - width / 2 - 0.025,
    y, z: z - (sideCount - 1) * spacing / 2 + col * spacing
  }), -Math.PI / 2);

  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(Math.min(width * 0.72, 4.8), 0.2, 0.12),
    new THREE.MeshBasicMaterial({ color: signColor })
  );
  sign.position.set(x, Math.min(height - 1, height * 0.68), z + depth / 2 + 0.09);
  scene.add(sign);
}

let citySeed = 73;
const cityRandom = () => { citySeed = (citySeed * 16807) % 2147483647; return (citySeed - 1) / 2147483646; };
const towerColors = [0x17243a, 0x202039, 0x182b36, 0x292039, 0x1b293d];
const neonColors = [0x28e6dc, 0xb24cff, 0xff4fa3, 0x4c9dff];

// A street corridor gives the starting view a clear sense of scale and depth.
for (let side of [-1, 1]) {
  for (let i = 0; i < 5; i++) {
    const z = -25 + i * 12;
    const width = 7 + cityRandom() * 3;
    const depth = 8 + cityRandom() * 3;
    const height = 13 + cityRandom() * 18;
    makeBuilding(side * (10.5 + cityRandom() * 1.5), z, width, height, depth,
      towerColors[Math.floor(cityRandom() * towerColors.length)],
      neonColors[Math.floor(cityRandom() * neonColors.length)],
      300 + side * 100 + i);
  }
}

// Distant skyline wraps around the player instead of leaving empty black space.
for (let ring = 0; ring < 3; ring++) {
  const radius = 36 + ring * 22;
  const count = 16 + ring * 8;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (ring % 2) * 0.11;
    const x = Math.sin(angle) * radius + (cityRandom() - 0.5) * 7;
    const z = Math.cos(angle) * radius + (cityRandom() - 0.5) * 7;
    const width = 7 + cityRandom() * 6;
    const depth = 7 + cityRandom() * 6;
    const height = 18 + cityRandom() * (ring === 0 ? 24 : 42);
    makeBuilding(x, z, width, height, depth,
      towerColors[Math.floor(cityRandom() * towerColors.length)],
      neonColors[Math.floor(cityRandom() * neonColors.length)],
      500 + ring * 37 + i);
  }
}

// One draw call per window color, rather than one draw call per window.
const windowMaterials = {
  cyan: new THREE.MeshBasicMaterial({ color: 0x43c9d2, side: THREE.DoubleSide }),
  purple: new THREE.MeshBasicMaterial({ color: 0x9b67e8, side: THREE.DoubleSide }),
  dark: new THREE.MeshBasicMaterial({ color: 0x101a2a, side: THREE.DoubleSide })
};
for (const kind of Object.keys(windowBatches)) {
  const matrices = windowBatches[kind];
  const instances = new THREE.InstancedMesh(windowGeometry, windowMaterials[kind], matrices.length);
  matrices.forEach((matrix, index) => instances.setMatrixAt(index, matrix));
  instances.instanceMatrix.needsUpdate = true;
  scene.add(instances);
}

// Wet-looking asphalt, raised sidewalks, curb strips and lane markings.
const road = new THREE.Mesh(
  new THREE.PlaneGeometry(15, 125),
  new THREE.MeshStandardMaterial({ color: 0x090f1b, roughness: 0.28, metalness: 0.34 })
);
road.rotation.x = -Math.PI / 2;
road.position.set(0, 0.006, -8);
scene.add(road);
const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0x252d3b, roughness: 0.92, metalness: 0.12 });
for (const x of [-9.3, 9.3]) {
  const sidewalk = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.18, 125), sidewalkMat);
  sidewalk.position.set(x, 0.07, -8);
  scene.add(sidewalk);
  const curb = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 125), new THREE.MeshStandardMaterial({ color: 0x667080, roughness: 0.82 }));
  curb.position.set(x + (x < 0 ? 1.55 : -1.55), 0.12, -8);
  scene.add(curb);
}
const laneMat = new THREE.MeshBasicMaterial({ color: 0xb1a76c });
for (let z = -66; z < 55; z += 8) {
  const dash = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.014, 3.8), laneMat);
  dash.position.set(0, 0.018, z);
  scene.add(dash);
}

// Street lamps with restrained colored pools of light.
const lampMat = new THREE.MeshStandardMaterial({ color: 0x26364a, metalness: 0.8, roughness: 0.35 });
for (let z = -54; z <= 42; z += 16) {
  for (const x of [-8.1, 8.1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.08, 4.8, 8), lampMat);
    pole.position.set(x, 2.4, z);
    scene.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.07, 0.07), lampMat);
    arm.position.set(x + (x < 0 ? 0.35 : -0.35), 4.65, z);
    scene.add(arm);
    const glow = new THREE.PointLight(x < 0 ? 0x38dce8 : 0xb35bff, 2.4, 13);
    glow.position.set(x + (x < 0 ? 0.65 : -0.65), 4.35, z);
    scene.add(glow);
  }
}
const neonRing = new THREE.Mesh(
  new THREE.TorusGeometry(2.2, 0.045, 12, 96),
  new THREE.MeshBasicMaterial({ color: 0x38f5df })
);
neonRing.position.set(0, 3.4, -12);
scene.add(neonRing);
const signLight = new THREE.PointLight(0x3cebdc, 18, 18);
signLight.position.set(0, 4, -11);
scene.add(signLight);
const marker = new THREE.Mesh(
  new THREE.CylinderGeometry(0.35, 0.35, 0.08, 32),
  new THREE.MeshBasicMaterial({ color: 0x3cebdc })
);
marker.position.set(0, 0.08, 1);
scene.add(marker);

// Keep the city as a separate world. The title screen renders a different
// environment until the player explicitly chooses PLAY.
const cityWorld = new THREE.Group();
cityWorld.name = "CITY_WORLD";
for (const child of [...scene.children]) {
  if (child !== player) cityWorld.attach(child);
}
scene.add(cityWorld);
cityWorld.visible = false;

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

// Character save data: 3 points to distribute between the three attributes.
let character = { strength: 0, health: 0, compatibility: 0 };
let credits = 500;
try {
  const saved = JSON.parse(localStorage.getItem("neon-genesis-save") || "null");
  if (saved?.character) {
    const c = saved.character;
    const values = [c.strength, c.health, c.compatibility];
    if (values.every(v => Number.isInteger(v) && v >= 0 && v <= 3) &&
        values.reduce((a, b) => a + b, 0) <= 3) character = { ...c };
  }
  if (Number.isInteger(saved?.credits) && saved.credits >= 0) credits = saved.credits;
} catch {}

function saveGame() {
  try { localStorage.setItem("neon-genesis-save", JSON.stringify({ character, credits })); } catch {}
}
const pointsLeft = () => 3 - character.strength - character.health - character.compatibility;
const gradeNames = ["BASIC", "STANDARD", "ADVANCED", "ELITE"];

function updateCharacterUI() {
  document.querySelector("#points-left").textContent = pointsLeft();
  document.querySelector("#strength-value").textContent = character.strength;
  document.querySelector("#health-value").textContent = character.health;
  document.querySelector("#compatibility-value").textContent = character.compatibility;
  document.querySelector("#max-health").textContent = 100 + character.health * 25;
  document.querySelector("#cyber-grade").textContent = gradeNames[character.compatibility];
  document.querySelector("#credits").textContent = "$" + credits.toLocaleString();
  document.querySelector("#shop-credits").textContent = "$" + credits.toLocaleString();
  document.querySelectorAll("[data-stat][data-change]").forEach(button => {
    const stat = button.dataset.stat;
    const change = Number(button.dataset.change);
    button.disabled = change > 0 ? pointsLeft() <= 0 : character[stat] <= 0;
  });
}

document.querySelectorAll("[data-stat][data-change]").forEach(button => {
  button.addEventListener("click", () => {
    const stat = button.dataset.stat;
    const change = Number(button.dataset.change);
    if (change > 0 && pointsLeft() > 0 && character[stat] < 3) character[stat]++;
    if (change < 0 && character[stat] > 0) character[stat]--;
    saveGame();
    updateCharacterUI();
  });
});

const characterPanel = document.querySelector("#character-panel");
const shopPanel = document.querySelector("#shop-panel");
function showPanel(panel) {
  const wasOpen = !panel.hidden;
  characterPanel.hidden = true;
  shopPanel.hidden = true;
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
  if (!renderer.xr.isPresenting) renderer.domElement.requestPointerLock?.();
}
function toggleGameMenu() {
  if (gameUI.classList.contains("menu-open")) closeGameMenu();
  else openGameMenu();
}
document.addEventListener("keydown", event => {
  if (event.code === "KeyE" && !renderer.xr.isPresenting) {
    event.preventDefault();
    toggleGameMenu();
  }
  if (event.code === "Escape" && gameUI.classList.contains("menu-open")) closeGameMenu();
});
document.querySelector("#character-toggle").addEventListener("click", () => showPanel(characterPanel));
document.querySelector("#shop-toggle").addEventListener("click", () => showPanel(shopPanel));
document.querySelectorAll("[data-close]").forEach(button => {
  button.addEventListener("click", () => { document.getElementById(button.dataset.close).hidden = true; });
});
updateCharacterUI();

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

function startCity() {
  try { localStorage.setItem("neon-genesis-appearance", JSON.stringify(appearance)); } catch {}
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
  // First-person on PC and Quest. Hide the head to avoid seeing inside it,
  // but keep the torso and legs visible when the player looks down.
  camera.position.set(0, 1.65, 0);
  pitch = 0;
  camera.rotation.set(0, 0, 0);
  if (playableAvatar) {
    playableAvatar.root.visible = true;
    playableAvatar.head.visible = false;
    // Desktop uses camera-view hands; Quest uses hands on the controllers.
    for (const hand of playableAvatar.handGroups) hand.visible = false;
    for (const arm of playableAvatar.armPivots) arm.visible = true;
  }
  if (firstPersonHands) firstPersonHands.visible = !renderer.xr.isPresenting;
  startStatus.textContent = "City loaded. Welcome to Neon Genesis.";
}

const appearanceChoices = {
  bodyType: ["Male", "Female"],
  hatStyle: ["Baseball Cap", "Beanie", "Bucket Hat", "Tech Helmet"],
  hatColour: ["Black", "White", "Yellow", "Cyan", "Purple", "Red"],
  jacketColour: ["Black", "White", "Yellow", "Cyan", "Purple", "Red"]
};

// 3D character preview: the same model is shown on desktop and beside the VR editor.
const characterPreview = new THREE.Group();
characterPreview.name = "LIVE_CHARACTER_PREVIEW";
mainMenuWorld.add(characterPreview);
characterPreview.position.set(3.15, 0, 2.4);

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
const previewKeyLight = new THREE.PointLight(0x79f5ed, 2.4, 4.5);
previewKeyLight.position.set(-0.8, 2.1, 1.25);
characterPreview.add(previewKeyLight);
const previewRimLight = new THREE.PointLight(0xa54dff, 1.8, 3.5);
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

// Shared human character builder. The same model is used for the editor
// preview and the playable character so clothing and body type stay matched.
function createHumanAvatar(parent) {
  const root = new THREE.Group();
  root.name = "HUMAN_PLAYER_AVATAR";
  parent.add(root);

  const bodyType = appearance.bodyType === "Female" ? "Female" : "Male";
  const jacketHex = {
    Black: 0x30394a, White: 0xcbd4df, Yellow: 0xc49a25,
    Cyan: 0x147f89, Purple: 0x6542a0, Red: 0x9e283b
  }[appearance.jacketColour] || 0x30394a;
  const hatHex = {
    Black: 0x202735, White: 0xcbd4df, Yellow: 0xc49a25,
    Cyan: 0x147f89, Purple: 0x6542a0, Red: 0x9e283b
  }[appearance.hatColour] || 0x202735;

  const skin = new THREE.MeshStandardMaterial({ color: 0xb98265, roughness: 0.82, metalness: 0.0 });
  const skinLight = new THREE.MeshStandardMaterial({ color: 0xc99476, roughness: 0.84, metalness: 0.0 });
  const jacket = new THREE.MeshStandardMaterial({ color: jacketHex, roughness: 0.76, metalness: 0.08 });
  const jacketShadow = new THREE.MeshStandardMaterial({ color: 0x172131, roughness: 0.82, metalness: 0.06 });
  const jacketTrim = new THREE.MeshStandardMaterial({ color: 0x3b5267, roughness: 0.64, metalness: 0.18 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x202a39, roughness: 0.9, metalness: 0.03 });
  const shoes = new THREE.MeshStandardMaterial({ color: 0x101722, roughness: 0.82, metalness: 0.06 });
  const shoeSole = new THREE.MeshStandardMaterial({ color: 0x070c13, roughness: 0.9 });
  const hat = new THREE.MeshStandardMaterial({ color: hatHex, roughness: 0.72, metalness: 0.04 });
  const hatDetail = new THREE.MeshStandardMaterial({ color: 0x35d6cd, emissive: 0x0a6564, emissiveIntensity: 0.42, roughness: 0.55 });
  const eyeWhite = new THREE.MeshStandardMaterial({ color: 0xf1e8dd, roughness: 0.8 });
  const eyeDark = new THREE.MeshStandardMaterial({ color: 0x171923, roughness: 0.7 });
  const brow = new THREE.MeshStandardMaterial({ color: 0x32251f, roughness: 0.9 });
  const mouth = new THREE.MeshStandardMaterial({ color: 0x74483f, roughness: 0.9 });
  const skinDetail = new THREE.MeshStandardMaterial({ color: 0x94644f, roughness: 0.9 });

  const add = (parentNode, geometry, material, x, y, z) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    parentNode.add(mesh);
    return mesh;
  };
  const capsule = (parentNode, material, radius, length, x, y, z) =>
    add(parentNode, new THREE.CapsuleGeometry(radius, length, 6, 14), material, x, y, z);

  const proportions = bodyType === "Female"
    ? { shoulder: 0.285, hip: 0.245, legGap: 0.145, arm: 0.088 }
    : { shoulder: 0.315, hip: 0.225, legGap: 0.14, arm: 0.096 };

  // Natural waist, hips and jacket. LatheGeometry keeps the torso rounded
  // instead of making it look like a stack of separate hard-surface pieces.
  const pelvis = add(root, new THREE.SphereGeometry(0.235, 24, 18), pants, 0, 0.91, 0);
  pelvis.scale.set(proportions.hip / 0.235, 0.78, 0.76);
  const torsoProfile = bodyType === "Female"
    ? [
        new THREE.Vector2(0.19, 0.88), new THREE.Vector2(0.215, 0.96),
        new THREE.Vector2(0.205, 1.04), new THREE.Vector2(0.225, 1.15),
        new THREE.Vector2(0.26, 1.30), new THREE.Vector2(0.285, 1.39),
        new THREE.Vector2(0.22, 1.46), new THREE.Vector2(0.12, 1.49)
      ]
    : [
        new THREE.Vector2(0.20, 0.88), new THREE.Vector2(0.23, 0.96),
        new THREE.Vector2(0.225, 1.04), new THREE.Vector2(0.24, 1.15),
        new THREE.Vector2(0.275, 1.30), new THREE.Vector2(0.31, 1.39),
        new THREE.Vector2(0.235, 1.46), new THREE.Vector2(0.12, 1.49)
      ];
  const torso = add(root, new THREE.LatheGeometry(torsoProfile, 32), jacket, 0, 0, 0);
  torso.scale.z = 0.82;

  // Soft collar, fabric seams, pockets and a cloth front closure.
  add(root, new THREE.CylinderGeometry(0.13, 0.155, 0.075, 24), jacketShadow, 0, 1.455, 0);
  add(root, new THREE.BoxGeometry(0.025, 0.40, 0.012), jacketTrim, 0, 1.20, 0.228);
  add(root, new THREE.BoxGeometry(0.012, 0.38, 0.014), hatDetail, 0.018, 1.20, 0.236);
  for (const side of [-1, 1]) {
    const pocket = add(root, new THREE.BoxGeometry(0.105, 0.13, 0.018),
      jacketShadow, side * 0.145, 1.24, 0.204);
    pocket.rotation.z = side * -0.05;
    add(root, new THREE.BoxGeometry(0.11, 0.018, 0.02),
      jacketTrim, side * 0.145, 1.31, 0.215);
  }
  add(root, new THREE.BoxGeometry(0.40, 0.035, 0.025), jacketShadow, 0, 0.94, 0.17);
  add(root, new THREE.BoxGeometry(0.06, 0.055, 0.012), hatDetail, 0, 1.00, 0.205);

  // Neck and a human face: no metal mask or mechanical visor.
  add(root, new THREE.CylinderGeometry(0.073, 0.085, 0.16, 18), skin, 0, 1.525, 0);
  const head = new THREE.Group();
  head.name = "AVATAR_HEAD";
  head.position.set(0, 1.715, 0);
  root.add(head);
  const skull = add(head, new THREE.SphereGeometry(0.17, 28, 22), skin, 0, 0, 0);
  skull.scale.set(0.92, 1.12, 0.88);
  const jaw = add(head, new THREE.SphereGeometry(0.125, 22, 16), skinLight, 0, -0.085, 0.035);
  jaw.scale.set(0.98, 0.72, 0.92);
  const nose = add(head, new THREE.SphereGeometry(0.035, 14, 12), skinLight, 0, -0.005, 0.145);
  nose.scale.set(0.78, 1.28, 0.8);
  for (const side of [-1, 1]) {
    const ear = add(head, new THREE.SphereGeometry(0.045, 14, 12), skin, side * 0.15, -0.015, 0);
    ear.scale.set(0.55, 1.1, 0.74);
    add(head, new THREE.SphereGeometry(0.026, 14, 10), eyeWhite, side * 0.064, 0.035, 0.125);
    add(head, new THREE.SphereGeometry(0.013, 12, 10), eyeDark, side * 0.064, 0.034, 0.147);
    const eyebrow = add(head, new THREE.CapsuleGeometry(0.009, 0.045, 3, 8),
      brow, side * 0.064, 0.073, 0.128);
    eyebrow.rotation.z = side * -0.12;
  }
  add(head, new THREE.BoxGeometry(0.065, 0.009, 0.008), mouth, 0, -0.115, 0.143);
  add(head, new THREE.SphereGeometry(0.018, 10, 8), skinDetail, -0.035, -0.055, 0.132);

  // Hats sit on the head but do not cover the face.
  if (appearance.hatStyle === "Baseball Cap") {
    const crown = add(head, new THREE.SphereGeometry(0.18, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2),
      hat, 0, 0.13, -0.012);
    crown.scale.set(1.04, 0.88, 1.0);
    add(head, new THREE.SphereGeometry(0.17, 20, 12), hat, 0, 0.13, 0.105)
      .scale.set(1.04, 0.075, 0.72);
    add(head, new THREE.BoxGeometry(0.018, 0.018, 0.105), hatDetail, 0, 0.19, -0.01);
  } else if (appearance.hatStyle === "Beanie") {
    add(head, new THREE.CylinderGeometry(0.17, 0.19, 0.20, 24), hat, 0, 0.15, 0);
    add(head, new THREE.SphereGeometry(0.17, 20, 12), hat, 0, 0.25, 0)
      .scale.set(1, 0.35, 1);
    add(head, new THREE.CylinderGeometry(0.19, 0.19, 0.045, 24), jacketShadow, 0, 0.065, 0);
  } else if (appearance.hatStyle === "Bucket Hat") {
    add(head, new THREE.CylinderGeometry(0.15, 0.17, 0.16, 24), hat, 0, 0.16, 0);
    add(head, new THREE.CylinderGeometry(0.18, 0.235, 0.035, 32), hat, 0, 0.075, 0);
    add(head, new THREE.CylinderGeometry(0.16, 0.16, 0.012, 24), hatDetail, 0, 0.095, 0);
  } else if (appearance.hatStyle === "Tech Helmet") {
    const shell = add(head, new THREE.SphereGeometry(0.19, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      hat, 0, 0.12, -0.005);
    shell.scale.set(1.06, 0.94, 1.04);
    add(head, new THREE.BoxGeometry(0.29, 0.035, 0.035), hatDetail, 0, 0.07, 0.15);
    for (const side of [-1, 1]) {
      add(head, new THREE.SphereGeometry(0.035, 12, 10), jacketTrim, side * 0.17, 0.005, 0);
    }
  }

  const legPivots = [];
  const kneePivots = [];
  const armPivots = [];
  const elbowPivots = [];
  const handGroups = [];

  // Continuous sleeves and rounded elbow joints overlap slightly so there
  // are no exposed gaps or separate hard-looking joint caps.
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * proportions.shoulder, 1.385, 0);
    root.add(shoulder);
    add(shoulder, new THREE.SphereGeometry(proportions.arm * 1.12, 18, 14),
      jacket, 0, -0.015, 0);
    capsule(shoulder, jacket, proportions.arm, 0.27, 0, -0.16, 0);
    const elbow = new THREE.Group();
    elbow.position.y = -0.30;
    shoulder.add(elbow);
    add(elbow, new THREE.SphereGeometry(proportions.arm * 0.96, 18, 14),
      jacket, 0, 0, 0);
    capsule(elbow, jacket, proportions.arm * 0.83, 0.26, 0, -0.145, 0.012);
    add(elbow, new THREE.CylinderGeometry(0.074, 0.078, 0.045, 16),
      jacketShadow, 0, -0.285, 0.012);
    const hand = new THREE.Group();
    hand.position.set(0, -0.30, 0.025);
    elbow.add(hand);
    add(hand, new THREE.SphereGeometry(0.068, 18, 14),
      skin, 0, -0.045, 0.035).scale.set(0.82, 1.2, 0.72);
    for (let finger = -1; finger <= 2; finger++) {
      capsule(hand, skin, 0.012, 0.055, (finger - 0.5) * 0.026, -0.12, 0.055);
    }
    const thumb = capsule(hand, skin, 0.015, 0.065, side * 0.07, -0.075, 0.025);
    thumb.rotation.z = side * -0.75;
    armPivots.push(shoulder);
    elbowPivots.push(elbow);
    handGroups.push(hand);
  }

  // Rounded hips, knees and ankles. The knee joints are covered by the same
  // trouser material as the legs, rather than sticking out like robot hinges.
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * proportions.legGap, 0.91, 0);
    root.add(hip);
    capsule(hip, pants, 0.115, 0.37, 0, -0.205, 0);
    const knee = new THREE.Group();
    knee.position.y = -0.40;
    hip.add(knee);
    add(knee, new THREE.SphereGeometry(0.105, 18, 14), pants, 0, 0, 0);
    capsule(knee, pants, 0.084, 0.33, 0, -0.175, 0);
    add(knee, new THREE.CylinderGeometry(0.085, 0.09, 0.045, 18),
      pants, 0, -0.35, 0);
    const foot = new THREE.Group();
    foot.position.set(0, -0.38, 0.015);
    knee.add(foot);
    const shoe = add(foot, new THREE.SphereGeometry(0.115, 18, 14),
      shoes, 0, -0.045, 0.075);
    shoe.scale.set(0.92, 0.66, 1.55);
    const sole = add(foot, new THREE.BoxGeometry(0.19, 0.025, 0.27),
      shoeSole, 0, -0.105, 0.08);
    sole.rotation.x = -0.035;
    add(foot, new THREE.BoxGeometry(0.06, 0.018, 0.012),
      jacketTrim, 0, -0.026, 0.18);
    legPivots.push(hip);
    kneePivots.push(knee);
  }

  return { root, head, legPivots, kneePivots, armPivots, elbowPivots, handGroups };
}

function updateCharacterPreview() {
  if (avatarModel) disposeAvatarRig(avatarModel);
  const preview = createHumanAvatar(characterPreview);
  avatarModel = preview.root;
  avatarModel.name = "PLAYER_AVATAR_PREVIEW";
  avatarModel.position.y = 0.12;
}

let firstPersonHands = null;
function rebuildFirstPersonHands() {
  if (firstPersonHands) disposeAvatarRig(firstPersonHands);
  firstPersonHands = new THREE.Group();
  firstPersonHands.name = "FIRST_PERSON_HANDS";
  camera.add(firstPersonHands);

  const skin = new THREE.MeshStandardMaterial({ color: 0xb98265, roughness: 0.84 });
  const jacketHex = {
    Black: 0x30394a, White: 0xcbd4df, Yellow: 0xc49a25,
    Cyan: 0x147f89, Purple: 0x6542a0, Red: 0x9e283b
  }[appearance.jacketColour] || 0x30394a;
  const sleeve = new THREE.MeshStandardMaterial({ color: jacketHex, roughness: 0.78 });
  const cuff = new THREE.MeshStandardMaterial({ color: 0x243448, roughness: 0.72 });
  const add = (parent, geometry, material, x, y, z) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  const addLimb = (parent, start, end, radius, material) => {
    const a = new THREE.Vector3(...start);
    const b = new THREE.Vector3(...end);
    const direction = b.clone().sub(a);
    const midpoint = a.clone().add(b).multiplyScalar(0.5);
    const mesh = add(parent,
      new THREE.CapsuleGeometry(radius, Math.max(0.02, direction.length() - radius * 0.5), 6, 12),
      material, midpoint.x, midpoint.y, midpoint.z);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    return mesh;
  };

  for (const side of [-1, 1]) {
    const shoulder = [side * 0.22, -0.16, -0.34];
    const elbow = [side * 0.34, -0.32, -0.56];
    const wrist = [side * 0.39, -0.47, -0.80];
    addLimb(firstPersonHands, shoulder, elbow, 0.09, sleeve);
    add(firstPersonHands, new THREE.SphereGeometry(0.09, 16, 12),
      sleeve, elbow[0], elbow[1], elbow[2]);
    addLimb(firstPersonHands, elbow, wrist, 0.075, sleeve);
    add(firstPersonHands, new THREE.CylinderGeometry(0.075, 0.08, 0.055, 16),
      cuff, wrist[0], wrist[1], wrist[2]);
    const handX = side * 0.40;
    const palm = add(firstPersonHands, new THREE.SphereGeometry(0.067, 18, 14),
      skin, handX, -0.52, -0.88);
    palm.scale.set(0.84, 1.12, 0.76);
    for(let finger=0;finger<4;finger++){
      const x=handX+(finger-1.5)*0.025;
      const digit=add(firstPersonHands,new THREE.CapsuleGeometry(0.011,0.055,4,8),
        skin,x,-0.59,-0.91);
      digit.rotation.x=-0.18;
    }
    const thumb=add(firstPersonHands,new THREE.CapsuleGeometry(0.014,0.06,4,8),
      skin,handX-side*0.07,-0.55,-0.85);
    thumb.rotation.z=side*0.65;
  }
  firstPersonHands.visible = isInCity && !renderer.xr.isPresenting;
}
function rebuildPlayableAvatar() {
  if (playableAvatar) disposeAvatarRig(playableAvatar.root);
  playableAvatar = createHumanAvatar(player);
  playableAvatar.root.name = "PLAYABLE_HUMAN_AVATAR";
  // The builder faces +Z for the display stand. The actual player faces -Z.
  playableAvatar.root.rotation.y = Math.PI;
  playableAvatar.root.visible = false;
  rebuildFirstPersonHands();
}
updateCharacterPreview();
rebuildPlayableAvatar();

function animatePlayableAvatar(amount, elapsed) {
  if (!playableAvatar) return;
  const blend = THREE.MathUtils.clamp(amount, 0, 1);
  const phase = elapsed * 8.4;
  const stride = Math.sin(phase) * 0.48 * blend;
  const leftLegFlex = Math.max(0, Math.sin(phase + Math.PI)) * 0.58 * blend;
  const rightLegFlex = Math.max(0, Math.sin(phase)) * 0.58 * blend;

  playableAvatar.legPivots[0].rotation.x = stride;
  playableAvatar.legPivots[1].rotation.x = -stride;
  playableAvatar.kneePivots[0].rotation.x = leftLegFlex;
  playableAvatar.kneePivots[1].rotation.x = rightLegFlex;
  playableAvatar.armPivots[0].rotation.x = -stride * 0.72;
  playableAvatar.armPivots[1].rotation.x = stride * 0.72;
  playableAvatar.elbowPivots[0].rotation.x = 0.08 + leftLegFlex * 0.22;
  playableAvatar.elbowPivots[1].rotation.x = 0.08 + rightLegFlex * 0.22;
  playableAvatar.root.position.y = blend > 0 ? Math.abs(Math.sin(phase * 2)) * 0.024 * blend : 0;
  if (firstPersonHands) {
    firstPersonHands.position.y = -Math.abs(Math.sin(phase * 2)) * 0.012 * blend;
    firstPersonHands.rotation.z = Math.sin(phase) * 0.025 * blend;
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
  color: 0x111d2b, metalness: 0.82, roughness: 0.34
});
const terminalGlow = new THREE.MeshStandardMaterial({
  color: 0x183c45, emissive: 0x0c6970, emissiveIntensity: 1.1,
  metalness: 0.55, roughness: 0.28
});
const terminalButton = new THREE.MeshStandardMaterial({
  color: 0x12313a, emissive: 0x087b7b, emissiveIntensity: 1.5,
  metalness: 0.48, roughness: 0.3
});

function makeTerminalLabel(width, height, painter) {
  // Draw at twice the pixel resolution while keeping the same physical mesh size.
  const logicalWidth = 1024;
  const logicalHeight = Math.max(128, Math.round(logicalWidth * height / width));
  const resolutionScale = 2;
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

function addTerminalCard({ x, y, width, height, action, labelPainter, button = false }) {
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
  const { label, texture, canvas } = makeTerminalLabel(width * 0.96, height * 0.88, labelPainter);
  group.add(label);
  if (action) {
    backing.userData.action = action;
    backing.userData.baseEmissive = button ? 0x087b7b : 0x0c252c;
    vrStartTargets.push(backing);
  }
  group.userData.refresh = () => {
    const ctx = canvas.getContext("2d");
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.clearRect(0, 0, ctx.logicalWidth, ctx.logicalHeight);
    labelPainter(ctx);
    texture.needsUpdate = true;
  };
  return group;
}

const titleCard = addTerminalCard({
  x: 0, y: 0.48, width: 1.72, height: 0.22,
  labelPainter: ctx => {
    ctx.fillStyle = "#55f5e8";
    ctx.font = "bold 64px Arial";
    ctx.fillText("NEON GENESIS", 34, ctx.logicalHeight * 0.48);
    ctx.fillStyle = "#b9c8d8";
    ctx.font = "bold 30px Arial";
    ctx.fillText("CHARACTER SETUP", 38, ctx.logicalHeight * 0.80);
  }
});

const startRows = [];
const rowInfo = [
  { key: "bodyType", label: "BODY TYPE" },
  { key: "hatStyle", label: "HAT STYLE" },
  { key: "hatColour", label: "HAT COLOR" },
  { key: "jacketColour", label: "JACKET COLOUR" }
];
rowInfo.forEach((info, index) => {
  const positions = [-0.63, -0.21, 0.21, 0.63];
  const row = addTerminalCard({
    x: positions[index], y: 0.02, width: 0.39, height: 0.28,
    action: () => cycleAppearance(info.key),
    labelPainter: ctx => {
      const center = ctx.logicalWidth / 2;
      const h = ctx.logicalHeight;
      ctx.textAlign = "center";
      ctx.fillStyle = "#9db4c9";
      ctx.font = "bold 36px Arial";
      ctx.fillText(info.label, center, h * 0.28);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 48px Arial";
      ctx.fillText(String(appearance[info.key]).toUpperCase(), center, h * 0.57);
      ctx.fillStyle = "#ffcf70";
      ctx.font = "bold 22px Arial";
      ctx.fillText("TAP TO CHANGE", center, h * 0.84);
      ctx.textAlign = "left";
    }
  });
  startRows.push(row);
});

document.querySelector("#play-button").addEventListener("click", startCity);

const confirmCard = addTerminalCard({
  x: 0, y: -0.34, width: 0.62, height: 0.17, button: true,
  action: () => startCity(),
  labelPainter: ctx => {
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 58px Arial";
    ctx.textAlign = "center";
    ctx.fillText("PLAY", 512, ctx.logicalHeight * 0.62);
    ctx.textAlign = "left";
  }
});

// Side rails and a small base make the menu read like a physical terminal.
for (const x of [-0.91, 0.91]) {
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.018, 1.16, 0.035), terminalGlow);
  rail.position.set(x, 0.02, -0.006);
  vrStart.add(rail);
}
const base = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.025, 0.12), terminalMetal);
base.position.set(0, -0.52, -0.015);
vrStart.add(base);
const terminalLight = new THREE.PointLight(0x26d9d0, 1.1, 2.8);
terminalLight.position.set(0, 0.08, 0.25);
vrStart.add(terminalLight);

function cycleAppearance(key) {
  const choices = appearanceChoices[key];
  const index = choices.indexOf(appearance[key]);
  appearance[key] = choices[(index + 1) % choices.length];
  const fieldIds = { bodyType: "body-type", hatStyle: "hat-style", hatColour: "hat-colour", jacketColour: "jacket-colour" };
  const field = document.getElementById(fieldIds[key]);
  if (field) field.value = String(appearance[key]);
  updateCharacterPreview();
  try { localStorage.setItem("neon-genesis-appearance", JSON.stringify(appearance)); } catch {}
  const rowIndex = rowInfo.findIndex(item => item.key === key);
  startRows[rowIndex]?.userData.refresh();
}

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
  const MENU_DISTANCE_FROM_SPAWN = 2.10;

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
  const avatarLocalX = 1.18;
  const avatarLocalZ = 0.24;
  const towardPlayerLocal = new THREE.Vector3(
    -avatarLocalX, 0, MENU_DISTANCE_FROM_SPAWN - avatarLocalZ
  ).normalize();
  const characterYaw = Math.atan2(towardPlayerLocal.x, towardPlayerLocal.z);
  setCharacterPreviewLocation(
    vrStart, avatarLocalX, -MENU_HEIGHT_ABOVE_FLOOR, avatarLocalZ, 0.78, characterYaw
  );
  for (const row of startRows) row.userData.refresh();
}
renderer.xr.addEventListener("sessionstart", () => {
  // Use the real tracked headset pose. Keep the body below the camera and
  // show virtual hands attached to the Touch controllers.
  camera.position.set(0, 1.65, 0);
  camera.rotation.set(0, 0, 0);
  pitch = 0;
  if (firstPersonHands) firstPersonHands.visible = false;
  if (playableAvatar) {
    playableAvatar.root.visible = isInCity;
    playableAvatar.head.visible = false;
    for (const hand of playableAvatar.handGroups) hand.visible = false;
    for (const arm of playableAvatar.armPivots) arm.visible = true;
  }
  vrSessionIntroActive = false;
});
renderer.xr.addEventListener("sessionend", () => {
  vrSessionIntroActive = false;
  vrStart.visible = false;
  vrStartReady = false;
  vrStartHovered = null;
  isInCity = false;
  cityWorld.visible = false;
  mainMenuWorld.visible = true;
  setCharacterPreviewLocation(mainMenuWorld, 2.45, 0, 2.4, 0.9, 0);
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
  const hit = vrMenuRaycaster.intersectObjects(vrStartTargets, false)[0];
  if (hit?.object?.userData?.action) hit.object.userData.action();
  return true;
}
const vrMenuRaycaster = new THREE.Raycaster();
const vrMenuPointer = new THREE.Vector3();
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
  trackedHand.position.set(0, -0.025, -0.11);
  const trackedSkin = new THREE.MeshStandardMaterial({ color: 0xb98265, roughness: 0.82 });
  const palm = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12), trackedSkin);
  palm.scale.set(0.82, 1.12, 0.72);
  trackedHand.add(palm);
  for (let finger = -1; finger <= 2; finger++) {
    const digit = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.055, 4, 8), trackedSkin);
    digit.position.set((finger - 0.5) * 0.026, -0.082, -0.018);
    digit.rotation.x = Math.PI / 2;
    trackedHand.add(digit);
  }
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.065, 4, 8), trackedSkin);
  thumb.position.set(0.065, -0.035, 0.005);
  thumb.rotation.z = -0.75;
  trackedHand.add(thumb);
  controller.add(trackedHand);
  const rayLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -3)]),
    new THREE.LineBasicMaterial({ color: 0x5ff5e8, depthTest: false })
  );
  rayLine.visible = false;
  controller.add(rayLine);
  controller.addEventListener("connected", event => {
    controller.userData.handedness = event.data.handedness;
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
  controller.addEventListener("select", () => {
    if (controller.userData.handedness === "right") {
      if (vrStart.visible) activateVRStartAtController(controller);
      else activateVRMenuAtController(controller);
    }
  });
  // Keep XR controllers in the same moving/turning space as the player camera.
  player.add(controller);
  vrControllerRays.push({ controller, rayLine });
}

let vrMenuPage = "character";
function drawVRMenu() {
  const ctx = vrMenuContext;
  ctx.clearRect(0, 0, 1024, 768);
  ctx.fillStyle = "rgba(5, 10, 25, 0.97)";
  ctx.fillRect(0, 0, 1024, 768);
  ctx.strokeStyle = "#5ff5e8";
  ctx.lineWidth = 5;
  ctx.strokeRect(5, 5, 1014, 758);
  ctx.fillStyle = "#5ff5e8";
  ctx.font = "bold 28px Arial";
  ctx.fillText("NEON GENESIS  /  NIGHT MARKET", 54, 58);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 25px Arial";
  ctx.fillText("CREDITS  $" + credits.toLocaleString(), 690, 58);
  ctx.fillStyle = "#14243d";
  ctx.fillRect(50, 92, 440, 66);
  ctx.fillRect(534, 92, 440, 66);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 25px Arial";
  ctx.fillText("CHARACTER", 175, 134);
  ctx.fillText("CYBERWARE SHOP", 650, 134);
  ctx.strokeStyle = vrMenuPage === "character" ? "#5ff5e8" : "#33445f";
  ctx.lineWidth = 4;
  ctx.strokeRect(50, 92, 440, 66);
  ctx.strokeStyle = vrMenuPage === "shop" ? "#5ff5e8" : "#33445f";
  ctx.strokeRect(534, 92, 440, 66);

  if (vrMenuPage === "character") {
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 38px Arial";
    ctx.fillText("YOUR CHARACTER", 60, 225);
    ctx.fillStyle = "#aab6cf";
    ctx.font = "24px Arial";
    ctx.fillText("Unspent attribute points: " + pointsLeft(), 60, 272);
    const rows = [
      ["STRENGTH", "Improves movement speed", "strength"],
      ["HEALTH", "Adds 25 maximum health per point", "health"],
      ["CYBERWARE COMPATIBILITY", "Unlocks higher cyberware grades", "compatibility"]
    ];
    rows.forEach((row, i) => {
      const y = 315 + i * 132;
      ctx.fillStyle = "#13233b";
      ctx.fillRect(55, y - 38, 914, 112);
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
    ctx.fillStyle = "#5ff5e8";
    ctx.font = "bold 23px Arial";
    ctx.fillText("MAX HEALTH: " + (100 + character.health * 25), 65, 735);
    ctx.fillText("CYBERWARE GRADE: " + gradeNames[character.compatibility], 490, 735);
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 38px Arial";
    ctx.fillText("CYBERWARE SHOP", 60, 235);
    ctx.fillStyle = "#aab6cf";
    ctx.font = "25px Arial";
    ctx.fillText("The first cyberware stock is still being designed.", 60, 300);
    ctx.fillText("Your credits are saved: $" + credits.toLocaleString(), 60, 355);
    ctx.fillStyle = "#5ff5e8";
    ctx.font = "bold 28px Arial";
    ctx.fillText("UPGRADES COMING SOON", 60, 455);
  }
  ctx.fillStyle = "#ff789d";
  ctx.font = "bold 22px Arial";
  ctx.fillText("Y  /  CLOSE MENU", 770, 720);
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
  vrMenuRaycaster.setFromXRController(controller);
  const hit = vrMenuRaycaster.intersectObject(vrMenuPanel, false)[0];
  if (!hit?.uv) return;
  const x = hit.uv.x * 1024;
  const y = (1 - hit.uv.y) * 768;
  if (y >= 92 && y <= 158) {
    if (x >= 50 && x <= 490) vrMenuPage = "character";
    else if (x >= 534 && x <= 974) vrMenuPage = "shop";
  } else if (vrMenuPage === "character") {
    const rows = [
      { stat: "strength", y1: 277, y2: 389 },
      { stat: "health", y1: 409, y2: 521 },
      { stat: "compatibility", y1: 541, y2: 653 }
    ];
    for (const row of rows) {
      if (y >= row.y1 && y <= row.y2 && x >= 780 && x <= 965) {
        const change = x < 875 ? -1 : 1;
        if (change > 0 && pointsLeft() > 0 && character[row.stat] < 3) character[row.stat]++;
        if (change < 0 && character[row.stat] > 0) character[row.stat]--;
        saveGame();
        updateCharacterUI();
        break;
      }
    }
  }
  drawVRMenu();
}
function updateVRMenuPointer() {
  if (!renderer.xr.isPresenting || (!vrMenu.visible && !vrStart.visible)) {
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
  rightItem.rayLine.visible = true;
  vrMenuRaycaster.setFromXRController(rightItem.controller);
  const startHit = vrStart.visible
    ? vrMenuRaycaster.intersectObjects(vrStartTargets, false)[0]
    : null;
  const menuHit = !vrStart.visible && vrMenu.visible
    ? vrMenuRaycaster.intersectObject(vrMenuPanel, false)[0]
    : null;
  const hit = startHit || menuHit;
  const hovered = startHit?.object || null;
  if (vrStartHovered && vrStartHovered !== hovered) {
    vrStartHovered.material.emissive.setHex(vrStartHovered.userData.baseEmissive);
    vrStartHovered.material.emissiveIntensity = 1.1;
  }
  if (hovered && hovered !== vrStartHovered) {
    hovered.material.emissive.setHex(0x16a8a3);
    hovered.material.emissiveIntensity = 1.8;
  }
  vrStartHovered = hovered;
  rightItem.rayLine.material.color.set(hit ? 0x5ff5e8 : 0x8793a8);
  if (hit) {
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
  if (!isQuestBrowser && !renderer.xr.isPresenting &&
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

function movePlayer(delta) {
  let stickX = 0;
  let stickY = 0;
  if (renderer.xr.isPresenting) {
    const stick = getLeftStick();
    const look = getRightStickAndMenuButton();
    const yPressed = getLeftYButton();
    stickX = Math.abs(stick.x) > 0.12 ? stick.x : 0;
    stickY = Math.abs(stick.y) > 0.12 ? stick.y : 0;
    if (yPressed && !previousMenuButton) setVRMenuOpen(!vrMenu.visible);
    previousMenuButton = yPressed;
    // Smooth horizontal turning; headset tracking still controls natural up/down looking.
    player.rotation.y -= look.x * 2.2 * delta;
  } else {
    stickX = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    stickY = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
  }
  camera.getWorldDirection(cameraDirection);
  forward.set(cameraDirection.x, 0, cameraDirection.z).normalize();
  right.crossVectors(forward, up).normalize();
  movement.set(0, 0, 0);
  movement.addScaledVector(forward, -stickY);
  movement.addScaledVector(right, stickX);
  const movementAmount = Math.min(1, movement.length());
  if (movement.lengthSq() > 1) movement.normalize();
  player.position.addScaledVector(movement, (3.2 + character.strength * 0.18) * delta);
  return movementAmount;
}

startStatus.textContent = "City systems are ready. Press Y to open or close the in-game menu.";
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
renderer.setAnimationLoop(time => {
  const delta = Math.min(clock.getDelta(), 0.05);
  // Initialize only after this frame has updated Three.js' tracked XR camera.
  const needsVRIntro = renderer.xr.isPresenting && !vrSessionIntroActive && !vrStartReady;
  const movementAmount = isInCity ? movePlayer(delta) : 0;
  animatePlayableAvatar(movementAmount, time * 0.001);
  updateVRMenuPointer();
  neonRing.rotation.z = time * 0.00025;
  marker.material.color.setHSL(0.48 + Math.sin(time * 0.002) * 0.04, 0.9, 0.58);
  crossedProps.rotation.y = time * 0.00022;
  crossedProps.position.y = 1.72 + Math.sin(time * 0.0012) * 0.045;
  platformRing.rotation.y = time * 0.00018;
  platformRingInner.rotation.y = -time * 0.00024;
  renderer.render(scene, camera);
  if (needsVRIntro && renderer.xr.isPresenting) showVRIntro();
});
