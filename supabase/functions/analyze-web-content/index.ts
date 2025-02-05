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
    const { content, query } = await req.json()
    
    if (!content || content.length === 0) {
      throw new Error('No content provided for analysis')
    }

    console.log(`Analyzing content for query: ${query}`)
    console.log(`Content length: ${content.length} characters`)

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
            content: "You are a helpful market research analyst. Analyze the provided web content and provide detailed insights about market probabilities and relevant factors using chain of thought."
          },
          {
            role: "user",
            content: `Based on this web research content, provide a LONG analysis of the likelihood and key factors for this query: ${query}\n\nContent:\n${content} ------ YOU MUST indicate a percent probability at the end of your statement, along with further areas of research necessary.`
          }
        ],
        stream: true
      })
    })

    // A TransformStream that buffers incoming text until full SSE events are available
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
                            parsed.choices?.[0]?.message?.content || ''

              // Only emit if we have content
              if (content) {
                // Format markdown consistently
                const formattedContent = content
                  // Ensure proper spacing after punctuation
                  .replace(/([.!?])([A-Z])/g, '$1 $2')
                  // Normalize spaces
                  .replace(/\s+/g, ' ')
                  // Proper spacing around punctuation
                  .replace(/\s*([.,!?:])\s*/g, '$1 ')
                  // Handle markdown headers
                  .replace(/^(#+)([^\s])/gm, '$1 $2')
                  // Handle list items
                  .replace(/^(-|\d+\.)([^\s])/gm, '$1 $2')
                  // Handle emphasis and bold
                  .replace(/\*\*\s*(\w)/g, '**$1')
                  .replace(/\*\s*(\w)/g, '*$1')
                  .trim()

                // Re-emit the formatted SSE event
                controller.enqueue(new TextEncoder().encode(
                  `data: ${JSON.stringify({
                    ...parsed,
                    choices: [{
                      ...parsed.choices[0],
                      delta: { content: formattedContent }
                    }]
                  })}\n\n`
                ))
              }
            } catch (err) {
              console.error("Error parsing SSE chunk:", err)
            }
          }
        }
      },
      flush(controller) {
        // Process any remaining content in the buffer
        if (buffer.trim()) {
          try {
            const parsed = JSON.parse(buffer.trim())
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(parsed)}\n\n`))
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
    console.error('Error in analyze-web-content:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
