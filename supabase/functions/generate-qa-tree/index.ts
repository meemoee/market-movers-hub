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
    const { marketId, marketQuestion } = await req.json()
    console.log('Received request:', { marketId, marketQuestion })

    // First get full analysis from Perplexity
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
            content: `You are a market analyst. Your task is to:
1. Provide a detailed analysis of the given market question with specific citations
2. Follow that with EXACTLY three key analytical follow-up questions
3. Format your response EXACTLY as follows:

ANALYSIS:
[Your detailed analysis with specific citations here]

QUESTIONS:
1. [First analytical question]
2. [Second analytical question]
3. [Third analytical question]`
          },
          {
            role: "user",
            content: `Analyze this market question in detail with citations, then provide three follow-up analytical questions: ${marketQuestion}`
          }
        ]
      })
    })

    if (!perplexityResponse.ok) {
      throw new Error(`Perplexity API error: ${perplexityResponse.status}`)
    }

    const perplexityData = await perplexityResponse.json()
    const perplexityContent = perplexityData.choices[0].message.content

    // Now stream JSON parsing from Gemini Flash
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
            content: `You are a JSON formatter. Your task is to parse text formatted as:
ANALYSIS: [analysis]
QUESTIONS: [questions]

And convert it to a JSON object structured as:
{
  "analysis": "the analysis text",
  "questions": ["question1", "question2", "question3"]
}

Return ONLY valid JSON.`
          },
          {
            role: "user",
            content: perplexityContent
          }
        ],
        response_format: { type: "json_object" },
        stream: true
      })
    })

    if (!geminiResponse.ok) {
      throw new Error(`Gemini API error: ${geminiResponse.status}`)
    }

    // Return the streaming response
    return new Response(geminiResponse.body, {
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
