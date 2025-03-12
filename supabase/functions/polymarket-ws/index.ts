
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Get asset ID from URL parameters or request body
  let assetId;
  const url = new URL(req.url);
  
  // Check if assetId is in URL parameters
  assetId = url.searchParams.get('assetId');
  
  // If not in URL, try to get from request body
  if (!assetId) {
    try {
      const body = await req.json();
      assetId = body.assetId || body.tokenId;
    } catch (e) {
      // If body parsing fails, that's okay, we'll check if assetId exists
    }
  }

  if (!assetId) {
    console.error("Asset ID is required but was not provided");
    return new Response(JSON.stringify({ 
      status: "error", 
      message: "Asset ID is required" 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }

  console.log(`Testing Polymarket WebSocket connection for asset ID: ${assetId}`);
  
  // Only handle HTTP requests - just to get initial orderbook data via WS
  return await handleWebSocketSnapshot(assetId);
});

async function handleWebSocketSnapshot(assetId) {
  try {
    console.log(`Connecting to Polymarket WebSocket to get snapshot for asset ID: ${assetId}`);
    
    // Create a Promise that will resolve when we get data or timeout
    const dataPromise = new Promise((resolve, reject) => {
      let resolved = false;
      let orderbook = null;
      
      // Connect to Polymarket WebSocket
      const polySocket = new WebSocket("wss://ws-subscriptions-clob.polymarket.com/ws/market");
      
      // Set a timeout for the WebSocket connection
      const timeout = setTimeout(() => {
        if (!resolved) {
          console.log("WebSocket connection timed out");
          resolved = true;
          polySocket.close();
          reject(new Error("WebSocket connection timed out"));
        }
      }, 10000); // 10 second timeout
      
      polySocket.onopen = () => {
        console.log("Polymarket WebSocket connected, requesting snapshot");
        
        // Subscribe to market data
        const subscription = {
          type: "Market",
          assets_ids: [assetId]
        };
        polySocket.send(JSON.stringify(subscription));
        
        // Request initial snapshot
        const snapshotRequest = {
          type: "GetMarketSnapshot",
          asset_id: assetId
        };
        polySocket.send(JSON.stringify(snapshotRequest));
      };
      
      polySocket.onmessage = (event) => {
        try {
          const data = event.data.toString();
          
          // Handle Polymarket's PONG response
          if (data === "PONG") {
            console.log("Received PONG from Polymarket");
            return;
          }
          
          console.log("Received data from Polymarket WebSocket");
          const parsed = JSON.parse(data);
          
          if (!Array.isArray(parsed) || parsed.length === 0) {
            console.log("Received non-array data:", data);
            return;
          }
          
          // Process the events from Polymarket
          for (const event of parsed) {
            if (event.event_type === "book") {
              console.log("Received orderbook snapshot");
              orderbook = processOrderbookSnapshot(event);
              
              // We got our data, resolve the promise
              if (!resolved) {
                console.log("Successfully processed orderbook snapshot, resolving");
                resolved = true;
                clearTimeout(timeout);
                polySocket.close();
                resolve(orderbook);
              }
              break;
            }
          }
        } catch (err) {
          console.error("Error processing message from Polymarket:", err);
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            polySocket.close();
            reject(err);
          }
        }
      };
      
      polySocket.onerror = (event) => {
        console.error("Polymarket WebSocket error:", event);
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          polySocket.close();
          reject(new Error("WebSocket connection error"));
        }
      };
      
      polySocket.onclose = (event) => {
        console.log(`Polymarket WebSocket closed with code ${event.code}, reason: ${event.reason}`);
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          reject(new Error(`WebSocket closed: ${event.reason}`));
        }
      };
    });
    
    // Wait for the promise to resolve with data or reject with an error
    const orderbook = await dataPromise;
    console.log("Successfully retrieved orderbook data from WebSocket");
    
    return new Response(JSON.stringify({ 
      status: "success", 
      orderbook 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error("Error fetching orderbook data via WebSocket:", err);
    return new Response(JSON.stringify({ 
      status: "error", 
      message: `Error fetching orderbook data: ${err.message}` 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
}

// Process initial orderbook snapshot
function processOrderbookSnapshot(book) {
  console.log("Processing orderbook snapshot");
  
  const orderbook = {
    bids: {},
    asks: {},
    best_bid: null,
    best_ask: null,
    spread: null
  };
  
  // Process bids
  if (Array.isArray(book.bids)) {
    for (const bid of book.bids) {
      if (bid.price && bid.size) {
        const size = parseFloat(bid.size);
        if (size > 0) {
          orderbook.bids[bid.price] = size;
        }
      }
    }
  }
  
  // Process asks
  if (Array.isArray(book.asks)) {
    for (const ask of book.asks) {
      if (ask.price && ask.size) {
        const size = parseFloat(ask.size);
        if (size > 0) {
          orderbook.asks[ask.price] = size;
        }
      }
    }
  }
  
  updateBestPrices(orderbook);
  return orderbook;
}

// Update best prices in the orderbook
function updateBestPrices(orderbook) {
  const bidPrices = Object.keys(orderbook.bids).map(p => parseFloat(p));
  const askPrices = Object.keys(orderbook.asks).map(p => parseFloat(p));
  
  orderbook.best_bid = bidPrices.length > 0 ? Math.max(...bidPrices) : null;
  orderbook.best_ask = askPrices.length > 0 ? Math.min(...askPrices) : null;
  
  if (orderbook.best_bid !== null && orderbook.best_ask !== null) {
    orderbook.spread = orderbook.best_ask - orderbook.best_bid;
  } else {
    orderbook.spread = null;
  }
}
