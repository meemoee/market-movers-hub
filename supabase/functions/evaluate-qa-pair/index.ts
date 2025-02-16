
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
    const { question, analysis, marketQuestion, marketDescription } = await req.json()
    console.log('Received request with question:', question)
    console.log('Analysis:', analysis)
    console.log('Market question:', marketQuestion)
    console.log('Market description:', marketDescription)

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
            content: `You are an evaluator that assesses the quality and completeness of answers to questions in the context of prediction market analysis. Your response must be valid JSON in this exact format:
{
  "score": number between 0 and 100,
  "reason": "string explaining the score"
}`
          },
          {
            role: "user",
            content: `Given this prediction market context:
Market Question: ${marketQuestion || 'N/A'}
Market Description: ${marketDescription || 'N/A'}

Please evaluate how well this analysis answers the follow-up question:

Question: ${question}

Analysis: ${analysis}

Remember to respond with valid JSON only, no other text or formatting.`
          }
        ]
      })
    })

    if (!openRouterResponse.ok) {
      console.error('OpenRouter API error:', openRouterResponse.status, await openRouterResponse.text())
      throw new Error(`OpenRouter API error: ${openRouterResponse.status}`)
    }

    const data = await openRouterResponse.json()
    console.log('OpenRouter API response:', JSON.stringify(data))
    
    try {
      let evaluation;
      const content = data.choices[0].message.content;
      console.log('Raw content:', content);

      try {
        // First try parsing as is
        evaluation = JSON.parse(content);
      } catch (e) {
        // If that fails, try to extract JSON from the content
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          evaluation = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No valid JSON found in response');
        }
      }

      console.log('Parsed evaluation:', evaluation);

      // Validate the evaluation object structure
      if (typeof evaluation !== 'object' || evaluation === null) {
        throw new Error('Evaluation must be an object');
      }

      if (!('score' in evaluation) || typeof evaluation.score !== 'number') {
        throw new Error('Invalid score format');
      }

      if (!('reason' in evaluation) || typeof evaluation.reason !== 'string') {
        throw new Error('Invalid reason format');
      }

      // Ensure score is between 0 and 100
      evaluation.score = Math.max(0, Math.min(100, evaluation.score));

      return new Response(JSON.stringify(evaluation), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    } catch (error) {
      console.error('Error parsing evaluation:', error);
      console.error('Problematic evaluation text:', data.choices[0].message.content);
      throw new Error(`Invalid evaluation format: ${error.message}`);
    }

  } catch (error) {
    console.error('Error in evaluate-qa-pair function:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: error instanceof Error ? error.stack : undefined
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
