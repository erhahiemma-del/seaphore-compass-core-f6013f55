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
      agencies: {
        Row: {
          code: string | null
          full_name: string
          id: string
          jurisdiction: string | null
        }
        Insert: {
          code?: string | null
          full_name: string
          id: string
          jurisdiction?: string | null
        }
        Update: {
          code?: string | null
          full_name?: string
          id?: string
          jurisdiction?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agencies_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          confidence: Database["public"]["Enums"]["confidence_level"]
          entity_id: string | null
          id: string
          metadata: Json
          raised_at: string
          severity: string
          signal_id: string | null
          status: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          confidence?: Database["public"]["Enums"]["confidence_level"]
          entity_id?: string | null
          id?: string
          metadata?: Json
          raised_at?: string
          severity?: string
          signal_id?: string | null
          status?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          confidence?: Database["public"]["Enums"]["confidence_level"]
          entity_id?: string | null
          id?: string
          metadata?: Json
          raised_at?: string
          severity?: string
          signal_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          at: string
          entity: string
          entity_id: string | null
          id: string
          ip_address: string
          metadata: Json
          module: string
          officer_id: string
          rule_refs: string[]
        }
        Insert: {
          action: string
          at?: string
          entity: string
          entity_id?: string | null
          id?: string
          ip_address: string
          metadata?: Json
          module: string
          officer_id: string
          rule_refs?: string[]
        }
        Update: {
          action?: string
          at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          ip_address?: string
          metadata?: Json
          module?: string
          officer_id?: string
          rule_refs?: string[]
        }
        Relationships: []
      }
      briefings: {
        Row: {
          audience: string
          authorized_at: string
          authorized_by: string
          export_envelope: Json
          id: string
          report_id: string | null
        }
        Insert: {
          audience: string
          authorized_at?: string
          authorized_by: string
          export_envelope: Json
          id: string
          report_id?: string | null
        }
        Update: {
          audience?: string
          authorized_at?: string
          authorized_by?: string
          export_envelope?: Json
          id?: string
          report_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "briefings_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "briefings_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "intelligence_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      cargo_items: {
        Row: {
          commodity: string
          currency: string | null
          declared_value: number | null
          hs_code: string | null
          id: string
          manifest_id: string
          weight_kg: number | null
        }
        Insert: {
          commodity: string
          currency?: string | null
          declared_value?: number | null
          hs_code?: string | null
          id: string
          manifest_id: string
          weight_kg?: number | null
        }
        Update: {
          commodity?: string
          currency?: string | null
          declared_value?: number | null
          hs_code?: string | null
          id?: string
          manifest_id?: string
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cargo_items_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargo_items_manifest_id_fkey"
            columns: ["manifest_id"]
            isOneToOne: false
            referencedRelation: "manifests"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          cac_number: string | null
          id: string
          jurisdiction: string | null
          lei: string | null
          tax_id: string | null
        }
        Insert: {
          cac_number?: string | null
          id: string
          jurisdiction?: string | null
          lei?: string | null
          tax_id?: string | null
        }
        Update: {
          cac_number?: string | null
          id?: string
          jurisdiction?: string | null
          lei?: string | null
          tax_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      containers: {
        Row: {
          container_number: string | null
          id: string
          seal_number: string | null
          voyage_id: string | null
        }
        Insert: {
          container_number?: string | null
          id: string
          seal_number?: string | null
          voyage_id?: string | null
        }
        Update: {
          container_number?: string | null
          id?: string
          seal_number?: string | null
          voyage_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "containers_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "containers_voyage_id_fkey"
            columns: ["voyage_id"]
            isOneToOne: false
            referencedRelation: "voyages"
            referencedColumns: ["id"]
          },
        ]
      }
      copilot_rate_limit: {
        Row: {
          count: number
          id: string
          officer_id: string
          window_start: string
        }
        Insert: {
          count?: number
          id?: string
          officer_id: string
          window_start?: string
        }
        Update: {
          count?: number
          id?: string
          officer_id?: string
          window_start?: string
        }
        Relationships: []
      }
      decisions: {
        Row: {
          decided_at: string
          decision: string
          id: string
          immutable: boolean
          investigation_id: string
          notes: string | null
          officer_id: string
          reason: string
          signature_data: string
        }
        Insert: {
          decided_at?: string
          decision: string
          id?: string
          immutable?: boolean
          investigation_id: string
          notes?: string | null
          officer_id: string
          reason: string
          signature_data: string
        }
        Update: {
          decided_at?: string
          decision?: string
          id?: string
          immutable?: boolean
          investigation_id?: string
          notes?: string | null
          officer_id?: string
          reason?: string
          signature_data?: string
        }
        Relationships: [
          {
            foreignKeyName: "decisions_investigation_id_fkey"
            columns: ["investigation_id"]
            isOneToOne: false
            referencedRelation: "investigations"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          doc_type: string
          id: string
          issued_at: string | null
          issued_by_id: string | null
          reference: string | null
          storage_path: string | null
          voyage_id: string | null
        }
        Insert: {
          doc_type: string
          id: string
          issued_at?: string | null
          issued_by_id?: string | null
          reference?: string | null
          storage_path?: string | null
          voyage_id?: string | null
        }
        Update: {
          doc_type?: string
          id?: string
          issued_at?: string | null
          issued_by_id?: string | null
          reference?: string | null
          storage_path?: string | null
          voyage_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_issued_by_id_fkey"
            columns: ["issued_by_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_voyage_id_fkey"
            columns: ["voyage_id"]
            isOneToOne: false
            referencedRelation: "voyages"
            referencedColumns: ["id"]
          },
        ]
      }
      entities: {
        Row: {
          aliases: string[]
          attributes: Json
          confidence: Database["public"]["Enums"]["confidence_level"]
          created_at: string
          created_by: string | null
          evidence_ids: string[]
          id: string
          name: string
          risk_score: number | null
          source_id: string | null
          source_name: string | null
          type: Database["public"]["Enums"]["entity_type"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          aliases?: string[]
          attributes?: Json
          confidence?: Database["public"]["Enums"]["confidence_level"]
          created_at?: string
          created_by?: string | null
          evidence_ids?: string[]
          id?: string
          name: string
          risk_score?: number | null
          source_id?: string | null
          source_name?: string | null
          type: Database["public"]["Enums"]["entity_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          aliases?: string[]
          attributes?: Json
          confidence?: Database["public"]["Enums"]["confidence_level"]
          created_at?: string
          created_by?: string | null
          evidence_ids?: string[]
          id?: string
          name?: string
          risk_score?: number | null
          source_id?: string | null
          source_name?: string | null
          type?: Database["public"]["Enums"]["entity_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      entity_history: {
        Row: {
          at: string
          entity_id: string
          field: string
          id: string
          new_value: Json | null
          officer_id: string
          old_value: Json | null
        }
        Insert: {
          at?: string
          entity_id: string
          field: string
          id?: string
          new_value?: Json | null
          officer_id: string
          old_value?: Json | null
        }
        Update: {
          at?: string
          entity_id?: string
          field?: string
          id?: string
          new_value?: Json | null
          officer_id?: string
          old_value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "entity_history_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence: {
        Row: {
          collected_at: string
          collected_by: string | null
          derived_from_document_id: string | null
          evidence_type: string
          id: string
          investigation_id: string
          source: string | null
          storage_path: string | null
        }
        Insert: {
          collected_at?: string
          collected_by?: string | null
          derived_from_document_id?: string | null
          evidence_type: string
          id: string
          investigation_id: string
          source?: string | null
          storage_path?: string | null
        }
        Update: {
          collected_at?: string
          collected_by?: string | null
          derived_from_document_id?: string | null
          evidence_type?: string
          id?: string
          investigation_id?: string
          source?: string | null
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evidence_derived_from_document_id_fkey"
            columns: ["derived_from_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_investigation_id_fkey"
            columns: ["investigation_id"]
            isOneToOne: false
            referencedRelation: "investigations"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_reports: {
        Row: {
          classification: string
          id: string
          investigation_id: string | null
          issued_at: string | null
          issued_by_agency_id: string | null
          report_number: string
        }
        Insert: {
          classification?: string
          id: string
          investigation_id?: string | null
          issued_at?: string | null
          issued_by_agency_id?: string | null
          report_number: string
        }
        Update: {
          classification?: string
          id?: string
          investigation_id?: string | null
          issued_at?: string | null
          issued_by_agency_id?: string | null
          report_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_reports_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_reports_investigation_id_fkey"
            columns: ["investigation_id"]
            isOneToOne: false
            referencedRelation: "investigations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_reports_issued_by_agency_id_fkey"
            columns: ["issued_by_agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      investigations: {
        Row: {
          case_number: string
          closed_at: string | null
          id: string
          lead_officer_id: string
          opened_at: string
          scenario: string | null
          status: Database["public"]["Enums"]["investigation_status"]
          target_voyage_id: string | null
        }
        Insert: {
          case_number: string
          closed_at?: string | null
          id: string
          lead_officer_id: string
          opened_at?: string
          scenario?: string | null
          status?: Database["public"]["Enums"]["investigation_status"]
          target_voyage_id?: string | null
        }
        Update: {
          case_number?: string
          closed_at?: string | null
          id?: string
          lead_officer_id?: string
          opened_at?: string
          scenario?: string | null
          status?: Database["public"]["Enums"]["investigation_status"]
          target_voyage_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "investigations_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investigations_target_voyage_id_fkey"
            columns: ["target_voyage_id"]
            isOneToOne: false
            referencedRelation: "voyages"
            referencedColumns: ["id"]
          },
        ]
      }
      manifests: {
        Row: {
          id: string
          submitted_at: string | null
          submitted_by_id: string | null
          version: number
          voyage_id: string
        }
        Insert: {
          id: string
          submitted_at?: string | null
          submitted_by_id?: string | null
          version?: number
          voyage_id: string
        }
        Update: {
          id?: string
          submitted_at?: string | null
          submitted_by_id?: string | null
          version?: number
          voyage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "manifests_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manifests_submitted_by_id_fkey"
            columns: ["submitted_by_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manifests_voyage_id_fkey"
            columns: ["voyage_id"]
            isOneToOne: false
            referencedRelation: "voyages"
            referencedColumns: ["id"]
          },
        ]
      }
      persons: {
        Row: {
          id: string
          passport: string | null
          role: string | null
        }
        Insert: {
          id: string
          passport?: string | null
          role?: string | null
        }
        Update: {
          id?: string
          passport?: string | null
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "persons_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      ports: {
        Row: {
          country: string
          id: string
          terminals: string[]
          unlocode: string | null
        }
        Insert: {
          country: string
          id: string
          terminals?: string[]
          unlocode?: string | null
        }
        Update: {
          country?: string
          id?: string
          terminals?: string[]
          unlocode?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ports_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          agency_id: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          rank: string | null
          updated_at: string
        }
        Insert: {
          agency_id?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id: string
          rank?: string | null
          updated_at?: string
        }
        Update: {
          agency_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          rank?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      regulations: {
        Row: {
          code: string | null
          id: string
          jurisdiction: string | null
          summary: string | null
        }
        Insert: {
          code?: string | null
          id: string
          jurisdiction?: string | null
          summary?: string | null
        }
        Update: {
          code?: string | null
          id?: string
          jurisdiction?: string | null
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "regulations_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      relationships: {
        Row: {
          attributes: Json
          confidence: Database["public"]["Enums"]["confidence_level"]
          created_at: string
          created_by: string | null
          evidence_ids: string[]
          id: string
          source_id: string
          target_id: string
          type: string
        }
        Insert: {
          attributes?: Json
          confidence?: Database["public"]["Enums"]["confidence_level"]
          created_at?: string
          created_by?: string | null
          evidence_ids?: string[]
          id?: string
          source_id: string
          target_id: string
          type: string
        }
        Update: {
          attributes?: Json
          confidence?: Database["public"]["Enums"]["confidence_level"]
          created_at?: string
          created_by?: string | null
          evidence_ids?: string[]
          id?: string
          source_id?: string
          target_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "relationships_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationships_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_scores: {
        Row: {
          computed_at: string
          confidence: Database["public"]["Enums"]["confidence_level"]
          entity_id: string
          id: string
          inputs: Json
          model: string
          score: number
        }
        Insert: {
          computed_at?: string
          confidence?: Database["public"]["Enums"]["confidence_level"]
          entity_id: string
          id?: string
          inputs: Json
          model: string
          score: number
        }
        Update: {
          computed_at?: string
          confidence?: Database["public"]["Enums"]["confidence_level"]
          entity_id?: string
          id?: string
          inputs?: Json
          model?: string
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "risk_scores_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      signals: {
        Row: {
          confidence: Database["public"]["Enums"]["confidence_level"]
          domain: string
          entity_id: string | null
          evidence_ids: string[]
          id: string
          metadata: Json
          observed_at: string
          severity: string
          statement: string
        }
        Insert: {
          confidence?: Database["public"]["Enums"]["confidence_level"]
          domain: string
          entity_id?: string | null
          evidence_ids?: string[]
          id?: string
          metadata?: Json
          observed_at?: string
          severity?: string
          statement: string
        }
        Update: {
          confidence?: Database["public"]["Enums"]["confidence_level"]
          domain?: string
          entity_id?: string | null
          evidence_ids?: string[]
          id?: string
          metadata?: Json
          observed_at?: string
          severity?: string
          statement?: string
        }
        Relationships: [
          {
            foreignKeyName: "signals_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          granted_at: string
          granted_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vessels: {
        Row: {
          call_sign: string | null
          flag: string | null
          id: string
          imo: string | null
          mmsi: string | null
        }
        Insert: {
          call_sign?: string | null
          flag?: string | null
          id: string
          imo?: string | null
          mmsi?: string | null
        }
        Update: {
          call_sign?: string | null
          flag?: string | null
          id?: string
          imo?: string | null
          mmsi?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vessels_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      voyages: {
        Row: {
          ata: string | null
          atd: string | null
          destination_port_id: string | null
          eta: string | null
          etd: string | null
          id: string
          origin_port_id: string | null
          status: Database["public"]["Enums"]["voyage_status"]
          vessel_id: string | null
          voyage_number: string | null
        }
        Insert: {
          ata?: string | null
          atd?: string | null
          destination_port_id?: string | null
          eta?: string | null
          etd?: string | null
          id: string
          origin_port_id?: string | null
          status?: Database["public"]["Enums"]["voyage_status"]
          vessel_id?: string | null
          voyage_number?: string | null
        }
        Update: {
          ata?: string | null
          atd?: string | null
          destination_port_id?: string | null
          eta?: string | null
          etd?: string | null
          id?: string
          origin_port_id?: string | null
          status?: Database["public"]["Enums"]["voyage_status"]
          vessel_id?: string | null
          voyage_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voyages_destination_port_id_fkey"
            columns: ["destination_port_id"]
            isOneToOne: false
            referencedRelation: "ports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voyages_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voyages_origin_port_id_fkey"
            columns: ["origin_port_id"]
            isOneToOne: false
            referencedRelation: "ports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voyages_vessel_id_fkey"
            columns: ["vessel_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id"]
          },
        ]
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
      is_officer_or_above: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "analyst" | "officer" | "director" | "admin"
      confidence_level:
        | "OBSERVED"
        | "DECLARED"
        | "INFERRED"
        | "CORROBORATED"
        | "VERIFIED"
        | "AUDITED"
      entity_type:
        | "vessel"
        | "company"
        | "person"
        | "voyage"
        | "cargo"
        | "container"
        | "document"
        | "port"
        | "investigation"
        | "evidence"
        | "intelligence_report"
        | "agency"
        | "regulation"
      investigation_status:
        | "open"
        | "active"
        | "on_hold"
        | "escalated"
        | "closed"
      voyage_status:
        | "planned"
        | "in_transit"
        | "arrived"
        | "discharged"
        | "completed"
        | "cancelled"
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
      app_role: ["analyst", "officer", "director", "admin"],
      confidence_level: [
        "OBSERVED",
        "DECLARED",
        "INFERRED",
        "CORROBORATED",
        "VERIFIED",
        "AUDITED",
      ],
      entity_type: [
        "vessel",
        "company",
        "person",
        "voyage",
        "cargo",
        "container",
        "document",
        "port",
        "investigation",
        "evidence",
        "intelligence_report",
        "agency",
        "regulation",
      ],
      investigation_status: [
        "open",
        "active",
        "on_hold",
        "escalated",
        "closed",
      ],
      voyage_status: [
        "planned",
        "in_transit",
        "arrived",
        "discharged",
        "completed",
        "cancelled",
      ],
    },
  },
} as const
