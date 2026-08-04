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
      customers: {
        Row: {
          active: boolean
          cc_emails: string[] | null
          created_at: string
          email: string | null
          enabled: boolean
          id: string
          key: string
          last_email_sent_at: string | null
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          cc_emails?: string[] | null
          created_at?: string
          email?: string | null
          enabled?: boolean
          id?: string
          key: string
          last_email_sent_at?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          cc_emails?: string[] | null
          created_at?: string
          email?: string | null
          enabled?: boolean
          id?: string
          key?: string
          last_email_sent_at?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      edit_requests: {
        Row: {
          changes: Json
          created_at: string
          id: string
          requested_by: string
          requested_by_name: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          summary: string | null
          target_id: string | null
          target_table: string
        }
        Insert: {
          changes: Json
          created_at?: string
          id?: string
          requested_by: string
          requested_by_name?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          summary?: string | null
          target_id?: string | null
          target_table: string
        }
        Update: {
          changes?: Json
          created_at?: string
          id?: string
          requested_by?: string
          requested_by_name?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          summary?: string | null
          target_id?: string | null
          target_table?: string
        }
        Relationships: []
      }
      email_jobs: {
        Row: {
          attachment_name: string | null
          batch_id: string
          cc_emails: string[] | null
          created_at: string
          created_by: string | null
          customer_email: string | null
          customer_id: string | null
          customer_name: string
          error: string | null
          id: string
          job_count: number | null
          provider: string | null
          resend_message_id: string | null
          scheduled_for: string | null
          sent_at: string | null
          status: string
          subject: string | null
          week_start: string
        }
        Insert: {
          attachment_name?: string | null
          batch_id: string
          cc_emails?: string[] | null
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name: string
          error?: string | null
          id?: string
          job_count?: number | null
          provider?: string | null
          resend_message_id?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          week_start: string
        }
        Update: {
          attachment_name?: string | null
          batch_id?: string
          cc_emails?: string[] | null
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string
          error?: string | null
          id?: string
          job_count?: number | null
          provider?: string | null
          resend_message_id?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_jobs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_notes: {
        Row: {
          author_id: string | null
          author_name: string | null
          created_at: string
          id: string
          kpi_key: string
          note: string
          week_start: string
        }
        Insert: {
          author_id?: string | null
          author_name?: string | null
          created_at?: string
          id?: string
          kpi_key: string
          note: string
          week_start: string
        }
        Update: {
          author_id?: string | null
          author_name?: string | null
          created_at?: string
          id?: string
          kpi_key?: string
          note?: string
          week_start?: string
        }
        Relationships: []
      }
      kpi_targets: {
        Row: {
          auto: boolean
          cadence: string | null
          created_at: string
          direction: string
          green_min: number
          id: string
          kpi_key: string
          label: string
          owner: string | null
          sort_order: number
          target_display: string | null
          unit: string | null
          yellow_min: number
        }
        Insert: {
          auto?: boolean
          cadence?: string | null
          created_at?: string
          direction?: string
          green_min: number
          id?: string
          kpi_key: string
          label: string
          owner?: string | null
          sort_order?: number
          target_display?: string | null
          unit?: string | null
          yellow_min: number
        }
        Update: {
          auto?: boolean
          cadence?: string | null
          created_at?: string
          direction?: string
          green_min?: number
          id?: string
          kpi_key?: string
          label?: string
          owner?: string | null
          sort_order?: number
          target_display?: string | null
          unit?: string | null
          yellow_min?: number
        }
        Relationships: []
      }
      kpi_values: {
        Row: {
          actual: number | null
          created_at: string
          entered_by: string | null
          id: string
          kpi_key: string
          source: string
          week_start: string
        }
        Insert: {
          actual?: number | null
          created_at?: string
          entered_by?: string | null
          id?: string
          kpi_key: string
          source?: string
          week_start: string
        }
        Update: {
          actual?: number | null
          created_at?: string
          entered_by?: string | null
          id?: string
          kpi_key?: string
          source?: string
          week_start?: string
        }
        Relationships: []
      }
      open_jobs: {
        Row: {
          address: string | null
          age_days: number | null
          created_at: string
          customer_key: string
          customer_name: string
          details: Json | null
          id: string
          job_no: string | null
          last_activity: string | null
          notes: string | null
          order_type: string | null
          status: string | null
          technician: string | null
          ticket_no: string | null
          upload_id: string
          week_start: string
        }
        Insert: {
          address?: string | null
          age_days?: number | null
          created_at?: string
          customer_key: string
          customer_name: string
          details?: Json | null
          id?: string
          job_no?: string | null
          last_activity?: string | null
          notes?: string | null
          order_type?: string | null
          status?: string | null
          technician?: string | null
          ticket_no?: string | null
          upload_id: string
          week_start: string
        }
        Update: {
          address?: string | null
          age_days?: number | null
          created_at?: string
          customer_key?: string
          customer_name?: string
          details?: Json | null
          id?: string
          job_no?: string | null
          last_activity?: string | null
          notes?: string | null
          order_type?: string | null
          status?: string | null
          technician?: string | null
          ticket_no?: string | null
          upload_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "open_jobs_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "report_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      page_permissions: {
        Row: {
          can_edit: boolean
          can_view: boolean
          created_at: string
          id: string
          page: string
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          page: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          page?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      report_uploads: {
        Row: {
          created_at: string
          effective_from: string | null
          effective_to: string | null
          error_details: Json | null
          errors_count: number | null
          file_name: string | null
          file_path: string | null
          id: string
          kind: Database["public"]["Enums"]["report_kind"]
          processing_ms: number | null
          row_count: number | null
          rows_skipped: number | null
          status: string | null
          uploaded_by: string | null
          week_start: string
        }
        Insert: {
          created_at?: string
          effective_from?: string | null
          effective_to?: string | null
          error_details?: Json | null
          errors_count?: number | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          kind: Database["public"]["Enums"]["report_kind"]
          processing_ms?: number | null
          row_count?: number | null
          rows_skipped?: number | null
          status?: string | null
          uploaded_by?: string | null
          week_start: string
        }
        Update: {
          created_at?: string
          effective_from?: string | null
          effective_to?: string | null
          error_details?: Json | null
          errors_count?: number | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["report_kind"]
          processing_ms?: number | null
          row_count?: number | null
          rows_skipped?: number | null
          status?: string | null
          uploaded_by?: string | null
          week_start?: string
        }
        Relationships: []
      }
      tickets: {
        Row: {
          city: string | null
          created_at: string
          customer: string | null
          customer_id_ext: string | null
          date_recv: string | null
          final_edited_by: string | null
          id: string
          job_no: string | null
          kind: Database["public"]["Enums"]["ticket_kind"]
          order_category: string | null
          order_type: string | null
          raw: Json | null
          rental_start: string | null
          status: string | null
          ticket_id: string | null
          ticket_no: string | null
          type: string | null
          upload_id: string
          void_reason: string | null
          week_start: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          customer?: string | null
          customer_id_ext?: string | null
          date_recv?: string | null
          final_edited_by?: string | null
          id?: string
          job_no?: string | null
          kind: Database["public"]["Enums"]["ticket_kind"]
          order_category?: string | null
          order_type?: string | null
          raw?: Json | null
          rental_start?: string | null
          status?: string | null
          ticket_id?: string | null
          ticket_no?: string | null
          type?: string | null
          upload_id: string
          void_reason?: string | null
          week_start: string
        }
        Update: {
          city?: string | null
          created_at?: string
          customer?: string | null
          customer_id_ext?: string | null
          date_recv?: string | null
          final_edited_by?: string | null
          id?: string
          job_no?: string | null
          kind?: Database["public"]["Enums"]["ticket_kind"]
          order_category?: string | null
          order_type?: string | null
          raw?: Json | null
          rental_start?: string | null
          status?: string | null
          ticket_id?: string | null
          ticket_no?: string | null
          type?: string | null
          upload_id?: string
          void_reason?: string | null
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "report_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      upload_delete_requests: {
        Row: {
          created_at: string
          id: string
          reason: string | null
          requested_by: string
          requested_by_name: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          upload_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason?: string | null
          requested_by: string
          requested_by_name?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          upload_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string | null
          requested_by?: string
          requested_by_name?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          upload_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "upload_delete_requests_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "report_uploads"
            referencedColumns: ["id"]
          },
        ]
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
      ensure_demo_data: { Args: never; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user" | "super_admin"
      report_kind:
        | "total_tickets"
        | "total_invoiced"
        | "active_review_final"
        | "ticket_qc"
        | "total_cycle_time"
        | "open_jobs"
      ticket_kind: "tickets" | "invoiced"
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
      app_role: ["admin", "user", "super_admin"],
      report_kind: [
        "total_tickets",
        "total_invoiced",
        "active_review_final",
        "ticket_qc",
        "total_cycle_time",
        "open_jobs",
      ],
      ticket_kind: ["tickets", "invoiced"],
    },
  },
} as const
