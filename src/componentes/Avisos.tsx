import { useCallback, useRef, useState, type ReactNode } from 'react'
import { ContextoAvisos, type Avisar, type OpcionesAviso } from '../estado/contextos'
import { sinMovimiento } from '../estado/movimiento'

interface Aviso extends OpcionesAviso {
  id: number
  mensaje: string
  saliendo: boolean
}

export function ProveedorAvisos({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const siguiente = useRef(0)

  const quitar = useCallback((id: number) => {
    setAvisos((lista) => lista.map((a) => (a.id === id ? { ...a, saliendo: true } : a)))
    setTimeout(() => setAvisos((lista) => lista.filter((a) => a.id !== id)), sinMovimiento() ? 0 : 200)
  }, [])

  const avisar = useCallback<Avisar>((mensaje, opciones = {}) => {
    const id = ++siguiente.current
    setAvisos((lista) => [...lista, { id, mensaje, saliendo: false, ...opciones }])
    setTimeout(() => quitar(id), opciones.accion ? 5000 : 2600)
  }, [quitar])

  return (
    <ContextoAvisos.Provider value={avisar}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {avisos.map((a) => (
          <div key={a.id} className={'toast' + (a.error ? ' toast--error' : '') + (a.saliendo ? ' toast--sale' : '')}>
            <span>{a.mensaje}</span>
            {a.accion && (
              <button type="button" className="toast__accion" onClick={() => { a.accion!.fn(); quitar(a.id) }}>
                {a.accion.texto}
              </button>
            )}
          </div>
        ))}
      </div>
    </ContextoAvisos.Provider>
  )
}
