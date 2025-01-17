import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const POLYMARKET_WS_URL = "wss://clob.polymarket.com"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(supabaseUrl, supabaseKey)

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const { headers } = req
  const upgradeHeader = headers.get("upgrade") || ""

  if (upgradeHeader.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket connection", { status: 400 })
  }

  try {
    const { socket: clientSocket, response } = Deno.upgradeWebSocket(req)
    const polySocket = new WebSocket(POLYMARKET_WS_URL)
    console.log("WebSocket connection established")

    polySocket.onopen = () => {
      console.log("Connected to Polymarket WebSocket")
      // Subscribe to the orderbook channel
      const subscribeMsg = {
        "event": "subscribe",
        "feed": "book_ui_1",
        "product_ids": ["*"]  // Subscribe to all markets
      }
      polySocket.send(JSON.stringify(subscribeMsg))
    }

    polySocket.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data)
        console.log("Received data from Polymarket:", data)

        if (data.feed === "book_ui_1_snapshot" || data.feed === "book_ui_1") {
          const marketId = data.product_id
          const timestamp = new Date().toISOString()

          // Process and store orderbook data
          const orderbookData = {
            market_id: marketId,
            bids: data.bids || {},
            asks: data.asks || {},
            best_bid: data.bids?.[0]?.[0] || null,
            best_ask: data.asks?.[0]?.[0] || null,
            spread: (data.asks?.[0]?.[0] || 0) - (data.bids?.[0]?.[0] || 0),
            timestamp
          }

          // Update the orderbook in Supabase
          const { error } = await supabase
            .from('orderbook_data')
            .upsert({
              id: Date.now(),
              ...orderbookData
            })

          if (error) {
            console.error("Error updating orderbook:", error)
          }

          // Forward the processed data to the client
          clientSocket.send(JSON.stringify(orderbookData))
        }
      } catch (error) {
        console.error("Error processing message:", error)
      }
    }

    polySocket.onerror = (error) => {
      console.error("Polymarket WebSocket error:", error)
      clientSocket.send(JSON.stringify({ error: "Polymarket connection error" }))
    }

    clientSocket.onclose = () => {
      console.log("Client disconnected")
      polySocket.close()
    }

    polySocket.onclose = () => {
      console.log("Polymarket connection closed")
      clientSocket.close()
    }

    return response
  } catch (error) {
    console.error("Error setting up WebSocket:", error)
    return new Response(JSON.stringify({ error: "Failed to setup WebSocket connection" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    })
  }
})