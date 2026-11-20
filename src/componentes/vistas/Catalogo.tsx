import { useRef, useState, type FormEvent } from 'react'
import { CATALOGO_PREDETERMINADO } from '../../datos/almacenamiento'
import { convertirABolivares, formatearBolivares, formatearMoneda, nombreMoneda, redondear, tasaActiva } from '../../logica/moneda'
import { nuevoId, sinMovimiento } from '../../estado/movimiento'
import { useAvisos, useTienda, useUI } from '../../estado/contextos'
import { Icono } from '../base'

export function Catalogo() {
  const { estado, despachar, pais } = useTienda()
  const { confirmar } = useUI()
  const avisar = useAvisos()
  const [editando, setEditando] = useState<number | null>(null)
  const [nombre, setNombre] = useState('')
  const [precio, setPrecio] = useState('')
  const formulario = useRef<HTMLFormElement>(null)
  const campoNombre = useRef<HTMLInputElement>(null)

  const conTasa = tasaActiva(pais, estado.bcv.tasa)
  const moneda = (n: number) => formatearMoneda(n, pais)

  const limpiar = () => {
    setEditando(null)
    setNombre('')
    setPrecio('')
  }

  const guardarProducto = (e: FormEvent) => {
    e.preventDefault()
    const valor = parseFloat(precio)
    if (!nombre.trim() || !(valor > 0)) {
      avisar('Escribe un nombre y un precio mayor que 0', { error: true })
      return
    }
    const id = editando !== null ? estado.catalogo[editando].id : nuevoId('prod')
    despachar({ tipo: 'catalogo/guardar', indice: editando, producto: { id, nombre: nombre.trim(), precio: redondear(valor) } })
    avisar(editando !== null ? 'Producto actualizado' : 'Producto agregado al catálogo')
    limpiar()
  }

  const editar = (indice: number) => {
    const p = estado.catalogo[indice]
    setEditando(indice)
    setNombre(p.nombre)
    setPrecio(p.precio.toFixed(2))
    // En el móvil el formulario queda arriba: llevar al usuario hasta él
    formulario.current?.scrollIntoView({ block: 'center', behavior: sinMovimiento() ? 'auto' : 'smooth' })
    campoNombre.current?.focus({ preventScroll: true })
  }

  const eliminar = (indice: number) => {
    const producto = estado.catalogo[indice]
    despachar({ tipo: 'catalogo/eliminar', indice })
    if (editando !== null) limpiar()
    avisar(producto.nombre + ' eliminado', {
      accion: { texto: 'Deshacer', fn: () => despachar({ tipo: 'catalogo/restaurar', indice, producto }) },
    })
  }

  const restaurarOriginales = () => confirmar({
    titulo: '¿Restaurar catálogo predeterminado?',
    mensaje: 'Se cargarán los 6 productos de ejemplo. Los que agregaste se borran.',
    alConfirmar: () => {
      despachar({ tipo: 'catalogo/reemplazar', catalogo: CATALOGO_PREDETERMINADO.map((p) => ({ ...p })) })
      limpiar()
      avisar('Catálogo restaurado')
    },
  })

  const precioNum = parseFloat(precio) || 0

  return (
    <section className="vista">
      <header className="encabezado">
        <h1>Catálogo</h1>
        <p>Precios en {nombreMoneda(pais)}. Cada producto aparece como atajo cuando anotas una venta.</p>
      </header>

      <div className="columnas">
        <div className="panel">
          <div className="panel__cabeza">
            <h2>{editando !== null ? 'Editar producto' : 'Nuevo producto'}</h2>
            {editando !== null && <button type="button" className="boton boton--texto" onClick={limpiar}>Cancelar</button>}
          </div>
          <form ref={formulario} className="form" onSubmit={guardarProducto}>
            <div className="campo">
              <label htmlFor="catalogoNombre" className="campo__etq">Nombre</label>
              <input ref={campoNombre} id="catalogoNombre" type="text" className="entrada" required placeholder="Galleta de chocolate 30 g"
                value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </div>
            <div className="campo">
              <label htmlFor="catalogoPrecio" className="campo__etq">Precio en {nombreMoneda(pais)}</label>
              <input id="catalogoPrecio" type="number" className="entrada entrada--monto" step="0.01" min="0.01" inputMode="decimal" required placeholder="1.50"
                value={precio} onFocus={(e) => e.target.select()} onChange={(e) => setPrecio(e.target.value)} />
              <p className="ayuda ayuda--monto solo-tasa">
                {conTasa ? 'Equivale a ' + formatearBolivares(convertirABolivares(precioNum, estado.bcv.tasa)) : 'Escribe la tasa BCV para ver bolívares'}
              </p>
            </div>
            <button type="submit" className="boton boton--primario boton--ancho">{editando !== null ? 'Guardar cambios' : 'Agregar al catálogo'}</button>
          </form>
        </div>

        <div className="panel">
          <div className="panel__cabeza">
            <h2>En el catálogo <span className="contador">{estado.catalogo.length}</span></h2>
          </div>
          {estado.catalogo.length === 0 && (
            <p className="lista-vacia">El catálogo está vacío. Agrega tu primer producto con el formulario o restaura los originales.</p>
          )}
          {estado.catalogo.map((p, i) => (
            <div key={p.id} className="prod">
              <span className="prod__nombre">{p.nombre}</span>
              <span className="prod__precio">
                {moneda(p.precio)}
                {conTasa && <span className="prod__bs">{formatearBolivares(convertirABolivares(p.precio, estado.bcv.tasa))}</span>}
              </span>
              <span className="prod__acciones">
                <button type="button" className="icono-boton" aria-label={'Editar ' + p.nombre} onClick={() => editar(i)}><Icono nombre="lapiz" chico /></button>
                <button type="button" className="icono-boton icono-boton--peligro" aria-label={'Eliminar ' + p.nombre} onClick={() => eliminar(i)}><Icono nombre="papelera" chico /></button>
              </span>
            </div>
          ))}
          <button type="button" className="boton boton--texto" style={{ marginTop: 12 }} onClick={restaurarOriginales}>Restaurar productos originales</button>
        </div>
      </div>
    </section>
  )
}
