import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      electron({
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            minify: false,
          },
        },
        onstart(options) {
          const isDesktopEnv =
            process.platform === 'win32' ||
            process.platform === 'darwin' ||
            Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);

          if (!isDesktopEnv || process.env.NO_ELECTRON === 'true') {
            console.log('[PromptShield] Headless cloud container detected (no desktop DISPLAY).');
            console.log('[PromptShield] Electron main bundle compiled to dist-electron/main.js.');
            console.log('[PromptShield] Vite dev server ready on port 3000.');
            return;
          }

          options.startup().catch((err) => {
            console.error('[PromptShield] Error starting Electron main process:', err);
          });
        },
      }),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('.', import.meta.url)),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      allowedHosts: true as const,
      cors: true,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
