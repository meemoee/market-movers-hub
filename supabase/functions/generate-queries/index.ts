
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { marketQuestion, marketDescription, iteration } = await req.json()

    if (!marketQuestion) {
      throw new Error('Market question is required')
    }

    console.log(`Generating queries for market: "${marketQuestion}" (iteration ${iteration || 1})`)
    console.log(`Market description: "${marketDescription}"`)

    const openRouterKey = Deno.env.get('OPENROUTER_API_KEY')
    if (!openRouterKey) {
      throw new Error('Missing OpenRouter API key')
    }

    const systemMessage = `You are an expert at generating effective web search queries to research prediction markets.
Your goal is to generate queries that will find the most recent, relevant, and data-rich content.`

    const userMessage = `I need to research this prediction market question: "${marketQuestion}"
${marketDescription ? `Additional context: ${marketDescription}` : ''}

Generate 5 search queries that would be effective for iteration ${iteration || 1} of research.

CRITICAL REQUIREMENTS:
- Format as search queries, not questions (avoid words like "what", "how", "why", etc.)
- Prioritize finding RECENT information and statistics (include years like 2024-2025)
- Target specific data points, percentages, and metrics
- Each query should focus on a different aspect of the topic
- Include key entities and technical terms
- Make queries differently focused to get diverse results
- Include relevant time frames or date ranges where appropriate

Output ONLY a JSON array of 5 query strings. No other text.`

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://hunchex.app'
      },
      body: JSON.stringify({
        model: 'deepseek/deepseek-chat-v3-0324',
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.7,
        response_format: { type: "json_object" }
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`OpenRouter API error: ${response.status} ${errorText}`)
    }

    const data = await response.json()
    let content = data.choices[0].message.content
    
    // Try to parse as JSON directly
    let queries = []
    try {
      const parsed = JSON.parse(content)
      if (Array.isArray(parsed)) {
        queries = parsed
      } else if (parsed.queries && Array.isArray(parsed.queries)) {
        queries = parsed.queries
      }
    } catch (err) {
      // If direct parsing fails, try to extract JSON from the text
      console.error('Error parsing response:', err)
      const jsonMatch = content.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        try {
          queries = JSON.parse(jsonMatch[0])
        } catch (innerErr) {
          console.error('Error parsing extracted JSON:', innerErr)
        }
      }
    }

    // Ensure we have queries, even if parsing failed
    if (!queries.length) {
      console.log('Using fallback queries due to parsing error')
      queries = [
        `${marketQuestion} latest data statistics 2024-2025`,
        `${marketQuestion} expert prediction analysis`,
        `${marketQuestion} historical trends comparison`,
        `${marketQuestion} probability factors percentage`,
        `${marketQuestion} current status updates`
      ]
    }

    console.log(`Generated ${queries.length} queries:`, queries)

    return new Response(
      JSON.stringify(queries),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  } catch (error) {
    console.error('Error in generate-queries:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
