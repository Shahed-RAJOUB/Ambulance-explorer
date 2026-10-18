/** Small shared helpers (DOM creation, ids, tweening, toasts). */

export const uid = (p = "id") => `${p}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`;

/**
 * Tiny hyperscript helper. Text is always set via textContent (no XSS from user data).
 *   h("button", { class: "btn", onclick: fn }, "Label", childEl)
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "value") el.value = v;
    else if (k === "innerHTML") el.innerHTML = v; // static markup only, never user data
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k in el && typeof v !== "string") el[k] = v;
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Frame-based tween on a Babylon scene. Returns { promise, cancel }. */
export function tween(scene, durationMs, onUpdate, ease = easeInOutCubic) {
  let obs;
  let cancelled = false;
  const promise = new Promise((resolve) => {
    const start = performance.now();
    obs = scene.onBeforeRenderObservable.add(() => {
      if (cancelled) return;
      const t = Math.min(1, (performance.now() - start) / durationMs);
      onUpdate(ease(t));
      if (t >= 1) {
        scene.onBeforeRenderObservable.remove(obs);
        resolve();
      }
    });
  });
  return {
    promise,
    cancel() {
      cancelled = true;
      scene.onBeforeRenderObservable.remove(obs);
    },
  };
}

export function toast(message, type = "info", ms = 2800) {
  const root = document.getElementById("toasts");
  const el = h("div", { class: `toast toast-${type}` }, message);
  root.append(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 300);
  }, ms);
}

export function checklistProgress(hotspot) {
  let done = 0;
  let total = 0;
  for (const list of hotspot.checklists || []) {
    for (const item of list.items) {
      total++;
      if (item.checked) done++;
    }
  }
  return { done, total, ratio: total ? done / total : 0 };
}
