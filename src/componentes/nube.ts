import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { useCallback, useEffect, useState } from 'react'
import { guardarVinculo, leerVinculo, mensajeDeError, type ErrorAuth } from '../datos/cuenta'
import type { EstadoGuardado } from '../datos/almacenamiento'
import type { FilaNegocio } from '../datos/nube'
import type { Database } from '../datos/baseDeDatos'
import { guardarCursor, traerCambios, vaciarCola, type DestinoSync, type OrigenNube } from '../datos/sincronizacion'
import { guardarSubida, leerSubida, olvidarSubida, subirDatos, type ResumenSubida } from '../datos/subida'
import { supabase } from '../datos/supabase'
import { useTienda } from '../estado/contextos'
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

/** Lee de las tablas de un negocio de Supabase (lo que cambió en otros dispositivos) */
export function crearOrigen(nube: SupabaseClient<Database>, negocioId: string): OrigenNube {
  return {
    leer: async (tabla, desde, inicio, limite) => {
      let consulta = nube.from(tabla as 'clientes').select('*').eq('negocio_id', negocioId)
      if (desde) consulta = consulta.gte('actualizado_en', desde)
      const { data, error, status } = await consulta.order('actualizado_en').order('id').range(inicio, inicio + limite - 1)
      return { filas: data, error: error ? { status, code: error.code } : null }
    },
    leerNegocio: async () => {
      const { data, error, status } = await nube.from('negocios').select('*').eq('id', negocioId).limit(1)
      return { fila: data?.[0] ?? null, error: error ? { status, code: error.code } : null }
    },
  }
}

/** ¿El negocio ya tiene clientes o productos en la nube? (entonces este es un dispositivo más) */
async function tieneDatos(nube: SupabaseClient<Database>, negocioId: string): Promise<boolean | null> {
  const contar = (tabla: 'clientes' | 'productos') =>
    nube.from(tabla).select('id', { count: 'exact', head: true }).eq('negocio_id', negocioId).is('borrado_en', null)
  const [c, p] = await Promise.all([contar('clientes'), contar('productos')])
  if (c.error || p.error) return null
  return (c.count ?? 0) + (p.count ?? 0) > 0
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
  const { despachar } = useTienda()
  // Si el negocio conectado ya tiene datos en la nube (por negocio, para no mezclar respuestas viejas)
  const [conDatos, setConDatos] = useState<{ negocioId: string; valor: boolean | null } | null>(null)

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

  const subidaVigente = subida !== null && subida.negocioId === vinculo
  const necesitaSaber = supabase !== null && usuarioId !== null && vinculo !== null && !subidaVigente
  useEffect(() => {
    if (!supabase || !necesitaSaber || !vinculo) return
    let vigente = true
    void tieneDatos(supabase, vinculo).then((valor) => {
      if (vigente) setConDatos({ negocioId: vinculo, valor })
    })
    return () => { vigente = false }
  }, [necesitaSaber, vinculo])

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

  /** Dispositivo nuevo: reemplaza lo local por lo que hay en la nube y desde ahí sincroniza */
  const traerDeLaNube = async (): Promise<{ ok: true; resumen: ResumenSubida } | { ok: false; mensaje: string }> => {
    if (!supabase || !vinculo) return { ok: false, mensaje: 'Primero conecta este dispositivo a un negocio.' }
    const r = await traerCambios(crearOrigen(supabase, vinculo), null)
    if (!r.ok) return { ok: false, mensaje: mensajeDeError(r.error) }
    // Lo pendiente de antes ya no aplica: lo local se reemplaza
    vaciarCola(localStorage)
    despachar({ tipo: 'nube/aplicar', cambios: { filas: r.filas, negocio: r.negocio, pendientes: [], reemplazar: true } })
    if (r.hasta) guardarCursor(localStorage, vinculo, r.hasta)
    const vivas = <T extends { borrado_en: string | null }>(l: T[]) => l.filter((f) => f.borrado_en === null).length
    const resumen = { negocioId: vinculo, fecha: new Date().toISOString(), clientes: vivas(r.filas.clientes), movimientos: vivas(r.filas.movimientos) }
    guardarSubida(localStorage, resumen)
    setSubida(resumen)
    return { ok: true, resumen }
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
    ultimaSubida: subidaVigente ? subida : null,
    /** undefined mientras se averigua; null si no se pudo saber (se ofrece subir) */
    nubeConDatos: conDatos?.negocioId === vinculo ? conDatos.valor : undefined,
    error,
    enviarEnlace,
    crearEnNube,
    subirMisDatos,
    traerDeLaNube,
    conectar,
    cerrarSesion,
  }
}
