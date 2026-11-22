import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: 'script-defer',
      includeAssets: ['favicon.svg', 'pwa-icon.svg'],
      manifest: {
        name: '目標設定と振り返りが記録できるポモドーロタイマー',
        short_name: '目標・振り返りポモドーロ',
        description: '目標、学習時間、振り返りを記録するポモドーロタイマー',
        lang: 'ja',
        theme_color: '#d8f4fc',
        background_color: '#d8f4fc',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/pwa-64x64.png',
            sizes: '64x64',
            type: 'image/png',
          },
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,mp3}'],
        maximumFileSizeToCacheInBytes: 18 * 1024 * 1024,
        navigateFallbackDenylist: [
          /^\/api(?:\/|$)/,
          /^\/admin(?:\/|$)/,
          /^\/static(?:\/|$)/,
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
  preview: {
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
