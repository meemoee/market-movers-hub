
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Log all request details for debugging
  console.log(`[polymarket-ws] ${req.method} request received:`, req.url);

  // Handle preflight CORS
  if (req.method === 'OPTIONS') {
    console.log('[polymarket-ws] Handling OPTIONS request for CORS preflight');
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  // Parse URL and query parameters
  const url = new URL(req.url);
  const assetId = url.searchParams.get('assetId');
  
  console.log('[polymarket-ws] Attempting to connect with assetId:', assetId);
  
  if (!assetId) {
    console.error('[polymarket-ws] Missing assetId parameter');
    return new Response(
      JSON.stringify({ error: 'Missing assetId parameter' }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }

  try {
    // Polymarket WebSocket URL
    const wsTarget = `wss://ws-subscriptions-clob.polymarket.com/ws/market`;
    console.log('[polymarket-ws] Connecting to Polymarket WebSocket:', wsTarget);
    
    // Create WebSocket connection to client
    const { socket, response } = Deno.upgradeWebSocket(req, {
      idleTimeout: 60, // 60 seconds idle timeout
    });
    
    console.log('[polymarket-ws] WebSocket connection with client established');
    
    // Create connection to Polymarket
    const polymarketWs = new WebSocket(wsTarget);
    console.log('[polymarket-ws] Initiated WebSocket connection to Polymarket');
    
    let polymarketConnected = false;
    
    // Handle messages from the client
    socket.onopen = () => {
      console.log('[polymarket-ws] Client connection opened');
    };
    
    socket.onclose = () => {
      console.log('[polymarket-ws] Client connection closed');
      if (polymarketWs.readyState === WebSocket.OPEN) {
        console.log('[polymarket-ws] Closing Polymarket connection');
        polymarketWs.close();
      }
    };
    
    socket.onerror = (e) => {
      console.error('[polymarket-ws] Client connection error:', e);
    };
    
    socket.onmessage = (event) => {
      console.log('[polymarket-ws] Received message from client:', event.data);
      if (polymarketConnected) {
        polymarketWs.send(event.data);
      }
    };
    
    // Handle Polymarket WebSocket events
    polymarketWs.onopen = () => {
      console.log('[polymarket-ws] Connected to Polymarket WebSocket');
      polymarketConnected = true;
      
      // Subscribe to orderbook for the asset
      const subscribeMsg = JSON.stringify({
        type: "subscribe",
        channel: "orderbook",
        assetId: assetId,
      });
      
      console.log('[polymarket-ws] Sending subscription message:', subscribeMsg);
      polymarketWs.send(subscribeMsg);
    };
    
    polymarketWs.onmessage = (event) => {
      try {
        console.log('[polymarket-ws] Received message from Polymarket:', event.data);
        const data = JSON.parse(event.data);
        
        // Process and transform the data if needed
        if (data.type === "orderbook") {
          console.log('[polymarket-ws] Received orderbook data');
          
          // Create structured orderbook response
          const orderbook = {
            bids: data.bids || {},
            asks: data.asks || {},
            best_bid: data.bids ? Math.max(...Object.keys(data.bids).map(Number)) : 0,
            best_ask: data.asks ? Math.min(...Object.keys(data.asks).map(Number)) : 1,
            spread: 0, // Will be calculated below
          };
          
          // Calculate spread
          if (orderbook.best_bid && orderbook.best_ask) {
            orderbook.spread = orderbook.best_ask - orderbook.best_bid;
          }
          
          // Forward the processed data to the client
          socket.send(JSON.stringify({ orderbook }));
        } else {
          // Forward other messages as-is
          socket.send(event.data);
        }
      } catch (e) {
        console.error('[polymarket-ws] Error processing Polymarket message:', e);
        socket.send(JSON.stringify({ error: 'Error processing orderbook data' }));
      }
    };
    
    polymarketWs.onerror = (e) => {
      console.error('[polymarket-ws] Polymarket WebSocket error:', e);
      socket.send(JSON.stringify({ error: 'Error connecting to orderbook service' }));
    };
    
    polymarketWs.onclose = (event) => {
      console.log('[polymarket-ws] Polymarket WebSocket closed with code:', event.code, 'reason:', event.reason);
      polymarketConnected = false;
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ error: 'Orderbook service connection closed' }));
        socket.close();
      }
    };
    
    // Return the WebSocket response
    console.log('[polymarket-ws] Returning upgraded WebSocket response');
    return response;
  } catch (error) {
    console.error('[polymarket-ws] Error handling WebSocket connection:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to establish WebSocket connection' }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
