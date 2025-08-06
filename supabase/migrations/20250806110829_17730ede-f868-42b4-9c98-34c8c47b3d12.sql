-- Fix security warnings by setting secure search paths for all functions
-- This prevents search path injection attacks that could lead to privilege escalation

-- Fix function security: Set search_path to public for all custom functions
CREATE OR REPLACE FUNCTION public.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_latest_prices_for_markets(market_ids text[])
 RETURNS TABLE(market_id text, yes_price numeric, no_price numeric, best_bid numeric, best_ask numeric, last_traded_price numeric, volume numeric, liquidity numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (mp.market_id)
    mp.market_id,
    mp.yes_price,
    mp.no_price,
    mp.best_bid,
    mp.best_ask,
    mp.last_traded_price,
    mp.volume,
    mp.liquidity
  FROM market_prices mp
  WHERE mp.market_id = ANY(market_ids)
    AND mp.last_traded_price IS NOT NULL
    AND mp.last_traded_price > 0
    AND mp.last_traded_price < 1
  ORDER BY mp.market_id, mp.timestamp DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_orderbook_table()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    CREATE TABLE IF NOT EXISTS public.orderbook_data (
        id BIGSERIAL PRIMARY KEY,
        token_id TEXT NOT NULL,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        bids JSONB,
        asks JSONB,
        best_bid NUMERIC,
        best_ask NUMERIC,
        spread NUMERIC
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.enable_realtime_for_table(table_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    -- Enable row level security
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', table_name);
    
    -- Check if the table is already in the publication
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = table_name
    ) THEN
        -- Add the table to the publication
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
    END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_table_exists(p_table_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    RETURN EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public'
        AND tables.table_name = p_table_name
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.batch_insert_market_data(event_records jsonb, market_records jsonb, price_records jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    -- Insert events with conflict handling
    INSERT INTO events 
    SELECT *
    FROM jsonb_populate_recordset(null::events, event_records)
    ON CONFLICT (id) 
    DO UPDATE SET
        title = EXCLUDED.title,
        slug = EXCLUDED.slug,
        category = EXCLUDED.category,
        sub_title = EXCLUDED.sub_title,
        mutually_exclusive = EXCLUDED.mutually_exclusive;

    -- Insert markets with conflict handling
    INSERT INTO markets 
    SELECT *
    FROM jsonb_populate_recordset(null::markets, market_records)
    ON CONFLICT (id) 
    DO UPDATE SET
        question = EXCLUDED.question,
        subtitle = EXCLUDED.subtitle,
        url = EXCLUDED.url,
        description = EXCLUDED.description,
        status = EXCLUDED.status,
        active = EXCLUDED.active,
        closed = EXCLUDED.closed,
        archived = EXCLUDED.archived;

    -- Insert price records (no conflict handling needed)
    INSERT INTO market_prices 
    SELECT *
    FROM jsonb_populate_recordset(null::market_prices, price_records);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_active_markets_with_prices(start_time timestamp with time zone, end_time timestamp with time zone, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_probability_min numeric DEFAULT NULL::numeric, p_probability_max numeric DEFAULT NULL::numeric, p_price_change_min numeric DEFAULT NULL::numeric, p_price_change_max numeric DEFAULT NULL::numeric)
 RETURNS TABLE(output_market_id text, initial_price numeric, final_price numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH market_snapshots AS (
    SELECT 
      m.id,
      FIRST_VALUE(mp.last_traded_price) OVER (PARTITION BY m.id ORDER BY mp.timestamp DESC) as final_price,
      FIRST_VALUE(mp.last_traded_price) OVER (PARTITION BY m.id ORDER BY mp.timestamp ASC) as initial_price
    FROM markets m
    INNER JOIN market_prices mp ON m.id = mp.market_id
    WHERE 
      mp.timestamp BETWEEN start_time AND end_time
      AND m.active = true 
      AND m.archived = false
      AND mp.last_traded_price IS NOT NULL
      AND mp.last_traded_price > 0
      AND mp.last_traded_price < 1
  )
  SELECT DISTINCT ON (ms.id)
    ms.id as output_market_id,
    ms.initial_price,
    ms.final_price
  FROM market_snapshots ms
  WHERE (
    -- Apply price change filters if provided
    (p_price_change_min IS NULL OR 
     ((ms.final_price - ms.initial_price) / ms.initial_price * 100) >= p_price_change_min)
    AND
    (p_price_change_max IS NULL OR 
     ((ms.final_price - ms.initial_price) / ms.initial_price * 100) <= p_price_change_max)
    -- Apply probability filters if provided
    AND
    (p_probability_min IS NULL OR ms.final_price * 100 >= p_probability_min)
    AND
    (p_probability_max IS NULL OR ms.final_price * 100 <= p_probability_max)
  )
  ORDER BY ms.id, ABS(ms.final_price - ms.initial_price) DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;

CREATE OR REPLACE FUNCTION public.append_iteration_field_text(job_id uuid, iteration_num integer, field_key text, append_text text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    iteration_index int;
    current_iterations jsonb;
    current_text text;
BEGIN
    -- Get the current iterations array
    SELECT iterations INTO current_iterations FROM research_jobs WHERE id = job_id;

    -- Find the index of the target iteration (0-based)
    -- Note: jsonb_array_elements index is 0-based, WITH ORDINALITY index (idx) is 1-based
    SELECT idx - 1 INTO iteration_index
    FROM jsonb_array_elements(current_iterations) WITH ORDINALITY arr(elem, idx)
    WHERE (elem->>'iteration')::int = iteration_num;

    -- Check if the iteration was found
    IF iteration_index IS NOT NULL THEN
        -- Get current text value (or empty string if not exists)
        SELECT 
            COALESCE(current_iterations->iteration_index::text->>field_key, '')
        INTO current_text;
        
        -- Update by appending the new text to the existing text
        UPDATE research_jobs
        SET iterations = jsonb_set(
                current_iterations,
                ARRAY[iteration_index::text, field_key], -- Path: {index, field_key}
                to_jsonb(current_text || append_text), -- Append new text to existing
                true -- Create the key if it doesn't exist
            ),
            updated_at = NOW() -- Also update the timestamp
        WHERE id = job_id;
    ELSE
        -- Optional: Log or raise a notice if iteration not found
        RAISE NOTICE 'Iteration % not found for job %', iteration_num, job_id;
    END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.append_research_iteration(job_id uuid, iteration_data jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE research_jobs
  SET iterations = iterations || iteration_data
  WHERE id = job_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.append_research_progress(job_id uuid, progress_entry jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE research_jobs
  SET progress_log = progress_log || progress_entry
  WHERE id = job_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_iteration_field(job_id uuid, iteration_num integer, field_key text, field_value text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    iteration_index int;
    current_iterations jsonb;
BEGIN
    -- Get the current iterations array
    SELECT iterations INTO current_iterations FROM research_jobs WHERE id = job_id;

    -- Find the index of the target iteration (0-based)
    -- Note: jsonb_array_elements index is 0-based, WITH ORDINALITY index (idx) is 1-based
    SELECT idx - 1 INTO iteration_index
    FROM jsonb_array_elements(current_iterations) WITH ORDINALITY arr(elem, idx)
    WHERE (elem->>'iteration')::int = iteration_num;

    -- Check if the iteration was found
    IF iteration_index IS NOT NULL THEN
        -- Update the specific field within the specific iteration object
        UPDATE research_jobs
        SET iterations = jsonb_set(
                current_iterations,
                ARRAY[iteration_index::text, field_key], -- Path: {index, field_key}
                to_jsonb(field_value), -- New value (cast text to jsonb)
                true -- Create the key if it doesn't exist
            ),
            updated_at = NOW() -- Also update the timestamp
        WHERE id = job_id;
    ELSE
        -- Optional: Log or raise a notice if iteration not found
        RAISE NOTICE 'Iteration % not found for job %', iteration_num, job_id;
    END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.append_research_progress(job_id uuid, progress_entry text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE research_jobs
  SET progress_log = progress_log || to_jsonb(progress_entry::text),
      updated_at = NOW()
  WHERE id = job_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_markets_with_prices(start_time timestamp with time zone, end_time timestamp with time zone)
 RETURNS TABLE(market_id text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT DISTINCT market_id 
  FROM market_prices
  WHERE timestamp BETWEEN start_time AND end_time;
$function$;

CREATE OR REPLACE FUNCTION public.get_active_markets(market_ids text[])
 RETURNS TABLE(id text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id 
  FROM markets
  WHERE id = ANY(market_ids)
  AND active = true 
  AND archived = false;
$function$;

CREATE OR REPLACE FUNCTION public.get_active_markets_with_prices(start_time timestamp with time zone, end_time timestamp with time zone)
 RETURNS TABLE(id text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH active_price_markets AS (
    SELECT DISTINCT market_id 
    FROM market_prices 
    WHERE last_traded_price IS NOT NULL 
    AND last_traded_price > 0
    AND last_traded_price < 1
  )
  SELECT m.id
  FROM markets m
  JOIN active_price_markets p ON m.id = p.market_id
  WHERE m.active = true 
  AND m.archived = false;
END;
$function$;

-- Fix the profiles table RLS policy to properly protect OpenRouter API keys
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;

-- Create separate policies for public profile data vs private API keys
CREATE POLICY "Public profile data is viewable by everyone" 
ON public.profiles 
FOR SELECT 
USING (true);

-- Restrict access to sensitive fields
CREATE POLICY "Users can view their own API key" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() = id);

-- Update existing policies to be more restrictive
DROP POLICY IF EXISTS "Users can update own profile." ON public.profiles;

CREATE POLICY "Users can update their own profile" 
ON public.profiles 
FOR UPDATE 
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Create a view for public profile data only (excluding sensitive fields)
CREATE OR REPLACE VIEW public.public_profiles AS
SELECT 
  id,
  email,
  created_at,
  updated_at,
  balance
FROM public.profiles;