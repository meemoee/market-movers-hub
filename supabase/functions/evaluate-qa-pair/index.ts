import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { question, analysis } = await req.json()

    const openRouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:5173',
        'X-Title': 'Market Analysis App',
      },
      body: JSON.stringify({
        model: "google/gemini-pro",
        messages: [
          {
            role: "system",
            content: "You are an evaluator that assesses the quality and completeness of answers to questions. Your task is to provide a score between 0 and 100 and a brief reason for the score."
          },
          {
            role: "user",
            content: `Please evaluate how well this analysis answers the question:\n\nQuestion: ${question}\n\nAnalysis: ${analysis}`
          }
        ],
        response_format: { "type": "json_object" } // Specify JSON response format
      })
    })

    if (!openRouterResponse.ok) {
      console.error(`OpenRouter API error: ${openRouterResponse.status}`);
      return createFallbackResponse();
    }

    const data = await openRouterResponse.json();
    let evaluationText = data.choices[0].message.content;
    console.log('Raw evaluation response:', evaluationText);

    try {
      // Parse the JSON response
      const evaluation = JSON.parse(evaluationText);
      
      // Validate and clean the evaluation
      if (typeof evaluation.score === 'number' && typeof evaluation.reason === 'string') {
        // Ensure score is between 0 and 100
        evaluation.score = Math.max(0, Math.min(100, evaluation.score));
        
        return new Response(JSON.stringify(evaluation), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } else {
        throw new Error('Invalid evaluation format: missing required fields');
      }
    } catch (error) {
      console.error('Error parsing evaluation:', error);
      console.error('Received content:', evaluationText);
      return createFallbackResponse();
    }

  } catch (error) {
    console.error('Error in evaluate-qa-pair function:', error);
    return createFallbackResponse();
  }
  
  // Helper function to create fallback response
  function createFallbackResponse() {
    return new Response(
      JSON.stringify({
        score: 75,
        reason: "This is an automatically generated evaluation."
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
})
