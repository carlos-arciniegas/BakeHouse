import { expect, test, type Browser, type Page } from '@playwright/test'
import { abrirConDatos, DATOS_VENEZUELA, fila, guardado } from './ayudantes.ts'

// Supabase se simula por completo: no se envían correos ni se toca el proyecto real.

const USUARIO = { id: '00000000-0000-0000-0000-00000000000a', email: 'ana@ejemplo.com' }
const NEGOCIO_NUBE = { id: '11111111-1111-1111-1111-111111111111', nombre: "Pachon's Bakehouse", pais: 'VE', tasa_bcv: 0, tasa_bcv_actualizada: '', creado_en: '2026-11-20T00:00:00Z', actualizado_en: '2026-11-20T00:00:00Z' }
// supabase-js guarda la sesión en "sb-<ref del proyecto>-auth-token"
const CLAVE_SESION = 'sb-kvvzdbycnabpkkszcpge-auth-token'

type Fila = Record<string, unknown> & { id: string; actualizado_en: string }

/** Las tablas en memoria de un Supabase falso; dos páginas pueden compartirlo (dos dispositivos) */
interface Servidor {
  negocios: Fila[]
  tablas: Record<string, Fila[]>
}

const TABLAS_DE_DATOS = ['clientes', 'movimientos', 'productos', 'metodos_pago']

function nuevoServidor(negocios: typeof NEGOCIO_NUBE[] = []): Servidor {
  return { negocios: negocios.map((n) => ({ ...n })), tablas: Object.fromEntries(TABLAS_DE_DATOS.map((t) => [t, []])) }
}

// Hora del servidor: siempre creciente, como actualizado_en en la base
let reloj = Date.parse('2026-11-20T12:00:00Z')
const ahora = () => new Date(reloj += 1000).toISOString()

/** Filtros de PostgREST que usa la app: eq, gte, in, is.null */
function cumple(fila: Fila, url: URL): boolean {
  for (const [campo, valor] of url.searchParams) {
    if (['select', 'order', 'offset', 'limit', 'on_conflict', 'columns'].includes(campo)) continue
    const v = fila[campo]
    if (valor.startsWith('eq.') && String(v) !== valor.slice(3)) return false
    if (valor.startsWith('gte.') && !(String(v) >= valor.slice(4))) return false
    if (valor.startsWith('in.(') && !valor.slice(4, -1).split(',').includes(String(v))) return false
    if (valor === 'is.null' && v !== null && v !== undefined) return false
  }
  return true
}

interface Simulacion {
  negocios?: typeof NEGOCIO_NUBE[]
  servidor?: Servidor
  limiteDeCorreos?: boolean
  /** Corta la red al subir a esta tabla (mientras sea true) */
  sinRedEn?: { tabla: string; activo: boolean }
}

/** Responde como Supabase (con datos en memoria) y anota cada llamada; una llamada no prevista hace fallar la prueba */
async function simularSupabase(page: Page, opciones: Simulacion = {}) {
  const servidor = opciones.servidor ?? nuevoServidor(opciones.negocios)
  const llamadas: { metodo: string; ruta: string; cuerpo: unknown; url: string; cabeceras: Record<string, string> }[] = []
  await page.route(/\.supabase\.co\//, async (ruta) => {
    const peticion = ruta.request()
    const metodo = peticion.method()
    const url = new URL(peticion.url())
    const cuerpo = peticion.postData() ? JSON.parse(peticion.postData()!) : null
    const tabla = url.pathname.replace('/rest/v1/', '')
    if (opciones.sinRedEn?.activo && opciones.sinRedEn.tabla === tabla && metodo === 'POST') return ruta.abort('internetdisconnected')
    llamadas.push({ metodo, ruta: url.pathname, cuerpo, url: peticion.url(), cabeceras: peticion.headers() })

    if (url.pathname === '/auth/v1/otp') {
      return opciones.limiteDeCorreos
        ? ruta.fulfill({ status: 429, json: { code: 429, error_code: 'over_email_send_rate_limit', msg: 'email rate limit exceeded' } })
        : ruta.fulfill({ json: {} })
    }
    if (url.pathname === '/auth/v1/logout') return ruta.fulfill({ status: 204 })
    if (url.pathname === '/auth/v1/user') return ruta.fulfill({ json: { ...USUARIO, aud: 'authenticated', role: 'authenticated' } })
    if (url.pathname === '/rest/v1/rpc/crear_negocio') {
      servidor.negocios.push({ ...NEGOCIO_NUBE, nombre: cuerpo.nombre, pais: cuerpo.pais, actualizado_en: ahora() })
      return ruta.fulfill({ json: NEGOCIO_NUBE.id })
    }

    const filas = tabla === 'negocios' ? servidor.negocios : servidor.tablas[tabla]
    if (!filas) return ruta.fulfill({ status: 500, json: { message: 'Llamada no prevista en la prueba: ' + url.pathname } })

    if (metodo === 'GET' || metodo === 'HEAD') {
      const elegidas = filas.filter((f) => cumple(f, url))
        .sort((a, b) => a.actualizado_en.localeCompare(b.actualizado_en) || a.id.localeCompare(b.id))
      const desde = Number(url.searchParams.get('offset') ?? 0)
      const limite = Number(url.searchParams.get('limit') ?? 10000)
      const pagina = elegidas.slice(desde, desde + limite)
      return metodo === 'HEAD'
        // Como Supabase: el total va en Content-Range, expuesto por CORS
        ? ruta.fulfill({ status: 200, headers: { 'content-range': '*/' + elegidas.length, 'access-control-allow-origin': '*', 'access-control-expose-headers': 'Content-Range' } })
        : ruta.fulfill({ json: pagina })
    }
    if (metodo === 'POST') {
      for (const nueva of cuerpo as Fila[]) {
        const i = filas.findIndex((f) => f.id === nueva.id)
        const fila = { creado_en: ahora(), borrado_en: null, ...(i >= 0 ? filas[i] : {}), ...nueva, actualizado_en: ahora() }
        if (i >= 0) filas[i] = fila
        else filas.push(fila)
      }
      return ruta.fulfill({ status: 201 })
    }
    if (metodo === 'PATCH') {
      for (const [i, f] of filas.entries()) if (cumple(f, url)) filas[i] = { ...f, ...cuerpo, actualizado_en: ahora() }
      return ruta.fulfill({ status: 204 })
    }
    return ruta.fulfill({ status: 500, json: { message: 'Llamada no prevista en la prueba: ' + metodo + ' ' + url.pathname } })
  })
  return llamadas
}

/** Un token con forma de JWT (la app no verifica la firma; eso lo hace Supabase en el servidor) */
function tokenFalso() {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const exp = Math.floor(Date.now() / 1000) + 3600
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USUARIO.id, email: USUARIO.email, role: 'authenticated', aud: 'authenticated', exp })}.firma`
}

async function abrirAjustes(page: Page, { conSesion = false, nubeVisible = true, yaSubido = false, datos = DATOS_VENEZUELA as Record<string, unknown> } = {}) {
  await abrirConDatos(page, datos)
  await page.evaluate(({ clave, sesion, nubeVisible, subida }) => {
    if (nubeVisible) localStorage.setItem('pachons_probar_nube_v1', '1')
    if (sesion) localStorage.setItem(clave, JSON.stringify(sesion))
    if (subida) {
      localStorage.setItem('pachons_nube_negocio_v1', subida.negocioId)
      localStorage.setItem('pachons_nube_subida_v1', JSON.stringify(subida))
    }
  }, {
    clave: CLAVE_SESION,
    nubeVisible,
    subida: yaSubido ? { negocioId: NEGOCIO_NUBE.id, fecha: '2026-11-20T12:00:00.000Z', clientes: 3, movimientos: 7 } : null,
    sesion: conSesion ? {
      access_token: tokenFalso(), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'refresco',
      user: { ...USUARIO, aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-11-20T00:00:00Z' },
    } : null,
  })
  await page.reload()
  await page.getByRole('navigation', { name: 'Secciones' }).getByRole('button', { name: 'Ajustes' }).click()
}

const seccion = (page: Page) => page.getByRole('region', { name: 'Guardar en la nube' })

test('sin activarla, la nube no aparece (la app publicada no muestra la función a medias)', async ({ page }) => {
  await simularSupabase(page)
  await abrirAjustes(page, { nubeVisible: false })
  await expect(page.getByRole('heading', { name: 'Tu negocio' })).toBeVisible()
  await expect(seccion(page)).toHaveCount(0)
})

test('pide el enlace mágico con el correo y vuelve a la app', async ({ page }) => {
  const llamadas = await simularSupabase(page)
  await abrirAjustes(page)

  await seccion(page).getByLabel('Tu correo').fill('ana@ejemplo')
  await seccion(page).getByRole('button', { name: 'Enviarme el enlace' }).click()
  await expect(seccion(page).getByRole('alert')).toHaveText('Ese correo no parece válido. Revísalo y vuelve a intentar.')
  expect(llamadas.filter((l) => l.ruta === '/auth/v1/otp')).toHaveLength(0)

  await seccion(page).getByLabel('Tu correo').fill('ana@ejemplo.com')
  await seccion(page).getByRole('button', { name: 'Enviarme el enlace' }).click()
  await expect(seccion(page)).toContainText('Te enviamos un enlace a ana@ejemplo.com')

  const otp = llamadas.find((l) => l.ruta === '/auth/v1/otp')!
  expect(otp.cuerpo).toMatchObject({ email: 'ana@ejemplo.com' })
  expect(new URL(otp.url).searchParams.get('redirect_to')).toBe('http://localhost:4173/BakeHouse/')
})

test('si se pasa el límite de correos lo explica sin términos técnicos', async ({ page }) => {
  await simularSupabase(page, { limiteDeCorreos: true })
  await abrirAjustes(page)
  await seccion(page).getByLabel('Tu correo').fill('ana@ejemplo.com')
  await seccion(page).getByRole('button', { name: 'Enviarme el enlace' }).click()
  await expect(seccion(page).getByRole('alert')).toHaveText('Se enviaron demasiados correos seguidos. Espera unos minutos y vuelve a intentar.')
})

test('con sesión y sin negocio en la nube: lo crea con el nombre y el país del negocio', async ({ page }) => {
  const llamadas = await simularSupabase(page, { negocios: [] })
  await abrirAjustes(page, { conSesion: true })
  await expect(seccion(page)).toContainText('Entraste como ana@ejemplo.com')

  await seccion(page).getByRole('button', { name: "Crear «Pachon's Bakehouse» en la nube" }).click()
  await expect(seccion(page)).toContainText("conectado a Pachon's Bakehouse en la nube")
  expect(llamadas.find((l) => l.ruta === '/rest/v1/rpc/crear_negocio')!.cuerpo).toEqual({ nombre: "Pachon's Bakehouse", pais: 'VE' })
  expect(await page.evaluate(() => localStorage.getItem('pachons_nube_negocio_v1'))).toBe(NEGOCIO_NUBE.id)
})

test('con sesión y un solo negocio en la nube: se conecta solo', async ({ page }) => {
  const llamadas = await simularSupabase(page, { negocios: [NEGOCIO_NUBE] })
  await abrirAjustes(page, { conSesion: true })
  await expect(seccion(page)).toContainText("conectado a Pachon's Bakehouse en la nube")
  expect(llamadas.some((l) => l.ruta === '/rest/v1/rpc/crear_negocio')).toBe(false)
})

test('cerrar sesión deja los datos del dispositivo intactos', async ({ page }) => {
  const llamadas = await simularSupabase(page, { negocios: [NEGOCIO_NUBE] })
  await abrirAjustes(page, { conSesion: true })
  await seccion(page).getByRole('button', { name: 'Cerrar sesión' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cerrar sesión' }).click()

  await expect(seccion(page).getByLabel('Tu correo')).toBeVisible()
  expect(llamadas.some((l) => l.ruta === '/auth/v1/logout')).toBe(true)
  expect(await page.evaluate(() => localStorage.getItem('pachons_nube_negocio_v1'))).toBeNull()

  // Los clientes siguen ahí
  expect((await guardado<{ clientes: unknown[] }>(page, 'pachons_bakehouse_data_v3')).clientes).toHaveLength(3)
  await page.getByRole('navigation', { name: 'Secciones' }).getByRole('button', { name: 'Cuentas' }).click()
  await expect(fila(page, 'José Rodríguez')).toBeVisible()
})

test('sube los datos del dispositivo, con una copia descargada antes', async ({ page }) => {
  const llamadas = await simularSupabase(page, { negocios: [NEGOCIO_NUBE] })
  await abrirAjustes(page, { conSesion: true })

  const copia = page.waitForEvent('download')
  await seccion(page).getByRole('button', { name: 'Subir mis datos' }).click()
  expect((await copia).suggestedFilename()).toMatch(/\.json$/)
  await expect(page.locator('.toast').last()).toHaveText('Datos subidos: 3 clientes y 7 movimientos')

  // El negocio se actualiza y cada tabla se sube como upsert (repetir no duplica)
  expect(llamadas.find((l) => l.metodo === 'PATCH')!.cuerpo).toMatchObject({ nombre: "Pachon's Bakehouse", pais: 'VE', tasa_bcv: 100 })
  const subidas = llamadas.filter((l) => l.metodo === 'POST' && l.ruta !== '/rest/v1/rpc/crear_negocio')
  expect(subidas.map((l) => l.ruta)).toEqual(['/rest/v1/clientes', '/rest/v1/movimientos', '/rest/v1/productos', '/rest/v1/metodos_pago'])
  for (const l of subidas) {
    expect(new URL(l.url).searchParams.get('on_conflict')).toBe('negocio_id,id')
    expect(l.cabeceras['prefer']).toContain('resolution=merge-duplicates')
  }
  const clientes = subidas[0].cuerpo as { id: string; negocio_id: string }[]
  expect(clientes.map((c) => c.id)).toEqual(['c1', 'c2', 'c3'])
  expect(clientes.every((c) => c.negocio_id === NEGOCIO_NUBE.id)).toBe(true)

  // Desde ahora se guarda solo; volver a subir todo queda como opción secundaria
  await expect(seccion(page).getByRole('status')).toHaveText('Todo guardado en la nube.')
  await expect(seccion(page).getByRole('button', { name: 'Volver a subir todo' })).toBeEnabled()
})

test('si se corta la red a mitad de la subida lo explica y se puede reintentar', async ({ page }) => {
  const sinRedEn = { tabla: 'movimientos', activo: true }
  await simularSupabase(page, { negocios: [NEGOCIO_NUBE], sinRedEn })
  await abrirAjustes(page, { conSesion: true })

  await seccion(page).getByRole('button', { name: 'Subir mis datos' }).click()
  await expect(page.locator('.toast').last())
    .toHaveText('No hay conexión. Revisa tu internet y vuelve a intentar. Lo que ya se subió no se duplica al reintentar.')
  await expect(seccion(page).getByRole('status')).toHaveCount(0)

  sinRedEn.activo = false
  await seccion(page).getByRole('button', { name: 'Subir mis datos' }).click()
  await expect(page.locator('.toast').last()).toHaveText('Datos subidos: 3 clientes y 7 movimientos')
})

/** Va a Cuentas y anota un pago de María (deja la hoja con la deuda completa) */
async function anotarPago(page: Page) {
  await page.getByRole('navigation', { name: 'Secciones' }).getByRole('button', { name: 'Cuentas' }).click()
  await fila(page, 'María Fernanda Pérez').getByRole('button', { name: 'Pago', exact: true }).click()
  await page.getByRole('dialog', { name: 'Nuevo pago' }).getByRole('button', { name: 'Registrar pago' }).click()
  await expect(page.locator('.toast').last()).toHaveText('Pago de $6,50 registrado')
  await page.getByRole('navigation', { name: 'Secciones' }).getByRole('button', { name: 'Ajustes' }).click()
}

const subidasA = (llamadas: Awaited<ReturnType<typeof simularSupabase>>, ruta: string) =>
  llamadas.filter((l) => l.ruta === ruta && l.metodo === 'POST').map((l) => l.cuerpo as { id: string; tipo?: string; monto?: number }[])

test('después de subir, lo que se anota se guarda solo en la nube', async ({ page }) => {
  const llamadas = await simularSupabase(page, { negocios: [NEGOCIO_NUBE] })
  await abrirAjustes(page, { conSesion: true, yaSubido: true })
  await expect(seccion(page).getByRole('status')).toHaveText('Todo guardado en la nube.')

  await anotarPago(page)
  await expect(seccion(page).getByRole('status')).toHaveText('Todo guardado en la nube.')
  await expect.poll(() => subidasA(llamadas, '/rest/v1/movimientos')).toHaveLength(1)

  // Solo viaja el pago nuevo, no todo el historial
  const [enviado] = subidasA(llamadas, '/rest/v1/movimientos')
  expect(enviado).toHaveLength(1)
  expect(enviado[0]).toMatchObject({ tipo: 'abono', monto: 6.5, cliente_id: 'c1', negocio_id: NEGOCIO_NUBE.id, borrado_en: null })
  expect(subidasA(llamadas, '/rest/v1/clientes')).toHaveLength(0)
})

test('sin conexión guarda la cola y la envía al volver la red', async ({ page, context }) => {
  const llamadas = await simularSupabase(page, { negocios: [NEGOCIO_NUBE] })
  await abrirAjustes(page, { conSesion: true, yaSubido: true })
  await expect(seccion(page).getByRole('status')).toHaveText('Todo guardado en la nube.')

  await context.setOffline(true)
  await anotarPago(page)
  await expect(seccion(page).getByRole('status')).toHaveText('Sin conexión: 1 cambio se guardará al volver la red.')
  const cola = await page.evaluate(() => JSON.parse(localStorage.getItem('pachons_nube_cola_v1') ?? 'null'))
  expect(Object.keys(cola.cambios)).toHaveLength(1)
  expect(subidasA(llamadas, '/rest/v1/movimientos')).toHaveLength(0)

  await context.setOffline(false)
  await expect(seccion(page).getByRole('status')).toHaveText('Todo guardado en la nube.')
  expect(subidasA(llamadas, '/rest/v1/movimientos')).toHaveLength(1)
})

test('borrar un movimiento lo marca como borrado en la nube', async ({ page }) => {
  const llamadas = await simularSupabase(page, { negocios: [NEGOCIO_NUBE] })
  await abrirAjustes(page, { conSesion: true, yaSubido: true })
  await page.getByRole('navigation', { name: 'Secciones' }).getByRole('button', { name: 'Cuentas' }).click()

  const jose = fila(page, 'José Rodríguez')
  await jose.getByRole('button', { name: /Historial/ }).click()
  await jose.getByRole('button', { name: 'Eliminar movimiento' }).first().click()

  // No se borra de verdad: se marca, para que los otros dispositivos también lo quiten
  await expect.poll(() => llamadas.filter((l) => l.metodo === 'PATCH' && l.ruta === '/rest/v1/movimientos').length).toBe(1)
  const borrado = llamadas.find((l) => l.metodo === 'PATCH' && l.ruta === '/rest/v1/movimientos')!
  expect(new URL(borrado.url).searchParams.get('id')).toBe('in.(m5)')
  expect(new URL(borrado.url).searchParams.get('negocio_id')).toBe('eq.' + NEGOCIO_NUBE.id)
  expect(borrado.cuerpo).toHaveProperty('borrado_en')
})

test('sin haber subido los datos no se envía nada', async ({ page }) => {
  const llamadas = await simularSupabase(page, { negocios: [NEGOCIO_NUBE] })
  await abrirAjustes(page, { conSesion: true })
  await anotarPago(page)
  await page.waitForTimeout(2500)
  expect(llamadas.filter((l) => ['POST', 'PATCH'].includes(l.metodo) && TABLAS_DE_DATOS.some((t) => l.ruta === '/rest/v1/' + t))).toHaveLength(0)
  expect(await page.evaluate(() => localStorage.getItem('pachons_nube_cola_v1'))).toBeNull()
})

// ---------- Dos dispositivos con el mismo negocio ----------

/** Otro dispositivo: un contexto aparte (con su propio localStorage) contra el mismo servidor */
async function otroDispositivo(browser: Browser, baseURL: string | undefined) {
  const contexto = await browser.newContext({ baseURL })
  return contexto.newPage()
}

/** Pide sincronizar ya (lo mismo que pasa al volver la red o al volver a la app) */
const sincronizarAhora = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event('online')))

const irA = (page: Page, vista: string) => page.getByRole('navigation', { name: 'Secciones' }).getByRole('button', { name: vista }).click()

const escrituras = (llamadas: Awaited<ReturnType<typeof simularSupabase>>) =>
  llamadas.filter((l) => ['POST', 'PATCH'].includes(l.metodo) && TABLAS_DE_DATOS.some((t) => l.ruta === '/rest/v1/' + t))

/** El dispositivo A sube sus datos y el B (un teléfono nuevo, sin clientes) los trae */
async function dosDispositivos(page: Page, browser: Browser, baseURL: string | undefined) {
  const servidor = nuevoServidor([NEGOCIO_NUBE])
  const llamadasA = await simularSupabase(page, { servidor })
  await abrirAjustes(page, { conSesion: true })
  await seccion(page).getByRole('button', { name: 'Subir mis datos' }).click()
  await expect(page.locator('.toast').last()).toHaveText('Datos subidos: 3 clientes y 7 movimientos')

  const b = await otroDispositivo(browser, baseURL)
  const llamadasB = await simularSupabase(b, { servidor })
  await abrirAjustes(b, { conSesion: true, datos: {} })
  return { servidor, llamadasA, b, llamadasB }
}

test('un dispositivo nuevo trae los datos de la nube en lugar de pisarlos', async ({ page, browser, baseURL }) => {
  const { b, llamadasB } = await dosDispositivos(page, browser, baseURL)

  await expect(seccion(b)).toContainText("Pachon's Bakehouse ya tiene datos en la nube")
  await seccion(b).getByRole('button', { name: 'Traer los datos de la nube' }).click()
  await expect(b.locator('.toast').last()).toHaveText('Datos traídos de la nube: 3 clientes y 7 movimientos')
  await expect(seccion(b).getByRole('status')).toHaveText('Todo guardado en la nube.')

  await irA(b, 'Cuentas')
  await expect(fila(b, 'María Fernanda Pérez').locator('.fila__monto')).toHaveText('$6,50')
  // Lo traído no se reenvía a la nube
  await b.waitForTimeout(2000)
  expect(escrituras(llamadasB)).toHaveLength(0)
})

test('si el dispositivo ya tiene clientes, pide confirmar antes de reemplazarlos', async ({ page }) => {
  const servidor = nuevoServidor([NEGOCIO_NUBE])
  servidor.tablas.clientes.push({ id: 'c9', nombre: 'Marta', telefono: '', nota: '', negocio_id: NEGOCIO_NUBE.id, creado_en: ahora(), actualizado_en: ahora(), borrado_en: null })
  await simularSupabase(page, { servidor })
  await abrirAjustes(page, { conSesion: true })

  await seccion(page).getByRole('button', { name: 'Traer los datos de la nube' }).click()
  const dialogo = page.getByRole('alertdialog', { name: '¿Reemplazar los datos de este dispositivo?' })
  const copia = page.waitForEvent('download')
  await dialogo.getByRole('button', { name: 'Traer de la nube' }).click()
  await copia
  await expect(page.locator('.toast').last()).toHaveText('Datos traídos de la nube: 1 cliente y 0 movimientos')
  await irA(page, 'Cuentas')
  await expect(fila(page, 'Marta')).toBeVisible()
  await expect(fila(page, 'José Rodríguez')).toHaveCount(0)
})

test('lo anotado o borrado en un dispositivo aparece en el otro', async ({ page, browser, baseURL }) => {
  const { servidor, b } = await dosDispositivos(page, browser, baseURL)
  await seccion(b).getByRole('button', { name: 'Traer los datos de la nube' }).click()
  await expect(b.locator('.toast').last()).toHaveText('Datos traídos de la nube: 3 clientes y 7 movimientos')

  // A anota un pago de María; B lo ve al sincronizar
  await anotarPago(page)
  await expect.poll(() => servidor.tablas.movimientos.length).toBe(8)
  await irA(b, 'Cuentas')
  await sincronizarAhora(b)
  await expect(fila(b, 'María Fernanda Pérez').locator('.fila__aldia')).toHaveText('Al día')

  // B borra la última venta de José; A deja de verla
  const jose = fila(b, 'José Rodríguez')
  await jose.getByRole('button', { name: /Historial/ }).click()
  await jose.getByRole('button', { name: 'Eliminar movimiento' }).first().click()
  await expect.poll(() => servidor.tablas.movimientos.find((m) => m.id === 'm5')?.borrado_en).not.toBeNull()
  await irA(page, 'Cuentas')
  await sincronizarAhora(page)
  await expect(fila(page, 'José Rodríguez').getByRole('button', { name: /Historial/ })).toHaveText(/Historial \(1\)/)
})
