import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

/** Build #2 — the MV3 background service worker as one self-contained file. */
export default defineConfig({
  resolve: { alias: { '@': root + 'src' } },
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    copyPublicDir: false,
    target: 'chrome110',
    minify: false,
    lib: {
      entry: root + 'src/background/service-worker.ts',
      formats: ['iife'],
      name: 'ScreenGuardWorker',
      fileName: () => 'service-worker.js',
    },
  },
});
