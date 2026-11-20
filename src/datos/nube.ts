import { esTipoPago } from '../logica/metodosPago'
import { esCodigoPais } from '../logica/paises'
import type { Cliente, ConfigBCV, MetodoPago, Movimiento, Negocio, Producto } from '../logica/tipos'
import { sanearMovimiento } from './almacenamiento'
import type { Database, Json } from './baseDeDatos'

// Conversión entre los datos de la app y las filas de Supabase. Funciones puras (sin red).

type Tablas = Database['public']['Tables']
export type FilaNegocio = Tablas['negocios']['Row']
export type FilaCliente = Tablas['clientes']['Row']
export type FilaMovimiento = Tablas['movimientos']['Row']
export type FilaProducto = Tablas['productos']['Row']
export type FilaMetodo = Tablas['metodos_pago']['Row']

/** Lo que se envía a la base: el servidor pone actualizado_en y los campos con valor por defecto */
export interface FilasParaSubir {
  clientes: Tablas['clientes']['Insert'][]
  movimientos: Tablas['movimientos']['Insert'][]
  productos: Tablas['productos']['Insert'][]
  metodos: Tablas['metodos_pago']['Insert'][]
}

/** Lo que llega de la base (puede incluir filas marcadas como borradas) */
export interface FilasRecibidas {
  clientes: FilaCliente[]
  movimientos: FilaMovimiento[]
  productos: FilaProducto[]
  metodos: FilaMetodo[]
}

export interface DatosDeNegocio {
  clientes: Cliente[]
  catalogo: Producto[]
  metodos: MetodoPago[]
}

/**
 * Convierte los datos locales en filas para subirlas a un negocio.
 * Los movimientos llevan un creado_en creciente a partir de "base" para que, al bajarlos,
 * conserven el mismo orden en que se anotaron (es el orden del historial).
 */
export function datosAFilas(datos: DatosDeNegocio, negocioId: string, base: number = Date.now()): FilasParaSubir {
  let orden = 0
  return {
    clientes: datos.clientes.map((c) => ({
      negocio_id: negocioId, id: c.id, nombre: c.nombre, telefono: c.telefono, nota: c.nota,
    })),
    movimientos: datos.clientes.flatMap((c) => c.movimientos.map((m) => ({
      negocio_id: negocioId,
      id: m.id,
      cliente_id: c.id,
      tipo: m.tipo,
      descripcion: m.descripcion,
      monto: m.monto,
      fecha: m.fecha,
      productos: (m.productos ?? null) as Json,
      creado_en: new Date(base + orden++).toISOString(),
    }))),
    productos: datos.catalogo.map((p, i) => ({
      negocio_id: negocioId, id: p.id, nombre: p.nombre, precio: p.precio, orden: i,
    })),
    metodos: datos.metodos.map((m, i) => ({
      negocio_id: negocioId, id: m.id, tipo: m.tipo, datos: m.datos, activo: m.activo, orden: i,
    })),
  }
}

const vigente = (f: { borrado_en: string | null }) => f.borrado_en === null
const porCreacion = (a: { creado_en: string; id: string }, b: { creado_en: string; id: string }) =>
  a.creado_en.localeCompare(b.creado_en) || a.id.localeCompare(b.id)

/** Arma los datos de la app desde las filas de la base; ignora las borradas y las inválidas */
export function filasADatos(filas: FilasRecibidas): DatosDeNegocio {
  const movimientosPorCliente = new Map<string, Movimiento[]>()
  for (const f of filas.movimientos.filter(vigente).sort(porCreacion)) {
    const m = sanearMovimiento({ ...f, monto: Number(f.monto), productos: f.productos ?? undefined })
    if (!m) continue
    const lista = movimientosPorCliente.get(f.cliente_id) ?? []
    lista.push(m)
    movimientosPorCliente.set(f.cliente_id, lista)
  }

  return {
    clientes: filas.clientes.filter(vigente).sort(porCreacion).map((f) => ({
      id: f.id,
      nombre: f.nombre,
      telefono: f.telefono,
      nota: f.nota,
      movimientos: movimientosPorCliente.get(f.id) ?? [],
    })),
    catalogo: filas.productos.filter(vigente)
      .sort((a, b) => a.orden - b.orden || a.id.localeCompare(b.id))
      .map((f) => ({ id: f.id, nombre: f.nombre, precio: Number(f.precio) })),
    metodos: filas.metodos.filter(vigente)
      .filter((f) => esTipoPago(f.tipo))
      .sort((a, b) => a.orden - b.orden || a.id.localeCompare(b.id))
      .map((f) => ({
        id: f.id,
        tipo: f.tipo as MetodoPago['tipo'],
        datos: Object.fromEntries(Object.entries((f.datos ?? {}) as Record<string, unknown>).map(([k, v]) => [k, String(v ?? '')])),
        activo: f.activo,
      })),
  }
}

/** Datos del negocio que se guardan en la fila de "negocios" */
export function negocioAFila(negocio: Negocio, bcv: ConfigBCV): Tablas['negocios']['Update'] {
  return { nombre: negocio.nombre, pais: negocio.pais, tasa_bcv: bcv.tasa, tasa_bcv_actualizada: bcv.actualizado }
}

export function filaANegocio(f: FilaNegocio): { negocio: Negocio; bcv: ConfigBCV } {
  return {
    negocio: { nombre: f.nombre, pais: esCodigoPais(f.pais) ? f.pais : 'VE' },
    bcv: { tasa: Number(f.tasa_bcv) || 0, actualizado: f.tasa_bcv_actualizada },
  }
}
