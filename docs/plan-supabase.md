# Plan: datos en la nube con Supabase

## Objetivo

Que los datos de cada negocio no dependan de un solo teléfono: respaldo automático, uso desde varios dispositivos (teléfono y computadora, dueña y ayudante) y la base para vender la app a otros negocios.

**Lo que no cambia:** la app sigue funcionando sin conexión. Los datos se guardan primero en el dispositivo y se sincronizan con Supabase cuando hay red ("primero local").

## Decisiones

| Tema | Decisión | Por qué |
|---|---|---|
| Modelo | `negocios` + `miembros` (dueño / ayudante) + datos por negocio | Una cuenta puede tener varios negocios y un negocio varias personas |
| Ids | Texto generado por la app | Se crean sin conexión y se conservan los ids de los datos locales actuales |
| Borrados | Borrado suave (`borrado_en`) | Para que un borrado llegue a los demás dispositivos |
| Cambios | `actualizado_en` lo pone el servidor (trigger) | La hora de un teléfono no es confiable |
| Conflictos | Gana el último cambio guardado, por fila | Simple y suficiente: casi siempre edita una sola persona |
| Seguridad | Row Level Security con `es_miembro()` / `es_dueno()` | Cada cuenta ve solo sus negocios, también si alguien llama a la API directo |
| Crear negocio | Solo con la función `crear_negocio()` | Deja a quien lo crea como dueño en una sola operación |
| Productos de la venta | Columna `productos` (JSON) en `movimientos` | Habilita reportes ("qué se vende más") sin otra tabla que sincronizar |
| Tasa BCV | En `negocios` | La comparten todos los dispositivos del negocio |
| Último método de pago usado | Se queda en el dispositivo | Es una preferencia personal, no un dato del negocio |
| Inicio de sesión | Enlace mágico por correo (sin contraseña) | Sin contraseñas que olvidar; Google se puede sumar después |

El esquema está en `supabase/migrations/20261120200000_esquema_inicial.sql` y sus pruebas de seguridad en `supabase/pruebas/` (`npm run test:bd`, requiere Docker).

## Fases

### Fase 0: preparar el proyecto en Supabase (hecho)
Proyecto `kvvzdbycnabpkkszcpge`, región **eu-west-1 (Irlanda)**. Desde Venezuela agrega ~100–150 ms a cada sincronización, que pasa en segundo plano; para clientes europeos deja los datos en la UE.

1. Crear el proyecto.
2. Iniciar sesión con la CLI en esta computadora: `npx supabase login` (abre el navegador) y `npx supabase link --project-ref <ref>`.
3. En *Authentication → URL Configuration*: Site URL `https://carlos-arciniegas.github.io/BakeHouse/` y, como URL de redirección extra, `http://localhost:5173/BakeHouse/`.
4. Pasar a la app la **Project URL** y la **clave pública** (anon / publishable). La clave secreta (service_role) y la contraseña de la base **nunca** van en la app ni se comparten.

### Fase 1: esquema (hecho)
- Migración con tablas, triggers, funciones y políticas, probada localmente (`npm run test:bd`).
- Aplicada desde el **SQL Editor** del panel: `npx supabase db push --remote` no logró conectarse (el pooler `aws-1-eu-west-1.pooler.supabase.com` corta la conexión antes de autenticar, también con la contraseña de la base). Verificado desde la API con la clave pública: las 6 tablas existen y sin sesión todo responde `permission denied`.
- **Pendiente:** cuando la CLI se conecte, registrar la migración como aplicada con `npx supabase migration repair --status applied 20261120200000 --remote`, para que las siguientes se suban con `db push`. Mientras tanto, las migraciones nuevas se aplican también desde el SQL Editor.

### Fase 2: capa de datos en la app (hecho)
- `@supabase/supabase-js` y variables `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (`.env.local` en desarrollo; variables del repositorio en GitHub Actions).
- `src/datos/nube.ts`: convierte entre los tipos de la app y las filas de la base (funciones puras, con pruebas).
- Las ventas guardan también sus productos (`productos`) cuando se arman desde el catálogo.

### Fase 3: inicio de sesión y negocio (hecho, oculto en producción)
- Sección "Guardar en la nube" en Ajustes (`CuentaNube.tsx`, hooks en `nube.ts`, lógica en `src/datos/cuenta.ts`). **Oculta en la app publicada** hasta terminar la fase 5: se ve en desarrollo o abriendo la app una vez con `?nube=1`.
- Si la cuenta tiene un solo negocio se conecta solo; el negocio conectado se guarda en el dispositivo (`pachons_nube_negocio_v1`).
- Pruebas con Playwright simulando Supabase (`e2e/nube.spec.ts`): no envían correos ni tocan el proyecto real.
- Pantalla para entrar con el correo (enlace mágico).
- Primer uso: crear el negocio con `crear_negocio()`, o entrar al que ya existe.
- Sin sesión la app sigue funcionando como hoy, solo en el dispositivo. La nube es opcional: nadie pierde lo que ya tiene.

### Fase 4: subir los datos existentes (hecho, oculto en producción)
- "Subir mis datos": envía clientes, movimientos, catálogo y métodos de pago con sus ids actuales (`upsert` por `negocio_id, id`, se puede repetir sin duplicar), en lotes de 500 y con el avance en el botón. También actualiza nombre, país y tasa del negocio.
- Antes de subir se descarga una copia de seguridad automáticamente.
- `datosAFilas` ajusta los datos viejos a los límites de la base (recorta textos, redondea a céntimos, fecha faltante = día de la subida) para que una fila rara no haga fallar todo.
- Si se corta la red a mitad, se detiene y avisa; al reintentar, lo ya subido se sobrescribe.
- Lógica en `src/datos/subida.ts` (la red entra por parámetro); la subida repetida y el intento de otra cuenta están en `supabase/pruebas/seguridad.sql`.
- Lo que se anota después no se sube solo: eso es la fase 5.

### Fase 5: sincronización
- Cada acción del reductor deja un cambio en una **cola local** (`localStorage`). Con red, la cola se envía en orden; si falla, se reintenta.
- Para traer cambios: "dame lo que cambió desde la última sincronización", con un margen de solapamiento para no perder cambios de transacciones simultáneas; aplicar es idempotente.
- Se sincroniza al abrir la app, al volver la conexión y cada cierto tiempo con la app abierta.
- Indicador discreto: "Guardado en la nube" / "Sin conexión: se guardará al volver la red".
- Pruebas: la lógica de cola y de mezcla con Vitest; los flujos (sin conexión → con conexión, dos dispositivos) con Playwright contra un Supabase local.

### Fase 6: pasar a Pachon's
0. **Requisito:** configurar un SMTP propio (por ejemplo Resend) en *Authentication → SMTP*. El correo que trae Supabase es de prueba: 2 correos por hora para todo el proyecto, y el inicio de sesión por enlace mágico depende de esos correos.
1. Descargar una copia de seguridad.
2. Crear su cuenta, entrar y subir sus datos (fase 4).
3. Confirmar en un segundo dispositivo que ve lo mismo.
4. Mantener el botón de copia de seguridad: el plan gratis de Supabase no tiene respaldos automáticos.

## Costos

- **Ahora (desarrollo y piloto): plan Free, $0.** Sin copias automáticas (por eso se mantiene la copia local) y el proyecto se pausa tras 1 semana sin uso.
- **Con el primer negocio que pague: Pro, $25/mes.** Copias diarias, sin pausas, tope de gasto activado por defecto. Alcanza para cientos de negocios (cada uno ocupa ~10 MB al año).

## Pendiente para más adelante

- Inicio de sesión con Google: credenciales OAuth en Google Cloud Console y activarlo en *Authentication → Providers*; en la app es un botón más (`signInWithOAuth`).

- Invitar a una ayudante por correo (el modelo ya lo soporta; falta la función y la pantalla).
- Reportes con los productos de cada venta.
- Proyecto en Europa, política de privacidad y DPA de Supabase para clientes europeos.
