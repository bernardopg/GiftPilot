const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const rootDir = path.resolve(__dirname, '..');

// SteamGifts ships an anti-extension canary in its JS bundle. bundle-v18.js
// needed all three ids below; bundle-v19.js (2026-10) reports the account
// (ajax.php do=jh8Dn) when ANY of these is found on window load, and also on
// any click inside input#btnAutoJoin:
//   input#btnAutoJoin, #btnSettings with text "AutoJoin Settings",
//   #ajFooter, #navbarPin, #ajFooterArrow.
// The original v18 notes follow.
//
// SteamGifts ships an anti-extension canary in its JS bundle (bundle-v18.js):
// on window load it looks for elements whose ids match specific patterns
// historically injected by autojoin extensions and, when ALL of them are
// present, reports the account to the server (ajax.php?do=dbb8ff).
//
// The known patterns (base64-encoded in the bundle) are:
//   1. id starts with "ajFo", ends with "oter",      length 8  (was: ajFooter)
//   2. id starts with "navb", ends with "arPin",     length 9  (was: navbarPin)
//   3. id starts with "ajFo", ends with "oterArrow", length 13 (was: ajFooterArrow)
//
// This test scans every id the extension can inject (JS assignments,
// createElement configs, HTML attributes and CSS selectors) and fails if any
// of them matches a known canary pattern.
const CANARIES = [
  { name: 'btnAutoJoin', matches: (id) => id === 'btnAutoJoin' },
  { name: 'btnSettings', matches: (id) => id === 'btnSettings' },
  {
    name: 'ajFooter',
    matches: (id) =>
      id.startsWith('ajFo') && id.endsWith('oter') && id.length === 8,
  },
  {
    name: 'navbarPin',
    matches: (id) =>
      id.startsWith('navb') && id.endsWith('arPin') && id.length === 9,
  },
  {
    name: 'ajFooterArrow',
    matches: (id) =>
      id.startsWith('ajFo') && id.endsWith('oterArrow') && id.length === 13,
  },
];

const walk = (dir, exts, files = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, exts, files);
    } else if (exts.includes(path.extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
};

const collectIds = () => {
  const ids = new Map(); // id -> [sources]

  const add = (id, source) => {
    if (!ids.has(id)) ids.set(id, []);
    ids.get(id).push(source);
  };

  const jsFiles = [
    ...walk(path.join(rootDir, 'js'), ['.js']),
    ...walk(path.join(rootDir, 'html'), ['.html']),
  ];
  for (const file of jsFiles) {
    const source = fs.readFileSync(file, 'utf8');
    const rel = path.relative(rootDir, file);
    const patterns = [
      /\bid:\s*'([^']+)'/g,
      /\bid:\s*"([^"]+)"/g,
      /\.id\s*=\s*'([^']+)'/g,
      /\.id\s*=\s*"([^"]+)"/g,
      /getElementById\(\s*'([^']+)'/g,
      /getElementById\(\s*"([^"]+)"/g,
      /\bid="([^"]+)"/g,
    ];
    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) {
        add(match[1], rel);
      }
    }
  }

  for (const file of walk(path.join(rootDir, 'css'), ['.css'])) {
    const source = fs.readFileSync(file, 'utf8');
    const rel = path.relative(rootDir, file);
    for (const match of source.matchAll(/#([A-Za-z][\w-]*)/g)) {
      add(match[1], rel);
    }
  }

  return ids;
};

test('no injected element id matches a SteamGifts anti-extension canary', () => {
  const ids = collectIds();
  const offenders = [];
  for (const [id, sources] of ids) {
    for (const canary of CANARIES) {
      if (canary.matches(id)) {
        offenders.push(
          `${id} (matches "${canary.name}" canary) in ${sources.join(', ')}`,
        );
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `Ids matching SteamGifts canary patterns must be renamed:\n${offenders.join('\n')}`,
  );
});

test('legacy canary ids are gone from the codebase', () => {
  const ids = collectIds();
  for (const legacy of [
    'ajFooter',
    'ajFooterArrow',
    'ajFooterArrowWrap',
    'navbarPin',
  ]) {
    assert.ok(
      !ids.has(legacy),
      `Legacy canary id "${legacy}" still present in: ${(ids.get(legacy) || []).join(', ')}`,
    );
  }
});

// Identifiers historically used by this (and similar) extensions that make
// injected DOM state trivially attributable to "an autojoin script".
// Scans only what SteamGifts pages can actually observe: the content scripts
// and the CSS injected into steamgifts.com (options-page files are excluded).
const FINGERPRINT_TOKENS = [
  'btnSingle',
  'buttonsAJ',
  'AutoJoinButtonEnabled',
  'pointsFloating',
  'aj-hidden',
  'aj-modal-open',
  'aj-minimized',
  'aj-permanently-hidden',
  'aj-permission-banner',
  'aj-dismiss-modal',
  '__AJ_',
  'btnAutoJoin',
  'btnSettings',
  'suspensionNotice',
  'ajSuspensionNotice',
  'aj_suspension',
  'data-aj-',
  'ajSettings',
  'aj-fontawesome',
  'aj-perm-retry',
  'pageFooterDock',
  'navPinToggle',
  'navSettingsBtn',
];

const manifest = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'),
);

// Everything steamgifts.com can observe: content scripts, their CSS and the
// stylesheets the service worker injects on demand.
const CONTENT_SCRIPT_FILES = [
  ...new Set([
    ...manifest.content_scripts.flatMap((entry) => [
      ...(entry.js || []),
      ...(entry.css || []),
    ]),
    'css/site/dark.css',
    'css/site/pin.css',
  ]),
];

test('no extension fingerprint tokens in content scripts or injected CSS', () => {
  const offenders = [];
  for (const rel of CONTENT_SCRIPT_FILES) {
    const source = fs.readFileSync(path.join(rootDir, rel), 'utf8');
    for (const token of FINGERPRINT_TOKENS) {
      if (source.includes(token)) {
        offenders.push(`${rel}: contains "${token}"`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `Fingerprint tokens must not appear in injected code:\n${offenders.join('\n')}`,
  );
});

test('manifest requests declarativeNetRequest for header normalization', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'),
  );
  assert.ok(
    manifest.permissions.includes('declarativeNetRequest'),
    'declarativeNetRequest permission is required to normalize Origin/Referer ' +
      'headers on service-worker requests',
  );
});

test('background script installs session header rules', () => {
  const source = fs.readFileSync(
    path.join(rootDir, 'js/background/service-worker.js'),
    'utf8',
  );
  assert.ok(
    source.includes('declarativeNetRequest.updateSessionRules'),
    'backgroundpage.js must install declarativeNetRequest session rules',
  );
  assert.ok(
    source.includes('modifyHeaders'),
    'backgroundpage.js must rewrite Origin/Referer via modifyHeaders',
  );
});

test('page UI is rendered in a closed shadow root', () => {
  const source = fs.readFileSync(
    path.join(rootDir, 'js/content/panel.js'),
    'utf8',
  );
  assert.match(source, /attachShadow\(\{\s*mode:\s*'closed'\s*\}\)/);
  assert.doesNotMatch(source, /mode:\s*'open'/);
});

test('content scripts never write to the page localStorage or <html lang>', () => {
  const offenders = CONTENT_SCRIPT_FILES.filter((rel) => rel.endsWith('.js'))
    .map((rel) => [rel, fs.readFileSync(path.join(rootDir, rel), 'utf8')])
    .filter(([, source]) =>
      /localStorage\.setItem|sessionStorage\.setItem/.test(source),
    )
    .map(([rel]) => rel);
  assert.deepEqual(offenders, []);
});

test('entry requests follow the live bundle version', () => {
  const request = require('../js/core/sg-request');
  assert.equal(request.styleForVersion(18), 'formdata');
  assert.equal(request.styleForVersion(19), 'jquery');
  assert.deepEqual(
    Object.keys(request.orderEntry({ code: 'a', do: 'b', xsrf_token: 'c' })),
    ['xsrf_token', 'do', 'code'],
  );
  const init = request.buildFormDataInit({
    xsrf_token: 'x',
    do: 'entry_insert',
  });
  assert.ok(init.body instanceof FormData);
  assert.equal(init.headers, undefined);
});

test('ajax requests mimic the site jQuery calls', () => {
  const request = require('../js/core/sg-request');
  const init = request.buildPostInit({ do: 'entry_insert', code: 'abcde' });
  assert.equal(init.headers['X-Requested-With'], 'XMLHttpRequest');
  assert.match(
    init.headers['Content-Type'],
    /^application\/x-www-form-urlencoded/,
  );
  assert.equal(init.body, 'do=entry_insert&code=abcde');
});
