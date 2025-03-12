
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.23.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { tokenId } = await req.json()
    
    if (!tokenId) {
      throw new Error('tokenId is required')
    }

    console.log(`[get-orderbook] Fetching orderbook data for token ID: ${tokenId}`)
    
    // Make sure the tokenId is properly formatted
    const formattedTokenId = tokenId.trim()
    console.log(`[get-orderbook] Formatted token ID: ${formattedTokenId}`)
    
    // First, check if we have data in our database
    const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") as string;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { data: dbOrderbook, error: dbError } = await supabase
      .from('orderbook_data')
      .select('*')
      .eq('market_id', formattedTokenId)
      .single();
    
    if (!dbError && dbOrderbook) {
      console.log(`[get-orderbook] Successfully retrieved orderbook from database for token: ${tokenId}`);
      return new Response(
        JSON.stringify({
          bids: dbOrderbook.bids,
          asks: dbOrderbook.asks,
          best_bid: dbOrderbook.best_bid,
          best_ask: dbOrderbook.best_ask,
          spread: dbOrderbook.spread
        }),
        { 
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json' 
          } 
        }
      );
    }
    
    // If no data in database, try the Polymarket API
    const polymarketUrl = `https://clob.polymarket.com/orderbook/${formattedTokenId}`
    console.log(`[get-orderbook] Requesting from URL: ${polymarketUrl}`)
    
    const response = await fetch(polymarketUrl, {
      headers: {
        'Accept': 'application/json'
      }
    })

    if (!response.ok) {
      console.error(`[get-orderbook] Polymarket API error: ${response.status}`)
      const errorText = await response.text()
      console.error(`[get-orderbook] Error details: ${errorText}`)
      
      // Let's try the alternative WebSocket endpoint as a fallback
      console.log(`[get-orderbook] Attempting to use WebSocket endpoint as fallback`)
      return await fetchFromWebSocketEndpoint(formattedTokenId)
    }

    const book = await response.json()
    console.log(`[get-orderbook] Successfully fetched orderbook for token: ${tokenId}`)
    
    // Store the result in our database for future use
    try {
      const { error: insertError } = await supabase
        .from('orderbook_data')
        .upsert({
          market_id: formattedTokenId,
          timestamp: new Date().toISOString(),
          bids: book.bids || {},
          asks: book.asks || {},
          best_bid: book.best_bid,
          best_ask: book.best_ask,
          spread: book.spread
        }, {
          onConflict: 'market_id'
        });
      
      if (insertError) {
        console.error(`[get-orderbook] Error storing orderbook data:`, insertError);
      }
    } catch (err) {
      console.error(`[get-orderbook] Error in database operation:`, err);
    }
    
    return new Response(
      JSON.stringify(book),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    )

  } catch (error) {
    console.error(`[get-orderbook] Error: ${error.message}`)
    return new Response(
      JSON.stringify({ error: error.message }),
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

// Fallback function to get data from the WebSocket endpoint
async function fetchFromWebSocketEndpoint(tokenId) {
  console.log(`[get-orderbook] Invoking polymarket-ws function for token: ${tokenId}`)
  
  try {
    // This will call our polymarket-ws function as a regular HTTP endpoint
    // (not as a WebSocket) to just get the initial data
    const response = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/polymarket-ws`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`
        },
        body: JSON.stringify({ assetId: tokenId })
      }
    )
    
    if (!response.ok) {
      throw new Error(`WebSocket fallback failed with status: ${response.status}`)
    }
    
    const data = await response.json()
    console.log(`[get-orderbook] Successfully retrieved data from WebSocket fallback`)
    
    return new Response(
      JSON.stringify(data.orderbook || data),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    )
  } catch (error) {
    console.error(`[get-orderbook] WebSocket fallback error: ${error.message}`)
    throw error
  }
}
