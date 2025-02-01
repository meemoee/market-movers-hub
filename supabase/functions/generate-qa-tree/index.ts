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
    const { question, marketId, parentContent, isFollowUp } = await req.json()
    
    if (!question) {
      throw new Error('Question is required')
    }
    
    console.log('Analyzing question:', question)
    console.log('Market ID:', marketId)
    console.log('Parent content:', parentContent)
    console.log('Is follow-up:', isFollowUp)

    // If this is a request for follow-up questions
    if (isFollowUp && parentContent) {
      console.log('Generating follow-up questions using Gemini')
      const geminiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
              content: "Based on the provided question and analysis, generate exactly three analytical follow-up questions. Return ONLY a JSON array of three questions, with no additional text or formatting."
            },
            {
              role: "user",
              content: `Question: ${question}\n\nAnalysis: ${parentContent}`
            }
          ],
          stream: true
        })
      })

      if (!geminiResponse.ok) {
        throw new Error(`Gemini API error: ${geminiResponse.status}`)
      }

      return new Response(geminiResponse.body, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      })
    }

    // For both initial analysis and follow-up analysis, use Perplexity
    console.log('Generating analysis using Perplexity')
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
            content: "Analyze the given question and provide a detailed analysis. Focus on facts and specific details. Format your response in clear paragraphs."
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
