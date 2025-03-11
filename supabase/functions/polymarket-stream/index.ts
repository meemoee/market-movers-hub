
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import WebSocket from "npm:ws@8.13.0";

console.log("Polymarket Stream v1.0.0");

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      }
    });
  }

  try {
    const { tokenId } = await req.json();
    
    if (!tokenId) {
      throw new Error('tokenId is required');
    }

    console.log(`Starting Polymarket stream for token: ${tokenId}`);
    
    const wsUrl = "wss://ws-subscriptions-clob.polymarket.com/ws/market";
    
    // Create a promise that will be resolved with the orderbook data
    const orderBookPromise = new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(wsUrl, {
          rejectUnauthorized: false,
          perMessageDeflate: false
        });
        
        const orderbook = {
          bids: {},
          asks: {},
          best_bid: null,
          best_ask: null,
          spread: null,
          timestamp: null
        };
        
        let timer = setTimeout(() => {
          ws.close();
          resolve({
            status: "timeout",
            message: "Connection timed out after 5 seconds",
            timestamp: new Date().toISOString()
          });
        }, 5000);
        
        ws.on('open', () => {
          console.log('WebSocket connected to Polymarket');
          
          // Subscribe to market data
          const subscription = {
            type: "Market",
            assets_ids: [tokenId]
          };
          ws.send(JSON.stringify(subscription));
          
          // Request initial snapshot
          const snapshotRequest = {
            type: "GetMarketSnapshot",
            asset_id: tokenId
          };
          ws.send(JSON.stringify(snapshotRequest));
        });
        
        ws.on('message', (data) => {
          const message = data.toString();
          if (message === "PONG") return;
          
          try {
            const events = JSON.parse(message);
            if (!Array.isArray(events) || events.length === 0) return;
            
            events.forEach(event => {
              if (event.event_type === "book") {
                // Process orderbook snapshot
                orderbook.bids = {};
                orderbook.asks = {};
                
                if (Array.isArray(event.bids)) {
                  event.bids.forEach(bid => {
                    if (bid.price && bid.size) {
                      const size = parseFloat(bid.size);
                      if (size > 0) {
                        orderbook.bids[bid.price] = size;
                      }
                    }
                  });
                }
                
                if (Array.isArray(event.asks)) {
                  event.asks.forEach(ask => {
                    if (ask.price && ask.size) {
                      const size = parseFloat(ask.size);
                      if (size > 0) {
                        orderbook.asks[ask.price] = size;
                      }
                    }
                  });
                }
                
                updateBestPrices(orderbook);
                clearTimeout(timer);
                ws.close();
                resolve(orderbook);
              }
            });
          } catch (error) {
            console.error('Error processing message:', error);
          }
        });
        
        ws.on('error', (error) => {
          console.error('WebSocket Error:', error);
          clearTimeout(timer);
          reject(new Error(`WebSocket error: ${error.message}`));
        });
        
        ws.on('close', () => {
          console.log('WebSocket connection closed');
          clearTimeout(timer);
        });
        
      } catch (error) {
        console.error('Error establishing WebSocket connection:', error);
        reject(error);
      }
    });
    
    // Helper function to update best prices
    function updateBestPrices(orderbook) {
      const bidPrices = Object.keys(orderbook.bids).map(p => parseFloat(p));
      const askPrices = Object.keys(orderbook.asks).map(p => parseFloat(p));
      
      orderbook.best_bid = bidPrices.length > 0 ? Math.max(...bidPrices) : null;
      orderbook.best_ask = askPrices.length > 0 ? Math.min(...askPrices) : null;
      orderbook.spread = (orderbook.best_bid && orderbook.best_ask) 
        ? (orderbook.best_ask - orderbook.best_bid).toFixed(5) 
        : null;
      orderbook.timestamp = new Date().toISOString();
    }
    
    try {
      const orderBookData = await orderBookPromise;
      console.log('Successfully fetched orderbook data');
      
      return new Response(
        JSON.stringify(orderBookData),
        { 
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json' 
          } 
        }
      );
    } catch (error) {
      console.error('Error fetching orderbook:', error);
      return new Response(
        JSON.stringify({ 
          error: error.message, 
          status: "error",
          timestamp: new Date().toISOString()
        }),
        { 
          status: 500,
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json' 
          }
        }
      );
    }
  } catch (error) {
    console.error('Request error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        }
      }
    );
  }
});

function findOrderbookChanges(oldState, newState) {
  const changes = {
    bids: {},
    asks: {}
  };

  // Check bids
  Object.keys({...oldState.bids, ...newState.bids}).forEach(price => {
    const oldSize = oldState.bids[price] || 0;
    const newSize = newState.bids[price] || 0;
    if (oldSize !== newSize) {
      changes.bids[price] = {
        old: oldSize,
        new: newSize,
        change: newSize - oldSize
      };
    }
  });

  // Check asks
  Object.keys({...oldState.asks, ...newState.asks}).forEach(price => {
    const oldSize = oldState.asks[price] || 0;
    const newSize = newState.asks[price] || 0;
    if (oldSize !== newSize) {
      changes.asks[price] = {
        old: oldSize,
        new: newSize,
        change: newSize - oldSize
      };
    }
  });

  return changes;
}
