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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      accounting_costs: {
        Row: {
          category: string
          cost_date: string
          created_at: string
          created_by: string | null
          customer_name: string
          description: string | null
          gross_amount: number
          hfx_customer_number: string | null
          id: string
          invoice_reference: string | null
          net_amount: number
          product_name: string | null
          supplier: string
          tax_amount: number
          tax_rate: number
          updated_at: string
        }
        Insert: {
          category?: string
          cost_date?: string
          created_at?: string
          created_by?: string | null
          customer_name: string
          description?: string | null
          gross_amount?: number
          hfx_customer_number?: string | null
          id?: string
          invoice_reference?: string | null
          net_amount?: number
          product_name?: string | null
          supplier: string
          tax_amount?: number
          tax_rate?: number
          updated_at?: string
        }
        Update: {
          category?: string
          cost_date?: string
          created_at?: string
          created_by?: string | null
          customer_name?: string
          description?: string | null
          gross_amount?: number
          hfx_customer_number?: string | null
          id?: string
          invoice_reference?: string | null
          net_amount?: number
          product_name?: string | null
          supplier?: string
          tax_amount?: number
          tax_rate?: number
          updated_at?: string
        }
        Relationships: []
      }
      agb_acceptances: {
        Row: {
          accepted_at: string
          agb_version: string
          contract_id: string
          created_at: string
          customer_email: string | null
          customer_name: string | null
          id: string
          ip_address: string | null
          user_agent: string | null
        }
        Insert: {
          accepted_at?: string
          agb_version?: string
          contract_id: string
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
        }
        Update: {
          accepted_at?: string
          agb_version?: string
          contract_id?: string
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agb_acceptances_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agb_acceptances_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_public_booking"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: string | null
          id: string
          ip_address: string | null
          resource_path: string
          success: boolean
          user_agent: string | null
          user_email: string | null
          user_id: string | null
          user_role: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: string | null
          id?: string
          ip_address?: string | null
          resource_path: string
          success?: boolean
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          user_role?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: string | null
          id?: string
          ip_address?: string | null
          resource_path?: string
          success?: boolean
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          user_role?: string | null
        }
        Relationships: []
      }
      commission_payouts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          commission_amount: number
          commission_base_amount: number | null
          commission_rate: number
          commission_role: string | null
          commission_rule_version: string | null
          commission_type: string
          contract_id: string | null
          contract_start_date: string | null
          created_at: string
          exported_at: string | null
          id: string
          invoice_id: string | null
          paid_at: string | null
          payout_trigger: string | null
          pdf_path: string | null
          period_month: string
          product_name: string
          sales_partner_id: string
          sales_partner_name: string
          status: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          commission_amount?: number
          commission_base_amount?: number | null
          commission_rate?: number
          commission_role?: string | null
          commission_rule_version?: string | null
          commission_type?: string
          contract_id?: string | null
          contract_start_date?: string | null
          created_at?: string
          exported_at?: string | null
          id?: string
          invoice_id?: string | null
          paid_at?: string | null
          payout_trigger?: string | null
          pdf_path?: string | null
          period_month: string
          product_name: string
          sales_partner_id: string
          sales_partner_name: string
          status?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          commission_amount?: number
          commission_base_amount?: number | null
          commission_rate?: number
          commission_role?: string | null
          commission_rule_version?: string | null
          commission_type?: string
          contract_id?: string | null
          contract_start_date?: string | null
          created_at?: string
          exported_at?: string | null
          id?: string
          invoice_id?: string | null
          paid_at?: string | null
          payout_trigger?: string | null
          pdf_path?: string | null
          period_month?: string
          product_name?: string
          sales_partner_id?: string
          sales_partner_name?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_payouts_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_payouts_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_public_booking"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_payouts_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_payouts_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "v_invoice_fibu_reconciliation"
            referencedColumns: ["invoice_id"]
          },
        ]
      }
      commission_role_defaults: {
        Row: {
          commission_type: string
          commission_value: number
          created_at: string
          id: string
          product_name: string
          role: string
          updated_at: string
        }
        Insert: {
          commission_type?: string
          commission_value?: number
          created_at?: string
          id?: string
          product_name: string
          role: string
          updated_at?: string
        }
        Update: {
          commission_type?: string
          commission_value?: number
          created_at?: string
          id?: string
          product_name?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      contract_cases: {
        Row: {
          assigned_to: string | null
          case_number: string
          case_type: string
          contract_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          id: string
          notes: string | null
          resolved_at: string | null
          status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          case_number?: string
          case_type?: string
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          notes?: string | null
          resolved_at?: string | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          case_number?: string
          case_type?: string
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          notes?: string | null
          resolved_at?: string | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_cases_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_cases_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_public_booking"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_cases_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          adresse: string | null
          approved_at: string | null
          approved_by: string | null
          auto_renewal: boolean
          bank_name: string | null
          bic: string | null
          bsnr: string | null
          cancellation_period_months: number
          confirmation_email_sent_at: string | null
          contract_number: string | null
          created_at: string
          created_by: string | null
          creditreform_approval_note: string | null
          creditreform_checked_at: string | null
          creditreform_checked_by: string | null
          creditreform_rating: string | null
          creditreform_score: number | null
          customer_confirmation_token: string | null
          customer_confirmed_at: string | null
          customer_id: string | null
          customer_name: string
          discount_percent: number
          document_name: string | null
          document_url: string | null
          duration_months: number
          email: string | null
          end_date: string
          fachrichtung: string | null
          hfx_customer_number: string | null
          iban: string | null
          id: string
          kontoinhaber: string | null
          kontoinhaber_plz_ort: string | null
          kontoinhaber_strasse: string | null
          lanr: string | null
          license_count: number
          mandate_accepted_at: string | null
          modules: string[] | null
          monthly_price: number
          mp_nr: string | null
          nachname: string | null
          notes: string | null
          one_time_fee: number
          ort: string | null
          paper_contract_pdf_path: string | null
          parent_contract_id: string | null
          payment_interval: string
          plz: string | null
          praxis: string | null
          praxisanschrift: string | null
          praxissystem: string | null
          product_name: string
          qodia_unit_price: number
          rechnungs_email: string | null
          rechtsform: string | null
          sales_partner_id: string | null
          sales_partner_name: string | null
          selected_addon_modules: string[] | null
          signature_data: string | null
          start_date: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          stundenaufwand_pro_woche: string | null
          telefon: string | null
          tippgeber_id: string | null
          updated_at: string
          vertrieb_signature_data: string | null
          vorname: string | null
          weitere_bsnr: string | null
          weitere_lanr: string | null
        }
        Insert: {
          adresse?: string | null
          approved_at?: string | null
          approved_by?: string | null
          auto_renewal?: boolean
          bank_name?: string | null
          bic?: string | null
          bsnr?: string | null
          cancellation_period_months?: number
          confirmation_email_sent_at?: string | null
          contract_number?: string | null
          created_at?: string
          created_by?: string | null
          creditreform_approval_note?: string | null
          creditreform_checked_at?: string | null
          creditreform_checked_by?: string | null
          creditreform_rating?: string | null
          creditreform_score?: number | null
          customer_confirmation_token?: string | null
          customer_confirmed_at?: string | null
          customer_id?: string | null
          customer_name: string
          discount_percent?: number
          document_name?: string | null
          document_url?: string | null
          duration_months?: number
          email?: string | null
          end_date: string
          fachrichtung?: string | null
          hfx_customer_number?: string | null
          iban?: string | null
          id?: string
          kontoinhaber?: string | null
          kontoinhaber_plz_ort?: string | null
          kontoinhaber_strasse?: string | null
          lanr?: string | null
          license_count?: number
          mandate_accepted_at?: string | null
          modules?: string[] | null
          monthly_price?: number
          mp_nr?: string | null
          nachname?: string | null
          notes?: string | null
          one_time_fee?: number
          ort?: string | null
          paper_contract_pdf_path?: string | null
          parent_contract_id?: string | null
          payment_interval?: string
          plz?: string | null
          praxis?: string | null
          praxisanschrift?: string | null
          praxissystem?: string | null
          product_name: string
          qodia_unit_price?: number
          rechnungs_email?: string | null
          rechtsform?: string | null
          sales_partner_id?: string | null
          sales_partner_name?: string | null
          selected_addon_modules?: string[] | null
          signature_data?: string | null
          start_date: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          stundenaufwand_pro_woche?: string | null
          telefon?: string | null
          tippgeber_id?: string | null
          updated_at?: string
          vertrieb_signature_data?: string | null
          vorname?: string | null
          weitere_bsnr?: string | null
          weitere_lanr?: string | null
        }
        Update: {
          adresse?: string | null
          approved_at?: string | null
          approved_by?: string | null
          auto_renewal?: boolean
          bank_name?: string | null
          bic?: string | null
          bsnr?: string | null
          cancellation_period_months?: number
          confirmation_email_sent_at?: string | null
          contract_number?: string | null
          created_at?: string
          created_by?: string | null
          creditreform_approval_note?: string | null
          creditreform_checked_at?: string | null
          creditreform_checked_by?: string | null
          creditreform_rating?: string | null
          creditreform_score?: number | null
          customer_confirmation_token?: string | null
          customer_confirmed_at?: string | null
          customer_id?: string | null
          customer_name?: string
          discount_percent?: number
          document_name?: string | null
          document_url?: string | null
          duration_months?: number
          email?: string | null
          end_date?: string
          fachrichtung?: string | null
          hfx_customer_number?: string | null
          iban?: string | null
          id?: string
          kontoinhaber?: string | null
          kontoinhaber_plz_ort?: string | null
          kontoinhaber_strasse?: string | null
          lanr?: string | null
          license_count?: number
          mandate_accepted_at?: string | null
          modules?: string[] | null
          monthly_price?: number
          mp_nr?: string | null
          nachname?: string | null
          notes?: string | null
          one_time_fee?: number
          ort?: string | null
          paper_contract_pdf_path?: string | null
          parent_contract_id?: string | null
          payment_interval?: string
          plz?: string | null
          praxis?: string | null
          praxisanschrift?: string | null
          praxissystem?: string | null
          product_name?: string
          qodia_unit_price?: number
          rechnungs_email?: string | null
          rechtsform?: string | null
          sales_partner_id?: string | null
          sales_partner_name?: string | null
          selected_addon_modules?: string[] | null
          signature_data?: string | null
          start_date?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          stundenaufwand_pro_woche?: string | null
          telefon?: string | null
          tippgeber_id?: string | null
          updated_at?: string
          vertrieb_signature_data?: string | null
          vorname?: string | null
          weitere_bsnr?: string | null
          weitere_lanr?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_parent_contract_id_fkey"
            columns: ["parent_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_parent_contract_id_fkey"
            columns: ["parent_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_public_booking"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_revenues: {
        Row: {
          created_at: string
          customer_name: string
          customer_number: string | null
          due_date: string | null
          exported_to_lexware: boolean
          gross_amount: number
          id: string
          invoice_date: string
          invoice_number: string
          lexware_export_date: string | null
          lexware_voucher_id: string | null
          net_amount: number
          notes: string | null
          paid_at: string | null
          payment_status: string
          praxis_id: string | null
          product_category: string | null
          product_name: string
          quantity: number
          tax_amount: number
          tax_rate: number
          unit_price: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          customer_name: string
          customer_number?: string | null
          due_date?: string | null
          exported_to_lexware?: boolean
          gross_amount: number
          id?: string
          invoice_date: string
          invoice_number: string
          lexware_export_date?: string | null
          lexware_voucher_id?: string | null
          net_amount: number
          notes?: string | null
          paid_at?: string | null
          payment_status?: string
          praxis_id?: string | null
          product_category?: string | null
          product_name: string
          quantity?: number
          tax_amount: number
          tax_rate?: number
          unit_price: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          customer_name?: string
          customer_number?: string | null
          due_date?: string | null
          exported_to_lexware?: boolean
          gross_amount?: number
          id?: string
          invoice_date?: string
          invoice_number?: string
          lexware_export_date?: string | null
          lexware_voucher_id?: string | null
          net_amount?: number
          notes?: string | null
          paid_at?: string | null
          payment_status?: string
          praxis_id?: string | null
          product_category?: string | null
          product_name?: string
          quantity?: number
          tax_amount?: number
          tax_rate?: number
          unit_price?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_revenues_praxis_id_fkey"
            columns: ["praxis_id"]
            isOneToOne: false
            referencedRelation: "praxis_reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          adresse: string | null
          bsnr: string | null
          created_at: string
          email: string | null
          hfx_customer_number: string
          id: string
          lanr: string | null
          mp_nr: string | null
          nachname: string | null
          notes: string | null
          ort: string | null
          plz: string | null
          praxis_name: string | null
          salesforce_id: string | null
          telefon: string | null
          updated_at: string
          vorname: string | null
        }
        Insert: {
          adresse?: string | null
          bsnr?: string | null
          created_at?: string
          email?: string | null
          hfx_customer_number: string
          id?: string
          lanr?: string | null
          mp_nr?: string | null
          nachname?: string | null
          notes?: string | null
          ort?: string | null
          plz?: string | null
          praxis_name?: string | null
          salesforce_id?: string | null
          telefon?: string | null
          updated_at?: string
          vorname?: string | null
        }
        Update: {
          adresse?: string | null
          bsnr?: string | null
          created_at?: string
          email?: string | null
          hfx_customer_number?: string
          id?: string
          lanr?: string | null
          mp_nr?: string | null
          nachname?: string | null
          notes?: string | null
          ort?: string | null
          plz?: string | null
          praxis_name?: string | null
          salesforce_id?: string | null
          telefon?: string | null
          updated_at?: string
          vorname?: string | null
        }
        Relationships: []
      }
      demo_downloads: {
        Row: {
          company_name: string
          contact_name: string | null
          created_at: string
          created_by: string | null
          download_date: string
          email: string | null
          hfx_customer_number: string | null
          id: string
          notes: string | null
          product_name: string | null
          reminder_sent_at: string | null
          status: string
          telefon: string | null
          test_phase_end: string | null
          updated_at: string
        }
        Insert: {
          company_name: string
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          download_date?: string
          email?: string | null
          hfx_customer_number?: string | null
          id?: string
          notes?: string | null
          product_name?: string | null
          reminder_sent_at?: string | null
          status?: string
          telefon?: string | null
          test_phase_end?: string | null
          updated_at?: string
        }
        Update: {
          company_name?: string
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          download_date?: string
          email?: string | null
          hfx_customer_number?: string | null
          id?: string
          notes?: string | null
          product_name?: string | null
          reminder_sent_at?: string | null
          status?: string
          telefon?: string | null
          test_phase_end?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      email_notification_settings: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          is_enabled: boolean
          label: string
          setting_key: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_enabled?: boolean
          label: string
          setting_key: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_enabled?: boolean
          label?: string
          setting_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_template_overrides: {
        Row: {
          created_at: string
          html_content: string
          id: string
          template_key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          html_content: string
          id?: string
          template_key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          html_content?: string
          id?: string
          template_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      fibu_audit_log: {
        Row: {
          action_type: string
          changed_at: string
          changed_by: string | null
          entity_id: string
          entity_type: string
          id: string
          new_value_json: Json | null
          old_value_json: Json | null
          reason: string | null
        }
        Insert: {
          action_type: string
          changed_at?: string
          changed_by?: string | null
          entity_id: string
          entity_type: string
          id?: string
          new_value_json?: Json | null
          old_value_json?: Json | null
          reason?: string | null
        }
        Update: {
          action_type?: string
          changed_at?: string
          changed_by?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          new_value_json?: Json | null
          old_value_json?: Json | null
          reason?: string | null
        }
        Relationships: []
      }
      fibu_events: {
        Row: {
          amount_gross: number
          amount_net: number
          beneficiary_id: string | null
          beneficiary_type: string | null
          commission_amount: number | null
          commission_base_amount: number | null
          commission_rate: number | null
          commission_rule_version: string | null
          commission_type: string | null
          contract_id: string | null
          correction_of_event_id: string | null
          cost_type: string | null
          created_at: string
          created_by: string | null
          currency: string
          customer_id: string | null
          description: string | null
          event_type: string
          export_batch_id: string | null
          export_status: string
          exported_at: string | null
          id: string
          metadata: Json | null
          occurred_at: string
          period_end: string | null
          period_start: string | null
          product_name: string | null
          source_module: string
          source_reference_id: string | null
          status: string
          supplier: string | null
          tax_amount: number
        }
        Insert: {
          amount_gross?: number
          amount_net?: number
          beneficiary_id?: string | null
          beneficiary_type?: string | null
          commission_amount?: number | null
          commission_base_amount?: number | null
          commission_rate?: number | null
          commission_rule_version?: string | null
          commission_type?: string | null
          contract_id?: string | null
          correction_of_event_id?: string | null
          cost_type?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          description?: string | null
          event_type: string
          export_batch_id?: string | null
          export_status?: string
          exported_at?: string | null
          id?: string
          metadata?: Json | null
          occurred_at?: string
          period_end?: string | null
          period_start?: string | null
          product_name?: string | null
          source_module: string
          source_reference_id?: string | null
          status?: string
          supplier?: string | null
          tax_amount?: number
        }
        Update: {
          amount_gross?: number
          amount_net?: number
          beneficiary_id?: string | null
          beneficiary_type?: string | null
          commission_amount?: number | null
          commission_base_amount?: number | null
          commission_rate?: number | null
          commission_rule_version?: string | null
          commission_type?: string | null
          contract_id?: string | null
          correction_of_event_id?: string | null
          cost_type?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          description?: string | null
          event_type?: string
          export_batch_id?: string | null
          export_status?: string
          exported_at?: string | null
          id?: string
          metadata?: Json | null
          occurred_at?: string
          period_end?: string | null
          period_start?: string | null
          product_name?: string | null
          source_module?: string
          source_reference_id?: string | null
          status?: string
          supplier?: string | null
          tax_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "fibu_events_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fibu_events_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_public_booking"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fibu_events_correction_of_event_id_fkey"
            columns: ["correction_of_event_id"]
            isOneToOne: false
            referencedRelation: "fibu_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fibu_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fibu_events_export_batch_id_fkey"
            columns: ["export_batch_id"]
            isOneToOne: false
            referencedRelation: "fibu_export_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      fibu_export_batches: {
        Row: {
          amount_gross_total: number | null
          amount_net_total: number | null
          batch_reference: string
          created_at: string
          export_type: string
          exported_at: string
          exported_by: string | null
          filter_criteria: Json | null
          id: string
          notes: string | null
          period_from: string
          period_to: string
          record_count: number
          status: string
        }
        Insert: {
          amount_gross_total?: number | null
          amount_net_total?: number | null
          batch_reference: string
          created_at?: string
          export_type: string
          exported_at?: string
          exported_by?: string | null
          filter_criteria?: Json | null
          id?: string
          notes?: string | null
          period_from: string
          period_to: string
          record_count?: number
          status?: string
        }
        Update: {
          amount_gross_total?: number | null
          amount_net_total?: number | null
          batch_reference?: string
          created_at?: string
          export_type?: string
          exported_at?: string
          exported_by?: string | null
          filter_criteria?: Json | null
          id?: string
          notes?: string | null
          period_from?: string
          period_to?: string
          record_count?: number
          status?: string
        }
        Relationships: []
      }
      integration_settings: {
        Row: {
          api_key_encrypted: string | null
          auto_sync_enabled: boolean
          created_at: string
          id: string
          integration_type: string
          is_connected: boolean
          last_sync_at: string | null
          sync_interval: string | null
          sync_time: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key_encrypted?: string | null
          auto_sync_enabled?: boolean
          created_at?: string
          id?: string
          integration_type: string
          is_connected?: boolean
          last_sync_at?: string | null
          sync_interval?: string | null
          sync_time?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key_encrypted?: string | null
          auto_sync_enabled?: boolean
          created_at?: string
          id?: string
          integration_type?: string
          is_connected?: boolean
          last_sync_at?: string | null
          sync_interval?: string | null
          sync_time?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      integration_sync_logs: {
        Row: {
          created_at: string
          error_details: string | null
          id: string
          integration_type: string
          message: string | null
          records_count: number | null
          status: string
          sync_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error_details?: string | null
          id?: string
          integration_type: string
          message?: string | null
          records_count?: number | null
          status: string
          sync_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          error_details?: string | null
          id?: string
          integration_type?: string
          message?: string | null
          records_count?: number | null
          status?: string
          sync_type?: string
          user_id?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          adresse: string | null
          contract_id: string | null
          created_at: string
          created_by: string | null
          customer_name: string
          customer_number: string | null
          due_date: string | null
          email_sent_at: string | null
          email_sent_by: string | null
          exported_to_lexware: boolean
          gross_amount: number
          id: string
          invoice_date: string
          invoice_number: string
          lexware_export_date: string | null
          lexware_voucher_id: string | null
          net_amount: number
          notes: string | null
          ort: string | null
          plz: string | null
          positions: Json
          rechnungs_email: string | null
          revenue_id: string | null
          status: string
          stripe_invoice_id: string | null
          tax_amount: number
          tax_rate: number
          updated_at: string
        }
        Insert: {
          adresse?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_name: string
          customer_number?: string | null
          due_date?: string | null
          email_sent_at?: string | null
          email_sent_by?: string | null
          exported_to_lexware?: boolean
          gross_amount?: number
          id?: string
          invoice_date?: string
          invoice_number: string
          lexware_export_date?: string | null
          lexware_voucher_id?: string | null
          net_amount?: number
          notes?: string | null
          ort?: string | null
          plz?: string | null
          positions?: Json
          rechnungs_email?: string | null
          revenue_id?: string | null
          status?: string
          stripe_invoice_id?: string | null
          tax_amount?: number
          tax_rate?: number
          updated_at?: string
        }
        Update: {
          adresse?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_name?: string
          customer_number?: string | null
          due_date?: string | null
          email_sent_at?: string | null
          email_sent_by?: string | null
          exported_to_lexware?: boolean
          gross_amount?: number
          id?: string
          invoice_date?: string
          invoice_number?: string
          lexware_export_date?: string | null
          lexware_voucher_id?: string | null
          net_amount?: number
          notes?: string | null
          ort?: string | null
          plz?: string | null
          positions?: Json
          rechnungs_email?: string | null
          revenue_id?: string | null
          status?: string
          stripe_invoice_id?: string | null
          tax_amount?: number
          tax_rate?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_public_booking"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_revenue_id_fkey"
            columns: ["revenue_id"]
            isOneToOne: false
            referencedRelation: "customer_revenues"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          abrechnungszentrum: string
          adresse: string | null
          assigned_to: string | null
          assignment_source: string | null
          confirmation_email_sent: boolean
          created_at: string
          credentials_sent_at: string | null
          email: string
          generated_password: string | null
          hfx_customer_number: string | null
          honorarplus_synced: boolean
          id: string
          interested_products: string[] | null
          mobilnummer: string
          mp_nummer: string | null
          nachname: string
          nachricht: string | null
          ort: string | null
          plz: string
          praxis_name: string
          qodia_conflict: boolean
          qodia_synced: boolean
          registration_attempts: number
          salesforce_id: string | null
          salesforce_synced: boolean
          source: string
          status: string
          tippgeber_id: string | null
          updated_at: string
          vorname: string
        }
        Insert: {
          abrechnungszentrum?: string
          adresse?: string | null
          assigned_to?: string | null
          assignment_source?: string | null
          confirmation_email_sent?: boolean
          created_at?: string
          credentials_sent_at?: string | null
          email: string
          generated_password?: string | null
          hfx_customer_number?: string | null
          honorarplus_synced?: boolean
          id?: string
          interested_products?: string[] | null
          mobilnummer: string
          mp_nummer?: string | null
          nachname: string
          nachricht?: string | null
          ort?: string | null
          plz: string
          praxis_name: string
          qodia_conflict?: boolean
          qodia_synced?: boolean
          registration_attempts?: number
          salesforce_id?: string | null
          salesforce_synced?: boolean
          source?: string
          status?: string
          tippgeber_id?: string | null
          updated_at?: string
          vorname: string
        }
        Update: {
          abrechnungszentrum?: string
          adresse?: string | null
          assigned_to?: string | null
          assignment_source?: string | null
          confirmation_email_sent?: boolean
          created_at?: string
          credentials_sent_at?: string | null
          email?: string
          generated_password?: string | null
          hfx_customer_number?: string | null
          honorarplus_synced?: boolean
          id?: string
          interested_products?: string[] | null
          mobilnummer?: string
          mp_nummer?: string | null
          nachname?: string
          nachricht?: string | null
          ort?: string | null
          plz?: string
          praxis_name?: string
          qodia_conflict?: boolean
          qodia_synced?: boolean
          registration_attempts?: number
          salesforce_id?: string | null
          salesforce_synced?: boolean
          source?: string
          status?: string
          tippgeber_id?: string | null
          updated_at?: string
          vorname?: string
        }
        Relationships: []
      }
      partner_commission_overrides: {
        Row: {
          commission_type: string
          commission_value: number
          created_at: string
          id: string
          product_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          commission_type?: string
          commission_value?: number
          created_at?: string
          id?: string
          product_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          commission_type?: string
          commission_value?: number
          created_at?: string
          id?: string
          product_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      plz_assignment_log: {
        Row: {
          assignment_source: string
          changed_by: string | null
          created_at: string | null
          entity_id: string
          entity_type: string
          id: string
          matched_rule: string | null
          plz: string | null
          resolved_gebietsleiter_id: string | null
          resolved_gebietsleiter_name: string | null
        }
        Insert: {
          assignment_source: string
          changed_by?: string | null
          created_at?: string | null
          entity_id: string
          entity_type: string
          id?: string
          matched_rule?: string | null
          plz?: string | null
          resolved_gebietsleiter_id?: string | null
          resolved_gebietsleiter_name?: string | null
        }
        Update: {
          assignment_source?: string
          changed_by?: string | null
          created_at?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          matched_rule?: string | null
          plz?: string | null
          resolved_gebietsleiter_id?: string | null
          resolved_gebietsleiter_name?: string | null
        }
        Relationships: []
      }
      plz_gebietsleiter_mapping: {
        Row: {
          created_at: string
          gebietsleiter_id: string | null
          gebietsleiter_name: string
          id: string
          is_active: boolean
          notes: string | null
          plz_bis: string | null
          plz_prefix: string
          plz_von: string | null
          priority: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          gebietsleiter_id?: string | null
          gebietsleiter_name: string
          id?: string
          is_active?: boolean
          notes?: string | null
          plz_bis?: string | null
          plz_prefix: string
          plz_von?: string | null
          priority?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          gebietsleiter_id?: string | null
          gebietsleiter_name?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          plz_bis?: string | null
          plz_prefix?: string
          plz_von?: string | null
          priority?: number
          updated_at?: string
        }
        Relationships: []
      }
      praxen: {
        Row: {
          adresse: string | null
          buchungs_datum: string | null
          converted_from_lead_id: string | null
          created_at: string
          email: string | null
          id: string
          module: string[] | null
          mp_nr: string | null
          name: string
          ort: string | null
          plz: string | null
          preis: number | null
          produkt: string | null
          status: string | null
          telefon: string | null
          updated_at: string
        }
        Insert: {
          adresse?: string | null
          buchungs_datum?: string | null
          converted_from_lead_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          module?: string[] | null
          mp_nr?: string | null
          name: string
          ort?: string | null
          plz?: string | null
          preis?: number | null
          produkt?: string | null
          status?: string | null
          telefon?: string | null
          updated_at?: string
        }
        Update: {
          adresse?: string | null
          buchungs_datum?: string | null
          converted_from_lead_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          module?: string[] | null
          mp_nr?: string | null
          name?: string
          ort?: string | null
          plz?: string | null
          preis?: number | null
          produkt?: string | null
          status?: string | null
          telefon?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "praxen_converted_from_lead_id_fkey"
            columns: ["converted_from_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      praxis_reservations: {
        Row: {
          arzt_namen: string
          created_at: string
          hausnummer: string
          id: string
          notes: string | null
          ort: string
          plz: string
          praxis_name: string
          reservation_months: number
          reserved_by: string | null
          reserved_by_name: string | null
          reserved_until: string
          strasse: string
          telefon: string
          updated_at: string
        }
        Insert: {
          arzt_namen: string
          created_at?: string
          hausnummer: string
          id?: string
          notes?: string | null
          ort: string
          plz: string
          praxis_name: string
          reservation_months?: number
          reserved_by?: string | null
          reserved_by_name?: string | null
          reserved_until: string
          strasse: string
          telefon: string
          updated_at?: string
        }
        Update: {
          arzt_namen?: string
          created_at?: string
          hausnummer?: string
          id?: string
          notes?: string | null
          ort?: string
          plz?: string
          praxis_name?: string
          reservation_months?: number
          reserved_by?: string | null
          reserved_by_name?: string | null
          reserved_until?: string
          strasse?: string
          telefon?: string
          updated_at?: string
        }
        Relationships: []
      }
      processed_stripe_events: {
        Row: {
          error_message: string | null
          event_type: string
          id: string
          metadata: Json | null
          processed_at: string
          status: string
          stripe_event_id: string
        }
        Insert: {
          error_message?: string | null
          event_type: string
          id?: string
          metadata?: Json | null
          processed_at?: string
          status?: string
          stripe_event_id: string
        }
        Update: {
          error_message?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          processed_at?: string
          status?: string
          stripe_event_id?: string
        }
        Relationships: []
      }
      product_commissions: {
        Row: {
          commission_type: string
          commission_value: number
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          product_name: string
          sprint_bonus_1: number | null
          sprint_bonus_2: number | null
          sprint_end: string | null
          sprint_start: string | null
          sprint_target_1: number | null
          sprint_target_2: number | null
          updated_at: string
        }
        Insert: {
          commission_type?: string
          commission_value?: number
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          product_name: string
          sprint_bonus_1?: number | null
          sprint_bonus_2?: number | null
          sprint_end?: string | null
          sprint_start?: string | null
          sprint_target_1?: number | null
          sprint_target_2?: number | null
          updated_at?: string
        }
        Update: {
          commission_type?: string
          commission_value?: number
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          product_name?: string
          sprint_bonus_1?: number | null
          sprint_bonus_2?: number | null
          sprint_end?: string | null
          sprint_start?: string | null
          sprint_target_1?: number | null
          sprint_target_2?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      product_modules: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          monthly_price: number
          name: string
          product_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          monthly_price?: number
          name: string
          product_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          monthly_price?: number
          name?: string
          product_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_modules_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          agb_pdf_path: string | null
          base_license_includes: string | null
          base_license_price: number | null
          created_at: string
          description: string | null
          extra_unit_label: string | null
          extra_unit_price: number | null
          id: string
          is_active: boolean
          licensing_notes: string | null
          monthly_price: number
          name: string
          one_time_fee: number
          price_per_unit: number | null
          price_per_unit_12m: number | null
          price_per_unit_3m: number | null
          price_per_unit_6m: number | null
          price_per_unit_label: string | null
          promo_base_fee_end_date: string | null
          promo_end_date: string | null
          promo_price: number | null
          promo_price_label: string | null
          updated_at: string
        }
        Insert: {
          agb_pdf_path?: string | null
          base_license_includes?: string | null
          base_license_price?: number | null
          created_at?: string
          description?: string | null
          extra_unit_label?: string | null
          extra_unit_price?: number | null
          id?: string
          is_active?: boolean
          licensing_notes?: string | null
          monthly_price?: number
          name: string
          one_time_fee?: number
          price_per_unit?: number | null
          price_per_unit_12m?: number | null
          price_per_unit_3m?: number | null
          price_per_unit_6m?: number | null
          price_per_unit_label?: string | null
          promo_base_fee_end_date?: string | null
          promo_end_date?: string | null
          promo_price?: number | null
          promo_price_label?: string | null
          updated_at?: string
        }
        Update: {
          agb_pdf_path?: string | null
          base_license_includes?: string | null
          base_license_price?: number | null
          created_at?: string
          description?: string | null
          extra_unit_label?: string | null
          extra_unit_price?: number | null
          id?: string
          is_active?: boolean
          licensing_notes?: string | null
          monthly_price?: number
          name?: string
          one_time_fee?: number
          price_per_unit?: number | null
          price_per_unit_12m?: number | null
          price_per_unit_3m?: number | null
          price_per_unit_6m?: number | null
          price_per_unit_label?: string | null
          promo_base_fee_end_date?: string | null
          promo_end_date?: string | null
          promo_price?: number | null
          promo_price_label?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          last_seen_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          last_seen_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          last_seen_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      registration_requests: {
        Row: {
          attempt_count: number
          company: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          last_attempt_at: string | null
          message: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          attempt_count?: number
          company?: string | null
          created_at?: string
          email: string
          full_name: string
          id?: string
          last_attempt_at?: string | null
          message?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          attempt_count?: number
          company?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          last_attempt_at?: string | null
          message?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: []
      }
      salesforce_connections: {
        Row: {
          access_token: string | null
          code_verifier: string | null
          created_at: string
          id: string
          instance_url: string | null
          is_connected: boolean | null
          issued_at: string | null
          refresh_token: string | null
          token_type: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          code_verifier?: string | null
          created_at?: string
          id?: string
          instance_url?: string | null
          is_connected?: boolean | null
          issued_at?: string | null
          refresh_token?: string | null
          token_type?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          code_verifier?: string | null
          created_at?: string
          id?: string
          instance_url?: string | null
          is_connected?: boolean | null
          issued_at?: string | null
          refresh_token?: string | null
          token_type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      signature_audit_logs: {
        Row: {
          contract_id: string
          created_at: string
          created_by: string | null
          document_hash: string | null
          id: string
          ip_address: string | null
          signature_data_hash: string | null
          signed_at: string
          signer_email: string | null
          signer_name: string
          signer_type: string
          user_agent: string | null
        }
        Insert: {
          contract_id: string
          created_at?: string
          created_by?: string | null
          document_hash?: string | null
          id?: string
          ip_address?: string | null
          signature_data_hash?: string | null
          signed_at?: string
          signer_email?: string | null
          signer_name: string
          signer_type: string
          user_agent?: string | null
        }
        Update: {
          contract_id?: string
          created_at?: string
          created_by?: string | null
          document_hash?: string | null
          id?: string
          ip_address?: string | null
          signature_data_hash?: string | null
          signed_at?: string
          signer_email?: string | null
          signer_name?: string
          signer_type?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signature_audit_logs_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_audit_logs_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_public_booking"
            referencedColumns: ["id"]
          },
        ]
      }
      tipp_leads: {
        Row: {
          ad_email: string | null
          ad_telefon: string | null
          arzt_name: string
          assignment_source: string | null
          created_at: string
          created_by: string
          email: string | null
          geschaeftsbereich: string
          gewuenschte_dienstleistung: string
          id: string
          notes: string | null
          plz: string
          praxis_name: string
          reservation_until: string | null
          salesforce_id: string | null
          salesforce_synced: boolean
          status: string
          telefon: string | null
          updated_at: string
        }
        Insert: {
          ad_email?: string | null
          ad_telefon?: string | null
          arzt_name: string
          assignment_source?: string | null
          created_at?: string
          created_by: string
          email?: string | null
          geschaeftsbereich: string
          gewuenschte_dienstleistung: string
          id?: string
          notes?: string | null
          plz: string
          praxis_name: string
          reservation_until?: string | null
          salesforce_id?: string | null
          salesforce_synced?: boolean
          status?: string
          telefon?: string | null
          updated_at?: string
        }
        Update: {
          ad_email?: string | null
          ad_telefon?: string | null
          arzt_name?: string
          assignment_source?: string | null
          created_at?: string
          created_by?: string
          email?: string | null
          geschaeftsbereich?: string
          gewuenschte_dienstleistung?: string
          id?: string
          notes?: string | null
          plz?: string
          praxis_name?: string
          reservation_until?: string | null
          salesforce_id?: string | null
          salesforce_synced?: boolean
          status?: string
          telefon?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tippgeber_agreements: {
        Row: {
          file_name: string
          file_path: string
          id: string
          uploaded_at: string
          uploaded_by: string | null
          user_id: string
        }
        Insert: {
          file_name: string
          file_path: string
          id?: string
          uploaded_at?: string
          uploaded_by?: string | null
          user_id: string
        }
        Update: {
          file_name?: string
          file_path?: string
          id?: string
          uploaded_at?: string
          uploaded_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      tippgeber_milestone_tracking: {
        Row: {
          contract_id: string | null
          created_at: string
          cumulative_revenue: number
          id: string
          milestone_reached: boolean
          milestone_reached_at: string | null
          payout_id: string | null
          payout_triggered: boolean
          payout_triggered_at: string | null
          payout_triggered_by: string | null
          tippgeber_id: string
          updated_at: string
        }
        Insert: {
          contract_id?: string | null
          created_at?: string
          cumulative_revenue?: number
          id?: string
          milestone_reached?: boolean
          milestone_reached_at?: string | null
          payout_id?: string | null
          payout_triggered?: boolean
          payout_triggered_at?: string | null
          payout_triggered_by?: string | null
          tippgeber_id: string
          updated_at?: string
        }
        Update: {
          contract_id?: string | null
          created_at?: string
          cumulative_revenue?: number
          id?: string
          milestone_reached?: boolean
          milestone_reached_at?: string | null
          payout_id?: string | null
          payout_triggered?: boolean
          payout_triggered_at?: string | null
          payout_triggered_by?: string | null
          tippgeber_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tippgeber_milestone_tracking_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tippgeber_milestone_tracking_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_public_booking"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tippgeber_milestone_tracking_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "commission_payouts"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_charges: {
        Row: {
          contract_id: string | null
          hfx_customer_number: string
          id: string
          invoice_id: string | null
          net_amount: number
          notes: string | null
          period_from: string
          period_to: string
          quantity: number
          received_at: string
          source: string
          status: string
          unit_description: string
          unit_price: number
        }
        Insert: {
          contract_id?: string | null
          hfx_customer_number: string
          id?: string
          invoice_id?: string | null
          net_amount?: number
          notes?: string | null
          period_from: string
          period_to: string
          quantity?: number
          received_at?: string
          source?: string
          status?: string
          unit_description?: string
          unit_price?: number
        }
        Update: {
          contract_id?: string | null
          hfx_customer_number?: string
          id?: string
          invoice_id?: string | null
          net_amount?: number
          notes?: string | null
          period_from?: string
          period_to?: string
          quantity?: number
          received_at?: string
          source?: string
          status?: string
          unit_description?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "usage_charges_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_charges_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_public_booking"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_charges_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_charges_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "v_invoice_fibu_reconciliation"
            referencedColumns: ["invoice_id"]
          },
        ]
      }
      user_regional_assignments: {
        Row: {
          created_at: string
          id: string
          regional_lead_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          regional_lead_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          regional_lead_id?: string
          user_id?: string
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
      contracts_public_booking: {
        Row: {
          customer_name: string | null
          fachrichtung: string | null
          hfx_customer_number: string | null
          id: string | null
          modules: string[] | null
          monthly_price: number | null
          praxis: string | null
          product_name: string | null
          rechtsform: string | null
          status: string | null
        }
        Insert: {
          customer_name?: string | null
          fachrichtung?: string | null
          hfx_customer_number?: string | null
          id?: string | null
          modules?: string[] | null
          monthly_price?: number | null
          praxis?: string | null
          product_name?: string | null
          rechtsform?: string | null
          status?: string | null
        }
        Update: {
          customer_name?: string | null
          fachrichtung?: string | null
          hfx_customer_number?: string | null
          id?: string | null
          modules?: string[] | null
          monthly_price?: number | null
          praxis?: string | null
          product_name?: string | null
          rechtsform?: string | null
          status?: string | null
        }
        Relationships: []
      }
      fibu_export_batch_seq_view: {
        Row: {
          nextval: number | null
        }
        Relationships: []
      }
      v_combined_fibu_reconciliation: {
        Row: {
          contract_id: string | null
          customer_name: string | null
          customer_number: string | null
          data_source: string | null
          delta_gross: number | null
          delta_net: number | null
          fibu_event_count: number | null
          fibu_event_types: string[] | null
          fibu_gross_total: number | null
          fibu_net_total: number | null
          fibu_tax_total: number | null
          is_legacy: boolean | null
          reconciliation_status: string | null
          record_date: string | null
          record_id: string | null
          record_number: string | null
          source_created_at: string | null
          source_gross: number | null
          source_net: number | null
          source_status: string | null
          source_tax: number | null
        }
        Relationships: []
      }
      v_customer_revenues_compat: {
        Row: {
          created_at: string | null
          customer_name: string | null
          customer_number: string | null
          data_source: string | null
          due_date: string | null
          exported_to_lexware: boolean | null
          gross_amount: number | null
          id: string | null
          invoice_date: string | null
          invoice_number: string | null
          is_legacy: boolean | null
          lexware_export_date: string | null
          lexware_voucher_id: string | null
          net_amount: number | null
          notes: string | null
          paid_at: string | null
          payment_status: string | null
          praxis_id: string | null
          product_category: string | null
          product_name: string | null
          quantity: number | null
          tax_amount: number | null
          tax_rate: number | null
          unit_price: number | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: []
      }
      v_invoice_fibu_reconciliation: {
        Row: {
          contract_id: string | null
          customer_name: string | null
          customer_number: string | null
          delta_gross: number | null
          delta_net: number | null
          fibu_event_count: number | null
          fibu_event_types: string[] | null
          fibu_gross_total: number | null
          fibu_net_total: number | null
          fibu_tax_total: number | null
          invoice_created_at: string | null
          invoice_date: string | null
          invoice_gross: number | null
          invoice_id: string | null
          invoice_net: number | null
          invoice_number: string | null
          invoice_status: string | null
          invoice_tax: number | null
          reconciliation_status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts_public_booking"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      get_public_contract_booking: {
        Args: { p_contract_id: string }
        Returns: {
          customer_name: string
          fachrichtung: string
          hfx_customer_number: string
          id: string
          modules: string[]
          monthly_price: number
          praxis: string
          product_name: string
          rechtsform: string
          status: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_in_regional_lead_team: {
        Args: { _regional_lead_id: string; _user_id: string }
        Returns: boolean
      }
      resolve_plz_ad: {
        Args: { plz_input: string }
        Returns: {
          gebietsleiter_id: string
          gebietsleiter_name: string
          matched_rule: string
        }[]
      }
      submit_registration_request: {
        Args: {
          p_company?: string
          p_email: string
          p_full_name: string
          p_message?: string
        }
        Returns: Json
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "sales_partner"
        | "user"
        | "sales_lead"
        | "vertragsabteilung"
        | "regional_lead"
        | "tippgeber"
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
      app_role: [
        "admin",
        "sales_partner",
        "user",
        "sales_lead",
        "vertragsabteilung",
        "regional_lead",
        "tippgeber",
      ],
    },
  },
} as const
