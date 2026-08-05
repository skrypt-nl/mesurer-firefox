import { defineConfig } from "tsup";

// Entries point at the upstream Chrome extension sources so upstream changes
// flow into the Firefox build without copying files into this app.
export default defineConfig({
  entry: {
    background: "../extension/src/background.ts",
    content: "../extension/src/content.tsx",
  },
  outDir: "dist",
  format: ["iife"],
  target: "es2020",
  platform: "browser",
  bundle: true,
  splitting: false,
  sourcemap: false,
  clean: true,
  minify: false,
  outExtension: () => ({
    js: ".js",
  }),
});
