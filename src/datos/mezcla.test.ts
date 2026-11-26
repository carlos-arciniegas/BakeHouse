import { describe, expect, it } from 'vitest'
import { reductor } from '../estado/reductor'
import type { EstadoGuardado } from './almacenamiento'
import { aplicarDesdeNube, type CambiosDeLaNube } from './mezcla'
import type { FilaCliente, FilaMetodo, FilaMovimiento, FilaNegocio, FilaProducto, FilasRecibidas } from './nube'

const NEGOCIO = '11111111-1111-1111-1111-111111111111'
const servidor = { negocio_id: NEGOCIO, creado_en: '2026-11-20T10:00:00Z', actualizado_en: '2026-11-20T10:00:00Z', borrado_en: null }

const cliente = (x: Partial<FilaCliente> & { id: string }): FilaCliente => ({ ...servidor, nombre: 'Sin nombre', telefono: '', nota: '', ...x })
const movimiento = (x: Partial<FilaMovimiento> & { id: string; cliente_id: string }): FilaMovimiento => ({
  ...servidor, tipo: 'venta', descripcion: '', monto: 1, fecha: '2026-11-20', productos: null, ...x,
})
const producto = (x: Partial<FilaProducto> & { id: string }): FilaProducto => ({ ...servidor, nombre: 'Producto', precio: 1, orden: 0, ...x })
const metodo = (x: Partial<FilaMetodo> & { id: string }): FilaMetodo => ({ ...servidor, tipo: 'bizum', datos: {}, activo: true, orden: 0, ...x })

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
}

function cambios(filas: Partial<FilasRecibidas>, extra: Partial<CambiosDeLaNube> = {}): CambiosDeLaNube {
  return { filas: { clientes: [], movimientos: [], productos: [], metodos: [], ...filas }, negocio: null, pendientes: [], ...extra }
}

describe('aplicarDesdeNube', () => {
  it('si no hay nada nuevo devuelve el mismo estado (no se guarda ni se envía nada)', () => {
    const iguales = cambios({
      clientes: [cliente({ id: 'cli_1', nombre: 'José', telefono: '584149876543' })],
      movimientos: [movimiento({ id: 'mov_1', cliente_id: 'cli_1', descripcion: '2x Galleta', monto: '3.00' as unknown as number, fecha: '2026-11-19' })],
      productos: [producto({ id: 'prod_1', nombre: 'Galleta', precio: 1.5, orden: 0 })],
    })
    expect(aplicarDesdeNube(base, iguales)).toBe(base)
  })

  it('agrega el pago anotado en otro dispositivo al final del historial', () => {
    const r = aplicarDesdeNube(base, cambios({
      movimientos: [movimiento({ id: 'mov_2', cliente_id: 'cli_1', tipo: 'abono', descripcion: 'Pago (Efectivo)', monto: 3 })],
    }))
    expect(r.clientes[0].movimientos.map((m) => m.id)).toEqual(['mov_1', 'mov_2'])
    expect(r.clientes[1]).toBe(base.clientes[1])
    expect(r.catalogo).toBe(base.catalogo)
  })

  it('un cliente nuevo llega con sus movimientos', () => {
    const r = aplicarDesdeNube(base, cambios({
      clientes: [cliente({ id: 'cli_3', nombre: 'Luis', creado_en: '2026-11-20T11:00:00Z' })],
      movimientos: [movimiento({ id: 'mov_3', cliente_id: 'cli_3', monto: 4 })],
    }))
    expect(r.clientes.map((c) => c.id)).toEqual(['cli_1', 'cli_2', 'cli_3'])
    expect(r.clientes[2].movimientos).toEqual([{ id: 'mov_3', tipo: 'venta', descripcion: '', monto: 4, fecha: '2026-11-20' }])
  })

  it('lo borrado en otro dispositivo se quita aquí', () => {
    const r = aplicarDesdeNube(base, cambios({
      clientes: [cliente({ id: 'cli_2', borrado_en: '2026-11-20T11:00:00Z' })],
      movimientos: [movimiento({ id: 'mov_1', cliente_id: 'cli_1', borrado_en: '2026-11-20T11:00:00Z' })],
      productos: [producto({ id: 'prod_1', borrado_en: '2026-11-20T11:00:00Z' })],
    }))
    expect(r.clientes.map((c) => c.id)).toEqual(['cli_1'])
    expect(r.clientes[0].movimientos).toEqual([])
    expect(r.catalogo.map((p) => p.id)).toEqual(['prod_2'])
  })

  it('lo que tiene cambios locales sin enviar no se pisa', () => {
    const editado = reductor(base, { tipo: 'cliente/editar', id: 'cli_2', nombre: 'Ana María', telefono: '', nota: '' })
    const r = aplicarDesdeNube(editado, cambios(
      { clientes: [cliente({ id: 'cli_2', nombre: 'Ana (vieja)' })] },
      { pendientes: ['clientes/cli_2'] },
    ))
    expect(r.clientes[1].nombre).toBe('Ana María')
  })

  it('edita sin mover de lugar y respeta el orden del catálogo de la nube', () => {
    const r = aplicarDesdeNube(base, cambios({
      clientes: [cliente({ id: 'cli_1', nombre: 'José Rodríguez', telefono: '584149876543' })],
      productos: [producto({ id: 'prod_2', nombre: 'Brownie', precio: 2.5, orden: 0 }), producto({ id: 'prod_1', nombre: 'Galleta', precio: 1.5, orden: 1 })],
      metodos: [metodo({ id: 'met_2', tipo: 'bizum', datos: { telefono: '600' }, orden: 1 }), metodo({ id: 'met_x', tipo: 'cheque', orden: 2 })],
    }))
    expect(r.clientes[0]).toMatchObject({ nombre: 'José Rodríguez', movimientos: base.clientes[0].movimientos })
    expect(r.catalogo.map((p) => p.id)).toEqual(['prod_2', 'prod_1'])
    // Un tipo de método desconocido se ignora
    expect(r.metodos.map((m) => m.id)).toEqual(['met_1', 'met_2'])
  })

  it('toma nombre y país del negocio; la tasa solo si aquí no hay', () => {
    const fila: FilaNegocio = { id: NEGOCIO, nombre: 'Pachon\'s', pais: 'VE', tasa_bcv: 90, tasa_bcv_actualizada: 'BCV ayer', creado_en: '', actualizado_en: '' }
    const r = aplicarDesdeNube(base, cambios({}, { negocio: fila }))
    expect(r.negocio.nombre).toBe("Pachon's")
    expect(r.bcv).toBe(base.bcv)
    const sinTasa = aplicarDesdeNube({ ...base, bcv: { tasa: 0, actualizado: '' } }, cambios({}, { negocio: fila }))
    expect(sinTasa.bcv).toEqual({ tasa: 90, actualizado: 'BCV ayer' })
  })

  it('en un dispositivo nuevo reemplaza todo por lo de la nube', () => {
    const r = aplicarDesdeNube(base, cambios({
      clientes: [cliente({ id: 'cli_9', nombre: 'Marta' })],
      movimientos: [movimiento({ id: 'mov_9', cliente_id: 'cli_9', monto: 7 })],
      productos: [producto({ id: 'prod_9', nombre: 'Torta', precio: 20 })],
    }, { reemplazar: true }))
    expect(r.clientes.map((c) => [c.id, c.movimientos.length])).toEqual([['cli_9', 1]])
    expect(r.catalogo.map((p) => p.id)).toEqual(['prod_9'])
    expect(r.metodos).toEqual([])
  })
})
