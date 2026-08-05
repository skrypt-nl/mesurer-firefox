# Mesurer for Firefox

Firefox port of the [Mesurer Chrome extension](../extension). Maintained in the
[skrypt-nl/mesurer-firefox](https://github.com/skrypt-nl/mesurer-firefox) fork of
[ibelick/mesurer](https://github.com/ibelick/mesurer).

## How the port works

This app contains **no copied source code**. It is a thin build overlay on top of
the upstream Chrome extension:

- `tsup.config.ts` bundles `../extension/src/background.ts` and
  `../extension/src/content.tsx` directly (the `chrome.*` namespace works in
  Firefox, so the sources need no changes).
- `scripts/generate-manifest.mjs` reads the upstream
  `../extension/manifest.base.json` and merges `manifest.firefox.json` on top.
- Icons are copied from `../extension/icons`.

Firefox-specific manifest changes (all in `manifest.firefox.json`):

- `background.scripts` instead of `background.service_worker` — Firefox runs
  MV3 backgrounds as event pages, not service workers.
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
pnpm --filter mesurer build && pnpm --filter mesurer-firefox build
```

Merges are conflict-free by construction (upstream never touches
`apps/firefox/`; `pnpm-lock.yaml` conflicts resolve with `pnpm install`).
After a merge, the build catches drift:

- new/changed source files in `apps/extension/src` are picked up automatically;
- new `background` manifest keys upstream make `generate-manifest.mjs` throw so
  the override can be updated deliberately;
- other new manifest keys (permissions, etc.) merge through automatically —
  still eyeball `dist/manifest.json` after a sync, since new permissions may
  need Firefox-specific review.

## Build

```
pnpm install
pnpm --filter mesurer build      # build the shared package first
pnpm --filter mesurer-firefox build
```

Output lands in `apps/firefox/dist/` (`manifest.json`, `background.js`,
`content.js`, `icons/`).

## Run / package

```
pnpm --filter mesurer-firefox start      # launch in a temp Firefox profile (web-ext run)
pnpm --filter mesurer-firefox lint:ext   # web-ext lint against the built dist
pnpm --filter mesurer-firefox package    # zip for AMO into apps/firefox/artifacts/
```

To load manually instead: `about:debugging#/runtime/this-firefox` → "Load
Temporary Add-on…" → select `apps/firefox/dist/manifest.json`. Click the
toolbar button to toggle Mesurer on the current tab.
