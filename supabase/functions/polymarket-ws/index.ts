import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Define CORS headers for pre-flight requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// This endpoint connects to Polymarket API and forwards the data back to the client
serve(async (req) => {
  console.log("Polymarket WebSocket endpoint called");
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log("Handling OPTIONS preflight request");
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  // Get assetId from URL
  const url = new URL(req.url);
  const assetId = url.searchParams.get('assetId');
  
  if (!assetId) {
    console.error("Missing required assetId parameter");
    return new Response(
      JSON.stringify({ error: "Missing required assetId parameter" }),
      { 
        status: 400, 
        headers: { 
          ...corsHeaders,
          "Content-Type": "application/json" 
        } 
      }
    );
  }

  console.log(`Processing request for assetId: ${assetId}`);

  // Check if this is a WebSocket upgrade request
  const upgradeHeader = req.headers.get("upgrade") || "";
  if (upgradeHeader.toLowerCase() !== "websocket") {
    console.error("Expected WebSocket connection, got regular HTTP request");
    return new Response(
      JSON.stringify({ error: "Expected WebSocket connection" }),
      { 
        status: 400, 
        headers: { 
          ...corsHeaders,
          "Content-Type": "application/json" 
        } 
      }
    );
  }

  try {
    console.log("Upgrading connection to WebSocket");
    
    // Upgrade the connection to a WebSocket
    const { socket: clientSocket, response } = Deno.upgradeWebSocket(req);
    
    // Configure timeout and retry logic
    let polymarketSocket: WebSocket | null = null;
    let isConnected = false;
    let retryCount = 0;
    const MAX_RETRIES = 3;
    
    // Track if client has disconnected to prevent operations on closed sockets
    let clientDisconnected = false;
    
    // Connect to Polymarket WebSocket
    const connectToPolymarket = () => {
      if (clientDisconnected) return;
      
      try {
        console.log(`Connecting to Polymarket WebSocket for assetId: ${assetId}, attempt ${retryCount + 1}`);
        
        // Create WebSocket connection to Polymarket API
        polymarketSocket = new WebSocket(`wss://clob.polymarket.com/ws/orderbook/${assetId}`);
        
        polymarketSocket.onopen = () => {
          console.log(`Polymarket WebSocket connected for assetId: ${assetId}`);
          isConnected = true;
          retryCount = 0;
          
          // Send an initial message to client confirming connection
          if (!clientDisconnected) {
            clientSocket.send(JSON.stringify({ status: "connected" }));
          }
        };
        
        polymarketSocket.onmessage = (event) => {
          try {
            if (clientDisconnected) return;
            
            const data = JSON.parse(event.data);
            console.log(`Received data from Polymarket for assetId: ${assetId}`);
            
            // Forward the message to the client
            if (!clientDisconnected) {
              clientSocket.send(JSON.stringify({ orderbook: data }));
            }
          } catch (parseError) {
            console.error("Error parsing message from Polymarket:", parseError);
            
            // Forward raw data if parsing fails
            if (!clientDisconnected) {
              clientSocket.send(JSON.stringify({ 
                status: "error", 
                message: "Failed to parse data from Polymarket",
                raw: event.data
              }));
            }
          }
        };
        
        polymarketSocket.onerror = (error) => {
          console.error(`Polymarket WebSocket error for assetId: ${assetId}:`, error);
          isConnected = false;
          
          // Notify client of error
          if (!clientDisconnected) {
            clientSocket.send(JSON.stringify({ 
              status: "error", 
              message: "Error in Polymarket WebSocket connection" 
            }));
          }
        };
        
        polymarketSocket.onclose = (event) => {
          console.log(`Polymarket WebSocket closed for assetId: ${assetId} with code: ${event.code}, reason: ${event.reason}`);
          isConnected = false;
          
          // Attempt to reconnect if this wasn't an intentional closure and client is still connected
          if (!clientDisconnected && retryCount < MAX_RETRIES) {
            retryCount++;
            console.log(`Attempting to reconnect (${retryCount}/${MAX_RETRIES})...`);
            
            // Notify client of reconnection attempt
            if (!clientDisconnected) {
              clientSocket.send(JSON.stringify({ 
                status: "reconnecting", 
                attempt: retryCount, 
                maxRetries: MAX_RETRIES 
              }));
            }
            
            setTimeout(connectToPolymarket, 1000 * retryCount); // Exponential backoff
          } else if (!clientDisconnected) {
            // Give up after max retries
            clientSocket.send(JSON.stringify({ 
              status: "failed", 
              message: "Failed to maintain connection to Polymarket after multiple attempts" 
            }));
          }
        };
      } catch (connectionError) {
        console.error(`Error establishing Polymarket WebSocket connection for assetId: ${assetId}:`, connectionError);
        
        // Notify client of connection error
        if (!clientDisconnected) {
          clientSocket.send(JSON.stringify({ 
            status: "error", 
            message: "Failed to connect to Polymarket WebSocket" 
          }));
        }
      }
    };
    
    // Handle client WebSocket events
    clientSocket.onopen = () => {
      console.log(`Client WebSocket connected for assetId: ${assetId}`);
      connectToPolymarket();
    };
    
    clientSocket.onclose = (event) => {
      console.log(`Client WebSocket closed for assetId: ${assetId} with code: ${event.code}, reason: ${event.reason}`);
      clientDisconnected = true;
      
      // Clean up Polymarket connection when client disconnects
      if (polymarketSocket && (polymarketSocket.readyState === WebSocket.OPEN || polymarketSocket.readyState === WebSocket.CONNECTING)) {
        console.log(`Closing Polymarket WebSocket for assetId: ${assetId} due to client disconnect`);
        polymarketSocket.close();
      }
    };
    
    clientSocket.onerror = (error) => {
      console.error(`Client WebSocket error for assetId: ${assetId}:`, error);
      clientDisconnected = true;
    };
    
    // Send custom ping messages to keep the connection alive
    const pingInterval = setInterval(() => {
      if (clientDisconnected) {
        clearInterval(pingInterval);
        return;
      }
      
      if (isConnected && !clientDisconnected) {
        try {
          clientSocket.send(JSON.stringify({ ping: new Date().toISOString() }));
        } catch (e) {
          console.error("Error sending ping to client:", e);
          clearInterval(pingInterval);
        }
      }
    }, 30000); // Send ping every 30 seconds
    
    // Set a handler for the clientSocket onmessage event
    clientSocket.onmessage = (event) => {
      console.log(`Received message from client for assetId: ${assetId}:`, event.data);
      
      // Handle any client messages if needed
      try {
        const message = JSON.parse(event.data);
        
        // Handle client pings with pongs
        if (message.ping) {
          clientSocket.send(JSON.stringify({ pong: message.ping }));
        }
      } catch (e) {
        console.error("Error parsing client message:", e);
      }
    };
    
    // Add headers to the response including CORS headers
    const responseHeaders = new Headers(corsHeaders);
    
    // Return the WebSocket response
    console.log(`WebSocket connection established for assetId: ${assetId}`);
    return response;
    
  } catch (error) {
    console.error("Error handling WebSocket connection:", error);
    return new Response(
      JSON.stringify({ error: "Failed to establish WebSocket connection" }),
      { 
        status: 500, 
        headers: { 
          ...corsHeaders,
          "Content-Type": "application/json" 
        } 
      }
    );
  }
});
