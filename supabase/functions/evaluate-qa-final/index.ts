
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { marketQuestion, qaContext, researchContext } = await req.json()

    const openRouterKey = Deno.env.get('OPENROUTER_API_KEY')
    if (!openRouterKey) {
      throw new Error('Missing OpenRouter API key')
    }

    const systemPrompt = `You are a precise analyst evaluating market predictions. Review the question-answer analysis and determine:
1. The most likely probability of the event occurring (as a percentage)
2. Key areas that need more research
3. A concise final analysis

Be specific and data-driven in your evaluation.`

    const userPrompt = `Market Question: ${marketQuestion}

Q&A Analysis:
${qaContext}

${researchContext ? `Additional Research Context:
${researchContext.analysis}` : ''}

Based on this analysis, provide:
1. A probability estimate (just the number, e.g. "75%")
2. 2-3 key areas that need more research
3. A concise final analysis explaining the reasoning

Format your response as JSON with these fields:
{
  "probability": "X%",
  "areasForResearch": ["area1", "area2", ...],
  "analysis": "your analysis here"
}`

    console.log("Calling OpenRouter with market question:", marketQuestion.substring(0, 100) + "...");
    
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://hunchex.app'
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3-haiku',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
      })
    })

    const result = await response.json()
    console.log("Received OpenRouter response");
    
    if (!result.choices || !result.choices[0]) {
      console.error("Invalid response format:", result);
      throw new Error('Invalid response from OpenRouter');
    }
    
    const content = result.choices[0].message.content

    // Parse the response as JSON
    let parsedContent
    try {
      parsedContent = JSON.parse(content)
      console.log("Successfully parsed response as JSON");
    } catch (e) {
      console.error('Failed to parse LLM response as JSON:', content)
      throw new Error('Failed to parse evaluation response')
    }

    return new Response(
      JSON.stringify(parsedContent),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in evaluate-qa-final:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
