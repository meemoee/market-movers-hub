
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders } from "../_shared/cors.ts"

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const requestBody = await req.json()
    const { tokenId, action } = requestBody
    
    console.log(`[get-orderbook] Request received:`, { tokenId, action })
    
    // Handle heartbeat and unsubscribe actions without making API calls
    if (action === 'heartbeat') {
      console.log(`[get-orderbook] Heartbeat received for token: ${tokenId}`)
      return new Response(
        JSON.stringify({ success: true, message: 'Heartbeat received' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    if (action === 'unsubscribe') {
      console.log(`[get-orderbook] Unsubscribe received for token: ${tokenId}`)
      return new Response(
        JSON.stringify({ success: true, message: 'Unsubscribed successfully' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    if (!tokenId) {
      console.error('[get-orderbook] Error: tokenId is required')
      return new Response(
        JSON.stringify({ error: 'tokenId is required' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Log the request
    console.log(`[get-orderbook] Fetching orderbook for token: ${tokenId}`)

    // Construct the Polymarket API URL
    const apiUrl = `https://strapi-matic.poly.market/orderbook/${tokenId}`
    console.log(`[get-orderbook] API URL: ${apiUrl}`)

    // Fetch data from Polymarket API with timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10-second timeout
    
    try {
      const response = await fetch(apiUrl, {
        headers: {
          'Accept': 'application/json'
        },
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      
      console.log(`[get-orderbook] API response status: ${response.status}`)
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error(`[get-orderbook] Polymarket API error: ${response.status}`, errorText)
        
        return new Response(
          JSON.stringify({ 
            error: `Failed to fetch orderbook: ${response.status}`,
            details: errorText,
            url: apiUrl
          }),
          { 
            status: response.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }
      
      const book = await response.json()
      console.log(`[get-orderbook] Successfully fetched orderbook for token: ${tokenId}`)
      
      // Insert or update the orderbook in our database
      // This could be done here if needed
      
      return new Response(
        JSON.stringify(book),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    } catch (fetchError) {
      if (fetchError.name === 'AbortError') {
        console.error(`[get-orderbook] Request timeout for token: ${tokenId}`)
        return new Response(
          JSON.stringify({ error: 'Request timeout', url: apiUrl }),
          { 
            status: 504,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }
      
      throw fetchError
    }
  } catch (error) {
    console.error('[get-orderbook] Unhandled error:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Unknown error occurred',
        stack: Deno.env.get("ENVIRONMENT") === "development" ? error.stack : undefined
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
