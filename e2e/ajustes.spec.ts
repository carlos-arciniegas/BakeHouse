import { expect, test, type Page } from '@playwright/test'
import { abrirConDatos, guardado, plano } from './ayudantes.ts'

test.beforeEach(async ({ page }) => {
  await abrirConDatos(page)
})

/** En el móvil la sección se llama "Pagos"; en escritorio, "Métodos de pago" */
async function ir(page: Page, seccion: 'Catálogo' | 'Pagos' | 'Ajustes' | 'Cuentas') {
  const nombre = seccion === 'Pagos' ? /^(Pagos|Métodos de pago)$/ : seccion
  await page.getByRole('navigation', { name: 'Secciones' }).getByRole('button', { name: nombre }).click()
}

test('catálogo: agregar un producto y deshacer su borrado', async ({ page }) => {
  await ir(page, 'Catálogo')
  await page.getByLabel('Nombre').fill('Brookie')
  await page.getByLabel('Precio en dólares').fill('2.5')
  await page.getByRole('button', { name: 'Agregar al catálogo' }).click()
  await expect(page.locator('.prod__nombre').last()).toHaveText('Brookie')
  expect(await guardado<unknown[]>(page, 'pachons_catalog_v3')).toHaveLength(7)

  await page.getByRole('button', { name: 'Eliminar Brookie' }).click()
  await expect(page.locator('.prod__nombre').filter({ hasText: 'Brookie' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Deshacer' }).click()
  await expect(page.locator('.prod__nombre').last()).toHaveText('Brookie')
})

test('métodos de pago: agregar Bizum lo suma al mensaje de WhatsApp', async ({ page }) => {
  await ir(page, 'Pagos')
  await expect(page.locator('.metodo__nombre')).toHaveText(['Pago Móvil'])

  await page.getByRole('button', { name: 'Agregar' }).click()
  const hoja = page.getByRole('dialog', { name: 'Nuevo método' })
  await hoja.getByLabel('Tipo').selectOption('bizum')
  await hoja.getByLabel('Teléfono').fill('+34 611 22 33 44')
  await hoja.getByRole('button', { name: 'Guardar método' }).click()

  await expect(page.locator('.metodo__nombre')).toHaveText(['Pago Móvil', 'Bizum'])
  await expect(page.locator('.burbuja')).toContainText('*Bizum*\n• Teléfono: +34 611 22 33 44')
})

test('métodos de pago: un método apagado no sale en el mensaje', async ({ page }) => {
  await ir(page, 'Pagos')
  await page.locator('.metodo .interruptor').first().click()
  await expect(page.locator('.burbuja')).toHaveText('Activa al menos un método para que aparezca aquí.')
})

test('cambiar de Venezuela a España pide confirmación, pasa a euros y oculta el BCV', async ({ page }) => {
  await ir(page, 'Ajustes')
  await page.getByLabel('Nombre del negocio').fill('Dulce Mila')
  await page.getByLabel('País').selectOption('ES')
  await expect(page.locator('.form--ajustes .ayuda')).toHaveText('Moneda: euros (12,50 €). Teléfonos con +34.')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()

  const confirmacion = page.getByRole('alertdialog', { name: '¿Cambiar la moneda a euros?' })
  await expect(confirmacion).toBeVisible()
  await confirmacion.getByRole('button', { name: 'Sí, cambiar' }).click()

  await ir(page, 'Cuentas')
  await expect(page).toHaveTitle('Dulce Mila')
  expect(plano(await page.locator('.toldo__total').textContent())).toBe('17,50 €')
  await expect(page.locator('.tasa')).toBeHidden()
  expect(await guardado(page, 'pachons_negocio_v1')).toEqual({ nombre: 'Dulce Mila', pais: 'ES' })
})

test('borrar todos los datos pide confirmación', async ({ page }) => {
  await ir(page, 'Ajustes')
  await page.getByRole('button', { name: 'Borrar todos los datos' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Sí, continuar' }).click()
  await ir(page, 'Cuentas')
  await expect(page.getByRole('heading', { name: 'Tu libreta está en blanco' })).toBeVisible()
})
