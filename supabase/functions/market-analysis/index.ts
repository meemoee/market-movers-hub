
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
    const { message, chatHistory, userId } = await req.json()
    console.log('Received request:', { message, chatHistory, userId: userId ? 'provided' : 'not provided' })

    // Determine which API key to use
    let apiKey = OPENROUTER_API_KEY;

    // If userId is provided, try to get their personal API key
    if (userId) {
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        { auth: { persistSession: false } }
      )

      const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('openrouter_api_key')
        .eq('id', userId)
        .single()

      if (!error && data?.openrouter_api_key) {
        console.log('Using user-provided API key')
        apiKey = data.openrouter_api_key
      } else if (error) {
        console.error('Error fetching user API key:', error)
      }
    }

    if (!apiKey) {
      throw new Error('No API key available for OpenRouter')
    }

    console.log('Making request to OpenRouter API...')
    const openRouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
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

    console.log('Streaming response from OpenRouter')
    
    // Get the readable stream from the response
    const readableStream = openRouterResponse.body
    
    // Transform the stream to add debugging information
    // We'll create a TransformStream to log chunks as they arrive
    const { readable, writable } = new TransformStream()
    
    if (readableStream) {
      const reader = readableStream.getReader()
      const writer = writable.getWriter()
      
      // Process the stream
      const processStream = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) {
              console.log('Stream finished')
              await writer.close()
              break
            }
            
            // Log the raw chunk for debugging
            const chunk = new TextDecoder().decode(value)
            console.log(`Raw chunk: ${chunk.length} bytes`)
            
            // Write the chunk to the output stream
            await writer.write(value)
          }
        } catch (err) {
          console.error('Error processing stream:', err)
          writer.abort(err)
        }
      }
      
      processStream()
    } else {
      console.error('OpenRouter response body is null')
      return new Response(JSON.stringify({ error: 'Response body is null' }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      })
    }

    // Return the transformed stream with detailed headers
    return new Response(readable, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Transfer-Encoding': 'chunked',
        'X-Accel-Buffering': 'no'
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
