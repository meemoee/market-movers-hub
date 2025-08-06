export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instanciate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      agent_chains: {
        Row: {
          config: Json
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          config: Json
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      agents: {
        Row: {
          created_at: string | null
          id: string
          json_mode: boolean | null
          json_schema: Json | null
          model: string
          prompt: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          json_mode?: boolean | null
          json_schema?: Json | null
          model: string
          prompt: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          json_mode?: boolean | null
          json_schema?: Json | null
          model?: string
          prompt?: string
          user_id?: string | null
        }
        Relationships: []
      }
      analysis_stream: {
        Row: {
          chunk: string
          created_at: string
          id: string
          iteration: number
          job_id: string
          sequence: number
        }
        Insert: {
          chunk: string
          created_at?: string
          id?: string
          iteration: number
          job_id: string
          sequence: number
        }
        Update: {
          chunk?: string
          created_at?: string
          id?: string
          iteration?: number
          job_id?: string
          sequence?: number
        }
        Relationships: [
          {
            foreignKeyName: "analysis_stream_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "research_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      email_scrape_requests: {
        Row: {
          completed_at: string | null
          created_at: string
          email: string
          error_message: string | null
          id: string
          status: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          email: string
          error_message?: string | null
          id?: string
          status?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          email?: string
          error_message?: string | null
          id?: string
          status?: string | null
        }
        Relationships: []
      }
      events: {
        Row: {
          category: string | null
          created_at: string | null
          id: string
          mutually_exclusive: boolean | null
          slug: string
          sub_title: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          id: string
          mutually_exclusive?: boolean | null
          slug: string
          sub_title?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          id?: string
          mutually_exclusive?: boolean | null
          slug?: string
          sub_title?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      historical_events: {
        Row: {
          created_at: string
          date: string
          id: string
          image_url: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          image_url: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          image_url?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      holdings: {
        Row: {
          amount: number | null
          created_at: string
          entry_price: number | null
          id: string
          market_id: string
          outcome: string | null
          position: string | null
          token_id: string | null
          user_id: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          entry_price?: number | null
          id?: string
          market_id: string
          outcome?: string | null
          position?: string | null
          token_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          entry_price?: number | null
          id?: string
          market_id?: string
          outcome?: string | null
          position?: string | null
          token_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "holdings_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holdings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holdings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      market_embeddings: {
        Row: {
          embedding: string | null
          market_id: string
        }
        Insert: {
          embedding?: string | null
          market_id: string
        }
        Update: {
          embedding?: string | null
          market_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_embeddings_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: true
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      market_events: {
        Row: {
          created_at: string
          description: string | null
          event_type: string
          icon: string
          id: string
          market_id: string
          timestamp: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          event_type: string
          icon: string
          id?: string
          market_id: string
          timestamp: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          event_type?: string
          icon?: string
          id?: string
          market_id?: string
          timestamp?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_events_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      market_historical_comparisons: {
        Row: {
          created_at: string
          differences: Json
          historical_event_id: string
          id: string
          market_id: string
          similarities: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          differences?: Json
          historical_event_id: string
          id?: string
          market_id: string
          similarities?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          differences?: Json
          historical_event_id?: string
          id?: string
          market_id?: string
          similarities?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_historical_comparisons_historical_event_id_fkey"
            columns: ["historical_event_id"]
            isOneToOne: false
            referencedRelation: "historical_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_historical_comparisons_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      market_insights: {
        Row: {
          content: string
          created_at: string
          id: string
          is_private: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_private?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_private?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      market_price_history: {
        Row: {
          market_id: string
          price: number
          timestamp: string
          token_id: string
        }
        Insert: {
          market_id: string
          price: number
          timestamp: string
          token_id: string
        }
        Update: {
          market_id?: string
          price?: number
          timestamp?: string
          token_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_price_history_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      market_prices: {
        Row: {
          best_ask: number | null
          best_bid: number | null
          id: number
          last_traded_price: number | null
          liquidity: number | null
          market_id: string | null
          no_price: number | null
          timestamp: string | null
          volume: number | null
          yes_price: number | null
        }
        Insert: {
          best_ask?: number | null
          best_bid?: number | null
          id?: number
          last_traded_price?: number | null
          liquidity?: number | null
          market_id?: string | null
          no_price?: number | null
          timestamp?: string | null
          volume?: number | null
          yes_price?: number | null
        }
        Update: {
          best_ask?: number | null
          best_bid?: number | null
          id?: number
          last_traded_price?: number | null
          liquidity?: number | null
          market_id?: string | null
          no_price?: number | null
          timestamp?: string | null
          volume?: number | null
          yes_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "market_prices_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      markets: {
        Row: {
          active: boolean | null
          archived: boolean | null
          clobtokenids: Json | null
          close_time: string | null
          closed: boolean | null
          condid: string | null
          created_at: string | null
          description: string | null
          end_date: string | null
          event_id: string | null
          group_item_title: string | null
          id: string
          image: string | null
          no_sub_title: string | null
          open_time: string | null
          outcomes: Json | null
          primary_tags: string[] | null
          question: string
          slug: string | null
          status: string | null
          subtitle: string | null
          tag_slugs: string[] | null
          tags_json: Json | null
          updated_at: string | null
          url: string | null
          yes_sub_title: string | null
        }
        Insert: {
          active?: boolean | null
          archived?: boolean | null
          clobtokenids?: Json | null
          close_time?: string | null
          closed?: boolean | null
          condid?: string | null
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          event_id?: string | null
          group_item_title?: string | null
          id: string
          image?: string | null
          no_sub_title?: string | null
          open_time?: string | null
          outcomes?: Json | null
          primary_tags?: string[] | null
          question: string
          slug?: string | null
          status?: string | null
          subtitle?: string | null
          tag_slugs?: string[] | null
          tags_json?: Json | null
          updated_at?: string | null
          url?: string | null
          yes_sub_title?: string | null
        }
        Update: {
          active?: boolean | null
          archived?: boolean | null
          clobtokenids?: Json | null
          close_time?: string | null
          closed?: boolean | null
          condid?: string | null
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          event_id?: string | null
          group_item_title?: string | null
          id?: string
          image?: string | null
          no_sub_title?: string | null
          open_time?: string | null
          outcomes?: Json | null
          primary_tags?: string[] | null
          question?: string
          slug?: string | null
          status?: string | null
          subtitle?: string | null
          tag_slugs?: string[] | null
          tags_json?: Json | null
          updated_at?: string | null
          url?: string | null
          yes_sub_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "markets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      news_articles: {
        Row: {
          created_at: string | null
          gradient_end_rgb: string | null
          gradient_start_rgb: string | null
          id: string
          image_url: string | null
          link: string | null
          position: number
          subtitle: string | null
          time_interval: string
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          gradient_end_rgb?: string | null
          gradient_start_rgb?: string | null
          id?: string
          image_url?: string | null
          link?: string | null
          position: number
          subtitle?: string | null
          time_interval: string
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          gradient_end_rgb?: string | null
          gradient_start_rgb?: string | null
          id?: string
          image_url?: string | null
          link?: string | null
          position?: number
          subtitle?: string | null
          time_interval?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      orderbook_data: {
        Row: {
          asks: Json | null
          best_ask: number | null
          best_bid: number | null
          bids: Json | null
          id: number
          market_id: string
          spread: number | null
          timestamp: string | null
        }
        Insert: {
          asks?: Json | null
          best_ask?: number | null
          best_bid?: number | null
          bids?: Json | null
          id?: number
          market_id: string
          spread?: number | null
          timestamp?: string | null
        }
        Update: {
          asks?: Json | null
          best_ask?: number | null
          best_bid?: number | null
          bids?: Json | null
          id?: number
          market_id?: string
          spread?: number | null
          timestamp?: string | null
        }
        Relationships: []
      }
      orderbook_subscriptions: {
        Row: {
          last_access: string
          token_id: string
        }
        Insert: {
          last_access?: string
          token_id: string
        }
        Update: {
          last_access?: string
          token_id?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          created_at: string
          id: string
          market_id: string
          order_type: string
          outcome: string
          price: number
          side: string
          size: number
          status: string
          token_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          market_id: string
          order_type: string
          outcome: string
          price: number
          side: string
          size: number
          status: string
          token_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          market_id?: string
          order_type?: string
          outcome?: string
          price?: number
          side?: string
          size?: number
          status?: string
          token_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          balance: number | null
          created_at: string
          email: string | null
          id: string
          openrouter_api_key: string | null
          updated_at: string
        }
        Insert: {
          balance?: number | null
          created_at?: string
          email?: string | null
          id: string
          openrouter_api_key?: string | null
          updated_at?: string
        }
        Update: {
          balance?: number | null
          created_at?: string
          email?: string | null
          id?: string
          openrouter_api_key?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      qa_trees: {
        Row: {
          created_at: string
          expansions: Json | null
          id: string
          market_id: string | null
          sequence_data: Json | null
          title: string
          tree_data: Json
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          expansions?: Json | null
          id?: string
          market_id?: string | null
          sequence_data?: Json | null
          title: string
          tree_data: Json
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          expansions?: Json | null
          id?: string
          market_id?: string | null
          sequence_data?: Json | null
          title?: string
          tree_data?: Json
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qa_trees_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qa_trees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qa_trees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      query_pages: {
        Row: {
          created_at: string | null
          id: number
          page: number
          query: string
        }
        Insert: {
          created_at?: string | null
          id?: number
          page: number
          query: string
        }
        Update: {
          created_at?: string | null
          id?: number
          page?: number
          query?: string
        }
        Relationships: []
      }
      research_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          current_iteration: number
          error_message: string | null
          final_analysis_stream: string | null
          focus_text: string | null
          id: string
          iterations: Json
          market_data: Json | null
          market_id: string
          max_iterations: number
          notification_email: string | null
          notification_sent: boolean | null
          progress_log: Json
          query: string
          results: Json | null
          started_at: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_iteration?: number
          error_message?: string | null
          final_analysis_stream?: string | null
          focus_text?: string | null
          id?: string
          iterations?: Json
          market_data?: Json | null
          market_id: string
          max_iterations?: number
          notification_email?: string | null
          notification_sent?: boolean | null
          progress_log?: Json
          query: string
          results?: Json | null
          started_at?: string | null
          status: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_iteration?: number
          error_message?: string | null
          final_analysis_stream?: string | null
          focus_text?: string | null
          id?: string
          iterations?: Json
          market_data?: Json | null
          market_id?: string
          max_iterations?: number
          notification_email?: string | null
          notification_sent?: boolean | null
          progress_log?: Json
          query?: string
          results?: Json | null
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      web_research: {
        Row: {
          analysis: string
          areas_for_research: Json
          created_at: string
          focus_text: string | null
          id: string
          iterations: Json | null
          market_id: string | null
          parent_research_id: string | null
          probability: string
          query: string
          sources: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          analysis: string
          areas_for_research: Json
          created_at?: string
          focus_text?: string | null
          id?: string
          iterations?: Json | null
          market_id?: string | null
          parent_research_id?: string | null
          probability: string
          query: string
          sources: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          analysis?: string
          areas_for_research?: Json
          created_at?: string
          focus_text?: string | null
          id?: string
          iterations?: Json | null
          market_id?: string | null
          parent_research_id?: string | null
          probability?: string
          query?: string
          sources?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "web_research_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "web_research_parent_research_id_fkey"
            columns: ["parent_research_id"]
            isOneToOne: false
            referencedRelation: "web_research"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "web_research_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "web_research_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      webm_items: {
        Row: {
          created_at: string | null
          id: number
          page: number | null
          query: string | null
          response_data: Json | null
          webm_url: string
        }
        Insert: {
          created_at?: string | null
          id?: number
          page?: number | null
          query?: string | null
          response_data?: Json | null
          webm_url: string
        }
        Update: {
          created_at?: string | null
          id?: number
          page?: number | null
          query?: string | null
          response_data?: Json | null
          webm_url?: string
        }
        Relationships: []
      }
    }
    Views: {
      latest_prices: {
        Row: {
          best_ask: number | null
          best_bid: number | null
          last_traded_price: number | null
          liquidity: number | null
          market_id: string | null
          no_price: number | null
          volume: number | null
          yes_price: number | null
        }
        Relationships: [
          {
            foreignKeyName: "market_prices_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      public_profiles: {
        Row: {
          balance: number | null
          created_at: string | null
          email: string | null
          id: string | null
          updated_at: string | null
        }
        Insert: {
          balance?: number | null
          created_at?: string | null
          email?: string | null
          id?: string | null
          updated_at?: string | null
        }
        Update: {
          balance?: number | null
          created_at?: string | null
          email?: string | null
          id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_compression_policy: {
        Args: {
          hypertable: unknown
          compress_after?: unknown
          if_not_exists?: boolean
          schedule_interval?: unknown
          initial_start?: string
          timezone?: string
          compress_created_before?: unknown
        }
        Returns: number
      }
      add_continuous_aggregate_policy: {
        Args: {
          continuous_aggregate: unknown
          start_offset: unknown
          end_offset: unknown
          schedule_interval: unknown
          if_not_exists?: boolean
          initial_start?: string
          timezone?: string
        }
        Returns: number
      }
      add_dimension: {
        Args:
          | {
              hypertable: unknown
              column_name: unknown
              number_partitions?: number
              chunk_time_interval?: unknown
              partitioning_func?: unknown
              if_not_exists?: boolean
            }
          | { hypertable: unknown; dimension: unknown; if_not_exists?: boolean }
        Returns: {
          dimension_id: number
          schema_name: unknown
          table_name: unknown
          column_name: unknown
          created: boolean
        }[]
      }
      add_job: {
        Args: {
          proc: unknown
          schedule_interval: unknown
          config?: Json
          initial_start?: string
          scheduled?: boolean
          check_config?: unknown
          fixed_schedule?: boolean
          timezone?: string
        }
        Returns: number
      }
      add_reorder_policy: {
        Args: {
          hypertable: unknown
          index_name: unknown
          if_not_exists?: boolean
          initial_start?: string
          timezone?: string
        }
        Returns: number
      }
      add_retention_policy: {
        Args: {
          relation: unknown
          drop_after?: unknown
          if_not_exists?: boolean
          schedule_interval?: unknown
          initial_start?: string
          timezone?: string
          drop_created_before?: unknown
        }
        Returns: number
      }
      alter_job: {
        Args: {
          job_id: number
          schedule_interval?: unknown
          max_runtime?: unknown
          max_retries?: number
          retry_period?: unknown
          scheduled?: boolean
          config?: Json
          next_start?: string
          if_exists?: boolean
          check_config?: unknown
          fixed_schedule?: boolean
          initial_start?: string
          timezone?: string
        }
        Returns: {
          job_id: number
          schedule_interval: unknown
          max_runtime: unknown
          max_retries: number
          retry_period: unknown
          scheduled: boolean
          config: Json
          next_start: string
          check_config: string
          fixed_schedule: boolean
          initial_start: string
          timezone: string
        }[]
      }
      append_analysis_chunk: {
        Args: { job_id: string; iteration: number; chunk: string; seq: number }
        Returns: string
      }
      append_iteration_field_text: {
        Args: {
          job_id: string
          iteration_num: number
          field_key: string
          append_text: string
        }
        Returns: undefined
      }
      append_progress_log: {
        Args: { job_id: string; log_message: string }
        Returns: undefined
      }
      append_research_iteration: {
        Args: { job_id: string; iteration_data: Json }
        Returns: undefined
      }
      append_research_progress: {
        Args:
          | { job_id: string; progress_entry: Json }
          | { job_id: string; progress_entry: string }
        Returns: undefined
      }
      approximate_row_count: {
        Args: { relation: unknown }
        Returns: number
      }
      attach_tablespace: {
        Args: {
          tablespace: unknown
          hypertable: unknown
          if_not_attached?: boolean
        }
        Returns: undefined
      }
      batch_insert_market_data: {
        Args: { event_records: Json; market_records: Json; price_records: Json }
        Returns: undefined
      }
      binary_quantize: {
        Args: { "": string } | { "": unknown }
        Returns: unknown
      }
      by_hash: {
        Args: {
          column_name: unknown
          number_partitions: number
          partition_func?: unknown
        }
        Returns: unknown
      }
      by_range: {
        Args: {
          column_name: unknown
          partition_interval?: unknown
          partition_func?: unknown
        }
        Returns: unknown
      }
      check_research_job_complete: {
        Args: { job_id: string }
        Returns: boolean
      }
      check_table_exists: {
        Args: { p_table_name: string }
        Returns: boolean
      }
      chunk_compression_stats: {
        Args: { hypertable: unknown }
        Returns: {
          chunk_schema: unknown
          chunk_name: unknown
          compression_status: string
          before_compression_table_bytes: number
          before_compression_index_bytes: number
          before_compression_toast_bytes: number
          before_compression_total_bytes: number
          after_compression_table_bytes: number
          after_compression_index_bytes: number
          after_compression_toast_bytes: number
          after_compression_total_bytes: number
          node_name: unknown
        }[]
      }
      chunks_detailed_size: {
        Args: { hypertable: unknown }
        Returns: {
          chunk_schema: unknown
          chunk_name: unknown
          table_bytes: number
          index_bytes: number
          toast_bytes: number
          total_bytes: number
          node_name: unknown
        }[]
      }
      clean_old_market_data: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      compress_chunk: {
        Args: {
          uncompressed_chunk: unknown
          if_not_compressed?: boolean
          recompress?: boolean
        }
        Returns: unknown
      }
      create_hypertable: {
        Args:
          | {
              relation: unknown
              dimension: unknown
              create_default_indexes?: boolean
              if_not_exists?: boolean
              migrate_data?: boolean
            }
          | {
              relation: unknown
              time_column_name: unknown
              partitioning_column?: unknown
              number_partitions?: number
              associated_schema_name?: unknown
              associated_table_prefix?: unknown
              chunk_time_interval?: unknown
              create_default_indexes?: boolean
              if_not_exists?: boolean
              partitioning_func?: unknown
              migrate_data?: boolean
              chunk_target_size?: string
              chunk_sizing_func?: unknown
              time_partitioning_func?: unknown
            }
        Returns: {
          hypertable_id: number
          schema_name: unknown
          table_name: unknown
          created: boolean
        }[]
      }
      create_orderbook_table: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      debug_market_prices: {
        Args: { market_id: string; start_time: string; end_time: string }
        Returns: {
          price_timestamp: string
          last_traded_price: number
          volume: number
        }[]
      }
      decompress_chunk: {
        Args: { uncompressed_chunk: unknown; if_compressed?: boolean }
        Returns: unknown
      }
      delete_job: {
        Args: { job_id: number }
        Returns: undefined
      }
      detach_tablespace: {
        Args: {
          tablespace: unknown
          hypertable?: unknown
          if_attached?: boolean
        }
        Returns: number
      }
      detach_tablespaces: {
        Args: { hypertable: unknown }
        Returns: number
      }
      disable_chunk_skipping: {
        Args: {
          hypertable: unknown
          column_name: unknown
          if_not_exists?: boolean
        }
        Returns: {
          hypertable_id: number
          column_name: unknown
          disabled: boolean
        }[]
      }
      drop_chunks: {
        Args: {
          relation: unknown
          older_than?: unknown
          newer_than?: unknown
          verbose?: boolean
          created_before?: unknown
          created_after?: unknown
        }
        Returns: string[]
      }
      enable_chunk_skipping: {
        Args: {
          hypertable: unknown
          column_name: unknown
          if_not_exists?: boolean
        }
        Returns: {
          column_stats_id: number
          enabled: boolean
        }[]
      }
      enable_realtime_for_table: {
        Args: { table_name: string }
        Returns: undefined
      }
      execute_market_order: {
        Args: {
          p_user_id: string
          p_market_id: string
          p_token_id: string
          p_outcome: string
          p_side: Database["public"]["Enums"]["order_side"]
          p_size: number
          p_price: number
        }
        Returns: string
      }
      get_active_markets: {
        Args: { market_ids: string[] }
        Returns: {
          id: string
        }[]
      }
      get_active_markets_with_prices: {
        Args:
          | { start_time: string; end_time: string }
          | {
              start_time: string
              end_time: string
              p_limit?: number
              p_offset?: number
            }
          | {
              start_time: string
              end_time: string
              p_limit?: number
              p_offset?: number
              p_probability_min?: number
              p_probability_max?: number
              p_price_change_min?: number
              p_price_change_max?: number
            }
        Returns: {
          output_market_id: string
          initial_price: number
          final_price: number
        }[]
      }
      get_active_markets_with_prices_full: {
        Args: { start_time: string; end_time: string }
        Returns: {
          output_market_id: string
        }[]
      }
      get_latest_prices_for_markets: {
        Args: { market_ids: string[] }
        Returns: {
          market_id: string
          yes_price: number
          no_price: number
          best_bid: number
          best_ask: number
          last_traded_price: number
          volume: number
          liquidity: number
        }[]
      }
      get_market_price_counts: {
        Args: { market_ids: string[]; time_threshold: string }
        Returns: {
          market_id: string
          count: number
        }[]
      }
      get_markets_with_prices: {
        Args: { start_time: string; end_time: string }
        Returns: {
          market_id: string
        }[]
      }
      get_tag_counts: {
        Args: Record<PropertyKey, never>
        Returns: {
          tag_name: string
          tag_count: number
        }[]
      }
      get_telemetry_report: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      halfvec_avg: {
        Args: { "": number[] }
        Returns: unknown
      }
      halfvec_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      halfvec_send: {
        Args: { "": unknown }
        Returns: string
      }
      halfvec_typmod_in: {
        Args: { "": unknown[] }
        Returns: number
      }
      hnsw_bit_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      hnsw_halfvec_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      hnsw_sparsevec_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      hnswhandler: {
        Args: { "": unknown }
        Returns: unknown
      }
      hypertable_approximate_detailed_size: {
        Args: { relation: unknown }
        Returns: {
          table_bytes: number
          index_bytes: number
          toast_bytes: number
          total_bytes: number
        }[]
      }
      hypertable_approximate_size: {
        Args: { hypertable: unknown }
        Returns: number
      }
      hypertable_compression_stats: {
        Args: { hypertable: unknown }
        Returns: {
          total_chunks: number
          number_compressed_chunks: number
          before_compression_table_bytes: number
          before_compression_index_bytes: number
          before_compression_toast_bytes: number
          before_compression_total_bytes: number
          after_compression_table_bytes: number
          after_compression_index_bytes: number
          after_compression_toast_bytes: number
          after_compression_total_bytes: number
          node_name: unknown
        }[]
      }
      hypertable_detailed_size: {
        Args: { hypertable: unknown }
        Returns: {
          table_bytes: number
          index_bytes: number
          toast_bytes: number
          total_bytes: number
          node_name: unknown
        }[]
      }
      hypertable_index_size: {
        Args: { index_name: unknown }
        Returns: number
      }
      hypertable_size: {
        Args: { hypertable: unknown }
        Returns: number
      }
      interpolate: {
        Args:
          | {
              value: number
              prev?: Record<string, unknown>
              next?: Record<string, unknown>
            }
          | {
              value: number
              prev?: Record<string, unknown>
              next?: Record<string, unknown>
            }
          | {
              value: number
              prev?: Record<string, unknown>
              next?: Record<string, unknown>
            }
          | {
              value: number
              prev?: Record<string, unknown>
              next?: Record<string, unknown>
            }
          | {
              value: number
              prev?: Record<string, unknown>
              next?: Record<string, unknown>
            }
        Returns: number
      }
      ivfflat_bit_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      ivfflat_halfvec_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      ivfflathandler: {
        Args: { "": unknown }
        Returns: unknown
      }
      l2_norm: {
        Args: { "": unknown } | { "": unknown }
        Returns: number
      }
      l2_normalize: {
        Args: { "": string } | { "": unknown } | { "": unknown }
        Returns: string
      }
      locf: {
        Args: {
          value: unknown
          prev?: unknown
          treat_null_as_missing?: boolean
        }
        Returns: unknown
      }
      move_chunk: {
        Args: {
          chunk: unknown
          destination_tablespace: unknown
          index_destination_tablespace?: unknown
          reorder_index?: unknown
          verbose?: boolean
        }
        Returns: undefined
      }
      remove_compression_policy: {
        Args: { hypertable: unknown; if_exists?: boolean }
        Returns: boolean
      }
      remove_continuous_aggregate_policy: {
        Args: {
          continuous_aggregate: unknown
          if_not_exists?: boolean
          if_exists?: boolean
        }
        Returns: undefined
      }
      remove_reorder_policy: {
        Args: { hypertable: unknown; if_exists?: boolean }
        Returns: undefined
      }
      remove_retention_policy: {
        Args: { relation: unknown; if_exists?: boolean }
        Returns: undefined
      }
      reorder_chunk: {
        Args: { chunk: unknown; index?: unknown; verbose?: boolean }
        Returns: undefined
      }
      set_adaptive_chunking: {
        Args: { hypertable: unknown; chunk_target_size: string }
        Returns: Record<string, unknown>
      }
      set_chunk_time_interval: {
        Args: {
          hypertable: unknown
          chunk_time_interval: unknown
          dimension_name?: unknown
        }
        Returns: undefined
      }
      set_integer_now_func: {
        Args: {
          hypertable: unknown
          integer_now_func: unknown
          replace_if_exists?: boolean
        }
        Returns: undefined
      }
      set_number_partitions: {
        Args: {
          hypertable: unknown
          number_partitions: number
          dimension_name?: unknown
        }
        Returns: undefined
      }
      set_partitioning_interval: {
        Args: {
          hypertable: unknown
          partition_interval: unknown
          dimension_name?: unknown
        }
        Returns: undefined
      }
      show_chunks: {
        Args: {
          relation: unknown
          older_than?: unknown
          newer_than?: unknown
          created_before?: unknown
          created_after?: unknown
        }
        Returns: unknown[]
      }
      show_tablespaces: {
        Args: { hypertable: unknown }
        Returns: unknown[]
      }
      sparsevec_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      sparsevec_send: {
        Args: { "": unknown }
        Returns: string
      }
      sparsevec_typmod_in: {
        Args: { "": unknown[] }
        Returns: number
      }
      time_bucket: {
        Args:
          | { bucket_width: number; ts: number }
          | { bucket_width: number; ts: number }
          | { bucket_width: number; ts: number }
          | { bucket_width: number; ts: number; offset: number }
          | { bucket_width: number; ts: number; offset: number }
          | { bucket_width: number; ts: number; offset: number }
          | { bucket_width: unknown; ts: string }
          | { bucket_width: unknown; ts: string }
          | { bucket_width: unknown; ts: string }
          | { bucket_width: unknown; ts: string; offset: unknown }
          | { bucket_width: unknown; ts: string; offset: unknown }
          | { bucket_width: unknown; ts: string; offset: unknown }
          | { bucket_width: unknown; ts: string; origin: string }
          | { bucket_width: unknown; ts: string; origin: string }
          | { bucket_width: unknown; ts: string; origin: string }
          | {
              bucket_width: unknown
              ts: string
              timezone: string
              origin?: string
              offset?: unknown
            }
        Returns: string
      }
      time_bucket_gapfill: {
        Args:
          | {
              bucket_width: number
              ts: number
              start?: number
              finish?: number
            }
          | {
              bucket_width: number
              ts: number
              start?: number
              finish?: number
            }
          | {
              bucket_width: number
              ts: number
              start?: number
              finish?: number
            }
          | {
              bucket_width: unknown
              ts: string
              start?: string
              finish?: string
            }
          | {
              bucket_width: unknown
              ts: string
              start?: string
              finish?: string
            }
          | {
              bucket_width: unknown
              ts: string
              start?: string
              finish?: string
            }
          | {
              bucket_width: unknown
              ts: string
              timezone: string
              start?: string
              finish?: string
            }
        Returns: number
      }
      timescaledb_post_restore: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      timescaledb_pre_restore: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      update_iteration_field: {
        Args: {
          job_id: string
          iteration_num: number
          field_key: string
          field_value: string
        }
        Returns: undefined
      }
      update_research_job_status: {
        Args: { job_id: string; new_status: string; error_msg?: string }
        Returns: undefined
      }
      update_research_results: {
        Args: { job_id: string; result_data: Json }
        Returns: undefined
      }
      vector_avg: {
        Args: { "": number[] }
        Returns: string
      }
      vector_dims: {
        Args: { "": string } | { "": unknown }
        Returns: number
      }
      vector_norm: {
        Args: { "": string }
        Returns: number
      }
      vector_out: {
        Args: { "": string }
        Returns: unknown
      }
      vector_send: {
        Args: { "": string }
        Returns: string
      }
      vector_typmod_in: {
        Args: { "": unknown[] }
        Returns: number
      }
    }
    Enums: {
      order_side: "buy" | "sell"
      order_status: "pending" | "completed" | "cancelled" | "failed"
      order_type: "market" | "limit"
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
      order_side: ["buy", "sell"],
      order_status: ["pending", "completed", "cancelled", "failed"],
      order_type: ["market", "limit"],
    },
  },
} as const
