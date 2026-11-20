type Buscar = (url: string, init?: RequestInit) => Promise<Response>

const FUENTES: { url: string; leer: (datos: unknown) => unknown }[] = [
  {
    url: 'https://ve.dolarapi.com/v1/dolares/oficial',
    leer: (d) => (d as { promedio?: unknown })?.promedio,
  },
  {
    url: 'https://pydolarve.org/api/v1/dollar?page=bcv',
    leer: (d) => (d as { monitors?: { usd?: { price?: unknown } } })?.monitors?.usd?.price,
  },
]

/**
 * Consulta la tasa oficial del BCV probando cada fuente en orden.
 * Devuelve la tasa redondeada a 2 decimales, o null si ninguna respondió bien.
 */
export async function obtenerTasaBCV(buscar: Buscar = fetch): Promise<number | null> {
  for (const fuente of FUENTES) {
    try {
      const res = await buscar(fuente.url, { cache: 'no-store' })
      if (!res.ok) continue
      const valor = Number(fuente.leer(await res.json()))
      if (valor > 0) return Math.round(valor * 100) / 100
    } catch {
      // Sin conexión o respuesta inválida: probar la siguiente fuente
    }
  }
  return null
}
