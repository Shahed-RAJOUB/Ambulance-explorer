import { ImportMeshAsync, Vector3 } from "@babylonjs/core";
import "@babylonjs/loaders";

/**
 * Minimal ZIP reader for uncompressed (STORED, method 0) entries used in .sog files,
 * registered on window.fflate so @babylonjs/loaders doesn't need an external CDN script.
 */
function ensureZipSupport() {
  if (typeof window !== "undefined" && !window.fflate) {
    window.fflate = {
      unzipSync(u8) {
        const buf = u8 instanceof Uint8Array ? u8 : new Uint8Array(u8);
        const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
        let eocd = buf.byteLength - 22;
        while (eocd >= 0 && view.getUint32(eocd, true) !== 0x06054b50) eocd--;
        if (eocd < 0) throw new Error("Invalid ZIP archive");
        const count = view.getUint16(eocd + 10, true);
        let cd = view.getUint32(eocd + 16, true);
        const out = {};
        const dec = new TextDecoder();
        for (let i = 0; i < count; i++) {
          const method = view.getUint16(cd + 10, true);
          const compSize = view.getUint32(cd + 20, true);
          const nameLen = view.getUint16(cd + 28, true);
          const extraLen = view.getUint16(cd + 30, true);
          const commentLen = view.getUint16(cd + 32, true);
          const lfh = view.getUint32(cd + 42, true);
          const name = dec.decode(buf.subarray(cd + 46, cd + 46 + nameLen));
          const lfhNameLen = view.getUint16(lfh + 26, true);
          const lfhExtraLen = view.getUint16(lfh + 28, true);
          const start = lfh + 30 + lfhNameLen + lfhExtraLen;
          if (method !== 0) throw new Error(`Unsupported ZIP compression method ${method} for ${name}`);
          out[name] = buf.subarray(start, start + compSize);
          cd += 46 + nameLen + extraLen + commentLen;
        }
        return out;
      },
    };
  }
}

/**
 * Loads a 3D model or Gaussian splat (.ply, .splat, .spz, .sog, .glb, or SuperSplat .html).
 */
export async function importModelOrSplat(url, scene, { onProgress } = {}) {
  ensureZipSupport();

  const cleanUrl = url.split("?")[0].toLowerCase();
  if (cleanUrl.endsWith(".html")) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} loading ${url}`);
    const html = await res.text();
    onProgress?.(0.5);

    const match = html.match(/<script\s+type="application\/json"\s+id="sse-bootstrap">([\s\S]*?)<\/script>/i);
    if (!match) throw new Error("No SuperSplat #sse-bootstrap data found in HTML file");
    const bootstrap = JSON.parse(match[1]);
    const dataUri = bootstrap.contentUrl;
    if (!dataUri) throw new Error("No contentUrl in SuperSplat bootstrap");

    const binRes = await fetch(dataUri);
    const blob = await binRes.blob();
    const ext = "." + ((bootstrap.contentFilename || "scene.sog").split(".").pop() || "sog").toLowerCase();
    const blobUrl = URL.createObjectURL(blob);
    try {
      const imported = await ImportMeshAsync(blobUrl, scene, {
        pluginExtension: ext,
        onProgress: (e) => e.lengthComputable && onProgress?.(0.5 + 0.5 * (e.loaded / e.total)),
      });
      return { ...imported, settings: bootstrap.settings };
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }

  return await ImportMeshAsync(url, scene, {
    onProgress: (e) => e.lengthComputable && onProgress?.(e.loaded / e.total),
  });
}

/**
 * Computes a robust (percentile-clipped) world-space bounding box for Gaussian splat meshes
 * so distant stray "floater" splats don't push the camera far away.
 */
export function computeRobustBounds(rootNode, pctLow = 0.08, pctHigh = 0.92) {
  rootNode.computeWorldMatrix(true);
  const meshes = rootNode.getChildMeshes(false);
  const xs = [];
  const ys = [];
  const zs = [];
  const tmp = new Vector3();

  for (const m of meshes) {
    const pos = m._splatPositions;
    const count = m._vertexCount || (pos ? pos.length >> 2 : 0);
    if (pos && count > 0) {
      m.computeWorldMatrix(true);
      const wm = m.getWorldMatrix();
      const step = Math.max(1, Math.floor(count / 4000));
      for (let i = 0; i < count; i += step) {
        const x = pos[i * 4];
        const y = pos[i * 4 + 1];
        const z = pos[i * 4 + 2];
        if (!isFinite(x) || !isFinite(y) || !isFinite(z)) continue;
        Vector3.TransformCoordinatesFromFloatsToRef(x, y, z, wm, tmp);
        xs.push(tmp.x);
        ys.push(tmp.y);
        zs.push(tmp.z);
      }
    }
  }

  if (xs.length > 20) {
    xs.sort((a, b) => a - b);
    ys.sort((a, b) => a - b);
    zs.sort((a, b) => a - b);
    const pick = (arr, p) => arr[Math.min(arr.length - 1, Math.max(0, Math.floor(arr.length * p)))];
    return {
      min: new Vector3(pick(xs, pctLow), pick(ys, pctLow), pick(zs, pctLow)),
      max: new Vector3(pick(xs, pctHigh), pick(ys, pctHigh), pick(zs, pctHigh)),
    };
  }

  return rootNode.getHierarchyBoundingVectors(true);
}
