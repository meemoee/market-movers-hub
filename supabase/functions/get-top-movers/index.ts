
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { corsHeaders, handleCorsOptions } from '../_shared/cors.ts';

interface RequestData {
  interval?: string;
  openOnly?: boolean;
  page?: number;
  limit?: number;
  searchQuery?: string;
  marketId?: string;
  marketIds?: string[];
  probabilityMin?: number;
  probabilityMax?: number;
  priceChangeMin?: number;
  priceChangeMax?: number;
  volumeMin?: number;
  volumeMax?: number;
  sortBy?: 'price_change' | 'volume';
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req: Request) => {
  // Handle CORS preflight request
  const corsResponse = handleCorsOptions(req);
  if (corsResponse) {
    return corsResponse;
  }

  try {
    // Get request body
    const requestData: RequestData = await req.json();
    
    console.log('Processing request with data:', requestData);
    
    const {
      interval = '1440',
      openOnly = true,
      page = 1,
      limit = 20,
      searchQuery = '',
      marketId,
      marketIds,
      probabilityMin,
      probabilityMax,
      priceChangeMin,
      priceChangeMax,
      volumeMin,
      volumeMax,
      sortBy = 'price_change'
    } = requestData;

    // Calculate time threshold
    const now = new Date();
    const intervalMinutes = parseInt(interval);
    const startTime = new Date(now.getTime() - intervalMinutes * 60 * 1000);
    
    console.log(`Time range: ${startTime.toISOString()} to ${now.toISOString()}`);
    
    // If a specific market ID is provided, fetch that market
    if (marketId) {
      // Query for a specific market
      let query = supabase
        .from('markets')
        .select(`
          id,
          question,
          subtitle,
          yes_sub_title,
          no_sub_title,
          description,
          url,
          clobtokenids,
          outcomes,
          active,
          closed,
          archived,
          image,
          event_id
        `)
        .eq('id', marketId)
        .single();
      
      const { data: marketData, error: marketError } = await query;
      
      if (marketError) {
        console.error('Error fetching market:', marketError);
        throw new Error(`Failed to fetch market: ${marketError.message}`);
      }
      
      if (!marketData) {
        return new Response(
          JSON.stringify({ 
            data: [],
            hasMore: false,
            total: 0 
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200 
          }
        );
      }
      
      // Now get the price data
      const { data: priceData, error: priceError } = await supabase
        .from('market_prices')
        .select('*')
        .eq('market_id', marketId)
        .order('timestamp', { ascending: false })
        .limit(100);
      
      if (priceError) {
        console.error('Error fetching price data:', priceError);
        throw new Error(`Failed to fetch price data: ${priceError.message}`);
      }
      
      if (!priceData || priceData.length === 0) {
        return new Response(
          JSON.stringify({ 
            data: [],
            hasMore: false,
            total: 0 
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200 
          }
        );
      }
      
      // Calculate initial and final values
      const sortedPrices = [...priceData].sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      
      const initialPrice = sortedPrices.length > 0 ? sortedPrices[0].last_traded_price : 0;
      const finalPrice = sortedPrices.length > 0 ? sortedPrices[sortedPrices.length - 1].last_traded_price : 0;
      const initialVolume = sortedPrices.length > 0 ? sortedPrices[0].volume : 0;
      const finalVolume = sortedPrices.length > 0 ? sortedPrices[sortedPrices.length - 1].volume : 0;
      
      const result = {
        ...marketData,
        market_id: marketData.id,
        final_last_traded_price: finalPrice,
        final_best_ask: finalPrice + 0.02, // Simulated for demo
        final_best_bid: finalPrice - 0.02, // Simulated for demo
        final_volume: finalVolume,
        initial_last_traded_price: initialPrice,
        initial_volume: initialVolume,
        price_change: finalPrice - initialPrice,
        volume_change: finalVolume - initialVolume,
        volume_change_percentage: initialVolume ? ((finalVolume - initialVolume) / initialVolume) * 100 : 0
      };
      
      return new Response(
        JSON.stringify({ 
          data: [result],
          hasMore: false,
          total: 1 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }
    
    // List query - fetch multiple markets
    
    // Calculate pagination
    const offset = (page - 1) * limit;
    
    // Start building query
    let marketsQuery = supabase
      .from('markets')
      .select(`
        id,
        question,
        subtitle,
        yes_sub_title,
        no_sub_title,
        description,
        url,
        clobtokenids,
        outcomes,
        active,
        closed,
        archived,
        image,
        event_id,
        events (
          id,
          title
        )
      `, { count: 'exact' });
    
    // Apply filters
    if (openOnly) {
      marketsQuery = marketsQuery.eq('active', true).eq('archived', false);
    }
    
    if (searchQuery) {
      marketsQuery = marketsQuery.ilike('question', `%${searchQuery}%`);
    }
    
    if (marketIds && marketIds.length > 0) {
      marketsQuery = marketsQuery.in('id', marketIds);
    }
    
    // Fetch markets with pagination
    const { data: markets, error: marketsError, count } = await marketsQuery
      .order('id')
      .range(offset, offset + limit - 1);
    
    if (marketsError) {
      console.error('Error fetching markets:', marketsError);
      throw new Error(`Failed to fetch markets: ${marketsError.message}`);
    }
    
    if (!markets || markets.length === 0) {
      return new Response(
        JSON.stringify({ 
          data: [],
          hasMore: false,
          total: 0 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }
    
    // Get market IDs
    const ids = markets.map(m => m.id);
    
    // Fetch price data for these markets
    const { data: priceData, error: priceError } = await supabase
      .from('market_prices')
      .select('*')
      .in('market_id', ids)
      .order('timestamp', { ascending: false });
    
    if (priceError) {
      console.error('Error fetching price data:', priceError);
      throw new Error(`Failed to fetch price data: ${priceError.message}`);
    }
    
    // Process the data
    const results = markets.map(market => {
      const marketPrices = priceData.filter(p => p.market_id === market.id);
      
      // Sort by timestamp
      const sortedPrices = [...marketPrices].sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      
      const initialPrice = sortedPrices.length > 0 ? sortedPrices[0].last_traded_price : 0;
      const finalPrice = sortedPrices.length > 0 ? sortedPrices[sortedPrices.length - 1].last_traded_price : 0;
      const initialVolume = sortedPrices.length > 0 ? sortedPrices[0].volume : 0;
      const finalVolume = sortedPrices.length > 0 ? sortedPrices[sortedPrices.length - 1].volume : 0;
      
      return {
        ...market,
        market_id: market.id,
        event_title: market.events?.title,
        final_last_traded_price: finalPrice,
        final_best_ask: finalPrice + 0.02, // Simulated for demo
        final_best_bid: finalPrice - 0.02, // Simulated for demo
        final_volume: finalVolume,
        initial_last_traded_price: initialPrice,
        initial_volume: initialVolume,
        price_change: finalPrice - initialPrice,
        volume_change: finalVolume - initialVolume,
        volume_change_percentage: initialVolume ? ((finalVolume - initialVolume) / initialVolume) * 100 : 0
      };
    });
    
    // Apply additional filters
    let filteredResults = [...results];
    
    if (probabilityMin !== undefined) {
      const min = probabilityMin / 100;
      filteredResults = filteredResults.filter(m => m.final_last_traded_price >= min);
    }
    
    if (probabilityMax !== undefined) {
      const max = probabilityMax / 100;
      filteredResults = filteredResults.filter(m => m.final_last_traded_price <= max);
    }
    
    if (priceChangeMin !== undefined) {
      const min = priceChangeMin / 100;
      filteredResults = filteredResults.filter(m => m.price_change >= min);
    }
    
    if (priceChangeMax !== undefined) {
      const max = priceChangeMax / 100;
      filteredResults = filteredResults.filter(m => m.price_change <= max);
    }
    
    if (volumeMin !== undefined) {
      filteredResults = filteredResults.filter(m => m.final_volume >= volumeMin);
    }
    
    if (volumeMax !== undefined) {
      filteredResults = filteredResults.filter(m => m.final_volume <= volumeMax);
    }
    
    // Sort results
    if (sortBy === 'price_change') {
      filteredResults.sort((a, b) => Math.abs(b.price_change) - Math.abs(a.price_change));
    } else if (sortBy === 'volume') {
      filteredResults.sort((a, b) => b.final_volume - a.final_volume);
    }
    
    // Return the response
    return new Response(
      JSON.stringify({
        data: filteredResults,
        hasMore: (count || 0) > offset + filteredResults.length,
        total: count
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error) {
    console.error('Error processing request:', error);
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
