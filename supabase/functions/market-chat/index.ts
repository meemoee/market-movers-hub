import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  console.log('🚀 EDGE FUNCTION LOG: === Market Chat Function Started ===')
  console.log('🚀 EDGE FUNCTION LOG: Request method:', req.method)
  console.log('🚀 EDGE FUNCTION LOG: Request URL:', req.url)
  console.log('🚀 EDGE FUNCTION LOG: Request headers:', Object.fromEntries(req.headers.entries()))

  if (req.method === 'OPTIONS') {
    console.log('🚀 EDGE FUNCTION LOG: Handling OPTIONS request')
    return new Response(null, { headers: corsHeaders })
  }

  try {
    let message, chatHistory, userId, marketId, marketQuestion, selectedModel
    
    // Handle both GET (EventSource) and POST requests
    if (req.method === 'GET') {
      console.log('🚀 EDGE FUNCTION LOG: Processing GET request')
      const url = new URL(req.url)
      message = url.searchParams.get('message') || ''
      chatHistory = url.searchParams.get('chatHistory') || ''
      userId = url.searchParams.get('userId') || null
      marketId = url.searchParams.get('marketId') || ''
      marketQuestion = url.searchParams.get('marketQuestion') || ''
      selectedModel = url.searchParams.get('selectedModel') || 'perplexity/sonar'
    } else {
      console.log('🚀 EDGE FUNCTION LOG: Processing POST request')
      const body = await req.json()
      console.log('🚀 EDGE FUNCTION LOG: Request body received:', JSON.stringify(body).substring(0, 200))
      message = body.message
      chatHistory = body.chatHistory
      userId = body.userId
      marketId = body.marketId
      marketQuestion = body.marketQuestion
      selectedModel = body.selectedModel
    }
    
    console.log('🚀 EDGE FUNCTION LOG: Parsed request data:', { 
      message: message?.substring(0, 100),
      chatHistoryLength: chatHistory?.length || 0,
      userId: userId ? 'provided' : 'not provided',
      marketId,
      marketQuestion: marketQuestion?.substring(0, 100),
      selectedModel
    })

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

    // Fetch market data from Redis (same source as top movers)
    let marketData = null
    try {
      // Connect to Redis
      const redis = await import('https://deno.land/x/redis@v0.29.0/mod.ts')
      const redisClient = redis.connect({
        hostname: Deno.env.get('REDIS_HOSTNAME') || 'localhost',
        port: parseInt(Deno.env.get('REDIS_PORT') || '6379'),
        password: Deno.env.get('REDIS_PASSWORD'),
      })
      
      console.log('Connected to Redis for market data lookup')
      
      // Get latest key for 1440 minute interval (24h)
      const latestKeys = await (await redisClient).zrevrange('topMovers:1440:keys', 0, 0)
      if (latestKeys.length > 0) {
        const latestKey = latestKeys[0]
        console.log('Latest key lookup result:', latestKey)
        
        // Look for manifest
        const manifestKey = `topMovers:1440:${latestKey}:manifest`
        const manifestData = await (await redisClient).get(manifestKey)
        
        if (manifestData) {
          const manifest = JSON.parse(manifestData)
          console.log('Found manifest with', manifest.chunks.length, 'chunks')
          
          // Search through chunks for our specific marketId
          for (let i = 0; i < manifest.chunks.length; i++) {
            const chunkKey = `topMovers:1440:${latestKey}:chunk:${i}`
            const chunkData = await (await redisClient).get(chunkKey)
            
            if (chunkData) {
              const markets = JSON.parse(chunkData)
              const foundMarket = markets.find((m: any) => m.market_id === marketId)
              
              if (foundMarket) {
                marketData = foundMarket
                console.log('Found market data for', marketId)
                break
              }
            }
          }
        }
      }
      
      await (await redisClient).quit()
    } catch (error) {
      console.error('Error fetching market data from Redis:', error)
    }

    // Create market-specific system prompt with rich context
    const marketContext = marketData ? `
Current Market Data:
- Question: ${marketData.question}
- Current Price: ${marketData.final_last_price || 'N/A'}
- Price Change (24h): ${marketData.price_change ? (marketData.price_change * 100).toFixed(1) + '%' : 'N/A'}
- Volume: ${marketData.final_volume || 'N/A'}
- Volume Change: ${marketData.volume_change || 'N/A'}
- Best Bid: ${marketData.final_best_bid || 'N/A'}
- Best Ask: ${marketData.final_best_ask || 'N/A'}
- Tags: ${marketData.primary_tags ? marketData.primary_tags.join(', ') : 'N/A'}
- Description: ${marketData.description ? marketData.description.substring(0, 300) + '...' : 'N/A'}
- Outcomes: ${marketData.outcomes ? marketData.outcomes.join(' vs ') : 'N/A'}` : `
Current Market Context:
- Market Question: ${marketQuestion || 'Not specified'}
- Market ID: ${marketId || 'Not specified'}`

    const systemPrompt = `You are a helpful market analysis assistant focused on prediction markets. 
${marketContext}

You should provide insights and analysis related to this specific prediction market. Be concise, informative, and helpful. Focus on factors that might influence the market outcome, relevant news, historical context, and analytical perspectives.

When discussing price movements, consider the 24-hour changes and current market dynamics. Use the market description and tags to provide relevant context.

Keep responses conversational and accessible while maintaining analytical depth.`

    console.log('🚀 EDGE FUNCTION LOG: Making request to OpenRouter API...')
    const requestBody = {
      model: selectedModel || "perplexity/sonar",
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: `Chat History:\n${chatHistory || 'No previous chat history'}\n\nCurrent Query: ${message}`
        }
      ],
      stream: true,
      reasoning: {
        maxTokens: 8000
      }
    }
    
    console.log('🚀 EDGE FUNCTION LOG: OpenRouter request body:', JSON.stringify(requestBody).substring(0, 300))
    
    const openRouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey.substring(0, 20)}...`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:5173',
        'X-Title': 'Market Chat App',
      },
      body: JSON.stringify(requestBody)
    })

    console.log('🚀 EDGE FUNCTION LOG: OpenRouter response status:', openRouterResponse.status)
    console.log('🚀 EDGE FUNCTION LOG: OpenRouter response headers:', Object.fromEntries(openRouterResponse.headers.entries()))

    if (!openRouterResponse.ok) {
      const errorText = await openRouterResponse.text()
      console.error('🚀 EDGE FUNCTION LOG: OpenRouter API error:', openRouterResponse.status, errorText)
      throw new Error(`OpenRouter API error: ${openRouterResponse.status} - ${errorText}`)
    }

    console.log('🚀 EDGE FUNCTION LOG: Starting to process OpenRouter stream...')
    
    // Transform the OpenRouter stream to SSE format expected by frontend
    const reader = openRouterResponse.body?.getReader()
    const encoder = new TextEncoder()
    const decoder = new TextDecoder()

    console.log('Created reader and encoders')

    const stream = new ReadableStream({
      start(controller) {
        console.log('🚀 EDGE FUNCTION LOG: Stream started, beginning pump function')
        let chunkCount = 0
        let totalBytes = 0
        
        function pump(): Promise<void> {
          return reader!.read().then(({ done, value }) => {
            chunkCount++
            const chunkSize = value?.length || 0
            totalBytes += chunkSize
            const timestamp = Date.now()
            
            console.log(`🚀 EDGE FUNCTION LOG: [Chunk ${chunkCount}][${timestamp}] Read chunk:`, { 
              done, 
              chunkSize,
              totalBytes
            })
            
            if (done) {
              console.log('🚀 EDGE FUNCTION LOG: >>> STREAM FINISHED <<<')
              console.log('🚀 EDGE FUNCTION LOG: Total chunks processed:', chunkCount)
              console.log('🚀 EDGE FUNCTION LOG: Total bytes received:', totalBytes)
              controller.enqueue(encoder.encode('data: [DONE]\n\n'))
              controller.close()
              return
            }

            const chunk = decoder.decode(value)
            console.log(`🚀 EDGE FUNCTION LOG: [${timestamp}] Decoded chunk:`, chunk.substring(0, 300) + (chunk.length > 300 ? '...' : ''))
            
            const lines = chunk.split('\n')
            console.log(`🚀 EDGE FUNCTION LOG: [${timestamp}] Split into ${lines.length} lines`)

            for (let i = 0; i < lines.length; i++) {
              const line = lines[i]
              console.log(`🚀 EDGE FUNCTION LOG: [${timestamp}] Processing line ${i}:`, line.substring(0, 150))
              
              if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                try {
                  const jsonStr = line.slice(6) // Remove 'data: ' prefix
                  console.log(`🚀 EDGE FUNCTION LOG: [${timestamp}] Parsing JSON:`, jsonStr.substring(0, 200))
                  
                  const data = JSON.parse(jsonStr)
                  console.log(`🚀 EDGE FUNCTION LOG: [${timestamp}] Parsed data:`, JSON.stringify(data))
                  
                  // Transform OpenRouter format to expected frontend format
                  if (data.choices && data.choices[0]?.delta) {
                    const delta = data.choices[0].delta
                    const content = delta.content
                    const reasoning = delta.reasoning
                    
                    if (content) {
                      console.log(`🚀 EDGE FUNCTION LOG: [${timestamp}] >>> FOUND CONTENT TO STREAM <<<`)
                      console.log(`🚀 EDGE FUNCTION LOG: [${timestamp}] Content:`, content)
                    }
                    if (reasoning) {
                      console.log(`🚀 EDGE FUNCTION LOG: [${timestamp}] >>> FOUND REASONING TO STREAM <<<`)
                      console.log(`🚀 EDGE FUNCTION LOG: [${timestamp}] Reasoning:`, reasoning)
                    }
                    
                    const transformedData = {
                      choices: [{
                        delta: {
                          content: content,
                          reasoning: reasoning
                        }
                      }]
                    }
                    
                    console.log(`🚀 EDGE FUNCTION LOG: [${timestamp}] Transformed data:`, JSON.stringify(transformedData))
                    
                    // Send as SSE format expected by frontend
                    const sseData = `data: ${JSON.stringify(transformedData)}\n\n`
                    console.log(`🚀 EDGE FUNCTION LOG: [${timestamp}] >>> SENDING SSE DATA <<<`)
                    console.log(`🚀 EDGE FUNCTION LOG: [${timestamp}] SSE data:`, sseData.substring(0, 300))
                    
                    controller.enqueue(encoder.encode(sseData))
                    console.log(`🚀 EDGE FUNCTION LOG: [${timestamp}] >>> ENQUEUED CHUNK SUCCESSFULLY <<<`)
                  } else {
                    console.log(`🚀 EDGE FUNCTION LOG: [${timestamp}] No content or reasoning found in chunk, skipping`)
                  }
                } catch (e) {
                  console.error(`🚀 EDGE FUNCTION LOG: [${timestamp}] Error parsing stream chunk:`, e, 'Line:', line)
                }
              } else if (line === 'data: [DONE]') {
                console.log(`🚀 EDGE FUNCTION LOG: [${timestamp}] >>> FOUND DONE SIGNAL <<<`)
                controller.enqueue(encoder.encode('data: [DONE]\n\n'))
              } else if (line.trim() === '') {
                console.log(`🚀 EDGE FUNCTION LOG: [${timestamp}] Empty line, skipping`)
              } else {
                console.log(`🚀 EDGE FUNCTION LOG: [${timestamp}] Non-data line:`, line)
              }
            }

            console.log(`🚀 EDGE FUNCTION LOG: [${timestamp}] Finished processing chunk, continuing pump...`)
            return pump()
          }).catch(error => {
            console.error('🚀 EDGE FUNCTION LOG: >>> ERROR IN PUMP FUNCTION <<<', error)
            controller.error(error)
          })
        }
        return pump()
      }
    })

    console.log('🚀 EDGE FUNCTION LOG: >>> RETURNING TRANSFORMED STREAM RESPONSE <<<')
    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable nginx buffering
        'Transfer-Encoding': 'chunked'
      }
    })

  } catch (error) {
    console.error('🚀 EDGE FUNCTION LOG: >>> ERROR IN MARKET-CHAT FUNCTION <<<', error)
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
