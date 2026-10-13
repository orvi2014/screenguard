/** Bundles the TypeScript test suite with esbuild and runs it on Node. */
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = join(mkdtempSync(join(tmpdir(), 'screenguard-test-')), 'tests.mjs');

await build({
  entryPoints: ['test/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out,
  logLevel: 'error',
});

const res = spawnSync(process.execPath, [out], { stdio: 'inherit' });
process.exit(res.status ?? 1);
