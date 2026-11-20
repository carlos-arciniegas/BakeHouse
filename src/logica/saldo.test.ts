import { describe, expect, it } from 'vitest'
import {
  calcularResumenCliente, calcularResumenGlobal, estadoSaldo, filtrarClientes, fraseResumen, ordenarClientes, textoMovimiento,
} from './saldo'
import type { Cliente, Movimiento } from './tipos'

let n = 0
const venta = (monto: number): Movimiento => ({ id: 'v' + n++, tipo: 'venta', descripcion: 'Venta', monto, fecha: '2026-11-20' })
const pago = (monto: number): Movimiento => ({ id: 'p' + n++, tipo: 'abono', descripcion: 'Pago (Efectivo)', monto, fecha: '2026-11-20' })
const cliente = (nombre: string, movimientos: Movimiento[], telefono = '584121234567'): Cliente =>
  ({ id: nombre, nombre, telefono, nota: '', movimientos })

describe('calcularResumenCliente', () => {
  it('saldo = ventas − pagos', () => {
    expect(calcularResumenCliente(cliente('Ana', [venta(5.5), venta(3), pago(2)]))).toEqual({ totalVentas: 8.5, totalAbonos: 2, saldo: 6.5 })
  })

  it('no arrastra errores de coma flotante', () => {
    expect(calcularResumenCliente(cliente('Ana', [venta(0.1), venta(0.2), pago(0.3)])).saldo).toBe(0)
  })

  it('un cliente sin movimientos está en 0', () => {
    expect(calcularResumenCliente(cliente('Ana', [])).saldo).toBe(0)
  })
})

describe('estadoSaldo', () => {
  it('distingue deuda, saldo a favor y al día', () => {
    expect(estadoSaldo(6.5)).toBe('debe')
    expect(estadoSaldo(-10)).toBe('favor')
    expect(estadoSaldo(0)).toBe('al-dia')
    expect(estadoSaldo(0.004)).toBe('al-dia')
  })
})

describe('saldo a favor', () => {
  it('pagar sin deber deja saldo a favor y la siguiente compra se descuenta', () => {
    const andreina = cliente('Andreína', [pago(10)])
    expect(calcularResumenCliente(andreina).saldo).toBe(-10)
    andreina.movimientos.push(venta(4))
    expect(calcularResumenCliente(andreina).saldo).toBe(-6)
  })
})

describe('resumen global', () => {
  const clientes = [
    cliente('José', [venta(11)]),
    cliente('María', [venta(8.5), pago(2)]),
    cliente('Andreína', [venta(3.5), pago(13.5)]),
    cliente('Luis', []),
  ]

  it('suma deudas, cobros y saldos a favor por separado', () => {
    expect(calcularResumenGlobal(clientes)).toEqual({ porCobrar: 17.5, deudores: 2, cobrado: 15.5, aFavor: 10, conFavor: 1, totalClientes: 4 })
  })

  it('arma la frase del toldo', () => {
    const f = (x: number) => '$' + x.toFixed(2)
    expect(fraseResumen(calcularResumenGlobal(clientes), f))
      .toBe('2 clientes te deben, de 4. Llevas $15.50 cobrados. Guardas $10.00 a favor de 1 cliente.')
    expect(fraseResumen(calcularResumenGlobal([]), f)).toBe('Agrega tu primer cliente para empezar a anotar.')
    expect(fraseResumen(calcularResumenGlobal([cliente('Luis', [])]), f)).toBe('Nadie te debe por ahora.')
  })
})

describe('textoMovimiento', () => {
  it('muestra los pagos viejos ("Abono") como "Pago"', () => {
    expect(textoMovimiento({ ...pago(2), descripcion: 'Abono (Pago Móvil - Bs. 490,00)' })).toBe('Pago (Pago Móvil - Bs. 490,00)')
    expect(textoMovimiento(venta(2))).toBe('Venta')
  })
})

describe('ordenar y filtrar', () => {
  const clientes = [
    cliente('Carmen', [pago(5)], '34633445566'),
    cliente('Bruno', [venta(2)], '34622334455'),
    cliente('Ana', [venta(9)], '34611223344'),
    cliente('Diego', [], '34644556677'),
  ]

  it('ordena por deuda de mayor a menor', () => {
    expect(ordenarClientes(clientes).map((c) => c.nombre)).toEqual(['Ana', 'Bruno', 'Diego', 'Carmen'])
  })

  it('"Deben" solo muestra deudores; "Al día" incluye a quien tiene saldo a favor', () => {
    expect(filtrarClientes(clientes, '', 'deuda').map((c) => c.nombre)).toEqual(['Bruno', 'Ana'])
    expect(filtrarClientes(clientes, '', 'solventes').map((c) => c.nombre)).toEqual(['Carmen', 'Diego'])
  })

  it('busca por nombre o por teléfono', () => {
    expect(filtrarClientes(clientes, 'ANA', 'todos').map((c) => c.nombre)).toEqual(['Ana'])
    expect(filtrarClientes(clientes, '622', 'todos').map((c) => c.nombre)).toEqual(['Bruno'])
  })
})
