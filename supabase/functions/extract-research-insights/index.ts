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

    // A simple TransformStream that buffers incoming text until full SSE events are available
    let buffer = ""
    const transformStream = new TransformStream({
      transform(chunk, controller) {
        const text = new TextDecoder().decode(chunk)
        buffer += text
        const parts = buffer.split("\n\n")
        // Keep the last (possibly incomplete) part in the buffer
        buffer = parts.pop() || ""
        
        for (const part of parts) {
          if (part.startsWith("data: ")) {
            const dataStr = part.slice(6).trim()
            if (dataStr === "[DONE]") continue
            
            try {
              const parsed = JSON.parse(dataStr)
              const content = parsed.choices?.[0]?.delta?.content || 
                            parsed.choices?.[0]?.message?.content || ""
              
              if (content) {
                // Re-emit the SSE event with properly formatted content
                controller.enqueue(
                  new TextEncoder().encode(`data: ${JSON.stringify(parsed)}\n\n`)
                )
              }
            } catch (err) {
              console.error("Error parsing SSE chunk:", err)
            }
          }
        }
      },
      flush(controller) {
        // Process any remaining data in the buffer
        if (buffer.trim()) {
          try {
            const dataStr = buffer.trim()
            if (dataStr.startsWith("data: ")) {
              const jsonStr = dataStr.slice(6).trim()
              if (jsonStr !== "[DONE]") {
                const parsed = JSON.parse(jsonStr)
                const content = parsed.choices?.[0]?.delta?.content || 
                              parsed.choices?.[0]?.message?.content || ""
                
                if (content) {
                  controller.enqueue(
                    new TextEncoder().encode(`data: ${JSON.stringify(parsed)}\n\n`)
                  )
                }
              }
            }
          } catch (err) {
            console.error("Error parsing final SSE chunk:", err)
          }
        }
        buffer = ""
      }
    })

    return new Response(response.body?.pipeThrough(transformStream), {
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
