import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { connect } from 'https://deno.land/x/redis@v0.29.0/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
}

const convertIntervalToMinutes = (interval: string): number => {
  switch(interval) {
    case '1h': return 60;
    case '24h': return 1440;
    case '7d': return 10080;
    case '30d': return 43200;
    default: return 1440;
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  let redis = null;
  try {
    const { interval = '24h', openOnly = false, page = 1, limit = 20 } = await req.json()
    const redisInterval = convertIntervalToMinutes(interval)
    const offset = (page - 1) * limit
    
    console.log(`Processing request - interval: ${interval}, page: ${page}, limit: ${limit}`)

    redis = await connect({
      hostname: Deno.env.get('REDIS_HOST') || '',
      port: parseInt(Deno.env.get('REDIS_PORT') || '6379'),
      password: Deno.env.get('REDIS_PASSWORD'),
      maxRetryCount: 3,
      retryInterval: 1000,
    })

    // Get latest key from Redis
    const latestKey = await redis.get(`topMovers:${redisInterval}:latest`)
    if (!latestKey) {
      console.log(`No data found for ${redisInterval} minute interval`)
      return new Response(
        JSON.stringify({ data: [], hasMore: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get manifest data
    const manifestKey = `topMovers:${redisInterval}:${latestKey}:manifest`
    const manifestData = await redis.get(manifestKey)
    if (!manifestData) {
      console.log('No manifest data found')
      return new Response(
        JSON.stringify({ data: [], hasMore: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const manifest = JSON.parse(manifestData)
    console.log('Manifest loaded:', { chunkCount: manifest.chunks, chunkSize: manifest.chunkSize })

    // Calculate which chunks we need for this page
    const startChunk = Math.floor(offset / manifest.chunkSize)
    const endChunk = Math.min(
      Math.ceil((offset + limit) / manifest.chunkSize),
      manifest.chunks
    )

    console.log(`Fetching chunks ${startChunk} to ${endChunk}`)

    // Fetch only the chunks we need for this page
    const chunkPromises = []
    for (let i = startChunk; i < endChunk; i++) {
      const chunkKey = `topMovers:${redisInterval}:${latestKey}:chunk:${i}`
      chunkPromises.push(redis.get(chunkKey))
    }

    const chunkResults = await Promise.all(chunkPromises)
    let allMarkets = []
    
    // Process chunks efficiently
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

    // Get just the page we need
    const startIndex = offset % manifest.chunkSize
    const paginatedMarkets = allMarkets.slice(startIndex, startIndex + limit)
    const hasMore = allMarkets.length > (startIndex + limit)

    console.log(`Returning ${paginatedMarkets.length} markets`)

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
  } finally {
    if (redis) {
      try {
        await redis.close()
      } catch (err) {
        console.error('Error closing Redis connection:', err)
      }
    }
  }
})