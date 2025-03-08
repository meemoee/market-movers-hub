
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
    const { webContent, analysis, marketPrice, marketQuestion } = await req.json()
    
    // Trim content to avoid token limits
    const trimmedContent = webContent.slice(0, 15000)
    console.log('Web content length:', trimmedContent.length)
    console.log('Analysis length:', analysis.length)
    console.log('Current market price:', marketPrice !== undefined ? marketPrice + '%' : 'not provided')
    console.log('Market question:', marketQuestion || 'not provided')

    // Create the prompt content
    const promptContent = `Based on this web research and analysis, provide the probability and key supporting/opposing factors:

${marketQuestion ? `Market Question: ${marketQuestion}` : ''}
${marketPrice !== undefined ? `Current Market Probability: ${marketPrice}%` : ''}

Web Content:
${trimmedContent}

Analysis:
${analysis}

${marketPrice !== undefined ? `Consider if the current market probability of ${marketPrice}% is accurate based on the available information.` : ''}

Return ONLY a JSON object with these fields:
1. probability: your estimated probability as a percentage string (e.g., "65%")
2. supportingPoints: an array of 3-5 key factors supporting this outcome (each a concise string)
3. negativePoints: an array of 3-5 key factors opposing this outcome (each a concise string)
4. areasForResearch: an array of strings describing specific areas needing more research`

    // Make the request to OpenRouter - NO streaming for JSON response
    const jsonResponse = await fetch(OPENROUTER_URL, {
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
            content: "You are a helpful market research analyst. Extract key insights from the provided web research and analysis. Return ONLY a JSON object with fields: probability (a percentage string like '75%'), supportingPoints (an array of key factors supporting the likely outcome), negativePoints (an array of key factors opposing the likely outcome), and areasForResearch (an array of strings describing areas needing more research)."
          },
          {
            role: "user",
            content: promptContent
          }
        ],
        response_format: { type: "json_object" },
        stream: false // Explicitly set to false to get a complete JSON response
      })
    })

    if (!jsonResponse.ok) {
      console.error('OpenRouter API error:', jsonResponse.status, await jsonResponse.text())
      throw new Error('Failed to get insights from OpenRouter')
    }

    // Parse the complete JSON response
    const data = await jsonResponse.json()
    const result = data.choices[0].message.content
    
    console.log('Received JSON result:', typeof result)
    
    // Validate the structure of the result
    let parsedResult
    try {
      // If the result is already an object, use it directly
      // If it's a string, parse it (this handles cases where the API returns a string despite response_format)
      parsedResult = typeof result === 'string' ? JSON.parse(result) : result
      
      console.log('Successfully parsed result')
      
      // Validate required fields
      if (!parsedResult.probability) {
        console.warn('Missing probability in result')
        parsedResult.probability = "Unknown"
      }
      
      // Ensure arrays exist
      if (!Array.isArray(parsedResult.supportingPoints)) {
        console.warn('Missing or invalid supportingPoints in result')
        parsedResult.supportingPoints = []
      }
      
      if (!Array.isArray(parsedResult.negativePoints)) {
        console.warn('Missing or invalid negativePoints in result')
        parsedResult.negativePoints = []
      }
      
      if (!Array.isArray(parsedResult.areasForResearch)) {
        console.warn('Missing or invalid areasForResearch in result')
        parsedResult.areasForResearch = []
      }
    } catch (error) {
      console.error('Error parsing result:', error)
      // Return a fallback object if parsing fails
      parsedResult = {
        probability: "Unknown",
        supportingPoints: [],
        negativePoints: [],
        areasForResearch: ["Error in analysis, please try again"]
      }
    }
    
    // Send back the parsed result
    return new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify(parsedResult)
        }
      }]
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    })

  } catch (error) {
    console.error('Error in extract-research-insights:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message,
        choices: [{
          message: {
            content: JSON.stringify({
              probability: "Error",
              supportingPoints: [],
              negativePoints: [],
              areasForResearch: ["Error processing the analysis, please try again"]
            })
          }
        }]
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
