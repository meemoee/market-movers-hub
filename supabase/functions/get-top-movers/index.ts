import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
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
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const redis = await connect({
      hostname: Deno.env.get('REDIS_HOST') || '',
      port: parseInt(Deno.env.get('REDIS_PORT') || '6379'),
      password: Deno.env.get('REDIS_PASSWORD'),
    })

    const { interval = '24h', openOnly = false, page = 1, limit = 20 } = await req.json()
    const redisInterval = convertIntervalToMinutes(interval)
    
    console.log(`Processing request with interval: ${interval} (${redisInterval} mins), page: ${page}, limit: ${limit}`)

    // Get latest key from Redis
    const latestKey = await redis.get(`topMovers:${redisInterval}:latest`)
    if (!latestKey) {
      console.log(`No data in Redis for ${redisInterval} minute interval`)
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
      return new Response(
        JSON.stringify({ data: [], hasMore: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const manifest = JSON.parse(manifestData)
    console.log('Manifest Data:', manifest)

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

    // Filter and sort markets
    allMarkets = allMarkets
      .filter(market => market.price_change !== null && market.price_change !== undefined && market.price_change !== 0)
      .sort((a, b) => Math.abs(b.price_change) - Math.abs(a.price_change))

    if (openOnly) {
      allMarkets = allMarkets.filter(market => market.active && !market.archived)
    }

    // Log top 5 movers for debugging
    console.log('\nTop 5 Movers by Absolute Price Change:')
    allMarkets.slice(0, 5).forEach((market, i) => {
      console.log(`\n#${i + 1}:`)
      console.log(`Market: ${market.question}`)
      console.log(`Price Change: ${market.price_change.toFixed(6)}`)
      console.log(`Absolute Change: ${Math.abs(market.price_change).toFixed(6)}`)
      console.log(`Initial Price: ${market.initial_last_traded_price.toFixed(6)}`)
      console.log(`Final Price: ${market.final_last_traded_price.toFixed(6)}`)
    })

    // Important stats for debugging
    console.log('\nImportant Stats:')
    const priceChanges = allMarkets.map(m => Math.abs(m.price_change))
    console.log(`Total markets: ${allMarkets.length}`)
    console.log(`Min abs change: ${Math.min(...priceChanges).toFixed(6)}`)
    console.log(`Max abs change: ${Math.max(...priceChanges).toFixed(6)}`)

    // Paginate results
    const start = (page - 1) * limit
    const paginatedMarkets = allMarkets.slice(start, start + limit)
    const hasMore = start + limit < allMarkets.length

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