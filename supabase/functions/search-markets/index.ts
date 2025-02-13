
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
    for (let i = 0; i < manifest.chunks; i++) {
      const chunkKey = `topMovers:1440:${latestKey}:chunk:${i}`;
      const chunkData = await redis.get(chunkKey);
      if (chunkData) {
        const markets = JSON.parse(chunkData);
        // Clean up any multiple quotes in the market data
        markets.forEach(market => {
          if (market.question) {
            market.question = market.question.replace(/'{2,}/g, "'");
          }
          if (market.subtitle) {
            market.subtitle = market.subtitle.replace(/'{2,}/g, "'");
          }
          if (market.yes_sub_title) {
            market.yes_sub_title = market.yes_sub_title.replace(/'{2,}/g, "'");
          }
          if (market.no_sub_title) {
            market.no_sub_title = market.no_sub_title.replace(/'{2,}/g, "'");
          }
          if (market.description) {
            market.description = market.description.replace(/'{2,}/g, "'");
          }
          if (market.event_title) {
            market.event_title = market.event_title.replace(/'{2,}/g, "'");
          }
        });
        allMarkets.push(...markets);
      }
    }

    // Apply search filtering
    let searchResults = allMarkets;
    if (searchQuery) {
      const searchTerms = searchQuery.toLowerCase().split(' ');
      searchResults = allMarkets.filter(market => {
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
    }

    // Sort by recency (latest first) instead of price change
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
