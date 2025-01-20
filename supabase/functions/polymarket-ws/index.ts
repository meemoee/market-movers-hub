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

  constructor(clientSocket: WebSocket, assetId: string) {
    this.clientSocket = clientSocket;
    this.assetId = assetId;
    console.log('PolymarketStream initialized with client socket and asset ID:', assetId);
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
        console.log('Requested market snapshot for asset ID:', this.assetId);
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
  const assetId = url.searchParams.get('assetId');
  
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

  // Validate assetId
  if (!assetId) {
    return new Response('Missing assetId parameter', {
      status: 400,
      headers: corsHeaders
    });
  }

  try {
    const { socket: clientSocket, response } = Deno.upgradeWebSocket(req);
    console.log("WebSocket connection established with client for asset ID:", assetId);
    
    const stream = new PolymarketStream(clientSocket, assetId);
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