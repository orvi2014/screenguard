import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

/** Build #3 — the content script as one self-contained IIFE (no ESM in content scripts). */
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
      entry: root + 'src/content/index.ts',
      formats: ['iife'],
      name: 'ScreenGuardContent',
      fileName: () => 'content.js',
    },
  },
});
