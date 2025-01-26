import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../_shared/cors.ts'
import { load } from "https://esm.sh/cheerio@1.0.0-rc.12"

const BING_SEARCH_URL = "https://api.bing.microsoft.com/v7.0/search"
const PER_PAGE_LIMIT = 5000
const TOTAL_CHAR_LIMIT = 240000

class ContentCollector {
  totalChars = 0
  collectedData: { url: string; content: string }[] = []
  seenUrls = new Set<string>()

  addContent(url: string, content: string): boolean {
    if (this.totalChars >= TOTAL_CHAR_LIMIT) {
      return false
    }

    const contentLen = content.length
    if (this.totalChars + contentLen <= TOTAL_CHAR_LIMIT) {
      this.totalChars += contentLen
      this.collectedData.push({ url, content })
      return true
    }
    return false
  }
}

class WebScraper {
  private bingApiKey: string
  private collector: ContentCollector
  private encoder = new TextEncoder()
  private writer: WritableStreamDefaultWriter<any>

  constructor(bingApiKey: string, writer: WritableStreamDefaultWriter<any>) {
    if (!bingApiKey) {
      throw new Error('Bing API key is required')
    }
    this.bingApiKey = bingApiKey
    this.collector = new ContentCollector()
    this.writer = writer
  }

  private async writeProgress(message: string) {
    await this.writer.write(this.encoder.encode(`data: ${JSON.stringify({
      message,
      totalSites: this.collector.collectedData.length,
      sites: this.collector.collectedData
    })}\n\n`))
  }

  async searchBing(query: string) {
    await this.writeProgress(`🔍 Searching for: ${query}`)
    
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
      await this.writeProgress(`📊 Found ${results.length} search results`)
      return results
    } catch (error) {
      console.error("Search error:", error)
      return []
    }
  }

  parseHtml(html: string): string {
    const $ = load(html)
    $('script, style').remove()
    return $('body').text()
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  async fetchAndParseContent(url: string) {
    try {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`)
      }

      const contentType = response.headers.get('content-type')
      if (!contentType?.includes('text/html')) {
        throw new Error('Not an HTML page')
      }

      const html = await response.text()
      const content = this.parseHtml(html).slice(0, PER_PAGE_LIMIT)

      if (content) {
        const added = this.collector.addContent(url, content)
        if (!added) {
          throw new Error('Content limit reached')
        }
        await this.writeProgress(`✅ Processed: ${url}`)
      }
    } catch (error) {
      console.error(`Error processing ${url}:`, error)
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
      console.error('Batch processing error:', error)
      return true
    }
  }

  async collectContent(searchResults: any[]) {
    await this.writeProgress('🚀 Starting content collection...')
    
    const urls = searchResults.map(result => result.url)
    const batchSize = 40

    for (let startIdx = 0; startIdx < urls.length; startIdx += batchSize) {
      const batchUrls = urls.slice(startIdx, startIdx + batchSize)
      await this.writeProgress(`⚡ Processing batch ${Math.floor(startIdx/batchSize) + 1}`)
      
      const shouldContinue = await this.processBatch(batchUrls, batchSize)
      
      if (!shouldContinue) {
        await this.writeProgress('✨ Content collection complete')
        break
      }

      await new Promise(resolve => setTimeout(resolve, 100))
    }

    return this.collector.collectedData
  }

  async run(query: string) {
    await this.writeProgress(`🎯 Starting research for: ${query}`)
    const searchResults = await this.searchBing(query)
    
    if (!searchResults.length) {
      await this.writeProgress("❌ No search results found")
      return []
    }

    return await this.collectContent(searchResults)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { query } = await req.json()
    
    if (!query) {
      throw new Error('Query is required')
    }

    // Create a TransformStream for streaming updates
    const stream = new TransformStream()
    const writer = stream.writable.getWriter()

    // Start processing in the background
    const scraper = new WebScraper(Deno.env.get('BING_API_KEY') || '', writer)
    scraper.run(query).catch(console.error)

    // Return the readable stream
    return new Response(stream.readable, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400
    })
  }
})