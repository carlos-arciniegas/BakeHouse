import { formatearFechaCorta } from './fechas'
import { construirBloquePagos } from './metodosPago'
import { convertirABolivares, formatearBolivares, formatearMoneda, tasaActiva } from './moneda'
import { calcularResumenCliente, estadoSaldo, textoMovimiento } from './saldo'
import type { Cliente, MetodoPago, Movimiento, Negocio, Pais } from './tipos'

/** Todo lo que un mensaje necesita saber del negocio */
export interface ContextoMensaje {
  negocio: Negocio
  pais: Pais
  tasa: number
  metodos: MetodoPago[]
  plantillaCobro?: string
}

export const PLANTILLA_COBRO_PREDETERMINADA =
  '¡Hola {cliente}! 👋 Te escribo de *{negocio}* 🍪✨ para comentarte que tu saldo pendiente actual es de {saldo}.\n\n{detalle}\n\n{pagos}\n\n¡Avísame cualquier cosa o si deseas pedir algún otro dulce! 🤎'

export const VARIABLES_COBRO = [
  { codigo: '{cliente}', etiqueta: 'Nombre' },
  { codigo: '{saldo}', etiqueta: 'Saldo' },
  { codigo: '{detalle}', etiqueta: 'Últimas ventas' },
  { codigo: '{pagos}', etiqueta: 'Formas de pago' },
  { codigo: '{negocio}', etiqueta: 'Negocio' },
] as const

export const CLIENTE_VISTA_PREVIA: Cliente = {
  id: 'vista_previa',
  nombre: 'María',
  telefono: '',
  nota: '',
  movimientos: [
    { id: 'vp_1', tipo: 'venta', descripcion: '2x Galleta Choco Chip', monto: 3, fecha: '2026-11-20' },
    { id: 'vp_2', tipo: 'venta', descripcion: '1x Brownie', monto: 2.5, fecha: '2026-11-22' },
  ],
}

function primerNombre(cliente: Cliente): string {
  return cliente.nombre.trim().split(' ')[0]
}

function conBolivares(monto: number, ctx: ContextoMensaje): string {
  if (!tasaActiva(ctx.pais, ctx.tasa)) return ''
  return ' (*' + formatearBolivares(convertirABolivares(monto, ctx.tasa)) + '* a tasa BCV ' + formatearBolivares(ctx.tasa) + ')'
}

const CENTAVO = 0.009

/** Ventas todavía no cubiertas por los pagos del cliente (los pagos cubren primero las más antiguas) */
export function ventasPendientes(cliente: Cliente): Movimiento[] {
  const { totalAbonos } = calcularResumenCliente(cliente)
  let porCubrir = totalAbonos
  const pendientes: Movimiento[] = []

  for (const m of cliente.movimientos ?? []) {
    if (m.tipo !== 'venta') continue
    const monto = Number(m.monto) || 0
    if (porCubrir + CENTAVO >= monto) {
      porCubrir = Math.max(0, Math.round((porCubrir - monto) * 100) / 100)
      continue
    }
    porCubrir = 0
    pendientes.push(m)
  }
  return pendientes
}

/** Recordatorio de cobro con las últimas 3 ventas pendientes y las formas de pago activas */
export function mensajeCobro(cliente: Cliente, ctx: ContextoMensaje): string {
  const { saldo } = calcularResumenCliente(cliente)
  const moneda = (n: number) => formatearMoneda(n, ctx.pais)

  const ventas = ventasPendientes(cliente).slice(-3)
  const detalle = ventas.length
    ? '*Detalle reciente:*\n' + ventas.map((v) => '• ' + v.descripcion + ' (' + moneda(v.monto) + ')').join('\n')
    : ''

  const valores: Record<string, string> = {
    cliente: primerNombre(cliente),
    negocio: ctx.negocio.nombre,
    saldo: '*' + moneda(saldo) + '*' + conBolivares(saldo, ctx),
    detalle,
    pagos: construirBloquePagos(ctx.metodos),
  }

  const plantilla = ctx.plantillaCobro?.trim() ? ctx.plantillaCobro : PLANTILLA_COBRO_PREDETERMINADA
  return plantilla
    .replace(/\{(cliente|negocio|saldo|detalle|pagos)\}/g, (_, clave: string) => valores[clave])
    .replace(/\n{3,}/g, '\n\n')
    .trim()
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
