import { useRef, useState, type FormEvent } from 'react'
import { leerUltimoMetodo, recordarUltimoMetodo } from '../../datos/almacenamiento'
import { fechaHoy } from '../../logica/fechas'
import { opcionesDePago } from '../../logica/metodosPago'
import { convertirABolivares, formatearBolivares, formatearMoneda, nombreMoneda, redondear, tasaActiva } from '../../logica/moneda'
import { calcularResumenCliente, estadoSaldo } from '../../logica/saldo'
import type { Movimiento } from '../../logica/tipos'
import { describirSeleccion, restarProducto, sumarProducto, type Seleccion } from '../../logica/venta'
import { nuevoId, sinMovimiento } from '../../estado/movimiento'
import { useAvisos, useTienda, useUI } from '../../estado/contextos'
import { Icono, Interruptor, OpcionesPago } from '../base'

export function HojaVenta({ clienteId }: { clienteId?: string }) {
  const { estado, despachar, pais } = useTienda()
  const { cerrarHoja, irA, resaltar } = useUI()
  const avisar = useAvisos()

  const clientesOrdenados = [...estado.clientes].sort((a, b) => a.nombre.localeCompare(b.nombre))
  const opciones = opcionesDePago(estado.metodos)
  const ultimo = leerUltimoMetodo(localStorage)

  // Desde la fila viene elegido; desde "Nueva venta" el desplegable arranca vacío (sin elegir uno al azar)
  const [idCliente, setIdCliente] = useState(clienteId ?? '')
  const [creando, setCreando] = useState(clientesOrdenados.length === 0)
  const [nombreNuevo, setNombreNuevo] = useState('')
  const [seleccion, setSeleccion] = useState<Seleccion>({})
  const [descripcion, setDescripcion] = useState('')
  const [monto, setMonto] = useState('')
  const [fecha, setFecha] = useState(fechaHoy())
  const [pagada, setPagada] = useState(false)
  const [metodo, setMetodo] = useState(opciones.includes(ultimo) ? ultimo : opciones[0])
  const botonGuardar = useRef<HTMLButtonElement>(null)

  const cliente = creando ? undefined : estado.clientes.find((c) => c.id === idCliente)
  const saldo = cliente ? calcularResumenCliente(cliente).saldo : 0
  const montoNum = parseFloat(monto) || 0
  const haySeleccion = Object.keys(seleccion).length > 0

  // Tocar un producto suma uno y "−" resta uno; la descripción y el total se arman solos
  const cambiarSeleccion = (nueva: Seleccion) => {
    setSeleccion(nueva)
    const { descripcion: d, total } = describirSeleccion(nueva, estado.catalogo)
    setDescripcion(d)
    setMonto(total > 0 ? total.toFixed(2) : '')
  }

  const alternarPagada = (valor: boolean) => {
    setPagada(valor)
    // Mostrar las opciones y el botón sin que haya que desplazar a mano
    if (valor) requestAnimationFrame(() => botonGuardar.current?.scrollIntoView({ block: 'nearest', behavior: sinMovimiento() ? 'auto' : 'smooth' }))
  }

  const anotarVenta = (e: FormEvent) => {
    e.preventDefault()
    const nombreLimpio = nombreNuevo.trim()
    if ((creando ? !nombreLimpio : !cliente) || !descripcion.trim() || !(montoNum > 0)) {
      avisar('Revisa los datos de la venta', { error: true })
      return
    }
    const valor = redondear(montoNum)
    const venta: Movimiento = { id: nuevoId('mov'), tipo: 'venta', descripcion: descripcion.trim(), monto: valor, fecha }
    const { lineas } = describirSeleccion(seleccion, estado.catalogo)
    if (lineas.length) venta.productos = lineas
    const movimientos: Movimiento[] = [venta]
    if (pagada) {
      movimientos.push({ id: nuevoId('mov'), tipo: 'abono', descripcion: 'Pago (' + metodo + ')', monto: valor, fecha })
      recordarUltimoMetodo(localStorage, metodo)
    }
    let id: string
    let nombreCompleto: string
    if (cliente) {
      id = cliente.id
      nombreCompleto = cliente.nombre
      despachar({ tipo: 'movimientos/agregar', clienteId: id, movimientos })
    } else {
      // Cliente nuevo: se agrega con la venta de una vez (el teléfono se completa luego en Editar)
      id = nuevoId('cli')
      nombreCompleto = nombreLimpio
      despachar({ tipo: 'cliente/agregar', cliente: { id, nombre: nombreCompleto, telefono: '', nota: '', movimientos } })
    }
    irA('cuentas')
    resaltar(id)
    cerrarHoja()

    const nombre = nombreCompleto.split(' ')[0]
    if (!cliente) avisar((pagada ? 'Venta pagada anotada a ' : 'Venta anotada a ') + nombre + ', cliente nuevo')
    else if (pagada) avisar('Venta pagada anotada a ' + nombre)
    else if (estadoSaldo(saldo) === 'favor') avisar('Venta anotada a ' + nombre + ', descontada de su saldo a favor')
    else avisar('Venta anotada a ' + nombre)
  }

  return (
    <form className="form" onSubmit={anotarVenta}>
      <div className="campo">
        <div className="campo__fila">
          <label htmlFor={creando ? 'ventaClienteNuevo' : 'ventaClienteId'} className="campo__etq">Cliente</label>
          {creando ? (
            clientesOrdenados.length > 0 && (
              <button type="button" className="boton boton--texto" onClick={() => setCreando(false)}>Elegir de la lista</button>
            )
          ) : (
            <button type="button" className="boton boton--texto" onClick={() => setCreando(true)}>
              <Icono nombre="mas" chico />Cliente nuevo
            </button>
          )}
        </div>
        {creando ? (
          <input id="ventaClienteNuevo" type="text" className="entrada" required autoComplete="off" autoFocus
            placeholder="Nombre del cliente" value={nombreNuevo} onChange={(e) => setNombreNuevo(e.target.value)} />
        ) : (
          <select id="ventaClienteId" className="entrada" required value={idCliente} onChange={(e) => setIdCliente(e.target.value)}>
            <option value="" disabled>Elige un cliente…</option>
            {clientesOrdenados.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        )}
        {estadoSaldo(saldo) === 'favor' && (
          <p className="ayuda ayuda--monto">Tiene {formatearMoneda(-saldo, pais)} a favor: esta venta se descuenta de ahí.</p>
        )}
      </div>

      <div className="campo">
        <div className="campo__fila">
          <span className="campo__etq">Del catálogo</span>
          {haySeleccion
            ? <button type="button" className="boton boton--texto" onClick={() => cambiarSeleccion({})}>Quitar selección</button>
            : <button type="button" className="boton boton--texto" onClick={() => { cerrarHoja(); irA('catalogo') }}>Editar catálogo</button>}
        </div>
        <div className="chips">
          {estado.catalogo.length === 0 && <p className="ayuda">El catálogo está vacío. Escribe la venta a mano o agrega productos en Catálogo.</p>}
          {estado.catalogo.map((p, i) => {
            const cantidad = seleccion[i] ?? 0
            return (
              <span key={p.id} className="chip-grupo">
                {cantidad > 0 && (
                  <button type="button" className="chip__menos" aria-label={'Quitar un ' + p.nombre} onClick={() => cambiarSeleccion(restarProducto(seleccion, i))}>
                    <Icono nombre="menos" chico />
                  </button>
                )}
                <button type="button" className="chip" aria-pressed={cantidad > 0}
                  aria-label={cantidad > 0 ? `${p.nombre}, ${cantidad} seleccionados. Toca para sumar uno` : p.nombre}
                  onClick={() => cambiarSeleccion(sumarProducto(seleccion, i))}>
                  {p.nombre} <b>{formatearMoneda(p.precio, pais)}</b>
                  {cantidad > 0 && <span key={cantidad} className="chip__cant chip__cant--pop">{cantidad}</span>}
                </button>
              </span>
            )
          })}
        </div>
      </div>

      <div className="campo">
        <label htmlFor="ventaDescripcion" className="campo__etq">Qué se llevó</label>
        <input id="ventaDescripcion" type="text" className="entrada" required placeholder="2 galletas de chocolate y 1 brownie"
          value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
      </div>

      <div className="dos">
        <div className="campo">
          <label htmlFor="ventaMonto" className="campo__etq">Total en {nombreMoneda(pais)}</label>
          <input id="ventaMonto" type="number" className="entrada entrada--monto" step="0.01" min="0.01" inputMode="decimal" required placeholder="0.00"
            value={monto} onFocus={(e) => e.target.select()} onChange={(e) => setMonto(e.target.value)} />
          <p className="ayuda ayuda--monto solo-tasa">
            {tasaActiva(pais, estado.bcv.tasa) ? 'Equivale a ' + formatearBolivares(convertirABolivares(montoNum, estado.bcv.tasa)) : 'Escribe la tasa BCV para ver bolívares'}
          </p>
        </div>
        <div className="campo">
          <label htmlFor="ventaFecha" className="campo__etq">Fecha</label>
          <input id="ventaFecha" type="date" className="entrada" required value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
      </div>

      <Interruptor titulo="Ya me pagó" ayuda="Anota la venta y el pago de una vez." activo={pagada} alCambiar={alternarPagada} />
      {pagada && (
        <div className="revelar">
          <OpcionesPago nombre="metodoPagoVenta" opciones={opciones} valor={metodo} alCambiar={setMetodo} />
        </div>
      )}

      <div className="hoja__pie">
        <button type="button" className="boton boton--suave" onClick={cerrarHoja}>Cancelar</button>
        <button ref={botonGuardar} type="submit" className="boton boton--primario">{pagada ? 'Anotar venta pagada' : 'Anotar venta'}</button>
      </div>
    </form>
  )
}
