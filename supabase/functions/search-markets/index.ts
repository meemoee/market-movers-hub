
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { connect } from "https://deno.land/x/redis@v0.29.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let redis;
  try {
    const { searchQuery = '', page = 1, limit = 20 } = await req.json();
    console.log(`Searching markets with query: "${searchQuery}", page: ${page}, limit: ${limit}`);

    const redisUrl = Deno.env.get('REDIS_URL');
    if (!redisUrl) {
      throw new Error('Redis configuration is missing');
    }

    redis = await connect({
      hostname: new URL(redisUrl).hostname,
      port: parseInt(new URL(redisUrl).port),
      password: new URL(redisUrl).password,
      tls: redisUrl.startsWith('rediss://')
    });

    // Get latest key for the default interval (1440)
    const latestKey = await redis.get(`topMovers:1440:latest`);
    if (!latestKey) {
      return new Response(
        JSON.stringify({ data: [], hasMore: false, total: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get manifest and load all markets
    const manifestKey = `topMovers:1440:${latestKey}:manifest`;
    const manifestData = await redis.get(manifestKey);
    
    if (!manifestData) {
      return new Response(
        JSON.stringify({ data: [], hasMore: false, total: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const manifest = JSON.parse(manifestData);
    let allMarkets = [];
    
    // Load all markets from chunks
    const promises = [];
    for (let i = 0; i < manifest.chunks; i++) {
      const chunkKey = `topMovers:1440:${latestKey}:chunk:${i}`;
      promises.push(redis.get(chunkKey));
    }
    
    // Load chunks in parallel
    const chunksData = await Promise.all(promises);
    chunksData.forEach(chunkData => {
      if (chunkData) {
        const markets = JSON.parse(chunkData);
        allMarkets.push(...markets);
      }
    });

    // Apply search filtering - optimized for speed
    let searchResults = allMarkets;
    if (searchQuery) {
      const searchTerms = searchQuery.toLowerCase().split(' ');
      const searchableFields = ['question', 'subtitle', 'yes_sub_title', 'no_sub_title', 'description', 'event_title'];
      
      searchResults = allMarkets.filter(market => {
        // Pre-compute searchable text once per market
        const searchableText = searchableFields
          .map(field => market[field])
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
          
        return searchTerms.every(term => searchableText.includes(term));
      });
    }

    // Sort by recency
    searchResults.sort((a, b) => {
      const dateA = a.updated_at ? new Date(a.updated_at) : new Date(0);
      const dateB = b.updated_at ? new Date(b.updated_at) : new Date(0);
      return dateB.getTime() - dateA.getTime();
    });

    // Apply pagination
    const start = (page - 1) * limit;
    const paginatedMarkets = searchResults.slice(start, start + limit);
    const hasMore = searchResults.length > start + limit;

    console.log(`Found ${searchResults.length} markets matching search query "${searchQuery}"`);
    console.log(`Returning ${paginatedMarkets.length} markets, hasMore: ${hasMore}`);

    await redis.close();

    return new Response(
      JSON.stringify({
        data: paginatedMarkets,
        hasMore,
        total: searchResults.length
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
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
