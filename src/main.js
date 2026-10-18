import "./styles/main.css";
import { CONFIG } from "./config.js";
import { Store } from "./store/store.js";
import { createAmbulanceScene } from "./scene/ambulanceScene.js";
import { HotspotManager } from "./hotspots/hotspotManager.js";
import { Popup } from "./popup/popup.js";
import { h, toast, checklistProgress } from "./utils.js";

const $ = (id) => document.getElementById(id);

const state = {
  mode: "view", // "view" | "edit"
  repositionId: null, // hotspot currently being moved
};

async function boot() {
  const store = new Store(CONFIG.storageKey);
  const canvas = $("scene-canvas");

  const sceneApi = await createAmbulanceScene(canvas, {
    onProgress: (p) => {
      $("loader-fill").style.width = `${Math.round(p * 100)}%`;
      $("loader-text").textContent = p >= 1 ? "Ready" : `Loading scene… ${Math.round(p * 100)}%`;
    },
  });
  $("landing").classList.add("ready");

  const hotspots = new HotspotManager({
    sceneApi,
    layer: $("hotspot-layer"),
    store,
    onSelect: (id) => openHotspot(id),
  });

  const popup = new Popup({
    root: $("popup-root"),
    store,
    getMode: () => state.mode,
    onClose: () => hotspots.highlight(null),
    onReposition: (id) => startReposition(id),
  });

  // ---------------------------------------------------------------- landing / intro
  $("enter-btn").addEventListener("click", async () => {
    $("landing").classList.add("leaving");
    await sceneApi.playIntro();
    $("landing").remove();
    sceneApi.camera.attachControl(canvas, true);
    $("toolbar").classList.remove("hidden");
    hotspots.setVisible(true);
    if (!localStorage.getItem("ae:hinted")) {
      toast("Drag to look around · click a marker to open it");
      localStorage.setItem("ae:hinted", "1");
    }
  });

  // ---------------------------------------------------------------- open hotspot
  function openHotspot(id, opts) {
    const hs = store.get(id);
    if (!hs) return;
    hotspots.highlight(id);
    sceneApi.focusOn(hs.position);
    popup.open(id, opts);
    closeInventory();
  }

  // ---------------------------------------------------------------- click to place / move
  let down = null;
  canvas.addEventListener("pointerdown", (e) => (down = { x: e.clientX, y: e.clientY, t: performance.now() }));
  canvas.addEventListener("pointerup", (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const quick = performance.now() - down.t < 450;
    down = null;
    if (moved > 6 || !quick) return; // it was a drag (camera rotation), not a click
    if (state.mode !== "edit" || popup.isOpen) return;

    const rect = canvas.getBoundingClientRect();
    const pos = sceneApi.pick(e.clientX - rect.left, e.clientY - rect.top);
    if (!pos) return toast("No surface there – try clicking on a wall or object", "warn");

    if (state.repositionId) {
      const id = state.repositionId;
      store.mutate(id, (x) => (x.position = pos));
      endReposition();
      toast("Hotspot moved", "success");
      openHotspot(id);
    } else {
      const hs = store.add(pos);
      openHotspot(hs.id, { focusTitle: true });
    }
  });

  function startReposition(id) {
    state.repositionId = id;
    popup.close();
    $("edit-banner-text").textContent = `Click the new position for “${store.get(id)?.title}”`;
    $("edit-banner-cancel").classList.remove("hidden");
    $("edit-banner").classList.add("reposition");
  }
  function endReposition() {
    state.repositionId = null;
    $("edit-banner-text").textContent = "Edit mode – click anywhere in the ambulance to place a hotspot";
    $("edit-banner-cancel").classList.add("hidden");
    $("edit-banner").classList.remove("reposition");
  }
  $("edit-banner-cancel").addEventListener("click", endReposition);

  // ---------------------------------------------------------------- mode switch
  function setMode(mode) {
    state.mode = mode;
    endReposition();
    document.body.classList.toggle("edit-mode", mode === "edit");
    for (const [id, m] of [["mode-view", "view"], ["mode-edit", "edit"]]) {
      $(id).classList.toggle("active", m === mode);
      $(id).setAttribute("aria-pressed", String(m === mode));
    }
    $("edit-banner").classList.toggle("hidden", mode !== "edit");
    if (popup.isOpen) popup.open(popup.hotspotId); // re-render with new permissions
  }
  $("mode-view").addEventListener("click", () => setMode("view"));
  $("mode-edit").addEventListener("click", () => setMode("edit"));

  // ---------------------------------------------------------------- toolbar actions
  $("btn-reset").addEventListener("click", () => sceneApi.resetView());

  $("btn-export").addEventListener("click", () => {
    const blob = new Blob([store.exportJSON()], { type: "application/json" });
    const a = h("a", { href: URL.createObjectURL(blob), download: "hotspots.json" });
    a.click();
    URL.revokeObjectURL(a.href);
    toast("Exported hotspots.json", "success");
  });

  $("btn-import").addEventListener("click", () => $("import-input").click());
  $("import-input").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      popup.close();
      store.importJSON(await file.text());
      toast(`Imported ${store.hotspots.length} hotspots`, "success");
    } catch (err) {
      toast(`Import failed: ${err.message}`, "error", 4000);
    }
  });

  // ---------------------------------------------------------------- inventory list
  const inventory = $("inventory");
  const closeInventory = () => inventory.classList.remove("open");
  $("btn-inventory").addEventListener("click", () => inventory.classList.toggle("open"));
  $("inventory-close").addEventListener("click", closeInventory);

  function renderInventory() {
    const list = $("inventory-list");
    list.replaceChildren();
    if (!store.hotspots.length) {
      list.append(h("li", { class: "muted empty" }, "No hotspots yet. Switch to Edit mode and click in the scene."));
      return;
    }
    for (const hs of store.hotspots) {
      const { done, total, ratio } = checklistProgress(hs);
      list.append(
        h(
          "li",
          {},
          h(
            "button",
            { class: `inv-item ${total && ratio === 1 ? "complete" : ""}`, onclick: () => openHotspot(hs.id) },
            h("span", { class: "inv-title" }, hs.title || "Untitled"),
            h("span", { class: "inv-meta" }, total ? `${done}/${total}` : "–"),
            h("span", { class: "inv-bar" }, h("span", { style: { width: `${ratio * 100}%` } }))
          )
        )
      );
    }
  }
  store.subscribe(renderInventory);
  renderInventory();

  if (CONFIG.ambulanceModel && !sceneApi.usingScan) {
    const errText = sceneApi.scanError?.message || String(sceneApi.scanError || "Unknown error");
    toast(`Couldn't load ambulance model: ${errText}`, "error", 10000);
  }
}

boot().catch((err) => {
  console.error(err);
  $("loader-text").textContent = `Failed to start: ${err.message}`;
});
