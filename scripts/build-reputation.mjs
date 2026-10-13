/**
 * Builds ScreenGuard's offline category database from reviewed, public domain
 * feeds. The output is exact (not a heuristic and not a Bloom filter), sorted,
 * and gzip-compressed for the extension package.
 *
 * Usage:
 *   node scripts/build-reputation.mjs --porn porn.txt --gambling gambling.txt
 *
 * Sources are deliberately passed as files. Downloading is a release operation,
 * never something an installed extension does, so browsing data cannot leave the
 * device through this feature.
 */
import { createGzip } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { dirname, resolve } from 'node:path';

const args = process.argv.slice(2);
const value = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const porn = value('--porn');
const gambling = value('--gambling');
if (!porn || !gambling || !existsSync(porn) || !existsSync(gambling)) {
  console.error('Usage: node scripts/build-reputation.mjs --porn porn.txt --gambling gambling.txt');
  process.exit(1);
}

function domainsFrom(file) {
  const result = new Set();
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const fields = trimmed.split(/\s+/);
    const candidate = (fields.length > 1 ? fields.at(-1) : fields[0]).toLowerCase().replace(/\.$/, '');
    if (/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(candidate)) {
      result.add(candidate);
    }
  }
  return result;
}

const categories = new Map();
for (const domain of domainsFrom(porn)) categories.set(domain, 'ADULT');
for (const domain of domainsFrom(gambling)) {
  // A domain present in both feeds remains adult; it is the more specific
  // category users see when deciding whether to proceed.
  if (!categories.has(domain)) categories.set(domain, 'GAMBLING');
}

const lines = [...categories]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([domain, category]) => `${domain}\t${category}\n`)
  .join('');
const out = resolve('public/reputation/categories.tsv.gz');
mkdirSync(dirname(out), { recursive: true });
await pipeline(createReadStream(await (() => {
  const raw = resolve('public/reputation/categories.tsv');
  writeFileSync(raw, lines);
  return raw;
})()), createGzip({ level: 9 }), createWriteStream(out));
const sha256 = createHash('sha256').update(readFileSync(out)).digest('hex');
writeFileSync(resolve('public/reputation/metadata.json'), JSON.stringify({
  format: 'screenguard-category-tsv-v1',
  generatedAt: new Date().toISOString(),
  domains: categories.size,
  sha256,
  sources: [
    'https://blocklistproject.github.io/Lists/porn.txt',
    'https://blocklistproject.github.io/Lists/gambling.txt',
  ],
  license: 'MIT',
}, null, 2) + '\n');
// The uncompressed intermediary is not an extension asset.
writeFileSync(resolve('public/reputation/categories.tsv'), '');
console.log(`✓ ${categories.size.toLocaleString()} exact category domains → ${out}`);
