// Tipos del dominio. Los nombres y la forma de los datos coinciden con lo que la
// versión anterior guardaba en localStorage, para que los datos existentes sigan sirviendo.

/** 'abono' es el nombre interno de un pago; en la interfaz se dice "Pago". */
export type TipoMovimiento = 'venta' | 'abono'

export interface Movimiento {
  id: string
  tipo: TipoMovimiento
  descripcion: string
  /** En la moneda del país del negocio */
  monto: number
  /** Fecha local en formato AAAA-MM-DD */
  fecha: string
  /** Productos de la venta cuando se armó desde el catálogo (para reportes) */
  productos?: LineaVenta[]
}

export interface LineaVenta {
  nombre: string
  cantidad: number
  /** Precio unitario al momento de la venta */
  precio: number
}

export interface Cliente {
  id: string
  nombre: string
  /** Solo dígitos, con código de país (lo que pide wa.me) */
  telefono: string
  nota: string
  movimientos: Movimiento[]
}

export interface Producto {
  /** Fijo, para poder sincronizar; los productos viejos lo reciben al cargar */
  id: string
  nombre: string
  precio: number
}

export type CodigoPais = 'VE' | 'ES' | 'PT' | 'IT' | 'FR' | 'DE' | 'GB' | 'US'
export type CodigoMoneda = 'USD' | 'EUR' | 'GBP'

export interface Pais {
  nombre: string
  moneda: CodigoMoneda
  /** Locale para formatear números y monedas */
  locale: string
  /** Código telefónico sin "+" */
  prefijo: string
  /** Dígito que se quita al agregar el prefijo (el 0 inicial en Venezuela, Francia…) */
  troncal: string
  /** Dígitos del número nacional, sin prefijo ni troncal */
  largo: number
  ejemploTel: string
  /** Solo Venezuela: muestra bolívares con la tasa del BCV */
  tasaBCV?: boolean
}

export interface Negocio {
  nombre: string
  pais: CodigoPais
}

export interface ConfigBCV {
  tasa: number
  actualizado: string
}

export type TipoPago = 'transferencia' | 'bizum' | 'paypal' | 'pagomovil' | 'zelle' | 'binance' | 'otro'

export interface MetodoPago {
  id: string
  tipo: TipoPago
  datos: Record<string, string>
  /** Si se agrega al final de los cobros por WhatsApp */
  activo: boolean
}

export interface ResumenCliente {
  totalVentas: number
  totalAbonos: number
  /** Ventas − pagos. Positivo: debe. Negativo: tiene saldo a favor. */
  saldo: number
}

export type EstadoSaldo = 'debe' | 'favor' | 'al-dia'
