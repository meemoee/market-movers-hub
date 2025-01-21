import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const POLY_API_URL = 'https://clob.polymarket.com';
const KALSHI_API_BASE_URL = Deno.env.get('KALSHI_API_BASE_URL') || 'https://api.elections.kalshi.com/trade-api/v2';
const KALSHI_EMAIL = Deno.env.get('KALSHI_EMAIL');
const KALSHI_PASSWORD = Deno.env.get('KALSHI_PASSWORD');

// Interval mapping configuration
const intervalMap = {
  '1d': { duration: 24 * 60 * 60, periodInterval: 1 },
  '1w': { duration: 7 * 24 * 60 * 60, periodInterval: 60 },
  '1m': { duration: 30 * 24 * 60 * 60, periodInterval: 60 },
  '3m': { duration: 90 * 24 * 60 * 60, periodInterval: 60 },
  '1y': { duration: 365 * 24 * 60 * 60, periodInterval: 1440 },
  '5y': { duration: 5 * 365 * 24 * 60 * 60, periodInterval: 1440 },
  'all': { duration: 5 * 365 * 24 * 60 * 60, periodInterval: 1440 }
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get URL parameters
const url = new URL(req.url);
const marketId = url.searchParams.get('marketId');
const interval = url.searchParams.get('interval') || '1d';
    console.log('Request URL:', req.url);
console.log('Received request for market:', marketId, 'interval:', interval);
console.log('Search params:', Object.fromEntries(url.searchParams));

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
      .select('clobtokenids, condid, event_id')
      .eq('id', marketId)
      .single();

    if (dbError || !market) {
      console.error('Database error:', dbError);
      return new Response(
        JSON.stringify({ error: 'Market not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate time range based on interval
    const endTs = Math.floor(Date.now() / 1000);
    const { duration, periodInterval } = intervalMap[interval as keyof typeof intervalMap] || intervalMap['1d'];
    const startTs = endTs - duration;

    let formattedData;
    const isKalshiMarket = marketId.includes('-') && !marketId.startsWith('0x');

    if (isKalshiMarket) {
      // We'll keep Kalshi support but return empty for now
      // as it's not critical for our market movers
      formattedData = [];
    } else {
      // Parse clobtokenids
      const parsedTokenIds = JSON.parse(market.clobtokenids);
      if (!parsedTokenIds || parsedTokenIds.length === 0) {
        return new Response(
          JSON.stringify({ error: 'No clobTokenIds found for this market' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Query Polymarket API directly
      const response = await fetch(`${POLY_API_URL}/prices-history?` + new URLSearchParams({
        market: parsedTokenIds[0],
        startTs: startTs.toString(),
        endTs: endTs.toString(),
        fidelity: periodInterval.toString()
      }), {
        headers: {
          'Authorization': 'Bearer 0x4929c395a0fd63d0eeb6f851e160642bb01975a808bf6119b07e52f3eca4ee69'
        }
      });

      if (!response.ok) {
        throw new Error(`Polymarket API error: ${response.status}`);
      }

      const data = await response.json();
      formattedData = data.history.map((point: { t: number; p: string | number }) => ({
        t: new Date(point.t * 1000).toISOString(),
        y: typeof point.p === 'string' ? parseFloat(point.p) : point.p
      }));
    }

    return new Response(
      JSON.stringify(formattedData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in price-history function:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Error fetching price history',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
