import {
  Engine,
  Scene,
  ArcRotateCamera,
  Vector3,
  Matrix,
  Color4,
  MeshBuilder,
  Mesh,
} from "@babylonjs/core";
import "@babylonjs/loaders"; // registers .splat / .ply / .spz / .sog (Gaussian splats)
import { CONFIG } from "../config.js";
import { tween } from "../utils.js";
import { importModelOrSplat, computeRobustBounds } from "./splatLoader.js";

const DEFAULT_HOME = { alpha: Math.PI / 2, beta: 1.42, radius: 1.45, target: new Vector3(0, 0, -0.2) };
const OUTSIDE_RADIUS = 4.5;

/**
 * Creates the main ambulance Gaussian splat scene.
 * Returns helpers used by the rest of the app (pick, focusOn, playIntro, resetView…).
 */
export async function createAmbulanceScene(canvas, { onProgress } = {}) {
  const engine = new Engine(canvas, true, { stencil: true, antialias: true }, true);
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.02, 0.03, 0.06, 1);

  const home = {
    alpha: DEFAULT_HOME.alpha,
    beta: DEFAULT_HOME.beta,
    radius: DEFAULT_HOME.radius,
    target: DEFAULT_HOME.target.clone(),
  };

  // --- Camera: orbit camera inside the ambulance splat ------------------------------
  const camera = new ArcRotateCamera("cam", home.alpha, home.beta, OUTSIDE_RADIUS, home.target.clone(), scene);
  camera.minZ = 0.02;
  camera.fov = 1.0;
  camera.lowerRadiusLimit = 0.15;
  camera.upperRadiusLimit = 10;
  camera.lowerBetaLimit = 0.2;
  camera.upperBetaLimit = 2.9;
  camera.wheelDeltaPercentage = 0.02;
  camera.pinchDeltaPercentage = 0.002;
  camera.angularSensibilityX = 2500;
  camera.angularSensibilityY = 2500;
  camera.panningSensibility = 1500;
  camera.inertia = 0.85;

  // --- Load the ambulance .splat scan -----------------------------------------------
  let usingScan = false;
  let splatMeshes = [];
  let scanError = null;
  try {
    const { root, meshes } = await loadScan(scene, CONFIG.ambulanceModel, onProgress);
    splatMeshes = meshes;
    const { min, max } = computeRobustBounds(root);
    if (isFinite(min.x) && isFinite(max.x)) {
      home.target.copyFrom(Vector3.Center(min, max));
      camera.target.copyFrom(home.target);
    }
    buildPickingProxy(scene, home.target);
    usingScan = true;
  } catch (err) {
    scanError = err;
    console.error("Failed to load ambulance splat:", err);
  }
  onProgress?.(1);

  engine.runRenderLoop(() => scene.render());
  window.addEventListener("resize", () => engine.resize());

  // --- Landing idle motion (gentle sway before the user enters) ---------------------
  let idleObs = scene.onBeforeRenderObservable.add(() => {
    const t = performance.now() / 1000;
    camera.alpha = home.alpha + Math.sin(t * 0.25) * 0.22;
    camera.beta = 1.38 + Math.sin(t * 0.18) * 0.05;
  });

  let activeTween = null;
  const runTween = (ms, fn) => {
    activeTween?.cancel();
    camera.inertialAlphaOffset = camera.inertialBetaOffset = camera.inertialRadiusOffset = 0;
    activeTween = tween(scene, ms, fn);
    return activeTween.promise;
  };

  /** Animate camera to a full state (target/alpha/beta/radius). */
  function animateTo({ target, alpha, beta, radius }, ms = 1100) {
    const from = {
      target: camera.target.clone(),
      alpha: camera.alpha,
      beta: camera.beta,
      radius: camera.radius,
    };
    while (alpha - from.alpha > Math.PI) alpha -= Math.PI * 2;
    while (from.alpha - alpha > Math.PI) alpha += Math.PI * 2;
    return runTween(ms, (t) => {
      camera.target.copyFrom(Vector3.Lerp(from.target, target, t));
      camera.alpha = from.alpha + (alpha - from.alpha) * t;
      camera.beta = from.beta + (beta - from.beta) * t;
      camera.radius = from.radius + (radius - from.radius) * t;
    });
  }

  /** Cinematic "fly into the ambulance" intro. */
  async function playIntro() {
    if (idleObs) {
      scene.onBeforeRenderObservable.remove(idleObs);
      idleObs = null;
    }
    scene.clearColor = new Color4(1, 1, 1, 1);
    await animateTo({ ...home, target: home.target.clone() }, 2000);
  }

  function resetView() {
    return animateTo({ ...home, target: home.target.clone() }, 1000);
  }

  /** Orbit around a hotspot, keeping the camera on the same side it currently is. */
  function focusOn(posArr) {
    const p = Vector3.FromArray(posArr);
    const dir = camera.position.subtract(p);
    let dist = dir.length();
    dir.normalize();
    dist = Math.min(Math.max(dist, 0.55), 1.2);
    const alpha = Math.atan2(dir.z, dir.x);
    const beta = Math.acos(Math.min(Math.max(dir.y, -1), 1));
    return animateTo({ target: p, alpha, beta: Math.min(Math.max(beta, 0.4), 2.6), radius: dist }, 900);
  }

  /** Pick a 3D point under screen coords (CSS px relative to the canvas). */
  function pick(x, y) {
    const splatHit = pickSplatPoint(scene, camera, splatMeshes, x, y);
    if (splatHit) return splatHit;

    const res = scene.pick(x, y, (m) => m.isPickable && m.isEnabled() && m.metadata?.pickable !== false);
    if (!res?.hit) return null;
    const n = res.getNormal(true, true) ?? Vector3.Zero();
    if (Vector3.Dot(n, camera.position.subtract(res.pickedPoint)) < 0) n.scaleInPlace(-1);
    const p = res.pickedPoint.add(n.scale(0.015));
    return [round(p.x), round(p.y), round(p.z)];
  }

  return { engine, scene, camera, usingScan, scanError, playIntro, resetView, focusOn, pick };
}

const round = (v) => Math.round(v * 1000) / 1000;

async function loadScan(scene, url, onProgress) {
  const result = await importModelOrSplat(url, scene, { onProgress });
  const root = new Mesh("ambulanceRoot", scene);
  const { position, rotationDeg, scale } = CONFIG.ambulanceTransform;
  root.position = Vector3.FromArray(position);
  root.rotation = new Vector3(...rotationDeg.map((d) => (d * Math.PI) / 180));
  root.scaling = new Vector3(scale, scale, scale);
  for (const m of result.meshes) {
    if (!m.parent) m.parent = root;
    m.isPickable = false;
  }
  root.computeWorldMatrix(true);
  return { root, meshes: result.meshes };
}

/** Ray-picks against Gaussian splat positions within a narrow cone around the cursor ray. */
function pickSplatPoint(scene, camera, meshes, x, y) {
  if (!meshes?.length) return null;
  const ray = scene.createPickingRay(x, y, Matrix.Identity(), camera);
  const hits = [];

  for (const m of meshes) {
    const pos = m._splatPositions;
    const count = m._vertexCount || (pos ? pos.length >> 2 : 0);
    if (!pos || !count) continue;

    m.computeWorldMatrix(true);
    const wm = m.getWorldMatrix();
    const inv = Matrix.Invert(wm);
    const localOrigin = Vector3.TransformCoordinates(ray.origin, inv);
    const localDir = Vector3.TransformNormal(ray.direction, inv).normalize();
    const ox = localOrigin.x, oy = localOrigin.y, oz = localOrigin.z;
    const dx = localDir.x, dy = localDir.y, dz = localDir.z;

    for (let i = 0; i < count; i++) {
      const px = pos[i * 4] - ox;
      const py = pos[i * 4 + 1] - oy;
      const pz = pos[i * 4 + 2] - oz;
      const t = px * dx + py * dy + pz * dz;
      if (t < 0.1 || t > 10.0) continue;
      const d2 = px * px + py * py + pz * pz - t * t;
      const maxR = 0.045 * t;
      if (d2 < maxR * maxR) {
        hits.push({ t, idx: i, m });
      }
    }
  }

  if (!hits.length) return null;
  hits.sort((a, b) => a.t - b.t);
  const chosen = hits[Math.floor(hits.length * 0.1)];
  const pos = chosen.m._splatPositions;
  const i = chosen.idx * 4;
  const worldPt = Vector3.TransformCoordinatesFromFloats(pos[i], pos[i + 1], pos[i + 2], chosen.m.getWorldMatrix());
  const toCam = camera.position.subtract(worldPt).normalize();
  const p = worldPt.add(toCam.scale(0.02));
  return [round(p.x), round(p.y), round(p.z)];
}

/** Invisible fallback box matching the interior; clicks are ray-cast against its inner faces. */
function buildPickingProxy(scene, center) {
  const { width, height, length } = CONFIG.interior;
  const box = MeshBuilder.CreateBox(
    "pickProxy",
    { width, height, depth: length, sideOrientation: Mesh.BACKSIDE },
    scene
  );
  box.position.copyFrom(center);
  box.visibility = 0;
  box.isPickable = true;
}
