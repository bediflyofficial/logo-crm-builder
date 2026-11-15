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
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json
          entity_id: string | null
          entity_type: string
          id: string
          organization_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type: string
          id?: string
          organization_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type?: string
          id?: string
          organization_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_ups: {
        Row: {
          assigned_to: string
          completed_at: string | null
          created_at: string
          created_by: string
          id: string
          lead_id: string
          note: string
          organization_id: string
          scheduled_at: string
          updated_at: string
        }
        Insert: {
          assigned_to: string
          completed_at?: string | null
          created_at?: string
          created_by: string
          id?: string
          lead_id: string
          note?: string
          organization_id: string
          scheduled_at: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          lead_id?: string
          note?: string
          organization_id?: string
          scheduled_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_ups_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_activities: {
        Row: {
          activity_type: string
          created_at: string
          description: string
          details: Json
          id: string
          lead_id: string
          organization_id: string
          user_id: string | null
        }
        Insert: {
          activity_type: string
          created_at?: string
          description: string
          details?: Json
          id?: string
          lead_id: string
          organization_id: string
          user_id?: string | null
        }
        Update: {
          activity_type?: string
          created_at?: string
          description?: string
          details?: Json
          id?: string
          lead_id?: string
          organization_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_notes: {
        Row: {
          content: string
          created_at: string
          id: string
          lead_id: string
          organization_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          lead_id: string
          organization_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          lead_id?: string
          organization_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_statuses: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          is_terminal: boolean
          name: string
          organization_id: string
          position: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          is_terminal?: boolean
          name: string
          organization_id: string
          position?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          is_terminal?: boolean
          name?: string
          organization_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "lead_statuses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          ad_name: string | null
          ad_set_name: string | null
          assigned_to: string | null
          campaign_name: string | null
          city: string | null
          country: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          email: string | null
          follow_up_at: string | null
          form_name: string | null
          full_name: string
          id: string
          lead_created_at: string
          lead_score: number
          lead_value: number | null
          organization_id: string
          phone: string | null
          quality: string
          source: string
          source_reference_id: string | null
          state: string | null
          status: string
          updated_at: string
          whatsapp_number: string | null
        }
        Insert: {
          ad_name?: string | null
          ad_set_name?: string | null
          assigned_to?: string | null
          campaign_name?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          follow_up_at?: string | null
          form_name?: string | null
          full_name: string
          id?: string
          lead_created_at?: string
          lead_score?: number
          lead_value?: number | null
          organization_id: string
          phone?: string | null
          quality?: string
          source?: string
          source_reference_id?: string | null
          state?: string | null
          status?: string
          updated_at?: string
          whatsapp_number?: string | null
        }
        Update: {
          ad_name?: string | null
          ad_set_name?: string | null
          assigned_to?: string | null
          campaign_name?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          follow_up_at?: string | null
          form_name?: string | null
          full_name?: string
          id?: string
          lead_created_at?: string
          lead_score?: number
          lead_value?: number | null
          organization_id?: string
          phone?: string | null
          quality?: string
          source?: string
          source_reference_id?: string | null
          state?: string | null
          status?: string
          updated_at?: string
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          kind: string
          organization_id: string
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          id?: string
          kind: string
          organization_id: string
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          kind?: string
          organization_id?: string
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean
          joined_at: string
          organization_id: string
          phone: string | null
          profile_picture_url: string | null
          user_id: string
        }
        Insert: {
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          joined_at?: string
          organization_id: string
          phone?: string | null
          profile_picture_url?: string | null
          user_id: string
        }
        Update: {
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          joined_at?: string
          organization_id?: string
          phone?: string | null
          profile_picture_url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address: string | null
          business_category: string | null
          city: string | null
          contact_person: string | null
          country: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          id: string
          name: string
          phone: string | null
          status: string
          subscription_plan: string
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          business_category?: string | null
          city?: string | null
          contact_person?: string | null
          country?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          status?: string
          subscription_plan?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          business_category?: string | null
          city?: string | null
          contact_person?: string | null
          country?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          status?: string
          subscription_plan?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          organization_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_view_lead: {
        Args: { _assigned_to: string; _organization_id: string }
        Returns: boolean
      }
      is_org_admin: { Args: { _organization_id: string }; Returns: boolean }
      is_org_member: { Args: { _organization_id: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      is_sales_exec: { Args: { _organization_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "platform_admin" | "client_admin" | "sales_exec"
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
    Enums: {
      app_role: ["platform_admin", "client_admin", "sales_exec"],
    },
  },
} as const
