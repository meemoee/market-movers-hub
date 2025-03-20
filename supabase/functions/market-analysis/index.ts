
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')
const MAX_RETRIES = 3
const HEARTBEAT_INTERVAL = 5000 // 5 seconds (reduced from 15s for more frequent heartbeats)
const RECONNECT_DELAY = 2000 // 2 seconds
const STREAM_TIMEOUT = 60000 // 60 seconds timeout threshold

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
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval)
      }
      
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

    // Queue for processing large chunks in the background
    const streamQueue: {value: Uint8Array, timestamp: number}[] = []
    let processingQueue = false
    
    // Process the queue in the background
    const processQueue = async () => {
      if (processingQueue || streamQueue.length === 0) return
      
      processingQueue = true
      
      try {
        while (streamQueue.length > 0) {
          const chunk = streamQueue.shift()
          if (chunk) {
            try {
              await writer.write(chunk.value)
            } catch (error) {
              console.error('Error writing chunk from queue:', error)
              // If we can't write, stop processing
              break
            }
          }
        }
      } finally {
        processingQueue = false
        
        // If there are more chunks, process them
        if (streamQueue.length > 0) {
          processQueue()
        }
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
              max_tokens: 4096,  // Increase max tokens to ensure we get complete responses
              temperature: 0.2   // Lower temperature for more consistent outputs
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
            if (now - lastDataTimestamp > STREAM_TIMEOUT) { 
              console.warn('Connection appears stalled, no data received for 60 seconds')
              clearInterval(connectionTimeoutId)
              throw new Error('Stream connection timeout after 60 seconds of inactivity')
            }
          }, 5000)

          const textDecoder = new TextDecoder()
          let chunkCounter = 0
          
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
              chunkCounter++
              
              try {
                // Add to queue with timestamp
                streamQueue.push({
                  value,
                  timestamp: Date.now()
                })
                
                // Start or continue processing the queue
                if (!processingQueue) {
                  processQueue()
                }
                
                // For debugging - log every 50 chunks
                if (chunkCounter % 50 === 0) {
                  console.log(`Processed ${chunkCounter} chunks, queue size: ${streamQueue.length}`)
                }
              } catch (queueError) {
                console.error(`Error processing chunk ${chunkCounter}:`, queueError)
              }
            }
          } catch (streamError) {
            console.error('Error reading stream:', streamError)
            clearInterval(connectionTimeoutId)
            
            // Attempt to recover by sending what we have
            if (streamQueue.length > 0) {
              console.log(`Attempting to flush ${streamQueue.length} remaining chunks after stream error`)
              while (streamQueue.length > 0) {
                const chunk = streamQueue.shift()
                if (chunk) {
                  try {
                    await writer.write(chunk.value)
                  } catch (error) {
                    console.error('Error flushing queue after stream error:', error)
                    break
                  }
                }
              }
            }
            
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
        // Flush any remaining chunks in the queue
        if (streamQueue.length > 0) {
          console.log(`Flushing ${streamQueue.length} remaining chunks before closing`)
          while (streamQueue.length > 0) {
            const chunk = streamQueue.shift()
            if (chunk) {
              try {
                await writer.write(chunk.value)
              } catch (error) {
                console.error('Error in final queue flush:', error)
                break
              }
            }
          }
        }
        
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
