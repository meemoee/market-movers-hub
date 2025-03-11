import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import WebSocket from "npm:ws@8.13.0";

console.log("Orderbook WebSocket Stream v1.0.0");

// Seconds to wait for initial connection before timing out
const CONNECT_TIMEOUT_SECONDS = 5;

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      }
    });
  }

  // Check for WebSocket upgrade request
  const upgradeHeader = req.headers.get("upgrade") || "";
  
  if (upgradeHeader.toLowerCase() !== "websocket") {
    console.log('Non-WebSocket request received');
    return new Response(JSON.stringify({
      status: "error",
      message: "This endpoint requires a WebSocket connection",
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    // Get token ID from the URL search params
    const url = new URL(req.url);
    const tokenId = url.searchParams.get("tokenId");
    
    if (!tokenId) {
      return new Response(JSON.stringify({
        status: "error",
        message: "Missing tokenId parameter",
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`Handling WebSocket upgrade for token ID: ${tokenId}`);
    
    // Upgrade the connection to WebSocket
    const { socket: clientSocket, response } = Deno.upgradeWebSocket(req);
    
    // Connect to Polymarket WebSocket
    const polymarketWs = new WebSocket("wss://ws-subscriptions-clob.polymarket.com/ws/market", {
      rejectUnauthorized: false,
      perMessageDeflate: false
    });
    
    // Track connection state
    let polymarketConnected = false;
    let initialSnapshotReceived = false;
    
    // Set up connection timeout
    const connectionTimeout = setTimeout(() => {
      if (!polymarketConnected || !initialSnapshotReceived) {
        console.log("Connection timeout reached");
        clientSocket.send(JSON.stringify({
          type: "error",
          message: "Connection to Polymarket timed out",
          timestamp: new Date().toISOString()
        }));
        
        // Try to close connections cleanly
        try {
          polymarketWs.close();
          clientSocket.close(1013, "Connection timeout");
        } catch (e) {
          console.error("Error closing connection after timeout:", e);
        }
      }
    }, CONNECT_TIMEOUT_SECONDS * 1000);
    
    // Set up heartbeat to keep connection alive
    let heartbeatInterval;
    
    // Initialize orderbook data
    let orderbook = {
      bids: {},
      asks: {},
      best_bid: null,
      best_ask: null,
      spread: null,
      timestamp: new Date().toISOString()
    };
    
    // Handle client WebSocket events
    clientSocket.onopen = () => {
      console.log("Client connection opened");
    };
    
    clientSocket.onclose = (event) => {
      console.log(`Client connection closed: code=${event.code}, reason=${event.reason || "No reason provided"}`);
      clearInterval(heartbeatInterval);
      clearTimeout(connectionTimeout);
      
      // Close Polymarket connection when client disconnects
      if (polymarketWs.readyState === WebSocket.OPEN) {
        polymarketWs.close();
      }
    };
    
    clientSocket.onerror = (event) => {
      console.error("Client WebSocket error:", event);
      clearInterval(heartbeatInterval);
      clearTimeout(connectionTimeout);
    };
    
    // Handle Polymarket WebSocket events
    polymarketWs.on('open', () => {
      console.log('Connected to Polymarket WebSocket');
      polymarketConnected = true;
      
      // Subscribe to market data
      const subscription = {
        type: "Market",
        assets_ids: [tokenId]
      };
      polymarketWs.send(JSON.stringify(subscription));
      
      // Request initial snapshot
      const snapshotRequest = {
        type: "GetMarketSnapshot",
        asset_id: tokenId
      };
      polymarketWs.send(JSON.stringify(snapshotRequest));
      
      console.log(`Sent subscription and snapshot request for token: ${tokenId}`);
      
      // Set up heartbeat to keep connection alive
      heartbeatInterval = setInterval(() => {
        if (polymarketWs.readyState === WebSocket.OPEN) {
          polymarketWs.send(JSON.stringify({ type: "PING" }));
        }
      }, 30000);
    });
    
    polymarketWs.on('message', (data) => {
      const message = data.toString();
      if (message === "PONG") return;
      
      try {
        const events = JSON.parse(message);
        if (!Array.isArray(events) || events.length === 0) return;
        
        let updatedOrderbook = false;
        
        events.forEach(event => {
          if (event.event_type === "book") {
            // Process orderbook snapshot
            handleOrderbookSnapshot(event);
            initialSnapshotReceived = true;
            updatedOrderbook = true;
            console.log("Received orderbook snapshot");
          } else if (event.event_type === "price_change") {
            handleLevelUpdate(event);
            updatedOrderbook = true;
          }
        });
        
        if (updatedOrderbook) {
          // Send updated orderbook to client
          clientSocket.send(JSON.stringify({
            type: "orderbook_update",
            data: orderbook,
            timestamp: new Date().toISOString()
          }));
        }
      } catch (error) {
        console.error('Error processing message:', error);
      }
    });
    
    polymarketWs.on('error', (error) => {
      console.error('Polymarket WebSocket Error:', error);
      clientSocket.send(JSON.stringify({
        type: "error",
        message: `Polymarket connection error: ${error.message}`,
        timestamp: new Date().toISOString()
      }));
    });
    
    polymarketWs.on('close', (code, reason) => {
      console.log(`Polymarket WebSocket closed: code=${code}, reason=${reason || "No reason provided"}`);
      clearInterval(heartbeatInterval);
      
      clientSocket.send(JSON.stringify({
        type: "disconnected",
        message: `Polymarket connection closed: ${reason || "Connection closed"}`,
        code: code,
        timestamp: new Date().toISOString()
      }));
      
      // Try to close client connection if it's still open
      if (clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.close(1011, "Polymarket connection closed");
      }
    });
    
    // Helper functions for orderbook processing
    function handleOrderbookSnapshot(book) {
      // Reset orderbook for snapshot
      orderbook.bids = {};
      orderbook.asks = {};
      
      // Process bids
      if (Array.isArray(book.bids)) {
        book.bids.forEach(bid => {
          if (bid.price && bid.size) {
            const size = parseFloat(bid.size);
            if (size > 0) {
              orderbook.bids[bid.price] = size;
            }
          }
        });
      }
      
      // Process asks
      if (Array.isArray(book.asks)) {
        book.asks.forEach(ask => {
          if (ask.price && ask.size) {
            const size = parseFloat(ask.size);
            if (size > 0) {
              orderbook.asks[ask.price] = size;
            }
          }
        });
      }
      
      updateBestPrices();
    }
    
    function handleLevelUpdate(event) {
      event.changes.forEach(change => {
        const price = change.price;
        const size = parseFloat(change.size);
        const side = change.side === 'BUY' ? 'bids' : 'asks';
        
        // Update orderbook state
        if (size === 0) {
          delete orderbook[side][price];
        } else {
          orderbook[side][price] = size;
        }
      });
      
      updateBestPrices();
    }
    
    function updateBestPrices() {
      const bidPrices = Object.keys(orderbook.bids).map(p => parseFloat(p));
      const askPrices = Object.keys(orderbook.asks).map(p => parseFloat(p));
      
      orderbook.best_bid = bidPrices.length > 0 ? Math.max(...bidPrices) : null;
      orderbook.best_ask = askPrices.length > 0 ? Math.min(...askPrices) : null;
      orderbook.spread = (orderbook.best_bid && orderbook.best_ask) 
        ? (orderbook.best_ask - orderbook.best_bid).toFixed(5) 
        : null;
      orderbook.timestamp = new Date().toISOString();
    }
    
    // Return the WebSocket response
    const headers = new Headers(response.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');
    
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });

  } catch (err) {
    console.error(`WebSocket upgrade error:`, err);
    return new Response(JSON.stringify({
      status: "error",
      message: `WebSocket upgrade failed: ${err.message}`,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});
