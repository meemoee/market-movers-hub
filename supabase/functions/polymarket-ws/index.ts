import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

console.log("polymarket-ws function loaded - v2.0.0");

serve(async (req) => {
  const requestUrl = new URL(req.url);
  const upgradeHeader = req.headers.get("upgrade") || "";
  
  console.log(`polymarket-ws received ${req.method} request to ${requestUrl.pathname}${requestUrl.search}`);
  console.log(`Headers: ${JSON.stringify(Object.fromEntries([...req.headers.entries()]))}`);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log("Handling CORS preflight request");
    return new Response(null, { 
      headers: { 
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }

  // Get asset ID from URL parameters
  const assetId = requestUrl.searchParams.get('assetId');

  if (!assetId) {
    console.error("Missing assetId parameter");
    return new Response(JSON.stringify({ status: "error", message: "Asset ID is required" }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }

  // Check if this is a WebSocket upgrade request
  if (upgradeHeader.toLowerCase() !== "websocket") {
    console.log("Request is not a WebSocket upgrade request");
    return new Response(JSON.stringify({ 
      status: "info", 
      message: "Polymarket WebSocket endpoint is active. Connect with a WebSocket client.",
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  }

  console.log(`Attempting WebSocket upgrade for asset ID: ${assetId}`);

  try {
    // Attempt client WebSocket connection upgrade
    const { socket: clientSocket, response } = Deno.upgradeWebSocket(req);
    console.log("WebSocket upgrade successful");
    
    let polySocket: WebSocket | null = null;
    let pingInterval: number | null = null;
    let connected = false;
    
    // Handle client socket events
    clientSocket.onopen = () => {
      console.log("Client WebSocket connected");
      clientSocket.send(JSON.stringify({ 
        status: "connected", 
        message: "Connected to polymarket-ws edge function",
        timestamp: new Date().toISOString()
      }));
      
      // Connect to Polymarket
      connectToPolymarket();
    };
    
    clientSocket.onclose = (event) => {
      console.log(`Client WebSocket closed with code ${event.code}, reason: ${event.reason}`);
      cleanup();
    };
    
    clientSocket.onerror = (event) => {
      console.error("Client WebSocket error:", event);
      cleanup();
    };
    
    clientSocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("Received message from client:", data);
        
        // Handle ping messages
        if (data.ping) {
          clientSocket.send(JSON.stringify({ 
            pong: new Date().toISOString(),
            originalPing: data.ping
          }));
        }
      } catch (err) {
        console.error("Error handling client message:", err);
      }
    };
    
    // Function to connect to Polymarket WebSocket
    const connectToPolymarket = () => {
      try {
        console.log("Connecting to Polymarket WebSocket...");
        
        // Connect to Polymarket WebSocket
        polySocket = new WebSocket("wss://ws-subscriptions-clob.polymarket.com/ws/market");
        
        polySocket.onopen = () => {
          console.log("Polymarket WebSocket connected successfully");
          connected = true;
          
          // Subscribe to market data
          const subscription = {
            type: "Market",
            assets_ids: [assetId]
          };
          
          polySocket.send(JSON.stringify(subscription));
          console.log("Sent subscription:", subscription);
          
          // Request initial snapshot
          const snapshotRequest = {
            type: "GetMarketSnapshot",
            asset_id: assetId
          };
          
          polySocket.send(JSON.stringify(snapshotRequest));
          console.log("Sent snapshot request:", snapshotRequest);
          
          // Setup ping interval to keep connection alive
          pingInterval = setInterval(() => {
            if (polySocket && polySocket.readyState === WebSocket.OPEN) {
              polySocket.send("PING");
              console.log("Sent PING to Polymarket");
            }
          }, 30000);
          
          // Send connection status to client
          clientSocket.send(JSON.stringify({ 
            status: "polymarket_connected",
            message: "Connected to Polymarket WebSocket",
            timestamp: new Date().toISOString()
          }));
        };
        
        polySocket.onmessage = (event) => {
          const rawData = event.data.toString();
          console.log("Raw data from Polymarket:", rawData);
          
          try {
            // Handle Polymarket's PONG response
            if (rawData === "PONG") {
              console.log("Received PONG from Polymarket");
              return;
            }
            
            // Forward raw data to client
            clientSocket.send(JSON.stringify({
              raw_data: rawData,
              timestamp: new Date().toISOString()
            }));
            
            // Try to parse data for logging purposes
            const parsedData = JSON.parse(rawData);
            console.log("Parsed Polymarket data type:", Array.isArray(parsedData) ? "array" : typeof parsedData);
            
            if (Array.isArray(parsedData) && parsedData.length > 0) {
              console.log("First element type:", parsedData[0].event_type || "unknown");
            }
          } catch (err) {
            console.error("Error processing message from Polymarket:", err);
            
            // Still forward unparseable data to client
            clientSocket.send(JSON.stringify({
              raw_data: rawData,
              parsing_error: true,
              timestamp: new Date().toISOString()
            }));
          }
        };
        
        polySocket.onerror = (event) => {
          console.error("Polymarket WebSocket error:", event);
          clientSocket.send(JSON.stringify({ 
            status: "error", 
            message: "Error in Polymarket connection",
            timestamp: new Date().toISOString()
          }));
        };
        
        polySocket.onclose = (event) => {
          console.log(`Polymarket WebSocket closed with code ${event.code}, reason: ${event.reason}`);
          connected = false;
          
          if (pingInterval) {
            clearInterval(pingInterval);
            pingInterval = null;
          }
          
          clientSocket.send(JSON.stringify({ 
            status: "polymarket_disconnected", 
            message: "Disconnected from Polymarket WebSocket",
            code: event.code,
            reason: event.reason,
            timestamp: new Date().toISOString()
          }));
        };
      } catch (err) {
        console.error("Error establishing connection to Polymarket:", err);
        clientSocket.send(JSON.stringify({ 
          status: "error", 
          message: "Failed to connect to Polymarket: " + err.message,
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
      
      if (polySocket && (polySocket.readyState === WebSocket.OPEN || polySocket.readyState === WebSocket.CONNECTING)) {
        try {
          polySocket.close();
        } catch (err) {
          console.error("Error closing Polymarket socket:", err);
        }
      }
      
      polySocket = null;
    };
    
    return response;
  } catch (err) {
    console.error("Error handling WebSocket connection:", err);
    return new Response(JSON.stringify({ 
      status: "error", 
      message: "Failed to establish WebSocket connection: " + err.message,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
