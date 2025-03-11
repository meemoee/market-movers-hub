import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

console.log("Polymarket WebSocket Function v1.2 - Authentication Debug Mode");

serve(async (req) => {
  // Log the request with full details for debugging
  console.log(`Request received: ${req.method} ${req.url}`);
  console.log(`Headers: ${JSON.stringify(Object.fromEntries(req.headers.entries()))}`);
  
  // Check for API key in headers (required by Supabase)
  const apiKey = req.headers.get('apikey') || req.headers.get('authorization');
  if (!apiKey) {
    console.log('ERROR: No apikey or authorization header provided');
    return new Response(JSON.stringify({ 
      status: "error",
      message: "Authentication required. Please provide apikey header.",
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 401,
    });
  }
  
  // Log authentication success
  console.log('Authentication header found');
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  // Get URL parameters
  const url = new URL(req.url);
  const assetId = url.searchParams.get('assetId');
  
  // Log URL parameters
  console.log(`URL parameters: assetId=${assetId}`);
  
  // If this is a test request, return success
  if (url.searchParams.has('test')) {
    console.log('Test request detected, returning success response');
    return new Response(JSON.stringify({ 
      status: "ready",
      message: "Polymarket WebSocket endpoint is active.",
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  }
  
  // Check for WebSocket upgrade
  const upgradeHeader = req.headers.get("upgrade") || "";
  
  // Handle HTTP requests (not WebSocket)
  if (upgradeHeader.toLowerCase() !== "websocket") {
    console.log('Non-WebSocket request detected');
    return new Response(JSON.stringify({ 
      status: "ready",
      message: "This endpoint requires a WebSocket connection.",
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  }
  
  try {
    console.log('Attempting WebSocket upgrade');
    // Upgrade to WebSocket
    const { socket, response } = Deno.upgradeWebSocket(req);
    
    // Set up event handlers
    socket.onopen = () => {
      console.log("Client WebSocket connection established");
      
      // Send welcome message with asset ID
      socket.send(JSON.stringify({
        type: "status",
        status: "connected",
        message: `WebSocket connection established for asset ID: ${assetId || 'not specified'}`,
        timestamp: new Date().toISOString()
      }));
      
      // Setup ping interval to keep connection alive
      const pingInterval = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            type: "ping",
            timestamp: new Date().toISOString()
          }));
        } else {
          clearInterval(pingInterval);
        }
      }, 30000); // Send ping every 30 seconds
      
      // Clean up interval when connection closes
      socket.addEventListener("close", () => {
        clearInterval(pingInterval);
      });
    };
    
    socket.onmessage = (event) => {
      console.log(`Message from client: ${event.data}`);
      
      try {
        // Try to parse the message
        const data = JSON.parse(event.data);
        
        // Echo the message back with a timestamp
        socket.send(JSON.stringify({
          type: "echo",
          received: data,
          timestamp: new Date().toISOString()
        }));
      } catch (err) {
        // If message parsing fails, send an error
        socket.send(JSON.stringify({
          type: "error",
          message: `Error parsing message: ${err.message}`,
          timestamp: new Date().toISOString()
        }));
      }
    };
    
    socket.onerror = (event) => {
      console.error("WebSocket error:", event);
    };
    
    socket.onclose = (event) => {
      console.log(`WebSocket closed: code=${event.code}, reason=${event.reason}`);
    };
    
    return response;
  } catch (err) {
    console.error(`WebSocket upgrade error: ${err.message}`);
    return new Response(JSON.stringify({ 
      status: "error", 
      message: `WebSocket upgrade failed: ${err.message}`,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
