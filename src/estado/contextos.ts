import { createContext, useContext } from 'react'
import type { EstadoGuardado } from '../datos/almacenamiento'
import type { Pais } from '../logica/tipos'
import type { Accion } from './reductor'

// Contextos y sus hooks en un archivo sin componentes (así Vite puede recargar los componentes en caliente)

// ---------- Datos ----------

export interface ValorTienda {
  estado: EstadoGuardado
  despachar: (accion: Accion) => void
  pais: Pais
}

export const ContextoTienda = createContext<ValorTienda | null>(null)

export function useTienda(): ValorTienda {
  const valor = useContext(ContextoTienda)
  if (!valor) throw new Error('useTienda debe usarse dentro de <ProveedorTienda>')
  return valor
}

// ---------- Interfaz ----------

export type Vista = 'cuentas' | 'catalogo' | 'pagos' | 'ajustes'

/** Qué hoja (modal) está abierta y con qué datos */
export type Hoja =
  | { tipo: 'cliente'; id?: string }
  | { tipo: 'venta'; clienteId?: string }
  | { tipo: 'pago'; clienteId?: string }
  | { tipo: 'metodo'; id?: string }

export interface Confirmacion {
  titulo: string
  mensaje: string
  textoBoton?: string
  alConfirmar: () => void
}

export interface ValorUI {
  vista: Vista
  irA: (vista: Vista) => void
  hoja: Hoja | null
  abrirHoja: (hoja: Hoja) => void
  cerrarHoja: () => void
  confirmacion: Confirmacion | null
  confirmar: (c: Confirmacion) => void
  cerrarConfirmacion: () => void
  /** Cliente que parpadea tras guardar algo; se apaga solo */
  resaltado: string | null
  resaltar: (clienteId: string) => void
}

export const ContextoUI = createContext<ValorUI | null>(null)

export function useUI(): ValorUI {
  const valor = useContext(ContextoUI)
  if (!valor) throw new Error('useUI debe usarse dentro de <ProveedorUI>')
  return valor
}

// ---------- Avisos ----------

export interface OpcionesAviso {
  error?: boolean
  /** Botón dentro del aviso, por ejemplo "Deshacer" */
  accion?: { texto: string; fn: () => void }
}

export type Avisar = (mensaje: string, opciones?: OpcionesAviso) => void

export const ContextoAvisos = createContext<Avisar>(() => {})

export function useAvisos(): Avisar {
  return useContext(ContextoAvisos)
}
