import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// Constants
const POLY_API_URL = 'https://clob.polymarket.com';
const KALSHI_API_BASE_URL = Deno.env.get('KALSHI_API_BASE_URL') || 'https://api.elections.kalshi.com/trade-api/v2';
const KALSHI_EMAIL = Deno.env.get('KALSHI_EMAIL');
const KALSHI_PASSWORD = Deno.env.get('KALSHI_PASSWORD');

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { marketId, interval } = await req.json();
    console.log('Received request for market:', marketId, 'interval:', interval); // Debug log

    if (!marketId) {
      return new Response(
        JSON.stringify({ error: 'Market ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get market info from database
    const { data: market, error: dbError } = await supabaseClient
      .from('markets')
      .select('clobtokenids')
      .eq('id', marketId)
      .single();

    if (dbError || !market) {
      console.error('Database error:', dbError); // Debug log
      return new Response(
        JSON.stringify({ error: 'Market not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate time range based on interval
    const endTs = Math.floor(Date.now() / 1000);
    let startTs = endTs;
    let periodInterval = 1;

    switch (interval) {
      case '1d':
        startTs = endTs - (24 * 60 * 60);
        periodInterval = 1;
        break;
      case '1w':
        startTs = endTs - (7 * 24 * 60 * 60);
        periodInterval = 60;
        break;
      case '1m':
        startTs = endTs - (30 * 24 * 60 * 60);
        periodInterval = 60;
        break;
      case '3m':
        startTs = endTs - (90 * 24 * 60 * 60);
        periodInterval = 60;
        break;
      case 'all':
        startTs = 0; // Get all available data
        periodInterval = 1440;
        break;
      default:
        startTs = endTs - (24 * 60 * 60);
        periodInterval = 1;
    }

    // Query market prices from database
    const { data: priceHistory, error: priceError } = await supabaseClient
      .from('market_prices')
      .select('timestamp, last_traded_price')
      .eq('market_id', marketId)
      .gte('timestamp', new Date(startTs * 1000).toISOString())
      .lte('timestamp', new Date(endTs * 1000).toISOString())
      .order('timestamp', { ascending: true });

    if (priceError) {
      console.error('Price history error:', priceError); // Debug log
      return new Response(
        JSON.stringify({ error: 'Failed to fetch price history' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Transform the data
    const formattedData = priceHistory.map(record => ({
      t: record.timestamp,
      y: record.last_traded_price
    }));

    console.log('Returning price history:', formattedData.length, 'points'); // Debug log

    return new Response(
      JSON.stringify(formattedData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in price-history function:', error); // Debug log
    return new Response(
      JSON.stringify({ 
        error: 'Error fetching price history',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});