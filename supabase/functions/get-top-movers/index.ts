import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { connect } from 'https://deno.land/x/redis@v0.29.0/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const redis = await connect({
      hostname: Deno.env.get('REDIS_HOST') || '',
      port: parseInt(Deno.env.get('REDIS_PORT') || '6379'),
      password: Deno.env.get('REDIS_PASSWORD'),
    })

    const { interval = '24h', openOnly = false, page = 1, limit = 20 } = await req.json()
    const redisInterval = convertIntervalToMinutes(interval)
    const offset = (page - 1) * limit
    
    console.log(`Processing request with interval: ${interval} (${redisInterval} mins), page: ${page}, limit: ${limit}`)

    // Get latest key from Redis
    const latestKey = await redis.get(`topMovers:${redisInterval}:latest`)
    if (!latestKey) {
      console.log(`No data in Redis for ${redisInterval} minute interval`)
      await redis.close()
      return new Response(
        JSON.stringify({ data: [], hasMore: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get manifest data
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
    console.log('Manifest Data:', manifest)

    // Process chunks more efficiently
    let allMarkets = []
    const chunkPromises = []
    
    // Only get chunks we need based on page and limit
    const startChunk = Math.floor(offset / manifest.chunkSize)
    const endChunk = Math.min(
      Math.ceil((offset + limit) / manifest.chunkSize),
      manifest.chunks
    )

    console.log(`Processing chunks ${startChunk} to ${endChunk}`)

    for (let i = startChunk; i < endChunk; i++) {
      const chunkKey = `topMovers:${redisInterval}:${latestKey}:chunk:${i}`
      chunkPromises.push(redis.get(chunkKey))
    }

    const chunkResults = await Promise.all(chunkPromises)
    
    for (const chunkData of chunkResults) {
      if (chunkData) {
        const markets = JSON.parse(chunkData)
        allMarkets.push(...markets)
      }
    }

    // Filter and sort markets
    allMarkets = allMarkets
      .filter(market => 
        market.price_change !== null && 
        market.price_change !== undefined && 
        market.price_change !== 0
      )
      .sort((a, b) => Math.abs(b.price_change) - Math.abs(a.price_change))

    if (openOnly) {
      allMarkets = allMarkets.filter(market => market.active && !market.archived)
    }

    // Log stats for debugging
    console.log(`Total markets after filtering: ${allMarkets.length}`)
    if (allMarkets.length > 0) {
      const priceChanges = allMarkets.map(m => Math.abs(m.price_change))
      console.log(`Min abs change: ${Math.min(...priceChanges).toFixed(6)}`)
      console.log(`Max abs change: ${Math.max(...priceChanges).toFixed(6)}`)
    }

    // Paginate results
    const paginatedMarkets = allMarkets.slice(0, limit)
    const hasMore = allMarkets.length > limit

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