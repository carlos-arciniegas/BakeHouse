import { describe, expect, it } from 'vitest'
import type { EstadoGuardado } from './almacenamiento'
import type { ErrorAuth } from './cuenta'
import { CLAVE_SUBIDA, guardarSubida, leerSubida, porcentaje, subirDatos, TAMANO_LOTE, textoResumen, type Destino, type TablaDeDatos } from './subida'

const NEGOCIO = '11111111-1111-1111-1111-111111111111'

function estadoCon(clientes: number, movimientosPorCliente: number): EstadoGuardado {
  return {
    clientes: Array.from({ length: clientes }, (_, i) => ({
      id: 'cli_' + i, nombre: 'Cliente ' + i, telefono: '', nota: '',
      movimientos: Array.from({ length: movimientosPorCliente }, (_, j) => ({
        id: `mov_${i}_${j}`, tipo: 'venta' as const, descripcion: '', monto: 1, fecha: '2026-11-20',
      })),
    })),
    catalogo: [{ id: 'prod_1', nombre: 'Galleta', precio: 1.5 }],
    metodos: [{ id: 'met_1', tipo: 'pagomovil', datos: {}, activo: true }],
    negocio: { nombre: "Pachon's Bakehouse", pais: 'VE' },
    bcv: { tasa: 100, actualizado: 'BCV' },
    mensajeCobro: '',
    inventario: {},
  }
}

/** Destino en memoria que anota cada envío; puede fallar en el envío número "fallarEn" */
function destinoFalso(fallarEn?: number, error: ErrorAuth = { status: 0 }) {
  const envios: { tabla: TablaDeDatos | 'negocios'; filas: number }[] = []
  const destino: Destino = {
    actualizarNegocio: async () => {
      envios.push({ tabla: 'negocios', filas: 1 })
      return null
    },
    guardar: async (tabla, filas) => {
      if (envios.length === fallarEn) return error
      envios.push({ tabla, filas: filas.length })
      return null
    },
  }
  return { destino, envios }
}

function memoria() {
  const datos = new Map<string, string>()
  return { datos, getItem: (k: string) => datos.get(k) ?? null, setItem: (k: string, v: string) => void datos.set(k, v) }
}

describe('subirDatos', () => {
  it('sube el negocio y luego clientes antes que movimientos, en lotes', async () => {
    const { destino, envios } = destinoFalso()
    const avance: number[] = []
    const r = await subirDatos(destino, estadoCon(TAMANO_LOTE + 1, 2), NEGOCIO, (e) => avance.push(e), new Date('2026-11-20T12:00:00Z'))

    expect(envios).toEqual([
      { tabla: 'negocios', filas: 1 },
      { tabla: 'clientes', filas: TAMANO_LOTE },
      { tabla: 'clientes', filas: 1 },
      { tabla: 'movimientos', filas: TAMANO_LOTE },
      { tabla: 'movimientos', filas: TAMANO_LOTE },
      { tabla: 'movimientos', filas: 2 },
      { tabla: 'productos', filas: 1 },
      { tabla: 'metodos_pago', filas: 1 },
    ])
    expect(r).toEqual({ ok: true, resumen: { negocioId: NEGOCIO, fecha: '2026-11-20T12:00:00.000Z', clientes: 501, movimientos: 1002 } })
    expect(avance[0]).toBe(0)
    expect(avance.at(-1)).toBe(501 + 1002 + 2)
  })

  it('si falla un lote se detiene y dice cuántas filas alcanzó a subir', async () => {
    const { destino, envios } = destinoFalso(2)
    const r = await subirDatos(destino, estadoCon(3, 1), NEGOCIO)
    expect(r).toEqual({ ok: false, error: { status: 0 }, enviadas: 3 })
    expect(envios.map((e) => e.tabla)).toEqual(['negocios', 'clientes'])
  })

  it('sin datos también termina bien', async () => {
    const { destino } = destinoFalso()
    const estado = { ...estadoCon(0, 0), catalogo: [], metodos: [] }
    const r = await subirDatos(destino, estado, NEGOCIO)
    expect(r.ok && r.resumen).toMatchObject({ clientes: 0, movimientos: 0 })
  })
})

describe('resumen de la última subida', () => {
  it('se guarda y se lee', () => {
    const a = memoria()
    expect(leerSubida(a)).toBeNull()
    const resumen = { negocioId: NEGOCIO, fecha: '2026-11-20T12:00:00.000Z', clientes: 2, movimientos: 5 }
    guardarSubida(a, resumen)
    expect(leerSubida(a)).toEqual(resumen)
  })

  it('ignora lo que no tenga forma de resumen', () => {
    const a = memoria()
    a.setItem(CLAVE_SUBIDA, '{roto')
    expect(leerSubida(a)).toBeNull()
    a.setItem(CLAVE_SUBIDA, '{"clientes": 2}')
    expect(leerSubida(a)).toBeNull()
  })

  it('cuenta en singular y en plural', () => {
    expect(textoResumen({ clientes: 42, movimientos: 318 })).toBe('42 clientes y 318 movimientos')
    expect(textoResumen({ clientes: 1, movimientos: 1 })).toBe('1 cliente y 1 movimiento')
  })

  it('porcentaje de avance', () => {
    expect(porcentaje(0, 10)).toBe(0)
    expect(porcentaje(4, 10)).toBe(40)
    expect(porcentaje(0, 0)).toBe(100)
  })
})
