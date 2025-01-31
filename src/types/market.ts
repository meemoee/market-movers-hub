export interface Market {
  market_id: string;
  question: string;
  url?: string;
  subtitle?: string;
  yes_sub_title?: string;
  no_sub_title?: string;
  description?: string;
  clobtokenids?: string[];
  outcomes?: string[];
  active: boolean;
  closed: boolean;
  archived: boolean;
  image: string;
  event_id: string;
  price: number;
  price_change: number;
  volume: number;
  final_last_traded_price?: number;
  final_best_ask?: number;
  final_best_bid?: number;
}