import { defineConfig, type Options } from "tsup";

// Mirrors apps/extension/tsup.config.ts. Entries point at the upstream Chrome extension sources
// so upstream changes flow into the Firefox build without copying files into this app; only
// the background entry (polyfills) and the recorder (no tab capture in Firefox) are our own.

declare const process: { env: Record<string, string | undefined> };

const production = { "process.env.NODE_ENV": JSON.stringify("production") };

// Saving a review: opt-in upstream (`MESURER_REVIEW=1`), same here.
const withReview = process.env.MESURER_REVIEW === "1";
const review = {
  __MESURER_REVIEW__: JSON.stringify(withReview),
  "globalThis.__MESURER_NO_REVIEW__": JSON.stringify(!withReview),
};

// dist is emptied by the build script before this runs: the builds below share it.
const shared: Options = {
  outDir: "dist",
  format: ["iife"],
  target: "es2020",
  platform: "browser",
  bundle: true,
  splitting: false,
  sourcemap: false,
  clean: false,
  // Unminified: keeps AMO review and web-ext lint readable.
  minify: false,
  outExtension: () => ({
    js: ".js",
  }),
};

export default defineConfig([
  {
    ...shared,
    entry: { content: "../extension/src/content.tsx" },
    define: {
      ...production,
      "globalThis.__MESURER_EXTENSION__": "true",
      __MESURER_SNAPDOM_CAPTURE__: "false",
      ...review,
    },
  },
  {
    ...shared,
    entry: {
      background: "src/background.ts",
      "keyboard-gate": "../extension/src/keyboard-gate.ts",
      "offscreen-recording": "src/offscreen-recording.ts",
      "recording-player": "../extension/src/recording-player.tsx",
    },
    define: { ...production, __MESURER_SNAPDOM_CAPTURE__: "false", ...review },
  },
  ...(withReview
    ? [
        {
          ...shared,
          entry: { "review-capture": "../extension/src/review-capture.ts" },
          format: ["esm" as const],
          noExternal: ["mesurer", "@zumer/snapdom"],
          define: production,
        },
      ]
    : []),
]);
