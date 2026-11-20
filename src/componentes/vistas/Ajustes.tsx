import { useState, type ChangeEvent, type FormEvent } from 'react'
import { crearRespaldo, importarCSV, leerRespaldo, nombreArchivoRespaldo } from '../../datos/respaldo'
import { fechaHoy } from '../../logica/fechas'
import { formatearMoneda } from '../../logica/moneda'
import { esCodigoPais, NOMBRES_MONEDA, PAISES } from '../../logica/paises'
import type { CodigoPais } from '../../logica/tipos'
import { useAvisos, useTienda, useUI } from '../../estado/contextos'
import { Icono } from '../base'
import { useClienteEjemplo, useSincronizarBCV } from '../ganchos'
import { useInstalarApp } from '../instalar'

function FormularioNegocio() {
  const { estado, despachar, pais } = useTienda()
  const { confirmar } = useUI()
  const { sincronizar } = useSincronizarBCV()
  const avisar = useAvisos()
  const [nombre, setNombre] = useState(estado.negocio.nombre)
  const [codigo, setCodigo] = useState<CodigoPais>(estado.negocio.pais)
  const elegido = PAISES[codigo]

  const guardarNegocio = (e: FormEvent) => {
    e.preventDefault()
    if (!nombre.trim()) {
      avisar('Escribe el nombre del negocio', { error: true })
      return
    }
    const aplicar = () => {
      despachar({ tipo: 'negocio/guardar', negocio: { nombre: nombre.trim(), pais: codigo } })
      avisar('Ajustes guardados')
      if (elegido.tasaBCV) sincronizar(true)
    }
    const hayMontos = estado.catalogo.length > 0 || estado.clientes.some((c) => c.movimientos.length > 0)
    if (elegido.moneda !== pais.moneda && hayMontos) {
      confirmar({
        titulo: '¿Cambiar la moneda a ' + NOMBRES_MONEDA[elegido.moneda] + '?',
        mensaje: 'Los montos que ya anotaste y los precios del catálogo no se convierten: lo que hoy ves como ' +
          formatearMoneda(10, pais) + ' pasará a verse como ' + formatearMoneda(10, elegido) + '.',
        textoBoton: 'Sí, cambiar',
        alConfirmar: aplicar,
      })
    } else {
      aplicar()
    }
  }

  return (
    <section className="seccion">
      <h2>Tu negocio</h2>
      <p>El nombre aparece arriba en la app y en los mensajes de WhatsApp. El país define la moneda y el formato de los teléfonos.</p>
      <form className="form form--ajustes" onSubmit={guardarNegocio}>
        <div className="campo">
          <label htmlFor="negocioNombre" className="campo__etq">Nombre del negocio</label>
          <input id="negocioNombre" type="text" className="entrada" required placeholder="Dulces de la abuela" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="negocioPais" className="campo__etq">País</label>
          <select id="negocioPais" className="entrada" value={codigo} onChange={(e) => esCodigoPais(e.target.value) && setCodigo(e.target.value)}>
            {Object.entries(PAISES).map(([k, p]) => <option key={k} value={k}>{p.nombre}</option>)}
          </select>
          <p className="ayuda">
            Moneda: {NOMBRES_MONEDA[elegido.moneda]} ({formatearMoneda(12.5, elegido)}). Teléfonos con +{elegido.prefijo}.
            {elegido.tasaBCV && ' Muestra también bolívares con la tasa BCV.'}
          </p>
        </div>
        <div><button type="submit" className="boton boton--primario">Guardar cambios</button></div>
      </form>
    </section>
  )
}

/** Solo aparece si se puede instalar y todavía no se está usando como app */
function SeccionInstalar() {
  const { puedeInstalar, esIOS, instalada, instalar } = useInstalarApp()
  const avisar = useAvisos()
  if (instalada || (!puedeInstalar && !esIOS)) return null

  const alInstalar = async () => {
    if (await instalar()) avisar('App instalada en tu pantalla de inicio')
  }

  return (
    <section className="seccion">
      <h2>Instalar en el teléfono</h2>
      {puedeInstalar ? (
        <>
          <p>Ábrela desde la pantalla de inicio, como cualquier otra app. Funciona aunque no tengas conexión.</p>
          <div className="seccion__acciones">
            <button type="button" className="boton boton--oscuro" onClick={alInstalar}>Instalar app</button>
          </div>
        </>
      ) : (
        <p>En iPhone: toca <b>Compartir</b> en Safari y luego <b>Agregar a inicio</b>. Funciona aunque no tengas conexión.</p>
      )}
    </section>
  )
}

/** Lee un archivo elegido por el usuario y limpia el input para poder elegir el mismo otra vez */
async function leerArchivo(e: ChangeEvent<HTMLInputElement>): Promise<string | null> {
  const archivo = e.target.files?.[0]
  e.target.value = ''
  return archivo ? archivo.text() : null
}

export function Ajustes() {
  const { estado, despachar, pais } = useTienda()
  const { confirmar, irA } = useUI()
  const avisar = useAvisos()
  const agregarEjemplo = useClienteEjemplo()

  const descargarCopia = () => {
    const blob = new Blob([JSON.stringify(crearRespaldo(estado), null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = nombreArchivoRespaldo(estado.negocio, fechaHoy())
    a.click()
    URL.revokeObjectURL(url)
    avisar('Copia descargada')
  }

  const restaurarCopia = async (e: ChangeEvent<HTMLInputElement>) => {
    const texto = await leerArchivo(e)
    if (texto === null) return
    const restaurado = leerRespaldo(texto, estado)
    if (!restaurado) {
      avisar('Ese archivo no es una copia de seguridad válida', { error: true })
      return
    }
    confirmar({
      titulo: '¿Restaurar esta copia?',
      mensaje: 'Reemplaza tus ' + estado.clientes.length + ' clientes actuales por los ' + restaurado.clientes.length + ' de la copia.',
      textoBoton: 'Sí, restaurar',
      alConfirmar: () => {
        despachar({ tipo: 'estado/reemplazar', estado: restaurado })
        irA('cuentas')
        avisar('Copia restaurada (' + restaurado.clientes.length + ' clientes)')
      },
    })
  }

  const importar = async (e: ChangeEvent<HTMLInputElement>) => {
    const texto = await leerArchivo(e)
    if (texto === null) return
    const clientes = importarCSV(texto, pais, fechaHoy())
    if (clientes.length === 0) {
      avisar('No se encontraron filas válidas en el CSV', { error: true })
      return
    }
    despachar({ tipo: 'clientes/importar', clientes })
    irA('cuentas')
    avisar(clientes.length + ' clientes importados')
  }

  const borrarTodo = () => confirmar({
    titulo: '¿Borrar toda la base de datos?',
    mensaje: 'Se eliminarán todos los clientes, ventas y pagos.',
    alConfirmar: () => {
      despachar({ tipo: 'clientes/borrar-todo' })
      avisar('Datos borrados')
    },
  })

  return (
    <section className="vista">
      <header className="encabezado">
        <h1>Ajustes</h1>
        <p>Los datos de tu negocio y las copias de seguridad.</p>
      </header>

      <div className="panel">
        <FormularioNegocio key={estado.negocio.nombre + estado.negocio.pais} />
        <SeccionInstalar />

        <section className="seccion">
          <h2>Copia de seguridad</h2>
          <p>Tus datos se guardan solo en este dispositivo. Descarga una copia de vez en cuando para no perderlos. Incluye clientes, ventas, pagos, catálogo, métodos de pago y los datos de tu negocio.</p>
          <div className="seccion__acciones">
            <button type="button" className="boton boton--oscuro" onClick={descargarCopia}><Icono nombre="respaldo" />Descargar copia</button>
            <label className="boton boton--borde">
              <Icono nombre="subir" />Restaurar copia
              <input type="file" accept=".json" className="sr" onChange={restaurarCopia} />
            </label>
          </div>
        </section>

        <section className="seccion">
          <h2>Importar clientes desde Excel</h2>
          <p>Guarda la hoja como CSV (separado por comas o punto y coma) con estas tres columnas, en este orden:</p>
          <code className="formato">Nombre, Telefono, Deuda</code>
          <div className="seccion__acciones">
            <label className="boton boton--borde">
              <Icono nombre="hoja" />Elegir archivo CSV
              <input type="file" accept=".csv,text/csv" className="sr" onChange={importar} />
            </label>
          </div>
        </section>

        <section className="seccion">
          <h2>Pruebas y limpieza</h2>
          <p>Agrega un cliente de ejemplo para probar la app, o borra todo para empezar de cero.</p>
          <div className="seccion__acciones">
            <button type="button" className="boton boton--suave" onClick={agregarEjemplo}>Agregar cliente de ejemplo</button>
            <button type="button" className="boton boton--peligro-suave" onClick={borrarTodo}>Borrar todos los datos</button>
          </div>
        </section>
      </div>
    </section>
  )
}
