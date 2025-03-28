
-- Create a table to store analysis stream chunks
CREATE TABLE IF NOT EXISTS public.analysis_stream (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL,
  chunk TEXT NOT NULL,
  iteration INTEGER NOT NULL,
  sequence INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_analysis_stream_job_id ON public.analysis_stream(job_id);
CREATE INDEX IF NOT EXISTS idx_analysis_stream_job_iteration ON public.analysis_stream(job_id, iteration);

-- Add RLS policies
ALTER TABLE public.analysis_stream ENABLE ROW LEVEL SECURITY;

-- Anyone can read (needed for streaming)
CREATE POLICY "Anyone can read analysis streams"
  ON public.analysis_stream
  FOR SELECT
  USING (true);

-- Only service role can insert (from edge functions)
CREATE POLICY "Only service role can insert analysis streams"
  ON public.analysis_stream
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
