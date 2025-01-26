import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
const BING_SEARCH_URL = "https://api.bing.microsoft.com/v7.0/search"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function generateSearchQueries(intent: string, openrouterApiKey: string): Promise<string[]> {
  console.log('Generating search queries for:', intent)
  
  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      "Authorization": `Bearer ${openrouterApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      "model": "google/gemini-flash-1.5",
      "messages": [
        {"role": "system", "content": "You are a helpful assistant that generates search queries."},
        {"role": "user", "content": `Generate 3 diverse search queries to gather comprehensive information about: ${intent}\n\nRespond with a JSON object containing a 'queries' key with an array of search query strings.`}
      ],
      "response_format": {"type": "json_object"}
    })
  })

  if (!response.ok) {
    console.error(`OpenRouter API error: ${response.status}`)
    throw new Error(`OpenRouter API error: ${response.status}`)
  }

  const result = await response.json()
  console.log('OpenRouter response:', result)
  const content = result.choices[0].message.content.trim()
  const queriesData = JSON.parse(content)
  return queriesData.queries || []
}

async function performWebSearch(query: string, bingApiKey: string): Promise<any[]> {
  console.log('Performing web search for query:', query)
  
  const response = await fetch(`${BING_SEARCH_URL}?q=${encodeURIComponent(query)}&count=5`, {
    headers: {
      'Ocp-Apim-Subscription-Key': bingApiKey
    }
  })

  if (!response.ok) {
    console.error(`Bing Search API error: ${response.status}`)
    throw new Error(`Bing Search API error: ${response.status}`)
  }

  const data = await response.json()
  console.log('Received search results:', data.webPages?.value?.length || 0, 'results')
  return data.webPages?.value || []
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { description } = await req.json()
    console.log('Received description:', description)
    
    if (!description) {
      throw new Error('No description provided')
    }

    const openrouterApiKey = Deno.env.get('OPENROUTER_API_KEY')
    const bingApiKey = Deno.env.get('BING_API_KEY')
    
    if (!openrouterApiKey || !bingApiKey) {
      throw new Error('Required API keys not configured')
    }

    // Generate search queries
    const queries = await generateSearchQueries(description, openrouterApiKey)
    console.log('Generated queries:', queries)

    // Perform web searches for each query
    let totalResults = 0
    const allResults = []
    
    for (const query of queries) {
      const results = await performWebSearch(query, bingApiKey)
      totalResults += results.length
      allResults.push(...results)
      
      // Send the current count of websites
      const encoder = new TextEncoder()
      const stream = encoder.encode(
        `data: ${JSON.stringify({ type: 'websites', count: totalResults })}\n\n`
      )
      await req.signal.throwIfAborted()
    }

    // Analyze the results using OpenRouter
    const analysisPrompt = `Analyze the following search results about ${description}:\n\n` +
      allResults.map((result, index) => 
        `${index + 1}. ${result.name}\n${result.snippet}\n`
      ).join('\n')

    const analysisResponse = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        "Authorization": `Bearer ${openrouterApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        "model": "google/gemini-flash-1.5",
        "messages": [
          {"role": "system", "content": "You are a helpful assistant that analyzes web search results."},
          {"role": "user", "content": analysisPrompt}
        ]
      })
    })

    if (!analysisResponse.ok) {
      throw new Error('Failed to analyze search results')
    }

    const analysisResult = await analysisResponse.json()
    const analysis = analysisResult.choices[0].message.content

    // Stream the response
    const stream = new ReadableStream({
      start(controller) {
        // Send final analysis
        controller.enqueue(
          `data: ${JSON.stringify({ type: 'analysis', content: analysis })}\n\n`
        )
        
        // End the stream
        controller.close()
      }
    })

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    })

  } catch (error) {
    console.error('Error:', error)
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