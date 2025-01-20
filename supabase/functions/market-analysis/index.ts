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

    // Get market details with prices
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
        image,
        events (
          title
        )
      `)
      .in('id', activeMarkets.map(m => m.id))

    if (detailsError) throw detailsError
    if (!marketDetails?.length) return []

    // Get market prices
    const { data: prices, error: pricesError } = await supabase
      .from('market_prices')
      .select('market_id, last_traded_price, best_ask, best_bid, volume, timestamp')
      .in('market_id', activeMarkets.map(m => m.id))
      .gte('timestamp', pastDate.toISOString())
      .lte('timestamp', now.toISOString())
      .order('timestamp', { ascending: true })

    if (pricesError) throw pricesError

    // Process market data
    return marketDetails.map(market => {
      const marketPrices = prices?.filter(p => p.market_id === market.id) || []
      const initialPrice = marketPrices[0] || {}
      const finalPrice = marketPrices[marketPrices.length - 1] || initialPrice

      return {
        market_id: market.id,
        question: market.question,
        yes_price: parseFloat(finalPrice.last_traded_price) || 0,
        volume: parseFloat(finalPrice.volume) || 0
      }
    }).sort((a, b) => (b.volume || 0) - (a.volume || 0))

  } catch (error) {
    console.error('Error fetching market data:', error)
    throw error
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { message } = await req.json()
    
    // Create streaming response
    const encoder = new TextEncoder()
    const stream = new TransformStream()
    const writer = stream.writable.getWriter()

    // Get market data
    const markets = await getActiveMarkets()
    
    // Stream markets first
    await writer.write(
      encoder.encode(`data: ${JSON.stringify({ markets })}\n\n`)
    )

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
            content: "You are a market analysis assistant."
          },
          {
            role: "user",
            content: `Analyze these prediction markets and provide insights.
Query: "${message}"

Markets:
${markets.map(m => `- ${m.question} (Price: ${(m.yes_price * 100).toFixed(1)}%, Volume: $${m.volume})`).join('\n')}

Response (2-3 sentences only):`
          }
        ],
        stream: true
      })
    })

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`)
    }

    const reader = response.body!.getReader()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = new TextDecoder().decode(value)
      const lines = chunk.split('\n')

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6)
          if (jsonStr === '[DONE]') continue

          try {
            const parsed = JSON.parse(jsonStr)
            const content = parsed.choices[0]?.delta?.content || ''
            
            await writer.write(
              encoder.encode(`data: ${JSON.stringify({ type: 'synthesis', content })}\n\n`)
            )
          } catch (error) {
            console.error('Error parsing chunk:', error)
          }
        }
      }
    }

    await writer.close()
    return new Response(stream.readable, { headers: corsHeaders })

  } catch (error) {
    console.error('Error in market-analysis function:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})