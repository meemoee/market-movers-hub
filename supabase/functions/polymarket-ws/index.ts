import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

class PolymarketStream {
  private ws: WebSocket | null = null;
  private assetId: string;
  private orderbook: any = null;
  private clientSocket: WebSocket | null = null;
  private pingInterval: number | null = null;
  private reconnectTimeout: number | null = null;
  private isCleanupInitiated = false;

  constructor(clientSocket: WebSocket, assetId: string) {
    this.clientSocket = clientSocket;
    this.assetId = assetId;
    console.log('[PolymarketStream] Initialized with client socket and asset ID:', assetId);
  }

  async connect() {
    if (this.isCleanupInitiated) {
      console.log('[PolymarketStream] Not connecting because cleanup has been initiated');
      return;
    }

    try {
      // Clean up any existing connection first
      this.cleanupPolymarketConnection();

      console.log('[PolymarketStream] Connecting to Polymarket WebSocket...');
      this.ws = new WebSocket("wss://ws-subscriptions-clob.polymarket.com/ws/market");
      
      this.ws.onopen = () => {
        if (this.isCleanupInitiated) return;

        console.log('[PolymarketStream] Connected to Polymarket WebSocket');
        
        // Set up ping/pong to keep connection alive
        this.pingInterval = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            console.log('[PolymarketStream] Sending PING to Polymarket');
            this.ws.send("PING");
          }
        }, 30000);

        // Subscribe to market updates
        const subscription = {
          type: "Market",
          assets_ids: [this.assetId]
        };
        
        if (this.ws?.readyState === WebSocket.OPEN) {
          console.log('[PolymarketStream] Subscribing to market updates for asset ID:', this.assetId);
          this.ws.send(JSON.stringify(subscription));
        }

        // Request initial snapshot
        const snapshotRequest = {
          type: "GetMarketSnapshot",
          asset_id: this.assetId
        };
        
        if (this.ws?.readyState === WebSocket.OPEN) {
          console.log('[PolymarketStream] Requesting market snapshot for asset ID:', this.assetId);
          this.ws.send(JSON.stringify(snapshotRequest));
        }
      };

      this.ws.onmessage = (event) => {
        if (this.isCleanupInitiated) return;

        const message = event.data;
        if (message === "PONG") {
          console.log('[PolymarketStream] Received PONG from Polymarket');
          return;
        }

        try {
          console.log('[PolymarketStream] Received message from Polymarket:', message);
          const events = JSON.parse(message);
          
          if (!Array.isArray(events) || events.length === 0) {
            console.log('[PolymarketStream] Received empty or non-array message');
            return;
          }

          events.forEach(event => {
            if (event.event_type === "book") {
              console.log('[PolymarketStream] Processing orderbook update for asset ID:', this.assetId);
              const orderbook = this.processOrderbookSnapshot(event);
              this.sendToClient(orderbook);
            }
          });
        } catch (error) {
          console.error('[PolymarketStream] Error processing message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('[PolymarketStream] Polymarket WebSocket error:', error);
        this.handlePolymarketDisconnect("error");
      };

      this.ws.onclose = (event) => {
        console.log('[PolymarketStream] Polymarket WebSocket closed with code:', event.code, 'reason:', event.reason);
        this.handlePolymarketDisconnect("close");
      };

    } catch (error) {
      console.error('[PolymarketStream] Error establishing WebSocket connection:', error);
      this.handlePolymarketDisconnect("connection error");
    }
  }

  private handlePolymarketDisconnect(reason: string) {
    if (this.isCleanupInitiated) return;

    console.log(`[PolymarketStream] Handling Polymarket disconnect due to: ${reason}`);
    this.cleanupPolymarketConnection();

    // Attempt to reconnect after a delay
    if (!this.reconnectTimeout && !this.isCleanupInitiated) {
      console.log('[PolymarketStream] Scheduling reconnect attempt');
      this.reconnectTimeout = setTimeout(() => {
        if (!this.isCleanupInitiated) {
          console.log('[PolymarketStream] Attempting to reconnect to Polymarket');
          this.connect();
        }
      }, 5000);
    }
  }

  private cleanupPolymarketConnection() {
    console.log('[PolymarketStream] Cleaning up Polymarket connection');
    
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    
    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close();
      }
      this.ws = null;
    }
  }

  private sendToClient(orderbook: any) {
    if (this.clientSocket?.readyState === WebSocket.OPEN) {
      try {
        console.log('[PolymarketStream] Sending orderbook to client for asset ID:', this.assetId);
        const message = JSON.stringify({ orderbook });
        this.clientSocket.send(message);
      } catch (error) {
        console.error('[PolymarketStream] Error sending orderbook to client:', error);
      }
    } else {
      console.warn('[PolymarketStream] Cannot send to client - socket not open');
    }
  }

  private processOrderbookSnapshot(book: any) {
    console.log('[PolymarketStream] Processing orderbook snapshot');
    
    const processedBook = {
      bids: {},
      asks: {},
      best_bid: 0,
      best_ask: 0,
      spread: 0
    };

    if (Array.isArray(book.bids)) {
      book.bids.forEach(bid => {
        if (bid.price && bid.size) {
          const size = parseFloat(bid.size);
          if (size > 0) {
            processedBook.bids[bid.price] = size;
          }
        }
      });
    }

    if (Array.isArray(book.asks)) {
      book.asks.forEach(ask => {
        if (ask.price && ask.size) {
          const size = parseFloat(ask.size);
          if (size > 0) {
            processedBook.asks[ask.price] = size;
          }
        }
      });
    }

    const bidPrices = Object.keys(processedBook.bids).map(parseFloat);
    const askPrices = Object.keys(processedBook.asks).map(parseFloat);
    
    processedBook.best_bid = bidPrices.length > 0 ? Math.max(...bidPrices) : 0;
    processedBook.best_ask = askPrices.length > 0 ? Math.min(...askPrices) : 0;
    processedBook.spread = processedBook.best_ask - processedBook.best_bid;

    console.log('[PolymarketStream] Processed orderbook:', JSON.stringify({
      bid_count: Object.keys(processedBook.bids).length,
      ask_count: Object.keys(processedBook.asks).length,
      best_bid: processedBook.best_bid,
      best_ask: processedBook.best_ask,
      spread: processedBook.spread
    }));

    return processedBook;
  }

  cleanup() {
    console.log('[PolymarketStream] Initiating cleanup');
    this.isCleanupInitiated = true;
    
    this.cleanupPolymarketConnection();
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (this.clientSocket?.readyState === WebSocket.OPEN) {
      console.log('[PolymarketStream] Closing client WebSocket connection');
      this.clientSocket.close();
    }
    this.clientSocket = null;
  }
}

serve(async (req) => {
  const url = new URL(req.url);
  const assetId = url.searchParams.get('assetId');
  
  console.log('[polymarket-ws] Received request', {
    method: req.method,
    url: req.url,
    assetId,
    headers: Object.fromEntries(req.headers.entries())
  });
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('[polymarket-ws] Handling CORS preflight request');
    return new Response(null, { headers: corsHeaders });
  }

  // Check if this is a WebSocket request
  const upgrade = req.headers.get('upgrade') || '';
  if (upgrade.toLowerCase() !== 'websocket') {
    console.error('[polymarket-ws] Not a WebSocket request, upgrade header:', upgrade);
    return new Response('Expected WebSocket connection', { 
      status: 400,
      headers: corsHeaders
    });
  }

  // Validate assetId
  if (!assetId) {
    console.error('[polymarket-ws] Missing assetId parameter');
    return new Response('Missing assetId parameter', {
      status: 400,
      headers: corsHeaders
    });
  }

  try {
    console.log('[polymarket-ws] Upgrading connection to WebSocket for asset ID:', assetId);
    const { socket: clientSocket, response } = Deno.upgradeWebSocket(req);
    console.log("[polymarket-ws] WebSocket connection established with client");
    
    const stream = new PolymarketStream(clientSocket, assetId);
    
    clientSocket.onopen = () => {
      console.log('[polymarket-ws] Client WebSocket connection opened');
      stream.connect();
    };

    clientSocket.onclose = (event) => {
      console.log('[polymarket-ws] Client WebSocket closed with code:', event.code, 'reason:', event.reason);
      stream.cleanup();
    };

    clientSocket.onerror = (error) => {
      console.error('[polymarket-ws] Client WebSocket error:', error);
      stream.cleanup();
    };

    return response;
  } catch (error) {
    console.error("[polymarket-ws] WebSocket connection error:", error);
    return new Response(JSON.stringify({ 
      error: "Failed to establish WebSocket connection",
      details: error.message 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500
    });
  }
});
