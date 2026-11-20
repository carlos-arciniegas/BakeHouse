import { useState, type FormEvent } from 'react'
import { leerUltimoMetodo, recordarUltimoMetodo } from '../../datos/almacenamiento'
import { fechaHoy } from '../../logica/fechas'
import { opcionesDePago } from '../../logica/metodosPago'
import { convertirABolivares, formatearBolivares, formatearMoneda, nombreMoneda, redondear, tasaActiva } from '../../logica/moneda'
import { calcularResumenCliente, estadoSaldo } from '../../logica/saldo'
import { nuevoId } from '../../estado/movimiento'
import { useAvisos, useTienda, useUI } from '../../estado/contextos'
import { OpcionesPago } from '../base'

type Moneda = 'principal' | 'bs'

export function HojaPago({ clienteId }: { clienteId?: string }) {
  const { estado, despachar, pais } = useTienda()
  const { cerrarHoja, resaltar } = useUI()
  const avisar = useAvisos()

  const clientesOrdenados = [...estado.clientes].sort((a, b) => a.nombre.localeCompare(b.nombre))
  const opciones = opcionesDePago(estado.metodos)
  const ultimo = leerUltimoMetodo(localStorage)
  const tasa = estado.bcv.tasa
  const conTasa = tasaActiva(pais, tasa)

  const saldoDe = (id: string) => {
    const c = estado.clientes.find((x) => x.id === id)
    return c ? calcularResumenCliente(c).saldo : 0
  }
  /** Lo más común es que pague todo: el monto ya viene escrito */
  const montoSugerido = (id: string, m: Moneda) => {
    const s = saldoDe(id)
    if (s <= 0.009) return ''
    return (m === 'bs' && conTasa ? convertirABolivares(s, tasa) : s).toFixed(2)
  }

  const inicial = clienteId ?? clientesOrdenados[0]?.id ?? ''
  const [idCliente, setIdCliente] = useState(inicial)
  const [moneda, setMoneda] = useState<Moneda>('principal')
  const [monto, setMonto] = useState(() => montoSugerido(inicial, 'principal'))
  const [fecha, setFecha] = useState(fechaHoy())
  const [metodo, setMetodo] = useState(opciones.includes(ultimo) ? ultimo : opciones[0])

  const cliente = estado.clientes.find((c) => c.id === idCliente)
  const saldo = saldoDe(idCliente)
  const estadoCliente = estadoSaldo(saldo)
  const montoNum = parseFloat(monto) || 0
  const conBs = (v: number) => (conTasa ? ' (' + formatearBolivares(convertirABolivares(v, tasa)) + ')' : '')

  const elegirCliente = (id: string) => {
    setIdCliente(id)
    setMonto(montoSugerido(id, moneda))
  }

  /** Cambiar de moneda convierte el mismo dinero, para no tener que reescribirlo */
  const cambiarMoneda = (nueva: Moneda) => {
    if (nueva === moneda) return
    if (nueva === 'bs' && !conTasa) {
      avisar('Escribe primero la tasa BCV, arriba a la derecha', { error: true })
      return
    }
    if (montoNum > 0) setMonto((nueva === 'bs' ? montoNum * tasa : montoNum / tasa).toFixed(2))
    setMoneda(nueva)
  }

  const registrarPago = (e: FormEvent) => {
    e.preventDefault()
    if (!cliente || !(montoNum > 0)) {
      avisar('Escribe un monto válido', { error: true })
      return
    }
    const enMoneda = moneda === 'bs' ? montoNum / tasa : montoNum
    const extra = moneda === 'bs' ? ' - ' + formatearBolivares(montoNum) : ''
    despachar({
      tipo: 'movimientos/agregar',
      clienteId: cliente.id,
      movimientos: [{ id: nuevoId('mov'), tipo: 'abono', descripcion: 'Pago (' + metodo + extra + ')', monto: redondear(enMoneda), fecha }],
    })
    recordarUltimoMetodo(localStorage, metodo)
    resaltar(cliente.id)
    cerrarHoja()

    const saldoNuevo = saldo - redondear(enMoneda)
    avisar(saldoNuevo < -0.009
      ? 'Pago registrado. ' + cliente.nombre.split(' ')[0] + ' queda con ' + formatearMoneda(-saldoNuevo, pais) + ' a favor'
      : 'Pago de ' + formatearMoneda(enMoneda, pais) + ' registrado')
  }

  return (
    <form className="form" onSubmit={registrarPago}>
      <div className="campo">
        <label htmlFor="abonoClienteId" className="campo__etq">Cliente</label>
        <select id="abonoClienteId" className="entrada" required value={idCliente} onChange={(e) => elegirCliente(e.target.value)}>
          {clientesOrdenados.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <div className="saldo">
          {estadoCliente === 'debe' && <span>Debe <strong>{formatearMoneda(saldo, pais)}{conBs(saldo)}</strong></span>}
          {estadoCliente === 'favor' && <span>Tiene <strong>{formatearMoneda(-saldo, pais)}{conBs(-saldo)}</strong> a favor</span>}
          {estadoCliente === 'al-dia' && <span><strong>No debe nada</strong></span>}
        </div>
      </div>

      <div className="campo">
        <div className="campo__fila">
          <label htmlFor="abonoMonto" className="campo__etq">Monto en {moneda === 'bs' ? 'bolívares' : nombreMoneda(pais)}</label>
          <div className="segmento segmento--mini solo-tasa" role="group" aria-label="Moneda del pago">
            <button type="button" aria-pressed={moneda === 'principal'} onClick={() => cambiarMoneda('principal')}>$</button>
            <button type="button" aria-pressed={moneda === 'bs'} onClick={() => cambiarMoneda('bs')}>Bs.</button>
          </div>
        </div>
        <input id="abonoMonto" type="number" className="entrada entrada--monto" step="0.01" min="0.01" inputMode="decimal" required placeholder="0.00"
          value={monto} onFocus={(e) => e.target.select()} onChange={(e) => setMonto(e.target.value)} />
        <p className="ayuda">
          {estadoCliente === 'debe' && 'Viene con todo lo que debe. Si paga de más, el resto queda a su favor.'}
          {estadoCliente === 'favor' && 'No debe nada: lo que anotes se suma a su saldo a favor para próximas compras.'}
          {estadoCliente === 'al-dia' && 'Lo que anotes queda a su favor para próximas compras.'}
        </p>
        <p className="ayuda ayuda--monto solo-tasa">
          {!conTasa
            ? 'Escribe la tasa BCV para ver bolívares'
            : moneda === 'principal'
              ? 'Equivale a ' + formatearBolivares(convertirABolivares(montoNum, tasa))
              : 'Se descuentan ' + formatearMoneda(montoNum / tasa, pais) + ' de la deuda'}
        </p>
      </div>

      <div className="campo">
        <label htmlFor="abonoFecha" className="campo__etq">Fecha</label>
        <input id="abonoFecha" type="date" className="entrada" required value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </div>

      <OpcionesPago nombre="metodoPago" opciones={opciones} valor={metodo} alCambiar={setMetodo} />

      <div className="hoja__pie">
        <button type="button" className="boton boton--suave" onClick={cerrarHoja}>Cancelar</button>
        <button type="submit" className="boton boton--verde">Registrar pago</button>
      </div>
    </form>
  )
}
