
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

console.log("get-top-movers function starting...")

interface RequestData {
  interval: string
  openOnly?: boolean
  page?: number
  limit?: number
  searchQuery?: string
  marketId?: string
  probabilityMin?: number
  probabilityMax?: number
  priceChangeMin?: number
  priceChangeMax?: number
  volumeMin?: number
  volumeMax?: number
  priceVolumeImpactMin?: number
  priceVolumeImpactMax?: number
  sortBy?: 'price_change' | 'volume' | 'price_volume_impact'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    })
  }

  try {
    const { 
      interval, 
      openOnly = true, 
      page = 1, 
      limit = 20,
      searchQuery = '',
      marketId,
      probabilityMin,
      probabilityMax,
      priceChangeMin,
      priceChangeMax,
      volumeMin,
      volumeMax,
      priceVolumeImpactMin,
      priceVolumeImpactMax,
      sortBy = 'price_change'
    } = await req.json() as RequestData

    console.log('Fetching top movers for interval:', interval, 'minutes, page:', page, 'limit:', limit, 'openOnly:', openOnly, 'searchQuery:', searchQuery, 'marketId:', marketId, 'marketIds:', 'probabilityMin:', probabilityMin, 'probabilityMax:', probabilityMax, 'priceChangeMin:', priceChangeMin, 'priceChangeMax:', priceChangeMax, 'volumeMin:', volumeMin, 'volumeMax:', volumeMax, 'sortBy:', sortBy, 'priceVolumeImpactMin:', priceVolumeImpactMin, 'priceVolumeImpactMax:', priceVolumeImpactMax)

    // Convert interval to minutes
    const intervalMinutes = parseInt(interval)
    if (isNaN(intervalMinutes)) {
      throw new Error('Invalid interval')
    }

    const endTime = new Date()
    const startTime = new Date(endTime.getTime() - intervalMinutes * 60 * 1000)

    const response = await fetch(Deno.env.get('SUPABASE_URL') + '/rest/v1/rpc/get_active_markets_with_prices', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': Deno.env.get('SUPABASE_ANON_KEY') || '',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`
      },
      body: JSON.stringify({
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        p_limit: limit * 2, // Fetch more to account for filtering
        p_offset: (page - 1) * limit,
        p_probability_min: probabilityMin !== undefined ? probabilityMin / 100 : undefined,
        p_probability_max: probabilityMax !== undefined ? probabilityMax / 100 : undefined,
        p_price_change_min: priceChangeMin,
        p_price_change_max: priceChangeMax
      })
    })

    const marketPrices = await response.json()

    // Fetch market details
    const marketIds = marketPrices.map((mp: any) => mp.output_market_id)
    if (marketIds.length === 0) {
      return new Response(JSON.stringify({ data: [], hasMore: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const marketsResponse = await fetch(Deno.env.get('SUPABASE_URL') + '/rest/v1/markets?id=in.(' + marketIds.join(',') + ')', {
      headers: {
        'apikey': Deno.env.get('SUPABASE_ANON_KEY') || '',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`
      }
    })

    let markets = await marketsResponse.json()

    // If marketId is provided, filter for that specific market
    if (marketId) {
      markets = markets.filter((m: any) => m.id === marketId)
    }

    // Filter by openOnly if specified
    if (openOnly) {
      markets = markets.filter((m: any) => m.active && !m.closed && !m.archived)
    }

    // Filter by search query if provided
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      markets = markets.filter((m: any) => 
        m.question?.toLowerCase().includes(query) ||
        m.description?.toLowerCase().includes(query)
      )
    }

    // Combine market data with price data
    let allMarkets = markets.map((market: any) => {
      const priceData = marketPrices.find((mp: any) => mp.output_market_id === market.id)
      
      if (!priceData) return null

      const finalPrice = {
        last_traded_price: priceData.final_price,
        volume: 0 // Add actual volume data if available
      }

      const initialPrice = {
        last_traded_price: priceData.initial_price,
        volume: 0 // Add actual volume data if available
      }

      // Calculate metrics
      const price_change = parseFloat(finalPrice.last_traded_price - initialPrice.last_traded_price) || 0
      const volume_change = parseFloat(finalPrice.volume - initialPrice.volume) || 0
      const volume_change_percentage = initialPrice.volume === 0 
        ? (finalPrice.volume === 0 ? 0 : 100)
        : ((finalPrice.volume - initialPrice.volume) / initialPrice.volume) * 100
      const price_volume_impact = price_change * volume_change

      return {
        ...market,
        final_last_traded_price: finalPrice.last_traded_price,
        final_volume: finalPrice.volume,
        initial_last_traded_price: initialPrice.last_traded_price,
        initial_volume: initialPrice.volume,
        price_change,
        volume_change,
        volume_change_percentage,
        price_volume_impact
      }
    }).filter(Boolean)

    // Apply volume filters if they exist
    if (volumeMin !== undefined || volumeMax !== undefined) {
      allMarkets = allMarkets.filter(market => {
        const volume = market.final_volume
        const meetsMin = volumeMin === undefined || volume >= volumeMin
        const meetsMax = volumeMax === undefined || volume <= volumeMax
        return meetsMin && meetsMax
      })
    }

    // Apply price volume impact filters if they exist
    if (priceVolumeImpactMin !== undefined || priceVolumeImpactMax !== undefined) {
      allMarkets = allMarkets.filter(market => {
        const impact = market.price_volume_impact
        const meetsMin = priceVolumeImpactMin === undefined || impact >= priceVolumeImpactMin
        const meetsMax = priceVolumeImpactMax === undefined || impact <= priceVolumeImpactMax
        return meetsMin && meetsMax
      })
    }

    // Sort markets based on the sortBy parameter
    allMarkets.sort((a, b) => {
      if (sortBy === 'volume') {
        return Math.abs(b.volume_change) - Math.abs(a.volume_change)
      } else if (sortBy === 'price_volume_impact') {
        return Math.abs(b.price_volume_impact) - Math.abs(a.price_volume_impact)
      }
      // Default to price_change
      return Math.abs(b.price_change) - Math.abs(a.price_change)
    })

    // Paginate results
    const paginatedMarkets = allMarkets.slice(0, limit)
    const hasMore = allMarkets.length > limit

    return new Response(
      JSON.stringify({
        data: paginatedMarkets,
        hasMore,
        total: allMarkets.length
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      },
    )

  } catch (error) {
    console.error('Error in get-top-movers:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})
