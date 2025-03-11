
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

const enhancedCorsHeaders = {
  ...corsHeaders,
  'Access-Control-Allow-Private-Network': 'true',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, Sec-WebSocket-Protocol'
};

console.log("Polymarket WebSocket Function v1.8 - Fixed upgrade process");

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
  console.log(`URL parameters: assetId=${assetId}`);
  
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
    console.log('Attempting WebSocket upgrade with assetId:', assetId);
    
    // Simplified WebSocket upgrade process
    const { socket, response } = Deno.upgradeWebSocket(req);
    
    // Set up simplified event handlers
    socket.onopen = () => {
      console.log("Client WebSocket connection established");
      socket.send(JSON.stringify({
        type: "connected",
        message: `WebSocket connection established for asset ID: ${assetId || 'not specified'}`,
        timestamp: new Date().toISOString()
      }));
    };
    
    socket.onmessage = (event) => {
      console.log(`Message received: ${event.data}`);
      // Echo for now
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
    
    // Apply CORS headers to the upgrade response
    const headers = new Headers(response.headers);
    Object.entries(enhancedCorsHeaders).forEach(([key, value]) => {
      headers.set(key, value);
    });
    
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
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
