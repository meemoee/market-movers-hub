
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"

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
    // Handle both GET and POST requests like historical event function
    let requestData = {}
    let userId = null
    
    if (req.method === 'GET') {
      // Parse URL parameters for GET requests (for EventSource compatibility)
      const url = new URL(req.url)
      const content = url.searchParams.get('content')
      const authToken = url.searchParams.get('authToken')
      
      requestData = { content, authToken }
    } else {
      // For POST requests, parse the JSON body as before
      requestData = await req.json()
    }
    
    const { content, authToken } = requestData
    
    console.log('Received portfolio generation request:', { 
      content: content ? content.substring(0, 30) + '...' : 'none',
      authToken: authToken ? 'provided' : 'not provided' 
    })

    // Validate required parameters
    if (!content) {
      return new Response(
        JSON.stringify({ 
          error: 'Missing content parameter' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }

    // Set up SSE headers for proper streaming - BEFORE any auth validation
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
    
    // Start the portfolio generation process
    ;(async () => {
      try {
        await sendSSE('message', 'Starting portfolio generation...')
        await sendSSE('progress', JSON.stringify({ progress: 10, message: 'Initializing...' }))
        
        // Handle authentication AFTER stream setup (like historical event function)
        if (authToken) {
          try {
            const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
            const supabaseAdmin = createClient(
              Deno.env.get('SUPABASE_URL') ?? '',
              Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
              { auth: { persistSession: false } }
            )
            
            const { data: { user }, error } = await supabaseAdmin.auth.getUser(authToken)
            if (!error && user) {
              userId = user.id
              await sendSSE('message', 'User authenticated successfully')
            } else {
              await sendSSE('message', 'Authentication failed, continuing without user context')
              console.error("Error getting user from token:", error)
            }
          } catch (authError) {
            await sendSSE('message', 'Authentication error, continuing without user context')
            console.error("Authentication error:", authError)
          }
        } else {
          await sendSSE('message', 'No authentication token provided, continuing anonymously')
        }
        
        // Simulate portfolio generation steps
        await sendSSE('progress', JSON.stringify({ progress: 20, message: 'Analyzing content...' }))
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        await sendSSE('progress', JSON.stringify({ progress: 40, message: 'Searching for relevant markets...' }))
        await new Promise(resolve => setTimeout(resolve, 1500))
        
        await sendSSE('progress', JSON.stringify({ progress: 60, message: 'Generating trade ideas...' }))
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        await sendSSE('progress', JSON.stringify({ progress: 80, message: 'Finalizing recommendations...' }))
        await new Promise(resolve => setTimeout(resolve, 500))
        
        // Send completion event
        const portfolioData = {
          status: 'completed',
          data: {
            news: `Market analysis based on: "${content}"`,
            keywords: 'market, analysis, trading, prediction',
            markets: [],
            tradeIdeas: []
          }
        }
        
        await sendSSE('completed', JSON.stringify(portfolioData))
        await sendSSE('done', '[DONE]')
        
      } catch (error) {
        console.error('Error in portfolio generation:', error)
        await sendSSE('error', JSON.stringify({ 
          message: error.message,
          type: 'generation_error'
        }))
      } finally {
        writer.close()
      }
    })()

    // Return the stream response immediately
    return new Response(stream.readable, { headers })

  } catch (error) {
    console.error('Error in generate-portfolio function:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
