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

  async validateOrder(
    userId: string,
    marketId: string,
    tokenId: string,
    outcome: string,
    side: typeof OrderSide[keyof typeof OrderSide],
    orderType: typeof OrderType[keyof typeof OrderType],
    size: number
  ) {
    try {
      const { data: market } = await supabase
        .from('markets')
        .select('active, closed, archived')
        .eq('id', marketId)
        .single();
      
      if (!market) {
        throw new Error('Market not found');
      }
      
      if (!market.active || market.closed || market.archived) {
        throw new Error('Market is not active');
      }

      if (side === OrderSide.SELL) {
        const { data: holdings } = await supabase
          .from('holdings')
          .select('amount')
          .eq('user_id', userId)
          .eq('market_id', marketId)
          .eq('token_id', tokenId)
          .single();
        
        const currentHoldings = holdings ? new Decimal(holdings.amount) : new Decimal(0);
        if (currentHoldings.lessThan(size)) {
          throw new Error(`Insufficient holdings. Have: ${currentHoldings}, Need: ${size}`);
        }
      } else {
        const { data: profile } = await supabase
          .from('profiles')
          .select('balance')
          .eq('id', userId)
          .single();
        
        if (!profile) {
          throw new Error('Profile not found');
        }
        
        const balance = new Decimal(profile.balance);
        
        if (orderType === OrderType.MARKET) {
          const book = await this.getOrderbookSnapshot(tokenId);
          const levels = book.asks;
          
          if (!levels.length) {
            throw new Error('No liquidity in orderbook');
          }
          
          let remaining = new Decimal(size);
          let totalCost = new Decimal(0);
          
          for (const level of levels) {
            if (remaining.lte(0)) break;
            const fillSize = Decimal.min(remaining, level.size);
            totalCost = totalCost.plus(fillSize.times(level.price));
            remaining = remaining.minus(fillSize);
          }
          
          if (remaining.gt(0)) {
            throw new Error('Insufficient liquidity');
          }
          
          if (totalCost.gt(balance)) {
            throw new Error('Insufficient balance for worst-case fill');
          }
        }
      }

      return true;
    } catch (err) {
      console.error('Order validation error:', err);
      throw err;
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
      // Validate the order
      await this.validateOrder(userId, marketId, tokenId, outcome, side, OrderType.MARKET, size);
      
      // Get orderbook snapshot for execution
      const book = await this.getOrderbookSnapshot(tokenId);
      
      let remainingSize = new Decimal(size);
      let totalCost = new Decimal(0);
      let filledSize = new Decimal(0);
      
      const levels = side === OrderSide.BUY ? book.asks : book.bids;
      
      // Calculate fills
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

      // Start a Supabase transaction using RPC
      const { data: result, error } = await supabase.rpc('execute_market_order', {
        p_user_id: userId,
        p_market_id: marketId,
        p_token_id: tokenId,
        p_outcome: outcome,
        p_side: side,
        p_size: filledSize.toString(),
        p_price: avgPrice.toString(),
        p_total_cost: totalCost.toString()
      });

      if (error) {
        throw error;
      }

      return {
        success: true,
        filledSize: filledSize.toNumber(),
        avgPrice: avgPrice.toNumber(),
        remainingSize: remainingSize.toNumber(),
        orderId: result.order_id
      };
    } catch (err) {
      console.error('Market order execution error:', err);
      throw err;
    }
  }
}

export const orderManager = new OrderManager();