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

interface MarketInfo {
  id: string
  event_id: string
  question: string
  description: string
  active: boolean
  closed: boolean
  archived: boolean
  event_title: string
}

async function getMarketInfo(marketId: string): Promise<MarketInfo | null> {
  const { data, error } = await supabase
    .from('markets')
    .select(`
      id,
      event_id,
      question,
      description,
      active,
      closed,
      archived,
      events!inner (
        title
      )
    `)
    .eq('id', marketId)
    .single()

  if (error || !data) {
    console.error('Error fetching market:', error)
    return null
  }

  return {
    ...data,
    event_title: data.events.title
  }
}

async function streamLLMResponse(messages: any[], model = "perplexity/llama-3.1-sonar-small-128k-online") {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'Market Analysis App',
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        temperature: 0.2,
        max_tokens: 1000,
      }),
    })

    if (!response.ok) {
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

async function generateQATree(marketInfo: MarketInfo, maxDepth = 2, nodesPerLayer = 2) {
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

  const treeData = {
    question: `${marketInfo.question}?`,
    answer: rootResponse,
    children: []
  }

  async function generateChildren(node: any, depth: number) {
    if (depth >= maxDepth) return

    const childrenResponse = await streamLLMResponse([
      {
        role: "system",
        content: "Generate follow-up questions and answers that explore different aspects of the market prediction."
      },
      {
        role: "user",
        content: `Based on this question and answer:
          Question: ${node.question}
          Answer: ${node.answer}
          
          Generate ${nodesPerLayer} follow-up questions and detailed answers that explore different aspects.`
      }
    ])

    if (childrenResponse) {
      // Split the response into questions and answers
      const segments = childrenResponse.split('\n\n')
      const children = []

      for (let i = 0; i < segments.length && children.length < nodesPerLayer; i++) {
        const segment = segments[i]
        if (segment.includes('?')) {
          children.push({
            question: segment.trim(),
            answer: segments[i + 1]?.trim() || 'Analysis pending...',
            children: []
          })
        }
      }

      node.children = children

      // Generate children for each child node
      for (const child of node.children) {
        await generateChildren(child, depth + 1)
      }
    }
  }

  await generateChildren(treeData, 0)
  return treeData
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

    const marketInfo = await getMarketInfo(marketId)
    if (!marketInfo) {
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