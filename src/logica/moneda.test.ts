import { describe, expect, it } from 'vitest'
import { convertirABolivares, formatearBolivares, formatearMoneda, nombreMoneda, redondear, tasaActiva } from './moneda'
import { PAISES } from './paises'

/** Intl usa espacios no separables; se comparan como espacios normales */
const plano = (s: string) => s.replace(/[  ]/g, ' ')

describe('formatearMoneda', () => {
  it('usa el símbolo y los separadores de cada país', () => {
    expect(plano(formatearMoneda(1234.5, PAISES.VE))).toBe('$1.234,50')
    expect(plano(formatearMoneda(11, PAISES.ES))).toBe('11,00 €')
    expect(plano(formatearMoneda(1234.5, PAISES.GB))).toBe('£1,234.50')
    expect(plano(formatearMoneda(11, PAISES.US))).toBe('$11.00')
  })

  it('trata valores inválidos como 0', () => {
    expect(plano(formatearMoneda(Number.NaN, PAISES.VE))).toBe('$0,00')
  })
})

describe('bolívares', () => {
  it('formatea con "Bs." y coma decimal', () => {
    expect(formatearBolivares(18375.4)).toBe('Bs. 18.375,40')
  })

  it('convierte con la tasa y da 0 sin tasa', () => {
    expect(convertirABolivares(10, 36.5)).toBe(365)
    expect(convertirABolivares(10, 0)).toBe(0)
  })

  it('solo se muestran en Venezuela y con una tasa escrita', () => {
    expect(tasaActiva(PAISES.VE, 36.5)).toBe(true)
    expect(tasaActiva(PAISES.VE, 0)).toBe(false)
    expect(tasaActiva(PAISES.ES, 36.5)).toBe(false)
  })
})

describe('utilidades', () => {
  it('nombra la moneda del país', () => {
    expect(nombreMoneda(PAISES.VE)).toBe('dólares')
    expect(nombreMoneda(PAISES.ES)).toBe('euros')
    expect(nombreMoneda(PAISES.GB)).toBe('libras')
  })

  it('redondea a centavos', () => {
    expect(redondear(0.1 + 0.2)).toBe(0.3)
    expect(redondear(10 / 3)).toBe(3.33)
  })
})
