import {
  Engine,
  Scene,
  ArcRotateCamera,
  Vector3,
  Color4,
  TransformNode,
} from "@babylonjs/core";
import "@babylonjs/loaders";
import { CONFIG } from "../config.js";
import { importModelOrSplat, computeRobustBounds } from "../scene/splatLoader.js";

/**
 * Standalone Babylon viewer for a tool Gaussian splat (.splat).
 * Lives inside the popup and is disposed when the popup closes.
 */
export class ToolViewer {
  constructor(canvas) {
    this.engine = new Engine(canvas, true, { antialias: true, alpha: true }, true);
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0, 0, 0, 0); // transparent – CSS gradient behind

    this.camera = new ArcRotateCamera("toolCam", -Math.PI / 2, 1.35, 0.6, Vector3.Zero(), this.scene);
    this.camera.attachControl(canvas, true);
    this.camera.wheelDeltaPercentage = 0.02;
    this.camera.panningSensibility = 0;
    this.camera.useAutoRotationBehavior = true;
    this.camera.autoRotationBehavior.idleRotationSpeed = 0.35;
    this.camera.autoRotationBehavior.idleRotationWaitTime = 2500;

    this.root = new TransformNode("toolRoot", this.scene);
    this.loadToken = 0;
    this.flip = false;

    this.engine.runRenderLoop(() => this.scene.render());
    this.resizeObserver = new ResizeObserver(() => this.engine.resize());
    this.resizeObserver.observe(canvas);
  }

  _clear() {
    for (const child of this.root.getChildren(undefined, false)) child.dispose(false, true);
  }

  _applyTransform() {
    const { position = [0, 0, 0], rotationDeg = [0, 0, 0], scale = 1 } = CONFIG.corpulsTransform || {};
    this.root.position = Vector3.FromArray(position);
    const rx = (rotationDeg[0] * Math.PI) / 180 + (this.flip ? Math.PI : 0);
    const ry = (rotationDeg[1] * Math.PI) / 180;
    const rz = (rotationDeg[2] * Math.PI) / 180;
    this.root.rotation.set(rx, ry, rz);
    this.root.scaling = new Vector3(scale, scale, scale);
  }

  /** Load a splat URL. Resolves to { ok, error? }. */
  async load(url, { flip = false } = {}) {
    const token = ++this.loadToken;
    this.flip = flip;
    this._clear();
    this._applyTransform();

    const targetUrl = url || CONFIG.tools[0]?.url;
    try {
      const res = await importModelOrSplat(targetUrl, this.scene);
      if (token !== this.loadToken) {
        res.meshes.forEach((m) => m.dispose());
        return { ok: false, stale: true };
      }
      for (const m of res.meshes) if (!m.parent) m.parent = this.root;
      this._frame();
      return { ok: true };
    } catch (error) {
      console.error("Tool splat failed to load:", error);
      return { ok: false, error };
    }
  }

  setFlip(flip) {
    this.flip = flip;
    this._applyTransform();
    this._frame();
  }

  /** Fit camera to the loaded content (ignoring distant stray splats). */
  _frame() {
    const { min, max } = computeRobustBounds(this.root);
    if (!isFinite(min.x) || !isFinite(max.x)) return;
    const center = Vector3.Center(min, max);
    const size = max.subtract(min).length() || 0.5;
    const radius = (size / 2 / Math.tan(this.camera.fov / 2)) * 0.95;
    this.camera.target.copyFrom(center);
    this.camera.alpha = -Math.PI / 2;
    this.camera.beta = 1.35;
    this.camera.radius = radius;
    this.camera.lowerRadiusLimit = radius * 0.25;
    this.camera.upperRadiusLimit = radius * 3.5;
    this.camera.minZ = radius * 0.005;
    this.camera.maxZ = radius * 20;
  }

  dispose() {
    this.loadToken++;
    this.resizeObserver.disconnect();
    this.engine.stopRenderLoop();
    this.scene.dispose();
    this.engine.dispose();
  }
}
