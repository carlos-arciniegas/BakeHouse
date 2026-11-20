import { describe, expect, it } from 'vitest'
import type { EstadoGuardado } from '../datos/almacenamiento'
import { calcularResumenCliente } from '../logica/saldo'
import type { Movimiento } from '../logica/tipos'
import { reductor } from './reductor'

const mov = (id: string, tipo: Movimiento['tipo'], monto: number): Movimiento => ({ id, tipo, monto, descripcion: id, fecha: '2026-11-20' })

const inicial: EstadoGuardado = {
  clientes: [{ id: 'c1', nombre: 'Ana', telefono: '584121234567', nota: '', movimientos: [mov('a', 'venta', 5), mov('b', 'venta', 3)] }],
  catalogo: [{ nombre: 'Galleta', precio: 1.5 }, { nombre: 'Brownie', precio: 2.5 }],
  metodos: [{ id: 'm1', tipo: 'zelle', activo: true, datos: { contacto: 'a@b.c' } }],
  negocio: { nombre: 'Pachon\'s', pais: 'VE' },
  bcv: { tasa: 0, actualizado: '' },
}

describe('reductor', () => {
  it('no modifica el estado anterior', () => {
    const copia = JSON.stringify(inicial)
    reductor(inicial, { tipo: 'movimiento/eliminar', clienteId: 'c1', movId: 'a' })
    expect(JSON.stringify(inicial)).toBe(copia)
  })

  it('venta pagada: agregar venta y pago juntos deja el saldo igual', () => {
    const antes = calcularResumenCliente(inicial.clientes[0]).saldo
    const despues = reductor(inicial, { tipo: 'movimientos/agregar', clienteId: 'c1', movimientos: [mov('v', 'venta', 4), mov('p', 'abono', 4)] })
    expect(calcularResumenCliente(despues.clientes[0]).saldo).toBe(antes)
  })

  it('eliminar y restaurar un movimiento lo devuelve a su lugar', () => {
    const sin = reductor(inicial, { tipo: 'movimiento/eliminar', clienteId: 'c1', movId: 'a' })
    expect(sin.clientes[0].movimientos.map((m) => m.id)).toEqual(['b'])
    const con = reductor(sin, { tipo: 'movimiento/restaurar', clienteId: 'c1', movimiento: inicial.clientes[0].movimientos[0], indice: 0 })
    expect(con.clientes[0].movimientos.map((m) => m.id)).toEqual(['a', 'b'])
  })

  it('el catálogo agrega, edita, elimina y restaura por posición', () => {
    let e = reductor(inicial, { tipo: 'catalogo/guardar', indice: null, producto: { nombre: 'Ponqué', precio: 2 } })
    expect(e.catalogo.map((p) => p.nombre)).toEqual(['Galleta', 'Brownie', 'Ponqué'])
    e = reductor(e, { tipo: 'catalogo/guardar', indice: 0, producto: { nombre: 'Galleta grande', precio: 2 } })
    expect(e.catalogo[0].nombre).toBe('Galleta grande')
    const quitado = e.catalogo[1]
    e = reductor(e, { tipo: 'catalogo/eliminar', indice: 1 })
    e = reductor(e, { tipo: 'catalogo/restaurar', indice: 1, producto: quitado })
    expect(e.catalogo.map((p) => p.nombre)).toEqual(['Galleta grande', 'Brownie', 'Ponqué'])
  })

  it('guardar un método agrega si es nuevo y reemplaza si ya existe', () => {
    let e = reductor(inicial, { tipo: 'metodo/guardar', metodo: { id: 'm2', tipo: 'bizum', activo: true, datos: { telefono: '600' } } })
    expect(e.metodos).toHaveLength(2)
    e = reductor(e, { tipo: 'metodo/guardar', metodo: { id: 'm1', tipo: 'zelle', activo: true, datos: { contacto: 'nuevo@b.c' } } })
    expect(e.metodos).toHaveLength(2)
    expect(e.metodos[0].datos.contacto).toBe('nuevo@b.c')
    e = reductor(e, { tipo: 'metodo/alternar', id: 'm2', activo: false })
    expect(e.metodos[1].activo).toBe(false)
  })

  it('borrar todo quita los clientes pero conserva catálogo, métodos y negocio', () => {
    const e = reductor(inicial, { tipo: 'clientes/borrar-todo' })
    expect(e.clientes).toEqual([])
    expect(e.catalogo).toBe(inicial.catalogo)
    expect(e.negocio).toBe(inicial.negocio)
  })
})
