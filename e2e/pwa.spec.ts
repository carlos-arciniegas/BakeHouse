import { expect, test } from '@playwright/test'
import { abrirConDatos, fila } from './ayudantes.ts'

test('es instalable: tiene manifest con íconos y un service worker activo', async ({ page }) => {
  await abrirConDatos(page)

  const manifest = await page.evaluate(async (): Promise<{ short_name: string; icons: { sizes: string }[] }> => {
    const enlace = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!
    return (await fetch(enlace.href)).json()
  })
  expect(manifest).toMatchObject({ short_name: 'BakeHouse', display: 'standalone', lang: 'es' })
  expect(manifest.icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']))

  const estado = await page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state)
  expect(estado).toBe('activated')
})

test('funciona sin conexión con los datos guardados', async ({ page, context }) => {
  await abrirConDatos(page)
  await page.evaluate(() => navigator.serviceWorker.ready)
  // La primera visita instala el service worker; desde la siguiente es él quien sirve la app
  await page.reload()
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)

  await context.setOffline(true)
  await page.reload()

  await expect(page.getByText('Te deben', { exact: true })).toBeVisible()
  await expect(fila(page, 'José Rodríguez').locator('.fila__monto')).toHaveText('$11,00')

  // Sin red se puede seguir anotando: el pago se guarda en el teléfono
  await fila(page, 'José Rodríguez').getByRole('button', { name: 'Pago', exact: true }).click()
  await page.getByRole('button', { name: 'Registrar pago' }).click()
  await expect(fila(page, 'José Rodríguez').locator('.fila__aldia')).toHaveText('Al día')
})
