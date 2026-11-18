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
      lead_scoring_settings: {
        Row: {
          converted_points: number
          created_at: string
          duplicate_points: number
          expressed_interest_points: number
          id: string
          invalid_number_points: number
          junk_lead_points: number
          meeting_scheduled_points: number
          organization_id: string
          responded_call_points: number
          updated_at: string
          valid_email_points: number
          valid_phone_points: number
        }
        Insert: {
          converted_points?: number
          created_at?: string
          duplicate_points?: number
          expressed_interest_points?: number
          id?: string
          invalid_number_points?: number
          junk_lead_points?: number
          meeting_scheduled_points?: number
          organization_id: string
          responded_call_points?: number
          updated_at?: string
          valid_email_points?: number
          valid_phone_points?: number
        }
        Update: {
          converted_points?: number
          created_at?: string
          duplicate_points?: number
          expressed_interest_points?: number
          id?: string
          invalid_number_points?: number
          junk_lead_points?: number
          meeting_scheduled_points?: number
          organization_id?: string
          responded_call_points?: number
          updated_at?: string
          valid_email_points?: number
          valid_phone_points?: number
        }
        Relationships: [
          {
            foreignKeyName: "lead_scoring_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
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
          fbc: string | null
          fbp: string | null
          follow_up_at: string | null
          form_name: string | null
          full_name: string
          id: string
          lead_created_at: string
          lead_score: number
          lead_value: number | null
          meta_ad_account_id: string | null
          meta_ad_id: string | null
          meta_ad_set_id: string | null
          meta_campaign_id: string | null
          meta_form_id: string | null
          meta_lead_id: string | null
          meta_page_id: string | null
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
          fbc?: string | null
          fbp?: string | null
          follow_up_at?: string | null
          form_name?: string | null
          full_name: string
          id?: string
          lead_created_at?: string
          lead_score?: number
          lead_value?: number | null
          meta_ad_account_id?: string | null
          meta_ad_id?: string | null
          meta_ad_set_id?: string | null
          meta_campaign_id?: string | null
          meta_form_id?: string | null
          meta_lead_id?: string | null
          meta_page_id?: string | null
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
          fbc?: string | null
          fbp?: string | null
          follow_up_at?: string | null
          form_name?: string | null
          full_name?: string
          id?: string
          lead_created_at?: string
          lead_score?: number
          lead_value?: number | null
          meta_ad_account_id?: string | null
          meta_ad_id?: string | null
          meta_ad_set_id?: string | null
          meta_campaign_id?: string | null
          meta_form_id?: string | null
          meta_lead_id?: string | null
          meta_page_id?: string | null
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
      meta_asset_credentials: {
        Row: {
          asset_id: string
          encrypted_access_token: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          asset_id: string
          encrypted_access_token: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          asset_id?: string
          encrypted_access_token?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_asset_credentials_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: true
            referencedRelation: "meta_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_asset_credentials_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_assets: {
        Row: {
          asset_type: string
          connection_id: string
          created_at: string
          external_id: string
          id: string
          metadata: Json
          name: string
          organization_id: string
          parent_external_id: string | null
          selected: boolean
          webhook_subscribed: boolean
        }
        Insert: {
          asset_type: string
          connection_id: string
          created_at?: string
          external_id: string
          id?: string
          metadata?: Json
          name: string
          organization_id: string
          parent_external_id?: string | null
          selected?: boolean
          webhook_subscribed?: boolean
        }
        Update: {
          asset_type?: string
          connection_id?: string
          created_at?: string
          external_id?: string
          id?: string
          metadata?: Json
          name?: string
          organization_id?: string
          parent_external_id?: string | null
          selected?: boolean
          webhook_subscribed?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "meta_assets_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "meta_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_assets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_capi_configs: {
        Row: {
          capi_enabled: boolean
          dataset_eligible: boolean
          dataset_id: string | null
          eligibility_reviewed_at: string | null
          eligibility_reviewed_by: string | null
          encrypted_capi_token: string | null
          last_error: string | null
          last_test_event_at: string | null
          last_tested_at: string | null
          organization_id: string
          status: string
          test_event_code: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          capi_enabled?: boolean
          dataset_eligible?: boolean
          dataset_id?: string | null
          eligibility_reviewed_at?: string | null
          eligibility_reviewed_by?: string | null
          encrypted_capi_token?: string | null
          last_error?: string | null
          last_test_event_at?: string | null
          last_tested_at?: string | null
          organization_id: string
          status?: string
          test_event_code?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          capi_enabled?: boolean
          dataset_eligible?: boolean
          dataset_id?: string | null
          eligibility_reviewed_at?: string | null
          eligibility_reviewed_by?: string | null
          encrypted_capi_token?: string | null
          last_error?: string | null
          last_test_event_at?: string | null
          last_tested_at?: string | null
          organization_id?: string
          status?: string
          test_event_code?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_capi_configs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_connections: {
        Row: {
          connected_at: string | null
          connected_by: string | null
          connection_status: string
          created_at: string
          encrypted_access_token: string | null
          facebook_name: string | null
          granted_permissions: string[]
          id: string
          last_sync_at: string | null
          meta_user_id: string | null
          organization_id: string
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          connected_at?: string | null
          connected_by?: string | null
          connection_status?: string
          created_at?: string
          encrypted_access_token?: string | null
          facebook_name?: string | null
          granted_permissions?: string[]
          id?: string
          last_sync_at?: string | null
          meta_user_id?: string | null
          organization_id: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          connected_at?: string | null
          connected_by?: string | null
          connection_status?: string
          created_at?: string
          encrypted_access_token?: string | null
          facebook_name?: string | null
          granted_permissions?: string[]
          id?: string
          last_sync_at?: string | null
          meta_user_id?: string | null
          organization_id?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_consent_evidence: {
        Row: {
          advertising_accepted: boolean
          consent_source: string
          evidence_reference: string
          global_privacy_control: boolean
          id: string
          lead_id: string
          matching_accepted: boolean
          notice_version: string
          organization_id: string
          recorded_at: string
          recorded_by: string | null
          region: string
          withdrawn_at: string | null
        }
        Insert: {
          advertising_accepted: boolean
          consent_source?: string
          evidence_reference: string
          global_privacy_control?: boolean
          id?: string
          lead_id: string
          matching_accepted?: boolean
          notice_version: string
          organization_id: string
          recorded_at?: string
          recorded_by?: string | null
          region: string
          withdrawn_at?: string | null
        }
        Update: {
          advertising_accepted?: boolean
          consent_source?: string
          evidence_reference?: string
          global_privacy_control?: boolean
          id?: string
          lead_id?: string
          matching_accepted?: boolean
          notice_version?: string
          organization_id?: string
          recorded_at?: string
          recorded_by?: string | null
          region?: string
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_consent_evidence_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_consent_evidence_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_conversion_events: {
        Row: {
          action_source: string
          attempts: number
          consent_id: string | null
          created_at: string
          currency: string | null
          error_code: string | null
          event_name: string
          id: string
          lead_id: string
          next_attempt_at: string | null
          occurred_at: string
          organization_id: string
          outcome_reference: string
          provider_events_received: number | null
          provider_received_at: string | null
          sent_dataset_id: string | null
          status: string
          test_event: boolean
          value: number | null
        }
        Insert: {
          action_source: string
          attempts?: number
          consent_id?: string | null
          created_at?: string
          currency?: string | null
          error_code?: string | null
          event_name: string
          id?: string
          lead_id: string
          next_attempt_at?: string | null
          occurred_at: string
          organization_id: string
          outcome_reference: string
          provider_events_received?: number | null
          provider_received_at?: string | null
          sent_dataset_id?: string | null
          status?: string
          test_event?: boolean
          value?: number | null
        }
        Update: {
          action_source?: string
          attempts?: number
          consent_id?: string | null
          created_at?: string
          currency?: string | null
          error_code?: string | null
          event_name?: string
          id?: string
          lead_id?: string
          next_attempt_at?: string | null
          occurred_at?: string
          organization_id?: string
          outcome_reference?: string
          provider_events_received?: number | null
          provider_received_at?: string | null
          sent_dataset_id?: string | null
          status?: string
          test_event?: boolean
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_conversion_events_consent_id_organization_id_lead_id_fkey"
            columns: ["consent_id", "organization_id", "lead_id"]
            isOneToOne: false
            referencedRelation: "meta_consent_evidence"
            referencedColumns: ["id", "organization_id", "lead_id"]
          },
          {
            foreignKeyName: "meta_conversion_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_conversion_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_conversion_rules: {
        Row: {
          created_at: string
          currency: string | null
          enabled: boolean
          event_name: string
          id: string
          organization_id: string
          trigger_type: string
          trigger_value: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string | null
          enabled?: boolean
          event_name: string
          id?: string
          organization_id: string
          trigger_type: string
          trigger_value: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string | null
          enabled?: boolean
          event_name?: string
          id?: string
          organization_id?: string
          trigger_type?: string
          trigger_value?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_conversion_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_integration_settings: {
        Row: {
          assignment_cursor: number
          assignment_mode: string
          auto_sync_enabled: boolean
          conversion_enabled: boolean
          dataset_id: string | null
          default_quality: string
          default_status: string
          duplicate_handling: string
          executive_ids: string[]
          notifications_enabled: boolean
          organization_id: string
          updated_at: string
        }
        Insert: {
          assignment_cursor?: number
          assignment_mode?: string
          auto_sync_enabled?: boolean
          conversion_enabled?: boolean
          dataset_id?: string | null
          default_quality?: string
          default_status?: string
          duplicate_handling?: string
          executive_ids?: string[]
          notifications_enabled?: boolean
          organization_id: string
          updated_at?: string
        }
        Update: {
          assignment_cursor?: number
          assignment_mode?: string
          auto_sync_enabled?: boolean
          conversion_enabled?: boolean
          dataset_id?: string | null
          default_quality?: string
          default_status?: string
          duplicate_handling?: string
          executive_ids?: string[]
          notifications_enabled?: boolean
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_integration_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_lead_responses: {
        Row: {
          created_at: string
          field_data: Json
          lead_id: string
          organization_id: string
        }
        Insert: {
          created_at?: string
          field_data: Json
          lead_id: string
          organization_id: string
        }
        Update: {
          created_at?: string
          field_data?: Json
          lead_id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_lead_responses_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_lead_responses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_oauth_sessions: {
        Row: {
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          opener_origin: string | null
          organization_id: string
          redirect_uri: string
          state_hash: string
          user_id: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          opener_origin?: string | null
          organization_id: string
          redirect_uri: string
          state_hash: string
          user_id: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          opener_origin?: string | null
          organization_id?: string
          redirect_uri?: string
          state_hash?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_oauth_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_sync_logs: {
        Row: {
          connection_id: string | null
          created_at: string
          error_message: string | null
          id: string
          organization_id: string
          records_processed: number
          status: string
          sync_type: string
        }
        Insert: {
          connection_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          organization_id: string
          records_processed?: number
          status: string
          sync_type: string
        }
        Update: {
          connection_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          organization_id?: string
          records_processed?: number
          status?: string
          sync_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_sync_logs_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "meta_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_sync_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_webhook_events: {
        Row: {
          attempts: number
          error_code: string | null
          form_id: string
          id: string
          leadgen_id: string
          lease_until: string | null
          next_attempt_at: string
          organization_id: string | null
          page_id: string
          payload: Json
          processed_at: string | null
          processing_status: string
          received_at: string
        }
        Insert: {
          attempts?: number
          error_code?: string | null
          form_id: string
          id?: string
          leadgen_id: string
          lease_until?: string | null
          next_attempt_at?: string
          organization_id?: string | null
          page_id: string
          payload: Json
          processed_at?: string | null
          processing_status?: string
          received_at?: string
        }
        Update: {
          attempts?: number
          error_code?: string | null
          form_id?: string
          id?: string
          leadgen_id?: string
          lease_until?: string | null
          next_attempt_at?: string
          organization_id?: string | null
          page_id?: string
          payload?: Json
          processed_at?: string | null
          processing_status?: string
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_webhook_events_organization_id_fkey"
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
      claim_meta_lead_jobs: {
        Args: { _limit?: number }
        Returns: {
          attempts: number
          error_code: string | null
          form_id: string
          id: string
          leadgen_id: string
          lease_until: string | null
          next_attempt_at: string
          organization_id: string | null
          page_id: string
          payload: Json
          processed_at: string | null
          processing_status: string
          received_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "meta_webhook_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      ingest_meta_lead: {
        Args: {
          _attempt: number
          _fields: Json
          _job_id: string
          _lead: Json
          _organization_id: string
        }
        Returns: string
      }
      is_org_admin: { Args: { _organization_id: string }; Returns: boolean }
      is_org_member: { Args: { _organization_id: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      is_sales_exec: { Args: { _organization_id: string }; Returns: boolean }
      meta_consent_block_reason: {
        Args: {
          _consent_id: string
          _lead_id: string
          _organization_id: string
        }
        Returns: string
      }
      recheck_meta_conversion_consent: {
        Args: { _event_id: string }
        Returns: {
          action_source: string
          attempts: number
          consent_id: string | null
          created_at: string
          currency: string | null
          error_code: string | null
          event_name: string
          id: string
          lead_id: string
          next_attempt_at: string | null
          occurred_at: string
          organization_id: string
          outcome_reference: string
          provider_events_received: number | null
          provider_received_at: string | null
          sent_dataset_id: string | null
          status: string
          test_event: boolean
          value: number | null
        }
        SetofOptions: {
          from: "*"
          to: "meta_conversion_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_meta_consent: {
        Args: {
          _advertising_accepted: boolean
          _consent_source: string
          _evidence_reference: string
          _global_privacy_control: boolean
          _lead_id: string
          _matching_accepted: boolean
          _notice_version: string
          _organization_id: string
          _recorded_by: string
          _region: string
          _withdrawn: boolean
        }
        Returns: {
          advertising_accepted: boolean
          consent_source: string
          evidence_reference: string
          global_privacy_control: boolean
          id: string
          lead_id: string
          matching_accepted: boolean
          notice_version: string
          organization_id: string
          recorded_at: string
          recorded_by: string | null
          region: string
          withdrawn_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "meta_consent_evidence"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reserve_meta_conversion_send: {
        Args: { _event_id: string; _organization_id: string }
        Returns: {
          action_source: string
          attempts: number
          consent_id: string | null
          created_at: string
          currency: string | null
          error_code: string | null
          event_name: string
          id: string
          lead_id: string
          next_attempt_at: string | null
          occurred_at: string
          organization_id: string
          outcome_reference: string
          provider_events_received: number | null
          provider_received_at: string | null
          sent_dataset_id: string | null
          status: string
          test_event: boolean
          value: number | null
        }
        SetofOptions: {
          from: "*"
          to: "meta_conversion_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reserve_meta_conversion_test: {
        Args: { _event_id: string; _organization_id: string }
        Returns: {
          action_source: string
          attempts: number
          consent_id: string | null
          created_at: string
          currency: string | null
          error_code: string | null
          event_name: string
          id: string
          lead_id: string
          next_attempt_at: string | null
          occurred_at: string
          organization_id: string
          outcome_reference: string
          provider_events_received: number | null
          provider_received_at: string | null
          sent_dataset_id: string | null
          status: string
          test_event: boolean
          value: number | null
        }
        SetofOptions: {
          from: "*"
          to: "meta_conversion_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
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
