import { defineConfig, devices } from '@playwright/test'

const PUERTO = 4173

// Las pruebas corren contra la app compilada (igual que en producción), en móvil y en escritorio
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PUERTO}/BakeHouse/`,
    locale: 'es-VE',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'movil', use: { ...devices['Pixel 7'] } },
    { name: 'escritorio', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PUERTO} --strictPort`,
    url: `http://localhost:${PUERTO}/BakeHouse/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
