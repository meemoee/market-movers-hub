import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Global WebSocket connection and orderbook state
let globalWs: WebSocket | null = null;
let latestOrderbook: any = null;

// Function to initialize WebSocket connection
async function initializeWebSocket(assetId: string) {
  if (globalWs && globalWs.readyState === WebSocket.OPEN) {
    console.log("WebSocket connection already exists");
    return;
  }

  console.log(`Initializing WebSocket connection for asset ID: ${assetId}`);
  
  return new Promise((resolve, reject) => {
    globalWs = new WebSocket("wss://ws-subscriptions-clob.polymarket.com/ws/market");

    globalWs.onopen = () => {
      console.log("Polymarket WebSocket connected");
      
      // Subscribe to market data
      const subscription = {
        type: "Market",
        assets_ids: [assetId]
      };
      globalWs.send(JSON.stringify(subscription));
      
      // Request initial snapshot
      const snapshotRequest = {
        type: "GetMarketSnapshot",
        asset_id: assetId
      };
      globalWs.send(JSON.stringify(snapshotRequest));
    };
    
    globalWs.onmessage = (event) => {
      try {
        const data = event.data.toString();
        
        // Handle Polymarket's PONG response
        if (data === "PONG") {
          console.log("Received PONG from Polymarket");
          return;
        }
        
        const parsed = JSON.parse(data);
        
        if (!Array.isArray(parsed) || parsed.length === 0) {
          console.log("Received non-array data:", data);
          return;
        }
        
        // Process the events from Polymarket
        for (const event of parsed) {
          if (event.event_type === "book") {
            console.log("Received orderbook update");
            latestOrderbook = processOrderbookSnapshot(event);
          }
        }
      } catch (err) {
        console.error("Error processing message from Polymarket:", err);
      }
    };
    
    globalWs.onerror = (event) => {
      console.error("Polymarket WebSocket error:", event);
      reject(new Error("WebSocket connection error"));
    };
    
    globalWs.onclose = (event) => {
      console.log(`Polymarket WebSocket closed with code ${event.code}`);
      globalWs = null;
      latestOrderbook = null;
    };

    // Initial connection is considered successful after a short delay
    setTimeout(() => resolve(true), 1000);
  });
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get asset ID from request body
    const { assetId } = await req.json();
    
    if (!assetId) {
      console.error("Asset ID is required");
      return new Response(JSON.stringify({ 
        status: "error", 
        message: "Asset ID is required" 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // Initialize or ensure WebSocket connection
    if (!globalWs || globalWs.readyState !== WebSocket.OPEN) {
      await initializeWebSocket(assetId);
    }

    // Return the latest orderbook data
    return new Response(JSON.stringify({ 
      status: "success", 
      orderbook: latestOrderbook 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error("Error handling request:", err);
    return new Response(JSON.stringify({ 
      status: "error", 
      message: `Error fetching orderbook data: ${err.message}` 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});

// Process initial orderbook snapshot
function processOrderbookSnapshot(book: any) {
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
function updateBestPrices(orderbook: any) {
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
