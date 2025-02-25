
import { corsHeaders } from '../_shared/cors.ts'
import { Knex, knex } from '@supabase/postgres-js'
import { format, subMinutes } from 'date-fns'

interface TopMoversResponse {
  data: TopMover[];
  hasMore: boolean;
  total?: number;
}

interface TopMover {
  market_id: string;
  question: string;
  url: string;
  subtitle?: string;
  yes_sub_title?: string;
  no_sub_title?: string;
  description?: string;
  clobtokenids?: any;
  outcomes?: any;
  active: boolean;
  closed: boolean;
  archived: boolean;
  image: string;
  event_id: string;
  event_title?: string;
  final_last_traded_price: number;
  final_best_ask: number;
  final_best_bid: number;
  final_volume: number;
  initial_last_traded_price: number;
  initial_volume: number;
  price_change: number;
  volume_change: number;
  volume_change_percentage: number;
  price_volume_impact: number;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { marketId, interval, openOnly = true, page = 1, limit = 20, searchQuery = '', probabilityMin, probabilityMax, priceChangeMin, priceChangeMax, volumeMin, volumeMax, priceVolumeImpactMin, priceVolumeImpactMax, sortBy = 'price_change' } = await req.json()

    console.log('Received request:', { 
      marketId, 
      interval, 
      openOnly, 
      page, 
      limit, 
      searchQuery, 
      probabilityMin, 
      probabilityMax,
      priceChangeMin,
      priceChangeMax,
      volumeMin,
      volumeMax,
      priceVolumeImpactMin,
      priceVolumeImpactMax,
      sortBy
    });

    const connection = knex({
      client: 'postgres',
      connection: Deno.env.get('SUPABASE_DB_URL'),
    } as Knex.Config)

    const now = new Date()
    const startTime = subMinutes(now, parseInt(interval))
    const formattedStartTime = format(startTime, 'yyyy-MM-dd HH:mm:ss')
    const formattedEndTime = format(now, 'yyyy-MM-dd HH:mm:ss')

    const offset = (page - 1) * limit

    let query = connection('markets as m')
      .join('market_prices as mp_start', function() {
        this.on('m.id', '=', 'mp_start.market_id')
          .andOn('mp_start.timestamp', '=', 
            connection('market_prices as mp2')
              .where('mp2.market_id', '=', 'm.id')
              .where('mp2.timestamp', '>=', formattedStartTime)
              .orderBy('mp2.timestamp', 'asc')
              .limit(1)
              .select('mp2.timestamp')
          )
      })
      .join('market_prices as mp_end', function() {
        this.on('m.id', '=', 'mp_end.market_id')
          .andOn('mp_end.timestamp', '=', 
            connection('market_prices as mp3')
              .where('mp3.market_id', '=', 'm.id')
              .where('mp3.timestamp', '<=', formattedEndTime)
              .orderBy('mp3.timestamp', 'desc')
              .limit(1)
              .select('mp3.timestamp')
          )
      })
      .leftJoin('events as e', 'm.event_id', 'e.id')

    // Single market query
    if (marketId) {
      query = query.where('m.id', marketId)
    } else {
      // Apply filters for list view
      if (openOnly) {
        query = query.where('m.active', true)
          .where('m.archived', false)
      }

      if (searchQuery) {
        query = query.where(function() {
          this.whereILike('m.question', `%${searchQuery}%`)
            .orWhereILike('m.description', `%${searchQuery}%`)
            .orWhereILike('e.title', `%${searchQuery}%`)
        })
      }

      if (probabilityMin !== undefined) {
        query = query.where('mp_end.last_traded_price', '>=', probabilityMin / 100)
      }

      if (probabilityMax !== undefined) {
        query = query.where('mp_end.last_traded_price', '<=', probabilityMax / 100)
      }

      if (priceChangeMin !== undefined) {
        query = query.whereRaw(`
          ((mp_end.last_traded_price - mp_start.last_traded_price) / mp_start.last_traded_price * 100) >= ?
        `, [priceChangeMin])
      }

      if (priceChangeMax !== undefined) {
        query = query.whereRaw(`
          ((mp_end.last_traded_price - mp_start.last_traded_price) / mp_start.last_traded_price * 100) <= ?
        `, [priceChangeMax])
      }

      if (volumeMin !== undefined) {
        query = query.where('mp_end.volume', '>=', volumeMin)
      }

      if (volumeMax !== undefined) {
        query = query.where('mp_end.volume', '<=', volumeMax)
      }

      // Add price volume impact filters
      if (priceVolumeImpactMin !== undefined) {
        query = query.whereRaw(`
          ((mp_end.last_traded_price - mp_start.last_traded_price) / mp_start.last_traded_price * 100) * (mp_end.volume - mp_start.volume) >= ?
        `, [priceVolumeImpactMin])
      }

      if (priceVolumeImpactMax !== undefined) {
        query = query.whereRaw(`
          ((mp_end.last_traded_price - mp_start.last_traded_price) / mp_start.last_traded_price * 100) * (mp_end.volume - mp_start.volume) <= ?
        `, [priceVolumeImpactMax])
      }

      // Sort by the selected metric
      if (sortBy === 'volume') {
        query = query.orderByRaw('(mp_end.volume - mp_start.volume) DESC')
      } else { // default to price_change
        query = query.orderByRaw('ABS((mp_end.last_traded_price - mp_start.last_traded_price) / mp_start.last_traded_price) DESC')
      }

      query = query.limit(limit).offset(offset)
    }

    // Select all required fields
    query = query.select(
      'm.id as market_id',
      'm.question',
      'm.url',
      'm.subtitle',
      'm.yes_sub_title',
      'm.no_sub_title',
      'm.description',
      'm.clobtokenids',
      'm.outcomes',
      'm.active',
      'm.closed',
      'm.archived',
      'm.image',
      'm.event_id',
      'e.title as event_title',
      'mp_end.last_traded_price as final_last_traded_price',
      'mp_end.best_ask as final_best_ask',
      'mp_end.best_bid as final_best_bid',
      'mp_end.volume as final_volume',
      'mp_start.last_traded_price as initial_last_traded_price',
      'mp_start.volume as initial_volume'
    )

    console.log('Executing query...');
    const results = await query

    // Calculate additional fields
    const transformedResults = results.map(row => ({
      ...row,
      price_change: row.final_last_traded_price && row.initial_last_traded_price
        ? ((row.final_last_traded_price - row.initial_last_traded_price) / row.initial_last_traded_price) * 100
        : 0,
      volume_change: row.final_volume && row.initial_volume
        ? row.final_volume - row.initial_volume
        : 0,
      volume_change_percentage: row.final_volume && row.initial_volume
        ? ((row.final_volume - row.initial_volume) / row.initial_volume) * 100
        : 0,
      price_volume_impact: row.final_last_traded_price && row.initial_last_traded_price && row.final_volume && row.initial_volume
        ? (((row.final_last_traded_price - row.initial_last_traded_price) / row.initial_last_traded_price) * 100) * (row.final_volume - row.initial_volume)
        : 0
    }))

    // For list view, check if there are more results
    let hasMore = false
    if (!marketId) {
      const nextPage = await connection('markets as m')
        .join('market_prices as mp_start', function() {
          this.on('m.id', '=', 'mp_start.market_id')
            .andOn('mp_start.timestamp', '=', 
              connection('market_prices as mp2')
                .where('mp2.market_id', '=', 'm.id')
                .where('mp2.timestamp', '>=', formattedStartTime)
                .orderBy('mp2.timestamp', 'asc')
                .limit(1)
                .select('mp2.timestamp')
            )
        })
        .join('market_prices as mp_end', function() {
          this.on('m.id', '=', 'mp_end.market_id')
            .andOn('mp_end.timestamp', '=', 
              connection('market_prices as mp3')
                .where('mp3.market_id', '=', 'm.id')
                .where('mp3.timestamp', '<=', formattedEndTime)
                .orderBy('mp3.timestamp', 'desc')
                .limit(1)
                .select('mp3.timestamp')
            )
        })
        .count('* as count')
        .first()

      hasMore = (nextPage?.count || 0) > offset + limit
    }

    const response: TopMoversResponse = {
      data: transformedResults,
      hasMore,
      total: results.length
    }

    await connection.destroy()

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
