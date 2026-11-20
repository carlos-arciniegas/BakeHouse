import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { useCallback, useEffect, useState } from 'react'
import { guardarVinculo, leerVinculo, mensajeDeError, type ErrorAuth } from '../datos/cuenta'
import type { EstadoGuardado } from '../datos/almacenamiento'
import type { FilaNegocio } from '../datos/nube'
import type { Database } from '../datos/baseDeDatos'
import type { DestinoSync } from '../datos/sincronizacion'
import { guardarSubida, leerSubida, olvidarSubida, subirDatos, type ResumenSubida } from '../datos/subida'
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

/** Escribe en las tablas de un negocio de Supabase (lo usan la subida completa y la cola) */
export function crearDestino(nube: SupabaseClient<Database>, negocioId: string): DestinoSync {
  const comoError = ({ error, status }: { error: { code: string } | null; status: number }): ErrorAuth | null =>
    error ? { status, code: error.code } : null
  return {
    // upsert por (negocio_id, id): repetir no duplica
    guardar: async (tabla, filas) => comoError(await nube.from(tabla).upsert(filas as never, { onConflict: 'negocio_id,id' })),
    actualizarNegocio: async (fila) => comoError(await nube.from('negocios').update(fila).eq('id', negocioId)),
    borrar: async (tabla, ids, cuando) =>
      comoError(await nube.from(tabla).update({ borrado_en: cuando }).eq('negocio_id', negocioId).in('id', ids)),
  }
}

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
  const [subida, setSubida] = useState(() => leerSubida(localStorage))

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

  /** Sube todo lo del dispositivo al negocio conectado; se puede repetir sin duplicar */
  const subirMisDatos = async (
    estado: EstadoGuardado,
    alAvanzar: (enviadas: number, total: number) => void,
  ): Promise<{ ok: true; resumen: ResumenSubida } | { ok: false; mensaje: string }> => {
    if (!supabase || !vinculo) return { ok: false, mensaje: 'Primero conecta este dispositivo a un negocio.' }
    const r = await subirDatos(crearDestino(supabase, vinculo), estado, vinculo, alAvanzar)
    if (!r.ok) {
      const mensaje = mensajeDeError(r.error)
      return { ok: false, mensaje: r.enviadas > 0 ? mensaje + ' Lo que ya se subió no se duplica al reintentar.' : mensaje }
    }
    guardarSubida(localStorage, r.resumen)
    setSubida(r.resumen)
    return r
  }

  const cerrarSesion = async () => {
    // Lo que se anote sin sesión no entra en la cola: al volver habrá que subir todo de nuevo
    olvidarSubida(localStorage)
    setSubida(null)
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
    // Solo la del negocio conectado
    ultimaSubida: subida && subida.negocioId === vinculo ? subida : null,
    error,
    enviarEnlace,
    crearEnNube,
    subirMisDatos,
    conectar,
    cerrarSesion,
  }
}
