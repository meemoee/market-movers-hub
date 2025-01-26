import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { query } = await req.json()

    console.log('Generating queries for:', query)

    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:5173',
        'X-Title': 'Market Research App',
      },
      body: JSON.stringify({
        model: "google/gemini-pro",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant that generates search queries. Always respond with valid JSON containing an array of exactly 5 search queries."
          },
          {
            role: "user",
            content: `Generate 5 diverse search queries to gather comprehensive information about: ${query}. Focus on different aspects that would be relevant for market research.`
          }
        ],
        response_format: { type: "json_object" }
      })
    })

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`)
    }

    const result = await response.json()
    console.log('Raw OpenRouter response:', result)
    
    const content = result.choices[0].message.content
    console.log('Content from OpenRouter:', content)
    
    let queries
    try {
      // Parse the content as JSON
      const parsedContent = JSON.parse(content)
      queries = parsedContent.queries || []
      
      if (!Array.isArray(queries)) {
        throw new Error('Queries must be an array')
      }
      
      console.log('Successfully parsed queries:', queries)
    } catch (parseError) {
      console.error('Error parsing queries:', parseError)
      throw new Error('Failed to parse queries from response')
    }

    return new Response(
      JSON.stringify({ queries }),
      { 
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json' 
        } 
      }
    )

  } catch (error) {
    console.error("Error generating queries:", error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})