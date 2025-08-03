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

    // Create market-specific system prompt
    const systemPrompt = `You are a helpful market analysis assistant focused on prediction markets. 

Current Market Context:
- Market Question: ${marketQuestion || 'Not specified'}
- Market ID: ${marketId || 'Not specified'}

You should provide insights and analysis related to this specific prediction market. Be concise, informative, and helpful. Focus on factors that might influence the market outcome, relevant news, historical context, and analytical perspectives.

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
        model: "openai/gpt-4o-mini",
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
        stream: true
      })
    })

    if (!openRouterResponse.ok) {
      console.error('OpenRouter API error:', openRouterResponse.status, await openRouterResponse.text())
      throw new Error(`OpenRouter API error: ${openRouterResponse.status}`)
    }

    // Transform the OpenRouter stream to SSE format expected by frontend
    const reader = openRouterResponse.body?.getReader()
    const encoder = new TextEncoder()
    const decoder = new TextDecoder()

    const stream = new ReadableStream({
      start(controller) {
        function pump(): Promise<void> {
          return reader!.read().then(({ done, value }) => {
            if (done) {
              controller.close()
              return
            }

            const chunk = decoder.decode(value)
            const lines = chunk.split('\n')

            for (const line of lines) {
              if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                try {
                  const jsonStr = line.slice(6) // Remove 'data: ' prefix
                  const data = JSON.parse(jsonStr)
                  
                  // Transform OpenRouter format to expected frontend format
                  if (data.choices && data.choices[0]?.delta?.content) {
                    const transformedData = {
                      choices: [{
                        delta: {
                          content: data.choices[0].delta.content
                        }
                      }]
                    }
                    
                    // Send as SSE format expected by frontend
                    const sseData = `data: ${JSON.stringify(transformedData)}\n\n`
                    controller.enqueue(encoder.encode(sseData))
                  }
                } catch (e) {
                  console.error('Error parsing stream chunk:', e, 'Line:', line)
                }
              } else if (line === 'data: [DONE]') {
                controller.enqueue(encoder.encode('data: [DONE]\n\n'))
              }
            }

            return pump()
          })
        }
        return pump()
      }
    })

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
