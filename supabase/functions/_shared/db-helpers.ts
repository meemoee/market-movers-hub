
// Helper functions for database operations

export type Market = {
  market_id: string;
  event_id: string;
  event_title: string;
  question: string;
  description: string;
  image?: string; // Added image field
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
    console.log(`[DB] Market IDs sample: ${marketIds.slice(0, 3).join(', ')}${marketIds.length > 3 ? '...' : ''}`);
    
    const startTime = Date.now();
    
    // Limit market IDs to prevent timeouts
    const limitedMarketIds = marketIds.slice(0, 30);
    console.log(`[DB] Processing ${limitedMarketIds.length} markets (limited from ${marketIds.length})`);
    
    // Get markets with join to events and latest price data
    const { data, error } = await supabaseClient
      .from('markets')
      .select(`
        id,
        event_id,
        question,
        description,
        image,
        events!inner (
          title
        )
      `)
      .in('id', limitedMarketIds)
      .eq('active', true)
      .eq('closed', false)
      .eq('archived', false)
      .limit(30); // Add explicit limit
      
    const marketQueryTime = Date.now() - startTime;
    console.log(`[DB] Markets query took ${marketQueryTime}ms`);
    
    if (error) {
      console.error('[DB] Error fetching markets:', error);
      console.error(`[DB] Query failed after ${marketQueryTime}ms`);
      throw error;
    }
    
    if (!data || data.length === 0) {
      console.log('[DB] No active markets found matching the criteria');
      return [];
    }
    
    console.log(`[DB] Found ${data.length} markets, fetching price data`);
    
    // Get latest price data for these markets
    const priceStartTime = Date.now();
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
      .in('market_id', limitedMarketIds)
      .order('timestamp', { ascending: false })
      .limit(1000); // Limit price records to prevent timeout
      
    const priceQueryTime = Date.now() - priceStartTime;
    console.log(`[DB] Price query took ${priceQueryTime}ms`);
    
    if (priceError) {
      console.error('[DB] Error fetching price data:', priceError);
      console.error(`[DB] Price query failed after ${priceQueryTime}ms`);
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
      image: market.image, // Include image in the results
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
    console.log(`[DB] Event IDs sample: ${eventIds.slice(0, 3).join(', ')}${eventIds.length > 3 ? '...' : ''}`);
    
    const startTime = Date.now();
    
    // Limit event IDs to prevent timeouts - reduced to 5 events for better performance
    const limitedEventIds = eventIds.slice(0, 5);
    console.log(`[DB] Processing ${limitedEventIds.length} events (limited from ${eventIds.length})`);
    
    // Get markets in the same events - limit to 10 markets total
    const { data, error } = await supabaseClient
      .from('markets')
      .select(`
        id,
        event_id,
        question
      `)
      .in('event_id', limitedEventIds)
      .eq('active', true)
      .eq('closed', false)
      .eq('archived', false)
      .limit(10); // Reduced limit for better performance
      
    const marketQueryTime = Date.now() - startTime;
    console.log(`[DB] Related markets query took ${marketQueryTime}ms`);
      
    if (error) {
      console.error('[DB] Error fetching related markets:', error);
      console.error(`[DB] Query failed after ${marketQueryTime}ms`);
      throw error;
    }
    
    if (!data || data.length === 0) {
      console.log('[DB] No related markets found');
      return [];
    }
    
    const marketIds = data.map(m => m.id);
    console.log(`[DB] Found ${marketIds.length} related markets, fetching price data`);
    
    // Get latest price data using efficient DISTINCT ON approach
    const priceStartTime = Date.now();
    let priceByMarket: Record<string, any> = {};
    
    try {
      console.log(`[DB] Executing efficient price query for ${marketIds.length} markets`);
      
      // Use raw SQL with DISTINCT ON for maximum efficiency
      const { data: priceData, error: priceError } = await supabaseClient
        .rpc('get_latest_prices_for_markets', {
          market_ids: marketIds
        });
      
      const priceQueryTime = Date.now() - priceStartTime;
      console.log(`[DB] Efficient price query took ${priceQueryTime}ms`);
      
      if (priceError) {
        console.warn(`[DB] Efficient price query failed after ${priceQueryTime}ms:`, priceError);
        console.log('[DB] Falling back to basic price query');
        
        // Fallback to basic query with very limited results
        const fallbackStartTime = Date.now();
        const { data: fallbackData, error: fallbackError } = await supabaseClient
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
          .in('market_id', marketIds.slice(0, 5)) // Only first 5 markets for fallback
          .order('timestamp', { ascending: false })
          .limit(50); // Very small limit for fallback
          
        const fallbackTime = Date.now() - fallbackStartTime;
        console.log(`[DB] Fallback price query took ${fallbackTime}ms`);
        
        if (!fallbackError && fallbackData) {
          for (const price of fallbackData) {
            if (!priceByMarket[price.market_id]) {
              priceByMarket[price.market_id] = price;
            }
          }
          console.log(`[DB] Fallback found price data for ${Object.keys(priceByMarket).length} markets`);
        } else {
          console.warn('[DB] Both efficient and fallback price queries failed, continuing without prices');
        }
      } else {
        // Process efficient query results
        for (const price of priceData || []) {
          priceByMarket[price.market_id] = price;
        }
        console.log(`[DB] Efficient query found price data for ${Object.keys(priceByMarket).length} markets`);
      }
    } catch (queryError) {
      const priceQueryTime = Date.now() - priceStartTime;
      console.warn(`[DB] Price query exception after ${priceQueryTime}ms:`, queryError);
      console.log('[DB] Continuing without price data due to query timeout/error');
    }
    
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
