import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface OrderBook {
  bids: { [price: string]: number };
  asks: { [price: string]: number };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const url = new URL(req.url);
  
  // Add a test endpoint
  if (url.pathname.endsWith('/test')) {
    console.log("Test endpoint hit")
    try {
      console.log("Attempting to connect to Polymarket WebSocket...")
      const polymarketWs = new WebSocket("wss://ws-subscriptions-clob.polymarket.com/ws/market")
      
      return new Promise((resolve) => {
        let hasReceivedData = false;

        polymarketWs.onopen = () => {
          console.log("Connected to Polymarket WebSocket successfully")
          
          try {
            // Subscribe to market data
            const subscription = {
              type: "Market",
              assets_ids: ["112079176993929604864779457945097054417527947802930131576938601640669350643880"]
            }
            console.log("Sending subscription message:", JSON.stringify(subscription))
            polymarketWs.send(JSON.stringify(subscription))

            // Request initial snapshot
            const snapshotRequest = {
              type: "GetMarketSnapshot",
              asset_id: "112079176993929604864779457945097054417527947802930131576938601640669350643880"
            }
            console.log("Sending snapshot request:", JSON.stringify(snapshotRequest))
            polymarketWs.send(JSON.stringify(snapshotRequest))
          } catch (error) {
            console.error("Error in onopen handler:", error)
            resolve(new Response(JSON.stringify({ error: "Failed to send initial messages" }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 500
            }))
          }
        }

        polymarketWs.onmessage = (event) => {
          console.log("Received message type:", typeof event.data)
          if (event.data === "PONG") {
            console.log("Received PONG message")
            return
          }
          
          try {
            hasReceivedData = true;
            const data = JSON.parse(event.data)
            console.log("Successfully parsed message data:", JSON.stringify(data))
          } catch (error) {
            console.error("Error parsing message:", error, "Raw message:", event.data)
          }
        }

        polymarketWs.onerror = (error) => {
          console.error("WebSocket error details:", {
            error: error.toString(),
            type: error.type,
            message: error.message,
          })
          resolve(new Response(JSON.stringify({ 
            error: "WebSocket connection failed",
            details: error.toString() 
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500
          }))
        }

        // Resolve after 5 seconds to get some sample data
        setTimeout(() => {
          if (!hasReceivedData) {
            console.log("No data received within timeout period")
          }
          polymarketWs.close()
          resolve(new Response(JSON.stringify({ 
            message: "Test completed, check logs",
            received_data: hasReceivedData 
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          }))
        }, 5000)
      })
    } catch (error) {
      console.error("Critical error in test endpoint:", {
        error: error.toString(),
        stack: error.stack,
        message: error.message
      })
      return new Response(JSON.stringify({ 
        error: error.message,
        details: error.toString(),
        stack: error.stack 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500
      })
    }
  }

  // Original WebSocket upgrade logic
  try {
    console.log("Attempting WebSocket upgrade")
    const { socket: clientSocket, response } = Deno.upgradeWebSocket(req)
    const polymarketWs = new WebSocket("wss://ws-subscriptions-clob.polymarket.com/ws/market")
    
    const currentOrderbook: OrderBook = {
      bids: {},
      asks: {},
    }

    polymarketWs.onopen = () => {
      console.log("Connected to Polymarket WebSocket")
      
      // Subscribe to market data
      const subscription = {
        type: "Market",
        assets_ids: ["112079176993929604864779457945097054417527947802930131576938601640669350643880"]
      }
      polymarketWs.send(JSON.stringify(subscription))

      // Request initial snapshot
      const snapshotRequest = {
        type: "GetMarketSnapshot",
        asset_id: "112079176993929604864779457945097054417527947802930131576938601640669350643880"
      }
      polymarketWs.send(JSON.stringify(snapshotRequest))
    }

  polymarketWs.onmessage = (event) => {
    try {
      if (event.data === "PONG") return

      const events = JSON.parse(event.data)
      if (!Array.isArray(events) || events.length === 0) return

      events.forEach(event => {
        if (event.event_type === "book") {
          // Handle orderbook snapshot
          currentOrderbook.bids = {}
          currentOrderbook.asks = {}

          if (Array.isArray(event.bids)) {
            event.bids.forEach((bid: { price: string; size: string }) => {
              if (bid.price && bid.size) {
                const size = parseFloat(bid.size)
                if (size > 0) {
                  currentOrderbook.bids[bid.price] = size
                }
              }
            })
          }

          if (Array.isArray(event.asks)) {
            event.asks.forEach((ask: { price: string; size: string }) => {
              if (ask.price && ask.size) {
                const size = parseFloat(ask.size)
                if (size > 0) {
                  currentOrderbook.asks[ask.price] = size
                }
              }
            })
          }
        } else if (event.event_type === "price_change") {
          // Handle price changes
          event.changes.forEach((change: { price: string; size: string; side: 'BUY' | 'SELL' }) => {
            const price = change.price
            const size = parseFloat(change.size)
            const side = change.side === 'BUY' ? 'bids' : 'asks'

            if (size === 0) {
              delete currentOrderbook[side][price]
            } else {
              currentOrderbook[side][price] = size
            }
          })
        }

        // Calculate best bid/ask
        const bidPrices = Object.keys(currentOrderbook.bids).map(parseFloat)
        const askPrices = Object.keys(currentOrderbook.asks).map(parseFloat)
        
        const bestBid = bidPrices.length > 0 ? Math.max(...bidPrices) : 0
        const bestAsk = askPrices.length > 0 ? Math.min(...askPrices) : 0
        const spread = bestAsk - bestBid

        // Send updated orderbook to client
        const update = {
          bids: currentOrderbook.bids,
          asks: currentOrderbook.asks,
          best_bid: bestBid,
          best_ask: bestAsk,
          spread: spread,
          timestamp: new Date().toISOString()
        }

        if (clientSocket.readyState === WebSocket.OPEN) {
          clientSocket.send(JSON.stringify(update))
        }
      })
    } catch (error) {
      console.error('Error processing message:', error)
    }
  }

  polymarketWs.onerror = (error) => {
    console.error('Polymarket WebSocket Error:', error)
  }

  polymarketWs.onclose = () => {
    console.log('Polymarket WebSocket Closed')
    if (clientSocket.readyState === WebSocket.OPEN) {
      clientSocket.close()
    }
  }

  clientSocket.onclose = () => {
    console.log('Client WebSocket Closed')
    polymarketWs.close()
  }

  // Set up ping/pong
  const pingInterval = setInterval(() => {
    if (polymarketWs.readyState === WebSocket.OPEN) {
      polymarketWs.send('PING')
    }
  }, 30000)

  clientSocket.onclose = () => {
    clearInterval(pingInterval)
    polymarketWs.close()
  }

    return response
  } catch (error) {
    console.error("Critical error in WebSocket upgrade:", {
      error: error.toString(),
      stack: error.stack,
      message: error.message
    })
    return new Response(JSON.stringify({ 
      error: "Failed to establish WebSocket connection",
      details: error.toString() 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500
    })
  }
})
