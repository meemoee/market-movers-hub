import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  const startTime = performance.now()
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { message, chatHistory, userId, marketId, marketQuestion, marketDescription, selectedModel } = await req.json()
    console.log('Received market chat request:', {
      message,
      chatHistory,
      userId: userId ? 'provided' : 'not provided',
      marketId,
      marketQuestion,
      marketDescription: marketDescription ? 'provided' : 'not provided'
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

    console.log('api key ready', performance.now() - startTime)
    // Fetch market data from Redis (same source as top movers)
    let marketData = null
    const redisStart = performance.now()
    try {
      // Connect to Redis
      const { connect } = await import('https://deno.land/x/redis@v0.29.0/mod.ts')
      const redisUrl = Deno.env.get('REDIS_URL')
      if (!redisUrl) {
        throw new Error('REDIS_URL environment variable is not set')
      }
      const url = new URL(redisUrl)
      const redisClient = await connect({
        hostname: url.hostname,
        port: parseInt(url.port),
        password: url.password,
        tls: redisUrl.startsWith('rediss://')
      })

      console.log('Connected to Redis for market data lookup')

      // Get latest key for 1440 minute interval (24h)
      const latestKey = await redisClient.get('topMovers:1440:latest')
      if (latestKey) {
        console.log('Latest key lookup result:', latestKey)

        // Look for manifest
        const manifestKey = `topMovers:1440:${latestKey}:manifest`
        const manifestData = await redisClient.get(manifestKey)

        if (manifestData) {
          const manifest = JSON.parse(manifestData)
          console.log('Found manifest with', manifest.chunks, 'chunks')

          // Search through chunks for our specific marketId
          for (let i = 0; i < manifest.chunks; i++) {
            const chunkKey = `topMovers:1440:${latestKey}:chunk:${i}`
            const chunkData = await redisClient.get(chunkKey)

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

      // If not found in 24h dataset, try other intervals
      if (!marketData) {
        const intervals = ['5', '10', '30', '60', '240', '480', '10080']
        for (const currentInterval of intervals) {
          const altLatest = await redisClient.get(`topMovers:${currentInterval}:latest`)
          if (!altLatest) continue

          const altManifestKey = `topMovers:${currentInterval}:${altLatest}:manifest`
          const altManifestData = await redisClient.get(altManifestKey)
          if (!altManifestData) continue

          const altManifest = JSON.parse(altManifestData)
          for (let i = 0; i < altManifest.chunks; i++) {
            const chunkKey = `topMovers:${currentInterval}:${altLatest}:chunk:${i}`
            const chunkData = await redisClient.get(chunkKey)
            if (chunkData) {
              const markets = JSON.parse(chunkData)
              const foundMarket = markets.find((m: any) => m.market_id === marketId)
              if (foundMarket) {
                marketData = foundMarket
                console.log('Found market data for', marketId, 'in interval', currentInterval)
                break
              }
            }
          }

          if (marketData) break
        }
      }

      await redisClient.quit()
    } catch (error) {
      console.error('Error fetching market data from Redis:', error)
    }
    console.log('redis lookup time', performance.now() - redisStart)

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
- Description: ${(marketData.description || marketDescription) ? ( (marketData.description || marketDescription).substring(0, 300) + '...') : 'N/A'}
- Outcomes: ${marketData.outcomes ? marketData.outcomes.join(' vs ') : 'N/A'}` : `
Current Market Context:
- Market Question: ${marketQuestion || 'Not specified'}
- Market Description: ${marketDescription ? marketDescription.substring(0, 300) + '...' : 'Not specified'}
- Market ID: ${marketId || 'Not specified'}`

    const systemPrompt = `You are a helpful market analysis assistant focused on prediction markets, finding news, quotes, expert opinions, and dates that alter the likelihood of this prediction market. 
${marketContext}

CREATE SEARCHES RELEVANT TO THE MARKET DETAILS. This conversation is about the given prediction market. Assume the user is referencing this prediction market context if there is no other chat history. If the user has unclear intention, provide the latest news related to this prediction market. You should provide insights and analysis related to this specific prediction market. Be concise, informative, and helpful. Focus on factors that might influence the market outcome, relevant news, historical context, and analytical perspectives.

When discussing price movements, consider the 24-hour changes and current market dynamics. Use the market description and tags to provide relevant context.

Keep responses conversational and accessible while maintaining analytical depth.`

    console.log('Making request to OpenRouter API...')
    const fetchStart = performance.now()
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
      },
      info: {
        marketId,
        marketQuestion,
        marketDescription: marketData?.description || marketDescription || undefined,
        lastPrice: marketData?.final_last_price,
        priceChange: marketData?.price_change,
        volume: marketData?.final_volume,
        volumeChange: marketData?.volume_change,
        volumeChangePercentage: marketData?.volume_change_percentage,
        bestBid: marketData?.final_best_bid,
        bestAsk: marketData?.final_best_ask,
        noBestBid: marketData?.final_no_best_bid,
        noBestAsk: marketData?.final_no_best_ask,
        initialLastPrice: marketData?.initial_last_price,
        initialVolume: marketData?.initial_volume,
        outcomes: marketData?.outcomes,
        tags: marketData?.primary_tags
      }
    }
    console.log('OpenRouter request body:', requestBody)
    const openRouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:5173',
        'X-Title': 'Market Chat App',
      },
      body: JSON.stringify(requestBody)
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
        console.log('[STREAM-DEBUG] Stream started, beginning pump function')

        let edgeChunkCount = 0
        let totalOpenRouterBytes = 0
        let totalOutputBytes = 0
        let lineBuffer = '' // Buffer for incomplete lines
        let firstChunkLogged = false

        function pump(): Promise<void> {
          return reader!.read().then(({ done, value }) => {
            if (!firstChunkLogged && value) {
              console.log('time to first token', performance.now() - fetchStart)
              firstChunkLogged = true
            }
            console.log(`[EDGE-CHUNK-${edgeChunkCount}] OpenRouter read:`, { 
              done, 
              chunkSize: value?.length,
              totalBytesFromOpenRouter: totalOpenRouterBytes + (value?.length || 0),
              bufferLength: lineBuffer.length
            })
            
            if (done) {
              console.log('[STREAM-DEBUG] OpenRouter stream done, processing final buffer')
              // Process any remaining data in buffer
              if (lineBuffer.trim()) {
                console.log('[STREAM-DEBUG] Processing final buffered line:', lineBuffer.substring(0, 100))
                const lines = [lineBuffer]
                
                for (const line of lines) {
                  if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                    try {
                      const jsonStr = line.slice(6)
                      const data = JSON.parse(jsonStr)
                      
                      if (data.choices && data.choices[0]?.delta) {
                        const delta = data.choices[0].delta
                        const transformedData = {
                          choices: [{
                            delta: {
                              content: delta.content,
                              reasoning: delta.reasoning
                            }
                          }]
                        }
                        
                        const sseData = `data: ${JSON.stringify(transformedData)}\n\n`
                        const encoded = encoder.encode(sseData)
                        controller.enqueue(encoded)
                        totalOutputBytes += encoded.length
                        console.log('[STREAM-DEBUG] Sent final buffered data to frontend')
                      }
                    } catch (e) {
                      console.error('[STREAM-DEBUG] Final buffer JSON parse error:', e)
                    }
                  }
                }
              }
              
              console.log(`[EDGE-STREAM-COMPLETE] Processed ${edgeChunkCount} chunks from OpenRouter`)
              console.log(`[EDGE-STREAM-COMPLETE] Total bytes from OpenRouter: ${totalOpenRouterBytes}`)
              console.log(`[EDGE-STREAM-COMPLETE] Total bytes sent to frontend: ${totalOutputBytes}`)
              controller.close()
              return
            }

            totalOpenRouterBytes += value?.length || 0
            const chunk = decoder.decode(value)
            console.log(`[STREAM-DEBUG] Raw chunk preview:`, chunk.substring(0, 200))
            
            // Combine with any buffered incomplete line from previous chunk
            const fullChunk = lineBuffer + chunk
            const lines = fullChunk.split('\n')
            
            // Keep the last line in buffer if it doesn't end with newline
            // (meaning it might be incomplete)
            if (!chunk.endsWith('\n')) {
              lineBuffer = lines.pop() || ''
              console.log(`[STREAM-DEBUG] Buffering incomplete line:`, lineBuffer.substring(0, 100))
            } else {
              lineBuffer = ''
              console.log('[STREAM-DEBUG] No incomplete line to buffer')
            }
            
            console.log(`[EDGE-CHUNK-${edgeChunkCount}] Processing ${lines.length} complete lines, buffer size: ${lineBuffer.length}`)

            let processedLines = 0
            let sentDataLines = 0
            
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i]
              processedLines++
              
              console.log(`[STREAM-DEBUG] Line ${i}: ${line.substring(0, 100)}${line.length > 100 ? '...' : ''}`)
              
              if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                try {
                  const jsonStr = line.slice(6) // Remove 'data: ' prefix
                  console.log(`[STREAM-DEBUG] Parsing JSON:`, jsonStr.substring(0, 200))
                  const data = JSON.parse(jsonStr)
                  
                  // Transform OpenRouter format to expected frontend format
                  if (data.choices && data.choices[0]?.delta) {
                    const delta = data.choices[0].delta
                    const content = delta.content
                    const reasoning = delta.reasoning
                    
                    console.log(`[STREAM-DEBUG] Found delta - content: "${content}", reasoning: "${reasoning ? reasoning.substring(0, 50) : 'none'}"`)
                    
                    const transformedData = {
                      choices: [{
                        delta: {
                          content: content,
                          reasoning: reasoning
                        }
                      }]
                    }
                    
                    const sseData = `data: ${JSON.stringify(transformedData)}\n\n`
                    const encoded = encoder.encode(sseData)
                    controller.enqueue(encoded)
                    totalOutputBytes += encoded.length
                    sentDataLines++
                    console.log(`[STREAM-DEBUG] Sent data to frontend, size: ${encoded.length} bytes`)
                  } else {
                    console.log(`[STREAM-DEBUG] No delta found in data:`, data)
                  }
                } catch (e) {
                  console.error(`[EDGE-CHUNK-${edgeChunkCount}][EDGE-LINE-${i}] JSON parse error:`, e)
                  console.error(`[STREAM-DEBUG] Failed line:`, line)
                }
              } else if (line === 'data: [DONE]') {
                const doneData = 'data: [DONE]\n\n'
                const encoded = encoder.encode(doneData)
                controller.enqueue(encoded)
                totalOutputBytes += encoded.length
                sentDataLines++
                console.log('[STREAM-DEBUG] Sent [DONE] to frontend')
              } else if (line.trim()) {
                console.log(`[STREAM-DEBUG] Ignored non-data line:`, line)
              }
            }
            
            console.log(`[STREAM-DEBUG] Chunk ${edgeChunkCount} summary: processed ${processedLines} lines, sent ${sentDataLines} data chunks`)

            edgeChunkCount++
            return pump()
          })
        }

        // Start pumping and return the promise so the runtime
        // keeps the function alive until streaming completes
        console.log('[STREAM-DEBUG] Starting pump and returning promise')
        return pump().catch(error => {
          console.error('[STREAM-DEBUG] Pump error:', error)
          controller.error(error)
        })
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
