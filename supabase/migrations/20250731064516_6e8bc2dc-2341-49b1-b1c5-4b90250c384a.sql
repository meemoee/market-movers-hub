-- Phase 1: Critical Database Security - Enable RLS on unprotected tables

-- Enable RLS on analysis_stream table
ALTER TABLE public.analysis_stream ENABLE ROW LEVEL SECURITY;

-- Create policies for analysis_stream (user-specific access)
CREATE POLICY "Users can view their own analysis streams" 
ON public.analysis_stream 
FOR SELECT 
USING (job_id IN (SELECT id FROM public.research_jobs WHERE user_id = auth.uid()));

CREATE POLICY "Research jobs can insert analysis streams" 
ON public.analysis_stream 
FOR INSERT 
WITH CHECK (true); -- Allow insertions from edge functions

-- Enable RLS on events table
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Create policies for events (public read, authenticated write)
CREATE POLICY "Anyone can read events" 
ON public.events 
FOR SELECT 
USING (true);

CREATE POLICY "Authenticated users can insert events" 
ON public.events 
FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update events" 
ON public.events 
FOR UPDATE 
USING (auth.role() = 'authenticated');

-- Enable RLS on market_embeddings table
ALTER TABLE public.market_embeddings ENABLE ROW LEVEL SECURITY;

-- Create policies for market_embeddings (public read only)
CREATE POLICY "Anyone can read market embeddings" 
ON public.market_embeddings 
FOR SELECT 
USING (true);

CREATE POLICY "Only authorized systems can modify market embeddings" 
ON public.market_embeddings 
FOR ALL 
USING (auth.role() = 'service_role');

-- Enable RLS on market_price_history table
ALTER TABLE public.market_price_history ENABLE ROW LEVEL SECURITY;

-- Create policies for market_price_history (public read only)
CREATE POLICY "Anyone can read market price history" 
ON public.market_price_history 
FOR SELECT 
USING (true);

CREATE POLICY "Only authorized systems can modify price history" 
ON public.market_price_history 
FOR ALL 
USING (auth.role() = 'service_role');

-- Enable RLS on market_prices table
ALTER TABLE public.market_prices ENABLE ROW LEVEL SECURITY;

-- Create policies for market_prices (public read only)
CREATE POLICY "Anyone can read market prices" 
ON public.market_prices 
FOR SELECT 
USING (true);

CREATE POLICY "Only authorized systems can modify market prices" 
ON public.market_prices 
FOR ALL 
USING (auth.role() = 'service_role');

-- Enable RLS on markets table
ALTER TABLE public.markets ENABLE ROW LEVEL SECURITY;

-- Create policies for markets (public read only)
CREATE POLICY "Anyone can read markets" 
ON public.markets 
FOR SELECT 
USING (true);

CREATE POLICY "Only authorized systems can modify markets" 
ON public.markets 
FOR ALL 
USING (auth.role() = 'service_role');

-- Enable RLS on orderbook_subscriptions table
ALTER TABLE public.orderbook_subscriptions ENABLE ROW LEVEL SECURITY;

-- Create policies for orderbook_subscriptions (system access only)
CREATE POLICY "Only systems can access orderbook subscriptions" 
ON public.orderbook_subscriptions 
FOR ALL 
USING (auth.role() = 'service_role');

-- Enable RLS on query_pages table
ALTER TABLE public.query_pages ENABLE ROW LEVEL SECURITY;

-- Create policies for query_pages (public read, system write)
CREATE POLICY "Anyone can read query pages" 
ON public.query_pages 
FOR SELECT 
USING (true);

CREATE POLICY "Only systems can modify query pages" 
ON public.query_pages 
FOR ALL 
USING (auth.role() = 'service_role');

-- Enable RLS on webm_items table
ALTER TABLE public.webm_items ENABLE ROW LEVEL SECURITY;

-- Create policies for webm_items (public read, system write)
CREATE POLICY "Anyone can read webm items" 
ON public.webm_items 
FOR SELECT 
USING (true);

CREATE POLICY "Only systems can modify webm items" 
ON public.webm_items 
FOR ALL 
USING (auth.role() = 'service_role');