import { useState, type FormEvent } from 'react'
import { correoValido, nubeHabilitada } from '../../datos/cuenta'
import { textoEstadoSync } from '../../datos/sincronizacion'
import { porcentaje, textoResumen } from '../../datos/subida'
import { useAvisos, useTienda, useUI } from '../../estado/contextos'
import { useDescargarCopia } from '../ganchos'
import { useCuentaNube } from '../nube'
import { revisarCola, useEstadoSincronizacion } from '../sincronizacion'

/** Se decide una vez al cargar: en desarrollo, o si la app se abrió alguna vez con "?nube=1" */
const habilitada = nubeHabilitada(localStorage, window.location.search, import.meta.env.DEV)

function FormularioCorreo({ alEnviar }: { alEnviar: (correo: string) => Promise<string | null> }) {
  const [correo, setCorreo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviadoA, setEnviadoA] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    if (!correoValido(correo)) {
      setError('Ese correo no parece válido. Revísalo y vuelve a intentar.')
      return
    }
    setEnviando(true)
    setError(null)
    const problema = await alEnviar(correo)
    setEnviando(false)
    if (problema) setError(problema)
    else setEnviadoA(correo.trim())
  }

  if (enviadoA) {
    return (
      <>
        <p>Te enviamos un enlace a <b>{enviadoA}</b>. Ábrelo <b>en este mismo dispositivo</b> para entrar. Vence en una hora.</p>
        <div className="seccion__acciones">
          <button type="button" className="boton boton--texto" onClick={() => { setEnviadoA(null); setCorreo('') }}>Usar otro correo</button>
        </div>
      </>
    )
  }

  return (
    <form className="form form--ajustes" onSubmit={enviar} noValidate>
      <div className="campo">
        <label htmlFor="correoNube" className="campo__etq">Tu correo</label>
        <input id="correoNube" type="email" className="entrada" autoComplete="email" inputMode="email" placeholder="tu@correo.com"
          value={correo} onChange={(e) => setCorreo(e.target.value)} aria-describedby="ayudaCorreoNube" aria-invalid={error ? true : undefined} />
        <p id="ayudaCorreoNube" className="ayuda" role={error ? 'alert' : undefined} style={error ? { color: 'var(--rojo)' } : undefined}>
          {error ?? 'Te llega un enlace para entrar, sin contraseña.'}
        </p>
      </div>
      <div>
        <button type="submit" className="boton boton--primario" disabled={enviando}>{enviando ? 'Enviando…' : 'Enviarme el enlace'}</button>
      </div>
    </form>
  )
}

/** Oculta (y sin tocar Supabase) salvo en desarrollo o si se activó con "?nube=1" */
export function CuentaNube() {
  return habilitada ? <CuentaNubeVisible /> : null
}

function CuentaNubeVisible() {
  const cuenta = useCuentaNube()
  const { estado } = useTienda()
  const { confirmar } = useUI()
  const avisar = useAvisos()
  const [creando, setCreando] = useState(false)
  const sync = useEstadoSincronizacion()
  const descargarCopia = useDescargarCopia()
  // Avance de la subida en %, o null si no se está subiendo
  const [avance, setAvance] = useState<number | null>(null)

  if (!cuenta.disponible) return null

  const crear = async () => {
    setCreando(true)
    const r = await cuenta.crearEnNube(estado.negocio)
    setCreando(false)
    avisar(r.ok ? estado.negocio.nombre + ' quedó creado en la nube' : r.mensaje, { error: !r.ok })
  }

  const subir = async () => {
    // Por si acaso: primero una copia en el dispositivo
    descargarCopia()
    setAvance(0)
    const r = await cuenta.subirMisDatos(estado, (enviadas, total) => setAvance(porcentaje(enviadas, total)))
    setAvance(null)
    if (r.ok) {
      avisar('Datos subidos: ' + textoResumen(r.resumen))
      // Desde ahora lo que se anote se guarda solo
      revisarCola()
    } else avisar(r.mensaje, { error: true })
  }

  const cerrarSesion = () => confirmar({
    titulo: '¿Cerrar sesión?',
    mensaje: 'Tus datos siguen en este dispositivo, pero lo que anotes ya no se guardará en la nube. Para volver te llegará otro enlace por correo.',
    textoBoton: 'Cerrar sesión',
    alConfirmar: async () => {
      await cuenta.cerrarSesion()
      revisarCola()
      avisar('Sesión cerrada')
    },
  })

  let contenido
  if (cuenta.cargando) {
    contenido = <p>Conectando…</p>
  } else if (!cuenta.correo) {
    contenido = (
      <>
        <p>Respalda tus datos fuera del teléfono y úsalos desde otro dispositivo. Es opcional: sin cuenta, la app sigue funcionando igual.</p>
        <FormularioCorreo alEnviar={async (correo) => {
          const r = await cuenta.enviarEnlace(correo)
          return r.ok ? null : r.mensaje
        }} />
      </>
    )
  } else if (cuenta.error) {
    contenido = <p role="alert">{cuenta.error}</p>
  } else if (cuenta.conectado) {
    contenido = (
      <>
        <p>Entraste como <b>{cuenta.correo}</b>. Este dispositivo está conectado a <b>{cuenta.conectado.nombre}</b> en la nube.</p>
        {cuenta.ultimaSubida ? (
          <>
            <p className="estado-nube" role="status" data-estado={sync.pendientes === 0 && sync.rechazados === 0 ? 'ok' : sync.error && !sync.sinConexion ? 'error' : 'pendiente'}>
              {textoEstadoSync(sync)}
            </p>
            <p>Lo que anotes se guarda solo en la nube; sin conexión, se guarda al volver la red.</p>
            <div>
              <button type="button" className="boton boton--borde" onClick={subir} disabled={avance !== null} aria-describedby="ayudaSubir">
                {avance !== null ? 'Subiendo… ' + avance + ' %' : 'Volver a subir todo'}
              </button>
              <p id="ayudaSubir" className="ayuda">Envía de nuevo todo lo del dispositivo, por si algo no cuadra. Antes descarga una copia y no duplica nada.</p>
            </div>
          </>
        ) : (
          <>
            <p>Sube tus clientes, ventas, pagos, catálogo y métodos de pago. Desde ese momento, lo que anotes se guarda solo en la nube.</p>
            <div>
              <button type="button" className="boton boton--primario boton--ancho" onClick={subir} disabled={avance !== null} aria-describedby="ayudaSubir">
                {avance !== null ? 'Subiendo… ' + avance + ' %' : 'Subir mis datos'}
              </button>
              <p id="ayudaSubir" className="ayuda">Antes de subir se descarga una copia en este dispositivo. Puedes repetirlo: no se duplica nada.</p>
            </div>
          </>
        )}
        <div className="seccion__acciones">
          <button type="button" className="boton boton--texto" onClick={cerrarSesion}>Cerrar sesión</button>
        </div>
      </>
    )
  } else {
    // Con sesión pero sin negocio conectado: crear uno, o elegir entre varios
    contenido = (
      <>
        <p>Entraste como <b>{cuenta.correo}</b>.{cuenta.negocios.length > 0 && ' Elige el negocio de este dispositivo:'}</p>
        <div className="seccion__acciones">
          {cuenta.negocios.map((n) => (
            <button key={n.id} type="button" className="boton boton--borde" onClick={() => cuenta.conectar(n.id)}>Usar «{n.nombre}»</button>
          ))}
          <button type="button" className="boton boton--primario" onClick={crear} disabled={creando}>
            {creando ? 'Creando…' : 'Crear «' + estado.negocio.nombre + '» en la nube'}
          </button>
          <button type="button" className="boton boton--texto" onClick={cerrarSesion}>Cerrar sesión</button>
        </div>
      </>
    )
  }

  return (
    <section className="seccion" aria-labelledby="tituloNube">
      <h2 id="tituloNube">Guardar en la nube</h2>
      {contenido}
    </section>
  )
}
