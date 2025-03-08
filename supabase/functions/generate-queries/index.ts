
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
    const { query, marketPrice, marketQuestion } = await req.json()

    if (!OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY is not configured')
    }

    console.log('Generating sub-queries for:', query)
    console.log('Market question:', marketQuestion || 'not provided')
    console.log('Current market price:', marketPrice !== undefined ? marketPrice + '%' : 'not provided')
    
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

${marketQuestion ? `Market Question: ${marketQuestion}` : `Topic: ${query}`}
${marketPrice !== undefined ? `Current Market Probability: ${marketPrice}%` : ''}

${marketPrice !== undefined ? `Generate search queries to explore both supporting and contradicting evidence for this probability.` : ''}

Respond with a JSON object containing a 'queries' array with exactly 5 search query strings. The format should be {"queries": ["query 1", "query 2", "query 3", "query 4", "query 5"]}`
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
    
    console.log('Raw LLM response:', content)
    
    try {
      let queriesData
      
      // First try parsing the content directly
      try {
        queriesData = JSON.parse(content)
      } catch (parseError) {
        console.log('Standard JSON parsing failed, attempting alternate parsing methods')
        
        // Try to extract JSON from markdown code blocks
        const jsonMatch = content.match(/```(?:json)?\s*({[\s\S]*?})\s*```/)
        if (jsonMatch && jsonMatch[1]) {
          try {
            queriesData = JSON.parse(jsonMatch[1])
            console.log('Successfully extracted JSON from markdown code block')
          } catch (error) {
            console.error('Error parsing extracted JSON from markdown:', error)
          }
        }
        
        // If still no valid JSON, attempt to construct it from the text
        if (!queriesData) {
          console.log('Attempting to construct JSON from text response')
          
          // Extract lines that look like queries
          const queryLines = content.match(/["']?(.*?)["']?(?:,|\n|$)/g)
          if (queryLines && queryLines.length > 0) {
            const cleanedQueries = queryLines
              .map(line => {
                // Extract the actual query text from the line
                const match = line.match(/["']?(.*?)["']?(?:,|\n|$)/)
                return match ? match[1].trim() : null
              })
              .filter(q => q && q.length > 5 && !q.includes('{') && !q.includes('}'))
              .slice(0, 5)
            
            if (cleanedQueries.length > 0) {
              queriesData = { queries: cleanedQueries }
              console.log('Constructed JSON from extracted query lines:', queriesData)
            }
          }
        }
        
        // Last resort: use fallback queries
        if (!queriesData || !queriesData.queries || !Array.isArray(queriesData.queries) || queriesData.queries.length === 0) {
          console.log('Using fallback queries')
          queriesData = {
            queries: [
              `${query} latest information`,
              `${query} analysis and trends`,
              `${query} expert opinions`,
              `${query} recent developments`,
              `${query} statistics and data`
            ]
          }
        }
      }
      
      // Ensure we have exactly 5 queries
      if (!queriesData.queries || !Array.isArray(queriesData.queries)) {
        queriesData.queries = [`${query} information`, `${query} analysis`, `${query} latest`, `${query} data`, `${query} news`]
      } else if (queriesData.queries.length < 5) {
        // Fill remaining queries with generic ones
        const generics = [`${query} latest`, `${query} news`, `${query} analysis`, `${query} updates`, `${query} forecast`]
        for (let i = queriesData.queries.length; i < 5; i++) {
          queriesData.queries.push(generics[i % generics.length])
        }
      } else if (queriesData.queries.length > 5) {
        // Trim to 5 queries
        queriesData.queries = queriesData.queries.slice(0, 5)
      }
      
      // Validate each query
      queriesData.queries = queriesData.queries.map((q: any, i: number) => {
        if (typeof q !== 'string' || q.trim().length < 3) {
          return `${query} information ${i+1}`
        }
        return q.trim()
      })
      
      console.log('Generated queries:', queriesData.queries)

      return new Response(
        JSON.stringify({ queries: queriesData.queries }),
        { 
          headers: { 
            ...corsHeaders,
            'Content-Type': 'application/json'
          } 
        }
      )
    } catch (parseError) {
      console.error('Error handling LLM response:', parseError)
      console.log('Raw content:', content)
      
      // Provide fallback queries instead of failing
      const fallbackQueries = [
        `${query} latest information`,
        `${query} analysis and trends`,
        `${query} expert opinions`,
        `${query} recent developments`,
        `${query} statistics and data`
      ]
      
      return new Response(
        JSON.stringify({ queries: fallbackQueries }),
        { 
          headers: { 
            ...corsHeaders,
            'Content-Type': 'application/json'
          } 
        }
      )
    }

  } catch (error) {
    console.error('Error generating queries:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message,
        queries: [
          "fallback query 1",
          "fallback query 2",
          "fallback query 3", 
          "fallback query 4",
          "fallback query 5"
        ] 
      }),
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
