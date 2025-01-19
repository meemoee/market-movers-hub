// supabase/functions/get-top-movers/index.ts
import { Redis } from 'ioredis';

serve(async (req) => {
  const redis = new Redis(Deno.env.get('REDIS_URL'));
  
  try {
    const { interval = '24h', openOnly = false, page = 1, limit = 20 } = await req.json()
    
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
      throw new Error('No data available for this interval');
    }

    // Get manifest
    const manifestKey = `topMovers:${redisInterval}:${latestKey}:manifest`;
    const manifestData = await redis.get(manifestKey);
    if (!manifestData) {
      throw new Error('No manifest found');
    }
    const manifest = JSON.parse(manifestData);

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

    // Sort by absolute price change
    allMarkets.sort((a, b) => Math.abs(b.price_change) - Math.abs(a.price_change));

    // Apply filters if needed
    if (openOnly) {
      allMarkets = allMarkets.filter(m => m.active && !m.archived);
    }

    // Apply pagination
    const start = (page - 1) * limit;
    const paginatedMarkets = allMarkets.slice(start, start + limit);
    const hasMore = allMarkets.length > start + limit;

    await redis.quit();

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
    await redis.quit();
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
