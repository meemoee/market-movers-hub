import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"
import { load } from "https://esm.sh/cheerio@1.0.0-rc.12"

const BING_API_KEY = Deno.env.get('BING_API_KEY')
const BING_SEARCH_URL = "https://api.bing.microsoft.com/v7.0/search"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

class ContentProcessor {
  private seenUrls: Set<string>
  private encoder: TextEncoder
  private controller: ReadableStreamDefaultController<any>

  constructor(controller: ReadableStreamDefaultController<any>) {
    this.seenUrls = new Set()
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

  private shouldSkipUrl(url: string): boolean {
    if (this.seenUrls.has(url)) return true
    
    const skipDomains = ['reddit.com', 'facebook.com', 'twitter.com', 'instagram.com']
    return skipDomains.some(domain => url.includes(domain))
  }

  async searchBing(query: string) {
    this.sendUpdate(`Searching Bing for: ${query}`)
    
    const headers = {
      "Ocp-Apim-Subscription-Key": BING_API_KEY
    }
    
    const params = new URLSearchParams({
      q: query,
      count: "50",  // Back to original 50 results
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

  async fetchAndParseContent(url: string) {
    if (this.shouldSkipUrl(url)) return null
    this.seenUrls.add(url)

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)  // Back to original 10s timeout

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)

      if (!response.ok) return null

      const contentType = response.headers.get('content-type')
      if (!contentType?.includes('text/html')) return null

      const html = await response.text()
      const $ = load(html)
      
      // Remove non-content elements for cleaner results
      $('script, style, nav, header, footer, iframe, noscript').remove()
      
      const title = $('title').text().trim()
      const content = $('body').text()
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 5000)  // Back to original 5000 char limit

      return content ? { url, content, title } : null
    } catch (error) {
      return null
    }
  }

  async processBatch(urls: string[], batchSize = 40) {  // Back to original batch size of 40
    const tasks = []
    for (const url of urls.slice(0, batchSize)) {
      tasks.push(this.fetchAndParseContent(url))
    }

    try {
      const results = await Promise.all(tasks)
      const validResults = results.filter(result => result !== null)
      if (validResults.length > 0) {
        this.sendResults(validResults)
      }
      return true
    } catch (error) {
      return false
    }
  }

  async processQuery(query: string) {
    const searchResults = await this.searchBing(query)
    if (!searchResults.length) return

    const urls = searchResults.map(result => result.url)
    const batchSize = 40

    for (let startIdx = 0; startIdx < urls.length; startIdx += batchSize) {
      const batchUrls = urls.slice(startIdx, startIdx + batchSize)
      await this.processBatch(batchUrls, batchSize)
      // Small delay between batches to prevent rate limiting
      await new Promise(resolve => setTimeout(resolve, 100))
    }
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
          const processor = new ContentProcessor(controller)
          await processor.processQuery(query)
          controller.close()
        } catch (error) {
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
      }
    })

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
