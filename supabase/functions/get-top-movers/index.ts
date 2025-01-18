import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Redis } from 'https://deno.land/x/redis@v0.29.0/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Parse query parameters
    const url = new URL(req.url)
    const interval = url.searchParams.get('interval') || '24h'
    const openOnly = url.searchParams.get('openOnly') === 'true'
    const page = parseInt(url.searchParams.get('page') || '1')
    const limit = parseInt(url.searchParams.get('limit') || '20')

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
      // If no data in Redis, return empty array
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
      JSON.stringify({ error: 'Internal Server Error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})