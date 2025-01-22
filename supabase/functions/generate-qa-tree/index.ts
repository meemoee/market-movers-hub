import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { marketId, userId, question } = await req.json()
    console.log('Received request:', { marketId, userId, question })

    if (!marketId || !userId || !question) {
      throw new Error('Market ID, user ID, and question are required')
    }

    // Initialize Supabase client
    const supabase = createClient(
      SUPABASE_URL!,
      SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    // Fetch market data
    console.log('Fetching market data for:', marketId)
    const { data: market, error: marketError } = await supabase
      .from('markets')
      .select(`
        *,
        event:events(
          title,
          category,
          sub_title
        )
      `)
      .eq('id', marketId)
      .single()

    if (marketError) {
      console.error('Error fetching market:', marketError)
      throw marketError
    }

    if (!market) {
      throw new Error('Market not found')
    }

    console.log('Market data fetched:', market)

    // Construct market context
    const marketContext = `
      Market Question: ${market.question}
      Description: ${market.description || 'No description available'}
      Event: ${market.event?.title || 'No event title'}
      Category: ${market.event?.category || 'No category'}
      Status: ${market.status}
      Active: ${market.active}
      Closed: ${market.closed}
    `.trim()

    console.log('Sending context to Perplexity:', marketContext)

    // Call Perplexity to generate answer
    const perplexityResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:5173',
        'X-Title': 'Market Analysis App',
      },
      body: JSON.stringify({
        model: "perplexity/llama-3.1-sonar-small-128k-online",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant that generates LONG detailed answers about market predictions. Focus on analyzing the market context provided and generate thoughtful analysis."
          },
          {
            role: "user",
            content: `Based on this market information, provide a LONG detailed answer to this question: "${question}"\n\nContext:\n${marketContext}`
          }
        ]
      })
    })

    if (!perplexityResponse.ok) {
      throw new Error(`Perplexity API error: ${perplexityResponse.status}`)
    }

    const perplexityData = await perplexityResponse.json()
    const perplexityContent = perplexityData.choices[0].message.content

    console.log('Perplexity response:', perplexityContent)
    console.log('Sending to Gemini Flash for parsing...')

    // Second call to Gemini Flash for parsing into Q&A format
    const geminiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:5173',
        'X-Title': 'Market Analysis App',
      },
      body: JSON.stringify({
        model: "google/gemini-flash-1.5-8b",
        messages: [
          {
            role: "system",
            content: "You are a parser that extracts answers from analysis text. Return only a JSON object with an 'answer' field. EXTRACT THE TEXT VERBATIM AND DO NOT PARAPHRASE."
          },
          {
            role: "user",
            content: perplexityContent
          }
        ],
        response_format: { type: "json_object" },
        stream: true
      })
    })

    // Return the Gemini Flash stream directly to the client
    return new Response(geminiResponse.body, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    })

  } catch (error) {
    console.error('Error in generate-qa-tree function:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json'
        } 
      }
    )
  }
})
