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
          created_at: string
          created_by: string | null
          creditreform_approval_note: string | null
          creditreform_checked_at: string | null
          creditreform_checked_by: string | null
          creditreform_rating: string | null
          creditreform_score: number | null
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
          modules: string[] | null
          monthly_price: number
          mp_nr: string | null
          nachname: string | null
          notes: string | null
          one_time_fee: number
          ort: string | null
          payment_interval: string
          plz: string | null
          praxis: string | null
          praxisanschrift: string | null
          praxissystem: string | null
          product_name: string
          rechtsform: string | null
          sales_partner_id: string | null
          sales_partner_name: string | null
          selected_addon_modules: string[] | null
          signature_data: string | null
          start_date: string
          status: string
          stundenaufwand_pro_woche: string | null
          telefon: string | null
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
          created_at?: string
          created_by?: string | null
          creditreform_approval_note?: string | null
          creditreform_checked_at?: string | null
          creditreform_checked_by?: string | null
          creditreform_rating?: string | null
          creditreform_score?: number | null
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
          modules?: string[] | null
          monthly_price?: number
          mp_nr?: string | null
          nachname?: string | null
          notes?: string | null
          one_time_fee?: number
          ort?: string | null
          payment_interval?: string
          plz?: string | null
          praxis?: string | null
          praxisanschrift?: string | null
          praxissystem?: string | null
          product_name: string
          rechtsform?: string | null
          sales_partner_id?: string | null
          sales_partner_name?: string | null
          selected_addon_modules?: string[] | null
          signature_data?: string | null
          start_date: string
          status?: string
          stundenaufwand_pro_woche?: string | null
          telefon?: string | null
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
          created_at?: string
          created_by?: string | null
          creditreform_approval_note?: string | null
          creditreform_checked_at?: string | null
          creditreform_checked_by?: string | null
          creditreform_rating?: string | null
          creditreform_score?: number | null
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
          modules?: string[] | null
          monthly_price?: number
          mp_nr?: string | null
          nachname?: string | null
          notes?: string | null
          one_time_fee?: number
          ort?: string | null
          payment_interval?: string
          plz?: string | null
          praxis?: string | null
          praxisanschrift?: string | null
          praxissystem?: string | null
          product_name?: string
          rechtsform?: string | null
          sales_partner_id?: string | null
          sales_partner_name?: string | null
          selected_addon_modules?: string[] | null
          signature_data?: string | null
          start_date?: string
          status?: string
          stundenaufwand_pro_woche?: string | null
          telefon?: string | null
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
            referencedRelation: "praxen"
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
          status?: string
          telefon?: string | null
          test_phase_end?: string | null
          updated_at?: string
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
      leads: {
        Row: {
          abrechnungszentrum: string
          confirmation_email_sent: boolean
          created_at: string
          email: string
          generated_password: string | null
          hfx_customer_number: string | null
          honorarplus_synced: boolean
          id: string
          mobilnummer: string
          mp_nummer: string | null
          nachname: string
          nachricht: string | null
          plz: string
          praxis_name: string
          qodia_synced: boolean
          salesforce_id: string | null
          salesforce_synced: boolean
          status: string
          updated_at: string
          vorname: string
        }
        Insert: {
          abrechnungszentrum?: string
          confirmation_email_sent?: boolean
          created_at?: string
          email: string
          generated_password?: string | null
          hfx_customer_number?: string | null
          honorarplus_synced?: boolean
          id?: string
          mobilnummer: string
          mp_nummer?: string | null
          nachname: string
          nachricht?: string | null
          plz: string
          praxis_name: string
          qodia_synced?: boolean
          salesforce_id?: string | null
          salesforce_synced?: boolean
          status?: string
          updated_at?: string
          vorname: string
        }
        Update: {
          abrechnungszentrum?: string
          confirmation_email_sent?: boolean
          created_at?: string
          email?: string
          generated_password?: string | null
          hfx_customer_number?: string | null
          honorarplus_synced?: boolean
          id?: string
          mobilnummer?: string
          mp_nummer?: string | null
          nachname?: string
          nachricht?: string | null
          plz?: string
          praxis_name?: string
          qodia_synced?: boolean
          salesforce_id?: string | null
          salesforce_synced?: boolean
          status?: string
          updated_at?: string
          vorname?: string
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
      product_commissions: {
        Row: {
          commission_type: string
          commission_value: number
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          product_name: string
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
          company: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          message: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          email: string
          full_name: string
          id?: string
          message?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
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
    }
    Enums: {
      app_role:
        | "admin"
        | "sales_partner"
        | "user"
        | "sales_lead"
        | "vertragsabteilung"
        | "regional_lead"
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
      ],
    },
  },
} as const
