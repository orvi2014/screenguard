import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

/**
 * Build #1 — the React extension pages (popup, settings, history, warning, onboarding).
 * The service worker and the content script are built separately (see
 * vite.worker.config.ts / vite.content.config.ts) because both must be emitted as
 * single self-contained files: MV3 content scripts cannot resolve ES module imports.
 */
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: { alias: { '@': root + 'src' } },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome110',
    sourcemap: false,
    // Chrome cannot use <link rel="modulepreload"> on extension pages — it
    // reports a "cross-world extension resource mismatch" and fetches the
    // module twice. The pages load from local disk anyway, so the hint buys
    // nothing; dropping it removes the wasted request and the console noise.
    modulePreload: false,
    rollupOptions: {
      input: {
        popup: root + 'popup.html',
        settings: root + 'settings.html',
        history: root + 'history.html',
        warning: root + 'warning.html',
        onboarding: root + 'onboarding.html',
      },
    },
  },
});
