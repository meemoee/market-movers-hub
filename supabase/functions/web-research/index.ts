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
  console.log('Generated queries:', queriesData.queries)
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

async function fetchContent(url: string): Promise<string | null> {
  console.log('🔍 Attempting to fetch content from:', url)
  try {
    console.log('📡 Sending fetch request to:', url)
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    })
    
    console.log(`📥 Received response from ${url}, status:`, response.status)
    if (!response.ok) {
      console.error(`❌ Failed to fetch ${url}: ${response.status}`)
      return null
    }
    
    const contentType = response.headers.get('content-type')
    console.log(`📄 Content-Type for ${url}:`, contentType)
    if (!contentType || !contentType.includes('text/html')) {
      console.error(`⚠️ Skipping non-HTML content from ${url}: ${contentType}`)
      return null
    }
    
    console.log(`📖 Reading text content from ${url}`)
    const text = await response.text()
    console.log(`✅ Successfully fetched content from ${url}, length: ${text.length}`)
    
    // Basic HTML cleaning
    console.log(`🧹 Cleaning HTML content for ${url}`)
    const cleanedText = text
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    
    const truncatedText = cleanedText.slice(0, 5000)
    console.log(`✂️ Truncated content length for ${url}:`, truncatedText.length)
    return truncatedText
  } catch (error) {
    console.error(`❌ Error fetching ${url}:`, error)
    return null
  }
}

serve(async (req) => {
  console.log('🚀 Starting web research function')
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const encoder = new TextEncoder()

  try {
    const { description } = await req.json()
    console.log('📝 Received description:', description)
    
    if (!description) {
      throw new Error('No description provided')
    }

    const openrouterApiKey = Deno.env.get('OPENROUTER_API_KEY')
    const bingApiKey = Deno.env.get('BING_API_KEY')
    
    if (!openrouterApiKey || !bingApiKey) {
      throw new Error('Required API keys not configured')
    }

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

    console.log('🔍 Generating search queries')
    const queries = await generateSearchQueries(description, openrouterApiKey)
    console.log('✅ Generated queries:', queries)

    console.log('🌐 Starting parallel searches')
    const searchPromises = queries.map(query => performWebSearch(query, bingApiKey))
    const searchResults = await Promise.all(searchPromises)
    const allResults = searchResults.flat()
    console.log('📊 Total search results:', allResults.length)

    console.log('📡 Sending initial website count update')
    await writer.write(encoder.encode(
      `data: ${JSON.stringify({ type: 'websites', count: allResults.length })}\n\n`
    ))

    const batchSize = 5
    const validContents: string[] = []
    
    console.log('📦 Starting content fetching in batches')
    for (let i = 0; i < allResults.length; i += batchSize) {
      const batchNumber = Math.floor(i/batchSize) + 1
      console.log(`🔄 Processing batch ${batchNumber} of ${Math.ceil(allResults.length/batchSize)}`)
      const batch = allResults.slice(i, i + batchSize)
      
      console.log(`📥 Fetching content for batch ${batchNumber}:`, batch.map(r => r.url))
      const batchPromises = batch.map(result => fetchContent(result.url))
      const batchContents = await Promise.all(batchPromises)
      
      const validBatchContents = batchContents.filter(Boolean) as string[]
      console.log(`✅ Valid contents in batch ${batchNumber}:`, validBatchContents.length)
      validContents.push(...validBatchContents)
      
      console.log(`📊 Total valid contents so far: ${validContents.length}`)
      await writer.write(encoder.encode(
        `data: ${JSON.stringify({ type: 'websites', count: validContents.length })}\n\n`
      ))
      
      console.log(`⏳ Adding delay before next batch`)
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    console.log('🏁 Content fetching complete. Total valid contents:', validContents.length)

    console.log('📝 Preparing content for analysis')
    const analysisPrompt = `Analyze the following search results about ${description}:\n\n` +
      validContents.map((content, index) => 
        `Content from result ${index + 1}:\n${content}\n`
      ).join('\n')

    console.log('🤖 Starting analysis with OpenRouter')
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
      console.error('❌ Failed to get analysis:', analysisResponse.status)
      throw new Error('Failed to get analysis')
    }

    console.log('📡 Starting to stream analysis')
    const reader = analysisResponse.body?.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        console.log('✅ Analysis stream complete')
        break
      }

      const chunk = decoder.decode(value)
      console.log('📝 Received analysis chunk:', chunk)
      const lines = chunk.split('\n')

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') continue

          try {
            const parsed = JSON.parse(data)
            const content = parsed.choices?.[0]?.delta?.content
            if (content) {
              console.log('📤 Sending analysis content:', content)
              await writer.write(encoder.encode(
                `data: ${JSON.stringify({ type: 'analysis', content })}\n\n`
              ))
            }
          } catch (e) {
            console.error('❌ Error parsing SSE data:', e)
          }
        }
      }
    }

    await writer.close()
    return response

  } catch (error) {
    console.error('❌ Error in web-research function:', error)
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