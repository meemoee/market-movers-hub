
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
            content: "You are an evaluator that assesses the quality and completeness of answers to questions. Your task is to provide a score between 0 and 100 and a brief reason for the score. IMPORTANT: You must ONLY output valid JSON in this exact format, nothing else: {\"score\": number, \"reason\": \"string\"}. Do not include any markdown, explanations, or other text."
          },
          {
            role: "user",
            content: `Please evaluate how well this analysis answers the question:\n\nQuestion: ${question}\n\nAnalysis: ${analysis}`
          }
        ]
      })
    })

    if (!openRouterResponse.ok) {
      throw new Error(`OpenRouter API error: ${openRouterResponse.status}`)
    }

    const data = await openRouterResponse.json()
    const evaluationText = data.choices[0].message.content

    try {
      console.log('Raw evaluation text:', evaluationText)
      const evaluation = JSON.parse(evaluationText)
      
      // Validate the evaluation object structure
      if (typeof evaluation.score !== 'number' || typeof evaluation.reason !== 'string') {
        throw new Error('Invalid evaluation format: missing required fields')
      }
      
      // Ensure score is between 0 and 100
      evaluation.score = Math.max(0, Math.min(100, evaluation.score))
      
      return new Response(JSON.stringify(evaluation), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    } catch (error) {
      console.error('Error parsing evaluation JSON:', error)
      console.error('Received content:', evaluationText)
      throw new Error('Invalid evaluation format received')
    }

  } catch (error) {
    console.error('Error in evaluate-qa-pair function:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})

