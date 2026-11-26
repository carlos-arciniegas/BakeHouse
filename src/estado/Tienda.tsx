import { useCallback, useEffect, useMemo, useReducer, useRef, type ReactNode, type RefObject } from 'react'
import { cargarEstado, guardar, type EstadoGuardado } from '../datos/almacenamiento'
import { encolar, EVENTO_COLA, negocioSincronizado } from '../datos/sincronizacion'
import { paisDe } from '../logica/paises'
import { ContextoTienda } from './contextos'
import { reductor, type Accion } from './reductor'

/** De dónde vino el último cambio: si todo vino de la nube, no hay nada que enviarle */
type Origen = 'local' | 'nube' | null

/**
 * Guarda en localStorage solo la parte del estado que cambió y, si el dispositivo guarda en la nube,
 * anota el cambio en la cola de envío (también en localStorage, para no perderlo si se cierra la app).
 */
function usePersistencia(estado: EstadoGuardado, origenRef: RefObject<Origen>) {
  const anterior = useRef(estado)
  useEffect(() => {
    const a = anterior.current
    if (a.clientes !== estado.clientes) guardar.clientes(localStorage, estado.clientes)
    if (a.catalogo !== estado.catalogo) guardar.catalogo(localStorage, estado.catalogo)
    if (a.metodos !== estado.metodos) guardar.metodos(localStorage, estado.metodos)
    if (a.negocio !== estado.negocio) guardar.negocio(localStorage, estado.negocio)
    if (a.bcv !== estado.bcv) guardar.bcv(localStorage, estado.bcv)
    anterior.current = estado

    const soloDeLaNube = origenRef.current === 'nube'
    origenRef.current = null
    const negocioId = a !== estado && !soloDeLaNube ? negocioSincronizado(localStorage) : null
    if (negocioId) {
      encolar(localStorage, negocioId, a, estado)
      window.dispatchEvent(new Event(EVENTO_COLA))
    }
  }, [estado, origenRef])
}

export function ProveedorTienda({ children }: { children: ReactNode }) {
  const [estado, despacharBase] = useReducer(reductor, undefined, () => cargarEstado(localStorage))
  const origenRef = useRef<Origen>(null)
  // Si en el mismo render se juntan un cambio local y uno de la nube, cuenta como local (se envía la diferencia)
  const despachar = useCallback((accion: Accion) => {
    origenRef.current = accion.tipo === 'nube/aplicar' && origenRef.current !== 'local' ? 'nube' : 'local'
    despacharBase(accion)
  }, [])
  usePersistencia(estado, origenRef)
  const valor = useMemo(() => ({ estado, despachar, pais: paisDe(estado.negocio) }), [estado, despachar])
  return <ContextoTienda.Provider value={valor}>{children}</ContextoTienda.Provider>
}
