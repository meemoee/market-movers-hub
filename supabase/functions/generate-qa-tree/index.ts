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

async function streamLLMResponse(messages: any[]) {
  try {
    console.log('Making request to OpenRouter API...')
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:5173',
        'X-Title': 'Market Analysis App',
      },
      body: JSON.stringify({
        model: "perplexity/llama-3.1-sonar-small-128k-online",
        messages,
        stream: true
      })
    })

    if (!response.ok) {
      console.error('OpenRouter API error:', response.status)
      throw new Error(`OpenRouter API error: ${response.status}`)
    }

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let result = ''

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
            result += content
          } catch (e) {
            console.error('Error parsing JSON:', e)
          }
        }
      }
    }

    return result
  } catch (error) {
    console.error('Error in streamLLMResponse:', error)
    return null
  }
}

async function generateQATree(marketInfo: any) {
  // Generate root question
  const rootResponse = await streamLLMResponse([
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
  ])

  if (!rootResponse) {
    throw new Error('Failed to generate root question')
  }

  return {
    question: `${marketInfo.question}?`,
    answer: rootResponse,
    children: []
  }
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

    const treeData = await generateQATree(marketInfo)

    // Save to qa_trees table
    const { data: savedTree, error: saveError } = await supabase
      .from('qa_trees')
      .insert([
        {
          user_id: userId,
          market_id: marketId,
          title: `Analysis for ${marketInfo.question}`,
          tree_data: treeData
        }
      ])
      .select()
      .single()

    if (saveError) {
      throw saveError
    }

    return new Response(
      JSON.stringify({ success: true, treeId: savedTree.id, treeData }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in generate-qa-tree function:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})