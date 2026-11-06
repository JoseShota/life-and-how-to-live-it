import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Precache fonts and art too (the default is js/css/html only), so the installed app looks right offline.
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}'] },
      manifest: {
        name: 'Life and How to Live It',
        short_name: 'Life',
        description: 'A personal operating system: quests, routine, focus and money, as a game.',
        // Thermae haze: also the Android splash-screen background.
        theme_color: '#e4ebe7',
        background_color: '#e4ebe7',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        icons: [
          // Chrome on Android needs 192 + 512 PNGs to offer "Install app". The art stays inside the
          // central 80 % safe zone, so the same 512 PNG doubles as the maskable icon.
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
        ]
      }
    })
  ],
  test: { environment: 'node', include: ['tests/**/*.test.ts'] }
});
