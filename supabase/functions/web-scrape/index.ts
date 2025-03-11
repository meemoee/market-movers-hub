import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"
import { load } from "https://esm.sh/cheerio@1.0.0-rc.12"

const BING_API_KEY = Deno.env.get('BING_API_KEY')
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')
const BING_SEARCH_URL = "https://api.bing.microsoft.com/v7.0/search"
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

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
    if (this.seenUrls.has(url)) return false
    
    this.seenUrls.add(url)
    this.collectedData.push({ url, content, title })
    return true
  }
}

// Function to generate search queries
async function generateQueries(query: string, focusText?: string): Promise<string[]> {
  console.log('Generating search queries for:', query, focusText ? `with focus: ${focusText}` : '')
  
  try {
    // Create prompt based on focus
    const systemPrompt = focusText 
      ? `You are a specialized research assistant that generates search queries focused on: "${focusText}" within the context of the broader topic.`
      : 'You are a helpful assistant that generates search queries.';
      
    const userPrompt = `Generate 3 search queries to gather information about: ${query} ${focusText ? `with specific focus on "${focusText}"` : ''}`

    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:5173',
        'X-Title': 'Market Research App',
      },
      body: JSON.stringify({
        model: "google/gemini-flash-1.5",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" }
      })
    })

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`)
    }

    const result = await response.json()
    const content = result.choices[0].message.content.trim()
    
    try {
      const parsedContent = JSON.parse(content)
      if (parsedContent.queries && Array.isArray(parsedContent.queries)) {
        return parsedContent.queries.slice(0, 3)
      }
    } catch (e) {
      console.error('Error parsing AI response:', e)
    }
    
    // Fallback if parsing fails
    return [
      `${query} ${focusText ? `regarding ${focusText}` : 'latest information'}`,
      `${query} ${focusText ? `focusing on ${focusText}` : 'analysis'}`,
      `${query} ${focusText ? `${focusText} impact` : 'details'}`
    ]
  } catch (error) {
    console.error("Error generating queries:", error)
    
    // Simple fallback queries
    return [
      `${query} ${focusText ? `regarding ${focusText}` : 'latest information'}`,
      `${query} ${focusText ? `focusing on ${focusText}` : 'analysis'}`,
      `${query} ${focusText ? `${focusText} impact` : 'details'}`
    ]
  }
}

// Simple search function 
async function searchBing(query: string, apiKey: string): Promise<any[]> {
  const headers = {
    "Ocp-Apim-Subscription-Key": apiKey
  }
  
  const params = new URLSearchParams({
    q: query,
    count: "10",
    responseFilter: "Webpages"
  })

  try {
    const response = await fetch(`${BING_SEARCH_URL}?${params}`, { headers })
    if (!response.ok) {
      throw new Error(`Bing API error: ${response.status}`)
    }
    const data = await response.json()
    return data.webPages?.value || []
  } catch (error) {
    console.error("Search error:", error)
    return []
  }
}

// Simple content extraction
async function fetchContent(url: string): Promise<{url: string, content: string, title?: string} | null> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000)

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html',
      },
      signal: controller.signal
    })
    
    clearTimeout(timeoutId)

    if (!response.ok) return null

    const contentType = response.headers.get('content-type')
    if (!contentType?.includes('text/html')) return null

    const html = await response.text()
    const $ = load(html)
    
    $('script').remove()
    $('style').remove()
    
    const title = $('title').text().trim()
    const content = $('body').text()
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 5000)

    if (content) {
      return { url, content, title }
    }
    return null
  } catch (error) {
    return null
  }
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Parse request
    const requestData = await req.json()
    const queries = requestData.queries || []
    const query = requestData.query || ''
    const marketId = requestData.marketId || ''
    const marketDescription = requestData.marketDescription || ''
    const focusText = requestData.focusText || null
    
    // Check API keys
    if (!BING_API_KEY) {
      throw new Error('BING_API_KEY is not configured')
    }
    if (!OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY is not configured')
    }

    // Create stream for response
    const stream = new TransformStream()
    const writer = stream.writable.getWriter()
    const encoder = new TextEncoder()

    // Handle the research process
    const processResearch = async () => {
      const collector = new ContentCollector()
      const sendMessage = async (message: string) => {
        const data = JSON.stringify({ type: 'message', message })
        await writer.write(encoder.encode(`data: ${data}\n\n`))
      }
      
      const sendResults = async (results: any[]) => {
        const data = JSON.stringify({ type: 'results', data: results })
        await writer.write(encoder.encode(`data: ${data}\n\n`))
      }
      
      try {
        // Welcome message
        if (focusText) {
          await sendMessage(`Starting research on ${marketDescription || query} with focus on: ${focusText}`)
        } else {
          await sendMessage(`Starting research on ${marketDescription || query}`)
        }
        
        // Use provided queries or generate them
        let searchQueries: string[] = []
        if (queries.length > 0) {
          searchQueries = queries
          await sendMessage(`Using ${queries.length} provided search queries`)
        } else {
          // Generate queries
          const desc = marketDescription || query || marketId
          searchQueries = await generateQueries(desc, focusText)
          await sendMessage(`Generated ${searchQueries.length} search queries`)
        }
        
        // Process each query
        for (let i = 0; i < searchQueries.length; i++) {
          const query = searchQueries[i]
          await sendMessage(`Processing query ${i+1}/${searchQueries.length}: ${query}`)
          
          // Search
          const searchResults = await searchBing(query, BING_API_KEY)
          await sendMessage(`Found ${searchResults.length} results for query ${i+1}`)
          
          // Process results in smaller batches
          const batchResults: any[] = []
          for (const result of searchResults) {
            if (batchResults.length >= 5) {
              await sendResults(batchResults)
              batchResults.length = 0
            }
            
            const content = await fetchContent(result.url)
            if (content && !collector.seenUrls.has(content.url)) {
              batchResults.push(content)
              collector.addContent(content.url, content.content, content.title)
            }
          }
          
          // Send remaining results
          if (batchResults.length > 0) {
            await sendResults(batchResults)
          }
        }
        
        // Final message
        await sendMessage(`Research complete. Collected information from ${collector.collectedData.length} sources.`)
      } catch (error) {
        console.error("Error in research process:", error)
        try {
          const errorMsg = JSON.stringify({ type: 'error', message: error.message })
          await writer.write(encoder.encode(`data: ${errorMsg}\n\n`))
        } catch (e) {
          console.error("Error sending error message:", e)
        }
      } finally {
        try {
          await writer.close()
        } catch (e) {
          console.error("Error closing writer:", e)
        }
      }
    }

    // Start the research process without waiting
    processResearch()

    // Return the stream
    return new Response(stream.readable, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (error) {
    console.error("Error in web-research function:", error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
