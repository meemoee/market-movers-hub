import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"
import { load } from "https://esm.sh/cheerio@1.0.0-rc.12"

const BING_API_KEY = Deno.env.get('BING_API_KEY')
const BING_SEARCH_URL = "https://api.bing.microsoft.com/v7.0/search"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

class ContentCollector {
  seenUrls: Set<string>
  
  constructor() {
    this.seenUrls = new Set()
  }

  shouldProcessUrl(url: string): boolean {
    if (this.seenUrls.has(url)) return false
    this.seenUrls.add(url)
    return true
  }
}

class WebScraper {
  private bingApiKey: string
  private collector: ContentCollector
  private encoder: TextEncoder
  private controller: ReadableStreamDefaultController<any>
  private processedUrls: number
  private maxUrlsPerQuery: number
  private maxQueriesProcessed: number
  private queriesProcessed: number

  constructor(bingApiKey: string, controller: ReadableStreamDefaultController<any>) {
    if (!bingApiKey) throw new Error('Bing API key is required')
    this.bingApiKey = bingApiKey
    this.collector = new ContentCollector()
    this.encoder = new TextEncoder()
    this.controller = controller
    this.processedUrls = 0
    this.maxUrlsPerQuery = 12      // Balanced number of URLs per query
    this.maxQueriesProcessed = 4   // Process 4 queries max
    this.queriesProcessed = 0
  }

  private sendUpdate(message: string) {
    console.log(message)
    const data = `data: ${JSON.stringify({ message })}\n\n`
    this.controller.enqueue(this.encoder.encode(data))
  }

  private sendResults(results: any[]) {
    const data = `data: ${JSON.stringify({ type: 'results', data: results })}\n\n`
    this.controller.enqueue(this.encoder.encode(data))
  }

  private shouldSkipUrl(url: string): boolean {
    // Only skip social media and file downloads
    const skipDomains = [
      'reddit.com', 'facebook.com', 'twitter.com', 
      'instagram.com', 'youtube.com', 'tiktok.com'
    ]
    const skipExtensions = ['.pdf', '.doc', '.docx', '.xls', '.xlsx']
    
    return skipDomains.some(domain => url.includes(domain)) ||
           skipExtensions.some(ext => url.toLowerCase().endsWith(ext))
  }

  async searchBing(query: string, offset = 0): Promise<any[]> {
    try {
      const params = new URLSearchParams({
        q: query,
        count: "10",              // Get 10 results per page
        offset: offset.toString(),
        responseFilter: "Webpages"
      })

      const response = await fetch(`${BING_SEARCH_URL}?${params}`, {
        headers: { "Ocp-Apim-Subscription-Key": this.bingApiKey }
      })

      if (!response.ok) {
        console.error('Bing API error:', response.status)
        return []
      }

      const data = await response.json()
      return data.webPages?.value || []
    } catch (error) {
      console.error("Search error:", error)
      return []
    }
  }

  async fetchAndParseContent(url: string) {
    if (this.shouldSkipUrl(url) || !this.collector.shouldProcessUrl(url)) return

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000) // 5s timeout

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html',
        },
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)

      if (!response.ok) return

      const contentType = response.headers.get('content-type')
      if (!contentType?.includes('text/html')) return

      const html = await response.text()
      
      // Skip extremely large pages
      if (html.length > 500000) return
      
      const $ = load(html)
      
      // Remove only the most problematic elements
      $('script, style, nav, iframe').remove()
      
      const title = $('title').text().trim()
      const mainContent = $('main, article, .content, .article, .post').text() || $('body').text()
      const content = mainContent
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 3000) // Allow more content per page

      if (content) {
        this.sendResults([{ url, content, title }])
        this.processedUrls++
      }
    } catch (error) {
      return // Skip failed URLs
    }
  }

  async processBatch(urls: string[]) {
    const batchSize = 4  // Process 4 URLs at once
    for (let i = 0; i < urls.length; i += batchSize) {
      const batchUrls = urls.slice(i, i + batchSize)
      const promises = batchUrls.map(url => this.fetchAndParseContent(url))
      await Promise.all(promises)
      await new Promise(resolve => setTimeout(resolve, 200)) // Consistent small delay
    }
  }

  async processQuery(query: string) {
    let offset = 0
    let urlsProcessed = 0

    while (urlsProcessed < this.maxUrlsPerQuery) {
      const searchResults = await this.searchBing(query, offset)
      if (!searchResults.length) break

      const urls = searchResults.map(result => result.url)
      await this.processBatch(urls)
      
      urlsProcessed += urls.length
      offset += 10
      
      if (urlsProcessed >= this.maxUrlsPerQuery) break
      await new Promise(resolve => setTimeout(resolve, 500)) // Consistent delay between searches
    }
  }

  async run(queries: string[]) {
    this.sendUpdate(`Starting web research for ${queries.length} queries`)
    
    for (const query of queries) {
      if (this.queriesProcessed >= this.maxQueriesProcessed) {
        this.sendUpdate('Reached maximum number of queries to process')
        break
      }

      this.sendUpdate(`Processing query ${this.queriesProcessed + 1}/${this.maxQueriesProcessed}: ${query}`)
      await this.processQuery(query)
      this.queriesProcessed++
      
      await new Promise(resolve => setTimeout(resolve, 1000)) // Consistent delay between queries
    }

    return true
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { queries } = await req.json()

    if (!BING_API_KEY) {
      throw new Error('BING_API_KEY is not configured')
    }

    const stream = new ReadableStream({
      start: async (controller) => {
        try {
          const scraper = new WebScraper(BING_API_KEY, controller)
          await scraper.run(queries)
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
