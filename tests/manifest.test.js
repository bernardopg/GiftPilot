const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const rootDir = path.resolve(__dirname, '..');
const manifestPath = path.join(rootDir, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const fileExists = (relativePath) =>
  fs.existsSync(path.join(rootDir, relativePath));

test('manifest metadata is present', () => {
  assert.equal(manifest.manifest_version, 3, 'Extension must use Manifest V3');
  assert.equal(manifest.name, 'GiftPilot');
  assert.equal(typeof manifest.version, 'string');
  assert.equal(manifest.default_locale, 'en');
  assert.ok(Array.isArray(manifest.permissions));
  assert.ok(manifest.permissions.includes('storage'));
});

test('default locale resources exist', () => {
  assert.ok(
    fileExists('_locales/en/messages.json'),
    'Missing default locale messages file',
  );
  assert.ok(
    fileExists('_locales/pt_BR/messages.json'),
    'Missing pt_BR locale messages file',
  );
});

test('background service worker is reachable', () => {
  assert.ok(
    fileExists(manifest.background.service_worker),
    `Missing background service worker: ${manifest.background.service_worker}`,
  );
});

test('content script bundles exist', () => {
  manifest.content_scripts
    .flatMap((entry) => entry.js || [])
    .forEach((scriptPath) => {
      assert.ok(
        fileExists(scriptPath),
        `Missing content script: ${scriptPath}`,
      );
    });

  manifest.content_scripts
    .flatMap((entry) => entry.css || [])
    .forEach((stylePath) => {
      assert.ok(fileExists(stylePath), `Missing stylesheet: ${stylePath}`);
    });
});

test('icon assets are available', () => {
  Object.values(manifest.icons).forEach((iconPath) => {
    assert.ok(fileExists(iconPath), `Missing icon asset: ${iconPath}`);
  });
});

test('brand assets are available', () => {
  ['assets/brand/logo.svg', 'assets/brand/logo-small.svg'].forEach((file) =>
    assert.ok(fileExists(file), `Missing brand asset: ${file}`),
  );
  assert.ok(fileExists('assets/sounds/win.mp3'), 'Missing win sound');
});

test('no extension resource is web accessible', () => {
  // Web-accessible resources let any page probe for the extension.
  assert.equal(manifest.web_accessible_resources, undefined);
});

test('options page font awesome assets are packaged', () => {
  [
    'css/vendor/fontawesome/fontawesome.min.css',
    'css/vendor/fontawesome/webfonts/fa-solid-900.woff2',
    'css/vendor/fontawesome/webfonts/fa-regular-400.woff2',
  ].forEach((resourcePath) => {
    assert.ok(fileExists(resourcePath), `Missing ${resourcePath}`);
  });
});

test('site stylesheets injected on demand exist', () => {
  ['css/site/dark.css', 'css/site/pin.css', 'css/site/widgets.css'].forEach(
    (file) => assert.ok(fileExists(file), `Missing ${file}`),
  );
});

test('host permissions include SteamGifts domains', () => {
  const hostPermissions = manifest.host_permissions || [];
  const optionalHosts = manifest.optional_host_permissions || [];
  const contentMatches = manifest.content_scripts.flatMap(
    (entry) => entry.matches || [],
  );
  const combined = [...contentMatches, ...hostPermissions, ...optionalHosts];

  // Match patterns are `<scheme>://<host><path>`; assert on the host component
  // so `*://evil.com/?x=steamgifts.com` could never satisfy this test.
  const patternHost = (pattern) => pattern.split('://')[1]?.split('/')[0] ?? '';

  assert.ok(
    combined.some((pattern) => {
      const host = patternHost(pattern);
      return host === 'steamgifts.com' || host.endsWith('.steamgifts.com');
    }),
    'Expect SteamGifts host permissions in manifest',
  );
});

test('GitHub Pages ships the current logo', () => {
  assert.equal(
    fs.readFileSync(path.join(rootDir, 'docs/assets/logo.svg'), 'utf8'),
    fs.readFileSync(path.join(rootDir, 'assets/brand/logo.svg'), 'utf8'),
    'docs/assets/logo.svg must be a copy of assets/brand/logo.svg',
  );
});
