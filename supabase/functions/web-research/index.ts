import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"
import { load } from "https://esm.sh/cheerio@1.0.0-rc.12"

const BING_API_KEY = Deno.env.get('BING_API_KEY')
const BING_SEARCH_URL = "https://api.bing.microsoft.com/v7.0/search"
const PER_PAGE_LIMIT = 5000
const TOTAL_CHAR_LIMIT = 240000

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const fetchHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Connection': 'keep-alive',
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

  private sendResults(results: any[]) {
    const data = `data: ${JSON.stringify({ type: 'results', data: results })}\n\n`
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
    html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    
    const text = html.replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    
    return text
  }

  extractTitle(html: string): string {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    return titleMatch ? titleMatch[1].trim() : ''
  }

  shouldSkipUrl(url: string): boolean {
    const skipDomains = ['reddit.com', 'facebook.com', 'twitter.com', 'instagram.com']
    return skipDomains.some(domain => url.includes(domain))
  }

  async fetchAndParseContent(url: string) {
    if (this.shouldSkipUrl(url)) {
      return
    }

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)

      const response = await fetch(url, {
        headers: fetchHeaders,
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)

      if (!response.ok) {
        return
      }

      const contentType = response.headers.get('content-type')
      if (!contentType?.includes('text/html')) {
        return
      }

      const html = await response.text()
      const content = this.extractTextContent(html)
      const title = this.extractTitle(html)

      if (content) {
        const added = this.collector.addContent(url, content.slice(0, PER_PAGE_LIMIT), title)
        if (added) {
          this.sendResults([{
            url,
            content: content.slice(0, PER_PAGE_LIMIT),
            title
          }])
        }
      }
    } catch (error) {
      // Silently skip failed URLs
      return
    }
  }

  async processBatch(urls: string[], batchSize = 15) {
    const tasks = []
    for (const url of urls.slice(0, batchSize)) {
      if (!this.collector.seenUrls.has(url)) {
        this.collector.seenUrls.add(url)
        tasks.push(this.fetchAndParseContent(url))
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
      return true
    }
  }

  async collectContent(searchResults: any[]) {
    this.sendUpdate('Starting content collection...')
    
    const urls = searchResults.map(result => result.url)
    const batchSize = 40

    for (let startIdx = 0; startIdx < urls.length; startIdx += batchSize) {
      const batchUrls = urls.slice(startIdx, startIdx + batchSize)
      this.sendUpdate(`Processing batch ${Math.floor(startIdx/batchSize) + 1}`)
      
      const shouldContinue = await this.processBatch(batchUrls, batchSize)
      
      if (!shouldContinue) {
        this.sendUpdate('Content limit reached or batch processing complete')
        break
      }

      await new Promise(resolve => setTimeout(resolve, 100))
    }

    return this.collector.collectedData
  }

  async run(query: string) {
    this.sendUpdate(`Starting web research for query: ${query}`)
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
    
    return collectedData
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { query } = await req.json()

    if (!BING_API_KEY) {
      throw new Error('BING_API_KEY is not configured')
    }

    const stream = new ReadableStream({
      start: async (controller) => {
        try {
          const scraper = new WebScraper(BING_API_KEY, controller)
          const results = await scraper.run(query)
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