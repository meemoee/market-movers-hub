-- Create function to get tag counts for the TagFilter component
CREATE OR REPLACE FUNCTION get_tag_counts()
RETURNS TABLE (
  tag_name text,
  tag_count bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    unnest(primary_tags) as tag_name,
    COUNT(*) as tag_count
  FROM markets 
  WHERE active = true 
    AND closed = false 
    AND archived = false
    AND primary_tags IS NOT NULL
    AND array_length(primary_tags, 1) > 0
  GROUP BY unnest(primary_tags)
  ORDER BY tag_count DESC
  LIMIT 50;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_tag_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION get_tag_counts() TO anon;
