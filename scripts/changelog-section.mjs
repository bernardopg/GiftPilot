/*
  Prints the CHANGELOG.md section of a version (default: manifest version).
  Exits with an error when the section is missing or empty, so the release job
  never publishes a version without notes.

  Usage: node scripts/changelog-section.mjs [version]
*/
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const rootDir = process.cwd();
const version =
  process.argv[2] ||
  JSON.parse(fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'))
    .version;
const changelog = fs.readFileSync(path.join(rootDir, 'CHANGELOG.md'), 'utf8');

const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const heading = new RegExp(`^## \\[${escaped}\\][^\\n]*\\n`, 'm');
const start = changelog.search(heading);
if (start === -1) {
  console.error(`CHANGELOG.md has no "## [${version}]" section.`);
  process.exit(1);
}

const rest = changelog.slice(start).replace(heading, '');
const end = rest.search(/^## \[|^\[[^\]]+\]: /m);
const body = (end === -1 ? rest : rest.slice(0, end)).trim();
if (!body) {
  console.error(`CHANGELOG.md section for ${version} is empty.`);
  process.exit(1);
}

console.log(body);
