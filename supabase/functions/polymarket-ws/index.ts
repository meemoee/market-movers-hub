
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  console.log("Received request to polymarket-ws");
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log("Handling OPTIONS request with CORS headers");
    return new Response(null, { 
      headers: corsHeaders 
    });
  }

  // Get asset ID from URL parameters
  const url = new URL(req.url);
  const assetId = url.searchParams.get('assetId');

  if (!assetId) {
    console.error("Missing assetId parameter");
    return new Response(JSON.stringify({ status: "error", message: "Asset ID is required" }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }

  console.log(`Connecting to Polymarket WebSocket for asset ID: ${assetId}`);

  try {
    // Check if this is a WebSocket upgrade request
    const upgradeHeader = req.headers.get('upgrade') || '';
    if (upgradeHeader.toLowerCase() !== 'websocket') {
      console.error("Request is not a WebSocket upgrade request");
      return new Response(JSON.stringify({ 
        status: "error", 
        message: "WebSocket connection expected" 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    console.log("Upgrading connection to WebSocket");
    
    // Client connection setup
    const { socket: clientSocket, response } = Deno.upgradeWebSocket(req);
    let polySocket: WebSocket | null = null;
    let pingInterval: number | null = null;
    let connected = false;
    let reconnecting = false;
    let reconnectAttempts = 0;
    let reconnectTimeout: number | null = null;
    let connectionTimeout: number | null = null;
    const MAX_RECONNECT_ATTEMPTS = 5;
    const CONNECTION_TIMEOUT_MS = 10000; // 10 seconds timeout for initial connection

    // Function to close everything and clean up
    const cleanupConnections = () => {
      console.log("Cleaning up connections");
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
      }
      
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }

      if (connectionTimeout) {
        clearTimeout(connectionTimeout);
        connectionTimeout = null;
      }
      
      if (polySocket && (polySocket.readyState === WebSocket.OPEN || polySocket.readyState === WebSocket.CONNECTING)) {
        try {
          console.log("Closing Polymarket socket connection");
          polySocket.close();
        } catch (err) {
          console.error("Error closing Polymarket socket:", err);
        }
      }
      
      polySocket = null;
    };

    // Function to connect to Polymarket WebSocket
    const connectToPolymarket = () => {
      if (reconnecting) {
        console.log(`Reconnection attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);
        clientSocket.send(JSON.stringify({ status: "reconnecting", attempt: reconnectAttempts }));
      }
      
      // Close previous connection if exists
      if (polySocket) {
        try {
          polySocket.close();
        } catch (err) {
          console.error("Error closing previous Polymarket socket:", err);
        }
      }

      try {
        console.log("Connecting to Polymarket WebSocket...");
        
        // Set connection timeout
        if (connectionTimeout) {
          clearTimeout(connectionTimeout);
        }
        
        connectionTimeout = setTimeout(() => {
          console.error("Connection timeout reached");
          if (!connected && polySocket) {
            clientSocket.send(JSON.stringify({ 
              status: "error", 
              message: "Connection timeout reached" 
            }));
            scheduleReconnect();
          }
        }, CONNECTION_TIMEOUT_MS);
        
        // Connect to Polymarket WebSocket
        polySocket = new WebSocket("wss://ws-subscriptions-clob.polymarket.com/ws/market");
        
        polySocket.onopen = () => {
          console.log("Polymarket WebSocket connected successfully");
          connected = true;
          reconnecting = false;
          reconnectAttempts = 0;
          
          // Clear connection timeout
          if (connectionTimeout) {
            clearTimeout(connectionTimeout);
            connectionTimeout = null;
          }
          
          // Send connection status to client
          clientSocket.send(JSON.stringify({ status: "connected" }));
          
          // Subscribe to market data with a slight delay to ensure connection is stable
          setTimeout(() => {
            if (polySocket && polySocket.readyState === WebSocket.OPEN) {
              // Subscribe to market data
              const subscription = {
                type: "Market",
                assets_ids: [assetId]
              };
              console.log(`Subscribing to market data for asset ID: ${assetId}`);
              polySocket.send(JSON.stringify(subscription));

              // Request initial snapshot
              const snapshotRequest = {
                type: "GetMarketSnapshot",
                asset_id: assetId
              };
              console.log(`Requesting initial snapshot for asset ID: ${assetId}`);
              polySocket.send(JSON.stringify(snapshotRequest));
            } else {
              console.error("Polymarket socket not open for subscription, current state:", 
                polySocket ? polySocket.readyState : "null");
              scheduleReconnect();
            }
          }, 100);
          
          // Setup ping interval to keep connection alive
          if (pingInterval) {
            clearInterval(pingInterval);
          }
          
          pingInterval = setInterval(() => {
            if (polySocket && polySocket.readyState === WebSocket.OPEN) {
              try {
                polySocket.send("PING");
                clientSocket.send(JSON.stringify({ ping: new Date().toISOString() }));
              } catch (err) {
                console.error("Error sending ping:", err);
                scheduleReconnect();
              }
            } else {
              console.error("Polymarket socket not open for ping, current state:", 
                polySocket ? polySocket.readyState : "null");
              scheduleReconnect();
            }
          }, 30000);
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
              console.log("Received non-array data from Polymarket:", data);
              return;
            }
            
            // Process the events from Polymarket
            let orderbook: any = null;
            
            for (const event of parsed) {
              if (event.event_type === "book") {
                console.log("Received orderbook snapshot from Polymarket");
                orderbook = processOrderbookSnapshot(event);
              } else if (event.event_type === "price_change") {
                console.log("Received price change from Polymarket");
                orderbook = processLevelUpdate(event, orderbook);
              }
            }
            
            if (orderbook) {
              console.log("Sending orderbook data to client");
              clientSocket.send(JSON.stringify({ orderbook }));
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
          scheduleReconnect();
        };
        
        polySocket.onclose = (event) => {
          console.log(`Polymarket WebSocket closed with code ${event.code}, reason: ${event.reason}`);
          connected = false;
          
          // Clear connection timeout if it exists
          if (connectionTimeout) {
            clearTimeout(connectionTimeout);
            connectionTimeout = null;
          }
          
          if (!reconnecting) {
            scheduleReconnect();
          }
        };
      } catch (err) {
        console.error("Error establishing connection to Polymarket:", err);
        clientSocket.send(JSON.stringify({ 
          status: "error", 
          message: "Failed to connect to orderbook service" 
        }));
        scheduleReconnect();
      }
    };
    
    const scheduleReconnect = () => {
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.log("Maximum reconnection attempts reached");
        clientSocket.send(JSON.stringify({ 
          status: "failed", 
          message: "Failed to connect to orderbook service after multiple attempts" 
        }));
        return;
      }
      
      reconnecting = true;
      reconnectAttempts++;
      const backoff = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 30000);
      
      console.log(`Scheduling reconnection attempt ${reconnectAttempts} in ${backoff/1000} seconds...`);
      
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      
      reconnectTimeout = setTimeout(() => {
        console.log(`Executing reconnection attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);
        connectToPolymarket();
      }, backoff);
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
    
    // Handle client connection events
    clientSocket.onopen = () => {
      console.log("Client connected, connecting to Polymarket");
      connectToPolymarket();
    };
    
    clientSocket.onmessage = (event) => {
      try {
        console.log("Received message from client:", event.data);
        const message = JSON.parse(event.data);
        
        // Handle ping-pong
        if (message.ping) {
          console.log("Received ping from client, sending pong");
          clientSocket.send(JSON.stringify({ pong: new Date().toISOString() }));
        }
      } catch (err) {
        console.error("Error handling client message:", err);
      }
    };
    
    clientSocket.onclose = () => {
      console.log("Client disconnected, cleaning up connections");
      cleanupConnections();
    };
    
    clientSocket.onerror = (event) => {
      console.error("Client socket error:", event);
      cleanupConnections();
    };
    
    // Add appropriate headers to the WebSocket response
    const headers = new Headers(response.headers);
    Object.entries(corsHeaders).forEach(([key, value]) => {
      headers.set(key, value);
    });

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  } catch (err) {
    console.error("Error handling WebSocket connection:", err);
    return new Response(JSON.stringify({ status: "error", message: "Failed to establish WebSocket connection" }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
