import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Resolve @landscape/core to its TypeScript source so the shared pricing engine
// runs in the browser with no build step (esbuild transpiles it inline). The
// fs.allow entry lets Vite serve that sibling package from outside web/'s root.
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const coreEntry = fileURLToPath(
  new URL("../core/src/index.ts", import.meta.url),
);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@landscape/core": coreEntry,
    },
  },
  server: {
    port: 5173,
    fs: {
      allow: [repoRoot],
    },
  },
});
