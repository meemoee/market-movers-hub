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

  getAllContent(): string {
    return this.collectedData.map(item => {
      return `Title: ${item.title || 'Untitled'}\nContent: ${item.content}\nSource: ${item.url}\n---\n`
    }).join('\n')
  }
}

async function generateSubQueries(query: string): Promise<string[]> {
  console.log('Generating sub-queries for:', query)
  
  try {
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
            content: "You are a helpful assistant that generates search queries."
          },
          {
            role: "user",
            content: `Generate 5 diverse search queries to gather comprehensive information about the following topic. Focus on different aspects that would be relevant for market research:

Topic: ${query}

Respond with a JSON object containing a 'queries' array with exactly 5 search query strings.`
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
    const queries = queriesData.queries || []
    
    console.log('Generated queries:', queries)

    return queries

  } catch (error) {
    console.error("Error generating queries:", error)
    return [query] // Fallback to original query if generation fails
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

  private async streamAnalysis(content: string) {
    if (!OPENROUTER_API_KEY) {
      throw new Error('OpenRouter API key is required')
    }

    this.sendUpdate('Analyzing collected content...')

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
            content: "You are a helpful assistant that analyzes web content and provides concise, relevant insights."
          },
          {
            role: "user",
            content: `Analyze the following web content and provide a clear, concise analysis focusing on the most important points and their implications:\n\n${content}`
          }
        ],
        stream: true
      })
    })

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`)
    }

    const reader = response.body?.getReader()
    const decoder = new TextDecoder()

    while (reader) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value)
      const lines = chunk.split('\n').filter(line => line.trim())

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6).trim()
          if (jsonStr === '[DONE]') continue

          try {
            const parsed = JSON.parse(jsonStr)
            const content = parsed.choices?.[0]?.delta?.content
            if (content) {
              const data = `data: ${JSON.stringify({ type: 'analysis', content })}\n\n`
              this.controller.enqueue(this.encoder.encode(data))
            }
          } catch (e) {
            console.error('Error parsing SSE data:', e)
          }
        }
      }
    }
  }

  private async searchBing(query: string) {
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

  private shouldSkipUrl(url: string): boolean {
    const skipDomains = ['reddit.com', 'facebook.com', 'twitter.com', 'instagram.com']
    return skipDomains.some(domain => url.includes(domain))
  }

  private async fetchAndParseContent(url: string) {
    if (this.shouldSkipUrl(url)) return

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)

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
      
      // Remove scripts and styles
      $('script').remove()
      $('style').remove()
      
      const title = $('title').text().trim()
      const content = $('body').text()
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 5000)

      if (content) {
        const added = this.collector.addContent(url, content, title)
        if (added) {
          this.sendResults([{
            url,
            content,
            title
          }])
        }
      }
    } catch (error) {
      // Skip failed URLs silently
      return
    }
  }

  private async processBatch(urls: string[], batchSize = 15) {
    const tasks = []
    for (const url of urls.slice(0, batchSize)) {
      tasks.push(this.fetchAndParseContent(url))
    }

    if (tasks.length === 0) {
      return false
    }

    try {
      await Promise.all(tasks)
      return true
    } catch (error) {
      return true
    }
  }

  async run(query: string) {
    this.sendUpdate(`Starting web research for query: ${query}`)
    
    const subQueries = await generateSubQueries(query)
    this.sendUpdate(`Generated ${subQueries.length} sub-queries for research`)
    
    for (const subQuery of subQueries) {
      this.sendUpdate(`Processing search query: ${subQuery}`)
      const searchResults = await this.searchBing(subQuery)
      
      if (!searchResults.length) continue

      const urls = searchResults.map(result => result.url)
      const batchSize = 40

      for (let startIdx = 0; startIdx < urls.length; startIdx += batchSize) {
        const batchUrls = urls.slice(startIdx, startIdx + batchSize)
        const shouldContinue = await this.processBatch(batchUrls, batchSize)
        
        if (!shouldContinue) break

        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }

    // After collecting all content, stream the analysis
    const allContent = this.collector.getAllContent()
    await this.streamAnalysis(allContent)

    return this.collector.collectedData
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
