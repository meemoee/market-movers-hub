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
    const { question, marketId } = await req.json()
    
    if (!question) {
      throw new Error('Question is required')
    }
    
    console.log('Analyzing question:', question)
    console.log('Market ID:', marketId) // Optional, for future use

    // Get analysis and subquestions from Perplexity
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
            content: "Analyze the given question and provide:\n1. A long, detailed analysis with specific citations. You must include specific examples and quotes.\n2. Exactly three analytical follow-up questions\n\nYour response must include specific citations and analysis. YOU MUST phrase each follow-up question with full specificity to the context - each follow-up question must be able to COMPLETELY PORTRAY the ENTIRE context in EACH QUESTION ALONE. Your follow-up questions should explore: popular opinion, likely alternative outcomes, source legitimacy, real quotes from relevant people, historical precedents, analagous events, event specifics, most likely alternative outcome, specific examples, and comparisons to analogous events."
          },
          {
            role: "user",
            content: question
          }
        ]
      })
    })

    if (!perplexityResponse.ok) {
      throw new Error(`Perplexity API error: ${perplexityResponse.status}`)
    }

    const perplexityData = await perplexityResponse.json()
    const perplexityContent = perplexityData.choices[0].message.content

    // Stream JSON formatting from Gemini Flash
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
            content: "Extract analysis and questions from the text to create a JSON object EXACTLY in this format:\n{\n  \"analysis\": \"full analysis text\",\n  \"questions\": [\"question1\", \"question2\", \"question3\"]\n}\n\nReturn ONLY the JSON object."
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

    // Stream the JSON response
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
