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
    const { message, chatHistory, userId, marketId, marketQuestion } = await req.json()
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

    // Create a lightweight initial system prompt (for speed)
    const quickSystemPrompt = `You are a helpful market analysis assistant focused on prediction markets. 

Current Market Context:
- Market Question: ${marketQuestion || 'Not specified'}
- Market ID: ${marketId || 'Not specified'}

You should provide insights and analysis related to this specific prediction market. Be concise, informative, and helpful.`

    // Start the AI call immediately for fastest response
    console.log('Making request to OpenRouter API with quick prompt...')
    const openRouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:5173',
        'X-Title': 'Market Chat App',
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini", // Faster model for quick first token
        messages: [
          {
            role: "system",
            content: quickSystemPrompt
          },
          {
            role: "user",
            content: `Chat History:\n${chatHistory || 'No previous chat history'}\n\nCurrent Query: ${message}`
          }
        ],
        stream: true,
        max_tokens: 1000, // Limit response length for speed
        temperature: 0.7
      })
    })

    // Fetch market data asynchronously (don't block the response)
    // This will be available for future messages in the conversation
    setTimeout(async () => {
      try {
        const redis = await import('https://deno.land/x/redis@v0.29.0/mod.ts')
        const redisClient = redis.connect({
          hostname: Deno.env.get('REDIS_HOSTNAME') || 'localhost',
          port: parseInt(Deno.env.get('REDIS_PORT') || '6379'),
          password: Deno.env.get('REDIS_PASSWORD'),
        })
        
        console.log('Fetching market data in background for future use')
        
        const latestKeys = await (await redisClient).zrevrange('topMovers:1440:keys', 0, 0)
        if (latestKeys.length > 0) {
          const latestKey = latestKeys[0]
          const manifestKey = `topMovers:1440:${latestKey}:manifest`
          const manifestData = await (await redisClient).get(manifestKey)
          
          if (manifestData) {
            const manifest = JSON.parse(manifestData)
            for (let i = 0; i < manifest.chunks.length; i++) {
              const chunkKey = `topMovers:1440:${latestKey}:chunk:${i}`
              const chunkData = await (await redisClient).get(chunkKey)
              
              if (chunkData) {
                const markets = JSON.parse(chunkData)
                const foundMarket = markets.find((m: any) => m.market_id === marketId)
                
                if (foundMarket) {
                  console.log('Market data cached for future conversations:', foundMarket.question)
                  break
                }
              }
            }
          }
        }
        
        await (await redisClient).quit()
      } catch (error) {
        console.error('Background market data fetch failed:', error)
      }
    }, 0)

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
        
        function pump(): Promise<void> {
          return reader!.read().then(({ done, value }) => {
            console.log('Read chunk:', { done, chunkSize: value?.length })
            
            if (done) {
              console.log('Stream finished, closing controller')
              controller.close()
              return
            }

            const chunk = decoder.decode(value)
            console.log('Decoded chunk:', chunk.substring(0, 200) + (chunk.length > 200 ? '...' : ''))
            
            const lines = chunk.split('\n')
            console.log('Split into lines:', lines.length)

            for (let i = 0; i < lines.length; i++) {
              const line = lines[i]
              console.log(`Processing line ${i}:`, line.substring(0, 100))
              
              if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                try {
                  const jsonStr = line.slice(6) // Remove 'data: ' prefix
                  console.log('Parsing JSON:', jsonStr.substring(0, 150))
                  
                  const data = JSON.parse(jsonStr)
                  console.log('Parsed data:', JSON.stringify(data).substring(0, 200))
                  
                  // Transform OpenRouter format to expected frontend format
                  if (data.choices && data.choices[0]?.delta?.content) {
                    const content = data.choices[0].delta.content
                    console.log('Found content to stream:', content)
                    
                    const transformedData = {
                      choices: [{
                        delta: {
                          content: content
                        }
                      }]
                    }
                    
                    console.log('Transformed data:', JSON.stringify(transformedData))
                    
                    // Send as SSE format expected by frontend
                    const sseData = `data: ${JSON.stringify(transformedData)}\n\n`
                    console.log('Sending SSE data:', sseData.substring(0, 200))
                    
                    controller.enqueue(encoder.encode(sseData))
                    console.log('Enqueued chunk successfully')
                  } else {
                    console.log('No content found in chunk, skipping')
                  }
                } catch (e) {
                  console.error('Error parsing stream chunk:', e, 'Line:', line)
                }
              } else if (line === 'data: [DONE]') {
                console.log('Found DONE signal, sending to frontend')
                controller.enqueue(encoder.encode('data: [DONE]\n\n'))
              } else if (line.trim() === '') {
                console.log('Empty line, skipping')
              } else {
                console.log('Non-data line:', line)
              }
            }

            console.log('Finished processing chunk, continuing pump...')
            return pump()
          }).catch(error => {
            console.error('Error in pump function:', error)
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
