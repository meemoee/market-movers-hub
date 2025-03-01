
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders } from "../_shared/cors.ts"

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions"

interface QueryRequest {
  query: string
  previousResults?: string
  iteration?: number
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { query, previousResults, iteration } = await req.json() as QueryRequest

    if (!query) {
      throw new Error("No query provided")
    }

    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set")
    }

    console.log(`Generating search queries for: "${query}"`)
    if (previousResults) {
      console.log(`Refining based on iteration ${iteration} with previousResults length: ${previousResults.length}`)
    }

    // Different prompts based on whether we have previous results
    let systemPrompt
    let userPrompt

    if (previousResults && iteration) {
      systemPrompt = `You are a research assistant that helps generate search queries to explore a topic in depth. 
      You are currently on iteration ${iteration} of research, and need to generate new search queries based on previous findings.`
      
      userPrompt = `Based on the original query: "${query}"
      
      And the following analysis from the previous research iteration:
      
      ${previousResults}
      
      Generate 5 new search queries that:
      1. Explore gaps in the current research
      2. Focus on areas that need more investigation
      3. Use different keywords to find diverse sources
      4. Are specific enough to return relevant results
      5. Will help deepen the understanding of the topic
      
      Return just the 5 search queries as a JSON array called "queries". Make each query between 3-6 words.`
    } else {
      systemPrompt = `You are a research assistant that helps generate search queries to explore a topic in depth.`
      
      userPrompt = `Generate 5 search queries to research the following query: "${query}"
      
      The queries should:
      1. Use different keywords and phrasings
      2. Focus on different aspects of the topic
      3. Be specific enough to return relevant results
      4. Be general enough to capture diverse sources
      5. Include any necessary context from the original query
      
      Return just the 5 search queries as a JSON array called "queries". Make each query between 3-6 words.`
    }

    console.log("Sending prompt to OpenAI")

    const openAIResponse = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.7,
        response_format: { type: "json_object" }
      })
    })

    if (!openAIResponse.ok) {
      const errorText = await openAIResponse.text()
      console.error("OpenAI API error:", errorText)
      throw new Error(`OpenAI API error: ${openAIResponse.status} ${openAIResponse.statusText}`)
    }

    const data = await openAIResponse.json()
    
    if (!data.choices || !data.choices[0]?.message?.content) {
      console.error("Unexpected API response:", data)
      throw new Error("Invalid response from OpenAI API")
    }

    console.log("Received response from OpenAI")
    
    try {
      const content = data.choices[0].message.content
      const parsedContent = JSON.parse(content)
      
      if (!parsedContent.queries || !Array.isArray(parsedContent.queries)) {
        console.error("Invalid content format:", content)
        throw new Error("Response did not contain a valid queries array")
      }

      console.log("Generated queries:", parsedContent.queries)
      
      return new Response(JSON.stringify(parsedContent), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    } catch (error) {
      console.error("Error parsing OpenAI response:", error)
      throw new Error("Failed to parse the response from OpenAI")
    }
  } catch (error) {
    console.error("Error:", error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    })
  }
})
