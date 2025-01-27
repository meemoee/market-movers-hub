import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const POLY_API_URL = 'https://clob.polymarket.com'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { user_id, market_id, token_id, outcome, side, size, price } = await req.json()

    // Validate inputs
    if (!user_id || !market_id || !token_id || !outcome || !side || !size || !price) {
      throw new Error('Missing required parameters')
    }

    // Get fresh orderbook snapshot
    const bookResponse = await fetch(`${POLY_API_URL}/book?market=${token_id}`, {
      headers: {
        'Accept': 'application/json'
      }
    })

    if (!bookResponse.ok) {
      throw new Error(`Failed to fetch orderbook: ${bookResponse.status}`)
    }

    const book = await bookResponse.json()

    // Calculate best available price
    const bestAsk = Math.min(...book.asks.map((ask: any) => parseFloat(ask.price)))
    const bestBid = Math.max(...book.bids.map((bid: any) => parseFloat(bid.price)))

    // Price verification
    if (side === 'buy') {
      if (parseFloat(price) < bestAsk) {
        throw new Error('Price has moved unfavorably')
      }
      // Execute at best ask
      price = bestAsk
    } else {
      if (parseFloat(price) > bestBid) {
        throw new Error('Price has moved unfavorably')
      }
      // Execute at best bid
      price = bestBid
    }

    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Execute the order with verified price
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
      throw error
    }

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
