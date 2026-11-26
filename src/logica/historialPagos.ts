import { desplazarFecha } from './inventario'
import type { Cliente } from './tipos'

export interface RegistroPago {
  id: string
  clienteId: string
  clienteNombre: string
  fecha: string
  monto: number
  metodo: string
  detalleBs: string
}

export interface ResumenMetodoPago {
  metodo: string
  total: number
  cantidad: number
}

export interface ResumenPagos {
  pagos: RegistroPago[]
  total: number
  porMetodo: ResumenMetodoPago[]
}

export type RangoRapido = 'todos' | 'hoy' | 'semana' | 'mes'

const redondear2 = (n: number) => Math.round(n * 100) / 100

/**
 * Extrae el método y (si existe) los bolívares históricos de descripciones como
 * "Pago (Pago Móvil - Bs. 1.100,00)" o "Abono (Efectivo $)".
 */
export function parsearMetodoPago(descripcion: string): { metodo: string; detalleBs: string } {
  const limpio = String(descripcion ?? '').trim()
  const match = limpio.match(/^(?:Pago|Abono)\s*\((.+)\)$/i)
  if (!match) {
    return { metodo: limpio || 'Sin especificar', detalleBs: '' }
  }
  const contenido = match[1].trim()
  const partes = contenido.split(' - ')
  const ultima = partes[partes.length - 1]?.trim() ?? ''
  if (partes.length > 1 && /^Bs\./i.test(ultima)) {
    return {
      metodo: partes.slice(0, -1).join(' - ').trim() || 'Sin especificar',
      detalleBs: ultima,
    }
  }
  return { metodo: contenido || 'Sin especificar', detalleBs: '' }
}

/** Lista todos los pagos recibidos ordenados del más reciente al más antiguo */
export function extraerPagos(clientes: Cliente[]): RegistroPago[] {
  const lista: { pago: RegistroPago; orden: number }[] = []
  for (const c of clientes) {
    const movs = c.movimientos ?? []
    movs.forEach((m, orden) => {
      if (m.tipo !== 'abono') return
      const { metodo, detalleBs } = parsearMetodoPago(m.descripcion)
      lista.push({
        pago: {
          id: m.id,
          clienteId: c.id,
          clienteNombre: c.nombre,
          fecha: m.fecha,
          monto: Number(m.monto) || 0,
          metodo,
          detalleBs,
        },
        orden,
      })
    })
  }
  return lista
    .sort((a, b) =>
      b.pago.fecha.localeCompare(a.pago.fecha) ||
      b.orden - a.orden ||
      a.pago.clienteNombre.localeCompare(b.pago.clienteNombre))
    .map((x) => x.pago)
}

/** Filtra por rango de fechas inclusivo y método opcional, y calcula totales */
export function filtrarPagos(pagos: RegistroPago[], desde: string, hasta: string, metodo = ''): ResumenPagos {
  const filtrados = pagos.filter((p) =>
    (!desde || p.fecha >= desde) &&
    (!hasta || p.fecha <= hasta) &&
    (!metodo || p.metodo === metodo))

  let total = 0
  const grupos = new Map<string, ResumenMetodoPago>()
  for (const p of filtrados) {
    total += p.monto
    const actual = grupos.get(p.metodo) ?? { metodo: p.metodo, total: 0, cantidad: 0 }
    actual.total = redondear2(actual.total + p.monto)
    actual.cantidad += 1
    grupos.set(p.metodo, actual)
  }

  const porMetodo = Array.from(grupos.values())
    .sort((a, b) => b.total - a.total || a.metodo.localeCompare(b.metodo))

  return { pagos: filtrados, total: redondear2(total), porMetodo }
}

/** Métodos únicos presentes en el historial, ordenados alfabéticamente */
export function metodosEnHistorial(pagos: RegistroPago[]): string[] {
  return Array.from(new Set(pagos.map((p) => p.metodo))).sort((a, b) => a.localeCompare(b))
}

/** Calcula los límites de fecha para los atajos rápidos */
export function rangoFechas(preset: RangoRapido, hoy: string): { desde: string; hasta: string } {
  switch (preset) {
    case 'todos':
      return { desde: '', hasta: '' }
    case 'hoy':
      return { desde: hoy, hasta: hoy }
    case 'semana':
      return { desde: desplazarFecha(hoy, -6), hasta: hoy }
    case 'mes':
      return { desde: hoy.slice(0, 7) + '-01', hasta: hoy }
  }
}
