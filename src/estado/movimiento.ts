/** true si el sistema pide reducir el movimiento (accesibilidad) */
export function sinMovimiento(): boolean {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
}

/** Genera ids únicos aunque se creen varios en el mismo milisegundo */
let ultimo = 0
export function nuevoId(prefijo: string): string {
  const ahora = Date.now()
  ultimo = ahora > ultimo ? ahora : ultimo + 1
  return prefijo + '_' + ultimo
}

export function horaCorta(fecha: Date = new Date()): string {
  return fecha.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })
}
