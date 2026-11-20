import { describe, expect, it } from 'vitest'
import { campoFaltante, construirBloquePagos, migrarPagoMovil, nombreMetodo, opcionesDePago, resumenMetodo } from './metodosPago'
import type { MetodoPago } from './tipos'

const pagoMovil: MetodoPago = {
  id: 'm1', tipo: 'pagomovil', activo: true,
  datos: { banco: 'Banesco (0134)', telefono: '0412-1234567', documento: 'V-25.000.000', titular: "Pachon's Bakehouse" },
}
const zelle: MetodoPago = { id: 'm2', tipo: 'zelle', activo: true, datos: { contacto: 'pagos@pachons.com', titular: '' } }
const transferencia: MetodoPago = {
  id: 'm3', tipo: 'transferencia', activo: false,
  datos: { banco: 'CaixaBank', titular: 'Mila García', cuenta: 'ES91 2100 0418 4502 0005 1332', bic: '' },
}

describe('construirBloquePagos', () => {
  it('incluye solo los métodos activos, con sus datos', () => {
    expect(construirBloquePagos([pagoMovil, zelle, transferencia])).toBe(
      '💳 *Formas de pago:*\n\n' +
      '*Pago Móvil*\n• Banco: Banesco (0134)\n• Teléfono: 0412-1234567\n• Cédula o RIF: V-25.000.000\n• Titular: Pachon\'s Bakehouse\n\n' +
      '*Zelle*\n• pagos@pachons.com',
    )
  })

  it('queda vacío si no hay métodos activos', () => {
    expect(construirBloquePagos([transferencia])).toBe('')
    expect(construirBloquePagos([])).toBe('')
  })

  it('"Otro" usa su propio nombre y el texto libre sin viñeta', () => {
    const otro: MetodoPago = { id: 'm4', tipo: 'otro', activo: true, datos: { nombre: 'Efectivo al recoger', detalle: 'Paga al retirar tu pedido' } }
    expect(construirBloquePagos([otro])).toBe('💳 *Formas de pago:*\n\n*Efectivo al recoger*\nPaga al retirar tu pedido')
  })
})

describe('datos de cada método', () => {
  it('nombre y resumen para la lista', () => {
    expect(nombreMetodo(pagoMovil)).toBe('Pago Móvil')
    expect(resumenMetodo(pagoMovil)).toBe('Banesco (0134), 0412-1234567, V-25.000.000')
    expect(resumenMetodo(zelle)).toBe('pagos@pachons.com')
  })

  it('avisa el primer campo obligatorio vacío', () => {
    expect(campoFaltante('bizum', { telefono: '', titular: 'Mila' })?.etq).toBe('Teléfono')
    expect(campoFaltante('bizum', { telefono: '+34 600 123 456' })).toBeUndefined()
  })

  it('las opciones de "Cómo pagó" no se repiten y siempre incluyen efectivo', () => {
    expect(opcionesDePago([pagoMovil, zelle, { ...zelle, id: 'm5' }])).toEqual(['Pago Móvil', 'Zelle', 'Efectivo'])
    expect(opcionesDePago([])).toEqual(['Efectivo'])
  })
})

describe('migrarPagoMovil', () => {
  it('convierte la configuración vieja en un método de la lista', () => {
    expect(migrarPagoMovil({ banco: 'Otro', bancoOtro: 'Exterior (0115)', telefono: '0412-1', cedula: 'V-1', titular: 'X', incluirEnMensaje: false }, 'id1'))
      .toEqual([{ id: 'id1', tipo: 'pagomovil', datos: { banco: 'Exterior (0115)', telefono: '0412-1', documento: 'V-1', titular: 'X' }, activo: false }])
  })

  it('no crea nada si faltaban teléfono o cédula', () => {
    expect(migrarPagoMovil({ banco: 'Banesco (0134)', telefono: '', cedula: '' })).toEqual([])
    expect(migrarPagoMovil(null)).toEqual([])
  })
})
