import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"

// Configuration constants
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')
const BING_SEARCH_URL = "https://api.bing.microsoft.com/v7.0/search"
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
const FETCH_TIMEOUT_MS = 5000
const BATCH_SIZE = 3
const BATCH_DELAY_MS = 200

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
    console.error('OpenRouter query generation failed:', response.status)
    throw new Error(`OpenRouter API error: ${response.status}`)
  }

  const result = await response.json()
  const content = result.choices[0].message.content.trim()
  const queriesData = JSON.parse(content)
  console.log('Generated queries:', queriesData.queries)
  return queriesData.queries || []
}

async function performWebSearch(query: string, bingApiKey: string): Promise<any[]> {
  console.log('Performing web search for query:', query)
  
  const response = await fetch(`${BING_SEARCH_URL}?q=${encodeURIComponent(query)}&count=50&responseFilter=Webpages`, {
    headers: {
      'Ocp-Apim-Subscription-Key': bingApiKey
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  })

  if (!response.ok) {
    console.error('Bing search failed:', response.status)
    throw new Error(`Bing Search API error: ${response.status}`)
  }

  const data = await response.json()
  console.log(`Found ${data.webPages?.value?.length || 0} results for query:`, query)
  return data.webPages?.value || []
}

async function fetchContent(url: string): Promise<string | null> {
  console.log('Fetching content from:', url)
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    })
    
    if (!response.ok) {
      console.log(`Failed to fetch ${url}: ${response.status}`)
      return null
    }
    
    const contentType = response.headers.get('content-type')
    console.log(`Content type for ${url}: ${contentType}`)
    
    if (!contentType?.includes('text/html')) {
      console.log(`Skipping non-HTML content from ${url}: ${contentType}`)
      return null
    }
    
    const text = await response.text()
    console.log(`Retrieved ${text.length} characters from ${url}`)
    
    const cleanedText = text
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    
    console.log(`Cleaned text length: ${cleanedText.length} characters`)
    return cleanedText.slice(0, 5000)
  } catch (error) {
    console.error(`Error fetching ${url}:`, error)
    return null
  }
}

async function processBatch(
  batch: any[], 
  writer: WritableStreamDefaultWriter<Uint8Array>,
  validContents: string[],
  processedCount: number,
  totalCount: number
): Promise<void> {
  const encoder = new TextEncoder()
  
  try {
    const batchContents = await Promise.all(
      batch.map(async result => {
        try {
          return await fetchContent(result.url)
        } catch (error) {
          console.error(`Error fetching ${result.url}:`, error)
          return null
        }
      })
    )
    
    const validBatchContents = batchContents.filter(Boolean) as string[]
    validContents.push(...validBatchContents)
    
    const message = `data: ${JSON.stringify({
      type: 'websites',
      count: validContents.length,
      processed: processedCount,
      total: totalCount,
      currentBatch: batch.length
    })}\n\n`
    
    await writer.write(encoder.encode(message))
    await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS))
  } catch (error) {
    console.error('Error processing batch:', error)
    throw error
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const encoder = new TextEncoder()
  const stream = new TransformStream()
  const writer = stream.writable.getWriter()

  const response = new Response(stream.readable, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  })

  try {
    const { description } = await req.json()
    if (!description) {
      throw new Error('No description provided')
    }

    const bingApiKey = Deno.env.get('BING_API_KEY')
    if (!OPENROUTER_API_KEY || !bingApiKey) {
      throw new Error('Required API keys not configured')
    }

    const queries = await generateSearchQueries(description, OPENROUTER_API_KEY)
    const searchResults = await Promise.all(
      queries.map(query => performWebSearch(query, bingApiKey))
    )
    const allResults = searchResults.flat()

    await writer.write(encoder.encode(`data: ${JSON.stringify({ 
      type: 'websites', 
      count: allResults.length,
      processed: 0,
      total: allResults.length
    })}\n\n`))

    const validContents: string[] = []

    for (let i = 0; i < allResults.length; i += BATCH_SIZE) {
      const batch = allResults.slice(i, i + BATCH_SIZE)
      try {
        await processBatch(
          batch,
          writer,
          validContents,
          i + BATCH_SIZE,
          allResults.length
        )
      } catch (batchError) {
        console.error(`Error processing batch starting at index ${i}:`, batchError)
        continue
      }
    }

    const analysisPrompt = `Analyze the following search results about ${description}:\n\n` +
      validContents.map((content, index) => `Content from result ${index + 1}:\n${content}\n`).join('\n')

    const analysisResponse = await fetch(OPENROUTER_URL, {
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
              await writer.write(encoder.encode(
                `data: ${JSON.stringify({ type: 'analysis', content })}\n\n`
              ))
            }
          } catch (e) {
            console.error('Error parsing analysis chunk:', e)
          }
        }
      }
    }

    await writer.close()
    return response

  } catch (error) {
    console.error('Error in web-research function:', error)
    
    try {
      const errorMessage = `data: ${JSON.stringify({ 
        type: 'error', 
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      })}\n\n`
      await writer.write(encoder.encode(errorMessage))
    } catch (streamError) {
      console.error('Failed to send error through stream:', streamError)
    }
    
    try {
      await writer.close()
    } catch (closeError) {
      console.error('Error closing writer:', closeError)
    }

    return response
  }
})
