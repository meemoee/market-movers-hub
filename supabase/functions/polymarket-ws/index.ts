
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Get asset ID from URL parameters
  const url = new URL(req.url);
  const assetId = url.searchParams.get('assetId');

  if (!assetId) {
    return new Response(JSON.stringify({ status: "error", message: "Asset ID is required" }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }

  console.log(`Testing Polymarket WebSocket connection for asset ID: ${assetId}`);

  try {
    // Client connection
    const { socket: clientSocket, response } = Deno.upgradeWebSocket(req);
    let polySocket: WebSocket | null = null;
    let initialDataReceived = false;
    
    // Function to close everything and clean up
    const cleanupConnections = () => {
      console.log("Cleaning up connections");
      
      if (polySocket && (polySocket.readyState === WebSocket.OPEN || polySocket.readyState === WebSocket.CONNECTING)) {
        try {
          polySocket.close();
        } catch (err) {
          console.error("Error closing Polymarket socket:", err);
        }
      }
      
      polySocket = null;
    };

    // Function to connect to Polymarket WebSocket
    const connectToPolymarket = () => {
      try {
        console.log("Connecting to Polymarket WebSocket...");
        // Connect to Polymarket WebSocket
        polySocket = new WebSocket("wss://ws-subscriptions-clob.polymarket.com/ws/market");
        
        polySocket.onopen = () => {
          console.log("Polymarket WebSocket connected");
          
          // Send connection status to client
          clientSocket.send(JSON.stringify({ status: "connected" }));
          
          // Subscribe to market data
          setTimeout(() => {
            if (polySocket && polySocket.readyState === WebSocket.OPEN) {
              // Subscribe to market data
              const subscription = {
                type: "Market",
                assets_ids: [assetId]
              };
              polySocket.send(JSON.stringify(subscription));
              console.log('Subscribed to market data');

              // Request initial snapshot
              const snapshotRequest = {
                type: "GetMarketSnapshot",
                asset_id: assetId
              };
              polySocket.send(JSON.stringify(snapshotRequest));
              console.log('Requested initial snapshot');
            }
          }, 100);
        };
        
        polySocket.onmessage = (event) => {
          try {
            const data = event.data.toString();
            
            // Handle Polymarket's PONG response
            if (data === "PONG") {
              console.log("Received PONG from Polymarket");
              return;
            }
            
            const parsed = JSON.parse(data);
            
            if (!Array.isArray(parsed) || parsed.length === 0) {
              console.log("Received non-array data:", data);
              return;
            }
            
            // Process the events from Polymarket
            let orderbook: any = null;
            
            for (const event of parsed) {
              if (event.event_type === "book") {
                orderbook = processOrderbookSnapshot(event);
              } else if (event.event_type === "price_change") {
                orderbook = processLevelUpdate(event, orderbook);
              }
            }
            
            if (orderbook && !initialDataReceived) {
              console.log("Sending initial orderbook data to client:", orderbook);
              clientSocket.send(JSON.stringify({ orderbook }));
              initialDataReceived = true;
              
              // Close the connection after sending initial data
              setTimeout(() => {
                console.log("Initial data sent, closing connections");
                clientSocket.send(JSON.stringify({ status: "complete", message: "Initial data sent" }));
                cleanupConnections();
              }, 1000);
            }
          } catch (err) {
            console.error("Error processing message from Polymarket:", err);
          }
        };
        
        polySocket.onerror = (event) => {
          console.error("Polymarket WebSocket error:", event);
          clientSocket.send(JSON.stringify({ 
            status: "error", 
            message: "Error connecting to orderbook service"
          }));
        };
        
        polySocket.onclose = (event) => {
          console.log(`Polymarket WebSocket closed with code ${event.code}, reason: ${event.reason}`);
        };
      } catch (err) {
        console.error("Error establishing connection to Polymarket:", err);
        clientSocket.send(JSON.stringify({ 
          status: "error", 
          message: "Failed to connect to orderbook service" 
        }));
      }
    };
    
    // Global orderbook state
    let currentOrderbook = {
      bids: {},
      asks: {},
      best_bid: null,
      best_ask: null,
      spread: null
    };
    
    // Process initial orderbook snapshot
    const processOrderbookSnapshot = (book: any) => {
      console.log("Processing orderbook snapshot");
      
      // Reset orderbook for snapshot
      const orderbook = {
        bids: {},
        asks: {},
        best_bid: null,
        best_ask: null,
        spread: null
      };
      
      // Process bids
      if (Array.isArray(book.bids)) {
        for (const bid of book.bids) {
          if (bid.price && bid.size) {
            const size = parseFloat(bid.size);
            if (size > 0) {
              orderbook.bids[bid.price] = size;
            }
          }
        }
      }
      
      // Process asks
      if (Array.isArray(book.asks)) {
        for (const ask of book.asks) {
          if (ask.price && ask.size) {
            const size = parseFloat(ask.size);
            if (size > 0) {
              orderbook.asks[ask.price] = size;
            }
          }
        }
      }
      
      updateBestPrices(orderbook);
      currentOrderbook = orderbook;
      return orderbook;
    };
    
    // Process orderbook updates
    const processLevelUpdate = (event: any, orderbook: any) => {
      if (!orderbook) {
        orderbook = { ...currentOrderbook };
      }
      
      if (event.changes && Array.isArray(event.changes)) {
        for (const change of event.changes) {
          const price = change.price;
          const size = parseFloat(change.size);
          const side = change.side === 'BUY' ? 'bids' : 'asks';
          
          // Update orderbook state
          if (size === 0) {
            delete orderbook[side][price];
          } else {
            orderbook[side][price] = size;
          }
        }
        
        updateBestPrices(orderbook);
        currentOrderbook = orderbook;
      }
      
      return orderbook;
    };
    
    // Update best prices in the orderbook
    const updateBestPrices = (orderbook: any) => {
      const bidPrices = Object.keys(orderbook.bids).map(p => parseFloat(p));
      const askPrices = Object.keys(orderbook.asks).map(p => parseFloat(p));
      
      orderbook.best_bid = bidPrices.length > 0 ? Math.max(...bidPrices) : null;
      orderbook.best_ask = askPrices.length > 0 ? Math.min(...askPrices) : null;
      
      if (orderbook.best_bid !== null && orderbook.best_ask !== null) {
        orderbook.spread = orderbook.best_ask - orderbook.best_bid;
      } else {
        orderbook.spread = null;
      }
    };
    
    // Handle client connection
    clientSocket.onopen = () => {
      console.log("Client connected, connecting to Polymarket");
      connectToPolymarket();
    };
    
    clientSocket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        // Handle ping-pong
        if (message.ping) {
          clientSocket.send(JSON.stringify({ pong: new Date().toISOString() }));
        }
      } catch (err) {
        console.error("Error handling client message:", err);
      }
    };
    
    clientSocket.onclose = () => {
      console.log("Client disconnected");
      cleanupConnections();
    };
    
    clientSocket.onerror = (event) => {
      console.error("Client socket error:", event);
      cleanupConnections();
    };
    
    return response;
  } catch (err) {
    console.error("Error handling WebSocket connection:", err);
    return new Response(JSON.stringify({ status: "error", message: "Failed to establish WebSocket connection" }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
