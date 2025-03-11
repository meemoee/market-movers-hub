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
      webContent,
      analysis,
      marketId,
      marketQuestion,
      previousAnalyses = [],
      iterations = [],
      queries = [],
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

    // Extract research insights asynchronously
    (async () => {
      try {
        // Build system prompt with focus guidance if needed
        let systemPrompt = `You are a skilled market research analyst specializing in extracting insights and estimating probabilities for prediction markets. Your task is to analyze research data on the following market question:

"${marketQuestion}"
Market ID: ${marketId}
`
        // Add focus text context if provided
        if (focusText) {
          systemPrompt += `
IMPORTANT: This research is specifically focused on "${focusText}" as a key aspect of the broader question.
You should analyze how this specific focus area impacts the overall probability.
`
        }

        // Add market price if available
        if (marketPrice !== undefined) {
          systemPrompt += `
The current market price is ${marketPrice}%, which represents the collective prediction probability.
`
        }

        // Add iteration context
        if (iterations && iterations.length > 0) {
          systemPrompt += `
The research was conducted over ${iterations.length} iterations, systematically exploring different aspects of the question.
`
        }

        systemPrompt += `
Your task is to:
1. Extract key insights from the provided analysis and web content
2. Estimate a probability for the market question based on the research
3. Identify areas that still need further research to improve confidence
4. Provide reasoning for your probability estimate

Output your response as valid JSON with the following structure:
\`\`\`json
{
  "probability": "X%", // Your probability estimate as a percentage
  "reasoning": "Your concise reasoning for this probability estimate",
  "areasForResearch": ["Area 1", "Area 2", "Area 3"] // 3-5 specific areas that need more research
}
\`\`\`

Important guidelines:
- Your probability estimate should be well-justified based on the research
- If estimating a binary outcome, use a percentage between 0% and 100%
- Make your reasoning concise but comprehensive
- For areasForResearch, identify 3-5 specific aspects that would benefit from further investigation
${focusText ? `- Consider how the focus area "${focusText}" affects the overall probability` : ''}
${focusText ? `- Areas for research should include at least 1-2 aspects directly related to "${focusText}"` : ''}
- Ensure your response is valid JSON with no extra text or markdown
`

        // Generate the content prompt
        let userPrompt = `Based on the following research data for the market question "${marketQuestion}", please extract key insights and estimate a probability.

Research Analysis:
${analysis}

`;

        // Add focus text if provided
        if (focusText) {
          userPrompt += `
This research specifically focused on: "${focusText}"
Please analyze how this specific aspect affects the overall probability.
`;
        }

        // Add queries used if available
        if (queries && queries.length > 0) {
          userPrompt += `
Search Queries Used:
${queries.join('\n')}
`;
        }

        // Add areas previously identified for research if available
        if (Array.isArray(areasForResearch) && areasForResearch.length > 0) {
          userPrompt += `
Areas Previously Identified for Research:
${areasForResearch.join('\n')}
`;
        }

        // Add iteration info if available
        if (iterations && iterations.length > 0) {
          userPrompt += `
Research was conducted over ${iterations.length} iterations, progressively exploring different aspects.
`;
        }

        // Add market price context if available
        if (marketPrice !== undefined) {
          userPrompt += `
Current market price: ${marketPrice}%
`;
        }

        userPrompt += `
Please analyze this information thoroughly and provide your probability estimate, reasoning, and areas for further research in the JSON format specified.
`;

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
              { role: 'user', content: userPrompt }
            ],
            stream: true,
            max_tokens: 2048
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
        console.error('Error in extract-research-insights function:', error)
        
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
    console.error('Error in extract-research-insights function:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
