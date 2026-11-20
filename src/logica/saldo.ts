import type { Cliente, EstadoSaldo, Movimiento, ResumenCliente } from './tipos'

/** Margen para no tratar como deuda restos de redondeo */
const CENTAVO = 0.009

export function calcularResumenCliente(cliente: Cliente): ResumenCliente {
  let totalVentas = 0
  let totalAbonos = 0
  for (const m of cliente.movimientos ?? []) {
    if (m.tipo === 'venta') totalVentas += Number(m.monto) || 0
    if (m.tipo === 'abono') totalAbonos += Number(m.monto) || 0
  }
  const saldo = Math.round((totalVentas - totalAbonos) * 100) / 100
  return { totalVentas, totalAbonos, saldo }
}

export function estadoSaldo(saldo: number): EstadoSaldo {
  if (saldo > CENTAVO) return 'debe'
  if (saldo < -CENTAVO) return 'favor'
  return 'al-dia'
}

export interface ResumenGlobal {
  porCobrar: number
  deudores: number
  cobrado: number
  aFavor: number
  conFavor: number
  totalClientes: number
}

export function calcularResumenGlobal(clientes: Cliente[]): ResumenGlobal {
  const r: ResumenGlobal = { porCobrar: 0, deudores: 0, cobrado: 0, aFavor: 0, conFavor: 0, totalClientes: clientes.length }
  for (const c of clientes) {
    const { saldo, totalAbonos } = calcularResumenCliente(c)
    const estado = estadoSaldo(saldo)
    if (estado === 'debe') {
      r.porCobrar += saldo
      r.deudores++
    } else if (estado === 'favor') {
      r.aFavor += -saldo
      r.conFavor++
    }
    r.cobrado += totalAbonos
  }
  return r
}

/** La frase del toldo: "3 clientes te deben, de 4. Llevas $5,50 cobrados. Guardas…" */
export function fraseResumen(r: ResumenGlobal, formatear: (n: number) => string): string {
  let frase: string
  if (r.totalClientes === 0) frase = 'Agrega tu primer cliente para empezar a anotar.'
  else if (r.deudores === 0) frase = 'Nadie te debe por ahora.'
  else frase = (r.deudores === 1 ? '1 cliente te debe' : r.deudores + ' clientes te deben') + ', de ' + r.totalClientes + '.'
  if (r.cobrado > 0) frase += ' Llevas ' + formatear(r.cobrado) + ' cobrados.'
  if (r.conFavor > 0) frase += ' Guardas ' + formatear(r.aFavor) + ' a favor de ' + (r.conFavor === 1 ? '1 cliente.' : r.conFavor + ' clientes.')
  return frase
}

/** En la interfaz se dice "pago"; los movimientos viejos se guardaron como "Abono (...)" */
export function textoMovimiento(m: Movimiento): string {
  return String(m.descripcion ?? '').replace(/^Abono \(/, 'Pago (')
}

/** Clientes con más deuda primero; a igual saldo, por nombre */
export function ordenarClientes(clientes: Cliente[]): Cliente[] {
  return clientes
    .map((c) => ({ c, saldo: calcularResumenCliente(c).saldo }))
    .sort((a, b) => b.saldo - a.saldo || a.c.nombre.localeCompare(b.c.nombre))
    .map((x) => x.c)
}

export type Filtro = 'todos' | 'deuda' | 'solventes'

export function filtrarClientes(clientes: Cliente[], busqueda: string, filtro: Filtro): Cliente[] {
  const texto = busqueda.trim().toLowerCase()
  return clientes.filter((c) => {
    if (texto && !c.nombre.toLowerCase().includes(texto) && !c.telefono.includes(texto)) return false
    const estado = estadoSaldo(calcularResumenCliente(c).saldo)
    if (filtro === 'deuda') return estado === 'debe'
    if (filtro === 'solventes') return estado !== 'debe'
    return true
  })
}
