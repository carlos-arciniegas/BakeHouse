import { fechaHoy } from '../logica/fechas'
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

/** Límites de la base (los "check" de la migración) */
const LIMITE = { id: 64, nombre: 120, nota: 200, descripcion: 500, telefono: 20 }

/** Recorta por caracteres (no por unidades UTF-16) para no partir un emoji */
const recortar = (texto: string, max: number) => Array.from(texto.trim()).slice(0, max).join('')
const nombreValido = (texto: string) => recortar(texto, LIMITE.nombre) || 'Sin nombre'
/** La base guarda 2 decimales */
const aCentimos = (n: number) => Math.round(n * 100) / 100
const FECHA = /^\d{4}-\d{2}-\d{2}$/
const idValido = (id: string) => id.length >= 1 && id.length <= LIMITE.id

type FilaParaSubir<T extends keyof FilasParaSubir> = FilasParaSubir[T][number]

/** Fila de un cliente lista para la base, o null si su id no cabe. Todo lo local está vigente (borrado_en: null). */
export function filaCliente(c: Cliente, negocioId: string): FilaParaSubir<'clientes'> | null {
  if (!idValido(c.id)) return null
  return {
    negocio_id: negocioId,
    id: c.id,
    nombre: nombreValido(c.nombre),
    telefono: c.telefono.replace(/\D/g, '').slice(0, LIMITE.telefono),
    nota: recortar(c.nota, LIMITE.nota),
    borrado_en: null,
  }
}

/** Fila de un movimiento, o null si la base no puede guardarlo (monto que redondeado da 0, id imposible) */
export function filaMovimiento(m: Movimiento, clienteId: string, negocioId: string, hoy: string): FilaParaSubir<'movimientos'> | null {
  if (!idValido(m.id) || !(aCentimos(m.monto) > 0)) return null
  return {
    negocio_id: negocioId,
    id: m.id,
    cliente_id: clienteId,
    tipo: m.tipo,
    descripcion: recortar(m.descripcion, LIMITE.descripcion),
    monto: aCentimos(m.monto),
    fecha: FECHA.test(m.fecha) ? m.fecha : hoy,
    productos: (m.productos ?? null) as Json,
    borrado_en: null,
  }
}

export function filaProducto(p: Producto, orden: number, negocioId: string): FilaParaSubir<'productos'> | null {
  if (!idValido(p.id) || !(aCentimos(p.precio) > 0)) return null
  return { negocio_id: negocioId, id: p.id, nombre: nombreValido(p.nombre), precio: aCentimos(p.precio), orden, borrado_en: null }
}

export function filaMetodo(m: MetodoPago, orden: number, negocioId: string): FilaParaSubir<'metodos'> | null {
  if (!idValido(m.id)) return null
  return { negocio_id: negocioId, id: m.id, tipo: m.tipo, datos: m.datos, activo: m.activo, orden, borrado_en: null }
}

const existe = <T>(x: T | null): x is T => x !== null

/**
 * Convierte los datos locales en filas para subirlas a un negocio, ajustadas a los límites de la base
 * para que un dato viejo fuera de rango no haga fallar toda la subida.
 * Clientes y movimientos llevan un creado_en creciente a partir de "base" para que, al bajarlos,
 * conserven el mismo orden que en el dispositivo (el del historial es el orden en que se anotó).
 * Se omite solo lo que la base no puede guardar: montos que redondeados quedan en 0 e ids imposibles.
 */
export function datosAFilas(datos: DatosDeNegocio, negocioId: string, base: number = Date.now()): FilasParaSubir {
  let orden = 0
  const creadoEn = () => new Date(base + orden++).toISOString()
  const hoy = fechaHoy(new Date(base))
  const clientes = datos.clientes.filter((c) => idValido(c.id))
  return {
    clientes: clientes.map((c) => ({ ...filaCliente(c, negocioId)!, creado_en: creadoEn() })),
    movimientos: clientes.flatMap((c) => c.movimientos
      .map((m) => filaMovimiento(m, c.id, negocioId, hoy))
      .filter(existe)
      .map((f) => ({ ...f, creado_en: creadoEn() }))),
    productos: datos.catalogo.map((p, i) => filaProducto(p, i, negocioId)).filter(existe),
    metodos: datos.metodos.map((m, i) => filaMetodo(m, i, negocioId)).filter(existe),
  }
}

/** Parte una lista en lotes para no mandar miles de filas en una sola petición */
export function dividirEnLotes<T>(lista: T[], tamano: number): T[][] {
  const lotes: T[][] = []
  for (let i = 0; i < lista.length; i += tamano) lotes.push(lista.slice(i, i + tamano))
  return lotes
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
