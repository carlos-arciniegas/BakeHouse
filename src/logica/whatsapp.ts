import { formatearFechaCorta } from './fechas'
import { construirBloquePagos } from './metodosPago'
import { convertirABolivares, formatearBolivares, formatearMoneda, tasaActiva } from './moneda'
import { calcularResumenCliente, estadoSaldo, textoMovimiento } from './saldo'
import type { Cliente, MetodoPago, Negocio, Pais } from './tipos'

/** Todo lo que un mensaje necesita saber del negocio */
export interface ContextoMensaje {
  negocio: Negocio
  pais: Pais
  tasa: number
  metodos: MetodoPago[]
}

function primerNombre(cliente: Cliente): string {
  return cliente.nombre.trim().split(' ')[0]
}

function conBolivares(monto: number, ctx: ContextoMensaje): string {
  if (!tasaActiva(ctx.pais, ctx.tasa)) return ''
  return ' (*' + formatearBolivares(convertirABolivares(monto, ctx.tasa)) + '* a tasa BCV ' + formatearBolivares(ctx.tasa) + ')'
}

/** Recordatorio de cobro con las últimas 3 ventas y las formas de pago activas */
export function mensajeCobro(cliente: Cliente, ctx: ContextoMensaje): string {
  const { saldo } = calcularResumenCliente(cliente)
  const moneda = (n: number) => formatearMoneda(n, ctx.pais)

  const ventas = cliente.movimientos.filter((m) => m.tipo === 'venta').slice(-3)
  const detalle = ventas.length
    ? '\n\n*Detalle reciente:*\n' + ventas.map((v) => '• ' + v.descripcion + ' (' + moneda(v.monto) + ')').join('\n')
    : ''

  const bloque = construirBloquePagos(ctx.metodos)

  return '¡Hola ' + primerNombre(cliente) + '! 👋 Te escribo de *' + ctx.negocio.nombre + '* 🍪✨ para comentarte que ' +
    'tu saldo pendiente actual es de *' + moneda(saldo) + '*' + conBolivares(saldo, ctx) + '.' +
    detalle + (bloque ? '\n\n' + bloque : '') +
    '\n\n¡Avísame cualquier cosa o si deseas pedir algún otro dulce! 🤎'
}

/** Estado de cuenta con los últimos 10 movimientos y el saldo (pendiente o a favor) */
export function mensajeEstadoCuenta(cliente: Cliente, ctx: ContextoMensaje): string {
  const { saldo } = calcularResumenCliente(cliente)
  const moneda = (n: number) => formatearMoneda(n, ctx.pais)

  const movs = cliente.movimientos.slice(-10)
  const cuerpo = movs.length
    ? movs.map((m) => (m.tipo === 'venta' ? '➕' : '✅') + ' ' + formatearFechaCorta(m.fecha) + ' - ' + textoMovimiento(m) + ': *' + moneda(m.monto) + '*').join('\n')
    : 'Sin movimientos registrados aún.'

  const estado = estadoSaldo(saldo)
  const lineaSaldo = estado === 'favor'
    ? '*Saldo a favor:* ' + moneda(-saldo) + '. Se descuenta de tu próxima compra.'
    : '*Saldo pendiente:* ' + moneda(Math.max(0, saldo)) + (estado === 'debe' ? conBolivares(saldo, ctx) : '')

  const bloque = estado === 'debe' ? construirBloquePagos(ctx.metodos) : ''

  return '¡Hola ' + primerNombre(cliente) + '! 🍪 Aquí tienes tu *Estado de Cuenta* en *' + ctx.negocio.nombre + '*:\n\n' +
    cuerpo + '\n\n' + lineaSaldo + (bloque ? '\n\n' + bloque : '') + '\n\n¡Gracias por preferirnos! ✨'
}

/**
 * Enlace que abre WhatsApp con el mensaje listo.
 * Se usa api.whatsapp.com/send y no wa.me: wa.me redirige a esta misma dirección y en el
 * camino cambia los emojis por "�". Con el enlace directo llegan intactos.
 */
export function enlaceWhatsApp(telefono: string, mensaje: string): string {
  return 'https://api.whatsapp.com/send?phone=' + telefono + '&text=' + encodeURIComponent(mensaje)
}
