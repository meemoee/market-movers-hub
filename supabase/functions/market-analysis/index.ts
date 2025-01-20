import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive'
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    const { message } = await req.json()
    
    // Create streaming response
    const encoder = new TextEncoder()
    const stream = new TransformStream()
    const writer = stream.writable.getWriter()

    // Get active markets with prices
    const { data: markets, error: marketError } = await supabase
      .from('markets')
      .select(`
        id,
        question,
        url,
        subtitle,
        yes_sub_title,
        no_sub_title,
        description,
        image
      `)
      .eq('active', true)
      .eq('closed', false)
      .eq('archived', false)
      .limit(10)

    if (marketError) {
      console.error('Error fetching markets:', marketError)
      throw marketError
    }

    // Get latest prices for these markets
    const { data: prices, error: priceError } = await supabase
      .from('market_prices')
      .select('market_id, last_traded_price, volume')
      .in('market_id', markets.map(m => m.id))
      .order('timestamp', { ascending: false })
      .limit(markets.length)

    if (priceError) {
      console.error('Error fetching prices:', priceError)
      throw priceError
    }

    // Combine market data with prices
    const marketData = markets.map(market => {
      const price = prices.find(p => p.market_id === market.id)
      return {
        market_id: market.id,
        question: market.question,
        yes_price: price?.last_traded_price || 0,
        volume: price?.volume || 0
      }
    })

    // Stream markets first
    await writer.write(
      encoder.encode(`data: ${JSON.stringify({ markets: marketData })}\n\n`)
    )

    // Get synthesis from OpenRouter
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENROUTER_API_KEY')}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://lovable.dev', // Required for OpenRouter
        'X-Title': 'Lovable Market Analysis' // Required for OpenRouter
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
${marketData.map(m => `- ${m.question} (Price: ${(m.yes_price * 100).toFixed(1)}%, Volume: $${m.volume})`).join('\n')}

Response (2-3 sentences only):`
          }
        ],
        stream: true
      })
    })

    if (!response.ok) {
      console.error('OpenRouter API error:', response.status)
      throw new Error(`OpenRouter API error: ${response.status}`)
    }

    const reader = response.body!.getReader()

    try {
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
    } finally {
      reader.releaseLock()
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