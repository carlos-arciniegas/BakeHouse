# BakeHouse

App web (PWA) para que negocios de repostería y emprendimientos lleven el control de ventas, fiados y cobros. El primer cliente es Pachon's Bakehouse (Caracas, Venezuela). La idea es que luego sea genérica y se pueda vender a otros negocios del nicho, también en Europa: no amarrar funciones nuevas a Venezuela.

## Reglas obligatorias

- **Nunca hacer `git commit` ni `git push` sin que el usuario lo pida explícitamente.** Hacer los cambios en el código y avisar; el usuario decide cuándo guardar en git y cuándo subir.
- **No modificar `.gitignore` sin avisar antes.** Si algo debe agregarse o quitarse, explicar qué y por qué, y esperar la aprobación del usuario.
- **No generar capturas de pantalla salvo que el usuario las pida.** Si para verificar un cambio visual hacen falta, preguntar primero. Para verificar lógica, usar pruebas que ejecuten las funciones y revisen los datos, sin capturas.

## Estado actual

- **React 19 + TypeScript + Vite.** La versión anterior de un solo archivo se puede consultar en el historial de git (commit `d0ff071`).
- Estructura:
  - `src/logica/`: funciones puras del dominio (saldo, moneda, teléfonos, países, métodos de pago, mensajes de WhatsApp, venta, BCV). Sin DOM ni `localStorage`; todo lo que necesitan entra por parámetro.
  - `src/datos/`: `localStorage` (claves, carga, migraciones y saneamiento) y respaldos JSON/CSV. Reciben el almacenamiento por parámetro para poder probarse.
  - `src/estado/`: `reductor.ts` (todo cambio de datos es una acción; puro y probado), `contextos.ts` (contextos y hooks `useTienda`, `useUI`, `useAvisos`), y los proveedores `Tienda.tsx` (guarda en `localStorage` la parte que cambió) y `UI.tsx` (vista, hoja abierta, confirmación, cliente resaltado).
  - `src/componentes/`: `Marco.tsx` (barra, navegación, toldo), `vistas/` (Cuentas, Catálogo, Pagos, Ajustes), `hojas/` (cliente, venta, pago, método), `base.tsx` (Hoja, Interruptor, Icono, OpcionesPago), `ganchos.ts` (hooks y utilidades de la interfaz).
  - `src/estilos/app.css`: el CSS de la versión anterior, con los mismos nombres de clase.
  - PWA con `vite-plugin-pwa` (configurada en `vite.config.ts`): los íconos se generan en cada build desde `public/favicon.svg` (`pwa-assets.config.ts`); `ActualizacionPWA.tsx` avisa cuando hay versión nueva y la app **no** se recarga sola (para no interrumpir una venta); `instalar.ts` maneja el botón "Instalar app" y las instrucciones para iPhone. Cualquier cambio debe seguir funcionando sin conexión (hay prueba en `e2e/pwa.spec.ts`).
  - Pruebas junto a cada módulo (`*.test.ts`) con Vitest.
- Convenciones de React: los archivos `.tsx` exportan solo componentes (hooks y contextos van en `.ts`); para reaccionar a un cambio de prop se usa el patrón de estado previo durante el render, no `setState` dentro de `useEffect`; `useEffect` solo para sistemas externos (red, DOM, temporizadores).
- Comandos: `npm run dev`, `npm test` (Vitest), `npm run test:e2e` (Playwright, móvil y escritorio contra la app compilada), `npm run typecheck`, `npm run lint`, `npm run build`. Antes de dar algo por terminado deben pasar `npm test`, `npm run test:e2e`, `npm run typecheck` y `npm run lint`.
- Supabase (en preparación, ver `docs/plan-supabase.md`): migraciones en `supabase/migrations/`, pruebas de seguridad en `supabase/pruebas/` con `npm run test:bd` (PostgreSQL desechable en Docker). Todo cambio de esquema va en una migración nueva con su prueba. Nunca poner la clave secreta (service_role) ni la contraseña de la base en la app o en el repo.
  - Conexión: `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` en `.env.local` (ignorado por git; plantilla en `.env.example`) y como variables del repositorio en GitHub para el CI. Sin ellas `supabase` es `null` y la app funciona solo en el dispositivo.
  - `src/datos/supabase.ts` crea el cliente tipado; `src/datos/baseDeDatos.ts` son los tipos generados de la base (`npm run tipos:bd` tras cada migración; no editar a mano); `src/datos/nube.ts` convierte entre los datos de la app y las filas (puro y probado).
  - La CLI no logra conectarse al pooler de la base (`db push` falla): las migraciones se aplican desde el SQL Editor del panel y se verifican con la clave pública. Ver pendientes en el plan.
  - Cuenta en la nube (fases 3 y 4): `src/datos/cuenta.ts` (lógica pura), `src/componentes/nube.ts` (hooks `useSesion`, `useCuentaNube`) y `vistas/CuentaNube.tsx`. "Subir mis datos" (fase 4) está en `src/datos/subida.ts`. La sección está **oculta en producción** hasta que la sincronización funcione: se ve en desarrollo o con `?nube=1`. Las pruebas e2e de la nube simulan Supabase con `page.route` y nunca llaman al proyecto real.
  - Los productos del catálogo tienen `id` fijo y las ventas armadas desde el catálogo guardan `productos` (nombre, cantidad, precio) para sincronizar y para reportes.
- Pruebas de punta a punta en `e2e/`: abren la app con datos de prueba (`abrirConDatos`) y simulan la tasa BCV en 100 Bs/$. Cada flujo nuevo o cambiado de la interfaz debe tener su prueba ahí; usar localizadores accesibles (`getByRole`, `getByLabel`).
- Toda lógica nueva va en `src/logica/` o `src/datos/` con su prueba; los componentes solo muestran y llaman a esas funciones.
- Los datos se guardan solo en `localStorage` del navegador.
- Funciones: clientes con fiado, ventas, pagos en USD o Bs, tasa BCV (API con respaldo manual), métodos de pago configurables (`TIPOS_PAGO`: transferencia/IBAN, Bizum, PayPal, Pago Móvil, Zelle, Binance Pay, otro), cobros y estados de cuenta por WhatsApp, respaldo JSON e importación CSV.
- Para agregar un método de pago nuevo basta con sumar una entrada a `TIPOS_PAGO`; el formulario, la lista y el mensaje de WhatsApp se generan solos.

## Reglas del negocio

- El negocio (nombre y país) se configura en Ajustes y vive en `negocio`; el país sale de `PAISES` y define moneda, formato, prefijo telefónico y si se usa la tasa BCV. Si no hay nada guardado se usa `NEGOCIO_PREDETERMINADO` (Pachon's, Venezuela).
- Los montos se guardan como números en la moneda del país, sin conversión. Cambiar de moneda no convierte lo ya anotado (la app lo advierte).
- Saldo = ventas − pagos. Positivo: el cliente debe. Negativo: tiene **saldo a favor** (pagó de más o adelantó dinero) y se descuenta solo de sus próximas compras. Nunca esconder un saldo negativo con `Math.max(0, …)` en la interfaz: mostrarlo como "X a favor" (fila, hoja de pago, hoja de venta, resumen del toldo y estado de cuenta por WhatsApp).
- Bolívares solo en Venezuela: usar siempre `tasaActiva(pais, tasa)` para decidir si se muestran, nunca la tasa directamente. Los elementos solo-Venezuela llevan la clase `solo-tasa`.
- Montos con `formatearMoneda(valor, pais)`, teléfonos con `normalizarTelefono(tel, pais)` y `mostrarTelefono(tel)`. No escribir "$", "dólares" ni "+58" fijos en la interfaz.
- La interfaz va en español neutro, que sirva en Venezuela y en España.
- Vocabulario: en la interfaz se dice **"Venta"** y **"Pago"** (nunca "abono"). Internamente el tipo de movimiento sigue siendo `'abono'` (compatibilidad con los datos guardados); los movimientos viejos guardados como "Abono (...)" se muestran como "Pago (...)" con `textoMovimiento()`.
- Las claves de `localStorage` empiezan por `pachons_` por compatibilidad con los datos que ya existen; no renombrarlas.

## Diseño

- Usar la skill `frontend-design` (en `.claude/skills/frontend-design/`) para cualquier cambio visual.
- Evitar el aspecto de app hecha por IA: nada de emojis como íconos, ni etiquetas en MAYÚSCULAS, ni Mayúscula En Cada Palabra (en español se escribe "Total por cobrar"), ni todo dividido en tarjetas idénticas.
- Diseñar primero para móvil.
- Paleta actual "cobalto": los colores viven en variables CSS (`--marca`, `--marca-osc`, `--marca-claro`, `--mantequilla`); cambiar la marca es cambiar esas variables.

## Principios de experiencia (obligatorios en cada cambio)

### Mínimo de toques
Cada tarea frecuente debe resolverse con la menor cantidad de toques posible. Antes de agregar o cambiar un flujo, contar los toques y buscar cómo quitar uno.
- Prellenar con lo más probable: el monto del pago viene con la deuda completa, la fecha con hoy, el método de pago con el último usado (`pachons_ultimo_metodo_v1`), el cliente con el de la fila desde donde se abrió.
- Juntar pasos que casi siempre van juntos: "Ya me pagó" en la venta anota la venta y el pago de una vez.
- Repetir un toque suma, no duplica: tocar dos veces un producto del catálogo da "2x", con contador en el botón.
- Todo lo que se suma con un toque se debe poder corregir con otro: los productos con cantidad muestran un botón "−" pegado que resta uno (en 0 se desmarca). Nunca obligar a empezar de cero por un toque de más.
- Borrar sin confirmar y ofrecer "Deshacer" (`avisar(msg, { accion: { texto: 'Deshacer', fn } })`) cuando lo borrado se puede restaurar. Confirmar con diálogo solo lo grave y difícil de rehacer (borrar un cliente con su historial, borrar todos los datos, cambiar de moneda).
- Llevar al usuario a donde tiene que actuar: desplazar hasta el formulario al editar, revelar las opciones nuevas al activar un interruptor.
- Campos de monto con `onFocus={(e) => e.target.select()}` para escribir encima sin borrar.
- Áreas táctiles de al menos 44 px.

### Claridad total
- Una acción principal por pantalla o fila, visualmente obvia (ej. "Cobrar por WhatsApp" en verde a todo el ancho).
- Botones que dicen exactamente lo que pasa, y el aviso usa el mismo verbo ("Anotar venta" → "Venta anotada").
- Ayudas cortas debajo del campo cuando algo no es evidente ("Viene con todo lo que debe…").
- Sin efectos de vidrio ni transparencias que resten legibilidad.

### Animaciones con propósito
- Animar solo para mostrar qué cambió o responder a un toque: hojas que suben y bajan, avisos que entran y salen, la fila del cliente que se resalta tras guardar, el total que cuenta hasta el valor nuevo, el contador del producto, el historial al abrirse.
- Un solo momento de entrada al abrir la app (el toldo que se desenrolla). Nada de animaciones decorativas en cada sección.
- Animaciones de entrada ligadas al montaje del elemento (el historial al abrirse, la vista al cambiar) para que no se repitan en cada render. La fila resaltada usa `resaltar(id)` de `useUI()`, que se apaga sola.
- Abrir hojas con `abrirHoja({ tipo, ... })` y cerrarlas con `cerrarHoja()`; el componente `<Hoja>` anima la entrada y la salida.
- Duraciones cortas (150–300 ms; el conteo del total ~650 ms). Respetar siempre `prefers-reduced-motion` (CSS global y `sinMovimiento()` en JS).
