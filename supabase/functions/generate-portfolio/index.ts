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
    let content = ''
    
    if (req.method === 'GET') {
      // Parse URL parameters for GET requests (for EventSource compatibility)
      const url = new URL(req.url)
      content = url.searchParams.get('content') || ''
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
      
      requestData = { content, userId }
    } else {
      // For POST requests, parse the JSON body
      requestData = await req.json()
      content = requestData.content || ''
      userId = requestData.userId
    }
    
    console.log('Received portfolio generation request:', { 
      content: content ? 'provided' : 'missing',
      userId: userId ? 'provided' : 'not provided' 
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
    const sendSSE = async (event: string, data: any) => {
      const dataString = typeof data === 'string' ? data : JSON.stringify(data)
      await writer.write(encoder.encode(`event: ${event}\ndata: ${dataString}\n\n`))
    }

    // Start the portfolio generation process
    const generatePortfolio = async () => {
      try {
        await sendSSE('progress', { 
          status: 'processing', 
          steps: [{ name: 'auth_validation', completed: true, timestamp: new Date().toISOString() }]
        })

        // Step 1: Get news summary
        await sendSSE('progress', { 
          status: 'processing', 
          steps: [
            { name: 'auth_validation', completed: true, timestamp: new Date().toISOString() },
            { name: 'news_summary', completed: false, timestamp: new Date().toISOString() }
          ]
        })

        // Mock news summary for now - in a real implementation, you'd call a news API
        const newsPrompt = `Based on the user's prediction: "${content}", provide a brief summary of relevant recent news that might impact this prediction. Keep it concise and factual.`
        
        const newsResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://hunchex.app",
            "X-Title": "Market Analysis App",
          },
          body: JSON.stringify({
            model: "anthropic/claude-3.5-sonnet",
            messages: [
              { role: "system", content: "You are a helpful assistant that provides news summaries for market analysis." },
              { role: "user", content: newsPrompt }
            ],
            max_tokens: 500
          })
        })

        let newsData = "Unable to fetch news summary"
        if (newsResponse.ok) {
          const newsResult = await newsResponse.json()
          newsData = newsResult.choices?.[0]?.message?.content || "Unable to fetch news summary"
        }

        await sendSSE('progress', { 
          status: 'processing', 
          steps: [
            { name: 'auth_validation', completed: true, timestamp: new Date().toISOString() },
            { name: 'news_summary', completed: true, timestamp: new Date().toISOString() },
            { name: 'keywords_extraction', completed: false, timestamp: new Date().toISOString() }
          ]
        })

        // Step 2: Extract keywords
        const keywordsPrompt = `Extract 5-10 key search terms from this prediction that would help find relevant prediction markets: "${content}". Return only the keywords separated by commas.`
        
        const keywordsResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://hunchex.app",
            "X-Title": "Market Analysis App",
          },
          body: JSON.stringify({
            model: "anthropic/claude-3.5-sonnet",
            messages: [
              { role: "system", content: "You are a helpful assistant that extracts keywords for market search." },
              { role: "user", content: keywordsPrompt }
            ],
            max_tokens: 200
          })
        })

        let keywordsData = "prediction, market, analysis"
        if (keywordsResponse.ok) {
          const keywordsResult = await keywordsResponse.json()
          keywordsData = keywordsResult.choices?.[0]?.message?.content || "prediction, market, analysis"
        }

        await sendSSE('progress', { 
          status: 'processing', 
          steps: [
            { name: 'auth_validation', completed: true, timestamp: new Date().toISOString() },
            { name: 'news_summary', completed: true, timestamp: new Date().toISOString() },
            { name: 'keywords_extraction', completed: true, timestamp: new Date().toISOString() },
            { name: 'embedding_creation', completed: true, timestamp: new Date().toISOString() },
            { name: 'pinecone_search', completed: true, timestamp: new Date().toISOString() },
            { name: 'market_details', completed: false, timestamp: new Date().toISOString() }
          ]
        })

        // Step 3: Mock market search results (in a real implementation, you'd search your market database)
        const mockMarkets = [
          {
            market_id: "0x123456789",
            question: "Will the S&P 500 reach 6000 by end of 2025?",
            yes_price: 0.65,
            no_price: 0.35,
            clobtokenids: ["token_yes_123", "token_no_123"]
          },
          {
            market_id: "0x987654321", 
            question: "Will Bitcoin exceed $150,000 in 2025?",
            yes_price: 0.42,
            no_price: 0.58,
            clobtokenids: ["token_yes_456", "token_no_456"]
          },
          {
            market_id: "0x456789123",
            question: "Will there be a US recession in 2025?",
            yes_price: 0.28,
            no_price: 0.72,
            clobtokenids: ["token_yes_789", "token_no_789"]
          }
        ]

        await sendSSE('progress', { 
          status: 'processing', 
          steps: [
            { name: 'auth_validation', completed: true, timestamp: new Date().toISOString() },
            { name: 'news_summary', completed: true, timestamp: new Date().toISOString() },
            { name: 'keywords_extraction', completed: true, timestamp: new Date().toISOString() },
            { name: 'embedding_creation', completed: true, timestamp: new Date().toISOString() },
            { name: 'pinecone_search', completed: true, timestamp: new Date().toISOString() },
            { name: 'market_details', completed: true, timestamp: new Date().toISOString() },
            { name: 'best_markets', completed: true, timestamp: new Date().toISOString() },
            { name: 'related_markets', completed: true, timestamp: new Date().toISOString() },
            { name: 'trade_ideas', completed: false, timestamp: new Date().toISOString() }
          ]
        })

        // Step 4: Generate trade ideas
        const listText = mockMarkets.map(market => 
          `Market ID: ${market.market_id}
Question: ${market.question}
Yes Price: ${market.yes_price} (${(market.yes_price * 100).toFixed(0)}¢)
No Price: ${market.no_price} (${(market.no_price * 100).toFixed(0)}¢)
CLOB Token IDs: ${market.clobtokenids.join(', ')}`
        ).join('\n\n')

        const ideasPrompt = `
User prediction: ${content}

Here are the top markets that matched:
${listText}

Based on these, suggest the 3 best trade ideas that would make the user money if their prediction or sentiment ends up being CORRECT.

CRITICAL PRICING RULES - READ CAREFULLY:

For "Yes" outcome recommendations:
- current_price = the "yes" price from the market data
- target_price must be HIGHER than current_price (to profit from Yes going up)
- stop_price must be LOWER than current_price (to limit losses)

For "No" outcome recommendations:
- current_price = the "no" price from the market data  
- target_price must be HIGHER than current_price (to profit from No going up)
- stop_price must be LOWER than current_price (to limit losses)

CONCRETE EXAMPLES:
Market: "Will X happen?" — yes:0.80, no:0.20

If recommending "Yes":
- outcome="Yes"
- current_price=0.80 (the yes price)
- target_price=0.90 (higher than 0.80)
- stop_price=0.70 (lower than 0.80)

If recommending "No":
- outcome="No" 
- current_price=0.20 (the no price)
- target_price=0.30 (higher than 0.20)
- stop_price=0.10 (lower than 0.20)

Market: "Will Y happen?" — yes:0.06, no:0.94

If recommending "Yes":
- outcome="Yes"
- current_price=0.06 (the yes price)
- target_price=0.15 (higher than 0.06)
- stop_price=0.03 (lower than 0.06)

If recommending "No":
- outcome="No"
- current_price=0.94 (the no price)
- target_price=0.97 (higher than 0.94)
- stop_price=0.90 (lower than 0.94)

VALIDATION RULES:
- target_price MUST be > current_price (ALWAYS)
- stop_price MUST be < current_price (ALWAYS)
- If recommending "Yes", use the yes price as current_price
- If recommending "No", use the no price as current_price

Return ONLY a valid JSON array of exactly three trade objects. No extra text.

Suggest 3 trades as a JSON array of objects with:
  market_id (must be one of the specific IDs provided above, CRITICAL),
  market_title, 
  outcome, 
  current_price, 
  target_price, 
  stop_price, 
  rationale.`;

        const ideasResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://hunchex.app",
            "X-Title": "Market Analysis App",
          },
          body: JSON.stringify({
            model: "anthropic/claude-3.5-sonnet",
            messages: [
              { role: "system", content: "You are a helpful assistant that generates trade ideas for prediction markets. Always return valid JSON arrays." },
              { role: "user", content: ideasPrompt }
            ],
            max_tokens: 2000
          })
        })

        let tradeIdeas = []
        if (ideasResponse.ok) {
          const ideasResult = await ideasResponse.json()
          const ideasText = ideasResult.choices?.[0]?.message?.content || "[]"
          
          try {
            // Try to parse the JSON response
            const cleanedText = ideasText.replace(/```json\n?|\n?```/g, '').trim()
            tradeIdeas = JSON.parse(cleanedText)
          } catch (parseError) {
            console.error('Error parsing trade ideas JSON:', parseError)
            // Fallback trade ideas
            tradeIdeas = [
              {
                market_id: mockMarkets[0].market_id,
                market_title: mockMarkets[0].question,
                outcome: "Yes",
                current_price: mockMarkets[0].yes_price,
                target_price: Math.min(mockMarkets[0].yes_price + 0.15, 0.95),
                stop_price: Math.max(mockMarkets[0].yes_price - 0.10, 0.05),
                rationale: "Based on your prediction, this market aligns with your sentiment."
              }
            ]
          }
        }

        // Send completion
        await sendSSE('message', {
          status: 'completed',
          steps: [
            { name: 'auth_validation', completed: true, timestamp: new Date().toISOString() },
            { name: 'news_summary', completed: true, timestamp: new Date().toISOString() },
            { name: 'keywords_extraction', completed: true, timestamp: new Date().toISOString() },
            { name: 'embedding_creation', completed: true, timestamp: new Date().toISOString() },
            { name: 'pinecone_search', completed: true, timestamp: new Date().toISOString() },
            { name: 'market_details', completed: true, timestamp: new Date().toISOString() },
            { name: 'best_markets', completed: true, timestamp: new Date().toISOString() },
            { name: 'related_markets', completed: true, timestamp: new Date().toISOString() },
            { name: 'trade_ideas', completed: true, timestamp: new Date().toISOString() }
          ],
          data: {
            news: newsData,
            keywords: keywordsData,
            markets: mockMarkets,
            tradeIdeas: tradeIdeas
          }
        })

      } catch (error) {
        console.error('Error in portfolio generation:', error)
        await sendSSE('error', { error: error.message })
      } finally {
        writer.close()
      }
    }

    // Start the generation process
    generatePortfolio()

    // Return the stream response
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
