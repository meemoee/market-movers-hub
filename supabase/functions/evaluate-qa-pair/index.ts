
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
        model: "google/gemini-flash-1.5",
        messages: [
          {
            role: "system",
            content: "You are an evaluator that assesses the quality and completeness of answers to questions in the context of prediction market analysis. You MUST respond with a JSON object containing a 'score' number between 0 and 100 and a 'reason' string explaining the score. Example format: {\"score\": 85, \"reason\": \"The analysis is thorough...\"}"
          },
          {
            role: "user",
            content: `Given this prediction market context:
Market Question: ${marketQuestion || 'N/A'}
Market Description: ${marketDescription || 'N/A'}

Please evaluate how well this analysis answers the follow-up question:

Question: ${question}

Analysis: ${analysis}`
          }
        ],
        response_format: { type: "json_object" }
      })
    })

    if (!openRouterResponse.ok) {
      console.error('OpenRouter API error:', openRouterResponse.status, await openRouterResponse.text())
      throw new Error(`OpenRouter API error: ${openRouterResponse.status}`)
    }

    const data = await openRouterResponse.json()
    console.log('OpenRouter API response:', JSON.stringify(data))
    
    try {
      const evaluation = JSON.parse(data.choices[0].message.content)
      console.log('Parsed evaluation:', evaluation)

      // Enhanced validation
      if (typeof evaluation !== 'object' || evaluation === null) {
        throw new Error('Evaluation must be an object')
      }

      if (!('score' in evaluation)) {
        throw new Error('Missing score field')
      }

      if (typeof evaluation.score !== 'number') {
        // Try to convert string to number if possible
        const numericScore = Number(evaluation.score)
        if (isNaN(numericScore)) {
          throw new Error('Invalid score format: must be a number')
        }
        evaluation.score = numericScore
      }

      if (!('reason' in evaluation) || typeof evaluation.reason !== 'string') {
        throw new Error('Invalid reason format')
      }

      // Ensure score is between 0 and 100
      evaluation.score = Math.max(0, Math.min(100, evaluation.score))

      return new Response(JSON.stringify(evaluation), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    } catch (error) {
      console.error('Error parsing evaluation:', error)
      console.error('Problematic evaluation text:', data.choices[0].message.content)
      throw new Error(`Invalid evaluation format: ${error.message}`)
    }

  } catch (error) {
    console.error('Error in evaluate-qa-pair function:', error)
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
