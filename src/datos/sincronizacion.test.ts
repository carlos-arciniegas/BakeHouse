import { describe, expect, it } from 'vitest'
import { reductor } from '../estado/reductor'
import type { EstadoGuardado } from './almacenamiento'
import { CLAVE_VINCULO, type ErrorAuth } from './cuenta'
import {
  diferencias, encolar, enviarCola, esperaReintento, leerCola, negocioSincronizado, pendientes, quitarEnviados, textoEstadoSync,
  type DestinoSync, type EstadoSync,
} from './sincronizacion'
import { CLAVE_SUBIDA, type TablaDeDatos } from './subida'

const NEGOCIO = '11111111-1111-1111-1111-111111111111'
const AHORA = new Date('2026-11-20T12:00:00Z')

const base: EstadoGuardado = {
  clientes: [
    { id: 'cli_1', nombre: 'José', telefono: '584149876543', nota: '', movimientos: [
      { id: 'mov_1', tipo: 'venta', descripcion: '2x Galleta', monto: 3, fecha: '2026-11-19' },
    ] },
    { id: 'cli_2', nombre: 'Ana', telefono: '', nota: '', movimientos: [] },
  ],
  catalogo: [{ id: 'prod_1', nombre: 'Galleta', precio: 1.5 }, { id: 'prod_2', nombre: 'Brownie', precio: 2.5 }],
  metodos: [{ id: 'met_1', tipo: 'pagomovil', datos: { banco: 'Banesco' }, activo: true }],
  negocio: { nombre: "Pachon's Bakehouse", pais: 'VE' },
  bcv: { tasa: 100, actualizado: 'BCV' },
  mensajeCobro: '',
  inventario: {},
}

const resumen = (r: ReturnType<typeof diferencias>) => r.cambios.map((c) => ('borrar' in c ? '-' : '+') + c.tabla + '/' + c.id)

function memoria() {
  const datos = new Map<string, string>()
  return { datos, getItem: (k: string) => datos.get(k) ?? null, setItem: (k: string, v: string) => void datos.set(k, v) }
}

describe('diferencias', () => {
  it('una venta nueva es solo esa fila', () => {
    const despues = reductor(base, { tipo: 'movimientos/agregar', clienteId: 'cli_1', movimientos: [
      { id: 'mov_2', tipo: 'abono', descripcion: 'Pago (Efectivo)', monto: 3, fecha: '2026-11-20' },
    ] })
    const r = diferencias(base, despues, NEGOCIO, AHORA)
    expect(resumen(r)).toEqual(['+movimientos/mov_2'])
    expect(r.cambios[0]).toMatchObject({ fila: { negocio_id: NEGOCIO, cliente_id: 'cli_1', tipo: 'abono', monto: 3, borrado_en: null } })
    expect(r.negocio).toBeNull()
  })

  it('borrar un movimiento lo marca como borrado; deshacer lo vuelve a guardar', () => {
    const sinMov = reductor(base, { tipo: 'movimiento/eliminar', clienteId: 'cli_1', movId: 'mov_1' })
    expect(resumen(diferencias(base, sinMov, NEGOCIO))).toEqual(['-movimientos/mov_1'])
    const restaurado = reductor(sinMov, { tipo: 'movimiento/restaurar', clienteId: 'cli_1', movimiento: base.clientes[0].movimientos[0], indice: 0 })
    expect(resumen(diferencias(sinMov, restaurado, NEGOCIO))).toEqual(['+movimientos/mov_1'])
  })

  it('borrar un cliente borra también sus movimientos', () => {
    const despues = reductor(base, { tipo: 'cliente/eliminar', id: 'cli_1' })
    expect(resumen(diferencias(base, despues, NEGOCIO))).toEqual(['-clientes/cli_1', '-movimientos/mov_1'])
  })

  it('editar un cliente no reenvía sus movimientos', () => {
    const despues = reductor(base, { tipo: 'cliente/editar', id: 'cli_2', nombre: 'Ana María', telefono: '', nota: 'Vecina' })
    expect(resumen(diferencias(base, despues, NEGOCIO))).toEqual(['+clientes/cli_2'])
  })

  it('quitar un producto lo borra y reordena los que siguen', () => {
    const despues = reductor(base, { tipo: 'catalogo/eliminar', indice: 0 })
    expect(resumen(diferencias(base, despues, NEGOCIO))).toEqual(['+productos/prod_2', '-productos/prod_1'])
  })

  it('apagar un método de pago lo guarda', () => {
    const despues = reductor(base, { tipo: 'metodo/alternar', id: 'met_1', activo: false })
    expect(diferencias(base, despues, NEGOCIO).cambios).toMatchObject([{ tabla: 'metodos_pago', id: 'met_1', fila: { activo: false } }])
  })

  it('el negocio y la tasa van en la fila del negocio, solo si cambiaron', () => {
    const despues = reductor(base, { tipo: 'bcv/guardar', bcv: { tasa: 101, actualizado: 'BCV 9:30' } })
    expect(diferencias(base, despues, NEGOCIO).negocio).toEqual({ nombre: "Pachon's Bakehouse", pais: 'VE', tasa_bcv: 101, tasa_bcv_actualizada: 'BCV 9:30' })
    const igual = reductor(base, { tipo: 'bcv/guardar', bcv: { ...base.bcv } })
    expect(diferencias(base, igual, NEGOCIO).negocio).toBeNull()
  })

  it('restaurar una copia envía solo lo que de verdad cambió', () => {
    const copia = structuredClone(base)
    copia.clientes[1].nota = 'Vecina'
    const despues = reductor(base, { tipo: 'estado/reemplazar', estado: copia })
    expect(resumen(diferencias(base, despues, NEGOCIO))).toEqual(['+clientes/cli_2'])
  })
})

describe('la cola', () => {
  it('se activa solo tras subir los datos a ese negocio', () => {
    const a = memoria()
    expect(negocioSincronizado(a)).toBeNull()
    a.setItem(CLAVE_VINCULO, NEGOCIO)
    expect(negocioSincronizado(a)).toBeNull()
    a.setItem(CLAVE_SUBIDA, JSON.stringify({ negocioId: NEGOCIO, fecha: '', clientes: 0, movimientos: 0 }))
    expect(negocioSincronizado(a)).toBe(NEGOCIO)
    a.setItem(CLAVE_VINCULO, 'otro')
    expect(negocioSincronizado(a)).toBeNull()
  })

  it('de cada fila guarda solo el último cambio', () => {
    const a = memoria()
    const sinMov = reductor(base, { tipo: 'movimiento/eliminar', clienteId: 'cli_1', movId: 'mov_1' })
    expect(encolar(a, NEGOCIO, base, sinMov)).toBe(1)
    const otraVez = reductor(sinMov, { tipo: 'movimiento/restaurar', clienteId: 'cli_1', movimiento: base.clientes[0].movimientos[0], indice: 0 })
    expect(encolar(a, NEGOCIO, sinMov, otraVez)).toBe(1)
    expect(Object.values(leerCola(a)!.cambios)).toMatchObject([{ tabla: 'movimientos', id: 'mov_1', fila: { borrado_en: null } }])
  })

  it('al cambiar de negocio empieza de cero', () => {
    const a = memoria()
    encolar(a, NEGOCIO, base, reductor(base, { tipo: 'cliente/eliminar', id: 'cli_2' }))
    encolar(a, 'otro', base, reductor(base, { tipo: 'metodo/eliminar', id: 'met_1' }))
    expect(leerCola(a)).toMatchObject({ negocioId: 'otro' })
    expect(pendientes(leerCola(a))).toBe(1)
  })
})

/** Destino en memoria: anota envíos y puede fallar según la tabla o la fila */
function destinoFalso(falla: (tabla: TablaDeDatos | 'negocios', filas: { id?: string }[]) => ErrorAuth | null = () => null) {
  const envios: string[] = []
  const destino: DestinoSync = {
    actualizarNegocio: async () => falla('negocios', []) ?? (envios.push('negocio'), null),
    guardar: async (tabla, filas) => falla(tabla, filas as { id: string }[]) ?? (envios.push('+' + tabla + ':' + (filas as { id: string }[]).map((f) => f.id).join(',')), null),
    borrar: async (tabla, ids) => falla(tabla, ids.map((id) => ({ id }))) ?? (envios.push('-' + tabla + ':' + ids.join(',')), null),
  }
  return { destino, envios }
}

function colaCon(...estados: EstadoGuardado[]) {
  const a = memoria()
  for (let i = 1; i < estados.length; i++) encolar(a, NEGOCIO, estados[i - 1], estados[i])
  return a
}

describe('enviarCola', () => {
  const conCambios = [
    base,
    reductor(base, { tipo: 'bcv/guardar', bcv: { tasa: 101, actualizado: 'BCV' } }),
  ]
  conCambios.push(reductor(conCambios[1], { tipo: 'cliente/agregar', cliente: { id: 'cli_3', nombre: 'Luis', telefono: '', nota: '', movimientos: [
    { id: 'mov_3', tipo: 'venta', descripcion: '', monto: 2, fecha: '2026-11-20' },
  ] } }))
  conCambios.push(reductor(conCambios[2], { tipo: 'cliente/eliminar', id: 'cli_2' }))

  it('envía el negocio, luego clientes antes que movimientos y al final lo borrado; la cola queda vacía', async () => {
    const a = colaCon(...conCambios)
    const { destino, envios } = destinoFalso()
    const r = await enviarCola(destino, leerCola(a)!)
    expect(envios).toEqual(['negocio', '+clientes:cli_3', '+movimientos:mov_3', '-clientes:cli_2'])
    expect(r.error).toBeNull()
    expect(quitarEnviados(a, NEGOCIO, r)).toBe(0)
  })

  it('sin red se detiene y conserva lo que falta', async () => {
    const a = colaCon(...conCambios)
    const { destino } = destinoFalso((tabla) => (tabla === 'movimientos' ? { status: 0 } : null))
    const r = await enviarCola(destino, leerCola(a)!)
    expect(r.error).toEqual({ status: 0 })
    expect(quitarEnviados(a, NEGOCIO, r)).toBe(2)
    expect(Object.keys(leerCola(a)!.cambios)).toEqual(['movimientos/mov_3', 'clientes/cli_2'])
  })

  it('lo que cambia durante el envío no se pierde', async () => {
    const a = colaCon(base, conCambios[2])
    const r = await enviarCola(destinoFalso().destino, leerCola(a)!)
    // Mientras se enviaba, se editó el cliente nuevo
    encolar(a, NEGOCIO, conCambios[2], reductor(conCambios[2], { tipo: 'cliente/editar', id: 'cli_3', nombre: 'Luis Pérez', telefono: '', nota: '' }))
    quitarEnviados(a, NEGOCIO, r)
    expect(Object.keys(leerCola(a)!.cambios)).toEqual(['clientes/cli_3'])
  })

  it('una fila inválida no bloquea la cola: se descarta solo esa', async () => {
    const a = colaCon(base, conCambios[2])
    const invalido = { status: 400, code: '23514' }
    const { destino, envios } = destinoFalso((tabla) => (tabla === 'movimientos' ? invalido : null))
    const r = await enviarCola(destino, leerCola(a)!)
    expect(r).toMatchObject({ error: null, rechazados: 1 })
    expect(envios).toEqual(['negocio', '+clientes:cli_3'])
    expect(quitarEnviados(a, NEGOCIO, r)).toBe(0)
  })
})

describe('reintentos y textos', () => {
  it('espera cada vez más, hasta 5 minutos', () => {
    expect([1, 2, 3, 20].map(esperaReintento)).toEqual([5000, 10000, 20000, 300000])
  })

  const e = (x: Partial<EstadoSync>): EstadoSync => ({ activa: true, pendientes: 0, enviando: false, sinConexion: false, error: null, rechazados: 0, ...x })

  it('dice si todo está guardado y, si no, qué va a pasar', () => {
    expect(textoEstadoSync(e({}))).toBe('Todo guardado en la nube.')
    expect(textoEstadoSync(e({ enviando: true, pendientes: 2 }))).toBe('Guardando en la nube…')
    expect(textoEstadoSync(e({ sinConexion: true, pendientes: 3 }))).toBe('Sin conexión: 3 cambios se guardarán al volver la red.')
    expect(textoEstadoSync(e({ error: { status: 0 }, pendientes: 1 }))).toBe('Sin conexión: 1 cambio se guardará al volver la red.')
    expect(textoEstadoSync(e({ error: { status: 401 }, pendientes: 2 }))).toBe('Tu sesión se cerró. Quedan 2 cambios por guardar: entra de nuevo con tu correo.')
    expect(textoEstadoSync(e({ error: { status: 500 }, pendientes: 1 }))).toBe('No se pudo guardar en la nube. Queda 1 cambio por guardar; se reintentará solo.')
    expect(textoEstadoSync(e({ rechazados: 1 }))).toBe('Todo guardado en la nube. 1 cambio no se aceptó en la nube; sigue en este dispositivo.')
  })
})
