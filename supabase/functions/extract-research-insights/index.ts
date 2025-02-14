
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { webContent, analysis } = await req.json()
    
    // Trim content to avoid token limits
    const trimmedContent = webContent.slice(0, 15000)
    console.log('Web content length:', trimmedContent.length)
    console.log('Analysis length:', analysis.length)

    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:5173',
        'X-Title': 'Market Research App',
      },
      body: JSON.stringify({
        model: "google/gemini-flash-1.5",
        messages: [
          {
            role: "system",
            content: "You are a helpful market research analyst. Extract key insights from the provided web research and analysis. Return ONLY a JSON object with two fields: probability (a percentage string like '75%') and areasForResearch (an array of strings describing areas needing more research)."
          },
          {
            role: "user",
            content: `Based on this web research and analysis, provide the probability and areas needing more research:\n\nWeb Content:\n${trimmedContent}\n\nAnalysis:\n${analysis}`
          }
        ],
        response_format: { type: "json_object" },
        stream: true
      })
    })

    if (!response.ok) {
      console.error('OpenRouter API error:', response.status, await response.text())
      throw new Error('Failed to get insights from OpenRouter')
    }

    // Create a TransformStream to handle accumulating JSON chunks
    const transformer = new TransformStream({
      start() {},
      transform(chunk: Uint8Array, controller) {
        // Convert chunk to string
        const text = new TextDecoder().decode(chunk)
        const lines = text.split('\n').filter(line => line.trim())
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6).trim()
            if (jsonStr === '[DONE]') continue
            
            try {
              // Append each chunk to the stream
              controller.enqueue(chunk)
            } catch (e) {
              console.error('Transform error:', e)
            }
          }
        }
      },
      flush() {}
    })

    // Pipe the response through our transformer
    const transformedStream = response.body?.pipeThrough(transformer)

    if (!transformedStream) {
      throw new Error('Failed to create stream')
    }

    return new Response(transformedStream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    })

  } catch (error) {
    console.error('Error in extract-research-insights:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
