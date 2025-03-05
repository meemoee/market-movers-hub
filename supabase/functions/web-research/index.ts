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
    // Enable streaming for faster response time
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
        response_format: { type: "json_object" },
        stream: true // Enable streaming for faster first token
      })
    })

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`)
    }

    // Process the streamed response to get queries faster
    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error("Failed to create reader from response")
    }

    let jsonData = ""
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      
      const chunk = new TextDecoder().decode(value)
      const lines = chunk.split('\n')
      
      for (const line of lines) {
        if (line.startsWith('data: ') && line.length > 6) {
          const data = line.slice(6)
          if (data === '[DONE]') continue
          
          try {
            const parsed = JSON.parse(data)
            const content = parsed.choices?.[0]?.delta?.content || 
                          parsed.choices?.[0]?.message?.content || ''
            jsonData += content
          } catch (e) {
            // Skip parse errors for incomplete chunks
          }
        }
      }
    }
    
    try {
      const queriesData = JSON.parse(jsonData)
      const queries = queriesData.queries || []
      console.log('Generated queries:', queries)
      return queries
    } catch (e) {
      console.error("Error parsing JSON:", e)
      return [query] // Fallback to original query
    }

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

function analyzeSources(collectedData: Array<{url: string, content: string, title?: string}>, query: string, writer: WritableStreamDefaultWriter<Uint8Array>) {
  return new Promise<void>(async (resolve, reject) => {
    const encoder = new TextEncoder();
    try {
      await writer.write(encoder.encode(`data: ${JSON.stringify({ message: "Starting analysis of collected sources..." })}\n\n`));
      
      // Now, use OpenRouter API with streaming like market-analysis does
      console.log('Making request to OpenRouter API with collected data...')
      const openRouterResponse = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:5173',
          'X-Title': 'Market Research App',
        },
        body: JSON.stringify({
          model: "perplexity/llama-3.1-sonar-small-128k-online",
          messages: [
            {
              role: "system",
              content: `You are a helpful assistant for market research. Analyze the provided information and extract key insights.
    
Your output should be well-structured and include:
1. A probability assessment (e.g., "70%") of market success
2. A list of areas that need additional research
3. A detailed market analysis based on the provided data
    
Focus on identifying market trends, competition, and opportunities.`
            },
            {
              role: "user",
              content: `I'm researching this market query: "${query}"
    
Here is the collected information from ${collectedData.length} sources:
    
${collectedData.map((item, index) => `SOURCE ${index+1}: ${item.title || 'Untitled'}
URL: ${item.url}
CONTENT: ${item.content.substring(0, 1500)}
---
`).join('\n')}
    
Based on this information, please provide:
1. A probability assessment of success in this market
2. Key areas that need more research
3. A comprehensive analysis of the market potential`
            }
          ],
          stream: true
        })
      });

      if (!openRouterResponse.ok) {
        throw new Error(`OpenRouter API error: ${openRouterResponse.status}`)
      }

      // Process the OpenRouter stream by parsing and reformatting each chunk
      // This is critical to ensure the client code can properly handle the stream
      const reader = openRouterResponse.body?.getReader();
      if (!reader) {
        throw new Error("Failed to create reader from response")
      }

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          // Decode the binary data to text
          const text = new TextDecoder().decode(value);
          
          // Pass through the SSE data lines as is
          // This preserves the 'data: {...}' format expected by the client
          await writer.write(encoder.encode(text));
        }
      } finally {
        reader.releaseLock();
      }
      
      resolve();
    } catch (error) {
      console.error("Error in analysis:", error);
      reject(error);
    }
  });
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

    // Keep track of collected data for analysis
    const collectedData: Array<{url: string, content: string, title?: string}> = [];
    const seenUrls = new Set();

    // Process research in the background
    const processResearch = async () => {
      try {
        // Generate sub-queries with streaming enabled for faster response
        const subQueries = await generateSubQueries(query, focusText)
        await writer.write(encoder.encode(`data: ${JSON.stringify({ message: `Generated ${subQueries.length} research queries` })}\n\n`))
        
        // Process each sub-query
        for (const subQuery of subQueries) {
          await writer.write(encoder.encode(`data: ${JSON.stringify({ message: `Searching for: ${subQuery}` })}\n\n`))
          
          const searchResults = await searchBing(subQuery)
          if (searchResults.length === 0) {
            continue
          }
          
          await writer.write(encoder.encode(`data: ${JSON.stringify({ message: `Found ${searchResults.length} search results` })}\n\n`))
          
          // Process search results in parallel batches - no artificial delays
          const batchSize = 10
          for (let i = 0; i < searchResults.length; i += batchSize) {
            const batch = searchResults.slice(i, i + batchSize)
            
            const contentPromises = batch.map(async (result) => {
              const url = result.url
              
              // Skip if URL has been seen already
              if (seenUrls.has(url)) {
                return null
              }
              
              // Skip certain domains
              if (url.includes('reddit.com') || 
                  url.includes('facebook.com') || 
                  url.includes('twitter.com') || 
                  url.includes('instagram.com')) {
                return null
              }
              
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
            
            const batchResults = await Promise.all(contentPromises)
            const validResults = batchResults.filter(Boolean) as Array<{url: string, content: string, title?: string}>
            
            if (validResults.length > 0) {
              // Add to our collection for LLM analysis later
              collectedData.push(...validResults);
              
              // Stream the results to the client immediately
              await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'results', data: validResults })}\n\n`))
            }
          }
        }
        
        // Once all data is collected, analyze it with the LLM using streaming
        if (collectedData.length > 0) {
          await analyzeSources(collectedData, query, writer);
        } else {
          await writer.write(encoder.encode(`data: ${JSON.stringify({ message: "No relevant content found to analyze" })}\n\n`))
        }
        
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
