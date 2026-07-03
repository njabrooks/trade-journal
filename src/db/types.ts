// Auto-generated TypeScript types from Supabase
// Generated via: mcp_supabase_generate_typescript_types (last regen 2026-07-03)
// This file is for reference - use Drizzle schema for actual queries

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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          account_number: string | null
          account_type: string | null
          base_currency: string | null
          broker_account_id: string
          broker_name: string
          cost_basis_method: string | null
          created_at: string
          id: string
          institution: string | null
          is_active: boolean | null
          label: string | null
          owner: string | null
          owner_id: string | null
          updated_at: string
        }
        Insert: {
          account_number?: string | null
          account_type?: string | null
          base_currency?: string | null
          broker_account_id: string
          broker_name: string
          cost_basis_method?: string | null
          created_at?: string
          id?: string
          institution?: string | null
          is_active?: boolean | null
          label?: string | null
          owner?: string | null
          owner_id?: string | null
          updated_at?: string
        }
        Update: {
          account_number?: string | null
          account_type?: string | null
          base_currency?: string | null
          broker_account_id?: string
          broker_name?: string
          cost_basis_method?: string | null
          created_at?: string
          id?: string
          institution?: string | null
          is_active?: boolean | null
          label?: string | null
          owner?: string | null
          owner_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
        ]
      }
      advisor_recommendations: {
        Row: {
          batch_id: string
          created_at: string
          expires_at: string | null
          exposure_usd: number | null
          id: string
          metrics: Json
          pct_nav: number | null
          rationale: string
          scenario: string
          source: string
          status: string
          structure: Json
          ticker: string
          underlying_id: string | null
          updated_at: string
          vol_context: Json | null
        }
        Insert: {
          batch_id: string
          created_at?: string
          expires_at?: string | null
          exposure_usd?: number | null
          id?: string
          metrics: Json
          pct_nav?: number | null
          rationale: string
          scenario: string
          source?: string
          status?: string
          structure: Json
          ticker: string
          underlying_id?: string | null
          updated_at?: string
          vol_context?: Json | null
        }
        Update: {
          batch_id?: string
          created_at?: string
          expires_at?: string | null
          exposure_usd?: number | null
          id?: string
          metrics?: Json
          pct_nav?: number | null
          rationale?: string
          scenario?: string
          source?: string
          status?: string
          structure?: Json
          ticker?: string
          underlying_id?: string | null
          updated_at?: string
          vol_context?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "advisor_recommendations_underlying_id_fkey"
            columns: ["underlying_id"]
            isOneToOne: false
            referencedRelation: "underlyings"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_aliases: {
        Row: {
          alias: string
          asset_id: string
          created_at: string
          id: string
          source: string | null
        }
        Insert: {
          alias: string
          asset_id: string
          created_at?: string
          id?: string
          source?: string | null
        }
        Update: {
          alias?: string
          asset_id?: string
          created_at?: string
          id?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asset_aliases_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_theses: {
        Row: {
          actual_outcome_date: string | null
          actual_price: number | null
          ai_summary: string | null
          ai_summary_claim_count: number | null
          ai_summary_claim_ids: string[] | null
          ai_summary_detail_level: string | null
          ai_summary_generated_at: string | null
          claims_count_at_last_articulation: number | null
          confidence_level: string | null
          created_at: string
          description: string | null
          direction: string | null
          entry_reference_price: number | null
          fundamental_context: string | null
          id: string
          last_reviewed_at: string | null
          narrative: string | null
          next_review_due_at: string | null
          notes: Json | null
          outcome: string | null
          outcome_notes: string | null
          pipeline_idea_ref: string | null
          pipeline_stage: number | null
          position_end_date: string | null
          position_start_date: string | null
          positioning_context: string | null
          regime_context: string | null
          retrospective_metrics: Json | null
          status: string
          target_price: number | null
          time_horizon: string | null
          title: string
          underlying_id: string | null
          updated_at: string
        }
        Insert: {
          actual_outcome_date?: string | null
          actual_price?: number | null
          ai_summary?: string | null
          ai_summary_claim_count?: number | null
          ai_summary_claim_ids?: string[] | null
          ai_summary_detail_level?: string | null
          ai_summary_generated_at?: string | null
          claims_count_at_last_articulation?: number | null
          confidence_level?: string | null
          created_at?: string
          description?: string | null
          direction?: string | null
          entry_reference_price?: number | null
          fundamental_context?: string | null
          id?: string
          last_reviewed_at?: string | null
          narrative?: string | null
          next_review_due_at?: string | null
          notes?: Json | null
          outcome?: string | null
          outcome_notes?: string | null
          pipeline_idea_ref?: string | null
          pipeline_stage?: number | null
          position_end_date?: string | null
          position_start_date?: string | null
          positioning_context?: string | null
          regime_context?: string | null
          retrospective_metrics?: Json | null
          status?: string
          target_price?: number | null
          time_horizon?: string | null
          title: string
          underlying_id?: string | null
          updated_at?: string
        }
        Update: {
          actual_outcome_date?: string | null
          actual_price?: number | null
          ai_summary?: string | null
          ai_summary_claim_count?: number | null
          ai_summary_claim_ids?: string[] | null
          ai_summary_detail_level?: string | null
          ai_summary_generated_at?: string | null
          claims_count_at_last_articulation?: number | null
          confidence_level?: string | null
          created_at?: string
          description?: string | null
          direction?: string | null
          entry_reference_price?: number | null
          fundamental_context?: string | null
          id?: string
          last_reviewed_at?: string | null
          narrative?: string | null
          next_review_due_at?: string | null
          notes?: Json | null
          outcome?: string | null
          outcome_notes?: string | null
          pipeline_idea_ref?: string | null
          pipeline_stage?: number | null
          position_end_date?: string | null
          position_start_date?: string | null
          positioning_context?: string | null
          regime_context?: string | null
          retrospective_metrics?: Json | null
          status?: string
          target_price?: number | null
          time_horizon?: string | null
          title?: string
          underlying_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_views_underlying_id_fkey"
            columns: ["underlying_id"]
            isOneToOne: false
            referencedRelation: "underlyings"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_thesis_related_macro_theses: {
        Row: {
          added_at: string
          added_by: string | null
          asset_thesis_id: string
          id: string
          macro_thesis_id: string
          relationship_note: string | null
          relationship_type: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          asset_thesis_id: string
          id?: string
          macro_thesis_id: string
          relationship_note?: string | null
          relationship_type?: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          asset_thesis_id?: string
          id?: string
          macro_thesis_id?: string
          relationship_note?: string | null
          relationship_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_thesis_related_macro_theses_asset_thesis_id_fkey"
            columns: ["asset_thesis_id"]
            isOneToOne: false
            referencedRelation: "asset_theses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_thesis_related_macro_theses_macro_thesis_id_fkey"
            columns: ["macro_thesis_id"]
            isOneToOne: false
            referencedRelation: "macro_theses"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          asset_class: string
          base_currency: string | null
          coingecko_id: string | null
          coinmarketcap_id: string | null
          created_at: string
          cusip: string | null
          decimals: number | null
          ibkr_conid: string | null
          id: string
          is_active: boolean
          isin: string | null
          name: string | null
          pricing_tier: string | null
          proxy_asset_id: string | null
          sub_class: string | null
          ticker: string
          updated_at: string
        }
        Insert: {
          asset_class: string
          base_currency?: string | null
          coingecko_id?: string | null
          coinmarketcap_id?: string | null
          created_at?: string
          cusip?: string | null
          decimals?: number | null
          ibkr_conid?: string | null
          id?: string
          is_active?: boolean
          isin?: string | null
          name?: string | null
          pricing_tier?: string | null
          proxy_asset_id?: string | null
          sub_class?: string | null
          ticker: string
          updated_at?: string
        }
        Update: {
          asset_class?: string
          base_currency?: string | null
          coingecko_id?: string | null
          coinmarketcap_id?: string | null
          created_at?: string
          cusip?: string | null
          decimals?: number | null
          ibkr_conid?: string | null
          id?: string
          is_active?: boolean
          isin?: string | null
          name?: string | null
          pricing_tier?: string | null
          proxy_asset_id?: string | null
          sub_class?: string | null
          ticker?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assets_proxy_asset_id_fkey"
            columns: ["proxy_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_cursors: {
        Row: {
          cursor_value: string
          id: string
          key: string
          metadata: Json | null
          updated_at: string
        }
        Insert: {
          cursor_value: string
          id?: string
          key: string
          metadata?: Json | null
          updated_at?: string
        }
        Update: {
          cursor_value?: string
          id?: string
          key?: string
          metadata?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      average_cost_positions: {
        Row: {
          account: string
          asset_id: string
          average_cost_per_unit: number
          created_at: string
          first_acquisition_date: string | null
          id: string
          last_updated_event_id: string | null
          owner: string
          total_cost_basis: number
          total_quantity: number
          updated_at: string
          user_id: string
        }
        Insert: {
          account: string
          asset_id: string
          average_cost_per_unit?: number
          created_at?: string
          first_acquisition_date?: string | null
          id?: string
          last_updated_event_id?: string | null
          owner: string
          total_cost_basis?: number
          total_quantity?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          account?: string
          asset_id?: string
          average_cost_per_unit?: number
          created_at?: string
          first_acquisition_date?: string | null
          id?: string
          last_updated_event_id?: string | null
          owner?: string
          total_cost_basis?: number
          total_quantity?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "average_cost_positions_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "average_cost_positions_last_updated_event_id_fkey"
            columns: ["last_updated_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_balances: {
        Row: {
          account_id: string
          balance: number
          balance_usd: number | null
          created_at: string | null
          currency: string
          id: string
          snapshot_date: string
          source: string
        }
        Insert: {
          account_id: string
          balance: number
          balance_usd?: number | null
          created_at?: string | null
          currency: string
          id?: string
          snapshot_date: string
          source: string
        }
        Update: {
          account_id?: string
          balance?: number
          balance_usd?: number | null
          created_at?: string | null
          currency?: string
          id?: string
          snapshot_date?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_balances_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_signal_evidences: {
        Row: {
          assessment: string
          claim_id: string
          created_at: string
          id: string
          signal_id: string
          snapshot_id: string | null
        }
        Insert: {
          assessment: string
          claim_id: string
          created_at?: string
          id?: string
          signal_id: string
          snapshot_id?: string | null
        }
        Update: {
          assessment?: string
          claim_id?: string
          created_at?: string
          id?: string
          signal_id?: string
          snapshot_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claim_signal_evidences_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "main_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_signal_evidences_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_signal_evidences_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "signal_data_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_thesis_mappings: {
        Row: {
          asset_thesis_id: string | null
          confidence: string | null
          id: string
          macro_thesis_id: string | null
          main_claim_id: string
          mapped_at: string
          mapped_by: string
          mapping_type: string
          notes: string | null
        }
        Insert: {
          asset_thesis_id?: string | null
          confidence?: string | null
          id?: string
          macro_thesis_id?: string | null
          main_claim_id: string
          mapped_at?: string
          mapped_by: string
          mapping_type: string
          notes?: string | null
        }
        Update: {
          asset_thesis_id?: string | null
          confidence?: string | null
          id?: string
          macro_thesis_id?: string | null
          main_claim_id?: string
          mapped_at?: string
          mapped_by?: string
          mapping_type?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claim_thesis_mappings_asset_view_id_fkey"
            columns: ["asset_thesis_id"]
            isOneToOne: false
            referencedRelation: "asset_theses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_thesis_mappings_macro_thesis_id_fkey"
            columns: ["macro_thesis_id"]
            isOneToOne: false
            referencedRelation: "macro_theses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_thesis_mappings_main_claim_id_fkey"
            columns: ["main_claim_id"]
            isOneToOne: false
            referencedRelation: "main_claims"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_portfolio_values: {
        Row: {
          account: string | null
          created_at: string
          date: string
          id: string
          owner: string | null
          position_count: number | null
          price_completeness: number | null
          total_book_value: number | null
          total_book_value_gbp: number | null
          total_market_value: number | null
          total_market_value_gbp: number | null
          unrealized_gain: number | null
          unrealized_gain_gbp: number | null
          unrealized_gain_percent: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account?: string | null
          created_at?: string
          date: string
          id?: string
          owner?: string | null
          position_count?: number | null
          price_completeness?: number | null
          total_book_value?: number | null
          total_book_value_gbp?: number | null
          total_market_value?: number | null
          total_market_value_gbp?: number | null
          unrealized_gain?: number | null
          unrealized_gain_gbp?: number | null
          unrealized_gain_percent?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account?: string | null
          created_at?: string
          date?: string
          id?: string
          owner?: string | null
          position_count?: number | null
          price_completeness?: number | null
          total_book_value?: number | null
          total_book_value_gbp?: number | null
          total_market_value?: number | null
          total_market_value_gbp?: number | null
          unrealized_gain?: number | null
          unrealized_gain_gbp?: number | null
          unrealized_gain_percent?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      earnings_events: {
        Row: {
          created_at: string
          eps_actual: number | null
          eps_estimate: number | null
          id: string
          quarter: string | null
          report_date: string
          report_time: string | null
          revenue_actual: number | null
          revenue_estimate: number | null
          source: string
          surprise: number | null
          surprise_percent: number | null
          ticker: string
          underlying_id: string | null
          updated_at: string
          year: number | null
        }
        Insert: {
          created_at?: string
          eps_actual?: number | null
          eps_estimate?: number | null
          id?: string
          quarter?: string | null
          report_date: string
          report_time?: string | null
          revenue_actual?: number | null
          revenue_estimate?: number | null
          source?: string
          surprise?: number | null
          surprise_percent?: number | null
          ticker: string
          underlying_id?: string | null
          updated_at?: string
          year?: number | null
        }
        Update: {
          created_at?: string
          eps_actual?: number | null
          eps_estimate?: number | null
          id?: string
          quarter?: string | null
          report_date?: string
          report_time?: string | null
          revenue_actual?: number | null
          revenue_estimate?: number | null
          source?: string
          surprise?: number | null
          surprise_percent?: number | null
          ticker?: string
          underlying_id?: string | null
          updated_at?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "earnings_events_underlying_id_fkey"
            columns: ["underlying_id"]
            isOneToOne: false
            referencedRelation: "underlyings"
            referencedColumns: ["id"]
          },
        ]
      }
      economic_events: {
        Row: {
          actual: number | null
          category: string | null
          country: string
          created_at: string
          event_date: string
          event_type: string
          forecast: number | null
          id: string
          impact_level: string
          indicator: string | null
          period: string | null
          previous: number | null
          source: string | null
          source_url: string | null
          title: string
          tv_event_id: string | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          actual?: number | null
          category?: string | null
          country: string
          created_at?: string
          event_date: string
          event_type: string
          forecast?: number | null
          id?: string
          impact_level: string
          indicator?: string | null
          period?: string | null
          previous?: number | null
          source?: string | null
          source_url?: string | null
          title: string
          tv_event_id?: string | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          actual?: number | null
          category?: string | null
          country?: string
          created_at?: string
          event_date?: string
          event_type?: string
          forecast?: number | null
          id?: string
          impact_level?: string
          indicator?: string | null
          period?: string | null
          previous?: number | null
          source?: string | null
          source_url?: string | null
          title?: string
          tv_event_id?: string | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      event_calculations: {
        Row: {
          average_cost_used: number | null
          calculated_at: string
          cost_basis: number | null
          cost_basis_gbp: number | null
          cost_basis_method: string | null
          event_id: string
          fifo_matched: boolean | null
          fx_rate_to_gbp: number | null
          holding_days: number | null
          id: string
          is_long_term: boolean | null
          lot_consumptions_count: number | null
          lot_type: string | null
          new_average_cost: number | null
          new_average_cost_gbp: number | null
          realized_gain: number | null
          realized_gain_gbp: number | null
          running_quantity: number | null
          s104_cost_basis_gbp: number | null
          s104_realized_gain_gbp: number | null
          total_value_gbp: number | null
          user_id: string
        }
        Insert: {
          average_cost_used?: number | null
          calculated_at?: string
          cost_basis?: number | null
          cost_basis_gbp?: number | null
          cost_basis_method?: string | null
          event_id: string
          fifo_matched?: boolean | null
          fx_rate_to_gbp?: number | null
          holding_days?: number | null
          id?: string
          is_long_term?: boolean | null
          lot_consumptions_count?: number | null
          lot_type?: string | null
          new_average_cost?: number | null
          new_average_cost_gbp?: number | null
          realized_gain?: number | null
          realized_gain_gbp?: number | null
          running_quantity?: number | null
          s104_cost_basis_gbp?: number | null
          s104_realized_gain_gbp?: number | null
          total_value_gbp?: number | null
          user_id: string
        }
        Update: {
          average_cost_used?: number | null
          calculated_at?: string
          cost_basis?: number | null
          cost_basis_gbp?: number | null
          cost_basis_method?: string | null
          event_id?: string
          fifo_matched?: boolean | null
          fx_rate_to_gbp?: number | null
          holding_days?: number | null
          id?: string
          is_long_term?: boolean | null
          lot_consumptions_count?: number | null
          lot_type?: string | null
          new_average_cost?: number | null
          new_average_cost_gbp?: number | null
          realized_gain?: number | null
          realized_gain_gbp?: number | null
          running_quantity?: number | null
          s104_cost_basis_gbp?: number | null
          s104_realized_gain_gbp?: number | null
          total_value_gbp?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_calculations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          account: string
          asset_id: string
          asset_ticker: string
          cost_basis: number | null
          created_at: string
          currency: string
          deleted_at: string | null
          event_type: string
          id: string
          idempotency_key: string
          import_batch_id: string
          linked_event_id: string | null
          metadata: Json | null
          owner: string
          price: number | null
          quantity: number
          raw_data: Json
          settlement_date: string | null
          source: string
          source_id: string
          timestamp: string
          total_value: number
          user_id: string
        }
        Insert: {
          account: string
          asset_id: string
          asset_ticker: string
          cost_basis?: number | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          event_type: string
          id?: string
          idempotency_key: string
          import_batch_id: string
          linked_event_id?: string | null
          metadata?: Json | null
          owner: string
          price?: number | null
          quantity: number
          raw_data: Json
          settlement_date?: string | null
          source: string
          source_id: string
          timestamp: string
          total_value: number
          user_id: string
        }
        Update: {
          account?: string
          asset_id?: string
          asset_ticker?: string
          cost_basis?: number | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          event_type?: string
          id?: string
          idempotency_key?: string
          import_batch_id?: string
          linked_event_id?: string | null
          metadata?: Json | null
          owner?: string
          price?: number | null
          quantity?: number
          raw_data?: Json
          settlement_date?: string | null
          source?: string
          source_id?: string
          timestamp?: string
          total_value?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_linked_event_id_fkey"
            columns: ["linked_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      flex_query_configs: {
        Row: {
          account_id: string | null
          created_at: string
          flex_token: string
          id: string
          is_active: boolean
          last_run_at: string | null
          last_run_error: string | null
          last_run_status: string | null
          query_id: string
          query_name: string
          query_type: string
          schedule_cron: string | null
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          flex_token: string
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          last_run_error?: string | null
          last_run_status?: string | null
          query_id: string
          query_name: string
          query_type: string
          schedule_cron?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          flex_token?: string
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          last_run_error?: string | null
          last_run_status?: string | null
          query_id?: string
          query_name?: string
          query_type?: string
          schedule_cron?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "flex_query_configs_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      fx_rates: {
        Row: {
          created_at: string | null
          from_currency: string
          id: string
          rate: number
          snapshot_date: string
          source: string
          to_currency: string
        }
        Insert: {
          created_at?: string | null
          from_currency: string
          id?: string
          rate: number
          snapshot_date: string
          source: string
          to_currency: string
        }
        Update: {
          created_at?: string | null
          from_currency?: string
          id?: string
          rate?: number
          snapshot_date?: string
          source?: string
          to_currency?: string
        }
        Relationships: []
      }
      import_batches: {
        Row: {
          calc_phase: string | null
          calc_progress: Json | null
          completed_at: string | null
          error_count: number | null
          error_details: Json | null
          error_message: string | null
          file_hash: string | null
          filename: string | null
          id: string
          processed_records: number | null
          skipped_records: number | null
          source: string
          started_at: string
          status: string
          total_records: number | null
          updated_at: string
          user_id: string
          validation_errors: Json | null
          validation_warnings: Json | null
        }
        Insert: {
          calc_phase?: string | null
          calc_progress?: Json | null
          completed_at?: string | null
          error_count?: number | null
          error_details?: Json | null
          error_message?: string | null
          file_hash?: string | null
          filename?: string | null
          id?: string
          processed_records?: number | null
          skipped_records?: number | null
          source: string
          started_at?: string
          status?: string
          total_records?: number | null
          updated_at?: string
          user_id: string
          validation_errors?: Json | null
          validation_warnings?: Json | null
        }
        Update: {
          calc_phase?: string | null
          calc_progress?: Json | null
          completed_at?: string | null
          error_count?: number | null
          error_details?: Json | null
          error_message?: string | null
          file_hash?: string | null
          filename?: string | null
          id?: string
          processed_records?: number | null
          skipped_records?: number | null
          source?: string
          started_at?: string
          status?: string
          total_records?: number | null
          updated_at?: string
          user_id?: string
          validation_errors?: Json | null
          validation_warnings?: Json | null
        }
        Relationships: []
      }
      ingestion_cursors: {
        Row: {
          account_id: string
          cursor_type: string
          cursor_value: string
          exchange: string
          id: string
          metadata: Json | null
          updated_at: string
        }
        Insert: {
          account_id: string
          cursor_type: string
          cursor_value: string
          exchange: string
          id?: string
          metadata?: Json | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          cursor_type?: string
          cursor_value?: string
          exchange?: string
          id?: string
          metadata?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingestion_cursors_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      ingestion_runs: {
        Row: {
          account_id: string | null
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          job_type: string
          payload: Json | null
          result: Json | null
          started_at: string
          status: string
          trigger: string | null
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          job_type: string
          payload?: Json | null
          result?: Json | null
          started_at?: string
          status?: string
          trigger?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          job_type?: string
          payload?: Json | null
          result?: Json | null
          started_at?: string
          status?: string
          trigger?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingestion_runs_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      insider_transactions: {
        Row: {
          change: number | null
          created_at: string
          filing_date: string | null
          id: string
          insider_name: string
          shares: number | null
          source: string
          ticker: string
          transaction_code: string | null
          transaction_date: string
          transaction_price: number | null
          underlying_id: string | null
        }
        Insert: {
          change?: number | null
          created_at?: string
          filing_date?: string | null
          id?: string
          insider_name: string
          shares?: number | null
          source?: string
          ticker: string
          transaction_code?: string | null
          transaction_date: string
          transaction_price?: number | null
          underlying_id?: string | null
        }
        Update: {
          change?: number | null
          created_at?: string
          filing_date?: string | null
          id?: string
          insider_name?: string
          shares?: number | null
          source?: string
          ticker?: string
          transaction_code?: string | null
          transaction_date?: string
          transaction_price?: number | null
          underlying_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "insider_transactions_underlying_id_fkey"
            columns: ["underlying_id"]
            isOneToOne: false
            referencedRelation: "underlyings"
            referencedColumns: ["id"]
          },
        ]
      }
      intel_items: {
        Row: {
          body: string | null
          created_at: string
          headline: string
          id: string
          metadata: Json | null
          occurred_at: string
          processed_at: string | null
          processing_result: string | null
          processing_status: string
          resolved_underlying_ids: string[] | null
          severity: string
          source_key: string
          source_record_id: string
          source_table: string
          tickers: string[] | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          headline: string
          id?: string
          metadata?: Json | null
          occurred_at: string
          processed_at?: string | null
          processing_result?: string | null
          processing_status?: string
          resolved_underlying_ids?: string[] | null
          severity?: string
          source_key: string
          source_record_id: string
          source_table: string
          tickers?: string[] | null
        }
        Update: {
          body?: string | null
          created_at?: string
          headline?: string
          id?: string
          metadata?: Json | null
          occurred_at?: string
          processed_at?: string | null
          processing_result?: string | null
          processing_status?: string
          resolved_underlying_ids?: string[] | null
          severity?: string
          source_key?: string
          source_record_id?: string
          source_table?: string
          tickers?: string[] | null
        }
        Relationships: []
      }
      journal_entries: {
        Row: {
          action_description: string
          action_type: string
          batch_id: string | null
          first_detected_at: string | null
          id: string
          last_seen_at: string | null
          metadata: Json | null
          new_state: Json | null
          object_id: string
          object_title: string | null
          object_type: string
          occurrence_count: number | null
          previous_state: Json | null
          rationale: string | null
          skill_invoked: string | null
          source: string
          status: string | null
          timestamp: string
          triage_record_id: string | null
        }
        Insert: {
          action_description: string
          action_type: string
          batch_id?: string | null
          first_detected_at?: string | null
          id?: string
          last_seen_at?: string | null
          metadata?: Json | null
          new_state?: Json | null
          object_id: string
          object_title?: string | null
          object_type: string
          occurrence_count?: number | null
          previous_state?: Json | null
          rationale?: string | null
          skill_invoked?: string | null
          source: string
          status?: string | null
          timestamp?: string
          triage_record_id?: string | null
        }
        Update: {
          action_description?: string
          action_type?: string
          batch_id?: string | null
          first_detected_at?: string | null
          id?: string
          last_seen_at?: string | null
          metadata?: Json | null
          new_state?: Json | null
          object_id?: string
          object_title?: string | null
          object_type?: string
          occurrence_count?: number | null
          previous_state?: Json | null
          rationale?: string | null
          skill_invoked?: string | null
          source?: string
          status?: string | null
          timestamp?: string
          triage_record_id?: string | null
        }
        Relationships: []
      }
      lot_consumptions: {
        Row: {
          cost_basis: number
          created_at: string
          disposal_event_id: string
          holding_days: number
          id: string
          is_long_term: boolean
          lot_id: string
          proceeds: number
          quantity: number
          realized_gain: number
        }
        Insert: {
          cost_basis: number
          created_at?: string
          disposal_event_id: string
          holding_days: number
          id?: string
          is_long_term: boolean
          lot_id: string
          proceeds: number
          quantity: number
          realized_gain: number
        }
        Update: {
          cost_basis?: number
          created_at?: string
          disposal_event_id?: string
          holding_days?: number
          id?: string
          is_long_term?: boolean
          lot_id?: string
          proceeds?: number
          quantity?: number
          realized_gain?: number
        }
        Relationships: [
          {
            foreignKeyName: "lot_consumptions_disposal_event_id_fkey"
            columns: ["disposal_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lot_consumptions_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "tax_lots"
            referencedColumns: ["id"]
          },
        ]
      }
      macro_theses: {
        Row: {
          actual_outcome_date: string | null
          claims_count_at_last_articulation: number | null
          confidence_level: string | null
          created_at: string
          description: string | null
          direction: string | null
          id: string
          last_reviewed_at: string | null
          next_review_due_at: string | null
          notes: Json | null
          outcome: string | null
          outcome_notes: string | null
          pipeline_idea_ref: string | null
          pipeline_stage: number | null
          position_end_date: string | null
          position_start_date: string | null
          retrospective_metrics: Json | null
          sectors: string[] | null
          status: string
          themes: string[] | null
          thesis_type: string
          time_horizon: string | null
          title: string
          updated_at: string
        }
        Insert: {
          actual_outcome_date?: string | null
          claims_count_at_last_articulation?: number | null
          confidence_level?: string | null
          created_at?: string
          description?: string | null
          direction?: string | null
          id?: string
          last_reviewed_at?: string | null
          next_review_due_at?: string | null
          notes?: Json | null
          outcome?: string | null
          outcome_notes?: string | null
          pipeline_idea_ref?: string | null
          pipeline_stage?: number | null
          position_end_date?: string | null
          position_start_date?: string | null
          retrospective_metrics?: Json | null
          sectors?: string[] | null
          status?: string
          themes?: string[] | null
          thesis_type: string
          time_horizon?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          actual_outcome_date?: string | null
          claims_count_at_last_articulation?: number | null
          confidence_level?: string | null
          created_at?: string
          description?: string | null
          direction?: string | null
          id?: string
          last_reviewed_at?: string | null
          next_review_due_at?: string | null
          notes?: Json | null
          outcome?: string | null
          outcome_notes?: string | null
          pipeline_idea_ref?: string | null
          pipeline_stage?: number | null
          position_end_date?: string | null
          position_start_date?: string | null
          retrospective_metrics?: Json | null
          sectors?: string[] | null
          status?: string
          themes?: string[] | null
          thesis_type?: string
          time_horizon?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      macro_thesis_related_macro_theses: {
        Row: {
          added_at: string
          added_by: string | null
          id: string
          relationship_note: string | null
          relationship_type: string
          source_macro_thesis_id: string
          target_macro_thesis_id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          id?: string
          relationship_note?: string | null
          relationship_type: string
          source_macro_thesis_id: string
          target_macro_thesis_id: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          id?: string
          relationship_note?: string | null
          relationship_type?: string
          source_macro_thesis_id?: string
          target_macro_thesis_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "macro_thesis_related_macro_theses_source_macro_thesis_id_fkey"
            columns: ["source_macro_thesis_id"]
            isOneToOne: false
            referencedRelation: "macro_theses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "macro_thesis_related_macro_theses_target_macro_thesis_id_fkey"
            columns: ["target_macro_thesis_id"]
            isOneToOne: false
            referencedRelation: "macro_theses"
            referencedColumns: ["id"]
          },
        ]
      }
      main_claim_evidence: {
        Row: {
          added_at: string
          added_by: string | null
          id: string
          main_claim_id: string
          notes: string | null
          relationship_type: string
          research_insight_id: string
          supporting_claim_id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          id?: string
          main_claim_id: string
          notes?: string | null
          relationship_type: string
          research_insight_id: string
          supporting_claim_id: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          id?: string
          main_claim_id?: string
          notes?: string | null
          relationship_type?: string
          research_insight_id?: string
          supporting_claim_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "main_claim_evidence_main_claim_id_fkey"
            columns: ["main_claim_id"]
            isOneToOne: false
            referencedRelation: "main_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "main_claim_evidence_research_insight_id_fkey"
            columns: ["research_insight_id"]
            isOneToOne: false
            referencedRelation: "research_insights"
            referencedColumns: ["id"]
          },
        ]
      }
      main_claims: {
        Row: {
          backing: string | null
          category: string
          claim: string
          confidence_evolution: Json | null
          created_at: string
          evidence: string[] | null
          id: string
          last_evidence_added_at: string | null
          qualifier: string | null
          reasoning: string | null
          rebuttal: string[] | null
          relevant_tickers: string[] | null
          source_artifact_id: string | null
          source_claim_id: string | null
          source_insight_id: string | null
          status: string
          time_horizon: string | null
          title: string
          updated_at: string
        }
        Insert: {
          backing?: string | null
          category: string
          claim: string
          confidence_evolution?: Json | null
          created_at?: string
          evidence?: string[] | null
          id?: string
          last_evidence_added_at?: string | null
          qualifier?: string | null
          reasoning?: string | null
          rebuttal?: string[] | null
          relevant_tickers?: string[] | null
          source_artifact_id?: string | null
          source_claim_id?: string | null
          source_insight_id?: string | null
          status?: string
          time_horizon?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          backing?: string | null
          category?: string
          claim?: string
          confidence_evolution?: Json | null
          created_at?: string
          evidence?: string[] | null
          id?: string
          last_evidence_added_at?: string | null
          qualifier?: string | null
          reasoning?: string | null
          rebuttal?: string[] | null
          relevant_tickers?: string[] | null
          source_artifact_id?: string | null
          source_claim_id?: string | null
          source_insight_id?: string | null
          status?: string
          time_horizon?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "main_claims_source_artifact_id_fkey"
            columns: ["source_artifact_id"]
            isOneToOne: false
            referencedRelation: "research_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "main_claims_source_insight_id_fkey"
            columns: ["source_insight_id"]
            isOneToOne: false
            referencedRelation: "research_insights"
            referencedColumns: ["id"]
          },
        ]
      }
      mtm_snapshots: {
        Row: {
          account_id: string
          asset_class: string | null
          commissions: number | null
          created_at: string | null
          currency: string | null
          id: string
          mark_price: number | null
          market_value: number | null
          position_id: string | null
          prior_open_mtm_pnl: number | null
          quantity: number | null
          raw_row: Json | null
          realized_pnl: number | null
          snapshot_date: string
          symbol: string
          total: number | null
          transaction_mtm_pnl: number | null
          unrealized_pnl: number | null
        }
        Insert: {
          account_id: string
          asset_class?: string | null
          commissions?: number | null
          created_at?: string | null
          currency?: string | null
          id?: string
          mark_price?: number | null
          market_value?: number | null
          position_id?: string | null
          prior_open_mtm_pnl?: number | null
          quantity?: number | null
          raw_row?: Json | null
          realized_pnl?: number | null
          snapshot_date: string
          symbol: string
          total?: number | null
          transaction_mtm_pnl?: number | null
          unrealized_pnl?: number | null
        }
        Update: {
          account_id?: string
          asset_class?: string | null
          commissions?: number | null
          created_at?: string | null
          currency?: string | null
          id?: string
          mark_price?: number | null
          market_value?: number | null
          position_id?: string | null
          prior_open_mtm_pnl?: number | null
          quantity?: number | null
          raw_row?: Json | null
          realized_pnl?: number | null
          snapshot_date?: string
          symbol?: string
          total?: number | null
          transaction_mtm_pnl?: number | null
          unrealized_pnl?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "mtm_snapshots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mtm_snapshots_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
        ]
      }
      nav_snapshots: {
        Row: {
          account_id: string
          cash: number | null
          created_at: string | null
          currency: string
          id: string
          report_date: string
          total: number
          total_long: number | null
          total_short: number | null
        }
        Insert: {
          account_id: string
          cash?: number | null
          created_at?: string | null
          currency: string
          id?: string
          report_date: string
          total: number
          total_long?: number | null
          total_short?: number | null
        }
        Update: {
          account_id?: string
          cash?: number | null
          created_at?: string | null
          currency?: string
          id?: string
          report_date?: string
          total?: number
          total_long?: number | null
          total_short?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "nav_snapshots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      options_chain_snapshots: {
        Row: {
          ask: number | null
          bid: number | null
          contract_type: string | null
          created_at: string | null
          delta: number | null
          dte: number | null
          expiration_date: string
          gamma: number | null
          id: string
          implied_volatility: number | null
          last: number | null
          open_interest: number | null
          raw_data: Json | null
          snapshot_date: string
          source: string
          strike: number
          theta: number | null
          ticker: string
          underlying_id: string | null
          underlying_spot: number | null
          updated_at: string
          vega: number | null
          volume: number | null
        }
        Insert: {
          ask?: number | null
          bid?: number | null
          contract_type?: string | null
          created_at?: string | null
          delta?: number | null
          dte?: number | null
          expiration_date: string
          gamma?: number | null
          id?: string
          implied_volatility?: number | null
          last?: number | null
          open_interest?: number | null
          raw_data?: Json | null
          snapshot_date: string
          source?: string
          strike: number
          theta?: number | null
          ticker: string
          underlying_id?: string | null
          underlying_spot?: number | null
          updated_at?: string
          vega?: number | null
          volume?: number | null
        }
        Update: {
          ask?: number | null
          bid?: number | null
          contract_type?: string | null
          created_at?: string | null
          delta?: number | null
          dte?: number | null
          expiration_date?: string
          gamma?: number | null
          id?: string
          implied_volatility?: number | null
          last?: number | null
          open_interest?: number | null
          raw_data?: Json | null
          snapshot_date?: string
          source?: string
          strike?: number
          theta?: number | null
          ticker?: string
          underlying_id?: string | null
          underlying_spot?: number | null
          updated_at?: string
          vega?: number | null
          volume?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "options_chain_snapshots_underlying_id_fkey"
            columns: ["underlying_id"]
            isOneToOne: false
            referencedRelation: "underlyings"
            referencedColumns: ["id"]
          },
        ]
      }
      owners: {
        Row: {
          base_currency: string
          created_at: string
          entity_type: string
          id: string
          is_active: boolean | null
          legal_name: string | null
          name: string
          ssn_or_ein: string | null
          tax_jurisdiction: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          base_currency?: string
          created_at?: string
          entity_type?: string
          id?: string
          is_active?: boolean | null
          legal_name?: string | null
          name: string
          ssn_or_ein?: string | null
          tax_jurisdiction?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          base_currency?: string
          created_at?: string
          entity_type?: string
          id?: string
          is_active?: boolean | null
          legal_name?: string | null
          name?: string
          ssn_or_ein?: string | null
          tax_jurisdiction?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      portfolio_daily_balances: {
        Row: {
          account_type: string
          asset: string
          asset_class: string | null
          book_value: number | null
          book_value_gbp: number | null
          created_at: string
          date: string
          fx_rate_usd_gbp: number | null
          id: string
          market_value: number | null
          market_value_gbp: number | null
          market_value_source: string | null
          owner: string
          price: number | null
          quantity: number
          updated_at: string
          user_id: string
        }
        Insert: {
          account_type: string
          asset: string
          asset_class?: string | null
          book_value?: number | null
          book_value_gbp?: number | null
          created_at?: string
          date: string
          fx_rate_usd_gbp?: number | null
          id?: string
          market_value?: number | null
          market_value_gbp?: number | null
          market_value_source?: string | null
          owner: string
          price?: number | null
          quantity: number
          updated_at?: string
          user_id: string
        }
        Update: {
          account_type?: string
          asset?: string
          asset_class?: string | null
          book_value?: number | null
          book_value_gbp?: number | null
          created_at?: string
          date?: string
          fx_rate_usd_gbp?: number | null
          id?: string
          market_value?: number | null
          market_value_gbp?: number | null
          market_value_source?: string | null
          owner?: string
          price?: number | null
          quantity?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      portfolio_snapshots: {
        Row: {
          abs_crypto_spot_notional: number | null
          abs_option_notional: number | null
          abs_perp_notional: number | null
          abs_stock_notional: number | null
          account_id: string
          created_at: string | null
          id: string
          level: string
          leverage_ratio: number | null
          nav_at_snapshot: number | null
          nav_at_snapshot_usd: number | null
          pct_nav_abs_notional: number | null
          snapshot_date: string
          total_abs_notional: number | null
          total_abs_notional_usd: number | null
          total_cash_usd: number | null
          total_unrealized_pnl: number | null
          underlying_id: string | null
          updated_at: string | null
        }
        Insert: {
          abs_crypto_spot_notional?: number | null
          abs_option_notional?: number | null
          abs_perp_notional?: number | null
          abs_stock_notional?: number | null
          account_id: string
          created_at?: string | null
          id?: string
          level: string
          leverage_ratio?: number | null
          nav_at_snapshot?: number | null
          nav_at_snapshot_usd?: number | null
          pct_nav_abs_notional?: number | null
          snapshot_date: string
          total_abs_notional?: number | null
          total_abs_notional_usd?: number | null
          total_cash_usd?: number | null
          total_unrealized_pnl?: number | null
          underlying_id?: string | null
          updated_at?: string | null
        }
        Update: {
          abs_crypto_spot_notional?: number | null
          abs_option_notional?: number | null
          abs_perp_notional?: number | null
          abs_stock_notional?: number | null
          account_id?: string
          created_at?: string | null
          id?: string
          level?: string
          leverage_ratio?: number | null
          nav_at_snapshot?: number | null
          nav_at_snapshot_usd?: number | null
          pct_nav_abs_notional?: number | null
          snapshot_date?: string
          total_abs_notional?: number | null
          total_abs_notional_usd?: number | null
          total_cash_usd?: number | null
          total_unrealized_pnl?: number | null
          underlying_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_snapshots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_snapshots_underlying_id_fkey"
            columns: ["underlying_id"]
            isOneToOne: false
            referencedRelation: "underlyings"
            referencedColumns: ["id"]
          },
        ]
      }
      positions: {
        Row: {
          abs_notional: number | null
          abs_notional_usd: number | null
          account_id: string
          asset_class: string | null
          avg_price: number | null
          close_date: string | null
          conid: number | null
          cost_basis_money: number | null
          created_at: string | null
          currency: string | null
          expiry: string | null
          extrinsic: number | null
          id: string
          intrinsic: number | null
          is_open: boolean
          market_value_usd: number | null
          multiplier: number | null
          open_date: string | null
          option_right: string | null
          position_type: string | null
          quantity: number
          side: string | null
          snapshot_date: string | null
          spot: number | null
          strategy_id: string | null
          strike: number | null
          symbol: string
          underlying_id: string | null
          unrealized_pnl: number | null
          updated_at: string | null
        }
        Insert: {
          abs_notional?: number | null
          abs_notional_usd?: number | null
          account_id: string
          asset_class?: string | null
          avg_price?: number | null
          close_date?: string | null
          conid?: number | null
          cost_basis_money?: number | null
          created_at?: string | null
          currency?: string | null
          expiry?: string | null
          extrinsic?: number | null
          id?: string
          intrinsic?: number | null
          is_open?: boolean
          market_value_usd?: number | null
          multiplier?: number | null
          open_date?: string | null
          option_right?: string | null
          position_type?: string | null
          quantity: number
          side?: string | null
          snapshot_date?: string | null
          spot?: number | null
          strategy_id?: string | null
          strike?: number | null
          symbol: string
          underlying_id?: string | null
          unrealized_pnl?: number | null
          updated_at?: string | null
        }
        Update: {
          abs_notional?: number | null
          abs_notional_usd?: number | null
          account_id?: string
          asset_class?: string | null
          avg_price?: number | null
          close_date?: string | null
          conid?: number | null
          cost_basis_money?: number | null
          created_at?: string | null
          currency?: string | null
          expiry?: string | null
          extrinsic?: number | null
          id?: string
          intrinsic?: number | null
          is_open?: boolean
          market_value_usd?: number | null
          multiplier?: number | null
          open_date?: string | null
          option_right?: string | null
          position_type?: string | null
          quantity?: number
          side?: string | null
          snapshot_date?: string | null
          spot?: number | null
          strategy_id?: string | null
          strike?: number | null
          symbol?: string
          underlying_id?: string | null
          unrealized_pnl?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "positions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_underlying_id_fkey"
            columns: ["underlying_id"]
            isOneToOne: false
            referencedRelation: "underlyings"
            referencedColumns: ["id"]
          },
        ]
      }
      price_history: {
        Row: {
          asset_id: string
          created_at: string
          fx_rate_to_usd: number | null
          id: string
          price_close: number
          price_date: string
          price_high: number | null
          price_low: number | null
          price_open: number | null
          source: string
          source_currency: string | null
          source_raw_price: number | null
          updated_at: string
          volume: number | null
        }
        Insert: {
          asset_id: string
          created_at?: string
          fx_rate_to_usd?: number | null
          id?: string
          price_close: number
          price_date: string
          price_high?: number | null
          price_low?: number | null
          price_open?: number | null
          source: string
          source_currency?: string | null
          source_raw_price?: number | null
          updated_at?: string
          volume?: number | null
        }
        Update: {
          asset_id?: string
          created_at?: string
          fx_rate_to_usd?: number | null
          id?: string
          price_close?: number
          price_date?: string
          price_high?: number | null
          price_low?: number | null
          price_open?: number | null
          source?: string
          source_currency?: string | null
          source_raw_price?: number | null
          updated_at?: string
          volume?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "price_history_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_resolutions: {
        Row: {
          created_at: string
          discrepancy_type: string | null
          id: string
          mv_delta_at_action: number | null
          nature: string | null
          notes: string | null
          owner: string
          qty_delta_at_action: number | null
          resolved_at: string | null
          status: string
          ticker: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          discrepancy_type?: string | null
          id?: string
          mv_delta_at_action?: number | null
          nature?: string | null
          notes?: string | null
          owner: string
          qty_delta_at_action?: number | null
          resolved_at?: string | null
          status?: string
          ticker: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          discrepancy_type?: string | null
          id?: string
          mv_delta_at_action?: number | null
          nature?: string | null
          notes?: string | null
          owner?: string
          qty_delta_at_action?: number | null
          resolved_at?: string | null
          status?: string
          ticker?: string
          updated_at?: string
        }
        Relationships: []
      }
      research_artifacts: {
        Row: {
          author: string | null
          content_format: string | null
          created_at: string
          file_name: string | null
          file_size_bytes: number | null
          file_storage_path: string | null
          id: string
          ingested_at: string
          ingested_by: string | null
          metadata: Json | null
          processing_error: string | null
          published_date: string | null
          raw_content: string
          source_type: string
          source_url: string | null
          status: string
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          author?: string | null
          content_format?: string | null
          created_at?: string
          file_name?: string | null
          file_size_bytes?: number | null
          file_storage_path?: string | null
          id?: string
          ingested_at?: string
          ingested_by?: string | null
          metadata?: Json | null
          processing_error?: string | null
          published_date?: string | null
          raw_content: string
          source_type: string
          source_url?: string | null
          status?: string
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          author?: string | null
          content_format?: string | null
          created_at?: string
          file_name?: string | null
          file_size_bytes?: number | null
          file_storage_path?: string | null
          id?: string
          ingested_at?: string
          ingested_by?: string | null
          metadata?: Json | null
          processing_error?: string | null
          published_date?: string | null
          raw_content?: string
          source_type?: string
          source_url?: string | null
          status?: string
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      research_hierarchy_recommendations: {
        Row: {
          accepted_at: string | null
          ai_model: string
          confidence_score: number | null
          created_at: string
          existing_asset_thesis_id: string | null
          existing_thesis_id: string | null
          generated_at: string
          id: string
          main_claim_id: string | null
          mapping_type: string | null
          modified_by_user: boolean | null
          proposed_data: Json | null
          reasoning: string
          recommendation_type: string
          rejected_at: string | null
          research_insight_id: string
          status: string
        }
        Insert: {
          accepted_at?: string | null
          ai_model: string
          confidence_score?: number | null
          created_at?: string
          existing_asset_thesis_id?: string | null
          existing_thesis_id?: string | null
          generated_at?: string
          id?: string
          main_claim_id?: string | null
          mapping_type?: string | null
          modified_by_user?: boolean | null
          proposed_data?: Json | null
          reasoning: string
          recommendation_type: string
          rejected_at?: string | null
          research_insight_id: string
          status?: string
        }
        Update: {
          accepted_at?: string | null
          ai_model?: string
          confidence_score?: number | null
          created_at?: string
          existing_asset_thesis_id?: string | null
          existing_thesis_id?: string | null
          generated_at?: string
          id?: string
          main_claim_id?: string | null
          mapping_type?: string | null
          modified_by_user?: boolean | null
          proposed_data?: Json | null
          reasoning?: string
          recommendation_type?: string
          rejected_at?: string | null
          research_insight_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_hierarchy_recommendations_existing_thesis_id_fkey"
            columns: ["existing_thesis_id"]
            isOneToOne: false
            referencedRelation: "macro_theses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_hierarchy_recommendations_existing_view_id_fkey"
            columns: ["existing_asset_thesis_id"]
            isOneToOne: false
            referencedRelation: "asset_theses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_hierarchy_recommendations_main_claim_id_fkey"
            columns: ["main_claim_id"]
            isOneToOne: false
            referencedRelation: "main_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_hierarchy_recommendations_research_insight_id_fkey"
            columns: ["research_insight_id"]
            isOneToOne: false
            referencedRelation: "research_insights"
            referencedColumns: ["id"]
          },
        ]
      }
      research_insights: {
        Row: {
          ai_model: string | null
          ai_processing_cost_usd: number | null
          claims_structure: Json | null
          confidence_level: string | null
          counter_evidence: Json | null
          created_at: string
          human_review_notes: string | null
          human_reviewed: boolean | null
          id: string
          key_claims: Json | null
          key_themes: string[] | null
          relevant_tickers: string[] | null
          research_artifact_id: string
          structured_at: string
          structured_by: string
          summary: string
          supporting_evidence: Json | null
          time_horizon: string | null
          updated_at: string
        }
        Insert: {
          ai_model?: string | null
          ai_processing_cost_usd?: number | null
          claims_structure?: Json | null
          confidence_level?: string | null
          counter_evidence?: Json | null
          created_at?: string
          human_review_notes?: string | null
          human_reviewed?: boolean | null
          id?: string
          key_claims?: Json | null
          key_themes?: string[] | null
          relevant_tickers?: string[] | null
          research_artifact_id: string
          structured_at?: string
          structured_by: string
          summary: string
          supporting_evidence?: Json | null
          time_horizon?: string | null
          updated_at?: string
        }
        Update: {
          ai_model?: string | null
          ai_processing_cost_usd?: number | null
          claims_structure?: Json | null
          confidence_level?: string | null
          counter_evidence?: Json | null
          created_at?: string
          human_review_notes?: string | null
          human_reviewed?: boolean | null
          id?: string
          key_claims?: Json | null
          key_themes?: string[] | null
          relevant_tickers?: string[] | null
          research_artifact_id?: string
          structured_at?: string
          structured_by?: string
          summary?: string
          supporting_evidence?: Json | null
          time_horizon?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_insights_research_artifact_id_fkey"
            columns: ["research_artifact_id"]
            isOneToOne: false
            referencedRelation: "research_artifacts"
            referencedColumns: ["id"]
          },
        ]
      }
      research_processing_runs: {
        Row: {
          ai_model: string | null
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          job_type: string
          processing_cost_usd: number | null
          research_artifact_id: string
          result: Json | null
          started_at: string
          status: string
          tokens_used: number | null
        }
        Insert: {
          ai_model?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          job_type: string
          processing_cost_usd?: number | null
          research_artifact_id: string
          result?: Json | null
          started_at?: string
          status?: string
          tokens_used?: number | null
        }
        Update: {
          ai_model?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          job_type?: string
          processing_cost_usd?: number | null
          research_artifact_id?: string
          result?: Json | null
          started_at?: string
          status?: string
          tokens_used?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "research_processing_runs_research_artifact_id_fkey"
            columns: ["research_artifact_id"]
            isOneToOne: false
            referencedRelation: "research_artifacts"
            referencedColumns: ["id"]
          },
        ]
      }
      sec_filings: {
        Row: {
          accession_number: string
          cik: string
          created_at: string
          description: string | null
          filed_date: string
          filing_category: string | null
          filing_type: string
          filing_url: string
          id: string
          is_material: boolean | null
          ticker: string
          underlying_id: string | null
        }
        Insert: {
          accession_number: string
          cik: string
          created_at?: string
          description?: string | null
          filed_date: string
          filing_category?: string | null
          filing_type: string
          filing_url: string
          id?: string
          is_material?: boolean | null
          ticker: string
          underlying_id?: string | null
        }
        Update: {
          accession_number?: string
          cik?: string
          created_at?: string
          description?: string | null
          filed_date?: string
          filing_category?: string | null
          filing_type?: string
          filing_url?: string
          id?: string
          is_material?: boolean | null
          ticker?: string
          underlying_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sec_filings_underlying_id_fkey"
            columns: ["underlying_id"]
            isOneToOne: false
            referencedRelation: "underlyings"
            referencedColumns: ["id"]
          },
        ]
      }
      section_104_matches: {
        Row: {
          acquisition_date: string | null
          acquisition_event_id: string | null
          cost_basis_gbp: number
          created_at: string
          disposal_event_id: string
          id: string
          match_type: string
          pool_cost_gbp_after: number | null
          pool_qty_after: number | null
          proceeds_gbp: number
          quantity_matched: number
          realized_gain_gbp: number
        }
        Insert: {
          acquisition_date?: string | null
          acquisition_event_id?: string | null
          cost_basis_gbp: number
          created_at?: string
          disposal_event_id: string
          id?: string
          match_type: string
          pool_cost_gbp_after?: number | null
          pool_qty_after?: number | null
          proceeds_gbp: number
          quantity_matched: number
          realized_gain_gbp: number
        }
        Update: {
          acquisition_date?: string | null
          acquisition_event_id?: string | null
          cost_basis_gbp?: number
          created_at?: string
          disposal_event_id?: string
          id?: string
          match_type?: string
          pool_cost_gbp_after?: number | null
          pool_qty_after?: number | null
          proceeds_gbp?: number
          quantity_matched?: number
          realized_gain_gbp?: number
        }
        Relationships: [
          {
            foreignKeyName: "section_104_matches_acquisition_event_id_fkey"
            columns: ["acquisition_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "section_104_matches_disposal_event_id_fkey"
            columns: ["disposal_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      section_104_pools: {
        Row: {
          account: string
          asset_id: string
          created_at: string
          first_acquisition_date: string | null
          id: string
          last_updated_event_id: string | null
          owner: string
          pool_average_cost_gbp: number
          pool_cost_basis_gbp: number
          pool_quantity: number
          updated_at: string
          user_id: string
        }
        Insert: {
          account: string
          asset_id: string
          created_at?: string
          first_acquisition_date?: string | null
          id?: string
          last_updated_event_id?: string | null
          owner: string
          pool_average_cost_gbp?: number
          pool_cost_basis_gbp?: number
          pool_quantity?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          account?: string
          asset_id?: string
          created_at?: string
          first_acquisition_date?: string | null
          id?: string
          last_updated_event_id?: string | null
          owner?: string
          pool_average_cost_gbp?: number
          pool_cost_basis_gbp?: number
          pool_quantity?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "section_104_pools_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "section_104_pools_last_updated_event_id_fkey"
            columns: ["last_updated_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      signal_data_snapshots: {
        Row: {
          assessment: string | null
          claim_id: string | null
          created_at: string
          data_source: string
          evidence_summary: string | null
          id: string
          intelligence_item_id: string | null
          observed_value: number | null
          pct_to_threshold: number | null
          report_id: string | null
          signal_id: string
          snapshot_date: string
          status: string
          threshold_value: number | null
          unit: string | null
        }
        Insert: {
          assessment?: string | null
          claim_id?: string | null
          created_at?: string
          data_source: string
          evidence_summary?: string | null
          id?: string
          intelligence_item_id?: string | null
          observed_value?: number | null
          pct_to_threshold?: number | null
          report_id?: string | null
          signal_id: string
          snapshot_date?: string
          status?: string
          threshold_value?: number | null
          unit?: string | null
        }
        Update: {
          assessment?: string | null
          claim_id?: string | null
          created_at?: string
          data_source?: string
          evidence_summary?: string | null
          id?: string
          intelligence_item_id?: string | null
          observed_value?: number | null
          pct_to_threshold?: number | null
          report_id?: string | null
          signal_id?: string
          snapshot_date?: string
          status?: string
          threshold_value?: number | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signal_data_snapshots_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "main_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signal_data_snapshots_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
        ]
      }
      signal_data_source_registry: {
        Row: {
          asset_scope: string
          available_metrics: Json
          category: string
          config_example: Json | null
          config_template: Json
          created_at: string
          description: string
          id: string
          ingestion_method: string
          ingestion_schedule: string | null
          ingestion_script: string | null
          is_active: boolean
          key: string
          measure_type: string
          name: string
          source_url: string | null
          supported_tickers: string[] | null
          updated_at: string
        }
        Insert: {
          asset_scope: string
          available_metrics?: Json
          category: string
          config_example?: Json | null
          config_template: Json
          created_at?: string
          description: string
          id?: string
          ingestion_method: string
          ingestion_schedule?: string | null
          ingestion_script?: string | null
          is_active?: boolean
          key: string
          measure_type: string
          name: string
          source_url?: string | null
          supported_tickers?: string[] | null
          updated_at?: string
        }
        Update: {
          asset_scope?: string
          available_metrics?: Json
          category?: string
          config_example?: Json | null
          config_template?: Json
          created_at?: string
          description?: string
          id?: string
          ingestion_method?: string
          ingestion_schedule?: string | null
          ingestion_script?: string | null
          is_active?: boolean
          key?: string
          measure_type?: string
          name?: string
          source_url?: string | null
          supported_tickers?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      signal_entity_links: {
        Row: {
          created_at: string
          entity_type: string
          id: string
          position_pct: number | null
          signal_id: string
          strategy_id: string | null
          thesis_id: string | null
          thesis_type: string | null
        }
        Insert: {
          created_at?: string
          entity_type: string
          id?: string
          position_pct?: number | null
          signal_id: string
          strategy_id?: string | null
          thesis_id?: string | null
          thesis_type?: string | null
        }
        Update: {
          created_at?: string
          entity_type?: string
          id?: string
          position_pct?: number | null
          signal_id?: string
          strategy_id?: string | null
          thesis_id?: string | null
          thesis_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signal_entity_links_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signal_entity_links_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      signal_status_history: {
        Row: {
          assessed_by: string
          confidence: string
          evidence: Json
          id: string
          new_status: string
          previous_status: string | null
          signal_id: string
          timestamp: string
          user_action_required: boolean | null
          user_action_taken: string | null
          user_action_timestamp: string | null
        }
        Insert: {
          assessed_by: string
          confidence: string
          evidence: Json
          id?: string
          new_status: string
          previous_status?: string | null
          signal_id: string
          timestamp?: string
          user_action_required?: boolean | null
          user_action_taken?: string | null
          user_action_timestamp?: string | null
        }
        Update: {
          assessed_by?: string
          confidence?: string
          evidence?: Json
          id?: string
          new_status?: string
          previous_status?: string | null
          signal_id?: string
          timestamp?: string
          user_action_required?: boolean | null
          user_action_taken?: string | null
          user_action_timestamp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signal_status_history_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
        ]
      }
      signals: {
        Row: {
          articulation_id: string | null
          category: string
          created_at: string
          dependent_thesis_condition: string | null
          dependent_thesis_condition_detail: string | null
          dependent_thesis_id: string | null
          dependent_thesis_type: string | null
          entity_type: string | null
          explicit_details: Json | null
          id: string
          importance: string
          judgment_details: Json | null
          linked_claim_ids: Json | null
          notes: string | null
          rationale: string | null
          response_protocol: Json | null
          source_driver_index: number | null
          source_section: string | null
          statement: string
          status: string
          strategy_id: string | null
          supersedes_signal_id: string | null
          thesis_id: string | null
          thesis_type: string | null
          timeframe: string | null
          trigger_action: Json | null
          type: string
          updated_at: string
        }
        Insert: {
          articulation_id?: string | null
          category: string
          created_at?: string
          dependent_thesis_condition?: string | null
          dependent_thesis_condition_detail?: string | null
          dependent_thesis_id?: string | null
          dependent_thesis_type?: string | null
          entity_type?: string | null
          explicit_details?: Json | null
          id?: string
          importance: string
          judgment_details?: Json | null
          linked_claim_ids?: Json | null
          notes?: string | null
          rationale?: string | null
          response_protocol?: Json | null
          source_driver_index?: number | null
          source_section?: string | null
          statement: string
          status?: string
          strategy_id?: string | null
          supersedes_signal_id?: string | null
          thesis_id?: string | null
          thesis_type?: string | null
          timeframe?: string | null
          trigger_action?: Json | null
          type: string
          updated_at?: string
        }
        Update: {
          articulation_id?: string | null
          category?: string
          created_at?: string
          dependent_thesis_condition?: string | null
          dependent_thesis_condition_detail?: string | null
          dependent_thesis_id?: string | null
          dependent_thesis_type?: string | null
          entity_type?: string | null
          explicit_details?: Json | null
          id?: string
          importance?: string
          judgment_details?: Json | null
          linked_claim_ids?: Json | null
          notes?: string | null
          rationale?: string | null
          response_protocol?: Json | null
          source_driver_index?: number | null
          source_section?: string | null
          statement?: string
          status?: string
          strategy_id?: string | null
          supersedes_signal_id?: string | null
          thesis_id?: string | null
          thesis_type?: string | null
          timeframe?: string | null
          trigger_action?: Json | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "signals_articulation_id_fkey"
            columns: ["articulation_id"]
            isOneToOne: false
            referencedRelation: "thesis_articulations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signals_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signals_supersedes_signal_id_fkey"
            columns: ["supersedes_signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
        ]
      }
      strategies: {
        Row: {
          account_id: string | null
          asset_thesis_id: string | null
          auto_derived_label: string | null
          auto_source: string | null
          closed_at: string | null
          confirmed_at: string | null
          created_at: string | null
          defense_rules: string | null
          direction: string | null
          entry_context: string | null
          entry_iv30: number | null
          entry_notional: number | null
          entry_spot: number | null
          exit_criteria: string | null
          id: string
          is_auto: boolean
          merged_into_id: string | null
          net_premium: number | null
          opened_at: string
          profit_rules: string | null
          status: string
          strategy_key: string
          strategy_template_id: string
          strategy_type: string | null
          strategy_type_id: string | null
          thesis: string | null
          time_horizon: string | null
          time_rules: string | null
          total_abs_notional: number | null
          total_unrealized_pnl: number | null
          updated_at: string | null
        }
        Insert: {
          account_id?: string | null
          asset_thesis_id?: string | null
          auto_derived_label?: string | null
          auto_source?: string | null
          closed_at?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          defense_rules?: string | null
          direction?: string | null
          entry_context?: string | null
          entry_iv30?: number | null
          entry_notional?: number | null
          entry_spot?: number | null
          exit_criteria?: string | null
          id?: string
          is_auto?: boolean
          merged_into_id?: string | null
          net_premium?: number | null
          opened_at: string
          profit_rules?: string | null
          status?: string
          strategy_key: string
          strategy_template_id: string
          strategy_type?: string | null
          strategy_type_id?: string | null
          thesis?: string | null
          time_horizon?: string | null
          time_rules?: string | null
          total_abs_notional?: number | null
          total_unrealized_pnl?: number | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string | null
          asset_thesis_id?: string | null
          auto_derived_label?: string | null
          auto_source?: string | null
          closed_at?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          defense_rules?: string | null
          direction?: string | null
          entry_context?: string | null
          entry_iv30?: number | null
          entry_notional?: number | null
          entry_spot?: number | null
          exit_criteria?: string | null
          id?: string
          is_auto?: boolean
          merged_into_id?: string | null
          net_premium?: number | null
          opened_at?: string
          profit_rules?: string | null
          status?: string
          strategy_key?: string
          strategy_template_id?: string
          strategy_type?: string | null
          strategy_type_id?: string | null
          thesis?: string | null
          time_horizon?: string | null
          time_rules?: string | null
          total_abs_notional?: number | null
          total_unrealized_pnl?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "strategies_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strategies_asset_view_id_fkey"
            columns: ["asset_thesis_id"]
            isOneToOne: false
            referencedRelation: "asset_theses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strategies_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strategies_strategy_template_id_fkey"
            columns: ["strategy_template_id"]
            isOneToOne: false
            referencedRelation: "strategy_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strategies_strategy_type_id_fkey"
            columns: ["strategy_type_id"]
            isOneToOne: false
            referencedRelation: "strategy_types"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_metrics_snapshots: {
        Row: {
          account_id: string
          created_at: string | null
          cumulative_pnl: number | null
          id: string
          max_dte: number | null
          min_dte: number | null
          nav_at_snapshot: number | null
          num_open_positions: number | null
          pct_nav_abs_notional: number | null
          realized_confidence: string | null
          realized_pnl_to_date: number | null
          snapshot_date: string
          strategy_id: string
          total_abs_notional: number | null
          total_unrealized_pnl: number | null
          updated_at: string | null
        }
        Insert: {
          account_id: string
          created_at?: string | null
          cumulative_pnl?: number | null
          id?: string
          max_dte?: number | null
          min_dte?: number | null
          nav_at_snapshot?: number | null
          num_open_positions?: number | null
          pct_nav_abs_notional?: number | null
          realized_confidence?: string | null
          realized_pnl_to_date?: number | null
          snapshot_date: string
          strategy_id: string
          total_abs_notional?: number | null
          total_unrealized_pnl?: number | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string | null
          cumulative_pnl?: number | null
          id?: string
          max_dte?: number | null
          min_dte?: number | null
          nav_at_snapshot?: number | null
          num_open_positions?: number | null
          pct_nav_abs_notional?: number | null
          realized_confidence?: string | null
          realized_pnl_to_date?: number | null
          snapshot_date?: string
          strategy_id?: string
          total_abs_notional?: number | null
          total_unrealized_pnl?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "strategy_metrics_snapshots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strategy_metrics_snapshots_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_templates: {
        Row: {
          created_at: string | null
          default_time_horizon: string | null
          id: string
          label: string
          max_dte: number | null
          min_dte: number | null
          notes: string | null
          strategy_key: string
          underlying_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          default_time_horizon?: string | null
          id?: string
          label: string
          max_dte?: number | null
          min_dte?: number | null
          notes?: string | null
          strategy_key: string
          underlying_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          default_time_horizon?: string | null
          id?: string
          label?: string
          max_dte?: number | null
          min_dte?: number | null
          notes?: string | null
          strategy_key?: string
          underlying_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "strategy_templates_underlying_id_fkey"
            columns: ["underlying_id"]
            isOneToOne: false
            referencedRelation: "underlyings"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_types: {
        Row: {
          category: string | null
          created_at: string
          default_direction: string | null
          description: string | null
          id: string
          is_active: boolean
          leg_count: number | null
          max_dte: number | null
          min_dte: number | null
          name: string
          risk_profile: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          default_direction?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          leg_count?: number | null
          max_dte?: number | null
          min_dte?: number | null
          name: string
          risk_profile?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          default_direction?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          leg_count?: number | null
          max_dte?: number | null
          min_dte?: number | null
          name?: string
          risk_profile?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      tax_lots: {
        Row: {
          account: string
          acquisition_date: string
          acquisition_event_id: string
          asset_id: string
          consumed_quantity: number
          cost_basis_per_unit: number
          created_at: string
          id: string
          lot_type: string
          original_quantity: number
          owner: string
          remaining_cost_basis: number
          remaining_quantity: number
          status: string
          total_cost_basis: number
          updated_at: string
          user_id: string
        }
        Insert: {
          account: string
          acquisition_date: string
          acquisition_event_id: string
          asset_id: string
          consumed_quantity?: number
          cost_basis_per_unit: number
          created_at?: string
          id?: string
          lot_type?: string
          original_quantity: number
          owner: string
          remaining_cost_basis: number
          remaining_quantity: number
          status?: string
          total_cost_basis: number
          updated_at?: string
          user_id: string
        }
        Update: {
          account?: string
          acquisition_date?: string
          acquisition_event_id?: string
          asset_id?: string
          consumed_quantity?: number
          cost_basis_per_unit?: number
          created_at?: string
          id?: string
          lot_type?: string
          original_quantity?: number
          owner?: string
          remaining_cost_basis?: number
          remaining_quantity?: number
          status?: string
          total_cost_basis?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_lots_acquisition_event_id_fkey"
            columns: ["acquisition_event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_lots_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      thesis_articulations: {
        Row: {
          claim_ids_used: Json
          confidence_level: string
          confidence_rationale: string | null
          core_argument: string
          created_at: string
          evidence_gaps: Json | null
          generated_by: string
          id: string
          key_assumptions: Json
          key_drivers: Json
          referenced_theses: Json | null
          thesis_id: string
          thesis_type: string
          timeframe: Json
          user_edits: string | null
          version: number
        }
        Insert: {
          claim_ids_used?: Json
          confidence_level: string
          confidence_rationale?: string | null
          core_argument: string
          created_at?: string
          evidence_gaps?: Json | null
          generated_by: string
          id?: string
          key_assumptions?: Json
          key_drivers?: Json
          referenced_theses?: Json | null
          thesis_id: string
          thesis_type: string
          timeframe: Json
          user_edits?: string | null
          version?: number
        }
        Update: {
          claim_ids_used?: Json
          confidence_level?: string
          confidence_rationale?: string | null
          core_argument?: string
          created_at?: string
          evidence_gaps?: Json | null
          generated_by?: string
          id?: string
          key_assumptions?: Json
          key_drivers?: Json
          referenced_theses?: Json | null
          thesis_id?: string
          thesis_type?: string
          timeframe?: Json
          user_edits?: string | null
          version?: number
        }
        Relationships: []
      }
      thesis_expression_episodes: {
        Row: {
          closed_at: string | null
          closing_status: string | null
          created_at: string
          episode_no: number
          execution_quality: string | null
          id: string
          opened_at: string
          outcome: string | null
          outcome_notes: string | null
          retrospective_at: string | null
          retrospective_metrics: Json | null
          thesis_id: string
          thesis_type: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          closing_status?: string | null
          created_at?: string
          episode_no: number
          execution_quality?: string | null
          id?: string
          opened_at: string
          outcome?: string | null
          outcome_notes?: string | null
          retrospective_at?: string | null
          retrospective_metrics?: Json | null
          thesis_id: string
          thesis_type: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          closing_status?: string | null
          created_at?: string
          episode_no?: number
          execution_quality?: string | null
          id?: string
          opened_at?: string
          outcome?: string | null
          outcome_notes?: string | null
          retrospective_at?: string | null
          retrospective_metrics?: Json | null
          thesis_id?: string
          thesis_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      thesis_monitoring_configs: {
        Row: {
          company_name: string | null
          created_at: string
          enabled: boolean
          explicit_thresholds: Json
          frequency: string
          id: string
          last_checked: string | null
          next_check: string | null
          search_config: Json
          sources: Json
          thesis_id: string
          thesis_type: string
          ticker: string | null
          updated_at: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          enabled?: boolean
          explicit_thresholds?: Json
          frequency?: string
          id?: string
          last_checked?: string | null
          next_check?: string | null
          search_config?: Json
          sources?: Json
          thesis_id: string
          thesis_type: string
          ticker?: string | null
          updated_at?: string
        }
        Update: {
          company_name?: string | null
          created_at?: string
          enabled?: boolean
          explicit_thresholds?: Json
          frequency?: string
          id?: string
          last_checked?: string | null
          next_check?: string | null
          search_config?: Json
          sources?: Json
          thesis_id?: string
          thesis_type?: string
          ticker?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      trades: {
        Row: {
          account_id: string
          asset_class: string | null
          broker_exec_id: string | null
          broker_transaction_id: string | null
          conid: number | null
          created_at: string | null
          currency: string | null
          exchange: string | null
          fees: number | null
          fx_rate_to_base: number | null
          gross_amount: number | null
          id: string
          net_amount: number | null
          order_type: string | null
          price: number
          quantity: number
          raw_row: Json | null
          side: string
          strategy_id: string | null
          symbol: string
          trade_date: string
        }
        Insert: {
          account_id: string
          asset_class?: string | null
          broker_exec_id?: string | null
          broker_transaction_id?: string | null
          conid?: number | null
          created_at?: string | null
          currency?: string | null
          exchange?: string | null
          fees?: number | null
          fx_rate_to_base?: number | null
          gross_amount?: number | null
          id?: string
          net_amount?: number | null
          order_type?: string | null
          price: number
          quantity: number
          raw_row?: Json | null
          side: string
          strategy_id?: string | null
          symbol: string
          trade_date: string
        }
        Update: {
          account_id?: string
          asset_class?: string | null
          broker_exec_id?: string | null
          broker_transaction_id?: string | null
          conid?: number | null
          created_at?: string | null
          currency?: string | null
          exchange?: string | null
          fees?: number | null
          fx_rate_to_base?: number | null
          gross_amount?: number | null
          id?: string
          net_amount?: number | null
          order_type?: string | null
          price?: number
          quantity?: number
          raw_row?: Json | null
          side?: string
          strategy_id?: string | null
          symbol?: string
          trade_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "trades_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      underlyings: {
        Row: {
          asset_class: string | null
          atr20: number | null
          base_currency: string | null
          cik: string | null
          conid: number | null
          created_at: string | null
          id: string
          iv30: number | null
          name: string | null
          next_earnings_date: string | null
          next_ex_div_date: string | null
          parent_underlying_id: string | null
          rv20: number | null
          spot: number | null
          ticker: string
          updated_at: string | null
        }
        Insert: {
          asset_class?: string | null
          atr20?: number | null
          base_currency?: string | null
          cik?: string | null
          conid?: number | null
          created_at?: string | null
          id?: string
          iv30?: number | null
          name?: string | null
          next_earnings_date?: string | null
          next_ex_div_date?: string | null
          parent_underlying_id?: string | null
          rv20?: number | null
          spot?: number | null
          ticker: string
          updated_at?: string | null
        }
        Update: {
          asset_class?: string | null
          atr20?: number | null
          base_currency?: string | null
          cik?: string | null
          conid?: number | null
          created_at?: string | null
          id?: string
          iv30?: number | null
          name?: string | null
          next_earnings_date?: string | null
          next_ex_div_date?: string | null
          parent_underlying_id?: string | null
          rv20?: number | null
          spot?: number | null
          ticker?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "underlyings_parent_underlying_id_fkey"
            columns: ["parent_underlying_id"]
            isOneToOne: false
            referencedRelation: "underlyings"
            referencedColumns: ["id"]
          },
        ]
      }
      underlyings_iv_history: {
        Row: {
          as_of_date: string
          atr20: number | null
          created_at: string | null
          id: string
          iv30: number | null
          rv20: number | null
          source: string
          spot: number | null
          ticker: string
          underlying_id: string | null
          updated_at: string
        }
        Insert: {
          as_of_date: string
          atr20?: number | null
          created_at?: string | null
          id?: string
          iv30?: number | null
          rv20?: number | null
          source?: string
          spot?: number | null
          ticker: string
          underlying_id?: string | null
          updated_at?: string
        }
        Update: {
          as_of_date?: string
          atr20?: number | null
          created_at?: string | null
          id?: string
          iv30?: number | null
          rv20?: number | null
          source?: string
          spot?: number | null
          ticker?: string
          underlying_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "underlyings_iv_history_underlying_id_fkey"
            columns: ["underlying_id"]
            isOneToOne: false
            referencedRelation: "underlyings"
            referencedColumns: ["id"]
          },
        ]
      }
      vol_curve_reports: {
        Row: {
          created_at: string
          direction: string
          downside_floor: number
          horizon_months: number
          id: string
          iv_rank: number | null
          iv_rv_ratio: number | null
          iv30: number | null
          notes: string | null
          regime: string | null
          report_data: Json
          rv20: number | null
          scanner_snapshot_id: string | null
          spot: number
          strategy_count: number
          target_base: number
          target_high: number
          ticker: string
          top_strategy_label: string | null
          top_strategy_type: string | null
          trigger_source: string
          use_case: string | null
        }
        Insert: {
          created_at?: string
          direction: string
          downside_floor: number
          horizon_months: number
          id?: string
          iv_rank?: number | null
          iv_rv_ratio?: number | null
          iv30?: number | null
          notes?: string | null
          regime?: string | null
          report_data: Json
          rv20?: number | null
          scanner_snapshot_id?: string | null
          spot: number
          strategy_count?: number
          target_base: number
          target_high: number
          ticker: string
          top_strategy_label?: string | null
          top_strategy_type?: string | null
          trigger_source?: string
          use_case?: string | null
        }
        Update: {
          created_at?: string
          direction?: string
          downside_floor?: number
          horizon_months?: number
          id?: string
          iv_rank?: number | null
          iv_rv_ratio?: number | null
          iv30?: number | null
          notes?: string | null
          regime?: string | null
          report_data?: Json
          rv20?: number | null
          scanner_snapshot_id?: string | null
          spot?: number
          strategy_count?: number
          target_base?: number
          target_high?: number
          ticker?: string
          top_strategy_label?: string | null
          top_strategy_type?: string | null
          trigger_source?: string
          use_case?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vol_curve_reports_scanner_snapshot_id_fkey"
            columns: ["scanner_snapshot_id"]
            isOneToOne: false
            referencedRelation: "vol_scan_ticker_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      vol_scan_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_text: string | null
          id: string
          iv_percentile_threshold: number | null
          iv_rv20_ratio_threshold: number | null
          lookback_days: number
          run_date: string
          started_at: string
          status: string
          universe_size: number
          universe_source: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_text?: string | null
          id?: string
          iv_percentile_threshold?: number | null
          iv_rv20_ratio_threshold?: number | null
          lookback_days?: number
          run_date: string
          started_at?: string
          status?: string
          universe_size?: number
          universe_source: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_text?: string | null
          id?: string
          iv_percentile_threshold?: number | null
          iv_rv20_ratio_threshold?: number | null
          lookback_days?: number
          run_date?: string
          started_at?: string
          status?: string
          universe_size?: number
          universe_source?: string
          updated_at?: string
        }
        Relationships: []
      }
      vol_scan_ticker_snapshots: {
        Row: {
          back_month_iv: number | null
          cheapness_score: number | null
          created_at: string
          data_source: string | null
          front_month_iv: number | null
          gate_back_below_front: boolean | null
          gate_front_above_back: boolean | null
          gate_iv_percentile: boolean | null
          gate_iv_percentile_high: boolean | null
          gate_iv_rv_ratio: boolean | null
          gate_iv_rv_ratio_high: boolean | null
          gate_term_normal: boolean | null
          gate_term_stressed: boolean | null
          has_open_position: boolean
          history_days: number | null
          id: string
          is_cheap: boolean
          is_rich: boolean
          iv_percentile_252: number | null
          iv_rank_252: number | null
          iv_rv20_ratio: number | null
          iv30: number | null
          linked_asset_thesis_ids: string[] | null
          regime: string | null
          richness_score: number | null
          run_id: string
          rv20: number | null
          rv60: number | null
          skew_25d: number | null
          spot: number | null
          term_structure_slope: number | null
          ticker: string
          underlying_id: string | null
        }
        Insert: {
          back_month_iv?: number | null
          cheapness_score?: number | null
          created_at?: string
          data_source?: string | null
          front_month_iv?: number | null
          gate_back_below_front?: boolean | null
          gate_front_above_back?: boolean | null
          gate_iv_percentile?: boolean | null
          gate_iv_percentile_high?: boolean | null
          gate_iv_rv_ratio?: boolean | null
          gate_iv_rv_ratio_high?: boolean | null
          gate_term_normal?: boolean | null
          gate_term_stressed?: boolean | null
          has_open_position?: boolean
          history_days?: number | null
          id?: string
          is_cheap?: boolean
          is_rich?: boolean
          iv_percentile_252?: number | null
          iv_rank_252?: number | null
          iv_rv20_ratio?: number | null
          iv30?: number | null
          linked_asset_thesis_ids?: string[] | null
          regime?: string | null
          richness_score?: number | null
          run_id: string
          rv20?: number | null
          rv60?: number | null
          skew_25d?: number | null
          spot?: number | null
          term_structure_slope?: number | null
          ticker: string
          underlying_id?: string | null
        }
        Update: {
          back_month_iv?: number | null
          cheapness_score?: number | null
          created_at?: string
          data_source?: string | null
          front_month_iv?: number | null
          gate_back_below_front?: boolean | null
          gate_front_above_back?: boolean | null
          gate_iv_percentile?: boolean | null
          gate_iv_percentile_high?: boolean | null
          gate_iv_rv_ratio?: boolean | null
          gate_iv_rv_ratio_high?: boolean | null
          gate_term_normal?: boolean | null
          gate_term_stressed?: boolean | null
          has_open_position?: boolean
          history_days?: number | null
          id?: string
          is_cheap?: boolean
          is_rich?: boolean
          iv_percentile_252?: number | null
          iv_rank_252?: number | null
          iv_rv20_ratio?: number | null
          iv30?: number | null
          linked_asset_thesis_ids?: string[] | null
          regime?: string | null
          richness_score?: number | null
          run_id?: string
          rv20?: number | null
          rv60?: number | null
          skew_25d?: number | null
          spot?: number | null
          term_structure_slope?: number | null
          ticker?: string
          underlying_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vol_scan_ticker_snapshots_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "vol_scan_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vol_scan_ticker_snapshots_underlying_id_fkey"
            columns: ["underlying_id"]
            isOneToOne: false
            referencedRelation: "underlyings"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlist_entries: {
        Row: {
          added_at: string
          added_reason: string | null
          created_at: string
          id: string
          is_active: boolean
          notes: string | null
          priority: string
          underlying_id: string
          updated_at: string
        }
        Insert: {
          added_at?: string
          added_reason?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          priority?: string
          underlying_id: string
          updated_at?: string
        }
        Update: {
          added_at?: string
          added_reason?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          priority?: string
          underlying_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_entries_underlying_id_fkey"
            columns: ["underlying_id"]
            isOneToOne: true
            referencedRelation: "underlyings"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      best_daily_prices: {
        Row: {
          asset_id: string | null
          price_close: number | null
          price_date: string | null
          source: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_history_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries_with_underlying: {
        Row: {
          action_description: string | null
          action_type: string | null
          batch_id: string | null
          first_detected_at: string | null
          id: string | null
          last_seen_at: string | null
          metadata: Json | null
          new_state: Json | null
          object_id: string | null
          object_title: string | null
          object_type: string | null
          occurrence_count: number | null
          previous_state: Json | null
          rationale: string | null
          skill_invoked: string | null
          source: string | null
          status: string | null
          timestamp: string | null
          triage_record_id: string | null
          underlying_ticker: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_active_validation_points: {
        Args: { p_thesis_id: string; p_thesis_type: string }
        Returns: {
          articulation_id: string | null
          category: string
          created_at: string
          dependent_thesis_condition: string | null
          dependent_thesis_condition_detail: string | null
          dependent_thesis_id: string | null
          dependent_thesis_type: string | null
          entity_type: string | null
          explicit_details: Json | null
          id: string
          importance: string
          judgment_details: Json | null
          linked_claim_ids: Json | null
          notes: string | null
          rationale: string | null
          response_protocol: Json | null
          source_driver_index: number | null
          source_section: string | null
          statement: string
          status: string
          strategy_id: string | null
          supersedes_signal_id: string | null
          thesis_id: string | null
          thesis_type: string | null
          timeframe: string | null
          trigger_action: Json | null
          type: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "signals"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_latest_articulation: {
        Args: { p_thesis_id: string; p_thesis_type: string }
        Returns: {
          claim_ids_used: Json
          confidence_level: string
          confidence_rationale: string | null
          core_argument: string
          created_at: string
          evidence_gaps: Json | null
          generated_by: string
          id: string
          key_assumptions: Json
          key_drivers: Json
          referenced_theses: Json | null
          thesis_id: string
          thesis_type: string
          timeframe: Json
          user_edits: string | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "thesis_articulations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
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
