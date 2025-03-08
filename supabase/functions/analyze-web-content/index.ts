
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
    const { content, query, question, marketPrice } = await req.json()
    
    if (!content || content.length === 0) {
      throw new Error('No content provided for analysis')
    }

    console.log(`Analyzing content for query: ${query}`)
    console.log(`Market question: ${question}`)
    console.log(`Content length: ${content.length} characters`)
    console.log(`Current market price: ${marketPrice !== undefined ? marketPrice + '%' : 'not provided'}`)

    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:5173',
        'X-Title': 'Market Research App',
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-lite-001",
        messages: [
          {
            role: "system",
            content: "You are a careful thinker who shows your complete reasoning process. Your responses should reflect your authentic thought process as you explore and solve problems. STYLE REQUIREMENTS: - Express your thoughts as they naturally occur - Show your full reasoning journey - Include moments of uncertainty and revision - Think out loud in a conversational tone - Let your understanding develop progressively DEMONSTRATE: - When you're examining something closely - When you notice new details - When you revise your thinking - When you make connections - When you question your assumptions - When you refine your understanding AVOID: - Jumping to conclusions - Hiding uncertainty - Skipping steps in your reasoning - Presenting only final thoughts - Artificial or forced structure Your response should feel like a natural exploration of your thinking process, showing how your understanding develops and changes as you reason through the problem. Be transparent about your thought process, including moments of uncertainty, revision, and discovery."
          },
          {
            role: "user",
            content: `Market Question: "${question}"

${marketPrice !== undefined ? `The CURRENT MARKET PROBABILITY is: ${marketPrice}%` : ''}

Based on this web research content, provide a LONG analysis of the likelihood and key factors for this query: ${query}

Content:
${content}

------ 
${marketPrice !== undefined ? `IMPORTANT: Consider the current market probability of ${marketPrice}% in your analysis. Explain whether you think this probability is accurate based on the research content.` : ''}

YOU MUST indicate a percent probability at the end of your statement, along with further areas of research necessary.`
          }
        ],
        stream: true
      })
    })

    // A simple TransformStream that buffers incoming text until full SSE events are available
    let buffer = ""
    const transformStream = new TransformStream({
      transform(chunk, controller) {
        const text = new TextDecoder().decode(chunk)
        buffer += text
        
        // Keep processing the buffer until we can't find any more complete messages
        while (true) {
          const nlIndex = buffer.indexOf('\n')
          if (nlIndex === -1) break
          
          const line = buffer.slice(0, nlIndex)
          buffer = buffer.slice(nlIndex + 1)
          
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim()
            if (data === '[DONE]') continue
            
            try {
              const parsed = JSON.parse(data)
              const content = parsed.choices?.[0]?.delta?.content || 
                            parsed.choices?.[0]?.message?.content || ""
              
              if (content) {
                const event = {
                  choices: [{
                    delta: { content },
                    message: { content }
                  }]
                }
                controller.enqueue(
                  new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)
                )
              }
            } catch (err) {
              console.debug('Parsing chunk (expected during streaming):', err)
            }
          }
        }
      },
      flush(controller) {
        // Process any remaining complete messages in the buffer
        if (buffer.trim()) {
          const lines = buffer.split('\n')
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim()
              if (data === '[DONE]') continue
              
              try {
                const parsed = JSON.parse(data)
                const content = parsed.choices?.[0]?.delta?.content || 
                              parsed.choices?.[0]?.message?.content || ""
                
                if (content) {
                  const event = {
                    choices: [{
                      delta: { content },
                      message: { content }
                    }]
                  }
                  controller.enqueue(
                    new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)
                  )
                }
              } catch (err) {
                console.debug('Parsing final chunk (expected):', err)
              }
            }
          }
        }
        buffer = ""
      }
    })

    return new Response(response.body?.pipeThrough(transformStream), {
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
