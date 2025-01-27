import { Decimal } from 'decimal.js';
import { supabase } from '@/integrations/supabase/client';

export const OrderType = {
  MARKET: 'market',
  LIMIT: 'limit'
} as const;

export const OrderSide = {
  BUY: 'buy',
  SELL: 'sell'
} as const;

interface OrderBookLevel {
  price: Decimal;
  size: Decimal;
}

class OrderBook {
  asks: OrderBookLevel[];
  bids: OrderBookLevel[];
  spread: Decimal | null;
  mid: Decimal | null;

  constructor(bids: OrderBookLevel[], asks: OrderBookLevel[]) {
    this.asks = asks.sort((a, b) => a.price.minus(b.price).toNumber());
    this.bids = bids.sort((a, b) => b.price.minus(a.price).toNumber());
    
    if (this.asks.length && this.bids.length) {
      this.spread = this.asks[0].price.minus(this.bids[0].price);
      this.mid = this.asks[0].price.plus(this.bids[0].price).div(2);
    } else {
      this.spread = null;
      this.mid = null;
    }
  }
}

export class OrderManager {
  private async getOrderbookSnapshot(tokenId: string): Promise<OrderBook> {
    try {
      const response = await fetch(`https://clob.polymarket.com/orderbook/${tokenId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch orderbook');
      }
      
      const rawBook = await response.json();
      
      const bids = rawBook.bids.map((bid: any) => ({
        price: new Decimal(bid.price),
        size: new Decimal(bid.size)
      }));
      
      const asks = rawBook.asks.map((ask: any) => ({
        price: new Decimal(ask.price),
        size: new Decimal(ask.size)
      }));
      
      return new OrderBook(bids, asks);
    } catch (err) {
      console.error('Orderbook snapshot error:', err);
      throw new Error(`Error getting orderbook: ${err.message}`);
    }
  }

  async executeMarketOrder(
    userId: string,
    marketId: string,
    tokenId: string,
    outcome: string,
    side: typeof OrderSide[keyof typeof OrderSide],
    size: number
  ) {
    try {
      const book = await this.getOrderbookSnapshot(tokenId);
      const levels = side === OrderSide.BUY ? book.asks : book.bids;
      
      let remainingSize = new Decimal(size);
      let totalCost = new Decimal(0);
      let filledSize = new Decimal(0);
      
      for (const level of levels) {
        if (remainingSize.lte(0)) break;
        const fillSize = Decimal.min(remainingSize, level.size);
        totalCost = totalCost.plus(fillSize.times(level.price));
        filledSize = filledSize.plus(fillSize);
        remainingSize = remainingSize.minus(fillSize);
      }
      
      if (filledSize.eq(0)) {
        throw new Error('Could not fill any quantity');
      }
      
      if (remainingSize.gt(0)) {
        throw new Error('Partial fill only - insufficient liquidity');
      }
      
      const avgPrice = totalCost.div(filledSize);

      // Execute the order through a custom function
      const { data, error } = await supabase.functions.invoke('execute-market-order', {
        body: {
          userId,
          marketId,
          tokenId,
          outcome,
          side,
          size: filledSize.toString(),
          price: avgPrice.toString(),
          totalCost: totalCost.toString()
        }
      });

      if (error) throw error;
      
      return {
        success: true,
        filledSize: filledSize.toNumber(),
        avgPrice: avgPrice.toNumber(),
        remainingSize: remainingSize.toNumber(),
        orderId: data.orderId
      };
    } catch (err) {
      console.error('Market order execution error:', err);
      throw err;
    }
  }
}

export const orderManager = new OrderManager();