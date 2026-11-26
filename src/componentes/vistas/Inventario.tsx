import { useState } from 'react'
import { fechaHoy, formatearFechaCorta } from '../../logica/fechas'
import { calcularInventarioDia, desplazarFecha, ultimaFechaConInventario } from '../../logica/inventario'
import { useAvisos, useTienda, useUI } from '../../estado/contextos'
import { Icono } from '../base'

export function Inventario() {
  const { estado, despachar } = useTienda()
  const { irA } = useUI()
  const avisar = useAvisos()
  const [fecha, setFecha] = useState(() => fechaHoy())

  const hoy = fechaHoy()
  const resumen = calcularInventarioDia(estado.catalogo, estado.clientes, estado.inventario, fecha)
  const ultimoDia = ultimaFechaConInventario(estado.inventario, fecha)

  const fijar = (productoId: string, cantidad: number) => {
    despachar({ tipo: 'inventario/fijar', fecha, productoId, cantidad })
  }

  const limpiarDia = () => {
    const previo = { ...(estado.inventario[fecha] ?? {}) }
    despachar({ tipo: 'inventario/reemplazar-dia', fecha, cantidades: {} })
    avisar('Inventario del día borrado', {
      accion: { texto: 'Deshacer', fn: () => despachar({ tipo: 'inventario/reemplazar-dia', fecha, cantidades: previo }) },
    })
  }

  const repetirDia = () => {
    if (!ultimoDia) return
    const origen = estado.inventario[ultimoDia]
    if (!origen) return
    despachar({ tipo: 'inventario/reemplazar-dia', fecha, cantidades: { ...origen } })
    avisar('Inventario copiado del ' + formatearFechaCorta(ultimoDia))
  }

  const colorQuedan =
    resumen.totalLlevado > 0 && resumen.totalQuedan === 0
      ? 'var(--rojo)'
      : resumen.totalQuedan > 0
        ? 'var(--verde)'
        : undefined

  return (
    <section className="vista">
      <header className="encabezado">
        <h1>Inventario</h1>
        <p>Anota cuántas unidades llevas cada día. Al registrar ventas del catálogo se descuentan solas.</p>
      </header>

      <div className="inv-fecha">
        <button type="button" className="icono-boton" aria-label="Día anterior" onClick={() => setFecha(desplazarFecha(fecha, -1))}>
          <span aria-hidden="true">‹</span>
        </button>
        <input
          id="invFecha"
          type="date"
          className="entrada"
          aria-label="Fecha del inventario"
          value={fecha}
          onChange={(e) => e.target.value && setFecha(e.target.value)}
        />
        <button type="button" className="icono-boton" aria-label="Día siguiente" onClick={() => setFecha(desplazarFecha(fecha, 1))}>
          <span aria-hidden="true">›</span>
        </button>
        {fecha !== hoy && (
          <button type="button" className="boton boton--suave boton--chico" onClick={() => setFecha(hoy)}>Hoy</button>
        )}
      </div>

      {(resumen.totalLlevado > 0 || resumen.totalVendido > 0) && (
        <div className="inv-resumen" aria-label="Resumen del día">
          <div className="inv-resumen__dato">
            <span>Llevas</span>
            <strong>{resumen.totalLlevado}</strong>
          </div>
          <div className="inv-resumen__dato">
            <span>Vendidas</span>
            <strong>{resumen.totalVendido}</strong>
          </div>
          <div className="inv-resumen__dato">
            <span>Quedan</span>
            <strong style={colorQuedan ? { color: colorQuedan } : undefined}>{resumen.totalQuedan}</strong>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel__cabeza">
          <h2>Productos del día</h2>
          {resumen.totalLlevado > 0 ? (
            <button type="button" className="boton boton--texto" onClick={limpiarDia}>Limpiar día</button>
          ) : ultimoDia ? (
            <button type="button" className="boton boton--texto" onClick={repetirDia}>
              Repetir del {formatearFechaCorta(ultimoDia)}
            </button>
          ) : null}
        </div>

        {estado.catalogo.length === 0 ? (
          <div className="vacio">
            <p>Tu catálogo está vacío. Agrega productos en Catálogo para llevar su inventario.</p>
            <div className="vacio__acciones">
              <button type="button" className="boton boton--primario" onClick={() => irA('catalogo')}>Ir al catálogo</button>
            </div>
          </div>
        ) : (
          resumen.items.map((item) => {
            const { producto, llevado, vendido, quedan } = item
            return (
              <div key={producto.id} className="inv-fila">
                <div className="inv-fila__info">
                  <span className="inv-fila__nombre">{producto.nombre}</span>
                  <span className="inv-fila__estado">
                    {llevado > 0 ? (
                      <>
                        <span>Vendidas: {vendido}</span>
                        {quedan > 0 ? (
                          <span className={'inv-badge ' + (quedan <= 2 ? 'inv-badge--bajo' : 'inv-badge--ok')}>
                            Quedan {quedan}
                          </span>
                        ) : quedan === 0 ? (
                          <span className="inv-badge inv-badge--agotado">Agotado</span>
                        ) : (
                          <span className="inv-badge inv-badge--agotado">Agotado ({Math.abs(quedan)} de más)</span>
                        )}
                      </>
                    ) : vendido > 0 ? (
                      <span>Vendidas: {vendido} (sin cargar)</span>
                    ) : (
                      <span>Sin cargar</span>
                    )}
                  </span>
                </div>

                <div className="inv-stepper">
                  <button
                    type="button"
                    className="icono-boton"
                    aria-label={'Restar ' + producto.nombre}
                    disabled={llevado <= 0}
                    onClick={() => fijar(producto.id, llevado - 1)}
                  >
                    <Icono nombre="menos" chico />
                  </button>
                  <input
                    type="number"
                    className="entrada inv-stepper__num"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    aria-label={'Cantidad de ' + producto.nombre}
                    value={llevado === 0 ? '' : String(llevado)}
                    placeholder="0"
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => fijar(producto.id, parseInt(e.target.value, 10) || 0)}
                  />
                  <button
                    type="button"
                    className="icono-boton"
                    aria-label={'Sumar ' + producto.nombre}
                    onClick={() => fijar(producto.id, llevado + 1)}
                  >
                    <Icono nombre="mas" chico />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}
