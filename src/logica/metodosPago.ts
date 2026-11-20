import type { MetodoPago, TipoPago } from './tipos'

export interface CampoPago {
  id: string
  etq: string
  ph?: string
  opcional?: boolean
  /** Tipo de input HTML */
  tipo?: 'text' | 'tel'
  /** Texto largo (textarea) */
  area?: boolean
  /** id de un <datalist> con sugerencias */
  lista?: string
}

export interface DefinicionPago {
  nombre: string
  campos: CampoPago[]
}

/**
 * Cada tipo define los campos que pide. Para agregar un método nuevo basta con una entrada aquí:
 * el formulario, la lista y el mensaje de WhatsApp se arman solos.
 */
export const TIPOS_PAGO: Record<TipoPago, DefinicionPago> = {
  transferencia: {
    nombre: 'Transferencia bancaria',
    campos: [
      { id: 'banco', etq: 'Banco', ph: 'Banco Santander' },
      { id: 'titular', etq: 'Titular', ph: 'Nombre como aparece en el banco' },
      { id: 'cuenta', etq: 'IBAN o número de cuenta', ph: 'ES12 3456 7890 1234 5678 9012' },
      { id: 'bic', etq: 'BIC/SWIFT', ph: 'BSCHESMMXXX', opcional: true },
    ],
  },
  bizum: {
    nombre: 'Bizum',
    campos: [
      { id: 'telefono', etq: 'Teléfono', ph: '+34 600 123 456', tipo: 'tel' },
      { id: 'titular', etq: 'Titular', ph: 'Nombre que verá quien te paga', opcional: true },
    ],
  },
  paypal: {
    nombre: 'PayPal',
    campos: [{ id: 'contacto', etq: 'Correo o enlace PayPal.me', ph: 'paypal.me/tunegocio' }],
  },
  pagomovil: {
    nombre: 'Pago Móvil',
    campos: [
      { id: 'banco', etq: 'Banco', ph: 'Banesco (0134)', lista: 'bancosVE' },
      { id: 'telefono', etq: 'Teléfono', ph: '0412-1234567', tipo: 'tel' },
      { id: 'documento', etq: 'Cédula o RIF', ph: 'V-25.000.000' },
      { id: 'titular', etq: 'Titular', ph: 'Nombre como aparece en el banco', opcional: true },
    ],
  },
  zelle: {
    nombre: 'Zelle',
    campos: [
      { id: 'contacto', etq: 'Correo o teléfono', ph: 'pagos@tunegocio.com' },
      { id: 'titular', etq: 'Titular', ph: 'Nombre como aparece en el banco', opcional: true },
    ],
  },
  binance: {
    nombre: 'Binance Pay',
    campos: [{ id: 'contacto', etq: 'Pay ID o correo', ph: '123456789' }],
  },
  otro: {
    nombre: 'Otro',
    campos: [
      { id: 'nombre', etq: 'Nombre del método', ph: 'Efectivo al recoger' },
      { id: 'detalle', etq: 'Datos para pagar', ph: 'Lo que tu cliente necesita saber para pagarte', area: true },
    ],
  },
}

export const BANCOS_VE = [
  'Banesco (0134)', 'Mercantil (0105)', 'Banco de Venezuela (0102)', 'BBVA Provincial (0108)',
  'Bancamiga (0172)', 'BNC (0191)', 'Bancaribe (0114)', 'Banplus (0174)', 'Banco Exterior (0115)',
]

export function esTipoPago(valor: unknown): valor is TipoPago {
  return typeof valor === 'string' && valor in TIPOS_PAGO
}

export function nombreMetodo(m: Pick<MetodoPago, 'tipo' | 'datos'>): string {
  if (m.tipo === 'otro') return m.datos?.nombre || 'Otro'
  return TIPOS_PAGO[m.tipo]?.nombre ?? 'Método de pago'
}

/** Lo que se muestra en la lista: los campos obligatorios, separados por coma */
export function resumenMetodo(m: MetodoPago): string {
  const def = TIPOS_PAGO[m.tipo]
  if (!def) return ''
  return def.campos
    .filter((c) => !c.opcional && c.id !== 'nombre')
    .map((c) => (m.datos[c.id] ?? '').trim())
    .filter(Boolean)
    .join(', ')
}

/** El primer campo obligatorio vacío, para avisar qué falta */
export function campoFaltante(tipo: TipoPago, datos: Record<string, string>): CampoPago | undefined {
  return TIPOS_PAGO[tipo].campos.find((c) => !c.opcional && !(datos[c.id] ?? '').trim())
}

/** El bloque "Formas de pago" que va al final de los cobros por WhatsApp */
export function construirBloquePagos(metodos: MetodoPago[]): string {
  const activos = metodos.filter((m) => m.activo && TIPOS_PAGO[m.tipo])
  if (activos.length === 0) return ''

  let bloque = '💳 *Formas de pago:*'
  for (const m of activos) {
    bloque += '\n\n*' + nombreMetodo(m) + '*'
    for (const c of TIPOS_PAGO[m.tipo].campos) {
      if (c.id === 'nombre') continue
      const valor = (m.datos[c.id] ?? '').trim()
      if (!valor) continue
      // Correo, Pay ID o enlace se entienden solos: van sin etiqueta
      bloque += c.area ? '\n' + valor : '\n• ' + (c.id === 'contacto' ? '' : c.etq + ': ') + valor
    }
  }
  return bloque
}

/** Opciones de "Cómo pagó": tus métodos (sin repetir) más efectivo */
export function opcionesDePago(metodos: MetodoPago[]): string[] {
  const nombres = metodos.map(nombreMetodo)
  if (!nombres.includes('Efectivo')) nombres.push('Efectivo')
  return [...new Set(nombres)]
}

/** La configuración vieja de Pago Móvil (un solo objeto) se convierte en un método de la lista */
export interface PagoMovilAntiguo {
  banco?: string
  bancoOtro?: string
  telefono?: string
  cedula?: string
  titular?: string
  incluirEnMensaje?: boolean
}

export function migrarPagoMovil(pm: PagoMovilAntiguo | null | undefined, id = 'met_' + Date.now()): MetodoPago[] {
  if (!pm || !pm.telefono || !pm.cedula) return []
  return [{
    id,
    tipo: 'pagomovil',
    datos: {
      banco: pm.banco === 'Otro' ? (pm.bancoOtro ?? '') : (pm.banco ?? ''),
      telefono: pm.telefono,
      documento: pm.cedula,
      titular: pm.titular ?? '',
    },
    activo: pm.incluirEnMensaje !== false,
  }]
}
