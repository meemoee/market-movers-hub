import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive'
}

const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!)

async function getActiveMarkets() {
  const now = new Date()
  const pastDate = new Date(now.getTime() - 60 * 60 * 1000) // Last hour
  
  try {
    // Get active markets
    const { data: activeMarkets, error: marketError } = await supabase
      .from('markets')
      .select('id')
      .eq('active', true)
      .eq('closed', false)
      .eq('archived', false)
      .limit(100)

    if (marketError) throw marketError
    if (!activeMarkets?.length) return []

    // Get market prices for active markets
    const { data: marketPrices, error: priceError } = await supabase
      .from('market_prices')
      .select('market_id')
      .in('market_id', activeMarkets.map(m => m.id))
      .gte('timestamp', pastDate.toISOString())
      .lte('timestamp', now.toISOString())
      .limit(1000)

    if (priceError) throw priceError
    if (!marketPrices?.length) return []

    // Get unique market IDs with prices
    const marketIds = [...new Set(marketPrices.map(p => p.market_id))]

    // Get full market details
    const { data: marketDetails, error: detailsError } = await supabase
      .from('markets')
      .select(`
        id,
        question,
        url,
        subtitle,
        yes_sub_title,
        no_sub_title,
        description,
        clobtokenids,
        outcomes,
        active,
        closed,
        archived,
        image,
        event_id,
        events (
          title
        )
      `)
      .in('id', marketIds)

    if (detailsError) throw detailsError
    if (!marketDetails?.length) return []

    // Get initial and final prices
    const processedMarkets = await Promise.all(
      marketDetails.map(async (market) => {
        const { data: prices } = await supabase
          .from('market_prices')
          .select('last_traded_price, best_ask, best_bid, volume, timestamp')
          .eq('market_id', market.id)
          .gte('timestamp', pastDate.toISOString())
          .lte('timestamp', now.toISOString())
          .order('timestamp', { ascending: true })

        if (!prices?.length) return null

        const initialPrice = prices[0]
        const finalPrice = prices[prices.length - 1]

        return {
          ...market,
          final_last_traded_price: parseFloat(finalPrice.last_traded_price) || 0,
          final_best_ask: parseFloat(finalPrice.best_ask) || 0,
          final_best_bid: parseFloat(finalPrice.best_bid) || 0,
          final_volume: parseFloat(finalPrice.volume) || 0,
          initial_last_traded_price: parseFloat(initialPrice.last_traded_price) || 0,
          initial_volume: parseFloat(initialPrice.volume) || 0,
          price_change: parseFloat(finalPrice.last_traded_price - initialPrice.last_traded_price) || 0,
          volume_change: parseFloat(finalPrice.volume - initialPrice.volume) || 0
        }
      })
    )

    return processedMarkets.filter(Boolean).sort((a, b) => 
      Math.abs(b.price_change) - Math.abs(a.price_change)
    )
  } catch (error) {
    console.error('Error fetching market data:', error)
    throw error
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const encoder = new TextEncoder()
  const streamResponse = new TransformStream()
  const writer = streamResponse.writable.getWriter()
  
  try {
    const { message, chatHistory } = await req.json()

    // Get market data
    const markets = await getActiveMarkets()
    
    // Stream the market results first
    await writer.write(encoder.encode(`data: ${JSON.stringify({ 
      type: 'markets', 
      markets 
    })}\n\n`))

    // Get synthesis from OpenRouter
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "perplexity/llama-3.1-sonar-small-128k-online",
        messages: [
          {
            role: "system",
            content: "You are a market analysis assistant. Use the chat history to provide context for your responses."
          },
          {
            role: "user",
            content: `Analyze these prediction market results and provide a concise synthesis.
Today's Date: ${new Date().toISOString().split('T')[0]}
Query: "${message}"

Market Results:
${markets.map(market => `
- ${market.question} (${market.id})
  Price: ${(market.final_last_traded_price * 100).toFixed(1)}%
  Change: ${(market.price_change * 100).toFixed(1)}%
  Volume: $${market.final_volume.toLocaleString()}
`).join('\n')}

Response (2-3 sentences only):`
          }
        ],
        stream: true
      })
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value)
      const lines = chunk.split('\n')

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6)
          if (jsonStr === '[DONE]') continue

          try {
            const parsed = JSON.parse(jsonStr)
            const content = parsed.choices[0]?.delta?.content || ''
            
            await writer.write(encoder.encode(`data: ${JSON.stringify({ 
              type: 'synthesis', 
              content 
            })}\n\n`))
          } catch (error) {
            console.error('Error parsing JSON chunk:', error)
          }
        }
      }
    }

    await writer.close()
    return new Response(streamResponse.readable, { headers: corsHeaders })
  } catch (error) {
    console.error('Error in market-analysis function:', error)
    await writer.write(encoder.encode(`data: ${JSON.stringify({ error: error.message })}\n\n`))
    await writer.close()
    return new Response(streamResponse.readable, { headers: corsHeaders })
  }
})