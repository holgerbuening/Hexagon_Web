import { defineConfig } from "vite";

// This config is opt-in. The ordinary build only emits index.html and its dependencies.
export default defineConfig({
  server: { host: "127.0.0.1", port: 5174 },
  build: { outDir: "dist-author", rollupOptions: { input: { author: "author/index.html", play: "author/play.html" } } },
  preview: { host: "127.0.0.1", port: 4174 },
});
