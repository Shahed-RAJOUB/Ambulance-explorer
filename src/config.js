/**
 * Central configuration – this is the file you edit to plug in your own assets.
 * Files placed in /public are served from the site root, e.g.
 *   public/assets/ambulance/ambulance_edited.splat  ->  "/assets/ambulance/ambulance_edited.splat"
 */
export const CONFIG = {
  /**
   * Ambulance interior scan (.splat).
   */
  ambulanceModel: "/assets/ambulance/ambulance_edited.splat",

  /** Transform applied to the loaded ambulance model so it fits the interior box below. */
  ambulanceTransform: {
    position: [0.078, -30, -0.001],
    rotationDeg: [180,0,180],
    scale: 5.5,
  },

  corpulsTransform: {
    position: [0, 0, 0],
    rotationDeg: [0, 0, 180],
    scale: 1,
  },

  /**
   * Interior dimensions in metres (x = width, y = height, z = length), floor at y = 0.
   * Used as a fallback picking box when a splat is loaded.
   */
  interior: { width: 2.0, height: 1.9, length: 3.6 },

  /** Tool models offered in the popup's dropdown (Edit mode). */
  tools: [
    { label: "Corpuls Monitor (Splat)", url: "/assets/ambulance/edited_corpulus_splat.splat" },
  ],

  /** localStorage key for hotspots / checklists. */
  storageKey: "ambulance-explorer:v3",
};
