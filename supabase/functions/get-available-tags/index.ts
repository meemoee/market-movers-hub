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
    console.log('Getting available tags from Redis...');
    
    const redis = await connect({
      hostname: Deno.env.get('REDIS_URL')?.replace('redis://', '').split('@')[1] || '',
      port: 6379,
      password: Deno.env.get('REDIS_URL')?.split('//')[1]?.split('@')[0] || '',
    });
    console.log('Connected to Redis successfully');

    // Get the latest key for a common interval (1440 = 1 day)
    const latestKey = await redis.get('topMovers:1440:latest');
    if (!latestKey) {
      console.log('No latest key found for interval 1440');
      return Response.json(
        { data: [], error: 'No data available' },
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Latest key lookup result for interval 1440: ${latestKey}`);

    // Get the manifest
    const manifestKey = `topMovers:1440:${latestKey}:manifest`;
    console.log(`Looking for manifest at key: ${manifestKey}`);
    const manifestData = await redis.get(manifestKey);
    
    if (!manifestData) {
      console.log('No manifest found');
      await redis.close();
      return Response.json(
        { data: [], error: 'No manifest data available' },
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const manifest = JSON.parse(manifestData);
    console.log(`Found manifest with ${manifest.chunks} chunks for interval 1440`);

    // Collect all unique tags from all chunks
    const allTags = new Set<string>();

    for (let i = 0; i < manifest.chunks; i++) {
      const chunkKey = `topMovers:1440:${latestKey}:chunk:${i}`;
      const chunkData = await redis.get(chunkKey);
      
      if (chunkData) {
        const markets = JSON.parse(chunkData);
        
        markets.forEach((market: any) => {
          // Add primary_tags
          if (market.primary_tags && Array.isArray(market.primary_tags)) {
            market.primary_tags.forEach((tag: string) => {
              if (tag && tag.trim()) {
                allTags.add(tag.trim());
              }
            });
          }
          
          // Add tag_slugs as backup
          if (market.tag_slugs && Array.isArray(market.tag_slugs)) {
            market.tag_slugs.forEach((tag: string) => {
              if (tag && tag.trim()) {
                allTags.add(tag.trim());
              }
            });
          }
        });
      }
    }

    await redis.close();

    // Convert to sorted array
    const sortedTags = Array.from(allTags).sort((a, b) => a.localeCompare(b));

    console.log(`Found ${sortedTags.length} unique tags`);

    return Response.json(
      { data: sortedTags },
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