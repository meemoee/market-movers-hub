
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
    const { message, chatHistory, sessionId } = await req.json()
    console.log('Received request:', { message, chatHistory, sessionId })

    // Configure timeout and retries
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 120000) // 2 minute timeout
    
    let retryCount = 0
    const maxRetries = 3
    
    async function makeRequestWithRetry() {
      try {
        console.log(`Making request to OpenRouter API (attempt ${retryCount + 1})...`)
        const openRouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'http://localhost:5173',
            'X-Title': 'Market Analysis App',
            'Connection': 'keep-alive',
            'Keep-Alive': 'timeout=120', // 2 minute keepalive
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
            stream: true,
            max_tokens: 2000, // Set a reasonable max token limit
          }),
          signal: controller.signal
        })

        if (!openRouterResponse.ok) {
          console.error('OpenRouter API error:', openRouterResponse.status, await openRouterResponse.text())
          throw new Error(`OpenRouter API error: ${openRouterResponse.status}`)
        }

        // Create a TransformStream to process and forward chunks with additional error handling
        const transformer = new TransformStream({
          async start(controller) {
            console.log('Stream processing started')
          },
          async transform(chunk, controller) {
            // Forward valid chunks
            controller.enqueue(chunk)
          },
          async flush(controller) {
            console.log('Stream processing completed')
          }
        })

        // Return the transformed stream
        const transformedStream = openRouterResponse.body?.pipeThrough(transformer)
        
        // Clear the timeout as we're successfully returning a stream
        clearTimeout(timeoutId)
        
        if (!transformedStream) {
          throw new Error('Failed to create transformed stream')
        }

        console.log('Successfully created response stream')
        return new Response(transformedStream, {
          headers: {
            ...corsHeaders,
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
          }
        })
      } catch (error) {
        if (error.name === 'AbortError') {
          console.error('Request aborted due to timeout')
          throw new Error('Request timed out after 120 seconds')
        }
        
        if (retryCount < maxRetries) {
          retryCount++
          console.log(`Retrying request (${retryCount}/${maxRetries})...`)
          // Exponential backoff with jitter
          const delay = Math.min(1000 * (2 ** retryCount) + Math.random() * 1000, 10000)
          await new Promise(resolve => setTimeout(resolve, delay))
          return makeRequestWithRetry()
        }
        
        throw error
      }
    }

    return await makeRequestWithRetry()
  } catch (error) {
    clearTimeout(timeoutId)
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
