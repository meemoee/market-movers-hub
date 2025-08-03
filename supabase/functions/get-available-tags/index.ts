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
    console.log('[START] Getting available tags from Redis tag totals...');
    const startTime = Date.now();
    
    // Parse Redis URL properly like get-top-movers does
    const redisUrl = Deno.env.get('REDIS_URL');
    if (!redisUrl) {
      console.error('[ERROR] REDIS_URL environment variable not set');
      throw new Error('REDIS_URL environment variable not set');
    }

    console.log('[STEP 1] Parsing Redis URL...');
    const url = new URL(redisUrl);
    
    console.log('[STEP 2] Connecting to Redis...');
    const redis = await connect({
      hostname: new URL(redisUrl).hostname,
      port: parseInt(new URL(redisUrl).port) || 6379,
      password: new URL(redisUrl).password || undefined,
      tls: redisUrl.startsWith('rediss://')
    });
    console.log(`[STEP 3] Connected to Redis successfully in ${Date.now() - startTime}ms`);

    // Get the latest key for a common interval (1440 = 1 day)
    console.log(`[STEP 4] Getting latest key for interval 1440 at ${Date.now() - startTime}ms`);
    const latestKey = await redis.get('topMovers:1440:latest');
    if (!latestKey) {
      console.log('[ERROR] No latest key found for interval 1440');
      await redis.close();
      return Response.json(
        { data: [], error: 'No data available' },
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[STEP 5] Latest key lookup result for interval 1440: ${latestKey} at ${Date.now() - startTime}ms`);

    // Get tag totals (much faster than scanning all chunks)
    const tagTotalsKey = `topMovers:1440:${latestKey}:tagTotals`;
    console.log(`[STEP 6] Looking for tag totals at key: ${tagTotalsKey} at ${Date.now() - startTime}ms`);
    const tagTotalsData = await redis.get(tagTotalsKey);
    
    if (!tagTotalsData) {
      console.log(`[STEP 7] No tag totals found, falling back to tag list at ${Date.now() - startTime}ms`);
      
      // Fallback: get tag names from the tag set
      const tagListKey = `topMovers:1440:${latestKey}:tags`;
      console.log(`[STEP 8] Fallback - looking for tags at key: ${tagListKey}`);
      const tagNames = await redis.smembers(tagListKey);
      
      if (!tagNames || tagNames.length === 0) {
        console.log(`[ERROR] No tags found in tag set either at ${Date.now() - startTime}ms`);
        await redis.close();
        return Response.json(
          { data: [], error: 'No tags available' },
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      await redis.close();
      
      // Return simple tag list without counts
      const sortedTags = tagNames.sort((a, b) => a.localeCompare(b));
      console.log(`[SUCCESS] Found ${sortedTags.length} tags from tag set in ${Date.now() - startTime}ms`);
      
      return Response.json(
        { data: sortedTags.map(tag => ({ name: tag, count: null })) },
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[STEP 7] Parsing tag totals data at ${Date.now() - startTime}ms`);
    const tagTotals = JSON.parse(tagTotalsData);
    console.log(`[STEP 8] Found tag totals for ${Object.keys(tagTotals).length} tags at ${Date.now() - startTime}ms`);

    await redis.close();

    // Convert to array with tag names and counts, sorted by count desc
    console.log(`[STEP 9] Converting to array and sorting at ${Date.now() - startTime}ms`);
    const tagsWithCounts = Object.entries(tagTotals)
      .map(([name, totals]: [string, any]) => ({
        name,
        count: totals.count,
        movers: totals.movers,
        avg_abs_price_change: totals.avg_abs_price_change,
      }))
      .sort((a, b) => b.count - a.count); // Sort by count descending

    console.log(`[SUCCESS] Returning ${tagsWithCounts.length} tags with counts in ${Date.now() - startTime}ms`);

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