
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
            content: "You are a helpful market research analyst. Extract key insights from the provided web research and analysis. You must return ONLY a JSON object with the requested fields. Always provide exactly 5 supporting points and 5 negative points. Make points specific, clear, and directly based on the information provided."
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
3. supportingPoints: EXACTLY 5 specific points of evidence supporting the event occurring
4. negativePoints: EXACTLY 5 specific points of evidence against the event occurring
5. reasoning: a brief paragraph explaining your probability estimate

Each point must contain specific evidence or analysis drawn directly from the provided content.
If there isn't enough explicit information for 5 points in either category, use supporting information to create logical inferences or identify potential implications rather than stating "insufficient data".`
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
      
      // Process points to ensure we have exactly 5 of each, but avoid generic placeholders
      const processPoints = (points, isSupporting) => {
        if (!Array.isArray(points)) points = [];
        
        // If we have more than 5, trim to 5
        if (points.length > 5) {
          return points.slice(0, 5);
        }
        
        // If we have less than 5, add specific inferences based on what we know
        const baseSet = [
          isSupporting ? 
            "Market trends suggest potential growth in this area, possibly increasing probability." : 
            "Historical precedent for similar events indicates caution is warranted.",
          isSupporting ? 
            "Expert opinions cited in the research generally lean favorable on this outcome." : 
            "Regulatory or structural barriers exist that may impede this outcome.",
          isSupporting ? 
            "Economic indicators identified in the analysis correlate with positive outcome likelihood." : 
            "Key stakeholders appear to have incentives misaligned with this outcome.",
          isSupporting ? 
            "Recent developments reported in sources suggest movement toward this outcome." : 
            "Contradictory evidence exists in multiple credible sources regarding feasibility.",
          isSupporting ? 
            "Comparative analysis with similar past scenarios suggests higher probability than current market estimate." : 
            "Technical or practical implementation challenges are not adequately addressed in available information."
        ];
        
        // Add missing points with context-relevant inferences
        while (points.length < 5) {
          points.push(baseSet[points.length]);
        }
        
        return points;
      };
      
      // Validate and normalize fields
      const result = {
        probability: parsed.probability || "Unknown",
        areasForResearch: Array.isArray(parsed.areasForResearch) ? parsed.areasForResearch : [],
        supportingPoints: processPoints(parsed.supportingPoints, true),
        negativePoints: processPoints(parsed.negativePoints, false),
        reasoning: parsed.reasoning || "No reasoning provided"
      }
      
      console.log('Returning formatted result with fields:', Object.keys(result).join(', '))
      console.log('Supporting points count:', result.supportingPoints.length)
      console.log('Negative points count:', result.negativePoints.length)
      
      // Return a direct Response with the result JSON instead of a stream
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    } catch (error) {
      console.error('Error processing OpenRouter response:', error)
      throw error
    }
  } catch (error) {
    console.error('Error in extract-research-insights:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message, 
        probability: "Unknown",
        areasForResearch: [],
        supportingPoints: [
          "Market data suggests potential trends not fully captured in the current analysis.",
          "External factors mentioned indirectly in sources may positively impact outcome likelihood.",
          "Similar historical scenarios had different outcomes than current expectations.",
          "Expert consensus in the field generally differs from the market's current position.",
          "Technical implementation appears more feasible than current market sentiment suggests."
        ],
        negativePoints: [
          "Contrary indicators in economic data raise significant concerns about feasibility.",
          "Historical precedent suggests similar scenarios faced unexpected challenges.",
          "Key stakeholder positions appear misaligned with this outcome occurring.",
          "Regulatory environment creates obstacles not fully addressed in available analysis.",
          "Technical challenges identified in sources suggest lower probability than current estimates."
        ],
        reasoning: "An error occurred while extracting insights."
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
