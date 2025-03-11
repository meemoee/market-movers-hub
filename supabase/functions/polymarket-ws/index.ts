
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

console.log("Basic WebSocket Test v1.1.0");

serve(async (req) => {
  // Log all request details for debugging
  console.log("\n=== INCOMING REQUEST ===");
  console.log("Method:", req.method);
  console.log("URL:", req.url);
  console.log("Headers:");
  for (const [key, value] of req.headers.entries()) {
    console.log(`→ ${key}: ${value}`);
  }

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    console.log('Handling CORS preflight request');
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      }
    });
  }

  // Check for WebSocket upgrade request
  const upgradeHeader = req.headers.get("upgrade") || "";
  console.log("\nUpgrade header:", upgradeHeader);

  if (upgradeHeader.toLowerCase() !== "websocket") {
    console.log('Non-WebSocket request - returning test response');
    return new Response(JSON.stringify({
      status: "ready",
      message: "Basic WebSocket test endpoint. Please connect with a WebSocket client.",
      timestamp: new Date().toISOString(),
      headers: Object.fromEntries([...req.headers])
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    console.log('Attempting WebSocket upgrade');
    
    // Basic WebSocket upgrade with protocol
    const { socket, response } = Deno.upgradeWebSocket(req, {
      protocol: "ws",
    });
    
    // Simple event handlers with enhanced logging
    socket.onopen = () => {
      console.log("WebSocket opened");
      socket.send(JSON.stringify({
        type: "connected",
        message: "WebSocket connection established",
        timestamp: new Date().toISOString()
      }));
    };

    socket.onmessage = (event) => {
      console.log("Message received:", event.data);
      // Echo back the message
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

    // Add WebSocket-specific headers to response
    const headers = new Headers(response.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');
    headers.set('Sec-WebSocket-Protocol', 'ws');
    
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  } catch (err) {
    console.error(`WebSocket upgrade error:`, err);
    return new Response(JSON.stringify({
      status: "error",
      message: `WebSocket upgrade failed: ${err.message}`,
      timestamp: new Date().toISOString(),
      stack: err.stack,
      requestInfo: {
        method: req.method,
        url: req.url,
        headers: Object.fromEntries([...req.headers])
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});
