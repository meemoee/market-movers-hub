
-- Create a table for storing price history if it doesn't exist
CREATE TABLE IF NOT EXISTS public.market_price_history (
  market_id TEXT NOT NULL,
  token_id TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  price NUMERIC NOT NULL,
  PRIMARY KEY (market_id, token_id, timestamp)
);

-- Add an index to improve query performance
CREATE INDEX IF NOT EXISTS market_price_history_market_id_token_id_idx ON public.market_price_history (market_id, token_id);
CREATE INDEX IF NOT EXISTS market_price_history_timestamp_idx ON public.market_price_history (timestamp DESC);

-- Enable Row Level Security
ALTER TABLE public.market_price_history ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read price history data
CREATE POLICY "Price history data is readable by everyone" 
  ON public.market_price_history 
  FOR SELECT 
  USING (true);

-- Only allow service role to insert or update price history
CREATE POLICY "Only service role can insert price history" 
  ON public.market_price_history 
  FOR INSERT 
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Only service role can update price history" 
  ON public.market_price_history 
  FOR UPDATE 
  USING (auth.role() = 'service_role');
