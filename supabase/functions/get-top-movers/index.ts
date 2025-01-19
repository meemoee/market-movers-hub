import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Redis } from "https://deno.land/x/redis@v0.29.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const redis = await new Redis({
    hostname: Deno.env.get('REDIS_HOST') || "",
    port: parseInt(Deno.env.get('REDIS_PORT') || "6379"),
    password: Deno.env.get('REDIS_PASSWORD'),
  });
  
  try {
    const { interval = '24h', openOnly = false, page = 1, limit = 20 } = await req.json();
    console.log(`Fetching top movers for interval: ${interval}, page: ${page}, limit: ${limit}, openOnly: ${openOnly}`);
    
    // Convert interval to minutes
    const redisInterval = {
      '1h': 60,
      '24h': 1440,
      '7d': 10080,
      '30d': 43200
    }[interval] || 1440;

    // Get latest key for this interval
    const latestKey = await redis.get(`topMovers:${redisInterval}:latest`);
    if (!latestKey) {
      console.error(`No data available for interval: ${interval}`);
      throw new Error('No data available for this interval');
    }
    console.log(`Found latest key: ${latestKey}`);

    // Get manifest
    const manifestKey = `topMovers:${redisInterval}:${latestKey}:manifest`;
    const manifestData = await redis.get(manifestKey);
    if (!manifestData) {
      console.error(`No manifest found for key: ${manifestKey}`);
      throw new Error('No manifest found');
    }
    const manifest = JSON.parse(manifestData);
    console.log(`Found manifest with ${manifest.chunks} chunks`);

    // Get all markets from chunks
    let allMarkets = [];
    for (let i = 0; i < manifest.chunks; i++) {
      const chunkKey = `topMovers:${redisInterval}:${latestKey}:chunk:${i}`;
      const chunkData = await redis.get(chunkKey);
      if (chunkData) {
        const markets = JSON.parse(chunkData);
        allMarkets.push(...markets);
      }
    }
    console.log(`Retrieved ${allMarkets.length} markets total`);

    // Sort by absolute price change
    allMarkets.sort((a, b) => Math.abs(b.price_change) - Math.abs(a.price_change));

    // Apply filters if needed
    if (openOnly) {
      allMarkets = allMarkets.filter(m => m.active && !m.archived);
      console.log(`Filtered to ${allMarkets.length} open markets`);
    }

    // Apply pagination
    const start = (page - 1) * limit;
    const paginatedMarkets = allMarkets.slice(start, start + limit);
    const hasMore = allMarkets.length > start + limit;
    console.log(`Returning ${paginatedMarkets.length} markets, hasMore: ${hasMore}`);

    await redis.close();

    return new Response(
      JSON.stringify({
        data: paginatedMarkets,
        hasMore
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error:', error);
    await redis.close();
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});