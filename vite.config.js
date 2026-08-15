import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Face API's no-bundle entry re-exports the optional WASM backend.
      // This app intentionally uses WebGL, so avoid pulling in a second
      // backend solely to satisfy that unused re-export.
      "@tensorflow/tfjs-backend-wasm/dist/index.js": fileURLToPath(
        new URL("./src/lib/tfjsWasmStub.js", import.meta.url)
      ),
    },
  },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("@tensorflow")) return "tensorflow";
          if (id.includes("face-api")) return "faceapi";
          if (id.includes("recharts") || id.includes("d3-")) return "charts";
        },
      },
    },
  },
});
