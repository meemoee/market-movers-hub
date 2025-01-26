import "https://deno.land/x/xhr@0.1.0/mod.ts"
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

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
  
  const response = await fetch(`${BING_SEARCH_URL}?q=${encodeURIComponent(query)}&count=50&responseFilter=Webpages`, {
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

  const encoder = new TextEncoder()

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

    // Create transform stream for SSE
    const stream = new TransformStream()
    const writer = stream.writable.getWriter()
    
    // Start response with streaming
    const response = new Response(stream.readable, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    })

    // Process searches in parallel
    const searchPromises = queries.map(query => performWebSearch(query, bingApiKey))
    const searchResults = await Promise.all(searchPromises)
    const allResults = searchResults.flat()

    // Send total websites found
    await writer.write(encoder.encode(
      `data: ${JSON.stringify({ type: 'websites', count: allResults.length })}\n\n`
    ))

    // Prepare content for analysis
    const analysisPrompt = `Analyze the following search results about ${description}:\n\n` +
      allResults.map((result, index) => 
        `${index + 1}. ${result.name}\n${result.snippet}\n${result.url}\n`
      ).join('\n')

    // Get analysis from OpenRouter
    const analysisResponse = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        "Authorization": `Bearer ${openrouterApiKey}`,
        "Content-Type": "application/json",
        "Accept": "text/event-stream"
      },
      body: JSON.stringify({
        "model": "google/gemini-flash-1.5",
        "messages": [
          {"role": "system", "content": "You are a helpful assistant that synthesizes information from multiple sources."},
          {"role": "user", "content": analysisPrompt}
        ],
        "stream": true
      })
    })

    if (!analysisResponse.ok) {
      throw new Error('Failed to get analysis')
    }

    const reader = analysisResponse.body?.getReader()
    const decoder = new TextDecoder()
    let analysisText = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value)
      const lines = chunk.split('\n')

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') continue

          try {
            const parsed = JSON.parse(data)
            const content = parsed.choices?.[0]?.delta?.content
            if (content) {
              analysisText += content
              await writer.write(encoder.encode(
                `data: ${JSON.stringify({ type: 'analysis', content })}\n\n`
              ))
            }
          } catch (e) {
            console.error('Error parsing SSE data:', e)
          }
        }
      }
    }

    await writer.close()
    return response

  } catch (error) {
    console.error('Error in web-research function:', error)
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