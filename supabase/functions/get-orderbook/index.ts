
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
    const { tokenId } = await req.json()
    
    if (!tokenId) {
      throw new Error('tokenId is required')
    }

    console.log(`[get-orderbook] Fetching orderbook data for token ID: ${tokenId}`)
    
    // Make sure the tokenId is properly formatted
    const formattedTokenId = tokenId.trim()
    console.log(`[get-orderbook] Formatted token ID: ${formattedTokenId}`)
    
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
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/polymarket-ws?assetId=${tokenId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`
        }
      }
    )
    
    if (!response.ok) {
      throw new Error(`WebSocket fallback failed with status: ${response.status}`)
    }
    
    const data = await response.json()
    console.log(`[get-orderbook] Successfully retrieved data from WebSocket fallback`)
    
    return new Response(
      JSON.stringify(data),
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
