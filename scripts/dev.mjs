/** Runs all three builds in watch mode, so `npm run dev` keeps dist/ current. */
import { spawn } from 'node:child_process';

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

spawn('node', ['scripts/generate-icons.mjs'], { stdio: 'inherit' }).on('exit', () => {
  const builds = [
    ['vite', 'build', '--watch'],
    ['vite', 'build', '--watch', '-c', 'vite.worker.config.ts'],
    ['vite', 'build', '--watch', '-c', 'vite.content.config.ts'],
  ];

  const children = builds.map((args) => spawn(npx, args, { stdio: 'inherit' }));

  const stop = () => {
    children.forEach((c) => c.kill('SIGTERM'));
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  console.log('\nWatching. Reload the extension in chrome://extensions after changes.\n');
});
