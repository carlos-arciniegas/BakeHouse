import { useEffect, useState } from 'react'
import { convertirABolivares, formatearBolivares, formatearMoneda, tasaActiva } from '../logica/moneda'
import { calcularResumenGlobal, fraseResumen } from '../logica/saldo'
import { useTienda, useUI, type Vista } from '../estado/contextos'
import { horaCorta } from '../estado/movimiento'
import { Icono } from './base'
import { useConteo, useMarca, useSincronizarBCV } from './ganchos'
import type { NombreIcono } from './iconos'

function TasaBCV() {
  const { estado, despachar } = useTienda()
  const { sincronizar, cargando } = useSincronizarBCV()
  const tasa = estado.bcv.tasa
  const [texto, setTexto] = useState(tasa > 0 ? tasa.toFixed(2) : '')
  const [tasaAntes, setTasaAntes] = useState(tasa)

  // Si la tasa cambia desde fuera (sincronización, respaldo), se refleja en el campo
  if (tasa !== tasaAntes) {
    setTasaAntes(tasa)
    if (parseFloat(texto) !== tasa) setTexto(tasa > 0 ? tasa.toFixed(2) : '')
  }

  const alEscribir = (valor: string) => {
    setTexto(valor)
    const num = parseFloat(valor)
    despachar({ tipo: 'bcv/guardar', bcv: { tasa: num > 0 ? num : 0, actualizado: 'Manual ' + horaCorta() } })
  }

  return (
    <div className="tasa solo-tasa" title="Tasa oficial del BCV, en bolívares por dólar">
      <span className="tasa__hora">{estado.bcv.actualizado ? estado.bcv.actualizado.replace(/^BCV\s*/, 'Actualizada ') : 'Sin sincronizar'}</span>
      <label htmlFor="inputTasaBCV" className="tasa__etq">BCV</label>
      <input
        id="inputTasaBCV" className="tasa__entrada" type="number" step="0.01" min="0" inputMode="decimal" placeholder="0,00"
        value={texto} onChange={(e) => alEscribir(e.target.value)}
      />
      <span className="tasa__unidad">Bs/$</span>
      <button type="button" className="tasa__sync" onClick={() => sincronizar(false)} disabled={cargando} aria-label="Actualizar tasa BCV">
        <Icono nombre="sync" chico className={cargando ? 'girando' : undefined} />
      </button>
    </div>
  )
}

export function Barra() {
  const { corto } = useMarca()
  return (
    <header className="barra">
      <div className="marca">
        <span className="marca__nombre">{corto}</span>
      </div>
      <TasaBCV />
    </header>
  )
}

const SECCIONES: { vista: Vista; icono: NombreIcono; etiqueta: string; etiquetaLarga?: string }[] = [
  { vista: 'cuentas', icono: 'libreta', etiqueta: 'Cuentas' },
  { vista: 'catalogo', icono: 'galleta', etiqueta: 'Catálogo' },
  { vista: 'pagos', icono: 'tarjeta', etiqueta: 'Pagos', etiquetaLarga: 'Métodos de pago' },
  { vista: 'ajustes', icono: 'ajustes', etiqueta: 'Ajustes' },
]

export function Navegacion() {
  const { vista, irA } = useUI()
  const { completo, corto, resto } = useMarca()
  return (
    <nav className="nav" aria-label="Secciones">
      <div className="nav__marca marca">
        <span className="marca__nombre">{resto ? corto : completo}</span>
        {resto && <span className="marca__sub">{resto}</span>}
      </div>
      {SECCIONES.map((s) => (
        <button key={s.vista} type="button" className="nav__item" aria-current={vista === s.vista ? 'page' : undefined} onClick={() => irA(s.vista)}>
          <Icono nombre={s.icono} />
          {s.etiquetaLarga ? (
            <>
              <span className="solo-movil">{s.etiqueta}</span>
              <span className="solo-escritorio">{s.etiquetaLarga}</span>
            </>
          ) : (
            <span>{s.etiqueta}</span>
          )}
        </button>
      ))}
    </nav>
  )
}

/** La animación de entrada del toldo ocurre una sola vez por sesión, no cada vez que se vuelve a Cuentas */
let toldoYaEntro = false
/** Al volver a Cuentas el total arranca desde el último valor mostrado, no desde 0 */
let ultimoTotal = 0

/** El total por cobrar bajo el borde de pastelería. Al abrir la app el toldo se "desenrolla" una vez. */
export function Toldo() {
  const { estado, pais } = useTienda()
  const resumen = calcularResumenGlobal(estado.clientes)
  const total = useConteo(resumen.porCobrar, ultimoTotal)
  useEffect(() => { ultimoTotal = resumen.porCobrar }, [resumen.porCobrar])
  const [entrada, setEntrada] = useState(() => !toldoYaEntro)

  useEffect(() => {
    toldoYaEntro = true
    const t = setTimeout(() => setEntrada(false), 1200)
    return () => clearTimeout(t)
  }, [])

  return (
    <section className={'toldo' + (entrada ? ' toldo--entrada' : '')} aria-labelledby="ticketEtq">
      <div className="toldo__fondo">
        <div className="toldo__cuerpo">
          <p id="ticketEtq" className="toldo__etq">Te deben</p>
          <p className="toldo__total">{formatearMoneda(total, pais)}</p>
          <p className="toldo__bs solo-tasa">
            {tasaActiva(pais, estado.bcv.tasa)
              ? formatearBolivares(convertirABolivares(resumen.porCobrar, estado.bcv.tasa))
              : 'Escribe la tasa BCV para ver bolívares'}
          </p>
          <p className="toldo__resumen">{fraseResumen(resumen, (n) => formatearMoneda(n, pais))}</p>
        </div>
      </div>
      <div className="toldo__borde" aria-hidden="true" />
    </section>
  )
}
