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
    
    console.log('Request params:', {
      question,
      marketId,
      hasParentContent: !!parentContent,
      isFollowUp
    })

    // Handle follow-up questions generation
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
              content: "You are generating follow-up questions. Return ONLY a JSON array containing exactly three analytical questions. No explanations or additional text."
            },
            {
              role: "user",
              content: `Based on this context, generate three focused analytical follow-up questions:\n\nOriginal Question: ${question}\n\nAnalysis: ${parentContent}`
            }
          ],
          response_format: { type: "json_object" }
        })
      })

      if (!geminiResponse.ok) {
        console.error('Gemini API error:', geminiResponse.status)
        throw new Error(`Gemini API error: ${geminiResponse.status}`)
      }

      const geminiData = await geminiResponse.json()
      console.log('Gemini response:', geminiData)

      // Return the follow-up questions directly (not streamed)
      return new Response(
        JSON.stringify(geminiData.choices[0].message.content),
        { 
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json'
          }
        }
      )
    }

    // Handle question analysis
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
      console.error('Perplexity API error:', perplexityResponse.status)
      throw new Error(`Perplexity API error: ${perplexityResponse.status}`)
    }

    // Stream the analysis response
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
      JSON.stringify({ 
        error: error.message,
        details: error instanceof Error ? error.stack : 'Unknown error'
      }),
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
