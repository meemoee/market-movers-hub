import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"

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
    const { webContent, analysis } = await req.json()
    
    if (!webContent || !analysis) {
      throw new Error('Both web content and analysis must be provided')
    }

    console.log('Extracting insights from content and analysis')
    console.log('Analysis length:', analysis.length)
    console.log('Web content length:', webContent.length)

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
            content: "You are a precise data extractor. Extract the final probability percentage and areas needing further research from the provided analysis."
          },
          {
            role: "user",
            content: `Based on this web research content and analysis, extract ONLY:
1. The final probability percentage mentioned
2. The list of areas needing further research

Web Content:
${webContent}

Analysis:
${analysis}

Return ONLY a JSON object with these two fields:
{
  "probability": "X%" (where X is the number),
  "areasForResearch": ["area1", "area2", etc]
}`
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

    // Parse the content string into a JSON object
    const insights = JSON.parse(result.choices[0].message.content)
    console.log('Parsed insights:', insights)

    return new Response(JSON.stringify(insights), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error in extract-research-insights:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})