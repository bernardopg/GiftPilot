# TO-DO

GiftPilot backlog. Finished items leave this list and go to the [CHANGELOG](CHANGELOG.md).

**Priorities:** `P1` next cycle · `P2` important, not urgent · `P3` future idea.
**Format:** `- [ ] (area) description` — areas: `core`, `content`, `background`, `options`, `ui`, `docs`, `ci`, `qa`.

Last review: 2026-10-20 (v3.0.0).

## P1

- [ ] (qa) Integration test of the entry flow with a locked-row fixture (`is-locked` + `has-description`) and with the `ajax.php` error response.
- [ ] (content) Split `js/content/listing.js` (autopilot run, repeat and comments) into smaller modules.
- [ ] (background) Split `js/background/service-worker.js` into routine, styles, notifications and Steam modules.
- [ ] (core) Single settings schema with defaults, limits and validation; limits are currently duplicated in `js/options/options.js`.
- [ ] (options) Inline validation next to each field, not only in the error summary.
- [ ] (ui) First run: explain permissions, risks and where the panel lives.
- [ ] (background) Clear error messages for expired Steam session, private profile and denied permission.
- [ ] (css) Remove leftover site selectors from the old version in `css/options/night.css` (only the settings page uses this file).

## P2

- [ ] (content) Dry-run mode: show which giveaways the autopilot would enter, with the reason for each exclusion.
- [ ] (ui) Summary after a run: evaluated, skipped by reason and points spent.
- [ ] (options) Export and import settings as JSON.
- [ ] (options) Presets: casual, wishlist first, conservative.
- [ ] (content) Block and preference lists per game and per giveaway creator.
- [ ] (ui) Accessibility review: dark theme contrast, visible focus, `aria-live`.
- [ ] (qa) Automated extension load test (headless Chromium with Playwright) covering the panel, theme and absence of canaries.
- [ ] (docs) English screenshots for the website.

## P3

- [ ] (core) Evaluate TypeScript (via JSDoc + `checkJs`) starting with `js/core/`.
- [ ] (ui) Local history of runs and errors for diagnostics.
- [ ] (core) Firefox support: replace `offscreen` with an alternative parser and `service_worker` with `background.scripts`.
