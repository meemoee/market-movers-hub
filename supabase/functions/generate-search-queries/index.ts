
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { OpenRouter } from "../deep-research/openRouter.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    })
  }

  try {
    const { description, marketId, iteration = 1, previousResults = [] } = await req.json()
    
    if (!description) {
      return new Response(
        JSON.stringify({ error: 'Missing description parameter' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      )
    }
    
    console.log(`Generating search queries for market: ${marketId}`)
    console.log(`Description: ${description.substring(0, 100)}${description.length > 100 ? '...' : ''}`)
    console.log(`Iteration: ${iteration}`)
    
    const openRouterApiKey = Deno.env.get('OPENROUTER_API_KEY')
    if (!openRouterApiKey) {
      throw new Error('OPENROUTER_API_KEY environment variable not set')
    }
    
    const openRouter = new OpenRouter(openRouterApiKey)
    
    // Build query prompt based on iteration
    let systemPrompt = `You are a research query generator specialized in breaking down complex topics into focused search queries.`
    
    if (iteration === 1) {
      systemPrompt += `\nFor the first research iteration, focus on generating diverse search queries that explore different aspects of the topic.`
    } else {
      systemPrompt += `\nFor advanced research iterations, focus on specific details, technical aspects, and areas that might need deeper exploration.` 
    }
    
    // Define previous results context if available
    let previousContext = ""
    if (previousResults.length > 0) {
      previousContext = `\n\nPrevious research has found information about: ${previousResults.map((r: string) => `"${r.substring(0, 150)}..."`).join("\n")}`
    }
    
    const messages = [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: `Generate 5 search queries to research the following topic: "${description}"
${previousContext}

${iteration > 1 ? "Generate more specific and detailed queries than before, focusing on aspects that need deeper investigation." : "Generate diverse queries that explore different aspects of the topic."}

Requirements:
1. Each query should be clear and specific
2. Use different angles and perspectives
3. Include relevant keywords that would yield useful search results
4. Make queries between 3-10 words in length
5. Don't include the market ID in the queries

Format your response as a JSON array of strings containing ONLY the queries.
Example format: ["query 1", "query 2", "query 3", "query 4", "query 5"]`
      }
    ]
    
    try {
      // In production, use a streaming approach
      let queriesText = await openRouter.complete("google/gemini-flash-1.5", messages, 1000, 0.7)
      
      console.log("Raw response:", queriesText)
      
      // Extract the JSON part if the response is not properly formatted
      const jsonMatch = queriesText.match(/\[.*\]/s)
      if (jsonMatch) {
        queriesText = jsonMatch[0]
      }
      
      try {
        const queries = JSON.parse(queriesText)
        
        if (!Array.isArray(queries)) {
          console.error("Generated queries are not in array format")
          throw new Error("Generated queries are not in array format")
        }
        
        // Ensure we have 5 queries
        let finalQueries = queries.slice(0, 5)
        
        // If we have fewer than 5 queries, add some default ones
        while (finalQueries.length < 5) {
          const defaults = [
            `${description} analysis`,
            `${description} latest information`,
            `${description} expert opinion`,
            `${description} statistics`,
            `${description} probability`
          ]
          finalQueries.push(defaults[finalQueries.length % defaults.length])
        }
        
        // Clean up the queries
        finalQueries = finalQueries.map((q: string) => {
          // Remove quotes
          q = q.replace(/["""'']/g, '')
          
          // Remove market ID if it somehow got included
          if (marketId) {
            q = q.replace(new RegExp(` ?${marketId}`, 'g'), '')
          }
          
          return q.trim()
        })
        
        console.log("Generated queries:", finalQueries)
        
        return new Response(
          JSON.stringify({ queries: finalQueries }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      } catch (error) {
        console.error("Error parsing queries:", error)
        
        // Fallback queries
        const fallbackQueries = [
          `${description} analysis`,
          `${description} latest information`,
          `${description} expert opinion`,
          `${description} statistics`,
          `${description} probability`
        ]
        
        return new Response(
          JSON.stringify({ 
            queries: fallbackQueries,
            error: "Failed to parse generated queries, using fallbacks"
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      }
    } catch (error) {
      console.error("Error in OpenRouter request:", error)
      
      // Fallback queries if OpenRouter fails
      const fallbackQueries = [
        `${description} analysis`,
        `${description} latest information`,
        `${description} expert opinion`,
        `${description} statistics`,
        `${description} probability`
      ]
      
      return new Response(
        JSON.stringify({ 
          queries: fallbackQueries,
          error: `OpenRouter request failed: ${error.message}`
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }
  } catch (error) {
    console.error("Error in generate-search-queries:", error)
    return new Response(
      JSON.stringify({ 
        error: error.message,
        queries: [
          "Error occurred, using fallback query 1",
          "Error occurred, using fallback query 2",
          "Error occurred, using fallback query 3",
          "Error occurred, using fallback query 4",
          "Error occurred, using fallback query 5"
        ]
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})
