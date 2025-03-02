
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')

interface RequestBody {
  query?: string;
  marketDescription?: string;
  previousResults?: string;
  iteration?: number;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Get the request body
    const requestData: RequestBody = await req.json()
    const { query, marketDescription, previousResults, iteration = 0 } = requestData
    
    if (!query && !marketDescription) {
      return new Response(
        JSON.stringify({ error: 'Missing query or market description parameter' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const marketQuery = query || marketDescription || ''
    console.log(`Generating queries for: ${marketQuery.substring(0, 100)}${marketQuery.length > 100 ? '...' : ''}`)

    // Determine the system prompt based on iteration
    let systemPrompt = 'You are a helpful research assistant that generates effective search queries.'
    let userPrompt = ''

    if (iteration > 0 && previousResults) {
      systemPrompt = 'You are a helpful research assistant that refines search queries based on previous search results.'
      userPrompt = `
Based on the market question: "${marketQuery}"

And the previous search results:
${previousResults}

I need ${iteration > 2 ? '3' : '5'} refined search queries that will help fill the gaps in our research. Focus on aspects that were not covered well in the previous results. 
Return ONLY the search queries as a JSON array with no additional text.
`
    } else {
      userPrompt = `
I need to research this market question: "${marketQuery}"

Generate ${iteration > 0 ? '3' : '5'} effective search queries that will help me gather information to answer this question.
The queries should be diverse and cover different aspects of the question.
Return ONLY the search queries as a JSON array with no additional text.
`
    }

    // Make request to OpenRouter API
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://fastrepl.com',
        'X-Title': 'FastRepl',
      },
      body: JSON.stringify({
        model: 'google/gemini-pro',
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: userPrompt
          }
        ],
        temperature: 0.7,
      }),
    })

    if (!response.ok) {
      const errorData = await response.text()
      console.error('OpenRouter API error:', errorData)
      throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    console.log('OpenRouter response:', JSON.stringify(data))

    if (!data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
      throw new Error('Invalid response from OpenRouter API')
    }

    let queriesText = data.choices[0].message.content.trim()
    console.log('Queries text:', queriesText)

    // Extract JSON array from the response if needed
    let queries: string[] = []
    try {
      // Try to parse as JSON directly
      queries = JSON.parse(queriesText)
    } catch (e) {
      // If that fails, try to extract JSON from the text
      const jsonMatch = queriesText.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        try {
          queries = JSON.parse(jsonMatch[0])
        } catch (e2) {
          // If still fails, split by newline and clean up
          queries = queriesText
            .split('\n')
            .map(line => line.replace(/^["'\d\.\s-]*/, '').trim())
            .filter(line => line.length > 0 && !line.startsWith('[') && !line.startsWith(']'))
            .slice(0, 5)
        }
      } else {
        // Split by newline and clean up
        queries = queriesText
          .split('\n')
          .map(line => line.replace(/^["'\d\.\s-]*/, '').trim())
          .filter(line => line.length > 0 && !line.startsWith('[') && !line.startsWith(']'))
          .slice(0, 5)
      }
    }

    // Ensure we have at least some queries
    if (queries.length === 0) {
      queries = [
        marketQuery,
        `${marketQuery} analysis`,
        `${marketQuery} prediction`
      ]
    }

    console.log('Final queries:', queries)

    return new Response(
      JSON.stringify({ queries }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    console.error('Error in generate-queries function:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
