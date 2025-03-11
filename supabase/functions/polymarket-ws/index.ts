import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

const enhancedCorsHeaders = {
  ...corsHeaders,
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, Sec-WebSocket-Protocol, Sec-WebSocket-Key, Sec-WebSocket-Version, Sec-WebSocket-Extensions',
  'Access-Control-Allow-Private-Network': 'true',
  'Access-Control-Max-Age': '86400'
};

console.log("Polymarket WebSocket Function v2.0 - Comprehensive debug mode");

serve(async (req) => {
  console.log(`Request received: ${req.method} ${req.url}`);
  console.log("Headers:", JSON.stringify(Object.fromEntries([...req.headers])));
  
  if (req.method === 'OPTIONS') {
    console.log('Handling CORS preflight request');
    return new Response(null, {
      status: 204,
      headers: enhancedCorsHeaders
    });
  }
  
  const url = new URL(req.url);
  const assetId = url.searchParams.get('assetId');
  const protocol = url.searchParams.get('protocol') || 'ws';
  console.log(`URL parameters: assetId=${assetId}, protocol=${protocol}`);
  
  const clientInfo = req.headers.get('x-client-info') || '';
  const isTest = clientInfo.includes('test-mode');
  
  if (isTest) {
    console.log('Test request detected via x-client-info header');
    return new Response(JSON.stringify({ 
      status: "ready",
      message: "Polymarket WebSocket endpoint is active.",
      timestamp: new Date().toISOString(),
      headers: Object.fromEntries([...req.headers]),
      url: req.url
    }), {
      headers: { ...enhancedCorsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  }
  
  const upgradeHeader = req.headers.get("upgrade") || "";
  const connection = req.headers.get("connection") || "";
  const wsKey = req.headers.get("sec-websocket-key") || "";
  const wsVersion = req.headers.get("sec-websocket-version") || "";
  
  console.log(`WebSocket headers: upgrade=${upgradeHeader}, connection=${connection}, key=${wsKey}, version=${wsVersion}`);
  
  if (upgradeHeader.toLowerCase() !== "websocket") {
    console.log('Non-WebSocket request detected - returning HTTP response');
    return new Response(JSON.stringify({ 
      status: "ready",
      message: "This endpoint requires a WebSocket connection.",
      timestamp: new Date().toISOString(),
      headers: Object.fromEntries([...req.headers]),
      url: req.url
    }), {
      headers: { ...enhancedCorsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  }
  
  try {
    console.log('Attempting WebSocket upgrade for assetId:', assetId);
    
    let socket, response;
    
    try {
      console.log("Using standard WebSocket upgrade");
      ({ socket, response } = Deno.upgradeWebSocket(req));
    } catch (err) {
      console.error(`Standard upgrade failed: ${err.message}`);
      
      console.log("Trying WebSocket upgrade with explicit options");
      ({ socket, response } = Deno.upgradeWebSocket(req, {
        protocol,
        idleTimeout: 60,
        compress: false
      }));
    }
    
    socket.onopen = () => {
      console.log("Client WebSocket connection established");
      try {
        socket.send(JSON.stringify({
          type: "connected",
          message: `WebSocket connection established for asset ID: ${assetId || 'not specified'}`,
          timestamp: new Date().toISOString()
        }));
        
        socket.send(JSON.stringify({
          type: "heartbeat",
          timestamp: new Date().toISOString()
        }));
      } catch (err) {
        console.error(`Error in onopen: ${err.message}`);
      }
    };
    
    const heartbeatInterval = setInterval(() => {
      try {
        if (socket.readyState === 1) {
          socket.send(JSON.stringify({
            type: "heartbeat",
            timestamp: new Date().toISOString()
          }));
          console.log("Heartbeat sent");
        }
      } catch (err) {
        console.error(`Heartbeat error: ${err.message}`);
        clearInterval(heartbeatInterval);
      }
    }, 15000);
    
    socket.onmessage = (event) => {
      console.log(`Message received: ${event.data}`);
      try {
        const data = JSON.parse(event.data);
        
        socket.send(JSON.stringify({
          type: "echo",
          received: data,
          assetId: assetId,
          timestamp: new Date().toISOString(),
          serverInfo: {
            denoVersion: Deno.version.deno,
            v8Version: Deno.version.v8,
            tsVersion: Deno.version.typescript,
          }
        }));
      } catch (err) {
        console.error(`Error processing message: ${err.message}`);
        socket.send(JSON.stringify({
          type: "error",
          message: `Error processing message: ${err.message}`,
          originalData: event.data,
          timestamp: new Date().toISOString()
        }));
      }
    };
    
    socket.onerror = (event) => {
      console.error("WebSocket error:", event);
      try {
        if (socket.readyState === 1) {
          socket.send(JSON.stringify({
            type: "error_event",
            message: "An error occurred with the WebSocket connection",
            timestamp: new Date().toISOString()
          }));
        }
      } catch (e) {
        console.error("Could not send error message:", e);
      }
      
      clearInterval(heartbeatInterval);
    };
    
    socket.onclose = (event) => {
      console.log(`WebSocket closed: code=${event.code}, reason=${event.reason || "No reason provided"}`);
      clearInterval(heartbeatInterval);
    };
    
    const headers = new Headers(response.headers);
    Object.entries(enhancedCorsHeaders).forEach(([key, value]) => {
      headers.set(key, value);
    });
    
    console.log("WebSocket upgrade successful, returning response");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  } catch (err) {
    console.error(`WebSocket upgrade error: ${err.message}, stack: ${err.stack}`);
    return new Response(JSON.stringify({ 
      status: "error", 
      message: `WebSocket upgrade failed: ${err.message}`,
      stack: err.stack,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...enhancedCorsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
