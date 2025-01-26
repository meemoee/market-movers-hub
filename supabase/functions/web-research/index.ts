import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

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
    if (!openrouterApiKey) {
      throw new Error('OpenRouter API key not configured')
    }

    // Generate search queries
    const queries = await generateSearchQueries(description, openrouterApiKey)
    console.log('Generated queries:', queries)

    // Stream the response
    const stream = new ReadableStream({
      start(controller) {
        // Send initial websites count
        controller.enqueue(`data: ${JSON.stringify({ type: 'websites', count: queries.length })}\n\n`)
        
        // Send analysis chunks
        let analysisText = `Based on the search queries:\n\n`
        queries.forEach((query, index) => {
          analysisText += `${index + 1}. ${query}\n`
        })
        
        controller.enqueue(`data: ${JSON.stringify({ type: 'analysis', content: analysisText })}\n\n`)
        
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