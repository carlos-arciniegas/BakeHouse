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
}

/** Responde como Supabase y anota cada llamada; una llamada no prevista hace fallar la prueba */
async function simularSupabase(page: Page, opciones: Simulacion = {}) {
  const llamadas: { metodo: string; ruta: string; cuerpo: unknown; url: string }[] = []
  await page.route(/\.supabase\.co\//, async (ruta) => {
    const peticion = ruta.request()
    const url = new URL(peticion.url())
    const cuerpo = peticion.postData() ? JSON.parse(peticion.postData()!) : null
    llamadas.push({ metodo: peticion.method(), ruta: url.pathname, cuerpo, url: peticion.url() })

    if (url.pathname === '/auth/v1/otp') {
      return opciones.limiteDeCorreos
        ? ruta.fulfill({ status: 429, json: { code: 429, error_code: 'over_email_send_rate_limit', msg: 'email rate limit exceeded' } })
        : ruta.fulfill({ json: {} })
    }
    if (url.pathname === '/auth/v1/logout') return ruta.fulfill({ status: 204 })
    if (url.pathname === '/auth/v1/user') return ruta.fulfill({ json: { ...USUARIO, aud: 'authenticated', role: 'authenticated' } })
    if (url.pathname === '/rest/v1/negocios') return ruta.fulfill({ json: opciones.negocios ?? [] })
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

async function abrirAjustes(page: Page, { conSesion = false, nubeVisible = true } = {}) {
  await abrirConDatos(page, DATOS_VENEZUELA)
  await page.evaluate(({ clave, sesion, nubeVisible }) => {
    if (nubeVisible) localStorage.setItem('pachons_probar_nube_v1', '1')
    if (sesion) localStorage.setItem(clave, JSON.stringify(sesion))
  }, {
    clave: CLAVE_SESION,
    nubeVisible,
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
