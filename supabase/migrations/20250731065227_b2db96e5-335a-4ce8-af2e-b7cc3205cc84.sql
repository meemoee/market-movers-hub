-- Phase 3: Fix remaining security warnings - Database function security

-- Add SET search_path to secure database functions that need it
CREATE OR REPLACE FUNCTION public.execute_market_order(p_user_id uuid, p_market_id text, p_token_id text, p_outcome text, p_side order_side, p_size numeric, p_price numeric)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_order_id UUID;
  v_balance NUMERIC;
  v_total_cost NUMERIC;
  v_holdings_id UUID;
BEGIN
  -- Start transaction
  BEGIN
    -- Lock user balance
    SELECT balance INTO v_balance
    FROM profiles
    WHERE id = p_user_id
    FOR UPDATE;

    -- Calculate total cost
    v_total_cost := p_size * p_price;

    -- Check balance for buys
    IF p_side = 'buy' AND v_balance < v_total_cost THEN
      RAISE EXCEPTION 'Insufficient balance';
    END IF;

    -- Create order record
    INSERT INTO orders (
      user_id,
      market_id,
      token_id,
      outcome,
      side,
      size,
      price,
      order_type,
      status
    ) VALUES (
      p_user_id,
      p_market_id,
      p_token_id,
      p_outcome,
      p_side,
      p_size,
      p_price,
      'market',
      'completed'
    ) RETURNING id INTO v_order_id;

    -- Update user balance for buys
    IF p_side = 'buy' THEN
      UPDATE profiles
      SET balance = balance - v_total_cost
      WHERE id = p_user_id;
    END IF;

    -- Update holdings
    INSERT INTO holdings (
      user_id,
      market_id,
      token_id,
      outcome,
      position,
      amount,
      entry_price
    ) VALUES (
      p_user_id,
      p_market_id,
      p_token_id,
      p_outcome,
      p_side::text,
      p_size,
      p_price
    )
    ON CONFLICT (user_id, market_id, token_id) DO UPDATE
    SET amount = holdings.amount + EXCLUDED.amount,
        entry_price = (holdings.amount * holdings.entry_price + EXCLUDED.amount * EXCLUDED.entry_price) / (holdings.amount + EXCLUDED.amount);

    RETURN v_order_id;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE;
  END;
END;
$function$;

-- Update other critical functions
CREATE OR REPLACE FUNCTION public.append_iteration_field_text(job_id uuid, iteration_num integer, field_key text, append_text text)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
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
SET search_path = public
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
SET search_path = public
AS $function$
BEGIN
  UPDATE research_jobs
  SET progress_log = progress_log || progress_entry
  WHERE id = job_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_research_job_status(job_id uuid, new_status text, error_msg text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  UPDATE research_jobs
  SET 
    status = new_status,
    error_message = CASE WHEN new_status = 'failed' THEN error_msg ELSE error_message END,
    started_at = CASE WHEN new_status = 'processing' AND started_at IS NULL THEN NOW() ELSE started_at END,
    completed_at = CASE WHEN new_status IN ('completed', 'failed') THEN NOW() ELSE completed_at END,
    updated_at = NOW()
  WHERE id = job_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_research_results(job_id uuid, result_data jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  UPDATE research_jobs
  SET results = result_data,
      updated_at = NOW()
  WHERE id = job_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_research_job_complete(job_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  job_record research_jobs%ROWTYPE;
BEGIN
  SELECT * INTO job_record FROM research_jobs WHERE id = job_id;
  
  -- Check if job has reached max iterations and is still processing
  RETURN job_record.current_iteration >= job_record.max_iterations 
         AND job_record.status = 'processing';
END;
$function$;

CREATE OR REPLACE FUNCTION public.auto_complete_research_job()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  -- If job has reached max iterations, mark it as complete
  IF NEW.current_iteration >= NEW.max_iterations AND NEW.status = 'processing' THEN
    NEW.status := 'completed';
    NEW.completed_at := NOW();
  END IF;
  
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.append_analysis_chunk(job_id uuid, iteration integer, chunk text, seq integer)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  chunk_id UUID;
BEGIN
  INSERT INTO public.analysis_stream(job_id, iteration, chunk, sequence)
  VALUES (job_id, iteration, chunk, seq)
  RETURNING id INTO chunk_id;
  
  RETURN chunk_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.append_progress_log(job_id uuid, log_message text)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  UPDATE public.research_jobs
  SET 
    progress_log = COALESCE(progress_log, '[]'::jsonb) || jsonb_build_array(log_message),
    updated_at = now()
  WHERE id = job_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_iteration_field(job_id uuid, iteration_num integer, field_key text, field_value text)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
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