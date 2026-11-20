import { NOMBRES_MONEDA } from './paises'
import type { Pais } from './tipos'

const formateadores = new Map<string, Intl.NumberFormat>()

/** "17,50 €", "$11,00", "£11.00": símbolo y separadores según el país */
export function formatearMoneda(valor: number, pais: Pais): string {
  const clave = pais.locale + pais.moneda
  let formato = formateadores.get(clave)
  if (!formato) {
    formato = new Intl.NumberFormat(pais.locale, {
      style: 'currency',
      currency: pais.moneda,
      currencyDisplay: 'narrowSymbol',
    })
    formateadores.set(clave, formato)
  }
  return formato.format(Number(valor) || 0)
}

export function formatearBolivares(valor: number): string {
  const num = Number(valor) || 0
  return 'Bs. ' + num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function nombreMoneda(pais: Pais): string {
  return NOMBRES_MONEDA[pais.moneda] ?? pais.moneda
}

/** Bolívares solo en Venezuela y solo si hay una tasa BCV escrita */
export function tasaActiva(pais: Pais, tasa: number): boolean {
  return Boolean(pais.tasaBCV) && Number(tasa) > 0
}

export function convertirABolivares(monto: number, tasa: number): number {
  const t = Number(tasa) || 0
  if (t <= 0) return 0
  return (Number(monto) || 0) * t
}

/** Redondea a centavos para no arrastrar errores de coma flotante */
export function redondear(monto: number): number {
  return Math.round(monto * 100) / 100
}
