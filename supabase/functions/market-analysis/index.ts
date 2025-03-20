
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')
const MAX_RETRIES = 3
const HEARTBEAT_INTERVAL = 15000 // 15 seconds
const RECONNECT_DELAY = 2000 // 2 seconds

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

    // Create a TransformStream to handle the streaming response
    const { readable, writable } = new TransformStream()
    const writer = writable.getWriter()

    // Start the heartbeat mechanism in the background
    let heartbeatInterval: number | undefined
    
    const startHeartbeat = () => {
      heartbeatInterval = setInterval(async () => {
        try {
          // Send a comment as heartbeat to keep the connection alive
          await writer.write(new TextEncoder().encode(":\n\n"))
          console.log('Heartbeat sent')
        } catch (error) {
          console.error('Error sending heartbeat:', error)
          clearInterval(heartbeatInterval)
        }
      }, HEARTBEAT_INTERVAL)
    }

    // Function to cleanup resources
    const cleanup = () => {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval)
        heartbeatInterval = undefined
      }
    }

    // Launch a background task to fetch and stream the response
    (async () => {
      let retryCount = 0
      let succeeded = false
      
      while (retryCount < MAX_RETRIES && !succeeded) {
        try {
          console.log(`Making request to OpenRouter API (attempt ${retryCount + 1})...`)
          
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
              stream: true,
              max_tokens: 4096  // Increase max tokens to ensure we get complete responses
            })
          })

          if (!openRouterResponse.ok) {
            console.error('OpenRouter API error:', openRouterResponse.status, await openRouterResponse.text())
            throw new Error(`OpenRouter API error: ${openRouterResponse.status}`)
          }

          // Start the heartbeat after successful connection
          startHeartbeat()

          // Process the stream
          const reader = openRouterResponse.body?.getReader()
          if (!reader) {
            throw new Error('Failed to get reader from response')
          }

          // Setup connection timeout detection
          let lastDataTimestamp = Date.now()
          const connectionTimeoutId = setInterval(() => {
            const now = Date.now()
            if (now - lastDataTimestamp > 30000) { // 30 seconds without data
              console.warn('Connection appears stalled, no data received for 30 seconds')
              clearInterval(connectionTimeoutId)
              // Don't throw here as the reader loop will handle it
            }
          }, 5000)

          const textDecoder = new TextDecoder()
          
          try {
            while (true) {
              const { done, value } = await reader.read()
              
              if (done) {
                console.log('Stream complete')
                succeeded = true
                clearInterval(connectionTimeoutId)
                break
              }
              
              // Update the last data timestamp
              lastDataTimestamp = Date.now()
              
              // Process and forward the chunk
              const chunk = textDecoder.decode(value)
              
              // Ensure we're properly forwarding the chunk without modification
              await writer.write(value)
            }
          } catch (streamError) {
            console.error('Error reading stream:', streamError)
            clearInterval(connectionTimeoutId)
            throw streamError
          } finally {
            reader.releaseLock()
          }
          
          break // Exit the retry loop if successful
        } catch (error) {
          retryCount++
          console.error(`Attempt ${retryCount} failed:`, error)
          
          if (retryCount < MAX_RETRIES) {
            console.log(`Retrying in ${RECONNECT_DELAY}ms...`)
            await new Promise(resolve => setTimeout(resolve, RECONNECT_DELAY))
          }
        }
      }
      
      if (!succeeded) {
        console.error(`Failed after ${MAX_RETRIES} attempts`)
        await writer.write(
          new TextEncoder().encode(
            `data: {"choices":[{"delta":{"content":" Sorry, I encountered an error processing your request after multiple attempts."}}]}\n\n`
          )
        )
      }
      
      try {
        // Close the writer to signal the end
        await writer.write(new TextEncoder().encode("data: [DONE]\n\n"))
        await writer.close()
      } catch (closeError) {
        console.error('Error closing writer:', closeError)
      } finally {
        cleanup()
      }
    })()

    // Return the readable stream for immediate response
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
