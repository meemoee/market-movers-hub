import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"

const BING_SEARCH_URL = "https://api.bing.microsoft.com/v7.0/search"
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function generateSearchQueries(intent: string, openrouterApiKey: string): Promise<string[]> {
  console.log('Generating search queries for:', intent)
  
  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      "Authorization": `Bearer ${openrouterApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      "model": "google/gemini-flash-1.5",
      "messages": [
        {"role": "system", "content": "You are a helpful assistant that generates search queries."},
        {"role": "user", "content": `Generate 3 diverse search queries to gather comprehensive information about: ${intent}\n\nRespond with a JSON object containing a 'queries' key with an array of search query strings.`}
      ],
      "response_format": {"type": "json_object"}
    })
  })

  if (!response.ok) {
    throw new Error(`OpenRouter API error: ${response.status}`)
  }

  const result = await response.json()
  const content = result.choices[0].message.content.trim()
  const queriesData = JSON.parse(content)
  return queriesData.queries || []
}

async function searchBing(query: string, bingApiKey: string) {
  console.log('Searching Bing for:', query)
  
  const params = new URLSearchParams({
    q: query,
    count: "10",
    responseFilter: "Webpages"
  })

  const response = await fetch(`${BING_SEARCH_URL}?${params}`, {
    headers: {
      "Ocp-Apim-Subscription-Key": bingApiKey
    }
  })

  if (!response.ok) {
    throw new Error(`Bing API error: ${response.status}`)
  }

  const data = await response.json()
  return data.webPages?.value || []
}

async function fetchPageContent(url: string): Promise<string> {
  try {
    const response = await fetch(url)
    if (!response.ok) return ''
    
    const html = await response.text()
    const textContent = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    
    return textContent.slice(0, 5000) // Limit content per page
  } catch (error) {
    console.error(`Error fetching ${url}:`, error)
    return ''
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { intent } = await req.json()
    const bingApiKey = Deno.env.get('BING_API_KEY')
    const openrouterApiKey = Deno.env.get('OPENROUTER_API_KEY')

    if (!bingApiKey || !openrouterApiKey) {
      throw new Error('Missing API keys')
    }

    // Generate search queries
    const queries = await generateSearchQueries(intent, openrouterApiKey)
    console.log('Generated queries:', queries)

    // Collect search results
    const allResults = []
    for (const query of queries) {
      const results = await searchBing(query, bingApiKey)
      allResults.push(...results)
    }

    // Fetch content from top results
    const contentPromises = allResults.slice(0, 5).map(result => fetchPageContent(result.url))
    const contents = await Promise.all(contentPromises)
    const validContents = contents.filter(Boolean)

    // Prepare consolidated content
    const consolidatedText = `Research Intent: ${intent}\n\n` + 
      validContents.map((content, i) => `Content from ${allResults[i].url}:\n${content}\n`).join('\n')

    // Stream analysis using OpenRouter
    const stream = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        "Authorization": `Bearer ${openrouterApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        "model": "google/gemini-flash-1.5",
        "messages": [
          {"role": "system", "content": "You are a helpful assistant that synthesizes information from multiple sources."},
          {"role": "user", "content": `Analyze and synthesize the key findings from the following research:

${consolidatedText}

Provide a comprehensive analysis that:
1. Synthesizes the main findings
2. Highlights key evidence
3. Identifies patterns and insights
4. Notes any conflicting information
5. Provides a final percent likelihood of: ${intent}`}
        ],
        "stream": true
      })
    })

    return new Response(stream.body, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    })

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    )
  }
})