import { useEffect, useRef, useState } from 'react'
import { obtenerTasaBCV } from '../logica/bcv'
import { fechaHoy } from '../logica/fechas'
import { formatearBolivares } from '../logica/moneda'
import { normalizarTelefono } from '../logica/telefono'
import { useAvisos, useTienda, useUI } from '../estado/contextos'
import { horaCorta, nuevoId, sinMovimiento } from '../estado/movimiento'

/** Cuenta desde el valor anterior hasta el nuevo (el total del toldo) */
export function useConteo(valor: number, inicial = 0, duracion = 650): number {
  const [mostrado, setMostrado] = useState(inicial)
  const desde = useRef(inicial)

  useEffect(() => {
    const inicio = desde.current
    // Sin animación: un solo cuadro que salta al valor final
    const instantaneo = sinMovimiento() || Math.abs(valor - inicio) < 0.005
    let cuadro = 0
    const t0 = performance.now()
    const paso = (ahora: number) => {
      const t = instantaneo ? 1 : Math.min(1, (ahora - t0) / duracion)
      const actual = inicio + (valor - inicio) * (1 - Math.pow(1 - t, 3))
      desde.current = actual
      setMostrado(actual)
      if (t < 1) cuadro = requestAnimationFrame(paso)
    }
    cuadro = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(cuadro)
  }, [valor, duracion])

  return mostrado
}

/** Copia texto al portapapeles; devuelve si lo logró */
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    return false
  }
}

/** Nombre del negocio: se acorta en la barra del móvil solo cuando comparte espacio con la tasa BCV */
export function useMarca() {
  const { estado, pais } = useTienda()
  const nombre = estado.negocio.nombre.trim()
  const partes = nombre.split(/\s+/)
  const acortar = Boolean(pais.tasaBCV) && partes.length > 1 && nombre.length > 12
  return { completo: nombre, corto: acortar ? partes[0] : nombre, resto: acortar ? partes.slice(1).join(' ') : '' }
}

/** Sincroniza la tasa BCV; si es silenciosa no avisa nada */
export function useSincronizarBCV() {
  const { despachar } = useTienda()
  const avisar = useAvisos()
  const [cargando, setCargando] = useState(false)

  const sincronizar = async (silencioso = false) => {
    setCargando(true)
    const tasa = await obtenerTasaBCV()
    setCargando(false)
    if (tasa) {
      despachar({ tipo: 'bcv/guardar', bcv: { tasa, actualizado: 'BCV ' + horaCorta() } })
      if (!silencioso) avisar('Tasa BCV actualizada: ' + formatearBolivares(tasa))
    } else if (!silencioso) {
      avisar('No se pudo consultar la tasa. Escríbela a mano.', { error: true })
    }
  }
  return { sincronizar, cargando }
}

/** Agrega un cliente de prueba con una venta, usando el teléfono de ejemplo del país */
export function useClienteEjemplo() {
  const { despachar, pais } = useTienda()
  const { irA, resaltar } = useUI()
  const avisar = useAvisos()
  return () => {
    const id = nuevoId('cli_ej')
    despachar({
      tipo: 'cliente/agregar',
      cliente: {
        id, nombre: 'Carlos Mendoza (Prueba)', telefono: normalizarTelefono(pais.ejemploTel, pais), nota: 'Cliente frecuente',
        movimientos: [{ id: nuevoId('mov_ej'), tipo: 'venta', descripcion: '2x Galleta Choco Chip 30g + 1x Brownie Fudge 7x7', monto: 5.5, fecha: fechaHoy() }],
      },
    })
    irA('cuentas')
    resaltar(id)
    avisar('Cliente de ejemplo agregado')
  }
}
