import * as THREE from "three";
import { VRButton } from "three/addons/webxr/VRButton.js";

const status = document.querySelector("#status");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x080b18);
scene.fog = new THREE.Fog(0x080b18, 18, 90);

const player = new THREE.Group();
scene.add(player);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 150);
camera.rotation.order = "YXZ";
camera.position.set(0, 1.65, 0);
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
document.body.appendChild(vrButton);

// Release any desktop pointer lock before the browser starts an immersive session.
// Capture phase runs before the VRButton's own click handler.
vrButton.addEventListener("click", () => {
  if (document.pointerLockElement) document.exitPointerLock?.();
}, true);

scene.add(new THREE.HemisphereLight(0x9bb8ff, 0x171020, 2));
const moonLight = new THREE.DirectionalLight(0x8cbcff, 1.4);
moonLight.position.set(-5, 12, 8);
scene.add(moonLight);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(180, 180),
  new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.9, metalness: 0.25 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.03;
scene.add(floor);

const grid = new THREE.GridHelper(180, 90, 0x245c78, 0x1a2940);
grid.position.y = 0.005;
scene.add(grid);

function makeBuilding(x, z, width, height, depth, color, signColor) {
  const building = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.35 })
  );
  building.position.set(x, height / 2, z);
  scene.add(building);
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.72, 0.12, 0.08),
    new THREE.MeshBasicMaterial({ color: signColor })
  );
  sign.position.set(x, Math.min(height - 1, height * 0.72), z + depth / 2 + 0.06);
  scene.add(sign);
  for (let y = 1.2; y < height - 0.7; y += 1.5) {
    for (let wx = -width / 2 + 0.65; wx < width / 2 - 0.3; wx += 1.15) {
      const windowMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.48, 0.72),
        new THREE.MeshBasicMaterial({ color: Math.random() > 0.35 ? 0x35b9c8 : 0x8a4fff })
      );
      windowMesh.position.set(x + wx, y, z + depth / 2 + 0.012);
      scene.add(windowMesh);
    }
  }
}

makeBuilding(-7, -8, 7, 13, 6, 0x18233a, 0x28e6dc);
makeBuilding(7, -10, 8, 17, 7, 0x211a39, 0xb24cff);
makeBuilding(-10, 5, 5, 10, 5, 0x172b3a, 0x28e6dc);
makeBuilding(10, 4, 6, 12, 5, 0x291b35, 0xff4fa3);
makeBuilding(0, -23, 13, 22, 7, 0x151c34, 0x28e6dc);

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
      activateVRMenuAtController(controller);
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
  ctx.fillText("B  /  CLOSE MENU", 770, 720);
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
  if (!renderer.xr.isPresenting || !vrMenu.visible) {
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
  const hit = vrMenuRaycaster.intersectObject(vrMenuPanel, false)[0];
  rightItem.rayLine.material.color.set(hit ? 0x5ff5e8 : 0x8793a8);
  if (hit) {
    vrCursor.position.copy(hit.point);
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
const maxPitch = Math.PI / 2 - 0.08;
function rotateView(dx, dy) {
  const sensitivity = 0.0022;
  player.rotation.y -= dx * sensitivity;
  pitch = THREE.MathUtils.clamp(pitch - dy * sensitivity, -maxPitch, maxPitch);
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
  if (movement.lengthSq() > 1) movement.normalize();
  player.position.addScaledVector(movement, (3.2 + character.strength * 0.18) * delta);
}

status.textContent = "City loaded. Press E to open the menu. Use WASD and mouse to move and look.";
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
renderer.setAnimationLoop(time => {
  const delta = Math.min(clock.getDelta(), 0.05);
  movePlayer(delta);
  updateVRMenuPointer();
  neonRing.rotation.z = time * 0.00025;
  marker.material.color.setHSL(0.48 + Math.sin(time * 0.002) * 0.04, 0.9, 0.58);
  renderer.render(scene, camera);
});
