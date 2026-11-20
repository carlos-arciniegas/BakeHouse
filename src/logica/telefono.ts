import { PAISES } from './paises'
import type { Pais } from './tipos'

/**
 * Devuelve el número con código de país y solo dígitos, como lo pide wa.me.
 * Acepta lo que la gente escribe: con o sin "+", con "00", con el 0 inicial o con el prefijo ya puesto.
 */
export function normalizarTelefono(tel: string, pais: Pais): string {
  const crudo = String(tel ?? '').trim()
  let digitos = crudo.replace(/\D/g, '')
  if (!digitos) return ''
  if (crudo.startsWith('+')) return digitos
  if (digitos.startsWith('00')) return digitos.slice(2)
  if (digitos.startsWith(pais.prefijo) && digitos.length >= pais.prefijo.length + pais.largo) return digitos
  if (pais.troncal && digitos.startsWith(pais.troncal)) digitos = digitos.slice(pais.troncal.length)
  return pais.prefijo + digitos
}

const PREFIJOS = Object.values(PAISES)
  .map((p) => p.prefijo)
  .sort((a, b) => b.length - a.length)

/** "+58 412 123 4567": prefijo y grupos de 3; si el último queda de 1 dígito se une al anterior */
export function mostrarTelefono(tel: string): string {
  if (!tel) return ''
  const cc = PREFIJOS.find((pre) => tel.startsWith(pre) && tel.length > pre.length + 6)
  if (!cc) return '+' + tel
  const grupos = tel.slice(cc.length).match(/\d{1,3}/g) ?? []
  if (grupos.length > 1 && grupos[grupos.length - 1].length === 1) {
    grupos[grupos.length - 2] += grupos.pop()
  }
  return '+' + cc + ' ' + grupos.join(' ')
}

/** Para editar: el número como se escribiría localmente (0412…) o con "+" si es de otro país */
export function telefonoParaEditar(tel: string, pais: Pais): string {
  return tel.startsWith(pais.prefijo) ? pais.troncal + tel.slice(pais.prefijo.length) : '+' + tel
}
