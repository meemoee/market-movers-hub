import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Parse request body
    const { interval = '24h', openOnly = false, page = 1, limit = 20 } = await req.json()
    
    console.log(`Processing request with interval: ${interval}, openOnly: ${openOnly}, page: ${page}, limit: ${limit}`)

    // Calculate time range based on interval
    const now = new Date()
    let startTime = new Date(now)
    switch (interval) {
      case '1h':
        startTime.setHours(now.getHours() - 1)
        break
      case '24h':
        startTime.setDate(now.getDate() - 1)
        break
      case '7d':
        startTime.setDate(now.getDate() - 7)
        break
      case '30d':
        startTime.setDate(now.getDate() - 30)
        break
      default:
        startTime.setDate(now.getDate() - 1) // Default to 24h
    }

    // Get market IDs with price data in the time range
    const { data: marketIds } = await supabase.rpc('get_active_markets_with_prices', {
      start_time: startTime.toISOString(),
      end_time: now.toISOString(),
      limit: limit,
      offset: (page - 1) * limit
    })

    if (!marketIds || marketIds.length === 0) {
      console.log('No market IDs found for the given time range')
      return new Response(
        JSON.stringify({ data: [], hasMore: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get market details and their latest prices
    let query = supabase
      .from('markets')
      .select(`
        *,
        market_prices!inner (
          market_id,
          last_traded_price,
          best_ask,
          best_bid,
          volume,
          timestamp
        )
      `)
      .in('id', marketIds.map(m => m.output_market_id))
      .order('created_at', { ascending: false })

    if (openOnly) {
      query = query.eq('active', true).eq('archived', false)
    }

    const { data: markets, error } = await query

    if (error) {
      console.error('Error fetching markets:', error)
      throw error
    }

    // Process markets to calculate price changes
    const processedMarkets = markets.map(market => {
      const prices = market.market_prices
      const latestPrice = prices[0]

      // Calculate initial values from 24 hours ago
      const initialPrice = prices[prices.length - 1]

      return {
        market_id: market.id,
        question: market.question,
        url: market.url,
        subtitle: market.subtitle,
        yes_sub_title: market.yes_sub_title,
        no_sub_title: market.no_sub_title,
        description: market.description,
        clobtokenids: market.clobtokenids,
        outcomes: market.outcomes,
        active: market.active,
        closed: market.closed,
        archived: market.archived,
        image: market.image,
        event_id: market.event_id,
        final_last_traded_price: latestPrice.last_traded_price,
        final_best_ask: latestPrice.best_ask,
        final_best_bid: latestPrice.best_bid,
        final_volume: latestPrice.volume,
        initial_last_traded_price: initialPrice.last_traded_price,
        initial_volume: initialPrice.volume,
        price_change: latestPrice.last_traded_price - initialPrice.last_traded_price,
        volume_change: latestPrice.volume - initialPrice.volume,
        volume_change_percentage: ((latestPrice.volume - initialPrice.volume) / initialPrice.volume) * 100
      }
    })

    // Check if there are more results
    const { count } = await supabase
      .from('markets')
      .select('*', { count: 'exact', head: true })
      .in('id', marketIds.map(m => m.output_market_id))

    const hasMore = count ? count > page * limit : false

    console.log(`Returning ${processedMarkets.length} markets, hasMore: ${hasMore}`)

    return new Response(
      JSON.stringify({
        data: processedMarkets,
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