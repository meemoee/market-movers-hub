import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { marketId, userId } = await req.json()

    if (!marketId || !userId) {
      return new Response(
        JSON.stringify({ error: 'Market ID and user ID are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get market info
    const { data: marketInfo, error: marketError } = await supabase
      .from('markets')
      .select(`
        *,
        events (
          title
        )
      `)
      .eq('id', marketId)
      .single()

    if (marketError || !marketInfo) {
      console.error('Error fetching market:', marketError)
      return new Response(
        JSON.stringify({ error: 'Market not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Making request to OpenRouter API...')
    const openRouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
            content: "You are a helpful assistant that generates insightful questions and detailed answers about market predictions."
          },
          {
            role: "user",
            content: `Generate a root question and detailed answer about this market:
              Title: ${marketInfo.question}
              Description: ${marketInfo.description}
              Event: ${marketInfo.event_title}`
          }
        ],
        stream: true
      })
    })

    if (!openRouterResponse.ok) {
      console.error('OpenRouter API error:', openRouterResponse.status)
      throw new Error(`OpenRouter API error: ${openRouterResponse.status}`)
    }

    // Return the stream directly to the client
    return new Response(openRouterResponse.body, {
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
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})