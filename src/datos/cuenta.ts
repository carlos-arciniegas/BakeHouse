import type { Almacen } from './almacenamiento'

// Cuenta en la nube: lo que no depende de React ni de la red, para poder probarlo.

/** Negocio de la nube al que está conectado este dispositivo */
export const CLAVE_VINCULO = 'pachons_nube_negocio_v1'
/** Mientras la sincronización no esté lista, la sección de la nube solo aparece si se activa a propósito */
export const CLAVE_PROBAR_NUBE = 'pachons_probar_nube_v1'

export function leerVinculo(a: Almacen): string | null {
  try {
    return a.getItem(CLAVE_VINCULO) || null
  } catch {
    return null
  }
}

export function guardarVinculo(a: Almacen & Pick<Storage, 'removeItem'>, negocioId: string | null): void {
  try {
    if (negocioId) a.setItem(CLAVE_VINCULO, negocioId)
    else a.removeItem(CLAVE_VINCULO)
  } catch {
    // sin almacenamiento: habrá que volver a elegir el negocio
  }
}

/**
 * La sección de la nube se ve en desarrollo, o en la app publicada si alguna vez se abrió con "?nube=1"
 * (queda recordado en el dispositivo). Así se puede probar sin mostrársela a todos.
 */
export function nubeHabilitada(a: Almacen, busquedaUrl: string, esDesarrollo: boolean): boolean {
  if (esDesarrollo) return true
  try {
    if (new URLSearchParams(busquedaUrl).get('nube') === '1') a.setItem(CLAVE_PROBAR_NUBE, '1')
    return a.getItem(CLAVE_PROBAR_NUBE) === '1'
  } catch {
    return false
  }
}

export function correoValido(correo: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo.trim())
}

/** Error de Supabase Auth (solo lo que se usa) */
export interface ErrorAuth {
  status?: number
  code?: string
  message?: string
}

/** Convierte un error de Supabase en un mensaje que diga qué pasó y qué hacer */
export function mensajeDeError(error: ErrorAuth): string {
  if (error.status === 429 || error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit') {
    return 'Se enviaron demasiados correos seguidos. Espera unos minutos y vuelve a intentar.'
  }
  if (error.code === 'email_address_invalid' || error.code === 'validation_failed') {
    return 'Ese correo no parece válido. Revísalo y vuelve a intentar.'
  }
  if (error.code === 'signup_disabled' || error.code === 'otp_disabled') {
    return 'Por ahora no se pueden crear cuentas nuevas.'
  }
  if (error.status === undefined || error.status === 0) {
    return 'No hay conexión. Revisa tu internet y vuelve a intentar.'
  }
  return 'No se pudo completar. Vuelve a intentar en un momento.'
}
