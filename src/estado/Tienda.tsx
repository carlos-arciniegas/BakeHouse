import { useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react'
import { cargarEstado, guardar, type EstadoGuardado } from '../datos/almacenamiento'
import { encolar, EVENTO_COLA, negocioSincronizado } from '../datos/sincronizacion'
import { paisDe } from '../logica/paises'
import { ContextoTienda } from './contextos'
import { reductor } from './reductor'

/**
 * Guarda en localStorage solo la parte del estado que cambió y, si el dispositivo guarda en la nube,
 * anota el cambio en la cola de envío (también en localStorage, para no perderlo si se cierra la app).
 */
function usePersistencia(estado: EstadoGuardado) {
  const anterior = useRef(estado)
  useEffect(() => {
    const a = anterior.current
    if (a.clientes !== estado.clientes) guardar.clientes(localStorage, estado.clientes)
    if (a.catalogo !== estado.catalogo) guardar.catalogo(localStorage, estado.catalogo)
    if (a.metodos !== estado.metodos) guardar.metodos(localStorage, estado.metodos)
    if (a.negocio !== estado.negocio) guardar.negocio(localStorage, estado.negocio)
    if (a.bcv !== estado.bcv) guardar.bcv(localStorage, estado.bcv)
    if (a.mensajeCobro !== estado.mensajeCobro) guardar.mensajeCobro(localStorage, estado.mensajeCobro)
    anterior.current = estado

    const negocioId = a !== estado ? negocioSincronizado(localStorage) : null
    if (negocioId) {
      encolar(localStorage, negocioId, a, estado)
      window.dispatchEvent(new Event(EVENTO_COLA))
    }
  }, [estado])
}

export function ProveedorTienda({ children }: { children: ReactNode }) {
  const [estado, despachar] = useReducer(reductor, undefined, () => cargarEstado(localStorage))
  usePersistencia(estado)
  const valor = useMemo(() => ({ estado, despachar, pais: paisDe(estado.negocio) }), [estado])
  return <ContextoTienda.Provider value={valor}>{children}</ContextoTienda.Provider>
}
