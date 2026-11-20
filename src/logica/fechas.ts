/** Fecha local de hoy en formato AAAA-MM-DD (lo que usa <input type="date">) */
export function fechaHoy(ahora: Date = new Date()): string {
  const aaaa = ahora.getFullYear()
  const mm = String(ahora.getMonth() + 1).padStart(2, '0')
  const dd = String(ahora.getDate()).padStart(2, '0')
  return `${aaaa}-${mm}-${dd}`
}

/** "2026-11-20" → "20/11/26" */
export function formatearFechaCorta(fechaISO: string): string {
  if (!fechaISO) return ''
  const partes = fechaISO.split('-')
  if (partes.length !== 3) return fechaISO
  return partes[2] + '/' + partes[1] + '/' + partes[0].slice(2)
}
