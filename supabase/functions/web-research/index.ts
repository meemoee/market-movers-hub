
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"

const BING_API_KEY = Deno.env.get('BING_API_KEY')
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')
const BING_SEARCH_URL = "https://api.bing.microsoft.com/v7.0/search"
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function generateSubQueries(query: string, focusText?: string): Promise<string[]> {
  console.log('Generating sub-queries for:', query, focusText ? `with focus: ${focusText}` : '')
  
  const promptContent = focusText 
    ? `Generate 5 diverse search queries to gather comprehensive information about the following topic, with specific focus on the aspect mentioned. Focus on different aspects that would be relevant for market research:

Topic: ${query}
Focus specifically on: ${focusText}

Respond with a JSON object containing a 'queries' array with exactly 5 search query strings.`
    : `Generate 5 diverse search queries to gather comprehensive information about the following topic. Focus on different aspects that would be relevant for market research:

Topic: ${query}

Respond with a JSON object containing a 'queries' array with exactly 5 search query strings.`;

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://hunchex.com',
        'X-Title': 'Hunchex Research',
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
            content: promptContent
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

async function searchBing(query: string) {
  console.log('Searching Bing for:', query)
  
  const headers = {
    "Ocp-Apim-Subscription-Key": BING_API_KEY
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
    return data.webPages?.value || []
  } catch (error) {
    console.error("Search error:", error)
    return []
  }
}

async function fetchPageContent(url: string) {
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

    if (!response.ok) return null

    const contentType = response.headers.get('content-type')
    if (!contentType?.includes('text/html')) return null

    const html = await response.text()
    // Use a simple regex-based approach for extraction to avoid external dependencies
    const cleanText = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 5000);
      
    // Extract title using regex
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';
    
    return { content: cleanText, title };
  } catch (error) {
    return null
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { query, focusText } = await req.json()
    console.log(`Web research request received: ${query}${focusText ? `, focus: ${focusText}` : ''}`)

    if (!BING_API_KEY) {
      throw new Error('BING_API_KEY is not configured')
    }

    if (!OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY is not configured')
    }

    // Generate transformer stream to handle the data collection and sending
    const { readable, writable } = new TransformStream()
    const encoder = new TextEncoder()
    const writer = writable.getWriter()

    // Process research in the background
    const processResearch = async () => {
      try {
        // Generate sub-queries
        const subQueries = await generateSubQueries(query, focusText)
        await writer.write(encoder.encode(`data: ${JSON.stringify({ message: `Generated ${subQueries.length} research queries` })}\n\n`))
        
        // Track seen URLs to avoid duplicates
        const seenUrls = new Set()
        
        // Process all sub-queries in parallel but send results as they come in
        const queryPromises = subQueries.map(async (subQuery, queryIndex) => {
          await writer.write(encoder.encode(`data: ${JSON.stringify({ message: `Searching for: ${subQuery}` })}\n\n`))
          
          const searchResults = await searchBing(subQuery)
          if (searchResults.length === 0) {
            return
          }
          
          await writer.write(encoder.encode(`data: ${JSON.stringify({ message: `Found ${searchResults.length} search results for query ${queryIndex + 1}` })}\n\n`))
          
          // Filter search results to avoid duplicates and process all in parallel
          const uniqueResults = searchResults.filter(result => !seenUrls.has(result.url))
          
          // Process content for all URLs in parallel
          const contentPromises = uniqueResults.map(async (result) => {
            const url = result.url
            
            // Skip certain domains
            if (url.includes('reddit.com') || 
                url.includes('facebook.com') || 
                url.includes('twitter.com') || 
                url.includes('instagram.com')) {
              return null
            }
            
            // Mark URL as seen
            seenUrls.add(url)
            
            const extracted = await fetchPageContent(url)
            if (!extracted || !extracted.content) {
              return null
            }
            
            return {
              url,
              title: extracted.title,
              content: extracted.content
            }
          })
          
          // Wait for all content to be fetched
          const results = await Promise.all(contentPromises)
          const validResults = results.filter(Boolean)
          
          // Send results immediately if we have any
          if (validResults.length > 0) {
            await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'results', data: validResults })}\n\n`))
          }
        })
        
        // Wait for all queries to complete
        await Promise.all(queryPromises)
        
        // Close the writer when done
        await writer.close()
      } catch (error) {
        console.error("Error in research process:", error)
        const errorMessage = error instanceof Error ? error.message : "Unknown error"
        await writer.write(encoder.encode(`data: ${JSON.stringify({ error: errorMessage })}\n\n`))
        await writer.close()
      }
    }
    
    // Start the research process without awaiting it
    processResearch()
    
    // Return the readable stream immediately
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
