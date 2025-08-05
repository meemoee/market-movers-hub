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
    const { message, chatHistory = [], userId, marketId, marketQuestion, marketDescription, selectedModel } = await req.json()
    console.log('Received market chat request:', {
      message,
      chatHistoryLength: Array.isArray(chatHistory) ? chatHistory.length : 'invalid',
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
              const foundMarket = markets.find((m) => m.market_id === marketId)

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
              const foundMarket = markets.find((m) => m.market_id === marketId)
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

    const systemPrompt = `You are a helpful market analysis assistant focused on prediction markets. Use any market information provided in the conversation as background context and always prioritize the user's most recent question when generating search queries and responses.

In your first reply, surface the most relevant and up-to-date online sources, citing each with a URL. Provide concise insights on how the information affects the market outcome. Keep responses conversational, informative, and analytically focused.`

    console.log('Making request to OpenRouter API...')
    const fetchStart = performance.now()
    const historyMessages = Array.isArray(chatHistory) ? chatHistory : []
    const requestBody = {
      model: selectedModel || "perplexity/sonar",
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "assistant",
          content: marketContext
        },
        ...historyMessages,
        {
          role: "user",
          content: message
        }
      ],
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

    interface OpenRouterChoice {
      message?: { content?: string; reasoning?: string }
    }
    interface OpenRouterResponse {
      choices?: OpenRouterChoice[]
    }
    const responseData: OpenRouterResponse = await openRouterResponse.json()
    console.log('OpenRouter response received in', performance.now() - fetchStart)
    const content = responseData.choices?.[0]?.message?.content || ''
    const reasoning = responseData.choices?.[0]?.message?.reasoning || ''

    return new Response(
      JSON.stringify({ content, reasoning }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    )

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
