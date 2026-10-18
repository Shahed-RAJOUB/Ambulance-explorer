# Ambulance Explorer – Interactive 3D Gaussian Splatting Guide

**Ambulance Explorer** is an interactive 3D web application built with **Babylon.js** and **Vite** that uses **3D Gaussian Splatting (`.splat`)** to let users explore the interior of an ambulance, click on equipment hotspots, inspect 3D scans of medical devices (such as the Corpuls patient monitor), and complete shift checklists.

---

## Step 1: Initial Concept & First Trial

The video below shows **Step 1** of the project — an initial trial and proof-of-concept demonstrating the core workflow: loading the 3D Gaussian Splatting ambulance interior, navigating inside the scene, and clicking on the hotspot marker to open the interactive popup featuring the 3D Corpuls monitor splat and checklists.

<video src="./initial-concept.mp4" controls width="100%">
  Your browser does not support the video tag. You can view or download the video at <a href="./initial-concept.mp4">initial-concept.mp4</a>.
</video>

> **Note — Work in Progress / Needs Improvements:**  
> This initial prototype is a **first trial** to validate the 3D Gaussian Splatting pipeline and interactive hotspot concept. Several areas still need improvement in upcoming iterations:
> - **Splat Scan Quality & Cleaning:** Reducing floaters/artifacts and improving capture coverage for both the ambulance interior and individual medical devices.
> - **Scene Alignment & Camera Controls:** Refining coordinate transforms, camera bounds, and hotspot placement accuracy.
> - **Expanded Equipment Library:** Adding more scanned medical tools, compartments, and interactive checklists.

---

## Features

- **3D Gaussian Splatting Interior:** Renders `.splat` scans directly in the browser using `@babylonjs/core` and `@babylonjs/loaders`.
- **Interactive Hotspots:** 3D markers projected over the scene that open a detailed equipment modal when clicked.
- **3D Equipment Popup Viewer:** Dedicated orbit viewer inside the popup to inspect the **Corpuls Monitor (`.splat`)** from any angle, with support for model flipping and custom transforms.
- **Shift Checklists & Persistence:** Interactive checklists with progress tracking, saved locally via `localStorage` and exportable/importable as JSON.

---

## Local Asset Setup (`public/assets/ambulance/`)

Because the 3D Gaussian Splat files are large binary assets, `public/assets/ambulance/` is excluded from Git via `.gitignore`.

To run the project locally, place your `.splat` files in `public/assets/ambulance/` matching the paths configured in `src/config.js`:

| Asset | File Path | Configured in `src/config.js` |
|---|---|---|
| Ambulance interior scan | `public/assets/ambulance/ambulance_edited.splat` | `ambulanceModel: "/assets/ambulance/ambulance_edited.splat"` |
| Corpuls monitor scan | `public/assets/ambulance/edited_corpulus_splat.splat` | `tools: [{ label: "Corpuls Monitor (Splat)", url: "/assets/ambulance/edited_corpulus_splat.splat" }]` |

---

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```
