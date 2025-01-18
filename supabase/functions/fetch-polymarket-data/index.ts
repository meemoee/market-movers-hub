import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const POLYMARKET_API = "https://gamma-api.polymarket.com"
const POLYMARKET_BASE_URL = "https://polymarket.com/event"
const BATCH_SIZE = 100 // Process 100 events at a time

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(supabaseUrl, supabaseKey)

// Helper function to add delay between requests
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function getEvents(limit = BATCH_SIZE, offset = 0, retries = 3) {
  console.log(`Fetching events with limit=${limit}, offset=${offset}`)
  const endpoint = `${POLYMARKET_API}/events`
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`${endpoint}?limit=${limit}&offset=${offset}`)
      
      if (response.status === 429) {
        console.log(`Rate limited on attempt ${attempt}, waiting before retry...`)
        await delay(attempt * 2000)
        continue
      }
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }
      
      return await response.json()
    } catch (error) {
      if (attempt === retries) {
        throw error
      }
      console.log(`Error on attempt ${attempt}, retrying...`, error)
      await delay(1000)
    }
  }
}

async function getMarketData(marketId: string, retries = 3) {
  const endpoint = `${POLYMARKET_API}/markets/${marketId}`
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(endpoint)
      
      if (response.status === 429) {
        console.log(`Rate limited on attempt ${attempt}, waiting before retry...`)
        await delay(attempt * 2000)
        continue
      }
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }
      
      return await response.json()
    } catch (error) {
      if (attempt === retries) {
        throw error
      }
      console.log(`Error on attempt ${attempt}, retrying...`, error)
      await delay(1000)
    }
  }
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

async function processBatch(events: any[]) {
  console.log(`Processing batch of ${events.length} events...`)
  
  for (const event of events) {
    if (!event.markets) continue

    try {
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

      // Add small delay between operations
      await delay(100)

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

        // Get latest market data including orderbook
        const latestMarketData = await getMarketData(market.id)
        if (latestMarketData) {
          // Insert market prices
          const { error: priceError } = await supabase
            .from('market_prices')
            .insert({
              market_id: market.id,
              yes_price: parseFloat(latestMarketData.outcomePrices?.[0] || 0),
              no_price: parseFloat(latestMarketData.outcomePrices?.[1] || 0),
              best_bid: parseFloat(latestMarketData.bestBid || 0),
              best_ask: parseFloat(latestMarketData.bestAsk || 0),
              last_traded_price: parseFloat(latestMarketData.outcomePrices?.[0] || 0),
              volume: parseFloat(latestMarketData.volume || 0),
              liquidity: parseFloat(latestMarketData.liquidity || 0)
            })

          if (priceError) {
            console.error(`Error inserting price for market ${market.id}:`, priceError)
          }

          // Insert orderbook data
          if (latestMarketData.orderbook) {
            const { error: orderbookError } = await supabase
              .from('orderbook_data')
              .upsert({
                id: Date.now(), // Using timestamp as ID
                market_id: market.id,
                bids: latestMarketData.orderbook.bids || {},
                asks: latestMarketData.orderbook.asks || {},
                best_bid: parseFloat(latestMarketData.bestBid || 0),
                best_ask: parseFloat(latestMarketData.bestAsk || 0),
                spread: parseFloat(latestMarketData.bestAsk || 0) - parseFloat(latestMarketData.bestBid || 0)
              })

            if (orderbookError) {
              console.error(`Error inserting orderbook for market ${market.id}:`, orderbookError)
            }
          }
        }

        // Add small delay between markets
        await delay(50)
      }
    } catch (error) {
      console.error(`Error processing event ${event.id}:`, error)
    }
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
    let offset = 0
    let totalProcessed = 0
    const maxEvents = 1000 // Process max 1000 events per function call

    while (totalProcessed < maxEvents) {
      const events = await getEvents(BATCH_SIZE, offset)
      if (!events || events.length === 0) break

      await processBatch(events)
      
      totalProcessed += events.length
      offset += BATCH_SIZE
      
      // Add delay between batches
      await delay(1000)
      
      console.log(`Processed ${totalProcessed} events so far...`)
      
      // Check if we're approaching the time limit (10s buffer)
      if (Date.now() - startTime > 50000) { // Edge function timeout is 60s
        console.log('Approaching time limit, stopping processing...')
        break
      }
    }

    const totalTime = (Date.now() - startTime) / 1000
    console.log(`Completed processing ${totalProcessed} events in ${totalTime.toFixed(2)}s`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Processed ${totalProcessed} events`,
        hasMore: totalProcessed === maxEvents 
      }),
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