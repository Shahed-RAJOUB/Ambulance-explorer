import { defineConfig } from "vite";

export default defineConfig({
  server: { open: true },
  build: { chunkSizeWarningLimit: 8000 },
});
