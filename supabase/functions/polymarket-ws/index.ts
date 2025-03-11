
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

console.log("Polymarket WebSocket Function v1.4 - Updated Headers Support");

serve(async (req) => {
  console.log(`Request received: ${req.method} ${req.url}`);
  
  // Always return proper CORS headers for preflight requests
  if (req.method === 'OPTIONS') {
    console.log('Handling CORS preflight request');
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }
  
  // Get URL parameters
  const url = new URL(req.url);
  const assetId = url.searchParams.get('assetId');
  console.log(`URL parameters: assetId=${assetId}`);
  
  // Check for test parameter in URL or headers
  const isTest = url.searchParams.has('test') || req.headers.get('test') === 'true';
  
  // If this is a test request, return success without authentication check
  if (isTest) {
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
    
    // Add CORS headers to WebSocket response
    const responseHeaders = new Headers(response.headers);
    Object.entries(corsHeaders).forEach(([key, value]) => {
      responseHeaders.set(key, value);
    });
    
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
    
    // Create a new response with CORS headers
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    });
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
