import { expect, test } from '@playwright/test'
import { abrirConDatos, fila, guardado, movimientosDe, plano } from './ayudantes.ts'

test.beforeEach(async ({ page }) => {
  await abrirConDatos(page)
})

test('carga los datos de la versión anterior y convierte el Pago Móvil viejo', async ({ page }) => {
  await expect(page.locator('.toldo__total')).toHaveText('$17,50')
  await expect(page.locator('.toldo__resumen')).toHaveText('2 clientes te deben, de 3. Llevas $5,50 cobrados.')
  // Ordenados por deuda: José ($11) y luego María ($6,50)
  await expect(page.locator('.fila__nombre')).toHaveText(['José Rodríguez', 'María Fernanda Pérez', 'Andreína Salas'])

  const metodos = await guardado<{ tipo: string }[]>(page, 'pachons_metodos_pago_v1')
  expect(metodos.map((m) => m.tipo)).toEqual(['pagomovil'])
})

test('venta con cantidades y "Ya me pagó" anota venta y pago de una vez', async ({ page }) => {
  await fila(page, 'José Rodríguez').getByRole('button', { name: 'Venta', exact: true }).click()
  const hoja = page.getByRole('dialog', { name: 'Nueva venta' })
  // Desde la fila, el cliente ya viene elegido en el desplegable
  await expect(hoja.getByLabel('Cliente')).toHaveValue('c2')

  const productos = hoja.locator('.chip')
  await productos.nth(0).click()
  await productos.nth(0).click()
  await productos.nth(2).click()
  await expect(hoja.getByLabel('Qué se llevó')).toHaveValue('2x Galleta Choco Chip 30g + 1x Brownie Fudge 7x7')
  await expect(hoja.getByLabel('Total en dólares')).toHaveValue('5.50')

  // Un toque de más se corrige con "−"
  await hoja.getByRole('button', { name: 'Quitar un Galleta Choco Chip 30g' }).click()
  await expect(hoja.getByLabel('Qué se llevó')).toHaveValue('1x Galleta Choco Chip 30g + 1x Brownie Fudge 7x7')
  await expect(hoja.getByLabel('Total en dólares')).toHaveValue('4.00')

  await hoja.getByText('Ya me pagó').click()
  await hoja.getByRole('button', { name: 'Anotar venta pagada' }).click()

  await expect(hoja).toBeHidden()
  await expect(page.locator('.toast').last()).toHaveText('Venta pagada anotada a José')
  const ultimos = (await movimientosDe(page, 'c2')).slice(-2)
  expect(ultimos.map((m) => [m.tipo, m.monto, m.descripcion])).toEqual([
    ['venta', 4, '1x Galleta Choco Chip 30g + 1x Brownie Fudge 7x7'],
    ['abono', 4, 'Pago (Pago Móvil)'],
  ])
  // El saldo de José no cambia porque la venta quedó pagada
  await expect(fila(page, 'José Rodríguez').locator('.fila__monto')).toHaveText('$11,00')
})

test('el pago viene prellenado con la deuda y deja al cliente al día', async ({ page }) => {
  await fila(page, 'María Fernanda Pérez').getByRole('button', { name: 'Pago', exact: true }).click()
  const hoja = page.getByRole('dialog', { name: 'Nuevo pago' })
  await expect(hoja.locator('.saldo')).toHaveText('Debe $6,50 (Bs. 650,00)')
  await expect(hoja.getByLabel('Monto en dólares')).toHaveValue('6.50')

  await hoja.getByRole('button', { name: 'Registrar pago' }).click()
  await expect(fila(page, 'María Fernanda Pérez').locator('.fila__aldia')).toHaveText('Al día')
  await expect(page.locator('.toast').last()).toHaveText('Pago de $6,50 registrado')
})

test('un pago sin deuda queda como saldo a favor', async ({ page }) => {
  await fila(page, 'Andreína Salas').getByRole('button', { name: 'Pago', exact: true }).click()
  const hoja = page.getByRole('dialog', { name: 'Nuevo pago' })
  await expect(hoja.locator('.saldo')).toHaveText('No debe nada')
  await hoja.getByLabel('Monto en dólares').fill('10')
  await hoja.getByRole('button', { name: 'Registrar pago' }).click()

  await expect(fila(page, 'Andreína Salas').locator('.fila__favor')).toHaveText('$10,00 a favor')
  await expect(page.locator('.toast').last()).toHaveText('Pago registrado. Andreína queda con $10,00 a favor')
  await expect(page.locator('.toldo__resumen')).toContainText('Guardas $10,00 a favor de 1 cliente.')
})

test('el pago en bolívares convierte el monto con la tasa BCV', async ({ page }) => {
  await fila(page, 'José Rodríguez').getByRole('button', { name: 'Pago', exact: true }).click()
  const hoja = page.getByRole('dialog', { name: 'Nuevo pago' })
  await hoja.getByRole('button', { name: 'Bs.' }).click()
  await expect(hoja.getByLabel('Monto en bolívares')).toHaveValue('1100.00')
  await hoja.getByRole('button', { name: 'Registrar pago' }).click()

  const ultimo = (await movimientosDe(page, 'c2')).at(-1)!
  expect(ultimo).toMatchObject({ tipo: 'abono', monto: 11, descripcion: 'Pago (Pago Móvil - Bs. 1.100,00)' })
})

test('borrar un movimiento se puede deshacer', async ({ page }) => {
  const maria = fila(page, 'María Fernanda Pérez')
  await maria.getByRole('button', { name: /Historial/ }).click()
  await expect(maria.locator('.mov__desc').first()).toHaveText('Pago (Pago Móvil - Bs. 490,00)')

  await maria.getByRole('button', { name: 'Eliminar movimiento' }).first().click()
  expect(await movimientosDe(page, 'c1')).toHaveLength(2)
  await page.getByRole('button', { name: 'Deshacer' }).click()
  expect(await movimientosDe(page, 'c1')).toHaveLength(3)
})

test('un cliente nuevo guarda el teléfono con el código del país', async ({ page }) => {
  await page.getByRole('button', { name: 'Cliente', exact: true }).click()
  const hoja = page.getByRole('dialog', { name: 'Nuevo cliente' })
  await hoja.getByLabel('Nombre').fill('Luis Gómez')
  await hoja.getByLabel('WhatsApp').fill('0416 555 4433')
  await hoja.getByLabel(/Lo que ya debe/).fill('2.5')
  await hoja.getByRole('button', { name: 'Guardar cliente' }).click()

  const luis = fila(page, 'Luis Gómez')
  await expect(luis.locator('.fila__meta')).toContainText('+58 416 555 4433')
  await expect(luis.locator('.fila__monto')).toHaveText('$2,50')
})

test('el cobro por WhatsApp lleva el saldo, los bolívares y los datos de pago', async ({ page }) => {
  const enlace = fila(page, 'José Rodríguez').getByRole('link', { name: /Cobrar \$11,00 por WhatsApp/ })
  const href = (await enlace.getAttribute('href'))!
  expect(href.startsWith('https://api.whatsapp.com/send?phone=584149876543&text=')).toBe(true)
  const mensaje = plano(new URL(href).searchParams.get('text'))
  // Los emojis llegan intactos (wa.me los cambiaba por "�")
  expect(mensaje).toContain('¡Hola José! 👋 Te escribo de *Pachon\'s Bakehouse* 🍪✨')
  expect(mensaje).toContain('tu saldo pendiente actual es de *$11,00* (*Bs. 1.100,00* a tasa BCV Bs. 100,00)')
  expect(mensaje).toContain('*Pago Móvil*\n• Banco: Banesco (0134)')
})

test('Escape cierra la hoja abierta', async ({ page }) => {
  await fila(page, 'María Fernanda Pérez').getByRole('button', { name: 'Venta', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Nueva venta' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
})

test('los cambios siguen ahí después de recargar', async ({ page }) => {
  await fila(page, 'María Fernanda Pérez').getByRole('button', { name: 'Pago', exact: true }).click()
  await page.getByRole('button', { name: 'Registrar pago' }).click()
  await expect(fila(page, 'María Fernanda Pérez').locator('.fila__aldia')).toBeVisible()
  await page.reload()
  await expect(fila(page, 'María Fernanda Pérez').locator('.fila__aldia')).toHaveText('Al día')
})

test('"Nueva venta" arriba: elige el cliente en el desplegable sin buscar su fila', async ({ page }) => {
  await page.getByRole('button', { name: 'Nueva venta' }).click()
  const hoja = page.getByRole('dialog', { name: 'Nueva venta' })

  // Ningún cliente elegido de antemano en el desplegable
  const selector = hoja.getByLabel('Cliente')
  await expect(selector).toHaveValue('')
  await expect(selector.locator('option')).toHaveText(['Elige un cliente…', 'Andreína Salas', 'José Rodríguez', 'María Fernanda Pérez'])

  await selector.selectOption('c3')
  await hoja.getByRole('button', { name: /^Brownie Fudge/ }).click()
  await hoja.getByRole('button', { name: 'Anotar venta' }).click()

  await expect(page.locator('.toast').last()).toHaveText('Venta anotada a Andreína')
  expect((await movimientosDe(page, 'c3')).at(-1)).toMatchObject({ tipo: 'venta', monto: 2.5 })
})

test('desde "Nueva venta" se puede agregar un cliente nuevo y luego editar su teléfono', async ({ page }) => {
  await page.getByRole('button', { name: 'Nueva venta' }).click()
  const hoja = page.getByRole('dialog', { name: 'Nueva venta' })

  await hoja.getByRole('button', { name: 'Cliente nuevo' }).click()
  await hoja.getByLabel('Cliente').fill('Marta')
  await hoja.getByLabel('Qué se llevó').fill('1 torta de chocolate')
  await hoja.getByLabel('Total en dólares').fill('20')
  await hoja.getByRole('button', { name: 'Anotar venta' }).click()

  await expect(page.locator('.toast').last()).toHaveText('Venta anotada a Marta, cliente nuevo')
  const marta = fila(page, 'Marta')
  await expect(marta.locator('.fila__monto')).toHaveText('$20,00')
  await expect(page.locator('.toldo__total')).toHaveText('$37,50')

  // Al editar luego al cliente nuevo, el campo de WhatsApp arranca vacío (sin "+")
  await marta.getByRole('button', { name: /Historial/ }).click()
  await marta.getByRole('button', { name: 'Editar' }).click()
  const editar = page.getByRole('dialog', { name: 'Editar cliente' })
  await expect(editar.getByLabel('WhatsApp')).toHaveValue('')
  await editar.getByLabel('WhatsApp').fill('04125550000')
  await editar.getByRole('button', { name: 'Guardar cliente' }).click()

  await expect(marta.locator('.fila__meta')).toContainText('+58 412 555 0000')
})
