
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  console.log("🔵 get-orderbook function invoked");
  
  if (req.method === 'OPTIONS') {
    console.log("📝 Handling CORS preflight request");
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { tokenId } = await req.json()
    
    if (!tokenId) {
      console.error("⚠️ Missing tokenId parameter");
      throw new Error('tokenId is required')
    }

    console.log(`🔄 Fetching orderbook for token: ${tokenId}`);
    const response = await fetch(`https://clob.polymarket.com/orderbook/${tokenId}`, {
      headers: {
        'Accept': 'application/json'
      }
    })

    if (!response.ok) {
      console.error('❌ Polymarket API error:', response.status);
      const errorText = await response.text();
      console.error('Error details:', errorText);
      throw new Error(`Failed to fetch orderbook: ${response.status}`);
    }

    const book = await response.json();
    console.log('✅ Successfully fetched orderbook for token:', tokenId);
    
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
    console.error('❌ Get orderbook error:', error);
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
