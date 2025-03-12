
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.23.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Global WebSocket connections and orderbook state by market ID
const connections = new Map<string, { 
  ws: WebSocket,
  lastData: any,
  lastUpdated: number,
  updateCount: number,
  pendingUpdates: boolean
}>();

// Clean up inactive connections every 5 minutes
setInterval(() => {
  const now = Date.now();
  const inactiveThreshold = 5 * 60 * 1000; // 5 minutes
  
  for (const [assetId, connection] of connections.entries()) {
    if (now - connection.lastUpdated > inactiveThreshold) {
      console.log(`Cleaning up inactive connection for ${assetId}`);
      if (connection.ws.readyState === WebSocket.OPEN) {
        connection.ws.close();
      }
      connections.delete(assetId);
    }
  }
}, 60 * 1000); // Check every minute

// Throttle updates to reduce flickering
function processBookUpdate(assetId: string, bookData: any) {
  const connection = connections.get(assetId);
  if (!connection) return;

  // Debounce updates to reduce UI flickering
  // Only process 1 update per second max
  if (!connection.pendingUpdates) {
    connection.pendingUpdates = true;
    
    setTimeout(() => {
      const conn = connections.get(assetId);
      if (conn) {
        conn.pendingUpdates = false;
        conn.lastData = processOrderbookSnapshot(bookData);
        conn.lastUpdated = Date.now();
        conn.updateCount++;
      }
    }, 300);
  }
}

// Function to initialize WebSocket connection for a specific market
async function initializeWebSocket(assetId: string) {
  // Check if we already have an active connection
  const existingConnection = connections.get(assetId);
  if (existingConnection && existingConnection.ws.readyState === WebSocket.OPEN) {
    console.log(`Using existing WebSocket connection for asset ID: ${assetId}`);
    existingConnection.lastUpdated = Date.now();
    return existingConnection.lastData;
  }

  console.log(`Initializing WebSocket connection for asset ID: ${assetId}`);
  
  try {
    // Create a new connection
    const ws = new WebSocket("wss://ws-subscriptions-clob.polymarket.com/ws/market");
    
    // Store the connection in our map
    const connectionData = {
      ws: ws,
      lastData: null,
      lastUpdated: Date.now(),
      updateCount: 0,
      pendingUpdates: false
    };
    connections.set(assetId, connectionData);
    
    // Set up event handlers
    ws.onopen = () => {
      console.log(`Polymarket WebSocket connected for ${assetId}`);
      
      // Subscribe to market data
      const subscription = {
        type: "Market",
        assets_ids: [assetId]
      };
      ws.send(JSON.stringify(subscription));
      
      // Request initial snapshot
      const snapshotRequest = {
        type: "GetMarketSnapshot",
        asset_id: assetId
      };
      ws.send(JSON.stringify(snapshotRequest));
    };
    
    ws.onmessage = async (event) => {
      try {
        const data = event.data.toString();
        
        // Handle Polymarket's PONG response
        if (data === "PONG") {
          console.log(`Received PONG from Polymarket for ${assetId}`);
          return;
        }
        
        const parsed = JSON.parse(data);
        
        if (!Array.isArray(parsed) || parsed.length === 0) {
          console.log(`Received non-array data for ${assetId}:`, data);
          return;
        }
        
        // Process the events from Polymarket
        for (const event of parsed) {
          if (event.event_type === "book") {
            console.log(`Received orderbook update for ${assetId}`);
            // Process updates with throttling
            processBookUpdate(assetId, event);
            
            // Store in the database less frequently (every 5 updates)
            const conn = connections.get(assetId);
            if (conn && conn.updateCount % 5 === 0 && conn.lastData) {
              await storeOrderbook(assetId, conn.lastData);
            }
          }
        }
      } catch (err) {
        console.error(`Error processing message from Polymarket for ${assetId}:`, err);
      }
    };
    
    ws.onerror = (event) => {
      console.error(`Polymarket WebSocket error for ${assetId}:`, event);
      connections.delete(assetId);
    };
    
    ws.onclose = (event) => {
      console.log(`Polymarket WebSocket closed for ${assetId} with code ${event.code}`);
      connections.delete(assetId);
    };
    
    // Wait for initial data with timeout
    let timeoutId: number;
    const initialData = await Promise.race([
      new Promise<any>((resolve) => {
        const checkInterval = setInterval(() => {
          if (connectionData.lastData) {
            clearInterval(checkInterval);
            clearTimeout(timeoutId);
            resolve(connectionData.lastData);
          }
        }, 100);
      }),
      new Promise<any>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error('Timeout waiting for initial orderbook data'));
        }, 5000);
      })
    ]).catch(error => {
      console.error(`Error getting initial data for ${assetId}:`, error);
      return null;
    });
    
    return initialData;
  } catch (err) {
    console.error(`Error initializing WebSocket for ${assetId}:`, err);
    connections.delete(assetId);
    return null;
  }
}

// Store orderbook in Supabase
async function storeOrderbook(assetId: string, orderbook: any) {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") as string;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { error } = await supabase
      .from('orderbook_data')
      .upsert({
        market_id: assetId,
        timestamp: new Date().toISOString(),
        bids: orderbook.bids,
        asks: orderbook.asks,
        best_bid: orderbook.best_bid,
        best_ask: orderbook.best_ask,
        spread: orderbook.spread
      }, {
        onConflict: 'market_id'
      });
    
    if (error) {
      console.error(`Error storing orderbook data for ${assetId}:`, error);
    } else {
      console.log(`Successfully stored orderbook data for ${assetId}`);
    }
  } catch (err) {
    console.error(`Error in storeOrderbook for ${assetId}:`, err);
  }
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

    console.log(`Processing request for asset ID: ${assetId}`);

    // Look for existing data in the database
    const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") as string;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { data: dbOrderbook, error: dbError } = await supabase
      .from('orderbook_data')
      .select('*')
      .eq('market_id', assetId)
      .single();
    
    if (dbError && dbError.code !== 'PGRST116') {
      console.error(`Error fetching orderbook from DB for ${assetId}:`, dbError);
    }
    
    // If we have recent data in the database (less than 10 seconds old), use that
    if (dbOrderbook) {
      const timestamp = new Date(dbOrderbook.timestamp);
      const now = new Date();
      const age = now.getTime() - timestamp.getTime();
      
      if (age < 10000) { // 10 seconds
        console.log(`Using recent database data for ${assetId} (${age}ms old)`);
        return new Response(JSON.stringify({ 
          status: "success", 
          orderbook: {
            bids: dbOrderbook.bids,
            asks: dbOrderbook.asks,
            best_bid: dbOrderbook.best_bid,
            best_ask: dbOrderbook.best_ask,
            spread: dbOrderbook.spread
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }
    
    // Initialize or get WebSocket connection and fetch live data
    const wsData = await initializeWebSocket(assetId);
    
    // If we got live data from WebSocket, return it
    if (wsData) {
      console.log(`Returning live WebSocket data for ${assetId}`);
      return new Response(JSON.stringify({ 
        status: "success", 
        orderbook: wsData
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // If we didn't get live data but have database data (even if old), return that as fallback
    if (dbOrderbook) {
      console.log(`Returning database data as fallback for ${assetId}`);
      return new Response(JSON.stringify({ 
        status: "success", 
        orderbook: {
          bids: dbOrderbook.bids,
          asks: dbOrderbook.asks,
          best_bid: dbOrderbook.best_bid,
          best_ask: dbOrderbook.best_ask,
          spread: dbOrderbook.spread
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // If we have no data at all, return an error
    return new Response(JSON.stringify({ 
      status: "error", 
      message: "Could not retrieve orderbook data" 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
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

// Process initial orderbook snapshot with more consistent structure
function processOrderbookSnapshot(book: any) {
  console.log("Processing orderbook snapshot");
  
  const orderbook = {
    bids: {},
    asks: {},
    best_bid: null,
    best_ask: null,
    spread: null
  };
  
  // Process bids with validation
  if (Array.isArray(book.bids)) {
    for (const bid of book.bids) {
      if (bid.price && bid.size) {
        const price = parseFloat(bid.price);
        const size = parseFloat(bid.size);
        if (!isNaN(price) && !isNaN(size) && size > 0) {
          orderbook.bids[bid.price] = size;
        }
      }
    }
  }
  
  // Process asks with validation
  if (Array.isArray(book.asks)) {
    for (const ask of book.asks) {
      if (ask.price && ask.size) {
        const price = parseFloat(ask.price);
        const size = parseFloat(ask.size);
        if (!isNaN(price) && !isNaN(size) && size > 0) {
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
