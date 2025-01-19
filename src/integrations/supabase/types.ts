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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      clean_old_market_data: {
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
      [_ in never]: never
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
