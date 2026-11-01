import * as THREE from "three";
import { VRButton } from "three/addons/webxr/VRButton.js";

const status = document.querySelector("#status");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x080b18);
scene.fog = new THREE.Fog(0x080b18, 18, 90);

const player = new THREE.Group();
scene.add(player);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 150);
camera.position.set(0, 1.65, 0);
player.add(camera);
player.position.set(0, 0, 7);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const vrButton = VRButton.createButton(renderer);
vrButton.textContent = "ENTER VR";
document.body.appendChild(vrButton);

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

// Desktop controls: WASD or arrow keys. VR: use the left controller thumbstick.
const keys = {};
window.addEventListener("keydown", (event) => {
  keys[event.code] = true;
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
    event.preventDefault();
  }
});
window.addEventListener("keyup", (event) => {
  keys[event.code] = false;
});

const clock = new THREE.Clock();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const movement = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);
const cameraDirection = new THREE.Vector3();
const playerSpeed = 3.2;

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

function movePlayer(delta) {
  let stickX = 0;
  let stickY = 0;

  if (renderer.xr.isPresenting) {
    const stick = getLeftStick();
    stickX = Math.abs(stick.x) > 0.12 ? stick.x : 0;
    stickY = Math.abs(stick.y) > 0.12 ? stick.y : 0;
  } else {
    stickX = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    stickY = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
    const turn = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0);
    if (keys.ArrowRight || keys.ArrowLeft) player.rotation.y -= turn * delta * 1.8;
  }

  camera.getWorldDirection(cameraDirection);
  forward.set(cameraDirection.x, 0, cameraDirection.z).normalize();
  right.crossVectors(forward, up).normalize();

  movement.set(0, 0, 0);
  movement.addScaledVector(forward, -stickY);
  movement.addScaledVector(right, stickX);

  if (movement.lengthSq() > 1) movement.normalize();
  player.position.addScaledVector(movement, playerSpeed * delta);
}

status.textContent = "City loaded. WASD to move, or enter VR and use the left thumbstick.";

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop((time) => {
  const delta = Math.min(clock.getDelta(), 0.05);
  movePlayer(delta);
  neonRing.rotation.z = time * 0.00025;
  marker.material.color.setHSL(0.48 + Math.sin(time * 0.002) * 0.04, 0.9, 0.58);
  renderer.render(scene, camera);
});
