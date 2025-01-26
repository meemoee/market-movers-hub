import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')
const BING_API_KEY = Deno.env.get('BING_API_KEY')
const BING_SEARCH_URL = "https://api.bing.microsoft.com/v7.0/search"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

class ContentCollector {
  totalChars: number
  collectedData: { url: string; content: string; title?: string }[]
  seenUrls: Set<string>

  constructor() {
    this.totalChars = 0
    this.collectedData = []
    this.seenUrls = new Set()
  }

  addContent(url: string, content: string, title?: string): boolean {
    if (this.seenUrls.has(url)) {
      return false
    }

    const contentLen = content.length
    if (this.totalChars + contentLen <= 240000) { // 240k char limit
      this.totalChars += contentLen
      this.collectedData.push({
        url,
        content: content.slice(0, 5000), // Limit per result
        title
      })
      console.log(`Added ${contentLen} chars from ${url}`)
      this.seenUrls.add(url)
      return true
    }
    return false
  }
}

async function generateSubQueries(query: string): Promise<string[]> {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:5173',
        'X-Title': 'Market Analysis App',
      },
      body: JSON.stringify({
        model: "google/gemini-flash-1.5",
        messages: [
          {
            role: "system",
            content: "You are a research assistant that helps break down complex queries into specific sub-queries."
          },
          {
            role: "user",
            content: `Generate 5 specific search queries to gather comprehensive information about: ${query}

Respond with a JSON object containing a 'queries' key with an array of search query strings.`
          }
        ],
        response_format: { type: "json_object" }
      })
    })

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`)
    }

    const data = await response.json()
    console.log('OpenRouter response:', JSON.stringify(data, null, 2))
    
    const content = data.choices[0].message.content.trim()
    const parsedContent = JSON.parse(content)
    
    if (Array.isArray(parsedContent.queries)) {
      return parsedContent.queries
    }
    
    return [query]
  } catch (error) {
    console.error('Error generating sub-queries:', error)
    return [query]
  }
}

async function searchBing(query: string) {
  console.log('\nSearching Bing for:', query)
  
  const params = new URLSearchParams({
    q: query,
    count: "50",
    responseFilter: "Webpages"
  })

  try {
    const response = await fetch(`${BING_SEARCH_URL}?${params}`, {
      headers: { "Ocp-Apim-Subscription-Key": BING_API_KEY }
    })

    if (!response.ok) {
      throw new Error(`Bing API error: ${response.status}`)
    }

    const data = await response.json()
    return data.webPages?.value || []
  } catch (error) {
    console.error('Search error:', error)
    return []
  }
}

async function extractTextContent(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    })
    
    if (!response.ok) return ''
    
    const html = await response.text()
    const cleanText = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    
    return cleanText
  } catch (error) {
    console.error(`Error extracting content from ${url}:`, error)
    return ''
  }
}

async function processBatch(urls: string[], collector: ContentCollector, controller: ReadableStreamDefaultController) {
  const tasks = urls.map(async (url) => {
    try {
      const content = await extractTextContent(url)
      if (content) {
        const added = collector.addContent(url, content)
        if (added) {
          controller.enqueue(`data: ${JSON.stringify({
            type: 'results',
            data: [{
              url,
              content: content.slice(0, 5000)
            }]
          })}\n\n`)
        }
      }
    } catch (error) {
      console.error(`Error processing ${url}:`, error)
    }
  })

  await Promise.all(tasks)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { query } = await req.json()
    console.log('\nStarting web research for query:', query)

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const collector = new ContentCollector()
          const encoder = new TextEncoder()

          const sendUpdate = (message: string) => {
            const data = `data: ${JSON.stringify({ message })}\n\n`
            controller.enqueue(encoder.encode(data))
          }

          const subQueries = await generateSubQueries(query)
          sendUpdate(`Generated ${subQueries.length} sub-queries for research`)

          for (const subQuery of subQueries) {
            sendUpdate(`Processing search query: ${subQuery}`)
            sendUpdate(`Searching Bing for: ${subQuery}`)

            const searchResults = await searchBing(subQuery)
            const urls = searchResults.map(result => result.url)
            
            // Process URLs in batches of 15
            for (let i = 0; i < urls.length; i += 15) {
              const batchUrls = urls.slice(i, i + 15)
              await processBatch(batchUrls, collector, controller)
              
              // Small pause between batches
              await new Promise(resolve => setTimeout(resolve, 100))
            }
          }

          sendUpdate(`Research completed with ${collector.collectedData.length} results`)
          controller.close()
        } catch (error) {
          console.error('Stream processing error:', error)
          controller.error(error)
        }
      }
    })

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (error) {
    console.error('Request processing error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})