
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { connect } from 'https://deno.land/x/redis@v0.29.0/mod.ts';

const POLY_API_URL = 'https://clob.polymarket.com';
const REDIS_CACHE_TTL = 60; // 1 minute cache TTL

// All supported intervals
const ALL_INTERVALS = ['1d', '1w', '1m', '3m', 'all'];

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let redis;
  try {
    const { marketId, interval = '1d' } = await req.json();
    console.log('Request parameters:', { marketId, interval });

    if (!marketId) {
      return new Response(
        JSON.stringify({ error: 'Market ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client first to check if market exists
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get market info from database
    const { data: market, error: dbError } = await supabaseClient
      .from('markets')
      .select('clobtokenids')
      .eq('id', marketId)
      .maybeSingle();

    if (dbError) {
      console.error('Database error:', dbError);
      return new Response(
        JSON.stringify({ error: 'Database error', details: dbError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!market) {
      return new Response(
        JSON.stringify({ error: 'Market not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Market data:', market);

    // Parse clobtokenids with better error handling
    let clobTokenId;
    try {
      // Handle both string and array formats
      if (typeof market.clobtokenids === 'string') {
        try {
          const parsed = JSON.parse(market.clobtokenids);
          clobTokenId = Array.isArray(parsed) ? parsed[0] : parsed;
        } catch {
          clobTokenId = market.clobtokenids;
        }
      } else if (Array.isArray(market.clobtokenids)) {
        clobTokenId = market.clobtokenids[0];
      } else if (market.clobtokenids && typeof market.clobtokenids === 'object') {
        clobTokenId = Object.values(market.clobtokenids)[0];
      }

      if (!clobTokenId) {
        throw new Error('No valid clobTokenId found');
      }

      console.log('Parsed clobTokenId:', clobTokenId);
    } catch (error) {
      console.error('Error parsing clobtokenids:', error, 'Raw value:', market.clobtokenids);
      return new Response(
        JSON.stringify({ 
          error: 'Invalid clobTokenIds format', 
          details: error.message,
          rawValue: market.clobtokenids 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Try Redis connection and cache lookup before API call
    try {
      const redisUrl = Deno.env.get('REDIS_URL');
      if (!redisUrl) {
        throw new Error('REDIS_URL not configured');
      }

      redis = await connect({
        hostname: new URL(redisUrl).hostname,
        port: parseInt(new URL(redisUrl).port),
        password: new URL(redisUrl).password,
        tls: redisUrl.startsWith('rediss://')
      });

      // Generate timestamp-based key matching top movers format
      const latestKey = await redis.get(`priceHistory:${marketId}:${interval}:latest`);
      if (latestKey) {
        const cacheKey = `priceHistory:${marketId}:${interval}:${latestKey}`;
        const cachedData = await redis.get(cacheKey);
        
        if (cachedData) {
          console.log('Cache hit for:', cacheKey);
          const data = JSON.parse(cachedData);
          // Add lastUpdated timestamp to the response
          data.forEach(point => {
            point.lastUpdated = parseInt(latestKey);
          });

          // Start background task to fetch and store all intervals
          if (typeof EdgeRuntime !== 'undefined') {
            const storeAllIntervalsTask = async () => {
              try {
                // Fetch and store all intervals in the background
                const otherIntervals = ALL_INTERVALS.filter(i => i !== interval);
                console.log(`Background task: Fetching and storing all intervals: ${ALL_INTERVALS.join(', ')}`);
                
                const intervalPromises = ALL_INTERVALS.map(currentInterval => 
                  fetchAndStoreInterval(marketId, clobTokenId, currentInterval, supabaseClient, redis)
                );

                await Promise.allSettled(intervalPromises);
                console.log(`Background task: Completed storing all intervals for market ${marketId}`);
              } catch (error) {
                console.error('Background task error storing all intervals:', error);
              } finally {
                if (redis) {
                  await redis.close();
                }
              }
            };

            EdgeRuntime.waitUntil(storeAllIntervalsTask());
            console.log('Background task for storing all price history intervals started');
          }

          return new Response(
            JSON.stringify(data),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      console.log('Cache miss, fetching from Polymarket API');
    } catch (redisError) {
      console.error('Redis error:', redisError);
      // Continue without caching if Redis fails
    }

    // Calculate time range based on interval
    const endTs = Math.floor(Date.now() / 1000);
    let duration = 24 * 60 * 60; // Default to 1 day
    let periodInterval = 1; // Default to 1 minute intervals

    switch (interval) {
      case '1w':
        duration = 7 * 24 * 60 * 60;
        periodInterval = 60; // 1 hour intervals for 1 week
        break;
      case '1m':
        duration = 30 * 24 * 60 * 60;
        periodInterval = 720; // 12 hour intervals for 1 month
        break;
      case '3m':
        duration = 90 * 24 * 60 * 60;
        periodInterval = 1440; // 24 hour intervals for 3 months
        break;
      case 'all':
        duration = 365 * 24 * 60 * 60;
        periodInterval = 1440; // 24 hour intervals for all time
        break;
    }

    const startTs = endTs - duration;

    // Query Polymarket API
    console.log('Querying Polymarket API with params:', {
      market: clobTokenId,
      startTs,
      endTs,
      fidelity: periodInterval
    });

    const response = await fetch(`${POLY_API_URL}/prices-history?` + new URLSearchParams({
      market: clobTokenId,
      startTs: startTs.toString(),
      endTs: endTs.toString(),
      fidelity: periodInterval.toString()
    }), {
      headers: {
        'Authorization': 'Bearer 0x4929c395a0fd63d0eeb6f851e160642bb01975a808bf6119b07e52f3eca4ee69'
      }
    });

    if (!response.ok) {
      console.error('Polymarket API error:', response.status, await response.text());
      throw new Error(`Polymarket API error: ${response.status}`);
    }

    const data = await response.json();
    const timestamp = Math.floor(Date.now() / 1000);
    const formattedData = data.history.map((point: { t: number; p: string | number }) => ({
      t: point.t * 1000, // Convert to milliseconds
      y: typeof point.p === 'string' ? parseFloat(point.p) : point.p,
      lastUpdated: timestamp
    }));

    // Try to cache the formatted data if Redis is connected
    if (redis) {
      try {
        const cacheKey = `priceHistory:${marketId}:${interval}:${timestamp}`;
        
        // Store the data and set TTL
        await redis.setex(cacheKey, REDIS_CACHE_TTL, JSON.stringify(formattedData));
        
        // Update latest timestamp pointer
        await redis.set(`priceHistory:${marketId}:${interval}:latest`, timestamp);
        
        console.log('Cached data for:', cacheKey);
      } catch (cacheError) {
        console.error('Error caching data:', cacheError);
      }
    }

    // Return the response immediately while storing data in the background
    const response_data = new Response(
      JSON.stringify(formattedData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

    // Store all intervals in the background
    const storeAllIntervalsTask = async () => {
      try {
        // Fetch and store all intervals
        console.log(`Background task: Fetching and storing all intervals: ${ALL_INTERVALS.join(', ')}`);
        
        // Create an array of promises for all intervals
        const intervalPromises = ALL_INTERVALS.map(currentInterval => {
          // Skip refetching the interval we just got since we already have the data
          if (currentInterval === interval) {
            return storeIntervalData(marketId, clobTokenId, data.history, interval, supabaseClient);
          }
          
          // Fetch other intervals
          return fetchAndStoreInterval(marketId, clobTokenId, currentInterval, supabaseClient, redis);
        });

        // Wait for all intervals to complete
        await Promise.allSettled(intervalPromises);
        console.log(`Background task: Completed storing all intervals for market ${marketId}`);
      } catch (error) {
        console.error('Background task error storing all intervals:', error);
      } finally {
        // Always close the Redis connection in the background task
        if (redis) {
          try {
            await redis.close();
          } catch (closeError) {
            console.error('Background task error closing Redis connection:', closeError);
          }
        }
      }
    };

    // Use EdgeRuntime.waitUntil to handle the background processing
    if (typeof EdgeRuntime !== 'undefined') {
      EdgeRuntime.waitUntil(storeAllIntervalsTask());
      console.log('Background task for storing all price history intervals started');
    } else {
      console.warn('EdgeRuntime not available, storing all interval data may be less efficient');
      // Still try to store in background, but can't guarantee completion
      storeAllIntervalsTask();
    }
    
    return response_data;

  } catch (error) {
    console.error('Error in price-history function:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Error fetching price history',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } finally {
    // Only close Redis in the main request flow if EdgeRuntime is not available
    // Otherwise, it will be closed in the background task
    if (redis && (typeof EdgeRuntime === 'undefined')) {
      try {
        await redis.close();
      } catch (closeError) {
        console.error('Error closing Redis connection:', closeError);
      }
    }
  }
});

// Function to store price history data for a specific interval
async function storeIntervalData(
  marketId: string, 
  clobTokenId: string, 
  historyData: Array<{ t: number, p: string | number }>,
  intervalName: string,
  supabaseClient: any
) {
  try {
    // Prepare batch of records to insert
    const rows = historyData.map(point => ({
      market_id: marketId,
      token_id: clobTokenId,
      timestamp: new Date(point.t * 1000), // Convert seconds to milliseconds for JS Date
      price: typeof point.p === 'string' ? parseFloat(point.p) : point.p
    }));

    if (rows.length > 0) {
      // Use a batch insert with conflict resolution
      const { error } = await supabaseClient
        .from('market_price_history')
        .upsert(rows, { 
          onConflict: 'market_id,token_id,timestamp',
          ignoreDuplicates: true 
        });

      if (error) {
        console.error(`Error storing ${intervalName} price history in background task:`, error);
      } else {
        console.log(`Background task: Successfully stored ${rows.length} price points for market ${marketId} interval ${intervalName}`);
      }
    }
  } catch (error) {
    console.error(`Error storing ${intervalName} interval data:`, error);
  }
}

// Function to fetch and store a specific interval
async function fetchAndStoreInterval(
  marketId: string, 
  clobTokenId: string, 
  interval: string,
  supabaseClient: any,
  redis: any
) {
  try {
    console.log(`Background task: Fetching interval ${interval} for market ${marketId}`);
    
    // Calculate time range based on interval
    const endTs = Math.floor(Date.now() / 1000);
    let duration = 24 * 60 * 60; // Default to 1 day
    let periodInterval = 1; // Default to 1 minute intervals

    switch (interval) {
      case '1w':
        duration = 7 * 24 * 60 * 60;
        periodInterval = 60; // 1 hour intervals for 1 week
        break;
      case '1m':
        duration = 30 * 24 * 60 * 60;
        periodInterval = 720; // 12 hour intervals for 1 month
        break;
      case '3m':
        duration = 90 * 24 * 60 * 60;
        periodInterval = 1440; // 24 hour intervals for 3 months
        break;
      case 'all':
        duration = 365 * 24 * 60 * 60;
        periodInterval = 1440; // 24 hour intervals for all time
        break;
    }

    const startTs = endTs - duration;
    
    // Query Polymarket API for this interval
    const response = await fetch(`${POLY_API_URL}/prices-history?` + new URLSearchParams({
      market: clobTokenId,
      startTs: startTs.toString(),
      endTs: endTs.toString(),
      fidelity: periodInterval.toString()
    }), {
      headers: {
        'Authorization': 'Bearer 0x4929c395a0fd63d0eeb6f851e160642bb01975a808bf6119b07e52f3eca4ee69'
      }
    });

    if (!response.ok) {
      console.error(`Polymarket API error for ${interval}:`, response.status);
      return;
    }

    const data = await response.json();
    
    // Store in database
    await storeIntervalData(marketId, clobTokenId, data.history, interval, supabaseClient);
    
    // Cache in Redis if available
    if (redis) {
      try {
        const timestamp = Math.floor(Date.now() / 1000);
        const formattedData = data.history.map((point: { t: number; p: string | number }) => ({
          t: point.t * 1000,
          y: typeof point.p === 'string' ? parseFloat(point.p) : point.p,
          lastUpdated: timestamp
        }));
        
        const cacheKey = `priceHistory:${marketId}:${interval}:${timestamp}`;
        await redis.setex(cacheKey, REDIS_CACHE_TTL, JSON.stringify(formattedData));
        await redis.set(`priceHistory:${marketId}:${interval}:latest`, timestamp);
        console.log(`Background task: Cached data for interval ${interval} at key ${cacheKey}`);
      } catch (redisError) {
        console.error(`Redis caching error for interval ${interval}:`, redisError);
      }
    }
  } catch (error) {
    console.error(`Error processing interval ${interval}:`, error);
  }
}
