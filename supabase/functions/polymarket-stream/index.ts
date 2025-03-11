
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import WebSocket from "npm:ws@8.13.0";

console.log("Polymarket Stream v2.0.1");

class PolymarketStream {
  private wsUrl = "wss://ws-subscriptions-clob.polymarket.com/ws/market";
  private ws: WebSocket | null = null;
  private orderbook = {
    bids: {},
    asks: {},
    best_bid: null,
    best_ask: null,
    spread: null,
    timestamp: null
  };

  constructor(private tokenId: string) {}

  async connect(): Promise<any> {
    return new Promise((resolve, reject) => {
      let timer = setTimeout(() => {
        this.ws?.close();
        resolve({
          status: "timeout",
          message: "Connection timed out after 5 seconds",
          timestamp: new Date().toISOString()
        });
      }, 5000);

      try {
        this.ws = new WebSocket(this.wsUrl, {
          rejectUnauthorized: false,
          perMessageDeflate: false
        });

        this.ws.on('open', () => {
          console.log('WebSocket connected to Polymarket');
          
          // Subscribe to market data
          const subscription = {
            type: "Market",
            assets_ids: [this.tokenId]
          };
          this.ws.send(JSON.stringify(subscription));
          
          // Request initial snapshot
          const snapshotRequest = {
            type: "GetMarketSnapshot",
            asset_id: this.tokenId
          };
          this.ws.send(JSON.stringify(snapshotRequest));
          
          console.log(`Sent subscription and snapshot request for token: ${this.tokenId}`);
        });

        this.ws.on('message', (data) => {
          const message = data.toString();
          if (message === "PONG") return;
          
          try {
            const events = JSON.parse(message);
            if (!Array.isArray(events) || events.length === 0) return;
            
            let updatedOrderbook = false;
            
            events.forEach(event => {
              if (event.event_type === "book") {
                // Process orderbook snapshot
                this.handleOrderbookSnapshot(event);
                updatedOrderbook = true;
                console.log("Received orderbook snapshot");
              } else if (event.event_type === "price_change") {
                this.handleLevelUpdate(event);
                updatedOrderbook = true;
                console.log("Received price change update");
              }
            });
            
            if (updatedOrderbook) {
              console.log("Updated orderbook:", {
                best_bid: this.orderbook.best_bid,
                best_ask: this.orderbook.best_ask,
                bid_levels: Object.keys(this.orderbook.bids).length,
                ask_levels: Object.keys(this.orderbook.asks).length
              });
              
              // We have a complete orderbook now, resolve the promise
              if (this.orderbook.best_bid !== null || this.orderbook.best_ask !== null) {
                clearTimeout(timer);
                this.ws?.close();
                resolve(this.orderbook);
              }
            }
          } catch (error) {
            console.error('Error processing message:', error);
          }
        });

        this.ws.on('error', (error) => {
          console.error('WebSocket Error:', error);
          clearTimeout(timer);
          reject(new Error(`WebSocket error: ${error.message}`));
        });

        this.ws.on('close', () => {
          console.log('WebSocket connection closed');
          clearTimeout(timer);
        });

      } catch (error) {
        console.error('Error establishing WebSocket connection:', error);
        clearTimeout(timer);
        reject(error);
      }
    });
  }

  private handleOrderbookSnapshot(book: any) {
    // Reset orderbook for snapshot
    this.orderbook.bids = {};
    this.orderbook.asks = {};
    
    // Process bids
    if (Array.isArray(book.bids)) {
      book.bids.forEach(bid => {
        if (bid.price && bid.size) {
          const size = parseFloat(bid.size);
          if (size > 0) {
            this.orderbook.bids[bid.price] = size;
          }
        }
      });
    }
    
    // Process asks
    if (Array.isArray(book.asks)) {
      book.asks.forEach(ask => {
        if (ask.price && ask.size) {
          const size = parseFloat(ask.size);
          if (size > 0) {
            this.orderbook.asks[ask.price] = size;
          }
        }
      });
    }

    this.updateBestPrices();
  }

  private handleLevelUpdate(event: any) {
    event.changes.forEach(change => {
      const price = change.price;
      const size = parseFloat(change.size);
      const side = change.side === 'BUY' ? 'bids' : 'asks';
      
      // Update orderbook state
      if (size === 0) {
        delete this.orderbook[side][price];
      } else {
        this.orderbook[side][price] = size;
      }
    });

    this.updateBestPrices();
  }

  private updateBestPrices() {
    const bidPrices = Object.keys(this.orderbook.bids).map(p => parseFloat(p));
    const askPrices = Object.keys(this.orderbook.asks).map(p => parseFloat(p));

    this.orderbook.best_bid = bidPrices.length > 0 ? Math.max(...bidPrices) : null;
    this.orderbook.best_ask = askPrices.length > 0 ? Math.min(...askPrices) : null;
    this.orderbook.spread = (this.orderbook.best_bid && this.orderbook.best_ask) 
      ? (this.orderbook.best_ask - this.orderbook.best_bid).toFixed(5) 
      : null;
    this.orderbook.timestamp = new Date().toISOString();
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      }
    });
  }

  try {
    const { tokenId } = await req.json();
    
    if (!tokenId) {
      throw new Error('tokenId is required');
    }

    console.log(`Starting Polymarket stream for token: ${tokenId}`);
    
    const stream = new PolymarketStream(tokenId);
    const orderBookData = await stream.connect();
    
    return new Response(
      JSON.stringify(orderBookData),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );
    
  } catch (error) {
    console.error('Request error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        }
      }
    );
  }
});
