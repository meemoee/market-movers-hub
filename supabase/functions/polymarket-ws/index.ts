
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  // Log immediately when function is invoked
  console.log("🔵 polymarket-ws function invoked");
  
  try {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
      console.log("📝 Handling CORS preflight request");
      return new Response(null, { 
        headers: corsHeaders 
      });
    }

    // Handle HTTP diagnostic request
    const url = new URL(req.url);
    if (url.searchParams.get('test') === 'true') {
      console.log("🧪 Diagnostic test request received");
      return new Response(JSON.stringify({ 
        status: "ok", 
        message: "Edge function is running correctly",
        timestamp: new Date().toISOString(),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // Check WebSocket upgrade header
    const upgradeHeader = req.headers.get("upgrade") || "";
    if (upgradeHeader.toLowerCase() !== "websocket") {
      console.error("⚠️ Expected WebSocket connection, got:", upgradeHeader);
      return new Response(JSON.stringify({ 
        status: "error", 
        message: "Expected WebSocket connection" 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // Get asset ID from URL parameters
    const assetId = url.searchParams.get('assetId');

    if (!assetId) {
      console.error("⚠️ Missing asset ID in request");
      return new Response(JSON.stringify({ 
        status: "error", 
        message: "Asset ID is required" 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    console.log(`🔗 Attempting WebSocket upgrade for asset ID: ${assetId}`);

    try {
      // Client connection - use Deno.upgradeWebSocket to convert the HTTP request to WebSocket
      console.log("🔄 Upgrading connection to WebSocket");
      const { socket: clientSocket, response } = Deno.upgradeWebSocket(req);
      console.log("✅ Connection upgraded successfully");
      
      // Setup minimal socket handlers with helpful logging
      clientSocket.onopen = () => {
        console.log("📢 Client socket opened");
        clientSocket.send(JSON.stringify({ 
          status: "connected",
          message: "Successfully connected to edge function",
          assetId
        }));
      };
      
      clientSocket.onmessage = (event) => {
        console.log("📩 Received message from client:", event.data);
        try {
          // Simple echo for now to test WebSocket functionality
          clientSocket.send(JSON.stringify({ 
            status: "echo", 
            original: event.data,
            timestamp: new Date().toISOString()
          }));
        } catch (err) {
          console.error("⚠️ Error handling client message:", err);
        }
      };
      
      clientSocket.onclose = (event) => {
        console.log(`🚪 Client disconnected with code ${event.code}, reason: ${event.reason || "No reason provided"}`);
      };
      
      clientSocket.onerror = (event) => {
        console.error("⚠️ Client socket error:", event);
      };
      
      // Return the WebSocket response
      return response;
    } catch (err) {
      console.error("⚠️ Error upgrading to WebSocket:", err);
      return new Response(JSON.stringify({ 
        status: "error", 
        message: "Failed to upgrade to WebSocket",
        error: err.message
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }
  } catch (err) {
    console.error("⚠️ Unexpected error in polymarket-ws function:", err);
    return new Response(JSON.stringify({ 
      status: "error", 
      message: "Internal server error",
      error: err.message
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
