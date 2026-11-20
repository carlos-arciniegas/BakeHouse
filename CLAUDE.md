# BakeHouse

App web (PWA) para que negocios de repostería y emprendimientos lleven el control de ventas, fiados y cobros. El primer cliente es Pachon's Bakehouse (Caracas, Venezuela). La idea es que luego sea genérica y se pueda vender a otros negocios del nicho, también en Europa: no amarrar funciones nuevas a Venezuela.

## Reglas obligatorias

- **Nunca hacer `git commit` ni `git push` sin que el usuario lo pida explícitamente.** Hacer los cambios en el código y avisar; el usuario decide cuándo guardar en git y cuándo subir.
- **No modificar `.gitignore` sin avisar antes.** Si algo debe agregarse o quitarse, explicar qué y por qué, y esperar la aprobación del usuario.
- **No generar capturas de pantalla salvo que el usuario las pida.** Si para verificar un cambio visual hacen falta, preguntar primero. Para verificar lógica, usar pruebas que ejecuten las funciones y revisen los datos, sin capturas.

## Estado actual

- **Migración en curso a React + TypeScript + Vite** (rama `react`). La versión completa de un solo archivo sigue en `legacy/index.html` como referencia de comportamiento y diseño; se borra cuando la interfaz en React la reemplace.
- Estructura:
  - `src/logica/`: funciones puras del dominio (saldo, moneda, teléfonos, países, métodos de pago, mensajes de WhatsApp, venta, BCV). Sin DOM ni `localStorage`; todo lo que necesitan entra por parámetro.
  - `src/datos/`: `localStorage` (claves, carga, migraciones y saneamiento) y respaldos JSON/CSV. Reciben el almacenamiento por parámetro para poder probarse.
  - Pruebas junto a cada módulo (`*.test.ts`) con Vitest.
- Comandos: `npm run dev`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`. Antes de dar algo por terminado deben pasar `npm test`, `npm run typecheck` y `npm run lint`.
- Toda lógica nueva va en `src/logica/` o `src/datos/` con su prueba; los componentes solo muestran y llaman a esas funciones.
- Los datos se guardan solo en `localStorage` del navegador.
- Funciones: clientes con fiado, ventas, pagos en USD o Bs, tasa BCV (API con respaldo manual), métodos de pago configurables (`TIPOS_PAGO`: transferencia/IBAN, Bizum, PayPal, Pago Móvil, Zelle, Binance Pay, otro), cobros y estados de cuenta por WhatsApp, respaldo JSON e importación CSV.
- Para agregar un método de pago nuevo basta con sumar una entrada a `TIPOS_PAGO`; el formulario, la lista y el mensaje de WhatsApp se generan solos.

## Reglas del negocio

- El negocio (nombre y país) se configura en Ajustes y vive en `negocio`; el país sale de `PAISES` y define moneda, formato, prefijo telefónico y si se usa la tasa BCV. Si no hay nada guardado se usa `NEGOCIO_PREDETERMINADO` (Pachon's, Venezuela).
- Los montos se guardan como números en la moneda del país, sin conversión. Cambiar de moneda no convierte lo ya anotado (la app lo advierte).
- Saldo = ventas − pagos. Positivo: el cliente debe. Negativo: tiene **saldo a favor** (pagó de más o adelantó dinero) y se descuenta solo de sus próximas compras. Nunca esconder un saldo negativo con `Math.max(0, …)` en la interfaz: mostrarlo como "X a favor" (fila, hoja de pago, hoja de venta, resumen del toldo y estado de cuenta por WhatsApp).
- Bolívares solo en Venezuela: usar siempre `tasaActiva()` para decidir si se muestran, nunca `bcvConfig.tasa` directamente. Los elementos solo-Venezuela llevan la clase `solo-tasa`.
- Montos con `formatearMoneda()`, teléfonos con `normalizarTelefono()` y `mostrarTelefonoBonito()`. No escribir "$", "dólares" ni "+58" fijos en la interfaz.
- La interfaz va en español neutro, que sirva en Venezuela y en España.
- Vocabulario: en la interfaz se dice **"Venta"** y **"Pago"** (nunca "abono"). Internamente el tipo de movimiento sigue siendo `'abono'` y las funciones conservan su nombre (`guardarAbono`, `modalAbono`…); los movimientos viejos guardados como "Abono (...)" se muestran como "Pago (...)" con `textoMovimiento()`.
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
- Borrar sin confirmar y ofrecer "Deshacer" (`mostrarToast(msg, null, { texto: 'Deshacer', fn })`) cuando lo borrado se puede restaurar. Confirmar con diálogo solo lo grave y difícil de rehacer (borrar un cliente con su historial, borrar todos los datos, cambiar de moneda).
- Llevar al usuario a donde tiene que actuar: desplazar hasta el formulario al editar, revelar las opciones nuevas al activar un interruptor.
- Campos de monto con `onfocus="this.select()"` para escribir encima sin borrar.
- Áreas táctiles de al menos 44 px.

### Claridad total
- Una acción principal por pantalla o fila, visualmente obvia (ej. "Cobrar por WhatsApp" en verde a todo el ancho).
- Botones que dicen exactamente lo que pasa, y el aviso usa el mismo verbo ("Anotar venta" → "Venta anotada").
- Ayudas cortas debajo del campo cuando algo no es evidente ("Viene con todo lo que debe…").
- Sin efectos de vidrio ni transparencias que resten legibilidad.

### Animaciones con propósito
- Animar solo para mostrar qué cambió o responder a un toque: hojas que suben y bajan, avisos que entran y salen, la fila del cliente que se resalta tras guardar, el total que cuenta hasta el valor nuevo, el contador del producto, el historial al abrirse.
- Un solo momento de entrada al abrir la app (el toldo que se desenrolla). Nada de animaciones decorativas en cada sección.
- Efectos de un solo uso con `clienteResaltado` / `detalleQueEntra`: se consumen en el siguiente `renderizarClientes()` para que no se repitan en cada repintado.
- Abrir hojas con `abrirCapa(id)` y cerrarlas con `cerrarModal(id)` (animan la salida).
- Duraciones cortas (150–300 ms; el conteo del total ~650 ms). Respetar siempre `prefers-reduced-motion` (CSS global y `sinMovimiento()` en JS).
