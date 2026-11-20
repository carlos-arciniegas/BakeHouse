import { describe, expect, it } from 'vitest'
import { PAISES } from './paises'
import { mostrarTelefono, normalizarTelefono, telefonoParaEditar } from './telefono'
import type { CodigoPais } from './tipos'

describe('normalizarTelefono', () => {
  const casos: [CodigoPais, string, string][] = [
    ['VE', '04121234567', '584121234567'],
    ['VE', '412 123 4567', '584121234567'],
    ['VE', '584121234567', '584121234567'],
    ['VE', '+58 412-1234567', '584121234567'],
    ['ES', '600 123 456', '34600123456'],
    ['ES', '+34 600123456', '34600123456'],
    ['ES', '0034600123456', '34600123456'],
    ['ES', '34600123456', '34600123456'],
    ['IT', '312 345 6789', '393123456789'],
    // Móvil italiano que empieza por 39: no se confunde con el prefijo
    ['IT', '3912345678', '393912345678'],
    ['PT', '912 345 678', '351912345678'],
    ['FR', '06 12 34 56 78', '33612345678'],
    ['GB', '07700 900123', '447700900123'],
    ['US', '(305) 555-0123', '13055550123'],
    ['US', '13055550123', '13055550123'],
  ]

  it.each(casos)('%s: "%s" → %s', (pais, entrada, esperado) => {
    expect(normalizarTelefono(entrada, PAISES[pais])).toBe(esperado)
  })

  it('devuelve vacío si no hay dígitos', () => {
    expect(normalizarTelefono('  ', PAISES.VE)).toBe('')
    expect(normalizarTelefono('sin número', PAISES.ES)).toBe('')
  })
})

describe('mostrarTelefono', () => {
  it('agrupa de a 3 y une un último dígito suelto', () => {
    expect(mostrarTelefono('584121234567')).toBe('+58 412 123 4567')
    expect(mostrarTelefono('34600123456')).toBe('+34 600 123 456')
    expect(mostrarTelefono('351912345678')).toBe('+351 912 345 678')
  })

  it('reconoce el prefijo aunque el negocio sea de otro país', () => {
    expect(mostrarTelefono('13055550123')).toBe('+1 305 555 0123')
  })

  it('si no reconoce el prefijo, solo agrega "+"', () => {
    expect(mostrarTelefono('99912345')).toBe('+99912345')
    expect(mostrarTelefono('')).toBe('')
  })
})

describe('telefonoParaEditar', () => {
  it('vuelve al formato local del país del negocio', () => {
    expect(telefonoParaEditar('584121234567', PAISES.VE)).toBe('04121234567')
    expect(telefonoParaEditar('34600123456', PAISES.ES)).toBe('600123456')
  })

  it('un número de otro país se edita con "+" para no reinterpretarlo', () => {
    expect(telefonoParaEditar('34600123456', PAISES.VE)).toBe('+34600123456')
    expect(normalizarTelefono('+34600123456', PAISES.VE)).toBe('34600123456')
  })
})
