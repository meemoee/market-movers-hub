
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";

// Load environment variables
const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;

// Initialize Supabase client with service role key
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Map to track active WebSocket connections per token ID
const activeConnections = new Map<string, {
  websocket: WebSocket;
  lastUpdateTime: number;
  reconnectTimeout: number | null;
  reconnectAttempts: number;
  pingInterval: number | null;
}>();

// Connect to Polymarket WebSocket for a specific token
async function connectToPolymarket(tokenId: string) {
  console.log(`Connecting to Polymarket WebSocket for token ID: ${tokenId}`);
  
  // Clean up any existing connection
  const existing = activeConnections.get(tokenId);
  if (existing) {
    if (existing.pingInterval) clearInterval(existing.pingInterval);
    if (existing.reconnectTimeout) clearTimeout(existing.reconnectTimeout);
    if (existing.websocket && 
      (existing.websocket.readyState === WebSocket.OPEN || 
       existing.websocket.readyState === WebSocket.CONNECTING)) {
      try {
        existing.websocket.close();
      } catch (err) {
        console.error(`Error closing existing connection for ${tokenId}:`, err);
      }
    }
  }
  
  try {
    // Create new WebSocket connection to Polymarket
    const polySocket = new WebSocket("wss://ws-subscriptions-clob.polymarket.com/ws/market");
    let pingInterval: number | null = null;
    
    polySocket.onopen = () => {
      console.log(`Polymarket WebSocket connected for token: ${tokenId}`);
      
      // Subscribe to market data
      setTimeout(() => {
        if (polySocket.readyState === WebSocket.OPEN) {
          // Subscribe to market data
          const subscription = {
            type: "Market",
            assets_ids: [tokenId]
          };
          polySocket.send(JSON.stringify(subscription));
          
          // Request initial snapshot
          const snapshotRequest = {
            type: "GetMarketSnapshot",
            asset_id: tokenId
          };
          polySocket.send(JSON.stringify(snapshotRequest));
          
          console.log(`Subscribed to market data for token: ${tokenId}`);
        }
      }, 100);
      
      // Setup ping interval to keep connection alive
      pingInterval = setInterval(() => {
        if (polySocket.readyState === WebSocket.OPEN) {
          try {
            polySocket.send("PING");
          } catch (err) {
            console.error(`Error sending ping for ${tokenId}:`, err);
            scheduleReconnect(tokenId);
          }
        } else {
          scheduleReconnect(tokenId);
        }
      }, 30000);
      
      // Update connection tracking
      activeConnections.set(tokenId, {
        websocket: polySocket,
        lastUpdateTime: Date.now(),
        reconnectTimeout: null,
        reconnectAttempts: 0,
        pingInterval
      });
    };
    
    polySocket.onmessage = async (event) => {
      try {
        const data = event.data.toString();
        
        // Handle Polymarket's PONG response
        if (data === "PONG") {
          return;
        }
        
        const parsed = JSON.parse(data);
        
        if (!Array.isArray(parsed) || parsed.length === 0) {
          return;
        }
        
        // Process the events from Polymarket
        let orderbook = null;
        
        for (const event of parsed) {
          if (event.event_type === "book") {
            orderbook = processOrderbookSnapshot(event);
          } else if (event.event_type === "price_change") {
            const connection = activeConnections.get(tokenId);
            if (connection) {
              // Get the most recent orderbook state from the database
              const { data: latestData } = await supabase
                .from('orderbook_data')
                .select('*')
                .eq('market_id', tokenId)
                .order('timestamp', { ascending: false })
                .limit(1);
              
              const latestOrderbook = latestData && latestData.length > 0 ? 
                {
                  bids: latestData[0].bids || {},
                  asks: latestData[0].asks || {},
                  best_bid: latestData[0].best_bid,
                  best_ask: latestData[0].best_ask,
                  spread: latestData[0].spread
                } : null;
              
              orderbook = processLevelUpdate(event, latestOrderbook);
            }
          }
        }
        
        if (orderbook) {
          // Update the connection's last update time
          const connection = activeConnections.get(tokenId);
          if (connection) {
            connection.lastUpdateTime = Date.now();
            activeConnections.set(tokenId, connection);
          }
          
          // Store the orderbook in the database
          const timestamp = new Date().toISOString();
          const { error } = await supabase
            .from('orderbook_data')
            .upsert({
              market_id: tokenId,
              timestamp: timestamp,
              bids: orderbook.bids,
              asks: orderbook.asks,
              best_bid: orderbook.best_bid,
              best_ask: orderbook.best_ask,
              spread: orderbook.spread
            }, {
              onConflict: 'market_id'
            });
            
          if (error) {
            console.error(`Error storing orderbook for ${tokenId}:`, error);
          }
        }
      } catch (err) {
        console.error(`Error processing message for ${tokenId}:`, err);
      }
    };
    
    polySocket.onerror = (event) => {
      console.error(`Polymarket WebSocket error for ${tokenId}:`, event);
      scheduleReconnect(tokenId);
    };
    
    polySocket.onclose = (event) => {
      console.log(`Polymarket WebSocket closed for ${tokenId} with code ${event.code}, reason: ${event.reason}`);
      scheduleReconnect(tokenId);
    };
    
    activeConnections.set(tokenId, {
      websocket: polySocket,
      lastUpdateTime: Date.now(),
      reconnectTimeout: null,
      reconnectAttempts: 0,
      pingInterval
    });
    
  } catch (err) {
    console.error(`Error establishing connection to Polymarket for ${tokenId}:`, err);
    scheduleReconnect(tokenId);
  }
}

// Schedule reconnection attempt
function scheduleReconnect(tokenId: string) {
  const connection = activeConnections.get(tokenId);
  if (!connection) return;
  
  const MAX_RECONNECT_ATTEMPTS = 10;
  
  if (connection.reconnectTimeout) {
    clearTimeout(connection.reconnectTimeout);
  }
  
  if (connection.pingInterval) {
    clearInterval(connection.pingInterval);
  }
  
  connection.reconnectAttempts += 1;
  
  if (connection.reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
    console.log(`Maximum reconnection attempts reached for ${tokenId}`);
    activeConnections.delete(tokenId);
    return;
  }
  
  const backoff = Math.min(1000 * Math.pow(2, connection.reconnectAttempts - 1), 30000);
  
  console.log(`Scheduling reconnection attempt ${connection.reconnectAttempts} for ${tokenId} in ${backoff/1000} seconds`);
  
  const timeoutId = setTimeout(() => {
    connectToPolymarket(tokenId);
  }, backoff);
  
  connection.reconnectTimeout = timeoutId;
  activeConnections.set(tokenId, connection);
}

// Process initial orderbook snapshot
function processOrderbookSnapshot(book: any) {
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

// Process orderbook level updates
function processLevelUpdate(event: any, orderbook: any) {
  if (!orderbook) {
    orderbook = {
      bids: {},
      asks: {},
      best_bid: null,
      best_ask: null,
      spread: null
    };
  }
  
  if (event.changes && Array.isArray(event.changes)) {
    for (const change of event.changes) {
      const price = change.price;
      const size = parseFloat(change.size);
      const side = change.side === 'BUY' ? 'bids' : 'asks';
      
      // Update orderbook state
      if (size === 0) {
        delete orderbook[side][price];
      } else {
        orderbook[side][price] = size;
      }
    }
    
    updateBestPrices(orderbook);
  }
  
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

// Periodic cleanup of stale connections
setInterval(async () => {
  const staleThreshold = Date.now() - 10 * 60 * 1000; // 10 minutes
  
  // Check active subscriptions in the database
  const { data: activeTokens } = await supabase
    .from('orderbook_subscriptions')
    .select('token_id, last_access')
    .gt('last_access', new Date(staleThreshold).toISOString());
  
  const activeTokenIds = new Set(activeTokens?.map(t => t.token_id) || []);
  
  // Clean up connections that are no longer being subscribed to
  for (const [tokenId, connection] of activeConnections.entries()) {
    if (!activeTokenIds.has(tokenId)) {
      console.log(`Cleaning up inactive connection for ${tokenId}`);
      if (connection.pingInterval) clearInterval(connection.pingInterval);
      if (connection.reconnectTimeout) clearTimeout(connection.reconnectTimeout);
      if (connection.websocket) {
        try {
          connection.websocket.close();
        } catch (err) {
          console.error(`Error closing websocket for ${tokenId}:`, err);
        }
      }
      activeConnections.delete(tokenId);
    }
  }
  
  // Ensure connections for all active subscriptions
  for (const tokenId of activeTokenIds) {
    if (!activeConnections.has(tokenId)) {
      connectToPolymarket(tokenId);
    }
  }
}, 60000); // Check every minute

// Setup for handling the table if it doesn't exist
async function ensureOrderbookTable() {
  try {
    // Check if table exists - using the updated function with the new parameter name
    const { data, error } = await supabase.rpc('check_table_exists', { p_table_name: 'orderbook_data' });
    
    if (error) {
      console.error("Error checking if table exists:", error);
      
      // Try to create the table anyway
      await supabase.rpc('create_orderbook_table');
    }
    
    // Enable realtime for orderbook_data table
    await supabase.rpc('enable_realtime_for_table', { table_name: 'orderbook_data' });
    
  } catch (err) {
    console.error("Error ensuring orderbook table exists:", err);
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    // Ensure the orderbook table exists and is set up properly
    await ensureOrderbookTable();
    
    const url = new URL(req.url);
    const path = url.pathname.split('/').pop();
    
    if (path === 'subscribe') {
      const { tokenId } = await req.json();
      
      if (!tokenId) {
        return new Response(
          JSON.stringify({ error: 'Missing token ID' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Record the subscription
      const { error } = await supabase
        .from('orderbook_subscriptions')
        .upsert({
          token_id: tokenId,
          last_access: new Date().toISOString()
        }, {
          onConflict: 'token_id'
        });
      
      if (error) {
        console.error(`Error recording subscription for ${tokenId}:`, error);
        return new Response(
          JSON.stringify({ error: 'Failed to record subscription' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Start connection if not already active
      if (!activeConnections.has(tokenId)) {
        connectToPolymarket(tokenId);
      }
      
      // Return the current orderbook data if available
      const { data } = await supabase
        .from('orderbook_data')
        .select('*')
        .eq('market_id', tokenId)
        .single();
      
      return new Response(
        JSON.stringify({ 
          status: 'subscribed', 
          data: data || null 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } 
    else if (path === 'heartbeat') {
      const { tokenId } = await req.json();
      
      if (!tokenId) {
        return new Response(
          JSON.stringify({ error: 'Missing token ID' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Update the last access time
      const { error } = await supabase
        .from('orderbook_subscriptions')
        .upsert({
          token_id: tokenId,
          last_access: new Date().toISOString()
        }, {
          onConflict: 'token_id'
        });
      
      if (error) {
        console.error(`Error updating heartbeat for ${tokenId}:`, error);
      }
      
      return new Response(
        JSON.stringify({ status: 'ok' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    else if (path === 'unsubscribe') {
      const { tokenId } = await req.json();
      
      if (!tokenId) {
        return new Response(
          JSON.stringify({ error: 'Missing token ID' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Delete the subscription record
      const { error } = await supabase
        .from('orderbook_subscriptions')
        .delete()
        .eq('token_id', tokenId);
      
      if (error) {
        console.error(`Error removing subscription for ${tokenId}:`, error);
      }
      
      return new Response(
        JSON.stringify({ status: 'unsubscribed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    return new Response(
      JSON.stringify({ error: 'Invalid endpoint' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } 
  catch (error) {
    console.error('Error handling request:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
