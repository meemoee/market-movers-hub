
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
  price_change?: number;
  volume_change?: number;
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
// Helper function to clean text fields (same as top movers)
function cleanTextFields(market: any) {
  const fieldsToClean = ['question', 'subtitle', 'yes_sub_title', 'no_sub_title', 'description', 'event_title'];
  
  fieldsToClean.forEach(field => {
    if (market[field]) {
      // Replace multiple apostrophes with a single one
      market[field] = market[field].replace(/'{2,}/g, "'");
    }
  });
  
  return market;
}

export async function getRelatedMarketsWithPrices(
  supabaseClient: any,
  eventIds: string[]
): Promise<RelatedMarket[]> {
  let redis;
  try {
    console.log(`[REDIS] ===== STARTING getRelatedMarketsWithPrices =====`);
    console.log(`[REDIS] Getting related markets for ${eventIds.length} events using Redis cache`);
    console.log(`[REDIS] Event IDs sample: ${eventIds.slice(0, 3).join(', ')}${eventIds.length > 3 ? '...' : ''}`);
    
    const startTime = Date.now();
    
    // Connect to Redis (same as top movers)
    const redisUrl = Deno.env.get('REDIS_URL');
    if (!redisUrl) {
      console.log('[REDIS] REDIS_URL not found, falling back to database query');
      console.log('[REDIS] ===== FALLING BACK TO DATABASE =====');
      return await getRelatedMarketsWithPricesFromDB(supabaseClient, eventIds);
    }

    const { connect } = await import("https://deno.land/x/redis@v0.29.0/mod.ts");
    redis = await connect({
      hostname: new URL(redisUrl).hostname,
      port: parseInt(new URL(redisUrl).port),
      password: new URL(redisUrl).password,
      tls: redisUrl.startsWith('rediss://')
    });
    
    console.log('[REDIS] Connected to Redis successfully');
    
    // First get related market IDs from database (quick query)
    const limitedEventIds = eventIds.slice(0, 5);
    const { data: markets, error } = await supabaseClient
      .from('markets')
      .select('id, event_id, question')
      .in('event_id', limitedEventIds)
      .eq('active', true)
      .eq('closed', false)
      .eq('archived', false)
      .limit(15);
      
    if (error || !markets?.length) {
      console.log('[REDIS] No related markets found in database');
      await redis?.close();
      return [];
    }
    
    const marketIds = markets.map(m => m.id);
    console.log(`[REDIS] Found ${marketIds.length} related markets, fetching from Redis cache`);
    
    // Get market data from Redis cache (same approach as top movers)
    const relatedMarkets = [];
    const intervals = ['1440', '5', '10', '30', '60', '240', '480', '10080'];
    let cacheTimestamp = null;
    
    for (const interval of intervals) {
      const latestKey = await redis.get(`topMovers:${interval}:latest`);
      if (!latestKey) continue;
      
      const manifestKey = `topMovers:${interval}:${latestKey}:manifest`;
      const manifestData = await redis.get(manifestKey);
      if (!manifestData) continue;
      
      const manifest = JSON.parse(manifestData);
      
      // Check cache freshness (flag if over 1 hour old)
      if (manifest.timestamp) {
        cacheTimestamp = new Date(manifest.timestamp);
        const ageMinutes = (Date.now() - cacheTimestamp.getTime()) / (1000 * 60);
        if (ageMinutes > 60) {
          console.log(`[REDIS] Cache is ${Math.round(ageMinutes)} minutes old (interval: ${interval})`);
        }
      }
      
      // Search through chunks for our market IDs
      for (let i = 0; i < manifest.chunks; i++) {
        const chunkKey = `topMovers:${interval}:${latestKey}:chunk:${i}`;
        const chunkData = await redis.get(chunkKey);
        if (chunkData) {
          const cacheMarkets = JSON.parse(chunkData);
          // Find markets that match our related market IDs
          const foundMarkets = cacheMarkets
            .filter(m => marketIds.includes(m.market_id))
            .map(cleanTextFields);
          
          for (const foundMarket of foundMarkets) {
            // Avoid duplicates
            if (!relatedMarkets.find(m => m.market_id === foundMarket.market_id)) {
              // Transform to RelatedMarket format
              const relatedMarket = {
                market_id: foundMarket.market_id,
                event_id: markets.find(m => m.id === foundMarket.market_id)?.event_id,
                question: foundMarket.question,
                yes_price: foundMarket.yes_price,
                no_price: foundMarket.no_price,
                best_bid: foundMarket.best_bid,
                best_ask: foundMarket.best_ask,
                last_traded_price: foundMarket.final_last_traded_price || foundMarket.last_traded_price,
                volume: foundMarket.volume,
                liquidity: foundMarket.liquidity,
                price_change: foundMarket.price_change,
                volume_change: foundMarket.volume_change
              };
              console.log(`[REDIS] Found market ${relatedMarket.market_id} with CACHED price ${relatedMarket.last_traded_price}, change ${relatedMarket.price_change}%`);
              relatedMarkets.push(relatedMarket);
            }
          }
        }
      }
      
      // If we found enough markets, break early
      if (relatedMarkets.length >= 10) break;
    }
    
    await redis.close();
    
    const redisTime = Date.now() - startTime;
    console.log(`[REDIS] Redis lookup took ${redisTime}ms, found ${relatedMarkets.length} markets with cached data`);
    
    // Verify active status of cached markets
    if (relatedMarkets.length > 0) {
      const cachedMarketIds = relatedMarkets.map(m => m.market_id);
      const { data: activeCheck } = await supabaseClient
        .from('markets')
        .select('id')
        .in('id', cachedMarketIds)
        .eq('active', true)
        .eq('closed', false)
        .eq('archived', false);
      
      const activeMarketIds = new Set(activeCheck?.map(m => m.id) || []);
      const activeRelatedMarkets = relatedMarkets.filter(m => {
        const isActive = activeMarketIds.has(m.market_id);
        if (!isActive) {
          console.log(`[REDIS] Filtering out inactive market: ${m.market_id}`);
        }
        return isActive;
      });
      
      console.log(`[REDIS] After active verification: ${activeRelatedMarkets.length} of ${relatedMarkets.length} markets are still active`);
      
      if (activeRelatedMarkets.length >= 3) {
        console.log(`[REDIS] ===== RETURNING ${activeRelatedMarkets.length} CACHED MARKETS =====`);
        activeRelatedMarkets.forEach(m => console.log(`[REDIS] Returning cached market ${m.market_id} with price ${m.last_traded_price}`));
        return activeRelatedMarkets.slice(0, 10);
      }
      
      // Continue to database fallback if we don't have enough active markets
      relatedMarkets.length = 0;
      relatedMarkets.push(...activeRelatedMarkets);
    }
    
    // If we didn't find enough markets in cache, supplement with database query
    const foundMarketIds = relatedMarkets.map(m => m.market_id);
    const missingMarketIds = marketIds.filter(id => !foundMarketIds.includes(id));
    
    if (missingMarketIds.length > 0 && relatedMarkets.length < 5) {
      console.log(`[REDIS] Found ${missingMarketIds.length} markets not in cache, supplementing with database`);
      console.log(`[REDIS] Missing market IDs: ${missingMarketIds.slice(0, 5).join(', ')}`);
      console.log(`[REDIS] ===== CALLING DATABASE FALLBACK =====`);
      const dbMarkets = await getRelatedMarketsWithPricesFromDB(
        supabaseClient, 
        eventIds,
        missingMarketIds.slice(0, 5) // Limit to avoid timeouts
      );
      console.log(`[REDIS] Database returned ${dbMarkets.length} markets`);
      dbMarkets.forEach(m => console.log(`[REDIS] DB returned market ${m.market_id} with price ${m.last_traded_price}`));
      relatedMarkets.push(...dbMarkets);
    }
    
    console.log(`[REDIS] ===== FINAL RESULT: ${relatedMarkets.length} related markets found =====`);
    relatedMarkets.forEach(m => console.log(`[REDIS] Final market ${m.market_id} with price ${m.last_traded_price}`));
    return relatedMarkets.slice(0, 10); // Return max 10 markets
    
  } catch (error) {
    console.error('[REDIS] Error getting related markets from Redis:', error);
    await redis?.close();
    // Fallback to database query
    console.log('[REDIS] ===== ERROR FALLBACK TO DATABASE =====');
    return await getRelatedMarketsWithPricesFromDB(supabaseClient, eventIds);
  }
}

// Fallback function for database queries with real price data
async function getRelatedMarketsWithPricesFromDB(
  supabaseClient: any,
  eventIds: string[],
  specificMarketIds?: string[]
): Promise<RelatedMarket[]> {
  console.log('[DB] ===== STARTING getRelatedMarketsWithPricesFromDB =====');
  try {
    console.log('[DB] Falling back to database query for related markets');
    const startTime = Date.now();
    
    const limitedEventIds = eventIds.slice(0, 3);
    let query = supabaseClient
      .from('markets')
      .select('id, event_id, question')
      .in('event_id', limitedEventIds)
      .eq('active', true)
      .eq('closed', false)
      .eq('archived', false)
      .limit(5);
    
    if (specificMarketIds?.length) {
      query = query.in('id', specificMarketIds);
    }
    
    const { data: markets, error } = await query;
      
    if (error || !markets?.length) {
      console.log('[DB] No related markets found');
      return [];
    }
    
    console.log(`[DB] Found ${markets.length} markets, fetching real price data`);
    
    // Use direct market_prices query with better timeout and fallback
    const marketIds = markets.map(m => m.id);
    
    try {
      console.log(`[DB] Fetching prices for markets: ${marketIds.join(', ')}`);
      
      // Try the optimized RPC function first
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('RPC timeout')), 3000)
      );
      
      const rpcPromise = supabaseClient.rpc('get_latest_prices_for_markets', {
        market_ids: marketIds
      });
      
      let priceData;
      let priceError;
      
      try {
        const result = await Promise.race([rpcPromise, timeoutPromise]);
        priceData = result.data;
        priceError = result.error;
        console.log(`[DB] RPC query completed, found ${priceData?.length || 0} price records`);
      } catch (rpcTimeoutError) {
        console.log('[DB] RPC query timed out, trying direct query');
        
        // Fallback to direct market_prices query
        const directResult = await supabaseClient
          .from('market_prices')
          .select('market_id, yes_price, no_price, best_bid, best_ask, last_traded_price, volume, liquidity')
          .in('market_id', marketIds)
          .not('last_traded_price', 'is', null)
          .gt('last_traded_price', 0)
          .lt('last_traded_price', 1)
          .order('timestamp', { ascending: false })
          .limit(100);
          
        priceData = directResult.data;
        priceError = directResult.error;
        console.log(`[DB] Direct query completed, found ${priceData?.length || 0} price records`);
      }
      
      if (priceError) {
        console.log('[DB] Both price queries failed:', priceError.message);
        // Still return markets but with placeholder prices
        return markets.map(market => ({
          market_id: market.id,
          event_id: market.event_id,
          question: market.question,
          last_traded_price: 0.5,
          price_change: 0,
          volume: 0
        }));
      }
      
      // Map price data to markets (take the most recent price for each market)
      const priceByMarket: Record<string, any> = {};
      for (const price of priceData || []) {
        if (!priceByMarket[price.market_id]) {
          priceByMarket[price.market_id] = price;
        }
      }
      
      const dbTime = Date.now() - startTime;
      console.log(`[DB] Database lookup took ${dbTime}ms, found price data for ${Object.keys(priceByMarket).length} markets`);
      
      return markets.map(market => {
        const priceData = priceByMarket[market.id];
        
        // If we have real price data, use it; otherwise use reasonable defaults
        const lastPrice = priceData?.last_traded_price || 0.5;
        const relatedMarket = {
          market_id: market.id,
          event_id: market.event_id,
          question: market.question,
          yes_price: priceData?.yes_price || lastPrice,
          no_price: priceData?.no_price || (1 - lastPrice),
          best_bid: priceData?.best_bid || (lastPrice - 0.01),
          best_ask: priceData?.best_ask || (lastPrice + 0.01),
          last_traded_price: lastPrice,
          volume: priceData?.volume || 0,
          liquidity: priceData?.liquidity || 0,
          price_change: 0, // Can't calculate change without historical data
          volume_change: 0
        };
        
        if (priceData) {
          console.log(`[DB] Market ${relatedMarket.market_id} with REAL price ${relatedMarket.last_traded_price} (from database)`);
        } else {
          console.log(`[DB] Market ${relatedMarket.market_id} with DEFAULT price ${relatedMarket.last_traded_price} (no data found)`);
        }
        
        return relatedMarket;
      });
      
    } catch (timeoutError) {
      console.log('[DB] Price query timed out after 5 seconds, using placeholder data');
      return markets.map(market => ({
        market_id: market.id,
        event_id: market.event_id,
        question: market.question,
        last_traded_price: 0.5,
        price_change: 0,
        volume: 0
      }));
    }
    
  } catch (error) {
    console.error('[DB] Error in database fallback:', error);
    return [];
  }
}
