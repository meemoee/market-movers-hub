
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Check for WebSocket upgrade request
  const upgradeHeader = req.headers.get("upgrade") || ""
  if (upgradeHeader.toLowerCase() !== "websocket") {
    try {
      const { jobId, content, iteration, type } = await req.json()
      
      // Insert chunk into the database for persistence
      const client = await getSupabaseClient()
      
      const { data, error } = await client
        .from('analysis_stream')
        .insert({
          job_id: jobId,
          chunk: content,
          iteration: iteration,
          sequence: Date.now() // Using timestamp as a simple sequence number
        })
      
      if (error) {
        console.error("Error inserting chunk:", error)
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    } catch (error) {
      console.error("Error processing non-websocket request:", error)
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
  }

  // Set up WebSocket connection
  const { socket, response } = Deno.upgradeWebSocket(req)
  
  let openRouterResponse: Response | null = null
  let jobId: string | null = null
  let iteration: number | null = null
  let type: string | null = null
  let accumulatedContent = ""
  
  // Handle messages from the client
  socket.onmessage = async (event) => {
    try {
      const message = JSON.parse(event.data)
      
      if (message.type === 'start') {
        jobId = message.jobId
        iteration = message.iteration
        type = message.type || 'analysis'
        
        if (!jobId || iteration === null) {
          socket.send(JSON.stringify({
            type: 'error',
            message: 'Missing required parameters: jobId and iteration'
          }))
          return
        }
        
        // Start OpenRouter API request
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'http://localhost:5173',
            'X-Title': 'HunchEx Research',
          },
          body: JSON.stringify(message.requestBody)
        })
        
        if (!response.ok) {
          const errorText = await response.text()
          socket.send(JSON.stringify({
            type: 'error',
            message: `OpenRouter API error: ${response.status} - ${errorText}`
          }))
          return
        }
        
        openRouterResponse = response
        
        // Stream the response
        const reader = response.body?.getReader()
        if (!reader) {
          socket.send(JSON.stringify({
            type: 'error',
            message: 'Failed to get response reader'
          }))
          return
        }
        
        const textDecoder = new TextDecoder()
        
        try {
          // Process the stream
          while (true) {
            const { done, value } = await reader.read()
            
            if (done) {
              // Save the accumulated content to the database
              try {
                const client = await getSupabaseClient()
                await client.from('analysis_stream').insert({
                  job_id: jobId,
                  chunk: accumulatedContent,
                  iteration: iteration,
                  sequence: Date.now()
                })
              } catch (dbError) {
                console.error("Error saving final content to database:", dbError)
              }
              
              socket.send(JSON.stringify({ type: 'done' }))
              break
            }
            
            const chunk = textDecoder.decode(value)
            const lines = chunk.split('\n').filter(line => line.trim())
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const jsonStr = line.slice(6).trim()
                
                if (jsonStr === '[DONE]') {
                  continue
                }
                
                try {
                  const parsed = JSON.parse(jsonStr)
                  const content = parsed.choices?.[0]?.delta?.content
                  
                  if (content) {
                    // Send the content directly to the WebSocket client
                    socket.send(JSON.stringify({
                      type: 'chunk',
                      jobId,
                      iteration,
                      content,
                      contentType: type
                    }))
                    
                    // Also accumulate content for database persistence
                    accumulatedContent += content
                    
                    // Periodically save to the database (every ~50 characters)
                    if (accumulatedContent.length % 50 < 5) {
                      try {
                        const client = await getSupabaseClient()
                        await client.from('analysis_stream').insert({
                          job_id: jobId,
                          chunk: accumulatedContent,
                          iteration: iteration,
                          sequence: Date.now()
                        })
                      } catch (dbError) {
                        console.error("Error saving periodic content to database:", dbError)
                      }
                    }
                  }
                } catch (e) {
                  console.error('Error parsing SSE data:', e, 'Raw data:', jsonStr)
                }
              }
            }
          }
        } catch (streamError) {
          console.error("Error processing stream:", streamError)
          socket.send(JSON.stringify({
            type: 'error',
            message: `Error processing stream: ${streamError.message}`
          }))
        }
      }
    } catch (error) {
      console.error("WebSocket message error:", error)
      socket.send(JSON.stringify({
        type: 'error',
        message: `Error processing message: ${error.message}`
      }))
    }
  }
  
  // Handle WebSocket errors
  socket.onerror = (event) => {
    console.error("WebSocket error:", event)
  }
  
  // Handle WebSocket close
  socket.onclose = () => {
    // Clean up resources
    if (openRouterResponse?.body) {
      try {
        openRouterResponse.body.cancel()
      } catch (e) {
        console.error("Error cancelling response body:", e)
      }
    }
  }
  
  return response
})

// Helper to get authenticated Supabase client for database operations
async function getSupabaseClient() {
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.7.1')
  
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'https://lfmkoismabbhujycnqpn.supabase.co'
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  
  if (!supabaseServiceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for database operations')
  }
  
  return createClient(supabaseUrl, supabaseServiceKey)
}
