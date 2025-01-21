import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const POLY_API_URL = 'https://clob.polymarket.com';

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { marketId, interval = '1d' } = await req.json();
    console.log('Request parameters:', { marketId, interval });

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

    // Calculate time range based on interval
    const endTs = Math.floor(Date.now() / 1000);
    let duration = 24 * 60 * 60; // Default to 1 day
    let periodInterval = 1; // Default to 1 minute intervals

    switch (interval) {
      case '1w':
        duration = 7 * 24 * 60 * 60;
        periodInterval = 60;
        break;
      case '1m':
        duration = 30 * 24 * 60 * 60;
        periodInterval = 60;
        break;
      case '3m':
        duration = 90 * 24 * 60 * 60;
        periodInterval = 60;
        break;
      case 'all':
        duration = 365 * 24 * 60 * 60;
        periodInterval = 1440;
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
    const formattedData = data.history.map((point: { t: number; p: string | number }) => ({
      t: point.t * 1000, // Convert to milliseconds
      y: typeof point.p === 'string' ? parseFloat(point.p) : point.p
    }));

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