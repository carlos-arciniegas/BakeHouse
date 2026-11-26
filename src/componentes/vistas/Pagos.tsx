import { useRef, useState, type FormEvent } from 'react'
import { fechaHoy, formatearFechaCorta } from '../../logica/fechas'
import { extraerPagos, filtrarPagos, metodosEnHistorial, rangoFechas, type RangoRapido } from '../../logica/historialPagos'
import { construirBloquePagos, nombreMetodo, resumenMetodo } from '../../logica/metodosPago'
import { convertirABolivares, formatearBolivares, formatearMoneda, tasaActiva } from '../../logica/moneda'
import { CLIENTE_VISTA_PREVIA, mensajeCobro, PLANTILLA_COBRO_PREDETERMINADA, VARIABLES_COBRO } from '../../logica/whatsapp'
import { useAvisos, useTienda, useUI } from '../../estado/contextos'
import { Icono, Interruptor } from '../base'
import { copiarTexto } from '../ganchos'

const ATAJOS: { id: RangoRapido; etiqueta: string }[] = [
  { id: 'todos', etiqueta: 'Todos' },
  { id: 'hoy', etiqueta: 'Hoy' },
  { id: 'semana', etiqueta: '7 días' },
  { id: 'mes', etiqueta: 'Este mes' },
]

function HistorialPagos() {
  const { estado, pais } = useTienda()
  const hoy = fechaHoy()
  const todos = extraerPagos(estado.clientes)
  const metodos = metodosEnHistorial(todos)

  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [metodo, setMetodo] = useState('')

  const resumen = filtrarPagos(todos, desde, hasta, metodo)
  const conTasa = tasaActiva(pais, estado.bcv.tasa)
  const moneda = (n: number) => formatearMoneda(n, pais)

  return (
    <div>
      <div className="pagos-filtros">
        <div className="chips" role="group" aria-label="Atajos de fecha">
          {ATAJOS.map((a) => {
            const r = rangoFechas(a.id, hoy)
            const activo = desde === r.desde && hasta === r.hasta
            return (
              <button
                key={a.id}
                type="button"
                className="chip"
                aria-pressed={activo}
                onClick={() => { setDesde(r.desde); setHasta(r.hasta) }}
              >
                {a.etiqueta}
              </button>
            )
          })}
        </div>

        <div className="dos">
          <div className="campo">
            <label htmlFor="pagosDesde" className="campo__etq">Desde</label>
            <input id="pagosDesde" type="date" className="entrada" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div className="campo">
            <label htmlFor="pagosHasta" className="campo__etq">Hasta</label>
            <input id="pagosHasta" type="date" className="entrada" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
        </div>

        {(metodos.length >= 2 || desde || hasta || metodo) && (
          <div className="pagos-filtros__fila">
            {metodos.length >= 2 && (
              <div className="campo pagos-filtros__metodo">
                <label htmlFor="pagosMetodo" className="campo__etq">Método</label>
                <select id="pagosMetodo" className="entrada" value={metodo} onChange={(e) => setMetodo(e.target.value)}>
                  <option value="">Todos los métodos</option>
                  {metodos.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            )}
            {(desde || hasta || metodo) && (
              <button type="button" className="boton boton--texto" onClick={() => { setDesde(''); setHasta(''); setMetodo('') }}>
                Limpiar filtros
              </button>
            )}
          </div>
        )}
      </div>

      {resumen.pagos.length > 0 && (
        <div className="pagos-resumen" aria-label="Resumen de pagos">
          <div className="pagos-resumen__cabeza">
            <div>
              <span className="pagos-resumen__etq">Total cobrado</span>
              <strong className="pagos-resumen__total">{moneda(resumen.total)}</strong>
              {conTasa && (
                <span className="pagos-resumen__bs">{formatearBolivares(convertirABolivares(resumen.total, estado.bcv.tasa))}</span>
              )}
            </div>
            <span className="pagos-resumen__conteo">
              {resumen.pagos.length === 1 ? '1 pago' : resumen.pagos.length + ' pagos'}
            </span>
          </div>
          <p className="pagos-resumen__desglose">
            {resumen.porMetodo.map((m) => m.metodo + ': ' + moneda(m.total)).join(' · ')}
          </p>
        </div>
      )}

      <div className="panel">
        <div className="panel__cabeza">
          <h2>Pagos recibidos <span className="contador">{resumen.pagos.length}</span></h2>
        </div>
        {todos.length === 0 ? (
          <p className="lista-vacia">Todavía no hay pagos registrados.</p>
        ) : resumen.pagos.length === 0 ? (
          <p className="lista-vacia">No hay pagos en las fechas seleccionadas.</p>
        ) : (
          resumen.pagos.map((p) => (
            <div key={p.id} className="pago-fila">
              <div className="pago-fila__info">
                <span className="pago-fila__cliente">{p.clienteNombre}</span>
                <span className="pago-fila__meta">
                  <span>{formatearFechaCorta(p.fecha)}</span>
                  <span className="pago-fila__metodo">{p.metodo}</span>
                </span>
              </div>
              <div className="pago-fila__monto">
                <strong>{moneda(p.monto)}</strong>
                {p.detalleBs ? (
                  <span className="pago-fila__bs">{p.detalleBs}</span>
                ) : conTasa ? (
                  <span className="pago-fila__bs">{formatearBolivares(convertirABolivares(p.monto, estado.bcv.tasa))}</span>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function EditorMensajeCobro() {
  const { estado, despachar, pais } = useTienda()
  const avisar = useAvisos()
  const areaRef = useRef<HTMLTextAreaElement>(null)

  const guardado = estado.mensajeCobro || PLANTILLA_COBRO_PREDETERMINADA
  const [texto, setTexto] = useState(guardado)
  const [guardadoAntes, setGuardadoAntes] = useState(guardado)
  if (guardado !== guardadoAntes) {
    setGuardadoAntes(guardado)
    setTexto(guardado)
  }

  const insertar = (codigo: string) => {
    const el = areaRef.current
    const inicio = el?.selectionStart ?? texto.length
    const fin = el?.selectionEnd ?? texto.length
    const nuevo = texto.slice(0, inicio) + codigo + texto.slice(fin)
    setTexto(nuevo)
    requestAnimationFrame(() => {
      if (!areaRef.current) return
      areaRef.current.focus()
      const pos = inicio + codigo.length
      areaRef.current.setSelectionRange(pos, pos)
    })
  }

  const guardar = (e: FormEvent) => {
    e.preventDefault()
    if (!texto.trim()) {
      avisar('Escribe el texto del mensaje o restaura el original', { error: true })
      return
    }
    const plantilla = texto.trim() === PLANTILLA_COBRO_PREDETERMINADA ? '' : texto
    despachar({ tipo: 'mensajeCobro/guardar', plantilla })
    avisar('Mensaje de cobro guardado')
  }

  const restaurar = () => {
    const anterior = estado.mensajeCobro
    setTexto(PLANTILLA_COBRO_PREDETERMINADA)
    if (anterior) {
      despachar({ tipo: 'mensajeCobro/guardar', plantilla: '' })
      avisar('Mensaje original restaurado', {
        accion: { texto: 'Deshacer', fn: () => despachar({ tipo: 'mensajeCobro/guardar', plantilla: anterior }) },
      })
    } else {
      avisar('Mensaje original restaurado')
    }
  }

  const vistaPrevia = mensajeCobro(CLIENTE_VISTA_PREVIA, {
    negocio: estado.negocio,
    pais,
    tasa: estado.bcv.tasa,
    metodos: estado.metodos,
    plantillaCobro: texto,
  })

  return (
    <div className="bloque-mensaje columnas columnas--pm">
      <div className="panel">
        <div className="panel__cabeza">
          <h2>Mensaje de cobro</h2>
          {(texto !== PLANTILLA_COBRO_PREDETERMINADA || estado.mensajeCobro !== '') && (
            <button type="button" className="boton boton--texto" onClick={restaurar}>Restaurar original</button>
          )}
        </div>
        <form className="form" onSubmit={guardar}>
          <div className="campo">
            <label htmlFor="mensajeCobroTexto" className="campo__etq">Plantilla para cobrar por WhatsApp</label>
            <textarea ref={areaRef} id="mensajeCobroTexto" className="entrada entrada--mensaje" rows={7}
              value={texto} onChange={(e) => setTexto(e.target.value)} />
            <div className="chips" role="group" aria-label="Insertar datos en el mensaje">
              {VARIABLES_COBRO.map((v) => (
                <button key={v.codigo} type="button" className="chip" onClick={() => insertar(v.codigo)}>
                  {v.etiqueta} <b>{v.codigo}</b>
                </button>
              ))}
            </div>
            <p className="ayuda">Toca una etiqueta para insertarla donde esté el cursor. Usa *asteriscos* para negritas en WhatsApp.</p>
          </div>
          <div><button type="submit" className="boton boton--primario">Guardar mensaje</button></div>
        </form>
      </div>

      <div className="panel">
        <div className="panel__cabeza">
          <h2>Vista previa</h2>
        </div>
        <div className="chat">
          <div className="burbuja-previa">{vistaPrevia}</div>
        </div>
      </div>
    </div>
  )
}

export function Pagos() {
  const { estado, despachar } = useTienda()
  const { abrirHoja } = useUI()
  const avisar = useAvisos()
  const [pestana, setPestana] = useState<'metodos' | 'historial'>('metodos')
  const bloque = construirBloquePagos(estado.metodos)

  const alternar = (id: string, activo: boolean) => {
    const m = estado.metodos.find((x) => x.id === id)!
    despachar({ tipo: 'metodo/alternar', id, activo })
    avisar(nombreMetodo(m) + (activo ? ' se incluye en los cobros' : ' ya no se incluye en los cobros'))
  }

  const eliminar = (id: string) => {
    const indice = estado.metodos.findIndex((x) => x.id === id)
    const metodo = estado.metodos[indice]
    despachar({ tipo: 'metodo/eliminar', id })
    avisar(nombreMetodo(metodo) + ' eliminado', {
      accion: { texto: 'Deshacer', fn: () => despachar({ tipo: 'metodo/restaurar', metodo, indice }) },
    })
  }

  const copiar = async () => {
    if (!bloque) {
      avisar('Activa al menos un método para copiar sus datos', { error: true })
      return
    }
    const copiado = await copiarTexto(bloque)
    avisar(copiado ? 'Datos de pago copiados' : 'No se pudo copiar', { error: !copiado })
  }

  return (
    <section className="vista">
      <header className="encabezado">
        <h1>Métodos de pago</h1>
        <p>Las formas en que tus clientes te pueden pagar. Las que dejes activadas se agregan al final de cada cobro que envías por WhatsApp.</p>
      </header>

      <div className="filtros pagos-pestanas">
        <div className="segmento" role="group" aria-label="Secciones de pagos">
          <button type="button" aria-pressed={pestana === 'metodos'} onClick={() => setPestana('metodos')}>Métodos</button>
          <button type="button" aria-pressed={pestana === 'historial'} onClick={() => setPestana('historial')}>Historial</button>
        </div>
      </div>

      {pestana === 'historial' ? (
        <HistorialPagos />
      ) : (
        <>
          <div className="columnas columnas--pm">
            <div className="panel">
              <div className="panel__cabeza">
                <h2>Tus métodos <span className="contador">{estado.metodos.length}</span></h2>
                <button type="button" className="boton boton--primario boton--chico" onClick={() => abrirHoja({ tipo: 'metodo' })}>
                  <Icono nombre="mas" chico />Agregar
                </button>
              </div>
              {estado.metodos.length === 0 && (
                <p className="lista-vacia">Todavía no tienes métodos de pago. Agrega el primero para incluirlo en tus cobros.</p>
              )}
              {estado.metodos.map((m) => {
                const nombre = nombreMetodo(m)
                return (
                  <div key={m.id} className={'metodo' + (m.activo ? '' : ' metodo--inactivo')}>
                    <div className="metodo__info">
                      <span className="metodo__nombre">{nombre}</span>
                      <span className="metodo__datos">{resumenMetodo(m)}</span>
                    </div>
                    <Interruptor activo={m.activo} alCambiar={(v) => alternar(m.id, v)} etiquetaOculta={'Incluir ' + nombre + ' en los cobros'} />
                    <button type="button" className="icono-boton" aria-label={'Editar ' + nombre} onClick={() => abrirHoja({ tipo: 'metodo', id: m.id })}>
                      <Icono nombre="lapiz" chico />
                    </button>
                    <button type="button" className="icono-boton icono-boton--peligro" aria-label={'Eliminar ' + nombre} onClick={() => eliminar(m.id)}>
                      <Icono nombre="papelera" chico />
                    </button>
                  </div>
                )
              })}
            </div>

            <div className="panel">
              <div className="panel__cabeza">
                <h2>Así se ve en WhatsApp</h2>
                <button type="button" className="boton boton--texto" onClick={copiar}><Icono nombre="copiar" chico />Copiar</button>
              </div>
              <div className="chat">
                <div className="burbuja">{bloque || 'Activa al menos un método para que aparezca aquí.'}</div>
              </div>
            </div>
          </div>

          <EditorMensajeCobro />
        </>
      )}
    </section>
  )
}
