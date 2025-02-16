
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
    console.log('Received request with question:', question)
    console.log('Analysis:', analysis)

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
            content: "You are an evaluator that assesses the quality and completeness of answers to questions. You must provide a score between 0 and 100 and a brief reason for the score. Output ONLY a valid JSON object in this format: {\"score\": number, \"reason\": \"string\"}. Do not include any other text, markdown, or formatting."
          },
          {
            role: "user",
            content: `Please evaluate how well this analysis answers the question:\n\nQuestion: ${question}\n\nAnalysis: ${analysis}`
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
    
    let evaluationText = data.choices[0].message.content
    console.log('Raw evaluation text:', evaluationText)

    // More robust JSON cleanup
    evaluationText = evaluationText
      .replace(/```json\s*/g, '')  // Remove ```json
      .replace(/```\s*$/g, '')     // Remove closing ```
      .replace(/^\s*{\s*/, '{')    // Clean start
      .replace(/\s*}\s*$/, '}')    // Clean end
      .trim()

    console.log('Cleaned evaluation text:', evaluationText)

    try {
      const evaluation = JSON.parse(evaluationText)
      console.log('Parsed evaluation:', evaluation)

      // Validate the evaluation object structure
      if (typeof evaluation !== 'object' || evaluation === null) {
        throw new Error('Evaluation must be an object')
      }

      if (!('score' in evaluation) || typeof evaluation.score !== 'number') {
        throw new Error('Invalid score format')
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
      console.error('Problematic evaluation text:', evaluationText)
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
