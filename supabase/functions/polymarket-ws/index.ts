import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

class PolymarketStream {
  private ws: WebSocket | null = null;
  private assetId = "112079176993929604864779457945097054417527947802930131576938601640669350643880";
  private orderbook: any = null;
  private clientSocket: WebSocket | null = null;

  constructor(clientSocket: WebSocket) {
    this.clientSocket = clientSocket;
    console.log('PolymarketStream initialized with client socket');
  }

  async connect() {
    try {
      console.log('Connecting to Polymarket WebSocket...');
      this.ws = new WebSocket("wss://ws-subscriptions-clob.polymarket.com/ws/market");
      
      this.ws.onopen = () => {
        console.log('Connected to Polymarket WebSocket');
        const subscription = {
          type: "Market",
          assets_ids: [this.assetId]
        };
        this.ws?.send(JSON.stringify(subscription));

        const snapshotRequest = {
          type: "GetMarketSnapshot",
          asset_id: this.assetId
        };
        this.ws?.send(JSON.stringify(snapshotRequest));
        console.log('Requested market snapshot');
      };

      this.ws.onmessage = (event) => {
        const message = event.data;
        if (message === "PONG") return;

        try {
          console.log('Received message from Polymarket:', message);
          const events = JSON.parse(message);
          if (!Array.isArray(events) || events.length === 0) return;

          events.forEach(event => {
            if (event.event_type === "book") {
              console.log('Processing orderbook update');
              const orderbook = this.processOrderbookSnapshot(event);
              this.sendToClient(orderbook);
            }
          });
        } catch (error) {
          console.error('Error processing message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('Polymarket WebSocket error:', error);
        this.cleanup();
      };

      this.ws.onclose = () => {
        console.log('Polymarket WebSocket closed');
        this.cleanup();
      };

    } catch (error) {
      console.error('Error establishing WebSocket connection:', error);
      this.cleanup();
    }
  }

  private sendToClient(orderbook: any) {
    if (this.clientSocket?.readyState === WebSocket.OPEN) {
      this.clientSocket.send(JSON.stringify({ orderbook }));
    }
  }

  private processOrderbookSnapshot(book: any) {
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

    return processedBook;
  }

  cleanup() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
    if (this.clientSocket?.readyState === WebSocket.OPEN) {
      this.clientSocket.close();
    }
  }
}

serve(async (req) => {
  const url = new URL(req.url);
  
  // Test endpoint for backward compatibility
  if (url.pathname.endsWith('/test')) {
    console.log("Test endpoint hit");
    try {
      const mockOrderbook = {
        bids: { "0.17": 3042.65, "0.09": 133.33, "0.08": 125, "0.07": 100, "0.05": 200 },
        asks: { "0.19": 22.65, "0.20": 1172.1, "0.22": 205, "0.34": 18.18, "0.35": 15.38 },
        best_bid: 0.17,
        best_ask: 0.19,
        spread: 0.02,
        timestamp: new Date().toISOString()
      };
      
      return new Response(JSON.stringify({ 
        message: "Test completed",
        received_data: true,
        orderbook: mockOrderbook
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    } catch (error) {
      console.error("Error in test endpoint:", error);
      return new Response(JSON.stringify({ 
        error: "Failed to fetch orderbook data",
        details: error.message 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500
      });
    }
  }

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Check if this is a WebSocket request
  const upgrade = req.headers.get('upgrade') || '';
  if (upgrade.toLowerCase() !== 'websocket') {
    return new Response('Expected WebSocket connection', { 
      status: 400,
      headers: corsHeaders
    });
  }

  try {
    const { socket: clientSocket, response } = Deno.upgradeWebSocket(req);
    console.log("WebSocket connection established with client");
    
    const stream = new PolymarketStream(clientSocket);
    await stream.connect();

    clientSocket.onclose = () => {
      console.log('Client WebSocket closed');
      stream.cleanup();
    };

    return response;
  } catch (error) {
    console.error("WebSocket connection error:", error);
    return new Response(JSON.stringify({ 
      error: "Failed to establish WebSocket connection",
      details: error.message 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500
    });
  }
});