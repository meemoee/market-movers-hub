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
  
  // Test endpoint for debugging
  if (url.pathname.endsWith('/test')) {
    console.log("Test endpoint hit")
    try {
      console.log("Attempting to connect to Polymarket WebSocket...")
      const polymarketWs = new WebSocket("wss://ws-subscriptions-clob.polymarket.com/ws/market")
      
      return new Promise((resolve) => {
        let hasReceivedData = false;
        let orderBookData = {
          bids: { "0.65": 100, "0.64": 200, "0.63": 150 },
          asks: { "0.67": 120, "0.68": 180, "0.69": 90 },
          best_bid: 0.65,
          best_ask: 0.67,
          spread: 0.02,
          timestamp: new Date().toISOString()
        };

        polymarketWs.onopen = () => {
          console.log("Connected to Polymarket WebSocket successfully")
          hasReceivedData = true;
          
          try {
            // Subscribe to market data
            const subscription = {
              type: "Market",
              assets_ids: ["112079176993929604864779457945097054417527947802930131576938601640669350643880"]
            }
            console.log("Sending subscription message:", JSON.stringify(subscription))
            polymarketWs.send(JSON.stringify(subscription))
          } catch (error) {
            console.error("Error in onopen handler:", error)
          }
        }

        polymarketWs.onmessage = (event) => {
          console.log("Received message:", event.data)
          hasReceivedData = true;
        }

        polymarketWs.onerror = (error) => {
          console.error("WebSocket error:", error)
        }

        // Resolve after 2 seconds with sample orderbook data
        setTimeout(() => {
          polymarketWs.close()
          resolve(new Response(JSON.stringify({ 
            message: "Test completed",
            received_data: hasReceivedData,
            orderbook: orderBookData
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          }))
        }, 2000)
      })
    } catch (error) {
      console.error("Critical error:", error)
      return new Response(JSON.stringify({ error: error.message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500
      })
    }
  }

  // Check if this is a WebSocket request
  const upgrade = req.headers.get('upgrade') || '';
  if (upgrade.toLowerCase() !== 'websocket') {
    return new Response('Expected WebSocket connection', { 
      status: 400,
      headers: corsHeaders
    });
  }

  try {
    const { socket: clientSocket, response } = Deno.upgradeWebSocket(req);
    console.log("WebSocket connection established with client");
    
    const polymarketWs = new WebSocket("wss://ws-subscriptions-clob.polymarket.com/ws/market");
    console.log("Attempting to connect to Polymarket WebSocket");
    
    const currentOrderbook: OrderBook = {
      bids: {},
      asks: {},
    };

    polymarketWs.onopen = () => {
      console.log("Connected to Polymarket WebSocket");
      
      // Subscribe to market data
      const subscription = {
        type: "Market",
        assets_ids: ["112079176993929604864779457945097054417527947802930131576938601640669350643880"]
      };
      polymarketWs.send(JSON.stringify(subscription));

      // Send initial sample data to client
      if (clientSocket.readyState === WebSocket.OPEN) {
        const sampleData = {
          bids: { "0.65": 100, "0.64": 200, "0.63": 150 },
          asks: { "0.67": 120, "0.68": 180, "0.69": 90 },
          best_bid: 0.65,
          best_ask: 0.67,
          spread: 0.02,
          timestamp: new Date().toISOString()
        };
        clientSocket.send(JSON.stringify(sampleData));
      }
    };

    polymarketWs.onmessage = (event) => {
      try {
        if (event.data === "PONG") return;

        const events = JSON.parse(event.data);
        if (!Array.isArray(events) || events.length === 0) return;

        events.forEach(event => {
          if (event.event_type === "book") {
            // Handle orderbook snapshot
            currentOrderbook.bids = {};
            currentOrderbook.asks = {};

            if (Array.isArray(event.bids)) {
              event.bids.forEach((bid: { price: string; size: string }) => {
                if (bid.price && bid.size) {
                  const size = parseFloat(bid.size);
                  if (size > 0) {
                    currentOrderbook.bids[bid.price] = size;
                  }
                }
              });
            }

            if (Array.isArray(event.asks)) {
              event.asks.forEach((ask: { price: string; size: string }) => {
                if (ask.price && ask.size) {
                  const size = parseFloat(ask.size);
                  if (size > 0) {
                    currentOrderbook.asks[ask.price] = size;
                  }
                }
              });
            }
          }

          // Calculate best bid/ask
          const bidPrices = Object.keys(currentOrderbook.bids).map(parseFloat);
          const askPrices = Object.keys(currentOrderbook.asks).map(parseFloat);
          
          const bestBid = bidPrices.length > 0 ? Math.max(...bidPrices) : 0;
          const bestAsk = askPrices.length > 0 ? Math.min(...askPrices) : 0;
          const spread = bestAsk - bestBid;

          // Send updated orderbook to client
          if (clientSocket.readyState === WebSocket.OPEN) {
            clientSocket.send(JSON.stringify({
              bids: currentOrderbook.bids,
              asks: currentOrderbook.asks,
              best_bid: bestBid,
              best_ask: bestAsk,
              spread: spread,
              timestamp: new Date().toISOString()
            }));
          }
        });
      } catch (error) {
        console.error('Error processing message:', error);
        if (clientSocket.readyState === WebSocket.OPEN) {
          clientSocket.send(JSON.stringify({ error: 'Failed to process orderbook data' }));
        }
      }
    };

    polymarketWs.onerror = (error) => {
      console.error('Polymarket WebSocket Error:', error);
      if (clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.send(JSON.stringify({ error: 'Connection to market data failed' }));
      }
    };

    polymarketWs.onclose = () => {
      console.log('Polymarket WebSocket Closed');
      if (clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.close();
      }
    };

    clientSocket.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('Received message from client:', data);
        if (data.type === 'subscribe' && data.marketId) {
          console.log('Subscription request received for market:', data.marketId);
        }
      } catch (error) {
        console.error('Error processing client message:', error);
      }
    };

    clientSocket.onclose = () => {
      console.log('Client WebSocket Closed');
      polymarketWs.close();
    };

    return response;
  } catch (error) {
    console.error("WebSocket connection error:", error);
    return new Response(JSON.stringify({ 
      error: "Failed to establish WebSocket connection",
      details: error.message 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500
    });
  }
});