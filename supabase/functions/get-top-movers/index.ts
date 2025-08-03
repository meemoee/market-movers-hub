import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { connect } from "https://deno.land/x/redis@v0.29.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to clean text fields
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

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let redis;
  try {
    const redisUrl = Deno.env.get('REDIS_URL');
    if (!redisUrl) {
      console.error('REDIS_URL environment variable is not set');
      throw new Error('Redis configuration is missing');
    }

    console.log('Attempting to connect to Redis...');
    redis = await connect({
      hostname: new URL(redisUrl).hostname,
      port: parseInt(new URL(redisUrl).port),
      password: new URL(redisUrl).password,
      tls: redisUrl.startsWith('rediss://')
    });
    
    console.log('Connected to Redis successfully');
    
    const { interval = '1440', openOnly = false, page = 1, limit = 20, searchQuery = '', marketId, marketIds, probabilityMin, probabilityMax, priceChangeMin, priceChangeMax, volumeMin, volumeMax, sortBy = 'price_change', tagFilter = [], excludedTags = [] } = await req.json();
    console.log(`Fetching top movers for interval: ${interval} minutes, page: ${page}, limit: ${limit}, openOnly: ${openOnly}, searchQuery: ${searchQuery}, marketId: ${marketId}, marketIds: ${marketIds?.length}, probabilityMin: ${probabilityMin}, probabilityMax: ${probabilityMax}, priceChangeMin: ${priceChangeMin}, priceChangeMax: ${priceChangeMax}, volumeMin: ${volumeMin}, volumeMax: ${volumeMax}, sortBy: ${sortBy}, tagFilter: ${JSON.stringify(tagFilter)}, excludedTags: ${JSON.stringify(excludedTags)}`);

    // If specific marketIds are provided, prioritize fetching their data
    let allMarkets = [];
    
    // Handle single marketId request first
    if (marketId) {
      console.log(`Fetching single market with ID: ${marketId}`);
      const latestKey = await redis.get(`topMovers:${interval}:latest`);
      
      if (!latestKey) {
        console.log('No latest key found for marketId request');
        return new Response(
          JSON.stringify({
            data: [],
            hasMore: false
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get manifest for the specific market
      const manifestKey = `topMovers:${interval}:${latestKey}:manifest`;
      const manifestData = await redis.get(manifestKey);
      
      if (!manifestData) {
        console.log('No manifest found for marketId request');
        return new Response(
          JSON.stringify({
            data: [],
            hasMore: false
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const manifest = JSON.parse(manifestData);
      let foundMarket = null;
      
      // Search through chunks until we find the specific market
      for (let i = 0; i < manifest.chunks; i++) {
        const chunkKey = `topMovers:${interval}:${latestKey}:chunk:${i}`;
        const chunkData = await redis.get(chunkKey);
        if (chunkData) {
          const markets = JSON.parse(chunkData);
          foundMarket = markets.find(m => m.market_id === marketId);
          if (foundMarket) {
            foundMarket = cleanTextFields(foundMarket);
            console.log(`Found market ${marketId} in chunk ${i}`);
            break;
          }
        }
      }

      // If market not found in current interval, try other intervals
      if (!foundMarket) {
        console.log(`Market ${marketId} not found in interval ${interval}, trying other intervals`);
        const intervals = ['5', '10', '30', '60', '240', '480', '1440', '10080'];
        
        for (const currentInterval of intervals) {
          if (currentInterval === interval) continue;
          
          const otherLatestKey = await redis.get(`topMovers:${currentInterval}:latest`);
          if (!otherLatestKey) continue;
          
          const otherManifestKey = `topMovers:${currentInterval}:${otherLatestKey}:manifest`;
          const otherManifestData = await redis.get(otherManifestKey);
          if (!otherManifestData) continue;
          
          const otherManifest = JSON.parse(otherManifestData);
          
          for (let i = 0; i < otherManifest.chunks; i++) {
            const chunkKey = `topMovers:${currentInterval}:${otherLatestKey}:chunk:${i}`;
            const chunkData = await redis.get(chunkKey);
            if (chunkData) {
              const markets = JSON.parse(chunkData);
              foundMarket = markets.find(m => m.market_id === marketId);
              if (foundMarket) {
                foundMarket = cleanTextFields(foundMarket);
                console.log(`Found market ${marketId} in interval ${currentInterval}`);
                break;
              }
            }
          }
          
          if (foundMarket) break;
        }
      }

      await redis.close();
      
      return new Response(
        JSON.stringify({
          data: foundMarket ? [foundMarket] : [],
          hasMore: false
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If specific marketIds are provided, prioritize fetching their data
    if (marketIds?.length) {
      console.log(`Fetching data for ${marketIds.length} specific markets`);
      const latestKey = await redis.get(`topMovers:${interval}:latest`);
      
      if (!latestKey) {
        console.log('No latest key found, returning empty data');
        return new Response(
          JSON.stringify({
            data: [],
            hasMore: false
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get manifest
      const manifestKey = `topMovers:${interval}:${latestKey}:manifest`;
      const manifestData = await redis.get(manifestKey);
      
      if (!manifestData) {
        console.log('No manifest found');
        return new Response(
          JSON.stringify({
            data: [],
            hasMore: false
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const manifest = JSON.parse(manifestData);
      
      // Get all markets from chunks
      for (let i = 0; i < manifest.chunks; i++) {
        const chunkKey = `topMovers:${interval}:${latestKey}:chunk:${i}`;
        const chunkData = await redis.get(chunkKey);
        if (chunkData) {
          const markets = JSON.parse(chunkData);
          // Only keep markets that are in our marketIds list and clean their text fields
          const relevantMarkets = markets
            .filter(m => marketIds.includes(m.market_id))
            .map(cleanTextFields);
          allMarkets.push(...relevantMarkets);
        }
      }

      // For any marketIds that weren't found in the current interval data,
      // try to find them in other intervals
      const missingMarketIds = marketIds.filter(id => 
        !allMarkets.some(m => m.market_id === id)
      );

      if (missingMarketIds.length > 0) {
        console.log(`Looking for ${missingMarketIds.length} markets in other intervals`);
        const intervals = ['5', '10', '30', '60', '240', '480', '1440', '10080'];
        
        for (const currentInterval of intervals) {
          if (currentInterval === interval) continue;
          
          const otherLatestKey = await redis.get(`topMovers:${currentInterval}:latest`);
          if (!otherLatestKey) continue;
          
          const otherManifestKey = `topMovers:${currentInterval}:${otherLatestKey}:manifest`;
          const otherManifestData = await redis.get(otherManifestKey);
          if (!otherManifestData) continue;
          
          const otherManifest = JSON.parse(otherManifestData);
          
          for (let i = 0; i < otherManifest.chunks; i++) {
            const chunkKey = `topMovers:${currentInterval}:${otherLatestKey}:chunk:${i}`;
            const chunkData = await redis.get(chunkKey);
            if (chunkData) {
              const markets = JSON.parse(chunkData);
              const foundMarkets = markets
                .filter(m => missingMarketIds.includes(m.market_id))
                .map(cleanTextFields);
              if (foundMarkets.length > 0) {
                allMarkets.push(...foundMarkets);
                // Remove found markets from missing list
                missingMarketIds.splice(0, missingMarketIds.length, ...missingMarketIds.filter(
                  id => !foundMarkets.some(m => m.market_id === id)
                ));
              }
            }
            // If we found all missing markets, we can stop searching
            if (missingMarketIds.length === 0) break;
          }
          
          // If we found all missing markets, we can stop checking other intervals
          if (missingMarketIds.length === 0) break;
        }
      }

      // If we still have missing markets, create placeholder data with zero changes
      if (missingMarketIds.length > 0) {
        console.log(`Creating placeholder data for ${missingMarketIds.length} markets`);
        const placeholderMarkets = missingMarketIds.map(market_id => ({
          market_id,
          final_last_price: 0,
          final_best_ask: 0,
          final_best_bid: 0,
          final_volume: 0,
          price_change: 0,
          initial_last_price: 0,
          initial_volume: 0,
          volume_change: 0,
          volume_change_percentage: 0
        }));
        allMarkets.push(...placeholderMarkets);
      }

      await redis.close();
      
      return new Response(
        JSON.stringify({
          data: allMarkets,
          hasMore: false
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Original top movers logic for when no specific marketIds are provided
    const latestKey = await redis.get(`topMovers:${interval}:latest`);
    console.log(`Latest key lookup result for interval ${interval}:`, latestKey);
    
    if (!latestKey) {
      console.log(`No latest key found for interval: ${interval}`);
      return new Response(
        JSON.stringify({
          data: [],
          hasMore: false
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }

    // Get manifest
    const manifestKey = `topMovers:${interval}:${latestKey}:manifest`;
    console.log(`Looking for manifest at key: ${manifestKey}`);
    const manifestData = await redis.get(manifestKey);
    
    if (!manifestData) {
      console.log(`No manifest found at key: ${manifestKey}`);
      return new Response(
        JSON.stringify({
          data: [],
          hasMore: false
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }

    const manifest = JSON.parse(manifestData);
    console.log(`Found manifest with ${manifest.chunks} chunks for interval ${interval}`);

    // Get all markets from chunks
    for (let i = 0; i < manifest.chunks; i++) {
      const chunkKey = `topMovers:${interval}:${latestKey}:chunk:${i}`;
      const chunkData = await redis.get(chunkKey);
      if (chunkData) {
        const markets = JSON.parse(chunkData).map(cleanTextFields);
        allMarkets.push(...markets);
      }
    }
    console.log(`Retrieved ${allMarkets.length} markets total for interval ${interval}`);

    // First apply probability filters if they exist
    if (probabilityMin !== undefined || probabilityMax !== undefined) {
      allMarkets = allMarkets.filter(market => {
        const probability = market.final_last_price * 100; // Convert to percentage
        const meetsMin = probabilityMin === undefined || probability >= probabilityMin;
        const meetsMax = probabilityMax === undefined || probability <= probabilityMax;
        return meetsMin && meetsMax;
      });
      console.log(`Filtered to ${allMarkets.length} markets within probability range ${probabilityMin}% - ${probabilityMax}%`);
    }

    // Apply price change filters if they exist
    if (priceChangeMin !== undefined || priceChangeMax !== undefined) {
      allMarkets = allMarkets.filter(market => {
        const priceChange = market.price_change * 100; // Convert to percentage
        const meetsMin = priceChangeMin === undefined || priceChange >= priceChangeMin;
        const meetsMax = priceChangeMax === undefined || priceChange <= priceChangeMax;
        return meetsMin && meetsMax;
      });
      console.log(`Filtered to ${allMarkets.length} markets within price change range ${priceChangeMin}% - ${priceChangeMax}%`);
    }

    // Apply volume filters if they exist
    if (volumeMin !== undefined || volumeMax !== undefined) {
      console.log(`Applying volume filters: min=${volumeMin}, max=${volumeMax}`);
      allMarkets = allMarkets.filter(market => {
        const volume = market.final_volume;
        const meetsMin = volumeMin === undefined || volume >= volumeMin;
        const meetsMax = volumeMax === undefined || volume <= volumeMax;
        const result = meetsMin && meetsMax;
        console.log(`Market ${market.market_id} volume=${volume}, meetsMin=${meetsMin}, meetsMax=${meetsMax}, kept=${result}`);
        return result;
      });
      console.log(`Filtered to ${allMarkets.length} markets within volume range ${volumeMin} - ${volumeMax}`);
    }

    // Apply tag filter if tags are selected
    if (tagFilter && Array.isArray(tagFilter) && tagFilter.length > 0) {
      allMarkets = allMarkets.filter(market => {
        // Check if market has any of the selected tags in primary_tags or tag_slugs
        const marketTags = [
          ...(market.primary_tags || []),
          ...(market.tag_slugs || [])
        ];
        
        return tagFilter.some(tag => marketTags.includes(tag));
      });
      console.log(`Filtered to ${allMarkets.length} markets matching tags: ${tagFilter.join(', ')}`);
    }

    // Apply excluded tags filter if tags are excluded
    if (excludedTags && Array.isArray(excludedTags) && excludedTags.length > 0) {
      allMarkets = allMarkets.filter(market => {
        // Check if market has any of the excluded tags in primary_tags or tag_slugs
        const marketTags = [
          ...(market.primary_tags || []),
          ...(market.tag_slugs || [])
        ];
        
        return !excludedTags.some(tag => marketTags.includes(tag));
      });
      console.log(`Filtered to ${allMarkets.length} markets excluding tags: ${excludedTags.join(', ')}`);
    }

    // Then apply openOnly filter
    if (openOnly) {
      allMarkets = allMarkets.filter(m => m.active && !m.archived);
      console.log(`Filtered to ${allMarkets.length} open markets for interval ${interval}`);
    }

    // Apply search if query exists (before sorting and pagination)
    if (searchQuery) {
      const searchTerms = searchQuery.toLowerCase().split(' ');
      allMarkets = allMarkets.filter(market => {
        const searchableText = [
          market.question,
          market.subtitle,
          market.yes_sub_title,
          market.no_sub_title,
          market.description,
          market.event_title
        ].filter(Boolean).join(' ').toLowerCase();

        return searchTerms.every(term => searchableText.includes(term));
      });
      
      console.log(`Found ${allMarkets.length} markets matching search query "${searchQuery}"`);
    }

    // Sort all filtered results based on sortBy parameter
    allMarkets.sort((a, b) => {
      if (sortBy === 'volume') {
        // Sort by volume change percentage (which accounts for the relative increase/decrease)
        return Math.abs(b.volume_change_percentage) - Math.abs(a.volume_change_percentage);
      }
      // Default to price change sorting
      return Math.abs(b.price_change) - Math.abs(a.price_change);
    });

    // Apply pagination to the filtered and sorted results
    const start = (page - 1) * limit;
    const paginatedMarkets = allMarkets.slice(start, start + limit);
    const hasMore = allMarkets.length > start + limit;
    console.log(`Returning ${paginatedMarkets.length} markets, sorted by ${sortBy === 'volume' ? 'volume change' : 'price change'}, hasMore: ${hasMore}`);

    await redis.close();

    return new Response(
      JSON.stringify({
        data: paginatedMarkets,
        hasMore,
        total: allMarkets.length
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error:', error);
    if (redis) {
      await redis.close();
    }
    return new Response(
      JSON.stringify({
        data: [],
        hasMore: false,
        error: error.message
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
