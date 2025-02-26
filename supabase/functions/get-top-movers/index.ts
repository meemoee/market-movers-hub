
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../_shared/cors.ts'

interface GetTopMoversResponse {
  data: any[];
  hasMore: boolean;
  total?: number;
}

// Calculate minutes ago timestamp
function getTimeAgo(minutes: number) {
  const date = new Date();
  date.setMinutes(date.getMinutes() - minutes);
  return date.toISOString();
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { marketId, interval = '1440', page = 1, limit = 20, openOnly = true, searchQuery = '', probabilityMin, probabilityMax, priceChangeMin, priceChangeMax, volumeMin, volumeMax, sortBy = 'price_change' } = await req.json()

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing env variables')
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get time window
    const endTime = new Date().toISOString()
    const startTime = getTimeAgo(Number(interval))

    // Start building the query
    let query = supabase.rpc('get_active_markets_with_prices', { 
      start_time: startTime,
      end_time: endTime,
      p_limit: limit,
      p_offset: (page - 1) * limit,
      p_probability_min: probabilityMin,
      p_probability_max: probabilityMax,
      p_price_change_min: priceChangeMin,
      p_price_change_max: priceChangeMax
    })

    // If marketId is provided, filter for specific market
    if (marketId) {
      query = query.eq('output_market_id', marketId)
    }
    
    console.log('Fetching top movers for interval:', interval, 'minutes, page:', page, 'limit:', limit, 'openOnly:', openOnly, 'searchQuery:', searchQuery, 'marketId:', marketId, 'probabilityMin:', probabilityMin, 'probabilityMax:', probabilityMax, 'priceChangeMin:', priceChangeMin, 'priceChangeMax:', priceChangeMax, 'volumeMin:', volumeMin, 'volumeMax:', volumeMax, 'sortBy:', sortBy)

    const { data: marketData, error: marketError, count } = await query

    if (marketError) {
      console.error('Error fetching market data:', marketError)
      return new Response(
        JSON.stringify({ error: marketError.message }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    if (!marketData?.length) {
      return new Response(
        JSON.stringify({ data: [], hasMore: false, total: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch full market details for the filtered markets
    const marketIds = marketData.map((m: any) => m.output_market_id)
    
    let marketsQuery = supabase
      .from('markets')
      .select('*')
      .in('id', marketIds)
    
    if (openOnly) {
      marketsQuery = marketsQuery.eq('active', true).eq('archived', false)
    }
    
    if (searchQuery) {
      marketsQuery = marketsQuery.ilike('question', `%${searchQuery}%`)
    }

    const { data: markets, error: marketsError } = await marketsQuery

    if (marketsError) {
      console.error('Error fetching markets:', marketsError)
      return new Response(
        JSON.stringify({ error: marketsError.message }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Combine market data with market details and calculate changes
    const enrichedMarkets = markets?.map(market => {
      const priceData = marketData.find((m: any) => m.output_market_id === market.id)
      const volumeChange = priceData?.volume_change || 0
      const volumeChangePercentage = priceData?.volume_change_percentage || 0
      const priceChange = ((priceData?.final_price - priceData?.initial_price) / priceData?.initial_price) * 100

      return {
        ...market,
        final_last_traded_price: priceData?.final_price,
        final_best_ask: priceData?.final_best_ask,
        final_best_bid: priceData?.final_best_bid,
        final_volume: priceData?.final_volume,
        initial_last_traded_price: priceData?.initial_price,
        initial_volume: priceData?.initial_volume,
        price_change: priceChange,
        volume_change: volumeChange,
        volume_change_percentage: volumeChangePercentage,
        price_volume_impact: Math.abs(priceChange) * Math.abs(volumeChangePercentage)
      }
    }).filter(market => {
      if (!market) return false
      // Apply volume filters if provided
      if (volumeMin !== undefined && market.volume_change < volumeMin) return false
      if (volumeMax !== undefined && market.volume_change > volumeMax) return false
      return true
    }) || []

    // Sort the markets based on the selected criteria
    const sortedMarkets = [...enrichedMarkets].sort((a, b) => {
      switch (sortBy) {
        case 'volume':
          return Math.abs(b.volume_change) - Math.abs(a.volume_change)
        case 'price_volume_impact':
          return b.price_volume_impact - a.price_volume_impact
        case 'price_change':
        default:
          return Math.abs(b.price_change) - Math.abs(a.price_change)
      }
    })

    const response: GetTopMoversResponse = {
      data: sortedMarkets || [],
      hasMore: (page * limit) < (count || 0),
      total: count
    }

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in get-top-movers:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})

