import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

class PolymarketStream {
  private ws: WebSocket | null = null;
  private assetId = "112079176993929604864779457945097054417527947802930131576938601640669350643880";
  private orderbook: any = null;
  private resolveOrderbook: ((value: any) => void) | null = null;

  async getOrderbookSnapshot(): Promise<any> {
    return new Promise((resolve, reject) => {
      try {
        console.log('Connecting to Polymarket WebSocket...');
        this.resolveOrderbook = resolve;
        
        this.ws = new WebSocket("wss://ws-subscriptions-clob.polymarket.com/ws/market");
        
        this.ws.onopen = () => {
          console.log('Connected to Polymarket WebSocket');
          const subscription = {
            type: "Market",
            assets_ids: [this.assetId]
          };
          this.ws.send(JSON.stringify(subscription));

          const snapshotRequest = {
            type: "GetMarketSnapshot",
            asset_id: this.assetId
          };
          this.ws.send(JSON.stringify(snapshotRequest));
          console.log('Requested market snapshot');
        };

        this.ws.onmessage = (event) => {
          const message = event.data;
          if (message === "PONG") return;

          try {
            console.log('Received message:', message);
            const events = JSON.parse(message);
            if (!Array.isArray(events) || events.length === 0) return;

            events.forEach(event => {
              if (event.event_type === "book") {
                console.log('Received orderbook snapshot:', event);
                const orderbook = this.processOrderbookSnapshot(event);
                if (this.resolveOrderbook) {
                  this.resolveOrderbook(orderbook);
                  this.resolveOrderbook = null;
                  this.ws?.close();
                }
              }
            });
          } catch (error) {
            console.error('Error processing message:', error);
            reject(error);
          }
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          reject(error);
        };

        // Set a timeout to avoid hanging
        setTimeout(() => {
          if (this.resolveOrderbook) {
            reject(new Error('Timeout waiting for orderbook snapshot'));
            this.ws?.close();
          }
        }, 10000);

      } catch (error) {
        console.error('Error establishing WebSocket connection:', error);
        reject(error);
      }
    });
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

  stop() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
  }
}

serve(async (req) => {
  const url = new URL(req.url);
  
  // Test endpoint
  if (url.pathname.endsWith('/test')) {
    console.log("Test endpoint hit");
    try {
      const stream = new PolymarketStream();
      const orderbook = await stream.getOrderbookSnapshot();
      console.log("Retrieved orderbook:", orderbook);
      
      return new Response(JSON.stringify({ 
        message: "Test completed",
        received_data: true,
        orderbook: {
          ...orderbook,
          timestamp: new Date().toISOString()
        }
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    } catch (error) {
      console.error("Error getting orderbook:", error);
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
    
    const stream = new PolymarketStream();
    
    clientSocket.onclose = () => {
      console.log('Client WebSocket Closed');
      stream.stop();
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