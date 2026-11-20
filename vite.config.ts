import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// La app se publica en GitHub Pages bajo https://<usuario>.github.io/BakeHouse/
export default defineConfig({
  base: '/BakeHouse/',
  plugins: [react()],
})
