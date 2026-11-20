import { describe, expect, it } from 'vitest'
import { CATALOGO_PREDETERMINADO, CLAVES, cargarEstado, guardar, type Almacen } from './almacenamiento'

/** Almacenamiento en memoria con la misma interfaz que localStorage */
function memoria(inicial: Record<string, unknown> = {}): Almacen & { datos: Map<string, string> } {
  const datos = new Map(Object.entries(inicial).map(([k, v]) => [k, JSON.stringify(v)]))
  return { datos, getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => void datos.set(k, v) }
}

describe('cargarEstado', () => {
  it('sin datos usa los valores predeterminados (Pachon\'s en Venezuela)', () => {
    const estado = cargarEstado(memoria())
    expect(estado.clientes).toEqual([])
    expect(estado.catalogo).toEqual(CATALOGO_PREDETERMINADO)
    expect(estado.metodos).toEqual([])
    expect(estado.negocio).toEqual({ nombre: "Pachon's Bakehouse", pais: 'VE' })
    expect(estado.bcv).toEqual({ tasa: 0, actualizado: '' })
  })

  it('lee los datos con el formato de la versión anterior', () => {
    const estado = cargarEstado(memoria({
      [CLAVES.clientes]: { clientes: [{ id: 'c1', nombre: 'José', telefono: '584149876543', nota: '', movimientos: [{ id: 'm', tipo: 'venta', descripcion: 'x', monto: 11, fecha: '2026-11-10' }] }] },
      [CLAVES.negocio]: { nombre: 'Dulce Mila', pais: 'ES' },
      [CLAVES.bcv]: { tasa: 245.5, actualizado: 'BCV 9:30' },
    }))
    expect(estado.clientes[0].movimientos[0].monto).toBe(11)
    expect(estado.negocio.pais).toBe('ES')
    expect(estado.bcv.tasa).toBe(245.5)
  })

  it('migra el Pago Móvil viejo a métodos de pago y lo guarda', () => {
    const almacen = memoria({
      [CLAVES.pagoMovilAntiguo]: { banco: 'Banesco (0134)', telefono: '0412-1234567', cedula: 'V-25.000.000', titular: "Pachon's", incluirEnMensaje: true },
    })
    const estado = cargarEstado(almacen)
    expect(estado.metodos).toHaveLength(1)
    expect(estado.metodos[0]).toMatchObject({ tipo: 'pagomovil', activo: true, datos: { documento: 'V-25.000.000' } })
    expect(JSON.parse(almacen.datos.get(CLAVES.metodos)!)).toHaveLength(1)
  })

  it('no vuelve a migrar si ya hay métodos guardados (aunque la lista esté vacía)', () => {
    const estado = cargarEstado(memoria({
      [CLAVES.metodos]: [],
      [CLAVES.pagoMovilAntiguo]: { telefono: '0412', cedula: 'V-1' },
    }))
    expect(estado.metodos).toEqual([])
  })

  it('ignora datos corruptos o con forma inválida', () => {
    const almacen = memoria()
    almacen.datos.set(CLAVES.clientes, '{no es json')
    almacen.datos.set(CLAVES.negocio, JSON.stringify({ nombre: 'X', pais: 'ZZ' }))
    almacen.datos.set(CLAVES.catalogo, JSON.stringify([{ nombre: 'Gratis', precio: 0 }, { nombre: 'Brownie', precio: 2 }]))
    const estado = cargarEstado(almacen)
    expect(estado.clientes).toEqual([])
    expect(estado.negocio.pais).toBe('VE')
    expect(estado.catalogo).toMatchObject([{ nombre: 'Brownie', precio: 2 }])
  })

  it('descarta movimientos inválidos y deja el teléfono en dígitos', () => {
    const estado = cargarEstado(memoria({
      [CLAVES.clientes]: { clientes: [{ id: 'c1', nombre: 'Ana', telefono: '+58 412-123', movimientos: [{ tipo: 'regalo', monto: 5 }, { id: 'm', tipo: 'abono', monto: 2, descripcion: 'p', fecha: 'f' }] }] },
    }))
    expect(estado.clientes[0].telefono).toBe('58412123')
    expect(estado.clientes[0].movimientos).toHaveLength(1)
  })
})

describe('productos del catálogo', () => {
  it('los productos viejos reciben un id que se guarda y no cambia en la siguiente carga', () => {
    const almacen = memoria({ [CLAVES.catalogo]: [{ nombre: 'Galleta', precio: 1.5 }, { id: 'p_viejo', nombre: 'Brownie', precio: 2.5 }] })
    const primera = cargarEstado(almacen).catalogo
    expect(primera[0].id).toMatch(/^prod_/)
    expect(primera[1].id).toBe('p_viejo')
    expect(cargarEstado(almacen).catalogo.map((p) => p.id)).toEqual(primera.map((p) => p.id))
  })

  it('el catálogo de ejemplo trae ids fijos', () => {
    expect(cargarEstado(memoria()).catalogo.map((p) => p.id)).toEqual(['prod_base_1', 'prod_base_2', 'prod_base_3', 'prod_base_4', 'prod_base_5', 'prod_base_6'])
  })
})

describe('productos de una venta', () => {
  it('se conservan al cargar y se descartan las líneas inválidas', () => {
    const estado = cargarEstado(memoria({
      [CLAVES.clientes]: { clientes: [{ id: 'c1', nombre: 'Ana', telefono: '584121234567', movimientos: [
        { id: 'm1', tipo: 'venta', descripcion: '2x Galleta', monto: 3, fecha: '2026-11-20', productos: [{ nombre: 'Galleta', cantidad: 2, precio: 1.5 }, { nombre: '', cantidad: 1 }] },
        { id: 'm2', tipo: 'venta', descripcion: 'A mano', monto: 5, fecha: '2026-11-20' },
      ] }] },
    }))
    expect(estado.clientes[0].movimientos[0].productos).toEqual([{ nombre: 'Galleta', cantidad: 2, precio: 1.5 }])
    expect(estado.clientes[0].movimientos[1]).not.toHaveProperty('productos')
  })
})

describe('guardar', () => {
  it('guarda los clientes con la forma { clientes } que espera la versión anterior', () => {
    const almacen = memoria()
    guardar.clientes(almacen, [])
    expect(JSON.parse(almacen.datos.get(CLAVES.clientes)!)).toEqual({ clientes: [] })
  })

  it('no falla si el almacenamiento está lleno o bloqueado', () => {
    const lleno: Almacen = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError') } }
    expect(() => guardar.catalogo(lleno, [])).not.toThrow()
  })
})
