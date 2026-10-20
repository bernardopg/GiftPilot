import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const rootDir = process.cwd();
const buildDir = path.join(rootDir, 'build', 'extension');
const distDir = path.join(rootDir, 'dist');
const manifest = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'),
);

if (!fs.existsSync(buildDir)) {
  console.error('Build output not found. Run npm run build first.');
  process.exit(1);
}

fs.mkdirSync(distDir, { recursive: true });
const archiveName = `giftpilot-v${manifest.version}.zip`;
const archivePath = path.join(distDir, archiveName);
fs.rmSync(archivePath, { force: true });

const zipCheck = spawnSync('zip', ['-v'], { encoding: 'utf8' });
if (zipCheck.error) {
  console.error('The zip command is required to package the extension.');
  process.exit(1);
}

const result = spawnSync('zip', ['-qr', archivePath, '.'], {
  cwd: buildDir,
  encoding: 'utf8',
});

if (result.status !== 0) {
  console.error(
    result.stderr || result.stdout || 'Failed to create extension archive.',
  );
  process.exit(result.status || 1);
}

console.log(`Package ready at ${path.relative(rootDir, archivePath)}.`);
