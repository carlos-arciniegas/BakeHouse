import { useState, type FormEvent } from 'react'
import { BANCOS_VE, campoFaltante, esTipoPago, nombreMetodo, TIPOS_PAGO } from '../../logica/metodosPago'
import type { TipoPago } from '../../logica/tipos'
import { nuevoId } from '../../estado/movimiento'
import { useAvisos, useTienda, useUI } from '../../estado/contextos'

/** Alta o edición de un método de pago; los campos salen de TIPOS_PAGO */
export function HojaMetodo({ id }: { id?: string }) {
  const { estado, despachar } = useTienda()
  const { cerrarHoja } = useUI()
  const avisar = useAvisos()
  const existente = id ? estado.metodos.find((m) => m.id === id) : undefined

  const [tipo, setTipo] = useState<TipoPago>(existente?.tipo ?? 'transferencia')
  const [datos, setDatos] = useState<Record<string, string>>(existente?.datos ?? {})

  const guardarMetodo = (e: FormEvent) => {
    e.preventDefault()
    const limpios = Object.fromEntries(TIPOS_PAGO[tipo].campos.map((c) => [c.id, (datos[c.id] ?? '').trim()]))
    const falta = campoFaltante(tipo, limpios)
    if (falta) {
      avisar('Falta completar: ' + falta.etq, { error: true })
      return
    }
    despachar({ tipo: 'metodo/guardar', metodo: { id: existente?.id ?? nuevoId('met'), tipo, datos: limpios, activo: existente?.activo ?? true } })
    avisar(existente ? 'Método actualizado' : nombreMetodo({ tipo, datos: limpios }) + ' agregado')
    cerrarHoja()
  }

  return (
    <form className="form" onSubmit={guardarMetodo}>
      <div className="campo">
        <label htmlFor="metodoTipo" className="campo__etq">Tipo</label>
        <select id="metodoTipo" className="entrada" value={tipo} onChange={(e) => esTipoPago(e.target.value) && setTipo(e.target.value)}>
          {Object.entries(TIPOS_PAGO).map(([k, def]) => <option key={k} value={k}>{def.nombre}</option>)}
        </select>
      </div>

      {TIPOS_PAGO[tipo].campos.map((c) => {
        const idCampo = 'metodoCampo_' + c.id
        const comunes = {
          id: idCampo,
          className: 'entrada',
          placeholder: c.ph,
          required: !c.opcional,
          value: datos[c.id] ?? '',
          onChange: (e: { target: { value: string } }) => setDatos({ ...datos, [c.id]: e.target.value }),
        }
        return (
          <div key={tipo + c.id} className="campo">
            <label htmlFor={idCampo} className="campo__etq">{c.etq}{c.opcional && <> <span className="opc">(opcional)</span></>}</label>
            {c.area ? <textarea {...comunes} /> : <input type={c.tipo ?? 'text'} list={c.lista} {...comunes} />}
          </div>
        )
      })}

      <datalist id="bancosVE">
        {BANCOS_VE.map((b) => <option key={b} value={b} />)}
      </datalist>

      <div className="hoja__pie">
        <button type="button" className="boton boton--suave" onClick={cerrarHoja}>Cancelar</button>
        <button type="submit" className="boton boton--primario">Guardar método</button>
      </div>
    </form>
  )
}
