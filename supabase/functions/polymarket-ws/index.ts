import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

console.log("Simple polymarket-ws function loaded - v1.0");

serve(async (req) => {
  // Log the request
  console.log(`Request received: ${req.method} ${req.url}`);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  // Get URL parameters
  const url = new URL(req.url);
  
  // If this is a test request, return success
  if (url.searchParams.has('test')) {
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
    // Upgrade to WebSocket
    const { socket, response } = Deno.upgradeWebSocket(req);
    
    // Set up event handlers
    socket.onopen = () => {
      console.log("Client WebSocket connection established");
      
      // Send welcome message
      socket.send(JSON.stringify({
        type: "status",
        status: "connected",
        message: "WebSocket connection established",
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
        
        // Handle ping messages
        if (data.ping) {
          socket.send(JSON.stringify({
            type: "pong",
            received: data.ping,
            timestamp: new Date().toISOString()
          }));
        }
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
