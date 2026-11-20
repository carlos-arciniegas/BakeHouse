import type { LineaVenta, Producto } from './tipos'

/** Índice del producto en el catálogo → cantidad elegida */
export type Seleccion = Record<number, number>

export function sumarProducto(sel: Seleccion, idx: number): Seleccion {
  return { ...sel, [idx]: (sel[idx] ?? 0) + 1 }
}

/** Resta uno; en 0 el producto sale de la selección */
export function restarProducto(sel: Seleccion, idx: number): Seleccion {
  const actual = sel[idx] ?? 0
  if (actual <= 1) {
    const { [idx]: _, ...resto } = sel
    return resto
  }
  return { ...sel, [idx]: actual - 1 }
}

/** "2x Galleta + 1x Brownie", el total y las líneas (para reportes), en el orden del catálogo */
export function describirSeleccion(sel: Seleccion, catalogo: Producto[]): { descripcion: string; total: number; lineas: LineaVenta[] } {
  const indices = Object.keys(sel).map(Number).filter((i) => sel[i] > 0 && catalogo[i]).sort((a, b) => a - b)
  const lineas = indices.map((i) => ({ nombre: catalogo[i].nombre, cantidad: sel[i], precio: Number(catalogo[i].precio) }))
  const total = lineas.reduce((suma, l) => suma + l.precio * l.cantidad, 0)
  return {
    descripcion: lineas.map((l) => l.cantidad + 'x ' + l.nombre).join(' + '),
    total: Math.round(total * 100) / 100,
    lineas,
  }
}
