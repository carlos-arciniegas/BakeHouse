import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// Íconos de la app (192, 512, maskable, Apple) generados en cada build a partir del favicon
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: minimal2023Preset,
  images: ['public/favicon.svg'],
})
