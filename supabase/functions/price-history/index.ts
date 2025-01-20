import { serve } from 'https://deno.fresh.dev/std@v1/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// Constants
const POLY_API_URL = 'https://clob.polymarket.com';
const KALSHI_API_BASE_URL = Deno.env.get('KALSHI_API_BASE_URL') || 'https://api.elections.kalshi.com/trade-api/v2';
const KALSHI_EMAIL = Deno.env.get('KALSHI_EMAIL');
const KALSHI_PASSWORD = Deno.env.get('KALSHI_PASSWORD');

// Type definitions
interface KalshiToken {
  token: string | null;
  userId: string | null;
  timestamp: number | null;
}

interface KalshiTokens {
  elections: KalshiToken;
}

interface KalshiCandle {
  end_period_ts: number;
  yes_ask: {
    close: string | number;
  };
}

interface PriceHistoryPoint {
  t: number;
  p: string | number;
}

// Kalshi auth state
const kalshiTokens: KalshiTokens = {
  elections: { token: null, userId: null, timestamp: null }
};

// Interval mapping configuration
const intervalMap = {
  '1d': { duration: 24 * 60 * 60, periodInterval: 1 },
  '1w': { duration: 7 * 24 * 60 * 60, periodInterval: 60 },
  '1m': { duration: 30 * 24 * 60 * 60, periodInterval: 60 },
  '3m': { duration: 90 * 24 * 60 * 60, periodInterval: 60 },
  '1y': { duration: 365 * 24 * 60 * 60, periodInterval: 1440 },
  '5y': { duration: 5 * 365 * 24 * 60 * 60, periodInterval: 1440 }
};

async function authenticateKalshiElections() {
  try {
    const response = await fetch(`${KALSHI_API_BASE_URL}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: KALSHI_EMAIL,
        password: KALSHI_PASSWORD
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      kalshiTokens.elections = {
        token: data.token,
        userId: data.member_id,
        timestamp: Date.now()
      };
      return kalshiTokens.elections;
    }
    throw new Error('Elections authentication failed');
  } catch (error) {
    console.error('Kalshi elections authentication error:', error);
    throw error;
  }
}

async function refreshKalshiAuth() {
  if (!kalshiTokens.elections.token || 
      !kalshiTokens.elections.timestamp || 
      Date.now() - kalshiTokens.elections.timestamp > 55 * 60 * 1000) {
    await authenticateKalshiElections();
  }
  return kalshiTokens.elections;
}

async function getKalshiMarketCandlesticks(seriesTicker: string, ticker: string, startTs: number, endTs: number, periodInterval: number) {
  const { userId, token } = kalshiTokens.elections;
  if (!userId || !token) {
    throw new Error('Kalshi authentication required');
  }
  
  try {
    const response = await fetch(
      `${KALSHI_API_BASE_URL}/series/${seriesTicker}/markets/${ticker}/candlesticks?start_ts=${startTs}&end_ts=${endTs}&period_interval=${periodInterval}`, 
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `${userId} ${token}`
        }
      }
    );
    
    if (response.ok) {
      const data = await response.json();
      if (data?.candlesticks?.length > 0) {
        return data;
      }
    }
    
    throw new Error(`No candlesticks data returned from ${KALSHI_API_BASE_URL}`);
  } catch (error) {
    console.error(`Error fetching candlesticks from ${KALSHI_API_BASE_URL}:`, error);
    throw error;
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const marketId = url.searchParams.get('marketId');
    const interval = url.searchParams.get('interval') || '1d';

    if (!marketId) {
      return new Response(
        JSON.stringify({ error: 'Market ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const endTs = Math.floor(Date.now() / 1000);
    const { duration, periodInterval } = intervalMap[interval as keyof typeof intervalMap] || intervalMap['1m'];
    const startTs = endTs - duration;

    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get market info from database
    const { data: results, error: dbError } = await supabaseClient
      .from('markets')
      .select('clobtokenids, condid, event_id')
      .eq('id', marketId)
      .single();

    if (dbError || !results) {
      return new Response(
        JSON.stringify({ error: 'Market not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { clobtokenids } = results;
    let formattedData;

    const isKalshiMarket = marketId.includes('-') && !marketId.startsWith('0x');
    
    if (isKalshiMarket) {
      const seriesTicker = marketId.split('-')[0];
      await refreshKalshiAuth();
      
      const candlesticks = await getKalshiMarketCandlesticks(
        seriesTicker, 
        marketId, 
        startTs, 
        endTs, 
        periodInterval
      );

      formattedData = candlesticks.candlesticks.map((candle: KalshiCandle) => ({
        t: new Date(candle.end_period_ts * 1000).toISOString(),
        y: typeof candle.yes_ask.close === 'number' 
          ? candle.yes_ask.close / 100 
          : parseFloat(candle.yes_ask.close) / 100
      }));
    } else if (clobtokenids) {
      const parsedTokenIds = JSON.parse(clobtokenids);
      if (parsedTokenIds.length === 0) {
        return new Response(
          JSON.stringify({ error: 'No clobTokenIds found for this market' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const response = await fetch(`${POLY_API_URL}/prices-history?market=${parsedTokenIds[0]}&startTs=${startTs}&endTs=${endTs}&fidelity=${periodInterval}`, {
        headers: {
          'Authorization': 'Bearer 0x4929c395a0fd63d0eeb6f851e160642bb01975a808bf6119b07e52f3eca4ee69'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch from Polymarket API');
      }

      const data = await response.json();
      formattedData = data.history.map((point: PriceHistoryPoint) => ({
        t: new Date(point.t * 1000).toISOString(),
        y: typeof point.p === 'string' ? parseFloat(point.p) : point.p
      }));
    } else {
      return new Response(
        JSON.stringify({ error: 'Invalid market type or missing data' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify(formattedData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error fetching price history:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Error fetching price history',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});