import { fechaHoy } from './fechas'
import type { Cliente, InventarioDiario, Movimiento, Producto } from './tipos'

export interface ItemInventario {
  producto: Producto
  llevado: number
  vendido: number
  quedan: number
}

export interface ResumenInventarioDia {
  items: ItemInventario[]
  totalLlevado: number
  totalVendido: number
  totalQuedan: number
}

const claveNombre = (nombre: string) => nombre.trim().toLowerCase()

/**
 * Extrae las líneas de producto de una venta. Si ya trae `productos` estructurados los usa;
 * si es una venta vieja de texto ("2x Galleta + 1x Brownie"), interpreta cada segmento.
 */
export function extraerLineasVenta(m: Movimiento): { nombre: string; cantidad: number }[] {
  if (m.productos?.length) {
    return m.productos.map((l) => ({ nombre: l.nombre, cantidad: l.cantidad }))
  }
  const lineas: { nombre: string; cantidad: number }[] = []
  for (const parte of String(m.descripcion ?? '').split(' + ')) {
    const match = parte.trim().match(/^(\d+)\s*x\s+(.+)$/i)
    if (!match) continue
    const cantidad = Number(match[1])
    if (cantidad > 0) lineas.push({ nombre: match[2], cantidad })
  }
  return lineas
}

/** Suma las unidades vendidas por producto (clave normalizada por nombre) en una fecha dada */
export function vendidosEnFecha(clientes: Cliente[], fecha: string): Map<string, number> {
  const mapa = new Map<string, number>()
  for (const c of clientes) {
    for (const m of c.movimientos ?? []) {
      if (m.tipo !== 'venta' || m.fecha !== fecha) continue
      for (const linea of extraerLineasVenta(m)) {
        const clave = claveNombre(linea.nombre)
        if (!clave) continue
        mapa.set(clave, (mapa.get(clave) ?? 0) + linea.cantidad)
      }
    }
  }
  return mapa
}

/** Calcula llevado, vendido y restante por cada producto del catálogo en una fecha */
export function calcularInventarioDia(
  catalogo: Producto[],
  clientes: Cliente[],
  inventario: InventarioDiario,
  fecha: string,
): ResumenInventarioDia {
  const delDia = inventario[fecha] ?? {}
  const vendidos = vendidosEnFecha(clientes, fecha)

  let totalLlevado = 0
  let totalVendido = 0
  let totalQuedan = 0

  const items: ItemInventario[] = catalogo.map((producto) => {
    const llevado = delDia[producto.id] ?? 0
    const vendido = vendidos.get(claveNombre(producto.nombre)) ?? 0
    const quedan = llevado - vendido
    totalLlevado += llevado
    totalVendido += vendido
    if (llevado > 0) totalQuedan += Math.max(0, quedan)
    return { producto, llevado, vendido, quedan }
  })

  return { items, totalLlevado, totalVendido, totalQuedan }
}

/** Disponibilidad por producto.id solo para los productos con inventario cargado ese día */
export function mapaDisponiblesDia(
  catalogo: Producto[],
  clientes: Cliente[],
  inventario: InventarioDiario,
  fecha: string,
): Record<string, { llevado: number; vendido: number; quedan: number }> {
  const { items } = calcularInventarioDia(catalogo, clientes, inventario, fecha)
  const mapa: Record<string, { llevado: number; vendido: number; quedan: number }> = {}
  for (const item of items) {
    if (item.llevado > 0) {
      mapa[item.producto.id] = { llevado: item.llevado, vendido: item.vendido, quedan: item.quedan }
    }
  }
  return mapa
}

/** Actualiza inmutablemente la cantidad de un producto para un día; limpia ceros y días vacíos */
export function cambiarCantidadDia(
  inventario: InventarioDiario,
  fecha: string,
  productoId: string,
  cantidad: number,
): InventarioDiario {
  const n = Number.isFinite(cantidad) ? Math.max(0, Math.floor(cantidad)) : 0
  const actualDia = inventario[fecha] ?? {}
  const copiaDia = { ...actualDia }
  if (n > 0) copiaDia[productoId] = n
  else delete copiaDia[productoId]

  const copia = { ...inventario }
  if (Object.keys(copiaDia).length > 0) copia[fecha] = copiaDia
  else delete copia[fecha]
  return copia
}

/** Reemplaza inmutablemente todas las cantidades de un día, descartando ceros o inválidos */
export function reemplazarDia(
  inventario: InventarioDiario,
  fecha: string,
  cantidades: Record<string, number>,
): InventarioDiario {
  const limpio: Record<string, number> = {}
  for (const [id, raw] of Object.entries(cantidades)) {
    const n = Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0
    if (n > 0) limpio[id] = n
  }
  const copia = { ...inventario }
  if (Object.keys(limpio).length > 0) copia[fecha] = limpio
  else delete copia[fecha]
  return copia
}

/** Fecha más reciente con al menos un producto cargado (> 0), distinta de `excluirFecha` */
export function ultimaFechaConInventario(inventario: InventarioDiario, excluirFecha?: string): string | null {
  const fechas = Object.entries(inventario)
    .filter(([f, mapa]) => f !== excluirFecha && Object.values(mapa).some((n) => n > 0))
    .map(([f]) => f)
    .sort((a, b) => b.localeCompare(a))
  return fechas[0] ?? null
}

/** Suma o resta días a una fecha AAAA-MM-DD en horario local (sin desfases UTC) */
export function desplazarFecha(fechaISO: string, dias: number): string {
  const [a, m, d] = fechaISO.split('-').map(Number)
  if (!a || !m || !d) return fechaHoy()
  return fechaHoy(new Date(a, m - 1, d + dias))
}
