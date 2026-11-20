import { expect, type Page } from '@playwright/test'

/** Datos con el formato que guardaba la versión anterior, incluido el Pago Móvil viejo (sin métodos de pago) */
export const DATOS_VENEZUELA = {
  pachons_bakehouse_data_v3: {
    clientes: [
      {
        id: 'c1', nombre: 'María Fernanda Pérez', telefono: '584121234567', nota: 'Oficina piso 3',
        movimientos: [
          { id: 'm1', tipo: 'venta', descripcion: '2x Galleta Choco Chip 30g + 1x Brownie Fudge 7x7', monto: 5.5, fecha: '2026-11-12' },
          { id: 'm2', tipo: 'venta', descripcion: '1x Brownie Bites (x4)', monto: 3, fecha: '2026-11-15' },
          { id: 'm3', tipo: 'abono', descripcion: 'Abono (Pago Móvil - Bs. 490,00)', monto: 2, fecha: '2026-11-18' },
        ],
      },
      {
        id: 'c2', nombre: 'José Rodríguez', telefono: '584149876543', nota: '',
        movimientos: [
          { id: 'm4', tipo: 'venta', descripcion: '6x Galleta Doble Chocolate 30g', monto: 9, fecha: '2026-11-10' },
          { id: 'm5', tipo: 'venta', descripcion: '1x Porción Ponqué', monto: 2, fecha: '2026-11-17' },
        ],
      },
      {
        id: 'c3', nombre: 'Andreína Salas', telefono: '584241112233', nota: 'Vecina 4B',
        movimientos: [
          { id: 'm6', tipo: 'venta', descripcion: '1x Helado', monto: 3.5, fecha: '2026-11-08' },
          { id: 'm7', tipo: 'abono', descripcion: 'Abono (Efectivo $)', monto: 3.5, fecha: '2026-11-09' },
        ],
      },
    ],
  },
  pachons_bcv_config_v3: { tasa: 100, actualizado: 'BCV 9:30' },
  pachons_pagomovil_v3: { banco: 'Banesco (0134)', telefono: '0412-1234567', cedula: 'V-25.000.000', titular: "Pachon's Bakehouse", incluirEnMensaje: true },
}

/**
 * Abre la app con datos de prueba. La tasa BCV se simula en 100 Bs/$ para que
 * los montos en bolívares no dependan de la red ni del día.
 */
export async function abrirConDatos(page: Page, datos: Record<string, unknown> = DATOS_VENEZUELA) {
  await page.route(/dolarapi\.com|pydolarve\.org/, (ruta) => ruta.fulfill({ json: { promedio: 100 } }))
  await page.goto('./')
  await page.evaluate((d) => {
    localStorage.clear()
    for (const [clave, valor] of Object.entries(d)) localStorage.setItem(clave, JSON.stringify(valor))
  }, datos)
  await page.reload()
  await expect(page.getByText('Te deben', { exact: true })).toBeVisible()
}

/** La fila de un cliente en la lista de Cuentas */
export function fila(page: Page, nombre: string) {
  return page.locator('article.fila').filter({ has: page.getByRole('heading', { name: nombre, exact: true }) })
}

/** Lo que el navegador tiene guardado en localStorage */
export async function guardado<T>(page: Page, clave: string): Promise<T> {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), clave)
}

export async function movimientosDe(page: Page, clienteId: string): Promise<{ tipo: string; monto: number; descripcion: string }[]> {
  const datos = await guardado<{ clientes: { id: string; movimientos: [] }[] }>(page, 'pachons_bakehouse_data_v3')
  return datos.clientes.find((c) => c.id === clienteId)!.movimientos
}

/** Los avisos usan espacios no separables en los montos; se comparan como espacios normales */
export const plano = (s: string | null) => (s ?? '').replace(/[  ]/g, ' ')
