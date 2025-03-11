import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

console.log("polymarket-ws function loaded - v5.0.1 (debug version with enhanced error reporting)");

serve(async (req) => {
  // Log request details
  console.log(`Request received: ${req.method} ${req.url}`);
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    console.log("Handling CORS preflight request");
    return new Response(null, { headers: corsHeaders });
  }

  // Get request URL and check for WebSocket upgrade
  const requestUrl = new URL(req.url);
  const upgradeHeader = req.headers.get("upgrade") || "";
  const assetId = requestUrl.searchParams.get('assetId');
  
  console.log(`Asset ID: ${assetId}`);
  console.log(`Upgrade header: ${upgradeHeader}`);

  // Handle HTTP requests (not WebSocket)
  if (upgradeHeader.toLowerCase() !== "websocket") {
    console.log("Non-WebSocket request received, returning status info");
    return new Response(JSON.stringify({ 
      status: "ready",
      message: "Polymarket WebSocket endpoint is active.",
      debug_info: {
        url: req.url,
        method: req.method,
        headers: Object.fromEntries([...req.headers.entries()]),
        asset_id: assetId,
        current_time: new Date().toISOString(),
        upgrade_header: upgradeHeader
      },
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  }

  try {
    console.log("Attempting WebSocket upgrade");

    // Upgrade the connection to WebSocket
    const { socket: clientSocket, response } = Deno.upgradeWebSocket(req);
    console.log("WebSocket upgrade successful");
    
    let polySocket: WebSocket | null = null;
    let pingInterval: number | null = null;
    let connectionAttempts = 0;
    
    // Handle client socket events
    clientSocket.onopen = () => {
      console.log("Client connection established");
      clientSocket.send(JSON.stringify({
        type: "status",
        status: "connected",
        message: "Client WebSocket connected",
        timestamp: new Date().toISOString()
      }));
      
      // Send initial debug information
      clientSocket.send(JSON.stringify({
        type: "debug",
        message: "Connection established successfully",
        request_details: {
          url: req.url,
          headers: Object.fromEntries([...req.headers.entries()]),
          asset_id: assetId
        },
        timestamp: new Date().toISOString()
      }));
      
      // Attempt to connect to Polymarket
      connectToPolymarket();
    };
    
    clientSocket.onclose = (event) => {
      console.log(`Client connection closed: code=${event.code}, reason=${event.reason}`);
      cleanup();
    };
    
    clientSocket.onerror = (event) => {
      console.error("Client connection error", event);
      clientSocket.send(JSON.stringify({
        type: "error",
        message: "WebSocket error occurred",
        timestamp: new Date().toISOString()
      }));
    };
    
    clientSocket.onmessage = (event) => {
      // Echo any received messages back with timestamp for debugging
      console.log(`Message from client: ${event.data}`);
      
      try {
        const data = JSON.parse(event.data);
        
        // Handle ping messages
        if (data.ping) {
          clientSocket.send(JSON.stringify({
            type: "pong",
            message: "Pong response",
            received_at: new Date().toISOString(),
            original_ping: data.ping
          }));
        }
      } catch (err) {
        console.log(`Error parsing client message: ${err.message}`);
        clientSocket.send(JSON.stringify({
          type: "error",
          message: `Could not parse message: ${err.message}`,
          raw_data: event.data,
          timestamp: new Date().toISOString()
        }));
      }
    };
    
    // Connect to Polymarket WebSocket
    const connectToPolymarket = () => {
      connectionAttempts++;
      console.log(`Connecting to Polymarket WebSocket (attempt ${connectionAttempts})`);
      
      clientSocket.send(JSON.stringify({
        type: "status",
        status: "connecting_to_polymarket",
        message: `Connecting to Polymarket (attempt ${connectionAttempts})`,
        timestamp: new Date().toISOString()
      }));
      
      try {
        // Connect to Polymarket
        polySocket = new WebSocket("wss://ws-subscriptions-clob.polymarket.com/ws/market");
        
        polySocket.onopen = () => {
          console.log("Polymarket connection opened successfully");
          
          clientSocket.send(JSON.stringify({
            type: "status",
            status: "polymarket_connected",
            message: "Connected to Polymarket successfully",
            timestamp: new Date().toISOString()
          }));
          
          // Send subscription message
          if (assetId) {
            const subscriptionMsg = JSON.stringify({
              type: "Market",
              assets_ids: [assetId]
            });
            
            console.log(`Sending subscription: ${subscriptionMsg}`);
            polySocket?.send(subscriptionMsg);
            clientSocket.send(JSON.stringify({
              type: "debug",
              message: "Sent subscription to Polymarket",
              data: subscriptionMsg,
              timestamp: new Date().toISOString()
            }));
            
            // Also request initial snapshot
            const snapshotMsg = JSON.stringify({
              type: "GetMarketSnapshot",
              asset_id: assetId
            });
            
            console.log(`Sending snapshot request: ${snapshotMsg}`);
            polySocket?.send(snapshotMsg);
            clientSocket.send(JSON.stringify({
              type: "debug",
              message: "Sent snapshot request to Polymarket",
              data: snapshotMsg,
              timestamp: new Date().toISOString()
            }));
          }
          
          // Setup keep-alive ping
          pingInterval = setInterval(() => {
            if (polySocket && polySocket.readyState === WebSocket.OPEN) {
              polySocket.send("PING");
              console.log("Sent PING to Polymarket");
              clientSocket.send(JSON.stringify({
                type: "debug",
                message: "Sent ping to Polymarket",
                timestamp: new Date().toISOString()
              }));
            }
          }, 30000);
        };
        
        polySocket.onmessage = (event) => {
          console.log(`Raw Polymarket data received: ${event.data}`);
          
          // Forward all raw data to client with timestamp
          clientSocket.send(JSON.stringify({
            type: "polymarket_data",
            raw_data: event.data,
            timestamp: new Date().toISOString()
          }));
        };
        
        polySocket.onerror = (event) => {
          console.error("Polymarket connection error", event);
          clientSocket.send(JSON.stringify({
            type: "error",
            source: "polymarket",
            message: "Polymarket WebSocket error",
            timestamp: new Date().toISOString()
          }));
        };
        
        polySocket.onclose = (event) => {
          console.log(`Polymarket connection closed: code=${event.code}, reason=${event.reason}`);
          
          if (pingInterval) {
            clearInterval(pingInterval);
            pingInterval = null;
          }
          
          clientSocket.send(JSON.stringify({
            type: "status",
            status: "polymarket_disconnected",
            message: `Polymarket connection closed: code=${event.code}, reason=${event.reason}`,
            timestamp: new Date().toISOString()
          }));
          
          // Retry connection if it was closed unexpectedly
          if (connectionAttempts < 3) {
            clientSocket.send(JSON.stringify({
              type: "status",
              status: "reconnecting",
              message: `Attempting to reconnect (${connectionAttempts}/3)`,
              timestamp: new Date().toISOString()
            }));
            
            setTimeout(connectToPolymarket, 2000);
          }
        };
      } catch (err) {
        console.error(`Error connecting to Polymarket: ${err.message}`);
        clientSocket.send(JSON.stringify({
          type: "error",
          message: `Failed to connect to Polymarket: ${err.message}`,
          timestamp: new Date().toISOString()
        }));
      }
    };
    
    // Cleanup function
    const cleanup = () => {
      console.log("Cleaning up connections");
      
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
      }
      
      if (polySocket && polySocket.readyState !== WebSocket.CLOSED) {
        try {
          polySocket.close();
        } catch (err) {
          console.error(`Error closing Polymarket socket: ${err.message}`);
        }
      }
      
      polySocket = null;
    };
    
    // Return the response
    return response;
  } catch (err) {
    console.error(`WebSocket upgrade error: ${err.message}`);
    return new Response(JSON.stringify({ 
      status: "error", 
      message: `WebSocket upgrade failed: ${err.message}`,
      error_details: {
        name: err.name,
        stack: err.stack
      },
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
