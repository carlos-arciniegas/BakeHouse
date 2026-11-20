import type { Producto } from './tipos'

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

/** "2x Galleta + 1x Brownie" y el total, en el orden del catálogo */
export function describirSeleccion(sel: Seleccion, catalogo: Producto[]): { descripcion: string; total: number } {
  const indices = Object.keys(sel).map(Number).filter((i) => sel[i] > 0 && catalogo[i]).sort((a, b) => a - b)
  let total = 0
  const partes = indices.map((i) => {
    total += Number(catalogo[i].precio) * sel[i]
    return sel[i] + 'x ' + catalogo[i].nombre
  })
  return { descripcion: partes.join(' + '), total: Math.round(total * 100) / 100 }
}
