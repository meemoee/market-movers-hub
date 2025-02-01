import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const cleanGeminiResponse = (content: string): string => {
  // Remove code fences and extra whitespace
  return content
    .replace(/```json\n/g, '')
    .replace(/```\n?/g, '')
    .replace(/^\s+|\s+$/g, '');
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { question, marketId, parentContent, isFollowUp } = await req.json()
    
    if (!question) {
      throw new Error('Question is required')
    }
    
    console.log('Processing request:', {
      question,
      marketId,
      hasParentContent: !!parentContent,
      isFollowUp
    })

    // Handle follow-up questions generation
    if (isFollowUp && parentContent) {
      console.log('Generating follow-up questions')
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
              content: "Generate three analytical follow-up questions as a JSON array. Each question should be an object with a 'question' field. Return only the JSON array, nothing else."
            },
            {
              role: "user",
              content: `Generate three focused analytical follow-up questions based on this context:\n\nOriginal Question: ${question}\n\nAnalysis: ${parentContent}`
            }
          ]
        })
      })

      if (!response.ok) {
        throw new Error(`Follow-up generation failed: ${response.status}`)
      }

      const data = await response.json()
      console.log('Raw follow-up response:', data)

      try {
        // Extract and clean the content from Gemini response
        const rawContent = data.choices[0].message.content;
        const cleanContent = cleanGeminiResponse(rawContent);
        
        // Validate the cleaned JSON
        const parsedContent = JSON.parse(cleanContent);
        if (!Array.isArray(parsedContent)) {
          throw new Error('Response is not an array');
        }
        
        // Return the cleaned and validated JSON
        return new Response(
          JSON.stringify(parsedContent), 
          { 
            headers: { 
              ...corsHeaders, 
              'Content-Type': 'application/json'
            }
          }
        )
      } catch (e) {
        console.error('Invalid JSON in follow-up response:', rawContent)
        throw new Error('Failed to parse follow-up questions')
      }
    }

    // Handle initial analysis
    console.log('Generating analysis')
    const analysisResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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

    if (!analysisResponse.ok) {
      throw new Error(`Analysis generation failed: ${analysisResponse.status}`)
    }

    return new Response(analysisResponse.body, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    })

  } catch (error) {
    console.error('Function error:', error)
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