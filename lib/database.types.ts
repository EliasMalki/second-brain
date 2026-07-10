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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          actor: string
          created_at: string
          detail: Json
          entity_id: string | null
          entity_type: string
          id: string
          org_id: string
          owner_id: string | null
          summary: string | null
        }
        Insert: {
          action: string
          actor: string
          created_at?: string
          detail?: Json
          entity_id?: string | null
          entity_type?: string
          id?: string
          org_id: string
          owner_id?: string | null
          summary?: string | null
        }
        Update: {
          action?: string
          actor?: string
          created_at?: string
          detail?: Json
          entity_id?: string | null
          entity_type?: string
          id?: string
          org_id?: string
          owner_id?: string | null
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      areas: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["area_kind"]
          name: string
          org_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["area_kind"]
          name: string
          org_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["area_kind"]
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "areas_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          caption: string | null
          created_at: string
          file_url: string
          id: string
          mime_type: string | null
          org_id: string
          owner_id: string
          owner_type: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          file_url: string
          id?: string
          mime_type?: string | null
          org_id: string
          owner_id: string
          owner_type: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          file_url?: string
          id?: string
          mime_type?: string | null
          org_id?: string
          owner_id?: string
          owner_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "attachments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      briefs_log: {
        Row: {
          created_at: string
          generated_for: string
          id: string
          kind: Database["public"]["Enums"]["brief_kind"]
          org_id: string
          owner_id: string
          payload: Json | null
          shown_at: string | null
          task_ids: string[]
        }
        Insert: {
          created_at?: string
          generated_for: string
          id?: string
          kind: Database["public"]["Enums"]["brief_kind"]
          org_id: string
          owner_id: string
          payload?: Json | null
          shown_at?: string | null
          task_ids?: string[]
        }
        Update: {
          created_at?: string
          generated_for?: string
          id?: string
          kind?: Database["public"]["Enums"]["brief_kind"]
          org_id?: string
          owner_id?: string
          payload?: Json | null
          shown_at?: string | null
          task_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "briefs_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "briefs_log_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_connections: {
        Row: {
          access_token_enc: string | null
          created_at: string
          expires_at: string | null
          external_calendar_id: string
          id: string
          org_id: string
          provider: Database["public"]["Enums"]["calendar_provider"]
          refresh_token_enc: string | null
          revoked_at: string | null
          scope: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_enc?: string | null
          created_at?: string
          expires_at?: string | null
          external_calendar_id?: string
          id?: string
          org_id: string
          provider: Database["public"]["Enums"]["calendar_provider"]
          refresh_token_enc?: string | null
          revoked_at?: string | null
          scope?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_enc?: string | null
          created_at?: string
          expires_at?: string | null
          external_calendar_id?: string
          id?: string
          org_id?: string
          provider?: Database["public"]["Enums"]["calendar_provider"]
          refresh_token_enc?: string | null
          revoked_at?: string | null
          scope?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_connections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_connections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      captures: {
        Row: {
          id: string
          interpretation: Json | null
          org_id: string
          owner_id: string
          raw_text: string | null
          received_at: string
          result_id: string | null
          result_kind: Database["public"]["Enums"]["result_kind"]
          source: Database["public"]["Enums"]["source_channel"]
          status: Database["public"]["Enums"]["capture_status"]
        }
        Insert: {
          id?: string
          interpretation?: Json | null
          org_id: string
          owner_id: string
          raw_text?: string | null
          received_at?: string
          result_id?: string | null
          result_kind?: Database["public"]["Enums"]["result_kind"]
          source: Database["public"]["Enums"]["source_channel"]
          status?: Database["public"]["Enums"]["capture_status"]
        }
        Update: {
          id?: string
          interpretation?: Json | null
          org_id?: string
          owner_id?: string
          raw_text?: string | null
          received_at?: string
          result_id?: string | null
          result_kind?: Database["public"]["Enums"]["result_kind"]
          source?: Database["public"]["Enums"]["source_channel"]
          status?: Database["public"]["Enums"]["capture_status"]
        }
        Relationships: [
          {
            foreignKeyName: "captures_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "captures_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_accounts: {
        Row: {
          channel: Database["public"]["Enums"]["channel_kind"]
          created_at: string
          external_id: string | null
          id: string
          preferred_for_push: boolean
          user_id: string
        }
        Insert: {
          channel: Database["public"]["Enums"]["channel_kind"]
          created_at?: string
          external_id?: string | null
          id?: string
          preferred_for_push?: boolean
          user_id: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["channel_kind"]
          created_at?: string
          external_id?: string | null
          id?: string
          preferred_for_push?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      links: {
        Row: {
          created_at: string
          from_id: string
          from_type: string
          id: string
          org_id: string
          relation: string
          to_id: string
          to_type: string
        }
        Insert: {
          created_at?: string
          from_id: string
          from_type: string
          id?: string
          org_id: string
          relation: string
          to_id: string
          to_type: string
        }
        Update: {
          created_at?: string
          from_id?: string
          from_type?: string
          id?: string
          org_id?: string
          relation?: string
          to_id?: string
          to_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "links_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          id: string
          org_id: string
          role: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          archived: boolean
          body: string
          body_text: string | null
          content_format: Database["public"]["Enums"]["content_format"]
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["note_kind"]
          org_id: string
          original_text: string | null
          owner_id: string
          pinned: boolean
          project_id: string | null
          record_id: string | null
          reviewed_at: string | null
          search_vector: unknown
          source: Database["public"]["Enums"]["source_channel"] | null
          tags: string[]
          title: string | null
          updated_at: string
        }
        Insert: {
          archived?: boolean
          body: string
          body_text?: string | null
          content_format?: Database["public"]["Enums"]["content_format"]
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["note_kind"]
          org_id: string
          original_text?: string | null
          owner_id: string
          pinned?: boolean
          project_id?: string | null
          record_id?: string | null
          reviewed_at?: string | null
          search_vector?: unknown
          source?: Database["public"]["Enums"]["source_channel"] | null
          tags?: string[]
          title?: string | null
          updated_at?: string
        }
        Update: {
          archived?: boolean
          body?: string
          body_text?: string | null
          content_format?: Database["public"]["Enums"]["content_format"]
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["note_kind"]
          org_id?: string
          original_text?: string | null
          owner_id?: string
          pinned?: boolean
          project_id?: string | null
          record_id?: string | null
          reviewed_at?: string | null
          search_vector?: unknown
          source?: Database["public"]["Enums"]["source_channel"] | null
          tags?: string[]
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "records"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["org_kind"]
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["org_kind"]
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["org_kind"]
          name?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          aliases: string[]
          area_id: string | null
          availability_default: Database["public"]["Enums"]["availability"]
          color: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          org_id: string
          owner_id: string
          status: Database["public"]["Enums"]["project_status"]
          updated_at: string
        }
        Insert: {
          aliases?: string[]
          area_id?: string | null
          availability_default?: Database["public"]["Enums"]["availability"]
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          org_id: string
          owner_id: string
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Update: {
          aliases?: string[]
          area_id?: string | null
          availability_default?: Database["public"]["Enums"]["availability"]
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          org_id?: string
          owner_id?: string
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      prompts: {
        Row: {
          answer_text: string | null
          created_at: string
          id: string
          org_id: string
          owner_id: string
          relates_id: string | null
          relates_type: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["prompt_status"]
          surface_after: string
          text: string
          type: Database["public"]["Enums"]["prompt_type"]
        }
        Insert: {
          answer_text?: string | null
          created_at?: string
          id?: string
          org_id: string
          owner_id: string
          relates_id?: string | null
          relates_type?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["prompt_status"]
          surface_after?: string
          text: string
          type: Database["public"]["Enums"]["prompt_type"]
        }
        Update: {
          answer_text?: string | null
          created_at?: string
          id?: string
          org_id?: string
          owner_id?: string
          relates_id?: string | null
          relates_type?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["prompt_status"]
          surface_after?: string
          text?: string
          type?: Database["public"]["Enums"]["prompt_type"]
        }
        Relationships: [
          {
            foreignKeyName: "prompts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      receipts: {
        Row: {
          amount: number | null
          category: string | null
          created_at: string
          currency: string
          id: string
          note: string | null
          org_id: string
          owner_id: string
          project_id: string | null
          purchased_on: string | null
          record_id: string | null
          source: Database["public"]["Enums"]["source_channel"] | null
          task_id: string | null
          vendor: string | null
        }
        Insert: {
          amount?: number | null
          category?: string | null
          created_at?: string
          currency?: string
          id?: string
          note?: string | null
          org_id: string
          owner_id: string
          project_id?: string | null
          purchased_on?: string | null
          record_id?: string | null
          source?: Database["public"]["Enums"]["source_channel"] | null
          task_id?: string | null
          vendor?: string | null
        }
        Update: {
          amount?: number | null
          category?: string | null
          created_at?: string
          currency?: string
          id?: string
          note?: string | null
          org_id?: string
          owner_id?: string
          project_id?: string | null
          purchased_on?: string | null
          record_id?: string | null
          source?: Database["public"]["Enums"]["source_channel"] | null
          task_id?: string | null
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receipts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      record_types: {
        Row: {
          created_at: string
          id: string
          intake_checklist: Json
          label_plural: string
          label_singular: string
          org_id: string
          project_id: string
          stages: string[]
        }
        Insert: {
          created_at?: string
          id?: string
          intake_checklist?: Json
          label_plural: string
          label_singular: string
          org_id: string
          project_id: string
          stages?: string[]
        }
        Update: {
          created_at?: string
          id?: string
          intake_checklist?: Json
          label_plural?: string
          label_singular?: string
          org_id?: string
          project_id?: string
          stages?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "record_types_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "record_types_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      records: {
        Row: {
          created_at: string
          id: string
          name: string
          org_id: string
          owner_id: string
          project_id: string
          record_type_id: string
          stage: string | null
          status: Database["public"]["Enums"]["record_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          org_id: string
          owner_id: string
          project_id: string
          record_type_id: string
          stage?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          owner_id?: string
          project_id?: string
          record_type_id?: string
          stage?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "records_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "records_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "records_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "records_record_type_id_fkey"
            columns: ["record_type_id"]
            isOneToOne: false
            referencedRelation: "record_types"
            referencedColumns: ["id"]
          },
        ]
      }
      recurrences: {
        Row: {
          active: boolean
          anchor: Database["public"]["Enums"]["recur_anchor"]
          byday: string[] | null
          bymonthday: number | null
          created_at: string
          default_availability:
            | Database["public"]["Enums"]["availability"]
            | null
          default_effort: Database["public"]["Enums"]["effort"] | null
          default_priority: Database["public"]["Enums"]["priority"]
          freq: Database["public"]["Enums"]["recur_freq"]
          id: string
          interval: number
          last_materialized_through: string | null
          lead_days: number
          org_id: string
          owner_id: string
          project_id: string | null
          record_id: string | null
          start_date: string
          title_template: string
          until: string | null
        }
        Insert: {
          active?: boolean
          anchor?: Database["public"]["Enums"]["recur_anchor"]
          byday?: string[] | null
          bymonthday?: number | null
          created_at?: string
          default_availability?:
            | Database["public"]["Enums"]["availability"]
            | null
          default_effort?: Database["public"]["Enums"]["effort"] | null
          default_priority?: Database["public"]["Enums"]["priority"]
          freq: Database["public"]["Enums"]["recur_freq"]
          id?: string
          interval?: number
          last_materialized_through?: string | null
          lead_days?: number
          org_id: string
          owner_id: string
          project_id?: string | null
          record_id?: string | null
          start_date: string
          title_template: string
          until?: string | null
        }
        Update: {
          active?: boolean
          anchor?: Database["public"]["Enums"]["recur_anchor"]
          byday?: string[] | null
          bymonthday?: number | null
          created_at?: string
          default_availability?:
            | Database["public"]["Enums"]["availability"]
            | null
          default_effort?: Database["public"]["Enums"]["effort"] | null
          default_priority?: Database["public"]["Enums"]["priority"]
          freq?: Database["public"]["Enums"]["recur_freq"]
          id?: string
          interval?: number
          last_materialized_through?: string | null
          lead_days?: number
          org_id?: string
          owner_id?: string
          project_id?: string | null
          record_id?: string | null
          start_date?: string
          title_template?: string
          until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recurrences_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurrences_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurrences_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurrences_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "records"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_id: string | null
          availability: Database["public"]["Enums"]["availability"] | null
          body: string | null
          completed_at: string | null
          created_at: string
          due_date: string | null
          effort: Database["public"]["Enums"]["effort"] | null
          end_at: string | null
          follow_up_on: string | null
          id: string
          org_id: string
          original_text: string | null
          owner_id: string
          priority: Database["public"]["Enums"]["priority"]
          priority_set_by: Database["public"]["Enums"]["set_by"]
          project_id: string | null
          record_id: string | null
          recurrence_id: string | null
          reviewed_at: string | null
          rollover_count: number
          scheduled_for: string | null
          search_vector: unknown
          snooze_until: string | null
          source: Database["public"]["Enums"]["source_channel"] | null
          start_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          waiting_on: string | null
        }
        Insert: {
          assignee_id?: string | null
          availability?: Database["public"]["Enums"]["availability"] | null
          body?: string | null
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          effort?: Database["public"]["Enums"]["effort"] | null
          end_at?: string | null
          follow_up_on?: string | null
          id?: string
          org_id: string
          original_text?: string | null
          owner_id: string
          priority?: Database["public"]["Enums"]["priority"]
          priority_set_by?: Database["public"]["Enums"]["set_by"]
          project_id?: string | null
          record_id?: string | null
          recurrence_id?: string | null
          reviewed_at?: string | null
          rollover_count?: number
          scheduled_for?: string | null
          search_vector?: unknown
          snooze_until?: string | null
          source?: Database["public"]["Enums"]["source_channel"] | null
          start_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          waiting_on?: string | null
        }
        Update: {
          assignee_id?: string | null
          availability?: Database["public"]["Enums"]["availability"] | null
          body?: string | null
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          effort?: Database["public"]["Enums"]["effort"] | null
          end_at?: string | null
          follow_up_on?: string | null
          id?: string
          org_id?: string
          original_text?: string | null
          owner_id?: string
          priority?: Database["public"]["Enums"]["priority"]
          priority_set_by?: Database["public"]["Enums"]["set_by"]
          project_id?: string | null
          record_id?: string | null
          recurrence_id?: string | null
          reviewed_at?: string | null
          rollover_count?: number
          scheduled_for?: string | null
          search_vector?: unknown
          snooze_until?: string | null
          source?: Database["public"]["Enums"]["source_channel"] | null
          start_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          waiting_on?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_recurrence_id_fkey"
            columns: ["recurrence_id"]
            isOneToOne: false
            referencedRelation: "recurrences"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          settings: Json
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          name: string
          settings?: Json
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          settings?: Json
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      area_kind: "business" | "personal"
      availability: "anytime" | "business_hours"
      brief_kind: "daily" | "weekly"
      calendar_provider: "google"
      capture_status: "processed" | "needs_clarification" | "failed"
      channel_kind:
        | "app"
        | "telegram"
        | "whatsapp"
        | "sms"
        | "imessage"
        | "slack"
        | "teams"
        | "outlook"
      content_format: "markdown" | "richtext"
      effort: "quick" | "deep"
      note_kind: "quick" | "journal" | "reference" | "meeting" | "workflow"
      org_kind: "personal" | "team"
      org_role: "owner" | "admin" | "member"
      priority: "A" | "B" | "C" | "D"
      project_status: "active" | "paused" | "archived"
      prompt_status: "pending" | "answered" | "dismissed" | "snoozed"
      prompt_type: "unsorted" | "question" | "discrepancy" | "nudge"
      record_status: "active" | "archived"
      recur_anchor: "fixed" | "completion"
      recur_freq: "daily" | "weekly" | "monthly" | "yearly"
      result_kind: "task" | "note" | "receipt" | "record" | "command" | "none"
      set_by: "system" | "user"
      source_channel:
        | "app"
        | "voice"
        | "telegram"
        | "whatsapp"
        | "sms"
        | "imessage"
        | "slack"
        | "teams"
        | "outlook"
      task_status:
        | "open"
        | "done"
        | "snoozed"
        | "waiting"
        | "cancelled"
        | "needs_clarification"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      area_kind: ["business", "personal"],
      availability: ["anytime", "business_hours"],
      brief_kind: ["daily", "weekly"],
      calendar_provider: ["google"],
      capture_status: ["processed", "needs_clarification", "failed"],
      channel_kind: [
        "app",
        "telegram",
        "whatsapp",
        "sms",
        "imessage",
        "slack",
        "teams",
        "outlook",
      ],
      content_format: ["markdown", "richtext"],
      effort: ["quick", "deep"],
      note_kind: ["quick", "journal", "reference", "meeting", "workflow"],
      org_kind: ["personal", "team"],
      org_role: ["owner", "admin", "member"],
      priority: ["A", "B", "C", "D"],
      project_status: ["active", "paused", "archived"],
      prompt_status: ["pending", "answered", "dismissed", "snoozed"],
      prompt_type: ["unsorted", "question", "discrepancy", "nudge"],
      record_status: ["active", "archived"],
      recur_anchor: ["fixed", "completion"],
      recur_freq: ["daily", "weekly", "monthly", "yearly"],
      result_kind: ["task", "note", "receipt", "record", "command", "none"],
      set_by: ["system", "user"],
      source_channel: [
        "app",
        "voice",
        "telegram",
        "whatsapp",
        "sms",
        "imessage",
        "slack",
        "teams",
        "outlook",
      ],
      task_status: [
        "open",
        "done",
        "snoozed",
        "waiting",
        "cancelled",
        "needs_clarification",
      ],
    },
  },
} as const
