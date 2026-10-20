import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const rootDir = process.cwd();
const buildDir = path.join(rootDir, 'build', 'extension');
const includePaths = [
  '_locales',
  'assets/brand',
  'assets/icons',
  'assets/sounds',
  'css',
  'html',
  'js',
  'manifest.json',
  'LICENSE',
  'README.md',
];

fs.rmSync(buildDir, { recursive: true, force: true });
fs.mkdirSync(buildDir, { recursive: true });

// Generator inputs that never ship in the extension package.
const isSourceOnly = (filePath) => filePath.endsWith('.overrides.css');

const copyRecursive = (sourcePath, destinationPath) => {
  if (isSourceOnly(sourcePath)) return;
  const stat = fs.statSync(sourcePath);

  if (stat.isDirectory()) {
    fs.mkdirSync(destinationPath, { recursive: true });
    for (const entry of fs.readdirSync(sourcePath)) {
      copyRecursive(
        path.join(sourcePath, entry),
        path.join(destinationPath, entry),
      );
    }
    return;
  }

  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.copyFileSync(sourcePath, destinationPath);
};

for (const relativePath of includePaths) {
  copyRecursive(
    path.join(rootDir, relativePath),
    path.join(buildDir, relativePath),
  );
}

const manifest = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'),
);
const metadataPath = path.join(buildDir, 'build-metadata.json');
fs.writeFileSync(
  metadataPath,
  JSON.stringify(
    {
      version: manifest.version,
      generatedAt: new Date().toISOString(),
      source: 'npm run build',
      includedPaths: includePaths,
    },
    null,
    2,
  ) + '\n',
);

console.log(
  `Build ready at ${path.relative(rootDir, buildDir)} (version ${manifest.version}).`,
);
