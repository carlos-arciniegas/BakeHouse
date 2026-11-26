import { useEffect, useSyncExternalStore } from 'react'
import type { ErrorAuth } from '../datos/cuenta'
import {
  clavesPendientes, enviarCola, esErrorDeSesion, esperaReintento, EVENTO_COLA, guardarCursor, leerCola, leerCursor,
  negocioSincronizado, pendientes, quitarEnviados, traerCambios, type EstadoSync,
} from '../datos/sincronizacion'
import { supabase } from '../datos/supabase'
import { useTienda } from '../estado/contextos'
import { crearDestino, crearOrigen } from './nube'

// Sincronización en segundo plano: envía la cola y trae lo que cambió en otros dispositivos.
// El estado se comparte con la sección de Ajustes.

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

/** Pide revisar la cola ya (por ejemplo, justo después de subir o traer los datos) */
export function revisarCola() {
  window.dispatchEvent(new Event(EVENTO_COLA))
}

/** Espera tras un cambio antes de enviar, para juntar varios toques seguidos en un solo envío */
const ESPERA_TRAS_CAMBIO = 1500
/** Cada cuánto se traen cambios con la app abierta y a la vista */
const CADA_CUANTO_TRAER = 60 * 1000

/**
 * Envía la cola cuando hay algo y trae lo que cambió en otros dispositivos: al abrir la app, al volver
 * la red, al volver a la app y cada minuto. Tras un cambio local solo envía (traer en cada toque sería
 * demasiado). Si falla, reintenta con esperas cada vez más largas. Se usa una sola vez (en App).
 */
export function useSincronizacion() {
  const { despachar } = useTienda()

  useEffect(() => {
    const nube = supabase
    if (!nube) return
    let vivo = true
    let ocupado = false
    let otraVez = false
    let quiereTraer = false
    let intentos = 0
    let temporizador: ReturnType<typeof setTimeout> | undefined

    const programar = (ms: number, traer: boolean) => {
      quiereTraer ||= traer
      clearTimeout(temporizador)
      temporizador = setTimeout(() => void ciclo(), ms)
    }

    /** Publica cuántos cambios faltan; devuelve el negocio si la sincronización está activa */
    const revisar = () => {
      const negocioId = negocioSincronizado(localStorage)
      const cola = leerCola(localStorage)
      const n = negocioId && cola?.negocioId === negocioId ? pendientes(cola) : 0
      publicar({ activa: negocioId !== null, pendientes: n, sinConexion: !navigator.onLine })
      return negocioId
    }

    const enviar = async (negocioId: string): Promise<ErrorAuth | null> => {
      const cola = leerCola(localStorage)
      if (!cola || cola.negocioId !== negocioId || pendientes(cola) === 0) return null
      publicar({ enviando: true })
      const r = await enviarCola(crearDestino(nube, negocioId), cola)
      quitarEnviados(localStorage, negocioId, r)
      publicar({ enviando: false, rechazados: estado.rechazados + r.rechazados })
      return r.error
    }

    const traer = async (negocioId: string): Promise<ErrorAuth | null> => {
      const r = await traerCambios(crearOrigen(nube, negocioId), leerCursor(localStorage, negocioId))
      if (!r.ok) return r.error
      // Si mientras tanto se cerró sesión o se cambió de negocio, lo traído ya no aplica
      if (!vivo || negocioSincronizado(localStorage) !== negocioId) return null
      despachar({
        tipo: 'nube/aplicar',
        cambios: { filas: r.filas, negocio: r.negocio, pendientes: clavesPendientes(leerCola(localStorage)) },
      })
      if (r.hasta) guardarCursor(localStorage, negocioId, r.hasta)
      return null
    }

    const ciclo = async () => {
      if (!vivo) return
      if (ocupado) {
        otraVez = true
        return
      }
      const negocioId = revisar()
      if (!negocioId || !navigator.onLine) return // al volver la red avisa el evento "online"

      const { data } = await nube.auth.getSession()
      if (!data.session) {
        // Sin sesión no se reintenta solo: hay que volver a entrar con el correo
        publicar({ error: { status: 401 } })
        return
      }

      ocupado = true
      const conTraer = quiereTraer
      quiereTraer = false
      // Primero enviar: así lo que se trae ya incluye lo propio y no pisa nada
      let error = await enviar(negocioId)
      if (!error && conTraer) error = await traer(negocioId)
      ocupado = false
      if (!vivo) return
      publicar({ error })
      revisar()

      if (error) {
        intentos++
        quiereTraer ||= conTraer
        if (!esErrorDeSesion(error)) programar(esperaReintento(intentos), false)
      } else {
        intentos = 0
        if (otraVez || estado.pendientes > 0) programar(0, false)
      }
      otraVez = false
    }

    const alCambiar = () => {
      revisar()
      programar(ESPERA_TRAS_CAMBIO, false)
    }
    const alVolverRed = () => {
      intentos = 0
      programar(0, true)
    }
    const alPerderRed = () => revisar()
    const alVolverALaApp = () => {
      if (document.visibilityState === 'visible') programar(0, true)
    }
    const periodico = setInterval(() => {
      if (document.visibilityState === 'visible' && !ocupado) programar(0, true)
    }, CADA_CUANTO_TRAER)

    window.addEventListener(EVENTO_COLA, alCambiar)
    window.addEventListener('online', alVolverRed)
    window.addEventListener('offline', alPerderRed)
    document.addEventListener('visibilitychange', alVolverALaApp)
    programar(0, true)

    return () => {
      vivo = false
      clearTimeout(temporizador)
      clearInterval(periodico)
      window.removeEventListener(EVENTO_COLA, alCambiar)
      window.removeEventListener('online', alVolverRed)
      window.removeEventListener('offline', alPerderRed)
      document.removeEventListener('visibilitychange', alVolverALaApp)
    }
  }, [despachar])
}
