import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const host = process.env.TAURI_DEV_HOST;
const sourceRoot = path.dirname(fileURLToPath(import.meta.url));
const localBuildRoot = path.resolve(
  sourceRoot,
  "../../提示词优化/PromptForge-Build",
);
const buildRoot = process.env.PROMPT_FORGE_BUILD_ROOT
  ? path.resolve(process.env.PROMPT_FORGE_BUILD_ROOT)
  : localBuildRoot;
const useStableBuildRoot =
  Boolean(process.env.PROMPT_FORGE_BUILD_ROOT) || existsSync(localBuildRoot);
const distDir = process.env.PROMPT_FORGE_DIST_DIR
  ? path.resolve(process.env.PROMPT_FORGE_DIST_DIR)
  : useStableBuildRoot
    ? path.join(buildRoot, "dist")
    : path.join(sourceRoot, "dist");
const cacheDir = process.env.PROMPT_FORGE_VITE_CACHE_DIR
  ? path.resolve(process.env.PROMPT_FORGE_VITE_CACHE_DIR)
  : useStableBuildRoot
    ? path.join(buildRoot, "cache", "vite")
    : path.join(sourceRoot, "node_modules/.vite");

export default defineConfig({
  plugins: [react()],
  cacheDir,
  build: {
    outDir: distDir,
    emptyOutDir: false,
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
});
