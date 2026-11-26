import { esTipoPago } from '../logica/metodosPago'
import type { Cliente, MetodoPago, Movimiento, Producto } from '../logica/tipos'
import { sanearMovimiento, type EstadoGuardado } from './almacenamiento'
import { filaANegocio, filasADatos, type FilaNegocio, type FilasRecibidas } from './nube'

// Mezcla lo que llega de la nube con los datos del dispositivo. Pura: la usa el reductor.

export interface CambiosDeLaNube {
  filas: FilasRecibidas
  negocio: FilaNegocio | null
  /** Claves "tabla/id" (y "negocio") con cambios locales sin enviar: esas filas no se tocan */
  pendientes: string[]
  /** true al traer todo a un dispositivo nuevo: reemplaza lo local */
  reemplazar?: boolean
}

const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const porCreacion = (a: { creado_en: string; id: string }, b: { creado_en: string; id: string }) =>
  a.creado_en.localeCompare(b.creado_en) || a.id.localeCompare(b.id)

/**
 * Aplica filas de la nube a una lista ordenada (catálogo o métodos de pago): actualiza, agrega o quita,
 * y ordena por "orden" de la nube (lo que no llegó conserva su posición).
 */
function mezclarOrdenada<T extends { id: string }, F extends { id: string; orden: number; borrado_en: string | null }>(
  lista: T[], filas: F[], tabla: string, pendientes: Set<string>, convertir: (f: F) => T | null,
): T[] {
  const entradas = new Map(lista.map((x, i) => [x.id, { x, orden: i }]))
  for (const f of filas) {
    if (pendientes.has(tabla + '/' + f.id)) continue
    const x = f.borrado_en === null ? convertir(f) : null
    if (x) entradas.set(f.id, { x, orden: f.orden })
    else entradas.delete(f.id)
  }
  const resultado = [...entradas.values()]
    .map((e, i) => ({ ...e, i }))
    .sort((a, b) => a.orden - b.orden || a.i - b.i)
    .map((e) => e.x)
  return igual(resultado, lista) ? lista : resultado
}

export function aplicarDesdeNube(estado: EstadoGuardado, cambios: CambiosDeLaNube): EstadoGuardado {
  const negocioNube = cambios.negocio ? filaANegocio(cambios.negocio) : null

  if (cambios.reemplazar) {
    const datos = filasADatos(cambios.filas)
    return {
      ...estado,
      ...datos,
      ...(negocioNube ? { negocio: negocioNube.negocio, bcv: negocioNube.bcv.tasa > 0 ? negocioNube.bcv : estado.bcv } : {}),
    }
  }

  const pendientes = new Set(cambios.pendientes)
  const { filas } = cambios

  // Clientes: un Map conserva el orden de la lista y agrega al final lo nuevo
  const clientes = new Map(estado.clientes.map((c) => [c.id, c]))
  for (const f of [...filas.clientes].sort(porCreacion)) {
    if (pendientes.has('clientes/' + f.id)) continue
    const actual = clientes.get(f.id)
    if (f.borrado_en !== null) {
      clientes.delete(f.id)
    } else if (!actual) {
      clientes.set(f.id, { id: f.id, nombre: f.nombre, telefono: f.telefono, nota: f.nota, movimientos: [] })
    } else if (actual.nombre !== f.nombre || actual.telefono !== f.telefono || actual.nota !== f.nota) {
      clientes.set(f.id, { ...actual, nombre: f.nombre, telefono: f.telefono, nota: f.nota })
    }
  }

  for (const f of [...filas.movimientos].sort(porCreacion)) {
    if (pendientes.has('movimientos/' + f.id)) continue
    const dueno = clientes.get(f.cliente_id)
    if (!dueno) continue // el cliente se borró aquí o aún no llega
    const i = dueno.movimientos.findIndex((m) => m.id === f.id)
    let movimientos: Movimiento[] | null = null
    if (f.borrado_en !== null) {
      if (i >= 0) movimientos = dueno.movimientos.filter((m) => m.id !== f.id)
    } else {
      const m = sanearMovimiento({ ...f, monto: Number(f.monto), productos: f.productos ?? undefined })
      if (m && i < 0) movimientos = [...dueno.movimientos, m]
      else if (m && !igual(m, dueno.movimientos[i])) movimientos = dueno.movimientos.map((x, j) => (j === i ? m : x))
    }
    if (movimientos) clientes.set(dueno.id, { ...dueno, movimientos })
  }

  const listaClientes: Cliente[] = [...clientes.values()]
  const mismosClientes = listaClientes.length === estado.clientes.length && listaClientes.every((c, i) => c === estado.clientes[i])

  const catalogo = mezclarOrdenada<Producto, FilasRecibidas['productos'][number]>(estado.catalogo, filas.productos, 'productos', pendientes,
    (f) => (Number(f.precio) > 0 ? { id: f.id, nombre: f.nombre, precio: Number(f.precio) } : null))
  const metodos = mezclarOrdenada<MetodoPago, FilasRecibidas['metodos'][number]>(estado.metodos, filas.metodos, 'metodos_pago', pendientes,
    (f) => (esTipoPago(f.tipo)
      ? {
          id: f.id,
          tipo: f.tipo as MetodoPago['tipo'],
          datos: Object.fromEntries(Object.entries((f.datos ?? {}) as Record<string, unknown>).map(([k, v]) => [k, String(v ?? '')])),
          activo: f.activo,
        }
      : null))

  // Nombre y país vienen de la nube. La tasa BCV la consulta cada dispositivo: solo se toma si aquí no hay.
  let { negocio, bcv } = estado
  if (negocioNube && !pendientes.has('negocio')) {
    if (!igual(negocioNube.negocio, negocio)) negocio = negocioNube.negocio
    if (bcv.tasa <= 0 && negocioNube.bcv.tasa > 0) bcv = negocioNube.bcv
  }

  if (mismosClientes && catalogo === estado.catalogo && metodos === estado.metodos && negocio === estado.negocio && bcv === estado.bcv) {
    return estado
  }
  return { ...estado, clientes: mismosClientes ? estado.clientes : listaClientes, catalogo, metodos, negocio, bcv }
}
