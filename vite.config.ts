import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Ascenso — Life RPG',
        short_name: 'Ascenso',
        description: 'Your life as a game: quests, routine, focus and money.',
        theme_color: '#0b0f1a',
        background_color: '#0b0f1a',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }
        ]
      }
    })
  ],
  test: { environment: 'node', include: ['tests/**/*.test.ts'] }
} as any);
