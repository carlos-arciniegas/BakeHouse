import { useEffect, useState } from 'react'
import './estilos/app.css'
import { ActualizacionPWA } from './componentes/ActualizacionPWA'
import { ProveedorAvisos } from './componentes/Avisos'
import { Hoja } from './componentes/base'
import { useSincronizarBCV } from './componentes/ganchos'
import { HojaCliente } from './componentes/hojas/HojaCliente'
import { HojaMetodo } from './componentes/hojas/HojaMetodo'
import { HojaPago } from './componentes/hojas/HojaPago'
import { HojaVenta } from './componentes/hojas/HojaVenta'
import { Barra, Navegacion, Toldo } from './componentes/Marco'
import { useSincronizacion } from './componentes/sincronizacion'
import { Ajustes } from './componentes/vistas/Ajustes'
import { Catalogo } from './componentes/vistas/Catalogo'
import { Cuentas } from './componentes/vistas/Cuentas'
import { Pagos } from './componentes/vistas/Pagos'
import { useTienda, useUI, type Confirmacion, type Hoja as HojaAbierta } from './estado/contextos'
import { ProveedorTienda } from './estado/Tienda'
import { ProveedorUI } from './estado/UI'

const TITULOS: Record<HojaAbierta['tipo'], [nuevo: string, editar: string]> = {
  cliente: ['Nuevo cliente', 'Editar cliente'],
  venta: ['Nueva venta', 'Nueva venta'],
  pago: ['Nuevo pago', 'Nuevo pago'],
  metodo: ['Nuevo método', 'Editar método'],
}

/** Recuerda el último valor no nulo, para seguir mostrando una hoja mientras anima su salida */
function useUltimo<T>(valor: T | null): T | null {
  const [ultimo, setUltimo] = useState(valor)
  if (valor !== null && valor !== ultimo) setUltimo(valor)
  return valor ?? ultimo
}

function Hojas() {
  const { hoja, cerrarHoja, confirmacion, cerrarConfirmacion } = useUI()
  const h = useUltimo<HojaAbierta>(hoja)
  const c = useUltimo<Confirmacion>(confirmacion)
  const editando = h !== null && 'id' in h && Boolean(h.id)
  // El "key" hace que cada apertura empiece con el formulario limpio
  const clave = h ? JSON.stringify(h) : ''

  return (
    <>
      <Hoja abierta={hoja !== null} alCerrar={cerrarHoja} titulo={h ? TITULOS[h.tipo][editando ? 1 : 0] : ''}>
        {h?.tipo === 'cliente' && <HojaCliente key={clave} id={h.id} />}
        {h?.tipo === 'venta' && <HojaVenta key={clave} clienteId={h.clienteId} />}
        {h?.tipo === 'pago' && <HojaPago key={clave} clienteId={h.clienteId} />}
        {h?.tipo === 'metodo' && <HojaMetodo key={clave} id={h.id} />}
      </Hoja>

      <Hoja abierta={confirmacion !== null} alCerrar={cerrarConfirmacion} titulo={c?.titulo ?? ''} chica alerta descripcionId="confirmMensaje">
        <p id="confirmMensaje" className="hoja__texto">{c?.mensaje}</p>
        <div className="hoja__pie" style={{ paddingTop: 20 }}>
          <button type="button" className="boton boton--suave" onClick={cerrarConfirmacion}>Cancelar</button>
          <button type="button" className="boton boton--peligro" onClick={() => { c?.alConfirmar(); cerrarConfirmacion() }}>
            {c?.textoBoton ?? 'Sí, continuar'}
          </button>
        </div>
      </Hoja>
    </>
  )
}

function Aplicacion() {
  const { estado, pais } = useTienda()
  const { vista } = useUI()
  const { sincronizar } = useSincronizarBCV()
  // Envía a la nube lo anotado (solo si este dispositivo ya subió sus datos)
  useSincronizacion()
  const [bcvAlAbrir] = useState(() => Boolean(pais.tasaBCV))

  // La pestaña lleva el nombre del negocio; fuera de Venezuela se ocultan bolívares y BCV
  useEffect(() => { document.title = estado.negocio.nombre }, [estado.negocio.nombre])
  useEffect(() => { document.body.classList.toggle('sin-tasa', !pais.tasaBCV) }, [pais])

  // Al abrir la app, consultar la tasa BCV en silencio (solo Venezuela). Una sola vez.
  const [sincronizarAlAbrir] = useState(() => sincronizar)
  useEffect(() => {
    if (bcvAlAbrir) void sincronizarAlAbrir(true)
  }, [bcvAlAbrir, sincronizarAlAbrir])

  return (
    <div className="app">
      <Barra />
      <Navegacion />
      {vista === 'cuentas' && <Toldo />}
      <main className="contenido">
        {vista === 'cuentas' && <Cuentas />}
        {vista === 'catalogo' && <Catalogo />}
        {vista === 'pagos' && <Pagos />}
        {vista === 'ajustes' && <Ajustes />}
      </main>
      <Hojas />
      <ActualizacionPWA />
    </div>
  )
}

export default function App() {
  return (
    <ProveedorTienda>
      <ProveedorUI>
        <ProveedorAvisos>
          <Aplicacion />
        </ProveedorAvisos>
      </ProveedorUI>
    </ProveedorTienda>
  )
}
