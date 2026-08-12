import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
