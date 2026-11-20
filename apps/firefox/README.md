# Mesurer for Firefox

Firefox port of the [Mesurer Chrome extension](../extension). Maintained in the
[skrypt-nl/mesurer-firefox](https://github.com/skrypt-nl/mesurer-firefox) fork of
[ibelick/mesurer](https://github.com/ibelick/mesurer).

There is no public build — install it by building it yourself, as below.

## Installation

### Prerequisites

- [Node.js](https://nodejs.org) 20+
- [pnpm](https://pnpm.io) (`corepack enable` or `npm i -g pnpm`)
- Firefox 128+

### Build

```
git clone https://github.com/skrypt-nl/mesurer-firefox.git
cd mesurer-firefox
pnpm install
pnpm -C apps/firefox build         # builds the shared package first
```

The extension is now in `apps/firefox/dist/`.

> Note: use `pnpm -C <dir>`, not `pnpm --filter mesurer` — the repo root
> package is also named `mesurer`, so the filter resolves to the root and drags
> the site build in.

### Install in Firefox

**Option A — temporary (quickest, gone after restarting Firefox):**

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Select `apps/firefox/dist/manifest.json`

**Option B — permanent (regular Firefox, requires signing):**

Regular Firefox only keeps signed extensions. Sign your own build through
addons.mozilla.org (free, no public listing):

1. Create AMO API credentials at
   <https://addons.mozilla.org/developers/addon/api/key/>
2. ```
   cd apps/firefox
   pnpm exec web-ext sign --source-dir dist --channel unlisted \
     --api-key <JWT issuer> --api-secret <JWT secret>
   ```
3. Open the signed `.xpi` from `web-ext-artifacts/` in Firefox (drag it into a
   window) and confirm the install.

Signing the same version number twice is rejected by AMO — bump the version in
`packages/mesurer/package.json` (or wait for an upstream bump) before
re-signing. The add-on id is fixed, so a newer signed `.xpi` installs over the
old one.

**Option C — permanent, unsigned (Developer Edition / Nightly / ESR only):**

1. `about:config` → set `xpinstall.signatures.required` to `false`
2. `pnpm -C apps/firefox package` → zip lands in `apps/firefox/artifacts/`
3. `about:addons` → gear icon → **Install Add-on From File…** → select the zip

### Usage

Click the Mesurer button in the Firefox toolbar to turn it on for the current
tab; click it again to turn it off (pin the button via the puzzle-piece menu
if hidden). Per-tab: nothing runs until you click.

Once active, use the on-page toolbar to inspect, measure, annotate, take
screenshots and record video; hover its buttons for keyboard shortcuts.

Firefox will ask for access to all websites on install: Mesurer restores itself
on reload and captures screenshots/recordings, which Firefox only allows with
that permission.

## How the port works

This app contains **no copied source code**. It is a thin build overlay on top of
the upstream Chrome extension:

- `tsup.config.ts` mirrors `../extension/tsup.config.ts` and bundles the
  upstream sources in `../extension/src/` directly (the `chrome.*` namespace
  works in Firefox, so they need no changes).
- `scripts/generate-manifest.mjs` reads the upstream
  `../extension/manifest.base.json`, merges `manifest.firefox.json` on top, and
  copies icons, upstream's HTML pages and the package stylesheet.

Only two source files are Firefox's own, both for video recording, which
upstream builds on Chrome-only APIs:

- `src/chrome-polyfill.ts` — loaded before upstream's background
  (`src/background.ts`). Polyfills `chrome.offscreen` (an iframe inside
  Firefox's event-page background) and `chrome.tabCapture` (the "stream id" is
  the tab id).
- `src/offscreen-recording.ts` — replaces upstream's recorder with the same
  messages: Firefox has no tab capture stream, so it records frames from
  `tabs.captureVisibleTab` (~30 fps) and saves to upstream's recording store.

Firefox-specific manifest changes:

- `background.scripts` instead of `background.service_worker` — Firefox runs
  MV3 backgrounds as event pages, not service workers.
- `offscreen`/`tabCapture` permissions dropped (polyfilled instead), and
  `<all_urls>` added to `host_permissions` — Firefox's `captureVisibleTab`
  doesn't accept `http(s)://*/*` patterns.
- `name` shortened to "Mesurer" (AMO caps names at 50 characters).
- `browser_specific_settings.gecko`: add-on id, `strict_min_version` (128.0),
  and `data_collection_permissions` (`required: ["none"]`, per
  [PRIVACY.md](../../packages/mesurer/PRIVACY.md) — required for AMO
  submissions).

## Fork maintenance

Everything Firefox-specific lives in `apps/firefox/`; no upstream files are
modified. To sync with upstream:

```
git remote add upstream https://github.com/ibelick/mesurer.git  # once
git fetch upstream
git merge upstream/main
pnpm install
pnpm -C apps/firefox build
```

Merges are conflict-free by construction (upstream never touches
`apps/firefox/`; `pnpm-lock.yaml` conflicts resolve with `pnpm install`).
After a merge, the build catches drift:

- new/changed source files in `apps/extension/src` are picked up automatically;
- new upstream build entries or `define`s in `apps/extension/tsup.config.ts`
  must be mirrored in ours — diff the two after a sync;
- changes to upstream's `src/offscreen-recording.ts` or recording messages may
  need porting to `src/offscreen-recording.ts`;
- new `background` manifest keys upstream make `generate-manifest.mjs` throw so
  the override can be updated deliberately;
- other new manifest keys (permissions, etc.) merge through automatically —
  still eyeball `dist/manifest.json` after a sync, since new permissions may
  need Firefox-specific review.

## Dev commands

```
pnpm -C apps/firefox start      # launch in a temp Firefox profile (web-ext run)
pnpm -C apps/firefox lint:ext   # web-ext lint against the built dist
pnpm -C apps/firefox package    # zip into apps/firefox/artifacts/
```
