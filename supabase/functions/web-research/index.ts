
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

async function generateSubQueries(query: string, focusText?: string): Promise<string[]> {
  console.log('Generating sub-queries for:', query, focusText ? `with focus: ${focusText}` : '')
  
  try {
    const systemPrompt = focusText 
      ? `You are a helpful assistant that generates search queries focused specifically on: ${focusText}`
      : 'You are a helpful assistant that generates search queries.';
      
    const userPrompt = `Generate 5 diverse search queries to gather comprehensive information about the following topic:
${query}
${focusText ? `With specific focus on: "${focusText}"` : ''}

CRITICAL GUIDELINES FOR QUERIES:
1. Each query MUST be self-contained and provide full context - a search engine should understand exactly what you're asking without any external context
2. Include specific entities, dates, events, or proper nouns from the original question
3. AVOID vague terms like "this event", "the topic", or pronouns without clear referents
4. Make each query a complete, standalone question or statement that contains ALL relevant context
5. If the original question asks about a future event, include timeframes or dates
6. Use precise terminology and specific entities mentioned in the original question

Focus on different aspects that would be relevant for market research. Make each query different from the others to gather a wide range of information.

Respond with a JSON object containing a 'queries' array with exactly 5 search query strings.`;

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
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: userPrompt
          }
        ],
        response_format: { type: "json_object" }
      })
    })

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`)
    }

    const result = await response.json()
    const content = result.choices[0].message.content.trim()
    const queriesData = JSON.parse(content)
    let queries = queriesData.queries || []
    
    // Process queries to ensure each has full context
    queries = queries.map((q: string) => {
      // Check for common issues in queries
      if (q.includes("this") || q.includes("that") || q.includes("the event") || q.includes("the topic")) {
        // Add original query context
        return `${q} regarding ${query}`
      }
      
      // Check if query likely has enough context
      const hasNames = /[A-Z][a-z]+/.test(q) // Has proper nouns
      const isLongEnough = q.length > 40     // Is reasonably detailed
      
      if (!hasNames || !isLongEnough) {
        // Add more context
        if (focusText) {
          return `${q} about ${query} focused on ${focusText}`
        } else {
          return `${q} about ${query}`
        }
      }
      
      return q
    })
    
    console.log('Generated queries:', queries)
    return queries

  } catch (error) {
    console.error("Error generating queries:", error)
    // Generate fallback queries with full context
    const fallbackQueries = [
      `${query} latest developments and facts`,
      `${query} comprehensive analysis and expert opinions`,
      `${query} historical precedents and similar cases`,
      `${query} statistical data and probability estimates`,
      `${query} future outlook and critical factors`
    ]
    
    if (focusText) {
      // Add focused variants
      return [
        `${focusText} in relation to ${query} analysis`,
        `${query} specifically regarding ${focusText}`,
        `${focusText} impact on ${query} outcome`,
        `${query} factual information related to ${focusText}`,
        `${focusText} historical precedents for ${query}`
      ]
    }
    
    return fallbackQueries
  }
}

class WebScraper {
  private bingApiKey: string
  private collector: ContentCollector
  private encoder: TextEncoder
  private writer: WritableStreamDefaultWriter<Uint8Array>
  private seenUrls: Set<string>
  private jobId: string
  private iterationNumber: number

  constructor(bingApiKey: string, writer: WritableStreamDefaultWriter<Uint8Array>, jobId: string, iterationNumber: number) {
    if (!bingApiKey) {
      throw new Error('Bing API key is required')
    }
    this.bingApiKey = bingApiKey
    this.collector = new ContentCollector()
    this.encoder = new TextEncoder()
    this.writer = writer
    this.seenUrls = new Set()
    this.jobId = jobId
    this.iterationNumber = iterationNumber
  }

  private async sendUpdate(message: string) {
    // Log progress in the database
    try {
      const progressEntry = {
        timestamp: new Date().toISOString(),
        message: message,
        iteration: this.iterationNumber
      };
      
      // Send to client
      await this.writer.write(this.encoder.encode(`data: ${JSON.stringify({ message })}\n\n`))
    } catch (error) {
      console.error("Error sending update:", error)
    }
  }

  private async sendResults(results: any[]) {
    await this.writer.write(this.encoder.encode(`data: ${JSON.stringify({ type: 'results', data: results })}\n\n`))
  }

  async searchBing(query: string) {
    await this.sendUpdate(`Searching Bing for: ${query}`)
    
    const headers = {
      "Ocp-Apim-Subscription-Key": this.bingApiKey
    }
    
    const params = new URLSearchParams({
      q: query,
      count: "50",
      responseFilter: "Webpages"
    })

    try {
      const response = await fetch(`${BING_SEARCH_URL}?${params}`, { headers })
      if (!response.ok) {
        throw new Error(`Bing API error: ${response.status}`)
      }
      const data = await response.json()
      const results = data.webPages?.value || []
      await this.sendUpdate(`Found ${results.length} search results`)
      return results
    } catch (error) {
      console.error("Search error:", error)
      return []
    }
  }

  shouldSkipUrl(url: string): boolean {
    const skipDomains = ['reddit.com', 'facebook.com', 'twitter.com', 'instagram.com']
    return skipDomains.some(domain => url.includes(domain)) || this.seenUrls.has(url)
  }

  async fetchAndParseContent(url: string): Promise<{url: string, content: string, title?: string} | null> {
    if (this.shouldSkipUrl(url)) return null

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 8000) // Reduced timeout

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
      
      // Remove scripts and styles
      $('script').remove()
      $('style').remove()
      
      const title = $('title').text().trim()
      const content = $('body').text()
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 5000)

      if (content) {
        this.seenUrls.add(url)
        return { url, content, title }
      }
      return null
    } catch (error) {
      // Skip failed URLs silently
      return null
    }
  }

  async processBatch(urls: string[], batchSize = 15) {
    const tasks: Promise<{url: string, content: string, title?: string} | null>[] = []
    for (const url of urls.slice(0, batchSize)) {
      tasks.push(this.fetchAndParseContent(url))
    }

    if (tasks.length === 0) {
      return false
    }

    try {
      const results = await Promise.all(tasks)
      const validResults = results.filter(result => result !== null) as {url: string, content: string, title?: string}[]
      
      if (validResults.length > 0) {
        await this.sendResults(validResults)
        
        // Add to collector for overall results
        validResults.forEach(result => {
          this.collector.addContent(result.url, result.content, result.title)
        })
      }
      
      return true
    } catch (error) {
      console.error("Error processing batch:", error)
      return true
    }
  }

  async run(query: string, focusText?: string) {
    await this.sendUpdate(`Starting web research for query: ${query}${focusText ? ` with focus on: ${focusText}` : ''}`)
    
    // Generate sub-queries using OpenRouter
    const subQueries = await generateSubQueries(query, focusText)
    await this.sendUpdate(`Generated ${subQueries.length} sub-queries for research`)
    
    // Update the iteration data in the database
    const iterationData = {
      query: query,
      focusText: focusText,
      subQueries: subQueries,
      startTime: new Date().toISOString(),
      iteration: this.iterationNumber
    };
    
    // Process sub-queries in parallel with a concurrency limit
    const concurrencyLimit = 3
    const processSubquery = async (subQuery: string, index: number) => {
      await this.sendUpdate(`Processing search query ${index+1}/${subQueries.length}: ${subQuery}`)
      const searchResults = await this.searchBing(subQuery)
      
      if (!searchResults.length) {
        return
      }

      const urls = searchResults.map(result => result.url)
      const batchSize = 10
      
      // Process in smaller batches for more responsive streaming
      for (let startIdx = 0; startIdx < urls.length; startIdx += batchSize) {
        const batchUrls = urls.slice(startIdx, startIdx + batchSize)
        await this.processBatch(batchUrls, batchSize)
      }
    }
    
    // Process subqueries with limited concurrency
    for (let i = 0; i < subQueries.length; i += concurrencyLimit) {
      const subQueryBatch = subQueries.slice(i, i + concurrencyLimit)
      const promises = subQueryBatch.map((subQuery, idx) => 
        processSubquery(subQuery, i + idx)
      )
      await Promise.all(promises)
    }

    await this.sendUpdate(`Web research complete. Collected information from ${this.collector.collectedData.length} sources.`)
    
    return this.collector.collectedData
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { query, focusText, jobId, iterationNumber = 1 } = await req.json()
    
    // Validate required parameters
    if (!query) {
      throw new Error('Query is required')
    }
    
    if (!jobId) {
      throw new Error('Job ID is required')
    }

    console.log(`Starting web research for job ${jobId}, iteration ${iterationNumber}, query: ${query}`)

    if (!BING_API_KEY) {
      throw new Error('BING_API_KEY is not configured')
    }

    if (!OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY is not configured')
    }

    // Create a TransformStream for streaming response
    const { readable, writable } = new TransformStream()
    const writer = writable.getWriter()
    const encoder = new TextEncoder()

    // Start research asynchronously
    (async () => {
      try {
        const scraper = new WebScraper(BING_API_KEY, writer, jobId, iterationNumber)
        const results = await scraper.run(query, focusText)
        
        // Update job with results - nothing to do here as the results will be processed by the client
        console.log(`Research complete for job ${jobId}, iteration ${iterationNumber}, found ${results.length} results`)
        
        await writer.close()
      } catch (error) {
        console.error("Error in web research:", error)
        await writer.write(encoder.encode(`data: ${JSON.stringify({ error: error.message })}\n\n`))
        await writer.close()
      }
    })()

    return new Response(readable, {
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
