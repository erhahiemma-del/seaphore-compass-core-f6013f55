export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      agencies: {
        Row: {
          code: string | null;
          full_name: string;
          id: string;
          jurisdiction: string | null;
        };
        Insert: {
          code?: string | null;
          full_name: string;
          id: string;
          jurisdiction?: string | null;
        };
        Update: {
          code?: string | null;
          full_name?: string;
          id?: string;
          jurisdiction?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "agencies_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "entities";
            referencedColumns: ["id"];
          },
        ];
      };
      alerts: {
        Row: {
          acknowledged_at: string | null;
          acknowledged_by: string | null;
          confidence: Database["public"]["Enums"]["confidence_level"];
          entity_id: string | null;
          id: string;
          metadata: Json;
          raised_at: string;
          severity: string;
          signal_id: string | null;
          status: string;
        };
        Insert: {
          acknowledged_at?: string | null;
          acknowledged_by?: string | null;
          confidence?: Database["public"]["Enums"]["confidence_level"];
          entity_id?: string | null;
          id?: string;
          metadata?: Json;
          raised_at?: string;
          severity?: string;
          signal_id?: string | null;
          status?: string;
        };
        Update: {
          acknowledged_at?: string | null;
          acknowledged_by?: string | null;
          confidence?: Database["public"]["Enums"]["confidence_level"];
          entity_id?: string | null;
          id?: string;
          metadata?: Json;
          raised_at?: string;
          severity?: string;
          signal_id?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "alerts_entity_id_fkey";
            columns: ["entity_id"];
            isOneToOne: false;
            referencedRelation: "entities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "alerts_signal_id_fkey";
            columns: ["signal_id"];
            isOneToOne: false;
            referencedRelation: "signals";
            referencedColumns: ["id"];
          },
        ];
      };
      arrival_alert_events: {
        Row: {
          actor_type: string;
          alert_id: string;
          at: string;
          id: string;
          next_state: string | null;
          note: string | null;
          officer_id: string | null;
          previous_state: string | null;
          type: string;
        };
        Insert: {
          actor_type: string;
          alert_id: string;
          at?: string;
          id?: string;
          next_state?: string | null;
          note?: string | null;
          officer_id?: string | null;
          previous_state?: string | null;
          type: string;
        };
        Update: {
          actor_type?: string;
          alert_id?: string;
          at?: string;
          id?: string;
          next_state?: string | null;
          note?: string | null;
          officer_id?: string | null;
          previous_state?: string | null;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "arrival_alert_events_alert_id_fkey";
            columns: ["alert_id"];
            isOneToOne: false;
            referencedRelation: "arrival_intervention_alerts";
            referencedColumns: ["id"];
          },
        ];
      };
      arrival_intervention_alerts: {
        Row: {
          acknowledged_at: string | null;
          acknowledged_by: string | null;
          assigned_at: string | null;
          assigned_by: string | null;
          assigned_to: string | null;
          closed_at: string | null;
          closed_by: string | null;
          closure_reason: string | null;
          condition: string;
          current_assessment: Json | null;
          current_assessment_unavailable: boolean;
          episode_sequence: number;
          id: string;
          imo: string;
          raised_at: string;
          resolution_reason: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          severity: string;
          state: string;
          trigger_evidence: Json;
          updated_at: string;
          version: number;
          vessel_id: string | null;
          vessel_name: string | null;
        };
        Insert: {
          acknowledged_at?: string | null;
          acknowledged_by?: string | null;
          assigned_at?: string | null;
          assigned_by?: string | null;
          assigned_to?: string | null;
          closed_at?: string | null;
          closed_by?: string | null;
          closure_reason?: string | null;
          condition: string;
          current_assessment?: Json | null;
          current_assessment_unavailable?: boolean;
          episode_sequence: number;
          id?: string;
          imo: string;
          raised_at?: string;
          resolution_reason?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          severity: string;
          state?: string;
          trigger_evidence: Json;
          updated_at?: string;
          version?: number;
          vessel_id?: string | null;
          vessel_name?: string | null;
        };
        Update: {
          acknowledged_at?: string | null;
          acknowledged_by?: string | null;
          assigned_at?: string | null;
          assigned_by?: string | null;
          assigned_to?: string | null;
          closed_at?: string | null;
          closed_by?: string | null;
          closure_reason?: string | null;
          condition?: string;
          current_assessment?: Json | null;
          current_assessment_unavailable?: boolean;
          episode_sequence?: number;
          id?: string;
          imo?: string;
          raised_at?: string;
          resolution_reason?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          severity?: string;
          state?: string;
          trigger_evidence?: Json;
          updated_at?: string;
          version?: number;
          vessel_id?: string | null;
          vessel_name?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "arrival_intervention_alerts_vessel_id_fkey";
            columns: ["vessel_id"];
            isOneToOne: false;
            referencedRelation: "vessels";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_log: {
        Row: {
          action: string;
          at: string;
          entity: string;
          entity_id: string | null;
          id: string;
          ip_address: string;
          metadata: Json;
          module: string;
          officer_id: string;
          rule_refs: string[];
        };
        Insert: {
          action: string;
          at?: string;
          entity: string;
          entity_id?: string | null;
          id?: string;
          ip_address: string;
          metadata?: Json;
          module: string;
          officer_id: string;
          rule_refs?: string[];
        };
        Update: {
          action?: string;
          at?: string;
          entity?: string;
          entity_id?: string | null;
          id?: string;
          ip_address?: string;
          metadata?: Json;
          module?: string;
          officer_id?: string;
          rule_refs?: string[];
        };
        Relationships: [];
      };
      briefing_overrides: {
        Row: {
          briefing_id: string;
          created_at: string;
          decision: string;
          id: string;
          justification: string | null;
          modifications: Json | null;
          officer_id: string;
        };
        Insert: {
          briefing_id: string;
          created_at?: string;
          decision: string;
          id?: string;
          justification?: string | null;
          modifications?: Json | null;
          officer_id: string;
        };
        Update: {
          briefing_id?: string;
          created_at?: string;
          decision?: string;
          id?: string;
          justification?: string | null;
          modifications?: Json | null;
          officer_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "briefing_overrides_briefing_id_fkey";
            columns: ["briefing_id"];
            isOneToOne: false;
            referencedRelation: "intel_briefings";
            referencedColumns: ["id"];
          },
        ];
      };
      briefings: {
        Row: {
          audience: string;
          authorized_at: string;
          authorized_by: string;
          export_envelope: Json;
          id: string;
          report_id: string | null;
        };
        Insert: {
          audience: string;
          authorized_at?: string;
          authorized_by: string;
          export_envelope: Json;
          id: string;
          report_id?: string | null;
        };
        Update: {
          audience?: string;
          authorized_at?: string;
          authorized_by?: string;
          export_envelope?: Json;
          id?: string;
          report_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "briefings_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "entities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "briefings_report_id_fkey";
            columns: ["report_id"];
            isOneToOne: false;
            referencedRelation: "intelligence_reports";
            referencedColumns: ["id"];
          },
        ];
      };
      candidate_relationships: {
        Row: {
          confidence: number;
          created_at: string;
          evidence_ids: string[];
          id: string;
          inferred_by: string;
          reasoning: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          source_entity_id: string;
          status: Database["public"]["Enums"]["candidate_status"];
          target_entity_id: string;
          type: string;
          updated_at: string;
        };
        Insert: {
          confidence?: number;
          created_at?: string;
          evidence_ids?: string[];
          id?: string;
          inferred_by: string;
          reasoning?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          source_entity_id: string;
          status?: Database["public"]["Enums"]["candidate_status"];
          target_entity_id: string;
          type: string;
          updated_at?: string;
        };
        Update: {
          confidence?: number;
          created_at?: string;
          evidence_ids?: string[];
          id?: string;
          inferred_by?: string;
          reasoning?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          source_entity_id?: string;
          status?: Database["public"]["Enums"]["candidate_status"];
          target_entity_id?: string;
          type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "candidate_relationships_source_entity_id_fkey";
            columns: ["source_entity_id"];
            isOneToOne: false;
            referencedRelation: "entities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "candidate_relationships_target_entity_id_fkey";
            columns: ["target_entity_id"];
            isOneToOne: false;
            referencedRelation: "entities";
            referencedColumns: ["id"];
          },
        ];
      };
      cargo_items: {
        Row: {
          commodity: string;
          currency: string | null;
          declared_value: number | null;
          hs_code: string | null;
          id: string;
          manifest_id: string;
          weight_kg: number | null;
        };
        Insert: {
          commodity: string;
          currency?: string | null;
          declared_value?: number | null;
          hs_code?: string | null;
          id: string;
          manifest_id: string;
          weight_kg?: number | null;
        };
        Update: {
          commodity?: string;
          currency?: string | null;
          declared_value?: number | null;
          hs_code?: string | null;
          id?: string;
          manifest_id?: string;
          weight_kg?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "cargo_items_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "entities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cargo_items_manifest_id_fkey";
            columns: ["manifest_id"];
            isOneToOne: false;
            referencedRelation: "manifests";
            referencedColumns: ["id"];
          },
        ];
      };
      companies: {
        Row: {
          cac_number: string | null;
          id: string;
          jurisdiction: string | null;
          lei: string | null;
          tax_id: string | null;
        };
        Insert: {
          cac_number?: string | null;
          id: string;
          jurisdiction?: string | null;
          lei?: string | null;
          tax_id?: string | null;
        };
        Update: {
          cac_number?: string | null;
          id?: string;
          jurisdiction?: string | null;
          lei?: string | null;
          tax_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "companies_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "entities";
            referencedColumns: ["id"];
          },
        ];
      };
      containers: {
        Row: {
          container_number: string | null;
          id: string;
          seal_number: string | null;
          voyage_id: string | null;
        };
        Insert: {
          container_number?: string | null;
          id: string;
          seal_number?: string | null;
          voyage_id?: string | null;
        };
        Update: {
          container_number?: string | null;
          id?: string;
          seal_number?: string | null;
          voyage_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "containers_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "entities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "containers_voyage_id_fkey";
            columns: ["voyage_id"];
            isOneToOne: false;
            referencedRelation: "voyages";
            referencedColumns: ["id"];
          },
        ];
      };
      copilot_rate_limit: {
        Row: {
          count: number;
          id: string;
          officer_id: string;
          window_start: string;
        };
        Insert: {
          count?: number;
          id?: string;
          officer_id: string;
          window_start?: string;
        };
        Update: {
          count?: number;
          id?: string;
          officer_id?: string;
          window_start?: string;
        };
        Relationships: [];
      };
      data_source_health: {
        Row: {
          checked_at: string;
          error_code: string | null;
          error_message: string | null;
          id: string;
          latency_ms: number | null;
          source_id: string;
          state: Database["public"]["Enums"]["data_source_health_state"];
        };
        Insert: {
          checked_at?: string;
          error_code?: string | null;
          error_message?: string | null;
          id?: string;
          latency_ms?: number | null;
          source_id: string;
          state: Database["public"]["Enums"]["data_source_health_state"];
        };
        Update: {
          checked_at?: string;
          error_code?: string | null;
          error_message?: string | null;
          id?: string;
          latency_ms?: number | null;
          source_id?: string;
          state?: Database["public"]["Enums"]["data_source_health_state"];
        };
        Relationships: [
          {
            foreignKeyName: "data_source_health_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "data_sources";
            referencedColumns: ["id"];
          },
        ];
      };
      data_sources: {
        Row: {
          active_from: string | null;
          citation: string;
          created_at: string;
          data_type: string;
          default_confidence: string;
          id: string;
          kind: string;
          notes: string | null;
          provider: string;
          scope: string | null;
          status: Database["public"]["Enums"]["data_source_status"];
          updated_at: string;
        };
        Insert: {
          active_from?: string | null;
          citation: string;
          created_at?: string;
          data_type: string;
          default_confidence: string;
          id: string;
          kind: string;
          notes?: string | null;
          provider: string;
          scope?: string | null;
          status: Database["public"]["Enums"]["data_source_status"];
          updated_at?: string;
        };
        Update: {
          active_from?: string | null;
          citation?: string;
          created_at?: string;
          data_type?: string;
          default_confidence?: string;
          id?: string;
          kind?: string;
          notes?: string | null;
          provider?: string;
          scope?: string | null;
          status?: Database["public"]["Enums"]["data_source_status"];
          updated_at?: string;
        };
        Relationships: [];
      };
      decisions: {
        Row: {
          decided_at: string;
          decision: string;
          id: string;
          immutable: boolean;
          investigation_id: string;
          notes: string | null;
          officer_id: string;
          reason: string;
          signature_data: string;
        };
        Insert: {
          decided_at?: string;
          decision: string;
          id?: string;
          immutable?: boolean;
          investigation_id: string;
          notes?: string | null;
          officer_id: string;
          reason: string;
          signature_data: string;
        };
        Update: {
          decided_at?: string;
          decision?: string;
          id?: string;
          immutable?: boolean;
          investigation_id?: string;
          notes?: string | null;
          officer_id?: string;
          reason?: string;
          signature_data?: string;
        };
        Relationships: [
          {
            foreignKeyName: "decisions_investigation_id_fkey";
            columns: ["investigation_id"];
            isOneToOne: false;
            referencedRelation: "investigations";
            referencedColumns: ["id"];
          },
        ];
      };
      documents: {
        Row: {
          doc_type: string;
          id: string;
          issued_at: string | null;
          issued_by_id: string | null;
          reference: string | null;
          storage_path: string | null;
          voyage_id: string | null;
        };
        Insert: {
          doc_type: string;
          id: string;
          issued_at?: string | null;
          issued_by_id?: string | null;
          reference?: string | null;
          storage_path?: string | null;
          voyage_id?: string | null;
        };
        Update: {
          doc_type?: string;
          id?: string;
          issued_at?: string | null;
          issued_by_id?: string | null;
          reference?: string | null;
          storage_path?: string | null;
          voyage_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "documents_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "entities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_issued_by_id_fkey";
            columns: ["issued_by_id"];
            isOneToOne: false;
            referencedRelation: "entities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_voyage_id_fkey";
            columns: ["voyage_id"];
            isOneToOne: false;
            referencedRelation: "voyages";
            referencedColumns: ["id"];
          },
        ];
      };
      entities: {
        Row: {
          aliases: string[];
          attributes: Json;
          confidence: Database["public"]["Enums"]["confidence_level"];
          created_at: string;
          created_by: string | null;
          evidence_ids: string[];
          id: string;
          name: string;
          risk_score: number | null;
          source_id: string | null;
          source_name: string | null;
          type: Database["public"]["Enums"]["entity_type"];
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          aliases?: string[];
          attributes?: Json;
          confidence?: Database["public"]["Enums"]["confidence_level"];
          created_at?: string;
          created_by?: string | null;
          evidence_ids?: string[];
          id?: string;
          name: string;
          risk_score?: number | null;
          source_id?: string | null;
          source_name?: string | null;
          type: Database["public"]["Enums"]["entity_type"];
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          aliases?: string[];
          attributes?: Json;
          confidence?: Database["public"]["Enums"]["confidence_level"];
          created_at?: string;
          created_by?: string | null;
          evidence_ids?: string[];
          id?: string;
          name?: string;
          risk_score?: number | null;
          source_id?: string | null;
          source_name?: string | null;
          type?: Database["public"]["Enums"]["entity_type"];
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      entity_history: {
        Row: {
          at: string;
          entity_id: string;
          field: string;
          id: string;
          new_value: Json | null;
          officer_id: string;
          old_value: Json | null;
        };
        Insert: {
          at?: string;
          entity_id: string;
          field: string;
          id?: string;
          new_value?: Json | null;
          officer_id: string;
          old_value?: Json | null;
        };
        Update: {
          at?: string;
          entity_id?: string;
          field?: string;
          id?: string;
          new_value?: Json | null;
          officer_id?: string;
          old_value?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "entity_history_entity_id_fkey";
            columns: ["entity_id"];
            isOneToOne: false;
            referencedRelation: "entities";
            referencedColumns: ["id"];
          },
        ];
      };
      evidence: {
        Row: {
          collected_at: string;
          collected_by: string | null;
          content_hash: string | null;
          derived_from_document_id: string | null;
          evidence_type: string;
          id: string;
          investigation_id: string;
          provenance: Json;
          source: string | null;
          storage_path: string | null;
          updated_at: string;
          version_history: Json;
        };
        Insert: {
          collected_at?: string;
          collected_by?: string | null;
          content_hash?: string | null;
          derived_from_document_id?: string | null;
          evidence_type: string;
          id?: string;
          investigation_id: string;
          provenance?: Json;
          source?: string | null;
          storage_path?: string | null;
          updated_at?: string;
          version_history?: Json;
        };
        Update: {
          collected_at?: string;
          collected_by?: string | null;
          content_hash?: string | null;
          derived_from_document_id?: string | null;
          evidence_type?: string;
          id?: string;
          investigation_id?: string;
          provenance?: Json;
          source?: string | null;
          storage_path?: string | null;
          updated_at?: string;
          version_history?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "evidence_derived_from_document_id_fkey";
            columns: ["derived_from_document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "evidence_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "entities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "evidence_investigation_id_fkey";
            columns: ["investigation_id"];
            isOneToOne: false;
            referencedRelation: "investigations";
            referencedColumns: ["id"];
          },
        ];
      };
      ice_conflicts: {
        Row: {
          age_differential_hrs: number | null;
          canonical_id: string;
          detected_at: string;
          field_name: string;
          id: string;
          is_critical_field: boolean;
          majority_sources: string[];
          majority_value: Json | null;
          minority_sources: string[];
          minority_value: Json | null;
          query_id: string;
          resolution: string;
          resolution_reason: string | null;
          severity: string;
        };
        Insert: {
          age_differential_hrs?: number | null;
          canonical_id: string;
          detected_at?: string;
          field_name: string;
          id?: string;
          is_critical_field?: boolean;
          majority_sources?: string[];
          majority_value?: Json | null;
          minority_sources?: string[];
          minority_value?: Json | null;
          query_id: string;
          resolution?: string;
          resolution_reason?: string | null;
          severity: string;
        };
        Update: {
          age_differential_hrs?: number | null;
          canonical_id?: string;
          detected_at?: string;
          field_name?: string;
          id?: string;
          is_critical_field?: boolean;
          majority_sources?: string[];
          majority_value?: Json | null;
          minority_sources?: string[];
          minority_value?: Json | null;
          query_id?: string;
          resolution?: string;
          resolution_reason?: string | null;
          severity?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ice_conflicts_query_id_fkey";
            columns: ["query_id"];
            isOneToOne: false;
            referencedRelation: "ice_queries";
            referencedColumns: ["id"];
          },
        ];
      };
      ice_correlation_matrix: {
        Row: {
          canonical_id: string;
          cell_status: string;
          completeness_score: number | null;
          corroboration_score: number | null;
          evidence_score: number | null;
          field_name: string;
          freshness_age_hrs: number | null;
          freshness_score: number | null;
          normalized_value: Json | null;
          original_unit: string | null;
          original_value: Json | null;
          quality_score: number | null;
          query_id: string;
          raw_hash: string | null;
          retrieved_at: string;
          source_id: string;
          source_url: string | null;
          tags: string[];
          trust_score: number | null;
        };
        Insert: {
          canonical_id: string;
          cell_status?: string;
          completeness_score?: number | null;
          corroboration_score?: number | null;
          evidence_score?: number | null;
          field_name: string;
          freshness_age_hrs?: number | null;
          freshness_score?: number | null;
          normalized_value?: Json | null;
          original_unit?: string | null;
          original_value?: Json | null;
          quality_score?: number | null;
          query_id: string;
          raw_hash?: string | null;
          retrieved_at: string;
          source_id: string;
          source_url?: string | null;
          tags?: string[];
          trust_score?: number | null;
        };
        Update: {
          canonical_id?: string;
          cell_status?: string;
          completeness_score?: number | null;
          corroboration_score?: number | null;
          evidence_score?: number | null;
          field_name?: string;
          freshness_age_hrs?: number | null;
          freshness_score?: number | null;
          normalized_value?: Json | null;
          original_unit?: string | null;
          original_value?: Json | null;
          quality_score?: number | null;
          query_id?: string;
          raw_hash?: string | null;
          retrieved_at?: string;
          source_id?: string;
          source_url?: string | null;
          tags?: string[];
          trust_score?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "ice_correlation_matrix_query_id_fkey";
            columns: ["query_id"];
            isOneToOne: false;
            referencedRelation: "ice_queries";
            referencedColumns: ["id"];
          },
        ];
      };
      ice_corroborations: {
        Row: {
          agreed_value: Json;
          agreeing_sources: string[];
          agreement_count: number;
          canonical_id: string;
          corroboration_level: string;
          detected_at: string;
          field_name: string;
          id: string;
          query_id: string;
          weighted_confidence: number;
        };
        Insert: {
          agreed_value: Json;
          agreeing_sources: string[];
          agreement_count: number;
          canonical_id: string;
          corroboration_level: string;
          detected_at?: string;
          field_name: string;
          id?: string;
          query_id: string;
          weighted_confidence: number;
        };
        Update: {
          agreed_value?: Json;
          agreeing_sources?: string[];
          agreement_count?: number;
          canonical_id?: string;
          corroboration_level?: string;
          detected_at?: string;
          field_name?: string;
          id?: string;
          query_id?: string;
          weighted_confidence?: number;
        };
        Relationships: [
          {
            foreignKeyName: "ice_corroborations_query_id_fkey";
            columns: ["query_id"];
            isOneToOne: false;
            referencedRelation: "ice_queries";
            referencedColumns: ["id"];
          },
        ];
      };
      ice_evidence_scores: {
        Row: {
          canonical_id: string;
          completeness_component: number | null;
          conflict_penalty: number;
          corroboration_component: number | null;
          evidence_score: number;
          field_name: string;
          freshness_component: number | null;
          quality_component: number | null;
          query_id: string;
          score_breakdown: Json;
          source_id: string;
          trust_component: number | null;
        };
        Insert: {
          canonical_id: string;
          completeness_component?: number | null;
          conflict_penalty?: number;
          corroboration_component?: number | null;
          evidence_score: number;
          field_name: string;
          freshness_component?: number | null;
          quality_component?: number | null;
          query_id: string;
          score_breakdown?: Json;
          source_id: string;
          trust_component?: number | null;
        };
        Update: {
          canonical_id?: string;
          completeness_component?: number | null;
          conflict_penalty?: number;
          corroboration_component?: number | null;
          evidence_score?: number;
          field_name?: string;
          freshness_component?: number | null;
          quality_component?: number | null;
          query_id?: string;
          score_breakdown?: Json;
          source_id?: string;
          trust_component?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "ice_evidence_scores_query_id_fkey";
            columns: ["query_id"];
            isOneToOne: false;
            referencedRelation: "ice_queries";
            referencedColumns: ["id"];
          },
        ];
      };
      ice_fused_intelligence: {
        Row: {
          canonical_id: string;
          cell_status: string;
          confidence: number;
          confidence_level: string;
          explanation_text: string | null;
          field_name: string;
          fused_at: string;
          fused_value: Json | null;
          fusion_policy_version: string;
          has_conflict: boolean;
          has_missing_data: boolean;
          query_id: string;
          requires_officer_review: boolean;
          winning_evidence_score: number | null;
          winning_source_id: string | null;
        };
        Insert: {
          canonical_id: string;
          cell_status: string;
          confidence: number;
          confidence_level: string;
          explanation_text?: string | null;
          field_name: string;
          fused_at?: string;
          fused_value?: Json | null;
          fusion_policy_version?: string;
          has_conflict?: boolean;
          has_missing_data?: boolean;
          query_id: string;
          requires_officer_review?: boolean;
          winning_evidence_score?: number | null;
          winning_source_id?: string | null;
        };
        Update: {
          canonical_id?: string;
          cell_status?: string;
          confidence?: number;
          confidence_level?: string;
          explanation_text?: string | null;
          field_name?: string;
          fused_at?: string;
          fused_value?: Json | null;
          fusion_policy_version?: string;
          has_conflict?: boolean;
          has_missing_data?: boolean;
          query_id?: string;
          requires_officer_review?: boolean;
          winning_evidence_score?: number | null;
          winning_source_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ice_fused_intelligence_query_id_fkey";
            columns: ["query_id"];
            isOneToOne: false;
            referencedRelation: "ice_queries";
            referencedColumns: ["id"];
          },
        ];
      };
      ice_queries: {
        Row: {
          completed_at: string | null;
          created_at: string;
          entity_hint: Json | null;
          id: string;
          intent: string | null;
          officer_id: string | null;
          query_text: string;
          risk_tier: string | null;
          status: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          entity_hint?: Json | null;
          id?: string;
          intent?: string | null;
          officer_id?: string | null;
          query_text: string;
          risk_tier?: string | null;
          status?: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          entity_hint?: Json | null;
          id?: string;
          intent?: string | null;
          officer_id?: string | null;
          query_text?: string;
          risk_tier?: string | null;
          status?: string;
        };
        Relationships: [];
      };
      ice_query_connectors: {
        Row: {
          created_at: string;
          id: string;
          latency_ms: number | null;
          query_id: string;
          records_fetched: number;
          selected: boolean;
          skipped_reason: string | null;
          source_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          latency_ms?: number | null;
          query_id: string;
          records_fetched?: number;
          selected: boolean;
          skipped_reason?: string | null;
          source_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          latency_ms?: number | null;
          query_id?: string;
          records_fetched?: number;
          selected?: boolean;
          skipped_reason?: string | null;
          source_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ice_query_connectors_query_id_fkey";
            columns: ["query_id"];
            isOneToOne: false;
            referencedRelation: "ice_queries";
            referencedColumns: ["id"];
          },
        ];
      };
      ice_recommendations: {
        Row: {
          acted_at: string | null;
          created_at: string;
          id: string;
          officer_acted: boolean;
          officer_action: string | null;
          priority: string;
          query_id: string;
          recommendation: string;
          trigger_condition: string;
          trigger_detail: Json | null;
        };
        Insert: {
          acted_at?: string | null;
          created_at?: string;
          id?: string;
          officer_acted?: boolean;
          officer_action?: string | null;
          priority: string;
          query_id: string;
          recommendation: string;
          trigger_condition: string;
          trigger_detail?: Json | null;
        };
        Update: {
          acted_at?: string | null;
          created_at?: string;
          id?: string;
          officer_acted?: boolean;
          officer_action?: string | null;
          priority?: string;
          query_id?: string;
          recommendation?: string;
          trigger_condition?: string;
          trigger_detail?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "ice_recommendations_query_id_fkey";
            columns: ["query_id"];
            isOneToOne: false;
            referencedRelation: "ice_queries";
            referencedColumns: ["id"];
          },
        ];
      };
      intel_briefings: {
        Row: {
          classification: Json;
          confidence_matrix: Json;
          created_at: string;
          id: string;
          intelligence_status: string;
          investigation_id: string | null;
          latency_ms: number | null;
          mode: Database["public"]["Enums"]["briefing_mode"];
          model_used: string | null;
          officer_id: string;
          query: string;
          sections: Json;
          session_id: string | null;
          source_uip_id: string | null;
          sources_corroborated: number;
          sources_queried: number;
          sources_responded: number;
          workspace: Database["public"]["Enums"]["workspace_kind"] | null;
        };
        Insert: {
          classification?: Json;
          confidence_matrix?: Json;
          created_at?: string;
          id?: string;
          intelligence_status?: string;
          investigation_id?: string | null;
          latency_ms?: number | null;
          mode: Database["public"]["Enums"]["briefing_mode"];
          model_used?: string | null;
          officer_id: string;
          query: string;
          sections?: Json;
          session_id?: string | null;
          source_uip_id?: string | null;
          sources_corroborated?: number;
          sources_queried?: number;
          sources_responded?: number;
          workspace?: Database["public"]["Enums"]["workspace_kind"] | null;
        };
        Update: {
          classification?: Json;
          confidence_matrix?: Json;
          created_at?: string;
          id?: string;
          intelligence_status?: string;
          investigation_id?: string | null;
          latency_ms?: number | null;
          mode?: Database["public"]["Enums"]["briefing_mode"];
          model_used?: string | null;
          officer_id?: string;
          query?: string;
          sections?: Json;
          session_id?: string | null;
          source_uip_id?: string | null;
          sources_corroborated?: number;
          sources_queried?: number;
          sources_responded?: number;
          workspace?: Database["public"]["Enums"]["workspace_kind"] | null;
        };
        Relationships: [
          {
            foreignKeyName: "intel_briefings_investigation_id_fkey";
            columns: ["investigation_id"];
            isOneToOne: false;
            referencedRelation: "investigations";
            referencedColumns: ["id"];
          },
        ];
      };
      intelligence_reports: {
        Row: {
          classification: string;
          id: string;
          investigation_id: string | null;
          issued_at: string | null;
          issued_by_agency_id: string | null;
          report_number: string;
        };
        Insert: {
          classification?: string;
          id: string;
          investigation_id?: string | null;
          issued_at?: string | null;
          issued_by_agency_id?: string | null;
          report_number: string;
        };
        Update: {
          classification?: string;
          id?: string;
          investigation_id?: string | null;
          issued_at?: string | null;
          issued_by_agency_id?: string | null;
          report_number?: string;
        };
        Relationships: [
          {
            foreignKeyName: "intelligence_reports_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "entities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "intelligence_reports_investigation_id_fkey";
            columns: ["investigation_id"];
            isOneToOne: false;
            referencedRelation: "investigations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "intelligence_reports_issued_by_agency_id_fkey";
            columns: ["issued_by_agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
        ];
      };
      investigations: {
        Row: {
          case_number: string;
          closed_at: string | null;
          deleted_at: string | null;
          id: string;
          lead_officer_id: string;
          opened_at: string;
          scenario: string | null;
          status: Database["public"]["Enums"]["investigation_status"];
          target_voyage_id: string | null;
          updated_at: string;
        };
        Insert: {
          case_number: string;
          closed_at?: string | null;
          deleted_at?: string | null;
          id?: string;
          lead_officer_id: string;
          opened_at?: string;
          scenario?: string | null;
          status?: Database["public"]["Enums"]["investigation_status"];
          target_voyage_id?: string | null;
          updated_at?: string;
        };
        Update: {
          case_number?: string;
          closed_at?: string | null;
          deleted_at?: string | null;
          id?: string;
          lead_officer_id?: string;
          opened_at?: string;
          scenario?: string | null;
          status?: Database["public"]["Enums"]["investigation_status"];
          target_voyage_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "investigations_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "entities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "investigations_target_voyage_id_fkey";
            columns: ["target_voyage_id"];
            isOneToOne: false;
            referencedRelation: "voyages";
            referencedColumns: ["id"];
          },
        ];
      };
      manifests: {
        Row: {
          id: string;
          submitted_at: string | null;
          submitted_by_id: string | null;
          version: number;
          voyage_id: string;
        };
        Insert: {
          id: string;
          submitted_at?: string | null;
          submitted_by_id?: string | null;
          version?: number;
          voyage_id: string;
        };
        Update: {
          id?: string;
          submitted_at?: string | null;
          submitted_by_id?: string | null;
          version?: number;
          voyage_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "manifests_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "entities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "manifests_submitted_by_id_fkey";
            columns: ["submitted_by_id"];
            isOneToOne: false;
            referencedRelation: "entities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "manifests_voyage_id_fkey";
            columns: ["voyage_id"];
            isOneToOne: false;
            referencedRelation: "voyages";
            referencedColumns: ["id"];
          },
        ];
      };
      officer_action_counters: {
        Row: {
          action_key: string;
          count: number;
          officer_id: string;
          window_day: string;
        };
        Insert: {
          action_key: string;
          count?: number;
          officer_id: string;
          window_day?: string;
        };
        Update: {
          action_key?: string;
          count?: number;
          officer_id?: string;
          window_day?: string;
        };
        Relationships: [];
      };
      okl_ingests: {
        Row: {
          briefing_id: string | null;
          created_at: string;
          decision_count: number;
          entity_count: number;
          id: string;
          investigation_id: string;
          investigation_title: string | null;
          officer_id: string | null;
          officer_name: string | null;
          overall_confidence: number | null;
          overall_risk: string | null;
          package_id: string;
          pattern_count: number;
          snapshot: Json;
          source_uip_id: string;
          version: number;
        };
        Insert: {
          briefing_id?: string | null;
          created_at?: string;
          decision_count?: number;
          entity_count?: number;
          id?: string;
          investigation_id: string;
          investigation_title?: string | null;
          officer_id?: string | null;
          officer_name?: string | null;
          overall_confidence?: number | null;
          overall_risk?: string | null;
          package_id: string;
          pattern_count?: number;
          snapshot: Json;
          source_uip_id: string;
          version?: number;
        };
        Update: {
          briefing_id?: string | null;
          created_at?: string;
          decision_count?: number;
          entity_count?: number;
          id?: string;
          investigation_id?: string;
          investigation_title?: string | null;
          officer_id?: string | null;
          officer_name?: string | null;
          overall_confidence?: number | null;
          overall_risk?: string | null;
          package_id?: string;
          pattern_count?: number;
          snapshot?: Json;
          source_uip_id?: string;
          version?: number;
        };
        Relationships: [];
      };
      okl_records: {
        Row: {
          briefing_id: string | null;
          confidence: number | null;
          created_at: string;
          detail: string | null;
          entity_id: string | null;
          entity_kind: string | null;
          entity_label: string | null;
          id: string;
          ingest_id: string;
          investigation_id: string;
          kind: string;
          label: string | null;
          pattern_kind: string | null;
          payload: Json;
          risk_level: string | null;
          source_uip_id: string;
        };
        Insert: {
          briefing_id?: string | null;
          confidence?: number | null;
          created_at?: string;
          detail?: string | null;
          entity_id?: string | null;
          entity_kind?: string | null;
          entity_label?: string | null;
          id?: string;
          ingest_id: string;
          investigation_id: string;
          kind: string;
          label?: string | null;
          pattern_kind?: string | null;
          payload?: Json;
          risk_level?: string | null;
          source_uip_id: string;
        };
        Update: {
          briefing_id?: string | null;
          confidence?: number | null;
          created_at?: string;
          detail?: string | null;
          entity_id?: string | null;
          entity_kind?: string | null;
          entity_label?: string | null;
          id?: string;
          ingest_id?: string;
          investigation_id?: string;
          kind?: string;
          label?: string | null;
          pattern_kind?: string | null;
          payload?: Json;
          risk_level?: string | null;
          source_uip_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "okl_records_ingest_id_fkey";
            columns: ["ingest_id"];
            isOneToOne: false;
            referencedRelation: "okl_ingests";
            referencedColumns: ["id"];
          },
        ];
      };
      orchestration_events: {
        Row: {
          created_at: string;
          emitted_by: string | null;
          entity_ids: string[];
          event_type: string;
          id: string;
          payload: Json;
        };
        Insert: {
          created_at?: string;
          emitted_by?: string | null;
          entity_ids?: string[];
          event_type: string;
          id?: string;
          payload?: Json;
        };
        Update: {
          created_at?: string;
          emitted_by?: string | null;
          entity_ids?: string[];
          event_type?: string;
          id?: string;
          payload?: Json;
        };
        Relationships: [];
      };
      osint_connectors: {
        Row: {
          auth_method: string;
          avg_latency_ms: number;
          category: string;
          created_at: string;
          description: string;
          endpoint: string;
          error_rate_7d: number;
          health_status: string;
          id: string;
          is_active: boolean;
          last_sync_at: string | null;
          last_sync_status: string | null;
          name: string;
          polling_interval_minutes: number;
          rate_limit_per_minute: number;
          records_last_run: number;
          records_total: number;
          updated_at: string;
        };
        Insert: {
          auth_method: string;
          avg_latency_ms?: number;
          category: string;
          created_at?: string;
          description?: string;
          endpoint: string;
          error_rate_7d?: number;
          health_status?: string;
          id?: string;
          is_active?: boolean;
          last_sync_at?: string | null;
          last_sync_status?: string | null;
          name: string;
          polling_interval_minutes?: number;
          rate_limit_per_minute?: number;
          records_last_run?: number;
          records_total?: number;
          updated_at?: string;
        };
        Update: {
          auth_method?: string;
          avg_latency_ms?: number;
          category?: string;
          created_at?: string;
          description?: string;
          endpoint?: string;
          error_rate_7d?: number;
          health_status?: string;
          id?: string;
          is_active?: boolean;
          last_sync_at?: string | null;
          last_sync_status?: string | null;
          name?: string;
          polling_interval_minutes?: number;
          rate_limit_per_minute?: number;
          records_last_run?: number;
          records_total?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      osint_dead_letters: {
        Row: {
          attempts: number;
          connector_id: string | null;
          created_at: string;
          error_message: string;
          id: string;
          last_attempt_at: string;
          raw_payload: Json;
          resolved: boolean;
          source_ref: string | null;
          sync_run_id: string | null;
        };
        Insert: {
          attempts?: number;
          connector_id?: string | null;
          created_at?: string;
          error_message: string;
          id?: string;
          last_attempt_at?: string;
          raw_payload?: Json;
          resolved?: boolean;
          source_ref?: string | null;
          sync_run_id?: string | null;
        };
        Update: {
          attempts?: number;
          connector_id?: string | null;
          created_at?: string;
          error_message?: string;
          id?: string;
          last_attempt_at?: string;
          raw_payload?: Json;
          resolved?: boolean;
          source_ref?: string | null;
          sync_run_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "osint_dead_letters_connector_id_fkey";
            columns: ["connector_id"];
            isOneToOne: false;
            referencedRelation: "osint_connectors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "osint_dead_letters_sync_run_id_fkey";
            columns: ["sync_run_id"];
            isOneToOne: false;
            referencedRelation: "osint_sync_runs";
            referencedColumns: ["id"];
          },
        ];
      };
      osint_entity_index: {
        Row: {
          created_at: string;
          entity_id: string;
          entity_type: string;
          id: string;
          record_id: string;
        };
        Insert: {
          created_at?: string;
          entity_id: string;
          entity_type: string;
          id?: string;
          record_id: string;
        };
        Update: {
          created_at?: string;
          entity_id?: string;
          entity_type?: string;
          id?: string;
          record_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "osint_entity_index_record_id_fkey";
            columns: ["record_id"];
            isOneToOne: false;
            referencedRelation: "osint_records";
            referencedColumns: ["id"];
          },
        ];
      };
      osint_graph_edges: {
        Row: {
          confidence: number;
          created_at: string;
          from_entity_id: string;
          from_entity_type: string;
          id: string;
          relationship: string;
          source_record_id: string | null;
          to_entity_id: string;
          to_entity_type: string;
        };
        Insert: {
          confidence?: number;
          created_at?: string;
          from_entity_id: string;
          from_entity_type: string;
          id?: string;
          relationship: string;
          source_record_id?: string | null;
          to_entity_id: string;
          to_entity_type: string;
        };
        Update: {
          confidence?: number;
          created_at?: string;
          from_entity_id?: string;
          from_entity_type?: string;
          id?: string;
          relationship?: string;
          source_record_id?: string | null;
          to_entity_id?: string;
          to_entity_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "osint_graph_edges_source_record_id_fkey";
            columns: ["source_record_id"];
            isOneToOne: false;
            referencedRelation: "osint_records";
            referencedColumns: ["id"];
          },
        ];
      };
      osint_records: {
        Row: {
          confidence: number;
          confidence_level: string;
          created_at: string;
          data: Json;
          entity_id: string;
          entity_type: string;
          fetched_at: string;
          id: string;
          raw_data: Json;
          source_id: string;
          source_ref: string;
          sync_run_id: string | null;
          tags: string[];
          updated_at: string;
          valid_from: string;
          valid_to: string | null;
        };
        Insert: {
          confidence?: number;
          confidence_level: string;
          created_at?: string;
          data?: Json;
          entity_id: string;
          entity_type: string;
          fetched_at?: string;
          id?: string;
          raw_data?: Json;
          source_id: string;
          source_ref: string;
          sync_run_id?: string | null;
          tags?: string[];
          updated_at?: string;
          valid_from?: string;
          valid_to?: string | null;
        };
        Update: {
          confidence?: number;
          confidence_level?: string;
          created_at?: string;
          data?: Json;
          entity_id?: string;
          entity_type?: string;
          fetched_at?: string;
          id?: string;
          raw_data?: Json;
          source_id?: string;
          source_ref?: string;
          sync_run_id?: string | null;
          tags?: string[];
          updated_at?: string;
          valid_from?: string;
          valid_to?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "osint_records_sync_run_id_fkey";
            columns: ["sync_run_id"];
            isOneToOne: false;
            referencedRelation: "osint_sync_runs";
            referencedColumns: ["id"];
          },
        ];
      };
      osint_source_trust: {
        Row: {
          field_category: string;
          source_id: string;
          trust_score: number;
          updated_at: string;
        };
        Insert: {
          field_category: string;
          source_id: string;
          trust_score: number;
          updated_at?: string;
        };
        Update: {
          field_category?: string;
          source_id?: string;
          trust_score?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      osint_sync_runs: {
        Row: {
          completed_at: string | null;
          connector_id: string;
          created_at: string;
          errors: Json;
          id: string;
          latency_ms: number | null;
          records_fetched: number;
          records_ingested: number;
          started_at: string;
          status: string;
        };
        Insert: {
          completed_at?: string | null;
          connector_id: string;
          created_at?: string;
          errors?: Json;
          id?: string;
          latency_ms?: number | null;
          records_fetched?: number;
          records_ingested?: number;
          started_at?: string;
          status?: string;
        };
        Update: {
          completed_at?: string | null;
          connector_id?: string;
          created_at?: string;
          errors?: Json;
          id?: string;
          latency_ms?: number | null;
          records_fetched?: number;
          records_ingested?: number;
          started_at?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "osint_sync_runs_connector_id_fkey";
            columns: ["connector_id"];
            isOneToOne: false;
            referencedRelation: "osint_connectors";
            referencedColumns: ["id"];
          },
        ];
      };
      persons: {
        Row: {
          id: string;
          passport: string | null;
          role: string | null;
        };
        Insert: {
          id: string;
          passport?: string | null;
          role?: string | null;
        };
        Update: {
          id?: string;
          passport?: string | null;
          role?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "persons_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "entities";
            referencedColumns: ["id"];
          },
        ];
      };
      ports: {
        Row: {
          country: string;
          id: string;
          terminals: string[];
          unlocode: string | null;
        };
        Insert: {
          country: string;
          id: string;
          terminals?: string[];
          unlocode?: string | null;
        };
        Update: {
          country?: string;
          id?: string;
          terminals?: string[];
          unlocode?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ports_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "entities";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          agency_id: string | null;
          created_at: string;
          email: string | null;
          full_name: string;
          id: string;
          rank: string | null;
          updated_at: string;
        };
        Insert: {
          agency_id?: string | null;
          created_at?: string;
          email?: string | null;
          full_name: string;
          id: string;
          rank?: string | null;
          updated_at?: string;
        };
        Update: {
          agency_id?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string;
          id?: string;
          rank?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      regulations: {
        Row: {
          code: string | null;
          id: string;
          jurisdiction: string | null;
          summary: string | null;
        };
        Insert: {
          code?: string | null;
          id: string;
          jurisdiction?: string | null;
          summary?: string | null;
        };
        Update: {
          code?: string | null;
          id?: string;
          jurisdiction?: string | null;
          summary?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "regulations_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "entities";
            referencedColumns: ["id"];
          },
        ];
      };
      relationships: {
        Row: {
          attributes: Json;
          confidence: Database["public"]["Enums"]["confidence_level"];
          created_at: string;
          created_by: string | null;
          evidence_ids: string[];
          id: string;
          source_id: string;
          target_id: string;
          type: string;
        };
        Insert: {
          attributes?: Json;
          confidence?: Database["public"]["Enums"]["confidence_level"];
          created_at?: string;
          created_by?: string | null;
          evidence_ids?: string[];
          id?: string;
          source_id: string;
          target_id: string;
          type: string;
        };
        Update: {
          attributes?: Json;
          confidence?: Database["public"]["Enums"]["confidence_level"];
          created_at?: string;
          created_by?: string | null;
          evidence_ids?: string[];
          id?: string;
          source_id?: string;
          target_id?: string;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "relationships_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "entities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "relationships_target_id_fkey";
            columns: ["target_id"];
            isOneToOne: false;
            referencedRelation: "entities";
            referencedColumns: ["id"];
          },
        ];
      };
      report_jobs: {
        Row: {
          artifact_path: string | null;
          attempts: number;
          claimed_at: string | null;
          claimed_by: string | null;
          created_at: string;
          id: string;
          last_error: string | null;
          max_attempts: number;
          owner_user_id: string;
          period: string;
          report_type: string;
          result_summary: Json;
          run_after: string;
          schedule_id: string | null;
          scheduled_for: string;
          status: string;
          updated_at: string;
          workspace_ids: string[];
        };
        Insert: {
          artifact_path?: string | null;
          attempts?: number;
          claimed_at?: string | null;
          claimed_by?: string | null;
          created_at?: string;
          id?: string;
          last_error?: string | null;
          max_attempts?: number;
          owner_user_id: string;
          period: string;
          report_type: string;
          result_summary?: Json;
          run_after?: string;
          schedule_id?: string | null;
          scheduled_for?: string;
          status?: string;
          updated_at?: string;
          workspace_ids?: string[];
        };
        Update: {
          artifact_path?: string | null;
          attempts?: number;
          claimed_at?: string | null;
          claimed_by?: string | null;
          created_at?: string;
          id?: string;
          last_error?: string | null;
          max_attempts?: number;
          owner_user_id?: string;
          period?: string;
          report_type?: string;
          result_summary?: Json;
          run_after?: string;
          schedule_id?: string | null;
          scheduled_for?: string;
          status?: string;
          updated_at?: string;
          workspace_ids?: string[];
        };
        Relationships: [
          {
            foreignKeyName: "report_jobs_schedule_id_fkey";
            columns: ["schedule_id"];
            isOneToOne: false;
            referencedRelation: "report_schedules";
            referencedColumns: ["id"];
          },
        ];
      };
      report_schedules: {
        Row: {
          active: boolean;
          cadence: string;
          created_at: string;
          id: string;
          last_run_at: string | null;
          name: string;
          next_run_at: string;
          owner_user_id: string;
          period: string;
          report_type: string;
          updated_at: string;
          workspace_ids: string[];
        };
        Insert: {
          active?: boolean;
          cadence: string;
          created_at?: string;
          id?: string;
          last_run_at?: string | null;
          name: string;
          next_run_at: string;
          owner_user_id: string;
          period: string;
          report_type: string;
          updated_at?: string;
          workspace_ids?: string[];
        };
        Update: {
          active?: boolean;
          cadence?: string;
          created_at?: string;
          id?: string;
          last_run_at?: string | null;
          name?: string;
          next_run_at?: string;
          owner_user_id?: string;
          period?: string;
          report_type?: string;
          updated_at?: string;
          workspace_ids?: string[];
        };
        Relationships: [];
      };
      risk_scores: {
        Row: {
          computed_at: string;
          confidence: Database["public"]["Enums"]["confidence_level"];
          entity_id: string;
          id: string;
          inputs: Json;
          model: string;
          score: number;
        };
        Insert: {
          computed_at?: string;
          confidence?: Database["public"]["Enums"]["confidence_level"];
          entity_id: string;
          id?: string;
          inputs: Json;
          model: string;
          score: number;
        };
        Update: {
          computed_at?: string;
          confidence?: Database["public"]["Enums"]["confidence_level"];
          entity_id?: string;
          id?: string;
          inputs?: Json;
          model?: string;
          score?: number;
        };
        Relationships: [
          {
            foreignKeyName: "risk_scores_entity_id_fkey";
            columns: ["entity_id"];
            isOneToOne: false;
            referencedRelation: "entities";
            referencedColumns: ["id"];
          },
        ];
      };
      sessions: {
        Row: {
          channel: string;
          context: Json;
          created_at: string;
          ended_at: string | null;
          id: string;
          investigation_id: string | null;
          started_at: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          channel?: string;
          context?: Json;
          created_at?: string;
          ended_at?: string | null;
          id?: string;
          investigation_id?: string | null;
          started_at?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          channel?: string;
          context?: Json;
          created_at?: string;
          ended_at?: string | null;
          id?: string;
          investigation_id?: string | null;
          started_at?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sessions_investigation_id_fkey";
            columns: ["investigation_id"];
            isOneToOne: false;
            referencedRelation: "investigations";
            referencedColumns: ["id"];
          },
        ];
      };
      signals: {
        Row: {
          confidence: Database["public"]["Enums"]["confidence_level"];
          domain: string;
          entity_id: string | null;
          evidence_ids: string[];
          id: string;
          metadata: Json;
          observed_at: string;
          severity: string;
          statement: string;
        };
        Insert: {
          confidence?: Database["public"]["Enums"]["confidence_level"];
          domain: string;
          entity_id?: string | null;
          evidence_ids?: string[];
          id?: string;
          metadata?: Json;
          observed_at?: string;
          severity?: string;
          statement: string;
        };
        Update: {
          confidence?: Database["public"]["Enums"]["confidence_level"];
          domain?: string;
          entity_id?: string | null;
          evidence_ids?: string[];
          id?: string;
          metadata?: Json;
          observed_at?: string;
          severity?: string;
          statement?: string;
        };
        Relationships: [
          {
            foreignKeyName: "signals_entity_id_fkey";
            columns: ["entity_id"];
            isOneToOne: false;
            referencedRelation: "entities";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          granted_at: string;
          granted_by: string | null;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          granted_at?: string;
          granted_by?: string | null;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          granted_at?: string;
          granted_by?: string | null;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      vessels: {
        Row: {
          call_sign: string | null;
          flag: string | null;
          id: string;
          imo: string | null;
          mmsi: string | null;
        };
        Insert: {
          call_sign?: string | null;
          flag?: string | null;
          id: string;
          imo?: string | null;
          mmsi?: string | null;
        };
        Update: {
          call_sign?: string | null;
          flag?: string | null;
          id?: string;
          imo?: string | null;
          mmsi?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "vessels_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "entities";
            referencedColumns: ["id"];
          },
        ];
      };
      voyages: {
        Row: {
          ata: string | null;
          atd: string | null;
          destination_port_id: string | null;
          eta: string | null;
          etd: string | null;
          id: string;
          origin_port_id: string | null;
          status: Database["public"]["Enums"]["voyage_status"];
          vessel_id: string | null;
          voyage_number: string | null;
        };
        Insert: {
          ata?: string | null;
          atd?: string | null;
          destination_port_id?: string | null;
          eta?: string | null;
          etd?: string | null;
          id: string;
          origin_port_id?: string | null;
          status?: Database["public"]["Enums"]["voyage_status"];
          vessel_id?: string | null;
          voyage_number?: string | null;
        };
        Update: {
          ata?: string | null;
          atd?: string | null;
          destination_port_id?: string | null;
          eta?: string | null;
          etd?: string | null;
          id?: string;
          origin_port_id?: string | null;
          status?: Database["public"]["Enums"]["voyage_status"];
          vessel_id?: string | null;
          voyage_number?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "voyages_destination_port_id_fkey";
            columns: ["destination_port_id"];
            isOneToOne: false;
            referencedRelation: "ports";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "voyages_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "entities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "voyages_origin_port_id_fkey";
            columns: ["origin_port_id"];
            isOneToOne: false;
            referencedRelation: "ports";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "voyages_vessel_id_fkey";
            columns: ["vessel_id"];
            isOneToOne: false;
            referencedRelation: "vessels";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_officer_or_above: { Args: { _user_id: string }; Returns: boolean };
      mibc_claim_next_job: {
        Args: { _worker: string };
        Returns: {
          artifact_path: string | null;
          attempts: number;
          claimed_at: string | null;
          claimed_by: string | null;
          created_at: string;
          id: string;
          last_error: string | null;
          max_attempts: number;
          owner_user_id: string;
          period: string;
          report_type: string;
          result_summary: Json;
          run_after: string;
          schedule_id: string | null;
          scheduled_for: string;
          status: string;
          updated_at: string;
          workspace_ids: string[];
        }[];
        SetofOptions: {
          from: "*";
          to: "report_jobs";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      mibc_dispatch_tick: { Args: never; Returns: Json };
      mibc_next_run: {
        Args: { _cadence: string; _from: string };
        Returns: string;
      };
    };
    Enums: {
      app_role: "analyst" | "officer" | "director" | "admin" | "external_agency";
      briefing_mode: "lookup" | "assessment" | "investigation" | "forecast";
      candidate_status: "pending" | "approved" | "rejected";
      confidence_level:
        | "OBSERVED"
        | "DECLARED"
        | "INFERRED"
        | "CORROBORATED"
        | "VERIFIED"
        | "AUDITED";
      data_source_health_state: "OK" | "DEGRADED" | "DOWN" | "UNKNOWN" | "NOT_APPLICABLE";
      data_source_status: "ACTIVE" | "PARTIAL" | "PLANNED" | "INFERRED" | "NOT_IN_SCOPE";
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
        | "regulation";
      evidence_grade:
        | "VERIFIED"
        | "CORROBORATED"
        | "OBSERVED"
        | "REPORTED"
        | "INFERRED"
        | "UNKNOWN";
      investigation_status: "open" | "active" | "on_hold" | "escalated" | "closed";
      voyage_status:
        | "planned"
        | "in_transit"
        | "arrived"
        | "discharged"
        | "completed"
        | "cancelled";
      workspace_kind: "ownership" | "revenue" | "compliance" | "evidence" | "vessel" | "port";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["analyst", "officer", "director", "admin", "external_agency"],
      briefing_mode: ["lookup", "assessment", "investigation", "forecast"],
      candidate_status: ["pending", "approved", "rejected"],
      confidence_level: ["OBSERVED", "DECLARED", "INFERRED", "CORROBORATED", "VERIFIED", "AUDITED"],
      data_source_health_state: ["OK", "DEGRADED", "DOWN", "UNKNOWN", "NOT_APPLICABLE"],
      data_source_status: ["ACTIVE", "PARTIAL", "PLANNED", "INFERRED", "NOT_IN_SCOPE"],
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
      evidence_grade: ["VERIFIED", "CORROBORATED", "OBSERVED", "REPORTED", "INFERRED", "UNKNOWN"],
      investigation_status: ["open", "active", "on_hold", "escalated", "closed"],
      voyage_status: ["planned", "in_transit", "arrived", "discharged", "completed", "cancelled"],
      workspace_kind: ["ownership", "revenue", "compliance", "evidence", "vessel", "port"],
    },
  },
} as const;
