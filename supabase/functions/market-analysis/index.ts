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
    const { message, chatHistory } = await req.json()

    // Make request to OpenRouter API with streaming enabled
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "perplexity/llama-3.1-sonar-small-128k-online",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant. Be concise and clear in your responses."
          },
          {
            role: "user",
            content: `Chat History:\n${chatHistory || 'No previous chat history'}\n\nCurrent Query: ${message}`
          }
        ],
        stream: true
      })
    })

    // Set up streaming response
    let responseStream = new TransformStream()
    const writer = responseStream.writable.getWriter()
    const reader = response.body?.getReader()

    // Stream the response
    if (reader) {
      ;(async () => {
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) {
              await writer.close()
              break
            }
            
            const chunk = new TextDecoder().decode(value)
            const lines = chunk
              .split('\n')
              .filter(line => line.trim() !== '')
              .map(line => line.replace(/^data: /, ''))

            for (const line of lines) {
              if (line === '[DONE]') continue
              try {
                const json = JSON.parse(line)
                const content = json.choices[0]?.delta?.content || ''
                if (content) {
                  await writer.write(new TextEncoder().encode(content))
                }
              } catch (e) {
                console.error('Error parsing JSON:', e)
              }
            }
          }
        } catch (error) {
          console.error('Error in streaming:', error)
          await writer.abort(error)
        }
      })()
    }

    return new Response(responseStream.readable, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    })

  } catch (error) {
    console.error('Error in market-analysis function:', error)
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