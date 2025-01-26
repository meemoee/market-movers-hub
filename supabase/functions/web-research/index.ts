// Required imports for edge function
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"

// CORS headers configuration for cross-origin requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Fetch OpenRouter API key from environment variables
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')
const BING_SEARCH_URL = "https://api.bing.microsoft.com/v7.0/search"

// Helper function to generate search queries using OpenRouter
async function generateSearchQueries(intent: string, openrouterApiKey: string): Promise<string[]> {
  console.log('Generating search queries for:', intent)
  
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: 'POST',
    headers: {
      "Authorization": `Bearer ${openrouterApiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": 'http://localhost:5173',
      "X-Title": 'Market Analysis App',
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
    throw new Error(`OpenRouter API error: ${response.status}`)
  }

  const result = await response.json()
  const content = result.choices[0].message.content.trim()
  const queriesData = JSON.parse(content)
  return queriesData.queries || []
}

// Helper function to perform web search using Bing API
async function performWebSearch(query: string, bingApiKey: string): Promise<any[]> {
  console.log('Performing web search for query:', query)
  
  const response = await fetch(`${BING_SEARCH_URL}?q=${encodeURIComponent(query)}&count=50&responseFilter=Webpages`, {
    headers: {
      'Ocp-Apim-Subscription-Key': bingApiKey
    }
  })

  if (!response.ok) {
    throw new Error(`Bing Search API error: ${response.status}`)
  }

  const data = await response.json()
  return data.webPages?.value || []
}

// Helper function to fetch and clean content from URLs
async function fetchContent(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    })
    
    if (!response.ok) {
      return null
    }
    
    const contentType = response.headers.get('content-type')
    if (!contentType?.includes('text/html')) {
      return null
    }
    
    const text = await response.text()
    
    // Clean HTML content
    const cleanedText = text
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    
    return cleanedText.slice(0, 5000)
  } catch (error) {
    console.error(`Error fetching ${url}:`, error)
    return null
  }
}

// Main serve function for the edge function
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Set up streaming response
  const encoder = new TextEncoder()
  const stream = new TransformStream()
  const writer = stream.writable.getWriter()

  // Create response object early to establish connection
  const response = new Response(stream.readable, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  })

  // Helper function to send SSE messages
  async function sendSSEMessage(data: any) {
    try {
      const message = `data: ${JSON.stringify(data)}\n\n`
      await writer.write(encoder.encode(message))
    } catch (error) {
      console.error('Error sending SSE message:', error)
      throw error
    }
  }

  try {
    // Get input data
    const { description } = await req.json()
    if (!description) {
      throw new Error('No description provided')
    }

    // Validate API keys
    const bingApiKey = Deno.env.get('BING_API_KEY')
    if (!OPENROUTER_API_KEY || !bingApiKey) {
      throw new Error('Required API keys not configured')
    }

    // Generate and execute searches
    const queries = await generateSearchQueries(description, OPENROUTER_API_KEY)
    const searchResults = await Promise.all(
      queries.map(query => performWebSearch(query, bingApiKey))
    )
    const allResults = searchResults.flat()

    // Send initial website count
    await sendSSEMessage({ type: 'websites', count: allResults.length })

    // Process content in batches
    const batchSize = 5
    const validContents: string[] = []

    for (let i = 0; i < allResults.length; i += batchSize) {
      const batch = allResults.slice(i, i + batchSize)
      const batchContents = await Promise.all(
        batch.map(result => fetchContent(result.url))
      )
      
      const validBatchContents = batchContents.filter(Boolean) as string[]
      validContents.push(...validBatchContents)
      
      // Send updated count after each batch
      await sendSSEMessage({ type: 'websites', count: validContents.length })
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    // Prepare and execute analysis
    const analysisPrompt = `Analyze the following search results about ${description}:\n\n` +
      validContents.map((content, index) => `Content from result ${index + 1}:\n${content}\n`).join('\n')

    const analysisResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: 'POST',
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": 'http://localhost:5173',
        "X-Title": 'Market Analysis App',
      },
      body: JSON.stringify({
        "model": "google/gemini-flash-1.5",
        "messages": [
          {"role": "system", "content": "You are a helpful assistant that synthesizes information."},
          {"role": "user", "content": analysisPrompt}
        ],
        "stream": true
      })
    })

    if (!analysisResponse.ok) {
      throw new Error('Analysis request failed')
    }

    // Stream analysis results
    const reader = analysisResponse.body?.getReader()
    const decoder = new TextDecoder()

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
              await sendSSEMessage({ type: 'analysis', content })
            }
          } catch (e) {
            console.error('Error parsing analysis chunk:', e)
          }
        }
      }
    }

    // Close the stream properly
    await writer.close()
    return response

  } catch (error) {
    console.error('Error in web-research function:', error)
    
    // Try to send error through stream before closing
    try {
      await sendSSEMessage({ 
        type: 'error', 
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    } catch (e) {
      console.error('Error sending error message:', e)
    }
    
    await writer.close()
    return response
  }
})
