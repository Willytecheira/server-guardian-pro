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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      alert_rule_state: {
        Row: {
          last_alert_id: string | null
          rule_id: string
          server_id: string
          triggered_at: string | null
          updated_at: string
        }
        Insert: {
          last_alert_id?: string | null
          rule_id: string
          server_id: string
          triggered_at?: string | null
          updated_at?: string
        }
        Update: {
          last_alert_id?: string | null
          rule_id?: string
          server_id?: string
          triggered_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_rule_state_last_alert_id_fkey"
            columns: ["last_alert_id"]
            isOneToOne: false
            referencedRelation: "alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_rule_state_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "alert_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_rule_state_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_rules: {
        Row: {
          created_at: string
          duration_minutes: number
          enabled: boolean
          id: string
          metric: string
          name: string
          operator: string
          severity: string
          threshold: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          duration_minutes?: number
          enabled?: boolean
          id?: string
          metric: string
          name: string
          operator?: string
          severity?: string
          threshold?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          duration_minutes?: number
          enabled?: boolean
          id?: string
          metric?: string
          name?: string
          operator?: string
          severity?: string
          threshold?: number
          updated_at?: string
        }
        Relationships: []
      }
      alerts: {
        Row: {
          created_at: string
          http_check_id: string | null
          id: string
          message: string | null
          resolved: boolean
          resolved_at: string | null
          server_id: string | null
          severity: string
          title: string
        }
        Insert: {
          created_at?: string
          http_check_id?: string | null
          id?: string
          message?: string | null
          resolved?: boolean
          resolved_at?: string | null
          server_id?: string | null
          severity?: string
          title: string
        }
        Update: {
          created_at?: string
          http_check_id?: string | null
          id?: string
          message?: string | null
          resolved?: boolean
          resolved_at?: string | null
          server_id?: string | null
          severity?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_http_check_id_fkey"
            columns: ["http_check_id"]
            isOneToOne: false
            referencedRelation: "http_checks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      container_logs: {
        Row: {
          container_name: string
          id: number
          level: string | null
          message: string
          recorded_at: string
          server_id: string
        }
        Insert: {
          container_name: string
          id?: number
          level?: string | null
          message: string
          recorded_at?: string
          server_id: string
        }
        Update: {
          container_name?: string
          id?: number
          level?: string | null
          message?: string
          recorded_at?: string
          server_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "container_logs_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      docker_containers: {
        Row: {
          container_id: string
          cpu_percent: number | null
          id: string
          image: string | null
          name: string
          ram_mb: number | null
          restart_count: number | null
          server_id: string
          started_at: string | null
          state: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          container_id: string
          cpu_percent?: number | null
          id?: string
          image?: string | null
          name: string
          ram_mb?: number | null
          restart_count?: number | null
          server_id: string
          started_at?: string | null
          state?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          container_id?: string
          cpu_percent?: number | null
          id?: string
          image?: string | null
          name?: string
          ram_mb?: number | null
          restart_count?: number | null
          server_id?: string
          started_at?: string | null
          state?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "docker_containers_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      http_check_results: {
        Row: {
          check_id: string
          error: string | null
          id: number
          recorded_at: string
          response_time_ms: number | null
          status_code: number | null
          success: boolean
        }
        Insert: {
          check_id: string
          error?: string | null
          id?: number
          recorded_at?: string
          response_time_ms?: number | null
          status_code?: number | null
          success: boolean
        }
        Update: {
          check_id?: string
          error?: string | null
          id?: number
          recorded_at?: string
          response_time_ms?: number | null
          status_code?: number | null
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "http_check_results_check_id_fkey"
            columns: ["check_id"]
            isOneToOne: false
            referencedRelation: "http_checks"
            referencedColumns: ["id"]
          },
        ]
      }
      http_checks: {
        Row: {
          created_at: string
          created_by: string | null
          enabled: boolean
          expected_status: number
          id: string
          method: string
          name: string
          timeout_ms: number
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          expected_status?: number
          id?: string
          method?: string
          name: string
          timeout_ms?: number
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          expected_status?: number
          id?: string
          method?: string
          name?: string
          timeout_ms?: number
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      notification_settings: {
        Row: {
          id: number
          telegram_chat_id: string | null
          telegram_enabled: boolean
          updated_at: string
        }
        Insert: {
          id: number
          telegram_chat_id?: string | null
          telegram_enabled?: boolean
          updated_at?: string
        }
        Update: {
          id?: number
          telegram_chat_id?: string | null
          telegram_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      server_metrics: {
        Row: {
          cpu_percent: number | null
          disk_percent: number | null
          disk_total_gb: number | null
          disk_used_gb: number | null
          id: number
          load_1: number | null
          load_15: number | null
          load_5: number | null
          net_rx_bytes: number | null
          net_tx_bytes: number | null
          ram_percent: number | null
          ram_total_mb: number | null
          ram_used_mb: number | null
          recorded_at: string
          server_id: string
          uptime_seconds: number | null
        }
        Insert: {
          cpu_percent?: number | null
          disk_percent?: number | null
          disk_total_gb?: number | null
          disk_used_gb?: number | null
          id?: number
          load_1?: number | null
          load_15?: number | null
          load_5?: number | null
          net_rx_bytes?: number | null
          net_tx_bytes?: number | null
          ram_percent?: number | null
          ram_total_mb?: number | null
          ram_used_mb?: number | null
          recorded_at?: string
          server_id: string
          uptime_seconds?: number | null
        }
        Update: {
          cpu_percent?: number | null
          disk_percent?: number | null
          disk_total_gb?: number | null
          disk_used_gb?: number | null
          id?: number
          load_1?: number | null
          load_15?: number | null
          load_5?: number | null
          net_rx_bytes?: number | null
          net_tx_bytes?: number | null
          ram_percent?: number | null
          ram_total_mb?: number | null
          ram_used_mb?: number | null
          recorded_at?: string
          server_id?: string
          uptime_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "server_metrics_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      servers: {
        Row: {
          agent_version: string | null
          created_at: string
          created_by: string | null
          description: string | null
          hostname: string | null
          id: string
          ingest_token: string
          last_seen_at: string | null
          name: string
          os: string | null
          status: string
          updated_at: string
        }
        Insert: {
          agent_version?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          hostname?: string | null
          id?: string
          ingest_token?: string
          last_seen_at?: string | null
          name: string
          os?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          agent_version?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          hostname?: string | null
          id?: string
          ingest_token?: string
          last_seen_at?: string | null
          name?: string
          os?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "viewer"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "viewer"],
    },
  },
} as const
