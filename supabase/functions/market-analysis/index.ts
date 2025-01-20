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

    if (!openRouterResponse.ok) {
      console.error('OpenRouter API error:', openRouterResponse.status, await openRouterResponse.text())
      throw new Error(`OpenRouter API error: ${openRouterResponse.status}`)
    }

    console.log('Creating TransformStream for response processing...')
    const transformStream = new TransformStream({
      transform(chunk, controller) {
        console.log('Processing chunk:', chunk)
        // Convert the chunk to text
        const text = new TextDecoder().decode(chunk)
        console.log('Decoded text:', text)
        
        // Each chunk might contain multiple SSE messages
        const lines = text.split('\n').filter(line => line.trim() !== '')
        console.log('Split lines:', lines)
        
        for (const line of lines) {
          console.log('Processing line:', line)
          if (line.startsWith('data: ')) {
            const data = line.slice(5).trim()
            console.log('Extracted data:', data)
            
            if (data === '[DONE]') {
              console.log('Received [DONE] signal')
              continue
            }
            
            try {
              console.log('Attempting to parse JSON:', data)
              const parsed = JSON.parse(data)
              console.log('Successfully parsed JSON:', parsed)
              controller.enqueue(line + '\n')
              console.log('Enqueued line to stream')
            } catch (e) {
              console.error('Error parsing SSE data:', e, 'Raw data:', data)
            }
          } else {
            console.log('Skipping non-data line:', line)
          }
        }
      }
    })

    console.log('Streaming response back to client...')
    return new Response(openRouterResponse.body?.pipeThrough(transformStream), {
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