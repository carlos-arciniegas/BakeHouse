import { describe, expect, it } from 'vitest'
import { CLAVE_PROBAR_NUBE, CLAVE_VINCULO, correoValido, guardarVinculo, leerVinculo, mensajeDeError, nubeHabilitada } from './cuenta'

function memoria() {
  const datos = new Map<string, string>()
  return {
    datos,
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => void datos.set(k, v),
    removeItem: (k: string) => void datos.delete(k),
  }
}

describe('vínculo con el negocio en la nube', () => {
  it('se guarda, se lee y se borra', () => {
    const a = memoria()
    expect(leerVinculo(a)).toBeNull()
    guardarVinculo(a, 'neg-1')
    expect(leerVinculo(a)).toBe('neg-1')
    expect(a.datos.get(CLAVE_VINCULO)).toBe('neg-1')
    guardarVinculo(a, null)
    expect(leerVinculo(a)).toBeNull()
  })
})

describe('nubeHabilitada', () => {
  it('siempre en desarrollo', () => {
    expect(nubeHabilitada(memoria(), '', true)).toBe(true)
  })

  it('en la app publicada solo si se abrió con ?nube=1, y queda recordado', () => {
    const a = memoria()
    expect(nubeHabilitada(a, '', false)).toBe(false)
    expect(nubeHabilitada(a, '?nube=1', false)).toBe(true)
    expect(a.datos.get(CLAVE_PROBAR_NUBE)).toBe('1')
    expect(nubeHabilitada(a, '', false)).toBe(true)
  })
})

describe('correoValido', () => {
  it.each([
    ['ana@ejemplo.com', true],
    ['  ana@ejemplo.com  ', true],
    ['ana@ejemplo', false],
    ['ana ejemplo.com', false],
    ['', false],
  ])('"%s" → %s', (correo, esperado) => {
    expect(correoValido(correo)).toBe(esperado)
  })
})

describe('mensajeDeError', () => {
  it('el límite de correos dice que hay que esperar', () => {
    expect(mensajeDeError({ status: 429, code: 'over_email_send_rate_limit' })).toBe('Se enviaron demasiados correos seguidos. Espera unos minutos y vuelve a intentar.')
  })

  it('distingue correo inválido, registro cerrado y falta de conexión', () => {
    expect(mensajeDeError({ status: 400, code: 'email_address_invalid' })).toContain('no parece válido')
    expect(mensajeDeError({ status: 422, code: 'signup_disabled' })).toContain('no se pueden crear cuentas')
    expect(mensajeDeError({ message: 'Failed to fetch' })).toContain('No hay conexión')
  })

  it('cualquier otro error da un mensaje genérico, no técnico', () => {
    expect(mensajeDeError({ status: 500, code: 'unexpected_failure', message: 'boom' })).toBe('No se pudo completar. Vuelve a intentar en un momento.')
  })
})
