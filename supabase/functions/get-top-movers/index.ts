import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
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

    const now = new Date()
    let startTime = new Date(now)
    
    // Calculate start time based on interval
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
        startTime.setDate(now.getDate() - 1)
    }

    console.log('Fetching market data between:', startTime.toISOString(), 'and', now.toISOString())

    // Get ALL market IDs with price changes - removed limit here
    const { data: marketIds, error: marketIdsError } = await supabase.rpc(
      'get_active_markets_with_prices_full',
      {
        start_time: startTime.toISOString(),
        end_time: now.toISOString()
      }
    )

    if (marketIdsError) {
      console.error('Error fetching market IDs:', marketIdsError)
      throw marketIdsError
    }

    if (!marketIds || marketIds.length === 0) {
      console.log('No market IDs found for the given time range')
      return new Response(
        JSON.stringify({ data: [], hasMore: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Retrieved ${marketIds.length} market IDs`)

    // Fetch market details for ALL markets
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

    if (openOnly) {
      query = query.eq('active', true).eq('archived', false)
    }

    const { data: markets, error: marketsError } = await query

    if (marketsError) {
      console.error('Error fetching markets:', marketsError)
      throw marketsError
    }

    console.log(`Retrieved ${markets?.length || 0} markets`)

    // Process ALL markets and sort by absolute price change
    const processedMarkets = markets.map(market => {
      const prices = market.market_prices
      const latestPrice = prices[0]
      const initialPrice = prices[prices.length - 1]

      const priceChange = latestPrice.last_traded_price - initialPrice.last_traded_price
      
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
        price_change: priceChange,
        volume_change: latestPrice.volume - initialPrice.volume,
        volume_change_percentage: ((latestPrice.volume - initialPrice.volume) / initialPrice.volume) * 100
      }
    })
    .filter(market => market.price_change !== null && !isNaN(market.price_change))
    .sort((a, b) => Math.abs(b.price_change) - Math.abs(a.price_change))

    // Apply pagination AFTER sorting
    const startIndex = (page - 1) * limit
    const paginatedMarkets = processedMarkets.slice(startIndex, startIndex + limit)
    const hasMore = processedMarkets.length > startIndex + limit

    console.log(`Returning ${paginatedMarkets.length} processed markets`)

    return new Response(
      JSON.stringify({
        data: paginatedMarkets,
        hasMore
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json'
        } 
      }
    )

  } catch (error) {
    console.error('Error in get-top-movers function:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: error.stack,
        timestamp: new Date().toISOString()
      }),
      { 
        status: 500,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json'
        }
      }
    )
  }
})