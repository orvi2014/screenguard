/**
 * Builds the Chrome Web Store upload: a zip of dist/ with nothing else in it.
 * Refuses to package if the build looks like a development one.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const DIST = resolve('dist');
const OUT_DIR = resolve('release');

if (!existsSync(resolve(DIST, 'manifest.json'))) {
  console.error('dist/ is missing — run `npm run build` first.');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(resolve(DIST, 'manifest.json'), 'utf8'));

const problems = [];
if (!/^\d+\.\d+(\.\d+)?(\.\d+)?$/.test(manifest.version)) {
  problems.push(`version "${manifest.version}" is not a valid store version`);
}
if (manifest.description.length > 132) {
  problems.push(`description is ${manifest.description.length} characters (store allows 132)`);
}
for (const size of ['16', '48', '128']) {
  if (!manifest.icons?.[size]) problems.push(`missing the ${size}px icon the store requires`);
}
if (manifest.key) problems.push('manifest contains a "key" field — remove it before uploading');

if (problems.length) {
  console.error('Cannot package:\n' + problems.map((p) => '  · ' + p).join('\n'));
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
const zipPath = resolve(OUT_DIR, `screenguard-${manifest.version}.zip`);
rmSync(zipPath, { force: true });

// -r recurse, -X strip macOS extended attributes, exclude Finder droppings.
execFileSync('zip', ['-r', '-X', '-q', zipPath, '.', '-x', '.DS_Store', '-x', '__MACOSX/*'], {
  cwd: DIST,
});

const bytes = readFileSync(zipPath).byteLength;
console.log(`✓ ${zipPath}`);
console.log(`  ${(bytes / 1024).toFixed(0)} KB · version ${manifest.version}`);
console.log(`  upload at https://chrome.google.com/webstore/devconsole`);
