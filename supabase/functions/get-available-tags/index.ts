import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.15';
import { connect } from 'https://deno.land/x/redis@v0.29.0/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Getting available tags from Redis tag totals...');
    
    // Parse Redis URL properly like get-top-movers does
    const redisUrl = Deno.env.get('REDIS_URL');
    if (!redisUrl) {
      throw new Error('REDIS_URL environment variable not set');
    }

    console.log('Parsing Redis URL...');
    const url = new URL(redisUrl);
    
    const redis = await connect({
      hostname: url.hostname,
      port: parseInt(url.port) || 6379,
      password: url.password || undefined,
    });
    console.log('Connected to Redis successfully');

    // Get the latest key for a common interval (1440 = 1 day)
    const latestKey = await redis.get('topMovers:1440:latest');
    if (!latestKey) {
      console.log('No latest key found for interval 1440');
      await redis.close();
      return Response.json(
        { data: [], error: 'No data available' },
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Latest key lookup result for interval 1440: ${latestKey}`);

    // Get tag totals (much faster than scanning all chunks)
    const tagTotalsKey = `topMovers:1440:${latestKey}:tagTotals`;
    console.log(`Looking for tag totals at key: ${tagTotalsKey}`);
    const tagTotalsData = await redis.get(tagTotalsKey);
    
    if (!tagTotalsData) {
      console.log('No tag totals found, falling back to tag list');
      
      // Fallback: get tag names from the tag set
      const tagListKey = `topMovers:1440:${latestKey}:tags`;
      const tagNames = await redis.smembers(tagListKey);
      
      if (!tagNames || tagNames.length === 0) {
        console.log('No tags found in tag set either');
        await redis.close();
        return Response.json(
          { data: [], error: 'No tags available' },
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      await redis.close();
      
      // Return simple tag list without counts
      const sortedTags = tagNames.sort((a, b) => a.localeCompare(b));
      console.log(`Found ${sortedTags.length} tags from tag set`);
      
      return Response.json(
        { data: sortedTags.map(tag => ({ name: tag, count: null })) },
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tagTotals = JSON.parse(tagTotalsData);
    console.log(`Found tag totals for ${Object.keys(tagTotals).length} tags`);

    await redis.close();

    // Convert to array with tag names and counts, sorted by count desc
    const tagsWithCounts = Object.entries(tagTotals)
      .map(([name, totals]: [string, any]) => ({
        name,
        count: totals.count,
        movers: totals.movers,
        avg_abs_price_change: totals.avg_abs_price_change,
      }))
      .sort((a, b) => b.count - a.count); // Sort by count descending

    console.log(`Returning ${tagsWithCounts.length} tags with counts`);

    return Response.json(
      { data: tagsWithCounts },
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error getting available tags:', error);
    return Response.json(
      { error: 'Failed to get available tags', details: error.message },
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});