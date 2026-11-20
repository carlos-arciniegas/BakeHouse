import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// La app se publica en GitHub Pages bajo https://<usuario>.github.io/BakeHouse/
export default defineConfig({
  base: '/BakeHouse/',
  plugins: [react()],
  test: {
    // Las pruebas de punta a punta (e2e/) son de Playwright, no de Vitest
    include: ['src/**/*.test.ts'],
  },
})
