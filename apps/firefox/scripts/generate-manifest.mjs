import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const firefoxRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(firefoxRoot, "..", "..");
const chromeExtensionRoot = path.join(workspaceRoot, "apps", "extension");
const distRoot = path.join(firefoxRoot, "dist");

// Upstream Chrome manifest is the single source of truth; Firefox-specific
// keys live in manifest.firefox.json and are merged on top at build time.
const baseManifestPath = path.join(chromeExtensionRoot, "manifest.base.json");
const firefoxOverridesPath = path.join(firefoxRoot, "manifest.firefox.json");
const packagePath = path.join(workspaceRoot, "packages", "mesurer", "package.json");
const packageStylesPath = path.join(workspaceRoot, "packages", "mesurer", "dist", "styles.css");

// Chrome-only permissions. Firefox would warn on them; their APIs are polyfilled
// in src/chrome-polyfill.ts instead.
const UNSUPPORTED_PERMISSIONS = new Set(["offscreen", "tabCapture"]);

const [baseManifestRaw, firefoxOverridesRaw, packageRaw] = await Promise.all([
  readFile(baseManifestPath, "utf8"),
  readFile(firefoxOverridesPath, "utf8"),
  readFile(packagePath, "utf8"),
]);

const baseManifest = JSON.parse(baseManifestRaw);
const firefoxOverrides = JSON.parse(firefoxOverridesRaw);
const pkg = JSON.parse(packageRaw);

// review-capture.js is only built, and only offered to pages, in a build that saves reviews.
const withReview = process.env.MESURER_REVIEW === "1";
const webAccessibleResources = (baseManifest.web_accessible_resources ?? []).map((entry) => ({
  ...entry,
  resources: entry.resources.filter((resource) => withReview || resource !== "review-capture.js"),
}));

const manifest = {
  ...baseManifest,
  permissions: (baseManifest.permissions ?? []).filter((permission) => !UNSUPPORTED_PERMISSIONS.has(permission)),
  // Firefox's tabs.captureVisibleTab (screenshots, recording) needs activeTab or literally
  // <all_urls>; http/https host patterns do not count. activeTab ends when the page reloads,
  // which breaks both after upstream restores Mesurer on reload.
  host_permissions: [...new Set([...(baseManifest.host_permissions ?? []), "<all_urls>"])],
  web_accessible_resources: webAccessibleResources,
  ...firefoxOverrides,
  version: pkg.version,
};

// Firefox runs MV3 backgrounds as event pages (background.scripts), not
// service workers. The override replaces the whole background object, so
// fail loudly if upstream adds background keys we would silently drop.
const droppedBackgroundKeys = Object.keys(baseManifest.background ?? {}).filter(
  (key) => key !== "service_worker" && !(key in manifest.background)
);
if (droppedBackgroundKeys.length > 0) {
  throw new Error(
    `Upstream manifest.base.json has background keys not covered by manifest.firefox.json: ${droppedBackgroundKeys.join(", ")}`
  );
}

await mkdir(distRoot, { recursive: true });
await writeFile(path.join(distRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
await cp(path.join(chromeExtensionRoot, "icons"), path.join(distRoot, "icons"), { recursive: true });
// Upstream's pages, unchanged: offscreen.html loads our offscreen-recording.js under the same name.
await cp(path.join(chromeExtensionRoot, "recording-player.html"), path.join(distRoot, "recording-player.html"));
await cp(path.join(chromeExtensionRoot, "offscreen.html"), path.join(distRoot, "offscreen.html"));
await cp(packageStylesPath, path.join(distRoot, "mesurer.css"));
