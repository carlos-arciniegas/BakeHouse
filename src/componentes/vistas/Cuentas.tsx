import { useEffect, useRef, useState } from 'react'
import { formatearFechaCorta } from '../../logica/fechas'
import { convertirABolivares, formatearBolivares, formatearMoneda, tasaActiva } from '../../logica/moneda'
import { calcularResumenCliente, estadoSaldo, filtrarClientes, ordenarClientes, textoMovimiento, type Filtro } from '../../logica/saldo'
import { mostrarTelefono } from '../../logica/telefono'
import type { Cliente } from '../../logica/tipos'
import { enlaceWhatsApp, mensajeCobro, mensajeEstadoCuenta } from '../../logica/whatsapp'
import { useAvisos, useTienda, useUI } from '../../estado/contextos'
import { sinMovimiento } from '../../estado/movimiento'
import { Icono } from '../base'
import { useClienteEjemplo } from '../ganchos'

function FilaCliente({ cliente }: { cliente: Cliente }) {
  const { estado, despachar, pais } = useTienda()
  const { abrirHoja, confirmar, resaltado } = useUI()
  const avisar = useAvisos()
  const [abierto, setAbierto] = useState(false)
  const fila = useRef<HTMLElement>(null)

  const { saldo } = calcularResumenCliente(cliente)
  const estadoCliente = estadoSaldo(saldo)
  const conTasa = tasaActiva(pais, estado.bcv.tasa)
  const moneda = (n: number) => formatearMoneda(n, pais)
  const ctx = { negocio: estado.negocio, pais, tasa: estado.bcv.tasa, metodos: estado.metodos, plantillaCobro: estado.mensajeCobro }
  const esResaltado = resaltado === cliente.id

  // Tras guardar algo de este cliente, llevarlo a la vista
  useEffect(() => {
    if (esResaltado) fila.current?.scrollIntoView({ block: 'nearest', behavior: sinMovimiento() ? 'auto' : 'smooth' })
  }, [esResaltado])

  const eliminarMovimiento = (movId: string) => {
    const indice = cliente.movimientos.findIndex((m) => m.id === movId)
    const movimiento = cliente.movimientos[indice]
    despachar({ tipo: 'movimiento/eliminar', clienteId: cliente.id, movId })
    avisar('Movimiento eliminado', {
      accion: { texto: 'Deshacer', fn: () => despachar({ tipo: 'movimiento/restaurar', clienteId: cliente.id, movimiento, indice }) },
    })
  }

  const eliminarCliente = () => confirmar({
    titulo: '¿Eliminar a ' + cliente.nombre + '?',
    mensaje: 'Se borrará su historial de ventas y pagos.',
    alConfirmar: () => {
      despachar({ tipo: 'cliente/eliminar', id: cliente.id })
      avisar('Cliente eliminado')
    },
  })

  return (
    <article ref={fila} className={'fila' + (estadoCliente === 'debe' ? ' fila--debe' : '') + (esResaltado ? ' fila--resaltada' : '')}>
      <div className="fila__cabeza">
        <h3 className="fila__nombre">{cliente.nombre}</h3>
        {estadoCliente === 'debe' && <span className="fila__monto">{moneda(saldo)}</span>}
        {estadoCliente === 'favor' && <span className="fila__favor">{moneda(-saldo)} a favor</span>}
        {estadoCliente === 'al-dia' && <span className="fila__aldia">Al día</span>}
        <span className="fila__meta">
          <span>{mostrarTelefono(cliente.telefono)}</span>
          {cliente.nota && <span className="fila__nota">{cliente.nota}</span>}
        </span>
        {estadoCliente !== 'al-dia' && conTasa
          ? <span className="fila__bs">{formatearBolivares(convertirABolivares(Math.abs(saldo), estado.bcv.tasa))}</span>
          : <span />}
      </div>

      <div className="fila__acciones">
        {estadoCliente === 'debe' && (
          <a className="boton boton--verde fila__cobrar" href={enlaceWhatsApp(cliente.telefono, mensajeCobro(cliente, ctx))} target="_blank" rel="noopener noreferrer">
            <Icono nombre="mensaje" />Cobrar {moneda(saldo)} por WhatsApp
          </a>
        )}
        <button type="button" className="boton boton--suave boton--chico" onClick={() => abrirHoja({ tipo: 'venta', clienteId: cliente.id })}>Venta</button>
        <button type="button" className="boton boton--suave boton--chico" onClick={() => abrirHoja({ tipo: 'pago', clienteId: cliente.id })}>Pago</button>
        <button type="button" className="boton boton--texto fila__historial" aria-expanded={abierto} onClick={() => setAbierto(!abierto)}>
          Historial ({cliente.movimientos.length})<Icono nombre="chevron" chico />
        </button>
      </div>

      {abierto && (
        <div className="fila__detalle fila__detalle--entra">
          {cliente.movimientos.length === 0 && <p className="detalle__vacio">Todavía no hay movimientos.</p>}
          {cliente.movimientos.slice().reverse().map((m) => (
            <div key={m.id} className={'mov' + (m.tipo === 'abono' ? ' mov--abono' : '')}>
              <span className="mov__fecha">{formatearFechaCorta(m.fecha)}</span>
              <span className="mov__desc">{textoMovimiento(m)}</span>
              <span className="mov__monto">
                {m.tipo === 'venta' ? '+' : '−'}{moneda(m.monto)}
                {conTasa && <span className="mov__bs">{formatearBolivares(convertirABolivares(m.monto, estado.bcv.tasa))}</span>}
              </span>
              <button type="button" className="icono-boton icono-boton--peligro" aria-label="Eliminar movimiento" onClick={() => eliminarMovimiento(m.id)}>
                <Icono nombre="x" chico />
              </button>
            </div>
          ))}
          <div className="detalle__acciones">
            <a className="boton boton--borde boton--chico detalle__estado" href={enlaceWhatsApp(cliente.telefono, mensajeEstadoCuenta(cliente, ctx))} target="_blank" rel="noopener noreferrer">
              <Icono nombre="recibo" chico />Enviar estado de cuenta
            </a>
            <button type="button" className="boton boton--texto" onClick={() => abrirHoja({ tipo: 'cliente', id: cliente.id })}>
              <Icono nombre="lapiz" chico />Editar
            </button>
            <button type="button" className="boton boton--texto boton--texto-peligro" onClick={eliminarCliente}>
              <Icono nombre="papelera" chico />Eliminar
            </button>
          </div>
        </div>
      )}
    </article>
  )
}

const FILTROS: { valor: Filtro; etiqueta: string }[] = [
  { valor: 'todos', etiqueta: 'Todos' },
  { valor: 'deuda', etiqueta: 'Deben' },
  { valor: 'solventes', etiqueta: 'Al día' },
]

export function Cuentas() {
  const { estado } = useTienda()
  const { abrirHoja } = useUI()
  const agregarEjemplo = useClienteEjemplo()
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')

  const visibles = ordenarClientes(filtrarClientes(estado.clientes, busqueda, filtro))

  return (
    <section className="vista vista--cuentas">
      <h1 className="sr">Cuentas</h1>

      <div className="herramientas">
        <div className="buscar">
          <Icono nombre="buscar" />
          <input type="text" className="entrada" enterKeyHint="search" placeholder="Buscar cliente" aria-label="Buscar cliente"
            value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          {busqueda && (
            <button type="button" className="icono-boton buscar__limpiar" aria-label="Limpiar búsqueda" onClick={() => setBusqueda('')}>
              <Icono nombre="x" chico />
            </button>
          )}
        </div>
        <button type="button" className="boton boton--oscuro" onClick={() => abrirHoja({ tipo: 'cliente' })}>
          <Icono nombre="mas" />Cliente
        </button>
      </div>

      <div className="filtros">
        <div className="segmento" role="group" aria-label="Filtrar clientes">
          {FILTROS.map((f) => (
            <button key={f.valor} type="button" aria-pressed={filtro === f.valor} onClick={() => setFiltro(f.valor)}>{f.etiqueta}</button>
          ))}
        </div>
      </div>

      <div className="libreta">
        {estado.clientes.length === 0 ? (
          <div className="vacio">
            <h2>Tu libreta está en blanco</h2>
            <p>Agrega a tu primer cliente para anotarle ventas y cobrarle por WhatsApp.</p>
            <div className="vacio__acciones">
              <button type="button" className="boton boton--oscuro" onClick={() => abrirHoja({ tipo: 'cliente' })}><Icono nombre="mas" />Agregar cliente</button>
              <button type="button" className="boton boton--borde" onClick={agregarEjemplo}>Ver un ejemplo</button>
            </div>
          </div>
        ) : visibles.length === 0 ? (
          <div className="vacio"><p>Ningún cliente coincide con la búsqueda o el filtro.</p></div>
        ) : (
          visibles.map((c) => <FilaCliente key={c.id} cliente={c} />)
        )}
      </div>
    </section>
  )
}
