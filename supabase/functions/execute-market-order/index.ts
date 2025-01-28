import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { user_id, market_id, token_id, outcome, side, size, price } = await req.json()
    console.log('Executing market order:', { user_id, market_id, token_id, outcome, side, size, price })

    // Verify current orderbook price
    const orderbookResponse = await fetch(`https://clob.polymarket.com/orderbook/${token_id}`, {
      headers: { 'Accept': 'application/json' }
    })

    if (!orderbookResponse.ok) {
      throw new Error('Failed to fetch current orderbook')
    }

    const orderbook = await orderbookResponse.json()
    console.log('Current orderbook:', orderbook)

    // For a buy order, verify against best ask
    // For a sell order, verify against best bid
    const bestAsk = Math.min(...orderbook.asks.map((ask: any) => parseFloat(ask.price)))
    const bestBid = Math.max(...orderbook.bids.map((bid: any) => parseFloat(bid.price)))

    // Allow small price difference to account for slight delays
    const PRICE_TOLERANCE = 0.005 // 0.5% tolerance
    const priceIsValid = Math.abs(price - (side === 'buy' ? bestAsk : bestBid)) <= PRICE_TOLERANCE

    if (!priceIsValid) {
      throw new Error('Price has moved unfavorably')
    }

    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Execute the order using the database function
    const { data, error } = await supabaseClient.rpc('execute_market_order', {
      p_user_id: user_id,
      p_market_id: market_id,
      p_token_id: token_id,
      p_outcome: outcome,
      p_side: side,
      p_size: size,
      p_price: price
    })

    if (error) {
      console.error('Database error:', error)
      throw error
    }

    console.log('Order executed successfully:', data)

    return new Response(
      JSON.stringify({ success: true, order_id: data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error executing market order:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})