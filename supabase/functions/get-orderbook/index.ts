
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

    // Log the request
    console.log('Fetching orderbook for token:', tokenId)

    // Updated URL for Polymarket API
    const response = await fetch(`https://strapi-matic.poly.market/orderbook/${tokenId}`, {
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
    console.log('Successfully fetched orderbook for token:', tokenId)
    
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
    console.error('Get orderbook error:', error)
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
