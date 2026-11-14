import { defineConfig } from "vite";

// One build owns the complete deployment directory, including shared assets.
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        game: "index.html",
        author: "author/index.html",
        play: "author/play.html",
      },
    },
  },
});
