import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const POLYMARKET_API = "https://gamma-api.polymarket.com"
const POLYMARKET_BASE_URL = "https://polymarket.com/event"

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(supabaseUrl, supabaseKey)

async function getEvents(limit = 100, offset = 0) {
  console.log(`Fetching events with limit=${limit}, offset=${offset}`)
  const endpoint = `${POLYMARKET_API}/events`
  const response = await fetch(`${endpoint}?limit=${limit}&offset=${offset}`)
  if (!response.ok) throw new Error(`API error: ${response.status}`)
  return await response.json()
}

async function getAllEvents() {
  const allEvents = []
  let offset = 0
  const limit = 100

  while (true) {
    const events = await getEvents(limit, offset)
    if (!events || events.length === 0) break
    allEvents.push(...events)
    if (events.length < limit) break
    offset += limit
    console.log(`Fetched ${allEvents.length} events so far...`)
  }

  return allEvents
}

function processMarket(market: any, eventSlug: string, eventId: string, event?: any) {
  const outcomes = market.outcomes || ["Yes", "No"]
  const outcomePrices = market.outcomePrices || [0, 0]
  const image = market.image || (event?.image || '')

  return {
    id: market.id,
    event_id: eventId,
    question: market.question || 'N/A',
    subtitle: market.subtitle || '',
    url: `${POLYMARKET_BASE_URL}/${eventSlug}/${market.slug || 'N/A'}`,
    condid: market.conditionId || 'N/A',
    slug: market.slug || 'N/A',
    end_date: market.endDate,
    description: market.description || 'N/A',
    outcomes: JSON.stringify(outcomes),
    group_item_title: market.groupItemTitle || 'N/A',
    open_time: market.startDate,
    close_time: market.endDate,
    status: market.status || 'unknown',
    clobtokenids: JSON.stringify(market.clobTokenIds || []),
    active: Boolean(market.active),
    closed: Boolean(market.closed),
    archived: Boolean(market.archived),
    image,
    yes_sub_title: market.yes_sub_title || '',
    no_sub_title: market.no_sub_title || ''
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('Starting market data collection...')
    const startTime = Date.now()

    // Fetch all events from Polymarket
    const events = await getAllEvents()
    if (!events || events.length === 0) {
      throw new Error('No events retrieved')
    }

    console.log(`Processing ${events.length} events...`)

    // Process events in batches
    for (const event of events) {
      if (!event.markets) continue

      // Insert event
      const { error: eventError } = await supabase
        .from('events')
        .upsert({
          id: event.id,
          title: event.title,
          slug: event.slug,
          category: event.category,
          sub_title: event.sub_title,
          mutually_exclusive: event.mutually_exclusive
        })

      if (eventError) {
        console.error(`Error inserting event ${event.id}:`, eventError)
        continue
      }

      // Process markets
      for (const marketData of event.markets) {
        const market = processMarket(marketData, event.slug, event.id, event)

        // Insert market
        const { error: marketError } = await supabase
          .from('markets')
          .upsert(market)

        if (marketError) {
          console.error(`Error inserting market ${market.id}:`, marketError)
          continue
        }

        // Insert market prices
        const { error: priceError } = await supabase
          .from('market_prices')
          .insert({
            market_id: market.id,
            yes_price: parseFloat(marketData.outcomePrices?.[0] || 0),
            no_price: parseFloat(marketData.outcomePrices?.[1] || 0),
            best_bid: parseFloat(marketData.bestBid || 0),
            best_ask: parseFloat(marketData.bestAsk || 0),
            last_traded_price: parseFloat(marketData.outcomePrices?.[0] || 0),
            volume: parseFloat(marketData.volume || 0),
            liquidity: parseFloat(marketData.liquidity || 0)
          })

        if (priceError) {
          console.error(`Error inserting price for market ${market.id}:`, priceError)
        }
      }
    }

    const totalTime = (Date.now() - startTime) / 1000
    console.log(`Completed processing ${events.length} events in ${totalTime.toFixed(2)}s`)

    return new Response(
      JSON.stringify({ success: true, message: `Processed ${events.length} events` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})