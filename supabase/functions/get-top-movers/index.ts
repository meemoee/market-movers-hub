import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { interval = '1440', openOnly = true, page = 1, limit = 20 } = await req.json()
    
    // Create Supabase client using service role key
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Calculate time range
    const endTime = new Date()
    const startTime = new Date(endTime.getTime() - (parseInt(interval) * 60 * 1000))

    // Get markets with price changes
    const { data: markets, error: marketsError } = await supabase
      .rpc('get_active_markets_with_prices', {
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        p_limit: limit,
        p_offset: (page - 1) * limit
      })

    if (marketsError) throw marketsError

    // Get full market details
    const { data: fullMarkets, error: fullMarketsError } = await supabase
      .from('markets')
      .select('*')
      .in('id', markets?.map(m => m.output_market_id) || [])
      .order('created_at', { ascending: false })

    if (fullMarketsError) throw fullMarketsError

    // Combine market data
    const topMovers = fullMarkets?.map(market => {
      const priceData = markets?.find(m => m.output_market_id === market.id)
      return {
        ...market,
        initial_last_traded_price: priceData?.initial_price || 0,
        final_last_traded_price: priceData?.final_price || 0,
        price_change: (priceData?.final_price || 0) - (priceData?.initial_price || 0),
      }
    }) || []

    return new Response(
      JSON.stringify({
        data: topMovers,
        hasMore: topMovers.length === limit
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})