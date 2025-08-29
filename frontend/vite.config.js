import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(), // Tailwind v4 plugin
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'hero-toronto.svg', 'pwa-192.png', 'pwa-512.png'],
      manifest: {
        name: 'One-Fare Helper',
        short_name: 'One-Fare',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#111827',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: { globPatterns: ['**/*.{js,css,html,ico,png,svg}'] }
    })
  ],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:4000' }
  },
  build: { outDir: 'dist' },
  test: {
    environment: 'jsdom',
    setupFiles: './vitest.setup.js',
    globals: true
  }
});

