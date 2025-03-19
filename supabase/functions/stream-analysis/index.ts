import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { 
      jobId, 
      content, 
      query, 
      focusText, 
      previousAnalyses = "", 
      areasForResearch = [] 
    } = await req.json()

    if (!OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY is not configured')
    }

    if (!content) {
      throw new Error('Content is required for analysis')
    }

    console.log(`Starting streaming analysis for job ${jobId}`)
    
    // Set up streaming response
    const { readable, writable } = new TransformStream()
    const writer = writable.getWriter()
    const encoder = new TextEncoder()

    // Prepare system and user prompts
    const systemPrompt = `You are a specialized researcher and analyst with expertise in analyzing market contexts. 
Your task is to analyze web content related to a specific market question and provide insights.
Be thorough, well-reasoned, and analytical. Cite specific evidence from the content.`

    const mainContext = `MAIN QUESTION: ${query}
${focusText ? `FOCUS AREA: ${focusText}` : ''}

CONTENT TO ANALYZE:
${content.substring(0, 28000)} 
${content.length > 28000 ? '(content truncated due to length)' : ''}

${previousAnalyses ? `PREVIOUS ANALYSES:\n${previousAnalyses}\n\n` : ''}
${areasForResearch.length > 0 ? `AREAS NEEDING FURTHER RESEARCH:\n${areasForResearch.join('\n')}\n\n` : ''}`;

    const userPrompt = `Based on the content provided, analyze the information relevant to ${query}${focusText ? ` with focus on ${focusText}` : ''}.

Provide a comprehensive analysis that:
1. Summarizes the most relevant information found
2. Evaluates the reliability and significance of the evidence
3. Discusses potential implications for the market question
4. Identifies any conflicting information or knowledge gaps

Please organize your response in a structured format with clear sections and include specific data points from the content.`;

    // Start OpenRouter streaming request
    (async () => {
      try {
        console.log("Making streaming request to OpenRouter API")
        
        const response = await fetch(OPENROUTER_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://lovable.dev/',
            'X-Title': 'Market Analysis App',
          },
          body: JSON.stringify({
            model: "google/gemini-flash-1.5",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: mainContext },
              { role: "user", content: userPrompt }
            ],
            stream: true,
            temperature: 0.1,
          })
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`)
        }

        const reader = response.body?.getReader()
        if (!reader) {
          throw new Error("Unable to get reader from response")
        }

        let buffer = ""
        
        // Process the stream
        while (true) {
          const { done, value } = await reader.read()
          
          if (done) {
            await writer.write(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`))
            break
          }
          
          // Decode chunk
          const chunk = new TextDecoder().decode(value)
          buffer += chunk
          
          // Process lines
          const lines = buffer.split('\n')
          
          // Keep last line in buffer as it might be incomplete
          buffer = lines.pop() || ""
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6)
              
              if (data === '[DONE]') {
                await writer.write(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`))
                continue
              }
              
              try {
                const json = JSON.parse(data)
                if (json.choices && json.choices[0].delta && json.choices[0].delta.content) {
                  const content = json.choices[0].delta.content
                  await writer.write(encoder.encode(`data: ${JSON.stringify({ chunk: content })}\n\n`))
                }
              } catch (e) {
                console.error("Error parsing JSON from stream:", e)
              }
            }
          }
        }
        
        console.log("Streaming completed successfully")
        await writer.close()
      } catch (error) {
        console.error("Streaming error:", error)
        await writer.write(encoder.encode(`data: ${JSON.stringify({ error: error.message })}\n\n`))
        await writer.close()
      }
    })()

    return new Response(readable, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (error) {
    console.error("Error in stream-analysis function:", error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
