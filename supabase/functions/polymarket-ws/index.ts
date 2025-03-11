
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, wsHeaders } from "../_shared/cors.ts";

console.log("Polymarket WebSocket Function v3.0.0 - Enhanced debugging and multiple connection methods");

function logHeaders(headers: Headers, prefix: string = ""): void {
  console.log(`${prefix} Headers:`);
  for (const [key, value] of headers.entries()) {
    console.log(`${prefix} ${key}: ${value}`);
  }
}

function debugRequest(req: Request): void {
  console.log("\n=== Request Debug Info ===");
  console.log("Method:", req.method);
  console.log("URL:", req.url);
  logHeaders(req.headers, "→");
}

serve(async (req) => {
  console.log("\n🔄 New request received:", new Date().toISOString());
  debugRequest(req);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    console.log('📝 Handling CORS preflight request');
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Headers': req.headers.get('Access-Control-Request-Headers') || '*'
      }
    });
  }

  const url = new URL(req.url);
  const assetId = url.searchParams.get('assetId');
  console.log(`📦 Asset ID: ${assetId}`);

  // Test mode via header or URL param
  const isTest = req.headers.get('x-client-info')?.includes('test-mode') || 
                 url.searchParams.get('test') === 'true';

  if (isTest) {
    console.log('🧪 Test request detected');
    return new Response(JSON.stringify({
      status: "ready",
      message: "Polymarket WebSocket endpoint is active.",
      timestamp: new Date().toISOString(),
      requestInfo: {
        method: req.method,
        url: req.url,
        headers: Object.fromEntries([...req.headers]),
        upgradeHeader: req.headers.get("upgrade"),
        secWebSocketKey: req.headers.get("Sec-WebSocket-Key"),
        secWebSocketProtocol: req.headers.get("Sec-WebSocket-Protocol"),
        secWebSocketVersion: req.headers.get("Sec-WebSocket-Version")
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Check for WebSocket upgrade
  const upgradeHeader = req.headers.get("upgrade") || "";
  console.log("🔍 Upgrade header:", upgradeHeader);

  if (upgradeHeader.toLowerCase() !== "websocket") {
    console.log('📨 Non-WebSocket request - returning HTTP response');
    return new Response(JSON.stringify({
      status: "ready",
      message: "This endpoint requires a WebSocket connection.",
      timestamp: new Date().toISOString(),
      requestInfo: {
        method: req.method,
        url: req.url,
        headers: Object.fromEntries([...req.headers])
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    console.log('🔌 Attempting WebSocket upgrade for assetId:', assetId);
    console.log('WebSocket Headers:', Object.fromEntries([...req.headers]));

    let socket, response;
    const upgradeAttempts = [
      // Attempt 1: Standard upgrade
      () => {
        console.log("📡 Attempt 1: Standard WebSocket upgrade");
        return Deno.upgradeWebSocket(req);
      },
      // Attempt 2: With explicit options
      () => {
        console.log("📡 Attempt 2: WebSocket upgrade with explicit options");
        return Deno.upgradeWebSocket(req, {
          protocol: "websocket",
          idleTimeout: 60,
          compress: false
        });
      },
      // Attempt 3: With all headers
      () => {
        console.log("📡 Attempt 3: WebSocket upgrade with all headers");
        const headers = new Headers(req.headers);
        headers.set('Upgrade', 'websocket');
        headers.set('Connection', 'Upgrade');
        headers.set('Sec-WebSocket-Protocol', 'websocket');
        const upgradedReq = new Request(req.url, {
          method: req.method,
          headers
        });
        return Deno.upgradeWebSocket(upgradedReq);
      }
    ];

    let lastError;
    for (let i = 0; i < upgradeAttempts.length; i++) {
      try {
        ({ socket, response } = upgradeAttempts[i]());
        console.log(`✅ Upgrade successful on attempt ${i + 1}`);
        break;
      } catch (err) {
        lastError = err;
        console.error(`❌ Attempt ${i + 1} failed:`, err);
        if (i === upgradeAttempts.length - 1) {
          throw err;
        }
      }
    }

    if (!socket || !response) {
      throw new Error("Failed to upgrade WebSocket connection after all attempts");
    }

    socket.onopen = () => {
      console.log("🎉 WebSocket connection established");
      try {
        socket.send(JSON.stringify({
          type: "connected",
          message: `WebSocket connection established for asset ID: ${assetId}`,
          timestamp: new Date().toISOString()
        }));
      } catch (err) {
        console.error(`❌ Error in onopen:`, err);
      }
    };

    // Enhanced heartbeat with timestamp and connection info
    const heartbeatInterval = setInterval(() => {
      try {
        if (socket.readyState === 1) {
          socket.send(JSON.stringify({
            type: "heartbeat",
            timestamp: new Date().toISOString(),
            connectionInfo: {
              readyState: socket.readyState,
              protocol: socket.protocol,
              extensions: socket.extensions
            }
          }));
          console.log("💓 Heartbeat sent");
        }
      } catch (err) {
        console.error(`❌ Heartbeat error:`, err);
        clearInterval(heartbeatInterval);
      }
    }, 15000);

    socket.onmessage = (event) => {
      console.log(`📥 Message received:`, event.data);
      try {
        const data = JSON.parse(event.data);
        socket.send(JSON.stringify({
          type: "echo",
          received: data,
          assetId: assetId,
          timestamp: new Date().toISOString(),
          connectionInfo: {
            readyState: socket.readyState,
            protocol: socket.protocol,
            extensions: socket.extensions
          }
        }));
      } catch (err) {
        console.error(`❌ Error processing message:`, err);
        socket.send(JSON.stringify({
          type: "error",
          message: `Error processing message: ${err.message}`,
          originalData: event.data,
          timestamp: new Date().toISOString()
        }));
      }
    };

    socket.onerror = (event) => {
      console.error("❌ WebSocket error:", event);
      try {
        if (socket.readyState === 1) {
          socket.send(JSON.stringify({
            type: "error_event",
            message: "An error occurred with the WebSocket connection",
            timestamp: new Date().toISOString(),
            connectionInfo: {
              readyState: socket.readyState,
              protocol: socket.protocol,
              extensions: socket.extensions
            }
          }));
        }
      } catch (e) {
        console.error("❌ Could not send error message:", e);
      }
      clearInterval(heartbeatInterval);
    };

    socket.onclose = (event) => {
      console.log(`👋 WebSocket closed: code=${event.code}, reason=${event.reason || "No reason provided"}`);
      clearInterval(heartbeatInterval);
    };

    // Add all headers to the WebSocket response
    const headers = new Headers(response.headers);
    Object.entries(wsHeaders).forEach(([key, value]) => {
      headers.set(key, value);
    });

    console.log('📤 Returning WebSocket response with headers:');
    logHeaders(headers, "←");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  } catch (err) {
    console.error(`❌ WebSocket upgrade error:`, err);
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

