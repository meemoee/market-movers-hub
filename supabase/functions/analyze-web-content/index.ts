import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"

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
      content,
      query,
      question,
      marketId,
      marketDescription,
      previousAnalyses = "",
      areasForResearch = [],
      marketPrice,
      focusText = null,
      isFocusedResearch = false
    } = await req.json()

    const openrouterApiKey = Deno.env.get('OPENROUTER_API_KEY')
    
    if (!openrouterApiKey) {
      throw new Error('OPENROUTER_API_KEY is not configured')
    }

    // Create a stream for the response
    const stream = new TransformStream()
    const writer = stream.writable.getWriter()
    const encoder = new TextEncoder()

    // Generate the analysis asynchronously
    (async () => {
      try {
        // Generate a context-aware system prompt that accounts for focused research
        let systemPrompt = `You are a highly skilled market research analyst specialized in analyzing web content to assess probabilities for prediction markets.
Your task is to analyze web content related to the following market question:
"${question || query}"
${marketDescription ? `Market Description: ${marketDescription}` : ""}
Market ID: ${marketId}
`

        // Add focus text if available
        if (focusText) {
          systemPrompt += `
IMPORTANT: This analysis is specifically focused on: "${focusText}"
You should prioritize information related to this specific focus area and analyze how it impacts the broader question.
`
        }

        // Add market price information if available
        if (marketPrice !== undefined) {
          systemPrompt += `
The current market price is ${marketPrice}%, which represents the collective prediction.
`
        }

        // Add previous analyses and areas for research if available
        if (previousAnalyses) {
          systemPrompt += `
Previous Analysis:
${previousAnalyses}
`
        }

        if (Array.isArray(areasForResearch) && areasForResearch.length > 0) {
          systemPrompt += `
Key Areas Identified for Research:
${areasForResearch.join('\n')}
`
        }

        systemPrompt += `
Guidelines:
1. Analyze the provided web content thoroughly and extract key insights related to ${focusText ? `the focus area "${focusText}"` : "the market question"}
2. Identify relevant facts, trends, expert opinions, and statistical data
3. Evaluate strengths and weaknesses of the information sources
4. Synthesize information from multiple sources to form a cohesive analysis
5. Provide a balanced analysis that considers different perspectives
${focusText ? `6. Continuously relate your analysis back to the focus area "${focusText}" and how it impacts the overall question` : ""}

Your analysis should be detailed, objective, and well-structured, formatted with markdown.
`

        // Generate the content prompt based on whether this is focused research
        const contentPrompt = focusText 
          ? `Please analyze the following web content specifically focused on "${focusText}" in relation to the market question "${query}".
The content was obtained from web searches related to this specific focus area.
Extract and synthesize the most relevant information that helps understand how "${focusText}" affects the probability of the market question.

Web Content:
${content}`
          : `Please analyze the following web content related to the market question:
"${query}"

Web Content:
${content}`;

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openrouterApiKey}`,
            'HTTP-Referer': 'https://hunchex.app',
            'X-Title': 'HunchEx',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.0-pro',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: contentPrompt }
            ],
            stream: true
          }),
        })

        if (!response.body) {
          throw new Error('Response body is null')
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()

        while (true) {
          const { done, value } = await reader.read()
          
          if (done) {
            console.log('Stream complete')
            await writer.close()
            break
          }
          
          const chunk = decoder.decode(value)
          const lines = chunk.split('\n')
          
          for (const line of lines) {
            if (line.trim() && line.startsWith('data: ')) {
              const jsonStr = line.slice(6).trim()
              
              if (jsonStr === '[DONE]') {
                continue
              }
              
              try {
                writer.write(encoder.encode(`${line}\n\n`))
              } catch (e) {
                console.error('Error writing to stream:', e)
              }
            }
          }
        }
      } catch (error) {
        console.error('Error in analyze-web-content function:', error)
        
        try {
          writer.write(encoder.encode(`data: ${JSON.stringify({ error: error.message })}\n\n`))
          writer.close()
        } catch (e) {
          console.error('Error writing error to stream:', e)
        }
      }
    })()

    return new Response(stream.readable, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (error) {
    console.error('Error in analyze-web-content function:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
