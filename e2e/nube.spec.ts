import { expect, test, type Page } from '@playwright/test'
import { abrirConDatos, DATOS_VENEZUELA, fila, guardado } from './ayudantes.ts'

// Supabase se simula por completo: no se envían correos ni se toca el proyecto real.

const USUARIO = { id: '00000000-0000-0000-0000-00000000000a', email: 'ana@ejemplo.com' }
const NEGOCIO_NUBE = { id: '11111111-1111-1111-1111-111111111111', nombre: "Pachon's Bakehouse", pais: 'VE', tasa_bcv: 0, tasa_bcv_actualizada: '', creado_en: '2026-11-20T00:00:00Z', actualizado_en: '2026-11-20T00:00:00Z' }
// supabase-js guarda la sesión en "sb-<ref del proyecto>-auth-token"
const CLAVE_SESION = 'sb-kvvzdbycnabpkkszcpge-auth-token'

interface Simulacion {
  negocios?: typeof NEGOCIO_NUBE[]
  limiteDeCorreos?: boolean
  /** Corta la red al subir a esta tabla (mientras sea true) */
  sinRedEn?: { tabla: string; activo: boolean }
}

const TABLAS_DE_DATOS = ['clientes', 'movimientos', 'productos', 'metodos_pago']

/** Responde como Supabase y anota cada llamada; una llamada no prevista hace fallar la prueba */
async function simularSupabase(page: Page, opciones: Simulacion = {}) {
  const llamadas: { metodo: string; ruta: string; cuerpo: unknown; url: string; cabeceras: Record<string, string> }[] = []
  await page.route(/\.supabase\.co\//, async (ruta) => {
    const peticion = ruta.request()
    const url = new URL(peticion.url())
    const cuerpo = peticion.postData() ? JSON.parse(peticion.postData()!) : null
    const tabla = url.pathname.replace('/rest/v1/', '')
    if (opciones.sinRedEn?.activo && opciones.sinRedEn.tabla === tabla) return ruta.abort('internetdisconnected')
    llamadas.push({ metodo: peticion.method(), ruta: url.pathname, cuerpo, url: peticion.url(), cabeceras: peticion.headers() })

    if (url.pathname === '/auth/v1/otp') {
      return opciones.limiteDeCorreos
        ? ruta.fulfill({ status: 429, json: { code: 429, error_code: 'over_email_send_rate_limit', msg: 'email rate limit exceeded' } })
        : ruta.fulfill({ json: {} })
    }
    if (url.pathname === '/auth/v1/logout') return ruta.fulfill({ status: 204 })
    if (url.pathname === '/auth/v1/user') return ruta.fulfill({ json: { ...USUARIO, aud: 'authenticated', role: 'authenticated' } })
    if (url.pathname === '/rest/v1/negocios') {
      return peticion.method() === 'PATCH' ? ruta.fulfill({ status: 204 }) : ruta.fulfill({ json: opciones.negocios ?? [] })
    }
    if (peticion.method() === 'POST' && TABLAS_DE_DATOS.includes(tabla)) return ruta.fulfill({ status: 201 })
    if (peticion.method() === 'PATCH' && TABLAS_DE_DATOS.includes(tabla)) return ruta.fulfill({ status: 204 })
    if (url.pathname === '/rest/v1/rpc/crear_negocio') return ruta.fulfill({ json: NEGOCIO_NUBE.id })
    return ruta.fulfill({ status: 500, json: { message: 'Llamada no prevista en la prueba: ' + url.pathname } })
  })
  return llamadas
}

/** Un token con forma de JWT (la app no verifica la firma; eso lo hace Supabase en el servidor) */
function tokenFalso() {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const exp = Math.floor(Date.now() / 1000) + 3600
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USUARIO.id, email: USUARIO.email, role: 'authenticated', aud: 'authenticated', exp })}.firma`
}

async function abrirAjustes(page: Page, { conSesion = false, nubeVisible = true, yaSubido = false } = {}) {
  await abrirConDatos(page, DATOS_VENEZUELA)
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
  expect(llamadas.filter((l) => TABLAS_DE_DATOS.some((t) => l.ruta === '/rest/v1/' + t))).toHaveLength(0)
  expect(await page.evaluate(() => localStorage.getItem('pachons_nube_cola_v1'))).toBeNull()
})
