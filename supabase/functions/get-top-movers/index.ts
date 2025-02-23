
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
    
    const { interval = '1440', openOnly = false, page = 1, limit = 20, searchQuery = '' } = await req.json();
    console.log(`Fetching top movers for interval: ${interval} minutes, page: ${page}, limit: ${limit}, openOnly: ${openOnly}, searchQuery: ${searchQuery}`);
    
    const redisInterval = interval;

    // Get latest key for this interval
    const latestKey = await redis.get(`topMovers:${redisInterval}:latest`);
    console.log(`Latest key lookup result for interval ${redisInterval}:`, latestKey);
    
    if (!latestKey) {
      console.log(`No latest key found for interval: ${redisInterval}`);
      return new Response(
        JSON.stringify({
          data: [],
          hasMore: false
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }

    // Get manifest
    const manifestKey = `topMovers:${redisInterval}:${latestKey}:manifest`;
    console.log(`Looking for manifest at key: ${manifestKey}`);
    const manifestData = await redis.get(manifestKey);
    
    if (!manifestData) {
      console.log(`No manifest found at key: ${manifestKey}`);
      return new Response(
        JSON.stringify({
          data: [],
          hasMore: false
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }

    const manifest = JSON.parse(manifestData);
    console.log(`Found manifest with ${manifest.chunks} chunks for interval ${redisInterval}`);

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
    console.log(`Retrieved ${allMarkets.length} markets total for interval ${redisInterval}`);

    // First apply filters (openOnly)
    if (openOnly) {
      allMarkets = allMarkets.filter(m => m.active && !m.archived);
      console.log(`Filtered to ${allMarkets.length} open markets for interval ${redisInterval}`);
    }

    // Apply search if query exists (before sorting and pagination)
    let searchResults = [...allMarkets];
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

      // If we have very few results after search, we should include markets without recent price changes
      if (searchResults.length < limit) {
        // Add markets that match the search but haven't had price changes
        // They'll get a price_change of 0
        const noChangeMarkets = searchResults.map(m => ({
          ...m,
          price_change: 0,
          volume_change: 0,
          volume_change_percentage: 0,
          final_last_traded_price: m.final_last_traded_price || 0,
          final_best_ask: m.final_best_ask || 0,
          final_best_bid: m.final_best_bid || 0,
          final_volume: m.final_volume || 0,
          initial_last_traded_price: m.initial_last_traded_price || 0,
          initial_volume: m.initial_volume || 0
        }));
        searchResults = noChangeMarkets;
      }
      
      console.log(`Found ${searchResults.length} markets matching search query "${searchQuery}" with search terms:`, searchTerms);
    }

    // Then sort all filtered results by absolute price change
    searchResults.sort((a, b) => Math.abs(b.price_change) - Math.abs(a.price_change));

    // Finally apply pagination to the filtered and sorted results
    const start = (page - 1) * limit;
    const paginatedMarkets = searchResults.slice(start, start + limit);
    const hasMore = searchResults.length > start + limit;
    console.log(`Returning ${paginatedMarkets.length} markets for interval ${redisInterval}, hasMore: ${hasMore}`);

    await redis.close();

    return new Response(
      JSON.stringify({
        data: paginatedMarkets,
        hasMore,
        total: searchResults.length
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
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
