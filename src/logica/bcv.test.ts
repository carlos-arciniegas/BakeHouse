import { describe, expect, it } from 'vitest'
import { obtenerTasaBCV } from './bcv'

const respuesta = (cuerpo: unknown, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(cuerpo) } as Response)

describe('obtenerTasaBCV', () => {
  it('usa la primera fuente si responde bien', async () => {
    const tasa = await obtenerTasaBCV((url) => (url.includes('dolarapi') ? respuesta({ promedio: 36.5678 }) : respuesta({})))
    expect(tasa).toBe(36.57)
  })

  it('si la primera falla, prueba la segunda', async () => {
    const tasa = await obtenerTasaBCV((url) =>
      url.includes('dolarapi') ? Promise.reject(new Error('sin conexión')) : respuesta({ monitors: { usd: { price: 40.1 } } }))
    expect(tasa).toBe(40.1)
  })

  it('devuelve null si ninguna fuente da una tasa válida', async () => {
    expect(await obtenerTasaBCV(() => respuesta({ promedio: 0 }))).toBeNull()
    expect(await obtenerTasaBCV(() => respuesta({}, false))).toBeNull()
  })
})
