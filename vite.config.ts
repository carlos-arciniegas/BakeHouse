import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

// La app se publica en GitHub Pages bajo https://<usuario>.github.io/BakeHouse/
export default defineConfig({
  base: '/BakeHouse/',
  plugins: [
    react(),
    VitePWA({
      // La app avisa cuando hay versión nueva y el usuario decide cuándo actualizar
      registerType: 'prompt',
      pwaAssets: { config: true, overrideManifestIcons: true },
      manifest: {
        name: 'BakeHouse: cuentas y cobros',
        short_name: 'BakeHouse',
        description: 'Control de ventas, fiados y cobros por WhatsApp para negocios de repostería',
        lang: 'es',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        background_color: '#FFFFFF',
        theme_color: '#2B4FA8',
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        runtimeCaching: [
          {
            // Hoja de estilos de Google Fonts: se actualiza en segundo plano
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'fuentes-css' },
          },
          {
            // Archivos de las fuentes: no cambian, se guardan un año
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'fuentes',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  test: {
    // Las pruebas de punta a punta (e2e/) son de Playwright, no de Vitest
    include: ['src/**/*.test.ts'],
  },
})
