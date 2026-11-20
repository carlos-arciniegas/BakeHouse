import { useEffect, useSyncExternalStore } from 'react'
import {
  enviarCola, esErrorDeSesion, esperaReintento, EVENTO_COLA, leerCola, negocioSincronizado, pendientes, quitarEnviados,
  type EstadoSync,
} from '../datos/sincronizacion'
import { supabase } from '../datos/supabase'
import { crearDestino } from './nube'

// Envío de la cola a la nube en segundo plano. El estado se comparte con la sección de Ajustes.

let estado: EstadoSync = { activa: false, pendientes: 0, enviando: false, sinConexion: false, error: null, rechazados: 0 }
const oyentes = new Set<() => void>()

function publicar(cambio: Partial<EstadoSync>) {
  estado = { ...estado, ...cambio }
  oyentes.forEach((f) => f())
}

/** Cómo va el guardado en la nube (para el indicador) */
export function useEstadoSincronizacion(): EstadoSync {
  return useSyncExternalStore(
    (f) => {
      oyentes.add(f)
      return () => oyentes.delete(f)
    },
    () => estado,
  )
}

/** Pide revisar la cola ya (por ejemplo, justo después de subir los datos) */
export function revisarCola() {
  window.dispatchEvent(new Event(EVENTO_COLA))
}

/** Espera tras un cambio antes de enviar, para juntar varios toques seguidos en un solo envío */
const ESPERA_TRAS_CAMBIO = 1500

/**
 * Envía la cola cuando hay algo: al abrir la app, poco después de cada cambio, al volver la red
 * y al volver a la app. Si falla, reintenta con esperas cada vez más largas. Se usa una sola vez (en App).
 */
export function useSincronizacion() {
  useEffect(() => {
    const nube = supabase
    if (!nube) return
    let vivo = true
    let enviando = false
    let intentos = 0
    let temporizador: ReturnType<typeof setTimeout> | undefined

    const programar = (ms: number) => {
      clearTimeout(temporizador)
      temporizador = setTimeout(() => void enviar(), ms)
    }

    /** Publica cuántos cambios faltan; devuelve el negocio si hay algo que enviar */
    const revisar = () => {
      const negocioId = negocioSincronizado(localStorage)
      const cola = leerCola(localStorage)
      const n = negocioId && cola?.negocioId === negocioId ? pendientes(cola) : 0
      publicar({ activa: negocioId !== null, pendientes: n, sinConexion: !navigator.onLine })
      return n > 0 ? negocioId : null
    }

    const enviar = async () => {
      if (!vivo || enviando) return
      const negocioId = revisar()
      if (!negocioId || !navigator.onLine) return // al volver la red avisa el evento "online"

      const { data } = await nube.auth.getSession()
      if (!data.session) {
        // Sin sesión no se reintenta solo: hay que volver a entrar con el correo
        publicar({ error: { status: 401 } })
        return
      }

      enviando = true
      publicar({ enviando: true })
      const r = await enviarCola(crearDestino(nube, negocioId), leerCola(localStorage)!)
      quitarEnviados(localStorage, negocioId, r)
      enviando = false
      if (!vivo) return
      publicar({ enviando: false, error: r.error, rechazados: estado.rechazados + r.rechazados })
      revisar()

      if (r.error) {
        intentos++
        if (!esErrorDeSesion(r.error)) programar(esperaReintento(intentos))
      } else {
        intentos = 0
        if (estado.pendientes > 0) programar(0)
      }
    }

    const alCambiar = () => {
      revisar()
      programar(ESPERA_TRAS_CAMBIO)
    }
    const alVolverRed = () => {
      intentos = 0
      programar(0)
    }
    const alPerderRed = () => revisar()
    const alVolverALaApp = () => {
      if (document.visibilityState === 'visible') programar(0)
    }

    window.addEventListener(EVENTO_COLA, alCambiar)
    window.addEventListener('online', alVolverRed)
    window.addEventListener('offline', alPerderRed)
    document.addEventListener('visibilitychange', alVolverALaApp)
    programar(0)

    return () => {
      vivo = false
      clearTimeout(temporizador)
      window.removeEventListener(EVENTO_COLA, alCambiar)
      window.removeEventListener('online', alVolverRed)
      window.removeEventListener('offline', alPerderRed)
      document.removeEventListener('visibilitychange', alVolverALaApp)
    }
  }, [])
}
