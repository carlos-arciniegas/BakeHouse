import { useState, type FormEvent } from 'react'
import { fechaHoy } from '../../logica/fechas'
import { nombreMoneda, redondear } from '../../logica/moneda'
import { normalizarTelefono, telefonoParaEditar } from '../../logica/telefono'
import type { Movimiento } from '../../logica/tipos'
import { nuevoId } from '../../estado/movimiento'
import { useAvisos, useTienda, useUI } from '../../estado/contextos'

/** Alta o edición de un cliente. Con id edita; sin id crea uno nuevo. */
export function HojaCliente({ id }: { id?: string }) {
  const { estado, despachar, pais } = useTienda()
  const { cerrarHoja, resaltar } = useUI()
  const avisar = useAvisos()
  const existente = id ? estado.clientes.find((c) => c.id === id) : undefined

  const [nombre, setNombre] = useState(existente?.nombre ?? '')
  const [telefono, setTelefono] = useState(existente ? telefonoParaEditar(existente.telefono, pais) : '')
  const [deuda, setDeuda] = useState('')
  const [nota, setNota] = useState(existente?.nota ?? '')

  const guardarCliente = (e: FormEvent) => {
    e.preventDefault()
    const tel = normalizarTelefono(telefono, pais)
    if (!nombre.trim() || tel.length < 8) {
      avisar('Escribe un nombre y un teléfono válido', { error: true })
      return
    }

    if (existente) {
      despachar({ tipo: 'cliente/editar', id: existente.id, nombre: nombre.trim(), telefono: tel, nota: nota.trim() })
      avisar('Cliente actualizado')
      resaltar(existente.id)
    } else {
      const nuevo = nuevoId('cli')
      const inicial = parseFloat(deuda) || 0
      const movimientos: Movimiento[] = inicial > 0
        ? [{ id: nuevoId('mov'), tipo: 'venta', descripcion: 'Saldo inicial', monto: redondear(inicial), fecha: fechaHoy() }]
        : []
      despachar({ tipo: 'cliente/agregar', cliente: { id: nuevo, nombre: nombre.trim(), telefono: tel, nota: nota.trim(), movimientos } })
      avisar('Cliente agregado')
      resaltar(nuevo)
    }
    cerrarHoja()
  }

  return (
    <form className="form" onSubmit={guardarCliente}>
      <div className="campo">
        <label htmlFor="clienteNombre" className="campo__etq">Nombre</label>
        <input id="clienteNombre" type="text" className="entrada" required autoComplete="off" autoFocus placeholder="María Fernanda Pérez"
          value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </div>
      <div className="campo">
        <label htmlFor="clienteTelefono" className="campo__etq">WhatsApp</label>
        <div className="prefijo">
          <span className="prefijo__txt">+{pais.prefijo}</span>
          <input id="clienteTelefono" type="tel" className="entrada" required placeholder={pais.ejemploTel}
            style={{ paddingLeft: 26 + (pais.prefijo.length + 1) * 10 }}
            value={telefono} onChange={(e) => setTelefono(e.target.value)} />
        </div>
        <p className="ayuda">{pais.troncal ? `Puedes escribirlo con el ${pais.troncal} inicial.` : `Escríbelo sin el +${pais.prefijo}.`}</p>
      </div>
      {!existente && (
        <div className="campo">
          <label htmlFor="clienteDeuda" className="campo__etq">Lo que ya debe <span className="opc">(opcional)</span></label>
          <input id="clienteDeuda" type="number" className="entrada entrada--monto" step="0.01" min="0" inputMode="decimal" placeholder="0.00"
            value={deuda} onChange={(e) => setDeuda(e.target.value)} />
          <p className="ayuda">En {nombreMoneda(pais)}. Queda anotado como saldo inicial.</p>
        </div>
      )}
      <div className="campo">
        <label htmlFor="clienteNota" className="campo__etq">Nota <span className="opc">(opcional)</span></label>
        <input id="clienteNota" type="text" className="entrada" placeholder="Oficina piso 3, vecina del 4B" value={nota} onChange={(e) => setNota(e.target.value)} />
      </div>
      <div className="hoja__pie">
        <button type="button" className="boton boton--suave" onClick={cerrarHoja}>Cancelar</button>
        <button type="submit" className="boton boton--oscuro">Guardar cliente</button>
      </div>
    </form>
  )
}
