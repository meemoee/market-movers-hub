
import { corsHeaders } from '../_shared/cors'
import { createClient } from '@supabase/supabase-js'

interface TopMoversParams {
  interval: string;
  openOnly?: boolean;
  page?: number;
  limit?: number;
  searchQuery?: string;
  marketId?: string;
  probabilityMin?: number;
  probabilityMax?: number;
  priceChangeMin?: number;
  priceChangeMax?: number;
  volumeMin?: number;
  volumeMax?: number;
  sortBy: 'price_change' | 'volume' | 'combined';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { 
      interval, 
      openOnly = false, 
      page = 1, 
      limit = 20,
      searchQuery = '',
      marketId,
      probabilityMin,
      probabilityMax,
      priceChangeMin,
      priceChangeMax,
      volumeMin,
      volumeMax,
      sortBy = 'price_change'
    } = await req.json() as TopMoversParams;

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const offset = (page - 1) * limit;
    const searchQueryLower = searchQuery.toLowerCase();

    console.log('Retrieving top movers with params:', {
      interval,
      openOnly,
      page,
      limit,
      offset,
      searchQuery: searchQueryLower,
      marketId,
      probabilityMin,
      probabilityMax,
      priceChangeMin,
      priceChangeMax,
      volumeMin,
      volumeMax,
      sortBy
    });

    let query = `
      WITH market_snapshots AS (
        SELECT 
          m.id,
          m.question,
          m.url,
          m.subtitle,
          m.yes_sub_title,
          m.no_sub_title,
          m.description,
          m.clobtokenids,
          m.outcomes,
          m.active,
          m.closed,
          m.archived,
          m.image,
          m.event_id,
          FIRST_VALUE(mp.last_traded_price) OVER (PARTITION BY m.id ORDER BY mp.timestamp DESC) as final_last_traded_price,
          FIRST_VALUE(mp.best_ask) OVER (PARTITION BY m.id ORDER BY mp.timestamp DESC) as final_best_ask,
          FIRST_VALUE(mp.best_bid) OVER (PARTITION BY m.id ORDER BY mp.timestamp DESC) as final_best_bid,
          FIRST_VALUE(mp.volume) OVER (PARTITION BY m.id ORDER BY mp.timestamp DESC) as final_volume,
          FIRST_VALUE(mp.last_traded_price) OVER (PARTITION BY m.id ORDER BY mp.timestamp ASC) as initial_last_traded_price,
          FIRST_VALUE(mp.volume) OVER (PARTITION BY m.id ORDER BY mp.timestamp ASC) as initial_volume
        FROM markets m
        INNER JOIN market_prices mp ON m.id = mp.market_id
        WHERE 
          mp.timestamp >= NOW() - INTERVAL '${interval} minutes'
          ${openOnly ? 'AND m.active = true AND m.archived = false' : ''}
          ${marketId ? `AND m.id = '${marketId}'` : ''}
          AND mp.last_traded_price IS NOT NULL
          AND mp.last_traded_price > 0
          AND mp.last_traded_price < 1
          ${searchQueryLower ? `AND LOWER(m.question) LIKE '%${searchQueryLower}%'` : ''}
      ),
      processed_markets AS (
        SELECT DISTINCT ON (ms.id)
          ms.*,
          ((ms.final_last_traded_price - ms.initial_last_traded_price) / ms.initial_last_traded_price * 100) as price_change,
          ms.final_volume - ms.initial_volume as volume_change,
          CASE 
            WHEN ms.initial_volume = 0 THEN NULL 
            ELSE ((ms.final_volume - ms.initial_volume) / ms.initial_volume * 100)
          END as volume_change_percentage,
          ABS((ms.final_last_traded_price - ms.initial_last_traded_price) / ms.initial_last_traded_price * 100) * 
          ABS(CASE 
            WHEN ms.initial_volume = 0 THEN 0
            ELSE ((ms.final_volume - ms.initial_volume) / ms.initial_volume * 100)
          END) as combined_score
        FROM market_snapshots ms
        WHERE 
          ${probabilityMin !== undefined ? `ms.final_last_traded_price * 100 >= ${probabilityMin}` : 'TRUE'}
          AND ${probabilityMax !== undefined ? `ms.final_last_traded_price * 100 <= ${probabilityMax}` : 'TRUE'}
          AND ${priceChangeMin !== undefined ? `((ms.final_last_traded_price - ms.initial_last_traded_price) / ms.initial_last_traded_price * 100) >= ${priceChangeMin}` : 'TRUE'}
          AND ${priceChangeMax !== undefined ? `((ms.final_last_traded_price - ms.initial_last_traded_price) / ms.initial_last_traded_price * 100) <= ${priceChangeMax}` : 'TRUE'}
          AND ${volumeMin !== undefined ? `ms.final_volume >= ${volumeMin}` : 'TRUE'}
          AND ${volumeMax !== undefined ? `ms.final_volume <= ${volumeMax}` : 'TRUE'}
      )
      SELECT *
      FROM processed_markets
      ORDER BY 
        CASE 
          WHEN '${sortBy}' = 'price_change' THEN ABS(price_change)
          WHEN '${sortBy}' = 'volume' THEN ABS(volume_change_percentage)
          WHEN '${sortBy}' = 'combined' THEN combined_score
        END DESC NULLS LAST
      LIMIT ${limit}
      OFFSET ${offset};
    `;

    console.log('Executing query:', query);

    const { data: markets, error: marketsError } = await supabaseClient.rpc('get_active_markets_with_prices', {
      start_time: new Date(Date.now() - interval * 60 * 1000),
      end_time: new Date(),
      p_limit: limit,
      p_offset: offset,
      p_probability_min: probabilityMin,
      p_probability_max: probabilityMax,
      p_price_change_min: priceChangeMin,
      p_price_change_max: priceChangeMax
    });

    if (marketsError) {
      console.error('Error fetching markets:', marketsError);
      throw marketsError;
    }

    console.log(`Retrieved ${markets?.length || 0} markets`);

    return new Response(
      JSON.stringify({
        data: markets || [],
        hasMore: markets && markets.length === limit,
        total: markets?.length || 0
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    )
  } catch (error) {
    console.error('Error processing request:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 400
    })
  }
})
