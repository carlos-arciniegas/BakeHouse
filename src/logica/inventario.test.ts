import { describe, expect, it } from 'vitest'
import {
  calcularInventarioDia,
  cambiarCantidadDia,
  desplazarFecha,
  extraerLineasVenta,
  mapaDisponiblesDia,
  reemplazarDia,
  ultimaFechaConInventario,
  vendidosEnFecha,
} from './inventario'
import type { Cliente, InventarioDiario, Movimiento, Producto } from './tipos'

const catalogo: Producto[] = [
  { id: 'p1', nombre: 'Galleta Choco Chip 30g', precio: 1.5 },
  { id: 'p2', nombre: 'Brownie Fudge 7x7', precio: 2.5 },
  { id: 'p3', nombre: 'Porción Ponqué', precio: 2 },
]

const clientes: Cliente[] = [
  {
    id: 'c1',
    nombre: 'María',
    telefono: '584121234567',
    nota: '',
    movimientos: [
      {
        id: 'm1',
        tipo: 'venta',
        descripcion: '3x Galleta Choco Chip 30g + 1x Brownie Fudge 7x7',
        monto: 7,
        fecha: '2026-11-26',
        productos: [
          { nombre: 'Galleta Choco Chip 30g', cantidad: 3, precio: 1.5 },
          { nombre: 'Brownie Fudge 7x7', cantidad: 1, precio: 2.5 },
        ],
      },
      // Abono en la misma fecha: no descuenta inventario
      { id: 'm2', tipo: 'abono', descripcion: 'Pago (Efectivo)', monto: 7, fecha: '2026-11-26' },
      // Venta de otro día: no cuenta para 2026-11-26
      { id: 'm3', tipo: 'venta', descripcion: '5x Galleta Choco Chip 30g', monto: 7.5, fecha: '2026-11-25' },
    ],
  },
  {
    id: 'c2',
    nombre: 'José',
    telefono: '584149876543',
    nota: '',
    movimientos: [
      // Venta vieja sin array `productos`, solo descripción de texto
      { id: 'm4', tipo: 'venta', descripcion: '2x galleta choco chip 30g + 3x Brownie Fudge 7x7', monto: 10.5, fecha: '2026-11-26' },
    ],
  },
]

describe('extraerLineasVenta y vendidosEnFecha', () => {
  it('lee líneas estructuradas y descripciones viejas, ignorando abonos y otras fechas', () => {
    const vieja: Movimiento = { id: 'x', tipo: 'venta', descripcion: '2x Galleta + 1x Brownie', monto: 5, fecha: '2026-11-26' }
    expect(extraerLineasVenta(vieja)).toEqual([
      { nombre: 'Galleta', cantidad: 2 },
      { nombre: 'Brownie', cantidad: 1 },
    ])

    const vendidos = vendidosEnFecha(clientes, '2026-11-26')
    expect(vendidos.get('galleta choco chip 30g')).toBe(5)
    expect(vendidos.get('brownie fudge 7x7')).toBe(4)
  })
})

describe('calcularInventarioDia y mapaDisponiblesDia', () => {
  const inv: InventarioDiario = {
    '2026-11-26': { p1: 10, p2: 2 },
  }

  it('descuenta ventas del día y permite saldo negativo si se vende de más', () => {
    const res = calcularInventarioDia(catalogo, clientes, inv, '2026-11-26')
    expect(res.items.map((i) => [i.producto.id, i.llevado, i.vendido, i.quedan])).toEqual([
      ['p1', 10, 5, 5],
      ['p2', 2, 4, -2],
      ['p3', 0, 0, 0],
    ])
    expect(res.totalLlevado).toBe(12)
    expect(res.totalVendido).toBe(9)
    expect(res.totalQuedan).toBe(5)
  })

  it('mapaDisponiblesDia solo incluye productos con cantidad llevada > 0', () => {
    expect(mapaDisponiblesDia(catalogo, clientes, inv, '2026-11-26')).toEqual({
      p1: { llevado: 10, vendido: 5, quedan: 5 },
      p2: { llevado: 2, vendido: 4, quedan: -2 },
    })
  })
})

describe('mutaciones inmutables y utilidades de fechas', () => {
  it('cambiarCantidadDia limpia ceros y días vacíos sin mutar el original', () => {
    const inv: InventarioDiario = { '2026-11-26': { p1: 5 } }
    const conP2 = cambiarCantidadDia(inv, '2026-11-26', 'p2', 3.9)
    expect(inv['2026-11-26']).toEqual({ p1: 5 })
    expect(conP2['2026-11-26']).toEqual({ p1: 5, p2: 3 })

    const sinP1 = cambiarCantidadDia(conP2, '2026-11-26', 'p1', 0)
    expect(sinP1['2026-11-26']).toEqual({ p2: 3 })

    const vacio = cambiarCantidadDia(sinP1, '2026-11-26', 'p2', -4)
    expect(vacio).toEqual({})
  })

  it('reemplazarDia descarta ceros y elimina el día si queda vacío', () => {
    const inv = reemplazarDia({}, '2026-11-26', { p1: 4, p2: 0, p3: -1 })
    expect(inv).toEqual({ '2026-11-26': { p1: 4 } })
    expect(reemplazarDia(inv, '2026-11-26', {})).toEqual({})
  })

  it('ultimaFechaConInventario encuentra el día más reciente distinto al actual', () => {
    const inv: InventarioDiario = {
      '2026-11-20': { p1: 3 },
      '2026-11-24': { p1: 0 },
      '2026-11-25': { p2: 2 },
      '2026-11-26': { p1: 5 },
    }
    expect(ultimaFechaConInventario(inv, '2026-11-26')).toBe('2026-11-25')
    expect(ultimaFechaConInventario({ '2026-11-26': { p1: 5 } }, '2026-11-26')).toBeNull()
  })

  it('desplazarFecha maneja cambios de mes y año en fecha local', () => {
    expect(desplazarFecha('2026-11-30', 1)).toBe('2026-12-01')
    expect(desplazarFecha('2026-01-01', -1)).toBe('2025-12-31')
  })
})
