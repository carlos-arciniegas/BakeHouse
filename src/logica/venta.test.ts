import { describe, expect, it } from 'vitest'
import type { Producto } from './tipos'
import { describirSeleccion, restarProducto, sumarProducto, type Seleccion } from './venta'

const catalogo: Producto[] = [
  { id: 'p1', nombre: 'Galleta Choco Chip 30g', precio: 1.5 },
  { id: 'p2', nombre: 'Galleta Doble Chocolate 30g', precio: 1.5 },
  { id: 'p3', nombre: 'Brownie Fudge 7x7', precio: 2.5 },
]

describe('selección de productos', () => {
  it('tocar dos veces suma, no duplica', () => {
    let sel: Seleccion = {}
    sel = sumarProducto(sel, 0)
    sel = sumarProducto(sel, 0)
    sel = sumarProducto(sel, 2)
    expect(describirSeleccion(sel, catalogo)).toEqual({
      descripcion: '2x Galleta Choco Chip 30g + 1x Brownie Fudge 7x7',
      total: 5.5,
      // Las líneas quedan guardadas con la venta para los reportes
      lineas: [
        { nombre: 'Galleta Choco Chip 30g', cantidad: 2, precio: 1.5 },
        { nombre: 'Brownie Fudge 7x7', cantidad: 1, precio: 2.5 },
      ],
    })
  })

  it('restar baja la cantidad y en 0 quita el producto', () => {
    let sel: Seleccion = { 0: 8, 2: 1 }
    sel = restarProducto(sel, 0)
    sel = restarProducto(sel, 0)
    sel = restarProducto(sel, 0)
    expect(sel).toEqual({ 0: 5, 2: 1 })
    expect(describirSeleccion(sel, catalogo).total).toBe(10)

    sel = restarProducto(sel, 2)
    expect(sel).toEqual({ 0: 5 })
  })

  it('restar de más no rompe nada', () => {
    expect(restarProducto({}, 1)).toEqual({})
  })

  it('el orden de la descripción sigue al catálogo, no al orden de los toques', () => {
    expect(describirSeleccion({ 2: 1, 0: 1 }, catalogo).descripcion).toBe('1x Galleta Choco Chip 30g + 1x Brownie Fudge 7x7')
  })

  it('sin selección no hay descripción ni total', () => {
    expect(describirSeleccion({}, catalogo)).toEqual({ descripcion: '', total: 0, lineas: [] })
  })
})
