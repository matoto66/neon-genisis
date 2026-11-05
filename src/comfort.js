// NEON GENESIS — comfort options (saved on this device; once changed they stay changed).
//
//  • Turning: smooth or snap (30°)
//  • Comfort vignette: darkens the edges of your view while you move/turn
//  • Seated mode: lifts your view to standing height while you sit
//  • Height reset: makes your current headset height count as standing eye height
import * as THREE from "three";

const KEY = "neon-genesis-comfort-v1";
export const comfort = { turn: "smooth", vignette: true, seated: false, heightOffset: 0 };
try { Object.assign(comfort, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch {}
export function saveComfort() { try { localStorage.setItem(KEY, JSON.stringify(comfort)); } catch {} }

const EYE_HEIGHT = 1.65;
let baseSpace = null;

export function createComfort({ renderer, camera }) {
  // ── vignette: a ring stuck to the face, transparent in the middle ──────
  const mat = new THREE.ShaderMaterial({
    uniforms: { uStrength: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform float uStrength;
      void main(){ float d = length(vUv - 0.5) * 2.0; float a = smoothstep(0.42, 0.78, d) * uStrength; gl_FragColor = vec4(0.0, 0.0, 0.0, a); }`,
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false
  });
  const vignette = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), mat);
  vignette.position.z = -0.12; vignette.renderOrder = 9999; vignette.frustumCulled = false; vignette.name = "COMFORT_VIGNETTE";
  camera.add(vignette);
  let strength = 0;

  // ── seated / height: offset the XR reference space ─────────────────────
  function applyHeight() {
    if (!renderer.xr.isPresenting) return;
    if (!baseSpace) baseSpace = renderer.xr.getReferenceSpace();
    if (!baseSpace || typeof XRRigidTransform === "undefined") return;
    const off = comfort.heightOffset || 0;
    renderer.xr.setReferenceSpace(off ? baseSpace.getOffsetReferenceSpace(new XRRigidTransform({ x: 0, y: -off, z: 0 })) : baseSpace);
  }
  let lastHeadY = null;
  function measure(frame) {
    try {
      const pose = frame && baseSpace ? frame.getViewerPose(baseSpace) : null;
      if (pose) lastHeadY = pose.transform.position.y;
    } catch {}
  }
  function resetHeight() {
    if (lastHeadY == null) return false;
    comfort.heightOffset = THREE.MathUtils.clamp(EYE_HEIGHT - lastHeadY, -0.4, 1.2);
    saveComfort(); applyHeight(); return true;
  }
  function setSeated(on) {
    comfort.seated = !!on;
    if (comfort.seated) { if (!resetHeight()) comfort.heightOffset = 0.5; }
    else comfort.heightOffset = 0;
    saveComfort(); applyHeight();
  }
  function setTurn(mode) { comfort.turn = mode === "snap" ? "snap" : "smooth"; saveComfort(); }
  function setVignette(on) { comfort.vignette = !!on; saveComfort(); }

  renderer.xr.addEventListener("sessionstart", () => { baseSpace = null; setTimeout(applyHeight, 0); });
  renderer.xr.addEventListener("sessionend", () => { baseSpace = null; });

  // ── snap turning helper ────────────────────────────────────────────────
  let snapReady = true;
  function turnAmount(stickX, smoothSpeed, dt) {
    if (comfort.turn === "snap") {
      if (Math.abs(stickX) < 0.35) { snapReady = true; return 0; }
      if (snapReady && Math.abs(stickX) > 0.7) { snapReady = false; strength = Math.max(strength, comfort.vignette ? 0.9 : 0); return -Math.sign(stickX) * Math.PI / 6; }
      return 0;
    }
    return -stickX * smoothSpeed * dt;
  }

  function update(dt, frame, moveAmount, turnRate) {
    if (renderer.xr.isPresenting) { if (!baseSpace) applyHeight(); measure(frame); }
    const want = comfort.vignette && renderer.xr.isPresenting ? Math.min(1, moveAmount * 0.75 + Math.abs(turnRate) * 0.35) : 0;
    strength = THREE.MathUtils.damp(strength, want, want > strength ? 10 : 4, dt);
    mat.uniforms.uStrength.value = strength;
    vignette.visible = strength > 0.01;
  }
  return { update, turnAmount, setTurn, setVignette, setSeated, resetHeight, applyHeight };
}
