import { expect, test, type Page } from '@playwright/test'
import { abrirConDatos, fila } from './ayudantes.ts'

test.beforeEach(async ({ page }) => {
  await abrirConDatos(page)
})

async function ir(page: Page, seccion: 'Cuentas' | 'Inventario') {
  await page.getByRole('navigation', { name: 'Secciones' }).getByRole('button', { name: seccion }).click()
}

test('inventario diario: carga unidades, descuenta al vender sin bloquear y repite de otro día', async ({ page }) => {
  await ir(page, 'Inventario')
  await page.getByLabel('Cantidad de Galleta Choco Chip 30g').fill('5')
  await page.getByLabel('Cantidad de Brownie Fudge 7x7').fill('2')

  const resumen = page.getByLabel('Resumen del día')
  await expect(resumen.locator('strong')).toHaveText(['7', '0', '7'])

  // En "Nueva venta", los chips muestran lo que queda y avisan si se agota sin bloquear
  await ir(page, 'Cuentas')
  await page.getByRole('button', { name: 'Nueva venta' }).click()
  const hoja = page.getByRole('dialog', { name: 'Nueva venta' })

  const chipGalleta = hoja.getByRole('button', { name: /^Galleta Choco Chip 30g/ })
  const chipBrownie = hoja.getByRole('button', { name: /^Brownie Fudge 7x7/ })
  await expect(chipGalleta).toContainText('Quedan 5')
  await expect(chipBrownie).toContainText('Quedan 2')

  await chipBrownie.click()
  await expect(chipBrownie).toContainText('Quedan 1')
  await chipBrownie.click()
  await expect(chipBrownie).toContainText('Agotado')

  // No bloquea si se agrega uno de más; luego se puede corregir con "−"
  await chipBrownie.click()
  await expect(chipBrownie.locator('.chip__cant')).toHaveText('3')
  await hoja.getByRole('button', { name: 'Quitar un Brownie Fudge 7x7' }).click()
  await expect(chipBrownie.locator('.chip__cant')).toHaveText('2')

  await hoja.getByLabel('Cliente').selectOption('c3')
  await hoja.getByRole('button', { name: 'Anotar venta' }).click()
  await expect(hoja).toBeHidden()

  // El descuento aparece en Inventario y persiste tras recargar
  await ir(page, 'Inventario')
  const filaBrownie = page.locator('.inv-fila').filter({ hasText: 'Brownie Fudge 7x7' })
  await expect(filaBrownie).toContainText('Vendidas: 2')
  await expect(filaBrownie).toContainText('Agotado')
  await expect(resumen.locator('strong')).toHaveText(['7', '2', '5'])

  await page.reload()
  await ir(page, 'Inventario')
  await expect(page.getByLabel('Cantidad de Brownie Fudge 7x7')).toHaveValue('2')
  await expect(page.locator('.inv-fila').filter({ hasText: 'Brownie Fudge 7x7' })).toContainText('Agotado')

  // Si se elimina la venta, vuelve el stock disponible
  await ir(page, 'Cuentas')
  const andreina = fila(page, 'Andreína Salas')
  await andreina.getByRole('button', { name: /Historial/ }).click()
  await andreina.getByRole('button', { name: 'Eliminar movimiento' }).first().click()

  await ir(page, 'Inventario')
  await expect(page.locator('.inv-fila').filter({ hasText: 'Brownie Fudge 7x7' })).toContainText('Quedan 2')

  // En el día siguiente se puede copiar el último inventario y limpiar con Deshacer
  await page.getByRole('button', { name: 'Día siguiente' }).click()
  await page.getByRole('button', { name: /^Repetir del/ }).click()
  await expect(page.getByLabel('Cantidad de Galleta Choco Chip 30g')).toHaveValue('5')

  await page.getByRole('button', { name: 'Limpiar día' }).click()
  await expect(page.getByLabel('Cantidad de Galleta Choco Chip 30g')).toHaveValue('')
  await page.locator('.toast', { hasText: 'Inventario del día borrado' }).getByRole('button', { name: 'Deshacer' }).click()
  await expect(page.getByLabel('Cantidad de Galleta Choco Chip 30g')).toHaveValue('5')
})
