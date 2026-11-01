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
  if (!session) return { x: 0, y: 0, menu: false };
  for (const source of session.inputSources) {
    if (source.handedness !== "right" || !source.gamepad) continue;
    const pad = source.gamepad;
    const axes = pad.axes;
    // xr-standard usually places the right thumbstick in axes 2/3.
    const x = axes.length >= 4 ? axes[2] : axes[0];
    const y = axes.length >= 4 ? axes[3] : axes[1];
    // Controller layouts vary between browser versions. Check the standard B
    // position first, with the alternate final face-button slot as a fallback.
    const menu = !!(pad.buttons[5]?.pressed || pad.buttons[4]?.pressed);
    return {
      x: Math.abs(x || 0) > 0.15 ? x : 0,
      y: Math.abs(y || 0) > 0.15 ? y : 0,
      menu
    };
  }
  return { x: 0, y: 0, menu: false };
}

function movePlayer(delta) {
  let stickX = 0;
  let stickY = 0;
  if (renderer.xr.isPresenting) {
    const stick = getLeftStick();
    const look = getRightStickAndMenuButton();
    stickX = Math.abs(stick.x) > 0.12 ? stick.x : 0;
    stickY = Math.abs(stick.y) > 0.12 ? stick.y : 0;
    if (look.menu && !previousMenuButton) toggleGameMenu();
    previousMenuButton = look.menu;
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
  neonRing.rotation.z = time * 0.00025;
  marker.material.color.setHSL(0.48 + Math.sin(time * 0.002) * 0.04, 0.9, 0.58);
  renderer.render(scene, camera);
});
