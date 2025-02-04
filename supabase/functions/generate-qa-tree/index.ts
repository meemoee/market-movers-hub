
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('Starting generate-qa-tree function')
    
    if (!OPENROUTER_API_KEY) {
      console.error('OPENROUTER_API_KEY is not configured')
      throw new Error('OPENROUTER_API_KEY is not configured')
    }
    console.log('OPENROUTER_API_KEY is configured')

    const { question, marketId, parentContent, isFollowUp } = await req.json()
    
    if (!question) {
      console.error('Question is required but was not provided')
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
      try {
        console.log('Making request to OpenRouter API for follow-up questions')
        const response = await fetch("https://api.openrouter.ai/api/v1/chat/completions", {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://localhost:5173', // Update with your domain
            'X-Title': 'Market Analysis App',
          },
          body: JSON.stringify({
            model: "google/gemini-pro",
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
          const errorText = await response.text()
          console.error('Follow-up OpenRouter API error response:', {
            status: response.status,
            statusText: response.statusText,
            body: errorText
          })
          throw new Error(`Follow-up generation failed: ${response.status} - ${errorText}`)
        }

        const data = await response.json()
        console.log('Raw follow-up response:', data)

        try {
          const rawContent = data.choices[0].message.content;
          const cleanContent = rawContent
            .replace(/```json\n?/g, '')
            .replace(/```\n?/g, '')
            .trim();
          
          console.log('Cleaned content:', cleanContent)
          
          const parsedContent = JSON.parse(cleanContent);
          if (!Array.isArray(parsedContent)) {
            console.error('Response is not an array:', parsedContent)
            throw new Error('Response is not an array');
          }
          
          console.log('Successfully parsed follow-up questions:', parsedContent)
          
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
          console.error('Invalid JSON in follow-up response:', e)
          throw new Error('Failed to parse follow-up questions')
        }
      } catch (error) {
        console.error('Follow-up generation error:', error)
        throw error
      }
    }

    // Handle initial analysis
    console.log('Generating initial analysis')
    try {
      console.log('Making request to OpenRouter API for initial analysis')
      const analysisResponse = await fetch("https://api.openrouter.ai/api/v1/chat/completions", {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://localhost:5173', // Update with your domain
          'X-Title': 'Market Analysis App',
        },
        body: JSON.stringify({
          model: "perplexity/sonar-medium-online",
          messages: [
            {
              role: "system",
              content: "You are a helpful assistant providing detailed analysis. Start responses with complete sentences, avoid using markdown headers or numbered lists at the start. Include citations in square brackets [1] where relevant."
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
        const errorText = await analysisResponse.text()
        console.error('Analysis OpenRouter API error response:', {
          status: analysisResponse.status,
          statusText: analysisResponse.statusText,
          body: errorText
        })
        throw new Error(`Analysis generation failed: ${analysisResponse.status} - ${errorText}`)
      }

      const transformStream = new TransformStream({
        transform(chunk, controller) {
          try {
            const text = new TextDecoder().decode(chunk)
            console.log('Received chunk:', text)
            const lines = text.split('\n').filter(line => line.trim() !== '')
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6)
                if (data === '[DONE]') {
                  console.log('Stream complete')
                  return
                }
                
                try {
                  const parsed = JSON.parse(data)
                  if (parsed.choices?.[0]?.delta?.content) {
                    controller.enqueue(new TextEncoder().encode(line + '\n\n'))
                  }
                } catch (e) {
                  console.error('Error parsing chunk:', e, 'Raw chunk:', data)
                }
              }
            }
          } catch (error) {
            console.error('Error in transform stream:', error)
          }
        }
      })

      return new Response(analysisResponse.body?.pipeThrough(transformStream), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      })
    } catch (error) {
      console.error('Analysis generation error:', error)
      throw error
    }

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
