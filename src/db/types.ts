// Auto-generated TypeScript types from Supabase
// Generated via: mcp_supabase_generate_typescript_types
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
          base_currency: string | null
          broker_account_id: string
          broker_name: string
          created_at: string
          id: string
          label: string | null
          updated_at: string
        }
        Insert: {
          base_currency?: string | null
          broker_account_id: string
          broker_name: string
          created_at?: string
          id?: string
          label?: string | null
          updated_at?: string
        }
        Update: {
          base_currency?: string | null
          broker_account_id?: string
          broker_name?: string
          created_at?: string
          id?: string
          label?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      blotter_actions: {
        Row: {
          action_class: string | null
          action_date: string
          action_detail: string | null
          blotter_id: string
          completed: boolean | null
          created_at: string | null
          execution_ref: string | null
          follow_up_date: string | null
          follow_up_required: boolean | null
          id: string
          leg_scope: string | null
          notes: string | null
          premium_change: number | null
          qty_change: number | null
          realized_pnl: number | null
          reason_code: string | null
          risk_notes_at_action: string | null
          size_after_notional: number | null
          size_before_notional: number | null
          snapshot_date: string | null
          state_code_at_action: string | null
          strategy_id: string | null
          strategy_key: string | null
          strategy_label: string | null
          strategy_type_at_action: string | null
          ticker: string | null
          triage_flag_at_action: string | null
        }
        Insert: {
          action_class?: string | null
          action_date: string
          action_detail?: string | null
          blotter_id: string
          completed?: boolean | null
          created_at?: string | null
          execution_ref?: string | null
          follow_up_date?: string | null
          follow_up_required?: boolean | null
          id?: string
          leg_scope?: string | null
          notes?: string | null
          premium_change?: number | null
          qty_change?: number | null
          realized_pnl?: number | null
          reason_code?: string | null
          risk_notes_at_action?: string | null
          size_after_notional?: number | null
          size_before_notional?: number | null
          snapshot_date?: string | null
          state_code_at_action?: string | null
          strategy_id?: string | null
          strategy_key?: string | null
          strategy_label?: string | null
          strategy_type_at_action?: string | null
          ticker?: string | null
          triage_flag_at_action?: string | null
        }
        Update: {
          action_class?: string | null
          action_date?: string
          action_detail?: string | null
          blotter_id?: string
          completed?: boolean | null
          created_at?: string | null
          execution_ref?: string | null
          follow_up_date?: string | null
          follow_up_required?: boolean | null
          id?: string
          leg_scope?: string | null
          notes?: string | null
          premium_change?: number | null
          qty_change?: number | null
          realized_pnl?: number | null
          reason_code?: string | null
          risk_notes_at_action?: string | null
          size_after_notional?: number | null
          size_before_notional?: number | null
          snapshot_date?: string | null
          state_code_at_action?: string | null
          strategy_id?: string | null
          strategy_key?: string | null
          strategy_label?: string | null
          strategy_type_at_action?: string | null
          ticker?: string | null
          triage_flag_at_action?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blotter_actions_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
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
      positions: {
        Row: {
          abs_notional: number | null
          account_id: string
          asset_class: string | null
          avg_price: number | null
          close_date: string | null
          conid: number | null
          created_at: string | null
          expiry: string | null
          extrinsic: number | null
          id: string
          intrinsic: number | null
          is_open: boolean
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
          account_id: string
          asset_class?: string | null
          avg_price?: number | null
          close_date?: string | null
          conid?: number | null
          created_at?: string | null
          expiry?: string | null
          extrinsic?: number | null
          id?: string
          intrinsic?: number | null
          is_open?: boolean
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
          account_id?: string
          asset_class?: string | null
          avg_price?: number | null
          close_date?: string | null
          conid?: number | null
          created_at?: string | null
          expiry?: string | null
          extrinsic?: number | null
          id?: string
          intrinsic?: number | null
          is_open?: boolean
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
      strategies: {
        Row: {
          account_id: string | null
          closed_at: string | null
          created_at: string | null
          defense_rules: string | null
          entry_context: string | null
          entry_iv30: number | null
          entry_notional: number | null
          entry_spot: number | null
          exit_criteria: string | null
          id: string
          net_premium: number | null
          opened_at: string
          profit_rules: string | null
          status: string
          strategy_key: string
          strategy_template_id: string
          thesis: string | null
          time_horizon: string | null
          time_rules: string | null
          total_abs_notional: number | null
          total_unrealized_pnl: number | null
          updated_at: string | null
        }
        Insert: {
          account_id?: string | null
          closed_at?: string | null
          created_at?: string | null
          defense_rules?: string | null
          entry_context?: string | null
          entry_iv30?: number | null
          entry_notional?: number | null
          entry_spot?: number | null
          exit_criteria?: string | null
          id?: string
          net_premium?: number | null
          opened_at: string
          profit_rules?: string | null
          status?: string
          strategy_key: string
          strategy_template_id: string
          thesis?: string | null
          time_horizon?: string | null
          time_rules?: string | null
          total_abs_notional?: number | null
          total_unrealized_pnl?: number | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string | null
          closed_at?: string | null
          created_at?: string | null
          defense_rules?: string | null
          entry_context?: string | null
          entry_iv30?: number | null
          entry_notional?: number | null
          entry_spot?: number | null
          exit_criteria?: string | null
          id?: string
          net_premium?: number | null
          opened_at?: string
          profit_rules?: string | null
          status?: string
          strategy_key?: string
          strategy_template_id?: string
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
            foreignKeyName: "strategies_strategy_template_id_fkey"
            columns: ["strategy_template_id"]
            isOneToOne: false
            referencedRelation: "strategy_templates"
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
      triage_records: {
        Row: {
          abs_notional: number | null
          account_id: string | null
          asset_class: string | null
          created_at: string | null
          dte_bucket: string | null
          flag_assignment: boolean | null
          flag_dte_long: boolean | null
          flag_dte_short: boolean | null
          flag_itm: string | null
          flag_sigma_0_5: boolean | null
          flag_sigma_1_0: boolean | null
          id: string
          notes: string | null
          position_id: string | null
          sigma_to_strike: number | null
          snapshot_date: string
          strategy_id: string | null
          symbol: string
          triage_action: string | null
          unrealized_pnl: number | null
        }
        Insert: {
          abs_notional?: number | null
          account_id?: string | null
          asset_class?: string | null
          created_at?: string | null
          dte_bucket?: string | null
          flag_assignment?: boolean | null
          flag_dte_long?: boolean | null
          flag_dte_short?: boolean | null
          flag_itm?: string | null
          flag_sigma_0_5?: boolean | null
          flag_sigma_1_0?: boolean | null
          id?: string
          notes?: string | null
          position_id?: string | null
          sigma_to_strike?: number | null
          snapshot_date: string
          strategy_id?: string | null
          symbol: string
          triage_action?: string | null
          unrealized_pnl?: number | null
        }
        Update: {
          abs_notional?: number | null
          account_id?: string | null
          asset_class?: string | null
          created_at?: string | null
          dte_bucket?: string | null
          flag_assignment?: boolean | null
          flag_dte_long?: boolean | null
          flag_dte_short?: boolean | null
          flag_itm?: string | null
          flag_sigma_0_5?: boolean | null
          flag_sigma_1_0?: boolean | null
          id?: string
          notes?: string | null
          position_id?: string | null
          sigma_to_strike?: number | null
          snapshot_date?: string
          strategy_id?: string | null
          symbol?: string
          triage_action?: string | null
          unrealized_pnl?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "triage_records_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "triage_records_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "triage_records_strategy_id_fkey"
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
          created_at: string | null
          id: string
          iv30: number | null
          name: string | null
          next_earnings_date: string | null
          next_ex_div_date: string | null
          rv20: number | null
          spot: number | null
          ticker: string
          updated_at: string | null
        }
        Insert: {
          asset_class?: string | null
          atr20?: number | null
          base_currency?: string | null
          created_at?: string | null
          id?: string
          iv30?: number | null
          name?: string | null
          next_earnings_date?: string | null
          next_ex_div_date?: string | null
          rv20?: number | null
          spot?: number | null
          ticker: string
          updated_at?: string | null
        }
        Update: {
          asset_class?: string | null
          atr20?: number | null
          base_currency?: string | null
          created_at?: string | null
          id?: string
          iv30?: number | null
          name?: string | null
          next_earnings_date?: string | null
          next_ex_div_date?: string | null
          rv20?: number | null
          spot?: number | null
          ticker?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      underlyings_iv_history: {
        Row: {
          as_of_date: string
          atr20: number | null
          created_at: string | null
          id: string
          iv30: number | null
          rv20: number | null
          spot: number | null
          underlying_id: string
        }
        Insert: {
          as_of_date: string
          atr20?: number | null
          created_at?: string | null
          id?: string
          iv30?: number | null
          rv20?: number | null
          spot?: number | null
          underlying_id: string
        }
        Update: {
          as_of_date?: string
          atr20?: number | null
          created_at?: string | null
          id?: string
          iv30?: number | null
          rv20?: number | null
          spot?: number | null
          underlying_id?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

