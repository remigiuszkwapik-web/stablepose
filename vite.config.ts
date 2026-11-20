import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// Relative Basis ('./'), damit dist/ von jedem Pfad aus statisch läuft (Cloudflare Pages, Unterordner, Datei-Server).
export default defineConfig({
  base: './',
  plugins: [basicSsl()],
  server: { host: true },
  preview: { host: true },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
});
