import { esTipoPago, migrarPagoMovil, type PagoMovilAntiguo } from '../logica/metodosPago'
import { esCodigoPais, NEGOCIO_PREDETERMINADO } from '../logica/paises'
import type { Cliente, ConfigBCV, InventarioDiario, LineaVenta, MetodoPago, Movimiento, Negocio, Producto } from '../logica/tipos'

/**
 * Claves de localStorage. Empiezan por "pachons_" porque así las creó la primera versión;
 * no se renombran para no perder los datos que ya existen.
 */
export const CLAVES = {
  clientes: 'pachons_bakehouse_data_v3',
  bcv: 'pachons_bcv_config_v3',
  pagoMovilAntiguo: 'pachons_pagomovil_v3',
  metodos: 'pachons_metodos_pago_v1',
  catalogo: 'pachons_catalog_v3',
  negocio: 'pachons_negocio_v1',
  ultimoMetodo: 'pachons_ultimo_metodo_v1',
  mensajeCobro: 'pachons_mensaje_cobro_v1',
  inventario: 'pachons_inventario_v1',
} as const

export const CATALOGO_PREDETERMINADO: Producto[] = [
  { id: 'prod_base_1', nombre: 'Galleta Choco Chip 30g', precio: 1.5 },
  { id: 'prod_base_2', nombre: 'Galleta Doble Chocolate 30g', precio: 1.5 },
  { id: 'prod_base_3', nombre: 'Brownie Fudge 7x7', precio: 2.5 },
  { id: 'prod_base_4', nombre: 'Brownie Bites (x4)', precio: 3 },
  { id: 'prod_base_5', nombre: 'Porción Ponqué', precio: 2 },
  { id: 'prod_base_6', nombre: 'Helado Ninja Creami', precio: 3.5 },
]

export interface EstadoGuardado {
  clientes: Cliente[]
  catalogo: Producto[]
  metodos: MetodoPago[]
  negocio: Negocio
  bcv: ConfigBCV
  mensajeCobro: string
  inventario: InventarioDiario
}

/** Lo mínimo de Storage que se usa; permite probar con un almacenamiento en memoria */
export type Almacen = Pick<Storage, 'getItem' | 'setItem'>

function leerJSON(almacen: Almacen, clave: string): unknown {
  try {
    const crudo = almacen.getItem(clave)
    return crudo ? JSON.parse(crudo) : null
  } catch {
    return null
  }
}

export function guardarJSON(almacen: Almacen, clave: string, valor: unknown): void {
  try {
    almacen.setItem(clave, JSON.stringify(valor))
  } catch {
    // Almacenamiento lleno o bloqueado (modo privado): la app sigue funcionando en memoria
  }
}

// ---------- Saneamiento: los datos vienen de localStorage o de un archivo, no se confía en su forma

const idAleatorio = (prefijo: string) => prefijo + '_' + Math.random().toString(36).slice(2, 12)

function sanearLineas(lista: unknown): LineaVenta[] | undefined {
  if (!Array.isArray(lista)) return undefined
  const lineas = lista
    .filter((l) => l && (l as LineaVenta).nombre && Number((l as LineaVenta).cantidad) > 0)
    .map((l: LineaVenta) => ({ nombre: String(l.nombre), cantidad: Math.round(Number(l.cantidad)), precio: Number(l.precio) || 0 }))
  return lineas.length ? lineas : undefined
}

export function sanearMovimiento(m: unknown): Movimiento | null {
  const x = m as Partial<Movimiento>
  if (!x || (x.tipo !== 'venta' && x.tipo !== 'abono')) return null
  const monto = Number(x.monto)
  if (!(monto > 0)) return null
  const movimiento: Movimiento = {
    id: String(x.id ?? idAleatorio('mov')),
    tipo: x.tipo,
    descripcion: String(x.descripcion ?? ''),
    monto,
    fecha: String(x.fecha ?? ''),
  }
  const productos = sanearLineas(x.productos)
  if (productos) movimiento.productos = productos
  return movimiento
}

export function sanearClientes(lista: unknown): Cliente[] | null {
  if (!Array.isArray(lista)) return null
  return lista
    .filter((c) => c && typeof c === 'object' && (c as Cliente).nombre)
    .map((c: Cliente) => ({
      id: String(c.id),
      nombre: String(c.nombre),
      telefono: String(c.telefono ?? '').replace(/\D/g, ''),
      nota: String(c.nota ?? ''),
      movimientos: (Array.isArray(c.movimientos) ? c.movimientos : [])
        .map(sanearMovimiento)
        .filter((m): m is Movimiento => m !== null),
    }))
}

export function sanearCatalogo(lista: unknown): Producto[] | null {
  if (!Array.isArray(lista)) return null
  return lista
    .filter((p) => p && (p as Producto).nombre && Number((p as Producto).precio) > 0)
    .map((p: Producto) => ({ id: p.id ? String(p.id) : idAleatorio('prod'), nombre: String(p.nombre), precio: Number(p.precio) }))
}

export function sanearMetodos(lista: unknown): MetodoPago[] | null {
  if (!Array.isArray(lista)) return null
  return lista
    .filter((m) => m && esTipoPago((m as MetodoPago).tipo))
    .map((m: MetodoPago) => ({
      id: String(m.id),
      tipo: m.tipo,
      datos: Object.fromEntries(Object.entries(m.datos ?? {}).map(([k, v]) => [k, String(v ?? '')])),
      activo: m.activo !== false,
    }))
}

export function sanearNegocio(n: unknown): Negocio | null {
  const x = n as Partial<Negocio>
  if (!x || !x.nombre || !esCodigoPais(x.pais)) return null
  return { nombre: String(x.nombre), pais: x.pais }
}

function sanearBCV(b: unknown): ConfigBCV {
  const x = (b ?? {}) as Partial<ConfigBCV>
  return { tasa: Number(x.tasa) > 0 ? Number(x.tasa) : 0, actualizado: String(x.actualizado ?? '') }
}

function sanearMensajeCobro(valor: unknown): string {
  return typeof valor === 'string' ? valor : ''
}

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/

export function sanearInventario(valor: unknown): InventarioDiario {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return {}
  const limpio: InventarioDiario = {}
  for (const [fecha, mapa] of Object.entries(valor as Record<string, unknown>)) {
    if (!FECHA_ISO.test(fecha) || !mapa || typeof mapa !== 'object' || Array.isArray(mapa)) continue
    const dia: Record<string, number> = {}
    for (const [id, cant] of Object.entries(mapa as Record<string, unknown>)) {
      const n = Math.floor(Number(cant))
      if (id && Number.isFinite(n) && n > 0) dia[id] = n
    }
    if (Object.keys(dia).length > 0) limpio[fecha] = dia
  }
  return limpio
}

/**
 * Carga todo lo guardado. Si encuentra datos del formato viejo de Pago Móvil y aún no hay
 * métodos de pago, los convierte y guarda el resultado.
 */
export function cargarEstado(almacen: Almacen): EstadoGuardado {
  const datos = leerJSON(almacen, CLAVES.clientes) as { clientes?: unknown } | null

  let metodos = sanearMetodos(leerJSON(almacen, CLAVES.metodos))
  if (metodos === null) {
    metodos = migrarPagoMovil(leerJSON(almacen, CLAVES.pagoMovilAntiguo) as PagoMovilAntiguo | null)
    if (metodos.length) guardarJSON(almacen, CLAVES.metodos, metodos)
  }

  // Los productos guardados antes de tener id lo reciben ahora y se guarda, para que no cambie en cada carga
  const catalogoCrudo = leerJSON(almacen, CLAVES.catalogo)
  const catalogo = sanearCatalogo(catalogoCrudo) ?? CATALOGO_PREDETERMINADO.map((p) => ({ ...p }))
  if (Array.isArray(catalogoCrudo) && catalogoCrudo.some((p) => p && !(p as Producto).id)) {
    guardarJSON(almacen, CLAVES.catalogo, catalogo)
  }

  return {
    clientes: sanearClientes(datos?.clientes) ?? [],
    catalogo,
    metodos,
    negocio: sanearNegocio(leerJSON(almacen, CLAVES.negocio)) ?? { ...NEGOCIO_PREDETERMINADO },
    bcv: sanearBCV(leerJSON(almacen, CLAVES.bcv)),
    mensajeCobro: sanearMensajeCobro(leerJSON(almacen, CLAVES.mensajeCobro)),
    inventario: sanearInventario(leerJSON(almacen, CLAVES.inventario)),
  }
}

/** Guarda una parte del estado con la forma exacta que espera la versión anterior */
export const guardar = {
  clientes: (a: Almacen, clientes: Cliente[]) => guardarJSON(a, CLAVES.clientes, { clientes }),
  catalogo: (a: Almacen, catalogo: Producto[]) => guardarJSON(a, CLAVES.catalogo, catalogo),
  metodos: (a: Almacen, metodos: MetodoPago[]) => guardarJSON(a, CLAVES.metodos, metodos),
  negocio: (a: Almacen, negocio: Negocio) => guardarJSON(a, CLAVES.negocio, negocio),
  bcv: (a: Almacen, bcv: ConfigBCV) => guardarJSON(a, CLAVES.bcv, bcv),
  mensajeCobro: (a: Almacen, mensajeCobro: string) => guardarJSON(a, CLAVES.mensajeCobro, mensajeCobro),
  inventario: (a: Almacen, inventario: InventarioDiario) => guardarJSON(a, CLAVES.inventario, inventario),
}

export function leerUltimoMetodo(a: Almacen): string {
  try {
    return a.getItem(CLAVES.ultimoMetodo) ?? ''
  } catch {
    return ''
  }
}

export function recordarUltimoMetodo(a: Almacen, nombre: string): void {
  try {
    a.setItem(CLAVES.ultimoMetodo, nombre)
  } catch {
    // sin almacenamiento: solo se pierde la preferencia
  }
}
