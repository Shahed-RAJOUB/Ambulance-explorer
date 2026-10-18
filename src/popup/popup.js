import { h, uid, checklistProgress, toast } from "../utils.js";
import { CONFIG } from "../config.js";
import { ToolViewer } from "./toolViewer.js";

const CHECK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7"/></svg>';

/**
 * Hotspot popup: 3D tool preview + details + checklists.
 * - View mode: read details, tick checkboxes.
 * - Edit mode: edit title/description/tool model, add/rename/delete lists & items.
 */
export class Popup {
  constructor({ root, store, getMode, onClose, onReposition }) {
    this.root = root;
    this.store = store;
    this.getMode = getMode;
    this.onClose = onClose;
    this.onReposition = onReposition;
    this.viewer = null;
    this.hotspotId = null;
    this._onKey = (e) => e.key === "Escape" && this.close();
  }

  get hs() {
    return this.store.get(this.hotspotId);
  }

  get isOpen() {
    return !!this.hotspotId;
  }

  open(id, { focusTitle = false } = {}) {
    if (this.hotspotId) {
      const old = this.backdrop;
      this._teardown();
      old?.remove();
    }
    this.hotspotId = id;
    const hs = this.hs;
    if (!hs) return;
    const editing = this.getMode() === "edit";

    // ---------- Header ----------
    this.titleInput = h("input", {
      class: "title-input",
      value: hs.title,
      readOnly: !editing,
      "aria-label": "Hotspot title",
      oninput: (e) => this._mutate((x) => (x.title = e.target.value), "text"),
    });

    // ---------- Left: 3D viewer ----------
    const canvas = h("canvas", { class: "tool-canvas", "aria-label": "3D model of the tool" });
    this.viewerStatus = h("div", { class: "viewer-status" }, h("span", { class: "spinner" }), "Loading splat…");
    const viewerPane = h(
      "section",
      { class: "viewer-pane" },
      canvas,
      this.viewerStatus,
      h("div", { class: "viewer-hint" }, "Drag to rotate · Scroll to zoom"),
      editing ? this._buildModelControls(hs) : null
    );

    // ---------- Right: details ----------
    this.progressEl = h("div", { class: "progress" }, h("div", { class: "progress-fill" }));
    this.progressText = h("span", { class: "progress-text" });
    this.listsEl = h("div", { class: "checklists" });

    const details = h(
      "section",
      { class: "details-pane" },
      h("label", { class: "field-label", for: "hs-desc" }, "Details"),
      h("textarea", {
        id: "hs-desc",
        class: "desc-input",
        rows: 4,
        readOnly: !editing,
        placeholder: editing ? "Add a description, usage notes, location…" : "No details yet.",
        value: hs.description,
        oninput: (e) => this._mutate((x) => (x.description = e.target.value), "text"),
      }),
      h("div", { class: "progress-row" }, h("span", { class: "field-label" }, "Checklists"), this.progressText),
      this.progressEl,
      this.listsEl,
      editing
        ? h(
            "button",
            { class: "btn btn-ghost add-list", onclick: () => this._addList() },
            "+ Add checklist"
          )
        : null
    );

    // ---------- Footer ----------
    const footer = h(
      "footer",
      { class: "modal-footer" },
      h("span", { class: "muted", id: "hs-updated" }, this._updatedText()),
      h(
        "div",
        { class: "footer-actions" },
        editing
          ? [
              h("button", { class: "btn btn-ghost", onclick: () => this.onReposition(this.hotspotId) }, "Move hotspot"),
              h("button", { class: "btn btn-danger", onclick: () => this._delete() }, "Delete"),
            ]
          : null,
        h("button", { class: "btn btn-primary", onclick: () => this.close() }, "Done")
      )
    );

    this.modal = h(
      "div",
      { class: "modal glass", role: "dialog", "aria-modal": "true", "aria-label": hs.title },
      h(
        "header",
        { class: "modal-header" },
        h("span", { class: `badge ${editing ? "badge-edit" : ""}` }, editing ? "Editing" : "Equipment"),
        this.titleInput,
        h("button", { class: "icon-btn", title: "Close", onclick: () => this.close() }, "✕")
      ),
      h("div", { class: "modal-body" }, viewerPane, details),
      footer
    );
    this.backdrop = h("div", { class: "modal-backdrop", onclick: (e) => e.target === this.backdrop && this.close() }, this.modal);
    this.root.append(this.backdrop);
    requestAnimationFrame(() => this.backdrop.classList.add("show"));
    document.addEventListener("keydown", this._onKey);

    this._renderLists();
    this._updateProgress();

    // 3D viewer (created after the canvas is in the DOM so it has a size)
    requestAnimationFrame(() => {
      if (this.hotspotId !== id) return;
      this.viewer = new ToolViewer(canvas);
      this._loadModel();
    });

    if (focusTitle && editing) setTimeout(() => (this.titleInput.focus(), this.titleInput.select()), 250);
  }

  close() {
    if (!this.hotspotId) return;
    const bd = this.backdrop;
    this._teardown();
    bd.classList.remove("show");
    setTimeout(() => bd.remove(), 250);
    this.onClose?.();
  }

  _teardown() {
    document.removeEventListener("keydown", this._onKey);
    this.viewer?.dispose();
    this.viewer = null;
    this.hotspotId = null;
  }

  // ------------------------------------------------------------------ model
  _buildModelControls(hs) {
    const known = CONFIG.tools.some((t) => t.url === hs.toolModel);
    const select = h(
      "select",
      {
        class: "select",
        "aria-label": "Tool model",
        onchange: (e) => {
          const v = e.target.value;
          if (v === "__custom") {
            urlInput.hidden = false;
            urlInput.focus();
            return;
          }
          urlInput.hidden = true;
          this._mutate((x) => (x.toolModel = v));
          this._loadModel();
        },
      },
      CONFIG.tools.map((t) => h("option", { value: t.url, selected: t.url === hs.toolModel }, t.label)),
      h("option", { value: "__custom", selected: !known }, "Custom URL…")
    );
    const urlInput = h("input", {
      class: "text-input",
      placeholder: "/assets/ambulance/edited_corpulus_splat.splat",
      value: known ? "" : hs.toolModel,
      hidden: known,
      onchange: (e) => {
        this._mutate((x) => (x.toolModel = e.target.value.trim()));
        this._loadModel();
      },
    });
    const flip = h(
      "button",
      {
        class: "btn btn-ghost btn-sm",
        title: "Flip upside-down (common for raw Gaussian splats)",
        onclick: () => {
          this._mutate((x) => (x.toolFlip = !x.toolFlip));
          this.viewer?.setFlip(this.hs.toolFlip);
        },
      },
      "⇅ Flip"
    );
    return h("div", { class: "model-controls" }, select, urlInput, flip);
  }

  async _loadModel() {
    const hs = this.hs;
    if (!hs || !this.viewer) return;
    this.viewerStatus.classList.remove("hidden", "error");
    this.viewerStatus.replaceChildren(h("span", { class: "spinner" }), "Loading splat…");
    const res = await this.viewer?.load(hs.toolModel, { flip: hs.toolFlip });
    if (!res || res.stale || !this.viewerStatus) return;
    if (res.ok) {
      this.viewerStatus.classList.add("hidden");
    } else {
      this.viewerStatus.classList.add("error");
      this.viewerStatus.replaceChildren("Couldn't load splat model");
    }
  }

  // ------------------------------------------------------------------ checklists
  _renderLists(focusItemId) {
    const hs = this.hs;
    const editing = this.getMode() === "edit";
    this.listsEl.replaceChildren();

    if (!hs.checklists.length) {
      this.listsEl.append(h("p", { class: "muted empty" }, editing ? "No checklists yet." : "No checklists for this item."));
    }

    for (const list of hs.checklists) {
      const count = h("span", { class: "list-count" });
      const updateCount = () => {
        const d = list.items.filter((i) => i.checked).length;
        count.textContent = `${d}/${list.items.length}`;
      };
      updateCount();

      const ul = h("ul", { class: "items" });
      for (const item of list.items) {
        const textInput = h("input", {
          class: "item-text",
          value: item.text,
          readOnly: !editing,
          placeholder: "New item",
          "data-item": item.id,
          oninput: (e) => this._mutate(() => (item.text = e.target.value), "text"),
          onkeydown: (e) => {
            if (e.key === "Enter" && editing) {
              e.preventDefault();
              this._addItem(list, item);
            } else if (e.key === "Backspace" && editing && !item.text) {
              e.preventDefault();
              this._removeItem(list, item);
            }
          },
        });
        const li = h(
          "li",
          { class: `item ${item.checked ? "checked" : ""}` },
          h(
            "label",
            { class: "check" },
            h("input", {
              type: "checkbox",
              checked: item.checked,
              "aria-label": item.text || "Checklist item",
              onchange: (e) => {
                this._mutate(() => (item.checked = e.target.checked), "check");
                li.classList.toggle("checked", item.checked);
                updateCount();
                this._updateProgress();
              },
            }),
            h("span", { class: "box", innerHTML: CHECK_SVG })
          ),
          textInput,
          editing
            ? h("button", { class: "icon-btn small ghost", title: "Remove item", onclick: () => this._removeItem(list, item) }, "✕")
            : null
        );
        ul.append(li);
      }

      const card = h(
        "div",
        { class: "checklist" },
        h(
          "div",
          { class: "checklist-head" },
          h("input", {
            class: "list-name",
            value: list.name,
            readOnly: !editing,
            "aria-label": "Checklist name",
            oninput: (e) => this._mutate(() => (list.name = e.target.value), "text"),
          }),
          count,
          editing
            ? h("button", { class: "icon-btn small ghost", title: "Delete checklist", onclick: () => this._removeList(list) }, "🗑")
            : null
        ),
        ul,
        editing ? h("button", { class: "link-btn add-item", onclick: () => this._addItem(list) }, "+ Add item") : null
      );
      this.listsEl.append(card);
    }

    if (focusItemId) this.listsEl.querySelector(`[data-item="${focusItemId}"]`)?.focus();
  }

  _addList() {
    const item = { id: uid("it"), text: "", checked: false };
    this._mutate((x) => x.checklists.push({ id: uid("cl"), name: "New checklist", items: [item] }));
    this._renderLists(item.id);
    this._updateProgress();
  }

  _removeList(list) {
    if (list.items.length && !confirm(`Delete checklist "${list.name}"?`)) return;
    this._mutate((x) => (x.checklists = x.checklists.filter((l) => l !== list)));
    this._renderLists();
    this._updateProgress();
  }

  _addItem(list, after) {
    const item = { id: uid("it"), text: "", checked: false };
    const idx = after ? list.items.indexOf(after) + 1 : list.items.length;
    this._mutate(() => list.items.splice(idx, 0, item));
    this._renderLists(item.id);
    this._updateProgress();
  }

  _removeItem(list, item) {
    const idx = list.items.indexOf(item);
    this._mutate(() => list.items.splice(idx, 1));
    const prev = list.items[Math.max(0, idx - 1)];
    this._renderLists(prev?.id);
    this._updateProgress();
  }

  _updateProgress() {
    const { done, total, ratio } = checklistProgress(this.hs);
    this.progressEl.firstChild.style.width = `${ratio * 100}%`;
    this.progressEl.classList.toggle("complete", total > 0 && ratio === 1);
    this.progressText.textContent = total ? `${done} of ${total} done` : "";
    if (total > 0 && ratio === 1) this.progressText.textContent += " ✓";
  }

  // ------------------------------------------------------------------ misc
  _mutate(fn, reason) {
    this.store.mutate(this.hotspotId, fn, reason);
    const el = this.modal?.querySelector("#hs-updated");
    if (el) el.textContent = this._updatedText();
  }

  _updatedText() {
    const t = this.hs?.updatedAt;
    return t ? `Updated ${new Date(t).toLocaleString()}` : "";
  }

  _delete() {
    const hs = this.hs;
    if (!confirm(`Delete hotspot "${hs.title}"? This cannot be undone.`)) return;
    const id = this.hotspotId;
    this.close();
    this.store.remove(id);
    toast("Hotspot deleted");
  }
}
