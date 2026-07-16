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
      admission_leads: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          last_activity_at: string
          next_step: string | null
          owner_id: string | null
          phone: string | null
          probability: number
          program_interest: string
          source: string
          stage: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          last_activity_at?: string
          next_step?: string | null
          owner_id?: string | null
          phone?: string | null
          probability?: number
          program_interest: string
          source: string
          stage?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          last_activity_at?: string
          next_step?: string | null
          owner_id?: string | null
          phone?: string | null
          probability?: number
          program_interest?: string
          source?: string
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admission_leads_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_audit_logs: {
        Row: {
          context_fields: string[]
          created_at: string
          id: string
          latency_ms: number | null
          model: string
          outcome: string
          output_citations: string[]
          student_id: string | null
          use_case: string
          user_id: string
        }
        Insert: {
          context_fields?: string[]
          created_at?: string
          id?: string
          latency_ms?: number | null
          model: string
          outcome: string
          output_citations?: string[]
          student_id?: string | null
          use_case: string
          user_id: string
        }
        Update: {
          context_fields?: string[]
          created_at?: string
          id?: string
          latency_ms?: number | null
          model?: string
          outcome?: string
          output_citations?: string[]
          student_id?: string | null
          use_case?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_audit_logs_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_success_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_audit_logs_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_recipients: {
        Row: {
          campaign_id: string
          delivered_at: string | null
          delivery_status: string
          opened_at: string | null
          student_id: string
        }
        Insert: {
          campaign_id: string
          delivered_at?: string | null
          delivery_status?: string
          opened_at?: string | null
          student_id: string
        }
        Update: {
          campaign_id?: string
          delivered_at?: string | null
          delivery_status?: string
          opened_at?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_success_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          audience_definition: Json
          channel: string
          created_at: string
          created_by: string | null
          id: string
          message_template: string
          name: string
          scheduled_for: string | null
          status: string
          updated_at: string
        }
        Insert: {
          audience_definition?: Json
          channel: string
          created_at?: string
          created_by?: string | null
          id?: string
          message_template?: string
          name: string
          scheduled_for?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          audience_definition?: Json
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          message_template?: string
          name?: string
          scheduled_for?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          case_number: number
          category: string
          created_at: string
          description: string
          due_at: string | null
          id: string
          owner_id: string | null
          priority: string
          resolved_at: string | null
          status: string
          student_id: string
          title: string
          updated_at: string
        }
        Insert: {
          case_number?: never
          category: string
          created_at?: string
          description?: string
          due_at?: string | null
          id?: string
          owner_id?: string | null
          priority?: string
          resolved_at?: string | null
          status?: string
          student_id: string
          title: string
          updated_at?: string
        }
        Update: {
          case_number?: never
          category?: string
          created_at?: string
          description?: string
          due_at?: string | null
          id?: string
          owner_id?: string | null
          priority?: string
          resolved_at?: string | null
          status?: string
          student_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cases_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_success_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_tasks: {
        Row: {
          assigned_to: string
          case_id: string | null
          completed_at: string | null
          created_at: string
          due_at: string | null
          id: string
          priority: string
          student_id: string | null
          title: string
        }
        Insert: {
          assigned_to: string
          case_id?: string | null
          completed_at?: string | null
          created_at?: string
          due_at?: string | null
          id?: string
          priority?: string
          student_id?: string | null
          title: string
        }
        Update: {
          assigned_to?: string
          case_id?: string | null
          completed_at?: string | null
          created_at?: string
          due_at?: string | null
          id?: string
          priority?: string
          student_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_tasks_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_tasks_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_success_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_tasks_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      interactions: {
        Row: {
          actor_id: string | null
          created_at: string
          id: string
          interaction_type: string
          occurred_at: string
          student_id: string
          subject: string
          summary: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: string
          interaction_type: string
          occurred_at?: string
          student_id: string
          subject: string
          summary: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: string
          interaction_type?: string
          occurred_at?: string
          student_id?: string
          subject?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "interactions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_success_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_articles: {
        Row: {
          category: string
          content: string
          created_at: string
          embedding: string | null
          id: string
          owner_id: string | null
          review_due_at: string | null
          search_document: unknown
          source_url: string | null
          status: string
          summary: string
          title: string
          updated_at: string
          usage_count: number
          verified_at: string | null
        }
        Insert: {
          category: string
          content: string
          created_at?: string
          embedding?: string | null
          id?: string
          owner_id?: string | null
          review_due_at?: string | null
          search_document?: unknown
          source_url?: string | null
          status?: string
          summary: string
          title: string
          updated_at?: string
          usage_count?: number
          verified_at?: string | null
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          owner_id?: string | null
          review_due_at?: string | null
          search_document?: unknown
          source_url?: string | null
          status?: string
          summary?: string
          title?: string
          updated_at?: string
          usage_count?: number
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_articles_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          department: string | null
          full_name: string
          id: string
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          department?: string | null
          full_name: string
          id: string
          role?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          department?: string | null
          full_name?: string
          id?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      student_signals: {
        Row: {
          created_at: string
          detail: string
          id: string
          label: string
          observed_at: string
          resolved_at: string | null
          severity: string
          signal_type: string
          source_system: string
          student_id: string
        }
        Insert: {
          created_at?: string
          detail: string
          id?: string
          label: string
          observed_at?: string
          resolved_at?: string | null
          severity: string
          signal_type: string
          source_system: string
          student_id: string
        }
        Update: {
          created_at?: string
          detail?: string
          id?: string
          label?: string
          observed_at?: string
          resolved_at?: string | null
          severity?: string
          signal_type?: string
          source_system?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_signals_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_success_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_signals_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          advisor_id: string | null
          attendance_percent: number
          created_at: string
          email: string | null
          engagement_score: number
          full_name: string
          gpa: number
          id: string
          last_contact_at: string | null
          next_best_action: string | null
          outstanding_balance: number
          phone: string | null
          preferred_name: string | null
          profile_id: string | null
          program: string
          risk_level: string
          risk_score: number
          student_number: string
          tags: string[]
          updated_at: string
          year_level: string
        }
        Insert: {
          advisor_id?: string | null
          attendance_percent?: number
          created_at?: string
          email?: string | null
          engagement_score?: number
          full_name: string
          gpa?: number
          id?: string
          last_contact_at?: string | null
          next_best_action?: string | null
          outstanding_balance?: number
          phone?: string | null
          preferred_name?: string | null
          profile_id?: string | null
          program: string
          risk_level?: string
          risk_score?: number
          student_number: string
          tags?: string[]
          updated_at?: string
          year_level: string
        }
        Update: {
          advisor_id?: string | null
          attendance_percent?: number
          created_at?: string
          email?: string | null
          engagement_score?: number
          full_name?: string
          gpa?: number
          id?: string
          last_contact_at?: string | null
          next_best_action?: string | null
          outstanding_balance?: number
          phone?: string | null
          preferred_name?: string | null
          profile_id?: string | null
          program?: string
          risk_level?: string
          risk_score?: number
          student_number?: string
          tags?: string[]
          updated_at?: string
          year_level?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_advisor_id_fkey"
            columns: ["advisor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      student_success_summary: {
        Row: {
          active_signal_count: number | null
          attendance_percent: number | null
          engagement_score: number | null
          full_name: string | null
          gpa: number | null
          id: string | null
          next_best_action: string | null
          open_case_count: number | null
          program: string | null
          risk_level: string | null
          risk_score: number | null
          student_number: string | null
          year_level: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      claim_initial_admin: { Args: never; Returns: boolean }
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
    Enums: {},
  },
} as const
