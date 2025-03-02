
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const BRAVE_API_KEY = Deno.env.get('BRAVE_API_KEY')

interface SearchResult {
  title: string;
  url: string;
  description: string;
}

Deno.serve(async (req) => {
  // Create a TextEncoder for streaming
  const encoder = new TextEncoder();
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Get the request body
    const { queries, marketDescription } = await req.json()
    
    if (!queries || !Array.isArray(queries) || queries.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid queries parameter' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Set up streaming
    const stream = new TransformStream()
    const writer = stream.writable.getWriter()
    
    // Start the response immediately
    const response = new Response(stream.readable, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    })

    // Function to send a message to the stream
    const sendMessage = async (type: string, data: any) => {
      await writer.write(
        encoder.encode(`data: ${JSON.stringify({ type, ...data })}\n\n`)
      )
    }

    // Processing queries in the background
    ;(async () => {
      try {
        await sendMessage('message', { message: `Processing ${queries.length} search queries...` })

        // Process each query in sequence
        for (let i = 0; i < queries.length; i++) {
          const query = queries[i]
          
          // Send a status message
          await sendMessage('message', { 
            message: `Processing query ${i+1}/${queries.length}: ${query.substring(0, 100)}` 
          })
          
          await sendMessage('message', { message: `Processing query: ${query}` })

          // Call Brave Search API
          const searchResponse = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10&search_lang=en&country=US`, {
            headers: {
              'Accept': 'application/json',
              'Accept-Encoding': 'gzip',
              'X-Subscription-Token': BRAVE_API_KEY
            }
          })

          if (!searchResponse.ok) {
            const errorText = await searchResponse.text()
            console.error(`Brave API error for query "${query}":`, errorText)
            await sendMessage('error', { 
              message: `Error with search query "${query}": ${searchResponse.status} ${searchResponse.statusText}` 
            })
            continue
          }

          const searchData = await searchResponse.json()
          const results: SearchResult[] = searchData.web?.results || []

          if (results.length === 0) {
            await sendMessage('message', { message: `No results found for "${query}"` })
            continue
          }

          // Extract URLs and fetch content
          await sendMessage('message', { message: `Found ${results.length} results for "${query}"` })
          
          const fetchPromises = results.slice(0, 3).map(async (result) => {
            try {
              // Fetch page content
              const pageResponse = await fetch(result.url, { 
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ResearchBot/1.0)' }
              })
              
              if (!pageResponse.ok) {
                return null
              }
              
              const contentType = pageResponse.headers.get('content-type') || ''
              if (!contentType.includes('text/html')) {
                return null
              }
              
              const html = await pageResponse.text()
              
              // Extract readable content
              const textContent = extractContent(html)
              
              return {
                url: result.url,
                title: result.title,
                content: textContent
              }
            } catch (err) {
              console.error(`Error fetching ${result.url}:`, err)
              return null
            }
          })

          // Wait for all fetches to complete
          const fetchedResults = (await Promise.all(fetchPromises)).filter(Boolean)
          
          if (fetchedResults.length > 0) {
            await sendMessage('results', { data: fetchedResults })
          }
        }

        await sendMessage('message', { message: 'Search completed' })
        await writer.close()
      } catch (err) {
        console.error('Stream processing error:', err)
        await sendMessage('error', { message: `Stream processing error: ${err.message}` })
        await writer.close()
      }
    })().catch(async (err) => {
      console.error('Background processing error:', err)
      try {
        await sendMessage('error', { message: `Background processing error: ${err.message}` })
        await writer.close()
      } catch (closeErr) {
        console.error('Error closing writer:', closeErr)
      }
    })

    return response
  } catch (error) {
    console.error('Error in web-scrape function:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

function extractContent(html: string): string {
  // Very simple content extraction - remove HTML tags and normalize whitespace
  const withoutTags = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  
  // Break into paragraphs for readability
  const paragraphs = withoutTags.split(/\.\s+/)
    .filter(p => p.length > 30)
    .slice(0, 20)
    .join('. ')
  
  return paragraphs
}
