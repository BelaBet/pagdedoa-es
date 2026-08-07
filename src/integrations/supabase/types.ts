export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  public: {
    Tables: {
      api_keys: {
        Row: {
          active: boolean;
          created_at: string;
          id: string;
          key_hash: string;
          label: string;
          service: Database["public"]["Enums"]["api_service"];
          tenant_id: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          id?: string;
          key_hash: string;
          label: string;
          service: Database["public"]["Enums"]["api_service"];
          tenant_id: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: string;
          key_hash?: string;
          label?: string;
          service?: Database["public"]["Enums"]["api_service"];
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "api_keys_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "api_keys_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants_public";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          action: string;
          created_at: string;
          entity: string | null;
          entity_id: string | null;
          id: string;
          metadata: Json | null;
          tenant_id: string;
          user_id: string | null;
        };
        Insert: {
          action: string;
          created_at?: string;
          entity?: string | null;
          entity_id?: string | null;
          id?: string;
          metadata?: Json | null;
          tenant_id: string;
          user_id?: string | null;
        };
        Update: {
          action?: string;
          created_at?: string;
          entity?: string | null;
          entity_id?: string | null;
          id?: string;
          metadata?: Json | null;
          tenant_id?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_logs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants_public";
            referencedColumns: ["id"];
          },
        ];
      };
      cost_centers: {
        Row: {
          allows_installments: boolean;
          created_at: string;
          description: string | null;
          display_order: number;
          id: string;
          is_active: boolean;
          max_installments: number;
          name: string;
          qr_code_url: string | null;
          slug: string;
          split_platform_percent: number;
          split_seller_percent: number;
          tenant_id: string;
          type: Database["public"]["Enums"]["cost_center_type"];
          updated_at: string;
        };
        Insert: {
          allows_installments?: boolean;
          created_at?: string;
          description?: string | null;
          display_order?: number;
          id?: string;
          is_active?: boolean;
          max_installments?: number;
          name: string;
          qr_code_url?: string | null;
          slug: string;
          split_platform_percent?: number;
          split_seller_percent?: number;
          tenant_id: string;
          type?: Database["public"]["Enums"]["cost_center_type"];
          updated_at?: string;
        };
        Update: {
          allows_installments?: boolean;
          created_at?: string;
          description?: string | null;
          display_order?: number;
          id?: string;
          is_active?: boolean;
          max_installments?: number;
          name?: string;
          qr_code_url?: string | null;
          slug?: string;
          split_platform_percent?: number;
          split_seller_percent?: number;
          tenant_id?: string;
          type?: Database["public"]["Enums"]["cost_center_type"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cost_centers_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cost_centers_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants_public";
            referencedColumns: ["id"];
          },
        ];
      };
      donations: {
        Row: {
          admin_fee: number | null;
          amount: number;
          campaign_id: string | null;
          card_brand: string | null;
          card_last_four: string | null;
          cost_center_id: string | null;
          created_at: string;
          deleted_at: string | null;
          deleted_by: string | null;
          donor_document: string | null;
          donor_email: string | null;
          donor_name: string | null;
          donor_phone: string | null;
          gateway_id: string | null;
          gross_amount: number | null;
          id: string;
          installments: number | null;
          net_amount: number | null;
          payment_id: string | null;
          payment_method: string | null;
          profile_id: string | null;
          receipt_url: string | null;
          tenant_id: string;
        };
        Insert: {
          admin_fee?: number | null;
          amount: number;
          campaign_id?: string | null;
          card_brand?: string | null;
          card_last_four?: string | null;
          cost_center_id?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
          donor_document?: string | null;
          donor_email?: string | null;
          donor_name?: string | null;
          donor_phone?: string | null;
          gateway_id?: string | null;
          gross_amount?: number | null;
          id?: string;
          installments?: number | null;
          net_amount?: number | null;
          payment_id?: string | null;
          payment_method?: string | null;
          profile_id?: string | null;
          receipt_url?: string | null;
          tenant_id: string;
        };
        Update: {
          admin_fee?: number | null;
          amount?: number;
          campaign_id?: string | null;
          card_brand?: string | null;
          card_last_four?: string | null;
          cost_center_id?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
          donor_document?: string | null;
          donor_email?: string | null;
          donor_name?: string | null;
          donor_phone?: string | null;
          gateway_id?: string | null;
          gross_amount?: number | null;
          id?: string;
          installments?: number | null;
          net_amount?: number | null;
          payment_id?: string | null;
          payment_method?: string | null;
          profile_id?: string | null;
          receipt_url?: string | null;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "donations_campaign_id_fkey";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "donations_cost_center_id_fkey";
            columns: ["cost_center_id"];
            isOneToOne: false;
            referencedRelation: "cost_centers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "donations_cost_center_id_fkey";
            columns: ["cost_center_id"];
            isOneToOne: false;
            referencedRelation: "cost_centers_public";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "donations_payment_id_fkey";
            columns: ["payment_id"];
            isOneToOne: false;
            referencedRelation: "payments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "donations_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "donations_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "donations_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants_public";
            referencedColumns: ["id"];
          },
        ];
      };
      email_send_log: {
        Row: {
          created_at: string;
          error_message: string | null;
          id: string;
          message_id: string | null;
          metadata: Json | null;
          recipient_email: string;
          status: string;
          template_name: string;
        };
        Insert: {
          created_at?: string;
          error_message?: string | null;
          id?: string;
          message_id?: string | null;
          metadata?: Json | null;
          recipient_email: string;
          status: string;
          template_name: string;
        };
        Update: {
          created_at?: string;
          error_message?: string | null;
          id?: string;
          message_id?: string | null;
          metadata?: Json | null;
          recipient_email?: string;
          status?: string;
          template_name?: string;
        };
        Relationships: [];
      };
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number;
          batch_size: number;
          id: number;
          retry_after_until: string | null;
          send_delay_ms: number;
          transactional_email_ttl_minutes: number;
          updated_at: string;
        };
        Insert: {
          auth_email_ttl_minutes?: number;
          batch_size?: number;
          id?: number;
          retry_after_until?: string | null;
          send_delay_ms?: number;
          transactional_email_ttl_minutes?: number;
          updated_at?: string;
        };
        Update: {
          auth_email_ttl_minutes?: number;
          batch_size?: number;
          id?: number;
          retry_after_until?: string | null;
          send_delay_ms?: number;
          transactional_email_ttl_minutes?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      email_unsubscribe_tokens: {
        Row: {
          created_at: string;
          email: string;
          id: string;
          token: string;
          used_at: string | null;
        };
        Insert: {
          created_at?: string;
          email: string;
          id?: string;
          token: string;
          used_at?: string | null;
        };
        Update: {
          created_at?: string;
          email?: string;
          id?: string;
          token?: string;
          used_at?: string | null;
        };
        Relationships: [];
      };
      events: {
        Row: {
          banner_url: string | null;
          capacity: number | null;
          created_at: string;
          date: string | null;
          description: string | null;
          external_url: string;
          featured: boolean | null;
          id: string;
          location: string | null;
          status: Database["public"]["Enums"]["event_status"];
          tenant_id: string;
          ticket_price: number | null;
          title: string;
          type: Database["public"]["Enums"]["event_type"];
        };
        Insert: {
          banner_url?: string | null;
          capacity?: number | null;
          created_at?: string;
          date?: string | null;
          description?: string | null;
          external_url: string;
          featured?: boolean | null;
          id?: string;
          location?: string | null;
          status?: Database["public"]["Enums"]["event_status"];
          tenant_id: string;
          ticket_price?: number | null;
          title: string;
          type?: Database["public"]["Enums"]["event_type"];
        };
        Update: {
          banner_url?: string | null;
          capacity?: number | null;
          created_at?: string;
          date?: string | null;
          description?: string | null;
          external_url?: string;
          featured?: boolean | null;
          id?: string;
          location?: string | null;
          status?: Database["public"]["Enums"]["event_status"];
          tenant_id?: string;
          ticket_price?: number | null;
          title?: string;
          type?: Database["public"]["Enums"]["event_type"];
        };
        Relationships: [
          {
            foreignKeyName: "events_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "events_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants_public";
            referencedColumns: ["id"];
          },
        ];
      };
      fee_rules: {
        Row: {
          acquirer_fee_percent: number | null;
          adm_fee_percent: number | null;
          anticipation_percent: number | null;
          created_at: string | null;
          id: string;
          is_active: boolean | null;
          payment_method: string;
          tenant_id: string;
          g2_op_fixed: number | null;
          g2_op_percent: number | null;
          transaction_fixed: number | null;
          who_pays: string;
        };
        Insert: {
          acquirer_fee_percent?: number | null;
          adm_fee_percent?: number | null;
          anticipation_percent?: number | null;
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          payment_method: string;
          tenant_id: string;
          g2_op_fixed?: number | null;
          g2_op_percent?: number | null;
          transaction_fixed?: number | null;
          who_pays: string;
        };
        Update: {
          acquirer_fee_percent?: number | null;
          adm_fee_percent?: number | null;
          anticipation_percent?: number | null;
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          payment_method?: string;
          tenant_id?: string;
          g2_op_fixed?: number | null;
          g2_op_percent?: number | null;
          transaction_fixed?: number | null;
          who_pays?: string;
        };
        Relationships: [];
      };
      group_members: {
        Row: {
          added_at: string;
          group_id: string;
          id: string;
          profile_id: string;
        };
        Insert: {
          added_at?: string;
          group_id: string;
          id?: string;
          profile_id: string;
        };
        Update: {
          added_at?: string;
          group_id?: string;
          id?: string;
          profile_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "group_members_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      groups: {
        Row: {
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          name: string;
          tenant_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          name: string;
          tenant_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          name?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "groups_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "groups_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "groups_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants_public";
            referencedColumns: ["id"];
          },
        ];
      };
      impersonation_sessions: {
        Row: {
          ended_at: string | null;
          id: string;
          impersonator_id: string;
          ip_address: string | null;
          reason: string | null;
          started_at: string;
          tenant_id: string;
          user_agent: string | null;
        };
        Insert: {
          ended_at?: string | null;
          id?: string;
          impersonator_id: string;
          ip_address?: string | null;
          reason?: string | null;
          started_at?: string;
          tenant_id: string;
          user_agent?: string | null;
        };
        Update: {
          ended_at?: string | null;
          id?: string;
          impersonator_id?: string;
          ip_address?: string | null;
          reason?: string | null;
          started_at?: string;
          tenant_id?: string;
          user_agent?: string | null;
        };
        Relationships: [];
      };
      messages: {
        Row: {
          channel: Database["public"]["Enums"]["message_channel"];
          content: string;
          created_at: string;
          id: string;
          sender_id: string | null;
          sent_at: string | null;
          status: Database["public"]["Enums"]["message_status"];
          target_id: string | null;
          target_type: Database["public"]["Enums"]["message_target_type"];
          tenant_id: string;
        };
        Insert: {
          channel: Database["public"]["Enums"]["message_channel"];
          content: string;
          created_at?: string;
          id?: string;
          sender_id?: string | null;
          sent_at?: string | null;
          status?: Database["public"]["Enums"]["message_status"];
          target_id?: string | null;
          target_type: Database["public"]["Enums"]["message_target_type"];
          tenant_id: string;
        };
        Update: {
          channel?: Database["public"]["Enums"]["message_channel"];
          content?: string;
          created_at?: string;
          id?: string;
          sender_id?: string | null;
          sent_at?: string | null;
          status?: Database["public"]["Enums"]["message_status"];
          target_id?: string | null;
          target_type?: Database["public"]["Enums"]["message_target_type"];
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_sender_id_fkey";
            columns: ["sender_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants_public";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          body: string | null;
          created_at: string;
          id: string;
          profile_id: string;
          read: boolean;
          tenant_id: string;
          title: string;
          type: string | null;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          id?: string;
          profile_id: string;
          read?: boolean;
          tenant_id: string;
          title: string;
          type?: string | null;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          id?: string;
          profile_id?: string;
          read?: boolean;
          tenant_id?: string;
          title?: string;
          type?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants_public";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          amount: number;
          card_brand: string | null;
          cost_center_id: string | null;
          created_at: string;
          deleted_at: string | null;
          deleted_by: string | null;
          donation_amount: number | null;
          error_message: string | null;
          gateway_id: string | null;
          gateway_request: Json | null;
          gateway_response: Json | null;
          id: string;
          method: Database["public"]["Enums"]["payment_method"];
          pagarme_fee: number | null;
          platform_fee: number | null;
          platform_recipient_id: string | null;
          profile_id: string | null;
          reference_id: string | null;
          reference_type: Database["public"]["Enums"]["payment_ref_type"] | null;
          seller_recipient_id: string | null;
          split_platform_amount: number | null;
          split_seller_amount: number | null;
          status: Database["public"]["Enums"]["payment_status"];
          tenant_id: string;
          g2_op_fee: number | null;
          transacao_fee: number | null;
        };
        Insert: {
          amount: number;
          card_brand?: string | null;
          cost_center_id?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
          donation_amount?: number | null;
          error_message?: string | null;
          gateway_id?: string | null;
          gateway_request?: Json | null;
          gateway_response?: Json | null;
          id?: string;
          method: Database["public"]["Enums"]["payment_method"];
          pagarme_fee?: number | null;
          platform_fee?: number | null;
          platform_recipient_id?: string | null;
          profile_id?: string | null;
          reference_id?: string | null;
          reference_type?: Database["public"]["Enums"]["payment_ref_type"] | null;
          seller_recipient_id?: string | null;
          split_platform_amount?: number | null;
          split_seller_amount?: number | null;
          status?: Database["public"]["Enums"]["payment_status"];
          tenant_id: string;
          g2_op_fee?: number | null;
          transacao_fee?: number | null;
        };
        Update: {
          amount?: number;
          card_brand?: string | null;
          cost_center_id?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
          donation_amount?: number | null;
          error_message?: string | null;
          gateway_id?: string | null;
          gateway_request?: Json | null;
          gateway_response?: Json | null;
          id?: string;
          method?: Database["public"]["Enums"]["payment_method"];
          pagarme_fee?: number | null;
          platform_fee?: number | null;
          platform_recipient_id?: string | null;
          profile_id?: string | null;
          reference_id?: string | null;
          reference_type?: Database["public"]["Enums"]["payment_ref_type"] | null;
          seller_recipient_id?: string | null;
          split_platform_amount?: number | null;
          split_seller_amount?: number | null;
          status?: Database["public"]["Enums"]["payment_status"];
          tenant_id?: string;
          g2_op_fee?: number | null;
          transacao_fee?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "payments_cost_center_id_fkey";
            columns: ["cost_center_id"];
            isOneToOne: false;
            referencedRelation: "cost_centers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_cost_center_id_fkey";
            columns: ["cost_center_id"];
            isOneToOne: false;
            referencedRelation: "cost_centers_public";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants_public";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_fee_config: {
        Row: {
          adm_percent: number;
          adquirencia_2x_percent: number | null;
          adquirencia_avista_percent: number | null;
          adquirencia_fixa: number | null;
          antecipacao_custo_percent: number | null;
          payment_method: string;
          g2_op_percent: number | null;
          g2_operacional_fixo: number | null;
          transacao_fixa: number;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          adm_percent?: number;
          adquirencia_2x_percent?: number | null;
          adquirencia_avista_percent?: number | null;
          adquirencia_fixa?: number | null;
          antecipacao_custo_percent?: number | null;
          payment_method: string;
          g2_op_percent?: number | null;
          g2_operacional_fixo?: number | null;
          transacao_fixa?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          adm_percent?: number;
          adquirencia_2x_percent?: number | null;
          adquirencia_avista_percent?: number | null;
          adquirencia_fixa?: number | null;
          antecipacao_custo_percent?: number | null;
          payment_method?: string;
          g2_op_percent?: number | null;
          g2_operacional_fixo?: number | null;
          transacao_fixa?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      platform_roles: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          role: Database["public"]["Enums"]["platform_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          role: Database["public"]["Enums"]["platform_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          role?: Database["public"]["Enums"]["platform_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      platform_settings: {
        Row: {
          default_accent_color: string | null;
          default_features: Json;
          default_logo_url: string | null;
          default_primary_color: string | null;
          id: string;
          signup_open: boolean;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          default_accent_color?: string | null;
          default_features?: Json;
          default_logo_url?: string | null;
          default_primary_color?: string | null;
          id?: string;
          signup_open?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          default_accent_color?: string | null;
          default_features?: Json;
          default_logo_url?: string | null;
          default_primary_color?: string | null;
          id?: string;
          signup_open?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          email: string | null;
          full_name: string | null;
          id: string;
          lgpd_consent: boolean;
          lgpd_consent_at: string | null;
          phone: string | null;
          status: Database["public"]["Enums"]["profile_status"];
          tenant_id: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id: string;
          lgpd_consent?: boolean;
          lgpd_consent_at?: string | null;
          phone?: string | null;
          status?: Database["public"]["Enums"]["profile_status"];
          tenant_id: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          lgpd_consent?: boolean;
          lgpd_consent_at?: string | null;
          phone?: string | null;
          status?: Database["public"]["Enums"]["profile_status"];
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profiles_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants_public";
            referencedColumns: ["id"];
          },
        ];
      };
      subscription_plans: {
        Row: {
          active: boolean;
          code: string;
          created_at: string;
          description: string | null;
          features: Json;
          id: string;
          max_admins: number | null;
          max_campaigns: number | null;
          max_events_per_month: number | null;
          max_members: number | null;
          max_sms_per_month: number | null;
          max_storage_mb: number | null;
          max_whatsapp_per_month: number | null;
          monthly_price: number;
          name: string;
          sort_order: number;
          transaction_fee_percent: number;
        };
        Insert: {
          active?: boolean;
          code: string;
          created_at?: string;
          description?: string | null;
          features?: Json;
          id?: string;
          max_admins?: number | null;
          max_campaigns?: number | null;
          max_events_per_month?: number | null;
          max_members?: number | null;
          max_sms_per_month?: number | null;
          max_storage_mb?: number | null;
          max_whatsapp_per_month?: number | null;
          monthly_price?: number;
          name: string;
          sort_order?: number;
          transaction_fee_percent?: number;
        };
        Update: {
          active?: boolean;
          code?: string;
          created_at?: string;
          description?: string | null;
          features?: Json;
          id?: string;
          max_admins?: number | null;
          max_campaigns?: number | null;
          max_events_per_month?: number | null;
          max_members?: number | null;
          max_sms_per_month?: number | null;
          max_storage_mb?: number | null;
          max_whatsapp_per_month?: number | null;
          monthly_price?: number;
          name?: string;
          sort_order?: number;
          transaction_fee_percent?: number;
        };
        Relationships: [];
      };
      suppressed_emails: {
        Row: {
          created_at: string;
          email: string;
          id: string;
          metadata: Json | null;
          reason: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          id?: string;
          metadata?: Json | null;
          reason: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          id?: string;
          metadata?: Json | null;
          reason?: string;
        };
        Relationships: [];
      };
      tenant_address: {
        Row: {
          cep: string;
          city: string;
          complement: string | null;
          created_at: string;
          id: string;
          neighborhood: string;
          no_number: boolean;
          number: string | null;
          reference_point: string | null;
          state: string;
          street: string;
          tenant_id: string;
          uf: string;
          updated_at: string;
        };
        Insert: {
          cep: string;
          city: string;
          complement?: string | null;
          created_at?: string;
          id?: string;
          neighborhood: string;
          no_number?: boolean;
          number?: string | null;
          reference_point?: string | null;
          state: string;
          street: string;
          tenant_id: string;
          uf: string;
          updated_at?: string;
        };
        Update: {
          cep?: string;
          city?: string;
          complement?: string | null;
          created_at?: string;
          id?: string;
          neighborhood?: string;
          no_number?: boolean;
          number?: string | null;
          reference_point?: string | null;
          state?: string;
          street?: string;
          tenant_id?: string;
          uf?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_address_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tenant_address_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "tenants_public";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_bank_account: {
        Row: {
          account: string;
          account_digit: string;
          account_type: Database["public"]["Enums"]["tenant_bank_account_type"];
          bank_code: string;
          branch: string;
          branch_digit: string | null;
          created_at: string;
          holder_document: string;
          holder_name: string;
          id: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          account: string;
          account_digit: string;
          account_type: Database["public"]["Enums"]["tenant_bank_account_type"];
          bank_code: string;
          branch: string;
          branch_digit?: string | null;
          created_at?: string;
          holder_document: string;
          holder_name: string;
          id?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          account?: string;
          account_digit?: string;
          account_type?: Database["public"]["Enums"]["tenant_bank_account_type"];
          bank_code?: string;
          branch?: string;
          branch_digit?: string | null;
          created_at?: string;
          holder_document?: string;
          holder_name?: string;
          id?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_bank_account_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tenant_bank_account_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "tenants_public";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_contact_phone: {
        Row: {
          created_at: string;
          ddd: string;
          id: string;
          number: string;
          phone_type: string;
          tenant_id: string;
        };
        Insert: {
          created_at?: string;
          ddd: string;
          id?: string;
          number: string;
          phone_type: string;
          tenant_id: string;
        };
        Update: {
          created_at?: string;
          ddd?: string;
          id?: string;
          number?: string;
          phone_type?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_contact_phone_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tenant_contact_phone_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants_public";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_fee_config: {
        Row: {
          adm_percent: number;
          adquirencia_2x_percent: number | null;
          adquirencia_avista_percent: number | null;
          adquirencia_fixa: number | null;
          antecipacao_custo_percent: number | null;
          payment_method: string;
          tenant_id: string;
          g2_op_percent: number | null;
          g2_operacional_fixo: number | null;
          transacao_fixa: number;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          adm_percent?: number;
          adquirencia_2x_percent?: number | null;
          adquirencia_avista_percent?: number | null;
          adquirencia_fixa?: number | null;
          antecipacao_custo_percent?: number | null;
          payment_method: string;
          tenant_id: string;
          g2_op_percent?: number | null;
          g2_operacional_fixo?: number | null;
          transacao_fixa?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          adm_percent?: number;
          adquirencia_2x_percent?: number | null;
          adquirencia_avista_percent?: number | null;
          adquirencia_fixa?: number | null;
          antecipacao_custo_percent?: number | null;
          payment_method?: string;
          tenant_id?: string;
          g2_op_percent?: number | null;
          g2_operacional_fixo?: number | null;
          transacao_fixa?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_fee_config_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tenant_fee_config_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants_public";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_financial_config: {
        Row: {
          anticipation_days: number | null;
          anticipation_model: string | null;
          auto_anticipation: boolean;
          auto_transfer: boolean;
          created_at: string;
          id: string;
          pagarme_recipient_id: string | null;
          pagarme_recipient_status: string | null;
          receiver_type: Database["public"]["Enums"]["tenant_receiver_type"];
          split_platform_percent: number;
          tenant_id: string;
          transfer_frequency: Database["public"]["Enums"]["tenant_transfer_frequency"] | null;
          updated_at: string;
          use_pagarme: boolean;
        };
        Insert: {
          anticipation_days?: number | null;
          anticipation_model?: string | null;
          auto_anticipation?: boolean;
          auto_transfer?: boolean;
          created_at?: string;
          id?: string;
          pagarme_recipient_id?: string | null;
          pagarme_recipient_status?: string | null;
          receiver_type?: Database["public"]["Enums"]["tenant_receiver_type"];
          split_platform_percent?: number;
          tenant_id: string;
          transfer_frequency?: Database["public"]["Enums"]["tenant_transfer_frequency"] | null;
          updated_at?: string;
          use_pagarme?: boolean;
        };
        Update: {
          anticipation_days?: number | null;
          anticipation_model?: string | null;
          auto_anticipation?: boolean;
          auto_transfer?: boolean;
          created_at?: string;
          id?: string;
          pagarme_recipient_id?: string | null;
          pagarme_recipient_status?: string | null;
          receiver_type?: Database["public"]["Enums"]["tenant_receiver_type"];
          split_platform_percent?: number;
          tenant_id?: string;
          transfer_frequency?: Database["public"]["Enums"]["tenant_transfer_frequency"] | null;
          updated_at?: string;
          use_pagarme?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_financial_config_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tenant_financial_config_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "tenants_public";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_invoices: {
        Row: {
          amount: number;
          created_at: string;
          deleted_at: string | null;
          deleted_by: string | null;
          due_date: string | null;
          gateway_invoice_id: string | null;
          id: string;
          paid_at: string | null;
          period_end: string;
          period_start: string;
          status: Database["public"]["Enums"]["invoice_status"];
          subscription_id: string | null;
          tenant_id: string;
        };
        Insert: {
          amount: number;
          created_at?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
          due_date?: string | null;
          gateway_invoice_id?: string | null;
          id?: string;
          paid_at?: string | null;
          period_end: string;
          period_start: string;
          status?: Database["public"]["Enums"]["invoice_status"];
          subscription_id?: string | null;
          tenant_id: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
          due_date?: string | null;
          gateway_invoice_id?: string | null;
          id?: string;
          paid_at?: string | null;
          period_end?: string;
          period_start?: string;
          status?: Database["public"]["Enums"]["invoice_status"];
          subscription_id?: string | null;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_invoices_subscription_id_fkey";
            columns: ["subscription_id"];
            isOneToOne: false;
            referencedRelation: "tenant_subscriptions";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_legal_responsible: {
        Row: {
          birth_date: string | null;
          cpf: string;
          created_at: string;
          email: string | null;
          full_name: string;
          id: string;
          monthly_revenue: number | null;
          mother_name: string | null;
          role: string | null;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          birth_date?: string | null;
          cpf: string;
          created_at?: string;
          email?: string | null;
          full_name: string;
          id?: string;
          monthly_revenue?: number | null;
          mother_name?: string | null;
          role?: string | null;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          birth_date?: string | null;
          cpf?: string;
          created_at?: string;
          email?: string | null;
          full_name?: string;
          id?: string;
          monthly_revenue?: number | null;
          mother_name?: string | null;
          role?: string | null;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_legal_responsible_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tenant_legal_responsible_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "tenants_public";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_payment_info_cache: {
        Row: {
          fetched_at: string;
          payload: Json;
          tenant_id: string;
        };
        Insert: {
          fetched_at?: string;
          payload: Json;
          tenant_id: string;
        };
        Update: {
          fetched_at?: string;
          payload?: Json;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_payment_info_cache_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tenant_payment_info_cache_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "tenants_public";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_payment_settings: {
        Row: {
          pagarme_recipient_id: string | null;
          pix_key: string | null;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          pagarme_recipient_id?: string | null;
          pix_key?: string | null;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          pagarme_recipient_id?: string | null;
          pix_key?: string | null;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tenant_pending_documents: {
        Row: {
          created_at: string;
          doc_type: string;
          id: string;
          label: string;
          notes: string | null;
          required: boolean;
          status: Database["public"]["Enums"]["tenant_doc_status"];
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          doc_type: string;
          id?: string;
          label: string;
          notes?: string | null;
          required?: boolean;
          status?: Database["public"]["Enums"]["tenant_doc_status"];
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          doc_type?: string;
          id?: string;
          label?: string;
          notes?: string | null;
          required?: boolean;
          status?: Database["public"]["Enums"]["tenant_doc_status"];
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_pending_documents_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tenant_pending_documents_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants_public";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_subscriptions: {
        Row: {
          cancel_at_period_end: boolean;
          created_at: string;
          current_period_end: string;
          current_period_start: string;
          deleted_at: string | null;
          deleted_by: string | null;
          gateway_subscription_id: string | null;
          id: string;
          plan_id: string;
          status: Database["public"]["Enums"]["subscription_status"];
          tenant_id: string;
          trial_ends_at: string | null;
          updated_at: string;
        };
        Insert: {
          cancel_at_period_end?: boolean;
          created_at?: string;
          current_period_end?: string;
          current_period_start?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
          gateway_subscription_id?: string | null;
          id?: string;
          plan_id: string;
          status?: Database["public"]["Enums"]["subscription_status"];
          tenant_id: string;
          trial_ends_at?: string | null;
          updated_at?: string;
        };
        Update: {
          cancel_at_period_end?: boolean;
          created_at?: string;
          current_period_end?: string;
          current_period_start?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
          gateway_subscription_id?: string | null;
          id?: string;
          plan_id?: string;
          status?: Database["public"]["Enums"]["subscription_status"];
          tenant_id?: string;
          trial_ends_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_subscriptions_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "subscription_plans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tenant_subscriptions_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "subscription_plans_public";
            referencedColumns: ["id"];
          },
        ];
      };
      tenants: {
        Row: {
          accent_color: string | null;
          active: boolean;
          compliance_status: Database["public"]["Enums"]["tenant_compliance_status"];
          cover_photo_url: string | null;
          created_at: string;
          custom_domain: string | null;
          deleted_at: string | null;
          deleted_by: string | null;
          description: string | null;
          document: string | null;
          document_type: string | null;
          financial_active: boolean;
          id: string;
          institutional_email: string | null;
          legal_name: string | null;
          logo_url: string | null;
          main_phone: string | null;
          name: string;
          primary_color: string | null;
          recipient_error: string | null;
          recipient_id: string | null;
          recipient_status: string | null;
          secondary_color: string | null;
          slug: string;
          tagline: string | null;
          trade_name: string | null;
          updated_at: string;
          website: string | null;
        };
        Insert: {
          accent_color?: string | null;
          active?: boolean;
          compliance_status?: Database["public"]["Enums"]["tenant_compliance_status"];
          cover_photo_url?: string | null;
          created_at?: string;
          custom_domain?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          description?: string | null;
          document?: string | null;
          document_type?: string | null;
          financial_active?: boolean;
          id?: string;
          institutional_email?: string | null;
          legal_name?: string | null;
          logo_url?: string | null;
          main_phone?: string | null;
          name: string;
          primary_color?: string | null;
          recipient_error?: string | null;
          recipient_id?: string | null;
          recipient_status?: string | null;
          secondary_color?: string | null;
          slug: string;
          tagline?: string | null;
          trade_name?: string | null;
          updated_at?: string;
          website?: string | null;
        };
        Update: {
          accent_color?: string | null;
          active?: boolean;
          compliance_status?: Database["public"]["Enums"]["tenant_compliance_status"];
          cover_photo_url?: string | null;
          created_at?: string;
          custom_domain?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          description?: string | null;
          document?: string | null;
          document_type?: string | null;
          financial_active?: boolean;
          id?: string;
          institutional_email?: string | null;
          legal_name?: string | null;
          logo_url?: string | null;
          main_phone?: string | null;
          name?: string;
          primary_color?: string | null;
          recipient_error?: string | null;
          recipient_id?: string | null;
          recipient_status?: string | null;
          secondary_color?: string | null;
          slug?: string;
          tagline?: string | null;
          trade_name?: string | null;
          updated_at?: string;
          website?: string | null;
        };
        Relationships: [];
      };
      tickets: {
        Row: {
          created_at: string;
          event_id: string;
          id: string;
          payment_id: string | null;
          profile_id: string;
          qr_code_data: string | null;
          status: Database["public"]["Enums"]["ticket_status"];
          tenant_id: string;
        };
        Insert: {
          created_at?: string;
          event_id: string;
          id?: string;
          payment_id?: string | null;
          profile_id: string;
          qr_code_data?: string | null;
          status?: Database["public"]["Enums"]["ticket_status"];
          tenant_id: string;
        };
        Update: {
          created_at?: string;
          event_id?: string;
          id?: string;
          payment_id?: string | null;
          profile_id?: string;
          qr_code_data?: string | null;
          status?: Database["public"]["Enums"]["ticket_status"];
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tickets_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tickets_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tickets_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tickets_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants_public";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          tenant_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          tenant_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          tenant_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_roles_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_roles_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants_public";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      cost_centers_public: {
        Row: {
          description: string | null;
          display_order: number | null;
          id: string | null;
          name: string | null;
          qr_code_url: string | null;
          slug: string | null;
          tenant_id: string | null;
          type: Database["public"]["Enums"]["cost_center_type"] | null;
        };
        Insert: {
          description?: string | null;
          display_order?: number | null;
          id?: string | null;
          name?: string | null;
          qr_code_url?: string | null;
          slug?: string | null;
          tenant_id?: string | null;
          type?: Database["public"]["Enums"]["cost_center_type"] | null;
        };
        Update: {
          description?: string | null;
          display_order?: number | null;
          id?: string | null;
          name?: string | null;
          qr_code_url?: string | null;
          slug?: string | null;
          tenant_id?: string | null;
          type?: Database["public"]["Enums"]["cost_center_type"] | null;
        };
        Relationships: [
          {
            foreignKeyName: "cost_centers_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cost_centers_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants_public";
            referencedColumns: ["id"];
          },
        ];
      };
      subscription_plans_public: {
        Row: {
          active: boolean | null;
          code: string | null;
          id: string | null;
          monthly_price: number | null;
          name: string | null;
          sort_order: number | null;
        };
        Insert: {
          active?: boolean | null;
          code?: string | null;
          id?: string | null;
          monthly_price?: number | null;
          name?: string | null;
          sort_order?: number | null;
        };
        Update: {
          active?: boolean | null;
          code?: string | null;
          id?: string | null;
          monthly_price?: number | null;
          name?: string | null;
          sort_order?: number | null;
        };
        Relationships: [];
      };
      tenants_public: {
        Row: {
          accent_color: string | null;
          active: boolean | null;
          cover_photo_url: string | null;
          custom_domain: string | null;
          id: string | null;
          logo_url: string | null;
          name: string | null;
          primary_color: string | null;
          secondary_color: string | null;
          slug: string | null;
          tagline: string | null;
        };
        Insert: {
          accent_color?: string | null;
          active?: boolean | null;
          cover_photo_url?: string | null;
          custom_domain?: string | null;
          id?: string | null;
          logo_url?: string | null;
          name?: string | null;
          primary_color?: string | null;
          secondary_color?: string | null;
          slug?: string | null;
          tagline?: string | null;
        };
        Update: {
          accent_color?: string | null;
          active?: boolean | null;
          cover_photo_url?: string | null;
          custom_domain?: string | null;
          id?: string | null;
          logo_url?: string | null;
          name?: string | null;
          primary_color?: string | null;
          secondary_color?: string | null;
          slug?: string | null;
          tagline?: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      current_tenant_id: { Args: never; Returns: string };
      delete_email: {
        Args: { message_id: number; queue_name: string };
        Returns: boolean;
      };
      email_queue_dispatch: { Args: never; Returns: undefined };
      enqueue_email: {
        Args: { payload: Json; queue_name: string };
        Returns: number;
      };
      get_tenant_pix_key: { Args: { _tenant_id: string }; Returns: string };
      has_platform_role: {
        Args: {
          _role: Database["public"]["Enums"]["platform_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _tenant_id: string;
          _user_id: string;
        };
        Returns: boolean;
      };
      is_email_registered: { Args: { _email: string }; Returns: boolean };
      is_platform_admin: { Args: { _user_id: string }; Returns: boolean };
      is_super_admin: { Args: never; Returns: boolean };
      is_tenant_staff: {
        Args: { _tenant_id: string; _user_id: string };
        Returns: boolean;
      };
      move_to_dlq: {
        Args: {
          dlq_name: string;
          message_id: number;
          payload: Json;
          source_queue: string;
        };
        Returns: number;
      };
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number };
        Returns: {
          message: Json;
          msg_id: number;
          read_ct: number;
        }[];
      };
      recompute_tenant_compliance: {
        Args: { _tenant_id: string };
        Returns: Database["public"]["Enums"]["tenant_compliance_status"];
      };
      seed_tenant_pending_documents: {
        Args: { _tenant_id: string };
        Returns: undefined;
      };
    };
    Enums: {
      api_service: "sms" | "whatsapp" | "payments";
      app_role: "member" | "manager" | "admin";
      cost_center_type: "online" | "presencial" | "totem";
      event_status: "draft" | "active" | "closed";
      event_type: "event" | "campaign" | "donation";
      invoice_status: "draft" | "pending" | "paid" | "overdue" | "void" | "refunded";
      message_channel: "sms" | "whatsapp" | "in_app";
      message_status: "queued" | "sent" | "failed";
      message_target_type: "individual" | "group" | "broadcast";
      payment_method: "pix" | "credit_card" | "debit_card" | "boleto";
      payment_ref_type: "ticket" | "donation";
      payment_status: "pending" | "confirmed" | "failed" | "refunded";
      platform_role: "super_admin" | "support" | "finance" | "operator";
      profile_status: "pending" | "approved" | "blocked";
      subscription_status: "trialing" | "active" | "past_due" | "canceled" | "suspended";
      tenant_bank_account_type: "checking" | "checking_joint" | "savings" | "savings_joint";
      tenant_compliance_status:
        "pending_documents" | "pending_financial_setup" | "active" | "blocked";
      tenant_doc_status: "pending" | "submitted" | "approved" | "rejected";
      tenant_receiver_type: "pf" | "pj";
      tenant_transfer_frequency: "daily" | "weekly" | "monthly";
      ticket_status: "active" | "used" | "cancelled";
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      api_service: ["sms", "whatsapp", "payments"],
      app_role: ["member", "manager", "admin"],
      cost_center_type: ["online", "presencial", "totem"],
      event_status: ["draft", "active", "closed"],
      event_type: ["event", "campaign", "donation"],
      invoice_status: ["draft", "pending", "paid", "overdue", "void", "refunded"],
      message_channel: ["sms", "whatsapp", "in_app"],
      message_status: ["queued", "sent", "failed"],
      message_target_type: ["individual", "group", "broadcast"],
      payment_method: ["pix", "credit_card", "debit_card", "boleto"],
      payment_ref_type: ["ticket", "donation"],
      payment_status: ["pending", "confirmed", "failed", "refunded"],
      platform_role: ["super_admin", "support", "finance", "operator"],
      profile_status: ["pending", "approved", "blocked"],
      subscription_status: ["trialing", "active", "past_due", "canceled", "suspended"],
      tenant_bank_account_type: ["checking", "checking_joint", "savings", "savings_joint"],
      tenant_compliance_status: [
        "pending_documents",
        "pending_financial_setup",
        "active",
        "blocked",
      ],
      tenant_doc_status: ["pending", "submitted", "approved", "rejected"],
      tenant_receiver_type: ["pf", "pj"],
      tenant_transfer_frequency: ["daily", "weekly", "monthly"],
      ticket_status: ["active", "used", "cancelled"],
    },
  },
} as const;
