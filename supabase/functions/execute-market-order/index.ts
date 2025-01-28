import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Shared CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Orderbook validation configuration
const PRICE_TOLERANCE = 0.005 // 0.5% tolerance
const ORDERBOOK_TIMEOUT = 5000 // 5 seconds

// Polymarket WebSocket handler for real-time orderbook data
class PolymarketOrderbook {
  private ws: WebSocket | null = null
  private orderbook: any = null
  private isConnected: boolean = false
  private connectPromise: Promise<void> | null = null

  constructor(private readonly assetId: string) {}

  async connect(): Promise<void> {
    if (this.connectPromise) {
      return this.connectPromise
    }

    this.connectPromise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('WebSocket connection timeout'))
      }, ORDERBOOK_TIMEOUT)

      try {
        this.ws = new WebSocket("wss://ws-subscriptions-clob.polymarket.com/ws/market")

        this.ws.onopen = () => {
          console.log('Connected to Polymarket WebSocket')
          const subscription = {
            type: "Market",
            assets_ids: [this.assetId]
          }
          this.ws?.send(JSON.stringify(subscription))

          const snapshotRequest = {
            type: "GetMarketSnapshot",
            asset_id: this.assetId
          }
          this.ws?.send(JSON.stringify(snapshotRequest))
        }

        this.ws.onmessage = (event) => {
          if (event.data === "PONG") return

          try {
            const events = JSON.parse(event.data)
            if (!Array.isArray(events) || events.length === 0) return

            events.forEach(event => {
              if (event.event_type === "book") {
                this.orderbook = this.processOrderbookSnapshot(event)
                if (!this.isConnected) {
                  this.isConnected = true
                  clearTimeout(timeoutId)
                  resolve()
                }
              }
            })
          } catch (error) {
            console.error('Error processing WebSocket message:', error)
          }
        }

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error)
          reject(error)
        }

        this.ws.onclose = () => {
          console.log('WebSocket connection closed')
          this.isConnected = false
        }

      } catch (error) {
        clearTimeout(timeoutId)
        reject(error)
      }
    })

    return this.connectPromise
  }

  private processOrderbookSnapshot(book: any) {
    const processedBook = {
      bids: {},
      asks: {},
      best_bid: 0,
      best_ask: 0,
      spread: 0
    }

    // Process bids
    if (Array.isArray(book.bids)) {
      book.bids.forEach(bid => {
        if (bid.price && bid.size) {
          const size = parseFloat(bid.size)
          if (size > 0) {
            processedBook.bids[bid.price] = size
          }
        }
      })
    }

    // Process asks
    if (Array.isArray(book.asks)) {
      book.asks.forEach(ask => {
        if (ask.price && ask.size) {
          const size = parseFloat(ask.size)
          if (size > 0) {
            processedBook.asks[ask.price] = size
          }
        }
      })
    }

    // Calculate best prices
    const bidPrices = Object.keys(processedBook.bids).map(parseFloat)
    const askPrices = Object.keys(processedBook.asks).map(parseFloat)
    
    processedBook.best_bid = bidPrices.length > 0 ? Math.max(...bidPrices) : 0
    processedBook.best_ask = askPrices.length > 0 ? Math.min(...askPrices) : 0
    processedBook.spread = processedBook.best_ask - processedBook.best_bid

    return processedBook
  }

  validatePrice(side: 'buy' | 'sell', price: number): boolean {
    if (!this.orderbook) return false

    const referencePrice = side === 'buy' ? this.orderbook.best_ask : this.orderbook.best_bid
    return Math.abs(price - referencePrice) <= PRICE_TOLERANCE
  }

  cleanup() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.close()
    }
  }
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  let orderbookHandler: PolymarketOrderbook | null = null

  try {
    const { user_id, market_id, token_id, outcome, side, size, price } = await req.json()
    console.log('Executing market order:', { user_id, market_id, token_id, outcome, side, size, price })

    // Validate required parameters
    if (!user_id || !market_id || !token_id || !outcome || !side || !size || !price) {
      throw new Error('Missing required parameters')
    }

    // Connect to orderbook and validate price
    orderbookHandler = new PolymarketOrderbook(token_id)
    await orderbookHandler.connect()

    const priceIsValid = orderbookHandler.validatePrice(side, price)
    if (!priceIsValid) {
      throw new Error('Price has moved unfavorably')
    }

    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Execute the order using database function
    const { data, error } = await supabaseClient.rpc('execute_market_order', {
      p_user_id: user_id,
      p_market_id: market_id,
      p_token_id: token_id,
      p_outcome: outcome,
      p_side: side,
      p_size: size,
      p_price: price
    })

    if (error) {
      console.error('Database error:', error)
      throw error
    }

    console.log('Order executed successfully:', data)

    return new Response(
      JSON.stringify({ success: true, order_id: data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error executing market order:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  } finally {
    // Cleanup WebSocket connection
    if (orderbookHandler) {
      orderbookHandler.cleanup()
    }
  }
})
