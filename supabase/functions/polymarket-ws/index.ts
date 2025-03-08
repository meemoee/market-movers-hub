
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, upgrade, connection, sec-websocket-key, sec-websocket-version, sec-websocket-extensions',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

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

    // Handle HTTP diagnostic test
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

    // Extract token ID from URL parameters
    const tokenId = url.searchParams.get('assetId');
    
    if (!tokenId) {
      console.error("⚠️ Missing token ID in request");
      return new Response(JSON.stringify({ 
        status: "error", 
        message: "Token ID is required" 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    console.log(`🔗 Attempting WebSocket upgrade for token ID: ${tokenId}`);

    try {
      // Setup WebSocket connection to client
      const { socket: clientSocket, response } = Deno.upgradeWebSocket(req);
      console.log("✅ Connection upgraded successfully");

      // Connection to Polymarket API
      const polymarketUrl = `https://clob.polymarket.com/orderbook/${tokenId}`;
      let orderBookData = null;

      // Setup client socket handlers
      clientSocket.onopen = async () => {
        console.log("📢 Client socket opened");
        
        try {
          // Fetch initial orderbook data
          console.log(`🔄 Fetching orderbook data from: ${polymarketUrl}`);
          const response = await fetch(polymarketUrl, {
            headers: { 'Accept': 'application/json' }
          });
          
          if (response.ok) {
            orderBookData = await response.json();
            console.log("✅ Successfully fetched orderbook data");
            
            // Send initial orderbook data to client
            clientSocket.send(JSON.stringify({ 
              status: "connected",
              orderbook: orderBookData
            }));
            
            // Start polling for updates (since we don't have a direct WS connection to Polymarket)
            pollOrderBook(clientSocket, tokenId);
          } else {
            console.error(`❌ Failed to fetch orderbook: ${response.status}`);
            const errorText = await response.text();
            console.error('Error details:', errorText);
            
            clientSocket.send(JSON.stringify({ 
              status: "error",
              message: `Failed to fetch orderbook: ${response.status}`
            }));
          }
        } catch (err) {
          console.error("❌ Error fetching initial orderbook data:", err);
          clientSocket.send(JSON.stringify({ 
            status: "error",
            message: `Error fetching orderbook: ${err.message}`
          }));
        }
      };
      
      clientSocket.onmessage = (event) => {
        try {
          console.log("📩 Received message from client:", event.data);
          const message = JSON.parse(event.data);
          
          // Handle ping messages to keep connection alive
          if (message.ping) {
            clientSocket.send(JSON.stringify({ 
              pong: new Date().toISOString() 
            }));
          }
        } catch (err) {
          console.error("❌ Error handling client message:", err);
        }
      };
      
      clientSocket.onclose = (event) => {
        console.log(`🚪 Client disconnected with code ${event.code}, reason: ${event.reason || "No reason provided"}`);
      };
      
      clientSocket.onerror = (event) => {
        console.error("❌ Client socket error:", event);
      };
      
      // Return the WebSocket response
      return response;
    } catch (err) {
      console.error("❌ Error upgrading to WebSocket:", err);
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
    console.error("❌ Unexpected error in polymarket-ws function:", err);
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

// Function to poll the orderbook API and send updates to the client
async function pollOrderBook(clientSocket, tokenId) {
  try {
    if (clientSocket.readyState !== WebSocket.OPEN) {
      console.log("🛑 Client socket not open, stopping polling");
      return;
    }
    
    console.log(`🔄 Polling orderbook for token: ${tokenId}`);
    const response = await fetch(`https://clob.polymarket.com/orderbook/${tokenId}`, {
      headers: { 'Accept': 'application/json' }
    });
    
    if (response.ok) {
      const data = await response.json();
      clientSocket.send(JSON.stringify({ 
        orderbook: data
      }));
    } else {
      console.error(`❌ Failed to fetch orderbook update: ${response.status}`);
    }
    
    // Schedule next poll after 5 seconds
    setTimeout(() => pollOrderBook(clientSocket, tokenId), 5000);
  } catch (err) {
    console.error("❌ Error polling orderbook:", err);
    
    // Try to continue polling despite error
    setTimeout(() => pollOrderBook(clientSocket, tokenId), 5000);
  }
}
