import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const firefoxRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(firefoxRoot, "..", "..");
const chromeExtensionRoot = path.join(workspaceRoot, "apps", "extension");

// Upstream Chrome manifest is the single source of truth; Firefox-specific
// keys live in manifest.firefox.json and are merged on top at build time.
const baseManifestPath = path.join(chromeExtensionRoot, "manifest.base.json");
const firefoxOverridesPath = path.join(firefoxRoot, "manifest.firefox.json");
const packagePath = path.join(workspaceRoot, "packages", "mesurer", "package.json");
const outputPath = path.join(firefoxRoot, "dist", "manifest.json");
const iconsSourceDir = path.join(chromeExtensionRoot, "icons");
const iconsOutputDir = path.join(firefoxRoot, "dist", "icons");

const [baseManifestRaw, firefoxOverridesRaw, packageRaw] = await Promise.all([
  readFile(baseManifestPath, "utf8"),
  readFile(firefoxOverridesPath, "utf8"),
  readFile(packagePath, "utf8"),
]);

const baseManifest = JSON.parse(baseManifestRaw);
const firefoxOverrides = JSON.parse(firefoxOverridesRaw);
const pkg = JSON.parse(packageRaw);

const manifest = {
  ...baseManifest,
  ...firefoxOverrides,
  name: "Mesurer",
  description: pkg.description,
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

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
await cp(iconsSourceDir, iconsOutputDir, { recursive: true });
