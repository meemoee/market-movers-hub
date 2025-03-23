
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')
const MAX_RETRIES = 3
const HEARTBEAT_INTERVAL = 5000 // 5 seconds
const RECONNECT_DELAY = 2000 // 2 seconds
const STREAM_TIMEOUT = 60000 // 60 seconds timeout threshold
const MAX_CHUNK_RETRY = 3 // Maximum retries for chunk processing

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
    console.log('Received request:', { 
      messageLength: message?.length || 0,
      chatHistoryLength: chatHistory?.length || 0,
      timestamp: new Date().toISOString()
    })

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
          console.log('Heartbeat sent at', new Date().toISOString())
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
    const streamQueue: {value: Uint8Array, timestamp: number, index: number}[] = []
    let processingQueue = false
    let chunkCounter = 0
    
    // Process the queue in the background
    const processQueue = async () => {
      if (processingQueue || streamQueue.length === 0) return
      
      processingQueue = true
      
      try {
        console.log(`Starting queue processing with ${streamQueue.length} chunks pending`)
        while (streamQueue.length > 0) {
          const chunk = streamQueue.shift()
          if (chunk) {
            try {
              // Log chunk details without the actual content (which could be too large)
              console.log(`Processing chunk #${chunk.index}, queued at ${new Date(chunk.timestamp).toISOString()}, size: ${chunk.value.length} bytes`)
              
              // For debugging, log a small sample of the chunk text
              try {
                const textDecoder = new TextDecoder()
                const chunkText = textDecoder.decode(chunk.value)
                console.log(`Chunk #${chunk.index} sample: ${chunkText.slice(0, 100)}...`)
                
                // Check if this chunk has any delta.reasoning content
                if (chunkText.includes('"delta":{"reasoning"')) {
                  console.log(`*** FOUND REASONING DELTA in chunk #${chunk.index}: ${chunkText}`)
                }
              } catch (sampleError) {
                console.error(`Error creating sample from chunk #${chunk.index}:`, sampleError)
              }
              
              await writer.write(chunk.value)
            } catch (error) {
              console.error(`Error writing chunk #${chunk.index} from queue:`, error)
              // If we can't write, stop processing
              break
            }
          }
        }
        console.log(`Queue processing complete, ${streamQueue.length} chunks remaining`)
      } finally {
        processingQueue = false
        
        // If there are more chunks, process them
        if (streamQueue.length > 0) {
          processQueue()
        }
      }
    }

    // Multiple flags to track explicit stream completion
    let explicitCompletionDetected = false
    let doneSignalSent = false
    let forcedCompletionNeeded = false
    let chunkProcessingComplete = false

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
              max_tokens: 4096,
              temperature: 0.2
            })
          })

          if (!openRouterResponse.ok) {
            console.error('OpenRouter API error:', openRouterResponse.status, await openRouterResponse.text())
            throw new Error(`OpenRouter API error: ${openRouterResponse.status}`)
          }

          console.log('OpenRouter API connection established successfully')
          
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
              console.warn(`Connection appears stalled, no data received for ${STREAM_TIMEOUT/1000} seconds`)
              clearInterval(connectionTimeoutId)
              forcedCompletionNeeded = true
              throw new Error('Stream connection timeout after 60 seconds of inactivity')
            }
          }, 5000)

          const textDecoder = new TextDecoder()
          chunkCounter = 0
          let hasSentReasoningContent = false
          let hasCompletionSignal = false
          let lastChunkTime = Date.now()
          
          try {
            while (true) {
              const { done, value } = await reader.read()
              
              if (done) {
                console.log('Stream complete (reader.read() returned done=true)')
                succeeded = true
                clearInterval(connectionTimeoutId)
                
                // Explicit completion signal when stream ends naturally
                explicitCompletionDetected = true
                
                // Force a final [DONE] marker if we haven't seen one
                if (!hasCompletionSignal) {
                  console.log('Adding explicit completion signal as none was detected')
                  streamQueue.push({
                    value: new TextEncoder().encode("data: [DONE]\n\n"),
                    timestamp: Date.now(),
                    index: -1 // Special index for manually added completion marker
                  })
                  
                  // Set flag to indicate we've sent the done signal
                  doneSignalSent = true
                }
                
                break
              }
              
              // Update the last data timestamp
              lastDataTimestamp = Date.now()
              lastChunkTime = Date.now()
              chunkCounter++
              
              try {
                // Check if this chunk contains a completion signal
                try {
                  const chunkText = textDecoder.decode(value.slice())
                  if (chunkText.includes('[DONE]')) {
                    console.log(`*** Detected [DONE] signal in chunk #${chunkCounter}`)
                    hasCompletionSignal = true
                    explicitCompletionDetected = true
                    doneSignalSent = true
                  }
                  
                  // Check for finish_reason
                  if (chunkText.includes('"finish_reason"')) {
                    console.log(`*** Detected finish_reason in chunk #${chunkCounter}`)
                    explicitCompletionDetected = true
                  }
                  
                  // Check for reasoning content
                  if (chunkText.includes('"delta":{"reasoning"')) {
                    console.log(`*** Detected reasoning delta in chunk #${chunkCounter}`)
                    hasSentReasoningContent = true
                  }
                } catch (textError) {
                  console.error(`Error checking chunk #${chunkCounter} text:`, textError)
                }
                
                // Add to queue with timestamp and index
                streamQueue.push({
                  value,
                  timestamp: Date.now(),
                  index: chunkCounter
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
            
            // Set the flag to indicate we've finished processing chunks
            chunkProcessingComplete = true
            
            // Log reasoning status at the end
            console.log(`Stream completed. Reasoning content detected: ${hasSentReasoningContent}`)
            
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
                    console.error(`Error flushing queue after stream error for chunk #${chunk.index}:`, error)
                    break
                  }
                }
              }
            }
            
            // Force add a completion signal if we haven't seen one
            if (!hasCompletionSignal) {
              try {
                console.log('Adding explicit completion signal after error')
                await writer.write(new TextEncoder().encode("data: [DONE]\n\n"))
                explicitCompletionDetected = true
                doneSignalSent = true
              } catch (error) {
                console.error('Error sending completion signal after stream error:', error)
              }
            }
            
            throw streamError
          } finally {
            // If we have a long period of inactivity after the last chunk, force completion
            if (Date.now() - lastChunkTime > 5000 && !explicitCompletionDetected) {
              console.log('Force completing stream due to inactivity after last chunk')
              forcedCompletionNeeded = true
            }
            
            console.log('Stream processing complete, releasing reader lock')
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
          
          // Set a maximum retry count for flushing
          let flushRetryCount = 0
          
          while (streamQueue.length > 0 && flushRetryCount < MAX_CHUNK_RETRY) {
            try {
              const chunk = streamQueue.shift()
              if (chunk) {
                await writer.write(chunk.value)
              }
            } catch (error) {
              flushRetryCount++
              console.error(`Error in final queue flush (retry ${flushRetryCount}):`, error)
              if (flushRetryCount >= MAX_CHUNK_RETRY) {
                console.error('Maximum retry attempts reached for queue flushing')
                break
              }
              // Short delay before retry
              await new Promise(resolve => setTimeout(resolve, 100))
            }
          }
        }
        
        // Even if we haven't detected an explicit completion, ensure we send a final completion signal
        if (!doneSignalSent || forcedCompletionNeeded) {
          console.log('Sending final forced [DONE] signal')
          await writer.write(new TextEncoder().encode("data: [DONE]\n\n"))
        }
        
        // Close the writer to signal the end
        console.log('Closing writer after ensuring completion')
        await writer.close()
        console.log('Writer closed successfully')
      } catch (closeError) {
        console.error('Error closing writer:', closeError)
        // Try one more time to send a done signal before giving up
        try {
          await writer.write(new TextEncoder().encode("data: [DONE]\n\n"))
          await writer.close()
        } catch (finalError) {
          console.error('Final attempt to close writer failed:', finalError)
        }
      } finally {
        cleanup()
        console.log('Resource cleanup complete')
      }
    })()

    // Return the readable stream for immediate response
    console.log('Returning readable stream to client')
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
