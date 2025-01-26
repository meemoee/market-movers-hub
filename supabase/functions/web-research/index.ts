import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"

const BING_API_KEY = Deno.env.get('BING_API_KEY')
const BING_SEARCH_URL = "https://api.bing.microsoft.com/v7.0/search"
const PER_PAGE_LIMIT = 5000
const TOTAL_CHAR_LIMIT = 240000

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
    if (this.totalChars >= TOTAL_CHAR_LIMIT) {
      return false
    }

    const contentLen = content.length
    if (this.totalChars + contentLen <= TOTAL_CHAR_LIMIT) {
      this.totalChars += contentLen
      this.collectedData.push({
        url,
        content,
        title
      })
      return true
    }
    return false
  }
}

class WebScraper {
  private bingApiKey: string
  private collector: ContentCollector
  private encoder: TextEncoder
  private controller: ReadableStreamDefaultController<any>

  constructor(bingApiKey: string, controller: ReadableStreamDefaultController<any>) {
    if (!bingApiKey) {
      throw new Error('Bing API key is required')
    }
    this.bingApiKey = bingApiKey
    this.collector = new ContentCollector()
    this.encoder = new TextEncoder()
    this.controller = controller
  }

  private sendUpdate(message: string) {
    const data = `data: ${JSON.stringify({ message })}\n\n`
    this.controller.enqueue(this.encoder.encode(data))
  }

  async searchBing(query: string) {
    this.sendUpdate(`Searching Bing for: ${query}`)
    
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
      this.sendUpdate(`Found ${results.length} search results`)
      return results
    } catch (error) {
      console.error("Search error:", error)
      return []
    }
  }

  extractTextContent(html: string): string {
    // Simple regex-based approach to extract text
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove scripts
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '') // Remove styles
      .replace(/<[^>]+>/g, ' ') // Remove HTML tags
      .replace(/&[^;]+;/g, ' ') // Remove HTML entities
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
  }

  async fetchAndParseContent(result: any) {
    try {
      this.sendUpdate(`Fetching: ${result.url}`)
      const response = await fetch(result.url)
      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`)
      }

      const html = await response.text()
      const content = this.extractTextContent(html).slice(0, PER_PAGE_LIMIT)

      if (content) {
        const added = this.collector.addContent(result.url, content, result.name)
        if (!added) {
          throw new Error('Content limit reached')
        }
      }
    } catch (error) {
      console.error(`Error processing ${result.url}:`, error)
    }
  }

  async processBatch(results: any[], batchSize = 15) {
    const tasks = []
    for (const result of results.slice(0, batchSize)) {
      if (!this.collector.seenUrls.has(result.url)) {
        this.collector.seenUrls.add(result.url)
        tasks.push(this.fetchAndParseContent(result))
      }
    }

    if (tasks.length === 0) {
      return false
    }

    try {
      await Promise.all(tasks)
      return true
    } catch (error) {
      if (error.message === 'Content limit reached') {
        return false
      }
      console.error('Batch processing error:', error)
      return true
    }
  }

  async collectContent(searchResults: any[]) {
    this.sendUpdate('Starting content collection...')
    
    const batchSize = 40

    for (let startIdx = 0; startIdx < searchResults.length; startIdx += batchSize) {
      const batchResults = searchResults.slice(startIdx, startIdx + batchSize)
      this.sendUpdate(`Processing batch ${Math.floor(startIdx/batchSize) + 1}`)
      
      const shouldContinue = await this.processBatch(batchResults, batchSize)
      
      if (!shouldContinue) {
        this.sendUpdate('Content limit reached or batch processing complete')
        break
      }

      // Small pause between batches
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    return this.collector.collectedData
  }

  async run(query: string) {
    this.sendUpdate(`Starting web scraping for query: ${query}`)
    const searchResults = await this.searchBing(query)
    
    if (!searchResults.length) {
      this.sendUpdate("No search results found.")
      return []
    }

    const startTime = Date.now()
    const collectedData = await this.collectContent(searchResults)
    const endTime = Date.now()

    this.sendUpdate(`Content collection completed in ${(endTime - startTime) / 1000} seconds`)
    this.sendUpdate(`Total URLs processed: ${this.collector.seenUrls.size}`)
    this.sendUpdate(`Successfully collected content from ${collectedData.length} pages`)
    
    // Send final results
    const resultsData = `data: ${JSON.stringify({ type: 'results', data: collectedData })}\n\n`
    this.controller.enqueue(this.encoder.encode(resultsData))
    
    return collectedData
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { query } = await req.json()

    if (!BING_API_KEY) {
      throw new Error('BING_API_KEY is not configured')
    }

    // Create a stream for sending updates
    const stream = new ReadableStream({
      start: async (controller) => {
        try {
          const scraper = new WebScraper(BING_API_KEY, controller)
          await scraper.run(query)
          controller.close()
        } catch (error) {
          controller.error(error)
        }
      },
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
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})