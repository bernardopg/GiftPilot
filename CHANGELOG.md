# Changelog

All notable changes to GiftPilot are documented here.

The format follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Sections per version: **Added**, **Changed**, **Deprecated**, **Removed**, **Fixed** and **Security**.

## [Unreleased]

### Changed

- Documentation is now in English; the Portuguese version lives in [`docs/pt-br-documentation/`](docs/pt-br-documentation/).
- Repository renamed to `bernardopg/GiftPilot`; website moved to <https://bernardopg.github.io/GiftPilot/>.

## [3.0.0] - 2026-10-20

New identity: the project is now called **GiftPilot**. Saved settings are kept.

### Added

- Own name, logo, icons and palette (`assets/brand/`, `assets/icons/`).
- Floating panel in a closed shadow root with points, level, autopilot button, status, notices and toasts (`js/content/panel.js`).
- Autopilot with a sequential, cancellable queue (the button turns into "Stop"), resume after the "repeat every N hours" reload and back-off on network errors.
- Handling of giveaways with a required description: the site locks the entry button (`is-locked`) until the description is opened. The autopilot opens the native description, waits a reading delay proportional to the text and only then enters; background mode does the same through `do=giveaway_description`.
- Request bridge: with a SteamGifts tab open, the service worker runs requests inside it and mirrors points and rows in that tab.
- Dark theme generated from the site's official CSS (`scripts/build-site-dark.mjs` → `css/site/dark.css`, tweaks in `css/site/dark.overrides.css`).
- Clicking the extension icon opens the settings.
- Controls for settings that existed without one: ignore whitelist in background, max time left (hours) and level priority.
- Website, issues and changelog links on the settings page.
- Autopilot selection tests (`tests/autojoin-plan.test.js`) and new anti-detection checks.
- GitHub Pages site, `FUNDING.yml`, automatic PR labeling, issue forms and an `AGENTS.md` for AI agents.

### Changed

- Folder layout: `js/{background,content,core,offscreen,options}`, `css/{site,options,vendor}`, `assets/`; community docs in `.github/`.
- Giveaway parser rewritten for the current markup (relative links without trailing slash, `?utm_source`, copies and cost by regular expression, level from the decimal `title`) and shared between the page and the offscreen document.
- A single infinite scroller (`js/content/infinite-scroll.js`); loaded pages get buttons, filters and win odds.
- Entries follow the active site bundle format: multipart `FormData` on `bundle-v18`, jQuery urlencoded on `bundle-v19`.
- Dark theme and pinned navbar applied by the service worker with `chrome.scripting.insertCSS`, with no `<body>` class and no white flash.
- Steam data cache with expiry; DLC and trading cards via `appdetails`; comments sent as a plain form.
- Internal globals renamed from `AutoJoin*` to `GiftPilot*`. Settings keys did not change.
- README, contributing guide, security policy, `TO-DO.md` and this changelog rewritten and standardized.
- GitHub workflows reviewed: CI without the non-existent `develop` branch, release named after the new brand with notes taken from this file, Dependabot with consistent groups and labels.

### Removed

- `web_accessible_resources` (they let the page probe for the extension).
- Suspension-notice script, writes to the page's `localStorage` and changes to `<html lang>`.
- Legacy module `js/core/giveaway.js`, `css/general.css`, `IMPROVEMENTS.md` and store links on the settings page.

### Fixed

- Automatic key redemption: `res.json()` without `await`, `winner_id` sent as the literal string `'winnerId'` and missing Steam session.
- `/giveaways/won` fetched without cookies; wins are now also detected from the won counter.
- `PointsToPreserve`, `MaxTimeLeftBG` and `MinLevelBG` ignored in background mode; service worker kept alive during the routine.
- Settings: duplicated reset listener, a `this.value === 0` comparison that was never true and the "repeat every" field saved to the wrong key (`hoursField` instead of `RepeatHours`).
- Notifications on the settings page, which did not load the notification module.

### Security

- `bundle-v19.js` canary neutralized: the site reports the account (`ajax.php`, `do=jh8Dn`) when it finds any of `input#btnAutoJoin`, `#btnSettings` with the text "AutoJoin Settings", `#ajFooter`, `#navbarPin` or `#ajFooterArrow`. None of these markers exist on the page anymore.

## [2.1.0] - 2026-10-15

### Added

- `declarativeNetRequest` permission with session rules that rewrite `Origin` and `Referer` of service-worker requests to `https://www.steamgifts.com`.

### Changed

- Classes and globals with an autojoin signature (`btnSingle`, `buttonsAJ`, `AutoJoinButtonEnabled`, `pointsFloating`, `aj-*`, `__AJ_*`) renamed to the neutral `sgx` prefix.

### Security

- `tests/stealth.test.js` now scans content scripts and injected CSS for known markers.

## [2.0.3] - 2026-10-15

### Added

- `js/core/timing.js`: non-uniform jittered scheduling (normal pace, slow reading and occasional pauses) instead of a fixed interval.

### Changed

- Service-worker entry requests use `credentials: 'include'`.

### Security

- Ids matched by the `bundle-v18.js` canary (`ajFooter`, `navbarPin`, `ajFooterArrow`) renamed; the site reported accounts via `ajax.php?do=dbb8ff` when it found all three.

## [2.0.2] - 2026-10-15

### Added

- CodeQL and dependency review workflows, `CODEOWNERS`, `lint:fix` and `format:fix` scripts, tests for settings, rules, metadata and SteamGifts fixtures.

### Changed

- Font Awesome 6.0.0 → 7.3.1 (`woff2` only), ESLint 8 → 10 with flat config, Node.js 22/24/26 in the CI matrix.

### Fixed

- Eight CodeQL alerts (host checks with `includes`, regex sanitization, property injection in `getUrlParams`), vulnerabilities in dev dependencies and the settings logo 404.

## [2.0.1] and earlier

Releases published under the previous name, including the Manifest V3 migration (2.0.0). Detailed history before 2.0.2 is not verifiable in the current git history; see the [releases](https://github.com/bernardopg/GiftPilot/releases).

[Unreleased]: https://github.com/bernardopg/GiftPilot/compare/v3.0.0...HEAD
[3.0.0]: https://github.com/bernardopg/GiftPilot/compare/v2.1.0...v3.0.0
[2.1.0]: https://github.com/bernardopg/GiftPilot/compare/v2.0.1...v2.1.0
[2.0.3]: https://github.com/bernardopg/GiftPilot/commit/57465c8
[2.0.2]: https://github.com/bernardopg/GiftPilot/commit/e6063d5

[2.0.1] and earlier: https://github.com/bernardopg/GiftPilot/releases/tag/v2.0.1
