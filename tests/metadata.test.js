const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const rootDir = path.resolve(__dirname, '..');
const packageJson = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'),
);
const manifestJson = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'),
);
const readme = fs.readFileSync(path.join(rootDir, 'README.md'), 'utf8');

const fileExists = (relativePath) =>
  fs.existsSync(path.join(rootDir, relativePath));

test('package metadata stays aligned with the browser manifest', () => {
  assert.equal(packageJson.version, manifestJson.version);
  assert.equal(packageJson.name, 'giftpilot');
  assert.equal(manifestJson.name, 'GiftPilot');
  assert.equal(packageJson.description, manifestJson.description);
  assert.match(
    packageJson.repository.url,
    /bernardopg\/AutoJoin-for-SteamGifts/,
  );
  assert.equal(packageJson.homepage, manifestJson.homepage_url);
  assert.match(
    packageJson.homepage,
    /bernardopg\.github\.io\/AutoJoin-for-SteamGifts/,
  );
});

test('development workflow scripts exist and point to real files', () => {
  const expectedScripts = [
    'lint',
    'format',
    'check',
    'test',
    'metadata:check',
    'i18n:check',
    'verify',
    'build',
    'package',
    'release',
  ];

  expectedScripts.forEach((scriptName) => {
    assert.equal(
      typeof packageJson.scripts[scriptName],
      'string',
      `Missing npm script: ${scriptName}`,
    );
  });

  [
    'scripts/check-metadata.mjs',
    'scripts/check-i18n.mjs',
    'scripts/build-extension.mjs',
    'scripts/package-extension.mjs',
    'js/core/settings-actions.js',
  ].forEach((scriptPath) => {
    assert.ok(
      fileExists(scriptPath),
      `Missing workflow script file: ${scriptPath}`,
    );
  });

  assert.ok(
    fileExists('tests/fixtures/steamgifts/homepage.html'),
    'Missing SteamGifts HTML fixture at tests/fixtures/steamgifts/homepage.html',
  );
});

test('README stays aligned with metadata and workflow scripts', () => {
  const versionPattern = packageJson.version.replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&',
  );
  assert.match(readme, new RegExp(`version-${versionPattern}`));
  assert.match(readme, /npm run build/);
  assert.match(readme, /npm run package/);
  assert.match(readme, /npm run release/);
  assert.match(readme, /npm run verify/);
});
