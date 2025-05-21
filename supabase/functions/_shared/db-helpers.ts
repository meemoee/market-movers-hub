
// Helper functions for database operations

export type Market = {
  market_id: string;
  event_id: string;
  event_title: string;
  question: string;
  description: string;
  yes_price?: number;
  no_price?: number;
  best_bid?: number;
  best_ask?: number;
  last_traded_price?: number;
  volume?: number;
  liquidity?: number;
};

export type RelatedMarket = {
  market_id: string;
  event_id: string;
  question: string;
  yes_price?: number;
  no_price?: number;
  best_bid?: number;
  best_ask?: number;
  last_traded_price?: number;
  volume?: number;
  liquidity?: number;
};

// Function to get latest prices for markets
export async function getMarketsWithLatestPrices(
  supabaseClient: any,
  marketIds: string[]
): Promise<Market[]> {
  try {
    console.log(`[DB] Getting market details for ${marketIds.length} markets`);
    
    // Get markets with join to events and latest price data
    const { data, error } = await supabaseClient
      .from('markets')
      .select(`
        id,
        event_id,
        question,
        description,
        events!inner (
          title
        )
      `)
      .in('id', marketIds)
      .eq('active', true)
      .eq('closed', false)
      .eq('archived', false);
      
    if (error) {
      console.error('[DB] Error fetching markets:', error);
      throw error;
    }
    
    if (!data || data.length === 0) {
      console.log('[DB] No active markets found matching the criteria');
      return [];
    }
    
    console.log(`[DB] Found ${data.length} markets, fetching price data`);
    
    // Get latest price data for these markets
    const { data: priceData, error: priceError } = await supabaseClient
      .from('market_prices')
      .select(`
        market_id,
        yes_price,
        no_price,
        best_bid,
        best_ask,
        last_traded_price,
        volume,
        liquidity
      `)
      .in('market_id', marketIds)
      .order('timestamp', { ascending: false });
      
    if (priceError) {
      console.error('[DB] Error fetching price data:', priceError);
      throw priceError;
    }
    
    // Map price data to markets
    const priceByMarket: Record<string, any> = {};
    for (const price of priceData || []) {
      if (!priceByMarket[price.market_id]) {
        priceByMarket[price.market_id] = price;
      }
    }
    
    console.log(`[DB] Found price data for ${Object.keys(priceByMarket).length} markets`);
    
    // Combine market and price data
    return (data || []).map(market => ({
      market_id: market.id,
      event_id: market.event_id,
      event_title: market.events.title,
      question: market.question,
      description: market.description,
      ...priceByMarket[market.id]
    }));
  } catch (error) {
    console.error('Error getting markets with prices:', error);
    throw error;
  }
}

// Function to get related markets with prices
export async function getRelatedMarketsWithPrices(
  supabaseClient: any,
  eventIds: string[]
): Promise<RelatedMarket[]> {
  try {
    console.log(`[DB] Getting related markets for ${eventIds.length} events`);
    
    // Get markets in the same events
    const { data, error } = await supabaseClient
      .from('markets')
      .select(`
        id,
        event_id,
        question
      `)
      .in('event_id', eventIds)
      .eq('active', true)
      .eq('closed', false)
      .eq('archived', false);
      
    if (error) {
      console.error('[DB] Error fetching related markets:', error);
      throw error;
    }
    
    if (!data || data.length === 0) {
      console.log('[DB] No related markets found');
      return [];
    }
    
    const marketIds = data.map(m => m.id);
    console.log(`[DB] Found ${marketIds.length} related markets, fetching price data`);
    
    // Get latest price data for these markets
    const { data: priceData, error: priceError } = await supabaseClient
      .from('market_prices')
      .select(`
        market_id,
        yes_price,
        no_price,
        best_bid,
        best_ask,
        last_traded_price,
        volume,
        liquidity
      `)
      .in('market_id', marketIds)
      .order('timestamp', { ascending: false });
      
    if (priceError) {
      console.error('[DB] Error fetching price data for related markets:', priceError);
      throw priceError;
    }
    
    // Map price data to markets
    const priceByMarket: Record<string, any> = {};
    for (const price of priceData || []) {
      if (!priceByMarket[price.market_id]) {
        priceByMarket[price.market_id] = price;
      }
    }
    
    console.log(`[DB] Found price data for ${Object.keys(priceByMarket).length} related markets`);
    
    // Combine market and price data
    return (data || []).map(market => ({
      market_id: market.id,
      event_id: market.event_id,
      question: market.question,
      ...priceByMarket[market.id]
    }));
  } catch (error) {
    console.error('Error getting related markets with prices:', error);
    throw error;
  }
}
