
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || ''
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY') || ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { 
      question, 
      analysis,
      model = "gpt-4o-mini",
      useOpenRouter = false
    } = await req.json()

    console.log(`Evaluating QA pair: ${question.substring(0, 100)}...`)
    console.log(`Using model: ${model} via ${useOpenRouter ? 'OpenRouter' : 'OpenAI'}`)
    
    const systemPrompt = `You are an expert evaluator of market analysis quality. 
Your task is to evaluate the quality, depth, and usefulness of an analysis provided in response to a market question.

Evaluate the analysis on these criteria:
1. Comprehensiveness: Does it cover all key aspects of the question?
2. Evidence-Based Reasoning: Is it supported by facts and logical reasoning?
3. Objectivity: Does it present multiple perspectives without bias?
4. Clarity: Is the analysis clear, well-structured, and easy to understand?
5. Actionable Insights: Does it provide useful information for decision-making?

Provide a score from 0-100 and a brief reason for your evaluation.`

    const userPrompt = `Market Question: ${question}

Analysis: ${analysis}

Evaluate this analysis on a scale of 0-100 based on the criteria in your instructions. 
Provide a JSON object with two fields: "score" (number) and "reason" (brief explanation).
Example: {"score": 85, "reason": "The analysis is comprehensive and well-reasoned, covering all key factors, but could provide more specific evidence."}`

    // Choose API endpoint and format request based on whether we're using OpenRouter or OpenAI
    let apiUrl = "https://api.openai.com/v1/chat/completions"
    let headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`
    }
    
    if (useOpenRouter) {
      apiUrl = "https://openrouter.ai/api/v1/chat/completions"
      headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://hunchex.com",
        "X-Title": "Hunchex Market Analysis"
      }
    }

    const response = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 300
      })
    })

    if (!response.ok) {
      const error = await response.text()
      console.error(`API error (${response.status}): ${error}`)
      throw new Error(`API request failed with status ${response.status}: ${error}`)
    }

    const data = await response.json()
    const responseText = data.choices?.[0]?.message?.content || ''
    
    console.log("Received evaluation response:", responseText)
    
    try {
      // Find JSON in the response - sometimes models add extra text
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      const jsonText = jsonMatch ? jsonMatch[0] : responseText
      
      const parsedResult = JSON.parse(jsonText)
      
      // Validate the response has required properties
      if (typeof parsedResult.score !== 'number' || typeof parsedResult.reason !== 'string') {
        console.error("Invalid response format:", parsedResult)
        throw new Error("Invalid response format")
      }
      
      return new Response(
        JSON.stringify(parsedResult),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    } catch (parseError) {
      console.error("Error parsing response:", parseError)
      console.error("Original response:", responseText)
      
      // Fallback response if parsing fails
      return new Response(
        JSON.stringify({ score: 50, reason: "Failed to evaluate analysis properly" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }
  } catch (error) {
    console.error("Function error:", error.message)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    )
  }
})
