
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
    // Parse request body
    const { 
      marketQuestion,
      model = "perplexity/llama-3.1-sonar-small-128k-online", 
      enableWebSearch = true, 
      maxSearchResults = 3,
      userId
    } = await req.json()
    
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
      
Format your response as strict JSON with the following structure:
{
  "title": "Name of the historical event",
  "date": "Date or time period (e.g., 'March 2008' or '1929-1932')",
  "image_url": "A relevant image URL",
  "similarities": ["Similarity 1", "Similarity 2", "Similarity 3", "Similarity 4", "Similarity 5"],
  "differences": ["Difference 1", "Difference 2", "Difference 3", "Difference 4", "Difference 5"]
}

Make sure the JSON is valid and contains exactly these fields. For the image_url, use a real, accessible URL to a relevant image.`

    // Base request body
    const requestBody: any = {
      model: enableWebSearch ? `${model}` : model.replace(':online', ''),
      messages: [
        { role: "system", content: "You are a helpful assistant that generates historical event comparisons for market analysis." },
        { role: "user", content: promptText }
      ],
      response_format: { type: "json_object" }
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

    console.log('Making request to OpenRouter API...')
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://hunchex.app",
        "X-Title": "Market Analysis App",
      },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`OpenRouter API error: ${response.status}`, errorText)
      throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    console.log('OpenRouter API responded successfully')
    
    // Extract the content from the response
    const content = data.choices?.[0]?.message?.content
    
    if (!content) {
      throw new Error('No content in OpenRouter response')
    }
    
    // Return the content directly
    return new Response(
      JSON.stringify({ data: content }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )

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
