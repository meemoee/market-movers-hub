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

    // Get fresh orderbook
    const response = await fetch(`https://clob.polymarket.com/orderbook/${token_id}`, {
      headers: {
        'Accept': 'application/json'
      }
    })

    if (!response.ok) {
      console.error('Polymarket API error:', response.status)
      const errorText = await response.text()
      console.error('Error details:', errorText)
      throw new Error(`Failed to fetch orderbook: ${response.status}`)
    }

    const book = await response.json()
    console.log('Got orderbook:', book)

    // Verify price against current orderbook
    const bestAsk = Math.min(...book.asks.map((ask: any) => parseFloat(ask.price)))
    const bestBid = Math.max(...book.bids.map((bid: any) => parseFloat(bid.price)))
    const verifiedPrice = side === 'buy' ? bestAsk : bestBid

    console.log('Price verification:', {
      submittedPrice: price,
      verifiedPrice,
      bestAsk,
      bestBid
    })

    if ((side === 'buy' && price < verifiedPrice) || 
        (side === 'sell' && price > verifiedPrice)) {
      throw new Error('Price has moved unfavorably')
    }

    // Execute the order with verified price
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data, error } = await supabaseClient.rpc('execute_market_order', {
      p_user_id: user_id,
      p_market_id: market_id,
      p_token_id: token_id,
      p_outcome: outcome,
      p_side: side,
      p_size: size,
      p_price: verifiedPrice
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
