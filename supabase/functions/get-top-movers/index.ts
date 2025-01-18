import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { Redis } from "https://deno.land/x/redis@v0.29.0/mod.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const interval = url.searchParams.get('interval') || '24h'
    const openOnly = url.searchParams.get('openOnly') === 'true'
    const page = parseInt(url.searchParams.get('page') || '1')
    const limit = parseInt(url.searchParams.get('limit') || '20')

    console.log(`Fetching top movers with interval: ${interval}, openOnly: ${openOnly}, page: ${page}, limit: ${limit}`)

    // Connect to Redis
    const redis = await Redis.connect({
      hostname: Deno.env.get('REDIS_HOST') || '',
      port: parseInt(Deno.env.get('REDIS_PORT') || '6379'),
      password: Deno.env.get('REDIS_PASSWORD') || '',
    })

    // Get top movers from Redis
    const key = `top_movers:${interval}`
    let topMovers = await redis.get(key)
    
    if (!topMovers) {
      console.log(`No data found in Redis for key: ${key}`)
      return new Response(
        JSON.stringify({ data: [], hasMore: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let movers = JSON.parse(topMovers)

    // Filter for open markets if requested
    if (openOnly) {
      movers = movers.filter((mover: any) => mover.active && !mover.closed && !mover.archived)
    }

    // Calculate pagination
    const start = (page - 1) * limit
    const end = start + limit
    const paginatedMovers = movers.slice(start, end)
    const hasMore = movers.length > end

    await redis.close()

    console.log(`Returning ${paginatedMovers.length} movers, hasMore: ${hasMore}`)

    return new Response(
      JSON.stringify({
        data: paginatedMovers,
        hasMore
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal Server Error', details: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})