import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Lokale Entwicklung: /api wird an das Backend (Container-Port 3000, hier
// erwartet auf localhost:3000) weitergeleitet. Im Container übernimmt nginx
// dieselbe Proxy-Aufgabe (siehe nginx.conf) — die App ruft immer same-origin
// /api auf und weiß nie, in welcher Umgebung sie läuft (Vite-Falle vermeiden).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
