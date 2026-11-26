import { describe, expect, it } from 'vitest'
import { PAISES } from './paises'
import type { Cliente, MetodoPago } from './tipos'
import { enlaceWhatsApp, mensajeCobro, mensajeEstadoCuenta, PLANTILLA_COBRO_PREDETERMINADA, type ContextoMensaje } from './whatsapp'

const plano = (s: string) => s.replace(/[  ]/g, ' ')

const bizum: MetodoPago = { id: 'm1', tipo: 'bizum', activo: true, datos: { telefono: '+34 611 22 33 44', titular: '' } }

const maria: Cliente = {
  id: 'c1', nombre: 'María Fernanda Pérez', telefono: '584121234567', nota: '',
  movimientos: [
    { id: 'a', tipo: 'venta', descripcion: '2x Galleta', monto: 3, fecha: '2026-11-12' },
    { id: 'b', tipo: 'venta', descripcion: '1x Brownie', monto: 2.5, fecha: '2026-11-15' },
    { id: 'c', tipo: 'abono', descripcion: 'Abono (Efectivo)', monto: 2, fecha: '2026-11-18' },
  ],
}

const venezuela: ContextoMensaje = { negocio: { nombre: "Pachon's Bakehouse", pais: 'VE' }, pais: PAISES.VE, tasa: 100, metodos: [] }
const espana: ContextoMensaje = { negocio: { nombre: 'Dulce Mila', pais: 'ES' }, pais: PAISES.ES, tasa: 100, metodos: [bizum] }

describe('mensajeCobro', () => {
  it('en Venezuela incluye el monto en bolívares con la tasa BCV', () => {
    const msg = plano(mensajeCobro(maria, venezuela))
    expect(msg).toContain('¡Hola María! 👋 Te escribo de *Pachon\'s Bakehouse*')
    expect(msg).toContain('tu saldo pendiente actual es de *$3,50* (*Bs. 350,00* a tasa BCV Bs. 100,00).')
    expect(msg).toContain('*Detalle reciente:*\n• 2x Galleta ($3,00)\n• 1x Brownie ($2,50)')
  })

  it('en España usa euros, no menciona bolívares y agrega las formas de pago', () => {
    const msg = plano(mensajeCobro(maria, espana))
    expect(msg).toContain('Te escribo de *Dulce Mila*')
    expect(msg).toContain('es de *3,50 €*.')
    expect(msg).not.toContain('Bs.')
    expect(msg).toContain('💳 *Formas de pago:*\n\n*Bizum*\n• Teléfono: +34 611 22 33 44')
  })

  it('usa la plantilla personalizada reemplazando todas las etiquetas y colapsando saltos vacíos', () => {
    const plantilla = 'Hola {cliente} ({negocio}) debes {saldo} — repito {saldo}.\n\n{detalle}\n\n{pagos}\n\nGracias {cliente}.'
    const msg = plano(mensajeCobro(maria, { ...venezuela, plantillaCobro: plantilla }))
    expect(msg).toContain("Hola María (Pachon's Bakehouse) debes *$3,50* (*Bs. 350,00* a tasa BCV Bs. 100,00) — repito *$3,50* (*Bs. 350,00* a tasa BCV Bs. 100,00).")
    expect(msg).toContain('*Detalle reciente:*\n• 2x Galleta ($3,00)\n• 1x Brownie ($2,50)\n\nGracias María.')
    expect(msg).not.toContain('\n\n\n')
  })

  it('si la plantilla está vacía o solo con espacios usa la predeterminada', () => {
    expect(mensajeCobro(maria, { ...venezuela, plantillaCobro: '   \n ' }))
      .toBe(mensajeCobro(maria, { ...venezuela, plantillaCobro: PLANTILLA_COBRO_PREDETERMINADA }))
  })
})

describe('mensajeEstadoCuenta', () => {
  it('lista los movimientos con los pagos viejos como "Pago"', () => {
    const msg = plano(mensajeEstadoCuenta(maria, venezuela))
    expect(msg).toContain('➕ 12/11/26 - 2x Galleta: *$3,00*')
    expect(msg).toContain('✅ 18/11/26 - Pago (Efectivo): *$2,00*')
    expect(msg).toContain('*Saldo pendiente:* $3,50 (*Bs. 350,00*')
  })

  it('con saldo a favor lo dice y no pide pago', () => {
    const conFavor: Cliente = { ...maria, movimientos: [{ id: 'p', tipo: 'abono', descripcion: 'Pago (Bizum)', monto: 10, fecha: '2026-11-20' }] }
    const msg = plano(mensajeEstadoCuenta(conFavor, espana))
    expect(msg).toContain('*Saldo a favor:* 10,00 €. Se descuenta de tu próxima compra.')
    expect(msg).not.toContain('Formas de pago')
  })

  it('sin movimientos lo indica', () => {
    expect(mensajeEstadoCuenta({ ...maria, movimientos: [] }, venezuela)).toContain('Sin movimientos registrados aún.')
  })
})

describe('enlaceWhatsApp', () => {
  it('codifica el mensaje para WhatsApp', () => {
    expect(enlaceWhatsApp('584121234567', '¡Hola! *$3*')).toBe('https://api.whatsapp.com/send?phone=584121234567&text=%C2%A1Hola!%20*%243*')
  })

  it('no usa wa.me, que cambia los emojis por "�" al redirigir', () => {
    const enlace = enlaceWhatsApp('584121234567', 'Hola 👋 🍪✨')
    expect(enlace).not.toContain('wa.me')
    // Los emojis viajan codificados en UTF-8 y vuelven intactos
    expect(decodeURIComponent(new URL(enlace).searchParams.get('text')!)).toBe('Hola 👋 🍪✨')
    expect(enlace).toContain('%F0%9F%91%8B')
  })
})
