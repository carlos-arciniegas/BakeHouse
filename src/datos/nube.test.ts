import { describe, expect, it } from 'vitest'
import { datosAFilas, dividirEnLotes, filaANegocio, filasADatos, negocioAFila, type DatosDeNegocio, type FilasRecibidas } from './nube'

const NEGOCIO = '11111111-1111-1111-1111-111111111111'

const datos: DatosDeNegocio = {
  clientes: [
    {
      id: 'cli_1', nombre: 'José Rodríguez', telefono: '584149876543', nota: '',
      movimientos: [
        { id: 'mov_b', tipo: 'venta', descripcion: '2x Galleta', monto: 3, fecha: '2026-11-20', productos: [{ nombre: 'Galleta', cantidad: 2, precio: 1.5 }] },
        // Anotado después, aunque su id ordene antes: el historial debe respetar el orden de anotación
        { id: 'mov_a', tipo: 'abono', descripcion: 'Pago (Efectivo)', monto: 3, fecha: '2026-11-19' },
      ],
    },
    { id: 'cli_2', nombre: 'Ana', telefono: '34611223344', nota: 'Vecina', movimientos: [] },
  ],
  catalogo: [{ id: 'prod_2', nombre: 'Brownie', precio: 2.5 }, { id: 'prod_1', nombre: 'Galleta', precio: 1.5 }],
  metodos: [{ id: 'met_1', tipo: 'pagomovil', activo: true, datos: { banco: 'Banesco (0134)', telefono: '0412' } }],
}

/** Simula lo que devuelve Supabase después de subir: agrega los campos que pone el servidor */
function comoLasDevuelveLaBase(): FilasRecibidas {
  const subidas = datosAFilas(datos, NEGOCIO, Date.UTC(2026, 10, 20))
  const servidor = { actualizado_en: '2026-11-20T00:00:00Z', borrado_en: null }
  return {
    clientes: subidas.clientes.map((f, i) => ({ ...servidor, nota: '', telefono: '', creado_en: `2026-11-20T00:00:0${i}Z`, ...f })),
    movimientos: subidas.movimientos.map((f) => ({ ...servidor, descripcion: '', productos: null, ...f, creado_en: f.creado_en! })),
    productos: subidas.productos.map((f) => ({ ...servidor, creado_en: '2026-11-20T00:00:00Z', orden: 0, ...f })),
    metodos: subidas.metodos.map((f) => ({ ...servidor, creado_en: '2026-11-20T00:00:00Z', datos: {}, activo: true, orden: 0, ...f })),
  }
}

describe('datos ↔ filas de Supabase', () => {
  it('subir y bajar devuelve los mismos datos, con el historial en el orden en que se anotó', () => {
    expect(filasADatos(comoLasDevuelveLaBase())).toEqual(datos)
  })

  it('cada fila lleva el negocio y los productos de la venta', () => {
    const filas = datosAFilas(datos, NEGOCIO)
    expect(filas.clientes.every((f) => f.negocio_id === NEGOCIO)).toBe(true)
    expect(filas.movimientos.map((m) => [m.id, m.cliente_id])).toEqual([['mov_b', 'cli_1'], ['mov_a', 'cli_1']])
    expect(filas.movimientos[0].productos).toEqual([{ nombre: 'Galleta', cantidad: 2, precio: 1.5 }])
    expect(filas.movimientos[1].productos).toBeNull()
    expect(filas.productos.map((p) => [p.id, p.orden])).toEqual([['prod_2', 0], ['prod_1', 1]])
  })

  it('ignora lo borrado y lo inválido', () => {
    const filas = comoLasDevuelveLaBase()
    filas.clientes[1].borrado_en = '2026-11-21T00:00:00Z'
    filas.movimientos[1].borrado_en = '2026-11-21T00:00:00Z'
    filas.productos[0].borrado_en = '2026-11-21T00:00:00Z'
    filas.metodos.push({ ...filas.metodos[0], id: 'met_raro', tipo: 'cheque' })

    const resultado = filasADatos(filas)
    expect(resultado.clientes.map((c) => c.id)).toEqual(['cli_1'])
    expect(resultado.clientes[0].movimientos.map((m) => m.id)).toEqual(['mov_b'])
    expect(resultado.catalogo.map((p) => p.id)).toEqual(['prod_1'])
    expect(resultado.metodos.map((m) => m.id)).toEqual(['met_1'])
  })

  it('convierte montos que llegan como texto (tipo numeric de PostgreSQL)', () => {
    const filas = comoLasDevuelveLaBase()
    filas.movimientos[0].monto = '3.00' as unknown as number
    filas.productos[0].precio = '2.50' as unknown as number
    const resultado = filasADatos(filas)
    expect(resultado.clientes[0].movimientos[0].monto).toBe(3)
    expect(resultado.catalogo[0].precio).toBe(2.5)
  })
})

describe('datosAFilas respeta los límites de la base', () => {
  const raro: DatosDeNegocio = {
    clientes: [{
      id: 'cli_1', nombre: '   ', telefono: '+58 (414) 987-6543', nota: 'x'.repeat(250),
      movimientos: [
        { id: 'mov_1', tipo: 'venta', descripcion: 'Torta 🎂'.repeat(100), monto: 10.005, fecha: '' },
        { id: 'mov_2', tipo: 'abono', descripcion: '', monto: 0.001, fecha: '2026-11-20' },
      ],
    }],
    catalogo: [{ id: 'prod_1', nombre: 'Galleta', precio: 0.004 }, { id: 'p'.repeat(65), nombre: 'Id largo', precio: 2 }],
    metodos: [],
  }
  const filas = datosAFilas(raro, NEGOCIO, Date.UTC(2026, 10, 20, 12))

  it('recorta textos, deja el teléfono en dígitos y pone nombre si falta', () => {
    expect(filas.clientes[0]).toMatchObject({ nombre: 'Sin nombre', telefono: '584149876543' })
    expect(filas.clientes[0].nota).toHaveLength(200)
    // Recorta por caracteres: 500 como máximo y sin partir el emoji
    const descripcion = Array.from(filas.movimientos[0].descripcion!)
    expect(descripcion.length).toBeLessThanOrEqual(500)
    expect(descripcion.at(-1)).not.toMatch(/[\uD800-\uDFFF]/)
  })

  it('redondea a céntimos y usa la fecha de la subida si falta', () => {
    expect(filas.movimientos[0]).toMatchObject({ monto: 10.01, fecha: '2026-11-20' })
  })

  it('omite solo lo que la base no puede guardar', () => {
    expect(filas.movimientos.map((m) => m.id)).toEqual(['mov_1'])
    expect(filas.productos).toEqual([])
  })

  it('clientes y movimientos llevan creado_en creciente', () => {
    const fechas = [...filas.clientes, ...filas.movimientos].map((f) => f.creado_en!)
    expect([...fechas].sort()).toEqual(fechas)
    expect(new Set(fechas).size).toBe(fechas.length)
  })
})

describe('dividirEnLotes', () => {
  it('parte en lotes del tamaño pedido', () => {
    expect(dividirEnLotes([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(dividirEnLotes([], 2)).toEqual([])
  })
})

describe('negocio ↔ fila', () => {
  it('guarda nombre, país y tasa BCV', () => {
    expect(negocioAFila({ nombre: 'Pachon\'s Bakehouse', pais: 'VE' }, { tasa: 245.5, actualizado: 'BCV 9:30' }))
      .toEqual({ nombre: 'Pachon\'s Bakehouse', pais: 'VE', tasa_bcv: 245.5, tasa_bcv_actualizada: 'BCV 9:30' })
  })

  it('lee la fila y usa Venezuela si el país no es válido', () => {
    const fila = { id: NEGOCIO, nombre: 'Dulce Mila', pais: 'XX', tasa_bcv: 0, tasa_bcv_actualizada: '', creado_en: '', actualizado_en: '' }
    expect(filaANegocio(fila)).toEqual({ negocio: { nombre: 'Dulce Mila', pais: 'VE' }, bcv: { tasa: 0, actualizado: '' } })
    expect(filaANegocio({ ...fila, pais: 'ES' }).negocio.pais).toBe('ES')
  })
})
