
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { content, query, question } = await req.json()
    
    if (!content || content.length === 0) {
      throw new Error('No content provided for analysis')
    }

    console.log(`Analyzing content for query: ${query}`)
    console.log(`Market question: ${question}`)
    console.log(`Content length: ${content.length} characters`)

    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:5173',
        'X-Title': 'Market Research App',
      },
      body: JSON.stringify({
        model: "google/gemini-flash-1.5",
        messages: [
          {
            role: "system",
            content: "You are a careful thinker who shows your complete reasoning process. Your responses should reflect your authentic thought process as you explore and solve problems. STYLE REQUIREMENTS: - Express your thoughts as they naturally occur - Show your full reasoning journey - Include moments of uncertainty and revision - Think out loud in a conversational tone - Let your understanding develop progressively DEMONSTRATE: - When you're examining something closely - When you notice new details - When you revise your thinking - When you make connections - When you question your assumptions - When you refine your understanding AVOID: - Jumping to conclusions - Hiding uncertainty - Skipping steps in your reasoning - Presenting only final thoughts - Artificial or forced structure Your response should feel like a natural exploration of your thinking process, showing how your understanding develops and changes as you reason through the problem. Be transparent about your thought process, including moments of uncertainty, revision, and discovery."
          },
          {
            role: "user",
            content: `Market Question: "${question}"

Based on this web research content, provide a LONG analysis of the likelihood and key factors for this query: ${query}

Content:
${content} ------ YOU MUST indicate a percent probability at the end of your statement, along with further areas of research necessary.`
          }
        ],
        stream: true
      })
    })

    // Create a TransformStream to handle accumulating text chunks
    const transformer = new TransformStream({
      start() {},
      transform(chunk: Uint8Array, controller) {
        // Convert chunk to string
        const text = new TextDecoder().decode(chunk)
        const lines = text.split('\n').filter(line => line.trim())
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6).trim()
            if (jsonStr === '[DONE]') continue
            
            try {
              // Append each chunk to the stream
              controller.enqueue(chunk)
            } catch (e) {
              console.error('Transform error:', e)
            }
          }
        }
      },
      flush() {}
    })

    // Pipe the response through our transformer
    const transformedStream = response.body?.pipeThrough(transformer)

    if (!transformedStream) {
      throw new Error('Failed to create stream')
    }

    return new Response(transformedStream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    })

  } catch (error) {
    console.error('Error in analyze-web-content:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
