import { fechaHoy } from '../logica/fechas'
import type { Cliente } from '../logica/tipos'
import type { Almacen, EstadoGuardado } from './almacenamiento'
import { leerVinculo, type ErrorAuth } from './cuenta'
import { dividirEnLotes, filaCliente, filaMetodo, filaMovimiento, filaProducto, negocioAFila } from './nube'
import { leerSubida, TAMANO_LOTE, type Destino, type TablaDeDatos } from './subida'

// Sincronización, parte 1: cada cambio local queda en una cola que se envía a la nube cuando hay red.
// Todo es puro o recibe el almacenamiento y la red por parámetro, para poder probarlo.

export const CLAVE_COLA = 'pachons_nube_cola_v1'
/** Evento de window que avisa que la cola cambió (lo lanza la tienda y lo escucha el envío) */
export const EVENTO_COLA = 'pachons:cola'

export type FilaNegocioCambio = ReturnType<typeof negocioAFila>

/** Un cambio de una fila: guardarla (insertar o actualizar) o marcarla como borrada */
export type Cambio =
  | { tabla: TablaDeDatos; id: string; fila: object }
  | { tabla: TablaDeDatos; id: string; borrar: true }

/** "v" crece con cada cambio: al terminar un envío solo se quita lo que no cambió mientras tanto */
type Entrada = Cambio & { v: number }

export interface Cola {
  negocioId: string
  siguiente: number
  /** Por "tabla/id": de cada fila queda solo su último cambio */
  cambios: Record<string, Entrada>
  negocio: { fila: FilaNegocioCambio; v: number } | null
}

export interface DestinoSync extends Destino {
  /** Marca filas como borradas (borrado_en) para que los otros dispositivos también las quiten */
  borrar(tabla: TablaDeDatos, ids: string[], cuando: string): Promise<ErrorAuth | null>
}

// ---------- Qué cambió ----------

const clave = (c: { tabla: TablaDeDatos; id: string }) => c.tabla + '/' + c.id
const igual = (a: object | null | undefined, b: object | null | undefined) => JSON.stringify(a) === JSON.stringify(b)

/** Compara listas de filas por id: lo nuevo o distinto se guarda, lo que ya no está se borra */
function compararFilas(tabla: TablaDeDatos, antes: Map<string, object>, despues: Map<string, object>, cambios: Cambio[]) {
  for (const [id, fila] of despues) if (!igual(antes.get(id), fila)) cambios.push({ tabla, id, fila })
  for (const id of antes.keys()) if (!despues.has(id)) cambios.push({ tabla, id, borrar: true })
}

function filasDe<T>(lista: T[], hacer: (x: T, i: number) => ({ id: string } | null)): Map<string, object> {
  const mapa = new Map<string, object>()
  lista.forEach((x, i) => {
    const fila = hacer(x, i)
    if (fila) mapa.set(fila.id, fila)
  })
  return mapa
}

/**
 * Lo que cambió entre dos estados, como filas de la base. Los clientes y movimientos que siguen
 * siendo el mismo objeto se saltan sin compararlos (el reductor no copia lo que no toca).
 */
export function diferencias(antes: EstadoGuardado, despues: EstadoGuardado, negocioId: string, ahora: Date = new Date()): {
  cambios: Cambio[]
  negocio: FilaNegocioCambio | null
} {
  const cambios: Cambio[] = []
  const hoy = fechaHoy(ahora)

  if (antes.clientes !== despues.clientes) {
    const previos = new Map(antes.clientes.map((c) => [c.id, c]))
    const actuales = new Map(despues.clientes.map((c) => [c.id, c]))
    const movimientos = (c: Cliente | undefined) => filasDe(c?.movimientos ?? [], (m) => filaMovimiento(m, c!.id, negocioId, hoy))
    const cliente = (c: Cliente | undefined) => filasDe(c ? [c] : [], (x) => filaCliente(x, negocioId))

    for (const c of despues.clientes) {
      const previo = previos.get(c.id)
      if (previo === c) continue
      compararFilas('clientes', cliente(previo), cliente(c), cambios)
      compararFilas('movimientos', movimientos(previo), movimientos(c), cambios)
    }
    for (const previo of antes.clientes) {
      if (actuales.has(previo.id)) continue
      compararFilas('clientes', cliente(previo), new Map(), cambios)
      compararFilas('movimientos', movimientos(previo), new Map(), cambios)
    }
  }
  if (antes.catalogo !== despues.catalogo) {
    compararFilas('productos', filasDe(antes.catalogo, (p, i) => filaProducto(p, i, negocioId)), filasDe(despues.catalogo, (p, i) => filaProducto(p, i, negocioId)), cambios)
  }
  if (antes.metodos !== despues.metodos) {
    compararFilas('metodos_pago', filasDe(antes.metodos, (m, i) => filaMetodo(m, i, negocioId)), filasDe(despues.metodos, (m, i) => filaMetodo(m, i, negocioId)), cambios)
  }

  const negocioCambio = antes.negocio !== despues.negocio || antes.bcv !== despues.bcv
  const negocio = negocioCambio ? negocioAFila(despues.negocio, despues.bcv) : null
  return { cambios, negocio: negocio && !igual(negocio, negocioAFila(antes.negocio, antes.bcv)) ? negocio : null }
}

// ---------- La cola en el almacenamiento ----------

/**
 * El negocio al que se envían los cambios, o null si no hay que enviar nada.
 * Se activa tras la primera "Subir mis datos" a ese negocio: así la nube ya tiene los clientes
 * a los que pertenecen los movimientos nuevos.
 */
export function negocioSincronizado(a: Almacen): string | null {
  const vinculo = leerVinculo(a)
  return vinculo && leerSubida(a)?.negocioId === vinculo ? vinculo : null
}

export function leerCola(a: Almacen): Cola | null {
  try {
    const c = JSON.parse(a.getItem(CLAVE_COLA) ?? 'null') as Cola | null
    return c && typeof c.negocioId === 'string' && c.cambios && typeof c.cambios === 'object' ? c : null
  } catch {
    return null
  }
}

function guardarCola(a: Almacen, cola: Cola) {
  try {
    a.setItem(CLAVE_COLA, JSON.stringify(cola))
  } catch {
    // almacenamiento lleno: el cambio sigue en el dispositivo y "Volver a subir" lo recupera
  }
}

export function pendientes(cola: Cola | null): number {
  return cola ? Object.keys(cola.cambios).length + (cola.negocio ? 1 : 0) : 0
}

/** Anota en la cola lo que cambió entre dos estados. Devuelve cuántos cambios quedan pendientes. */
export function encolar(a: Almacen, negocioId: string, antes: EstadoGuardado, despues: EstadoGuardado, ahora: Date = new Date()): number {
  const { cambios, negocio } = diferencias(antes, despues, negocioId, ahora)
  const previa = leerCola(a)
  const cola: Cola = previa?.negocioId === negocioId ? previa : { negocioId, siguiente: 1, cambios: {}, negocio: null }
  if (cambios.length === 0 && !negocio) return pendientes(cola)

  for (const c of cambios) cola.cambios[clave(c)] = { ...c, v: cola.siguiente++ }
  if (negocio) cola.negocio = { fila: negocio, v: cola.siguiente++ }
  guardarCola(a, cola)
  return pendientes(cola)
}

// ---------- Envío ----------

export interface ResultadoEnvio {
  /** Versión de cada cambio que ya llegó (o que la nube rechazó por inválido) */
  hechos: Record<string, number>
  negocioHecho: number | null
  /** Cambios que la nube no acepta por sus datos; siguen en el dispositivo */
  rechazados: number
  /** Error de red o de sesión: lo que falta se reintenta después */
  error: ErrorAuth | null
}

/** Errores por el contenido de la fila (clases 22 y 23 de PostgreSQL): reintentar no los arregla */
export const esErrorDeDatos = (e: ErrorAuth) => typeof e.code === 'string' && /^2[23]/.test(e.code)

const ORDEN: TablaDeDatos[] = ['clientes', 'movimientos', 'productos', 'metodos_pago']

/**
 * Envía la cola: primero el negocio, luego lo que se guarda (clientes antes que sus movimientos)
 * y al final lo borrado. Si un lote tiene una fila inválida, se envía fila por fila y se descarta
 * solo la inválida, para que un dato malo no bloquee la cola para siempre.
 */
export async function enviarCola(destino: DestinoSync, cola: Cola, ahora: Date = new Date()): Promise<ResultadoEnvio> {
  const r: ResultadoEnvio = { hechos: {}, negocioHecho: null, rechazados: 0, error: null }
  const entradas = Object.values(cola.cambios)

  if (cola.negocio) {
    const e = await destino.actualizarNegocio(cola.negocio.fila)
    if (e) return { ...r, error: e }
    r.negocioHecho = cola.negocio.v
  }

  for (const tabla of ORDEN) {
    const guardar = entradas.filter((c): c is Entrada & { fila: object } => c.tabla === tabla && 'fila' in c)
    for (const lote of dividirEnLotes(guardar, TAMANO_LOTE)) {
      const e = await destino.guardar(tabla, lote.map((c) => c.fila))
      if (!e) {
        for (const c of lote) r.hechos[clave(c)] = c.v
        continue
      }
      if (!esErrorDeDatos(e)) return { ...r, error: e }
      for (const c of lote) {
        const e1 = await destino.guardar(tabla, [c.fila])
        if (e1 && !esErrorDeDatos(e1)) return { ...r, error: e1 }
        if (e1) r.rechazados++
        r.hechos[clave(c)] = c.v
      }
    }
  }

  for (const tabla of ORDEN) {
    const borrar = entradas.filter((c) => c.tabla === tabla && 'borrar' in c)
    for (const lote of dividirEnLotes(borrar, TAMANO_LOTE)) {
      const e = await destino.borrar(tabla, lote.map((c) => c.id), ahora.toISOString())
      if (e) return { ...r, error: e }
      for (const c of lote) r.hechos[clave(c)] = c.v
    }
  }
  return r
}

/** Quita de la cola lo enviado, salvo lo que volvió a cambiar durante el envío */
export function quitarEnviados(a: Almacen, negocioId: string, r: ResultadoEnvio): number {
  const cola = leerCola(a)
  if (!cola || cola.negocioId !== negocioId) return pendientes(cola)
  for (const [k, v] of Object.entries(r.hechos)) if (cola.cambios[k]?.v === v) delete cola.cambios[k]
  if (cola.negocio && cola.negocio.v === r.negocioHecho) cola.negocio = null
  guardarCola(a, cola)
  return pendientes(cola)
}

/** Espera antes de reintentar tras un error: 5 s, 10 s, 20 s… hasta 5 minutos */
export function esperaReintento(intentos: number): number {
  return Math.min(5000 * 2 ** Math.max(intentos - 1, 0), 5 * 60 * 1000)
}

// ---------- Lo que ve la persona ----------

export interface EstadoSync {
  activa: boolean
  pendientes: number
  enviando: boolean
  sinConexion: boolean
  error: ErrorAuth | null
  rechazados: number
}

const quedan = (n: number) => (n === 1 ? 'Queda 1 cambio' : 'Quedan ' + n + ' cambios') + ' por guardar'

/** La sesión venció o se cerró: reintentar no sirve hasta volver a entrar */
export const esErrorDeSesion = (e: ErrorAuth) =>
  e.status === 401 || e.status === 403 || e.code === '42501' || e.code === 'PGRST301' || e.code === 'PGRST303'

/** Una línea que dice si todo está en la nube y, si no, qué va a pasar */
export function textoEstadoSync(e: EstadoSync): string {
  let texto: string
  if (e.enviando) texto = 'Guardando en la nube…'
  else if (e.pendientes === 0) texto = 'Todo guardado en la nube.'
  else if (e.sinConexion || (e.error && (e.error.status === undefined || e.error.status === 0))) {
    texto = 'Sin conexión: ' + (e.pendientes === 1 ? '1 cambio se guardará' : e.pendientes + ' cambios se guardarán') + ' al volver la red.'
  } else if (e.error && esErrorDeSesion(e.error)) texto = 'Tu sesión se cerró. ' + quedan(e.pendientes) + ': entra de nuevo con tu correo.'
  else if (e.error) texto = 'No se pudo guardar en la nube. ' + quedan(e.pendientes) + '; se reintentará solo.'
  else texto = quedan(e.pendientes) + ' en la nube.'
  if (e.rechazados > 0) {
    texto += e.rechazados === 1
      ? ' 1 cambio no se aceptó en la nube; sigue en este dispositivo.'
      : ' ' + e.rechazados + ' cambios no se aceptaron en la nube; siguen en este dispositivo.'
  }
  return texto
}
