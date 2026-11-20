import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useAvisos } from '../estado/contextos'

/**
 * Registra el service worker y avisa:
 * - cuando la app queda lista para usarse sin conexión (la primera vez);
 * - cuando hay una versión nueva. No se recarga sola para no interrumpir a quien
 *   está anotando una venta: el aviso queda fijo hasta que toque "Actualizar".
 */
export function ActualizacionPWA() {
  const avisar = useAvisos()
  const {
    needRefresh: [hayVersionNueva],
    offlineReady: [listaSinConexion],
    updateServiceWorker,
  } = useRegisterSW()

  useEffect(() => {
    if (hayVersionNueva) {
      avisar('Hay una versión nueva de la app', { fijo: true, accion: { texto: 'Actualizar', fn: () => void updateServiceWorker(true) } })
    }
  }, [hayVersionNueva, avisar, updateServiceWorker])

  useEffect(() => {
    if (listaSinConexion) avisar('Lista para usarse sin conexión')
  }, [listaSinConexion, avisar])

  return null
}
