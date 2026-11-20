import type { Session } from '@supabase/supabase-js'
import { useCallback, useEffect, useState } from 'react'
import { guardarVinculo, leerVinculo, mensajeDeError, type ErrorAuth } from '../datos/cuenta'
import type { FilaNegocio } from '../datos/nube'
import { supabase } from '../datos/supabase'
import type { Negocio } from '../logica/tipos'

/** Sesión de Supabase en este dispositivo. Se mantiene sola: el token se renueva en segundo plano. */
export function useSesion() {
  const [estado, setEstado] = useState<{ cargando: boolean; sesion: Session | null }>({ cargando: supabase !== null, sesion: null })

  useEffect(() => {
    if (!supabase) return
    // Avisa de inmediato con la sesión guardada (INITIAL_SESSION) y después de cada cambio
    const { data } = supabase.auth.onAuthStateChange((_evento, sesion) => setEstado({ cargando: false, sesion }))
    return () => data.subscription.unsubscribe()
  }, [])

  return estado
}

export type ResultadoNube = { ok: true } | { ok: false; mensaje: string }

const fallo = (error: ErrorAuth): ResultadoNube => ({ ok: false, mensaje: mensajeDeError(error) })

/**
 * Cuenta en la nube: sesión, negocios de la cuenta y el negocio conectado a este dispositivo.
 * Si la cuenta tiene un solo negocio, se conecta solo (un toque menos).
 */
export function useCuentaNube() {
  const { sesion, cargando } = useSesion()
  const usuarioId = sesion?.user.id ?? null
  const [negocios, setNegocios] = useState<FilaNegocio[] | null>(null)
  const [vinculo, setVinculo] = useState(() => leerVinculo(localStorage))
  const [error, setError] = useState<string | null>(null)

  // Al cambiar de cuenta (o cerrar sesión) se olvida la lista anterior
  const [usuarioAntes, setUsuarioAntes] = useState(usuarioId)
  if (usuarioId !== usuarioAntes) {
    setUsuarioAntes(usuarioId)
    setNegocios(null)
    setError(null)
  }

  const conectar = useCallback((id: string | null) => {
    guardarVinculo(localStorage, id)
    setVinculo(id)
  }, [])

  useEffect(() => {
    if (!supabase || !usuarioId) return
    let vigente = true
    supabase.from('negocios').select('*').order('creado_en').then(({ data, error: e }) => {
      if (!vigente) return
      if (e) {
        setError(mensajeDeError({ status: 500, code: e.code }))
        return
      }
      setNegocios(data)
      const actual = leerVinculo(localStorage)
      if (!data.some((n) => n.id === actual) && data.length === 1) conectar(data[0].id)
    })
    return () => { vigente = false }
  }, [usuarioId, conectar])

  const enviarEnlace = async (correo: string): Promise<ResultadoNube> => {
    if (!supabase) return { ok: false, mensaje: 'La nube no está configurada.' }
    const { error: e } = await supabase.auth.signInWithOtp({
      email: correo.trim(),
      // El enlace vuelve a esta misma app (en GitHub Pages o en desarrollo)
      options: { emailRedirectTo: window.location.origin + import.meta.env.BASE_URL },
    })
    return e ? fallo(e) : { ok: true }
  }

  const crearEnNube = async (negocio: Negocio): Promise<ResultadoNube> => {
    if (!supabase) return { ok: false, mensaje: 'La nube no está configurada.' }
    const { data: id, error: e } = await supabase.rpc('crear_negocio', { nombre: negocio.nombre, pais: negocio.pais })
    if (e || !id) return fallo({ status: 500, code: e?.code })
    const ahora = new Date().toISOString()
    setNegocios((lista) => [...(lista ?? []), {
      id, nombre: negocio.nombre, pais: negocio.pais, tasa_bcv: 0, tasa_bcv_actualizada: '', creado_en: ahora, actualizado_en: ahora,
    }])
    conectar(id)
    return { ok: true }
  }

  const cerrarSesion = async () => {
    conectar(null)
    await supabase?.auth.signOut()
  }

  const conectado = negocios?.find((n) => n.id === vinculo) ?? null

  return {
    disponible: supabase !== null,
    cargando: cargando || (usuarioId !== null && negocios === null && error === null),
    correo: sesion?.user.email ?? null,
    negocios: negocios ?? [],
    conectado,
    error,
    enviarEnlace,
    crearEnNube,
    conectar,
    cerrarSesion,
  }
}
