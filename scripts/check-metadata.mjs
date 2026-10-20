import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const rootDir = process.cwd();
const readJson = (relativePath) =>
  JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), 'utf8'));
const readText = (relativePath) =>
  fs.readFileSync(path.join(rootDir, relativePath), 'utf8');

const packageJson = readJson('package.json');
const manifestJson = readJson('manifest.json');
const readme = readText('README.md');

const failures = [];

const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

expect(
  packageJson.version === manifestJson.version,
  `package.json version (${packageJson.version}) must match manifest.json version (${manifestJson.version})`,
);
expect(
  packageJson.description === manifestJson.description,
  'package.json description must stay aligned with manifest.json description',
);
expect(
  /bernardopg\/GiftPilot/.test(packageJson.repository?.url || ''),
  'package.json repository.url must point to bernardopg/GiftPilot',
);
expect(
  packageJson.homepage === manifestJson.homepage_url,
  'package.json homepage must match manifest.json homepage_url',
);
expect(
  readme.includes(`version-${manifestJson.version}-`),
  'README version badge must reference the current manifest version',
);
['build', 'package', 'release'].forEach((scriptName) => {
  expect(
    readme.includes(`npm run ${scriptName}`),
    `README must document npm run ${scriptName}`,
  );
});

if (failures.length > 0) {
  console.error('Metadata drift detected:\n');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  `Metadata OK: version ${manifestJson.version} and public repository references are aligned.`,
);
