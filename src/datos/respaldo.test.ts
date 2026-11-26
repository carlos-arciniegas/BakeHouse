import { describe, expect, it } from 'vitest'
import { PAISES } from '../logica/paises'
import { CATALOGO_PREDETERMINADO, type EstadoGuardado } from './almacenamiento'
import { crearRespaldo, importarCSV, leerRespaldo, nombreArchivoRespaldo } from './respaldo'

const actual: EstadoGuardado = {
  clientes: [],
  catalogo: CATALOGO_PREDETERMINADO,
  metodos: [],
  negocio: { nombre: "Pachon's Bakehouse", pais: 'VE' },
  bcv: { tasa: 100, actualizado: 'BCV 9:00' },
  mensajeCobro: '',
}

describe('respaldo JSON', () => {
  it('crear y leer devuelve el mismo estado', () => {
    const estado: EstadoGuardado = {
      ...actual,
      clientes: [{ id: 'c1', nombre: 'Ana', telefono: '34600123456', nota: '', movimientos: [{ id: 'm', tipo: 'venta', descripcion: 'x', monto: 3, fecha: '2026-11-20' }] }],
      metodos: [{ id: 'm1', tipo: 'bizum', activo: true, datos: { telefono: '600', titular: '' } }],
      negocio: { nombre: 'Dulce Mila', pais: 'ES' },
      mensajeCobro: 'Hola {cliente}, total {saldo}',
    }
    expect(leerRespaldo(JSON.stringify(crearRespaldo(estado)), actual)).toEqual(estado)
  })

  it('acepta respaldos viejos con "pagoMovil" y sin negocio ni mensajeCobro', () => {
    const viejo = { clientes: [], pagoMovil: { banco: 'Banesco (0134)', telefono: '0412', cedula: 'V-1', incluirEnMensaje: true } }
    const conPlantilla = { ...actual, mensajeCobro: 'Mi mensaje' }
    const estado = leerRespaldo(JSON.stringify(viejo), conPlantilla)!
    expect(estado.metodos[0].tipo).toBe('pagomovil')
    expect(estado.negocio).toEqual(conPlantilla.negocio)
    expect(estado.catalogo).toEqual(conPlantilla.catalogo)
    expect(estado.mensajeCobro).toBe('Mi mensaje')
  })

  it('rechaza archivos que no son un respaldo', () => {
    expect(leerRespaldo('no es json', actual)).toBeNull()
    expect(leerRespaldo('{"hola": 1}', actual)).toBeNull()
  })

  it('arma un nombre de archivo sin caracteres raros', () => {
    expect(nombreArchivoRespaldo({ nombre: "Pachon's Bakehouse", pais: 'VE' }, '2026-11-20')).toBe('respaldo-pachon-s-bakehouse-2026-11-20.json')
    expect(nombreArchivoRespaldo({ nombre: 'Dulcería Ñoña', pais: 'ES' }, '2026-11-20')).toBe('respaldo-dulceria-nona-2026-11-20.json')
  })
})

describe('importarCSV', () => {
  it('lee comas o punto y coma, salta el encabezado y crea la deuda inicial', () => {
    const csv = 'Nombre;Telefono;Deuda\nJosé Rodríguez;0414 987 6543;11,50\n"Luis Gómez",04165554433,0\n'
    const clientes = importarCSV(csv, PAISES.VE, '2026-11-20', 1)
    expect(clientes.map((c) => [c.nombre, c.telefono, c.movimientos.length])).toEqual([
      ['José Rodríguez', '584149876543', 1],
      ['Luis Gómez', '584165554433', 0],
    ])
    expect(clientes[0].movimientos[0]).toMatchObject({ tipo: 'venta', monto: 11.5, descripcion: 'Saldo importado de Excel', fecha: '2026-11-20' })
  })

  it('ignora filas sin nombre o sin teléfono válido', () => {
    expect(importarCSV(';0412;5\nAna;12;5\n\n', PAISES.VE, '2026-11-20')).toEqual([])
  })

  it('normaliza los teléfonos según el país del negocio', () => {
    expect(importarCSV('Lucía;611 22 33 44;0', PAISES.ES, '2026-11-20')[0].telefono).toBe('34611223344')
  })
})
