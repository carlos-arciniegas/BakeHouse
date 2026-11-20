import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './baseDeDatos'

const url = import.meta.env.VITE_SUPABASE_URL
const clave = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

/**
 * Cliente de Supabase, o null si la app se compiló sin conexión a la nube
 * (sin VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY): entonces funciona solo en el dispositivo.
 * La clave es la pública; los permisos los controla Row Level Security en la base.
 */
export const supabase: SupabaseClient<Database> | null = url && clave
  ? createClient<Database>(url, clave, {
      auth: {
        // La sesión queda en el dispositivo y el token se renueva solo
        persistSession: true,
        autoRefreshToken: true,
        // Lee la sesión que trae el enlace mágico al volver a la app
        detectSessionInUrl: true,
      },
    })
  : null
