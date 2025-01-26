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

class WebScraper {
  private bingApiKey: string
  private collector: ContentCollector
  private encoder: TextEncoder
  private controller: ReadableStreamDefaultController<any>

  constructor(bingApiKey: string, controller: ReadableStreamDefaultController<any>) {
    if (!bingApiKey) throw new Error('Bing API key is required')
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
    
    const headers = { "Ocp-Apim-Subscription-Key": this.bingApiKey }
    const params = new URLSearchParams({
      q: query,
      count: "25", // Reduced from 50 to limit processing
      responseFilter: "Webpages"
    })

    try {
      const response = await fetch(`${BING_SEARCH_URL}?${params}`, { headers })
      if (!response.ok) throw new Error(`Bing API error: ${response.status}`)
      const data = await response.json()
      const results = data.webPages?.value || []
      this.sendUpdate(`Found ${results.length} search results`)
      return results
    } catch (error) {
      console.error("Search error:", error)
      return []
    }
  }

  shouldSkipUrl(url: string): boolean {
    const skipDomains = [
      'reddit.com', 'facebook.com', 'twitter.com', 'instagram.com',
      'youtube.com', 'tiktok.com', 'pinterest.com'
    ]
    return skipDomains.some(domain => url.includes(domain))
  }

  async fetchAndParseContent(url: string) {
    if (this.shouldSkipUrl(url)) return

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 3000) // Reduced timeout

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
      const $ = load(html)
      
      $('script').remove()
      $('style').remove()
      $('nav').remove()
      $('header').remove()
      $('footer').remove()
      
      const title = $('title').text().trim()
      const content = $('body').text()
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 5000) // Reduced from 5000

      if (content) {
        const added = this.collector.addContent(url, content, title)
        if (added) {
          this.sendResults([{ url, content, title }])
        }
      }
    } catch (error) {
      return
    }
  }

  async processBatch(urls: string[], batchSize = 10) { // Reduced from 15
    const tasks = []
    for (const url of urls.slice(0, batchSize)) {
      tasks.push(this.fetchAndParseContent(url))
    }

    if (tasks.length === 0) return false

    try {
      await Promise.all(tasks)
      return true
    } catch (error) {
      return true
    }
  }

  async run(queries: string[]) {
    this.sendUpdate(`Starting web research for ${queries.length} queries`)
    
    for (const query of queries) {
      this.sendUpdate(`Processing search query: ${query}`)
      const searchResults = await this.searchBing(query)
      
      if (!searchResults.length) continue

      const urls = searchResults.map(result => result.url)
      const batchSize = 20 // Reduced from 40

      for (let startIdx = 0; startIdx < urls.length; startIdx += batchSize) {
        const batchUrls = urls.slice(startIdx, startIdx + batchSize)
        const shouldContinue = await this.processBatch(batchUrls, batchSize)
        
        if (!shouldContinue) break

        await new Promise(resolve => setTimeout(resolve, 200)) // Increased delay between batches
      }
    }

    return this.collector.collectedData
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
