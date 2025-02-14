
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { connect } from "https://deno.land/x/redis@v0.29.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let redis;
  try {
    const redisUrl = Deno.env.get('REDIS_URL');
    if (!redisUrl) {
      console.error('REDIS_URL environment variable is not set');
      throw new Error('Redis configuration is missing');
    }

    console.log('Attempting to connect to Redis...');
    redis = await connect({
      hostname: new URL(redisUrl).hostname,
      port: parseInt(new URL(redisUrl).port),
      password: new URL(redisUrl).password,
      tls: redisUrl.startsWith('rediss://')
    });
    
    console.log('Connected to Redis successfully');
    
    const { interval = '1440', openOnly = false, page = 1, limit = 20, searchQuery = '', marketId, marketIds, probabilityMin, probabilityMax } = await req.json();
    console.log(`Fetching top movers for interval: ${interval} minutes, page: ${page}, limit: ${limit}, openOnly: ${openOnly}, searchQuery: ${searchQuery}, marketId: ${marketId}, marketIds: ${marketIds?.length}, probabilityMin: ${probabilityMin}, probabilityMax: ${probabilityMax}`);
    
    // First get the latest key for the requested interval
    const latestKey = await redis.get(`topMovers:${interval}:latest`);
    console.log(`Latest key for interval ${interval}:`, latestKey);
    
    if (!latestKey) {
      console.log('No latest key found');
      return new Response(
        JSON.stringify({
          data: [],
          hasMore: false
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get manifest
    const manifestKey = `topMovers:${interval}:${latestKey}:manifest`;
    console.log(`Looking for manifest at key: ${manifestKey}`);
    const manifestData = await redis.get(manifestKey);
    
    if (!manifestData) {
      console.log('No manifest found');
      return new Response(
        JSON.stringify({
          data: [],
          hasMore: false
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const manifest = JSON.parse(manifestData);
    console.log(`Found manifest with ${manifest.chunks} chunks`);

    // Get all markets from chunks
    let allMarkets = [];
    for (let i = 0; i < manifest.chunks; i++) {
      const chunkKey = `topMovers:${interval}:${latestKey}:chunk:${i}`;
      const chunkData = await redis.get(chunkKey);
      if (chunkData) {
        const markets = JSON.parse(chunkData);
        allMarkets.push(...markets);
      }
    }
    console.log(`Retrieved ${allMarkets.length} markets total`);

    // First apply probability filters if they exist
    if (typeof probabilityMin === 'number' || typeof probabilityMax === 'number') {
      allMarkets = allMarkets.filter(market => {
        const probability = market.final_last_traded_price * 100; // Convert to percentage
        const meetsMin = typeof probabilityMin !== 'number' || probability >= probabilityMin;
        const meetsMax = typeof probabilityMax !== 'number' || probability <= probabilityMax;
        return meetsMin && meetsMax;
      });
      console.log(`Filtered to ${allMarkets.length} markets within probability range ${probabilityMin}% - ${probabilityMax}%`);
    }

    // Then apply openOnly filter
    if (openOnly) {
      allMarkets = allMarkets.filter(m => m.active && !m.archived);
      console.log(`Filtered to ${allMarkets.length} open markets`);
    }

    // Apply search if query exists
    if (searchQuery) {
      const searchTerms = searchQuery.toLowerCase().split(' ');
      allMarkets = allMarkets.filter(market => {
        const searchableText = [
          market.question,
          market.subtitle,
          market.yes_sub_title,
          market.no_sub_title,
          market.description,
          market.event_title
        ].filter(Boolean).join(' ').toLowerCase();

        return searchTerms.every(term => searchableText.includes(term));
      });
      console.log(`Found ${allMarkets.length} markets matching search query "${searchQuery}"`);
    }

    // Sort all filtered results by absolute price change
    allMarkets.sort((a, b) => Math.abs(b.price_change) - Math.abs(a.price_change));

    // Apply pagination
    const start = (page - 1) * limit;
    const paginatedMarkets = allMarkets.slice(start, start + limit);
    const hasMore = allMarkets.length > start + limit;
    console.log(`Returning ${paginatedMarkets.length} markets, hasMore: ${hasMore}`);

    await redis.close();

    return new Response(
      JSON.stringify({
        data: paginatedMarkets,
        hasMore,
        total: allMarkets.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    if (redis) {
      await redis.close();
    }
    return new Response(
      JSON.stringify({
        data: [],
        hasMore: false,
        error: error.message
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
