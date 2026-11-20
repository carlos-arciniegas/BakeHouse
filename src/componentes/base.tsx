import { useEffect, useId, useState, type ReactNode } from 'react'
import { sinMovimiento } from '../estado/movimiento'
import { TRAZOS, type NombreIcono } from './iconos'

/** Los trazos son constantes del propio código, no vienen del usuario */
export function Icono({ nombre, chico, className }: { nombre: NombreIcono; chico?: boolean; className?: string }) {
  return (
    <svg
      className={'i' + (chico ? ' i--s' : '') + (className ? ' ' + className : '')}
      viewBox="0 0 24 24"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: TRAZOS[nombre] }}
    />
  )
}

// ---------- Hoja (modal) ----------

/** Pila de hojas abiertas: Escape cierra solo la de arriba */
const pila: string[] = []

interface PropsHoja {
  abierta: boolean
  alCerrar: () => void
  titulo: string
  chica?: boolean
  alerta?: boolean
  descripcionId?: string
  children: ReactNode
}

/**
 * Sube desde abajo en el móvil y aparece centrada en escritorio. Al cerrarse anima la salida;
 * quien la usa debe seguir pasándole el último contenido mientras tanto (ver <Hojas> en App).
 */
export function Hoja({ abierta, alCerrar, titulo, chica, alerta, descripcionId, children }: PropsHoja) {
  const id = useId()
  const [fase, setFase] = useState<'cerrada' | 'abierta' | 'cerrando'>(abierta ? 'abierta' : 'cerrada')
  const [abiertaAntes, setAbiertaAntes] = useState(abierta)

  // Patrón recomendado por React para reaccionar a un cambio de prop durante el render
  if (abierta !== abiertaAntes) {
    setAbiertaAntes(abierta)
    setFase(abierta ? 'abierta' : 'cerrando')
  }

  useEffect(() => {
    if (fase !== 'cerrando') return
    const t = setTimeout(() => setFase('cerrada'), sinMovimiento() ? 0 : 180)
    return () => clearTimeout(t)
  }, [fase])

  useEffect(() => {
    if (!abierta) return
    pila.push(id)
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && pila[pila.length - 1] === id) alCerrar()
    }
    document.addEventListener('keydown', alTeclear)
    return () => {
      document.removeEventListener('keydown', alTeclear)
      pila.splice(pila.indexOf(id), 1)
    }
  }, [abierta, alCerrar, id])

  if (fase === 'cerrada') return null

  return (
    <div
      className={'capa' + (fase === 'cerrando' ? ' cerrando' : '')}
      role={alerta ? 'alertdialog' : 'dialog'}
      aria-modal="true"
      aria-labelledby={id + '-titulo'}
      aria-describedby={descripcionId}
      onClick={(e) => { if (e.target === e.currentTarget) alCerrar() }}
    >
      <div className={'hoja' + (chica ? ' hoja--chica' : '')}>
        <div className="hoja__cabeza" style={alerta ? { paddingBottom: 6 } : undefined}>
          <h2 id={id + '-titulo'}>{titulo}</h2>
          {!alerta && (
            <button type="button" className="icono-boton" aria-label="Cerrar" onClick={alCerrar}>
              <Icono nombre="x" />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  )
}

// ---------- Controles ----------

export function Interruptor({ titulo, ayuda, activo, alCambiar, etiquetaOculta }: {
  titulo?: string
  ayuda?: string
  activo: boolean
  alCambiar: (activo: boolean) => void
  /** Para usarlo sin texto visible (en listas) */
  etiquetaOculta?: string
}) {
  return (
    <label className="interruptor" title={etiquetaOculta}>
      {etiquetaOculta ? (
        <span className="sr">{etiquetaOculta}</span>
      ) : (
        <span>
          <b>{titulo}</b>
          {ayuda && <span className="ayuda">{ayuda}</span>}
        </span>
      )}
      <input type="checkbox" checked={activo} onChange={(e) => alCambiar(e.target.checked)} />
      <span className="interruptor__riel" aria-hidden="true" />
    </label>
  )
}

/** "Cómo pagó": botones de opción con los métodos del negocio */
export function OpcionesPago({ nombre, opciones, valor, alCambiar }: {
  nombre: string
  opciones: string[]
  valor: string
  alCambiar: (v: string) => void
}) {
  return (
    <fieldset className="campo" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="campo__etq" style={{ marginBottom: 6 }}>Cómo pagó</legend>
      <div className="opciones">
        {opciones.map((o) => (
          <label key={o} className="opcion">
            <input type="radio" name={nombre} value={o} checked={valor === o} onChange={() => alCambiar(o)} />
            <span>{o}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
