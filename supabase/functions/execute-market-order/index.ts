import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { user_id, market_id, token_id, outcome, size, price } = await req.json()
    console.log('Executing market order:', { user_id, market_id, token_id, outcome, size, price })

    // Verify current orderbook price
    try {
      const orderbookResponse = await fetch(`https://clob.polymarket.com/orderbook/${token_id}`)
      
      if (!orderbookResponse.ok) {
        console.error('Failed to fetch orderbook:', orderbookResponse.status)
        const errorText = await orderbookResponse.text()
        console.error('Error details:', errorText)
        throw new Error('Failed to fetch current orderbook')
      }

      const orderbook = await orderbookResponse.json()
      console.log('Current orderbook:', orderbook)

      // Get best ask price since all orders are buys
      const bestAsk = Math.min(...orderbook.asks.map((ask: any) => parseFloat(ask.price)))
      console.log('Best ask price:', bestAsk)

      // Allow small price difference to account for slight delays
      const PRICE_TOLERANCE = 0.005 // 0.5% tolerance
      const priceIsValid = Math.abs(price - bestAsk) <= PRICE_TOLERANCE

      if (!priceIsValid) {
        console.error('Price validation failed:', { 
          submittedPrice: price, 
          bestAsk, 
          difference: Math.abs(price - bestAsk)
        })
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
        p_side: 'buy', // All orders are buys of their respective outcome
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
      console.error('Error fetching orderbook:', error)
      throw new Error('Failed to fetch current orderbook')
    }

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