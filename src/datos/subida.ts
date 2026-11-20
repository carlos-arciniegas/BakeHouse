import type { Almacen, EstadoGuardado } from './almacenamiento'
import type { ErrorAuth } from './cuenta'
import { datosAFilas, dividirEnLotes, negocioAFila, type FilasParaSubir } from './nube'

// "Subir mis datos": envía todo lo del dispositivo al negocio en la nube.
// La red entra por parámetro (Destino) para poder probarlo sin Supabase.

export type TablaDeDatos = 'clientes' | 'movimientos' | 'productos' | 'metodos_pago'

export interface Destino {
  /** Inserta o actualiza por (negocio_id, id): repetir la subida no duplica nada */
  guardar(tabla: TablaDeDatos, filas: object[]): Promise<ErrorAuth | null>
  actualizarNegocio(fila: ReturnType<typeof negocioAFila>): Promise<ErrorAuth | null>
}

export const TAMANO_LOTE = 500

/** Última subida hecha desde este dispositivo */
export const CLAVE_SUBIDA = 'pachons_nube_subida_v1'

export interface ResumenSubida {
  negocioId: string
  fecha: string
  clientes: number
  movimientos: number
}

export type ResultadoSubida =
  | { ok: true; resumen: ResumenSubida }
  | { ok: false; error: ErrorAuth; enviadas: number }

/** Los clientes van antes que sus movimientos (la base exige que el cliente exista) */
function pasos(filas: FilasParaSubir): [TablaDeDatos, object[]][] {
  return ([
    ['clientes', filas.clientes],
    ['movimientos', filas.movimientos],
    ['productos', filas.productos],
    ['metodos_pago', filas.metodos],
  ] as [TablaDeDatos, object[]][]).flatMap(([tabla, lista]) =>
    dividirEnLotes(lista, TAMANO_LOTE).map((lote): [TablaDeDatos, object[]] => [tabla, lote]))
}

/**
 * Sube los datos lote por lote y avisa del avance (filas enviadas de un total).
 * Si algo falla se detiene: lo ya enviado queda en la nube y al reintentar se sobrescribe, no se duplica.
 */
export async function subirDatos(
  destino: Destino,
  estado: EstadoGuardado,
  negocioId: string,
  alAvanzar: (enviadas: number, total: number) => void = () => {},
  ahora: Date = new Date(),
): Promise<ResultadoSubida> {
  const filas = datosAFilas(estado, negocioId, ahora.getTime())
  const lotes = pasos(filas)
  const total = lotes.reduce((suma, [, lote]) => suma + lote.length, 0)
  let enviadas = 0
  alAvanzar(0, total)

  const errorNegocio = await destino.actualizarNegocio(negocioAFila(estado.negocio, estado.bcv))
  if (errorNegocio) return { ok: false, error: errorNegocio, enviadas }

  for (const [tabla, lote] of lotes) {
    const error = await destino.guardar(tabla, lote)
    if (error) return { ok: false, error, enviadas }
    enviadas += lote.length
    alAvanzar(enviadas, total)
  }

  return {
    ok: true,
    resumen: { negocioId, fecha: ahora.toISOString(), clientes: filas.clientes.length, movimientos: filas.movimientos.length },
  }
}

export function leerSubida(a: Almacen): ResumenSubida | null {
  try {
    const r = JSON.parse(a.getItem(CLAVE_SUBIDA) ?? 'null') as ResumenSubida | null
    return r && typeof r.negocioId === 'string' && typeof r.fecha === 'string' ? r : null
  } catch {
    return null
  }
}

export function guardarSubida(a: Almacen, resumen: ResumenSubida): void {
  try {
    a.setItem(CLAVE_SUBIDA, JSON.stringify(resumen))
  } catch {
    // sin almacenamiento: solo se pierde el resumen de la última subida
  }
}

/** Al cerrar sesión: lo que se anote mientras tanto no queda en la cola, así que habrá que volver a subir todo */
export function olvidarSubida(a: Pick<Storage, 'removeItem'>): void {
  try {
    a.removeItem(CLAVE_SUBIDA)
  } catch {
    // sin almacenamiento
  }
}

const contar = (n: number, uno: string, varios: string) => n + ' ' + (n === 1 ? uno : varios)

/** "42 clientes y 318 movimientos" */
export function textoResumen(r: Pick<ResumenSubida, 'clientes' | 'movimientos'>): string {
  return contar(r.clientes, 'cliente', 'clientes') + ' y ' + contar(r.movimientos, 'movimiento', 'movimientos')
}

/** Porcentaje entero para el botón ("Subiendo… 40 %") */
export function porcentaje(enviadas: number, total: number): number {
  return total === 0 ? 100 : Math.floor((enviadas / total) * 100)
}
