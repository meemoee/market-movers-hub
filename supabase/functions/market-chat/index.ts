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
    const { message, chatHistory, userId, marketId, marketQuestion, selectedModel } = await req.json()
    console.log('Received market chat request:', { 
      message, 
      chatHistory, 
      userId: userId ? 'provided' : 'not provided',
      marketId,
      marketQuestion 
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

    console.log('Making request to OpenRouter API...')
    const openRouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:5173',
        'X-Title': 'Market Chat App',
      },
      body: JSON.stringify({
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
      })
    })

    if (!openRouterResponse.ok) {
      console.error('OpenRouter API error:', openRouterResponse.status, await openRouterResponse.text())
      throw new Error(`OpenRouter API error: ${openRouterResponse.status}`)
    }

    console.log('Starting to process OpenRouter stream...')
    
    // Transform the OpenRouter stream to SSE format expected by frontend
    const reader = openRouterResponse.body?.getReader()
    const encoder = new TextEncoder()
    const decoder = new TextDecoder()

    console.log('Created reader and encoders')

    const stream = new ReadableStream({
      start(controller) {
        console.log('Stream started, beginning pump function')
        
        let edgeChunkCount = 0
        let totalOpenRouterBytes = 0
        let totalOutputBytes = 0
        
        function pump(): Promise<void> {
          return reader!.read().then(({ done, value }) => {
            const chunkStartTime = performance.now()
            console.log(`[EDGE-CHUNK-${edgeChunkCount}] OpenRouter read:`, { 
              done, 
              chunkSize: value?.length,
              totalBytesFromOpenRouter: totalOpenRouterBytes + (value?.length || 0)
            })
            
            if (done) {
              console.log(`[EDGE-STREAM-COMPLETE] Processed ${edgeChunkCount} chunks from OpenRouter`)
              console.log(`[EDGE-STREAM-COMPLETE] Total bytes from OpenRouter: ${totalOpenRouterBytes}`)
              console.log(`[EDGE-STREAM-COMPLETE] Total bytes sent to frontend: ${totalOutputBytes}`)
              controller.close()
              return
            }

            totalOpenRouterBytes += value?.length || 0
            const decodeStartTime = performance.now()
            const chunk = decoder.decode(value)
            const decodeTime = performance.now() - decodeStartTime
            
            console.log(`[EDGE-CHUNK-${edgeChunkCount}] Decoded OpenRouter chunk in ${decodeTime.toFixed(2)}ms:`, {
              chunkPreview: chunk.substring(0, 150) + (chunk.length > 150 ? '...' : ''),
              chunkLength: chunk.length,
              hasNewlines: chunk.includes('\n')
            })
            
            const lines = chunk.split('\n')
            console.log(`[EDGE-CHUNK-${edgeChunkCount}] Split into ${lines.length} lines`)

            for (let i = 0; i < lines.length; i++) {
              const line = lines[i]
              console.log(`[EDGE-CHUNK-${edgeChunkCount}][EDGE-LINE-${i}] Processing:`, {
                line: line.substring(0, 100) + (line.length > 100 ? '...' : ''),
                lineLength: line.length,
                startsWithData: line.startsWith('data: '),
                isDone: line === 'data: [DONE]'
              })
              
              if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                try {
                  const parseStartTime = performance.now()
                  const jsonStr = line.slice(6) // Remove 'data: ' prefix
                  console.log(`[EDGE-CHUNK-${edgeChunkCount}][EDGE-LINE-${i}] Extracting JSON:`, {
                    jsonPreview: jsonStr.substring(0, 200) + (jsonStr.length > 200 ? '...' : ''),
                    jsonLength: jsonStr.length
                  })
                  
                  const data = JSON.parse(jsonStr)
                  const parseTime = performance.now() - parseStartTime
                  console.log(`[EDGE-CHUNK-${edgeChunkCount}][EDGE-LINE-${i}] Parsed OpenRouter data in ${parseTime.toFixed(2)}ms:`, {
                    hasChoices: !!data.choices,
                    choicesCount: data.choices?.length || 0,
                    fullData: JSON.stringify(data).substring(0, 300)
                  })
                  
                  // Transform OpenRouter format to expected frontend format
                  if (data.choices && data.choices[0]?.delta) {
                    const delta = data.choices[0].delta
                    const content = delta.content
                    const reasoning = delta.reasoning
                    
                    console.log(`[EDGE-CHUNK-${edgeChunkCount}][EDGE-LINE-${i}] Delta analysis:`, {
                      hasContent: !!content,
                      contentLength: content?.length || 0,
                      contentValue: content || null,
                      hasReasoning: !!reasoning,
                      reasoningLength: reasoning?.length || 0,
                      reasoningValue: reasoning || null
                    })
                    
                    const transformedData = {
                      choices: [{
                        delta: {
                          content: content,
                          reasoning: reasoning
                        }
                      }]
                    }
                    
                    const transformStartTime = performance.now()
                    const sseData = `data: ${JSON.stringify(transformedData)}\n\n`
                    const transformTime = performance.now() - transformStartTime
                    
                    console.log(`[EDGE-CHUNK-${edgeChunkCount}][EDGE-LINE-${i}] Transformed in ${transformTime.toFixed(2)}ms:`, {
                      outputPreview: sseData.substring(0, 200) + (sseData.length > 200 ? '...' : ''),
                      outputLength: sseData.length
                    })
                    
                    const enqueueStartTime = performance.now()
                    const encoded = encoder.encode(sseData)
                    controller.enqueue(encoded)
                    const enqueueTime = performance.now() - enqueueStartTime
                    
                    totalOutputBytes += encoded.length
                    console.log(`[EDGE-CHUNK-${edgeChunkCount}][EDGE-LINE-${i}] Enqueued to frontend in ${enqueueTime.toFixed(2)}ms:`, {
                      encodedBytes: encoded.length,
                      totalOutputBytes: totalOutputBytes
                    })
                  } else {
                    console.log(`[EDGE-CHUNK-${edgeChunkCount}][EDGE-LINE-${i}] No valid delta found, skipping`)
                  }
                } catch (e) {
                  console.error(`[EDGE-CHUNK-${edgeChunkCount}][EDGE-LINE-${i}] JSON parse error:`, {
                    error: e,
                    line: line,
                    jsonStr: line.slice(6)
                  })
                }
              } else if (line === 'data: [DONE]') {
                console.log(`[EDGE-CHUNK-${edgeChunkCount}][EDGE-LINE-${i}] Found DONE signal, forwarding`)
                const doneData = 'data: [DONE]\n\n'
                const encoded = encoder.encode(doneData)
                controller.enqueue(encoded)
                totalOutputBytes += encoded.length
                console.log(`[EDGE-CHUNK-${edgeChunkCount}][EDGE-LINE-${i}] DONE signal sent, bytes: ${encoded.length}`)
              } else if (line.trim() === '') {
                console.log(`[EDGE-CHUNK-${edgeChunkCount}][EDGE-LINE-${i}] Empty line, skipping`)
              } else {
                console.log(`[EDGE-CHUNK-${edgeChunkCount}][EDGE-LINE-${i}] Non-data line:`, line)
              }
            }

            const chunkTime = performance.now() - chunkStartTime
            console.log(`[EDGE-CHUNK-${edgeChunkCount}] Completed processing in ${chunkTime.toFixed(2)}ms`)
            edgeChunkCount++
            return pump()
          }).catch(error => {
            console.error(`[EDGE-ERROR] Error in pump function:`, error)
            controller.error(error)
          })
        }
        return pump()
      }
    })

    console.log('Returning transformed stream response')
    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    })

  } catch (error) {
    console.error('Error in market-chat function:', error)
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
