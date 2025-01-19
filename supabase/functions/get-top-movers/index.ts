import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { Redis } from 'https://deno.land/x/redis@v0.29.0/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Helper to convert intervals to minutes
const convertIntervalToMinutes = (interval: string): number => {
  switch(interval) {
    case '1h': return 60;
    case '24h': return 1440;
    case '7d': return 10080;
    case '30d': return 43200;
    default: return 1440; // Default to 24h
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const redis = await new Redis({
      hostname: Deno.env.get('REDIS_HOST') || '',
      port: parseInt(Deno.env.get('REDIS_PORT') || '6379'),
      password: Deno.env.get('REDIS_PASSWORD') || '',
    })

    const { interval = '24h', openOnly = false, page = 1, limit = 20 } = await req.json()
    const redisInterval = convertIntervalToMinutes(interval)
    console.log(`Fetching top movers for interval: ${interval} (${redisInterval} mins)`)

    // Get latest key for this interval
    const latestKey = await redis.get(`topMovers:${redisInterval}:latest`)
    if (!latestKey) {
      console.log('No data available for this interval')
      await redis.close()
      return new Response(
        JSON.stringify({ data: [], hasMore: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get manifest
    const manifestKey = `topMovers:${redisInterval}:${latestKey}:manifest`
    const manifestData = await redis.get(manifestKey)
    if (!manifestData) {
      console.log('No manifest found')
      await redis.close()
      return new Response(
        JSON.stringify({ data: [], hasMore: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const manifest = JSON.parse(manifestData)
    console.log('Manifest data:', manifest)

    // Get all markets from chunks
    let allMarkets = []
    for (let i = 0; i < manifest.chunks; i++) {
      const chunkKey = `topMovers:${redisInterval}:${latestKey}:chunk:${i}`
      const chunkData = await redis.get(chunkKey)
      if (chunkData) {
        const markets = JSON.parse(chunkData)
        allMarkets.push(...markets)
      }
    }

    // Filter active markets if needed
    if (openOnly) {
      allMarkets = allMarkets.filter(m => m.active && !m.archived)
    }

    // Sort by absolute price change
    allMarkets.sort((a, b) => Math.abs(b.price_change) - Math.abs(a.price_change))

    // Apply pagination
    const start = (page - 1) * limit
    const paginatedMarkets = allMarkets.slice(start, start + limit)
    const hasMore = allMarkets.length > start + limit

    console.log(`Returning ${paginatedMarkets.length} markets (page ${page})`)

    await redis.close()
    
    return new Response(
      JSON.stringify({
        data: paginatedMarkets,
        hasMore
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})