import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // Relative base: the game deploys to GitHub Pages under /<repo>/ as well
  // as any root domain — every asset URL must survive both.
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@engine': fileURLToPath(new URL('./src/engine', import.meta.url)),
      '@render': fileURLToPath(new URL('./src/render', import.meta.url)),
      '@app': fileURLToPath(new URL('./src/app', import.meta.url)),
      '@state': fileURLToPath(new URL('./src/state', import.meta.url)),
    },
  },
  server: { host: true },
});
