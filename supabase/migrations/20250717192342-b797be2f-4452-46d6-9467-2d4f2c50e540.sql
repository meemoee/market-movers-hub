
-- Create a function to get tag counts from the markets table
CREATE OR REPLACE FUNCTION get_tag_counts()
RETURNS TABLE(tag_name text, tag_count bigint)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    unnest(primary_tags) as tag_name,
    COUNT(*) as tag_count
  FROM markets 
  WHERE primary_tags IS NOT NULL 
    AND array_length(primary_tags, 1) > 0
    AND active = true 
    AND archived = false
  GROUP BY unnest(primary_tags)
  ORDER BY tag_count DESC
  LIMIT 50;
END;
$$;
