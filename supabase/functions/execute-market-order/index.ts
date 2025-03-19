import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Enhanced CORS headers for consistency
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

// Price validation configuration
const PRICE_TOLERANCE = 0.005 // 0.5% tolerance
const RECONNECT_INTERVAL = 5000 // 5 seconds between reconnection attempts
const CONNECTION_TIMEOUT = 10000 // 10 second connection timeout

interface OrderbookState {
  bids: Record<string, number>;
  asks: Record<string, number>;
  best_bid: number;
  best_ask: number;
  spread: number;
  lastUpdated: number;
}

// Singleton WebSocket manager for orderbook data
class OrderbookManager {
  private static instance: OrderbookManager;
  private ws: WebSocket | null = null;
  private orderbooks: Map<string, OrderbookState> = new Map();
  private subscriptions: Set<string> = new Set();
  private connectionPromise: Promise<void> | null = null;
  private reconnectTimeout: number | null = null;

  private constructor() {
    // Private constructor for singleton pattern
    this.connect();
  }

  static getInstance(): OrderbookManager {
    if (!OrderbookManager.instance) {
      OrderbookManager.instance = new OrderbookManager();
    }
    return OrderbookManager.instance;
  }

  private async connect(): Promise<void> {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.ws?.close();
        this.connectionPromise = null;
        reject(new Error('WebSocket connection timeout'));
      }, CONNECTION_TIMEOUT);

      try {
        this.ws = new WebSocket("wss://ws-subscriptions-clob.polymarket.com/ws/market");

        this.ws.onopen = () => {
          console.log('WebSocket connected');
          clearTimeout(timeoutId);
          
          // Resubscribe to all active markets
          if (this.subscriptions.size > 0) {
            const subscription = {
              type: "Market",
              assets_ids: Array.from(this.subscriptions)
            };
            this.ws?.send(JSON.stringify(subscription));
            
            // Request snapshots for all markets
            for (const assetId of this.subscriptions) {
              const snapshotRequest = {
                type: "GetMarketSnapshot",
                asset_id: assetId
              };
              this.ws?.send(JSON.stringify(snapshotRequest));
            }
          }
          
          resolve();
        };

        this.ws.onmessage = this.handleMessage.bind(this);

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          this.scheduleReconnect();
        };

        this.ws.onclose = () => {
          console.log('WebSocket connection closed');
          this.ws = null;
          this.connectionPromise = null;
          this.scheduleReconnect();
        };

      } catch (error) {
        clearTimeout(timeoutId);
        this.connectionPromise = null;
        reject(error);
      }
    });

    return this.connectionPromise;
  }

  private handleMessage(event: MessageEvent) {
    if (event.data === "PONG") return;

    try {
      const events = JSON.parse(event.data);
      if (!Array.isArray(events) || events.length === 0) return;

      events.forEach(event => {
        if (event.event_type === "book") {
          const orderbook = this.processOrderbookSnapshot(event);
          if (orderbook && event.asset_id) {
            this.orderbooks.set(event.asset_id, {
              ...orderbook,
              lastUpdated: Date.now()
            });
          }
        }
      });
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
    }
  }

  private processOrderbookSnapshot(book: any): Omit<OrderbookState, 'lastUpdated'> | null {
    if (!book?.bids || !book?.asks) return null;

    const processedBook = {
      bids: {},
      asks: {},
      best_bid: 0,
      best_ask: 0,
      spread: 0
    };

    // Process bids
    book.bids.forEach(bid => {
      if (bid.price && bid.size) {
        const size = parseFloat(bid.size);
        if (size > 0) {
          processedBook.bids[bid.price] = size;
        }
      }
    });

    // Process asks
    book.asks.forEach(ask => {
      if (ask.price && ask.size) {
        const size = parseFloat(ask.size);
        if (size > 0) {
          processedBook.asks[ask.price] = size;
        }
      }
    });

    // Calculate best prices
    const bidPrices = Object.keys(processedBook.bids).map(parseFloat);
    const askPrices = Object.keys(processedBook.asks).map(parseFloat);
    
    processedBook.best_bid = bidPrices.length > 0 ? Math.max(...bidPrices) : 0;
    processedBook.best_ask = askPrices.length > 0 ? Math.min(...askPrices) : 0;
    processedBook.spread = processedBook.best_ask - processedBook.best_bid;

    return processedBook;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) return;
    
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect();
    }, RECONNECT_INTERVAL);
  }

  async subscribeToMarket(assetId: string): Promise<void> {
    if (this.subscriptions.has(assetId)) return;
    
    await this.connect();
    
    this.subscriptions.add(assetId);
    if (this.ws?.readyState === WebSocket.OPEN) {
      const subscription = {
        type: "Market",
        assets_ids: [assetId]
      };
      this.ws.send(JSON.stringify(subscription));

      const snapshotRequest = {
        type: "GetMarketSnapshot",
        asset_id: assetId
      };
      this.ws.send(JSON.stringify(snapshotRequest));
    }
  }

  async validatePrice(assetId: string, side: 'buy' | 'sell', price: number): Promise<boolean> {
    // Subscribe if not already subscribed
    await this.subscribeToMarket(assetId);

    // Wait for initial orderbook data with timeout
    const startTime = Date.now();
    while (!this.orderbooks.has(assetId)) {
      if (Date.now() - startTime > CONNECTION_TIMEOUT) {
        throw new Error('Timeout waiting for orderbook data');
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const orderbook = this.orderbooks.get(assetId);
    if (!orderbook) return false;

    // Check if orderbook data is stale (older than 30 seconds)
    if (Date.now() - orderbook.lastUpdated > 30000) {
      throw new Error('Orderbook data is stale');
    }

    const referencePrice = side === 'buy' ? orderbook.best_ask : orderbook.best_bid;
    return Math.abs(price - referencePrice) <= PRICE_TOLERANCE;
  }
}

serve(async (req) => {
  console.log(`[execute-market-order] Request received: ${req.method} ${new URL(req.url).pathname}`);
  
  if (req.method === 'OPTIONS') {
    console.log('[execute-market-order] Handling CORS preflight request');
    return new Response(null, { headers: corsHeaders });
  }

  // Get API key from request - check multiple sources for flexibility
  const apiKey = req.headers.get('apikey') || 
                req.headers.get('Authorization')?.split(' ')[1] ||
                new URL(req.url).searchParams.get('apikey');
                
  // Validate API key
  if (!apiKey) {
    console.error('[execute-market-order] No API key provided');
    return new Response(
      JSON.stringify({ error: 'API key is required' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const { user_id, market_id, token_id, outcome, side, size, price } = await req.json();
    console.log('Executing market order:', { user_id, market_id, token_id, outcome, side, size, price });

    // Validate required parameters
    if (!user_id || !market_id || !token_id || !outcome || !side || !size || !price) {
      throw new Error('Missing required parameters');
    }

    // Get orderbook manager instance
    const orderbookManager = OrderbookManager.getInstance();

    // Validate price using shared orderbook connection
    const priceIsValid = await orderbookManager.validatePrice(token_id, side, price);
    if (!priceIsValid) {
      throw new Error('Price has moved unfavorably');
    }

    // Execute order in database
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data, error } = await supabaseClient.rpc('execute_market_order', {
      p_user_id: user_id,
      p_market_id: market_id,
      p_token_id: token_id,
      p_outcome: outcome,
      p_side: side,
      p_size: size,
      p_price: price
    });

    if (error) throw error;

    return new Response(
      JSON.stringify({ success: true, order_id: data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error executing market order:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
