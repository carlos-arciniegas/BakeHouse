import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { ContextoUI, type Confirmacion, type Hoja, type ValorUI, type Vista } from './contextos'

export function ProveedorUI({ children }: { children: ReactNode }) {
  const [vista, setVista] = useState<Vista>('cuentas')
  const [hoja, setHoja] = useState<Hoja | null>(null)
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null)
  const [resaltado, setResaltado] = useState<string | null>(null)
  const temporizador = useRef<ReturnType<typeof setTimeout>>(undefined)

  const irA = useCallback((v: Vista) => {
    setVista(v)
    window.scrollTo(0, 0)
  }, [])

  const resaltar = useCallback((id: string) => {
    setResaltado(id)
    clearTimeout(temporizador.current)
    temporizador.current = setTimeout(() => setResaltado(null), 1500)
  }, [])

  const valor = useMemo<ValorUI>(() => ({
    vista,
    irA,
    hoja,
    abrirHoja: setHoja,
    cerrarHoja: () => setHoja(null),
    confirmacion,
    confirmar: setConfirmacion,
    cerrarConfirmacion: () => setConfirmacion(null),
    resaltado,
    resaltar,
  }), [vista, irA, hoja, confirmacion, resaltado, resaltar])

  return <ContextoUI.Provider value={valor}>{children}</ContextoUI.Provider>
}
