import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const supabase = createClient(supabaseUrl, supabaseServiceKey)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { p_user_id, p_market_id, p_token_id, p_outcome, p_side, p_size, p_price, p_total_cost } = await req.json()

    // Start transaction
    const { data: existingHoldings, error: holdingsError } = await supabase
      .from('holdings')
      .select('id, amount, entry_price')
      .eq('user_id', p_user_id)
      .eq('market_id', p_market_id)
      .eq('token_id', p_token_id)
      .single()

    if (holdingsError && holdingsError.code !== 'PGRST116') {
      throw holdingsError
    }

    // Update or create holdings
    if (existingHoldings) {
      const currentAmount = parseFloat(existingHoldings.amount)
      const currentPrice = parseFloat(existingHoldings.entry_price)
      const newAmount = currentAmount + parseFloat(p_size)
      const newPrice = ((currentAmount * currentPrice) + 
        (parseFloat(p_size) * parseFloat(p_price))) / newAmount

      const { error: updateError } = await supabase
        .from('holdings')
        .update({
          amount: newAmount,
          entry_price: newPrice
        })
        .eq('id', existingHoldings.id)

      if (updateError) throw updateError
    } else {
      const { error: insertError } = await supabase
        .from('holdings')
        .insert({
          user_id: p_user_id,
          market_id: p_market_id,
          token_id: p_token_id,
          outcome: p_outcome,
          position: p_side,
          amount: p_size,
          entry_price: p_price
        })

      if (insertError) throw insertError
    }

    // Update user balance
    const { error: balanceError } = await supabase
      .from('profiles')
      .update({
        balance: supabase.sql`balance - ${p_total_cost}::numeric`
      })
      .eq('id', p_user_id)

    if (balanceError) throw balanceError

    // Insert order record
    const { data: orderResult, error: orderError } = await supabase
      .from('orders')
      .insert({
        user_id: p_user_id,
        market_id: p_market_id,
        token_id: p_token_id,
        outcome: p_outcome,
        side: p_side,
        size: p_size,
        price: p_price,
        order_type: 'market',
        status: 'completed'
      })
      .select('id')
      .single()

    if (orderError) throw orderError

    return new Response(
      JSON.stringify({ 
        success: true,
        order_id: orderResult.id
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
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})