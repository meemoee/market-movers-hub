import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface OrderBook {
  bids: { [price: string]: number };
  asks: { [price: string]: number };
}

class PolymarketStream {
  private ws: WebSocket | null = null;
  private clientSocket: WebSocket;
  private assetId = "112079176993929604864779457945097054417527947802930131576938601640669350643880";
  private currentOrderbook: OrderBook = {
    bids: {},
    asks: {}
  };

  constructor(clientSocket: WebSocket) {
    this.clientSocket = clientSocket;
    this.connect();
  }

  private connect() {
    console.log('Connecting to Polymarket WebSocket...');
    try {
      this.ws = new WebSocket("wss://ws-subscriptions-clob.polymarket.com/ws/market");

      this.ws.onopen = () => this.onOpen();
      this.ws.onmessage = (event) => this.onMessage(event);
      this.ws.onerror = (error) => this.onError(error);
      this.ws.onclose = () => this.onClose();

    } catch (error) {
      console.error('Error establishing WebSocket connection:', error);
      this.sendErrorToClient('Failed to connect to market data');
    }
  }

  private onOpen() {
    console.log('Connected to Polymarket WebSocket');
    if (!this.ws) return;

    // Subscribe to market data
    const subscription = {
      type: "Market",
      assets_ids: [this.assetId]
    };
    this.ws.send(JSON.stringify(subscription));

    // Request initial snapshot
    const snapshotRequest = {
      type: "GetMarketSnapshot",
      asset_id: this.assetId
    };
    this.ws.send(JSON.stringify(snapshotRequest));
    console.log('Subscribed to market data');
  }

  private onMessage(event: MessageEvent) {
    const message = event.data;
    if (message === "PONG") return;

    try {
      const events = JSON.parse(message);
      if (!Array.isArray(events) || events.length === 0) return;

      events.forEach(event => {
        if (event.event_type === "book") {
          this.handleOrderbookSnapshot(event);
        } else if (event.event_type === "price_change") {
          this.handlePriceChange(event);
        }
      });
    } catch (error) {
      console.error('Error processing message:', error);
    }
  }

  private handleOrderbookSnapshot(book: any) {
    this.currentOrderbook.bids = {};
    this.currentOrderbook.asks = {};

    if (Array.isArray(book.bids)) {
      book.bids.forEach((bid: { price: string; size: string }) => {
        if (bid.price && bid.size) {
          const size = parseFloat(bid.size);
          if (size > 0) {
            this.currentOrderbook.bids[bid.price] = size;
          }
        }
      });
    }

    if (Array.isArray(book.asks)) {
      book.asks.forEach((ask: { price: string; size: string }) => {
        if (ask.price && ask.size) {
          const size = parseFloat(ask.size);
          if (size > 0) {
            this.currentOrderbook.asks[ask.price] = size;
          }
        }
      });
    }

    this.sendOrderbookUpdate();
  }

  private handlePriceChange(event: any) {
    event.changes.forEach((change: any) => {
      const price = change.price;
      const size = parseFloat(change.size);
      const side = change.side === 'BUY' ? 'bids' : 'asks';

      if (size === 0) {
        delete this.currentOrderbook[side][price];
      } else {
        this.currentOrderbook[side][price] = size;
      }
    });

    this.sendOrderbookUpdate();
  }

  private sendOrderbookUpdate() {
    const bidPrices = Object.keys(this.currentOrderbook.bids).map(parseFloat);
    const askPrices = Object.keys(this.currentOrderbook.asks).map(parseFloat);
    
    const bestBid = bidPrices.length > 0 ? Math.max(...bidPrices) : 0;
    const bestAsk = askPrices.length > 0 ? Math.min(...askPrices) : 0;
    const spread = bestAsk - bestBid;

    const update = {
      bids: this.currentOrderbook.bids,
      asks: this.currentOrderbook.asks,
      best_bid: bestBid,
      best_ask: bestAsk,
      spread: spread,
      timestamp: new Date().toISOString()
    };

    if (this.clientSocket.readyState === WebSocket.OPEN) {
      this.clientSocket.send(JSON.stringify(update));
    }
  }

  private sendErrorToClient(error: string) {
    if (this.clientSocket.readyState === WebSocket.OPEN) {
      this.clientSocket.send(JSON.stringify({ error }));
    }
  }

  private onError(error: Event) {
    console.error('Polymarket WebSocket Error:', error);
    this.sendErrorToClient('Connection to market data failed');
  }

  private onClose() {
    console.log('Polymarket WebSocket Closed');
    this.sendErrorToClient('Market data connection closed');
  }

  public stop() {
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
    return new Response(JSON.stringify({ 
      message: "Test completed",
      received_data: true,
      orderbook: {
        bids: {
          "0.65": 1250.45,
          "0.64": 2100.78,
          "0.63": 1580.23,
          "0.62": 3200.10,
          "0.61": 4500.67
        },
        asks: {
          "0.67": 1100.34,
          "0.68": 1800.56,
          "0.69": 2300.89,
          "0.70": 3100.45,
          "0.71": 4200.78
        },
        best_bid: 0.65,
        best_ask: 0.67,
        spread: 0.02,
        timestamp: new Date().toISOString()
      }
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
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
