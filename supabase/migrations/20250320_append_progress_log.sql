
-- Create a function to safely append to the progress_log JSONB array
CREATE OR REPLACE FUNCTION public.append_progress_log(job_id UUID, log_message TEXT)
RETURNS void AS $$
BEGIN
  UPDATE public.research_jobs
  SET 
    progress_log = COALESCE(progress_log, '[]'::jsonb) || jsonb_build_array(log_message),
    updated_at = now()
  WHERE id = job_id;
END;
$$ LANGUAGE plpgsql;
