// Generado con: npm run tipos:bd (no editar a mano)
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      clientes: {
        Row: {
          actualizado_en: string
          borrado_en: string | null
          creado_en: string
          id: string
          negocio_id: string
          nombre: string
          nota: string
          telefono: string
        }
        Insert: {
          actualizado_en?: string
          borrado_en?: string | null
          creado_en?: string
          id: string
          negocio_id: string
          nombre: string
          nota?: string
          telefono?: string
        }
        Update: {
          actualizado_en?: string
          borrado_en?: string | null
          creado_en?: string
          id?: string
          negocio_id?: string
          nombre?: string
          nota?: string
          telefono?: string
        }
        Relationships: [
          {
            foreignKeyName: "clientes_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
        ]
      }
      metodos_pago: {
        Row: {
          activo: boolean
          actualizado_en: string
          borrado_en: string | null
          creado_en: string
          datos: Json
          id: string
          negocio_id: string
          orden: number
          tipo: string
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          borrado_en?: string | null
          creado_en?: string
          datos?: Json
          id: string
          negocio_id: string
          orden?: number
          tipo: string
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          borrado_en?: string | null
          creado_en?: string
          datos?: Json
          id?: string
          negocio_id?: string
          orden?: number
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "metodos_pago_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
        ]
      }
      miembros: {
        Row: {
          creado_en: string
          negocio_id: string
          rol: string
          usuario_id: string
        }
        Insert: {
          creado_en?: string
          negocio_id: string
          rol?: string
          usuario_id: string
        }
        Update: {
          creado_en?: string
          negocio_id?: string
          rol?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "miembros_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
        ]
      }
      movimientos: {
        Row: {
          actualizado_en: string
          borrado_en: string | null
          cliente_id: string
          creado_en: string
          descripcion: string
          fecha: string
          id: string
          monto: number
          negocio_id: string
          productos: Json | null
          tipo: string
        }
        Insert: {
          actualizado_en?: string
          borrado_en?: string | null
          cliente_id: string
          creado_en?: string
          descripcion?: string
          fecha: string
          id: string
          monto: number
          negocio_id: string
          productos?: Json | null
          tipo: string
        }
        Update: {
          actualizado_en?: string
          borrado_en?: string | null
          cliente_id?: string
          creado_en?: string
          descripcion?: string
          fecha?: string
          id?: string
          monto?: number
          negocio_id?: string
          productos?: Json | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_negocio_id_cliente_id_fkey"
            columns: ["negocio_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["negocio_id", "id"]
          },
        ]
      }
      negocios: {
        Row: {
          actualizado_en: string
          creado_en: string
          id: string
          nombre: string
          pais: string
          tasa_bcv: number
          tasa_bcv_actualizada: string
        }
        Insert: {
          actualizado_en?: string
          creado_en?: string
          id?: string
          nombre: string
          pais?: string
          tasa_bcv?: number
          tasa_bcv_actualizada?: string
        }
        Update: {
          actualizado_en?: string
          creado_en?: string
          id?: string
          nombre?: string
          pais?: string
          tasa_bcv?: number
          tasa_bcv_actualizada?: string
        }
        Relationships: []
      }
      productos: {
        Row: {
          actualizado_en: string
          borrado_en: string | null
          creado_en: string
          id: string
          negocio_id: string
          nombre: string
          orden: number
          precio: number
        }
        Insert: {
          actualizado_en?: string
          borrado_en?: string | null
          creado_en?: string
          id: string
          negocio_id: string
          nombre: string
          orden?: number
          precio: number
        }
        Update: {
          actualizado_en?: string
          borrado_en?: string | null
          creado_en?: string
          id?: string
          negocio_id?: string
          nombre?: string
          orden?: number
          precio?: number
        }
        Relationships: [
          {
            foreignKeyName: "productos_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocios"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      crear_negocio: {
        Args: { nombre: string; pais?: string }
        Returns: string
      }
      es_dueno: { Args: { negocio: string }; Returns: boolean }
      es_miembro: { Args: { negocio: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
