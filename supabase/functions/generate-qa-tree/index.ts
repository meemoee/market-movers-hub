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
    const { question, marketId, parentContent } = await req.json()
    
    if (!question) {
      throw new Error('Question is required')
    }
    
    console.log('Analyzing question:', question)
    console.log('Market ID:', marketId)
    console.log('Parent content:', parentContent)

    // Get analysis from Perplexity (no JSON formatting)
    const perplexityResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:5173',
        'X-Title': 'Market Analysis App',
      },
      body: JSON.stringify({
        model: "perplexity/llama-3.1-sonar-small-128k-online",
        messages: [
          {
            role: "system",
            content: "Analyze the given question and provide a detailed analysis with specific citations. You must include specific examples and quotes. Your response must include specific citations and analysis."
          },
          {
            role: "user",
            content: question
          }
        ],
        stream: true
      })
    })

    if (!perplexityResponse.ok) {
      throw new Error(`Perplexity API error: ${perplexityResponse.status}`)
    }

    // If we have parent content, get follow-up questions from Gemini
    let followupQuestions: string[] = []
    if (parentContent) {
      const geminiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:5173',
          'X-Title': 'Market Analysis App',
        },
        body: JSON.stringify({
          model: "google/gemini-flash-1.5-8b",
          messages: [
            {
              role: "system",
              content: "Based on the provided question and analysis, generate exactly three analytical follow-up questions. Return ONLY a JSON array of three questions. Each follow-up question must be able to COMPLETELY PORTRAY the ENTIRE context in EACH QUESTION ALONE."
            },
            {
              role: "user",
              content: `Question: ${question}\n\nAnalysis: ${parentContent}`
            }
          ],
          response_format: { type: "json_object" },
          stream: true
        })
      })

      if (!geminiResponse.ok) {
        throw new Error(`Gemini API error: ${geminiResponse.status}`)
      }

      // Stream the Gemini response for follow-up questions
      return new Response(geminiResponse.body, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      })
    }

    // Stream the Perplexity response for initial analysis
    return new Response(perplexityResponse.body, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    })

  } catch (error) {
    console.error('Error in generate-qa-tree function:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    )
  }
})