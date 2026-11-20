import { migrarPagoMovil, type PagoMovilAntiguo } from '../logica/metodosPago'
import { normalizarTelefono } from '../logica/telefono'
import type { Cliente, Movimiento, Negocio, Pais } from '../logica/tipos'
import { sanearCatalogo, sanearClientes, sanearMetodos, sanearNegocio, type EstadoGuardado } from './almacenamiento'

/** El archivo .json que descarga "Descargar copia" */
export function crearRespaldo(estado: EstadoGuardado) {
  return {
    clientes: estado.clientes,
    catalogo: estado.catalogo,
    metodosPago: estado.metodos,
    negocio: estado.negocio,
    bcv: estado.bcv,
  }
}

/**
 * Lee un respaldo y devuelve el estado restaurado, o null si el archivo no es válido.
 * Acepta respaldos viejos (con "pagoMovil" en lugar de "metodosPago" y sin "negocio").
 * Lo que el archivo no trae se conserva del estado actual.
 */
export function leerRespaldo(texto: string, actual: EstadoGuardado): EstadoGuardado | null {
  let datos: Record<string, unknown>
  try {
    datos = JSON.parse(texto)
  } catch {
    return null
  }
  const clientes = sanearClientes(datos?.clientes)
  if (!clientes) return null

  const metodos = sanearMetodos(datos.metodosPago)
    ?? (datos.pagoMovil ? migrarPagoMovil(datos.pagoMovil as PagoMovilAntiguo) : null)
  const bcv = datos.bcv as EstadoGuardado['bcv'] | undefined

  return {
    clientes,
    catalogo: sanearCatalogo(datos.catalogo) ?? actual.catalogo,
    metodos: metodos ?? actual.metodos,
    negocio: sanearNegocio(datos.negocio) ?? actual.negocio,
    bcv: bcv && Number(bcv.tasa) > 0 ? { tasa: Number(bcv.tasa), actualizado: String(bcv.actualizado ?? '') } : actual.bcv,
  }
}

/** "respaldo-pachon-s-bakehouse-2026-11-20.json" */
export function nombreArchivoRespaldo(negocio: Negocio, fecha: string): string {
  const slug = negocio.nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita los acentos sueltos que deja NFD: "í" → "i", "ñ" → "n"
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'negocio'
  return 'respaldo-' + slug + '-' + fecha + '.json'
}

/**
 * Lee un CSV exportado de Excel con columnas Nombre, Telefono, Deuda (separadas por coma o punto y coma).
 * La primera fila se salta si es un encabezado. Las filas sin nombre o sin teléfono válido se ignoran.
 */
export function importarCSV(texto: string, pais: Pais, hoy: string, sello: number = Date.now()): Cliente[] {
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim().length > 0)
  const clientes: Cliente[] = []

  lineas.forEach((linea, idx) => {
    const sep = linea.includes(';') ? ';' : ','
    const cols = linea.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''))
    if (idx === 0 && /nombre|cliente/i.test(cols[0])) return

    const nombre = cols[0]
    const telefono = normalizarTelefono(cols[1] ?? '', pais)
    const deuda = parseFloat((cols[2] ?? '0').replace(',', '.'))
    if (!nombre || telefono.length < 8) return

    const movimientos: Movimiento[] = []
    if (!isNaN(deuda) && deuda > 0) {
      movimientos.push({
        id: 'mov_csv_' + sello + '_' + idx,
        tipo: 'venta',
        descripcion: 'Saldo importado de Excel',
        monto: Math.round(deuda * 100) / 100,
        fecha: hoy,
      })
    }
    clientes.push({ id: 'cli_csv_' + sello + '_' + idx, nombre, telefono, nota: 'Importado CSV', movimientos })
  })

  return clientes
}
