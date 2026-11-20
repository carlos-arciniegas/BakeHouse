import { useSyncExternalStore } from 'react'

/** Evento que Chrome y Edge disparan cuando la app se puede instalar (no es estándar, no tiene tipos en el DOM) */
interface EventoInstalar extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// El navegador puede ofrecer la instalación antes de que React monte, así que se escucha desde que carga el módulo
let ofrecimiento: EventoInstalar | null = null
const oyentes = new Set<() => void>()
const avisarCambio = () => oyentes.forEach((f) => f())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    ofrecimiento = e as EventoInstalar
    avisarCambio()
  })
  window.addEventListener('appinstalled', () => {
    ofrecimiento = null
    avisarCambio()
  })
}

function suscribir(f: () => void) {
  oyentes.add(f)
  return () => { oyentes.delete(f) }
}

const modoApp = typeof window !== 'undefined' ? window.matchMedia('(display-mode: standalone)') : null

function suscribirModo(f: () => void) {
  modoApp?.addEventListener('change', f)
  return () => modoApp?.removeEventListener('change', f)
}

/**
 * Estado de la instalación de la app:
 * - puedeInstalar: el navegador ofrece instalarla (Chrome, Edge, Android).
 * - esIOS: en iPhone no hay botón; se instala desde "Compartir → Agregar a inicio".
 * - instalada: ya se está usando como app.
 */
export function useInstalarApp() {
  const evento = useSyncExternalStore(suscribir, () => ofrecimiento, () => null)
  const instalada = useSyncExternalStore(suscribirModo, () => Boolean(modoApp?.matches), () => false)
  const esIOS = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)

  const instalar = async (): Promise<boolean> => {
    if (!evento) return false
    await evento.prompt()
    const { outcome } = await evento.userChoice
    ofrecimiento = null
    avisarCambio()
    return outcome === 'accepted'
  }

  return { puedeInstalar: evento !== null, esIOS, instalada, instalar }
}
