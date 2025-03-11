
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import WebSocket from "npm:ws@8.13.0";

console.log("Orderbook WebSocket Stream v2.0.0");

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const activeConnections = new Map();

function connectToPolymarket(tokenId: string) {
  if (activeConnections.has(tokenId)) {
    return;
  }

  console.log(`Creating new Polymarket connection for token ${tokenId}`);
  
  const ws = new WebSocket("wss://ws-subscriptions-clob.polymarket.com/ws/market", {
    rejectUnauthorized: false,
    perMessageDeflate: false
  });

  let heartbeatInterval;
  
  ws.on('open', () => {
    console.log(`Connected to Polymarket WS for token ${tokenId}`);
    
    // Subscribe to market data
    ws.send(JSON.stringify({
      type: "Market",
      assets_ids: [tokenId]
    }));
    
    // Request initial snapshot
    ws.send(JSON.stringify({
      type: "GetMarketSnapshot",
      asset_id: tokenId
    }));
    
    // Setup heartbeat
    heartbeatInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "PING" }));
      }
    }, 30000);
  });

  ws.on('message', async (data) => {
    const message = data.toString();
    if (message === "PONG") return;
    
    try {
      const events = JSON.parse(message);
      if (!Array.isArray(events) || events.length === 0) return;
      
      const orderbook = {
        bids: {},
        asks: {},
        best_bid: null,
        best_ask: null,
        spread: null,
        timestamp: new Date().toISOString()
      };
      
      for (const event of events) {
        if (event.event_type === "book") {
          orderbook.bids = {};
          orderbook.asks = {};
          
          event.bids?.forEach(bid => {
            if (bid.price && bid.size) {
              const size = parseFloat(bid.size);
              if (size > 0) {
                orderbook.bids[bid.price] = size;
              }
            }
          });
          
          event.asks?.forEach(ask => {
            if (ask.price && ask.size) {
              const size = parseFloat(ask.size);
              if (size > 0) {
                orderbook.asks[ask.price] = size;
              }
            }
          });
        } else if (event.event_type === "price_change") {
          event.changes.forEach(change => {
            const price = change.price;
            const size = parseFloat(change.size);
            const side = change.side === 'BUY' ? 'bids' : 'asks';
            
            if (size === 0) {
              delete orderbook[side][price];
            } else {
              orderbook[side][price] = size;
            }
          });
        }
      }
      
      // Update best prices
      const bidPrices = Object.keys(orderbook.bids).map(p => parseFloat(p));
      const askPrices = Object.keys(orderbook.asks).map(p => parseFloat(p));
      
      orderbook.best_bid = bidPrices.length > 0 ? Math.max(...bidPrices) : null;
      orderbook.best_ask = askPrices.length > 0 ? Math.min(...askPrices) : null;
      
      // Ensure spread is a string to maintain compatibility with interface
      orderbook.spread = (orderbook.best_bid && orderbook.best_ask) 
        ? (orderbook.best_ask - orderbook.best_bid).toFixed(5) 
        : null;
      
      // Broadcast update via Supabase Realtime
      await supabase.channel(`orderbook:${tokenId}`)
        .send({
          type: 'broadcast',
          event: 'orderbook_update',
          payload: orderbook,
        });

    } catch (error) {
      console.error('Error processing message:', error);
    }
  });

  ws.on('error', (error) => {
    console.error(`Polymarket WebSocket error for token ${tokenId}:`, error);
  });

  ws.on('close', () => {
    console.log(`Polymarket WebSocket closed for token ${tokenId}`);
    clearInterval(heartbeatInterval);
    activeConnections.delete(tokenId);
    
    // Attempt to reconnect after a delay
    setTimeout(() => {
      if (!activeConnections.has(tokenId)) {
        connectToPolymarket(tokenId);
      }
    }, 5000);
  });

  activeConnections.set(tokenId, ws);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
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

    // Ensure we have an active connection for this token
    if (!activeConnections.has(tokenId)) {
      connectToPolymarket(tokenId);
    }

    return new Response(
      JSON.stringify({
        status: "success",
        message: "Connected to orderbook stream",
        tokenId: tokenId,
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );
    
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
