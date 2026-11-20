import { useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react'
import { cargarEstado, guardar, type EstadoGuardado } from '../datos/almacenamiento'
import { paisDe } from '../logica/paises'
import { ContextoTienda } from './contextos'
import { reductor } from './reductor'

/** Guarda en localStorage solo la parte del estado que cambió */
function usePersistencia(estado: EstadoGuardado) {
  const anterior = useRef(estado)
  useEffect(() => {
    const a = anterior.current
    if (a.clientes !== estado.clientes) guardar.clientes(localStorage, estado.clientes)
    if (a.catalogo !== estado.catalogo) guardar.catalogo(localStorage, estado.catalogo)
    if (a.metodos !== estado.metodos) guardar.metodos(localStorage, estado.metodos)
    if (a.negocio !== estado.negocio) guardar.negocio(localStorage, estado.negocio)
    if (a.bcv !== estado.bcv) guardar.bcv(localStorage, estado.bcv)
    anterior.current = estado
  }, [estado])
}

export function ProveedorTienda({ children }: { children: ReactNode }) {
  const [estado, despachar] = useReducer(reductor, undefined, () => cargarEstado(localStorage))
  usePersistencia(estado)
  const valor = useMemo(() => ({ estado, despachar, pais: paisDe(estado.negocio) }), [estado])
  return <ContextoTienda.Provider value={valor}>{children}</ContextoTienda.Provider>
}
