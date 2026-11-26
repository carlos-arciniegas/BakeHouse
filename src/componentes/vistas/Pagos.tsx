import { useRef, useState, type FormEvent } from 'react'
import { construirBloquePagos, nombreMetodo, resumenMetodo } from '../../logica/metodosPago'
import { CLIENTE_VISTA_PREVIA, mensajeCobro, PLANTILLA_COBRO_PREDETERMINADA, VARIABLES_COBRO } from '../../logica/whatsapp'
import { useAvisos, useTienda, useUI } from '../../estado/contextos'
import { Icono, Interruptor } from '../base'
import { copiarTexto } from '../ganchos'

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
    </section>
  )
}
