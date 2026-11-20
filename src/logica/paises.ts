import type { CodigoMoneda, CodigoPais, Negocio, Pais } from './tipos'

export const PAISES: Record<CodigoPais, Pais> = {
  VE: { nombre: 'Venezuela', moneda: 'USD', locale: 'es-VE', prefijo: '58', troncal: '0', largo: 10, ejemploTel: '0412 123 4567', tasaBCV: true },
  ES: { nombre: 'España', moneda: 'EUR', locale: 'es-ES', prefijo: '34', troncal: '', largo: 9, ejemploTel: '600 123 456' },
  PT: { nombre: 'Portugal', moneda: 'EUR', locale: 'pt-PT', prefijo: '351', troncal: '', largo: 9, ejemploTel: '912 345 678' },
  IT: { nombre: 'Italia', moneda: 'EUR', locale: 'it-IT', prefijo: '39', troncal: '', largo: 10, ejemploTel: '312 345 6789' },
  FR: { nombre: 'Francia', moneda: 'EUR', locale: 'fr-FR', prefijo: '33', troncal: '0', largo: 9, ejemploTel: '06 12 34 56 78' },
  DE: { nombre: 'Alemania', moneda: 'EUR', locale: 'de-DE', prefijo: '49', troncal: '0', largo: 10, ejemploTel: '0151 2345 6789' },
  GB: { nombre: 'Reino Unido', moneda: 'GBP', locale: 'en-GB', prefijo: '44', troncal: '0', largo: 10, ejemploTel: '07700 900123' },
  US: { nombre: 'Estados Unidos', moneda: 'USD', locale: 'en-US', prefijo: '1', troncal: '', largo: 10, ejemploTel: '(305) 555-0123' },
}

export const NOMBRES_MONEDA: Record<CodigoMoneda, string> = {
  USD: 'dólares',
  EUR: 'euros',
  GBP: 'libras',
}

/** Para un cliente nuevo se cambia en Ajustes; esto es lo que se usa si no hay nada guardado. */
export const NEGOCIO_PREDETERMINADO: Negocio = { nombre: "Pachon's Bakehouse", pais: 'VE' }

export function esCodigoPais(valor: unknown): valor is CodigoPais {
  return typeof valor === 'string' && valor in PAISES
}

export function paisDe(negocio: Negocio): Pais {
  return PAISES[negocio.pais] ?? PAISES.VE
}
