import { Vector3, Matrix, Ray } from "@babylonjs/core";
import { h, checklistProgress } from "../utils.js";

/**
 * Renders hotspots as HTML markers over the canvas and keeps them glued to their
 * 3D positions every frame (Vector3.Project). Markers behind geometry are dimmed.
 */
export class HotspotManager {
  constructor({ sceneApi, layer, store, onSelect }) {
    this.api = sceneApi;
    this.layer = layer;
    this.store = store;
    this.onSelect = onSelect;
    this.markers = new Map(); // id -> { el, pos: Vector3, occluded }
    this.frame = 0;
    this.visible = false;

    store.subscribe(() => this.sync());
    this.sync();
    sceneApi.scene.onAfterRenderObservable.add(() => this.update());
  }

  setVisible(v) {
    this.visible = v;
    this.layer.classList.toggle("visible", v);
  }

  /** Create / update / remove marker elements to match the store. */
  sync() {
    const seen = new Set();
    for (const hs of this.store.hotspots) {
      seen.add(hs.id);
      let m = this.markers.get(hs.id);
      if (!m) {
        const el = h(
          "button",
          { class: "hotspot", "aria-label": hs.title, onclick: (e) => (e.stopPropagation(), this.onSelect(hs.id)) },
          h("span", { class: "hotspot-ring" }),
          h("span", { class: "hotspot-dot" }),
          h("span", { class: "hotspot-label" }, h("strong"), h("small"))
        );
        this.layer.append(el);
        m = { el, pos: new Vector3() };
        this.markers.set(hs.id, m);
      }
      m.pos.fromArray(hs.position);
      const { done, total, ratio } = checklistProgress(hs);
      m.el.querySelector("strong").textContent = hs.title || "Untitled";
      m.el.querySelector("small").textContent = total ? `${done}/${total} checked` : "No checklist items";
      m.el.setAttribute("aria-label", hs.title);
      m.el.classList.toggle("complete", total > 0 && ratio === 1);
      m.el.style.setProperty("--progress", ratio);
    }
    for (const [id, m] of this.markers) {
      if (!seen.has(id)) {
        m.el.remove();
        this.markers.delete(id);
      }
    }
  }

  highlight(id) {
    for (const [mid, m] of this.markers) m.el.classList.toggle("active", mid === id);
  }

  update() {
    if (!this.visible) return;
    const { scene, camera, engine } = this.api;
    const canvas = engine.getRenderingCanvas();
    const w = canvas.clientWidth;
    const hgt = canvas.clientHeight;
    const viewport = camera.viewport.toGlobal(w, hgt);
    const transform = scene.getTransformMatrix();
    const camPos = camera.globalPosition;
    const checkOcclusion = this.frame++ % 6 === 0;

    for (const m of this.markers.values()) {
      const p = Vector3.Project(m.pos, Matrix.IdentityReadOnly, transform, viewport);
      const inFront = p.z > 0 && p.z < 1;
      if (!inFront) {
        m.el.style.display = "none";
        continue;
      }
      m.el.style.display = "";
      const dist = Vector3.Distance(camPos, m.pos);
      const scale = Math.min(1.25, Math.max(0.6, 1.1 / dist));
      m.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) scale(${scale.toFixed(3)})`;
      m.el.style.zIndex = String(1000 - Math.round(dist * 100));

      if (checkOcclusion) {
        const dir = m.pos.subtract(camPos).normalize();
        const hit = scene.pickWithRay(new Ray(camPos, dir, dist), (mesh) => mesh.isPickable && mesh.isEnabled() && mesh.visibility > 0);
        m.occluded = !!(hit?.hit && hit.distance < dist - 0.05);
        m.el.classList.toggle("occluded", m.occluded);
      }
    }
  }
}
