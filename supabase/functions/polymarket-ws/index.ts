
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

const enhancedCorsHeaders = {
  ...corsHeaders,
  'Access-Control-Allow-Private-Network': 'true',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

console.log("Polymarket WebSocket Function v1.7 - Enhanced connection stability");

serve(async (req) => {
  console.log(`Request received: ${req.method} ${req.url}`);
  
  // Always return proper CORS headers for preflight requests
  if (req.method === 'OPTIONS') {
    console.log('Handling CORS preflight request');
    return new Response(null, {
      status: 204,
      headers: enhancedCorsHeaders
    });
  }
  
  // Get URL parameters
  const url = new URL(req.url);
  const assetId = url.searchParams.get('assetId');
  const anonKey = url.searchParams.get('apikey') || req.headers.get('apikey');
  console.log(`URL parameters: assetId=${assetId}, auth present: ${Boolean(anonKey)}`);
  
  // For now, we'll make authentication optional to ensure maximum compatibility
  // This helps isolate whether the issue is auth-related or connection-related
  
  // Check for test info in x-client-info header
  const clientInfo = req.headers.get('x-client-info') || '';
  const isTest = clientInfo.includes('test-mode');
  
  // If this is a test request, return success
  if (isTest) {
    console.log('Test request detected via x-client-info header');
    return new Response(JSON.stringify({ 
      status: "ready",
      message: "Polymarket WebSocket endpoint is active.",
      timestamp: new Date().toISOString()
    }), {
      headers: { ...enhancedCorsHeaders, 'Content-Type': 'application/json' },
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
      headers: { ...enhancedCorsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  }
  
  try {
    console.log('Attempting WebSocket upgrade');
    // Upgrade to WebSocket with minimal configuration
    const { socket, response } = Deno.upgradeWebSocket(req);
    
    // Add CORS headers to WebSocket response
    const responseHeaders = new Headers(response.headers);
    Object.entries(enhancedCorsHeaders).forEach(([key, value]) => {
      responseHeaders.set(key, value);
    });
    
    console.log('WebSocket upgrade successful, setting up event handlers');
    
    // Set up simplified event handlers for maximum compatibility
    socket.onopen = () => {
      console.log("Client WebSocket connection established");
      socket.send(JSON.stringify({
        type: "status",
        status: "connected",
        message: `WebSocket connection established for asset ID: ${assetId || 'not specified'}`,
        timestamp: new Date().toISOString()
      }));
    };
    
    socket.onmessage = (event) => {
      console.log(`Message received: ${event.data}`);
      // Simple echo for now
      socket.send(JSON.stringify({
        type: "echo",
        received: event.data,
        timestamp: new Date().toISOString()
      }));
    };
    
    socket.onerror = (event) => {
      console.error("WebSocket error:", event);
    };
    
    socket.onclose = (event) => {
      console.log(`WebSocket closed: code=${event.code}, reason=${event.reason || "No reason provided"}`);
    };
    
    // Return the response with enhanced headers
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
      headers: { ...enhancedCorsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
