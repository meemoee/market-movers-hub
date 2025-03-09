
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
    const { webContent, analysis, marketPrice, marketQuestion } = await req.json()
    
    // Trim content to avoid token limits
    const trimmedContent = webContent.slice(0, 15000)
    console.log('Web content length:', trimmedContent.length)
    console.log('Analysis length:', analysis.length)
    console.log('Current market price:', marketPrice !== undefined ? marketPrice + '%' : 'not provided')
    console.log('Market question:', marketQuestion || 'not provided')

    // Make request to OpenRouter API
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
            content: "You are a helpful market research analyst. Extract key insights from the provided web research and analysis. You must return ONLY a JSON object with the requested fields. Extract ONLY factual points directly supported by the provided content. Do not invent, interpolate, or add information not explicitly found in the source material."
          },
          {
            role: "user",
            content: `Based on this web research and analysis, provide the probability and insights:

${marketQuestion ? `Market Question: ${marketQuestion}` : ''}
${marketPrice !== undefined ? `Current Market Probability: ${marketPrice}%` : ''}

Web Content:
${trimmedContent}

Analysis:
${analysis}

${marketPrice !== undefined ? `Consider if the current market probability of ${marketPrice}% is accurate based on the available information.` : ''}

Return ONLY a JSON object with these fields:
1. probability: your estimated probability as a percentage string (e.g., "65%")
2. areasForResearch: an array of strings describing specific areas needing more research (3-5 areas)
3. supportingPoints: specific points of evidence supporting the event occurring
4. negativePoints: specific points of evidence against the event occurring
5. reasoning: a brief paragraph explaining your probability estimate

Each point must be a direct fact or evidence found in the provided content. Do not create generic points or infer information not explicitly stated. Only include points that have specific evidence in the source material.`
          }
        ],
        response_format: { type: "json_object" },
        stream: false
      })
    });

    if (!response.ok) {
      console.error('OpenRouter API error:', response.status, await response.text())
      throw new Error('Failed to get insights from OpenRouter')
    }

    const data = await response.json()
    console.log('Got response from OpenRouter:', !!data)
    
    try {
      const content = data.choices?.[0]?.message?.content
      if (!content) {
        throw new Error('No content in OpenRouter response')
      }
      
      console.log('Content type:', typeof content)
      
      // Parse JSON content if it's a string, or use it directly if it's already an object
      let parsed
      if (typeof content === 'string') {
        try {
          parsed = JSON.parse(content)
        } catch (err) {
          console.error('Error parsing JSON:', err)
          console.log('Raw content:', content)
          throw new Error('Failed to parse OpenRouter response as JSON')
        }
      } else if (typeof content === 'object') {
        parsed = content
      } else {
        throw new Error(`Unexpected content type: ${typeof content}`)
      }
      
      // Ensure areas_for_research is always a non-null array
      const result = {
        probability: parsed.probability || "Unknown",
        areasForResearch: Array.isArray(parsed.areasForResearch) && parsed.areasForResearch.length > 0 
          ? parsed.areasForResearch 
          : ["Additional context and information", "More recent data", "Expert opinions"],
        supportingPoints: Array.isArray(parsed.supportingPoints) ? parsed.supportingPoints : [],
        negativePoints: Array.isArray(parsed.negativePoints) ? parsed.negativePoints : [],
        reasoning: parsed.reasoning || "No reasoning provided"
      }
      
      console.log('Returning formatted result with fields:', Object.keys(result).join(', '))
      console.log('Supporting points count:', result.supportingPoints.length)
      console.log('Negative points count:', result.negativePoints.length)
      console.log('Areas for research count:', result.areasForResearch.length)
      
      // Return a direct Response with the result JSON instead of a stream
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    } catch (error) {
      console.error('Error processing OpenRouter response:', error)
      // Even in error case, we return a valid result with default values to avoid null constraint violations
      const fallbackResult = {
        probability: "Unknown",
        areasForResearch: ["Additional context and information", "More recent data", "Expert opinions"],
        supportingPoints: [],
        negativePoints: [],
        reasoning: "An error occurred while extracting insights."
      }
      return new Response(JSON.stringify(fallbackResult), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
  } catch (error) {
    console.error('Error in extract-research-insights:', error)
    // Return fallback values instead of just the error to avoid null constraint violations
    return new Response(
      JSON.stringify({ 
        error: error.message, 
        probability: "Unknown",
        areasForResearch: ["Additional context and information", "More recent data", "Expert opinions"],
        supportingPoints: [],
        negativePoints: [],
        reasoning: "An error occurred while extracting insights."
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
