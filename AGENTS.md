# AGENTS.md

Guidance for AI coding agents (and humans) working on **GiftPilot**, a Manifest V3 Chromium extension for [steamgifts.com](https://www.steamgifts.com). Read this file before changing code.

## Project at a glance

- Plain JavaScript, CSS and HTML. **No bundler, no framework, no runtime dependencies.** Dev tooling only: ESLint 10, Prettier 3, `node:test`.
- Node.js 22, 24 or 26 (`.nvmrc` = 24). Package manager: npm.
- Load the repository root as an unpacked extension in `chrome://extensions` during development. `npm run build` produces `build/extension`.
- Code, comments and documentation are in English. A Portuguese (Brazil) copy of the user docs lives in `docs/pt-br-documentation/`; the extension UI and the website ship `en` and `pt-BR`.

## Commands

| Command                            | What it does                                                              |
| ---------------------------------- | ------------------------------------------------------------------------- |
| `npm ci`                           | Install dev tooling (lockfile is committed).                              |
| `npm run check`                    | ESLint + Prettier check. Fix with `npm run lint:fix` / `format:fix`.      |
| `npm test`                         | Unit tests in `tests/*.test.js`.                                          |
| `npm run verify`                   | Metadata drift check + i18n parity + tests.                               |
| `npm run build`                    | `check` + `verify` + copy the shippable files to `build/extension`.       |
| `npm run package`                  | `build` + `dist/giftpilot-v<version>.zip`.                                |
| `node scripts/build-site-dark.mjs` | Regenerate `css/site/dark.css` from `tests/fixtures/steamgifts/site.css`. |

Run `npm run check && npm test` before finishing any change. CI runs the same.

## Layout

```
manifest.json            entry point; content scripts are listed in load order
js/core/                 pure, shared modules (no DOM side effects at load)
  i18n.js                translations (en, pt-BR) - every UI string lives here
  settings-store.js      defaults + chrome.storage.sync wrapper (single source of truth)
  giveaway-parse.js      parses a .giveaway__row-outer-wrap into a plain object
  autojoin-plan.js       selects/orders giveaways to enter (pure, unit tested)
  sg-request.js          site-shaped requests + tab bridge for the service worker
  timing.js              human-paced, jittered schedules
js/content/              content scripts (run on steamgifts.com)
  panel.js               closed shadow-root panel + toasts (all extension UI)
  rows.js                per-row enhancements, join/leave, store filters
  listing.js             giveaway listing: Autopilot run, repeat, comments
  page.js                theme/pin toggles, shortcuts, scroller on other pages
  infinite-scroll.js     the only page loader
  steam-data.js          owned games / wishlist from Steam
js/background/service-worker.js   alarms, background routine, notifications,
                                  insertCSS for theme/pin, header rules
js/offscreen/offscreen.js         DOMParser, win sound, Steam key redemption
js/options/                       options page logic
css/site/                injected into steamgifts.com (dark.css is GENERATED)
css/options/             options page styles
tests/                   node:test suites + SteamGifts fixtures
docs/                    GitHub Pages site (static HTML, served from /docs)
  pt-br-documentation/   Portuguese copy of README, CHANGELOG, TO-DO and community docs
```

## Invariants (do not break)

These exist because SteamGifts actively detects automation extensions. Its bundle reports accounts that expose known extension markers. `tests/stealth.test.js` enforces most of them.

1. **No extension UI in the page's light DOM.** Buttons, status, notices and toasts go through `js/content/panel.js` (closed shadow root). Never add ids/classes like `btnAutoJoin`, `btnSettings`, `ajFooter`, `navbarPin`, `ajFooterArrow`, or any `aj`/`autojoin`/`giftpilot`-looking marker to page elements.
2. **Only neutral `sgx-` classes** may be added to site rows (`css/site/widgets.css`). Track processed rows with `WeakSet`, not attributes.
3. **No writes to the page's `localStorage`/`sessionStorage`, `<html lang>`, `<body>` classes, or page-visible `<style>/<link>`.** Theme and pinned navbar are injected by the service worker via `chrome.scripting.insertCSS`.
4. **No `web_accessible_resources`.** They let any page probe for the extension.
5. **Requests must match the site's own.** Prefer clicking the site's native buttons (`.giveaway__quick-entry-btn--insert`). Otherwise use `GiftPilotRequest.postEntry`/`post`/`getHtml`; never hand-roll `fetch` with a different body format or headers.
6. **Respect locked rows.** A locked insert button means the description must be opened first; open it and wait a reading delay, as a person would.
7. **Human pacing.** All repeated actions use `GiftPilotTiming` schedules; never fixed intervals, never parallel entries.
8. Changing `permissions`/`host_permissions` in `manifest.json` needs explicit human approval.

## Conventions

- Each module is an IIFE that exposes `globalThis.GiftPilot<Name>` and, when `module` exists, `module.exports` (so tests can `require` it).
- Settings keys (e.g. `AutoJoinButton`, `BackgroundAJ`) are **storage keys**: do not rename them, users would lose their configuration. Add new keys to `DEFAULT_SETTINGS` in `settings-store.js`, a control with `data-setting` in `html/options.html`, and strings in both locales of `i18n.js`.
- Every user-visible string goes through `i18n.js` in both `en` and `pt-BR`; `tests/i18n-usage.test.js` fails on missing keys.
- Keep pure logic in `js/core/` and cover it with tests; keep DOM code thin.
- Formatting is Prettier's; do not hand-format.
- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `ci:`, `test:`, `refactor:`), messages in Portuguese or English.

## When SteamGifts changes

1. Save a fresh listing page to `tests/fixtures/steamgifts/homepage.html` and the stylesheet to `tests/fixtures/steamgifts/site.css`.
2. Fix `js/core/giveaway-parse.js` selectors; run `npm test`.
3. Regenerate the theme: `node scripts/build-site-dark.mjs`.
4. Check the site bundle (`cdn.steamgifts.com/js/bundle-v*.js`) for new `atob(...)` canaries and add them to `tests/stealth.test.js`.

## Releasing

1. Bump `version` in `manifest.json`, `package.json` and `package-lock.json`, and the README badge (`npm run metadata:check` enforces it).
2. Move `## [Unreleased]` items in `CHANGELOG.md` into a new version section (mirror it in `docs/pt-br-documentation/CHANGELOG.md`).
3. Push to `main`: CI builds, and the release job creates tag `v<version>` with the zip when the tag does not exist yet.

## Do not

- Publish to any extension store, push tags, or change repository settings without being asked.
- Add runtime dependencies or load remote code.
- Edit `css/site/dark.css` by hand (edit `css/site/dark.overrides.css` or the generator).
- Commit `build/`, `dist/`, or local tooling folders (see `.gitignore`).
