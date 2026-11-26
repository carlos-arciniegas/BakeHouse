import type { EstadoGuardado } from '../datos/almacenamiento'
import { aplicarDesdeNube, type CambiosDeLaNube } from '../datos/mezcla'
import type { Cliente, ConfigBCV, MetodoPago, Movimiento, Negocio, Producto } from '../logica/tipos'

/**
 * Todo cambio de datos pasa por aquí. Las acciones traen los ids ya generados para que
 * el reductor sea puro (mismo estado + misma acción = mismo resultado) y se pueda probar.
 */
export type Accion =
  | { tipo: 'cliente/agregar'; cliente: Cliente }
  | { tipo: 'cliente/editar'; id: string; nombre: string; telefono: string; nota: string }
  | { tipo: 'cliente/eliminar'; id: string }
  | { tipo: 'clientes/importar'; clientes: Cliente[] }
  | { tipo: 'clientes/borrar-todo' }
  | { tipo: 'movimientos/agregar'; clienteId: string; movimientos: Movimiento[] }
  | { tipo: 'movimiento/eliminar'; clienteId: string; movId: string }
  | { tipo: 'movimiento/restaurar'; clienteId: string; movimiento: Movimiento; indice: number }
  | { tipo: 'catalogo/guardar'; indice: number | null; producto: Producto }
  | { tipo: 'catalogo/eliminar'; indice: number }
  | { tipo: 'catalogo/restaurar'; indice: number; producto: Producto }
  | { tipo: 'catalogo/reemplazar'; catalogo: Producto[] }
  | { tipo: 'metodo/guardar'; metodo: MetodoPago }
  | { tipo: 'metodo/alternar'; id: string; activo: boolean }
  | { tipo: 'metodo/eliminar'; id: string }
  | { tipo: 'metodo/restaurar'; metodo: MetodoPago; indice: number }
  | { tipo: 'negocio/guardar'; negocio: Negocio }
  | { tipo: 'bcv/guardar'; bcv: ConfigBCV }
  | { tipo: 'estado/reemplazar'; estado: EstadoGuardado }
  /** Cambios hechos en otro dispositivo; la tienda no los vuelve a enviar a la nube */
  | { tipo: 'nube/aplicar'; cambios: CambiosDeLaNube }

function conCliente(estado: EstadoGuardado, id: string, cambio: (c: Cliente) => Cliente): EstadoGuardado {
  return { ...estado, clientes: estado.clientes.map((c) => (c.id === id ? cambio(c) : c)) }
}

function insertar<T>(lista: T[], indice: number, item: T): T[] {
  const copia = lista.slice()
  copia.splice(Math.min(Math.max(indice, 0), copia.length), 0, item)
  return copia
}

export function reductor(estado: EstadoGuardado, accion: Accion): EstadoGuardado {
  switch (accion.tipo) {
    case 'cliente/agregar':
      return { ...estado, clientes: [...estado.clientes, accion.cliente] }
    case 'cliente/editar':
      return conCliente(estado, accion.id, (c) => ({ ...c, nombre: accion.nombre, telefono: accion.telefono, nota: accion.nota }))
    case 'cliente/eliminar':
      return { ...estado, clientes: estado.clientes.filter((c) => c.id !== accion.id) }
    case 'clientes/importar':
      return { ...estado, clientes: [...estado.clientes, ...accion.clientes] }
    case 'clientes/borrar-todo':
      return { ...estado, clientes: [] }

    case 'movimientos/agregar':
      return conCliente(estado, accion.clienteId, (c) => ({ ...c, movimientos: [...c.movimientos, ...accion.movimientos] }))
    case 'movimiento/eliminar':
      return conCliente(estado, accion.clienteId, (c) => ({ ...c, movimientos: c.movimientos.filter((m) => m.id !== accion.movId) }))
    case 'movimiento/restaurar':
      return conCliente(estado, accion.clienteId, (c) => ({ ...c, movimientos: insertar(c.movimientos, accion.indice, accion.movimiento) }))

    case 'catalogo/guardar': {
      const { indice, producto } = accion
      if (indice !== null && indice >= 0 && indice < estado.catalogo.length) {
        return { ...estado, catalogo: estado.catalogo.map((p, i) => (i === indice ? producto : p)) }
      }
      return { ...estado, catalogo: [...estado.catalogo, producto] }
    }
    case 'catalogo/eliminar':
      return { ...estado, catalogo: estado.catalogo.filter((_, i) => i !== accion.indice) }
    case 'catalogo/restaurar':
      return { ...estado, catalogo: insertar(estado.catalogo, accion.indice, accion.producto) }
    case 'catalogo/reemplazar':
      return { ...estado, catalogo: accion.catalogo }

    case 'metodo/guardar': {
      const existe = estado.metodos.some((m) => m.id === accion.metodo.id)
      return {
        ...estado,
        metodos: existe
          ? estado.metodos.map((m) => (m.id === accion.metodo.id ? accion.metodo : m))
          : [...estado.metodos, accion.metodo],
      }
    }
    case 'metodo/alternar':
      return { ...estado, metodos: estado.metodos.map((m) => (m.id === accion.id ? { ...m, activo: accion.activo } : m)) }
    case 'metodo/eliminar':
      return { ...estado, metodos: estado.metodos.filter((m) => m.id !== accion.id) }
    case 'metodo/restaurar':
      return { ...estado, metodos: insertar(estado.metodos, accion.indice, accion.metodo) }

    case 'negocio/guardar':
      return { ...estado, negocio: accion.negocio }
    case 'bcv/guardar':
      return { ...estado, bcv: accion.bcv }
    case 'estado/reemplazar':
      return accion.estado
    case 'nube/aplicar':
      return aplicarDesdeNube(estado, accion.cambios)
  }
}
