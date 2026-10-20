# Contributing to GiftPilot

Thanks for helping! This guide covers the essentials; the full technical rules are in [AGENTS.md](../AGENTS.md).

## Before you start

- Look for an existing [issue](https://github.com/bernardopg/GiftPilot/issues) or open one describing the problem or idea.
- For vulnerabilities, **do not** open a public issue: follow the [security policy](SECURITY.md).
- By participating you agree to the [code of conduct](CODE_OF_CONDUCT.md).

## Setup

```bash
git clone https://github.com/bernardopg/GiftPilot.git
cd GiftPilot
nvm use        # Node.js 24 (22 and 26 are supported too)
npm ci
```

Load the repository root in `chrome://extensions` → **Load unpacked**. After editing, reload the extension and the SteamGifts tab.

## Workflow

1. Branch off `main`: `feat/…`, `fix/…`, `docs/…`.
2. Make the change, with tests when you add logic to `js/core/`.
3. Run `npm run check && npm test` (or `npm run build`, which runs everything).
4. Update `CHANGELOG.md` under **[Unreleased]** when the change is user-visible.
5. Open the PR using the template. Labels are applied automatically.

## Rules that must not break

- No extension UI in the page's visible DOM: use the panel in `js/content/panel.js`.
- No autojoin-looking `id`/class, no `web_accessible_resources`, no writes to the page's `localStorage`.
- SteamGifts requests always go through `js/core/sg-request.js` or the site's native buttons.
- Every visible string goes through `js/core/i18n.js`, in both `en` and `pt-BR`.
- `permissions` changes require maintainer approval.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/): `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, `ci:`. Example: `fix(content): wait for the description unlock before entering`.

Portuguese docs: [`docs/pt-br-documentation/`](../docs/pt-br-documentation/).
