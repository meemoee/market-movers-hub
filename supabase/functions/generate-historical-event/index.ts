
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Create encoder upfront to avoid scope issues
const encoder = new TextEncoder()

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Handle both GET and POST requests
    let requestData = {}
    let userId = null
    
    if (req.method === 'GET') {
      // Parse URL parameters for GET requests (for EventSource compatibility)
      const url = new URL(req.url)
      const marketQuestion = url.searchParams.get('marketQuestion')
      const model = url.searchParams.get('model') || "perplexity/llama-3.1-sonar-small-128k-online"
      const enableWebSearch = url.searchParams.get('enableWebSearch') !== 'false'
      const maxSearchResults = parseInt(url.searchParams.get('maxSearchResults') || '3', 10)
      const authToken = url.searchParams.get('authToken')
      
      // If we have an auth token in the URL, try to get the user
      if (authToken) {
        const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
        const supabaseAdmin = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
          { auth: { persistSession: false } }
        )
        
        try {
          const { data: { user }, error } = await supabaseAdmin.auth.getUser(authToken)
          if (!error && user) {
            userId = user.id
          }
        } catch (error) {
          console.error("Error getting user from token:", error)
        }
      }
      
      requestData = { marketQuestion, model, enableWebSearch, maxSearchResults, userId }
    } else {
      // For POST requests, parse the JSON body as before
      requestData = await req.json()
      userId = requestData.userId
    }
    
    const { 
      marketQuestion,
      model = "perplexity/llama-3.1-sonar-small-128k-online", 
      enableWebSearch = true, 
      maxSearchResults = 3
    } = requestData
    
    console.log('Received historical event request:', { 
      marketQuestion, 
      model, 
      enableWebSearch, 
      maxSearchResults, 
      userId: userId ? 'provided' : 'not provided' 
    })

    // Validate required parameters
    if (!marketQuestion) {
      return new Response(
        JSON.stringify({ 
          error: 'Missing market question' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }

    // Determine which API key to use
    let apiKey = OPENROUTER_API_KEY

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

    // Prepare the prompt for historical event generation
    const promptText = `Generate a historical event comparison for the market question: "${marketQuestion}".
      
Please format your response with the following sections:
1. Title of the historical event
2. Date or time period of the event
3. Similarities between this historical event and the current market situation
4. Differences between this historical event and the current market situation

Make your response detailed and insightful, focusing on economic and market factors that are relevant to the question.`

    // Base request body
    const requestBody: any = {
      model: enableWebSearch ? `${model}` : model.replace(':online', ''),
      messages: [
        { role: "system", content: "You are a helpful assistant that generates historical event comparisons for market analysis." },
        { role: "user", content: promptText }
      ],
      stream: true // Enable streaming
    }
    
    // Add web search plugin configuration if enabled with custom max results
    if (enableWebSearch) {
      requestBody.plugins = [
        {
          id: "web",
          max_results: maxSearchResults
        }
      ]
    }

    console.log('Making streaming request to OpenRouter API with body:', JSON.stringify(requestBody))
    
    // Set up SSE headers for proper streaming
    const headers = {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
    
    // Create a new ReadableStream with a controller for proper SSE streaming
    const stream = new TransformStream()
    const writer = stream.writable.getWriter()
    
    // Helper function to send properly formatted SSE events
    const sendSSE = async (event: string, data: string) => {
      await writer.write(encoder.encode(`event: ${event}\ndata: ${data}\n\n`))
    }
    
    // Make the request to OpenRouter API with streaming
    fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://hunchex.app",
        "X-Title": "Market Analysis App",
      },
      body: JSON.stringify(requestBody)
    }).then(async (response) => {
      console.log('OpenRouter response status:', response.status)
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error(`OpenRouter API error: ${response.status}`, errorText)
        await sendSSE('error', `OpenRouter API error: ${response.status} - ${errorText}`)
        writer.close()
        return
      }
      
      if (!response.body) {
        console.error('No response body from OpenRouter')
        await sendSSE('error', 'No response body from OpenRouter')
        writer.close()
        return
      }
      
      console.log('Streaming response from OpenRouter API...')
      
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            console.log('Stream complete')
            await sendSSE('done', 'Stream complete')
            break
          }
          
          const chunk = decoder.decode(value, { stream: true })
          
          // Process the chunk - it contains multiple SSE lines
          const lines = chunk.split('\n')
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6) // Remove 'data: ' prefix
              
              if (data === '[DONE]') {
                console.log('Received [DONE] marker')
                await sendSSE('done', '[DONE]')
                continue
              }
              
              try {
                const parsed = JSON.parse(data)
                
                const content = parsed.choices?.[0]?.delta?.content
                
                if (content) {
                  // Send each content piece as a separate SSE message immediately
                  await sendSSE('message', content)
                }
              } catch (e) {
                console.error('Error parsing JSON from stream:', e, 'Raw data:', data)
                // Forward the raw data for debugging
                await sendSSE('log', data)
              }
            }
          }
        }
      } catch (error) {
        console.error('Error reading stream:', error)
        await sendSSE('error', error.message)
      } finally {
        writer.close()
      }
    }).catch(async (error) => {
      console.error('Fetch error:', error)
      await sendSSE('error', error.message)
      writer.close()
    })

    // Return the stream response
    return new Response(stream.readable, { headers })

  } catch (error) {
    console.error('Error in generate-historical-event function:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
