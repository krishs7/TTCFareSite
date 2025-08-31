import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      injectRegister: 'auto',
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'hero-toronto.svg', 'pwa-192.png', 'pwa-512.png'],
      manifest: {
        name: 'One-Fare Helper',
        short_name: 'One-Fare',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#0f172a',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      // 👇 switch to injectManifest so we can add our push handlers
      strategies: 'injectManifest',
      srcDir: '.',
      filename: 'sw.js',
      devOptions: { enabled: true, type: 'module' }
    })
  ],
  //server: { port: 5173, proxy: { '/api': 'http://localhost:4000' } },
  server: {
    port: 5173,
    host: true,                         // listen on all interfaces
    // allow your tunnel host; leading dot allows all subdomains
    allowedHosts: ['.ngrok-free.app'],  // or '.ngrok.io' if that’s your domain
    hmr: { clientPort: 443 },           // HMR over HTTPS tunnel
    proxy: { '/api': 'http://localhost:4000' }
  },
  build: { outDir: 'dist' },
  test: { environment: 'jsdom', setupFiles: './vitest.setup.js', globals: true }
});

