import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const POLYMARKET_ORDERBOOK_WS_URL = 'wss://clob.polymarket.com/orderbook-ws/';

serve(async (req) => {
  console.log("Polymarket WS function invoked");

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log("Handling CORS preflight request");
    return new Response(null, { 
      headers: {
        ...corsHeaders,
        'Access-Control-Max-Age': '86400',
      }
    });
  }

  // Check if it's a WebSocket upgrade request
  const upgradeHeader = req.headers.get('upgrade') || '';
  if (upgradeHeader.toLowerCase() !== 'websocket') {
    console.log("Not a WebSocket request, returning 400");
    return new Response('Expected WebSocket connection', { 
      status: 400,
      headers: corsHeaders
    });
  }

  // Parse query parameters to get asset ID
  const url = new URL(req.url);
  const assetId = url.searchParams.get('assetId');

  if (!assetId) {
    console.log("Missing assetId parameter");
    return new Response('Missing assetId parameter', { 
      status: 400,
      headers: corsHeaders
    });
  }

  try {
    console.log(`Setting up WebSocket connection for assetId: ${assetId}`);
    
    // Upgrade the connection to WebSocket
    const { socket: clientSocket, response } = Deno.upgradeWebSocket(req);
    
    // Connect to Polymarket WebSocket
    console.log(`Connecting to Polymarket WebSocket: ${POLYMARKET_ORDERBOOK_WS_URL}`);
    const polymarketSocket = new WebSocket(`${POLYMARKET_ORDERBOOK_WS_URL}`);
    
    let isPolymarketConnected = false;
    let pingIntervalId: number | null = null;
    
    // Handle errors on client socket
    clientSocket.onerror = (error) => {
      console.error(`Client socket error:`, error);
    };
    
    // Handle client socket close
    clientSocket.onclose = (event) => {
      console.log(`Client socket closed with code: ${event.code}, reason: ${event.reason}`);
      
      // Clean up resources
      if (pingIntervalId) {
        clearInterval(pingIntervalId);
        pingIntervalId = null;
      }
      
      if (polymarketSocket.readyState === WebSocket.OPEN) {
        polymarketSocket.close();
      }
    };
    
    // Handle messages from client
    clientSocket.onmessage = (event) => {
      console.log(`Received message from client: ${event.data}`);
      
      try {
        const message = JSON.parse(event.data);
        
        // Handle ping messages from client
        if (message.ping) {
          console.log("Received ping from client, sending pong");
          clientSocket.send(JSON.stringify({ pong: new Date().toISOString() }));
          return;
        }
        
        // Forward other messages to Polymarket if connection is ready
        if (isPolymarketConnected && polymarketSocket.readyState === WebSocket.OPEN) {
          polymarketSocket.send(event.data);
        }
      } catch (error) {
        console.error('Error processing client message:', error);
      }
    };
    
    // Handle Polymarket socket opening
    polymarketSocket.onopen = () => {
      console.log("Connected to Polymarket WebSocket");
      isPolymarketConnected = true;
      
      // Subscribe to orderbook for the asset
      const subscribeMessage = {
        type: "subscribe",
        payload: {
          type: "orderbook",
          asset_id: assetId
        }
      };
      
      console.log(`Subscribing to orderbook for asset: ${assetId}`);
      polymarketSocket.send(JSON.stringify(subscribeMessage));
      
      // Notify client that connection is established
      clientSocket.send(JSON.stringify({ 
        status: "connected",
        message: "Connected to Polymarket WebSocket"
      }));
      
      // Set up ping interval to keep connection alive
      pingIntervalId = setInterval(() => {
        if (clientSocket.readyState === WebSocket.OPEN) {
          console.log("Sending ping to client");
          clientSocket.send(JSON.stringify({ ping: new Date().toISOString() }));
        } else {
          clearInterval(pingIntervalId!);
          pingIntervalId = null;
        }
      }, 30000); // 30 seconds
    };
    
    // Handle messages from Polymarket
    polymarketSocket.onmessage = (event) => {
      try {
        console.log(`Received message from Polymarket`);
        const data = JSON.parse(event.data);
        
        // Process orderbook data
        if (data.type === "data" && data.payload && data.payload.type === "orderbook") {
          const orderbookData = data.payload.data;
          
          // Transform data for client
          const clientData = {
            orderbook: {
              bids: orderbookData.bids || {},
              asks: orderbookData.asks || {},
              best_bid: orderbookData.bestBid || 0,
              best_ask: orderbookData.bestAsk || 0,
              spread: (orderbookData.bestAsk - orderbookData.bestBid) || 0
            }
          };
          
          // Send transformed data to client
          if (clientSocket.readyState === WebSocket.OPEN) {
            clientSocket.send(JSON.stringify(clientData));
          }
        }
      } catch (error) {
        console.error('Error processing Polymarket message:', error);
        
        // Notify client about the error
        if (clientSocket.readyState === WebSocket.OPEN) {
          clientSocket.send(JSON.stringify({ 
            status: "error", 
            message: "Error processing orderbook data" 
          }));
        }
      }
    };
    
    // Handle errors on Polymarket socket
    polymarketSocket.onerror = (error) => {
      console.error(`Polymarket socket error:`, error);
      
      // Notify client about the error
      if (clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.send(JSON.stringify({ 
          status: "error", 
          message: "Error connecting to Polymarket" 
        }));
      }
    };
    
    // Handle Polymarket socket close
    polymarketSocket.onclose = (event) => {
      console.log(`Polymarket socket closed with code: ${event.code}, reason: ${event.reason}`);
      isPolymarketConnected = false;
      
      // Notify client that connection is closed
      if (clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.send(JSON.stringify({ 
          status: "disconnected", 
          message: "Disconnected from Polymarket" 
        }));
        
        // Close client connection as well
        clientSocket.close(1000, "Polymarket connection closed");
      }
    };
    
    // Return the upgraded response
    return response;
  } catch (error) {
    console.error("WebSocket setup error:", error);
    return new Response(`WebSocket setup error: ${error.message}`, { 
      status: 500,
      headers: corsHeaders
    });
  }
});
