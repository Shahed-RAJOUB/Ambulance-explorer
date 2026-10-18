import { uid } from "../utils.js";

const DEFAULT_TOOL_SPLAT = "/assets/ambulance/edited_corpulus_splat.splat";

/**
 * Hotspot data model:
 * {
 *   id, position: [x,y,z], title, description,
 *   toolModel: "/assets/ambulance/edited_corpulus_splat.splat", toolFlip: false,
 *   checklists: [{ id, name, items: [{ id, text, checked }] }],
 *   updatedAt
 * }
 */

const seed = () => [
  {
    id: "hs_corpuls",
    position: [1.1, -25.5, 1],
    title: "Patient monitor (Corpuls)",
    description: "Multi-parameter monitor / defibrillator (ECG, SpO₂, NIBP). Check before every shift.",
    toolModel: DEFAULT_TOOL_SPLAT,
    toolFlip: true,
    checklists: [
      {
        id: uid("cl"),
        name: "Shift check",
        items: [
          { id: uid("it"), text: "Battery charged (> 80%)", checked: true },
          { id: uid("it"), text: "ECG cables complete", checked: false },
          { id: uid("it"), text: "SpO₂ sensor tested", checked: false },
        ],
      },
    ],
    updatedAt: Date.now(),
  },
];

function getSeedSignature(items) {
  return JSON.stringify(
    items.map((h) => ({
      position: h.position,
      title: h.title,
      description: h.description,
      toolModel: h.toolModel,
      toolFlip: h.toolFlip,
    }))
  );
}

export class Store {
  constructor(storageKey) {
    this.key = storageKey;
    this.listeners = new Set();
    const seeded = seed();
    this.seedSignature = getSeedSignature(seeded);
    this.hotspots = this._load(seeded) ?? seeded;
    this._save();
  }

  _load(seeded) {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!Array.isArray(data.hotspots) || !data.hotspots.length) return null;

      // If seed() in store.js was changed in code, re-apply seed() automatically
      if (data.seedSignature !== this.seedSignature) {
        return seeded;
      }

      for (const hs of data.hotspots) {
        if (!hs.toolModel || hs.toolModel.endsWith(".ply") || hs.toolModel.endsWith(".html")) {
          hs.toolModel = DEFAULT_TOOL_SPLAT;
        }
      }
      return data.hotspots;
    } catch {
      return null;
    }
  }

  _save() {
    localStorage.setItem(
      this.key,
      JSON.stringify({
        version: 1,
        seedSignature: this.seedSignature,
        hotspots: this.hotspots,
      })
    );
  }

  _emit(reason) {
    this._save();
    for (const fn of this.listeners) fn(this.hotspots, reason);
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  get(id) {
    return this.hotspots.find((h) => h.id === id);
  }

  add(position) {
    const hs = {
      id: uid("hs"),
      position,
      title: "Patient monitor (Corpuls)",
      description: "",
      toolModel: DEFAULT_TOOL_SPLAT,
      toolFlip: false,
      checklists: [{ id: uid("cl"), name: "Checklist", items: [] }],
      updatedAt: Date.now(),
    };
    this.hotspots.push(hs);
    this._emit("add");
    return hs;
  }

  /** Mutate a hotspot in place via callback, then persist + notify. */
  mutate(id, fn, reason = "update") {
    const hs = this.get(id);
    if (!hs) return;
    fn(hs);
    hs.updatedAt = Date.now();
    this._emit(reason);
  }

  remove(id) {
    this.hotspots = this.hotspots.filter((h) => h.id !== id);
    this._emit("remove");
  }

  exportJSON() {
    return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), hotspots: this.hotspots }, null, 2);
  }

  importJSON(text) {
    const data = JSON.parse(text);
    const list = Array.isArray(data) ? data : data.hotspots;
    if (!Array.isArray(list)) throw new Error("No 'hotspots' array found");
    for (const hs of list) {
      if (!Array.isArray(hs.position) || hs.position.length !== 3) throw new Error("Invalid hotspot position");
      hs.id ??= uid("hs");
      hs.toolModel ||= DEFAULT_TOOL_SPLAT;
      hs.checklists ??= [];
    }
    this.hotspots = list;
    this._emit("import");
  }
}
