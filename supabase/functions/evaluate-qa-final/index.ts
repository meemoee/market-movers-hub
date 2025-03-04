
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
    const { marketQuestion, qaContext, researchContext, isContinuation, originalQuestion, historyContext } = await req.json()

    const questionToUse = isContinuation && originalQuestion ? originalQuestion : marketQuestion;
    
    console.log(`Evaluating QA for market question: ${questionToUse?.substring(0, 50)}...`);
    console.log(`QA context length: ${qaContext?.length || 0}, has research context: ${!!researchContext}, is continuation: ${!!isContinuation}, has history context: ${!!historyContext}`);

    const openRouterKey = Deno.env.get('OPENROUTER_API_KEY')
    if (!openRouterKey) {
      throw new Error('Missing OpenRouter API key')
    }

    const systemPrompt = `You are a precise analyst evaluating market predictions. Review the question-answer analysis and determine:
1. The most likely probability of the event occurring (as a percentage)
2. Key areas that need more research
3. A concise final analysis

${isContinuation ? 'This is a continuation or in-depth exploration of a previous analysis.' : ''}
${historyContext ? 'Consider the previous analysis context when forming your evaluation.' : ''}
Be specific and data-driven in your evaluation.`

    const userPrompt = `Market Question: ${questionToUse}

${historyContext ? `Previous Analysis Context:
${historyContext}

` : ''}Q&A Analysis:
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

    console.log("Calling OpenRouter with market question:", questionToUse?.substring(0, 100) + "...");
    if (historyContext) {
      console.log("Including history context of length:", historyContext.length);
    }
    
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
      console.log("Successfully parsed response as JSON:", 
        JSON.stringify({
          probability: parsedContent.probability,
          areasCount: parsedContent.areasForResearch?.length,
          analysisLength: parsedContent.analysis?.length
        })
      );
    } catch (e) {
      console.error('Failed to parse LLM response as JSON:', content)
      
      // Attempt a fallback parsing approach
      try {
        // Extract probability using regex
        const probMatch = content.match(/["']?probability["']?\s*:\s*["']?([^"',}]+)["']?/);
        const probability = probMatch ? probMatch[1].trim() : "50%";
        
        // Extract areas for research
        const areasMatch = content.match(/["']?areasForResearch["']?\s*:\s*\[(.*?)\]/s);
        const areasText = areasMatch ? areasMatch[1] : "";
        const areas = areasText.split(',')
          .map(area => area.trim().replace(/^["']|["']$/g, ''))
          .filter(area => area.length > 0);
        
        // Extract analysis
        const analysisMatch = content.match(/["']?analysis["']?\s*:\s*["']?(.*?)["']?$/s);
        const analysis = analysisMatch 
          ? analysisMatch[1].trim().replace(/^["']|["']$/g, '') 
          : "Unable to provide a detailed analysis from the given information.";
        
        parsedContent = {
          probability,
          areasForResearch: areas.length > 0 ? areas : ["Additional market data", "Expert opinions"],
          analysis
        };
        
        console.log("Used fallback parsing for malformed JSON");
      } catch (fallbackError) {
        console.error('Fallback parsing also failed:', fallbackError);
        // Return a default response
        parsedContent = {
          probability: "50%",
          areasForResearch: ["Additional market data", "Expert opinions"],
          analysis: "Insufficient information to provide a detailed analysis."
        };
      }
    }

    return new Response(
      JSON.stringify(parsedContent),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in evaluate-qa-final:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message,
        probability: "50%",
        areasForResearch: ["Error analysis", "Technical issues"],
        analysis: "An error occurred during analysis. Please try again."
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
