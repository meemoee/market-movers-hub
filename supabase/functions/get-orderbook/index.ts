
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

    // Try multiple potential URL formats
    const apiUrls = [
      `https://strapi-matic.poly.market/orderbook/${tokenId}`,
      `https://clob.polymarket.com/${tokenId}/orderbook`,
      `https://clob.polymarket.com/orderbook/${tokenId}`
    ]
    
    let responseData = null
    let lastError = null
    let successUrl = null
    
    // Try each URL until one works
    for (const apiUrl of apiUrls) {
      console.log(`[get-orderbook] Trying API URL: ${apiUrl}`)
      
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
        
        console.log(`[get-orderbook] API response status from ${apiUrl}: ${response.status}`)
        
        if (response.ok) {
          const data = await response.json()
          responseData = data
          successUrl = apiUrl
          console.log(`[get-orderbook] Successfully fetched orderbook from ${apiUrl}`)
          break // Exit the loop if successful
        } else {
          const errorText = await response.text()
          console.error(`[get-orderbook] Polymarket API error from ${apiUrl}: ${response.status}`, errorText)
          lastError = { status: response.status, text: errorText, url: apiUrl }
        }
      } catch (fetchError) {
        clearTimeout(timeoutId)
        
        if (fetchError.name === 'AbortError') {
          console.error(`[get-orderbook] Request timeout for URL: ${apiUrl}`)
          lastError = { message: 'Request timeout', url: apiUrl }
        } else {
          console.error(`[get-orderbook] Fetch error for URL: ${apiUrl}:`, fetchError)
          lastError = { message: fetchError.message, url: apiUrl }
        }
      }
    }
    
    // If we found a working endpoint
    if (responseData) {
      console.log(`[get-orderbook] Successfully fetched orderbook data from ${successUrl}`)
      
      // Return a mock response if the data doesn't match expected format
      // This helps debug the shape of the response
      if (!responseData.bids && !responseData.asks) {
        console.log('[get-orderbook] Returned data does not contain expected fields, returning full response for debugging')
        console.log('[get-orderbook] Response data structure:', Object.keys(responseData))
        
        // Still return the data for debugging but add a flag
        return new Response(
          JSON.stringify({ 
            _debug_info: { 
              message: 'Data structure does not match expected format',
              keys: Object.keys(responseData),
              successful_url: successUrl
            },
            ...responseData 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      return new Response(
        JSON.stringify(responseData),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // If all attempts failed
    console.error('[get-orderbook] All API URL attempts failed')
    
    // Create a fallback mock response for testing purposes
    const mockData = {
      _mock: true,
      _error: lastError,
      bids: { "0.5": 10, "0.4": 20 },
      asks: { "0.6": 5, "0.7": 15 },
      best_bid: 0.5,
      best_ask: 0.6,
      spread: 0.1
    }
    
    return new Response(
      JSON.stringify({ 
        error: 'Failed to fetch orderbook from all attempted endpoints',
        attempted_urls: apiUrls,
        last_error: lastError,
        mock_data: mockData
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
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
