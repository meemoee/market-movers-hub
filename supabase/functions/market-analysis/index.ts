
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
    console.log('Received request:', { message, chatHistory })

    console.log('Making request to OpenRouter API...')
    const openRouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:5173',
        'X-Title': 'Market Analysis App',
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-r1",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant specialized in analyzing prediction markets and making probabilistic forecasts. Be concise and clear in your responses. Base your analysis on evidence and historical data when available."
          },
          {
            role: "user",
            content: `Chat History:\n${chatHistory || 'No previous chat history'}\n\nCurrent Query: ${message}`
          }
        ],
        stream: true,
        reasoning: { effort: "high" }
      })
    })

    if (!openRouterResponse.ok) {
      console.error('OpenRouter API error:', openRouterResponse.status, await openRouterResponse.text())
      throw new Error(`OpenRouter API error: ${openRouterResponse.status}`)
    }

    // Create a transform stream to process the response
    const { readable, writable } = new TransformStream()
    const writer = writable.getWriter()
    const encoder = new TextEncoder()
    
    // Process the original response stream
    const reader = openRouterResponse.body?.getReader()
    if (!reader) {
      throw new Error('Could not get reader from response')
    }
    
    // Function to process the stream
    const processStream = async () => {
      try {
        let buffer = ""
        const decoder = new TextDecoder()
        
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          
          const chunk = decoder.decode(value, { stream: true })
          buffer += chunk
          
          // Process complete SSE messages
          const messages = buffer.split('\n\n')
          buffer = messages.pop() || ""
          
          for (const message of messages) {
            if (message.startsWith('data: ')) {
              const data = message.slice(6)
              
              // Check if it's the [DONE] message
              if (data.trim() === '[DONE]') {
                await writer.write(encoder.encode('data: [DONE]\n\n'))
                continue
              }
              
              try {
                const parsed = JSON.parse(data)
                
                // Extract content and reasoning
                const delta = parsed.choices?.[0]?.delta || {}
                const content = delta.content || ''
                const reasoning = delta.reasoning || ''
                
                // If there's reasoning, include it with the content
                if (reasoning) {
                  // Add reasoning prefix before standard content in the stream
                  const reasoningMsg = `data: ${JSON.stringify({
                    choices: [{ delta: { content: `REASONING: ${reasoning}\n\n` } }]
                  })}\n\n`
                  await writer.write(encoder.encode(reasoningMsg))
                }
                
                // Send regular content
                if (content) {
                  await writer.write(encoder.encode(`data: ${data}\n\n`))
                } else if (!reasoning) {
                  // Pass through other delta updates that don't have content or reasoning
                  await writer.write(encoder.encode(`data: ${data}\n\n`))
                }
              } catch (e) {
                console.error('Error parsing SSE data:', e)
                await writer.write(encoder.encode(`data: ${data}\n\n`))
              }
            } else if (message.trim()) {
              // Pass through non-data messages
              await writer.write(encoder.encode(`${message}\n\n`))
            }
          }
        }
        
        // Write any remaining content in the buffer
        if (buffer.trim()) {
          await writer.write(encoder.encode(`${buffer}\n\n`))
        }
        
        await writer.close()
      } catch (error) {
        console.error('Error processing stream:', error)
        await writer.abort(error)
      }
    }
    
    // Start processing the stream
    processStream()

    return new Response(readable, {
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
