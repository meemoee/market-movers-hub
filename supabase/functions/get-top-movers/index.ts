import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { connect } from 'https://deno.land/x/redis@v0.29.0/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

const connectToRedis = async () => {
  try {
    console.log('Connecting to Redis...');
    return await connect({
      hostname: Deno.env.get('REDIS_HOST') || '',
      port: parseInt(Deno.env.get('REDIS_PORT') || '6379'),
      password: Deno.env.get('REDIS_PASSWORD'),
      maxRetryCount: 3,
      retryInterval: 1000,
    });
  } catch (error) {
    console.error('Redis connection error:', error);
    throw new Error('Failed to connect to Redis');
  }
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  let redis = null;
  try {
    console.log('Processing request...');
    const { interval = '24h', openOnly = false, page = 1, limit = 20 } = await req.json();
    console.log(`Parameters - interval: ${interval}, page: ${page}, limit: ${limit}, openOnly: ${openOnly}`);

    redis = await connectToRedis();
    if (!redis) {
      throw new Error('Redis connection failed');
    }

    // Get latest key with retry
    let latestKey = null;
    for (let i = 0; i < 3; i++) {
      latestKey = await redis.get(`topMovers:${interval}:latest`);
      if (latestKey) break;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (!latestKey) {
      console.log(`No data found for ${interval} interval`);
      return new Response(
        JSON.stringify({ data: [], hasMore: false }),
        { headers: corsHeaders }
      );
    }

    // Get manifest data
    const manifestKey = `topMovers:${interval}:${latestKey}:manifest`;
    const manifestData = await redis.get(manifestKey);
    
    if (!manifestData) {
      console.log('No manifest data found');
      return new Response(
        JSON.stringify({ data: [], hasMore: false }),
        { headers: corsHeaders }
      );
    }

    const manifest = JSON.parse(manifestData);
    const offset = (page - 1) * limit;
    
    // Calculate which chunks we need
    const startChunk = Math.floor(offset / manifest.chunkSize);
    const endChunk = Math.min(
      Math.ceil((offset + limit) / manifest.chunkSize),
      manifest.chunks
    );

    console.log(`Fetching chunks ${startChunk} to ${endChunk}`);

    // Fetch chunks sequentially to reduce memory usage
    let allMarkets = [];
    for (let i = startChunk; i < endChunk; i++) {
      const chunkKey = `topMovers:${interval}:${latestKey}:chunk:${i}`;
      const chunkData = await redis.get(chunkKey);
      if (chunkData) {
        const markets = JSON.parse(chunkData);
        allMarkets = allMarkets.concat(markets);
      }
    }

    // Filter and sort markets
    allMarkets = allMarkets
      .filter(market => 
        market.price_change !== null && 
        market.price_change !== undefined && 
        market.price_change !== 0 &&
        (!openOnly || (market.active && !market.archived))
      )
      .sort((a, b) => Math.abs(b.price_change) - Math.abs(a.price_change));

    // Get just the page we need
    const startIndex = offset % manifest.chunkSize;
    const paginatedMarkets = allMarkets.slice(startIndex, startIndex + limit);
    const hasMore = allMarkets.length > (startIndex + limit);

    console.log(`Returning ${paginatedMarkets.length} markets`);

    return new Response(
      JSON.stringify({
        data: paginatedMarkets,
        hasMore
      }),
      { headers: corsHeaders }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: error.stack
      }),
      { 
        status: 500,
        headers: corsHeaders
      }
    );
  } finally {
    if (redis) {
      try {
        await redis.close();
      } catch (err) {
        console.error('Error closing Redis connection:', err);
      }
    }
  }
})