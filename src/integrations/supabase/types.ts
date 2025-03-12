export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
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
          question: string
          slug: string | null
          status: string | null
          subtitle: string | null
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
          question: string
          slug?: string | null
          status?: string | null
          subtitle?: string | null
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
          question?: string
          slug?: string | null
          status?: string | null
          subtitle?: string | null
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
        ]
      }
      profiles: {
        Row: {
          balance: number | null
          created_at: string
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          balance?: number | null
          created_at?: string
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          balance?: number | null
          created_at?: string
          email?: string | null
          id?: string
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
        ]
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
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      batch_insert_market_data: {
        Args: {
          event_records: Json
          market_records: Json
          price_records: Json
        }
        Returns: undefined
      }
      check_table_exists: {
        Args: {
          p_table_name: string
        }
        Returns: boolean
      }
      clean_old_market_data: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      create_orderbook_table: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      debug_market_prices: {
        Args: {
          market_id: string
          start_time: string
          end_time: string
        }
        Returns: {
          price_timestamp: string
          last_traded_price: number
          volume: number
        }[]
      }
      enable_realtime_for_table: {
        Args: {
          table_name: string
        }
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
        Args: {
          market_ids: string[]
        }
        Returns: {
          id: string
        }[]
      }
      get_active_markets_with_prices:
        | {
            Args: {
              start_time: string
              end_time: string
            }
            Returns: {
              id: string
            }[]
          }
        | {
            Args: {
              start_time: string
              end_time: string
              p_limit?: number
              p_offset?: number
            }
            Returns: {
              output_market_id: string
              initial_price: number
              final_price: number
            }[]
          }
        | {
            Args: {
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
        Args: {
          start_time: string
          end_time: string
        }
        Returns: {
          output_market_id: string
        }[]
      }
      get_market_price_counts: {
        Args: {
          market_ids: string[]
          time_threshold: string
        }
        Returns: {
          market_id: string
          count: number
        }[]
      }
      get_markets_with_prices: {
        Args: {
          start_time: string
          end_time: string
        }
        Returns: {
          market_id: string
        }[]
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

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never
