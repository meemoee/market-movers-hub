
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { format, subMinutes } from 'https://esm.sh/date-fns@2.30.0'
import { corsHeaders } from '../_shared/cors.ts'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const supabase = createClient(supabaseUrl, supabaseKey)

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { marketId, interval, openOnly = true, page = 1, limit = 20, searchQuery = '', probabilityMin, probabilityMax, priceChangeMin, priceChangeMax, volumeMin, volumeMax, priceVolumeImpactMin, priceVolumeImpactMax, sortBy = 'price_change' } = await req.json()

    console.log('Received request:', {
      marketId,
      interval,
      openOnly,
      page,
      limit,
      searchQuery,
      probabilityMin,
      probabilityMax,
      priceChangeMin,
      priceChangeMax,
      volumeMin,
      volumeMax,
      priceVolumeImpactMin,
      priceVolumeImpactMax,
      sortBy
    })

    const offset = (page - 1) * limit
    const now = new Date()
    const startTime = subMinutes(now, parseInt(interval))
    const formattedStartTime = format(startTime, 'yyyy-MM-dd HH:mm:ss')
    const formattedEndTime = format(now, 'yyyy-MM-dd HH:mm:ss')

    let query = supabase
      .from('markets')
      .select(`
        id:market_id,
        question,
        url,
        subtitle,
        yes_sub_title,
        no_sub_title,
        description,
        clobtokenids,
        outcomes,
        active,
        closed,
        archived,
        image,
        event_id,
        events (
          title
        )
      `)

    if (marketId) {
      // For single market view
      query = query.eq('market_id', marketId)
    } else {
      // For list view with filters
      if (openOnly) {
        query = query.eq('active', true).eq('archived', false)
      }

      if (searchQuery) {
        query = query.ilike('question', `%${searchQuery}%`)
      }
      
      query = query.range(offset, offset + limit - 1)
    }

    const { data: markets, error: marketsError } = await query

    if (marketsError) throw marketsError

    // Get market prices for time range
    const { data: priceData, error: priceError } = await supabase
      .rpc('get_active_markets_with_prices', {
        start_time: formattedStartTime,
        end_time: formattedEndTime,
        p_limit: limit,
        p_offset: offset,
        p_probability_min: probabilityMin,
        p_probability_max: probabilityMax,
        p_price_change_min: priceChangeMin,
        p_price_change_max: priceChangeMax
      })

    if (priceError) throw priceError

    // Combine market details with price data
    const combinedData = markets
      .map(market => {
        const priceInfo = priceData.find(p => p.output_market_id === market.id)
        if (!priceInfo) return null

        const initial_last_traded_price = priceInfo.initial_price
        const final_last_traded_price = priceInfo.final_price
        const price_change = ((final_last_traded_price - initial_last_traded_price) / initial_last_traded_price) * 100

        // Apply volume filters if provided
        if (volumeMin !== undefined && priceInfo.volume < volumeMin) return null
        if (volumeMax !== undefined && priceInfo.volume > volumeMax) return null

        // Calculate price_volume_impact
        const price_volume_impact = price_change * (priceInfo.final_volume - priceInfo.initial_volume)

        // Apply price volume impact filters if provided
        if (priceVolumeImpactMin !== undefined && price_volume_impact < priceVolumeImpactMin) return null
        if (priceVolumeImpactMax !== undefined && price_volume_impact > priceVolumeImpactMax) return null

        return {
          ...market,
          event_title: market.events?.title,
          final_last_traded_price,
          final_best_ask: priceInfo.final_best_ask,
          final_best_bid: priceInfo.final_best_bid,
          final_volume: priceInfo.final_volume,
          initial_last_traded_price,
          initial_volume: priceInfo.initial_volume,
          price_change,
          volume_change: priceInfo.final_volume - priceInfo.initial_volume,
          volume_change_percentage: ((priceInfo.final_volume - priceInfo.initial_volume) / priceInfo.initial_volume) * 100,
          price_volume_impact
        }
      })
      .filter(Boolean)

    // Sort the data
    let sortedData = [...combinedData]
    if (sortBy === 'price_change') {
      sortedData.sort((a, b) => Math.abs(b.price_change) - Math.abs(a.price_change))
    } else if (sortBy === 'volume') {
      sortedData.sort((a, b) => b.volume_change - a.volume_change)
    }

    // Check if there are more results
    const totalCount = combinedData.length
    const hasMore = totalCount === limit

    return new Response(
      JSON.stringify({
        data: sortedData,
        hasMore,
        total: totalCount
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    console.error('Error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
