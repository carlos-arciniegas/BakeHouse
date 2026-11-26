import { describe, expect, it } from 'vitest'
import { extraerPagos, filtrarPagos, metodosEnHistorial, parsearMetodoPago, rangoFechas } from './historialPagos'
import type { Cliente } from './tipos'

const clientes: Cliente[] = [
  {
    id: 'c1',
    nombre: 'María Fernanda Pérez',
    telefono: '584121234567',
    nota: '',
    movimientos: [
      { id: 'm1', tipo: 'venta', descripcion: '2x Galleta', monto: 5.5, fecha: '2026-11-12' },
      { id: 'm2', tipo: 'abono', descripcion: 'Abono (Pago Móvil - Bs. 490,00)', monto: 2, fecha: '2026-11-18' },
      { id: 'm3', tipo: 'abono', descripcion: 'Pago (Zelle)', monto: 3.5, fecha: '2026-11-26' },
    ],
  },
  {
    id: 'c2',
    nombre: 'Andreína Salas',
    telefono: '584241112233',
    nota: '',
    movimientos: [
      { id: 'm4', tipo: 'abono', descripcion: 'Abono (Efectivo $)', monto: 3.5, fecha: '2026-11-09' },
    ],
  },
]

describe('parsearMetodoPago', () => {
  it('separa el método y los bolívares históricos en pagos y abonos viejos', () => {
    expect(parsearMetodoPago('Pago (Pago Móvil)')).toEqual({ metodo: 'Pago Móvil', detalleBs: '' })
    expect(parsearMetodoPago('Pago (Pago Móvil - Bs. 1.100,00)')).toEqual({ metodo: 'Pago Móvil', detalleBs: 'Bs. 1.100,00' })
    expect(parsearMetodoPago('Abono (Pago Móvil - Bs. 490,00)')).toEqual({ metodo: 'Pago Móvil', detalleBs: 'Bs. 490,00' })
    expect(parsearMetodoPago('Abono (Efectivo $)')).toEqual({ metodo: 'Efectivo $', detalleBs: '' })
    expect(parsearMetodoPago('Transferencia directa')).toEqual({ metodo: 'Transferencia directa', detalleBs: '' })
    expect(parsearMetodoPago('')).toEqual({ metodo: 'Sin especificar', detalleBs: '' })
  })
})

describe('extraerPagos y metodosEnHistorial', () => {
  it('ignora ventas, extrae datos y ordena del más reciente al más antiguo', () => {
    const pagos = extraerPagos(clientes)
    expect(pagos).toEqual([
      { id: 'm3', clienteId: 'c1', clienteNombre: 'María Fernanda Pérez', fecha: '2026-11-26', monto: 3.5, metodo: 'Zelle', detalleBs: '' },
      { id: 'm2', clienteId: 'c1', clienteNombre: 'María Fernanda Pérez', fecha: '2026-11-18', monto: 2, metodo: 'Pago Móvil', detalleBs: 'Bs. 490,00' },
      { id: 'm4', clienteId: 'c2', clienteNombre: 'Andreína Salas', fecha: '2026-11-09', monto: 3.5, metodo: 'Efectivo $', detalleBs: '' },
    ])
    expect(metodosEnHistorial(pagos)).toEqual(['Efectivo $', 'Pago Móvil', 'Zelle'])
  })
})

describe('filtrarPagos', () => {
  const pagos = extraerPagos(clientes)

  it('calcula total y desglose por método sin filtros', () => {
    const r = filtrarPagos(pagos, '', '')
    expect(r.pagos).toHaveLength(3)
    expect(r.total).toBe(9)
    expect(r.porMetodo).toEqual([
      { metodo: 'Efectivo $', total: 3.5, cantidad: 1 },
      { metodo: 'Zelle', total: 3.5, cantidad: 1 },
      { metodo: 'Pago Móvil', total: 2, cantidad: 1 },
    ])
  })

  it('filtra de forma inclusiva por desde, hasta y método', () => {
    expect(filtrarPagos(pagos, '2026-11-18', '').pagos.map((p) => p.id)).toEqual(['m3', 'm2'])
    expect(filtrarPagos(pagos, '', '2026-11-18').pagos.map((p) => p.id)).toEqual(['m2', 'm4'])
    expect(filtrarPagos(pagos, '2026-11-15', '2026-11-20').pagos.map((p) => p.id)).toEqual(['m2'])
    expect(filtrarPagos(pagos, '', '', 'Efectivo $').total).toBe(3.5)
  })
})

describe('rangoFechas', () => {
  it('calcula los rangos rápidos correctamente', () => {
    expect(rangoFechas('todos', '2026-11-26')).toEqual({ desde: '', hasta: '' })
    expect(rangoFechas('hoy', '2026-11-26')).toEqual({ desde: '2026-11-26', hasta: '2026-11-26' })
    expect(rangoFechas('semana', '2026-11-26')).toEqual({ desde: '2026-11-20', hasta: '2026-11-26' })
    expect(rangoFechas('mes', '2026-11-26')).toEqual({ desde: '2026-11-01', hasta: '2026-11-26' })
  })
})
